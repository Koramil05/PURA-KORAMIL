const CACHE_NAME = 'kas-app-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/offline.html',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://raw.githubusercontent.com/Koramil05/PURA05/main/favicon-32x32.png',
    'https://raw.githubusercontent.com/Koramil05/PURA05/main/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request).then(response => {
                if (response) return response;
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
                return null;
            });
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});
