/*
 * Waraq Pro service worker.
 *
 *  - App shell (HTML, JS, CSS, icons) is precached at install, so the app is
 *    installable and opens offline from the very first visit.
 *  - Public catalogue API responses are cached network-first.
 *  - Authenticated API responses are NEVER stored here. A buyer's orders are
 *    kept in IndexedDB instead, keyed by user and wiped on sign-out.
 */
const VERSION = '__SW_VERSION__';
const PRECACHE = /*__PRECACHE__*/[];

const SHELL_CACHE = `waraqpro-shell-${VERSION}`;
const RUNTIME_CACHE = 'waraqpro-runtime-v1';
const API_CACHE = 'waraqpro-public-api-v1';
const KEEP = [SHELL_CACHE, RUNTIME_CACHE, API_CACHE];

const CORE = [
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/images/hero-warehouse.jpg',
];
const PUBLIC_API = ['/api/products', '/api/categories', '/api/services'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          [...CORE, ...PRECACHE].map((url) => cache.add(new Request(url, { cache: 'reload' }))),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('waraqpro-') && !KEEP.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function appShell(request) {
  try {
    const response = await fetch(request);
    const isHtml = (response.headers.get('content-type') || '').includes('text/html');
    if (response.ok) {
      if (isHtml) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', response.clone());
      }
      return response;
    }
    // A deep link the host does not know about: serve the app shell instead.
    const cached = await caches.match('/index.html');
    return cached || response;
  } catch {
    const cached = await caches.match('/index.html');
    return (
      cached ||
      new Response('Waraq Pro is offline. Reconnect and reload this page.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await refresh;
  if (fresh) return fresh;
  return new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) {
      const isPublic = PUBLIC_API.includes(url.pathname) && !request.headers.has('authorization');
      if (isPublic) event.respondWith(networkFirst(request, API_CACHE));
      return; // everything else under /api goes straight to the network
    }
    if (request.mode === 'navigate') {
      // A Google sign-in redirect carries the authorization code in the query
      // string. It must reach the network, never the cached app shell.
      if (url.searchParams.has('code')) return;
      event.respondWith(appShell(request));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
      return;
    }
    if (url.pathname === '/sw.js') return;
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
  // Cross-origin requests (Supabase Auth, remote product photos) are left to the browser.
});
