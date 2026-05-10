# Firebase Functions v2 + Firestore reference push backend

Reference implementation of the `subscribe_url` / `unsubscribe_url` / trigger contract that the Hugo PWA module's `push.ts` expects. Deploys to Firebase Functions (Cloud Functions for Firebase v2) with Firestore as the subscription store, the Firebase secret manager for VAPID credentials, and the audited [`web-push`](https://www.npmjs.com/package/web-push) npm package for push send.

## Architecture

| Component | Detail |
| --- | --- |
| Runtime | Cloud Functions for Firebase v2 (Node 20) |
| Subscription store | Firestore `subscriptions` collection; deny-all `firestore.rules` for clients |
| VAPID + push | [`web-push`](https://www.npmjs.com/package/web-push) npm package |
| Origin defense | `Origin` / `Referer` allowlist + the `cors` option on `onRequest` |
| Admin auth | `X-Admin-Key` header check against `ADMIN_KEY` secret for `/trigger` |
| Secrets | Firebase secret manager via `defineSecret(...)`; provisioned with `firebase functions:secrets:set` |

## Files

| File | Purpose |
| --- | --- |
| `functions/index.js` | HTTP triggers: `subscribe`, `unsubscribe`, `trigger` |
| `functions/package.json` | Dependencies (`firebase-admin`, `firebase-functions`, `web-push`); Node 20 engine |
| `firebase.json` | Firebase project config (functions deploy, firestore rules path) |
| `firestore.rules` | Deny-all on `subscriptions/`; only Cloud Functions can read/write |

## Endpoint contract

After `firebase deploy`, you get three HTTPS URLs of the form `https://<region>-<project-id>.cloudfunctions.net/<name>`:

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

Response: `201 {"ok": true}` on success. Documents are keyed by SHA-256 of the endpoint URL (Firestore docId constraints: no `/`, 1500 byte limit), so re-subscribing from the same browser overwrites the existing document.

### `POST /unsubscribe`

Request body: `{"endpoint": "..."}`. Response: `200 {"ok": true}`.

### `POST /trigger` (admin only)

Headers: `X-Admin-Key: <ADMIN_KEY>`. Body:

```json
{"title": "...", "body": "...", "url": "https://example.com/blog/post"}
```

Response: `{"ok": true, "sent": <int>, "removed": <int>}`. Stale subscriptions (push service returned 410 or 404) are deleted from the Firestore collection during the fan-out.

## Setup

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 2. Link the project

```bash
firebase use --add
# Pick the Firebase project you want to deploy to.
```

If this is a fresh project, create one first via [https://console.firebase.google.com/](https://console.firebase.google.com/), then link it.

### 3. Install function dependencies

```bash
cd functions
npm install
cd ..
```

### 4. Generate a VAPID keypair

Run on your operator workstation:

```bash
cd functions
npm run vapid
# Or, equivalently:
npx web-push generate-vapid-keys
cd ..
```

The output prints `Public Key` and `Private Key` in base64url. Save them securely; the next step provisions them as Firebase secrets.

### 5. Provision Firebase secrets

```bash
firebase functions:secrets:set VAPID_PUBLIC_KEY
# Paste the base64url public key when prompted.

firebase functions:secrets:set VAPID_PRIVATE_KEY
# Paste the base64url private key when prompted.

firebase functions:secrets:set VAPID_SUBJECT
# Enter "mailto:admin@yourdomain.com" (or an https: URL).

firebase functions:secrets:set ADMIN_KEY
# Generate a strong random string, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The Firebase secret manager encrypts secret values at rest and exposes them to functions only when explicitly bound via `defineSecret(...)` (already wired in `functions/index.js`).

### 6. Update the origin allowlist

Edit `functions/index.js` and replace the `ALLOWED_ORIGINS` array near the top with your real consumer-site origin(s):

```javascript
const ALLOWED_ORIGINS = [
  'https://example.com', // production origin
  'https://staging.example.com', // optional staging
  // 'http://localhost:1313',     // remove for production deployments
];
```

The localhost entry is for the fixture-site / dev-server flow and SHOULD be removed before production.

### 7. Deploy

Deploy the Firestore rules first (so the deny-all rule is enforced before the functions can write data clients should never see):

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
```

Or, in one command:

```bash
firebase deploy
```

The deploy output prints the three function URLs. Copy them; you'll wire them into the Hugo config in the next step.

## Wire the Hugo PWA module to this backend

In your Hugo site's config:

```toml
[params.pwa.push]
enabled = true
vapid_public_key = "<paste your VAPID PUBLIC key here>"
subscribe_url   = "https://<region>-<project-id>.cloudfunctions.net/subscribe"
unsubscribe_url = "https://<region>-<project-id>.cloudfunctions.net/unsubscribe"
```

The PUBLIC key goes here; the PRIVATE key stays in Firebase secrets.

## Triggering a push

From your CMS, an admin shell, or any server-side context that holds the `ADMIN_KEY`:

```bash
curl -X POST \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"New post","body":"Read the latest article","url":"https://example.com/blog/new-post/"}' \
  https://<region>-<project-id>.cloudfunctions.net/trigger
```

NEVER expose `ADMIN_KEY` to client-side code. Treat it as a server-side credential.

## Local emulator (optional)

The Firebase Emulator Suite can run the functions locally:

```bash
firebase emulators:start --only functions,firestore
```

Functions execute against the local Firestore emulator. Note that secrets bound via `defineSecret(...)` won't be populated unless you set them in the local environment:

```bash
export VAPID_PUBLIC_KEY=...
export VAPID_PRIVATE_KEY=...
export VAPID_SUBJECT=mailto:admin@example.com
export ADMIN_KEY=...
firebase emulators:start --only functions,firestore
```

## Periodic stale-row cleanup

The trigger endpoint already deletes 410/404 stale documents on the fly, so no scheduled job is strictly necessary. For long-running deployments, a periodic prune of documents older than your retention window keeps the collection compact. Add a scheduled function (Pub/Sub trigger or Cloud Scheduler) that queries `db.collection('subscriptions').where('updatedAt', '<', cutoff)` and batch-deletes stale documents.

## Security

- **VAPID PRIVATE key:** stored in Firebase secret manager only. NEVER commit. NEVER log. Rotate periodically.
- **Origin validation:** the `ALLOWED_ORIGINS` array in `functions/index.js` is the primary CSRF defense. Keep it tight; remove `http://localhost:1313` before production.
- **Admin endpoint:** `/trigger` is gated by `X-Admin-Key`. Treat the key as a production credential.
- **Firestore rules:** `firestore.rules` denies all client read and write access to the `subscriptions` collection. Cloud Functions bypass these rules via the admin SDK, so only the deployed functions can touch subscription records. Deploy the rules with `firebase deploy --only firestore:rules` whenever you change them.
- **Encryption at rest:** Firestore encrypts data at rest by default. Subscription endpoints are user-identifying data per GDPR; configure Firestore backups and access logs accordingly.
- **HTTPS-only:** the Cloud Functions runtime enforces HTTPS for incoming requests; the Push API requires HTTPS for outgoing requests.

For the broader Hugo PWA security guidance, see [`modules/pwa/README.md` -> Security](../../modules/pwa/README.md#security).

## Cleanup / undeploy

```bash
firebase functions:delete subscribe unsubscribe trigger
```

Delete secrets:

```bash
firebase functions:secrets:destroy VAPID_PUBLIC_KEY
firebase functions:secrets:destroy VAPID_PRIVATE_KEY
firebase functions:secrets:destroy VAPID_SUBJECT
firebase functions:secrets:destroy ADMIN_KEY
```

Drop the Firestore collection via the Firebase console (Firestore Database -> `subscriptions` -> Delete collection).

## See also

- [`modules/pwa/README.md`](../../modules/pwa/README.md) -- the Hugo module that POSTs to this backend's endpoints.
- [`examples/backend-cloudflare-worker/README.md`](../backend-cloudflare-worker/README.md) -- alternate reference using Cloudflare Workers + KV.
- [`examples/backend-express/README.md`](../backend-express/README.md) -- alternate reference using Express + web-push + Postgres.
- [Cloud Functions for Firebase v2](https://firebase.google.com/docs/functions/2nd-gen-upgrade)
- [Firebase secret manager](https://firebase.google.com/docs/functions/config-env?gen=2nd#secret_parameters)
- [Web Push protocol RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID protocol RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)
