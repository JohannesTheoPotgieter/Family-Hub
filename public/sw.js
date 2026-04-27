// Family-Hub service worker (Phase 0.9).
//
// Plain JS so it ships verbatim through Vite's `public/` pipeline — no
// extra build config to maintain. Three jobs:
//   1. Cache the app shell on install so the PWA opens offline.
//   2. Network-first for HTML, cache-first for hashed assets.
//   3. Receive web push notifications + render with action buttons. The
//      "approve"/"decline" actions are the entry point for connective-chat
//      proposal approvals (Phase 3.9) — the action is forwarded to
//      /api/push/action with a signed token so [Agree] from the lock
//      screen applies the proposal without opening the app.

/* eslint-env serviceworker */
const VERSION = 'v1';
const SHELL_CACHE = `family-hub-shell-${VERSION}`;
const RUNTIME_CACHE = `family-hub-runtime-${VERSION}`;

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const isHashedAsset = (url) => /\/assets\/.+\.(?:js|css|png|svg|woff2?)$/.test(url.pathname);
const isApiCall = (url) => url.pathname.startsWith('/api/');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiCall(url)) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirstWithShellFallback(request));
});

const cacheFirst = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
};

const networkFirstWithShellFallback = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    const indexFallback = await cache.match('/index.html');
    if (indexFallback) return indexFallback;
    return new Response('offline', { status: 503, statusText: 'offline' });
  }
};

// --- Push notifications ------------------------------------------------

const parsePush = (event) => {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return { title: 'Family-Hub', body: event.data.text() };
  }
};

self.addEventListener('push', (event) => {
  const payload = parsePush(event);
  if (!payload) return;

  const actions = payload.proposalId
    ? [
        { action: 'approve', title: 'Agree' },
        { action: 'decline', title: 'Decline' }
      ]
    : [];

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url, proposalId: payload.proposalId, actionToken: payload.actionToken },
      actions,
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (
    (event.action === 'approve' || event.action === 'decline') &&
    data.proposalId &&
    data.actionToken
  ) {
    event.waitUntil(
      fetch('/api/push/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: data.proposalId,
          actionToken: data.actionToken,
          decision: event.action === 'approve' ? 'agree' : 'decline'
        })
      }).catch(() => {})
    );
    return;
  }

  const target = data.url || '/';
  event.waitUntil(self.clients.openWindow(target));
});
