// =========================================================
// PENCOCOKAN ITEM MANUAL GROSIR -> MASTER BARANG (untuk HPP)
//
// Item manual grosir memakai nama berupa kode SKU YANG TERPOTONG, tanpa bagian warna/ukuran,
// mis. "TDGL-GSR-20" (Bahan+Peruntukan+Kategori - Subkategori - Model) atau "TDGL-GJR-92-PER"
// (+ Warna), sedangkan SKU di Master "TDGL-GSR-20-PER-P18CM".
// Jadi dicari SKU Master yang AWALANNYA sama dengan nama itu. Patokan utama = 3 segmen pertama
// (Bahan+Peruntukan+Kategori, Subkategori, Model); warna & ukuran tidak ikut menentukan.
//
// Pencarian bertingkat dari yang paling spesifik ke yang lebih umum, berhenti di 3 segmen
// (Bahan..Kategori-Subkategori-Model). Jadi kalau warna di nama pesanan tidak ada di Master
// (mis. nama "TDGL-GSR-20-MRH" padahal Master hanya punya warna lain), tetap dicocokkan ke
// model "TDGL-GSR-20".
//
// Aturan per tingkat:
//   - Kandidat yang HPP-nya kosong / 0 DIABAIKAN (itu "belum diisi", bukan HPP yang berbeda).
//   - Tidak ada kandidat, atau semua kandidat HPP-nya kosong -> lanjut ke tingkat lebih umum
//   - Kandidat ber-HPP semuanya sama                         -> "cocok" (pakai HPP itu)
//   - Kandidat ber-HPP berbeda-beda -> pilih yang Grosir-nya = harga di pesanan, kalau hasilnya
//     satu HPP saja "cocok", selain itu "ambigu" (tidak ditebak, tidak turun ke tingkat umum)
// Kalau semua tingkat habis: ada kandidat tapi HPP-nya kosong semua -> "tanpaHpp", selain itu
// "tidakKetemu".
// =========================================================

const num = (v) => Number(v) || 0;

export const normKode = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

// rows = [{ sku, hpp, grosir }] dari sku_master. Mengembalikan Map awalan -> [{ sku, hpp, grosir }].
// Satu SKU didaftarkan di setiap awalannya yang minimal 3 segmen (Bahan..Kategori-Subkategori-Model,
// lalu + Warna), di SKU lengkapnya, dan di SKU tanpa segmen terakhir (perilaku lama).
export function bangunIndeksAwalan(rows) {
  const idx = new Map();
  for (const r of rows || []) {
    const sku = normKode(r.sku);
    if (!sku) continue;
    const baris = { sku, hpp: num(r.hpp), grosir: num(r.grosir), ecer: num(r.ecer) };
    const segmen = sku.split("-");
    const kunciSku = new Set([sku]);
    if (segmen.length > 1) kunciSku.add(segmen.slice(0, -1).join("-"));
    for (let n = 3; n < segmen.length; n++) kunciSku.add(segmen.slice(0, n).join("-"));
    for (const k of kunciSku) {
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(baris);
    }
  }
  return idx;
}

// Hasil: { status: "cocok" | "ambigu" | "tidakKetemu" | "tanpaHpp", hpp, kandidat }
// kandidat = SKU Master yang jadi dasar keputusan (dipakai untuk menjelaskan item bermasalah).
// kolomHarga = kolom Master yang dibandingkan dengan harga di transaksi (grosir = pesanan grosir, ecer = toko).
export function cocokkanItemManual(indeks, namaProduk, hargaPesanan, kolomHarga = ["grosir"]) {
  const nama = normKode(namaProduk);
  const segmen = nama.split("-");
  const tingkat = [nama];
  for (let n = segmen.length - 1; n >= 3; n--) tingkat.push(segmen.slice(0, n).join("-"));

  let kandidatKosong = null; // kandidat tingkat terspesifik yang ada tapi HPP-nya kosong semua
  for (const kunci of tingkat) {
    const kandidat = indeks.get(kunci);
    if (!kandidat || kandidat.length === 0) continue;

    // HPP kosong / 0 = belum diisi di Master, bukan HPP yang berbeda.
    const berHpp = kandidat.filter((k) => k.hpp > 0);
    if (berHpp.length === 0) {
      if (!kandidatKosong) kandidatKosong = kandidat;
      continue; // coba tingkat lebih umum (warna/ukuran lain dari model yang sama)
    }

    let hppUnik = [...new Set(berHpp.map((k) => k.hpp))];
    if (hppUnik.length > 1) {
      const sepadan = berHpp.filter((k) => kolomHarga.some((c) => k[c] === num(hargaPesanan)));
      hppUnik = [...new Set(sepadan.map((k) => k.hpp))];
      if (hppUnik.length !== 1) return { status: "ambigu", hpp: 0, kandidat };
    }
    return { status: "cocok", hpp: hppUnik[0], kandidat };
  }
  if (kandidatKosong) return { status: "tanpaHpp", hpp: 0, kandidat: kandidatKosong };
  return { status: "tidakKetemu", hpp: 0, kandidat: [] };
}

// Kandidat SKU Master untuk satu nama item manual (dipakai untuk menjelaskan item "ambigu").
export function kandidatItemManual(indeks, namaProduk) {
  return indeks.get(normKode(namaProduk)) || [];
}
