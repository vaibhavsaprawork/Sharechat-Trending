/**
 * Minimal local server so Vite's /api proxy works without `vercel dev`.
 * Loads env from .env / .env.local (same filenames Vercel CLI uses).
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

/**
 * Load `.env` then `.env.local` from the package root (next to package.json).
 * `.env.local` always overrides for keys it defines — so it wins over empty
 * shell placeholders (a common reason keys "don't load").
 */
function loadDotEnv() {
  const roots = [projectRoot];
  if (resolve(process.cwd()) !== projectRoot) {
    roots.push(process.cwd());
  }

  const parseFile = (absPath) => {
    if (!existsSync(absPath)) return [];
    const raw = readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '');
    const entries = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      let key = t.slice(0, eq).trim().replace(/\r/g, '');
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) entries.push([key, val]);
    }
    return entries;
  };

  const seenPaths = new Set();

  for (const root of roots) {
    const envPath = resolve(root, '.env');
    const keyPath = envPath;
    if (seenPaths.has(keyPath)) continue;
    seenPaths.add(keyPath);
    for (const [key, val] of parseFile(envPath)) {
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val;
      }
    }
  }

  seenPaths.clear();
  for (const root of roots) {
    const localPath = resolve(root, '.env.local');
    const keyPath = localPath;
    if (seenPaths.has(keyPath)) continue;
    seenPaths.add(keyPath);
    if (!existsSync(localPath)) continue;
    for (const [key, val] of parseFile(localPath)) {
      process.env[key] = val;
    }
    console.log(`[local-api] Loaded environment from ${localPath}`);
  }
}

loadDotEnv();

const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();
const useOllama = provider === 'ollama';
const hasGemini = Boolean(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
);
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
const hasNews = Boolean(process.env.NEWSAPI_KEY);

if (useOllama) {
  if (!hasNews) {
    console.warn(
      '[local-api] Ollama mode: NEWSAPI_KEY missing — API will use RSS-only headlines (OK for local demo).'
    );
  }
  console.warn(
    `[local-api] LLM_PROVIDER=ollama → ${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'} model ${process.env.OLLAMA_MODEL || 'llama3.2'} (ensure \`ollama serve\` is running).`
  );
} else if (!hasGemini && !hasAnthropic) {
  console.warn(
    `[local-api] Missing GEMINI_API_KEY and ANTHROPIC_API_KEY after loading env files (or set LLM_PROVIDER=ollama for local Llama).\n` +
      `  Expected file: ${resolve(projectRoot, '.env.local')}\n` +
      `  (Production on Vercel: add keys in Dashboard → Settings → Environment Variables — .env.local is not uploaded.)`
  );
} else if (!hasNews) {
  console.warn(
    '[local-api] NEWSAPI_KEY missing — API will use RSS-only headlines alongside Gemini.'
  );
}

const trendingHandler = (await import('../api/trending.js')).default;
const llmHealthHandler = (await import('../api/llm-health.js')).default;
const ollamaTestHandler = (await import('../api/ollama-test.js')).default;

const server = http.createServer((req, res) => {
  if (!req.url?.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  const run = req.url.startsWith('/api/ollama-test')
    ? ollamaTestHandler(req, res)
    : req.url.startsWith('/api/llm-health')
      ? llmHealthHandler(req, res)
      : trendingHandler(req, res);

  Promise.resolve(run).catch((err) => {
    console.error('[local-api]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Unhandled', detail: String(err?.message || err) }));
    }
  });
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  server.listen(port, host, () => {
    console.log(
    `[local-api] http://${host}:${port}  → Vite proxies /api here (.env.local loaded)\n` +
      `  Health: GET http://${host}:${port}/api/llm-health  (?all=1 | ?ollama=1 | ?gemini=1)\n` +
      `  Ollama ping: GET http://${host}:${port}/api/ollama-test`
  );
  });
}
