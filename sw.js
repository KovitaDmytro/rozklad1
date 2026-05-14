// ── Service Worker: Розклад занять PWA ──
const CACHE_NAME = 'rozklad-v1';

// Ресурси, які кешуємо одразу при встановленні SW
const PRECACHE_URLS = [
  './index.html',
  'https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css',
];

// ── Install: кешуємо статичні ресурси ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Кешуємо що можемо, ігноруємо помилки CDN/CORS
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Не вдалося кешувати:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: видаляємо старі кеші ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: стратегія Network-first з fallback на кеш ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase Realtime DB — тільки мережа (не кешуємо, дані в реальному часі)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/firestore')
  ) {
    // Не перехоплюємо — нехай іде напряму
    return;
  }

  // Для навігаційних запитів (сам index.html) — Cache-first
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        if (cached) {
          // У фоні оновлюємо кеш
          fetch(request).then(res => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).catch(() => cached);
      })
    );
    return;
  }

  // Для CDN-ресурсів (шрифти, іконки, бібліотеки) — Cache-first
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
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Всі інші — Network-first з fallback
  event.respondWith(
    fetch(request).then(res => {
      if (res && res.status === 200 && request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
      }
      return res;
    }).catch(() => caches.match(request))
  );
});

// ── Push-повідомлення (базова підтримка) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Розклад', body: 'Є оновлення розкладу' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Розклад занять', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});
