// Rasel Collection Cell - SW aman: hanya cache aset statis (gambar, audio, font).
// HTML, JSON, script.google.com, dan semua non-GET TIDAK disentuh -> data selalu segar.
// Naikkan VERSI setiap kali mengganti logo/ikon/suara agar cache lama dibuang.
var VERSI = 'rcc-static-v1';
var MAX_ITEM = 80;

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.filter(function (k) {
          return k.indexOf('rcc-static-') === 0 && k !== VERSI;
        }).map(function (k) { return caches.delete(k); }));
      })
      .catch(function () {})
      .then(function () { return self.clients.claim(); })
  );
});

function aset(url) {
  var sama = url.origin === self.location.origin;
  if (sama) return /\.(png|jpe?g|webp|gif|svg|ico|mp3|ogg|wav|woff2?)$/i.test(url.pathname);
  return url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (!aset(url)) return;               // selain aset statis: biarkan browser
  if (req.headers.has('range')) return; // audio/video range: biarkan

  e.respondWith(
    caches.open(VERSI).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
            c.put(req, res.clone()).then(function () {
              return c.keys().then(function (ks) {
                if (ks.length > MAX_ITEM) c.delete(ks[0]);
              });
            }).catch(function () {});
          }
          return res;
        });
        // stale-while-revalidate: tampil dari cache, perbarui di latar belakang
        if (hit) { net.catch(function () {}); return hit; }
        return net;
      });
    }).catch(function () { return fetch(req); })
  );
});
