// ЭНТЕРПРАЙЗ: Интегрированный Service Worker ядра и медиа Blocko Pro
const CORE_CACHE_NAME = 'blocko-pro-core-v2';
const MEDIA_CACHE_NAME = 'blocko-media-cache-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './board.html',
  './my-tasks.html',
  './archive.html',
  './store.html',
  './products.html',
  './updates.html',
  './config.js',
  './manifest.json'
];

const IMGBB_URL_PATTERN = /^https:\/\/i\.ibb\.co\//;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CORE_CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CORE_CACHE_NAME && cacheName !== MEDIA_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Enterprise-защита: Игнорируем не-GET запросы и реалтайм-потоки внешних БД/API
  if (e.request.method !== 'GET' || 
      url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebasestorage.googleapis.com') || 
      url.hostname.includes('api.imgbb.com')) {
    return;
  }

  // 1. Логика кэширования для медиа-ресурсов (ImgBB)
  if (IMGBB_URL_PATTERN.test(e.request.url)) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        // Возвращаем из кэша мгновенно (0ms), если есть
        if (cachedResponse) return cachedResponse; 
        
        return fetch(e.request).then((networkResponse) => {
          // Игнорируем некорректные ответы. Cross-origin картинки могут отдавать статус 0 (opaque), это нормально
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(MEDIA_CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          // Игнорируем ошибку сети для медиа, карточка просто отрисуется без картинки
        });
      })
    );
    return; // Завершаем выполнение, чтобы не сработала логика ядра
  }

  // 2. Стратегия Stale-while-revalidate для ядра приложения
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // Кэшируем только успешные локальные запросы
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CORE_CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Офлайн фоллбэк: если нет сети, просто отдаем то, что есть в кэше
        return cachedResponse; 
      });

      // Возвращаем кэш сразу (0ms latency), если он есть, иначе ждем сеть
      return cachedResponse || fetchPromise;
    })
  );
});
