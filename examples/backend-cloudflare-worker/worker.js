// Cloudflare Workers reference push backend for the Hugo PWA module.
//
// Endpoints (matched on URL path):
//   POST /subscribe   -- accepts a PushSubscription JSON ({endpoint, keys: {p256dh, auth}})
//                        and stores it in the PWA_SUBS KV namespace keyed by a hash of the endpoint
//   POST /unsubscribe -- accepts {endpoint} and deletes the matching KV record
//   POST /trigger     -- internal admin endpoint (gated by X-Admin-Key header) that fans out a
//                        Web Push notification to every stored subscription
//
// Storage:    Workers KV (PWA_SUBS namespace; binding declared in wrangler.toml)
// Push send:  Web Push protocol (RFC 8030 + RFC 8291) using crypto.subtle for VAPID JWT signing
//             and AES-128-GCM payload encryption, performed entirely inside the Worker runtime
//             with no third-party SDK
//
// SECURITY:
//   - VAPID PRIVATE key MUST be supplied via `wrangler secret put VAPID_PRIVATE_KEY` and is
//     accessed only via env.VAPID_PRIVATE_KEY at runtime. NEVER commit it to source control or
//     include it in the deployed bundle.
//   - The /trigger endpoint MUST be protected by a strong shared secret (env.ADMIN_KEY) and the
//     CMS or admin tool that calls it MUST treat that secret as a server-side credential.
//   - Origin validation is the primary CSRF defense for /subscribe and /unsubscribe. The
//     ALLOWED_ORIGINS allowlist below MUST be replaced with the consumer site's real origin(s)
//     before deployment. Cross-origin requests from non-allowlisted origins are rejected with 403.
//   - Push subscription endpoints contain user-identifying data; storage backends should be
//     treated accordingly (encrypted-at-rest in Workers KV is automatic).

// CONSUMER REPLACES with the real consumer site origin(s). The localhost entry is for the
// fixture-site / dev-server flow and SHOULD be removed before production deployment.
const ALLOWED_ORIGINS = new Set(['https://example.com', 'http://localhost:1313']);

const JSON_HEADERS = {'Content-Type': 'application/json'};

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // Preflight short-circuit (CORS) before origin check so browsers can probe.
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request);
    }

    // Origin / Referer allowlist check. Treat both headers as candidates so simple form posts
    // and fetch() requests both reach the right code path.
    if (!isOriginAllowed(request)) {
      return new Response(JSON.stringify({error: 'forbidden'}), {
        status: 403,
        headers: {...JSON_HEADERS, ...corsHeaders(request)},
      });
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return wrapCors(request, await handleSubscribe(request, env));
    }
    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      return wrapCors(request, await handleUnsubscribe(request, env));
    }
    if (url.pathname === '/trigger' && request.method === 'POST') {
      return wrapCors(request, await handleTrigger(request, env));
    }

    return wrapCors(
      request,
      new Response(JSON.stringify({error: 'not_found'}), {
        status: 404,
        headers: JSON_HEADERS,
      }),
    );
  },
};

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    return jsonResponse({error: 'invalid_json'}, 400);
  }
  if (!isValidSubscription(body)) {
    return jsonResponse({error: 'invalid_subscription'}, 400);
  }
  const key = await keyForEndpoint(body.endpoint);
  await env.PWA_SUBS.put(
    key,
    JSON.stringify({
      endpoint: body.endpoint,
      keys: {p256dh: body.keys.p256dh, auth: body.keys.auth},
      createdAt: new Date().toISOString(),
    }),
  );
  return jsonResponse({ok: true}, 201);
}

async function handleUnsubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    return jsonResponse({error: 'invalid_json'}, 400);
  }
  if (!body || typeof body.endpoint !== 'string') {
    return jsonResponse({error: 'invalid_request'}, 400);
  }
  const key = await keyForEndpoint(body.endpoint);
  await env.PWA_SUBS.delete(key);
  return jsonResponse({ok: true});
}

