import { Home, ScanLine, Boxes, Truck, Wallet, ClipboardList, MoreHorizontal } from "lucide-react";

// =========================================================
// VERSI HP SISTEMSELMA (/m) — DAFTAR MENU
// Satu tempat untuk mendaftarkan menu versi HP. Menu baru cukup ditambah di sini
// (plus file layarnya), tanpa menyentuh MobileApp.jsx.
//
//  key      : id menu di versi HP (dipakai di alamat, mis. /m#stok)
//  label    : nama di navigasi
//  Ikon     : ikon lucide
//  menuKey  : key menu ERP (lib/constants.js NAV) yang harus boleh diakses role-nya.
//             Kosong = semua yang sudah login boleh.
//  pin      : true = tampil di navigasi bawah (maksimal 4 yang dipakai), lainnya masuk "Lainnya"
//  muat     : fungsi import() layar menu (dimuat malas); kosong = layar "segera hadir"
//
// TAHAP 1: kerangka. TAHAP 2: menu Stok (Stok Barang + Stok Menipis) sudah jadi; menu lain masih "segera hadir".
// Menu yang mau diaktifkan nanti diisi di `muat`.
// =========================================================

export const MENU_HP = [
  { key: "beranda", label: "Beranda", Ikon: Home, pin: true, muat: () => import("./Beranda.jsx") },
  { key: "scan-resi", label: "Scan Resi", Ikon: ScanLine, menuKey: "scan-resi", pin: true, muat: null },
  { key: "stok", label: "Stok", Ikon: Boxes, menuKey: "stok", pin: true, muat: () => import("./StokHp.jsx") },
  { key: "barang-datang", label: "Barang Datang", Ikon: Truck, menuKey: "barang-datang", muat: null },
  { key: "keuangan", label: "Keuangan", Ikon: Wallet, menuKey: "keuangan", muat: null },
  { key: "persetujuan-restock", label: "Persetujuan Restok", Ikon: ClipboardList, menuKey: "persetujuan-restock", muat: null },
];

export const IKON_LAINNYA = MoreHorizontal;
