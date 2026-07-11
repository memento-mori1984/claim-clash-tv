// Claim Clash site gate — claim-clash.com (primary) + claims-clash.com (legacy alias)
// Password-protected preview with brute-force protection and signed sessions.

const PRIMARY_DOMAIN = 'claim-clash.com';
const WWW_REDIRECT_HOSTS = new Set([
  'www.claim-clash.com',
  'www.claims-clash.com',
]);

import {
  checkRateLimit,
  clearRateLimit,
  clientIp,
  createSessionToken,
  getSessionFromRequest,
  loginFailureDelay,
  makeSessionClearCookie,
  makeSessionSetCookie,
  recordFailedAttempt,
  revokeSessionToken,
  verifyPassword,
  verifySessionToken,
} from './auth.js';
import { handleAiProxy } from './ai-proxy-handler.js';
import { loginPageHtml } from './login-page.js';
import {
  BETA_AGREEMENT_VERSION,
  hasAcceptedBetaAgreement,
  makeBetaAgreementClearCookie,
  makeBetaAgreementSetCookie,
} from './beta-agreement.js';

function securityHeaders(extra = {}) {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "font-src 'self' https://cdnjs.cloudflare.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
    ...extra,
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

async function isAuthenticated(request, env) {
  const token = getSessionFromRequest(request);
  return verifySessionToken(token, env);
}

function isFormLogin(request) {
  const ct = request.headers.get('Content-Type') || '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

function normalizeLoginPassword(raw) {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/** Read login fields once — request body can only be consumed a single time. */
async function parseLoginPayload(request) {
  if (isFormLogin(request)) {
    const form = await request.formData();
    return {
      password: normalizeLoginPassword(form.get('password')),
      agreed: String(form.get('agreed') || '').trim() === '1',
    };
  }
  try {
    const body = await request.json();
    return {
      password: normalizeLoginPassword(body.password),
      agreed: !!body.agreed,
    };
  } catch {
    return { password: '', agreed: false };
  }
}

function loginHtmlResponse(message = '', status = 200, request = null) {
  return new Response(loginPageHtml({ errorMessage: message }), {
    status,
    headers: securityHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }),
  });
}

function loginSuccessRedirect(request, sessionCookie, includeBetaAgreement) {
  const headers = new Headers(securityHeaders());
  headers.set('Location', '/');
  headers.append('Set-Cookie', sessionCookie);
  if (includeBetaAgreement) {
    headers.append('Set-Cookie', makeBetaAgreementSetCookie(request));
  }
  return new Response(null, { status: 302, headers });
}

async function handleBetaAgreement(request) {
  const formLogin = isFormLogin(request);
  let agreed = false;
  if (formLogin) {
    const form = await request.formData();
    agreed = String(form.get('agreed') || '').trim() === '1';
  } else {
    try {
      const body = await request.json();
      agreed = !!body.agreed;
    } catch {
      agreed = false;
    }
  }

  if (!agreed) {
    const msg = 'You must read the full beta tester agreement and check the box to continue.';
    if (formLogin) return loginHtmlResponse(msg, 400, request);
    return json({ error: msg }, 400);
  }

  const setCookie = makeBetaAgreementSetCookie(request);
  if (formLogin) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': setCookie,
        ...securityHeaders(),
      },
    });
  }

  return json({ ok: true, version: BETA_AGREEMENT_VERSION }, 200, { 'Set-Cookie': setCookie });
}

async function handleLogin(request, env) {
  const ip = clientIp(request);
  const formLogin = isFormLogin(request);
  const { password, agreed: agreedNow } = await parseLoginPayload(request);

  if (!agreedNow) {
    const msg = 'Check the beta tester agreement box before entering your password.';
    if (formLogin) return loginHtmlResponse(msg, 403, request);
    return json({ error: msg }, 403);
  }

  const limit = await checkRateLimit(ip, env);
  if (!limit.allowed) {
    const mins = Math.max(1, Math.ceil((limit.retryAfterSec || 60) / 60));
    const msg = limit.locked
      ? `Too many failed logins. This device is paused for about ${mins} minute(s). Wait, then try again with the exact site password (case-sensitive, no spaces).`
      : `Too many attempts. Try again in ${limit.retryAfterSec || 60} seconds.`;
    if (formLogin) return loginHtmlResponse(msg, 429, request);
    return json(
      { error: 'Too many attempts. Try again later.', retryAfterSec: limit.retryAfterSec },
      429,
      { 'Retry-After': String(limit.retryAfterSec || 60) }
    );
  }

  if (password.length < 8 || password.length > 256) {
    await loginFailureDelay();
    await recordFailedAttempt(ip, env, limit.record);
    if (formLogin) return loginHtmlResponse('Password must be 8–256 characters.', 401, request);
    return json({ error: 'Password must be 8–256 characters.' }, 401);
  }

  const ok = await verifyPassword(password, env);
  if (!ok) {
    await loginFailureDelay();
    await recordFailedAttempt(ip, env, limit.record);
    const failMsg = 'Invalid password. It is case-sensitive with no spaces — type carefully or paste from the message you received.';
    if (formLogin) return loginHtmlResponse(failMsg, 401, request);
    return json({ error: failMsg }, 401);
  }

  await clearRateLimit(ip, env);
  const token = await createSessionToken(env);
  if (!token) {
    if (formLogin) return loginHtmlResponse('Server configuration error. Try again later.', 500, request);
    return json({ error: 'Server configuration error.' }, 500);
  }

  const setCookie = makeSessionSetCookie(token, request);
  const setBetaCookie = !hasAcceptedBetaAgreement(request) && agreedNow;
  if (formLogin) {
    return loginSuccessRedirect(request, setCookie, setBetaCookie);
  }

  return json({ ok: true }, 200, { 'Set-Cookie': setCookie });
}

