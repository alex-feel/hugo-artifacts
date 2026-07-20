// search/url-state.js: the ?q= round-trip for the dedicated page surface.
// All URL work goes through URL/URLSearchParams -- never string
// concatenation -- so Cyrillic, &, and + round-trip on every navigation
// path.
/* global window, history, URL */

export function readQuery() {
  return new URL(window.location.href).searchParams.get('q') || '';
}

// Debounce-friendly single write: sets or removes ?q= without adding
// history entries.
export function writeQuery(q) {
  const url = new URL(window.location.href);
  if (q) {
    url.searchParams.set('q', q);
  } else {
    url.searchParams.delete('q');
  }
  history.replaceState(history.state, '', url);
}

// One registry behind singleton window listeners: a page surface
// registers per enhancement, but a host swap can replace its root while
// this JS context survives, and per-registration listeners would
// accumulate forever and keep running callbacks against detached roots
// -- the same retention class the modal's document-level singletons
// guard against. Entries are pruned by root connectivity at registration
// and at event time, so a swapped-out surface drops off the list.
const externalChangeEntries = [];
let externalChangeListenersWired = false;

function pruneExternalChangeEntries() {
  for (let i = externalChangeEntries.length - 1; i >= 0; i--) {
    if (!externalChangeEntries[i].root.isConnected) {
      externalChangeEntries.splice(i, 1);
    }
  }
}

function notifyExternalChange() {
  pruneExternalChangeEntries();
  const q = readQuery();
  for (const entry of externalChangeEntries) {
    entry.callback(q);
  }
}

// Re-runs the callback when navigation restores a different query: back and
// forward (popstate) and bfcache restores (pageshow with persisted). The
// root anchors the registration's lifetime: once it leaves the document,
// the callback is dropped.
export function onExternalChange(root, callback) {
  pruneExternalChangeEntries();
  externalChangeEntries.push({root, callback});
  if (externalChangeListenersWired) {
    return;
  }
  externalChangeListenersWired = true;
  window.addEventListener('popstate', notifyExternalChange);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      notifyExternalChange();
    }
  });
}
