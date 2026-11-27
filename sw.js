/* Spotter service worker. Two jobs: let the app open with no signal, and show notifications.
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

/* A push arrives empty. This asks Spotter's server what to show for this device, then shows it. */
var FN = 'https://wypwbwprnjpfmqzywddh.supabase.co/functions/v1/push';
self.addEventListener('push', function (e) {
  e.waitUntil((async function () {
    var items = [];
    try {
      var sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull', endpoint: sub.endpoint }) });
        items = ((await r.json()) || {}).items || [];
      }
    } catch (err) { /* no signal: fall through */ }
    /* phones require every push to show something */
    if (!items.length) items = [{ title: 'Spotter', body: 'Open the app to see what is new.', tag: 'spotter', url: '' }];
    for (var i = 0; i < items.length; i++) {
      var n = items[i];
      await self.registration.showNotification(n.title, { body: n.body || '', tag: n.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: n.url || '' } });
    }
  })());
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var hash = (e.notification.data && e.notification.data.url) || '';
  if (e.notification.tag === 'mobility') hash = '#routines';   /* straight to the routines, not the home screen */
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { if (hash && 'navigate' in list[i]) list[i].navigate(self.registration.scope + hash).catch(function () {}); return list[i].focus(); }
    }
    return self.clients.openWindow(self.registration.scope + hash);
  }));
});
