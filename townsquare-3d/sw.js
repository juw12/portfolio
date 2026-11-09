// Service worker: makes the app installable and lets the world load offline (solo mode).
// Network-first so updates show immediately; the cache is only a fallback.
const CACHE_NAME = 'townsquare-v16';
const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'main.js',
  'buildables.js',
  'scenery.js',
  'avatar.js',
  'textures.js',
  'economy.js',
  'account.js',
  'social.js',
  'feed.js',
  'juice.js',
  'icons.js',
  'props.js',
  'instancing.js',
  'solo.js',
  'models/character.glb',
  'models/props.glb',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
