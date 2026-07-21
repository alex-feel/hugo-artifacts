// search-worker.js: the search backend -- fetch, envelope validation,
// index construction, serialized-index caching, and querying. Dual-mode:
// it EXPORTS createSearchBackend() (the full API) AND self-registers a
// message handler when running inside a Web Worker, so the page script's
// main-thread fallback dynamically imports this SAME built artifact with
// zero code duplication.
//
// Message protocol (all payloads structured-clone-safe):
//   backend -> page  boot    {}  (worker mode only: script loaded)
//   page -> backend  init    {indexUrl, lang, options, cache}
//   backend -> page  ready   {docCount, source: "cache" | "network"}
//   page -> backend  query   {id, q, limit, boost, fuzzy, prefix}
//   backend -> page  results {id, q, count, hits}
//   backend -> page  error   {phase, message}
//
// ready.source names the INDEX-BUILD source -- "cache" when the serialized
// index loaded, "network" when the index was rebuilt from the fetched docs
// -- not the transfer source: the envelope is fetched and parsed on EVERY
// init, both because the compound cache key is computable only from the
// fetched envelope and because the network transfer itself rides the HTTP
// revalidation caching of the stable index URL. ready.docCount is the
// engine's OWN document count -- the records a query can actually return,
// heading sub-records included -- never the envelope's self-reported
// docCount field: a tampered or shadowed envelope can claim any number,
// and client-side duplicate skips shrink what the engine accepts.
/* global self, fetch, caches, Response, WorkerGlobalScope, URL */

import {createProcessTerm} from './search/pipeline.js';
import {
  ENGINE_VERSION,
  engineFields,
  engineOptions,
  buildEngine,
  loadEngine,
  serializeEngine,
  searchEngine,
} from './search/engine.js';

const CACHE_NAME = 'search-index-v1';
// The measured payoff boundary for serialized-index persistence under
// cache = "auto": below it, serialization is pure overhead.
const AUTO_MIN_BYTES = 1500000;
const AUTO_MIN_DOCS = 500;

function phaseError(phase, message) {
  const error = new Error(message);
  error.phase = phase;
  return error;
}

// FNV-1a 32-bit over the compound key inputs; collision consequences are
// only a cache rebuild, so a fast non-cryptographic hash is right.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// Persists the serialized engine OFF the ready critical path: by the
// time this runs the engine is fully built, so awaiting Cache Storage
// here would only delay -- or, hung, park -- first results for a pure
// optimization. Deliberately not awaited by the caller; the internal
// try/catch swallows every failure (a write that never lands costs one
// rebuild on the next visit), so the detached promise cannot reject
// unhandled.
async function persistEngine(cacheKey, indexUrl, engine) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheKey,
      new Response(serializeEngine(engine), {
        headers: {'Content-Type': 'application/json'},
      }),
    );
    // Evict stale entries for the SAME index URL by pathname equality
    // (never a raw string prefix, which fragment blindness would
    // defeat), keeping only the entry just written.
    const indexPathname = new URL(indexUrl, globalThis.location.href).pathname;
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.pathname === indexPathname && request.url !== cacheKey) {
        await cache.delete(request);
      }
    }
  } catch {
    // Cache persistence is an optimization; failures never surface.
  }
}

// Heading sub-records flatten into child documents (anchor deep links); the
// parent grouping fields ride along so child results group and label like
// their parents.
function expandDocs(docs, headingsEnabled) {
  if (!headingsEnabled) {
    return docs;
  }
  const out = [];
  for (const doc of docs) {
    out.push(doc);
    if (Array.isArray(doc.headings)) {
      for (const heading of doc.headings) {
        out.push({
          href: doc.href + '#' + heading.id,
          title: heading.title,
          section: doc.section,
          sectionTitle: doc.sectionTitle,
        });
      }
    }
  }
  return out;
}

