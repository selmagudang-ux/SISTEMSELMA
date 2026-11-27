// =========================================================
// VERSI HP SISTEMSELMA (/m) — PETA LAYAR
// Susunan menu HP DIAMBIL LANGSUNG dari NAV (lib/constants.js), jadi sama dengan sidebar versi web
// (OPERASIONAL > ADMIN GUDANG > Stok > Stok Barang, dst) dan ikut hak akses role + fitur yang dimatikan per PT.
// File ini hanya mencatat menu mana yang SUDAH punya layar HP. Menu yang belum tercatat di sini tetap tampil,
// tapi redup dengan tulisan "Segera hadir".
//
// Cara menambah layar HP baru:
//   1. Buat file layarnya di pages/mobile/ (menerima props { session, sub }).
//   2. Daftarkan di LAYAR_HP di bawah:
//        "menuKey/subKey" -> khusus satu sub-menu, mis. "stok/barang"
//        "menuKey"        -> menu tanpa sub, atau satu layar yang menangani semua sub-nya
//      menuKey/subKey = key di NAV (lib/constants.js).
// =========================================================

export const LAYAR_HP = {
  // Dashboard Monitoring (4 tab: Operasional, Penjualan, Absensi, Keuangan): halaman komputer dipakai ulang lewat DashboardHp.jsx.
  dashboard: { muat: () => import("./DashboardHp.jsx") },
  "stok/barang": { muat: () => import("./StokHp.jsx") },
  "stok/menipis": { muat: () => import("./StokHp.jsx") },
  // Operasional > Admin Gudang yang lain: memakai ulang halaman komputer + modalnya lewat GudangHp.jsx (nama ekspor per menu).
  "stok/keluar": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.StokLainHp })) },
  "stok/hitung": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.StokLainHp })) },
  "stok/riwayat": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.StokLainHp })) },
  "data-barang": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.AlurBarangHp })) },
  // SKU & Harga: satu layar untuk 4 sub-menu (buat / master-barang / kategori / reject).
  "sku-harga": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.SkuHargaHp })) },
  // Rak: satu layar untuk 4 sub-menu (tempatkan / gudang / master / peta).
  rak: { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.RakHp })) },
  "cetak-label": { muat: () => import("./GudangHp.jsx").then((m) => ({ default: m.CetakLabelHp })) },
  // Pengadaan Barang: satu layar menangani 4 sub-menu (datang / habis-pakai / aset / supplier).
  "barang-datang": { muat: () => import("./PengadaanHp.jsx") },
  // Keuangan: sub-menu Transaksi (daftar kartu + tambah/edit/hapus) dan Kas (Akun Kas, Buku Kas, Rekonsiliasi). Laporan (Saldo Kas, Arus Kas, Laba Rugi, Neraca). Pengaturan (Rekening & Kategori, Penggunaan Rekening, Log Keterangan, Riwayat Perubahan).
  "keuangan/transaksi": { muat: () => import("./KeuanganHp.jsx") },
  "keuangan/kas": { muat: () => import("./KasHp.jsx") },
  "keuangan/laporan": { muat: () => import("./LaporanHp.jsx") },
  "keuangan/pengaturan": { muat: () => import("./PengaturanKeuanganHp.jsx") },
  // Perusahaan Grup (Ringkasan, Keuangan Perusahaan, Antar Entitas, Kelola Perusahaan) dan Keuangan Pusat (Transaksi, Kas,
  // Laporan, Modal & Penarikan Pemilik, Pengaturan): satu layar (GrupHp.jsx) menangani semua sub-menunya.
  perusahaan: { muat: () => import("./GrupHp.jsx") },
  // Transfer Barang antar entitas (kirim / terima / Permintaan Stok): memakai ulang halaman komputer lewat TransferBarangHp.jsx.
  "transfer-entitas": { muat: () => import("./TransferBarangHp.jsx") },
  holding: { muat: () => import("./GrupHp.jsx") },
  // SDM (key menu tetap "absensi"): satu layar (SdmHp.jsx) menangani 4 sub-menu — Rekap Absensi, Penggajian, Data Karyawan, Pengaturan.
  absensi: { muat: () => import("./SdmHp.jsx") },
  // Kalkulator Harga: menu khusus versi HP (tidak ada di NAV versi komputer), disisipkan di MobileApp.jsx untuk akun yang boleh membuka SKU & Harga.
  "kalkulator-harga": { muat: () => import("./KalkulatorHargaHp.jsx") },
};

export const kunciLayar = (menuKey, subKey) => (subKey ? `${menuKey}/${subKey}` : menuKey);

export const cariLayar = (menuKey, subKey) => LAYAR_HP[kunciLayar(menuKey, subKey)] || (subKey ? LAYAR_HP[menuKey] : null) || null;

// Node NAV ini (atau salah satu isinya) sudah punya layar HP? `induk` = node pembungkusnya.
export function punyaLayar(node, induk) {
  if (node.group) return (node.children || []).some((c) => punyaLayar(c, node));
  if (node.children?.length) return node.children.some((s) => !!cariLayar(node.key, s.key)) || !!cariLayar(node.key);
  if (induk && !induk.group && induk.children?.length) return !!cariLayar(induk.key, node.key);
  return !!cariLayar(node.key);
}

// Label NAV banyak yang HURUF BESAR SEMUA ("OPERASIONAL") — di HP dirapikan jadi "Operasional".
export function rapikanLabel(label) {
  const s = String(label || "");
  if (s !== s.toUpperCase() || s === s.toLowerCase()) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
