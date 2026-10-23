// 极简 service worker：缓存核心资源，离线可玩
const CACHE = 'five-v1';
const CORE = [
  './',
  './index.html',
  './main.js',
  './ai.js',
  './three.module.js',
  './vendor/OrbitControls.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 网络优先 + 缓存兜底：线上更新后不卡旧版，离线时仍可用
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true })
        .then(c => c || caches.match('./index.html'))
    )
  );
});