export function createSearchBackend() {
  let engine = null;

  async function fetchEnvelope(indexUrl) {
    let response;
    try {
      response = await fetch(indexUrl);
    } catch (error) {
      throw phaseError('fetch', 'index fetch failed: ' + String(error && error.message));
    }
    if (!response.ok) {
      throw phaseError('fetch', 'index fetch failed: HTTP ' + response.status);
    }
    const blob = await response.blob();
    const text = await blob.text();
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw phaseError('fetch', 'index is not valid JSON');
    }
    return {envelope, byteLength: blob.size};
  }

  async function init(payload) {
    const indexUrl = payload.indexUrl;
    const options = payload.options || {};
    const {envelope, byteLength} = await fetchEnvelope(indexUrl);
    if (!envelope || envelope.schemaVersion !== 1) {
      throw phaseError(
        'schema',
        'unsupported index schemaVersion ' + String(envelope && envelope.schemaVersion),
      );
    }
    const docs = Array.isArray(envelope.docs) ? envelope.docs : [];

    const processTerm = createProcessTerm({
      lang: payload.lang,
      stemming: options.stemming,
      stopwords: options.stopwords,
      stopwordsExtra: options.stopwordsExtra,
    });
    const fields = engineFields(options.taxonomies);
    const msOptions = engineOptions(fields, processTerm);

    // Per-query options (boost, fuzzy, prefix) never enter the signature
    // because they never shape the built index.
    const optionsSignature = JSON.stringify({
      fields,
      stemming: options.stemming !== false,
      stopwords: options.stopwords !== false,
      stopwordsExtra: options.stopwordsExtra || [],
      headings: options.headings === true,
    });
    const discriminator = fnv1a(
      String(envelope.schemaVersion) + String(envelope.digest) + ENGINE_VERSION + optionsSignature,
    );

    const wantCache =
      payload.cache === true ||
      (payload.cache === 'auto' && (byteLength > AUTO_MIN_BYTES || docs.length > AUTO_MIN_DOCS));
    const cacheAvailable = typeof caches !== 'undefined';

    // The discriminator rides the QUERY STRING, never a URL fragment: the
    // Cache API strips fragments from both the request and the stored
    // entry, so a fragment-keyed compound key would collapse every key for
    // the same index URL into one entry and invalidation would never
    // happen; query strings DO participate in matching.
    const cacheKey = new URL(
      indexUrl + '?search-cache=' + discriminator,
      globalThis.location.href,
    ).toString();

    let source = 'network';
    if (wantCache && cacheAvailable) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const match = await cache.match(cacheKey);
        if (match) {
          try {
            engine = loadEngine(await match.text(), msOptions);
            source = 'cache';
          } catch {
            engine = null;
            await cache.delete(cacheKey);
          }
        }
      } catch {
        engine = null;
      }
    }

    if (!engine) {
      engine = buildEngine(expandDocs(docs, options.headings === true), msOptions);
      if (wantCache && cacheAvailable) {
        persistEngine(cacheKey, indexUrl, engine);
      }
    }

    return {docCount: engine.documentCount, source};
  }

  function query(payload) {
    if (!engine) {
      throw phaseError('query', 'query before init');
    }
    const results = searchEngine(engine, payload.q, {
      boost: payload.boost,
      fuzzy: payload.fuzzy,
      prefix: payload.prefix,
    });
    const limited = payload.limit > 0 ? results.slice(0, payload.limit) : results;
    const hits = limited.map((result) => ({
      href: result.id,
      title: result.title || '',
      section: result.section || '',
      sectionTitle: result.sectionTitle || '',
      date: result.date || '',
      snippet: result.description || result.summary || '',
      tags: Array.isArray(result.tags) ? result.tags : [],
      categories: Array.isArray(result.categories) ? result.categories : [],
      image: result.image || '',
      terms: result.terms,
      score: result.score,
    }));
    return {id: payload.id, q: payload.q, count: results.length, hits};
  }

  return {init, query};
}

// Worker-mode self-registration: the page script constructs
// new Worker(url, {type: 'module'}) and speaks the message protocol above.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const backend = createSearchBackend();
  // The boot ack tells the page this script loaded and is running, so
  // the page scopes its startup timeout to script boot alone: the init
  // reply that follows takes honest network time (index fetch) plus CPU
  // time (engine build), and timing those out would terminate a healthy
  // worker mid-download.
  self.postMessage({type: 'boot'});
  self.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'init') {
      backend.init(message).then(
        (ready) => {
          self.postMessage({type: 'ready', docCount: ready.docCount, source: ready.source});
        },
        (error) => {
          self.postMessage({
            type: 'error',
            phase: (error && error.phase) || 'build',
            message: String((error && error.message) || error),
          });
        },
      );
    } else if (message.type === 'query') {
      try {
        self.postMessage(Object.assign({type: 'results'}, backend.query(message)));
      } catch (error) {
        self.postMessage({
          type: 'error',
          id: message.id,
          phase: (error && error.phase) || 'query',
          message: String((error && error.message) || error),
        });
      }
    }
  });
}
