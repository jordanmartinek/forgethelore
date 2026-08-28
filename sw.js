/**
 * LoreForge Planner - Service Worker
 *
 * Offline support with a SELF-MAINTAINING cache. The previous version kept a
 * hand-written CRITICAL_FILES list that had to be updated for every new module
 * — and since `cache.addAll` fails atomically, a single missing/renamed file
 * silently broke the entire offline install. That list had already drifted out
 * of sync with the codebase.
 *
 * New strategy: precache only the minimal app shell (the entry points that are
 * guaranteed to exist), then cache every other same-origin GET response the
 * moment it's fetched (runtime "cache on fetch"). Combined with the existing
 * stale-while-revalidate serving, the cache fills itself on first load and
 * stays correct as files are added or renamed — no manual list to maintain.
 */

const CACHE_NAME = 'loreforge-v6';

// Minimal shell: only files we are certain exist. Everything else is cached at
// runtime as it's requested, so this list never needs updating for new modules.
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/main.js',
];

// Optional extras — cached individually so a missing one can't break install.
const OPTIONAL_FILES = [
  '/public/manifest.json',
  '/public/icons/icon.svg',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
];

// Install: cache the shell (individually, so one 404 can't fail the whole SW).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cacheEachSafely(cache, APP_SHELL);
      await cacheEachSafely(cache, OPTIONAL_FILES);
      console.log('[SW] Install complete — shell cached, other files cache on first use');
    })
  );
  self.skipWaiting();
});

// Add each URL individually; a failure on one never aborts the others. This is
// the key difference from cache.addAll (which is all-or-nothing).
async function cacheEachSafely(cache, urls) {
  for (const url of urls) {
    try {
      await cache.add(url);
    } catch (e) {
      console.warn('[SW] Could not cache (will retry at runtime):', url);
    }
  }
}

// Activate: delete old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

/**
 * Decide whether a response may be cached.
 *
 * Critical guard against SPA-fallback cache poisoning: both the dev server and
 * vercel.json serve `200 index.html` for ANY unmatched path (including a
 * renamed/deleted /src/.../foo.js). If we cached that HTML body under the .js
 * URL, the app would import HTML as a module forever, and stale-while-revalidate
 * would keep re-caching the same poison. So: never cache an HTML body for a
 * request that expects a script/style/other sub-resource. Navigations may cache
 * HTML (that's the whole point of the shell).
 */
function isCacheable(request, url, response) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (!response || !response.ok) return false;

  const contentType = response.headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html');
  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  // Reject HTML served under a non-navigation request (the poisoning case).
  if (isHtml && !isNavigation) return false;
  return true;
}

// Fetch: stale-while-revalidate for cached files; cache-on-fetch for new ones.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Don't touch cross-origin requests (e.g. the user's AI provider) — just pass through.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache immediately; refresh in the background.
        event.waitUntil(
          fetch(request).then((networkResponse) => {
            if (isCacheable(request, url, networkResponse)) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }

      // Not cached yet — fetch and cache it on the way through (self-maintaining).
      return fetch(request).then((networkResponse) => {
        if (isCacheable(request, url, networkResponse)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline and not cached — serve the app shell for navigations.
        if (request.mode === 'navigate' || request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
