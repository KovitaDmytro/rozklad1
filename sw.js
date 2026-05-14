// ── Service Worker: Розклад занять PWA ──
const CACHE_NAME = 'rozklad-v2';

// ── Install: нічого не прекешуємо, просто активуємось ──
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── Activate: видаляємо старі кеші ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase — не перехоплюємо взагалі
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google.com') ||
    (url.hostname.includes('gstatic.com') && url.pathname.includes('/firebasejs'))
  ) {
    return;
  }

  // index.html — ЗАВЖДИ мережа першою, кеш тільки як fallback офлайн
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          return caches.match(request) || caches.match('./index.html');
        })
    );
    return;
  }

  // CDN-ресурси — Cache-first (вони не змінюються)
  if (
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Все інше — мережа
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
