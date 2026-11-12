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

// Diskon promo (dari tabel kasir_promo) untuk satu baris keranjang.
// promo: { tipe: "persen" | "rp", nilai }. Untuk "rp", nilai = potongan PER PCS (dikali qty).
// Tidak pernah melebihi nilai kotor baris itu.
export function hitungDiskonPromo(kotor, qty, promo) {
  if (!promo) return 0;
  const n = Number(promo.nilai) || 0;
  const k = Number(kotor) || 0;
  if (n <= 0 || k <= 0) return 0;
  const d = promo.tipe === "persen" ? Math.round((k * Math.min(n, 100)) / 100) : Math.round(n * (Number(qty) || 0));
  return Math.min(d, k);
}

// Satu baris keranjang: { qty, harga, promo, promoLepas, hargaGrosirAktif, diskonTipe, diskonNilai }
// Promo (otomatis) dihitung dulu dari harga normal; diskon manual kasir dihitung dari sisanya.
// Promo GROSIR (beli min. N pcs di keranjang -> harga grosir): layar kasir mengisi `hargaGrosirAktif`
// (harga grosir per pcs) HANYA kalau syaratnya terpenuhi. Potongannya = (harga - grosir) x qty dan
// tidak ditumpuk dengan promo diskon barang: dipakai yang potongannya lebih besar (lebih menguntungkan pembeli).
// "diskon" = promo/grosir + manual, itulah yang dikirim ke database & dicetak di struk
// (jadi fungsi database tidak perlu diubah).
export function hitungItem(it) {
  const kotor = Math.round((Number(it.qty) || 0) * (Number(it.harga) || 0));
  let diskonPromo = it.promo && !it.promoLepas ? hitungDiskonPromo(kotor, it.qty, it.promo) : 0;
  let grosir = false;
  const hg = Number(it.hargaGrosirAktif) || 0;
  const h = Number(it.harga) || 0;
  if (hg > 0 && hg < h) {
    const potongGrosir = Math.min(Math.round((h - hg) * (Number(it.qty) || 0)), kotor);
    if (potongGrosir > diskonPromo) {
      diskonPromo = potongGrosir;
      grosir = true;
    }
  }
  const diskonManual = hitungDiskon(kotor - diskonPromo, it.diskonTipe, it.diskonNilai);
  const diskon = diskonPromo + diskonManual;
  return { kotor, diskonPromo, diskonManual, diskon, subtotal: kotor - diskon, grosir };
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

// Pembayaran: Cash / Transfer / QRIS, boleh digabung (split).
// Transfer & QRIS dianggap PAS (tidak ada kembalian). Sisa total dibayar Cash;
// kembalian hanya muncul dari Cash. "jumlah" di hasil.pembayaran = uang yang
// benar-benar MASUK kas (Cash sudah dikurangi kembalian) — itulah yang dicatat
// ke Keuangan.
export function hitungPembayaran(total, { transfer = 0, qris = 0, cashDiterima = 0 } = {}) {
  const T = Math.round(Number(total) || 0);
  const tr = Math.max(Math.round(Number(transfer) || 0), 0);
  const qr = Math.max(Math.round(Number(qris) || 0), 0);
  const cashDit = Math.max(Math.round(Number(cashDiterima) || 0), 0);
  const nonCash = tr + qr;
  const hasil = { valid: false, pesan: "", cashPerlu: 0, kurang: 0, kembalian: 0, bayar: 0, pembayaran: [] };

  if (T <= 0) return { ...hasil, pesan: "Total harus lebih dari 0" };
  if (nonCash > T) return { ...hasil, pesan: "Transfer + QRIS melebihi total" };

  const cashPerlu = T - nonCash;
  hasil.cashPerlu = cashPerlu;
  if (cashPerlu > 0 && cashDit < cashPerlu) {
    hasil.kurang = cashPerlu - cashDit;
    hasil.pesan = `Uang kurang ${hasil.kurang}`;
    return hasil;
  }
  hasil.kembalian = cashPerlu > 0 ? cashDit - cashPerlu : 0;
  hasil.bayar = (cashPerlu > 0 ? cashDit : 0) + nonCash;
  if (cashPerlu > 0) hasil.pembayaran.push({ metode: "Cash", jumlah: cashPerlu });
  if (tr > 0) hasil.pembayaran.push({ metode: "Transfer", jumlah: tr });
  if (qr > 0) hasil.pembayaran.push({ metode: "QRIS", jumlah: qr });
  hasil.valid = true;
  return hasil;
}

// Pilihan uang cepat untuk Cash: uang pas + pembulatan ke atas.
export function saranUang(total) {
  const T = Math.round(Number(total) || 0);
  const out = new Set([T]);
  for (const k of [10000, 50000, 100000]) {
    const n = Math.ceil(T / k) * k;
    if (n >= T) out.add(n);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}