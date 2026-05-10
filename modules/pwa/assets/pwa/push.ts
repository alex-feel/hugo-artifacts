/**
 * Page-side push-subscription flow.
 *
 * Wires the consumer-supplied [data-pwa-subscribe] button to the Web Push API:
 *   1. On click, request Notification.requestPermission() (if not already granted).
 *   2. On grant, call pushManager.subscribe({userVisibleOnly: true,
 *      applicationServerKey: <decoded VAPID public key>}).
 *   3. POST the resulting subscription JSON to params.subscribeUrl.
 *   4. Dispatch pwa:pushintent (signals install gate to clear) and
 *      pwa:pushsubscribed (with event.detail = {endpoint}).
 *
 * If [data-pwa-unsubscribe] exists, wires the unsubscribe flow:
 *   1. On click, get existing subscription.
 *   2. unsubscribe() the subscription.
 *   3. POST to params.unsubscribeUrl with {endpoint}.
 *   4. Dispatch pwa:pushunsubscribed.
 *
 * On page load, checks for an existing subscription via
 * pushManager.getSubscription(); if present, sets __pwa_pushIntentExpressed
 * (via dispatch('pwa:pushintent')) so install.ts reveals the install button
 * for already-subscribed users.
 *
 * userVisibleOnly: true is HARD-CODED. Chromium rejects subscribe with
 * NotAllowedError if false; this is a Web Push spec / browser-policy
 * constraint, not a configurable parameter.
 *
 * SECURITY: subscribe_url MUST be same-origin or origin-validated by the
 * consumer's backend. The fetch uses credentials: 'same-origin' so the
 * browser will not attach cookies on a cross-origin POST. Consumers are
 * responsible for CSRF protection on subscribe_url and unsubscribe_url
 * (e.g., double-submit cookie, SameSite=Lax/Strict cookies, or an
 * origin-bound token). See modules/pwa/README.md (Phase 5) for the
 * recommended backend pattern.
 */

import * as params from '@params';

import {dispatch} from './events.js';

bootstrap();

function bootstrap(): void {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  bindSubscribeButton();
  bindUnsubscribeButton();
  void detectExistingSubscription();
}

function bindSubscribeButton(): void {
  const button = document.querySelector<HTMLButtonElement>(params.subscribeSelector);
  if (!button) {
    return;
  }
  button.addEventListener('click', () => {
    void handleSubscribeClick(button);
  });
}

function bindUnsubscribeButton(): void {
  const button = document.querySelector<HTMLButtonElement>(params.unsubscribeSelector);
  if (!button) {
    return;
  }
  button.addEventListener('click', () => {
    void handleUnsubscribeClick(button);
  });
}

async function handleSubscribeClick(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  // Push intent is expressed the moment the user clicks subscribe -- before any
  // async work that may fail. Dispatching here decouples intent signalling
  // (used by the install gate) from subscribe success: the user has expressed
  // intent regardless of whether the browser, the push service, or the
  // backend ultimately accepts the subscription. Downstream observers of
  // pwa:pushsubscribed remain authoritative for actual subscription state.
  dispatch('pwa:pushintent');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(params.vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    await postJson(params.subscribeUrl, subscription.toJSON());

    dispatch('pwa:pushsubscribed', {endpoint: subscription.endpoint});
  } finally {
    button.disabled = false;
  }
}

async function handleUnsubscribeClick(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    if (params.unsubscribeUrl) {
      await postJson(params.unsubscribeUrl, {endpoint});
    }
    dispatch('pwa:pushunsubscribed');
  } finally {
    button.disabled = false;
  }
}

async function detectExistingSubscription(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    // Already subscribed -- treat as expressed intent so install.ts reveals
    // the install button without forcing the user through subscribe again.
    dispatch('pwa:pushintent');
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

/**
 * Decodes a base64url-encoded VAPID public key into the Uint8Array form
 * pushManager.subscribe expects for applicationServerKey. Implements the
 * canonical web.dev pattern (web.dev/articles/push-notifications-subscribing-a-user).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
