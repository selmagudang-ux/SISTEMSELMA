import { useSyncExternalStore } from "react";
import { sb, entitasSesi } from "../../lib/api";
import { kirimPayload, muatMaster, siapkanKeuangan } from "./kasirApi";

// =========================================================
// KASIR — MODE OFFLINE
// Tujuan: kasir tetap bisa JUALAN walau internet / server putus.
//
//  1. Data yang dibutuhkan untuk berjualan (barang toko, promo, master rekening, shift aktif)
//     disalin ke IndexedDB tiap kali berhasil dimuat online, dan dipakai kalau koneksi gagal.
//  2. Transaksi saat offline tidak dikirim ke server, tapi DIANTRIKAN di IndexedDB
//     (struk tetap tercetak, laci tetap terbuka, stok di layar ikut berkurang).
//  3. Antrian dikirim ulang otomatis begitu server terjangkau lagi. Pengiriman memakai `kunci`
//     transaksi yang sama dengan jalur online, jadi transaksi yang sama TIDAK tersimpan dobel
//     walau pengiriman ulang atau respons server sempat hilang.
//
// Yang SENGAJA tetap butuh internet: login, buka shift, tutup shift, void, retur, riwayat.
// Tutup Kasir diblokir selama masih ada transaksi yang belum terkirim.
// =========================================================

const DB_NAMA = "selma-kasir";
const DB_VERSI = 1;
const S_CACHE = "cache"; // key -> { waktu, data }
const S_ANTRIAN = "antrian"; // keyPath: kunci
const S_SELESAI = "selesai"; // keyPath: kunci (log kecil: nomor sementara -> nomor resmi)
const MAKS_SELESAI = 100;
const JEDA_SINKRON_MS = 15000;
const TIMEOUT_KIRIM_MS = 30000;
const TIMEOUT_SIMPAN_ONLINE_MS = 15000;
export const TIMEOUT_TRANSAKSI_MS = TIMEOUT_SIMPAN_ONLINE_MS;

// ---------------------------------------------------------
// Status yang bisa dibaca komponen (useStatusKasir)
// ---------------------------------------------------------
let snap = {
  offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
  menunggu: 0, // transaksi di antrian yang akan dikirim otomatis
  perluTindakan: 0, // transaksi yang ditolak server (stok/harga/shift) — butuh keputusan manusia
  menyinkron: false,
  penyimpananAman: true, // false = IndexedDB tidak bisa dipakai; antrian hanya di memori (hilang saat ditutup)
  terakhirSinkron: null,
};
const pendengar = new Set();
function ubah(patch) {
  let beda = false;
  for (const k of Object.keys(patch)) {
    if (snap[k] !== patch[k]) {
      beda = true;
      break;
    }
  }
  if (!beda) return;
  snap = { ...snap, ...patch };
  pendengar.forEach((f) => {
    try {
      f();
    } catch {
      /* pendengar rusak tidak boleh mengganggu yang lain */
    }
  });
}
const langgan = (f) => {
  pendengar.add(f);
  return () => pendengar.delete(f);
};
export const statusSekarang = () => snap;
export function useStatusKasir() {
  return useSyncExternalStore(langgan, statusSekarang, statusSekarang);
}

const pendengarSinkron = new Set();
// Dipanggil setiap ada transaksi antrian yang berhasil terkirim (layar kasir memuat ulang stok).
export function padaTersinkron(fn) {
  pendengarSinkron.add(fn);
  return () => pendengarSinkron.delete(fn);
}

export const tandaiOnline = () => ubah({ offline: false });
export function tandaiOffline() {
  ubah({ offline: true });
  mulaiPenjadwal();
}

// ---------------------------------------------------------
// Penyimpanan: IndexedDB, dengan cadangan memori kalau IndexedDB tidak tersedia
// ---------------------------------------------------------
const MEMORI = { [S_CACHE]: new Map(), [S_ANTRIAN]: new Map(), [S_SELESAI]: new Map() };
let dbPromise = null;

function bukaDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAMA, DB_VERSI);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(S_CACHE)) db.createObjectStore(S_CACHE);
        if (!db.objectStoreNames.contains(S_ANTRIAN)) db.createObjectStore(S_ANTRIAN, { keyPath: "kunci" });
        if (!db.objectStoreNames.contains(S_SELESAI)) db.createObjectStore(S_SELESAI, { keyPath: "kunci" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function jalan(store, mode, buatReq, memori) {
  const db = await bukaDb();
  if (db) {
    try {
      return await new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = buatReq(t.objectStore(store));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error || new Error("IndexedDB gagal"));
        t.onabort = () => reject(t.error || new Error("IndexedDB dibatalkan"));
      });
    } catch {
      /* jatuh ke memori */
    }
  }
  if (store === S_ANTRIAN) ubah({ penyimpananAman: false });
  return memori(MEMORI[store]);
}

const idbGet = (store, key) => jalan(store, "readonly", (s) => s.get(key), (m) => m.get(key));
const idbAll = async (store) => (await jalan(store, "readonly", (s) => s.getAll(), (m) => [...m.values()])) || [];
const idbPutKunci = (store, val) =>
  jalan(store, "readwrite", (s) => s.put(val), (m) => {
    m.set(val.kunci, val);
  });
const idbDel = (store, key) =>
  jalan(store, "readwrite", (s) => s.delete(key), (m) => {
    m.delete(key);
  });

// Cache per entitas (PT) supaya data satu PT tidak terbaca di PT lain di perangkat yang sama.
const kEnt = (nama) => `${nama}|${entitasSesi()}`;
export async function simpanCacheEnt(nama, data) {
  const nilai = { waktu: Date.now(), data };
  try {
    await jalan(S_CACHE, "readwrite", (s) => s.put(nilai, kEnt(nama)), (m) => {
      m.set(kEnt(nama), nilai);
    });
  } catch {
    /* cache bersifat membantu saja — gagal simpan tidak boleh mengganggu penjualan */
  }
}
// Mengembalikan { waktu, data } atau null.
export async function bacaCacheEnt(nama) {
  try {
    return (await idbGet(S_CACHE, kEnt(nama))) || null;
  } catch {
    return null;
  }
}
export async function hapusCacheEnt(nama) {
  try {
    await jalan(S_CACHE, "readwrite", (s) => s.delete(kEnt(nama)), (m) => {
      m.delete(kEnt(nama));
    });
  } catch {
    /* abaikan */
  }
}

// ---------------------------------------------------------
// Klasifikasi galat
// ---------------------------------------------------------
// Kode penolakan bisnis dari fungsi database kasir_simpan_transaksi.
const KODE_BISNIS = /(STOK_KURANG|HARGA_BERUBAH|SKU_TIDAK_ADA|SKU_NONAKTIF|REKENING_KATEGORI_KOSONG|PEMBAYARAN_TIDAK_SAMA|SHIFT_BELUM_BUKA|SHIFT_TIDAK_AKTIF|SHIFT_SUDAH_TUTUP)/;
export const kodeBisnis = (err) => String(err?.message || err || "").match(KODE_BISNIS)?.[1] || null;

// true = masalahnya koneksi/server tidak terjangkau (bukan penolakan aturan). Aman diulang karena
// transaksi punya kunci unik.
export function adalahGalatJaringan(err) {
  if (kodeBisnis(err)) return false;
  if (err?.pgCode) return false;
  const msg = String(err?.message || err || "");
  if (/Sesi login berakhir/i.test(msg)) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /Failed to fetch|NetworkError|Load failed|Network request failed|terlalu lambat|AbortError|aborted|timeout|timed out|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION|Bad Gateway|Service Unavailable|Gateway Time-?out|\b(502|503|504|522|523|524)\b/i.test(msg);
}

