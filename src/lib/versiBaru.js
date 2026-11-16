// =========================================================
// DETEKSI VERSI BARU -> MUAT ULANG OTOMATIS (hard refresh).
// Tiap build (npm run build) membuat /version.json berisi id build (lihat vite.config.js), dan id yang sama ditanam
// di kode aplikasi (__BUILD_ID__). Tab yang sudah lama terbuka membandingkan keduanya; kalau beda berarti sudah ada
// deploy baru -> halaman dimuat ulang supaya memakai versi terakhir.
// Kapan dicek & kapan dimuat ulang:
//  - Tab kembali terlihat setelah tersembunyi >= 1 menit, atau internet kembali menyala, atau tiap 5 menit  -> cek versi.
//  - Kalau ada versi baru: muat ulang HANYA kalau pengguna sedang tidak menyentuh halaman (tidak mengetik / klik / sentuh)
//    selama JEDA_DIAM, supaya isian form & keranjang kasir yang sedang dikerjakan tidak hilang.
//    Tab yang baru saja dibuka lagi setelah lama tersembunyi dianggap diam (belum ada yang disentuh).
//  - Gagal mengambil version.json (offline, dll.) -> tidak melakukan apa-apa (kasir offline tetap aman).
//  - Pengaman lingkaran reload: id versi yang sama tidak memicu reload lagi dalam 2 menit.
// =========================================================
const JEDA_CEK_MS = 5 * 60 * 1000;
const JEDA_DIAM_MS = 3 * 60 * 1000; // tidak ada aktivitas selama ini = aman dimuat ulang
const SEMBUNYI_MIN_MS = 60 * 1000;
const KUNCI = "selma-versi-reload";

let aktifTerakhir = Date.now();
let sembunyiSejak = 0;
let mengecek = false;

const tandaiAktif = () => {
  aktifTerakhir = Date.now();
};

async function ambilVersiServer() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.id ? String(j.id) : null;
  } catch {
    return null;
  }
}

function sudahReloadBaruBaru(idServer) {
  try {
    const s = JSON.parse(sessionStorage.getItem(KUNCI) || "null");
    return !!s && s.id === idServer && Date.now() - s.t < 2 * 60 * 1000;
  } catch {
    return false;
  }
}

function muatUlang(idServer) {
  try {
    sessionStorage.setItem(KUNCI, JSON.stringify({ id: idServer, t: Date.now() }));
  } catch {
    /* abaikan */
  }
  window.location.reload();
}

async function cek({ anggapDiam = false } = {}) {
  if (mengecek) return;
  mengecek = true;
  try {
    const idServer = await ambilVersiServer();
    if (!idServer || idServer === __BUILD_ID__) return;
    if (sudahReloadBaruBaru(idServer)) return;
    const diam = anggapDiam || Date.now() - aktifTerakhir >= JEDA_DIAM_MS;
    if (diam) muatUlang(idServer);
  } finally {
    mengecek = false;
  }
}

export function pasangCekVersi() {
  if (typeof __BUILD_ID__ === "undefined") return;
  ["keydown", "pointerdown", "touchstart", "input"].forEach((e) => window.addEventListener(e, tandaiAktif, { passive: true, capture: true }));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      sembunyiSejak = Date.now();
    } else if (sembunyiSejak && Date.now() - sembunyiSejak >= SEMBUNYI_MIN_MS) {
      sembunyiSejak = 0;
      cek({ anggapDiam: true });
    }
  });
  window.addEventListener("online", () => cek());
  setInterval(() => {
    if (document.visibilityState === "visible") cek();
  }, JEDA_CEK_MS);
}
