import { useCallback, useEffect, useState } from 'react';
import supabase from './supabase';
import { t } from './i18n';

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }

  /** True when the request never reached the server (offline, DNS, etc.). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

// Kept in memory by the AuthProvider so requests never have to await the
// Supabase client (which must not be called from inside its own auth callback).
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** A multipart body. The browser sets the content type, with its boundary. */
  form?: FormData;
  /** Set to false for public endpoints so responses stay cacheable offline. */
  auth?: boolean;
}

function send(path: string, options: Options, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  const isForm = options.form !== undefined;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: isForm
      ? options.form
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const useAuth = options.auth !== false;
  let response: Response;
  try {
    response = await send(path, options, useAuth ? accessToken : null);
    if (response.status === 401 && useAuth && accessToken) {
      // The access token may have expired while the tab slept: refresh once.
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) {
        accessToken = data.session.access_token;
        response = await send(path, options, accessToken);
      }
    }
  } catch {
    throw new ApiError(t('We could not reach the server. Check your connection and try again.'), 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(
      t(body.error || 'Something went wrong on our side. Please try again.'),
      response.status,
      Object.fromEntries(Object.entries(body.fields ?? {}).map(([key, value]) => [key, t(value)])),
    );
  }
  if (payload === null) {
    throw new ApiError(t('The server sent an unexpected response. Please try again.'), response.status);
  }
  return payload as T;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  return err instanceof Error && err.message ? err.message : t(fallback);
}

/* ---------------------------------------------------------------------------
 * useApi: cached GET for the public catalogue endpoints.
 * ------------------------------------------------------------------------- */

const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();

/** Drops one cached URL (or everything) and makes mounted hooks refetch. */
export function invalidate(url?: string) {
  if (url) cache.delete(url);
  else cache.clear();
  listeners.forEach((listener) => listener());
}

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(() => (cache.has(url) ? (cache.get(url) as T) : null));
  const [loading, setLoading] = useState(() => !cache.has(url));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => {
      if (!cache.has(url)) setVersion((v) => v + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(url)) {
      setData(cache.get(url) as T);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api<T>(url, { auth: false })
      .then((result) => {
        if (cancelled) return;
        cache.set(url, result);
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = useCallback(() => {
    cache.delete(url);
    setVersion((v) => v + 1);
  }, [url]);

  return { data, loading, error, reload };
}
