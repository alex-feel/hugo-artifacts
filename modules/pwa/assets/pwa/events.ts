/**
 * Tiny CustomEvent dispatcher used by register.ts and the install/push surfaces.
 * Centralizing dispatch keeps the event-name surface easy to audit.
 *
 * The full nine-event surface is declared at v1.0; only three names are
 * dispatched from register.ts (the remaining six come online with the
 * install + push partials).
 */

export type PwaEventName =
  | 'pwa:firstinstall'
  | 'pwa:waiting'
  | 'pwa:controlling'
  | 'pwa:installavailable'
  | 'pwa:installed'
  | 'pwa:pushintent'
  | 'pwa:pushsubscribed'
  | 'pwa:pushunsubscribed'
  | 'pwa:pushsubscriptionchange';

export function dispatch<T = undefined>(name: PwaEventName, detail?: T): void {
  window.dispatchEvent(new CustomEvent(name, {detail}));
}
