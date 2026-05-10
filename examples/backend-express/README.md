# Express + web-push + Postgres reference push backend

Reference implementation of the `subscribe_url` / `unsubscribe_url` / trigger contract that the Hugo PWA module's `push.ts` expects. Runs on any Node-capable host (containers, Heroku, Render, fly.io, AWS App Runner, self-hosted), uses the audited [`web-push`](https://www.npmjs.com/package/web-push) npm package for VAPID JWT signing and AES-128-GCM payload encryption, and persists subscriptions in Postgres.

## Architecture

| Component | Detail |
| --- | --- |
| Runtime | Node 18+ (any platform) |
| Subscription store | Postgres `pwa_subscriptions` table (endpoint TEXT PRIMARY KEY, p256dh, auth, timestamps) |
| VAPID + push | [`web-push`](https://www.npmjs.com/package/web-push) npm package (full RFC 8030 + RFC 8291) |
| Origin defense | `cors` middleware with allowlist callback; rejects non-allowlisted Origins |
| Admin auth | `X-Admin-Key` header check against `process.env.ADMIN_KEY` for `/trigger` |
| Secrets | Standard environment variables (loaded from `.env` in dev via `dotenv`) |

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Express app with `/subscribe`, `/unsubscribe`, `/trigger` handlers |
| `package.json` | Dependencies (`express`, `web-push`, `pg`, `body-parser`, `cors`, `dotenv`) |
| `migrations/001_subscriptions.sql` | Postgres schema for the `pwa_subscriptions` table |
| `.env.example` | Environment variable template (copy to `.env`; NEVER commit real values) |

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

Response: `201 {"ok": true}` on success. Upserts on conflict by `endpoint` (primary key), so re-subscribing from the same browser updates the row instead of erroring.

### `POST /unsubscribe`

Request body: `{"endpoint": "..."}`. Response: `200 {"ok": true}`.

### `POST /trigger` (admin only)

Headers: `X-Admin-Key: <ADMIN_KEY>`. Body:

```json
{"title": "...", "body": "...", "url": "https://example.com/blog/post"}
```

Response: `{"ok": true, "sent": <int>, "removed": <int>}`. Stale subscriptions (push service returned 410 or 404) are deleted from the table during the fan-out.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Generate a VAPID keypair

Run on your operator workstation:

```bash
npm run vapid
# Or, equivalently:
npx web-push generate-vapid-keys
```

The output prints `Public Key` and `Private Key` in base64url. The PUBLIC key goes in your Hugo config; the PRIVATE key goes in this backend's environment only.

### 3. Configure environment variables

Copy the template and fill it in:

```bash
cp .env.example .env
# Edit .env with real values; see field-by-field guidance below.
```

| Env var | Purpose |
| --- | --- |
| `DATABASE_URL` | Full Postgres connection string. Use `?sslmode=require` for production. |
| `VAPID_SUBJECT` | Contact URI: `mailto:admin@example.com` or an `https:` URL. Used by push services for issues. |
| `VAPID_PUBLIC_KEY` | The PUBLIC key from step 2 (base64url). |
| `VAPID_PRIVATE_KEY` | The PRIVATE key from step 2 (base64url). NEVER commit. NEVER log. |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed consumer origins (e.g., `https://example.com`). |
| `ADMIN_KEY` | Strong random secret for `/trigger`. Generate via `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `PORT` | HTTP listen port. Defaults to `3000`. |

> **Important:** add `.env` to your project's `.gitignore` so the filled-in version is never committed. Many platform deployment workflows prefer per-environment env-var injection (Render dashboard, Heroku config vars, fly.io secrets) over `.env` files; choose whichever fits your platform.

### 4. Apply the database migration

```bash
psql "$DATABASE_URL" -f migrations/001_subscriptions.sql
```

The migration is idempotent (`IF NOT EXISTS`), so re-running on a provisioned database is safe.

### 5. Start the server

```bash
npm start
```

The server prints `pwa push backend listening on :3000` (or whatever `PORT` is set to). For a quick smoke test:

```bash
curl http://localhost:3000/subscribe \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:1313" \
  -d '{"endpoint":"https://example.com/test","keys":{"p256dh":"x","auth":"y"}}'
```

## Deployment

The server is a plain Node process, so any host will work. Common patterns:

### Heroku / Render / Railway / fly.io

Push the directory to the platform; set the env vars from step 3 in the platform's dashboard. Most platforms detect `npm start` automatically from `package.json`. Make sure `DATABASE_URL` points at a managed Postgres instance (e.g., Heroku Postgres, Render Postgres, Neon, Supabase).

### Containers

Add a minimal `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY migrations/ ./migrations/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Deploy to AWS App Runner, Google Cloud Run, Fly Machines, or any container host. Set env vars at deploy time.

### Self-hosted (systemd)

A minimal unit file:

```ini
[Unit]
Description=PWA push backend
After=network.target

[Service]
Type=simple
User=pwa
WorkingDirectory=/opt/pwa-push-backend
EnvironmentFile=/etc/pwa-push-backend.env
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Place the env vars in `/etc/pwa-push-backend.env` with `chmod 0600 root:pwa` so only the service user can read them.

## Wire the Hugo PWA module to this backend

In your Hugo site's config:

```toml
[params.pwa.push]
enabled = true
vapid_public_key = "<paste your VAPID PUBLIC key here>"
subscribe_url   = "https://your-backend.example.com/subscribe"
unsubscribe_url = "https://your-backend.example.com/unsubscribe"
```

Make sure `https://your-site.example.com` (the consumer site origin) appears in this backend's `ALLOWED_ORIGINS` env var.

## Triggering a push

From your CMS, an admin shell, or any server-side context that holds the `ADMIN_KEY`:

```bash
curl -X POST \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"New post","body":"Read the latest article","url":"https://example.com/blog/new-post/"}' \
  https://your-backend.example.com/trigger
```

NEVER expose `ADMIN_KEY` to client-side code. Treat it as a server-side credential.

## Periodic stale-row cleanup

The trigger endpoint already deletes 410/404 stale rows on the fly, so no scheduled job is strictly necessary. For long-running deployments, a periodic prune of rows older than your retention window keeps the table compact:

```sql
DELETE FROM pwa_subscriptions WHERE updated_at < NOW() - INTERVAL '180 days';
```

The `pwa_subscriptions_updated_at_idx` index makes this efficient.

## Security

- **VAPID PRIVATE key:** in `process.env.VAPID_PRIVATE_KEY` only. NEVER commit. NEVER log. Rotate periodically.
- **Origin validation:** the `cors` middleware rejects non-allowlisted Origins. Keep `ALLOWED_ORIGINS` tight; remove `http://localhost:1313` before production.
- **Admin endpoint:** `/trigger` is gated by `X-Admin-Key`. Treat the key as a production credential.
- **TLS to Postgres:** use `?sslmode=require` in production. Most managed Postgres providers enforce this; self-hosted operators must configure `pg_hba.conf` and certificates.
- **Encryption at rest:** managed Postgres providers (Heroku, RDS, Cloud SQL) provide encryption-at-rest automatically. Self-hosted operators must configure dm-crypt / LUKS or filesystem encryption.
- **GDPR / right-to-erasure:** the `unsubscribe` endpoint deletes the matching row. For broader compliance, document your retention window and provide an admin path to delete-by-endpoint on user request.

For the broader Hugo PWA security guidance, see [`modules/pwa/README.md` -> Security](../../modules/pwa/README.md#security).

## Cleanup / undeploy

Stop the server, drop the table:

```sql
DROP TABLE IF EXISTS pwa_subscriptions;
```

Remove the env vars from your deployment platform.

## See also

- [`modules/pwa/README.md`](../../modules/pwa/README.md) -- the Hugo module that POSTs to this backend's endpoints.
- [`examples/backend-cloudflare-worker/README.md`](../backend-cloudflare-worker/README.md) -- alternate reference using Cloudflare Workers + KV.
- [`examples/backend-firebase-functions/README.md`](../backend-firebase-functions/README.md) -- alternate reference using Firebase Functions and Firestore.
- [`web-push` npm package](https://www.npmjs.com/package/web-push)
- [Web Push protocol RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID protocol RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)
