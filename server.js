/*
 * Production server for self-hosting (Coolify, Docker, any Node host).
 *
 * Serves the built app from ./dist and runs the same handlers in ./api that
 * run as serverless functions on Vercel, so both targets share one codebase.
 * No framework: Node's http module only.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

// Load ./.env for local runs (and for a manually uploaded file on a host).
// Variables already present in the real environment always win over the file,
// so the Hostinger panel, Docker `-e`, or a shell export take precedence.
const ENV_FILE = path.join(ROOT, '.env');
if (typeof process.loadEnvFile === 'function' && fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.warn(`Ignoring ${ENV_FILE}: ${err.message}`);
  }
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 1024;

// The API reads NEXT_PUBLIC_SUPABASE_URL; accept the other common names too.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

// Only these files in ./api are reachable. Everything else (helpers, db client) is not.
const API_ROUTES = new Set(['me', 'services', 'contact', 'categories', 'products', 'orders', 'operations']);

// Security headers are defined once, in vercel.json, and reused here.
const headerRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers ?? [];
const headersFor = (source) => headerRules.find((rule) => rule.source === source)?.headers ?? [];
const GLOBAL_HEADERS = headersFor('/(.*)');
const SW_HEADERS = headersFor('/sw.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);
const gzipCache = new Map();

const handlers = new Map();
async function loadHandler(name) {
  if (!handlers.has(name)) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'api', `${name}.js`)).href);
    handlers.set(name, mod.default);
  }
  return handlers.get(name);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
  if (!API_ROUTES.has(name)) return sendJson(res, 404, { error: 'Not found' });

  // Give the handler the request/response shape it gets on Vercel.
  req.query = Object.fromEntries(url.searchParams);
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const raw = await readBody(req);
    const isJson = String(req.headers['content-type'] || '').includes('application/json');
    if (raw && isJson) {
      try {
        req.body = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'The request body is not valid JSON.' });
      }
    } else {
      req.body = raw;
    }
  }
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => sendJson(res, res.statusCode, body);

  let handler;
  try {
    handler = await loadHandler(name);
  } catch (err) {
    console.error('API failed to start. Check the Supabase environment variables.', err?.message);
    return sendJson(res, 500, { error: 'The server is not configured yet.' });
  }
  return handler(req, res);
}

function serveFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  const rel = '/' + path.relative(DIST, file).split(path.sep).join('/');
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  if (rel === '/sw.js') for (const h of SW_HEADERS) res.setHeader(h.key, h.value);
  else if (rel.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else if (ext === '.html') res.setHeader('Cache-Control', 'no-cache');
  else res.setHeader('Cache-Control', 'public, max-age=3600');

  const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (wantsGzip) {
    const key = `${file}:${stat.mtimeMs}`;
    if (!gzipCache.has(key)) gzipCache.set(key, zlib.gzipSync(fs.readFileSync(file)));
    const body = gzipCache.get(key);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', body.length);
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad request' });
  }
  const file = path.join(DIST, path.normalize(pathname));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });

  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isFile()) return serveFile(req, res, file, stat);

  // A missing file with an extension is a real 404; anything else is an app route.
  if (path.extname(pathname)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }
  const index = path.join(DIST, 'index.html');
  return serveFile(req, res, index, fs.statSync(index));
}

const server = http.createServer(async (req, res) => {
  try {
    for (const h of GLOBAL_HEADERS) res.setHeader(h.key, h.value);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return handleStatic(req, res, url);
  } catch (err) {
    console.error('Request failed:', err?.message);
    if (!res.headersSent) sendJson(res, err?.status || 500, { error: 'Something went wrong on our side. Please try again.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Waraq Pro is listening on http://${HOST}:${PORT}`);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Warning: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. The API will not work.');
  }
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
