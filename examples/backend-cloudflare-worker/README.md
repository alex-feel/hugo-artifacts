# Cloudflare Workers + KV reference push backend

Reference implementation of the `subscribe_url` / `unsubscribe_url` / trigger contract that the Hugo PWA module's `push.ts` expects. Deploys to Cloudflare Workers with a Workers KV namespace as the subscription store and the platform-native `crypto.subtle` API for VAPID JWT signing.

## Architecture

| Component | Detail |
| --- | --- |
| Runtime | Cloudflare Workers (V8 isolate; serverless edge) |
| Subscription store | Workers KV namespace `PWA_SUBS`, keyed by SHA-256 hash of the endpoint URL |
| VAPID signing | Native `crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, ...)` for ES256 JWT |
| Origin defense | `Origin` / `Referer` allowlist hard-coded in `worker.js` (`ALLOWED_ORIGINS` array) |
| Admin auth | `X-Admin-Key` header check against `env.ADMIN_KEY` for the `/trigger` endpoint |
| Secrets | `wrangler secret put` (NOT `wrangler.toml`); accessed via `env.<NAME>` at runtime |

## Files

| File | Purpose |
| --- | --- |
| `worker.js` | Single-entry default export with `/subscribe`, `/unsubscribe`, `/trigger` handlers |
| `wrangler.toml` | KV namespace binding + setup instructions; secrets are NOT declared here |
| `package.json` | Dev dependency on `wrangler`; helper script for `web-push generate-vapid-keys` |

## Endpoint contract

### `POST /subscribe`

Request body (canonical `PushSubscription.toJSON()` shape):

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNX...base64url...",
    "auth": "abc...base64url..."
  }
}
```

Response: `201 {"ok": true}` on success.

### `POST /unsubscribe`

Request body: `{"endpoint": "..."}`. Response: `200 {"ok": true}`.

### `POST /trigger` (admin only)

Headers: `X-Admin-Key: <ADMIN_KEY>`. Body:

```json
{"title": "...", "body": "...", "url": "https://example.com/blog/post"}
```

Response: `{"ok": true, "sent": <int>, "removed": <int>}`. Stale subscriptions (push service returned 410 or 404) are deleted from KV during the fan-out.

## Setup

### 1. Install Wrangler

```bash
npm install
# Or, if you prefer global installation:
npm install -g wrangler@^3
```

### 2. Generate a VAPID keypair

Run on your operator workstation:

```bash
npm run vapid
# Or, equivalently:
npx web-push generate-vapid-keys
```

The output prints `Public Key` and `Private Key` in base64url. Save them securely; the next step provisions them as Cloudflare secrets.

> **Important:** do NOT commit either key. The PUBLIC key goes into your Hugo config; the PRIVATE key goes into Cloudflare's secret store only.

### 3. Provision Cloudflare secrets

```bash
wrangler secret put VAPID_PUBLIC_KEY
# Paste the base64url public key when prompted.

wrangler secret put VAPID_PRIVATE_KEY
# Paste the base64url private key when prompted.

wrangler secret put VAPID_SUBJECT
# Enter "mailto:admin@yourdomain.com" (or an https: URL).

wrangler secret put ADMIN_KEY
# Generate a strong random string, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> See [VAPID key provisioning notes](#vapid-key-provisioning-notes) below for the Cloudflare-specific JWK format requirement.

### 4. Create the Workers KV namespace

```bash
wrangler kv:namespace create PWA_SUBS
```

The command prints something like:

```text
{ binding = "PWA_SUBS", id = "abc123def456..." }
```

Copy the `id` value into `wrangler.toml` -- replace the `REPLACE_WITH_KV_NAMESPACE_ID` placeholder under `[[kv_namespaces]]`.

For local `wrangler dev`, optionally also create a preview namespace:

```bash
wrangler kv:namespace create PWA_SUBS --preview
```

Then uncomment and fill in the `preview_id` line in `wrangler.toml`.

### 5. Update the origin allowlist

Edit `worker.js` and replace the `ALLOWED_ORIGINS` constant near the top with your real consumer-site origin(s):

```javascript
const ALLOWED_ORIGINS = new Set([
  'https://example.com', // production origin
  'https://staging.example.com', // optional staging
  // 'http://localhost:1313',     // remove for production deployments
]);
```

The localhost entry is for the fixture-site / dev-server flow and SHOULD be removed before production.

### 6. Deploy

```bash
npx wrangler deploy
# or:
npm run deploy
```

Wrangler prints the deployed URL, e.g. `https://pwa-push-backend.<account>.workers.dev`.

## Wire the Hugo PWA module to this backend

In your Hugo site's config:

```toml
[params.pwa.push]
enabled = true
vapid_public_key = "<paste your VAPID PUBLIC key here>"
subscribe_url   = "https://pwa-push-backend.<account>.workers.dev/subscribe"
unsubscribe_url = "https://pwa-push-backend.<account>.workers.dev/unsubscribe"
```

The PUBLIC key goes here; the PRIVATE key stays in Cloudflare secrets.

## Triggering a push

From your CMS, an admin shell, or any server-side context that holds the `ADMIN_KEY`:

