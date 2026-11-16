// Rasel Collection Cell - SW aman: hanya cache aset statis (gambar, audio, font).
// HTML, JSON, script.google.com, dan semua non-GET TIDAK disentuh -> data selalu segar.
// Naikkan VERSI setiap kali mengganti logo/ikon/suara agar cache lama dibuang.
var VERSI = 'rcc-static-v4';
var MAX_ITEM = 200;
var sedang = {};   // unduhan penuh mp3 yang sedang berjalan (cegah unduh ganda dari banyak permintaan Range)

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

// mp3 rk-*: HP selalu meminta audio dengan header Range, jadi dulu tidak pernah masuk cache.
// Belum ada di cache -> layani langsung dari jaringan (tanpa menunggu) dan simpan file utuh di latar belakang.
// Sudah ada di cache -> layani potongan Range dari cache.
function potong(e, req, url) {
  var m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  return caches.open(VERSI).then(function (c) {
    return c.match(url.href).then(function (hit) {
      if (!hit || !m) {
        if (!hit && !sedang[url.href]) {
          sedang[url.href] = 1;
          e.waitUntil(fetch(url.href).then(function (res) {
            if (res && res.ok && res.status === 200) return c.put(url.href, res);
          }).catch(function () {}).then(function () { delete sedang[url.href]; }));
        }
        return fetch(req);
      }
      return hit.arrayBuffer().then(function (buf) {
        var n = buf.byteLength, a, b;
        if (m[1] === '') { a = Math.max(0, n - (+m[2])); b = n - 1; }
        else { a = +m[1]; b = m[2] === '' ? n - 1 : Math.min(+m[2], n - 1); }
        if (!(a <= b) || a >= n) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + n } });
        return new Response(buf.slice(a, b + 1), { status: 206, statusText: 'Partial Content', headers: {
          'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Length': String(b - a + 1),
          'Content-Range': 'bytes ' + a + '-' + b + '/' + n,
          'Accept-Ranges': 'bytes' } });
      });
    });
  }).catch(function () { return fetch(req); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (!aset(url)) return;               // selain aset statis: biarkan browser
  if (req.headers.has('range')) {         // audio/video range: biarkan, kecuali mp3 rk-*
    if (url.origin === self.location.origin && /\/rk-[a-z0-9._-]+\.mp3$/i.test(url.pathname)) e.respondWith(potong(e, req, url));
    return;
  }

  e.respondWith(
    caches.open(VERSI).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
            c.put(req, res.clone()).then(function () {
              return c.keys().then(function (ks) {
                if (ks.length > MAX_ITEM) {
                  // buang yang tertua, tetapi jangan rekaman suara rk-*.mp3 selama masih ada aset lain
                  var buang = ks.filter(function (k) { return !/\/rk-[a-z0-9._-]+\.mp3$/i.test(k.url); })[0] || ks[0];
                  c.delete(buang);
                }
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
