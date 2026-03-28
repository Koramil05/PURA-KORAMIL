// ==================== SERVICE WORKER ====================
const CACHE_NAME = 'kas-app-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/offline.html',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://raw.githubusercontent.com/Koramil05/PURA05/main/favicon-32x32.png',
    'https://raw.githubusercontent.com/Koramil05/PURA05/main/favicon-16x16.png',
    'https://raw.githubusercontent.com/Koramil05/PURA05/main/apple-touch-icon.png'
];

// Install Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('Cache addAll error:', err))
    );
    self.skipWaiting();
});

// Fetch dengan fallback ke offline page
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone response untuk cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        // Jika request adalah halaman (navigate), tampilkan offline.html
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html');
                        }
                        return null;
                    });
            })
    );
});

// Activate dan hapus cache lama
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Push Notification (opsional)
self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'Ada notifikasi baru',
        icon: 'https://raw.githubusercontent.com/Koramil05/PURA05/main/android-chrome-192x192.png',
        badge: 'https://raw.githubusercontent.com/Koramil05/PURA05/main/favicon-32x32.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };
    event.waitUntil(
        self.registration.showNotification('Aplikasi Kas', options)
    );
});
