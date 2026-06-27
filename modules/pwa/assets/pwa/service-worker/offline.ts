import {setCatchHandler} from 'workbox-routing';
import {matchPrecache} from 'workbox-precaching';

export interface OfflineParams {
  offlineUrl: string;
  fallbackImage?: string;
}

/**
 * Serves precached fallbacks for requests that fail offline:
 *   - navigations  -> the precached offline page (offlineUrl)
 *   - images       -> the precached fallback image (fallbackImage), when set
 * Anything else falls through to Response.error() (the default). Both fallbacks
 * rely on the asset being in the precache, which precache-list.html guarantees
 * under the same enabled conditions.
 */
export function wireOfflineFallback({offlineUrl, fallbackImage}: OfflineParams): void {
  setCatchHandler(async ({request}) => {
    if (request.destination === 'document' || request.mode === 'navigate') {
      const cached = await matchPrecache(offlineUrl);
      if (cached) {
        return cached;
      }
    }
    if (fallbackImage && request.destination === 'image') {
      const cached = await matchPrecache(fallbackImage);
      if (cached) {
        return cached;
      }
    }
    return Response.error();
  });
}
