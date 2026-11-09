/* eslint-disable no-restricted-globals */
// =========================================================
// SERVICE WORKER — hanya untuk aplikasi kasir (/kasir) agar halamannya bisa dibuka tanpa internet.
//  - Halaman /kasir      : jaringan dulu (maks 4 detik), kalau gagal pakai salinan terakhir.
//  - File /assets/*      : sudah ber-hash (isi tidak pernah berubah) -> salinan dulu, lalu jaringan.
//  - Panggilan ke Supabase / domain lain & halaman SELMA lainnya : TIDAK disentuh sama sekali.
// Data penjualan (barang, promo, antrian transaksi) disimpan terpisah di IndexedDB oleh
// pages/kasir/kasirOffline.js, bukan di sini.
// =========================================================
const VERSI = "v1";
const C_SHELL = `kasir-shell-${VERSI}`;
const C_ASET = `kasir-aset-${VERSI}`;
const KUNCI_SHELL = "/kasir-shell";
const BATAS_ASET = 220;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const semua = await caches.keys();
      await Promise.all(semua.filter((k) => k.startsWith("kasir-") && k !== C_SHELL && k !== C_ASET).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const dalamWaktu = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

async function halamanKasir(req) {
  const cache = await caches.open(C_SHELL);
  try {
    const res = await dalamWaktu(fetch(req), 4000);
    if (res && res.ok) cache.put(KUNCI_SHELL, res.clone());
    return res;
  } catch {
    const salinan = await cache.match(KUNCI_SHELL);
    if (salinan) return salinan;
    return new Response("Kasir belum tersimpan untuk mode offline. Buka halaman kasir sekali saat internet menyala.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function pangkas(cache) {
  const kunci = await cache.keys();
  if (kunci.length <= BATAS_ASET) return;
  for (const k of kunci.slice(0, kunci.length - BATAS_ASET + 40)) await cache.delete(k);
}

async function asetSalinanDulu(req) {
  const cache = await caches.open(C_ASET);
  const ada = await cache.match(req);
  if (ada) return ada;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") {
    cache.put(req, res.clone()).then(() => pangkas(cache));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && /^\/kasir(\/|$)/.test(url.pathname)) {
    event.respondWith(halamanKasir(req));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(asetSalinanDulu(req));
  }
});
