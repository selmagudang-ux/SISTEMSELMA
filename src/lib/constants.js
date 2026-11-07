import {
  LayoutDashboard, ClipboardList, Tag, BarChart3, MapPin,
  Camera, ShoppingBag, Settings, Boxes, Printer, Store, Warehouse, Wallet, Clock, Truck, Building2,
  Home, Users, UserRound, Image, Globe, Landmark, CalendarClock, Database, BookOpen, Banknote, MessageCircle, ScanLine, ListOrdered,
} from "lucide-react";

export const STAGE_ORDER = ["sku", "rak", "menunggu-harga", "verifikasi", "marketplace", "selesai"];

export const STAGE_META = {
  sku: { label: "Buat SKU", icon: Boxes, color: "amber" },
  rak: { label: "Rak", icon: MapPin, color: "sky" },
  // Tahap transisi khusus barang lama (tambah stok ke SKU yang sudah ada)
  // yang masuk dengan harga asli berbeda dari yang tercatat di Master
  // Barang. Barang sudah ditempatkan di rak, TAPI belum boleh masuk
  // Pemotretan sampai keputusan harganya jelas (lihat modal "pilih-harga"
  // di SKU & Harga / MasterBarang) — soalnya baru dari situ ketahuan apakah
  // fotonya nanti perlu foto ulang (harga jadi berubah) atau tidak (harga
  // lama tetap dipakai). Tidak ada tombol "Lanjut" manual untuk tahap ini —
  // pindah ke Verifikasi Foto otomatis begitu keputusan harganya dibuat
  // (lihat resolveMenungguHarga di lib/api.js).
  "menunggu-harga": { label: "Menunggu Harga", icon: Wallet, color: "orange" },
  verifikasi: { label: "Verifikasi Foto", icon: Camera, color: "pink" },
  marketplace: { label: "Marketplace", icon: ShoppingBag, color: "teal" },
  selesai: { label: "Selesai", icon: ClipboardList, color: "emerald" },
};

// Role yang "punya" tugas menyelesaikan tiap tahap di alur barang — dipakai
// untuk tombol "Lanjut ke Tahap Berikutnya" di modal Detail Barang (dibuka
// dari Alur Barang, yang menampilkan barang dari SEMUA tahap ke gudang/owner/
// superadmin sekaligus). Tahap "selesai" tidak ada di sini karena tidak ada
// lagi tahap berikutnya untuk dilanjutkan.
// Status "Pesanan Masuk" (Barang Datang — tahap SEBELUM Barang Masuk, dipakai
// untuk PO/pesanan ke supplier yang belum tentu tiba sekaligus). Beda dari
// STAGE_META di atas: ini bukan tahap alur barang fisik, tapi status pemesanan.
// - draft   : disimpan dari "Input Barang Datang" tapi BELUM dikirim ke Alur
//             Barang/stok — masih bisa dilengkapi & diubah bebas lewat
//             "Lanjutkan" sebelum akhirnya difinalisasi.
// - menunggu: belum ada barang yang datang sama sekali.
// - sebagian: sudah ada yang datang, tapi belum genap sesuai jumlah_pesan.
// - selesai : jumlah_diterima sudah >= jumlah_pesan.
// - batal   : pesanan dibatalkan, tidak akan ditagih lagi ke alur Barang Masuk.
export const PO_STATUS_META = {
  draft: { label: "Draf", color: "violet" },
  menunggu: { label: "Menunggu", color: "amber" },
  sebagian: { label: "Sebagian Bongkar", color: "sky" },
  selesai: { label: "Selesai", color: "emerald" },
  batal: { label: "Dibatalkan", color: "slate" },
};

// Status "bongkar" — apakah barang yang sudah datang (fisik ada di gudang)
// sudah dibongkar/dicek satu-satu atau masih tersegel/ditumpuk begitu saja.
// Terpisah dari PO_STATUS_META di atas karena "datang" (sudah sampai dari
// supplier) dan "dibongkar" (sudah dibuka & dicek isinya) itu dua hal beda —
// barang bisa saja sudah "Selesai" datang tapi kardusnya belum dibuka.
// SEKARANG OTOMATIS (bukan lagi toggle manual) — mengikuti progres rincian
// model di "Konfirmasi Datang" (lihat statusBongkar di lib/api.js):
// - "sebagian" : rincian masih disimpan sebagai Draf (belum semua model &
//                qty final) — dianggap baru sebagian yang sempat dibongkar &
//                dicek.
// - "sudah"    : rincian sudah difinalkan (status pesanan "Selesai") — semua
//                sudah dibongkar & dicek habis.
// - "belum"    : belum ada rincian sama sekali (status masih Menunggu/
//                Sebagian Datang tanpa draf) — belum sempat dibongkar.
export const BONGKAR_META = {
  belum: { label: "Belum Dibongkar", color: "amber" },
  sebagian: { label: "Sebagian Dibongkar", color: "sky" },
  sudah: { label: "Sudah Dibongkar", color: "emerald" },
};

// Tahapan pesanan barang (kolom "Status" tabel Pesanan Barang) — lihat
// tahapPesanan di lib/api.js. Satu alur: Menunggu -> Datang -> Sebagian
// Dibongkar -> Selesai.
export const TAHAP_PESANAN_META = {
  draft: { label: "Draf", color: "violet" },
  menunggu: { label: "Menunggu", color: "amber" },
  datang: { label: "Datang, Belum Dibongkar", color: "sky" },
  sebagian: { label: "Sebagian Dibongkar", color: "orange" },
  selesai: { label: "Selesai", color: "emerald" },
  batal: { label: "Dibatalkan", color: "slate" },
};

// Status toggle cepat "Konfirmasi Datang" (lihat statusKonfirmasiDatang di
// lib/api.js) — jawaban singkat "barang sudah sampai fisik atau belum",
// dicek SEBELUM baris pesanan boleh ditandai dibongkar. Terpisah dari
// PO_STATUS_META (yang soal jumlah_diterima vs jumlah_pesan) dan dari
// BONGKAR_META (yang soal sudah dibuka/dicek atau belum).
export const KONFIRMASI_DATANG_META = {
  belum: { label: "Belum Datang", color: "slate" },
  sudah: { label: "Sudah Datang", color: "sky" },
};

// Label kategori (kategori_keluar) yang dipakai TETAP/otomatis untuk setiap
// pembayaran Ongkir yang dicatat lewat "Tandai Status Kedatangan" (Barang
// Datang) — user tidak perlu (dan tidak bisa) memilih kategori lain di form
// itu, supaya semua pengeluaran ongkir barang datang konsisten kekelompokkan
// jadi satu kategori yang sama di Keuangan. Entrinya dibuat otomatis di
// master_data (tipe kategori_keluar) kalau belum ada — lihat ModalRouter.jsx
// (modal "toggle-konfirmasi-datang").
export const KATEGORI_ONGKIR_BARANG_DATANG = "Ongkir Barang Datang";

// Sama pola dengan KATEGORI_ONGKIR_BARANG_DATANG di atas, tapi untuk
// pembayaran ke supplier saat "Buat Pesan Barang" (modal "pesan-barang" di
// ModalRouter.jsx) — begitu bon disimpan, nominalnya (harga_kesepakatan)
// OTOMATIS dicatat sebagai Pengeluaran di Keuangan, kategori TETAP
// KATEGORI_PEMBAYARAN_SUPPLIER dan sumber dana TETAP
// REKENING_PEMBAYARAN_SUPPLIER — user tidak perlu (dan tidak bisa) memilih
// kategori/rekening lain di form itu, supaya semua pengeluaran pembayaran
// barang supplier konsisten kekelompokkan jadi satu kategori & satu
// rekening yang sama di Keuangan. Entrinya dibuat otomatis di master_data
// (tipe kategori_keluar / rekening) kalau belum ada — lihat ModalRouter.jsx
// (modal "pesan-barang").
export const KATEGORI_PEMBAYARAN_SUPPLIER = "Pembayaran Barang Supplier";
export const REKENING_PEMBAYARAN_SUPPLIER = "BCA a/n Sandi Purwoto";

