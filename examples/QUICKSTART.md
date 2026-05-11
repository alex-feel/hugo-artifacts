# Quickstart: 5-minute Push Notifications

This guide gets a Hugo site shipping working push notifications via the Cloudflare Workers reference backend in approximately 5 minutes. It assumes you already have a Hugo site running with `modules/pwa` imported. For deeper configuration, see the per-backend READMEs linked in [`README.md`](README.md).

The Cloudflare Workers reference backend is recommended for the quickstart because it has the lowest deployment friction: a single CLI tool (`wrangler`) handles deploy, secrets, and KV namespace creation; the free tier is generous (100k requests/day); and the runtime uses native `crypto.subtle` for VAPID signing, so there is no third-party push library to install.

## Prerequisites

You need the following before starting:

- Hugo v0.160.0+ extended, installed locally.
- A Hugo site that already imports `modules/pwa` (see [`modules/pwa` Quick start](../modules/pwa/README.md#quick-start) for the minimum config).
- Node.js v22+ (needed by `wrangler` and the one-shot `npx web-push` invocation that generates the VAPID keypair).
- A free Cloudflare account (sign up at <https://dash.cloudflare.com/sign-up>).
- A local checkout of this repository (so you can copy `examples/backend-cloudflare-worker/` as your deployment source).

## Step 1: Generate a VAPID keypair (~30 seconds)

The Web Push protocol identifies your server via a VAPID keypair (RFC 8292). Generate one with:

```bash
npx web-push generate-vapid-keys
```

The output prints `Public Key` and `Private Key` in base64url. The PUBLIC key ships to the browser via Hugo config (`params.pwa.push.vapid_public_key`); the PRIVATE key MUST stay server-side in the Cloudflare secret store. Save both somewhere safe (a password manager or note you will delete in a few minutes); the next step provisions them as Cloudflare secrets.

> **Important:** never commit either key to source control, never log the PRIVATE key, never paste it into any client bundle, browser DevTools console, or Hugo config. A leaked PRIVATE key lets an attacker send pushes to your entire subscriber base.

## Step 2: Deploy the Cloudflare Worker (~2 minutes)

Copy the reference backend out of the repo so you can edit `wrangler.toml` and `worker.js` without dirtying the working tree:

```bash
# Adjust the source path to wherever your hugo-artifacts checkout lives.
cp -r hugo-artifacts/examples/backend-cloudflare-worker /tmp/my-push-backend
cd /tmp/my-push-backend
```

Install Wrangler (the Cloudflare Workers CLI), then sign in:

```bash
npm install
npx wrangler login
```

The login command opens a browser to authorize Wrangler against your Cloudflare account.

Create a Workers KV namespace to store push subscriptions:

```bash
npx wrangler kv:namespace create PWA_SUBS
```

Wrangler prints a snippet such as `{ binding = "PWA_SUBS", id = "abc123..." }`. Copy the `id` value into `wrangler.toml`, replacing the `REPLACE_WITH_KV_NAMESPACE_ID` placeholder under `[[kv_namespaces]]`.

Provision the four required secrets (interactive prompts; paste each value when asked):

```bash
npx wrangler secret put VAPID_PUBLIC_KEY     # paste the PUBLIC key from Step 1
npx wrangler secret put VAPID_PRIVATE_KEY    # paste the PRIVATE key from Step 1
npx wrangler secret put VAPID_SUBJECT        # e.g., mailto:you@example.com
npx wrangler secret put ADMIN_KEY            # generate a random 32-byte secret, e.g.:
                                             #   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Edit the origin allowlist in `worker.js` (the constant near the top, around line 29) to match your real consumer-site origin. The shipped default is `'https://example.com'` plus `'http://localhost:1313'` for local dev; replace these with your real origin(s) before production. Keep `http://localhost:1313` for now if you intend to test from `hugo server`; remove it before going live.

Deploy:

```bash
npx wrangler deploy
```

Wrangler prints the deployed URL, for example `https://pwa-push-backend.<your-subdomain>.workers.dev`. Save it; you wire it into your Hugo config in the next step.

## Step 3: Wire up your Hugo site (~1 minute)

In your consuming site's `hugo.toml`:

```toml
[params.pwa.push]
enabled = true
vapid_public_key = "<PASTE_PUBLIC_KEY_FROM_STEP_1>"
subscribe_url   = "https://pwa-push-backend.<your-subdomain>.workers.dev/subscribe"
unsubscribe_url = "https://pwa-push-backend.<your-subdomain>.workers.dev/unsubscribe"
```

Hugo build hard-fails if `enabled = true` and either `vapid_public_key` or `subscribe_url` is empty, so a misconfiguration is caught at build time rather than at first user click.

Add the subscribe button somewhere in your layout (a footer partial, header partial, or post template -- anywhere visible to the user):

```html
<button data-pwa-subscribe>Enable Notifications</button>
```

The default selector is `[data-pwa-subscribe]`; the PWA module's `push.ts` wires the click handler at page load and calls `pushManager.subscribe()` after the user grants permission.

## Step 4: Build and serve (~30 seconds)

```bash
hugo server
```

Open <http://localhost:1313> in Chrome, Edge, or Firefox (Safari iOS requires the PWA to be installed first; see [iOS Safari install-before-push flow](../modules/pwa/README.md#ios-safari-install-before-push-flow)). Click the subscribe button and accept the permission prompt. The browser sends `POST /subscribe` to your Worker; the Worker validates the origin, stores the subscription in KV, and returns `201 {"ok":true}`.

## Step 5: Send a test push (~30 seconds)

From a terminal:

```bash
curl -X POST \
  -H "Origin: http://localhost:1313" \
  -H "X-Admin-Key: <PASTE_ADMIN_KEY_FROM_STEP_2>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello from Cloudflare Workers","body":"Push notifications are working!","url":"http://localhost:1313/"}' \
  https://pwa-push-backend.<your-subdomain>.workers.dev/trigger
```

The `Origin` header is required because the Worker validates origin BEFORE the admin-key check; if the request has no `Origin` (or `Referer`) header matching `ALLOWED_ORIGINS`, the Worker returns `403 forbidden`. The `X-Admin-Key` header authenticates the trigger call. The `url` field in the body tells the service worker which page to open when the user clicks the notification.

You should see the notification appear in your browser within a few seconds. The Worker's response is `{"ok":true,"sent":1,"removed":0}` (or `removed:N` if any stored subscriptions are expired and got pruned during the fan-out).

> **Important:** the `ADMIN_KEY` is a server-side credential. Never expose it to client-side code, never paste it into a browser address bar, never include it in any client bundle. Treat it the same way you treat a production database password.

## What just happened?

| Step | What ran |
| --- | --- |
| Subscribe button click | Browser prompted for permission, called `pushManager.subscribe()`, POSTed `{endpoint, keys}` to your Worker's `/subscribe`. |
| Worker `/subscribe` | Validated origin, stored the subscription in the `PWA_SUBS` KV namespace keyed by a hash of the endpoint URL. |
| `/trigger` curl | Worker validated origin, validated `X-Admin-Key`, listed all subscriptions from KV, signed a VAPID JWT per push-service endpoint, AES-128-GCM-encrypted the payload, POSTed to each push service (FCM/APNS/Mozilla). |
| Browser receipt | Service worker received the encrypted push, decrypted it, called `self.registration.showNotification()` with title/body/url. |

## Troubleshooting

- **Subscribe button does nothing:** open browser DevTools -> Application -> Service Workers. If the SW is not registered, the page may be missing the PWA module's head partial; see [modules/pwa Troubleshooting](../modules/pwa/README.md#troubleshooting).
- **Permission prompt does not appear on iOS:** iOS Safari only allows push permission AFTER the PWA is installed to the home screen. See [iOS Safari install-before-push flow](../modules/pwa/README.md#ios-safari-install-before-push-flow).
- **`/subscribe` returns 403 `forbidden`:** the request's `Origin` header is not in the Worker's `ALLOWED_ORIGINS`. Edit `worker.js` and redeploy with `npx wrangler deploy`. Browsers always send `Origin` on fetch POSTs, so this typically means the allowlist needs your real production origin added.
- **`/trigger` returns 403 `forbidden`:** your curl is missing the `-H "Origin: ..."` header, or the value does not match the allowlist. The origin check runs BEFORE the admin-key check.
- **`/trigger` returns 401 `unauthorized`:** your `X-Admin-Key` header does not match the secret you set in Step 2. Re-run `npx wrangler secret put ADMIN_KEY` to overwrite, or re-check the secret value.
- **No notification received after 200 OK:** check the Worker logs with `npx wrangler tail`. Per-endpoint 410 Gone responses indicate expired subscriptions; the Worker prunes them automatically and reports them as `removed` in the trigger response.

## Next steps

- **Other backends:** for a Postgres-backed Node + Express server, see [`backend-express/README.md`](backend-express/README.md). For Firebase Functions + Firestore, see [`backend-firebase-functions/README.md`](backend-firebase-functions/README.md).
- **Full PWA module configuration:** manifest, favicon, service-worker caching, install prompt -- see [`modules/pwa/README.md`](../modules/pwa/README.md).
- **VAPID and CSRF security:** [`modules/pwa/README.md` -> Security](../modules/pwa/README.md#security) covers VAPID-private-key handling, origin validation, GDPR considerations, and the `userVisibleOnly: true` hard-coding rationale.
- **Cleanup / undeploy:** see [`backend-cloudflare-worker/README.md` -> Cleanup / undeploy](backend-cloudflare-worker/README.md#cleanup--undeploy) for the `wrangler delete` + secret-removal sequence.
