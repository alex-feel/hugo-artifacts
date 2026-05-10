# iOS Safari install-before-push manual matrix

Manual test checklist for the iOS Safari 16.4+ install-before-push flow. Automation is not feasible: the Add to Home Screen flow runs entirely in the iOS Safari browser chrome (Share menu, Home Screen icon placement) which Playwright and Selenium cannot drive.

## Why install-before-push?

iOS Safari 16.4 introduced Web Push, but only for installed PWAs. The permission prompt does not appear in regular Safari -- the user must add the site to the Home Screen first, then open the PWA, then tap the subscribe button. This is a platform constraint, not a module choice.

The module's default `gate_on_push_intent = true` aligns with this flow: on iOS the install button is irrelevant (install happens via Safari's Share menu, not a button), so the gating is silent and the user installs first via Safari, then opens the PWA and subscribes.

## Prerequisites

| Requirement                                                                 | Notes                                                                              |
|-----------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| iOS device running iOS 16.4 or newer                                        | iPhone or iPad. Older versions support PWA install but NOT Web Push.               |
| Safari (default browser)                                                    | Chrome on iOS uses WebKit but does not surface PWA install for the same site.     |
| Fixture site deployed to a publicly-reachable HTTPS origin                  | iOS does not honor `localhost` exceptions like desktop. Use a real HTTPS deployment, a TLS-enabled tunnel (Cloudflare Tunnel, ngrok), or a staging environment. |
| One of the reference push backends deployed (Cloudflare / Express / Firebase) | With VAPID keys provisioned. Subscribe / unsubscribe URLs configured in the fixture's `hugo.toml`. |
| (Optional) macOS with Safari Web Inspector                                  | Connect the iOS device via USB to inspect manifest, SW state, console log.        |

## Manual matrix

Mark each row Pass / Fail / N/A. Capture the iOS version, device model, and date in the table at the bottom.

### Pre-install verification (Safari, not yet added to Home Screen)

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 1   | Open Safari and visit the fixture site URL.                                                   | Page renders normally. No PWA install prompt or "open in app" banner.                                                                 |         |
| 2   | (Optional) Connect via Web Inspector and verify `<link rel="manifest" href="/manifest.webmanifest">` is in `<head>`. | Manifest link present; manifest fetches successfully (status 200, content-type `application/manifest+json`).               |         |
| 3   | Verify the subscribe button (`[data-pwa-subscribe]`) is visible on the page.                  | Button is visible (push UI is always rendered; the install-prompt gating only affects the install button).                            |         |
| 4   | Verify the install button (`[data-pwa-install]`) has `hidden` attribute.                      | Button is hidden by default (`gate_on_push_intent = true`). On iOS this is irrelevant; install happens via Safari's Share menu.       |         |
| 5   | Tap the subscribe button.                                                                     | Either: (a) silent failure (no permission prompt) because iOS only allows push permission for installed PWAs; OR (b) console error visible via Web Inspector. The button MUST NOT crash the page. |         |

### Install via Safari Share menu

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 6   | Tap the Share button in Safari's bottom toolbar.                                              | Share sheet appears.                                                                                                                  |         |
| 7   | Scroll the Share sheet and tap "Add to Home Screen".                                          | Confirmation sheet shows the site name (from `params.pwa.manifest.short_name` or `name`) and apple-touch-icon.png as the icon.        |         |
| 8   | Confirm the name and tap "Add" in the upper-right corner.                                     | Sheet dismisses; iOS returns to Safari.                                                                                               |         |
| 9   | Press the Home button (or swipe up); locate the new PWA icon on the Home Screen.              | Icon appears with the configured short_name or name. Icon is the apple-touch-icon.png from the fixture.                               |         |

### Push subscribe from the installed PWA

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 10  | Tap the PWA icon on the Home Screen (NOT the Safari bookmark).                                | PWA opens in standalone mode (no Safari URL bar; no tab bar). `display-mode: standalone` is active.                                  |         |
| 11  | Tap the subscribe button (`[data-pwa-subscribe]`).                                            | iOS push permission prompt appears: "yourdomain.com Would Like to Send You Notifications".                                            |         |
| 12  | Tap "Allow".                                                                                  | Permission is granted. The page-side `push.ts` calls `pushManager.subscribe(...)` and POSTs the subscription JSON to `subscribe_url`. |         |
| 13  | (Optional) Verify network log via Web Inspector: a POST to the configured `subscribe_url` with body `{endpoint, keys: {p256dh, auth}}`. | POST succeeds with 201. Backend stores the subscription.                                                                              |         |

