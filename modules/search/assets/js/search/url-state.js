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

// Pruning is aggressive by design (zero retention of detached subtrees),
// so a root detached at the moment an event fires loses its entry even
// when the host later reattaches that same node -- and a reattached root
// cannot re-register through enhancement, which skips already-enhanced
// roots. The WeakMap remembers every registration for exactly that case:
// keyed by the root, its lifetime rides the host's own retention of the
// node (the modal machinery's former-owner records make the same trade),
// and readoptExternalChange() re-registers a remembered root once it is
// back in the document.
const knownRegistrations = new WeakMap();

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
// the callback is dropped from the live list -- and remembered for
// re-adoption should the host bring the same root back.
export function onExternalChange(root, callback) {
  pruneExternalChangeEntries();
  knownRegistrations.set(root, callback);
  for (const entry of externalChangeEntries) {
    if (entry.root === root) {
      // A re-registration for a live root replaces the callback instead
      // of accumulating a second entry, so one popstate can never fan
      // out to two callbacks on one root; the newest wiring wins,
      // matching the WeakMap's memory. Enhancement's own idempotency
      // gate no longer re-wires live roots, so no module path reaches
      // this branch today; it stays as the registry's own guarantee
      // rather than a bet on every future caller.
      entry.callback = callback;
      return;
    }
  }
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

// Re-registers a previously registered root the pruning dropped while it
// was detached, and reconciles it with the current URL. Run from the
// rescan path for roots enhancement skips as already enhanced: a no-op
// for roots never registered (every non-page surface), for disconnected
// roots, and for roots whose entry is still live -- so callers need not
// distinguish, and a registration can never double. The singleton
// listeners are already wired: a remembered root implies a prior
// onExternalChange() call.
export function readoptExternalChange(root) {
  const callback = knownRegistrations.get(root);
  if (!callback || !root.isConnected) {
    return;
  }
  pruneExternalChangeEntries();
  for (const entry of externalChangeEntries) {
    if (entry.root === root) {
      return;
    }
  }
  externalChangeEntries.push({root, callback});
  // Genuine re-adoption reconciles with the address bar: a navigation
  // that fired while the root was detached is gone for good (its event
  // already dispatched), so without this call the surface would show
  // the pre-detach query against the URL's newer one until the next
  // navigation or input. The live-entry early return above keeps
  // ordinary rescans from re-running the current query.
  callback(readQuery());
}
