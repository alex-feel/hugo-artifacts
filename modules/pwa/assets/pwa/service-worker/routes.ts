import {registerRoute} from 'workbox-routing';
import {
  CacheFirst,
  CacheOnly,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from 'workbox-strategies';
import type {Strategy} from 'workbox-strategies';
import type {WorkboxPlugin} from 'workbox-core';
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

export interface BypassConfig {
  urls?: string[];
  patterns?: string[];
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
  bypass?: BypassConfig;
  purgeOnQuotaError?: boolean;
}

// Origins added to the font route when caches.font.include_google_fonts is true.
const GOOGLE_FONT_ORIGINS = ['https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'];

const cacheName = (version: string, kind: string): string => `pwa-${version}-runtime-${kind}`;

interface StrategyOptions {
  cacheName: string;
  networkTimeoutSeconds?: number;
  plugins: WorkboxPlugin[];
}

/**
 * Builds the Workbox strategy named by the per-bucket `strategy` config value.
 * The supported names mirror data/pwa/defaults.toml and the README's
 * `params.pwa.sw.caches.*.strategy` table. Unknown names fall back to
 * NetworkFirst so a typo degrades safely rather than throwing in the SW.
 *
 * networkTimeoutSeconds applies only to NetworkFirst; cacheName/plugins are
 * inert for NetworkOnly (it never reads or writes a cache).
 */
function buildStrategy(name: string, options: StrategyOptions): Strategy {
  const {cacheName: cn, networkTimeoutSeconds, plugins} = options;
  switch (name) {
    case 'cache-first':
      return new CacheFirst({cacheName: cn, plugins});
    case 'stale-while-revalidate':
      return new StaleWhileRevalidate({cacheName: cn, plugins});
    case 'cache-only':
      return new CacheOnly({cacheName: cn, plugins});
    case 'network-only':
      return new NetworkOnly({plugins});
    case 'network-first':
    default:
      return new NetworkFirst({cacheName: cn, networkTimeoutSeconds, plugins});
  }
}

export function wireRuntimeRoutes(p: RoutesParams): void {
  const v = p.cacheVersion;
  const purgeOnQuotaError = p.purgeOnQuotaError ?? true;

  const expiration = (
    rule: CacheRuleConfig,
    fallbackEntries: number,
    fallbackAge: number,
  ): ExpirationPlugin =>
    new ExpirationPlugin({
      maxEntries: rule.max_entries ?? fallbackEntries,
      maxAgeSeconds: rule.max_age_seconds ?? fallbackAge,
      purgeOnQuotaError,
    });

  // Bypass routes FIRST (highest priority): matching requests always go to the
  // network and are never cached. Honors params.pwa.sw.bypass.{urls,patterns}.
  const bypassUrls = new Set(p.bypass?.urls ?? []);
  const bypassPatterns = (p.bypass?.patterns ?? []).map((s) => new RegExp(s));
  if (bypassUrls.size > 0 || bypassPatterns.length > 0) {
    registerRoute(({url}) => {
      if (bypassUrls.has(url.href) || bypassUrls.has(url.pathname)) {
        return true;
      }
      return bypassPatterns.some((re) => re.test(url.pathname) || re.test(url.href));
    }, new NetworkOnly());
  }

  // HTML / navigations.
  registerRoute(
    ({request}) => request.mode === 'navigate' || request.destination === 'document',
    buildStrategy(p.caches.html.strategy, {
      cacheName: cacheName(v, 'html'),
      networkTimeoutSeconds: p.caches.html.network_timeout_seconds ?? 3,
      plugins: [expiration(p.caches.html, 50, 86400)],
    }),
  );

  // Stylesheets (plus any explicit cross-origin style CDNs in style.origins).
  const styleOrigins = new Set(p.caches.style.origins ?? []);
  registerRoute(
    ({url, request}) => request.destination === 'style' || styleOrigins.has(url.origin),
    buildStrategy(p.caches.style.strategy, {
      cacheName: cacheName(v, 'style'),
      plugins: [expiration(p.caches.style, 30, 2592000)],
    }),
  );

  // Scripts and workers (plus any explicit cross-origin script CDNs in script.origins).
  const scriptOrigins = new Set(p.caches.script.origins ?? []);
  registerRoute(
    ({url, request}) =>
      request.destination === 'script' ||
      request.destination === 'worker' ||
      scriptOrigins.has(url.origin),
    buildStrategy(p.caches.script.strategy, {
      cacheName: cacheName(v, 'script'),
      plugins: [expiration(p.caches.script, 30, 2592000)],
    }),
  );

  // Fonts (incl. configured CDN origins). include_google_fonts adds the
  // pre-allowlisted Google Fonts + CDNJS origins on top of any explicit ones.
  // CacheableResponsePlugin([0, 200]) accepts opaque cross-origin font responses.
  const fontOrigins = new Set<string>(p.caches.font.origins ?? []);
  if (p.caches.font.include_google_fonts) {
    for (const origin of GOOGLE_FONT_ORIGINS) {
      fontOrigins.add(origin);
    }
  }
  registerRoute(
    ({url, request}) => request.destination === 'font' || fontOrigins.has(url.origin),
    buildStrategy(p.caches.font.strategy, {
      cacheName: cacheName(v, 'font'),
      plugins: [
        new CacheableResponsePlugin({statuses: [0, 200]}),
        expiration(p.caches.font, 20, 31536000),
      ],
    }),
  );

  // Images (plus any explicit cross-origin image CDNs in image.origins).
  const imageOrigins = new Set(p.caches.image.origins ?? []);
  registerRoute(
    ({url, request}) => request.destination === 'image' || imageOrigins.has(url.origin),
    buildStrategy(p.caches.image.strategy, {
      cacheName: cacheName(v, 'image'),
      plugins: [expiration(p.caches.image, 60, 2592000)],
    }),
  );

  // /api/, index.json, sitemap.xml -- pattern-matched; strategy configurable
  // (default network-only). Clearing url_pattern disables this route.
  if (p.caches.api.url_pattern) {
    const re = new RegExp(p.caches.api.url_pattern);
    registerRoute(
      ({url}) => re.test(url.pathname),
      buildStrategy(p.caches.api.strategy, {
        cacheName: cacheName(v, 'api'),
        plugins: [expiration(p.caches.api, 50, 86400)],
      }),
    );
  }
}
