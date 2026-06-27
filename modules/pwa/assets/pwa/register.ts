/**
 * Page-side service-worker registration entry.
 *
 * Bundled by Hugo's js.Build; emitted as a fingerprinted ES module.
 * Loaded as `<script type="module" defer>` by register.html.
 *
 * Dispatches the first three of the consensus-locked nine pwa:* events:
 *   pwa:firstinstall  -- SW activated for the first time on this client
 *   pwa:waiting       -- new SW installed but waiting for old clients to unload
 *   pwa:controlling   -- new SW now controls the page; reload recommended
 *
 * Five of the remaining six events (installavailable, installed, pushintent,
 * pushsubscribed, pushunsubscribed) are dispatched from install.ts and
 * push.ts. The ninth event (pushsubscriptionchange) is dispatched from this
 * file via the SW->page message bridge below: the SW broadcasts a typed
 * PWA_PUSH_SUBSCRIPTION_CHANGE message via clients.postMessage and this
 * listener translates it into a window CustomEvent.
 */

import {Workbox} from 'workbox-window';
import * as params from '@params';

import {dispatch} from './events.js';
import {requestPersistent} from './storage.js';

if ('serviceWorker' in navigator) {
  bootstrap();
}

function bootstrap(): void {
  const wb = new Workbox(params.swPath, {scope: params.swScope});

  wb.addEventListener('installed', (event) => {
    if (!event.isUpdate) {
      dispatch('pwa:firstinstall');
    }
  });

  wb.addEventListener('waiting', () => {
    dispatch('pwa:waiting');
  });

  let reloadingForUpdate = false;
  wb.addEventListener('controlling', () => {
    dispatch('pwa:controlling');
    // params.pwa.sw.update_ux = "silent": when a new SW takes control, reload
    // once so the page shows the new version without a banner. "banner" (the
    // default) leaves the reload decision to the consumer's pwa:waiting UI.
    if (params.updateUx === 'silent' && !reloadingForUpdate) {
      reloadingForUpdate = true;
      window.location.reload();
    }
  });

  void wb.register();

  // params.pwa.sw.storage.request_persistent: ask the browser to mark storage
  // as persistent (best-effort; browsers may prompt or silently decide) once
  // the SW is ready, so precaches survive eviction under storage pressure.
  if (params.requestPersistent) {
    void navigator.serviceWorker.ready.then(() => requestPersistent());
  }

  // Per-page-load pwa:firstinstall dispatch. The Workbox `installed` event only
  // fires during the lifecycle transition from `installing` to `installed`;
  // subsequent page loads of an already-active SW never see it. To give every
  // page-load observer a deterministic signal that the SW is now installed and
  // controlling this client, dispatch pwa:firstinstall once per page load when
  // navigator.serviceWorker is ready and a controller exists. The first
  // navigation receives the dispatch via the `installed` listener above (and,
  // if missed, via the controllerchange path below). Subsequent loads receive
  // the dispatch via the ready resolution below. The event is idempotent at the
  // page-lifecycle level: each page load sees one dispatch when the SW is
  // active, and observers are responsible for any cross-load deduplication.
  void navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) {
      dispatch('pwa:firstinstall');
      return;
    }
    // First navigation with clientsClaim: ready resolves before controller is
    // set on the page. Wait for controllerchange and dispatch once.
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (navigator.serviceWorker.controller) {
          dispatch('pwa:firstinstall');
        }
      },
      {once: true},
    );
  });

  // Bridge SW pushsubscriptionchange -> window event. The SW broadcasts a
  // typed message to all clients when the browser invalidates the
  // subscription (e.g., key rotation); the page-side translation here is
  // what fulfills the consensus-locked nine-event surface.
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as {type?: string; newSubscription?: unknown} | undefined;
    if (data?.type === 'PWA_PUSH_SUBSCRIPTION_CHANGE') {
      dispatch('pwa:pushsubscriptionchange', {
        newSubscription: data.newSubscription ?? null,
      });
    }
  });

  schedulePolling(wb, params.updateCheckSeconds);
}

function schedulePolling(wb: Workbox, intervalSeconds: number): void {
  if (intervalSeconds <= 0) {
    return;
  }
  // Workbox issue #3285 mitigation: poll wb.update() so long-running tabs
  // can detect a redeploy that occurred while the tab was in the background.
  setInterval(() => {
    void wb.update();
  }, intervalSeconds * 1000);
}
