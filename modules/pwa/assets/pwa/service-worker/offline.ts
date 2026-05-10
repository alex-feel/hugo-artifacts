import {setCatchHandler} from 'workbox-routing';
import {matchPrecache} from 'workbox-precaching';

export interface OfflineParams {
  offlineUrl: string;
}

/**
 * Returns the precached offline page for navigation requests that fail.
 * Non-navigation failures fall through to Response.error() (the default).
 */
export function wireOfflineFallback({offlineUrl}: OfflineParams): void {
  setCatchHandler(async ({request}) => {
    if (request.destination === 'document' || request.mode === 'navigate') {
      const cached = await matchPrecache(offlineUrl);
      if (cached) {
        return cached;
      }
    }
    return Response.error();
  });
}