// Sumber dana ongkir barang datang SELALU tetap Petty Cash — sama pola
// dengan REKENING_PEMBAYARAN_SUPPLIER di atas. User tidak diberi pilihan
// rekening lain di "Tandai Status Kedatangan" (lihat TandaiStatusKedatanganForm,
// components/forms.jsx), supaya semua ongkir barang datang konsisten
// kepotong dari satu sumber dana yang sama. Entrinya dibuat otomatis di
// master_data (tipe rekening) kalau belum ada — lihat ModalRouter.jsx
// (modal "toggle-konfirmasi-datang").
export const REKENING_ONGKIR_BARANG_DATANG = "Petty Cash";

// Rekening penampung Toko Offline (pages/TokoOffline.jsx) SELALU tetap
// (tidak bisa dipilih manual) — sama pola dengan REKENING_PEMBAYARAN_SUPPLIER
// / REKENING_ONGKIR_BARANG_DATANG di atas:
//   Cash     -> Petty Cash (rekening yang sama dengan REKENING_ONGKIR_BARANG_DATANG)
//   Cashless -> BCA a/n Teh Oca, kode "BCA2"
// Dicocokkan by label (case-insensitive) di master data "rekening"; kalau
// belum ada, dibuatkan otomatis sekali (lihat resolveRekeningTetap() di
// TokoOffline.jsx).
export const REKENING_TOKO_OFFLINE_CASH = "Petty Cash";
export const REKENING_TOKO_OFFLINE_CASHLESS = "BCA a/n Teh Oca";
export const KODE_REKENING_TOKO_OFFLINE_CASHLESS = "BCA2";

// Peran rekening otomatis. Tiap entitas/PT memilih sendiri rekeningnya untuk tiap peran di
// Keuangan > Pengaturan > Penggunaan Rekening (master_data tipe "rekening_peran":
// kode = "<ENTITAS>:<peran>", label = kode rekening). Belum diatur -> dicari lewat nama
// (labelDefault) seperti sebelumnya, jadi entitas lama tetap jalan.
export const PERAN_REKENING = [
  { key: "pembayaran_supplier", label: "Pembayaran supplier", desc: "Sumber dana saat Buat Pesan Barang disimpan", labelDefault: REKENING_PEMBAYARAN_SUPPLIER },
  { key: "ongkir_barang_datang", label: "Ongkir barang datang", desc: "Sumber dana ongkir saat Tandai Status Kedatangan", labelDefault: REKENING_ONGKIR_BARANG_DATANG },
  { key: "toko_offline_cash", label: "Toko Offline - Cash", desc: "Rekening penampung penjualan tunai", labelDefault: REKENING_TOKO_OFFLINE_CASH },
  { key: "toko_offline_cashless", label: "Toko Offline - Cashless", desc: "Rekening penampung Transfer / QRIS", labelDefault: REKENING_TOKO_OFFLINE_CASHLESS },
];

export const STAGE_ROLE = {
  sku: "gudang",
  rak: "gudang",
  verifikasi: "pemotretan",
  marketplace: "marketplace",
};

// Ambang batas "Stok Menipis" (menu Stok → Stok Menipis) — SKU dianggap layak
// diajukan restock begitu stoknya turun sampai titik ini (≤), dan jumlah yang
// diajukan gudang ke owner pun minimal segini juga (lihat AjukanRestockForm
// & StokMenipis).
export const AMBANG_MENIPIS_RESTOCK = 12;

// Owner & superadmin (+ superappa, akses setara superadmin) selalu boleh
// melanjutkan tahap apa pun, role lain hanya boleh untuk tahap yang jadi
// "tugas"-nya sendiri (lihat STAGE_ROLE di atas).
export function canAdvanceStage(role, stage) {
  if (bisa(role, "alur.lanjut_semua_tahap")) return true;
  return bisa(role, `tahap.${stage}`);
}

