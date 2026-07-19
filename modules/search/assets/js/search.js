// search.js: progressive enhancement for the style-agnostic search
// surfaces. The server renders real GET forms that work without
// JavaScript; this script adds client-side search on top: it initializes
// the shared backend lazily on intent, renders results by cloning each
// surface's <template> with textContent-only slot filling, highlights
// matches by text-node splitting (user input never reaches RegExp
// construction or innerHTML), keeps the dedicated page's ?q= state in sync
// through URL/URLSearchParams, and dispatches bubbling CustomEvents so the
// consuming site can observe activity without any tracker:
//
//   search:ready    detail: {docCount, lang, source}
//   search:open     detail: {surface}
//   search:close    detail: {surface}
//   search:query    detail: {query, surface}
//   search:results  detail: {query, count, surface}
//   search:select   detail: {href, query, surface}
//   search:error    detail: {phase, message}
//
// Inbound: dispatching "search:rescan" on document re-runs init for
// late-inserted roots. All user-visible strings arrive as data attributes
// on each surface root (server-side i18n), so this script is
// translation-free; every message is written with textContent only.
//
// One backend per page: the first surface to initialize creates a module
// Web Worker from data-search-worker-url (falling back to a dynamic
// import() of the SAME dual-mode artifact on the main thread when worker
// construction fails), and every surface shares it.
//
// The repo-root ESLint flat config grants browser globals only to
// enumerated bundle paths, so this file declares the DOM globals it uses
// via a flat-config-honored /* global */ directive.
/* global document, window, navigator, CustomEvent, Worker, URL, setTimeout, clearTimeout, requestIdleCallback */

import {createProcessTerm} from './search/pipeline.js';
import {createHighlighter} from './search/highlight.js';
import {renderResult, renderPageResults} from './search/render.js';
import {readQuery, writeQuery, onExternalChange} from './search/url-state.js';

const ANNOUNCE_DELAY_MS = 500;
const WORKER_READY_TIMEOUT_MS = 5000;
const IDLE_PREFETCH_TIMEOUT_MS = 3000;

let requestCounter = 0;
let sharedBackend = null;

function dispatch(root, name, detail) {
  root.dispatchEvent(new CustomEvent(name, {bubbles: true, detail}));
}

function revealControl(el) {
  if (el) {
    el.hidden = false;
    el.style.removeProperty('display');
  }
}

function hideControl(el) {
  if (el) {
    el.hidden = true;
    el.style.display = 'none';
  }
}

function readConfig(root) {
  const d = root.dataset;
  let raw = {};
  if (d.searchOptions) {
    try {
      raw = JSON.parse(d.searchOptions);
    } catch {
      // A parse failure falls back to the built-in defaults below.
      raw = {};
    }
  }
  return {
    surface: d.searchSurface || 'page',
    indexUrl: d.searchIndexUrl || '',
    lang: d.searchLang || 'en',
    pageUrl: d.searchPageUrl || '',
    workerUrl: d.searchWorkerUrl || '',
    minLength: parseInt(d.searchMinLength || '2', 10) || 0,
    debounce: parseInt(d.searchDebounce || '220', 10) || 0,
    pageSize: parseInt(d.searchPageSize || '10', 10) || 10,
    // Clamped to 1..10: padStart with an absurd width would throw or
    // allocate giant strings mid-render, and ten digits cover any count.
    countPad: Math.min(Math.max(parseInt(d.searchCountPad || '1', 10) || 1, 1), 10),
    limit: parseInt(d.searchLimit || '8', 10) || 8,
    hotkey: d.searchHotkey || '',
    hotkeySlash: d.searchHotkeySlash === 'true',
    groupBySection: d.searchGroupBySection === 'true',
    show: {
      description: d.searchShowDescription === 'true',
      image: d.searchShowImage === 'true',
      tags: d.searchShowTags === 'true',
      categories: d.searchShowCategories === 'true',
      dates: d.searchShowDates === 'true',
    },
    options: {
      stemming: raw.stemming !== false,
      stopwords: raw.stopwords !== false,
      stopwordsExtra: Array.isArray(raw.stopwordsExtra) ? raw.stopwordsExtra : [],
      headings: raw.headings === true,
      taxonomies: Array.isArray(raw.taxonomies) ? raw.taxonomies : ['tags', 'categories'],
      boost: raw.boost && typeof raw.boost === 'object' ? raw.boost : {},
      fuzzy: typeof raw.fuzzy === 'number' ? raw.fuzzy : 0.15,
      prefix: raw.prefix !== false,
      worker: raw.worker !== false,
      cache:
        raw.cache === true || raw.cache === 'true'
          ? true
          : raw.cache === false || raw.cache === 'false'
            ? false
            : 'auto',
    },
    i18n: {
      idle: d.searchI18nIdle || '',
      loading: d.searchI18nLoading || '',
      noResults: d.searchI18nNoResults || '',
      error: d.searchI18nError || '',
      countOne: d.searchI18nCountOne || '',
      countFew: d.searchI18nCountFew || '',
      countMany: d.searchI18nCountMany || '',
      countOther: d.searchI18nCountOther || '%d results',
      showing: d.searchI18nShowing || '',
      minChars: d.searchI18nMinChars || '',
    },
  };
}

