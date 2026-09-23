import { useState } from "react";
import {
  ChevronDown, Truck, ClipboardList, Tag, BarChart3, MapPin, Printer, Camera,
  ShoppingBag, Store, Home, Globe, Users, Landmark, CalendarClock, Settings,
  LayoutDashboard, BookOpen, Search,
} from "lucide-react";
import { PageHeader } from "../components/ui";
import { isSuperadminLike } from "../lib/constants";

// =========================================================
// PANDUAN PENGGUNAAN — konten per bagian, ditampilkan/disembunyikan
// tergantung role yang login (lihat ROLE_SECTIONS di bawah).
// Isi tiap bagian dirangkum dari deskripsi & komentar yang sudah ada di
// masing-masing halaman (BarangDatang, DataBarang, SkuHarga, Stok, Rak,
// Marketplace, Grosir, Keuangan, Absensi, dst) — kalau ada fitur baru atau
// alur berubah, sesuaikan juga poin-poin di sini supaya tetap akurat.
// =========================================================
const SECTIONS = [
  {
    key: "barang-datang",
    label: "Pengadaan Barang",
    icon: Truck,
    ringkasan: "Pesanan barang ke supplier & pencatatan saat barang datang.",
    poin: [
      "Buat pesanan baru ke supplier: pilih supplier, isi tanggal, jenis pesanan, dan model/harga yang dipesan. Bisa disimpan dulu sebagai Draf kalau datanya belum lengkap, lalu dilanjutkan/difinalisasi belakangan.",
      "Begitu barang fisik sampai, tandai dulu status \"Sudah Datang\" (Konfirmasi Datang) sebelum bisa mulai dibongkar & dicek satu-satu.",
      "Isi rincian model & qty yang BENAR-BENAR diterima saat membongkar — status pesanan otomatis jadi \"Sebagian Bongkar\" atau \"Selesai\" tergantung sudah sesuai jumlah pesan atau belum.",
      "Kelola daftar supplier/distributor di tab \"Data Supplier\" — daftarkan dulu di sini sebelum bisa dipilih waktu membuat pesanan.",
    ],
  },
  {
    key: "data-barang",
    label: "Alur Barang",
    icon: ClipboardList,
    ringkasan: "Lacak posisi tiap barang: Buat SKU → Rak → Verifikasi Foto → Marketplace → Selesai.",
    poin: [
      "Halaman ini menampilkan status semua barang di sistem, dari tahap Buat SKU, Rak, (Menunggu Harga kalau ada), Verifikasi Foto, Marketplace, sampai Selesai.",
      "Gunakan pencarian untuk menemukan barang tertentu dan cek sedang ada di tahap mana.",
      "Tombol \"Lanjut ke Tahap Berikutnya\" di detail barang cuma bisa dipakai oleh role yang memang bertanggung jawab atas tahap itu (mis. Gudang untuk SKU/Rak, Pemotretan untuk Verifikasi Foto).",
    ],
  },
  {
    key: "sku-harga",
    label: "SKU & Harga",
    icon: Tag,
    ringkasan: "Buat SKU baru, kelola Master Barang, Master Data kategori, dan Barang Reject.",
    poin: [
      "Buat SKU: cari dulu apakah SKU-nya sudah ada — kalau ketemu tinggal tambah stok, kalau belum baru buat SKU baru lengkap dengan Bahan, Peruntukan, Kategori, Subkategori, Warna, dan Ukuran.",
      "Master Barang: data lengkap tiap SKU — foto, harga asli, HPP, dan harga jual (Grosir/Tengah/Ecer). Untuk ubah persentase markup harga, itu diatur lewat menu Pengaturan (khusus superadmin).",
      "Master Data: kelola daftar kategori (Bahan, Peruntukan, Kategori, Subkategori, Warna, Ukuran) yang muncul sebagai pilihan waktu Buat SKU.",
      "Barang Reject: barang yang otomatis dipisahkan sebagai reject begitu SKU-nya dibuat.",
    ],
  },
  {
    key: "stok",
    label: "Stok",
    icon: BarChart3,
    ringkasan: "Stok Barang, Stok Menipis, Barang Keluar, Stok Opname, Riwayat Stok.",
    poin: [
      "Stok Barang: cek level stok terkini untuk tiap SKU.",
      "Stok Menipis: SKU yang stoknya sudah turun ke ambang batas restock — bisa langsung diajukan ke Owner dari sini.",
      "Barang Keluar: catat pengurangan stok DI LUAR alur Marketplace — misalnya terjual langsung di tempat, rusak, hilang, atau diretur ke supplier.",
      "Stok Opname: hitung fisik stok di gudang, lalu dibandingkan dengan stok sistem untuk mengecek selisih.",
      "Riwayat Stok: catatan setiap perubahan stok (masuk, keluar, atau penyesuaian) — dipakai untuk menelusuri kalau ada selisih yang mencurigakan.",
    ],
  },
  {
    key: "rak",
    label: "Rak",
    icon: MapPin,
    ringkasan: "Tempatkan Barang, Sisa di Gudang, Master Rak, dan Peta Rak.",
    poin: [
      "Tempatkan Barang: barang yang sudah punya SKU tapi belum ditempatkan di rak, termasuk SKU yang rak lamanya sudah ditimpa SKU lain dan perlu dicarikan rak baru.",
      "Sisa di Gudang: SKU yang stoknya belum sepenuhnya masuk rak — biasanya karena rak yang dipakai sudah penuh.",
      "Master Rak: daftar semua rak penyimpanan yang ada di gudang.",
      "Peta Rak: tampilan visual rak per meja (dan per zona kalau sudah diatur), lengkap dengan SKU yang mengisi tiap rak — dari sini juga bisa mengajukan pembelian model baru berdasarkan jumlah rak kosong di suatu zona.",
    ],
  },
  {
    key: "cetak-label",
    label: "Cetak Label",
    icon: Printer,
    ringkasan: "Cetak label harga/barcode untuk SKU.",
    poin: [
      "Pilih SKU yang mau dicetak labelnya, bisa sekaligus menampilkan warna produk (diambil dari kategori Warna di data SKU) di label.",
    ],
  },
  {
    key: "foto",
    label: "Foto Produk (Pemotretan)",
    icon: Camera,
    ringkasan: "Ambil & unggah foto produk untuk barang yang ada di tahap Verifikasi Foto.",
    poin: [
      "Barang yang sudah ditempatkan di rak masuk ke tahap Verifikasi Foto — dari sini fotonya diambil/diunggah.",
      "Setelah foto lengkap dan disetujui, barang otomatis lanjut ke tahap Marketplace (siap diupload admin marketplace).",
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace",
    icon: ShoppingBag,
    ringkasan: "Cek Marketplace (notifikasi), Belum Upload, Sudah Upload, Riwayat Upload.",
    poin: [
      "Cek Marketplace: notifikasi yang perlu ditindaklanjuti — stok tipis/habis, stok baru bertambah, atau rak berubah — supaya listing di marketplace selalu sesuai kondisi gudang. Klik tombol konfirmasi setelah listing disesuaikan.",
      "Belum Upload: barang yang sudah lolos verifikasi foto dan siap diupload. Klik foto untuk memperbesar, atau tombol Detail untuk info lengkap, download foto, atau kembalikan ke Pemotretan kalau ada yang salah.",
      "Sudah Upload: barang yang sudah berhasil diupload ke marketplace.",
      "Riwayat Upload: semua histori upload ke marketplace, terbaru di paling atas.",
    ],
  },
  {
    key: "grosir",
    label: "Grosir (Store Selma)",
    icon: Store,
    ringkasan: "Buat & kelola pesanan grosir, cetak Nota/Label, dan Laporan Grosir.",
    poin: [
      "Buat Pesanan: pilih atau buat pelanggan baru, tambah item dari Data Barang (SKU) atau produk manual, lalu simpan sebagai Draf (belum bayar) atau langsung tandai Lunas.",
      "Semua Pesanan: kelola status bayar tiap pesanan, edit isi pesanan, catat pembayaran cicilan/pelunasan hutang, serta cetak Nota atau Label Pengiriman.",
      "Nota mencantumkan nomor pesanan (format GSR + tanggal + nomor urut harian), nomor urut untuk tiap item barang, dan status/metode pembayaran. Kalau pesanan dilunasi belakangan lewat \"Catat Pembayaran\" (bukan langsung lunas saat dibuat), metode bayar di nota diambil otomatis dari riwayat pembayarannya.",
      "Laporan Grosir: ringkasan omset & jumlah pesanan per rentang tanggal. Daftar pesanan dikelompokkan per pelanggan — klik nama pelanggan untuk membuka/menutup rincian semua pesanannya pada rentang itu.",
    ],
  },
  {
    key: "pelanggan-toko",
    label: "Master Data Grosir",
    icon: Users,
    ringkasan: "Data Pelanggan grosir/reseller dan Toko Pengirim.",
    poin: [
      "Pelanggan: daftar pelanggan grosir & reseller — nama, WA, alamat, kota. Data ini yang dipakai untuk mengisi Label Pengiriman.",
      "Toko Pengirim: daftar toko/alamat pengirim yang bisa dipilih sebagai identitas pengirim di Label Pengiriman (kalau tidak dipilih, dipakai alamat toko utama).",
    ],
  },
  {
    key: "toko-offline",
    label: "Toko Offline",
    icon: Home,
    ringkasan: "Input harian penjualan toko offline (Cash & Transfer).",
    poin: [
      "Input total penjualan harian, dipisah Cash dan Transfer, masing-masing pilih rekening penampungnya.",
      "Begitu disimpan, otomatis tercatat sebagai transaksi pemasukan di Keuangan dengan kategori \"OFFLINE CASH\"/\"OFFLINE TRANSFER\" — tidak perlu dicatat ulang manual di menu Keuangan.",
    ],
  },
  {
    key: "penjualan-marketplace",
    label: "Marketplace (Keuangan per Platform)",
    icon: Globe,
    ringkasan: "Pemasukan & pengeluaran iklan Shopee/TikTok/Lazada, terpisah per toko.",
    poin: [
      "Tiap toko/platform punya saldo sendiri-sendiri — pemasukan, biaya iklan, dan pencairan dihitung terpisah per toko.",
      "Pemasukan & pengeluaran iklan yang dicatat di sini BELUM masuk ke Keuangan. Begitu saldo dicairkan, baru tercatat sebagai pemasukan di menu Keuangan.",
    ],
  },
  {
    key: "reseller",
    label: "Reseller",
    icon: Users,
    ringkasan: "Reseller Toko (hutang), Reseller Cekout (piutang), dan Penagihan/Pencairan.",
    poin: [
      "Reseller Toko: pesanan reseller yang SELALU tercatat sebagai hutang saat dibuat (nomor pesanan diisi manual), ditagih rutin tiap hari Kamis.",
      "Reseller Cekout: pesanan yang dibayar sesuai nominal yang benar-benar cair dari marketplace — kalau cairnya lebih besar, kelebihannya otomatis jadi saldo deposit pelanggan; kalau kurang, sisanya tetap tercatat sebagai piutang.",
      "Penagihan atau Pencairan: rekap hutang aktif Reseller Toko dan status pencairan Reseller Cekout, lengkap dengan riwayat penagihan/pencairan yang sudah selesai.",
    ],
  },
  {
    key: "keuangan",
    label: "Keuangan",
    icon: Landmark,
    ringkasan: "Transaksi, Laporan Keuangan, Log Keterangan, Rekening & Kategori.",
    poin: [
      "Transaksi: catat kas masuk, kas keluar, dan transfer antar rekening satu per satu.",
      "Laporan Keuangan: ringkasan, grafik arus kas, dan breakdown pengeluaran mengikuti rentang tanggal yang dipilih.",
      "Log Keterangan: daftar keterangan yang pernah dipakai di Transaksi — jadi rekomendasi otomatis saat mengisi keterangan transaksi baru. Menghapus di sini hanya menyembunyikan dari log/rekomendasi, transaksi aslinya tidak ikut terhapus.",
      "Rekening & Kategori: kelola daftar rekening (sumber dana) dan kategori pemasukan/pengeluaran yang muncul di form Transaksi.",
    ],
  },
  {
    key: "absensi",
    label: "Absensi",
    icon: CalendarClock,
    ringkasan: "Rekap kehadiran, data akun karyawan, dan pengaturan lokasi kantor.",
    poin: [
      "Rekap Absensi: lihat & koreksi jam masuk/pulang karyawan per minggu, atau tandai Sakit/Izin/Libur.",
      "Data Karyawan: kelola akun karyawan (ubah nama, reset password, hapus akun).",
      "Pengaturan Absensi: atur shift kerja dan lokasi kantor yang dipakai untuk validasi absen.",
    ],
  },
  {
    key: "dashboard-owner",
    label: "Dashboard & Persetujuan Restok",
    icon: LayoutDashboard,
    ringkasan: "Ringkasan seluruh modul dan approval pengajuan restock dari Gudang.",
    poin: [
      "Dashboard: pantau ringkasan status semua modul (alur barang, penjualan, keuangan, dll) dalam satu layar.",
      "Persetujuan Restok: setujui atau tolak pengajuan restock yang diajukan Gudang lewat menu Stok Menipis.",
    ],
  },
  {
    key: "pengaturan",
    label: "Pengaturan (Khusus Superadmin)",
    icon: Settings,
    ringkasan: "Kelola user & hak akses, serta persentase markup harga.",
    poin: [
      "Kelola User: tambah user baru, ubah role, reset password, atau hapus akun karyawan/admin.",
      "Pengaturan lain seperti persentase markup harga jual (Grosir/Tengah/Ecer) juga diatur di sini.",
    ],
  },
];

// Bagian mana saja yang ditampilkan untuk tiap role. Owner & superadmin/
// superappa (isSuperadminLike) tidak didaftarkan di sini — mereka otomatis
// dapat SEMUA bagian (lihat visibleSections di bawah), superadmin ditambah
// bagian "Pengaturan" yang tidak diberikan ke owner biasa.
const ROLE_SECTIONS = {
  gudang: ["barang-datang", "data-barang", "sku-harga", "stok", "rak", "cetak-label"],
  pemotretan: ["foto"],
  marketplace: ["marketplace"],
  grosir: ["grosir", "pelanggan-toko", "toko-offline", "penjualan-marketplace", "reseller"],
  keuangan: ["keuangan"],
};

function visibleSections(role) {
  if (isSuperadminLike(role)) return SECTIONS; // semua bagian, termasuk Pengaturan
  if (role === "owner") return SECTIONS.filter((s) => s.key !== "pengaturan"); // semua kecuali Pengaturan
  const keys = ROLE_SECTIONS[role];
  if (!keys) return SECTIONS; // role tidak dikenali — aman default tampilkan semua
  return SECTIONS.filter((s) => keys.includes(s.key));
}

export default function Panduan({ session }) {
  const role = session?.role;
  const sections = visibleSections(role);
  const showAllBadge = isSuperadminLike(role) || role === "owner";

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set(sections.length <= 3 ? sections.map((s) => s.key) : []));

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const bukaSemua = () => setOpen(new Set(filtered.map((s) => s.key)));
  const tutupSemua = () => setOpen(new Set());

  const s = q.trim().toLowerCase();
  const filtered = s
    ? sections.filter(
        (sec) =>
          sec.label.toLowerCase().includes(s) ||
          sec.ringkasan.toLowerCase().includes(s) ||
          sec.poin.some((p) => p.toLowerCase().includes(s))
      )
    : sections;

  return (
    <div>
      <PageHeader
        title="Panduan Penggunaan"
        description={
          showAllBadge
            ? "Panduan lengkap semua bagian sistem, dikelompokkan per modul."
            : "Panduan singkat pemakaian sistem untuk bagian kerja Anda."
        }
        action={
          filtered.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={bukaSemua}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Buka Semua
              </button>
              <button
                onClick={tutupSemua}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Tutup Semua
              </button>
            </div>
          )
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari topik panduan…"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
          <BookOpen size={22} className="text-slate-600" />
          Tidak ada topik panduan yang cocok dengan pencarian "{q}".
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sec) => {
            const Icon = sec.icon;
            const isOpen = open.has(sec.key);
            return (
              <div key={sec.key} className="rounded-xl border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggle(sec.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-900/60"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200">{sec.label}</div>
                    <div className="text-xs text-slate-500 truncate">{sec.ringkasan}</div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-500 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-0.5 border-t border-slate-800/60">
                    <ul className="space-y-2 mt-3">
                      {sec.poin.map((p, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2">
                          <span className="text-amber-400 flex-shrink-0">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}