### Receive a push notification

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 14  | From your operator workstation, send a test push via the trigger endpoint:<br><br>`curl -X POST -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"title":"Test","body":"Hello from PWA","url":"https://yourdomain.com/"}' https://your-backend.example.com/trigger` | Backend returns `{"ok": true, "sent": 1, "removed": 0}`.                                                                              |         |
| 15  | Lock the iOS device (or send the device to standby).                                          | Device locks normally.                                                                                                                |         |
| 16  | Within a few seconds, the notification appears on the lock screen / Notification Center.      | Notification shows the title, body, and PWA icon. iOS may also play the system notification sound.                                    |         |
| 17  | Tap the notification.                                                                         | iOS unlocks; the PWA opens (or focuses if already open in the background) at the URL specified in the trigger payload.                |         |

### Unsubscribe flow

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 18  | In the installed PWA, tap the unsubscribe button (`[data-pwa-unsubscribe]`).                  | The page-side `push.ts` calls `subscription.unsubscribe()` and POSTs `{endpoint}` to `unsubscribe_url`. Backend deletes the row.      |         |
| 19  | Send another test push (row 14 repeated).                                                     | Backend returns `{"ok": true, "sent": 0, "removed": 0}` (no subscriptions remain). No notification appears on iOS.                    |         |

### Reinstall verification

| Row | Step                                                                                          | Expected result                                                                                                                       | Outcome |
|-----|-----------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|
| 20  | From the iOS Home Screen, long-press the PWA icon -> "Delete Bookmark" -> "Delete" to remove. | Icon disappears.                                                                                                                      |         |

After deletion, you can re-run the matrix from row 1 to verify a clean re-install.

## Common iOS-specific issues

### "Subscribe permission prompt does not appear"

The PWA must be opened from the Home Screen, NOT from Safari. Even if the URL is identical, Safari does not surface the permission prompt. Verify: tap the Home Screen icon, not a Safari bookmark.

### "Notification did not appear"

Check:

- The VAPID PUBLIC key in `params.pwa.push.vapid_public_key` matches the PRIVATE key configured on the backend.
- iOS Settings -> Notifications -> [your PWA name] -> Allow Notifications is enabled.
- The device is connected to the network (push notifications cannot be delivered offline; iOS does not retry beyond a short window).
- iOS focus mode (Do Not Disturb, Sleep, Work) is not silencing notifications.

### "PWA does not install via Add to Home Screen"

Verify:

- The site is served over HTTPS (iOS does not honor localhost exceptions).
- The manifest fetches and parses (use Web Inspector to confirm).
- The `<link rel="manifest">` is in `<head>`, not the body.
- The fixture has `apple-touch-icon.png` in `static/` (otherwise iOS may show a generic icon).

### "PWA opens in Safari instead of standalone"

The user tapped a Safari bookmark or a regular link, not the Home Screen icon. Long-press the Home Screen icon to confirm it is the PWA icon, not a bookmark.

## Recommended consumer pattern

In the consumer site's layout, detect iOS and surface "Tap Share -> Add to Home Screen" instructions instead of (or alongside) the install button:

```javascript
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
if (isIos && !isStandalone) {
  document.querySelector('.ios-install-banner').classList.remove('hidden');
}
```

Inside the installed PWA (`display-mode: standalone`), the subscribe button and unsubscribe button work the same as on any other browser.

## Test record

Fill in for each test session:

| Date       | Tester      | Device model         | iOS version | Safari version | Result                            |
|------------|-------------|----------------------|-------------|----------------|-----------------------------------|
|            |             |                      |             |                | Pass / Fail (rows X, Y failed)    |

Attach screenshots for any failed rows.

## See also

- [`modules/pwa/README.md`](../README.md) -- the module under test.
- [`README.md`](README.md) -- automated validation matrix usage.
- [WebKit blog: Web Push for Web Apps on iOS and iPadOS (March 2023)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web.dev Learn PWA: Installation](https://web.dev/learn/pwa/installation)
