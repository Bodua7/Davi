/* Service worker cho app Quán Ăn.
   Đổi CACHE_NAME (vd v2, v3...) mỗi khi muốn ép người dùng cũ tải bản mới. */
const CACHE_NAME = 'quanan-cache-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Không đụng vào request tới Google Apps Script (API) hay bất kỳ domain khác -
  // luôn để trình duyệt gọi mạng trực tiếp, không cache, tránh dữ liệu cũ/lỗi CORS.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Chỉ xử lý GET; POST (đăng nhập, lưu dữ liệu...) luôn đi thẳng ra mạng.
  if (req.method !== 'GET') {
    return;
  }

  // App shell (HTML): ưu tiên lấy bản mới nhất từ mạng trước, cache chỉ là dự phòng
  // khi mất mạng - tránh tình trạng bị kẹt bản cũ khi đã sửa code.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Các file tĩnh khác (manifest, icon...): cache trước, mạng dự phòng.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
