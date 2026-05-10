/**
 * Service-worker push handlers.
 *
 * Wires three SW-side listeners:
 *   push                      -- renders a Notification using consumer-configured
 *                                icon + badge + click URL.
 *   notificationclick         -- focuses an existing tab matching the notification's
 *                                target URL (when focus_existing_tab_on_click = true)
 *                                or opens a new tab.
 *   pushsubscriptionchange    -- broadcasts a typed message to all window clients
 *                                so register.ts can dispatch the
 *                                pwa:pushsubscriptionchange CustomEvent.
 *
 * Push payload contract (consumer's backend sends JSON):
 *   { title?, body?, icon?, badge?, url?, tag?, data? }
 * Missing fields fall back to the params defaults sourced from defaults.toml.
 */

import type {} from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

interface PushHandlerParams {
  notificationIcon: string;
  notificationBadge: string;
  defaultClickUrl: string;
  focusExistingTabOnClick: boolean;
}

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: unknown;
}

export function wirePushHandler(p: PushHandlerParams): void {
  self.addEventListener('push', (event) => {
    event.waitUntil(handlePush(event, p));
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(handleNotificationClick(event, p));
  });

  self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(handleSubscriptionChange(event));
  });
}

async function handlePush(event: PushEvent, p: PushHandlerParams): Promise<void> {
  const payload = parsePayload(event);
  const title = payload.title ?? '';
  const options: NotificationOptions & {badge?: string} = {
    body: payload.body ?? '',
    icon: payload.icon ?? p.notificationIcon,
    badge: payload.badge ?? p.notificationBadge,
    tag: payload.tag,
    data: {
      url: payload.url ?? p.defaultClickUrl,
      ...(typeof payload.data === 'object' && payload.data !== null ? payload.data : {}),
    },
  };
  await self.registration.showNotification(title, options);
}

async function handleNotificationClick(
  event: NotificationEvent,
  p: PushHandlerParams,
): Promise<void> {
  const data = (event.notification.data ?? {}) as {url?: string};
  const targetUrl = data.url ?? p.defaultClickUrl;

  if (p.focusExistingTabOnClick) {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of allClients) {
      if (client.url === targetUrl && 'focus' in client) {
        await client.focus();
        return;
      }
    }
  }

  if ('openWindow' in self.clients) {
    await self.clients.openWindow(targetUrl);
  }
}

async function handleSubscriptionChange(event: PushSubscriptionChangeEvent): Promise<void> {
  // Broadcast the change to all window clients so the page-side
  // register.ts can dispatch pwa:pushsubscriptionchange. Including
  // includeUncontrolled: true catches clients that have not yet
  // claimed this SW.
  const allClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  const payload = {
    type: 'PWA_PUSH_SUBSCRIPTION_CHANGE',
    oldSubscription: event.oldSubscription ? event.oldSubscription.toJSON() : null,
    newSubscription: event.newSubscription ? event.newSubscription.toJSON() : null,
  };
  for (const client of allClients) {
    client.postMessage(payload);
  }
}

function parsePayload(event: PushEvent): PushPayload {
  if (!event.data) {
    return {};
  }
  try {
    return event.data.json() as PushPayload;
  } catch {
    const text = event.data.text();
    return {body: text};
  }
}
