// Kill-switch service worker: removes the old Riyokaab app-shell cache so
// Lovable preview never shows stale screens/modules again.
const RIYOKAAB_CACHE_PREFIXES = [
  'riyokaab-static-',
  'riyokaab-dynamic-',
  'riyokaab-api-',
  'riyokaab-images-',
];

const isRiyokaabAppCache = (name) =>
  RIYOKAAB_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.allSettled(
          cacheNames.filter(isRiyokaabAppCache).map((name) => caches.delete(name))
        );

        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: 'window' });
        await Promise.allSettled(
          windowClients.map((client) => client.navigate(client.url))
        );
      } finally {
        await self.registration.unregister();
      }
    })()
  );
});

self.addEventListener('fetch', () => {
  // Intentionally no caching. Let the browser/network serve the live app.
});