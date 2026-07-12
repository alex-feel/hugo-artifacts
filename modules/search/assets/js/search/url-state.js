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

// Re-runs the callback when navigation restores a different query: back and
// forward (popstate) and bfcache restores (pageshow with persisted).
export function onExternalChange(callback) {
  window.addEventListener('popstate', () => {
    callback(readQuery());
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      callback(readQuery());
    }
  });
}
