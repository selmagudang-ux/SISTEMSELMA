import {
  LayoutDashboard, PackagePlus, ClipboardList, Tag, BarChart3, MapPin,
  Camera, ShoppingBag, TrendingUp, Settings, Boxes, Printer,
} from "lucide-react";

export const STAGE_ORDER = ["sku", "rak", "verifikasi", "marketplace", "selesai"];

export const STAGE_META = {
  sku: { label: "Buat SKU", icon: Boxes, color: "amber" },
  rak: { label: "Rak", icon: MapPin, color: "sky" },
  verifikasi: { label: "Verifikasi Foto", icon: Camera, color: "pink" },
  marketplace: { label: "Marketplace", icon: ShoppingBag, color: "teal" },
  selesai: { label: "Selesai", icon: ClipboardList, color: "emerald" },
};

export const COLOR = {
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/30", solid: "bg-amber-500" },
  sky: { bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/30", solid: "bg-sky-500" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/30", solid: "bg-violet-500" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-400", ring: "ring-pink-500/30", solid: "bg-pink-500" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-400", ring: "ring-orange-500/30", solid: "bg-orange-500" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-400", ring: "ring-teal-500/30", solid: "bg-teal-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/30", solid: "bg-emerald-500" },
  slate: { bg: "bg-slate-500/10", text: "text-slate-400", ring: "ring-slate-500/30", solid: "bg-slate-500" },
};

export const MASTER_TIPE = [
  { key: "bahan", label: "Bahan" },
  { key: "peruntukan", label: "Peruntukan" },
  { key: "kategori", label: "Kategori" },
  { key: "subkategori", label: "Subkategori" },
  { key: "warna", label: "Warna" },
  { key: "ukuran", label: "Ukuran" },
];

// =========================================================
// STRUKTUR NAVIGASI SIDEBAR
// menu = grup utama, sub = anak menu (kalau ada).
// Menu tanpa "children" langsung jadi halaman (sub = null).
// =========================================================
export const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "data-barang", label: "Alur Barang", icon: ClipboardList },
  {
    key: "sku-harga", label: "SKU & Harga", icon: Tag,
    children: [
      { key: "buat", label: "Buat SKU" },
      { key: "master-barang", label: "Master Barang" },
    ],
  },
  {
    key: "stok", label: "Stok", icon: BarChart3,
    children: [
      { key: "barang", label: "Stok Barang" },
      { key: "keluar", label: "Barang Keluar" },
      { key: "hitung", label: "Hitung Qty" },
      { key: "riwayat", label: "Riwayat Stok" },
    ],
  },
  {
    key: "rak", label: "Rak", icon: MapPin,
    children: [
      { key: "tempatkan", label: "Tempatkan Barang" },
      { key: "master", label: "Master Rak" },
      { key: "peta", label: "Peta Rak" },
    ],
  },
  { key: "cetak-label", label: "Cetak Label", icon: Printer },
  { key: "foto", label: "Foto Produk", icon: Camera },
  {
    key: "marketplace", label: "Marketplace", icon: ShoppingBag,
    children: [
      { key: "belum", label: "Belum Upload" },
      { key: "sudah", label: "Sudah Upload" },
      { key: "riwayat", label: "Riwayat Upload" },
    ],
  },
  { key: "laporan", label: "Laporan", icon: TrendingUp },
  { key: "pengaturan", label: "Pengaturan", icon: Settings },
];

// Judul halaman default (menu + sub) — dipakai PageHeader.
export function findNavLabel(menuKey, subKey) {
  const menu = NAV.find((n) => n.key === menuKey);
  if (!menu) return { menuLabel: "", subLabel: "" };
  const sub = menu.children?.find((c) => c.key === subKey);
  return { menuLabel: menu.label, subLabel: sub ? sub.label : "" };
}

// =========================================================
// LOGIN — role & hak akses menu
// =========================================================
export const ROLES = [
  { key: "superadmin", label: "Super Admin" },
  { key: "gudang", label: "Gudang" },
  { key: "pemotretan", label: "Pemotretan" },
  { key: "marketplace", label: "Admin Marketplace" },
];

// Daftar key menu (dari NAV di atas) yang boleh diakses tiap role.
// "dashboard" sengaja dibuka untuk semua role sebagai halaman awal setelah login.
// "barang-masuk" sengaja tetap disertakan walau sudah tidak ada di sidebar NAV —
// dipakai untuk izin tombol tambah cepat "+ Barang Masuk" di header.
export const ROLE_MENUS = {
  superadmin: [...NAV.map((n) => n.key), "barang-masuk"],
  gudang: ["dashboard", "barang-masuk", "data-barang", "sku-harga", "stok", "rak", "cetak-label"],
  pemotretan: ["dashboard", "foto"],
  marketplace: ["dashboard", "marketplace"],
};

export function allowedMenus(role) {
  return ROLE_MENUS[role] || ["dashboard"];
}

export function roleLabel(role) {
  return ROLES.find((r) => r.key === role)?.label || role;
}