/**
 * GET /api/ollama-test — minimal Ollama chat ping ("how are you") for connectivity checks.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

const TIMEOUT_MS = 120_000;

function setCors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
}

function chatSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), TIMEOUT_MS);
  return c.signal;
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
    res.end(JSON.stringify({ error: 'Use GET /api/ollama-test' }));
    return;
  }

  const base = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const url = `${base}/api/chat`;
  const userMessage = 'how are you';

  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: chatSignal(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userMessage }],
        stream: false,
        options: { temperature: 0.3, num_predict: 128 },
      }),
    });

    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!r.ok) {
      res.statusCode = 502;
      res.end(
        JSON.stringify({
          ok: false,
          url,
          model,
          userMessage,
          httpStatus: r.status,
          ollama: data,
        })
      );
      return;
    }

    const reply =
      data && data.message && data.message.content != null ? String(data.message.content) : '';

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        url,
        model,
        userMessage,
        reply,
      })
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        ok: false,
        url,
        model,
        userMessage,
        error: e && e.message ? e.message : String(e),
      })
    );
  }
}
