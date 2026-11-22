const CACHE_NAME = 'liquid-audio-offline-v26';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(PRECACHE_URLS);
      // Automatically parse index.html and pre-cache the hashed Vite JS & CSS bundles
      try {
        const res = await fetch('/index.html', { cache: 'no-cache' });
        const html = await res.text();
        const assetMatches = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
        const assetUrls = assetMatches.map((m) => m[1]);
        if (assetUrls.length > 0) {
          await cache.addAll(assetUrls);
        }
      } catch (err) {
        console.warn('SW asset pre-cache warning:', err);
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache live Subsonic audio streams or live API endpoints in the app shell cache
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/rest/')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    // Cache-first for static assets (/assets/*, icons, manifest) so offline boot after restart is instant
    if (
      url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')
    ) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) {
            const ct = cached.headers.get('content-type') || '';
            // Never return a cached HTML fallback for a JS/CSS asset
            if (
              !(
                (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) &&
                ct.includes('text/html')
              )
            ) {
              return cached;
            }
          }
          return fetch(request, { cache: 'no-cache' }).then((res) => {
            const ct = (res && res.headers && res.headers.get('content-type')) || '';
            const isHtmlFallbackForAsset =
              (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) &&
              ct.includes('text/html');
            if (res && res.ok && !isHtmlFallbackForAsset) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          });
        })
      );
      return;
    }

    // Navigation requests (/ or /index.html): fast 1.8s network race with immediate cached shell fallback
    // Guarantees that after an iPhone restart with no signal or hanging cellular DNS, the app opens immediately!
    if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(
        (async () => {
          const cachedShell =
            (await caches.match('/index.html')) || (await caches.match('/'));

          if (typeof navigator !== 'undefined' && navigator.onLine === false && cachedShell) {
            return cachedShell;
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1800);
          try {
            const netRes = await fetch(request, {
              cache: 'no-cache',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (netRes && netRes.ok) {
              const copy = netRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
              return netRes;
            }
          } catch {
            clearTimeout(timeoutId);
          }

          if (cachedShell) return cachedShell;
          return fetch(request);
        })()
      );
    }
  }
});