async function handleTrigger(request, env) {
  if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) {
    return jsonResponse({error: 'unauthorized'}, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    return jsonResponse({error: 'invalid_json'}, 400);
  }
  const payload = JSON.stringify({
    title: typeof body.title === 'string' ? body.title : '',
    body: typeof body.body === 'string' ? body.body : '',
    url: typeof body.url === 'string' ? body.url : '/',
  });

  const list = await env.PWA_SUBS.list();
  let sent = 0;
  let removed = 0;
  for (const item of list.keys) {
    const raw = await env.PWA_SUBS.get(item.name);
    if (!raw) continue;
    let sub;
    try {
      sub = JSON.parse(raw);
    } catch (_err) {
      continue;
    }
    try {
      await sendWebPush(sub, payload, env);
      sent++;
    } catch (err) {
      // 410 Gone = subscription expired/unregistered; remove it from the store.
      // 404 Not Found is treated the same way per RFC 8030 sec 7.3.
      if (err && (err.status === 410 || err.status === 404)) {
        await env.PWA_SUBS.delete(item.name);
        removed++;
      }
    }
  }
  return jsonResponse({ok: true, sent, removed});
}

// ---------------------------------------------------------------------------
// Web Push protocol (RFC 8030) implemented natively via crypto.subtle.
// Encrypts the payload with aes128gcm (RFC 8291) and signs the VAPID JWT with ES256.
// ---------------------------------------------------------------------------

