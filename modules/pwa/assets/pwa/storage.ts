/**
 * Storage helper wrapping navigator.storage APIs.
 *
 * Exposes:
 *   requestPersistent() -- request persistent storage (one-time UX
 *                          opportunity; opt-in via
 *                          params.pwa.sw.storage.request_persistent)
 *   getEstimate()       -- usage / quota stats for diagnostics
 *
 * Default behavior: not invoked unless the consumer opts in. The recommended
 * invocation pattern is to call requestPersistent() inside a pwa:installed
 * event listener so the prompt comes at the natural moment of user commitment.
 */

export async function requestPersistent(): Promise<boolean> {
  if (!('storage' in navigator) || !('persist' in navigator.storage)) {
    return false;
  }
  return navigator.storage.persist();
}

export async function getEstimate(): Promise<StorageEstimate | null> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return null;
  }
  return navigator.storage.estimate();
}
