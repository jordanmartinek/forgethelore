/**
 * LoreForge Planner - Service Worker
 * Full offline support — caches all app files so the app works
 * without any network connection after first load.
 */

const CACHE_NAME = 'loreforge-v5';

// Critical files that MUST be cached for the app to work offline
const CRITICAL_FILES = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/core/database.js',
  '/src/core/events.js',
  '/src/core/objects.js',
  '/src/core/persist.js',
  '/src/core/progression.js',
  '/src/core/renderer.js',
  '/src/core/store.js',
  '/src/ui/app-shell.js',
  '/src/ui/command-palette.js',
  '/src/ui/expandable-text.js',
  '/src/ui/toast.js',
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
  '/src/styles/main.css',
  '/src/styles/components.css',
  '/src/styles/conflict-board.css',
  '/src/styles/world-builder.css',
  '/src/styles/modules.css',
];

// Optional files — nice to have but won't break the app if missing
const OPTIONAL_FILES = [
  '/public/manifest.json',
  '/public/icons/icon.svg',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
];

// Install: cache critical files (fail gracefully on optional)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache critical files — if any fail, the whole install fails
      await cache.addAll(CRITICAL_FILES);
      console.log('[SW] Critical files cached');

      // Try optional files individually — don't fail install if they're missing
      for (const file of OPTIONAL_FILES) {
        try {
          await cache.add(file);
        } catch (e) {
          console.warn('[SW] Optional file not cached:', file);
        }
      }
      console.log('[SW] Install complete — app ready for offline');
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

// Fetch: cache-first, then network, with offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache immediately — update in background
        event.waitUntil(
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }

      // Not in cache — try network
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline and not cached — serve index.html for navigation requests
        if (event.request.mode === 'navigate' || event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        // For other requests, return empty response
        return new Response('', { status: 503 });
      });
    })
  );
});
