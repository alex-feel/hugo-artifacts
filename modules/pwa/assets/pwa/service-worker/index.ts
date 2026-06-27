/**
 * Service worker entry point.
 *
 * Bundled by Hugo's js.Build with format=esm, target=es2020, minify=true.
 * Workbox sources are vendor-mounted under assets/workbox-* via the
 * companion modules/workbox module; bare imports resolve through Hugo's
 * unified file system.
 *
 * Build-time configuration is injected via the `@params` virtual module
 * (Hugo's js.Build params bridge); see params.d.ts for the shape.
 */

import {clientsClaim} from 'workbox-core';
import {cleanupOutdatedCaches} from 'workbox-precaching';
import * as params from '@params';

import {wirePrecache} from './precache.js';
import {wireRuntimeRoutes} from './routes.js';
import {wireOfflineFallback} from './offline.js';
import {wireUpdateHandler, wireRuntimeCacheCleanup} from './update.js';
import {wirePushHandler} from './push.js';

// Precache + revision tracking provides per-deploy cache-bust for changed assets.
wirePrecache(params.precacheList);

// Prune the Workbox PRECACHE cache of entries from older deploys. This covers
// the precache only; the per-version runtime buckets are pruned separately by
// wireRuntimeCacheCleanup below.
cleanupOutdatedCaches();

// Drop stale per-version runtime caches when params.pwa.version changes.
wireRuntimeCacheCleanup(params.cacheVersion);

// Runtime caching strategies per resource kind, plus SW-bypass routes.
wireRuntimeRoutes({
  cacheVersion: params.cacheVersion,
  caches: params.caches,
  bypass: params.bypass,
  purgeOnQuotaError: params.purgeOnQuotaError,
});

// Navigation fallback to the precached offline page. Gated on the documented
// params.pwa.sw.offline.enabled master switch -- when offline fallback is
// disabled the offline page is neither generated nor precached, so wiring the
// catch handler would only ever serve a 404; leaving it unwired lets failed
// navigations resolve to the browser's default offline behavior.
if (params.offlineEnabled) {
  wireOfflineFallback({offlineUrl: params.offlineUrl, fallbackImage: params.fallbackImage});
}

// Allow the page to message SKIP_WAITING during the update flow, and honor
// params.pwa.sw.skip_waiting (auto-activate a new SW on install).
wireUpdateHandler({skipWaiting: params.skipWaiting});

// Wire push handlers (push, notificationclick, pushsubscriptionchange).
// The SW listens passively; if the page never subscribes, no push event ever
// fires. Wiring unconditionally avoids the failure mode where a consumer
// flips params.pwa.push.enabled = true later but the cached SW lacks the handler.
wirePushHandler({
  notificationIcon: params.notificationIcon,
  notificationBadge: params.notificationBadge,
  defaultClickUrl: params.defaultClickUrl,
  focusExistingTabOnClick: params.focusExistingTabOnClick,
});

// Take control of uncontrolled clients on first install when configured.
if (params.clientsClaim) {
  clientsClaim();
}

if (params.debug) {
  console.info('[pwa] service worker booted', {
    cacheVersion: params.cacheVersion,
    precacheCount: params.precacheList.length,
    offlineUrl: params.offlineUrl,
  });
}
