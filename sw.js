const CACHE_NAME = 'thuchi-v3-supabase';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Chỉ xử lý GET, bỏ qua các request khác (POST/PATCH/DELETE lên Supabase)
  if (event.request.method !== 'GET') return;

  // Không cache dữ liệu động từ Supabase - luôn lấy bản mới nhất từ mạng,
  // để mở app trên nhiều thiết bị đều thấy đúng dữ liệu hiện tại
  if (event.request.url.indexOf('supabase.co') !== -1) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        // Cache lại các file tĩnh hợp lệ để dùng offline lần sau
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Không có mạng và không có cache -> trả về trang chính nếu là điều hướng
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