async function handleLogout(request, env) {
  const token = getSessionFromRequest(request);
  await revokeSessionToken(token, env);
  const headers = {
    'Set-Cookie': makeSessionClearCookie(request),
  };
  return json({ ok: true }, 200, headers);
}

function loginResponse(request) {
  return loginHtmlResponse('', 200, request);
}

function unauthorizedResponse(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    return Response.redirect(new URL('/', request.url), 302);
  }
  return new Response('Unauthorized', {
    status: 401,
    headers: securityHeaders(),
  });
}

function primaryHostRedirect(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (!WWW_REDIRECT_HOSTS.has(host)) return null;
  url.hostname = PRIMARY_DOMAIN;
  url.protocol = 'https:';
  return Response.redirect(url.toString(), 301);
}

function assetResponseWithSecurity(assetResponse, pathname = '', extraHeaders = {}) {
  const headers = new Headers(assetResponse.headers);
  for (const [key, value] of Object.entries(securityHeaders(extraHeaders))) {
    headers.set(key, value);
  }
  if (pathname === '/' || pathname === '/index.html' || pathname.endsWith('.html')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

/** Serve static files; map / to index.html when the assets binding has no directory index. */
async function fetchProtectedAsset(request, env) {
  let assetResponse = await env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const path = url.pathname;

  if (assetResponse.status === 404 && (path === '/' || path === '/index.html')) {
    const indexRequest = new Request(new URL('/index.html', url).toString(), request);
    assetResponse = await env.ASSETS.fetch(indexRequest);
  }

  if (assetResponse.status === 404 && (path === '/' || path === '/index.html')) {
    return new Response(
      'Claim Clash web bundle is missing on the server. If you operate this site, rebuild web-dist and run .\\scripts\\deploy-web.ps1 (do not deploy while wrangler dev is running).',
      {
        status: 503,
        headers: securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      }
    );
  }

  return assetResponse;
}

export default {
  async fetch(request, env) {
    const redirect = primaryHostRedirect(request);
    if (redirect) return redirect;

    const url = new URL(request.url);

    if (url.pathname === '/api/auth/beta-agree') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleBetaAgreement(request);
    }

    if (url.pathname === '/api/auth/login') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleLogin(request, env);
    }

    if (url.pathname === '/api/auth/logout') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleLogout(request, env);
    }

    if (url.pathname === '/logout') {
      const token = getSessionFromRequest(request);
      await revokeSessionToken(token, env);
      const headers = new Headers(securityHeaders());
      headers.set('Location', '/');
      headers.append('Set-Cookie', makeSessionClearCookie(request));
      headers.append('Set-Cookie', makeBetaAgreementClearCookie(request));
      // Drop legacy persistent session cookie from earlier deploys.
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      headers.append('Set-Cookie', `cc_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
      return new Response(null, { status: 302, headers });
    }

    // Public consumer Windows installer (Release build; no password; no embedded API keys).
    if (url.pathname.startsWith('/download/')) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404) {
        return new Response('Consumer installer not published yet. Check back after the next release build.', {
          status: 404,
          headers: securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      }
      const headers = new Headers(assetResponse.headers);
      for (const [key, value] of Object.entries(securityHeaders())) {
        headers.set(key, value);
      }
      const leaf = url.pathname.split('/').pop() || '';
      if (/\.(exe|msi)$/i.test(leaf)) {
        headers.set('Content-Disposition', `attachment; filename="${leaf}"`);
        headers.set('Content-Type', 'application/octet-stream');
      }
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    const authed = await isAuthenticated(request, env);

    if (url.pathname === '/api/ai') {
      if (!authed) return json({ error: 'Unauthorized' }, 401);
      return handleAiProxy(request);
    }

    if (!authed) {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return loginResponse(request);
      }
      return unauthorizedResponse(request);
    }

    if (request.method === 'GET' && url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      });
    }

    const assetResponse = await fetchProtectedAsset(request, env);
    return assetResponseWithSecurity(assetResponse, url.pathname);
  },
};