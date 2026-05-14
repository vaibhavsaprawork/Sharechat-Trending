/**
 * GET /api/llm-health — connectivity checks for Ollama and/or Gemini (no full trending run).
 *
 * Query (optional):
 *   ?ollama=1   — force Ollama checks (version + tags + configured model)
 *   ?gemini=1   — force Gemini list-models ping (validates key + HTTPS)
 *   ?all=1      — run every applicable check
 *
 * Defaults: checks match LLM_PROVIDER (ollama → Ollama only; gemini → Gemini when key set).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

const HEALTH_FETCH_MS = 10_000;

function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

function healthSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(HEALTH_FETCH_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), HEALTH_FETCH_MS);
  return c.signal;
}

/** Same semantics as api/trending.js — exclude `vercel dev` (VERCEL_ENV=development). */
function isVercelCloudRuntime() {
  const env = (process.env.VERCEL_ENV || '').trim();
  if (env === 'production' || env === 'preview') return true;
  const vercel = (process.env.VERCEL || '').trim().toLowerCase();
  const vercelOn = vercel === '1' || vercel === 'true';
  if (!vercelOn) return false;
  if (env === 'development') return false;
  return true;
}

function formatFetchErr(err) {
  if (!err) return '';
  let s = err.message || String(err);
  const c = err.cause;
  if (c) {
    s += ` | cause: ${c.message || String(c)}`;
    if (c.code) s += ` (${c.code})`;
  }
  return s;
}

function ollamaBase() {
  return (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

function modelNameMatches(availableName, want) {
  const w = String(want || '').trim();
  const a = String(availableName || '').trim();
  if (!w || !a) return false;
  if (a === w) return true;
  if (a.startsWith(`${w}:`)) return true;
  return false;
}

async function checkOllama() {
  const base = ollamaBase();
  const configured = process.env.OLLAMA_MODEL || 'llama3.2';
  const out = {
    host: base,
    configuredModel: configured,
    version: null,
    tags: null,
    modelFound: false,
    ok: false,
  };

  if (isVercelCloudRuntime()) {
    let hn = '';
    try {
      hn = new URL(base).hostname.toLowerCase();
    } catch {
      /* ignore */
    }
    const localHost =
      hn === 'localhost' || hn === '127.0.0.1' || hn === '0.0.0.0' || hn === '::1';
    if (localHost) {
      out.version = {
        ok: false,
        skipped: true,
        reason:
          'On Vercel, localhost/127.0.0.1 is this serverless instance — not your Mac. Ollama on your laptop is unreachable. Use GEMINI_API_KEY here, or run the API locally with LLM_PROVIDER=ollama.',
      };
      out.tags = { ok: false, skipped: true };
      return out;
    }
  }

  const signal = healthSignal();

  try {
    const r = await fetch(`${base}/api/version`, { signal, method: 'GET' });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    out.version = { httpStatus: r.status, ok: r.ok, body: json };
  } catch (e) {
    out.version = { ok: false, error: formatFetchErr(e) };
    return out;
  }

  try {
    const r = await fetch(`${base}/api/tags`, { signal: healthSignal(), method: 'GET' });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    const names = Array.isArray(json && json.models)
      ? json.models.map((m) => m && m.name).filter(Boolean)
      : [];
    out.modelFound = names.some((n) => modelNameMatches(n, configured));
    out.tags = {
      httpStatus: r.status,
      ok: r.ok,
      modelCount: names.length,
      modelNames: names.slice(0, 30),
      configuredModelPresent: out.modelFound,
    };
  } catch (e) {
    out.tags = { ok: false, error: formatFetchErr(e) };
    return out;
  }

  out.ok = Boolean(out.version && out.version.ok && out.tags && out.tags.ok && out.modelFound);
  return out;
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const out = { ok: false, skipped: !key, keyPresent: Boolean(key) };
  if (!key) return out;

  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
  url.searchParams.set('key', key);
  url.searchParams.set('pageSize', '1');

  try {
    const r = await fetch(url.toString(), {
      method: 'GET',
      signal: healthSignal(),
      headers: { Accept: 'application/json' },
    });
    const text = await r.text();
    out.httpStatus = r.status;
    out.ok = r.ok;
    if (!r.ok) {
      out.errorBody = text.slice(0, 400);
    }
  } catch (e) {
    out.ok = false;
    out.error = formatFetchErr(e);
  }
  return out;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const reqUrl = req.url || '/';
  const parsed = new URL(reqUrl, 'http://127.0.0.1');
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  const forceAll = parsed.searchParams.get('all') === '1';
  const forceOllama = forceAll || parsed.searchParams.get('ollama') === '1' || provider === 'ollama';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const forceGemini =
    forceAll || parsed.searchParams.get('gemini') === '1' || provider !== 'ollama';

  const body = {
    ok: true,
    summary: '',
    hints: [
      'Ollama: GET /api/version and /api/tags must succeed; configured OLLAMA_MODEL must appear in tags.',
      'Gemini: list-models request validates API key and outbound HTTPS.',
      'Use ?ollama=1 or ?gemini=1 or ?all=1 to force checks regardless of LLM_PROVIDER.',
    ],
    environment: {
      LLM_PROVIDER: provider,
      OLLAMA_HOST: ollamaBase(),
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.2',
      GEMINI_API_KEY: geminiKey ? '(set)' : '(missing)',
    },
    ollama: null,
    gemini: null,
  };

  const failures = [];

  if (forceOllama) {
    body.ollama = await checkOllama();
    if (!body.ollama.ok) {
      let msg = 'Ollama: check failed';
      if (body.ollama.version && body.ollama.version.skipped && body.ollama.version.reason) {
        msg = body.ollama.version.reason;
      } else if (body.ollama.version && body.ollama.version.error) {
        msg = `Ollama /api/version: ${body.ollama.version.error}`;
      } else if (body.ollama.version && !body.ollama.version.ok) {
        msg = `Ollama /api/version: HTTP ${body.ollama.version.httpStatus || 'error'}`;
      } else if (body.ollama.tags && body.ollama.tags.error) {
        msg = `Ollama /api/tags: ${body.ollama.tags.error}`;
      } else if (!body.ollama.modelFound) {
        msg = `Ollama: model "${body.ollama.configuredModel}" not found in /api/tags (pull with ollama pull ${body.ollama.configuredModel})`;
      }
      failures.push(msg);
    }
  } else {
    body.ollama = { skipped: true, reason: 'LLM_PROVIDER is not ollama (pass ?ollama=1 to check anyway)' };
  }

  if (forceGemini) {
    body.gemini = await checkGemini();
    if (body.gemini.skipped) {
      body.gemini.reason = 'No GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY (pass ?gemini=1 still needs a key)';
    } else if (!body.gemini.ok) {
      failures.push(
        body.gemini.error
          ? `Gemini: ${body.gemini.error}`
          : `Gemini list-models: HTTP ${body.gemini.httpStatus} ${body.gemini.errorBody || ''}`.trim()
      );
    }
  } else {
    body.gemini = {
      skipped: true,
      reason: 'LLM_PROVIDER is ollama and ?gemini=1 not set (pass ?gemini=1 or ?all=1 to test Gemini)',
    };
  }

  body.ok = failures.length === 0;
  body.summary = body.ok
    ? 'All requested checks passed.'
    : `Failed (${failures.length}): ${failures.join(' | ')}`;

  res.statusCode = body.ok ? 200 : 503;
  res.end(JSON.stringify(body, null, 0));
}
