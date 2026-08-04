/**
 * LoreForge Planner - Service Worker
 * Full offline support — caches all app files so the app works
 * without any network connection after first load.
 */

const CACHE_NAME = 'loreforge-v2';

// All files needed to run the app offline
const APP_FILES = [
  '/',
  '/index.html',
  '/sw.js',
  '/public/manifest.json',
  '/public/icons/icon.svg',
  // Core
  '/src/main.js',
  '/src/core/database.js',
  '/src/core/events.js',
  '/src/core/objects.js',
  '/src/core/persist.js',
  '/src/core/progression.js',
  '/src/core/renderer.js',
  '/src/core/store.js',
  // UI
  '/src/ui/app-shell.js',
  '/src/ui/command-palette.js',
  '/src/ui/expandable-text.js',
  '/src/ui/toast.js',
  // Modules
  '/src/modules/analytics.js',
  '/src/modules/character-arc.js',
  '/src/modules/character-planner.js',
  '/src/modules/conflict-board.js',
  '/src/modules/faction-planner.js',
  '/src/modules/knowledge-graph.js',
  '/src/modules/location-planner.js',
  '/src/modules/military-planner.js',
  '/src/modules/mystery-planner.js',
  '/src/modules/organization-planner.js',
  '/src/modules/politics-planner.js',
  '/src/modules/quick-scene-log.js',
  '/src/modules/relationship-planner.js',
  '/src/modules/religion-planner.js',
  '/src/modules/species-planner.js',
  '/src/modules/technology-planner.js',
  '/src/modules/timeline.js',
  '/src/modules/world-builder.js',
  // Styles
  '/src/styles/main.css',
  '/src/styles/components.css',
  '/src/styles/conflict-board.css',
  '/src/styles/world-builder.css',
  '/src/styles/modules.css',
];

// Install: cache all app files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching all app files for offline use');
      return cache.addAll(APP_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: delete old caches
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

// Fetch: cache-first strategy (serve from cache, fallback to network, then cache the response)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache immediately
        // Also update cache in background (stale-while-revalidate)
        event.waitUntil(
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {}) // Network failed — that's fine, we served from cache
        );
        return cachedResponse;
      }

      // Not in cache — try network
      return fetch(event.request).then((networkResponse) => {
        // Cache successful responses for future offline use
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed and not in cache — return offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
