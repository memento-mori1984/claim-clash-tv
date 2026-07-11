// AI CORS proxy — only reachable behind site-gate after developer login.

const ALLOWED_HOSTS = new Set([
  'generativelanguage.googleapis.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'api.x.ai',
]);

const ALLOWED_ORIGINS = new Set([
  'https://claim-clash.com',
  'https://www.claim-clash.com',
  'https://claims-clash.com',
  'https://www.claims-clash.com',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://claim-clash.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(request, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
      ...extra,
    },
  });
}

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    for (const allowed of ALLOWED_HOSTS) {
      if (host === allowed || host.endsWith('.' + allowed)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function handleAiProxy(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed' }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON body' }, 400);
  }

  const targetUrl = String(payload.url || '').trim();
  if (!targetUrl || !isAllowedUrl(targetUrl)) {
    return jsonResponse(request, { error: 'URL not allowed' }, 403);
  }

  const method = String(payload.method || 'GET').toUpperCase();
  const forwardHeaders = {};
  if (payload.headers && typeof payload.headers === 'object') {
    for (const [key, value] of Object.entries(payload.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'host' || lower === 'content-length') continue;
      forwardHeaders[key] = value;
    }
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : (payload.body ?? undefined),
    });
  } catch {
    return jsonResponse(request, { error: 'Upstream fetch failed' }, 502);
  }

  const bodyText = await upstream.text();
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || lower === 'transfer-encoding') return;
    responseHeaders[key] = value;
  });

  return jsonResponse(request, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
    body: bodyText,
  });
}