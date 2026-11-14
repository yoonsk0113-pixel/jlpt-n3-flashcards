// 오프라인 지원: 앱 파일을 미리 캐시하고, 온라인이면 최신 파일을 받아 캐시를 갱신하며, 오프라인이면 캐시로 응답합니다.
// CSS·화면·학습 데이터는 index.html, 학습 도메인 로직은 core.js, 예문·연어는 vocab-content.js에 있습니다. ASSETS를 바꿀 때는 CACHE 이름의 숫자를 올립니다.
const CACHE = 'jlpt-n3-v3';
const ASSETS = ['./', './index.html', './core.js', './vocab-content.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 네트워크 우선: main 배포가 곧바로 반영되고, 연결이 없을 때만 캐시를 씁니다.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
