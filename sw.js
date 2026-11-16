// Rasel Collection Cell - SW aman: hanya cache aset statis (gambar, audio, font).
// HTML, JSON, script.google.com, dan semua non-GET TIDAK disentuh -> data selalu segar.
// Naikkan VERSI setiap kali mengganti logo/ikon (aset statis non-audio).
// AUDIO rk-*.mp3 punya cache SENDIRI ('rcc-audio-<v>'), versinya dibaca dari ?v= pada URL (diatur AUDIO_VER di index.html):
//   - tidak ikut dipangkas MAX_ITEM, tidak ikut terhapus saat VERSI aset berubah, tidak diunduh ulang selama versi sama.
var VERSI = 'rcc-static-v3';
var MAX_ITEM = 80;
var AUDIO_PREFIX = 'rcc-audio-';
var AUDIO_HOST = 'rasel-collection-cell.github.io';   // halaman bisa dibuka dari domain lain, audio tetap di sini

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.filter(function (k) {
          return k.indexOf('rcc-static-') === 0 && k !== VERSI;   // cache 'rcc-audio-*' sengaja TIDAK disentuh
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

/* ---------- AUDIO rk-*.mp3 ---------- */
function audioUrl(url) {
  return /\/rk-[a-z0-9._-]+\.mp3$/i.test(url.pathname) && (url.origin === self.location.origin || url.hostname === AUDIO_HOST);
}
function namaCacheAudio(url) {
  return AUDIO_PREFIX + String(url.searchParams.get('v') || '0').replace(/[^a-z0-9._-]/gi, '').slice(0, 16);
}
// isi harus wajar: ukuran, panjang sesuai header, dan awalan MP3 (menolak halaman error berstatus 200)
function sahAb(ab, res) {
  try {
    if (!ab || ab.byteLength < 512 || ab.byteLength > 8388608) return false;
    var cl = Number(res.headers.get('content-length'));
    if (cl > 0 && !res.headers.get('content-encoding') && cl !== ab.byteLength) return false;
    var u = new Uint8Array(ab, 0, 3);
    return (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) || (u[0] === 0xFF && (u[1] & 0xE0) === 0xE0);
  } catch (x) { return false; }
}
function tandai(ab) {   // header X-RK-Ok = entri sudah divalidasi (sama dengan yang ditulis halaman)
  return new Response(ab, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(ab.byteLength), 'X-RK-Ok': '1' } });
}
var jalan = {};   // unduhan penuh yang sedang berjalan: cegah unduhan ganda untuk file yang sama
function simpanPenuh(c, url) {
  if (jalan[url.href]) return jalan[url.href];
  return (jalan[url.href] = fetch(url.href).then(function (res) {
    if (!res || res.status !== 200) return;
    return res.arrayBuffer().then(function (ab) { if (sahAb(ab, res)) return c.put(url.href, tandai(ab)); });
  }).catch(function () {}).then(function () { delete jalan[url.href]; }));
}
function audio(e, req, url) {
  var rangeHdr = req.headers.get('range') || '';
  var m = /^bytes=(\d*)-(\d*)$/.exec(rangeHdr);
  return caches.open(namaCacheAudio(url)).then(function (c) {
    return c.match(url.href).then(function (hit) {
      if (hit && hit.headers.get('X-RK-Ok') !== '1') hit = null;   // entri tak bertanda dianggap tidak valid
      if (!hit) {
        if (rangeHdr) {   // HP selalu minta Range: layani dari jaringan sekarang, simpan file utuh di latar belakang
          e.waitUntil(simpanPenuh(c, url));
          return fetch(req);
        }
        return fetch(req).then(function (res) {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            var cl = res.clone();
            e.waitUntil(cl.arrayBuffer().then(function (ab) { if (sahAb(ab, cl)) return c.put(url.href, tandai(ab)); }).catch(function () {}));
          }
          return res;
        });
      }
      if (!m) return hit;   // tanpa Range: kembalikan dari cache, TIDAK diperbarui ke jaringan
      return hit.arrayBuffer().then(function (buf) {
        var n = buf.byteLength, a, b;
        if (m[1] === '') { a = Math.max(0, n - (+m[2])); b = n - 1; }
        else { a = +m[1]; b = m[2] === '' ? n - 1 : Math.min(+m[2], n - 1); }
        if (!(a <= b) || a >= n) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + n } });
        return new Response(buf.slice(a, b + 1), { status: 206, statusText: 'Partial Content', headers: {
          'Content-Type': 'audio/mpeg',
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
  if (audioUrl(url)) { e.respondWith(audio(e, req, url)); return; }   // audio rk-*: cache khusus, cache-first
  if (!aset(url)) return;               // selain aset statis: biarkan browser
  if (req.headers.has('range')) return; // audio/video range lain: biarkan

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