// ---- Backend connection (one per page) ----

function connectWorker(workerUrl, initMessage) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(workerUrl, {type: 'module'});
    } catch (error) {
      reject({transport: true, message: String(error && error.message)});
      return;
    }
    let settled = false;
    const pending = new Map();
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.terminate();
        reject({transport: true, message: 'worker ready timeout'});
      }
    }, WORKER_READY_TIMEOUT_MS);
    worker.addEventListener('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        reject({transport: true, message: 'worker failed to start'});
      }
    });
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (message.type === 'ready') {
          resolve({
            ready: {docCount: message.docCount, source: message.source},
            request(payload) {
              return new Promise((res, rej) => {
                pending.set(payload.id, {res, rej});
                worker.postMessage(Object.assign({type: 'query'}, payload));
              });
            },
          });
        } else {
          // An application-level init failure inside a WORKING worker: the
          // transport is fine, so falling back would only fail again.
          reject({transport: false, phase: message.phase, message: message.message});
        }
        return;
      }
      if (message.type === 'results' && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        entry.res(message);
      } else if (message.type === 'error' && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        entry.rej(message);
      }
    });
    worker.postMessage(initMessage);
  });
}

async function connectMainThread(workerUrl, initMessage) {
  // The same dual-mode artifact, loaded lazily on the main thread.
  const module = await import(workerUrl);
  const backend = module.createSearchBackend();
  let ready;
  try {
    ready = await backend.init(initMessage);
  } catch (error) {
    throw {
      transport: false,
      phase: (error && error.phase) || 'build',
      message: String((error && error.message) || error),
    };
  }
  return {
    ready,
    request(payload) {
      return new Promise((res, rej) => {
        try {
          res(backend.query(payload));
        } catch (error) {
          rej({
            phase: (error && error.phase) || 'query',
            message: String((error && error.message) || error),
          });
        }
      });
    },
  };
}

function getBackend(config) {
  if (!sharedBackend) {
    sharedBackend = (async () => {
      const initMessage = {
        type: 'init',
        indexUrl: config.indexUrl,
        lang: config.lang,
        options: {
          stemming: config.options.stemming,
          stopwords: config.options.stopwords,
          stopwordsExtra: config.options.stopwordsExtra,
          headings: config.options.headings,
          taxonomies: config.options.taxonomies,
        },
        cache: config.options.cache,
      };
      if (config.options.worker && typeof Worker !== 'undefined' && config.workerUrl) {
        try {
          return await connectWorker(config.workerUrl, initMessage);
        } catch (failure) {
          if (failure && failure.transport === false) {
            throw failure;
          }
          // Transport failure: main-thread dynamic-import fallback.
        }
      }
      return connectMainThread(config.workerUrl, initMessage);
    })();
  }
  return sharedBackend;
}

// ---- Shared per-surface core ----

function createCore(root, config) {
  const processTerm = createProcessTerm({
    lang: config.lang,
    stemming: config.options.stemming,
    stopwords: config.options.stopwords,
    stopwordsExtra: config.options.stopwordsExtra,
  });
  return {
    root,
    config,
    input: root.querySelector('.search__input'),
    status: root.querySelector('.search__status'),
    alert: root.querySelector('.search__alert'),
    template: root.querySelector('template[data-search-template]'),
    highlighter: createHighlighter(processTerm),
    backendPromise: null,
    failed: false,
    lastSentId: 0,
    debounceTimer: null,
    announceTimer: null,
    currentQuery: '',
  };
}

function setStateClass(core, name) {
  core.root.classList.remove(
    'search--loading',
    'search--has-results',
    'search--no-results',
    'search--error',
  );
  if (name) {
    core.root.classList.add(name);
  }
}

function announceNow(core, statusText, alertText) {
  clearTimeout(core.announceTimer);
  if (core.status) {
    core.status.textContent = statusText || '';
  }
  if (core.alert) {
    core.alert.textContent = alertText || '';
  }
}

// Result counts are announced politely and DEBOUNCED so rapid typing does
// not spam the live-region queue; zero results and errors use the
// assertive alert region.
function announceSettled(core, statusText, alertText) {
  clearTimeout(core.announceTimer);
  core.announceTimer = setTimeout(() => {
    if (core.status) {
      core.status.textContent = statusText || '';
    }
    if (core.alert) {
      core.alert.textContent = alertText || '';
    }
  }, ANNOUNCE_DELAY_MS);
}

function pluralCount(core, count) {
  let form = 'other';
  try {
    form = new Intl.PluralRules(core.config.lang).select(count);
  } catch {
    form = 'other';
  }
  const byForm = {
    one: core.config.i18n.countOne,
    few: core.config.i18n.countFew,
    many: core.config.i18n.countMany,
    other: core.config.i18n.countOther,
  };
  const template = byForm[form] || core.config.i18n.countOther;
  return template.replaceAll('%d', String(count));
}