function pesanSinkron(err) {
  const msg = String(err?.message || err || "");
  const [kode, a, b] = (msg.match(/[A-Z_]{4,}(\|[^\n]*)?/)?.[0] || "").split("|");
  const rp = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;
  switch (kodeBisnis(err) || kode) {
    case "STOK_KURANG":
      return `Stok ${a} di server tinggal ${b}, kurang dari yang terjual.`;
    case "HARGA_BERUBAH":
      return `Harga ${a} di server sudah berubah menjadi ${rp(b)}.`;
    case "SKU_TIDAK_ADA":
    case "SKU_NONAKTIF":
      return `${a} sudah tidak ada / tidak aktif di Master Barang Toko.`;
    case "REKENING_KATEGORI_KOSONG":
      return `Rekening/kategori untuk ${a} belum diatur.`;
    case "PEMBAYARAN_TIDAK_SAMA":
      return "Jumlah pembayaran tidak sama dengan total.";
    case "SHIFT_BELUM_BUKA":
    case "SHIFT_TIDAK_AKTIF":
    case "SHIFT_SUDAH_TUTUP":
      return "Shift transaksi ini sudah tidak aktif di server.";
    default:
      return msg || "Gagal mengirim";
  }
}

// ---------------------------------------------------------
// Antrian transaksi
// ---------------------------------------------------------
function kodePerangkat() {
  try {
    let k = localStorage.getItem("kasir_perangkat");
    if (!k) {
      k = Math.random().toString(36).slice(2, 4).toUpperCase();
      localStorage.setItem("kasir_perangkat", k);
    }
    return k;
  } catch {
    return "XX";
  }
}

// Nomor sementara untuk struk offline, mis. OFF-261109-K3-001. Nomor resmi (dari server)
// baru ada setelah terkirim; pasangannya tercatat di daftar "Sudah terkirim" pada panel antrian.
async function nomorSementara() {
  const tgl = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).replace(/-/g, "").slice(2);
  const kunciCtr = `ctr:${tgl}`;
  let n = 1;
  try {
    const sebelum = await idbGet(S_CACHE, kunciCtr);
    n = (Number(sebelum) || 0) + 1;
    await jalan(S_CACHE, "readwrite", (s) => s.put(n, kunciCtr), (m) => {
      m.set(kunciCtr, n);
    });
  } catch {
    n = Math.floor(Date.now() / 1000) % 1000;
  }
  return `OFF-${tgl}-${kodePerangkat()}-${String(n).padStart(3, "0")}`;
}

const hasilDariEntry = (e) => ({
  nomor: e.nomorSementara,
  waktu: e.waktu,
  total: e.ringkas?.total ?? 0,
  bayar: e.ringkas?.bayar ?? 0,
  kembalian: e.ringkas?.kembalian ?? 0,
  duplikat: false,
  antri: true,
});

// payload = hasil bangunPayload() (kasirApi). ringkas = { total, bayar, kembalian, jumlahItem, metode }.
export async function antrikanTransaksi({ payload, ringkas }) {
  const ada = await idbGet(S_ANTRIAN, payload.kunci);
  if (ada) return hasilDariEntry(ada); // tombol Bayar ditekan ulang: jangan buat entri kedua
  const waktu = new Date().toISOString();
  const entry = {
    kunci: payload.kunci,
    payload: { ...payload, waktu_klien: waktu },
    ringkas,
    nomorSementara: await nomorSementara(),
    waktu,
    status: "menunggu",
    pesan: "",
    percobaan: 0,
    dibuat: Date.now(),
  };
  await idbPutKunci(S_ANTRIAN, entry);
  await segarkanHitungan();
  mulaiPenjadwal();
  return hasilDariEntry(entry);
}

async function segarkanHitungan() {
  const semua = await idbAll(S_ANTRIAN);
  ubah({
    menunggu: semua.filter((e) => e.status !== "perlu_tindakan").length,
    perluTindakan: semua.filter((e) => e.status === "perlu_tindakan").length,
  });
  return semua;
}

export async function daftarAntrian() {
  return (await idbAll(S_ANTRIAN)).sort((a, b) => a.dibuat - b.dibuat);
}
export async function daftarSelesai() {
  return (await idbAll(S_SELESAI)).sort((a, b) => b.selesai - a.selesai);
}
export async function jumlahBelumTerkirim() {
  return (await segarkanHitungan()).length;
}
export async function hapusAntrian(kunci) {
  await idbDel(S_ANTRIAN, kunci);
  await segarkanHitungan();
}

