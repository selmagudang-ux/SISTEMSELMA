import { sb } from "../../lib/api";
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
    const kode = it.kode_toko || it[I.sku] || "";
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
        bisaIsi: !!it.dari_toko,
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
