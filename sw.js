const CACHE_NAME = 'nnjy-v1.0.9.8';

// 本地靜態資源
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Google Fonts（字體 CSS + 字體檔）
const FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── 安裝：快取靜態資源 ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── 激活：清除舊快取 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── 攔截請求 ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase / Firestore / Google Auth → 不快取
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') && !FONT_HOSTS.includes(url.hostname) ||
    url.hostname.includes('gstatic.com') && !FONT_HOSTS.includes(url.hostname) ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.hostname === 'api.github.com'
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // 音頻檔案（mp3/m4a/json in audio/）→ 不快取，直接走網路（IDB 自己管）
  if (url.pathname.includes('/audio/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // Google Fonts → Stale-While-Revalidate
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(response => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => null);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 只處理 http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 靜態資源 → Network First（優先拿最新版，失敗才用快取）
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok && url.protocol === 'https:') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(e.request).then(cached => {
        if (cached) return cached;
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', {status: 503});
      });
    })
  );
});