// Jumlah per SKU yang sudah terjual di perangkat ini tapi belum tercatat di server — dikurangkan
// dari stok yang tampil supaya barang yang sama tidak terjual melebihi stok saat offline.
export async function qtyDiAntrian() {
  const peta = new Map();
  try {
    for (const e of await idbAll(S_ANTRIAN)) {
      for (const it of e.payload?.items || []) peta.set(it.sku, (peta.get(it.sku) || 0) + (Number(it.qty) || 0));
    }
  } catch {
    /* tanpa antrian: stok apa adanya */
  }
  return peta;
}

async function catatSelesai(e, res) {
  try {
    await idbPutKunci(S_SELESAI, {
      kunci: e.kunci,
      nomorSementara: e.nomorSementara,
      nomorResmi: res?.nomor || "",
      waktu: e.waktu,
      total: e.ringkas?.total ?? 0,
      selesai: Date.now(),
    });
    const semua = (await idbAll(S_SELESAI)).sort((a, b) => b.selesai - a.selesai);
    for (const lama of semua.slice(MAKS_SELESAI)) await idbDel(S_SELESAI, lama.kunci);
  } catch {
    /* log pelengkap saja */
  }
}

// ---------------------------------------------------------
// Pengiriman ulang
// ---------------------------------------------------------
let sedangKirim = false;

async function denganKunciLintasTab(fn) {
  try {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return await navigator.locks.request("selma-kasir-sinkron", { ifAvailable: true }, async (lock) => (lock ? fn() : null));
    }
  } catch {
    /* tanpa Web Locks: kunci unik transaksi tetap mencegah dobel */
  }
  return fn();
}

// paksa = true: ikut mencoba ulang transaksi berstatus "perlu_tindakan".
export async function kirimAntrian({ paksa = false } = {}) {
  if (sedangKirim) return { dikirim: 0 };
  sedangKirim = true;
  ubah({ menyinkron: true });
  let dikirim = 0;
  try {
    await denganKunciLintasTab(async () => {
      const semua = (await idbAll(S_ANTRIAN)).sort((a, b) => a.dibuat - b.dibuat);
      for (const e of semua) {
        if (e.status === "perlu_tindakan" && !paksa) continue;
        try {
          const res = await kirimPayload(e.payload, { timeoutMs: TIMEOUT_KIRIM_MS });
          await idbDel(S_ANTRIAN, e.kunci);
          await catatSelesai(e, res);
          dikirim++;
          ubah({ offline: false });
        } catch (err) {
          if (kodeBisnis(err)) {
            // Server menolak karena aturan (stok/harga/shift). Jangan dicoba otomatis lagi.
            await idbPutKunci(S_ANTRIAN, { ...e, status: "perlu_tindakan", pesan: pesanSinkron(err), percobaan: (e.percobaan || 0) + 1 });
            continue;
          }
          if (adalahGalatJaringan(err)) {
            ubah({ offline: true });
            await idbPutKunci(S_ANTRIAN, { ...e, pesan: "Menunggu koneksi…", percobaan: (e.percobaan || 0) + 1 });
          } else {
            // Galat lain (mis. sesi login berakhir, server error): tetap di antrian, coba lagi nanti.
            await idbPutKunci(S_ANTRIAN, { ...e, pesan: String(err?.message || err || "Gagal mengirim"), percobaan: (e.percobaan || 0) + 1 });
          }
          break;
        }
      }
    });
  } finally {
    sedangKirim = false;
    await segarkanHitungan();
    ubah({ menyinkron: false, ...(dikirim ? { terakhirSinkron: Date.now() } : {}) });
  }
  if (dikirim) pendengarSinkron.forEach((f) => {
    try {
      f(dikirim);
    } catch {
      /* abaikan */
    }
  });
  return { dikirim };
}

