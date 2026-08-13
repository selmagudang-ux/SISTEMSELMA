import {
  LayoutDashboard, PackagePlus, ClipboardList, Tag, BarChart3, MapPin,
  Camera, ShoppingBag, TrendingUp, Settings, Boxes, Printer, Store, Warehouse,
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
// Setiap node top-level adalah salah satu dari dua jenis:
//   1. "menu"  — punya `key` yang dipakai langsung sebagai nav.menu.
//                Kalau punya `children`, children-nya adalah SUB (nav.sub),
//                kalau tidak, klik langsung navigasi ke halaman itu.
//   2. "group" (ditandai `group: true`) — HANYA wadah visual di sidebar,
//                bukan halaman/menu yang bisa dinavigasi sendiri. Children-nya
//                adalah node "menu" biasa (masing-masing key-nya tetap dipakai
//                langsung sebagai nav.menu, sama seperti kalau dia top-level).
// Pola ini dipilih supaya pengelompokan sidebar (Gudang / Pemotretan / Admin
// Marketplace / Admin Grosir) murni tampilan — key routing yang sudah dipakai
// di App.jsx (data-barang, sku-harga, stok, rak, cetak-label, foto,
// marketplace, grosir, dst) tidak berubah sama sekali.
// =========================================================
export const NAV = [
  {
    key: "dashboard", label: "Dashboard", icon: LayoutDashboard,
    children: [
      { key: "gudang", label: "Dashboard Gudang" },
      { key: "grosir", label: "Dashboard Grosir" },
    ],
  },
  {
    key: "gudang-group", label: "Gudang", icon: Warehouse, group: true,
    children: [
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
          { key: "gudang", label: "Sisa di Gudang" },
          { key: "master", label: "Master Rak" },
          { key: "peta", label: "Peta Rak" },
        ],
      },
      { key: "cetak-label", label: "Cetak Label", icon: Printer },
    ],
  },
  {
    key: "pemotretan-group", label: "Pemotretan", icon: Camera, group: true,
    children: [
      { key: "foto", label: "Foto Produk", icon: Camera },
    ],
  },
  {
    key: "marketplace-group", label: "Admin Marketplace", icon: ShoppingBag, group: true,
    children: [
      {
        key: "marketplace", label: "Marketplace", icon: ShoppingBag,
        children: [
          { key: "belum", label: "Belum Upload" },
          { key: "sudah", label: "Sudah Upload" },
          { key: "riwayat", label: "Riwayat Upload" },
        ],
      },
    ],
  },
  {
    key: "grosir-group", label: "Admin Grosir", icon: Store, group: true,
    children: [
      {
        key: "grosir", label: "Grosir", icon: Store,
        children: [
          { key: "pesanan", label: "Buat Pesanan" },
          { key: "semua-pesanan", label: "Semua Pesanan" },
          { key: "pelanggan", label: "Pelanggan" },
          { key: "toko", label: "Toko Pengirim" },
        ],
      },
    ],
  },
  { key: "laporan", label: "Laporan", icon: TrendingUp },
  { key: "pengaturan", label: "Pengaturan", icon: Settings },
];

// Kumpulkan semua key "menu" nyata (yang dipakai sebagai nav.menu) dari NAV,
// menembus wadah group (key milik node group sendiri TIDAK termasuk, karena
// bukan halaman/menu yang bisa dinavigasi).
function collectMenuKeys(nodes) {
  const keys = [];
  nodes.forEach((n) => {
    if (n.group) keys.push(...collectMenuKeys(n.children || []));
    else keys.push(n.key);
  });
  return keys;
}
export const ALL_MENU_KEYS = collectMenuKeys(NAV);

// Cari node "menu" (bukan group) berdasarkan key-nya, baik yang top-level
// maupun yang ada di dalam sebuah group — dipakai findNavLabel di bawah.
function findMenuNode(menuKey) {
  for (const node of NAV) {
    if (node.group) {
      const found = (node.children || []).find((c) => c.key === menuKey);
      if (found) return found;
    } else if (node.key === menuKey) {
      return node;
    }
  }
  return null;
}

