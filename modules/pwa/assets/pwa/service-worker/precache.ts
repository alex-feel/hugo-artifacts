import {precacheAndRoute, type PrecacheEntry} from 'workbox-precaching';

/**
 * Wires precaching for the build-time-computed list. Workbox handles
 * Hugo's pretty URLs (/about/ -> /about/index.html) automatically via
 * `precacheAndRoute`'s ignoreURLParametersMatching default.
 */
export function wirePrecache(entries: ReadonlyArray<PrecacheEntry>): void {
  if (entries.length === 0) {
    return;
  }
  precacheAndRoute(entries as PrecacheEntry[]);
}
