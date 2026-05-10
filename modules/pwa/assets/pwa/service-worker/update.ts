declare const self: ServiceWorkerGlobalScope;

/**
 * Listens for SKIP_WAITING messages from the page and triggers
 * self.skipWaiting() so the new service worker activates immediately.
 *
 * The `self.skipWaiting()` form is the only supported way to skip waiting
 * in Workbox v7+ (the helper that previously lived in workbox-core was
 * removed upstream).
 */
export function wireUpdateHandler(): void {
  self.addEventListener('message', (event) => {
    const data = event.data as {type?: string} | undefined;
    if (data?.type === 'SKIP_WAITING') {
      void self.skipWaiting();
    }
  });
}
