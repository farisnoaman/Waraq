import { ZodError } from 'zod';

/** An error that is safe to show to the caller. */
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.fields = fields;
  }
}

/** Lets a handler choose a status code other than 200. */
export class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

/** Origins allowed to call the API cross-origin. The production app is
 * same-origin and needs no CORS headers; this list exists for the dev server
 * and any explicitly permitted consumer. Override with WARAQ_ALLOWED_ORIGINS. */
const ALLOWED_ORIGINS = (
  process.env.WARAQ_ALLOWED_ORIGINS ||
  'https://waraq.pro,https://www.waraq.pro,http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function applyHeaders(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

/* -------------------------------------------------------------------------
 * Per-IP rate limiting for the unauthenticated endpoints (contact form,
 * Google code exchange). In-memory, so on Vercel each instance counts
 * separately and on a single server it is shared — either way it stops
 * naive floods without adding infrastructure.
 * ---------------------------------------------------------------------- */
const rateBuckets = new Map();

export function rateLimit(req, name, limit, windowMs) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  const key = `${name}:${ip}`;
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    // Occasionally drop expired buckets so the map cannot grow without bound.
    if (rateBuckets.size > 5000) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw new HttpError(429, 'Too many requests. Please try again in a minute.');
  }
}

/** Parses a JSON body defensively. Always returns a plain object. */
export function readBody(req) {
  const raw = req.body;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'The request body is not valid JSON.');
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  if (typeof raw === 'object' && !Array.isArray(raw) && !Buffer.isBuffer(raw)) return raw;
  throw new HttpError(400, 'The request body must be a JSON object.');
}

/** Unwraps a Supabase query result, throwing on error. */
export async function q(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function zodFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Wraps per-method handlers with CORS, security headers and error handling.
 * Unexpected errors are logged server-side and never echoed to the client.
 */
export function createHandler(methods) {
  return async function handler(req, res) {
    applyHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const fn = methods[req.method];
      if (!fn) throw new HttpError(405, 'Method not allowed');
      const result = await fn(req, res);
      if (result instanceof Reply) return res.status(result.status).json(result.body);
      return res.status(200).json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res
          .status(err.status)
          .json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
      }
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Please check the highlighted fields and try again.',
          fields: zodFields(err),
        });
      }
      console.error('API error:', err);
      return res.status(500).json({
        error: 'Something went wrong on our side. Please try again.',
        ...(typeof err?.code === 'string' ? { code: err.code } : {}),
      });
    }
  };
}
