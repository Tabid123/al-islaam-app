// Kill-switch service worker: removes the old Al-islaam app-shell cache so
// Lovable preview never shows stale screens/modules again.
const AL_ISLAAM_CACHE_PREFIXES = [
  'al-islaam-static-',
  'al-islaam-dynamic-',
  'al-islaam-api-',
  'al-islaam-images-',
];

const isAl-islaamAppCache = (name) =>
  AL_ISLAAM_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.allSettled(
          cacheNames.filter(isAl-islaamAppCache).map((name) => caches.delete(name))
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