function ensureBackend(core) {
  if (!core.backendPromise) {
    setStateClass(core, 'search--loading');
    announceNow(core, core.config.i18n.loading, '');
    core.backendPromise = getBackend(core.config).then(
      (connection) => {
        setStateClass(core, null);
        if (!core.currentQuery.trim()) {
          announceNow(core, core.config.i18n.idle, '');
        }
        dispatch(core.root, 'search:ready', {
          docCount: connection.ready.docCount,
          lang: core.config.lang,
          source: connection.ready.source,
        });
        return connection;
      },
      (failure) => {
        core.failed = true;
        setStateClass(core, 'search--error');
        announceNow(core, '', core.config.i18n.error);
        dispatch(core.root, 'search:error', {
          phase: (failure && failure.phase) || 'build',
          message: String((failure && failure.message) || failure),
        });
        throw failure;
      },
    );
    core.backendPromise.catch(() => {});
  }
  return core.backendPromise;
}

function runQuery(core, q, hooks) {
  ensureBackend(core).then(
    (connection) => {
      const id = ++requestCounter;
      core.lastSentId = id;
      dispatch(core.root, 'search:query', {query: q, surface: core.config.surface});
      connection
        .request({
          id,
          q,
          limit: hooks.limit,
          boost: core.config.options.boost,
          fuzzy: core.config.options.fuzzy,
          prefix: core.config.options.prefix,
        })
        .then(
          (message) => {
            // Stale-result guard: drop results older than the last request
            // this surface sent, and results for a query it since cleared.
            if (message.id < core.lastSentId || core.currentQuery.trim() !== q) {
              return;
            }
            const terms = core.highlighter.queryTerms(q);
            hooks.render(message, terms);
            if (message.count > 0) {
              setStateClass(core, 'search--has-results');
              announceSettled(core, pluralCount(core, message.count), '');
            } else {
              setStateClass(core, 'search--no-results');
              // Function replacer: $-sequences in the query are inert, and
              // replaceAll fills EVERY %s a translation carries.
              announceSettled(
                core,
                '',
                core.config.i18n.noResults.replaceAll('%s', () => q),
              );
            }
            dispatch(core.root, 'search:results', {
              query: q,
              count: message.count,
              surface: core.config.surface,
            });
          },
          (failure) => {
            // Error state for that query only; the next input retries.
            setStateClass(core, 'search--error');
            announceNow(core, '', core.config.i18n.error);
            dispatch(core.root, 'search:error', {
              phase: (failure && failure.phase) || 'query',
              message: String((failure && failure.message) || failure),
            });
          },
        );
    },
    () => {},
  );
}

// Debounced search-as-you-type. Emptying the input SHORT-CIRCUITS the
// debounce: results are cleared and the idle state restored synchronously
// -- the delay applies only to RUNNING a query, never to clearing one.
function handleInput(core, value, hooks) {
  core.currentQuery = value;
  clearTimeout(core.debounceTimer);
  const trimmed = value.trim();
  if (!trimmed) {
    hooks.clear();
    setStateClass(core, null);
    announceNow(core, core.config.i18n.idle, '');
    return;
  }
  ensureBackend(core);
  if (trimmed.length < core.config.minLength) {
    hooks.clear();
    setStateClass(core, null);
    announceNow(core, core.config.i18n.minChars, '');
    return;
  }
  core.debounceTimer = setTimeout(() => {
    hooks.beforeRun(trimmed);
    runQuery(core, trimmed, hooks);
  }, core.config.debounce);
}

function wireIntentPrefetch(core, el) {
  const prefetch = () => ensureBackend(core);
  el.addEventListener('focus', prefetch);
  el.addEventListener('pointerenter', prefetch);
  el.addEventListener('touchstart', prefetch, {passive: true});
}

// ---- Listbox combobox (modal and inline) ----

