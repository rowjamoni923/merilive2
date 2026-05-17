/* Image Cache Service Worker
 * Cache-first strategy for all images so banners/photos load in ~0ms after first view.
 * Scope: same-origin assets + Supabase storage URLs + common CDN image hosts.
 */
const CACHE_NAME = 'meri-img-cache-v2';
const MAX_ENTRIES = 600;

const IMG_HOST_RE = /(supabase\.co\/storage|supabase\.in\/storage|images?\.|cdn\.|cloudflarestorage|googleusercontent|cloudinary|imgur)/i;
const IMG_EXT_RE = /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i;
const PRIVATE_STORAGE_RE = /\/storage\/v1\/.*\/(face-verification|host-verification|payment-proofs|payment-screenshots|helper-screenshots|rating-screenshots|support-attachments|live-recordings|chat-media)\//i;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const remove = keys.length - MAX_ENTRIES;
  for (let i = 0; i < remove; i++) await cache.delete(keys[i]);
}

function isImageRequest(req) {
  if (req.method !== 'GET') return false;
  if (req.destination === 'image') return true;
  const url = req.url;
  if (IMG_EXT_RE.test(url)) return true;
  if (IMG_HOST_RE.test(url) && /image|object|public/i.test(url)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!isImageRequest(req)) return;
  // Skip range requests (videos sometimes share host)
  if (req.headers.get('range')) return;
  if (PRIVATE_STORAGE_RE.test(req.url)) return;

  event.respondWith((async () => {
    const client = event.clientId ? await self.clients.get(event.clientId).catch(() => null) : null;
    if (client) {
      try {
        if (new URL(client.url).pathname.startsWith('/admin')) return fetch(req, { cache: 'no-store' });
      } catch {}
    }
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreVary: true });
    if (cached) {
      // Stale-revalidate in background
      fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone()).then(() => trimCache(cache)).catch(() => {});
        }
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone()).then(() => trimCache(cache)).catch(() => {});
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

// Allow page to push warm-up URLs
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'WARM_IMAGES' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(data.urls.slice(0, 200).map(async (u) => {
        try {
          const match = await cache.match(u, { ignoreVary: true });
          if (match) return;
          const res = await fetch(u, { mode: 'no-cors' });
          if (res) await cache.put(u, res.clone());
        } catch {}
      }));
      trimCache(cache);
    })());
  }
});
