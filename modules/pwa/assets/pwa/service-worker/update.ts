declare const self: ServiceWorkerGlobalScope;

/**
 * Wires the update lifecycle:
 *
 *  - When params.pwa.sw.skip_waiting is true, the SW calls self.skipWaiting()
 *    on `install` so a new version activates immediately (no waiting state,
 *    no update banner). Default is false so the consumer's update UX runs.
 *  - Always listens for a SKIP_WAITING message from the page so the update
 *    banner's "Update" button can activate a waiting SW on demand.
 *
 * The `self.skipWaiting()` form is the only supported way to skip waiting in
 * Workbox v7+ (the helper that previously lived in workbox-core was removed
 * upstream).
 */
export function wireUpdateHandler(options: {skipWaiting: boolean}): void {
  if (options.skipWaiting) {
    self.addEventListener('install', () => {
      void self.skipWaiting();
    });
  }

  self.addEventListener('message', (event) => {
    const data = event.data as {type?: string} | undefined;
    if (data?.type === 'SKIP_WAITING') {
      void self.skipWaiting();
    }
  });
}

/**
 * Deletes stale runtime caches left behind by a previous params.pwa.version.
 *
 * Workbox's cleanupOutdatedCaches() only prunes its own PRECACHE cache; the
 * per-version runtime buckets (`pwa-<version>-runtime-*`, created in routes.ts)
 * are opaque to Workbox. Without this, bumping params.pwa.version would leak
 * every old runtime bucket forever, defeating the purpose of the version stamp.
 */
export function wireRuntimeCacheCleanup(version: string): void {
  const keepPrefix = `pwa-${version}-runtime-`;
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith('pwa-') &&
                name.includes('-runtime-') &&
                !name.startsWith(keepPrefix),
            )
            .map((name) => caches.delete(name)),
        );
      })(),
    );
  });
}