function createListbox(core, config, listbox, seeAll, isInline) {
  const input = core.input;
  let options = [];
  let active = -1;
  let collapsed = false;

  function expand() {
    collapsed = false;
    if (options.length) {
      revealControl(listbox);
      input.setAttribute('aria-expanded', 'true');
    }
  }

  function collapse() {
    collapsed = true;
    setActive(-1);
    if (isInline) {
      hideControl(listbox);
    }
    input.setAttribute('aria-expanded', 'false');
  }

  function setActive(index) {
    if (active >= 0 && options[active]) {
      options[active].setAttribute('aria-selected', 'false');
      options[active].classList.remove('search__option--active');
    }
    active = index;
    if (active >= 0 && options[active]) {
      const option = options[active];
      option.setAttribute('aria-selected', 'true');
      option.classList.add('search__option--active');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({block: 'nearest'});
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function move(delta) {
    if (!options.length) {
      return;
    }
    if (collapsed) {
      expand();
    }
    if (active < 0) {
      setActive(delta > 0 ? 0 : options.length - 1);
    } else {
      setActive((active + delta + options.length) % options.length);
    }
  }

  function render(message, terms) {
    listbox.textContent = '';
    options = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    let counter = 0;
    for (const hit of message.hits) {
      counter++;
      const item = renderResult(core.template, hit, {
        lang: config.lang,
        show: config.show,
        grouped: false,
        listbox: true,
        optionId: listbox.id + '-option-' + counter,
        highlighter: core.highlighter,
        terms,
      });
      if (item) {
        item.addEventListener('click', () => {
          const link = item.querySelector('a');
          dispatch(core.root, 'search:select', {
            href: link ? link.getAttribute('href') : '',
            query: message.q,
            surface: config.surface,
          });
        });
        listbox.appendChild(item);
        options.push(item);
      }
    }
    if (options.length) {
      expand();
    } else {
      input.setAttribute('aria-expanded', 'false');
      if (isInline) {
        hideControl(listbox);
      }
    }
    if (seeAll) {
      if (message.count > 0 && config.pageUrl) {
        const url = new URL(config.pageUrl, document.baseURI);
        url.searchParams.set('q', message.q);
        seeAll.setAttribute('href', url.toString());
        revealControl(seeAll);
      } else {
        hideControl(seeAll);
      }
    }
  }

  function clear() {
    listbox.textContent = '';
    options = [];
    setActive(-1);
    input.setAttribute('aria-expanded', 'false');
    if (isInline) {
      hideControl(listbox);
    }
    hideControl(seeAll);
  }

  // Every query-carrying URL is constructed with URL/URLSearchParams, so
  // Cyrillic, &, and + round-trip on every navigation path.
  function navigateSeeAll() {
    const q = input.value.trim();
    if (!q || !config.pageUrl) {
      return;
    }
    const url = new URL(config.pageUrl, document.baseURI);
    url.searchParams.set('q', q);
    window.location.assign(url.toString());
  }

  function activateActive() {
    const option = options[active];
    if (!option) {
      return;
    }
    const link = option.querySelector('a');
    const href = link ? link.getAttribute('href') : '';
    if (href) {
      dispatch(core.root, 'search:select', {
        href,
        query: input.value.trim(),
        surface: config.surface,
      });
      window.location.assign(link.href);
    }
  }

  function onKeydown(event, escapeHook) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home' && event.ctrlKey && options.length) {
      event.preventDefault();
      expand();
      setActive(0);
    } else if (event.key === 'End' && event.ctrlKey && options.length) {
      event.preventDefault();
      expand();
      setActive(options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0) {
        activateActive();
      } else {
        navigateSeeAll();
      }
    } else if (event.key === 'Escape' && escapeHook) {
      // Chromium natively clears a type=search input on Escape; the hook
      // owns the two-stage collapse/clear semantics, so suppress it.
      event.preventDefault();
      escapeHook(event);
    }
  }

  return {
    render,
    clear,
    collapse,
    onKeydown,
    hasOptions: () => options.length > 0,
    isCollapsed: () => collapsed,
  };
}

// ---- Surfaces ----

function wirePage(root, config) {
  const core = createCore(root, config);
  const container = root.querySelector('.search__results');
  const more = root.querySelector('.search__more');
  const clearButton = root.querySelector('.search__clear');
  const form = root.querySelector('.search__form');
  const input = core.input;
  if (!input || !container || !core.template) {
    return;
  }

  let current = null;
  let currentTerms = null;
  let shown = 0;

  function renderChunk() {
    renderPageResults(container, core.template, current.hits.slice(0, shown), {
      lang: config.lang,
      show: config.show,
      grouped: config.groupBySection,
      countPad: config.countPad,
      listbox: false,
      highlighter: core.highlighter,
      terms: currentTerms,
    });
    if (current.hits.length > shown) {
      revealControl(more);
    } else {
      hideControl(more);
    }
  }

  function toggleClear() {
    if (input.value) {
      revealControl(clearButton);
    } else {
      hideControl(clearButton);
    }
  }

  const hooks = {
    limit: 0,
    beforeRun(q) {
      writeQuery(q);
    },
    render(message, terms) {
      current = message;
      currentTerms = terms;
      shown = Math.min(config.pageSize, message.hits.length);
      renderChunk();
    },
    clear() {
      current = null;
      container.textContent = '';
      hideControl(more);
      writeQuery('');
    },
  };

  input.addEventListener('input', () => {
    handleInput(core, input.value, hooks);
    toggleClear();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      input.value = '';
      handleInput(core, '', hooks);
      toggleClear();
    }
  });

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      input.value = '';
      handleInput(core, '', hooks);
      toggleClear();
      input.focus();
    });
  }

  if (more) {
    more.addEventListener('click', () => {
      if (!current) {
        return;
      }
      shown = Math.min(shown + config.pageSize, current.hits.length);
      renderChunk();
      // The button keeps focus; appended results are announced instead.
      const showing = config.i18n.showing
        .replace('%d', String(shown))
        .replace('%d', String(current.count));
      announceNow(core, showing, '');
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      // Enhanced, the state is already live; on backend failure the native
      // GET submit still navigates.
      if (core.failed) {
        return;
      }
      event.preventDefault();
      clearTimeout(core.debounceTimer);
      const trimmed = input.value.trim();
      if (trimmed.length >= config.minLength) {
        writeQuery(trimmed);
        runQuery(core, trimmed, hooks);
      }
    });
  }

  wireIntentPrefetch(core, input);

  // A non-empty ?q= deep link initializes immediately; otherwise search
  // intent on a search page is near-certain, so the index prefetches when
  // the browser is idle -- everywhere else intent gates the fetch.
  const initial = readQuery();
  if (initial) {
    input.value = initial;
    core.currentQuery = initial;
    toggleClear();
    const trimmed = initial.trim();
    if (trimmed.length >= config.minLength) {
      runQuery(core, trimmed, hooks);
    }
  } else if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => ensureBackend(core), {timeout: IDLE_PREFETCH_TIMEOUT_MS});
  } else {
    setTimeout(() => ensureBackend(core), IDLE_PREFETCH_TIMEOUT_MS);
  }

  onExternalChange((q) => {
    input.value = q;
    core.currentQuery = q;
    toggleClear();
    const trimmed = q.trim();
    if (trimmed.length >= config.minLength) {
      runQuery(core, trimmed, hooks);
    } else {
      current = null;
      container.textContent = '';
      hideControl(more);
      setStateClass(core, null);
      announceNow(core, core.config.i18n.idle, '');
    }
  });
}

