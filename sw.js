// ==================== KONFIGURASI SERVICE WORKER ====================
const CACHE_NAME = 'kas-pura-v3';
const API_CACHE_NAME = 'kas-pura-api-v3';

// Aset yang akan di-cache untuk offline
const ASSETS_TO_CACHE = [
  '/PURA-KORAMIL/',
  '/PURA-KORAMIL/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

// ==================== INSTALL EVENT ====================
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Menginstal...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching aset...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE EVENT ====================
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker: Mengaktifkan...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('🗑️ Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ==================== FETCH EVENT ====================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Strategi untuk request API ke Apps Script
  if (url.href.includes('script.google.com/macros/s/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Strategi untuk aset statis (Cache First)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Kembalikan dari cache jika ada
        }
        return fetch(event.request) // Jika tidak, ambil dari jaringan
          .then((response) => {
            // Simpan ke cache untuk kunjungan berikutnya
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return response;
          })
          .catch(() => {
            // Fallback jika offline dan tidak ada di cache
            if (event.request.mode === 'navigate') {
              return caches.match('/PURA-KORAMIL/');
            }
          });
      })
  );
});

// ==================== HANDLE API REQUEST ====================
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  // Untuk request GET (membaca data), coba cache dulu, lalu update
  if (request.method === 'GET') {
    const cachedResponse = await cache.match(request);
    
    // Buat request untuk update di background
    const fetchPromise = fetch(request.clone())
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
      .catch(error => {
        console.log('📴 Offline, menggunakan data cache untuk GET');
        return null;
      });
    
    // Kembalikan data cache dulu, update di background
    if (cachedResponse) {
      // Update cache di background
      event.waitUntil(fetchPromise);
      return cachedResponse;
    }
    
    // Jika tidak ada cache, tunggu response dari jaringan
    const networkResponse = await fetchPromise;
    if (networkResponse) return networkResponse;
    
    // Jika benar-benar offline dan tidak ada cache
    return new Response(JSON.stringify({
      success: false,
      offline: true,
      message: 'Anda sedang offline. Data tidak tersedia di cache.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Untuk request POST/PUT/DELETE (menulis data), simpan ke IndexedDB dulu jika offline
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    // Coba kirim ke jaringan dulu
    try {
      const networkResponse = await fetch(request.clone());
      if (networkResponse && networkResponse.status === 200) {
        return networkResponse;
      }
      throw new Error('Gagal mengirim');
    } catch (error) {
      console.log('📴 Offline, menyimpan request untuk sinkronisasi nanti');
      
      // Simpan request ke IndexedDB untuk sinkronisasi nanti
      await savePendingRequest(request.clone());
      
      // Kembalikan response sukses palsu
      return new Response(JSON.stringify({
        success: true,
        offline: true,
        pending: true,
        message: 'Transaksi disimpan secara lokal. Akan disinkronkan saat online.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // Untuk method lain, lanjutkan seperti biasa
  return fetch(request);
}

// ==================== INDEXEDDB UNTUK PENDING REQUESTS ====================
const DB_NAME = 'KasPuraDB';
const STORE_NAME = 'pendingRequests';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function savePendingRequest(request) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Clone request untuk mendapatkan body
    const requestClone = request.clone();
    let body = null;
    try {
      body = await requestClone.text();
    } catch (e) {
      body = null;
    }
    
    const pendingRequest = {
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    };
    
    await store.add(pendingRequest);
    await tx.complete;
    console.log('✅ Request disimpan untuk sinkronisasi nanti');
  } catch (error) {
    console.error('❌ Gagal menyimpan pending request:', error);
  }
}

async function getPendingRequests() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const requests = await store.getAll();
    await tx.complete;
    return requests;
  } catch (error) {
    console.error('❌ Gagal mengambil pending requests:', error);
    return [];
  }
}

async function clearPendingRequest(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.delete(id);
    await tx.complete;
  } catch (error) {
    console.error('❌ Gagal menghapus pending request:', error);
  }
}

// ==================== SINKRONISASI BACKGROUND ====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    console.log('🔄 Menjalankan sinkronisasi background...');
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  try {
    const pendingRequests = await getPendingRequests();
    
    for (const pending of pendingRequests) {
      try {
        const headers = new Headers();
        pending.headers.forEach(([key, value]) => {
          headers.append(key, value);
        });
        
        const request = new Request(pending.url, {
          method: pending.method,
          headers: headers,
          body: pending.body
        });
        
        const response = await fetch(request);
        
        if (response.status === 200) {
          await clearPendingRequest(pending.id);
          console.log(`✅ Sinkronisasi berhasil untuk request ID: ${pending.id}`);
        } else {
          console.log(`⚠️ Sinkronisasi gagal untuk request ID: ${pending.id}, status: ${response.status}`);
        }
      } catch (error) {
        console.error(`❌ Error sinkronisasi request ID ${pending.id}:`, error);
      }
    }
    
    // Kirim pesan ke semua client bahwa sinkronisasi selesai
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETED',
        syncedCount: pendingRequests.length
      });
    });
    
  } catch (error) {
    console.error('❌ Error dalam syncPendingRequests:', error);
  }
}

// ==================== PERIODIC BACKGROUND SYNC (Jika didukung browser) ====================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-sync') {
    console.log('🔄 Menjalankan periodic background sync...');
    event.waitUntil(syncPendingRequests());
  }
});

// ==================== PUSH NOTIFICATIONS (Opsional) ====================
self.addEventListener('push', (event) => {
  const options = {
    body: event.data.text(),
    icon: 'https://raw.githubusercontent.com/Koramil05/PURA05/main/android-chrome-192x192.png',
    badge: 'https://raw.githubusercontent.com/Koramil05/PURA05/main/favicon-32x32.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('Kas Pura', options)
  );
});