```bash
curl -X POST \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"New post","body":"Read the latest article","url":"https://example.com/blog/new-post/"}' \
  https://pwa-push-backend.<account>.workers.dev/trigger
```

The trigger endpoint fans out a push notification to every stored subscription, deletes 410/404 stale endpoints, and returns a JSON summary `{"ok": true, "sent": N, "removed": M}`.

NEVER expose the `ADMIN_KEY` to client-side code or place it in any client bundle. Treat it as a server-side credential.

## VAPID key provisioning notes

`worker.js` ships a complete, in-Worker Web Push send pipeline. The `importVapidPrivateKey(privateKeyB64Url, publicKeyB64Url)` function accepts the raw 32-byte P-256 private scalar (`d`) -- the canonical output of `npx web-push generate-vapid-keys` -- AND the matching 65-byte uncompressed P-256 public point (`0x04 || x || y`, the same format the user-agent receives in the `Authorization: vapid k=<...>` header). It constructs a JWK at runtime (`{kty: "EC", crv: "P-256", x, y, d, ext: true}`) and imports it as an ECDSA P-256 signing key via `crypto.subtle.importKey('jwk', ..., {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign'])`. Web Crypto on Workers does not expose a way to derive the public point from `d` alone, so the operator MUST provide both halves -- and already has both, since `VAPID_PUBLIC_KEY` is the non-secret value that ships to the page and `VAPID_PRIVATE_KEY` is the secret-managed scalar.

The `encryptPayload()` function implements the full RFC 8291 (Web Push Message Encryption with `aes128gcm`) pipeline natively in the Worker runtime: (1) generate a per-message ephemeral P-256 keypair via `crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, ...)`; (2) import the user-agent's `p256dh` public key; (3) compute the ECDH shared secret via `crypto.subtle.deriveBits({name: 'ECDH', public: uaPubKey}, ...)`; (4) generate a fresh 16-byte random salt per message; (5) HKDF stage 1 (RFC 5869) derives the input keying material with `info = "WebPush: info\0" || ua_public || server_public`; (6) HKDF stage 2 derives the AES-128-GCM content-encryption key (`info = "Content-Encoding: aes128gcm\0"`) and AEAD nonce (`info = "Content-Encoding: nonce\0"`); (7) AES-128-GCM encrypts the payload appended with the RFC 8188 §2.1 last-record padding delimiter (`0x02`); (8) the body is assembled as the canonical RFC 8188 §2.1 record (16-byte salt || 4-byte big-endian record-size || 1-byte keyid-length || 65-byte server ephemeral public key || ciphertext+GCM tag).

VAPID JWT signing is performed by `buildVapidJwt(audience, subject, privateKeyB64Url, publicKeyB64Url)` per RFC 8292: ES256 header + claims (`aud`, `exp = now + 12 h`, `sub`), signed via `crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, ...)` using the imported VAPID identity key. The signed JWT is sent as `Authorization: vapid t=<jwt>, k=<VAPID_PUBLIC_KEY>` alongside the encrypted body to the user-agent's push endpoint.

The pipeline is dependency-free at runtime: no `web-push` npm package, no third-party JWT or HKDF library. The only inputs the operator provides are the four secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ADMIN_KEY`) provisioned in step 3 of the Setup section.

## Security

- **VAPID PRIVATE key:** stored in Cloudflare's secret manager only. NEVER commit it to source control or include it in the deployed bundle. Rotate periodically.
- **Origin validation:** the `ALLOWED_ORIGINS` set in `worker.js` is the primary CSRF defense. Keep it tight; remove `localhost` entries before production deployment.
- **Admin endpoint:** `/trigger` is gated by `X-Admin-Key`. Treat the key as a production credential.
- **Encryption at rest:** Workers KV provides encryption-at-rest automatically. Subscription endpoints are user-identifying data per GDPR; treat backups and access logs accordingly.
- **HTTPS-only:** the Workers runtime enforces HTTPS for incoming requests; the Push API requires HTTPS for outgoing requests. There is no HTTP path.

For the broader Hugo PWA security guidance (VAPID handling, CSRF, GDPR), see [`modules/pwa/README.md` -> Security](../../modules/pwa/README.md#security).

## Cleanup / undeploy

```bash
wrangler delete pwa-push-backend
wrangler kv:namespace delete --binding PWA_SUBS
```

Delete the Cloudflare secrets via the Cloudflare dashboard (Workers -> your worker -> Settings -> Variables) or:

```bash
wrangler secret delete VAPID_PUBLIC_KEY
wrangler secret delete VAPID_PRIVATE_KEY
wrangler secret delete VAPID_SUBJECT
wrangler secret delete ADMIN_KEY
```

## See also

- [`modules/pwa/README.md`](../../modules/pwa/README.md) -- the Hugo module that POSTs to this backend's endpoints.
- [`examples/backend-express/README.md`](../backend-express/README.md) -- alternate reference using the audited `web-push` npm package and Postgres.
- [`examples/backend-firebase-functions/README.md`](../backend-firebase-functions/README.md) -- alternate reference using Firebase Functions and Firestore.
- [Web Push protocol RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID protocol RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