function isTypingContext(el) {
  if (!el || !el.closest) {
    return false;
  }
  if (el.isContentEditable) {
    return true;
  }
  return !!el.closest('input, textarea, select, [contenteditable]');
}

function parseHotkey(value) {
  if (!value) {
    return null;
  }
  const parts = value.split('+');
  const key = parts.pop();
  return {
    key,
    mod: parts.indexOf('mod') !== -1,
    ctrl: parts.indexOf('ctrl') !== -1,
    alt: parts.indexOf('alt') !== -1,
    shift: parts.indexOf('shift') !== -1,
  };
}

function isApplePlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
}

// One shared palette per page: the first dialog-carrying modal root to
// enhance becomes the owner and wires the controller (the first election
// in a JS context additionally registers the singleton document-level
// trigger delegation and hotkey listeners). Every other modal root -- a further
// placement on the same page, or a root inserted later and announced via
// search:rescan -- stays trigger-only: the server emits a dialog per
// placement (a page-scoped sentinel cannot dedup per paginator output), so
// the owner's page keeps exactly one dialog, the redundant closed ones are
// detached here (and stashed for re-election), and each extra trigger
// prefetches the owner's backend on intent. Triggers are revealed only
// once an owner exists -- the owner's wiring sweep reveals every modal
// trigger -- so a page whose only dialog is structurally broken never
// shows a chip that cannot open anything. Ownership is released when the
// owning root leaves the document (a PJAX/Turbo swap) or when the
// integrity gate fails in place -- the owner's wired input or listbox no
// longer sits connected inside its own dialog: a rescanned
// replacement root re-elects directly, and recoverModalOwnership()
// re-elects among already-enhanced survivors -- re-adopting a re-inserted
// former owner first (normalizing a dialog that was open at swap time),
// then restoring a stashed dialog. The document-level click delegation
// and hotkey listeners are singletons that resolve the current owner at
// event time, so elections never accumulate listeners.
let modalOwner = null;

// Non-owner dialogs are detached to keep the one-dialog invariant, but a
// swap can remove the owning root while a trigger-only survivor stays in
// the document; each stash entry keeps that survivor re-electable.
const stashedModalRoots = [];

// Former owners are remembered by their root nodes: a host cache restore
// can re-insert a deposed owner's subtree (connected, already enhanced,
// dialog intact, never stashed), and recovery re-adopts its controller --
// every element-local listener still sits on its own nodes. The WeakMap
// ties each record's lifetime to the host's own retention of the root.
const formerModalOwners = new WeakMap();

// addEventListener does not dedupe distinct closures, and a trigger can be
// reached both by the owner's document-wide sweep and by its own root's
// enhancement pass; the WeakSet keeps each trigger wired exactly once.
// The listeners resolve the CURRENT owner at event time instead of
// capturing a core: a closure pinned to a swapped-out owner would warm the
// backend against a detached root, dispatching search:ready and state
// classes where the consuming site can never observe them.
const prefetchWiredTriggers = new WeakSet();

function wireTriggerPrefetch(trigger) {
  if (!trigger || prefetchWiredTriggers.has(trigger)) {
    return;
  }
  prefetchWiredTriggers.add(trigger);
  const prefetch = () => {
    if (modalOwner) {
      ensureBackend(modalOwner.core);
    }
  };
  trigger.addEventListener('focus', prefetch);
  trigger.addEventListener('pointerenter', prefetch);
  trigger.addEventListener('touchstart', prefetch, {passive: true});
}

// Reveals and prefetch-wires every modal trigger. Run after an election or
// a re-adoption: it also covers roots enhanced before an owner existed
// (their triggers stayed hidden while nothing could serve them) and
// triggers of roots init has not reached yet.
function sweepModalTriggers() {
  for (const trg of document.querySelectorAll('.search--modal .search__trigger')) {
    revealControl(trg);
    wireTriggerPrefetch(trg);
  }
}