// Rantai key yang perlu di-"expand" di sidebar supaya menu yang sedang aktif
// selalu terlihat — untuk menu di dalam group, ini termasuk key group-nya juga.
export function navAncestorKeys(menuKey) {
  for (const node of NAV) {
    if (node.group && (node.children || []).some((c) => c.key === menuKey)) {
      return [node.key, menuKey];
    }
  }
  return [menuKey];
}

// Saring NAV supaya hanya menampilkan menu (dan group yang masih punya isi)
// yang diizinkan untuk role yang sedang login. allowedMenuKeys = null artinya
// tidak dibatasi (tampilkan semua).
export function filterNavByAllowed(nodes, allowedMenuKeys) {
  if (!allowedMenuKeys) return nodes;
  return nodes
    .map((node) => {
      if (node.group) {
        const children = (node.children || []).filter((c) => allowedMenuKeys.includes(c.key));
        return children.length ? { ...node, children } : null;
      }
      return allowedMenuKeys.includes(node.key) ? node : null;
    })
    .filter(Boolean);
}

// Judul halaman default (menu + sub) — dipakai PageHeader.
export function findNavLabel(menuKey, subKey) {
  const menu = findMenuNode(menuKey);
  if (!menu) return { menuLabel: "", subLabel: "" };
  const sub = menu.children?.find((c) => c.key === subKey);
  return { menuLabel: menu.label, subLabel: sub ? sub.label : "" };
}

// =========================================================
// LOGIN — role & hak akses menu
// =========================================================
export const ROLES = [
  { key: "superadmin", label: "Super Admin" },
  { key: "owner", label: "Owner" },
  { key: "gudang", label: "Gudang" },
  { key: "pemotretan", label: "Pemotretan" },
  { key: "marketplace", label: "Admin Marketplace" },
  { key: "grosir", label: "Admin Grosir" },
];

// Daftar key menu (dari NAV di atas) yang boleh diakses tiap role.
// "dashboard" sengaja HANYA dibuka untuk superadmin & owner — role operasional
// (gudang/pemotretan/marketplace/grosir) langsung ke halaman kerja masing-masing.
// "barang-masuk" sengaja tetap disertakan walau sudah tidak ada di sidebar NAV —
// dipakai untuk izin tombol tambah cepat "+ Barang Masuk" di header. Diletakkan
// PALING TERAKHIR di daftar gudang supaya bukan yang jadi halaman awal (fallback
// landing page dari MainApp pakai allowed[0] kalau "dashboard" tidak diizinkan).
export const ROLE_MENUS = {
  superadmin: [...ALL_MENU_KEYS, "barang-masuk"],
  owner: ["dashboard"],
  gudang: ["data-barang", "sku-harga", "stok", "rak", "cetak-label", "barang-masuk"],
  pemotretan: ["foto"],
  marketplace: ["marketplace"],
  grosir: ["grosir"],
};

export function allowedMenus(role) {
  return ROLE_MENUS[role] || ["dashboard"];
}

// Daftar SUB-menu (anak menu) yang boleh diakses tiap role, untuk menu yang
// punya beberapa anak (mis. Grosir, Stok, Rak, SKU & Harga, Marketplace,
// Dashboard). Kalau kombinasi role+menu TIDAK didaftarkan di sini, role tsb
// otomatis boleh akses SEMUA anak menu itu (default penuh) — jadi role lain
// (owner lihat Dashboard Gudang & Grosir berdua, superadmin, dst) tidak perlu
// didaftarkan satu-satu, perilakunya tetap default penuh.
export const ROLE_SUBMENUS = {
  grosir: {
    // Admin Grosir sekarang juga diberi akses ke "Toko Pengirim" (master
    // data toko), selain transaksi & pelanggan.
    grosir: ["pesanan", "semua-pesanan", "pelanggan", "toko"],
  },
};

// Sub-menu apa saja yang boleh dilihat role ini untuk satu menu tertentu.
// Return null = boleh akses semua anak menu (tidak dibatasi).
export function allowedSubMenus(role, menuKey) {
  return ROLE_SUBMENUS[role]?.[menuKey] || null;
}

export function roleLabel(role) {
  return ROLES.find((r) => r.key === role)?.label || role;
}