const CACHE_NAME = 'kas-app-v1';
const urlsToCache = ['/', '/index.html', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(cacheNames => {
        return Promise.all(cacheNames.map(cache => { if (cache !== CACHE_NAME) return caches.delete(cache); }));
    }));
});