// The click-delegation and hotkey listeners are registered ONCE per JS
// context and resolve the CURRENT owner at event time: per-owner document
// listeners would accumulate across elections and retain each deposed
// owner's detached root, core, and dialog for the lifetime of the context
// -- the same retention class the stash prune and the trigger-prefetch
// listeners already guard against.
let modalDocumentListenersWired = false;

function wireModalDocumentListeners() {
  if (modalDocumentListenersWired) {
    return;
  }
  modalDocumentListenersWired = true;
  document.addEventListener('click', (event) => {
    const clicked =
      event.target && event.target.closest && event.target.closest('.search__trigger');
    if (clicked && clicked.closest('.search--modal') && modalOwner) {
      modalOwner.open();
    }
  });
  document.addEventListener('keydown', (event) => {
    const owner = modalOwner;
    if (!owner) {
      return;
    }
    const hotkey = owner.hotkey;
    if (hotkey && typeof event.key === 'string' && event.key.toLowerCase() === hotkey.key) {
      const wantMeta = hotkey.mod && owner.apple;
      const wantCtrl = hotkey.ctrl || (hotkey.mod && !owner.apple);
      if (
        event.metaKey === wantMeta &&
        event.ctrlKey === wantCtrl &&
        event.altKey === hotkey.alt &&
        event.shiftKey === hotkey.shift
      ) {
        event.preventDefault();
        if (owner.isOpen()) {
          owner.close();
        } else {
          owner.open();
        }
        return;
      }
    }
    if (
      owner.hotkeySlash &&
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTypingContext(event.target) &&
      !owner.isOpen()
    ) {
      event.preventDefault();
      owner.open();
    }
  });
}

function wireModal(root, config) {
  const trigger = root.querySelector('.search__trigger');
  const dialog = root.querySelector('.search__dialog');

  if (isApplePlatform()) {
    for (const kbd of root.querySelectorAll('[data-search-kbd="mod"]')) {
      kbd.textContent = '⌘';
    }
  }

  // A swap can remove the owning root while this module's JS context
  // survives; releasing the stale ownership lets the next dialog-carrying
  // root re-elect, and the singleton document listeners simply resolve
  // the new owner from then on.
  if (modalOwner && !modalOwner.root.isConnected) {
    modalOwner = null;
  }

  if (modalOwner || !dialog) {
    if (modalOwner && dialog) {
      stashedModalRoots.push({root, config, dialog});
      dialog.remove();
    }
    if (modalOwner) {
      // With an owner in place this trigger works through the singleton
      // document-level delegation, which serves the current owner, so it
      // may show itself.
      revealControl(trigger);
      wireTriggerPrefetch(trigger);
    }
    return;
  }

  const core = createCore(root, config);
  const input = core.input;
  const listboxEl = root.querySelector('.search__listbox');
  const seeAll = root.querySelector('.search__see-all');
  const closeButton = root.querySelector('.search__close');
  // The input and listbox must live INSIDE the dialog: showModal() makes
  // everything outside it inert, so a shadowed layout that moves either
  // one out produces a palette that opens but cannot be typed into or
  // cannot show results. The template is exempt from containment --
  // rendering clones the reference captured here, so any root-level
  // placement of the inert <template> is fully functional.
  if (
    !input ||
    !listboxEl ||
    !core.template ||
    !dialog.contains(input) ||
    !dialog.contains(listboxEl)
  ) {
    // A dialog whose inner markup fails the structural check can never
    // open; removing it keeps the one-dialog invariant regardless of the
    // broken root's position among the placements. The trigger stays
    // hidden: with no owner yet, a revealed chip would open nothing, and
    // a later owner's sweep reveals it once delegation can serve it.
    dialog.remove();
    return;
  }
  // A swapped-in copy of a palette that was open when its source page was
  // torn down carries a stray open attribute without top-layer status;
  // normalize before wiring so the lifecycle starts from the closed
  // baseline (no close listener is registered yet, so this is silent).
  if (dialog.open && !isModalDialog(dialog)) {
    dialog.close();
  }
  const listbox = createListbox(core, config, listboxEl, seeAll, false);

  const hooks = {
    limit: config.limit,
    beforeRun() {},
    render: listbox.render,
    clear: listbox.clear,
  };

  function open() {
    // Defense in depth: the ownership check keeps a retained reference to
    // a deposed record from opening a second dialog beside the current
    // owner's, and the isConnected check covers the window where the
    // owner's root left the document before any rescan ran -- showModal()
    // on a disconnected dialog throws.
    if (!modalOwner || modalOwner.core !== core || !dialog.isConnected || dialog.open) {
      return;
    }
    dialog.showModal();
    root.classList.add('search--open');
    dispatch(root, 'search:open', {surface: 'modal'});
    ensureBackend(core);
    input.focus();
  }

  function close() {
    if (dialog.open) {
      dialog.close();
    }
  }

  dialog.addEventListener('close', () => {
    root.classList.remove('search--open');
    dispatch(root, 'search:close', {surface: 'modal'});
  });

  // First Escape with a non-empty query clears it (the platform fires
  // cancel); the second press closes the dialog natively.
  dialog.addEventListener('cancel', (event) => {
    if (input.value) {
      event.preventDefault();
      input.value = '';
      handleInput(core, '', hooks);
    }
  });

  if (closeButton) {
    closeButton.addEventListener('click', close);
  }

  input.addEventListener('input', () => {
    handleInput(core, input.value, hooks);
  });

  input.addEventListener('keydown', (event) => {
    listbox.onKeydown(event, null);
  });

  modalOwner = {
    root,
    core,
    dialog,
    listbox: listboxEl,
    open,
    close,
    isOpen: () => dialog.open,
    hotkey: parseHotkey(config.hotkey),
    hotkeySlash: config.hotkeySlash,
    apple: isApplePlatform(),
  };
  formerModalOwners.set(root, modalOwner);
  wireModalDocumentListeners();
  sweepModalTriggers();
}

