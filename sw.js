/**
 * LoreForge Planner - Service Worker
 * Enables PWA installation (desktop shortcut with custom icon)
 */

const CACHE_NAME = 'loreforge-v1';

// Install event - cache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/src/main.js',
        '/src/styles/main.css',
        '/src/styles/components.css',
        '/src/styles/conflict-board.css',
        '/src/styles/world-builder.css',
        '/src/styles/modules.css',
        '/public/icons/icon.svg',
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