async function sendWebPush(subscription, payload, env) {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const vapidJwt = await buildVapidJwt(
    audience,
    env.VAPID_SUBJECT,
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY,
  );

  const encrypted = await encryptPayload(
    new TextEncoder().encode(payload),
    base64UrlDecode(subscription.keys.p256dh),
    base64UrlDecode(subscription.keys.auth),
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Authorization: `vapid t=${vapidJwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body: encrypted,
  });
  if (!response.ok) {
    const err = new Error(`push_send_failed_${response.status}`);
    err.status = response.status;
    throw err;
  }
}

async function buildVapidJwt(audience, subject, privateKeyB64Url, publicKeyB64Url) {
  const header = {typ: 'JWT', alg: 'ES256'};
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const privateKey = await importVapidPrivateKey(privateKeyB64Url, publicKeyB64Url);
  const signature = await crypto.subtle.sign(
    {name: 'ECDSA', hash: 'SHA-256'},
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

// Imports the VAPID identity keypair as an ECDSA-P-256 signing key.
//
// Inputs:
//   privateKeyB64Url -- the raw 32-byte P-256 private scalar (`d`), base64url-encoded.
//                       This is the canonical output of `npx web-push generate-vapid-keys`.
//   publicKeyB64Url  -- the uncompressed P-256 public point (65 bytes: 0x04 || x || y),
//                       base64url-encoded. Same format the user-agent receives in the
//                       `Authorization: vapid k=<...>` header.
//
// Web Crypto on Workers does not expose a way to derive the public point from `d` alone, so
// the caller must pass both halves. The operator already has both -- VAPID_PUBLIC_KEY is a
// non-secret that ships to the page, and VAPID_PRIVATE_KEY is the secret-managed scalar.
async function importVapidPrivateKey(privateKeyB64Url, publicKeyB64Url) {
  const d = base64UrlDecode(privateKeyB64Url);
  const pub = base64UrlDecode(publicKeyB64Url);
  if (d.length !== 32) {
    throw new Error('vapid_private_key_invalid_length');
  }
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('vapid_public_key_invalid_format');
  }
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(d),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
}

// Encrypts `plaintext` for delivery to a Web Push endpoint per RFC 8291 (Web Push Encryption,
// "aes128gcm" content-encoding). Returns the complete RFC 8188 §2.1 record:
//
//   salt (16) || rs (4 BE) || idlen (1) || keyid (idlen) || ciphertext
//
// where keyid is the ephemeral server P-256 public key (65-byte uncompressed point) that the
// user-agent uses together with its own private key to re-derive the shared secret.
//
// The single-record packing is sufficient for the typical notification payload (title + body
// + click URL JSON, well under the 4 KiB record size). For larger payloads, RFC 8188 supports
// multi-record bodies; this reference stops at one record because the Web Push protocol
// (RFC 8030) caps the entire message at 4 KiB end-to-end.
async function encryptPayload(plaintext, p256dhRaw, authSecret) {
  if (!(p256dhRaw instanceof Uint8Array) || p256dhRaw.length !== 65 || p256dhRaw[0] !== 0x04) {
    throw new Error('p256dh_invalid_format');
  }
  if (!(authSecret instanceof Uint8Array) || authSecret.length !== 16) {
    throw new Error('auth_secret_invalid_length');
  }

  // 1. Generate an ephemeral P-256 keypair for this push (one-shot).
  const serverKeyPair = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, [
    'deriveBits',
  ]);
  const serverPubJwk = await crypto.subtle.exportKey('jwk', serverKeyPair.publicKey);
  const serverX = base64UrlDecode(serverPubJwk.x);
  const serverY = base64UrlDecode(serverPubJwk.y);
  const serverPubRaw = new Uint8Array(65);
  serverPubRaw[0] = 0x04;
  serverPubRaw.set(serverX, 1);
  serverPubRaw.set(serverY, 33);

  // 2. Import the user-agent public key (`p256dh`) so we can run ECDH against it.
  const uaPubKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(p256dhRaw.slice(1, 33)),
      y: base64UrlEncode(p256dhRaw.slice(33, 65)),
      ext: true,
    },
    {name: 'ECDH', namedCurve: 'P-256'},
    true,
    [],
  );

  // 3. ECDH(serverPriv, uaPub) -> 32-byte shared secret.
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({name: 'ECDH', public: uaPubKey}, serverKeyPair.privateKey, 256),
  );

  // 4. Random 16-byte salt -- per-message, never reused.
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5. HKDF stage 1 (RFC 8291 §3.4 step 4):
  //      PRK_key = HKDF(secret = authSecret, ikm = ecdhSecret,
  //                     info = "WebPush: info\0" || ua_public || server_public,
  //                     length = 32)
  const keyInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), p256dhRaw, serverPubRaw);
  const ikm = await hkdfExtractAndExpand(authSecret, ecdhSecret, keyInfo, 32);

  // 6. HKDF stage 2: derive content-encryption key and AEAD nonce (RFC 8188 §2.2).
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdfExtractAndExpand(salt, ikm, cekInfo, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdfExtractAndExpand(salt, ikm, nonceInfo, 12);

  // 7. Build the plaintext record: payload || padding-delimiter (0x02) for the LAST record.
  //    Per RFC 8188 §2.1, the trailing byte is 0x02 for the final record and 0x01 otherwise.
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0);
  padded[plaintext.length] = 0x02;

  // 8. AES-128-GCM encrypt (16-byte tag is appended automatically).
  const aesKey = await crypto.subtle.importKey('raw', cek, {name: 'AES-GCM'}, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, aesKey, padded),
  );

  // 9. Assemble the RFC 8188 §2.1 record:
  //    16 bytes salt || 4 bytes BE record-size || 1 byte keyid-length || keyid || ciphertext.
  const recordSize = 4096;
  const keyid = serverPubRaw;
  const header = new Uint8Array(16 + 4 + 1 + keyid.length);
  header.set(salt, 0);
  header[16] = (recordSize >>> 24) & 0xff;
  header[17] = (recordSize >>> 16) & 0xff;
  header[18] = (recordSize >>> 8) & 0xff;
  header[19] = recordSize & 0xff;
  header[20] = keyid.length;
  header.set(keyid, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);
  return body;
}

// HKDF (RFC 5869) with HMAC-SHA-256: extract-then-expand in a single helper.
// Web Crypto's HKDF takes the IKM as the key material and `salt` + `info` as parameters,
// which is the canonical RFC 5869 shape.
async function hkdfExtractAndExpand(salt, ikm, info, lengthBytes) {
  const key = await crypto.subtle.importKey('raw', ikm, {name: 'HKDF'}, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {name: 'HKDF', salt, info, hash: 'SHA-256'},
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

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

async function keyForEndpoint(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function isOriginAllowed(request) {
  const origin = request.headers.get('Origin') || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;
  const referer = request.headers.get('Referer') || '';
  if (!referer) return false;
  try {
    const refUrl = new URL(referer);
    const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
    return ALLOWED_ORIGINS.has(refOrigin);
  } catch (_err) {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    Vary: 'Origin',
  };
}

function corsPreflightResponse(request) {
  return new Response(null, {status: 204, headers: corsHeaders(request)});
}

function wrapCors(request, response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {status, headers: JSON_HEADERS});
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
