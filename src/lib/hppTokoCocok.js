// =========================================================
// HPP BARANG TOKO (OFFLINE) YANG KOSONG -> DILENGKAPI DARI BARANG YANG MIRIP
//
// HPP laporan toko = master_toko.hpp. Banyak barang toko HPP-nya 0 padahal barang yang mirip
// (warna / ukuran lain dari model yang sama) sudah terisi. Fungsi ini HANYA mengisi yang 0;
// HPP yang sudah terisi di Barang Toko tidak pernah diubah. Tidak ada yang ditulis ke database,
// ini cuma dipakai waktu menghitung laporan.
//
// Urutan, berhenti di yang pertama berhasil:
//   1. Lewat SKU gudang / barcode ke Master Barang. Pencarian bertingkat dan aturannya sama dengan
//      grosir (lib/hppGrosirCocok.js): SKU persis -> buang warna/ukuran -> sampai 3 segmen
//      (Bahan..Kategori-Subkategori-Model). HPP kosong di Master diabaikan. Kalau HPP kandidat
//      berbeda-beda, dipilih yang harga Ecer / Grosir-nya = harga jual toko, kalau tidak ketemu
//      satu -> dibiarkan 0 (tidak ditebak).
//   2. Barang toko lain dengan nama dasar sama (bagian sebelum " - ", mis. "Cincin - S6" dan
//      "Cincin - S7") yang HPP-nya sudah terisi. Aturan beda-HPP sama: cocokkan harga jual.
// =========================================================

import { bangunIndeksAwalan, cocokkanItemManual, normKode } from "./hppGrosirCocok";

const num = (v) => Number(v) || 0;
const KOLOM_HARGA = ["ecer", "grosir"];
const namaDasar = (n) => String(n ?? "").split(" - ")[0].trim().toLowerCase();

// rowsMaster = [{ sku, hpp, ecer, grosir }]; rowsToko = [{ kode, nama, barcode, sku_gudang, hpp, harga_jual }]
// Mengembalikan:
//   hppToko(rowToko)        -> HPP final barang toko (yang sudah terisi dipakai apa adanya)
//   hppSkuMaster(sku, ecer) -> HPP final SKU Master yang dijual langsung di kasir mode Master Barang
export function buatPelengkapHpp(rowsToko, rowsMaster) {
  const indeks = bangunIndeksAwalan(rowsMaster);

  const kelompok = new Map(); // nama dasar -> [{ hpp, harga }] hanya yang HPP-nya terisi
  for (const r of rowsToko || []) {
    if (num(r.hpp) <= 0) continue;
    const k = namaDasar(r.nama);
    if (!k) continue;
    if (!kelompok.has(k)) kelompok.set(k, []);
    kelompok.get(k).push({ hpp: num(r.hpp), harga: num(r.harga_jual) });
  }

  const dariMaster = (nama, harga) => {
    if (!normKode(nama)) return 0;
    const r = cocokkanItemManual(indeks, nama, harga, KOLOM_HARGA);
    return r.status === "cocok" ? r.hpp : 0;
  };

  const dariSaudara = (nama, harga) => {
    const daftar = kelompok.get(namaDasar(nama));
    if (!daftar || daftar.length === 0) return 0;
    let hppUnik = [...new Set(daftar.map((d) => d.hpp))];
    if (hppUnik.length > 1) {
      hppUnik = [...new Set(daftar.filter((d) => d.harga === harga).map((d) => d.hpp))];
    }
    return hppUnik.length === 1 ? hppUnik[0] : 0;
  };

  return {
    hppToko(r) {
      if (num(r.hpp) > 0) return num(r.hpp);
      const harga = num(r.harga_jual);
      for (const nama of [r.sku_gudang, r.barcode]) {
        if (!nama || normKode(nama) === normKode(r.kode)) continue;
        const h = dariMaster(nama, harga);
        if (h > 0) return h;
      }
      return dariSaudara(r.nama, harga);
    },
    hppSkuMaster(sku, hppAsli, ecer) {
      if (num(hppAsli) > 0) return num(hppAsli);
      return dariMaster(sku, num(ecer));
    },
  };
}
