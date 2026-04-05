const CACHE_NAME = 'nnjy-v1.0.3.6';

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
      .then(() => self.skipWaiting()) // 立即接管，不等舊 SW 結束
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
    ).then(() => self.clients.claim()) // 立即控制所有分頁
  );
});

// ── 攔截請求 ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase / Firestore / Google Auth → 不快取，直接走網路
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') && !FONT_HOSTS.includes(url.hostname) ||
    url.hostname.includes('gstatic.com') && !FONT_HOSTS.includes(url.hostname)
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // Google Fonts → Stale-While-Revalidate（優先快取，背景更新）
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

  // GitHub Pages 靜態資源（index.html、icon 等）→ Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // 離線且無快取時，回傳首頁（讓 app 能開啟）
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', {status: 503});
      });
    })
  );
});