export async function cobaLagi(kunci) {
  const e = await idbGet(S_ANTRIAN, kunci);
  if (e) await idbPutKunci(S_ANTRIAN, { ...e, status: "menunggu", pesan: "" });
  await segarkanHitungan();
  return kirimAntrian({ paksa: true });
}

// Ping ringan ke server. true = terjangkau.
export async function periksaKoneksi() {
  try {
    await sb("master_data?select=id&limit=1", { timeoutMs: 6000 });
    ubah({ offline: false });
    return true;
  } catch (e) {
    if (adalahGalatJaringan(e)) {
      ubah({ offline: true });
      return false;
    }
    ubah({ offline: false }); // server menjawab (galat aplikasi) = terhubung
    return true;
  }
}

let penjadwal = null;
export function mulaiPenjadwal() {
  if (penjadwal || typeof window === "undefined") return;
  const tick = async () => {
    await segarkanHitungan();
    if (snap.offline) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!(await periksaKoneksi())) return;
    }
    if (snap.menunggu > 0) await kirimAntrian();
  };
  penjadwal = setInterval(tick, JEDA_SINKRON_MS);
  window.addEventListener("online", () => {
    tick();
  });
  window.addEventListener("offline", () => ubah({ offline: true }));
  tick();
}

// ---------------------------------------------------------
// Pembungkus muat-data yang jatuh ke cache kalau koneksi gagal
// ---------------------------------------------------------
export async function muatMasterAman() {
  if (snap.offline) {
    const c = await bacaCacheEnt("master");
    if (c) return { master: c.data, dariCache: true, waktu: c.waktu };
  }
  try {
    const m = await muatMaster();
    simpanCacheEnt("master", m);
    tandaiOnline();
    return { master: m, dariCache: false, waktu: Date.now() };
  } catch (e) {
    if (adalahGalatJaringan(e)) {
      tandaiOffline();
      const c = await bacaCacheEnt("master");
      if (c) return { master: c.data, dariCache: true, waktu: c.waktu };
      throw new Error("Tidak ada koneksi dan data rekening belum tersimpan di perangkat ini. Sambungkan internet sekali, lalu buka kasir lagi.");
    }
    throw e;
  }
}

// offline = true: langsung pakai pengaturan rekening/kategori yang pernah tersimpan (tanpa jaringan).
export async function siapkanKeuanganAman(master, metodeList, { offline = false } = {}) {
  const cache = (await bacaCacheEnt("keuangan"))?.data || {};
  if (!offline) {
    try {
      const hasil = await siapkanKeuangan(master, metodeList);
      simpanCacheEnt("keuangan", { ...cache, ...hasil });
      return hasil;
    } catch (e) {
      if (!adalahGalatJaringan(e)) throw e;
      tandaiOffline();
    }
  }
  const hasil = {};
  for (const m of metodeList) {
    if (!cache[m]) {
      throw new Error(`Pengaturan rekening untuk ${m} belum tersimpan di perangkat ini. Saat ada internet, lakukan satu transaksi ${m} dulu agar tersimpan.`);
    }
    hasil[m] = cache[m];
  }
  return hasil;
}

let terakhirHangat = 0;
// Saat online: siapkan master rekening + rekening/kategori tiap metode ke cache, supaya penjualan
// pertama yang terjadi saat offline pun sudah punya semua bahan. Diam-diam; gagal = diabaikan.
export async function hangatkanCache({ paksa = false } = {}) {
  if (!paksa && Date.now() - terakhirHangat < 20 * 60 * 1000) return;
  terakhirHangat = Date.now();
  try {
    const m = await muatMaster();
    await simpanCacheEnt("master", m);
    const cache = (await bacaCacheEnt("keuangan"))?.data || {};
    for (const metode of ["Cash", "Transfer", "QRIS"]) {
      if (cache[metode]) continue;
      try {
        Object.assign(cache, await siapkanKeuangan(m, [metode]));
      } catch {
        /* metode ini belum siap (mis. kategori belum didaftarkan) — lewati */
      }
    }
    await simpanCacheEnt("keuangan", cache);
  } catch {
    terakhirHangat = 0; // coba lagi di kesempatan berikutnya
  }
}
