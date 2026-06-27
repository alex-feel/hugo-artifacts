/**
 * Page-side install-prompt logic.
 *
 * Captures the browser-fired BeforeInstallPromptEvent, holds it for
 * later use, and gates the install button UI on either:
 *   - The user expressing push intent (the default
 *     params.pwa.install.gate_on_push_intent = true mode), OR
 *   - Page load (when gate_on_push_intent = false).
 *
 * Dispatches two of the consensus-locked nine pwa:* events:
 *   pwa:installavailable -- beforeinstallprompt was captured AND
 *                           any push-intent gate has cleared
 *   pwa:installed        -- the user accepted the prompt and the
 *                           browser fired appinstalled
 *
 * Honors params.pwa.install.remember_dismissed_days via localStorage
 * to suppress the install button for users who recently dismissed it.
 *
 * Consumers supply the install button markup, e.g.:
 *   <button data-pwa-install hidden>Install</button>
 * The script removes the [hidden] attribute when gating conditions clear.
 */

import * as params from '@params';

import {dispatch} from './events.js';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = '__pwa_install_dismissed_at';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let pushIntentExpressed = false;

bootstrap();

function bootstrap(): void {
  if (isDismissed()) {
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    revealIfReady();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    // params.pwa.install.hide_when_installed (default true): hide the button
    // once the app is installed. When false, the consumer keeps controlling it.
    if (params.hideWhenInstalled) {
      hideInstallButton();
    }
    dispatch('pwa:installed');
    // params.pwa.install.analytics_event: when set, also fire a window
    // CustomEvent with that name so analytics integrations can log the install.
    if (params.analyticsEvent) {
      window.dispatchEvent(new CustomEvent(params.analyticsEvent));
    }
  });

  if (params.gateOnPushIntent) {
    window.addEventListener('pwa:pushintent', () => {
      pushIntentExpressed = true;
      revealIfReady();
    });
  } else {
    pushIntentExpressed = true;
  }

  bindInstallButton();
}

function revealIfReady(): void {
  if (!deferredPrompt) {
    return;
  }
  if (!pushIntentExpressed) {
    return;
  }
  showInstallButton();
  dispatch('pwa:installavailable');
}

function bindInstallButton(): void {
  const button = document.querySelector<HTMLButtonElement>(params.buttonSelector);
  if (!button) {
    return;
  }
  button.addEventListener('click', () => {
    void handleInstallClick(button);
  });
}

async function handleInstallClick(button: HTMLButtonElement): Promise<void> {
  if (!deferredPrompt) {
    return;
  }
  button.disabled = true;
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'dismissed') {
      recordDismissal();
      hideInstallButton();
    }
    deferredPrompt = null;
  } finally {
    button.disabled = false;
  }
}

function showInstallButton(): void {
  const button = document.querySelector<HTMLButtonElement>(params.buttonSelector);
  if (button) {
    button.removeAttribute('hidden');
  }
}

function hideInstallButton(): void {
  const button = document.querySelector<HTMLButtonElement>(params.buttonSelector);
  if (button) {
    button.setAttribute('hidden', '');
  }
}

function recordDismissal(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (private mode etc.); silent fallback.
  }
}

function isDismissed(): boolean {
  if (params.rememberDismissedDays <= 0) {
    return false;
  }
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) {
      return false;
    }
    const at = Number(raw);
    if (!Number.isFinite(at)) {
      return false;
    }
    const ms = params.rememberDismissedDays * 86400000;
    return Date.now() - at < ms;
  } catch {
    return false;
  }
}
