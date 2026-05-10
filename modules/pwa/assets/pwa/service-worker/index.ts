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
import {wireUpdateHandler} from './update.js';
import {wirePushHandler} from './push.js';

// Precache + revision tracking provides per-deploy cache-bust for changed assets.
wirePrecache(params.precacheList);

// Drop caches created by older Workbox versions or older deploys whose
// cache-name prefix matches but whose version string differs.
cleanupOutdatedCaches();

// Runtime caching strategies per resource kind.
wireRuntimeRoutes({
  cacheVersion: params.cacheVersion,
  caches: params.caches,
});

// Navigation fallback to the precached offline page.
wireOfflineFallback({offlineUrl: params.offlineUrl});

// Allow the page to message SKIP_WAITING during the update flow.
wireUpdateHandler();

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
