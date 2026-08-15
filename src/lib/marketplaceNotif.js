// =========================================================
// NOTIFIKASI ADMIN MARKETPLACE (Cek Marketplace)
// =========================================================
// Tiga jenis kondisi yang perlu diketahui admin marketplace supaya listing-nya
// selalu sesuai kondisi gudang: (1) stok tipis/habis, (2) stok baru saja
// bertambah (restock), (3) rak SKU berubah/keluar. Setiap notifikasi punya
// `key` unik yang diikat ke KONDISI TERKINI (bukan cuma SKU-nya) — begitu
// kondisinya berubah lagi (stok berubah lagi, rak berubah lagi), key-nya ikut
// berubah, jadi notifikasi otomatis muncul lagi walau kondisi sebelumnya
// sudah pernah dikonfirmasi ("Sudah" / "Sudah diperbarui").
// Status "sudah dikonfirmasi" disimpan di tabel marketplace_notif_ack
// (kolom notif_key, unique) — dimuat dari App.jsx lalu dicocokkan di sini.
import { cariPerluDitempatkanUlang, skuDenganRakGanda } from "../pages/Rak";

// Baris stock_history TERBARU untuk tiap SKU. stockHistory dari App.jsx
// sudah diurutkan created_at.desc, jadi kemunculan pertama per SKU dalam
// urutan itu otomatis yang paling baru.
export function latestHistoryBySku(stockHistory) {
  const map = new Map();
  (stockHistory || []).forEach((h) => {
    if (!map.has(h.sku)) map.set(h.sku, h);
  });
  return map;
}

// Event rak TERBARU untuk tiap SKU (tabel `rak_events`, diisi dari
// ModalRouter setiap kali ada perpindahan/pengeluaran SKU dari rak — lihat
// komentar di ModalRouter.jsx bagian pindah-rak, barang-keluar, stok-opname).
// rakEvents dari App.jsx sudah diurutkan created_at.desc, jadi kemunculan
// pertama per SKU otomatis yang paling baru.
export function latestRakEventBySku(rakEvents) {
  const map = new Map();
  (rakEvents || []).forEach((e) => {
    if (!map.has(e.sku)) map.set(e.sku, e);
  });
  return map;
}

// Event rak TERBARU per kode rak ASAL (rak_dari) — dipakai untuk notifikasi
// "Rak Kosong": rak yang pernah tercatat kena aktivitas pindah/keluar dari
// situ, lalu dicek lagi apakah SEKARANG beneran sudah kosong.
export function latestRakEventByRakDari(rakEvents) {
  const map = new Map();
  (rakEvents || []).forEach((e) => {
    if (!e.rak_dari) return;
    if (!map.has(e.rak_dari)) map.set(e.rak_dari, e);
  });
  return map;
}

// SKU yang baru saja DIPINDAH ke rak lain (jenis "pindah", punya rak_baru) —
// admin marketplace perlu tahu kalau listingnya menyebutkan lokasi/rak barang.
// Key diikat ke id event rak terbaru SKU itu, jadi begitu SKU dipindah lagi
// setelah notifnya dikonfirmasi, notifikasi baru otomatis muncul lagi.
export function computeRakPindahNotifs(rakEvents) {
  const out = [];
  latestRakEventBySku(rakEvents).forEach((e, sku) => {
    if (e.jenis !== "pindah") return;
    out.push({
      key: `pindah:${sku}:${e.id}`,
      sku,
      rakDari: e.rak_dari,
      rakBaru: e.rak_baru,
      detail: `Dipindah dari rak ${e.rak_dari} ke rak ${e.rak_baru}`,
    });
  });
  return out;
}

// Rak yang pernah tercatat kena aktivitas pindah/keluar DAN saat ini beneran
// sudah kosong (tidak ada SKU apapun menempatinya lagi) — dipakai supaya
// admin marketplace tahu rak/lokasi itu sudah tidak berisi barang, kalau-
// kalau disebut di listing. Key diikat ke id event terbarunya, jadi kalau
// rak itu terisi lagi lalu kosong lagi nanti, notifikasi baru muncul lagi.
export function computeRakKosongNotifs(rak, penempatan, rakEvents) {
  const out = [];
  const byRakDari = latestRakEventByRakDari(rakEvents);
  (rak || []).forEach((r) => {
    const event = byRakDari.get(r.code);
    if (!event) return;
    const masihTerisi = (penempatan || []).some((p) => p.rak_code === r.code);
    if (masihTerisi) return;
    out.push({
      key: `kosong:${r.code}:${event.id}`,
      rakCode: r.code,
      sku: event.sku,
      detail: `Terakhir: ${event.sku} ${event.jenis === "pindah" ? "dipindah ke rak lain" : "dikeluarkan dari rak ini"}`,
    });
  });
  return out;
}

// SKU dengan stok tipis (<5, termasuk 0/habis). Key diikat ke histori stok
// terbaru SKU itu (kalau ada) supaya begitu stoknya berubah lagi (naik lalu
// turun lagi, misalnya), notifikasi baru muncul lagi walau yang lama sudah
// pernah dikonfirmasi.
export function computeStokTipisNotifs(skuMaster, historyMap) {
  return (skuMaster || [])
    .filter((s) => (s.stok || 0) < 5)
    .map((s) => {
      const h = historyMap.get(s.sku);
      return {
        key: `tipis:${s.sku}:${h ? h.id : "awal"}`,
        sku: s.sku,
        stok: s.stok || 0,
      };
    });
}

// SKU yang histori stoknya TERAKHIR adalah penambahan (barang masuk, atau
// hasil stok opname yang naik) — admin marketplace perlu tahu supaya qty/
// listing yang ditampilkan diperbarui.
export function computeStokTambahNotifs(skuMaster, historyMap) {
  const out = [];
  (skuMaster || []).forEach((s) => {
    const h = historyMap.get(s.sku);
    if (!h) return;
    const naik = h.type === "masuk" || (h.type === "penyesuaian" && Number(h.qty_change) > 0);
    if (!naik) return;
    out.push({
      key: `tambah:${s.sku}:${h.id}`,
      sku: s.sku,
      qtyBefore: h.qty_before,
      qtyChange: h.qty_change,
      qtyAfter: h.qty_after,
    });
  });
  return out;
}

// SKU yang "bermasalah rak": rak lamanya sudah ditimpa SKU lain (perlu
// ditempatkan ulang — efeknya SKU ini "keluar" dari rak lamanya), atau
// tercatat menempati lebih dari satu rak sekaligus (rak ganda — salah satu
// penempatannya perlu "diganti"/dipindahkan). Pakai helper yang sama dengan
// Peta Rak supaya selalu konsisten.
export function computeRakBerubahNotifs(skuMaster, rak, penempatan) {
  const out = [];
  cariPerluDitempatkanUlang(skuMaster, penempatan).forEach((r) => {
    out.push({
      key: `rak:${r.sku}:keluar:${r.rakLama}:${r.ditimpaOleh}`,
      sku: r.sku,
      jenis: "keluar",
      detail: `Rak ${r.rakLama} sudah ditimpa ${r.ditimpaOleh} — SKU ini belum ada rak baru`,
      stok: r.stok,
    });
  });
  skuDenganRakGanda(rak, penempatan, skuMaster).forEach(({ sku, raks }) => {
    out.push({
      key: `rak:${sku}:ganda:${raks.map((x) => x.rak_code).sort().join(",")}`,
      sku,
      jenis: "ganda",
      detail: `Tercatat di lebih dari satu rak: ${raks.map((x) => x.rak_code).join(", ")}`,
    });
  });
  return out;
}