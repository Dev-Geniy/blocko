// Service Worker Blocko Pro
//
// Страницы и скрипты сайта — «сначала сеть»: пользователь всегда получает свежую версию,
// а кэш нужен только для работы без интернета. Раньше ядро отдавалось из кэша
// (stale-while-revalidate), и после обновления сайта люди неделями видели старые файлы
// вперемешку с новыми.
const VERSION = 'v7';
const CORE_CACHE_NAME = `blocko-pro-core-${VERSION}`;
const MEDIA_CACHE_NAME = 'blocko-media-cache-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './board.html',
  './my-tasks.html',
  './archive.html',
  './calendar.html',
  './store.html',
  './config.js',
  './security.js',
  './api.js',
  './chat.js',
  './home.js',
  './ui.css',
  './manifest.json'
];

const IMGBB_URL_PATTERN = /^https:\/\/i\.ibb\.co\//;
const MEDIA_CACHE_LIMIT = 300;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CORE_CACHE_NAME)
      // Один отсутствующий файл не должен ломать установку всего воркера
      .then((cache) => Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => null))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => {
        if (name !== CORE_CACHE_NAME && name !== MEDIA_CACHE_NAME) return caches.delete(name);
        return null;
      })))
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxItems; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Картинки ImgBB: «сначала кэш», они не меняются
  if (IMGBB_URL_PATTERN.test(req.url)) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(MEDIA_CACHE_NAME)
            .then((cache) => cache.put(req, copy))
            .then(() => trimCache(MEDIA_CACHE_NAME, MEDIA_CACHE_LIMIT));
        }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Чужие домены (Firebase, CDN, PayPal, аналитика) не трогаем
  if (url.origin !== self.location.origin) return;

  // Свои файлы: «сначала сеть», при офлайне — из кэша
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CORE_CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});

// Нажатие на уведомление (новое сообщение в чате, дедлайн задачи):
// открываем уже открытую вкладку доски или новую, и сразу показываем чат
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (data.type === 'dm') {
      // Личное сообщение: открываем диалог на главной (или в любой открытой вкладке сайта)
      const home = windows.find((w) => { try { return /(^|\/)(index\.html)?$/.test(new URL(w.url).pathname); } catch (e) { return false; } });
      if (home) { await home.focus(); home.postMessage({ type: 'blocko-open-dm', threadId: data.threadId }); return; }
      if (self.clients.openWindow) await self.clients.openWindow(target);
      return;
    }
    const sameBoard = data.boardId
      ? windows.find((w) => { try { return new URL(w.url).searchParams.get('b') === data.boardId; } catch (e) { return false; } })
      : windows[0];
    if (sameBoard) {
      await sameBoard.focus();
      if (data.type === 'chat') sameBoard.postMessage({ type: 'blocko-open-chat', boardId: data.boardId });
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
