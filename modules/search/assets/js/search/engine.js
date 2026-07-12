// search/engine.js: thin MiniSearch adapter -- deliberately the ONLY module
// importing 'minisearch' (resolved through Hugo's layered asset filesystem
// to the mounted assets/minisearch/ sources), so a future engine upgrade
// touches one file.

import MiniSearch from 'minisearch';

// Module-maintained engine identity; part of the serialized-index cache key,
// because a serialized index is only loadable by the engine version that
// wrote it. Update this constant in the same change that bumps the go.mod
// version of github.com/lucaong/minisearch.
export const ENGINE_VERSION = 'minisearch@7.2.0';

// Display-driven stored fields: exactly what the result renderer consumes.
// content is indexed but NOT stored (stored full bodies would roughly
// double retained memory; the displayed snippet is the stored
// summary/description).
export const STORE_FIELDS = [
  'title',
  'href',
  'section',
  'sectionTitle',
  'date',
  'description',
  'summary',
  'tags',
  'categories',
  'image',
];

// The indexed fields, derived from the configured taxonomies so EVERY
// listed taxonomy is indexed and matched and any boost.<taxonomy> key
// applies to it.
export function engineFields(taxonomies) {
  return ['title', 'headings', 'description', 'keywords'].concat(taxonomies || [], ['content']);
}

// MiniSearch's default extraction stringifies an array of objects into
// "[object Object],...", so the headings field joins the sub-record titles
// instead; that joined field is what lets a PARENT document match its own
// heading text (the child documents carry the heading titles in their own
// title field). When headings are disabled the field is absent and the
// empty string skips it.
function extractField(doc, fieldName) {
  if (fieldName === 'headings') {
    return Array.isArray(doc.headings) ? doc.headings.map((h) => h.title).join(' ') : '';
  }
  return doc[fieldName];
}

export function engineOptions(fields, processTerm) {
  return {idField: 'href', fields, storeFields: STORE_FIELDS, extractField, processTerm};
}

export function buildEngine(docs, options) {
  const engine = new MiniSearch(options);
  engine.addAll(docs);
  return engine;
}

// loadJSON is version- and options-locked; callers wrap it in try/catch and
// rebuild from the fetched docs on ANY failure.
export function loadEngine(json, options) {
  return MiniSearch.loadJSON(json, options);
}

export function serializeEngine(engine) {
  return JSON.stringify(engine);
}

// Per-query options ride each query message: boost, fuzzy (a typo knob,
// never a morphology substitute), and last-term-only prefix matching.
// combineWith AND keeps multi-term queries precise.
export function searchEngine(engine, q, opts) {
  const options = opts || {};
  return engine.search(q, {
    boost: options.boost || {},
    combineWith: 'AND',
    fuzzy: typeof options.fuzzy === 'number' && options.fuzzy > 0 ? options.fuzzy : false,
    prefix: options.prefix ? (term, index, terms) => index === terms.length - 1 : false,
  });
}
