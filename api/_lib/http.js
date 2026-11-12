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

function applyHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
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
    applyHeaders(res);
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
