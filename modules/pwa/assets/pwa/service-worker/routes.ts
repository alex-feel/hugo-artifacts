import {registerRoute} from 'workbox-routing';
import {CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate} from 'workbox-strategies';
import {ExpirationPlugin} from 'workbox-expiration';
import {CacheableResponsePlugin} from 'workbox-cacheable-response';

export interface CacheRuleConfig {
  strategy: string;
  origins?: string[];
  network_timeout_seconds?: number;
  max_entries?: number;
  max_age_seconds?: number;
  url_pattern?: string;
  include_google_fonts?: boolean;
}

export interface RoutesParams {
  cacheVersion: string;
  caches: {
    html: CacheRuleConfig;
    style: CacheRuleConfig;
    script: CacheRuleConfig;
    font: CacheRuleConfig;
    image: CacheRuleConfig;
    api: CacheRuleConfig;
  };
}

const cacheName = (version: string, kind: string): string => `pwa-${version}-runtime-${kind}`;

export function wireRuntimeRoutes(p: RoutesParams): void {
  const v = p.cacheVersion;

  // HTML / navigations -- NetworkFirst with bounded fallback timeout.
  registerRoute(
    ({request}) => request.mode === 'navigate' || request.destination === 'document',
    new NetworkFirst({
      cacheName: cacheName(v, 'html'),
      networkTimeoutSeconds: p.caches.html.network_timeout_seconds ?? 3,
      plugins: [
        new ExpirationPlugin({
          maxEntries: p.caches.html.max_entries ?? 50,
          maxAgeSeconds: p.caches.html.max_age_seconds ?? 86400,
        }),
      ],
    }),
  );

  // Stylesheets -- StaleWhileRevalidate.
  registerRoute(
    ({request}) => request.destination === 'style',
    new StaleWhileRevalidate({
      cacheName: cacheName(v, 'style'),
      plugins: [
        new ExpirationPlugin({
          maxEntries: p.caches.style.max_entries ?? 30,
          maxAgeSeconds: p.caches.style.max_age_seconds ?? 2592000,
        }),
      ],
    }),
  );

  // Scripts (and workers) -- StaleWhileRevalidate.
  registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'worker',
    new StaleWhileRevalidate({
      cacheName: cacheName(v, 'script'),
      plugins: [
        new ExpirationPlugin({
          maxEntries: p.caches.script.max_entries ?? 30,
          maxAgeSeconds: p.caches.script.max_age_seconds ?? 2592000,
        }),
      ],
    }),
  );

  // Fonts (incl. configured CDN origins) -- CacheFirst, 1 year by default.
  // CacheableResponsePlugin([0, 200]) accepts opaque cross-origin font responses.
  const fontOrigins = new Set<string>(p.caches.font.origins ?? []);
  registerRoute(
    ({url, request}) => request.destination === 'font' || fontOrigins.has(url.origin),
    new CacheFirst({
      cacheName: cacheName(v, 'font'),
      plugins: [
        new CacheableResponsePlugin({statuses: [0, 200]}),
        new ExpirationPlugin({
          maxEntries: p.caches.font.max_entries ?? 20,
          maxAgeSeconds: p.caches.font.max_age_seconds ?? 31536000,
        }),
      ],
    }),
  );

  // Images -- CacheFirst with quota-error purging.
  registerRoute(
    ({request}) => request.destination === 'image',
    new CacheFirst({
      cacheName: cacheName(v, 'image'),
      plugins: [
        new ExpirationPlugin({
          maxEntries: p.caches.image.max_entries ?? 60,
          maxAgeSeconds: p.caches.image.max_age_seconds ?? 2592000,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  );

  // /api/, index.json, sitemap.xml -- NetworkOnly (never cached).
  // The url_pattern is configurable; clearing it disables this route.
  if (p.caches.api.url_pattern) {
    const re = new RegExp(p.caches.api.url_pattern);
    registerRoute(({url}) => re.test(url.pathname), new NetworkOnly());
  }
}
