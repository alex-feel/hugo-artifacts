// Express + web-push + Postgres reference push backend for the Hugo PWA module.
//
// Endpoints:
//   POST /subscribe   -- accepts a PushSubscription JSON ({endpoint, keys: {p256dh, auth}})
//                        and upserts it into the `pwa_subscriptions` Postgres table
//   POST /unsubscribe -- accepts {endpoint} and deletes the matching row
//   POST /trigger     -- internal admin endpoint (gated by X-Admin-Key header) that fans out a
//                        Web Push notification to every stored subscription via the audited
//                        `web-push` npm package
//
// Storage:    Postgres (DATABASE_URL env var; schema in migrations/001_subscriptions.sql)
// Push send:  `web-push` npm package (handles VAPID JWT signing + AES-128-GCM payload
//             encryption per RFC 8030 + RFC 8291)
//
// SECURITY:
//   - VAPID PRIVATE key MUST be supplied via env.VAPID_PRIVATE_KEY (process environment) and is
//     NEVER committed to source control. .env files containing real values must be gitignored.
//   - The /trigger endpoint MUST be protected by a strong shared secret (env.ADMIN_KEY).
//   - Origin validation is the primary CSRF defense. The ALLOWED_ORIGINS env var (comma
//     separated) MUST be set to the consumer site's real origin(s). Cross-origin requests
//     from non-allowlisted origins are rejected by the cors middleware below.
//   - Postgres connection SHOULD use TLS in production (`?sslmode=require` in DATABASE_URL).
//   - Push subscription endpoints contain user-identifying data; backups should be encrypted
//     at-rest and access-controlled per GDPR / Right-to-Erasure obligations.

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const webPush = require('web-push');
const {Pool} = require('pg');

const app = express();

// Body size cap deliberately small. Subscription payloads are well under 2 KB; trigger
// payloads only carry a small notification body. Larger requests are rejected.
app.use(bodyParser.json({limit: '8kb'}));

// Origin allowlist. ALLOWED_ORIGINS is a comma-separated env var; empty entries discarded.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin requests (no Origin header) are permitted; Express body parsing has
      // already validated the request shape, and origin validation is mainly a CSRF defense
      // for browser-issued cross-origin requests.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('origin_not_allowed'), false);
    },
    credentials: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Key'],
  }),
);

// VAPID setup: the web-push library handles JWT generation per request.
webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post('/subscribe', async (req, res) => {
  const sub = req.body;
  if (!isValidSubscription(sub)) {
    return res.status(400).json({error: 'invalid_subscription'});
  }
  try {
    await pool.query(
      `INSERT INTO pwa_subscriptions (endpoint, p256dh, auth, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET p256dh    = EXCLUDED.p256dh,
             auth      = EXCLUDED.auth,
             updated_at = NOW()`,
      [sub.endpoint, sub.keys.p256dh, sub.keys.auth],
    );
    return res.status(201).json({ok: true});
  } catch (err) {
    console.error('subscribe_failed', err);
    return res.status(500).json({error: 'storage_failure'});
  }
});

app.post('/unsubscribe', async (req, res) => {
  const {endpoint} = req.body || {};
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return res.status(400).json({error: 'invalid_request'});
  }
  try {
    await pool.query('DELETE FROM pwa_subscriptions WHERE endpoint = $1', [endpoint]);
    return res.json({ok: true});
  } catch (err) {
    console.error('unsubscribe_failed', err);
    return res.status(500).json({error: 'storage_failure'});
  }
});

app.post('/trigger', async (req, res) => {
  if (req.header('X-Admin-Key') !== process.env.ADMIN_KEY) {
    return res.status(401).json({error: 'unauthorized'});
  }
  const {title, body, url} = req.body || {};
  const payload = JSON.stringify({
    title: typeof title === 'string' ? title : '',
    body: typeof body === 'string' ? body : '',
    url: typeof url === 'string' ? url : '/',
  });

  let rows;
  try {
    const result = await pool.query('SELECT endpoint, p256dh, auth FROM pwa_subscriptions');
    rows = result.rows;
  } catch (err) {
    console.error('trigger_query_failed', err);
    return res.status(500).json({error: 'storage_failure'});
  }

  let sent = 0;
  let removed = 0;
  for (const row of rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {p256dh: row.p256dh, auth: row.auth},
    };
    try {
      await webPush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      // 410 Gone / 404 Not Found per RFC 8030 sec 7.3 indicate the subscription
      // is no longer valid. Remove the stale row to keep the table healthy.
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        try {
          await pool.query('DELETE FROM pwa_subscriptions WHERE endpoint = $1', [row.endpoint]);
          removed++;
        } catch (delErr) {
          console.error('cleanup_failed', delErr);
        }
      } else {
        console.error('push_send_failed', err && err.statusCode, err && err.body);
      }
    }
  }
  return res.json({ok: true, sent, removed});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidSubscription(body) {
  return (
    body &&
    typeof body.endpoint === 'string' &&
    body.keys &&
    typeof body.keys.p256dh === 'string' &&
    typeof body.keys.auth === 'string'
  );
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`pwa push backend listening on :${PORT}`);
});
