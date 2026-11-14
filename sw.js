/* Manga Tracker – starts the app from the device cache.
 * App page: shown from the cache immediately. The page itself checks the version number before it becomes
 * visible and replaces the cached page when a newer one is out (see tools/build.py), so an old version is not shown.
 * Fonts: cached once. Calls to Google (your list) and version.json are never cached here. */
var VERSION = 'v2.10.1';   // set by tools/build.py; a new number makes the device install this file again
var CACHE = 'mt-shell-v2';
var SHELL = ['index.html', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-32.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(u, { cache: 'reload' }).then(function (res) { if (res.ok) return c.put(u, res); });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/\/version\.json$/.test(url.pathname) || url.search) return;   // always from the network
    var nav = req.mode === 'navigate';
    var key = nav ? 'index.html' : req;
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(key).then(function (hit) {
        // refresh the cached copy in the background (the page is asked for fresh, not from the browser's own 10-minute cache)
        var net = (nav ? fetch('index.html', { cache: 'no-cache' }) : fetch(req)).then(function (res) {
          if (res && res.ok) c.put(key, res.clone());
          return res;
        }).catch(function () { return hit; });
        if (hit) { e.waitUntil(net); return hit; }
        return net;
      });
    }));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; });
      });
    }));
  }
});
