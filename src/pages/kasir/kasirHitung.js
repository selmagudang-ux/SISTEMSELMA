// =========================================================
// KASIR — hitungan murni (tanpa React/database), dipakai layar kasir (fase 2)
// dan nanti dipakai lagi saat simpan transaksi (fase 3), supaya angka di layar
// dan angka yang disimpan SELALU dihitung dengan rumus yang sama.
// Semua angka dibulatkan ke rupiah utuh.
// =========================================================

// Diskon dari nilai dasar. tipe: "rp" (nominal) atau "persen" (0-100).
// Tidak pernah melebihi dasar (total tidak boleh minus).
export function hitungDiskon(dasar, tipe, nilai) {
  const n = Number(nilai) || 0;
  const d0 = Number(dasar) || 0;
  if (n <= 0 || d0 <= 0) return 0;
  const d = tipe === "persen" ? Math.round((d0 * Math.min(n, 100)) / 100) : Math.round(n);
  return Math.min(d, d0);
}

// Satu baris keranjang: { qty, harga, diskonTipe, diskonNilai }
export function hitungItem(it) {
  const kotor = Math.round((Number(it.qty) || 0) * (Number(it.harga) || 0));
  const diskon = hitungDiskon(kotor, it.diskonTipe, it.diskonNilai);
  return { kotor, diskon, subtotal: kotor - diskon };
}

// Seluruh keranjang + diskon level transaksi: { tipe, nilai }
export function hitungKeranjang(items, diskonTrx) {
  let jumlahQty = 0;
  let subtotal = 0; // setelah diskon item, sebelum diskon transaksi
  for (const it of items || []) {
    jumlahQty += Number(it.qty) || 0;
    subtotal += hitungItem(it).subtotal;
  }
  const diskonTransaksi = hitungDiskon(subtotal, diskonTrx?.tipe, diskonTrx?.nilai);
  return { jumlahQty, subtotal, diskonTransaksi, total: subtotal - diskonTransaksi };
}

// Mencari SKU: semua kata yang diketik harus ada di salah satu kolom.
export function buatJerami(s) {
  return [s.sku, s.model, s.warna, s.ukuran, s.kategori, s.subkategori, s.bahan, s.barcode_supplier]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function namaTampil(s) {
  const n = [s.model, s.warna, s.ukuran].filter(Boolean).join(" · ");
  return n || s.sku;
}