// :modal shipped later than <dialog> itself (Chrome 105 versus 37, Edge
// 105 versus 79, Firefox 103 versus 98, Safari 15.6 versus 15.4), and
// matches() THROWS on an unknown selector -- exactly in the stray-open
// recovery path. Those engines still run the full showModal() top-layer
// lifecycle, so an unanswerable probe does NOT mean not-modal; it means
// the engine cannot distinguish, and each caller picks the safe side: a
// never-wired dialog cannot be the module's live modal (wireModal
// normalizes unconditionally), while the sweep exempts the current
// owner's dialog, which may be legitimately open in the top layer.
let modalPseudoClassSupported = null;

function supportsModalPseudoClass() {
  if (modalPseudoClassSupported === null) {
    try {
      document.createElement('dialog').matches(':modal');
      modalPseudoClassSupported = true;
    } catch {
      modalPseudoClassSupported = false;
    }
  }
  return modalPseudoClassSupported;
}

function isModalDialog(dialog) {
  return supportsModalPseudoClass() && dialog.matches(':modal');
}

// A former-owner record is re-adoptable only when the dialog AND the
// wired interactive surfaces its closures captured -- the input and the
// listbox -- are the connected ones inside it: a restore that kept the
// <dialog> node but replaced its children (a sanitizer or a morphing
// library) would pass a dialog-identity check alone, electing a
// controller whose typing and results surfaces are detached -- a palette
// that opens but can never search, shadowing any healthy stashed
// survivor. The gate mirrors exactly what wiring enforced (input and
// listbox inside the dialog); the template is deliberately NOT gated:
// rendering clones the reference captured at wiring, so a restore that
// dropped or relocated the inert <template> leaves the controller fully
// functional, and gating on it would let a sanitizer that strips
// template elements take down a healthy palette.
function recordDialogIntact(record) {
  return (
    record.dialog.isConnected &&
    record.root.contains(record.dialog) &&
    record.core.input.isConnected &&
    record.dialog.contains(record.core.input) &&
    record.listbox.isConnected &&
    record.dialog.contains(record.listbox)
  );
}

// Hygiene over every former-owner root, decoupled from election so it
// also runs when a healthy owner makes recovery return early and for
// roots past the elected winner: a re-inserted dialog that was open at
// swap time kept its open attribute while losing top-layer status and
// would render as a visible in-flow panel (closing it fires the record's
// close listener, keeping search--open and search:close consistent), and
// a root whose record fails the integrity gate holds only unservable
// dialogs -- unwired impostors, the record's own gutted husk, or a
// dialog reparented out of the root -- which are closed as needed and
// removed.
function sweepFormerOwnerRoots() {
  for (const root of document.querySelectorAll('.search--modal')) {
    const record = formerModalOwners.get(root);
    if (!record) {
      continue;
    }
    if (recordDialogIntact(record)) {
      // Without the :modal probe the engine cannot tell a stray-open
      // dialog from one legitimately open in the top layer, so only the
      // provable side normalizes: a NON-owner's open dialog is always
      // stray (only the owner's open() calls showModal, and deposition
      // happens only after disconnection, which strips top-layer
      // status). The accepted degradation on those engines is an owner
      // whose root was detached and re-inserted while open, without an
      // intervening deposing rescan: its in-flow panel stays visible --
      // traded against closing a palette the user is typing in.
      if (
        record.dialog.open &&
        !isModalDialog(record.dialog) &&
        (supportsModalPseudoClass() || record !== modalOwner)
      ) {
        record.dialog.close();
      }
    } else {
      // Every dialog a gate-failing record can account for is
      // unservable and is removed: the record's own -- a husk whose
      // typing or results surface was detached, or a dialog a host
      // reparented outside the root, which would otherwise linger as a
      // visible in-flow panel that no branch closes -- plus every
      // host-inserted impostor left in the root. An open one is closed
      // FIRST so the record's close listener keeps search--open and
      // search:close consistent (the queued close event reaches a
      // detached dialog's listener while dispatch targets the still-
      // connected root; a never-wired impostor has no listener, so its
      // close() is silent). Such a root stays enhanced with a
      // permanently failing record and can never re-elect -- dialogs
      // restored into it are removed again on every later pass; only a
      // fresh replacement root revives that placement.
      if (record.dialog.open) {
        record.dialog.close();
      }
      record.dialog.remove();
      for (const impostor of root.querySelectorAll('.search__dialog')) {
        if (impostor.open) {
          impostor.close();
        }
        impostor.remove();
      }
    }
  }
}

