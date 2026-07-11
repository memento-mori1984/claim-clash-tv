// Claim Clash site gate — password verification, sessions, brute-force protection.

const PBKDF2_ITERATIONS = 100_000; // Workers Web Crypto max
/** Token validity while the tab is open; cookie is cleared on page close/reload (see index.html). */
const SESSION_MAX_AGE_SEC = 14_400; // 4 hours (safety cap if logout beacon fails)
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SEC = 900; // 15 minutes
const LOCKOUT_SEC = 3600; // 1 hour after max failures

function hexToBytes(hex) {
  const text = String(hex || '').trim();
  if (!text || text.length % 2 !== 0) throw new Error('bad hex');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64) {
  const normalized = String(b64 || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function parseCredentialSecret(raw) {
  const text = String(raw || '').trim();
  const dot = text.indexOf('.');
  if (dot <= 0) return null;
  const saltPart = text.slice(0, dot).trim();
  const hashPart = text.slice(dot + 1).trim();
  if (!saltPart || !hashPart) return null;

  // Preferred: hex.hex (safe for Cloudflare secret storage; no +/= corruption)
  if (/^[0-9a-fA-F]{32}$/.test(saltPart) && /^[0-9a-fA-F]{64}$/.test(hashPart)) {
    try {
      return { salt: hexToBytes(saltPart), expected: hexToBytes(hashPart) };
    } catch {
      return null;
    }
  }

  try {
    return {
      salt: base64ToBytes(saltPart),
      expected: base64ToBytes(hashPart),
    };
  } catch {
    return null;
  }
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToBase64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getSessionCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)cc_site_session=([^;]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

function sessionCookieHeader(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  // No Max-Age: browser session cookie — cleared when the browser closes.
  return `cc_site_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure}`;
}

function clearSessionCookieHeader(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `cc_site_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function sessionKey(sessionId) {
  return `sess:${sessionId}`;
}

function parseSessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const sessionId = parts[0].trim();
  const sig = parts[1].trim();
  if (!sessionId || !sig) return null;
  return { sessionId, sig };
}

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function checkRateLimit(ip, env) {
  if (!env.RATE_LIMIT_KV) {
    return { allowed: true, retryAfterSec: 0, remaining: MAX_ATTEMPTS };
  }

  const key = `rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  let record = { failures: 0, windowStart: now, lockUntil: 0 };

  try {
    const raw = await env.RATE_LIMIT_KV.get(key);
    if (raw) record = { ...record, ...JSON.parse(raw) };
  } catch {
    /* treat as fresh record */
  }

  if (record.lockUntil && record.lockUntil > now) {
    return {
      allowed: false,
      retryAfterSec: record.lockUntil - now,
      remaining: 0,
      locked: true,
    };
  }

  if (now - record.windowStart > ATTEMPT_WINDOW_SEC) {
    record = { failures: 0, windowStart: now, lockUntil: 0 };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.failures);
  return { allowed: remaining > 0, retryAfterSec: 0, remaining, record };
}

export async function recordFailedAttempt(ip, env, priorRecord) {
  if (!env.RATE_LIMIT_KV) return;

  const now = Math.floor(Date.now() / 1000);
  let record = priorRecord || { failures: 0, windowStart: now, lockUntil: 0 };

  if (now - record.windowStart > ATTEMPT_WINDOW_SEC) {
    record = { failures: 0, windowStart: now, lockUntil: 0 };
  }

  record.failures += 1;
  if (record.failures >= MAX_ATTEMPTS) {
    record.lockUntil = now + LOCKOUT_SEC;
  }

  try {
    await env.RATE_LIMIT_KV.put(keyForIp(ip), JSON.stringify(record), {
      expirationTtl: LOCKOUT_SEC + ATTEMPT_WINDOW_SEC,
    });
  } catch {
    /* rate-limit bookkeeping is best-effort */
  }
}

export async function clearRateLimit(ip, env) {
  if (!env.RATE_LIMIT_KV) return;
  try {
    await env.RATE_LIMIT_KV.delete(keyForIp(ip));
  } catch {
    /* best-effort */
  }
}

function keyForIp(ip) {
  return `rl:${ip}`;
}

export async function verifyPassword(password, env) {
  try {
    const cred = parseCredentialSecret(env.DEV_PASSWORD_CREDENTIAL);
    if (!cred) return false;

    const derived = await pbkdf2(String(password || ''), cred.salt);
    return timingSafeEqual(derived, cred.expected);
  } catch {
    return false;
  }
}

export async function createSessionToken(env) {
  try {
    if (!env.SESSION_SECRET) return null;
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + SESSION_MAX_AGE_SEC;
    const sig = await hmacSign(sessionId, env.SESSION_SECRET);

    if (env.RATE_LIMIT_KV) {
      await env.RATE_LIMIT_KV.put(sessionKey(sessionId), JSON.stringify({ exp }), {
        expirationTtl: SESSION_MAX_AGE_SEC + 120,
      });
    }

    return `${sessionId}.${sig}`;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token, env) {
  if (!token || !env.SESSION_SECRET) return false;

  const parsed = parseSessionToken(token);
  if (!parsed) return false;

  const expectedSig = await hmacSign(parsed.sessionId, env.SESSION_SECRET);
  if (parsed.sig !== expectedSig) return false;

  if (!env.RATE_LIMIT_KV) return true;

  try {
    const raw = await env.RATE_LIMIT_KV.get(sessionKey(parsed.sessionId));
    if (!raw) return false;
    const data = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    return Number(data.exp) > now;
  } catch {
    return false;
  }
}

/** Revoke one session in KV only (safe for pagehide logout; does not clear the browser cookie jar). */
export async function revokeSessionToken(token, env) {
  const parsed = parseSessionToken(token);
  if (!parsed || !env.RATE_LIMIT_KV) return;
  try {
    await env.RATE_LIMIT_KV.delete(sessionKey(parsed.sessionId));
  } catch {
    /* best-effort */
  }
}

export function getSessionFromRequest(request) {
  return getSessionCookie(request);
}

export function makeSessionSetCookie(token, request) {
  return sessionCookieHeader(token, request);
}

export function makeSessionClearCookie(request) {
  return clearSessionCookieHeader(request);
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginFailureDelay() {
  const jitter = Math.floor(Math.random() * 400);
  await sleep(600 + jitter);
}