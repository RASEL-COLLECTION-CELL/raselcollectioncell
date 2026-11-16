// Rasel Collection Cell - SW v2: cache aset statis + AUDIO (termasuk permintaan Range).
// HTML, JSON, script.google.com, dan semua non-GET TIDAK disentuh -> data selalu segar.
// Naikkan VERSI setiap kali mengganti logo/ikon/suara agar cache lama dibuang.
var VERSI = 'rcc-static-v3';
var MAX_ITEM = 120;
var ISI = {};
var AUDIO = /\.(mp3|m4a|aac|ogg|opus|wav)$/i;
var STATIS = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i;

// Suara yang hampir pasti dipakai: diunduh sekali saat SW dipasang (gagal satu file tidak membatalkan).
var PRE = [
  'rk-100.mp3', 'rk-pagi.mp3', 'rk-siang.mp3', 'rk-sore.mp3', 'rk-malam.mp3', 'rk-sambutan.mp3',
  'rk-nama-setia.mp3', 'rk-hadiah.mp3', 'rk-klaim.mp3', 'rk-event.mp3', 'rk-event-klaim.mp3',
  'rk-login-gagal.mp3', 'rk-login-kunci.mp3', 'rk-login-blokir.mp3', 'rk-koneksi.mp3',
  'rk-pasang.mp3', 'rk-pasang-ok.mp3'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSI).then(function (c) {
      return Promise.all(PRE.map(function (f) {
        var u = new URL(f, self.registration.scope).href;
        return fetch(u).then(function (r) { if (r && r.ok && r.status === 200) return c.put(u, r); }).catch(function () {});
      }));
    }).catch(function () {})
  );
});

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

// Layani permintaan Range (audio/video elemen selalu memakainya) dari file penuh di cache.
function potong(res, rg) {
  var m = /bytes=(\d*)-(\d*)/.exec(rg || '');
  if (!m || (m[1] === '' && m[2] === '')) return Promise.resolve(res);
  return res.arrayBuffer().then(function (buf) {
    var total = buf.byteLength, s, e;
    if (m[1] === '') { s = total - Number(m[2]); e = total - 1; }
    else { s = Number(m[1]); e = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1); }
    if (isNaN(s) || s < 0 || s >= total || e < s) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
    }
    return new Response(buf.slice(s, e + 1), {
      status: 206,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(e - s + 1),
        'Content-Range': 'bytes ' + s + '-' + e + '/' + total,
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  var sama = url.origin === self.location.origin;
  var key = url.href;

  // AUDIO: cache-first, mendukung Range
  if (sama && AUDIO.test(url.pathname)) {
    var rg = req.headers.get('range');
    e.respondWith(
      caches.open(VERSI).then(function (c) {
        return c.match(key).then(function (hit) {
          if (hit) return rg ? potong(hit, rg) : hit;
          // belum ada di cache: teruskan ke jaringan TANPA menunggu (tidak menambah telat),
          // salinan penuh disimpan di latar belakang untuk pemutaran berikutnya
          if (!ISI[key]) {
            ISI[key] = 1;
            fetch(key).then(function (res) {
              if (res && res.ok && res.status === 200) return c.put(key, res);
            }).catch(function () {}).then(function () { delete ISI[key]; });
          }
          return fetch(req);
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  // Gambar/font: tampil dari cache, perbarui di latar belakang
  var statis = sama ? STATIS.test(url.pathname) : url.hostname === 'fonts.gstatic.com';
  if (!statis) return;                    // selain itu (HTML, mp4, API): biarkan browser
  if (req.headers.has('range')) return;

  e.respondWith(
    caches.open(VERSI).then(function (c) {
      return c.match(key).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
            c.put(key, res.clone()).then(function () {
              return c.keys().then(function (ks) { if (ks.length > MAX_ITEM) c.delete(ks[0]); });
            }).catch(function () {});
          }
          return res;
        });
        if (hit) { net.catch(function () {}); return hit; }
        return net;
      });
    }).catch(function () { return fetch(req); })
  );
});
