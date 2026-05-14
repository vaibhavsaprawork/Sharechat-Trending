/**
 * Starts local API + Vite with the same free TCP port (avoids EADDRINUSE on 3000).
 * Sets PORT for the API and VITE_DEV_API_PORT for Vite's proxy (see vite.config.js).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const localApi = resolve(__dirname, 'local-api.mjs');
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');

const host = process.env.HOST || '127.0.0.1';

function portFree(port) {
  return new Promise((resolvePromise) => {
    const s = net.createServer();
    s.once('error', () => resolvePromise(false));
    s.listen(port, host, () => {
      s.close(() => resolvePromise(true));
    });
  });
}

async function findPort(start) {
  for (let p = start; p < start + 100; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`No free TCP port in range ${start}–${start + 99} on ${host}`);
}

const startPort = Number(process.env.PORT || 3000);
const port = await findPort(startPort);

console.log(
  `[dev-stack] Port ${port} is free → API + Vite will use it (proxy /api → http://${host}:${port})\n`
);

const envApi = { ...process.env, PORT: String(port), HOST: host };
const envWeb = { ...process.env, VITE_DEV_API_PORT: String(port) };

const api = spawn(process.execPath, [localApi], {
  cwd: root,
  stdio: 'inherit',
  env: envApi,
});

await new Promise((r) => setTimeout(r, 350));

const web = spawn(process.execPath, [viteCli], {
  cwd: root,
  stdio: 'inherit',
  env: envWeb,
});

function shutdown() {
  try {
    web.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    api.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', shutdown);

api.on('exit', (code, signal) => {
  if (signal !== 'SIGTERM') {
    try {
      web.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  process.exit(code === null ? 1 : code);
});

web.on('exit', (code) => {
  try {
    api.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  process.exit(code === null ? 1 : code);
});