// Helper dipakai di komponen-komponen yang punya fitur khusus "superadmin
// saja" (edit harga langsung, hapus permanen, kelola user, dsb) — superappa
// harus selalu ikut lolos cek yang sama karena aksesnya dijanjikan setara
// superadmin. Pakai helper ini (bukan bandingkan role === "superadmin" satu-
// satu) supaya tidak ada tempat yang lupa kalau nanti ada role serupa lagi.
export function isSuperadminLike(role) {
  return role === "superadmin" || role === "superappa";
}

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
  { key: "dashboard", label: "DASHBOARD MONITORING", icon: LayoutDashboard },
  // Menu sendiri (bukan tab di dalam Dashboard) supaya owner/superadmin bisa
  // langsung menuju & lihat badge-nya dari sidebar tanpa buka Dashboard dulu.
  // Dibatasi ke owner & superadmin lewat ROLE_MENUS di bawah (role lain tidak
  // didaftarkan eksplisit di sana jadi otomatis tidak dapat menu ini).
  { key: "persetujuan-restock", label: "PERSETUJUAN RESTOK", icon: ClipboardList },
  // Tiga kelompok kerja gudang dibungkus satu group "OPERASIONAL" (group
  // bersarang, sama pola dengan Store Selma di PENJUALAN). Key menu/sub di dalamnya
  // TIDAK berubah, jadi routing & hak akses role tetap sama. Badge group ini
  // otomatis = jumlah badge ketiga group di dalamnya (withParentBadges).
  {
    key: "operasional-group", label: "OPERASIONAL", icon: Boxes, group: true,
    children: [
      {
        key: "gudang-group", label: "ADMIN GUDANG", icon: Warehouse, group: true,
        children: [
          {
            key: "barang-datang", label: "Pengadaan Barang", icon: Truck,
            children: [
              { key: "datang", label: "Pesanan Barang" },
              // Master data Supplier — disimpan di tabel "suppliers" sendiri
              // (bukan cuma teks bebas di kolom pesanan_masuk.supplier lagi),
              // supaya bisa dipilih ulang & tidak beda-beda ejaan tiap kali
              // catat barang datang (sama pola dengan "Toko Pengirim" di Grosir).
              { key: "supplier", label: "Data Supplier" },
              // Pembelian keperluan usaha non-dagangan (bubble wrap, lakban, ATK, dst)
              // + pantauan stok perlengkapan. Halaman: pages/BelanjaHabisPakai.jsx.
              { key: "habis-pakai", label: "Belanja Barang Habis Pakai" },
            ],
          },
          { key: "data-barang", label: "Alur Barang", icon: ClipboardList },
          {
            key: "sku-harga", label: "SKU & Harga", icon: Tag,
            children: [
              { key: "buat", label: "Buat SKU" },
              { key: "master-barang", label: "Master Barang" },
              { key: "kategori", label: "Master Data" },
              // Menu "Rusak" dipindahkan ke sini (dari top-level) dan diganti nama
              // jadi "Barang Reject" — daftar barang rusak yang dipisahkan otomatis
              // begitu SKU dibuat (lihat ModalRouter "buat-sku") lebih pas dikelompokkan
              // bareng data SKU & Harga lain, bukan jadi menu terpisah sendiri.
              { key: "reject", label: "Barang Reject" },
            ],
          },
          {
            key: "stok", label: "Stok", icon: BarChart3,
            children: [
              { key: "barang", label: "Stok Barang" },
              { key: "menipis", label: "Stok Menipis" },
              { key: "keluar", label: "Barang Keluar" },
              // Dulu "Hitung Qty" — diganti nama jadi "Stok Opname" (istilah yang
              // lebih umum dipakai gudang untuk hitung fisik vs stok sistem).
              { key: "hitung", label: "Stok Opname" },
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
        key: "pemotretan-group", label: "PEMOTRETAN", icon: Image, group: true,
        children: [
          { key: "foto", label: "Foto Produk", icon: Camera },
        ],
      },
      {
        key: "marketplace-group", label: "MARKETPLACE", icon: Globe, group: true,
        children: [
          {
            key: "marketplace", label: "Marketplace", icon: ShoppingBag,
            children: [
              { key: "belum", label: "Belum Upload" },
              { key: "sudah", label: "Sudah Upload" },
              { key: "riwayat", label: "Riwayat Upload" },
              { key: "cek", label: "Cek Marketplace" },
            ],
          },
        ],
      },
    ],
  },
  // "ADMIN GROSIR" (lama) → "PENJUALAN" — bukan cuma ganti nama, tapi juga
  // dirombak jadi 3 kelompok: Store Selma (Grosir lama + Toko Offline baru),
  // Marketplace (input keuangan bulanan, TERPISAH dari menu "marketplace" di
  // group "ADMIN MARKETPLACE" yang urusannya upload produk), dan Reseller
  // (hutang/piutang, datanya nebeng ke Pelanggan Grosir yang sudah ada).
  // "Store Selma" sengaja jadi GROUP BERSARANG (group di dalam group) supaya
  // "Grosir" (menu lama, tidak diubah sama sekali) tetap bisa punya sub-nya
  // sendiri sekaligus dikelompokkan bareng "Toko Offline" — lihat catatan di
  // findMenuNode/navAncestorKeys/filterNavByAllowed yang sudah dibuat rekursif
  // penuh supaya group bersarang seperti ini didukung.
  {
    key: "penjualan-group", label: "PENJUALAN", icon: Store, group: true,
    children: [
      {
        key: "store-selma-group", label: "Store Selma", icon: Building2, group: true,
        children: [
          {
            key: "grosir", label: "Grosir", icon: Store,
            children: [
              { key: "semua-pesanan", label: "Semua Pesanan" },
              { key: "produk-manual", label: "Produk Manual" },
              { key: "laporan", label: "Laporan Grosir" },
            ],
          },
          // Baru — input harian penjualan toko offline. Halaman "segera
          // hadir" dulu, isinya menyusul.
          {
            key: "toko-offline", label: "Toko Offline", icon: Home,
            children: [
              { key: "input-harian", label: "Transaksi Offline" },
              // POS (kasir): Barang Toko + Promo — hanya superappa (halaman dijaga juga di pages/kasir/PosToko.jsx).
              { key: "pos", label: "POS", onlyRole: "superappa" },
            ],
          },
        ],
      },
      // Baru — Reseller Toko (sistem hutang) & Reseller Cekout (sistem
      // piutang), datanya numpang di data Pelanggan Grosir yang sudah ada.
      // Halaman "segera hadir" dulu.
      {
        key: "reseller", label: "Reseller", icon: Users,
        children: [
          { key: "toko", label: "Reseller Toko" },
          { key: "cekout", label: "Reseller Cekout" },
          // Dulu "Penagihan Hutang" — sekarang jadi rekap gabungan dengan
          // dua tab internal (lihat PencairanDanPenagihanReseller di
          // pages/Reseller.jsx): tab "Penagihan Hutang" (hutang Reseller
          // Toko) & tab "Pencairan" (status pencairan Reseller Cekout).
          { key: "penagihan", label: "Penagihan atau Pencairan" },
        ],
      },
      // Dipindah ke sini — sejajar dengan "Store Selma", "Marketplace", &
      // "Reseller" (bukan lagi di dalam "Store Selma"), ditaruh paling akhir.
      // Berisi "Pelanggan" & "Toko Pengirim" — datanya TIDAK berubah sama
      // sekali (tabel grosir_pelanggan & grosir_toko), cuma dikelompokkan
      // secara visual — masing-masing tetap halaman leaf sendiri
      // (nav.menu = "pelanggan" / "toko"). Lihat PelangganList & TokoList
      // di pages/Grosir.jsx (diekspor terpisah, dipakai App.jsx).
      {
        key: "master-data-grosir-group", label: "Master Data Grosir", icon: Database, group: true,
        children: [
          { key: "pelanggan", label: "Pelanggan", icon: UserRound },
          { key: "toko", label: "Toko Pengirim", icon: Truck },
        ],
      },
      // Baru — beda dari menu "Marketplace" di group "ADMIN MARKETPLACE"
      // (yang urusannya upload produk). Ini khusus input keuangan: pemasukan
      // bulanan & pengeluaran iklan PER platform, plus pencairan saldo ke
      // Keuangan. Key sengaja dibedakan ("penjualan-marketplace") supaya
      // tidak bentrok dengan key "marketplace" yang sudah dipakai. Tiap
      // platform (shopee/tiktok/lazada) submenu sendiri, tapi dirender satu
      // komponen yang sama (lihat pages/Penjualanmarketplace.jsx) — sub
      // dipakai buat filter platform-nya.
      {
        key: "penjualan-marketplace", label: "Marketplace", icon: ShoppingBag,
        children: [
          { key: "shopee", label: "Shopee" },
          { key: "tiktok", label: "TikTok" },
          { key: "lazada", label: "Lazada" },
        ],
      },
      // Baru — Scan Resi: scan resi paket yang mau dikirim, hitung per ekspedisi, dan
      // otomatis pisahkan resi pesanan yang CANCEL. Halaman: pages/ScanResi.jsx
      // (tabel resi_scan & resi_cancel, lihat scan_resi.sql). Sub "Retur Resi": konfirmasi paket
      // cancel / gagal kirim yang sudah balik ke gudang (tabel resi_retur, lihat retur_resi.sql).
      {
        key: "scan-resi", label: "Scan Resi", icon: ScanLine,
        children: [
          { key: "scan", label: "Scan Resi" },
          { key: "cancel", label: "Daftar Cancel" },
          { key: "retur", label: "Retur Resi", onlyRole: "superappa" }, // sementara khusus Super Appa
          { key: "rekap", label: "Rekap" },
        ],
      },
      // Baru — Urut Resi: upload PDF resi (Shopee/TikTok/Tokopedia), diurutkan
      // otomatis per produk / kurir / kode rak untuk packing. Halaman:
      // pages/UrutResi.jsx (logika di lib/urutResi.js).
      { key: "urut-resi", label: "Urut Resi", icon: ListOrdered },
    ],
  },
  {
    key: "keuangan-group", label: "KEUANGAN", icon: Landmark, group: true,
    children: [
      {
        key: "keuangan", label: "Keuangan", icon: Wallet,
        children: [
          // Tab di dalam tiap menu diatur di pages/Keuangan.jsx:
          //   Transaksi  : Transaksi | Transfer Antar Kas
          //   Kas        : Akun Kas | Buku Kas | Rekonsiliasi
          //   Pengaturan : Rekening & Kategori | Log Keterangan | Riwayat Perubahan (khusus superappa)
          { key: "transaksi", label: "Transaksi" },
          { key: "kas", label: "Kas" },
          { key: "laporan", label: "Laporan Keuangan" },
          { key: "pengaturan", label: "Pengaturan" },
        ],
      },
      // Menu Holding (hanya Super Appa, Pemilik, Pemegang Saham, Super Admin — lihat ROLE_MENUS):
      //  - "Perusahaan Grup" : semua yang menyangkut perusahaan dalam grup (ringkasan &
      //    konsolidasi, lihat keuangan perusahaan, transfer Antar Entitas).
      //  - "Keuangan Holding": pembukuan Holding SENDIRI, dikunci ke entitas Holding.
      // Keduanya memakai pages/Keuangan.jsx (mode="grup" dan mode="holding").
      {
        key: "perusahaan", label: "Perusahaan Grup", icon: Building2,
        children: [
          // Tab: Per Perusahaan | Konsolidasi.
          { key: "grup", label: "Ringkasan" },
          // Lihat (hanya baca) transaksi, kas & laporan satu perusahaan anak.
          { key: "detail", label: "Keuangan Perusahaan" },
          { key: "antar-entitas", label: "Antar Entitas" },
          // Tambah perusahaan baru & rekeningnya (khusus Super Appa).
          { key: "kelola", label: "Kelola Perusahaan", onlyRole: "superappa" },
        ],
      },
      {
        key: "holding", label: "Keuangan Holding", icon: Landmark,
        children: [
          { key: "transaksi", label: "Transaksi" },
          { key: "kas", label: "Kas" },
          { key: "laporan", label: "Laporan Keuangan" },
          { key: "penarikan", label: "Modal & Penarikan Pemilik" },
          { key: "pengaturan", label: "Pengaturan" },
        ],
      },
      { key: "penggajian", label: "Penggajian", icon: Banknote },
    ],
  },
  {
    key: "absensi-group", label: "ABSENSI", icon: CalendarClock, group: true,
    children: [
      {
        key: "absensi", label: "Absensi", icon: Clock,
        children: [
          { key: "rekap", label: "Rekap Absensi" },
          { key: "karyawan", label: "Data Karyawan" },
          { key: "pengaturan", label: "Pengaturan" },
        ],
      },
    ],
  },
  // Panduan penggunaan — menu untuk SEMUA role (didaftarkan manual di
  // ROLE_MENUS masing-masing role operasional; owner/superadmin/superappa
  // otomatis dapat karena turunan dari ALL_MENU_KEYS). Isi halamannya
  // sendiri yang menyaring bagian mana yang ditampilkan sesuai role yang
  // login (lihat pages/Panduan.jsx) — jadi satu menu ini isinya beda-beda
  // tergantung siapa yang buka, bukan cuma soal boleh/tidak boleh akses.
  // Chat pribadi antar user (teks + foto, hapus otomatis 3 hari) — untuk SEMUA role.
  { key: "chat", label: "CHAT", icon: MessageCircle },
  { key: "panduan", label: "PANDUAN PENGGUNAAN", icon: BookOpen },
  { key: "pengaturan", label: "PENGATURAN", icon: Settings },
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
// Rekursif penuh supaya group bersarang (group di dalam group, mis. "Store
// Selma" di dalam "PENJUALAN") juga ketemu, bukan cuma satu level group.
function findMenuNode(menuKey, nodes = NAV) {
  for (const node of nodes) {
    if (node.group) {
      const found = findMenuNode(menuKey, node.children || []);
      if (found) return found;
    } else if (node.key === menuKey) {
      return node;
    }
  }
  return null;
}

// Rantai key yang perlu di-"expand" di sidebar supaya menu yang sedang aktif
// selalu terlihat — untuk menu di dalam group, ini termasuk key SEMUA group
// leluhurnya (bisa lebih dari satu tingkat kalau group bersarang).
export function navAncestorKeys(menuKey, nodes = NAV, path = []) {
  for (const node of nodes) {
    if (node.group) {
      const found = navAncestorKeys(menuKey, node.children || [], [...path, node.key]);
      if (found) return found;
    } else if (node.key === menuKey) {
      return [...path, menuKey];
    }
  }
  return path.length ? null : [menuKey];
}

// Saring NAV supaya hanya menampilkan menu (dan group yang masih punya isi)
// yang diizinkan untuk role yang sedang login. allowedMenuKeys = null artinya
// tidak dibatasi (tampilkan semua). Rekursif penuh supaya group bersarang
// ikut disaring dengan benar di tiap tingkatnya.
export function filterNavByAllowed(nodes, allowedMenuKeys, role) {
  // Sub-menu bertanda onlyRole hanya tampil untuk role itu.
  const sembunyikanSub = (n) => {
    if (!n.children) return n;
    const subs = n.key === "holding" || n.key === "perusahaan" || n.key === "keuangan" || adaOverrideSub(role, n.key) ? allowedSubMenus(role, n.key) : null;
    return {
      ...n,
      // Sub-menu "onlyRole" tampil untuk role itu, ATAU untuk role lain yang SECARA EKSPLISIT diberi akses
      // oleh Super Appa lewat Hak Akses (ada di daftar sub override).
      children: n.children.filter((c) => (!c.onlyRole || c.onlyRole === role || (adaOverrideSub(role, n.key) && subs && subs.includes(c.key))) && (!subs || subs.includes(c.key))),
    };
  };
  if (!allowedMenuKeys) return nodes.map(sembunyikanSub);
  return nodes
    .map((node) => {
      if (node.group) {
        const children = filterNavByAllowed(node.children || [], allowedMenuKeys, role);
        return children.length ? { ...node, children } : null;
      }
      return allowedMenuKeys.includes(node.key) ? sembunyikanSub(node) : null;
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

// Supaya badge notif di menu INDUK (mis. "Rak") DAN di GROUP paling atas (mis.
// "ADMIN PEMOTRETAN") selalu mencerminkan total dari semua anaknya — bukan cuma
// satu sub yang kebetulan didaftarkan manual — badge dihitung otomatis di sini:
// dulu ke bawah (bottom-up) supaya badge grup bisa menjumlahkan badge menu yang
// sudah dihitung duluan. Kalau ada sub/menu baru yang dikasih badge, induk dan
// grupnya otomatis ikut update tanpa perlu ubah kode di App.jsx satu-satu.
export function withParentBadges(nav, rawBadges) {
  const result = { ...rawBadges };
  const walk = (nodes) => {
    nodes.forEach((node) => {
      if (node.group) {
        walk(node.children || []);
        const total = (node.children || []).reduce(
          (sum, c) => sum + (Number(result[c.key]) || 0),
          0
        );
        if (total > 0) result[node.key] = total;
        return;
      }
      if (node.children && node.children.length) {
        const total = node.children.reduce(
          (sum, c) => sum + (Number(rawBadges[`${node.key}.${c.key}`]) || 0),
          0
        );
        if (total > 0) result[node.key] = total;
      }
    });
  };
  walk(nav);
  return result;
}

// =========================================================
// LOGIN — role & hak akses menu
// =========================================================
// CATATAN PENTING soal "superappa": role ini SENGAJA TIDAK didaftarkan di
// ROLES di bawah — supaya (1) tidak muncul sebagai pilihan role di dropdown
// pembuatan/edit user (Pengaturan → Kelola User), dan (2) roleLabel() di
// bawah menyamarkannya jadi "Super Admin" di mana pun label role ditampilkan
// (mis. daftar user di Kelola User), jadi role ini tidak bisa dibedakan dari
// superadmin biasa oleh admin lain yang memakai aplikasi ini.
// Aksesnya sendiri TETAP jalan penuh via ROLE_MENUS/canAdvanceStage/
// isSuperadminLike/ROLE_BOLEH_EDIT/ROLE_BOLEH_EDIT_JAM (semua itu baca role
// mentah dari session, bukan dari daftar ROLES ini) — hanya TIDAK dapat
// dibuat/diubah lewat dropdown UI. Untuk membuat akun dengan role ini, isi
// kolom `role` = "superappa" langsung lewat Supabase (SQL editor / table
// editor), bukan lewat form "Tambah User".
// Role yang boleh membuka aplikasi kasir (/kasir). SEMENTARA hanya superappa (tahap uji coba).
// Untuk membuka ke kasir lagi nanti, tambahkan "kasir" (dan "superadmin") ke daftar ini.
// Dibaca oleh pages/kasir/KasirApp.jsx (penjaga login) dan panel "Hak Akses" di Pengaturan.
export const ROLE_BOLEH_KASIR = ["superappa", "kasir"];

// Role yang bawaannya hanya boleh MELIHAT data (tidak bisa tambah/ubah/hapus). Dipakai lib/api.js.
export const ROLE_HANYA_LIHAT_BAWAAN = ["owner", "pemegang_saham"];

// ---------------------------------------------------------------------------
// HAK AKSES YANG BISA DIATUR SUPER APPA (Pengaturan > Hak Akses).
// Disimpan di master_data tipe "role_akses": kode = key role, label = JSON:
//   { menus: ["grosir", ...], subs: { grosir: ["pesanan", ...] }, kasir: true|false, hanyaLihat: true|false }
// Kolom yang tidak ada di JSON = pakai aturan bawaan di kode (ROLE_MENUS dst).
// Role "superappa" TIDAK PERNAH bisa diubah/dikunci, supaya Super Appa tidak bisa mengunci dirinya sendiri.
// Override dimuat oleh App.jsx (dari master) dan KasirApp.jsx (fetch sendiri) lewat setAksesRole().
// ---------------------------------------------------------------------------
let AKSES_ROLE = {};
export function setAksesRole(rows) {
  const hasil = {};
  (rows || []).forEach((r) => {
    const role = String(r?.kode || "").trim();
    if (!role || role === "superappa") return;
    try {
      const o = JSON.parse(r.label || "{}");
      if (o && typeof o === "object" && !Array.isArray(o)) hasil[role] = o;
    } catch {
      /* baris rusak diabaikan -> role itu memakai aturan bawaan */
    }
  });
  AKSES_ROLE = hasil;
}
export function aksesRoleTersimpan(role) {
  return AKSES_ROLE[role] || null;
}
// Boleh membuka aplikasi kasir (/kasir)?
export function bolehKasir(role) {
  if (role === "superappa") return true;
  const o = AKSES_ROLE[role];
  if (o && typeof o.kasir === "boolean") return o.kasir;
  return ROLE_BOLEH_KASIR.includes(role);
}
// Role ini hanya boleh melihat data (read-only)? Dipakai lib/api.js untuk memblokir POST/PATCH/DELETE.
export function roleHanyaLihat(role) {
  if (role === "superappa") return false;
  const o = AKSES_ROLE[role];
  if (o && typeof o.hanyaLihat === "boolean") return o.hanyaLihat;
  return ROLE_HANYA_LIHAT_BAWAAN.includes(role);
}

// ---------------------------------------------------------------------------
// HAK AKSI (apa yang boleh DILAKUKAN, bukan cuma menu) — daftar lengkap yang bisa diatur Super Appa.
// Dipakai lewat bisa(role, "kunci") di seluruh aplikasi. `bawaan` = siapa yang boleh bila Super Appa belum
// mengatur apa pun (SAMA PERSIS dengan perilaku sebelum fitur ini). Super Appa selalu boleh semuanya.
// `kunci: true` = terkunci khusus Super Appa (tidak bisa dibagikan): hanya ditampilkan supaya terlihat.
// ---------------------------------------------------------------------------
const dari = (...roles) => (r) => roles.includes(r);
const semuaKecuali = (...roles) => (r) => !roles.includes(r);
const tak = () => false;

export const GRUP_AKSI = [
  {
    grup: "Alur Barang",
    aksi: [
      { key: "alur.lanjut_semua_tahap", label: "Melanjutkan barang ke tahap APA PUN di Alur Barang", bawaan: dari("superadmin", "owner") },
      ...Object.keys(STAGE_ROLE).map((st) => ({
        key: `tahap.${st}`,
        label: `Melanjutkan tahap "${STAGE_META[st]?.label || st}" (tugas role ${STAGE_ROLE[st]})`,
        bawaan: dari(STAGE_ROLE[st]),
      })),
      { key: "kelengkapan.ubah_riwayat", label: "Edit / hapus riwayat di Kelengkapan", bawaan: dari("superadmin") },
      { key: "belanja.ubah_riwayat", label: "Edit / hapus riwayat Belanja Habis Pakai", bawaan: dari("superadmin") },
    ],
  },
  {
    grup: "SKU & Harga",
    aksi: [
      { key: "sku.barang_masuk_banyak", label: "Input Barang Masuk banyak sekaligus", bawaan: dari("superadmin") },
      { key: "sku.buat_banyak", label: "Buat SKU banyak sekaligus", bawaan: dari("superadmin") },
      { key: "sku.harga_manual", label: "Isi harga manual saat buat SKU (lewati rumus harga)", bawaan: dari("superadmin") },
      { key: "sku.edit_harga_langsung", label: "Edit harga langsung (tombol \"Harga Baru\" / pensil di SKU & Harga)", bawaan: dari("superadmin") },
      { key: "sku.aturan_marketplace", label: "Ubah Aturan Harga Marketplace", bawaan: dari("superadmin") },
      { key: "sku.pindah_ke_toko", label: "Pindahkan SKU ke Barang Toko (kasir)", bawaan: tak },
    ],
  },
  {
    grup: "Grosir, Reseller & Marketplace",
    aksi: [
      { key: "grosir.edit_pembayaran", label: "Edit pembayaran pesanan grosir", bawaan: tak },
      { key: "grosir.pindah_ke_reseller", label: "Pindahkan pesanan grosir ke Reseller", bawaan: tak },
      { key: "grosir.hapus_pesanan", label: "Hapus permanen pesanan grosir yang dibatalkan", bawaan: dari("superadmin") },
      { key: "grosir.hapus_deposit", label: "Hapus baris deposit pelanggan", bawaan: dari("superadmin") },
      { key: "reseller.hapus_entri", label: "Hapus entri di Reseller", bawaan: dari("superadmin") },
      { key: "marketplace.tindak_notif_massal", label: "Tandai notifikasi Cek Marketplace (massal)", bawaan: dari("superadmin") },
      { key: "scan.hapus_massal", label: "Hapus massal data Scan Resi", bawaan: tak },
      { key: "scan.lihat_log_import", label: "Lihat riwayat import di Scan Resi", bawaan: tak },
    ],
  },
  {
    grup: "Stok & Restock",
    aksi: [
      { key: "stok.ajukan_restock", label: "Mengajukan restock (Stok & Rak)", bawaan: dari("gudang", "owner", "superadmin") },
      { key: "restock.setujui", label: "Menyetujui / menolak pengajuan restock", bawaan: dari("owner", "superadmin") },
    ],
  },
  {
    grup: "Absensi & Penggajian",
    aksi: [
      { key: "absensi.edit_manual", label: "Edit absensi manual (Sakit / Izin / Libur)", bawaan: dari("superadmin", "owner") },
      { key: "absensi.edit_nama", label: "Ubah nama data karyawan", bawaan: dari("superadmin", "owner") },
      { key: "absensi.edit_jam", label: "Koreksi jam masuk / pulang absen", bawaan: tak },
      { key: "penggajian.ubah", label: "Menyiapkan / menyerahkan / mengubah gaji", bawaan: semuaKecuali("owner", "pemegang_saham") },
    ],
  },
  {
    grup: "Keuangan & Holding",
    aksi: [
      { key: "holding.transfer_dari_holding", label: "Catat transfer Antar Entitas: dari Holding KE perusahaan", bawaan: dari("owner") },
      { key: "holding.transfer_ke_holding", label: "Catat transfer Antar Entitas: dari perusahaan KE Holding", bawaan: dari("superadmin") },
      { key: "holding.transfer_antar_anak", label: "Catat transfer Antar Entitas: antar dua perusahaan", bawaan: tak },
      { key: "holding.penarikan_pemilik", label: "Catat Penarikan Pemilik", bawaan: dari("owner") },
      { key: "keuangan.riwayat_perubahan", label: "Lihat tab Riwayat Perubahan Keuangan", bawaan: tak },
    ],
  },
  {
    grup: "Kasir (/kasir)",
    aksi: [
      { key: "kasir.lihat_semua", label: "Melihat transaksi & shift SEMUA kasir (bukan hanya miliknya)", bawaan: semuaKecuali("kasir") },
      { key: "kasir.void", label: "Membatalkan seluruh transaksi (void)", bawaan: tak },
      { key: "kasir.barang_toko", label: "Tombol Barang Toko di aplikasi kasir", bawaan: tak },
      { key: "kasir.promo", label: "Tombol Promo di aplikasi kasir", bawaan: tak },
      { key: "kasir.buka_laci", label: "Tombol Buka Laci di aplikasi kasir", bawaan: tak },
    ],
  },
  {
    grup: "Chat & Pengaturan",
    aksi: [
      { key: "chat.pengawas", label: "Mode Pengawas di Chat (melihat percakapan orang lain)", bawaan: tak },
      { key: "pengaturan.kelola_user", label: "Kelola User (tambah / hapus akun, ganti password)", bawaan: dari("superadmin") },
      { key: "pengaturan.rumus_harga", label: "Ubah Rumus Harga di Pengaturan", bawaan: dari("superadmin") },
      { key: "pengaturan.pembersih_data", label: "Pembersih data (SKU yatim & foto yatim)", bawaan: tak },
      { key: "pengaturan.hak_akses", label: "Mengatur Hak Akses (halaman ini)", kunci: true },
      { key: "pengaturan.mode_perbaikan", label: "Mode Perbaikan (kunci seluruh aplikasi)", kunci: true },
    ],
  },
];

const DAFTAR_AKSI = {};
GRUP_AKSI.forEach((g) => g.aksi.forEach((a) => { DAFTAR_AKSI[a.key] = a; }));

// Nilai BAWAAN sebuah aksi untuk role (tanpa pengaturan Super Appa).
export function aksiBawaan(role, kunci) {
  if (role === "superappa") return !DAFTAR_AKSI[kunci] || true;
  const a = DAFTAR_AKSI[kunci];
  if (!a || a.kunci || !a.bawaan) return false;
  return !!a.bawaan(role);
}

// Boleh melakukan aksi ini? Super Appa selalu boleh; role lain mengikuti pengaturan Hak Akses
// (kalau belum diatur: aturan bawaan di atas).
export function bisa(role, kunci) {
  if (role === "superappa") return true;
  const a = DAFTAR_AKSI[kunci];
  if (!a || a.kunci) return false;
  const ov = AKSES_ROLE[role]?.aksi?.[kunci];
  if (typeof ov === "boolean") return ov;
  return aksiBawaan(role, kunci);
}

// Boleh membuka sub-menu ini? (untuk halaman yang menjaga dirinya sendiri, mis. POS / Retur Resi)
export function bolehSub(role, menuKey, subKey) {
  if (role === "superappa") return true;
  return adaOverrideSub(role, menuKey) && allowedSubMenus(role, menuKey).includes(subKey);
}

export const ROLES = [
  { key: "superadmin", label: "Super Admin" },
  { key: "owner", label: "Pemilik" },
  { key: "pemegang_saham", label: "Pemegang Saham" },
  { key: "gudang", label: "Gudang" },
  { key: "pemotretan", label: "Pemotretan" },
  { key: "marketplace", label: "Admin Marketplace" },
  { key: "grosir", label: "Admin Grosir" },
  { key: "keuangan", label: "Admin Keuangan" },
  { key: "scan_resi", label: "Admin Scan Resi" },
  { key: "kasir", label: "Kasir" },
];

// Daftar key menu (dari NAV di atas) yang boleh diakses tiap role.
// "dashboard" HANYA untuk superadmin & owner (role operasional lain langsung
// ke halaman kerja masing-masing). Owner sekarang dapat SEMUA menu kecuali
// "pengaturan" (khusus superadmin). Role operasional (gudang/pemotretan/
// marketplace) masing-masing dibatasi HANYA ke grup menunya sendiri beserta
// semua sub-nya — grosir tidak disinggung ulang di sini, tetap seperti
// sebelumnya (hanya menu "grosir").
// "barang-masuk" sengaja tetap disertakan walau sudah tidak ada di sidebar NAV —
// dipakai untuk izin tombol tambah cepat "+ Barang Masuk" di header. Diletakkan
// PALING TERAKHIR di daftar gudang supaya bukan yang jadi halaman awal (fallback
// landing page dari MainApp pakai allowed[0] kalau "dashboard" tidak diizinkan).
export const ROLE_MENUS = {
  // Super Admin: seluruh sistem SELMA + menu Holding, tapi di Holding HANYA
  // sub-menu "Antar Entitas" (lihat allowedSubMenus) dan hanya boleh mencatat
  // transfer dari perusahaan KE Holding (lihat ARAH_ANTAR_ENTITAS).
  // (Menu "holding" = pembukuan Holding sendiri, bukan untuk Super Admin.)
  superadmin: [...ALL_MENU_KEYS.filter((k) => k !== "holding"), "barang-masuk"],
  // Super Appa: akses ke mana pun, termasuk Holding. Dari luar tampil sebagai
  // "Super Admin" — lihat catatan di ROLES di atas.
  superappa: [...ALL_MENU_KEYS, "barang-masuk"],
  // Pemilik: Dashboard Monitoring SELMA (semua tab, read-only) + menu Holding (Perusahaan Grup + Keuangan Holding; read-only, KECUALI mencatat transfer Antar Entitas
  // dari Holding KE perusahaan — lihat ARAH_ANTAR_ENTITAS), plus Chat & Panduan.
  owner: ["dashboard", "perusahaan", "holding", "chat", "panduan"],
  // Gudang: menu operasionalnya sendiri (Barang Datang, Alur Barang, SKU &
  // Harga, Stok, Rak, Cetak Label) — default penuh karena tidak didaftarkan
  // di ROLE_SUBMENUS. "Stok Menipis" (ajukan restock) sekarang jadi sub-menu
  // di dalam "stok", jadi gudang tidak lagi butuh akses "dashboard" atau
  // "persetujuan-restock" sama sekali — keduanya murni untuk owner &
  // superadmin. Landing page login gudang tetap ke "barang-datang" (lihat
  // App.jsx).
  gudang: ["barang-datang", "data-barang", "sku-harga", "stok", "rak", "cetak-label", "chat", "panduan", "barang-masuk"],
  // Pemotretan: hanya menu di dalam grup "ADMIN PEMOTRETAN" (cuma "Foto Produk").
  pemotretan: ["foto", "chat", "panduan"],
  // Admin Marketplace: hanya menu di dalam grup "ADMIN MARKETPLACE" (cuma
  // "Marketplace", dengan semua sub-nya — Belum/Sudah/Riwayat Upload).
  marketplace: ["marketplace", "chat", "panduan"],
  // "store-selma" (key group, bukan halaman) sudah tidak ada lagi — diganti
  // dengan key menu asli di dalamnya ("grosir" tetap, "toko-offline" baru,
  // "pelanggan" baru — sebelumnya sub dari "grosir", sekarang menu sendiri),
  // ditambah 2 menu baru satu domain (Marketplace-keuangan & Reseller) yang
  // untuk sementara masih halaman "segera hadir". Sesuaikan lagi kalau
  // aksesnya mau dibedakan per menu.
  grosir: ["grosir", "pelanggan", "toko", "toko-offline", "penjualan-marketplace", "reseller", "scan-resi", "urut-resi", "chat", "panduan"],
  // Admin Keuangan: hanya menu "Keuangan" (Transaksi + Rekening & Kategori),
  // sama seperti pola role operasional lain — tidak dapat "dashboard" (langsung
  // ke halaman Keuangan sebagai landing page), dan default penuh ke kedua sub-nya
  // karena tidak didaftarkan di ROLE_SUBMENUS.
  keuangan: ["keuangan", "chat", "panduan"],
  // Admin Scan Resi: HANYA Scan Resi & Urut Resi (tanpa Chat/Panduan). Landing page = menu pertama (scan-resi).
  scan_resi: ["scan-resi", "urut-resi"],
  // Kasir: bekerja di aplikasi kasir (/kasir), bukan di sidebar SELMA. Di SELMA hanya Chat & Panduan.
  kasir: ["chat", "panduan"],
  // Pemegang Saham: hanya melihat tab Konsolidasi di menu Holding (read-only,
  // lihat ROLE_READONLY di lib/api.js & allowedSubMenus di bawah).
  pemegang_saham: ["perusahaan"],
};

// ---------------------------------------------------------------------------
// ANTAR ENTITAS — siapa boleh mencatat transfer ke arah mana.
//   "dariHolding" = transfer dari rekening milik Holding KE rekening perusahaan
//                   lain (modal, pinjaman yang diberikan Holding, dst).
//   "keHolding"   = transfer dari rekening perusahaan lain KE rekening Holding
//                   (dividen, pelunasan pinjaman, dst).
// Pemilik   : hanya dariHolding.
// Super Admin: hanya keHolding.
// Super Appa : keduanya (+ transfer antar dua perusahaan non-Holding).
// Role lain  : tidak boleh sama sekali.
// Mau menambah role (mis. "keuangan" boleh keHolding)? Cukup tambah barisnya di sini.
// ---------------------------------------------------------------------------
export const ARAH_ANTAR_ENTITAS = {
  owner: { dariHolding: true, keHolding: false },
  superadmin: { dariHolding: false, keHolding: true },
  superappa: { dariHolding: true, keHolding: true, antarAnak: true },
};

// Boleh tidaknya role ini mencatat/mengubah transfer dengan entitas asal & tujuan tertentu.
// kodeHolding = kode entitas Holding (mis. "HOLD").
export function bolehTransferAntarEntitas(role, entAsal, entTujuan, kodeHolding) {
  if (!kodeHolding || !entAsal || !entTujuan || entAsal === entTujuan) return false;
  if (entAsal === kodeHolding) return bisa(role, "holding.transfer_dari_holding");
  if (entTujuan === kodeHolding) return bisa(role, "holding.transfer_ke_holding");
  return bisa(role, "holding.transfer_antar_anak"); // dua perusahaan non-Holding
}

// Siapa boleh mencatat Penarikan Pemilik (uang Holding yang dipakai pribadi).
export function bisaPenarikanPemilik(role) {
  return bisa(role, "holding.penarikan_pemilik");
}

// Role ini punya hak mencatat transfer Antar Entitas arah apa pun?
export function bisaTransferAntarEntitas(role) {
  return (
    bisa(role, "holding.transfer_dari_holding") ||
    bisa(role, "holding.transfer_ke_holding") ||
    bisa(role, "holding.transfer_antar_anak")
  );
}

// Akun yang terikat ke PT selain Selma (entitas bukan "OPS") hanya boleh menu yang
// datanya SUDAH dipisah per PT: Keuangan (lewat rekening), grup OPERASIONAL/gudang
// (kolom entitas, lihat TABEL_PER_PT di api.js), grup PENJUALAN (Store, Marketplace,
// Reseller, Master Data Grosir — juga lewat kolom entitas, lihat penjualan_per_pt.sql),
// Chat, Panduan. Dashboard, absensi, dll belum dipisah, jadi disembunyikan dulu.
// Pemilik, Pemegang Saham, dan Super Appa lintas entitas (tidak dibatasi).
const ROLE_LINTAS_ENTITAS = ["superappa", "owner", "pemegang_saham"];
const MENU_PT_LAIN = [
  "keuangan", "chat", "panduan",
  "persetujuan-restock", "barang-datang", "data-barang", "sku-harga", "stok", "rak",
  "cetak-label", "foto", "marketplace",
  // Absensi dipisah per PT lewat kolom entitas di karyawan/absensi/absensi_settings (absensi_per_pt.sql).
  // Penggajian juga dipisah per PT (kolom entitas di tabel penggajian, lihat penggajian_per_pt.sql);
  // gaji hanya boleh keluar dari rekening milik PT-nya sendiri.
  "absensi", "penggajian",
  // Pengaturan per PT (rumus harga, pembersih data PT-nya sendiri) — Kelola User tetap hanya untuk Selma/Super Appa.
  "pengaturan",
  // Grup PENJUALAN (di sidebar PT selain Selma, grup "Store Selma" tampil sebagai "Store <nama PT>").
  "grosir", "pelanggan", "toko", "toko-offline", "penjualan-marketplace", "reseller", "scan-resi", "urut-resi",
];
// fiturMati = daftar key menu yang DIMATIKAN untuk perusahaan akun ini (lihat
// FITUR_ENTITAS & fiturMatiEntitas di bawah). Super Appa tidak pernah disaring,
// supaya tidak bisa mengunci dirinya sendiri dari menu Kelola Perusahaan.
export function allowedMenus(role, entitas, fiturMati = []) {
  let menus = ROLE_MENUS[role] || ["dashboard"];
  const ov = role !== "superappa" ? AKSES_ROLE[role] : null;
  if (ov && Array.isArray(ov.menus)) {
    // Hanya key menu yang valid; "barang-masuk" (izin tombol cepat) ikut "barang-datang".
    menus = ov.menus.filter((k) => ALL_MENU_KEYS.includes(k) || k === "barang-masuk");
    if (menus.includes("barang-datang") && !menus.includes("barang-masuk")) menus = [...menus, "barang-masuk"];
  }
  if (entitas && entitas !== "OPS" && !ROLE_LINTAS_ENTITAS.includes(role)) {
    // Dashboard PT sendiri (data dibatasi ke PT-nya di pages/Dashboard.jsx): hanya Super Admin.
    menus = menus.filter((k) => MENU_PT_LAIN.includes(k) || (k === "dashboard" && role === "superadmin"));
  }
  if (role !== "superappa" && fiturMati.length) {
    const mati = new Set(fiturMati);
    // "barang-masuk" = izin tombol tambah cepat, ikut mati bersama "barang-datang".
    if (mati.has("barang-datang")) mati.add("barang-masuk");
    menus = menus.filter((k) => !mati.has(k));
  }
  return menus;
}

// ---------------------------------------------------------------------------
// FITUR PER PERUSAHAAN (entitas) — diatur Super Appa di Perusahaan Grup > Kelola
// Perusahaan. Tiap perusahaan punya daftar fitur (menu) sendiri. Default: semua fitur
// yang memang didukung untuk perusahaan itu NYALA, jadi perusahaan lama tidak berubah.
// Yang dimatikan disimpan di master_data tipe "entitas_fitur":
//   kode = "<ENTITAS>:<key menu>", label = "mati"   (tidak ada baris = nyala)
// CATATAN: ini membatasi tampilan menu (sama seperti pembatasan role di atas), bukan
// pengaman di sisi database.
// ---------------------------------------------------------------------------
export const FITUR_ENTITAS = [
  { grup: "Gudang", fitur: [
    { key: "barang-datang", label: "Pengadaan Barang" },
    { key: "data-barang", label: "Alur Barang" },
    { key: "sku-harga", label: "SKU & Harga" },
    { key: "stok", label: "Stok" },
    { key: "rak", label: "Rak" },
    { key: "cetak-label", label: "Cetak Label" },
    { key: "persetujuan-restock", label: "Persetujuan Restok" },
  ] },
  { grup: "Pemotretan & Marketplace", fitur: [
    { key: "foto", label: "Foto Produk" },
    { key: "marketplace", label: "Marketplace (upload produk)" },
  ] },
  { grup: "Penjualan", fitur: [
    { key: "grosir", label: "Grosir" },
    { key: "toko-offline", label: "Toko Offline" },
    { key: "reseller", label: "Reseller" },
    { key: "pelanggan", label: "Pelanggan" },
    { key: "toko", label: "Toko Pengirim" },
    { key: "penjualan-marketplace", label: "Marketplace (penjualan)" },
    { key: "scan-resi", label: "Scan Resi" },
    { key: "urut-resi", label: "Urut Resi" },
  ] },
  { grup: "Keuangan & SDM", fitur: [
    { key: "keuangan", label: "Keuangan" },
    { key: "penggajian", label: "Penggajian" },
    { key: "absensi", label: "Absensi" },
  ] },
];

// Fitur yang boleh diatur untuk satu perusahaan: Selma (OPS) semua, perusahaan lain hanya
// menu yang datanya sudah dipisah per PT (MENU_PT_LAIN). Holding tidak punya pengaturan fitur.
export function fiturTersediaEntitas(kodeEntitas) {
  const ops = !kodeEntitas || kodeEntitas === "OPS";
  return FITUR_ENTITAS.map((g) => ({
    grup: g.grup,
    fitur: g.fitur.filter((f) => ops || MENU_PT_LAIN.includes(f.key)),
  })).filter((g) => g.fitur.length);
}

// Key menu yang dimatikan untuk satu perusahaan, dari master (master_data tipe "entitas_fitur").
export function fiturMatiEntitas(master, kodeEntitas) {
  const hasil = [];
  (master?.entitas_fitur || []).forEach((m) => {
    const k = String(m.kode || "");
    const i = k.indexOf(":");
    if (i > 0 && k.slice(0, i) === kodeEntitas && m.label === "mati") hasil.push(k.slice(i + 1));
  });
  return hasil;
}

// Daftar SUB-menu (anak menu) yang boleh diakses tiap role, untuk menu yang
// punya beberapa anak (mis. Grosir, Stok, Rak, SKU & Harga, Marketplace,
// Dashboard). Kalau kombinasi role+menu TIDAK didaftarkan di sini, role tsb
// otomatis boleh akses SEMUA anak menu itu (default penuh) — jadi role lain
// (owner lihat Dashboard Gudang & Grosir berdua, superadmin, dst) tidak perlu
// didaftarkan satu-satu, perilakunya tetap default penuh.
export const ROLE_SUBMENUS = {
  grosir: {
    // "pelanggan" dan "toko" (Toko Pengirim) sudah tidak di sini lagi —
    // sekarang masing-masing jadi menu sendiri (lihat ROLE_MENUS.grosir),
    // bukan sub dari "grosir".
    grosir: ["pesanan", "semua-pesanan", "produk-manual", "laporan"],
  },
};

// Nama sub-menu Keuangan/Holding LAMA yang sudah digabung jadi tab. Dipakai supaya
// menu yang tersimpan di sessionStorage (atau tautan lama) tetap membuka halaman yang benar.
export const SUB_KEUANGAN_LAMA = {
  "transaksi-kas": { sub: "transaksi", tab: "transfer" },
  "akun-kas": { sub: "kas", tab: "akun" },
  "buku-kas": { sub: "kas", tab: "buku" },
  rekonsiliasi: { sub: "kas", tab: "rekonsiliasi" },
  rekening: { sub: "pengaturan", tab: "rekening" },
  log: { sub: "pengaturan", tab: "log" },
  riwayat: { sub: "pengaturan", tab: "riwayat" },
  ringkasan: { sub: "grup", tab: "ringkasan" },
  konsolidasi: { sub: "grup", tab: "konsolidasi" },
};

// Sub-menu apa saja yang boleh dilihat role ini untuk satu menu tertentu.
// Return null = boleh akses semua anak menu (tidak dibatasi).
export function allowedSubMenus(role, menuKey) {
  const ov = role !== "superappa" ? AKSES_ROLE[role]?.subs?.[menuKey] : null;
  if (Array.isArray(ov)) return ov;
  return allowedSubMenusBawaan(role, menuKey);
}

// Ada pembatasan sub-menu tersimpan (dari Hak Akses) untuk role+menu ini?
export function adaOverrideSub(role, menuKey) {
  return role !== "superappa" && Array.isArray(AKSES_ROLE[role]?.subs?.[menuKey]);
}

// Aturan sub-menu BAWAAN (tanpa override Hak Akses) — dipakai juga editor Hak Akses sebagai nilai awal.
export function allowedSubMenusBawaan(role, menuKey) {
  // Tab "Riwayat Perubahan" (Keuangan > Pengaturan): hanya superappa (guard di pages/Keuangan.jsx).
  // Holding: Pemegang Saham hanya Grup (tab Konsolidasi saja); Pemilik & Super Appa semua sub.
  // Perusahaan Grup: Pemegang Saham hanya Ringkasan (tab Konsolidasi saja);
  // Super Admin hanya Antar Entitas (mencatat transfer perusahaan -> Holding).
  if (menuKey === "perusahaan") {
    if (role === "pemegang_saham") return ["grup"];
    if (role === "superadmin") return ["antar-entitas"];
    if (role !== "superappa") return ["grup", "detail", "antar-entitas"]; // Kelola Perusahaan: Super Appa saja
    return null;
  }
  // Keuangan Holding (pembukuan Holding sendiri): Pemilik & Super Appa semua sub.
  if (menuKey === "holding") {
    if (role === "pemegang_saham" || role === "superadmin") return [];
    return null;
  }
  // Keuangan SELMA (OPS) tidak punya Antar Entitas / Konsolidasi — itu di menu Holding.
  if (menuKey === "keuangan" && role !== "superappa") {
    return ROLE_SUBMENUS[role]?.[menuKey] || ["transaksi", "kas", "laporan", "pengaturan"];
  }
  return ROLE_SUBMENUS[role]?.[menuKey] || null;
}

// Daftar menu BAWAAN sebuah role (tanpa override) — nilai awal editor Hak Akses.
export function menuBawaanRole(role) {
  return (ROLE_MENUS[role] || ["dashboard"]).slice();
}

export function roleLabel(role) {
  // Disamarkan sebagai "Super Admin" — lihat catatan panjang di ROLES di atas.
  if (role === "superappa") return "Super Admin";
  return ROLES.find((r) => r.key === role)?.label || role;
}