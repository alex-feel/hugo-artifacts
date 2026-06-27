/**
 * Type declarations for the `@params` virtual module supplied by
 * Hugo's js.Build params bridge. See modules/pwa/layouts/_partials/pwa/service-worker.html
 * for the shape Hugo passes at build time.
 *
 * This file is consumed only by tsc-noEmit type checks; esbuild ignores .d.ts
 * during bundling.
 */

declare module '@params' {
  import type {PrecacheEntry} from 'workbox-precaching';

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

  export const precacheList: PrecacheEntry[];
  export const cacheVersion: string;
  export const offlineUrl: string;
  export const offlineEnabled: boolean;
  export const fallbackImage: string;
  export const debug: boolean;
  export const clientsClaim: boolean;
  export const skipWaiting: boolean;
  export const bypass: BypassConfig;
  export const purgeOnQuotaError: boolean;
  export const notificationIcon: string;
  export const notificationBadge: string;
  export const defaultClickUrl: string;
  export const focusExistingTabOnClick: boolean;
  export const caches: {
    html: CacheRuleConfig;
    style: CacheRuleConfig;
    script: CacheRuleConfig;
    font: CacheRuleConfig;
    image: CacheRuleConfig;
    api: CacheRuleConfig;
  };
}