// After a swap removes the owning root, a replacement root re-elects
// through wireModal -- but already-enhanced survivors are skipped by init.
// This recovery pass re-adopts a re-inserted former owner whose dialog was
// never stashed, then falls back to restoring a stashed dialog on the
// first connected trigger-only survivor, so search:rescan revives the
// palette whatever mix of placements the swap kept. Re-adoption runs
// FIRST: the former owner is fully wired already, and electing a stashed
// survivor beside it would leave the former owner's connected dialog as a
// second one.
function recoverModalOwnership() {
  sweepFormerOwnerRoots();
  // Prune before the healthy-owner early return: an entry whose root left
  // the document can never be re-elected, and keeping it would retain the
  // swapped-out page's whole detached subtree (through the root's parent
  // chain) for the lifetime of this JS context.
  for (let i = stashedModalRoots.length - 1; i >= 0; i--) {
    if (!stashedModalRoots[i].root.isConnected) {
      stashedModalRoots.splice(i, 1);
    }
  }
  // The early return requires an INTACT owner, not merely a connected
  // root: the sweep above may have just removed the owner's own gutted
  // dialog, and a connected-root check would keep that ghost elected --
  // trigger revealed, open() a permanent no-op. The gate subsumes root
  // connectivity (a disconnected root's dialog is itself disconnected).
  if (modalOwner && recordDialogIntact(modalOwner)) {
    return;
  }
  modalOwner = null;
  // A formerly-owning root re-inserted by a host cache restore is
  // connected and still carries its fully wired dialog, but was never
  // stashed and stays invisible to init (already enhanced); re-adopting
  // its controller keeps the page from holding a servable dialog with no
  // owner and every trigger hidden. The integrity gate (dialog identity
  // AND the wired input and listbox inside it) keeps a gutted restore
  // from shadowing a healthy stashed survivor; the sweep above already
  // normalized stray-open dialogs and removed unservable ones. Former
  // owners that do not win this scan keep their in-place dialogs: their
  // nodes carry live listeners, so stashing them would double-wire, and
  // staying in place keeps them re-adoptable later.
  for (const root of document.querySelectorAll('.search--modal')) {
    const record = formerModalOwners.get(root);
    if (record && recordDialogIntact(record)) {
      modalOwner = record;
      sweepModalTriggers();
      return;
    }
  }
  while (stashedModalRoots.length) {
    const entry = stashedModalRoots.shift();
    entry.root.appendChild(entry.dialog);
    wireModal(entry.root, entry.config);
    if (modalOwner) {
      return;
    }
  }
  // No electable dialog remains anywhere: hide every modal trigger again
  // (reveal is otherwise one-way, and a chip that opens nothing violates
  // the revealed-only-when-servable guarantee); a later rescan that
  // elects an owner re-reveals them through the owner's sweep.
  for (const trg of document.querySelectorAll('.search--modal .search__trigger')) {
    hideControl(trg);
  }
}

function wireInline(root, config) {
  const core = createCore(root, config);
  const input = core.input;
  const listboxEl = root.querySelector('.search__listbox');
  const seeAll = root.querySelector('.search__see-all');
  if (!input || !listboxEl || !core.template) {
    return;
  }
  const listbox = createListbox(core, config, listboxEl, seeAll, true);

  const hooks = {
    limit: config.limit,
    beforeRun() {},
    render: listbox.render,
    clear: listbox.clear,
  };

  input.addEventListener('input', () => {
    handleInput(core, input.value, hooks);
  });

  input.addEventListener('keydown', (event) => {
    listbox.onKeydown(event, () => {
      // First Escape collapses the listbox; the second clears the input.
      if (listbox.hasOptions() && !listbox.isCollapsed()) {
        listbox.collapse();
      } else if (input.value) {
        input.value = '';
        handleInput(core, '', hooks);
      }
    });
  });

  // The listbox collapses when focus leaves the component; collapsing never
  // moves focus.
  root.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        listbox.collapse();
      }
    }, 0);
  });

  wireIntentPrefetch(core, input);
}

// ---- Idempotent init ----

function init() {
  for (const root of document.querySelectorAll('.search')) {
    if (root.classList.contains('search--enhanced')) {
      continue;
    }
    const config = readConfig(root);
    if (!config.indexUrl) {
      // Unwired index: the server-rendered form keeps working as-is.
      continue;
    }
    root.classList.add('search--enhanced');
    if (config.surface === 'modal') {
      wireModal(root, config);
    } else if (config.surface === 'inline') {
      wireInline(root, config);
    } else {
      wirePage(root, config);
    }
  }
  recoverModalOwnership();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Roots inserted after the initial load (PJAX/Turbo swaps, AJAX-loaded
// content) are not wired automatically; the host page opts in by
// dispatching this event after inserting them.
document.addEventListener('search:rescan', init);
