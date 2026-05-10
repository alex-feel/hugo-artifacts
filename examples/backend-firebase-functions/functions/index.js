// Firebase Functions v2 + Firestore reference push backend for the Hugo PWA module.
//
// Endpoints (deployed as separate HTTPS functions):
//   POST subscribe   -- accepts a PushSubscription JSON ({endpoint, keys: {p256dh, auth}})
//                       and stores it in the `subscriptions` Firestore collection
//   POST unsubscribe -- accepts {endpoint} and deletes the matching document
//   POST trigger     -- internal admin endpoint (gated by X-Admin-Key header) that fans out a
//                       Web Push notification to every stored subscription via the audited
//                       `web-push` npm package
//
// Storage:    Firestore (`subscriptions` collection; access controlled via firestore.rules
//             which denies all client reads/writes; only Functions can touch the collection
//             via the admin SDK which bypasses security rules)
// Push send:  `web-push` npm package
// Secrets:    Firebase secret manager via `defineSecret(...)`. Provision with
//             `firebase functions:secrets:set VAPID_PRIVATE_KEY` etc.
//
// SECURITY:
//   - VAPID PRIVATE key is stored in Firebase secret manager and is NEVER committed to source
//     control or printed in logs. The defineSecret() declarations below bind secrets into the
//     function runtime; their .value() accessor returns the plaintext only at runtime.
//   - The /trigger function MUST be protected by a strong shared secret (ADMIN_KEY).
//   - Origin validation is the primary CSRF defense for /subscribe and /unsubscribe.
//   - firestore.rules denies all client access to the `subscriptions` collection. Admin SDK
//     access from Cloud Functions bypasses these rules, so only the deployed functions can
//     read or modify subscription records.

'use strict';

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const webPush = require('web-push');

admin.initializeApp();
const db = admin.firestore();

// Secret bindings. Provision with `firebase functions:secrets:set <NAME>` before deploy.
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = defineSecret('VAPID_SUBJECT');
const ADMIN_KEY = defineSecret('ADMIN_KEY');

// CONSUMER REPLACES with the real consumer-site origin(s). The localhost entry is for the
// fixture-site / dev-server flow and SHOULD be removed before production deployment.
const ALLOWED_ORIGINS = ['https://example.com', 'http://localhost:1313'];

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

exports.subscribe = onRequest(
  {
    cors: ALLOWED_ORIGINS,
    secrets: [VAPID_PUBLIC_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({error: 'method_not_allowed'});
      return;
    }
    if (!isOriginAllowed(req)) {
      res.status(403).json({error: 'forbidden'});
      return;
    }
    const sub = req.body;
    if (!isValidSubscription(sub)) {
      res.status(400).json({error: 'invalid_subscription'});
      return;
    }
    try {
      const docId = endpointToDocId(sub.endpoint);
      await db.collection('subscriptions').doc(docId).set({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(201).json({ok: true});
    } catch (err) {
      console.error('subscribe_failed', err);
      res.status(500).json({error: 'storage_failure'});
    }
  },
);

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

exports.unsubscribe = onRequest(
  {
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({error: 'method_not_allowed'});
      return;
    }
    if (!isOriginAllowed(req)) {
      res.status(403).json({error: 'forbidden'});
      return;
    }
    const {endpoint} = req.body || {};
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      res.status(400).json({error: 'invalid_request'});
      return;
    }
    try {
      const docId = endpointToDocId(endpoint);
      await db.collection('subscriptions').doc(docId).delete();
      res.json({ok: true});
    } catch (err) {
      console.error('unsubscribe_failed', err);
      res.status(500).json({error: 'storage_failure'});
    }
  },
);

// ---------------------------------------------------------------------------
// Trigger (admin)
// ---------------------------------------------------------------------------

exports.trigger = onRequest(
  {
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, ADMIN_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({error: 'method_not_allowed'});
      return;
    }
    if (req.get('X-Admin-Key') !== ADMIN_KEY.value()) {
      res.status(401).json({error: 'unauthorized'});
      return;
    }

    webPush.setVapidDetails(
      VAPID_SUBJECT.value(),
      VAPID_PUBLIC_KEY.value(),
      VAPID_PRIVATE_KEY.value(),
    );

    const {title, body, url} = req.body || {};
    const payload = JSON.stringify({
      title: typeof title === 'string' ? title : '',
      body: typeof body === 'string' ? body : '',
      url: typeof url === 'string' ? url : '/',
    });

    let snapshot;
    try {
      snapshot = await db.collection('subscriptions').get();
    } catch (err) {
      console.error('trigger_query_failed', err);
      res.status(500).json({error: 'storage_failure'});
      return;
    }

    let sent = 0;
    let removed = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const subscription = {
        endpoint: data.endpoint,
        keys: {p256dh: data.p256dh, auth: data.auth},
      };
      try {
        await webPush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        if (err && (err.statusCode === 410 || err.statusCode === 404)) {
          try {
            await doc.ref.delete();
            removed++;
          } catch (delErr) {
            console.error('cleanup_failed', delErr);
          }
        } else {
          console.error('push_send_failed', err && err.statusCode, err && err.body);
        }
      }
    }
    res.json({ok: true, sent, removed});
  },
);

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

function isOriginAllowed(req) {
  const origin = req.get('Origin') || req.get('Referer') || '';
  if (!origin) return false;
  // Exact match for Origin; prefix match for Referer (which carries a full URL).
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGINS.some((a) => origin.startsWith(`${a}/`) || origin === a);
}

function endpointToDocId(endpoint) {
  // Firestore document IDs cannot contain `/` and have a 1500-byte limit. Hash the endpoint
  // to a stable URL-safe identifier; collision probability is negligible at SHA-1 strength.
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}
