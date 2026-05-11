# examples

Reference implementations that pair with [`modules/pwa`](../modules/pwa/README.md). These are NOT importable Hugo modules; they are runnable backends meant to be deployed to a separate platform (Cloudflare Workers, a Node host, or Firebase) and called by the Hugo PWA module's `push.ts` via the `subscribe_url`, `unsubscribe_url`, and admin-gated trigger endpoint contract.

## Quickstart

For a "from zero to working push notification in 5 minutes" walkthrough, see [`QUICKSTART.md`](QUICKSTART.md). It uses the Cloudflare Workers reference backend (the fastest to deploy) and covers VAPID key generation, secret provisioning, Hugo wiring, and a test trigger.

## Reference push backends

| Platform | Storage | Push send pipeline | Path | README |
| --- | --- | --- | --- | --- |
| Cloudflare Workers | Workers KV | Native `crypto.subtle` (VAPID JWT + AES-128-GCM) | [`backend-cloudflare-worker/`](backend-cloudflare-worker/) | [README](backend-cloudflare-worker/README.md) |
| Node Express + Postgres | Postgres | [`web-push`](https://www.npmjs.com/package/web-push) npm package | [`backend-express/`](backend-express/) | [README](backend-express/README.md) |
| Firebase Functions v2 | Firestore | [`web-push`](https://www.npmjs.com/package/web-push) npm package | [`backend-firebase-functions/`](backend-firebase-functions/) | [README](backend-firebase-functions/README.md) |

Each reference exposes the canonical `/subscribe`, `/unsubscribe`, and admin-gated `/trigger` endpoints, validates request origin against an allowlist, and reads the VAPID private key from a platform-appropriate secret store (`wrangler secret put`, environment variable, or Firebase secret manager).

## Choosing a backend

- **Cloudflare Workers** -- simplest deployment, generous free tier, no language runtime to manage, no third-party push library at runtime. Recommended for most consumers; covered end-to-end in [`QUICKSTART.md`](QUICKSTART.md).
- **Express + Postgres** -- choose when you already operate a Node.js backend or want SQL-flexible subscription analytics. Uses the audited `web-push` npm package; runs anywhere Node runs (containers, Heroku, Render, fly.io, self-hosted).
- **Firebase Functions** -- choose when your stack is already on Firebase. Firestore is convenient for subscription storage with built-in auth integration; the Firebase secret manager handles VAPID credentials cleanly.

## Not finding what you need?

These are starting points, not finished products. Adapt them to your stack: swap the storage backend, add subscriber deduplication, integrate with your auth system, add scheduled cleanup of stale subscriptions, or push to alternate platforms. The load-bearing logic is the VAPID JWT signing + RFC 8291 payload encryption pipeline; the rest is web-app boilerplate appropriate to each platform.
