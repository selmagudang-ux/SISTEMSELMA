// =========================================================
// PENCOCOKAN ITEM MANUAL GROSIR -> MASTER BARANG (untuk HPP)
//
// Item manual grosir memakai nama berupa kode SKU YANG TERPOTONG, tanpa bagian ukuran,
// mis. "TDGL-GJR-92-PER" sedangkan SKU di Master "TDGL-GJR-92-PER-P18CM".
// Jadi dicari SKU Master yang AWALANNYA (SKU tanpa segmen ukuran terakhir) sama dengan nama itu.
//
// Aturan:
//   1. Tidak ada SKU dengan awalan itu            -> "tidakKetemu"
//   2. Kandidat yang HPP-nya kosong / 0 DIABAIKAN (itu "belum diisi", bukan HPP yang berbeda).
//      Semua kandidat kosong                      -> "tanpaHpp"
//   3. Kandidat ber-HPP semuanya sama             -> pakai HPP itu (ukuran lain yang kosong ikut)
//   4. Kandidat ber-HPP berbeda-beda              -> pilih yang Grosir-nya = harga di pesanan,
//                                                    kalau hasilnya satu HPP saja
//   5. Selain itu                                 -> "ambigu" (tidak ditebak)
// =========================================================

const num = (v) => Number(v) || 0;

export const normKode = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

// rows = [{ sku, hpp, grosir }] dari sku_master. Mengembalikan Map awalan -> [{ sku, hpp, grosir }].
export function bangunIndeksAwalan(rows) {
  const idx = new Map();
  for (const r of rows || []) {
    const sku = normKode(r.sku);
    if (!sku) continue;
    const baris = { sku, hpp: num(r.hpp), grosir: num(r.grosir) };
    const awalan = sku.includes("-") ? sku.slice(0, sku.lastIndexOf("-")) : sku;
    for (const k of new Set([awalan, sku])) {
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(baris);
    }
  }
  return idx;
}

// Hasil: { status: "cocok" | "ambigu" | "tidakKetemu" | "tanpaHpp", hpp }
export function cocokkanItemManual(indeks, namaProduk, hargaPesanan) {
  const kandidat = indeks.get(normKode(namaProduk));
  if (!kandidat || kandidat.length === 0) return { status: "tidakKetemu", hpp: 0 };

  // HPP kosong / 0 = belum diisi di Master, bukan HPP yang berbeda -> jangan ikut menentukan "ambigu".
  const berHpp = kandidat.filter((k) => k.hpp > 0);
  if (berHpp.length === 0) return { status: "tanpaHpp", hpp: 0 };

  let hppUnik = [...new Set(berHpp.map((k) => k.hpp))];
  if (hppUnik.length > 1) {
    const sepadan = berHpp.filter((k) => k.grosir === num(hargaPesanan));
    hppUnik = [...new Set(sepadan.map((k) => k.hpp))];
    if (hppUnik.length !== 1) return { status: "ambigu", hpp: 0 };
  }
  return { status: "cocok", hpp: hppUnik[0] };
}

// Kandidat SKU Master untuk satu nama item manual (dipakai untuk menjelaskan item "ambigu").
export function kandidatItemManual(indeks, namaProduk) {
  return indeks.get(normKode(namaProduk)) || [];
}
