/* Spotter service worker. One job for now: let the app open with no signal.
   Online, the page is always fetched fresh, so remote updates work the same as Tally's.
   Offline, the last copy that loaded is served. */
var CACHE = 'spotter-shell-1';
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'manifest.webmanifest', 'icon-192.png']).catch(function () {}); }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       /* the database and images go straight to the network */
  if (/version\.json$/.test(url.pathname)) return;                               /* never cached: it is how updates are found */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); });
      return res;
    }).catch(function () { return caches.match('./'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } return res; });
    return hit || net;
  }));
});
