import { sb, entitasSesi } from "../../lib/api";
import { SKEMA } from "./kasirApi";
import { muatRekapKasir, kosongkanCacheBarangToko } from "./kasirLaporan";

// =========================================================
// CEK HPP TOKO OFFLINE — daftar barang yang TERJUAL di rentang tanggal tapi HPP-nya di Barang Toko
// (master_toko.hpp) masih kosong / 0. Dua jenis:
//   "kosong" : tetap tidak punya HPP (laporan menghitung Rp 0, laba terlalu besar)
//   "dugaan" : kosong di Barang Toko, tapi laporan memakai HPP barang yang mirip (lib/hppTokoCocok.js).
//              Bisa dijadikan HPP tetap dengan satu klik.
// Barang yang dijual langsung dari Master Barang (kasir mode Master Barang) ikut tampil, tapi HPP-nya
// diisi di Master Barang, bukan di sini (`bisaIsi: false`).
// =========================================================

const I = SKEMA.item;
const T = SKEMA.trx;
const num = (v) => Number(v) || 0;

export async function muatCekHppToko({ session, dari, sampai }) {
  const rekap = await muatRekapKasir({ session, dari, sampai, denganItem: true, denganBayar: false });
  const void_ = new Set(rekap.transaksi.filter((t) => (t[T.status] || "selesai") === "void").map((t) => t[T.id]));

  const peta = new Map();
  for (const it of rekap.items) {
    if (void_.has(it[I.trxId])) continue;
    const qty = num(it[I.qty]) - num(it.qty_retur);
    if (qty <= 0) continue;
    if (num(it.hpp_asli) > 0) continue; // HPP sudah terisi di Barang Toko / Master
    // Produk manual (item manual kasir): tidak ada di Barang Toko / Master Barang. Kuncinya SKU yang diketik;
    // transaksi lama yang tersimpan sebagai "MNL-…" memakai nama (isinya SKU yang dulu diketik).
    const manual = !it.dikenal && !it.dari_toko;
    const skuManual = String(it[I.sku] || "").startsWith("MNL-") ? String(it[I.nama] || "").trim() : String(it[I.sku] || "").trim();
    const kode = manual ? skuManual : it.kode_toko || it[I.sku] || "";
    if (!kode) continue;
    let r = peta.get(kode);
    if (!r) {
      const hppLaporan = num(it.hpp_satuan);
      r = {
        kunci: kode,
        kode,
        sku: it.dari_toko ? it[I.sku] || "" : kode, // SKU gudang (kalau tertaut)
        nama: it[I.nama] || kode,
        status: hppLaporan > 0 ? "dugaan" : "kosong",
        hppDugaan: hppLaporan > 0 ? hppLaporan : 0,
        bisaIsi: !!it.dari_toko || manual,
        manual,
        qty: 0,
        harga: num(it[I.harga]),
      };
      peta.set(kode, r);
    }
    r.qty += qty;
  }
  return [...peta.values()].sort((a, b) => b.qty - a.qty);
}

// Simpan HPP tetap ke Barang Toko (master_toko), lalu kosongkan cache laporan.
export async function simpanHppBarangToko(kode, hpp) {
  const nilai = Math.round(num(hpp));
  if (!(nilai > 0)) throw new Error("HPP harus lebih dari 0");
  await sb(`master_toko?kode=eq.${encodeURIComponent(kode)}`, { method: "PATCH", body: JSON.stringify({ hpp: nilai }) });
  kosongkanCacheBarangToko();
  return nilai;
}

// Simpan HPP produk manual (kasir_hpp_manual, per PT + SKU), lalu kosongkan cache laporan.
// Tabelnya dibuat lewat supabase/migrations/20261119_kasir_hpp_manual.sql.
export async function simpanHppManual(sku, nama, hpp) {
  const nilai = Math.round(num(hpp));
  if (!(nilai > 0)) throw new Error("HPP harus lebih dari 0");
  const kode = String(sku || "").trim();
  if (!kode) throw new Error("SKU produk manual kosong");
  await sb("kasir_hpp_manual?on_conflict=entitas,sku", {
    method: "POST",
    body: JSON.stringify({ entitas: entitasSesi(), sku: kode, nama: nama || null, hpp: nilai, diubah_at: new Date().toISOString() }),
    prefer: "resolution=merge-duplicates,return=representation",
  });
  kosongkanCacheBarangToko();
  return nilai;
}
