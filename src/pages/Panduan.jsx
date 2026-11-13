import { useState } from "react";
import {
  ChevronDown, Truck, ClipboardList, Tag, BarChart3, MapPin, Printer, Camera,
  ShoppingBag, Store, Home, Globe, Users, Landmark, CalendarClock, Settings,
  LayoutDashboard, BookOpen, Search, ScanLine, ListOrdered,
} from "lucide-react";
import { PageHeader } from "../components/ui";
import { isSuperadminLike } from "../lib/constants";

// =========================================================
// PANDUAN PENGGUNAAN — ditulis dengan bahasa gampang (bahasa bayi).
// Tiap menu punya 2 bagian, urutannya selalu begini:
//   1. fungsi : menu ini gunanya apa (kalimat pendek)
//   2. cara   : cara memakainya, berupa kelompok langkah bernomor
//               [{ judul?: "Nama kegiatan", langkah: ["langkah 1", "langkah 2"] }]
// Ditampilkan/disembunyikan tergantung role yang login (lihat ROLE_SECTIONS).
// Kalau ada fitur baru atau alur berubah, sesuaikan juga di sini supaya tetap benar.
// =========================================================
const SECTIONS = [
  {
    key: "barang-datang",
    label: "Pengadaan Barang",
    icon: Truck,
    ringkasan: "Tempat memesan barang ke penjual dan mencatat saat barangnya sampai.",
    fungsi: [
      `Menu ini dipakai untuk memesan barang ke supplier. Supplier itu orang atau toko yang menjual barang ke kita.`,
      `Kalau barangnya sudah sampai di gudang, kita buka kardusnya dan hitung barangnya di sini. Jadi kita tahu barang mana yang sudah datang dan yang belum.`,
    ],
    cara: [
      {
        judul: "Daftarkan supplier dulu (cukup sekali)",
        langkah: [
          `Buka tab "Data Supplier".`,
          `Tambahkan nama supplier.`,
          `Supplier harus didaftarkan dulu. Kalau belum, namanya tidak bisa dipilih saat membuat pesanan.`,
        ],
      },
      {
        judul: "Membuat pesanan ke supplier",
        langkah: [
          `Klik tombol buat pesanan baru.`,
          `Pilih supplier, isi tanggal, dan pilih jenis pesanan.`,
          `Isi model dan harga barang yang dipesan.`,
          `Kalau datanya belum lengkap, simpan dulu sebagai "Draf". Nanti boleh dilanjutkan.`,
          `Kalau sudah lengkap, selesaikan pesanannya (finalisasi).`,
        ],
      },
      {
        judul: "Saat barangnya sudah sampai",
        langkah: [
          `Tandai pesanan itu "Sudah Datang" (Konfirmasi Datang). Ini wajib dulu, kalau belum tidak bisa dibongkar.`,
          `Buka kardusnya dan hitung barangnya satu per satu.`,
          `Isi model dan jumlah yang BENAR-BENAR diterima.`,
          `Status pesanan berubah sendiri. "Sebagian Bongkar" artinya masih ada yang belum datang. "Selesai" artinya jumlahnya sudah sama dengan yang dipesan.`,
        ],
      },
      {
        judul: "Belanja Habis Pakai (bubble wrap, lakban, alat tulis, dan sejenisnya)",
        langkah: [
          `Catat barang yang dibeli.`,
          `Kalau sudah dibayar, tandai "dibayar" lalu pilih rekening yang dipakai.`,
          `Uang yang keluar otomatis tercatat di Keuangan.`,
          `Jangan dicatat lagi pakai tangan di Keuangan, nanti tercatat dua kali.`,
        ],
      },
    ],
  },
  {
    key: "data-barang",
    label: "Alur Barang",
    icon: ClipboardList,
    ringkasan: "Melihat setiap barang lagi ada di langkah yang mana.",
    fungsi: [
      `Menu ini seperti papan pengumuman perjalanan barang. Kita bisa lihat setiap barang sedang ada di langkah yang mana.`,
      `Urutan langkahnya: Buat SKU, lalu Rak, lalu (Menunggu Harga kalau ada), lalu Verifikasi Foto, lalu Marketplace, lalu Selesai. SKU itu kode unik untuk tiap barang.`,
    ],
    cara: [
      {
        langkah: [
          `Buka menu Alur Barang. Semua barang tampil beserta langkahnya.`,
          `Mau cari barang tertentu? Ketik namanya di kotak pencarian.`,
          `Klik barangnya untuk melihat detail.`,
          `Di detail ada tombol "Lanjut ke Tahap Berikutnya". Tombol ini cuma bisa dipakai orang yang memang bertugas di langkah itu. Contoh: Gudang untuk SKU dan Rak, Pemotretan untuk Verifikasi Foto.`,
          `Kalau tombolnya tidak bisa ditekan, berarti itu bukan tugas akunmu.`,
        ],
      },
    ],
  },
  {
    key: "sku-harga",
    label: "SKU & Harga",
    icon: Tag,
    ringkasan: "Bikin kode barang baru, simpan data lengkap barang, dan atur daftar pilihan.",
    fungsi: [
      `Menu ini tempat bikin kode barang (SKU) yang baru dan menyimpan data lengkap setiap barang, seperti foto dan harga.`,
      `Di sini juga ada daftar pilihan (bahan, warna, ukuran, dan lain-lain) dan daftar barang reject.`,
    ],
    cara: [
      {
        judul: "Membuat SKU baru",
        langkah: [
          `Cari dulu, SKU barang itu sudah ada atau belum.`,
          `Kalau sudah ada, tinggal tambah stoknya saja.`,
          `Kalau belum ada, buat SKU baru. Isi Bahan, Peruntukan, Kategori, Subkategori, Warna, dan Ukuran.`,
        ],
      },
      {
        judul: "Master Barang (data lengkap tiap barang)",
        langkah: [
          `Buka Master Barang.`,
          `Di sini ada foto, harga asli, HPP (modal), dan harga jual Grosir, Tengah, dan Ecer.`,
          `Mau mengubah persentase naik harga (markup)? Itu diatur di menu Pengaturan oleh superadmin.`,
        ],
      },
      {
        judul: "Master Data (daftar pilihan)",
        langkah: [
          `Buka Master Data.`,
          `Pilih jenisnya: Bahan, Peruntukan, Kategori, Subkategori, Warna, atau Ukuran.`,
          `Tambahkan kode dan namanya.`,
          `Daftar ini nanti muncul sebagai pilihan saat Buat SKU.`,
        ],
      },
      {
        judul: "Barang Reject",
        langkah: [
          `Buka tab Barang Reject untuk melihat barang yang rusak atau tidak lolos.`,
          `Barang reject dipisahkan otomatis begitu SKU-nya dibuat.`,
        ],
      },
    ],
  },
  {
    key: "stok",
    label: "Stok",
    icon: BarChart3,
    ringkasan: "Melihat dan mengatur jumlah barang di gudang, termasuk kirim barang ke perusahaan lain.",
    fungsi: [
      `Menu ini untuk melihat berapa jumlah barang di gudang dan mengatur kalau jumlahnya berubah.`,
      `Ada Stok Barang, Stok Menipis, Barang Keluar, Stok Opname, dan Riwayat Stok. Di sini juga bisa kirim dan terima barang antar perusahaan (Transfer Antar Entitas).`,
    ],
    cara: [
      {
        judul: "Melihat stok",
        langkah: [
          `Stok Barang: lihat jumlah stok terbaru tiap SKU.`,
          `Stok Menipis: lihat SKU yang hampir habis. Dari sini bisa langsung diajukan ke Owner supaya dibelikan lagi.`,
          `Riwayat Stok: catatan semua stok yang naik dan turun. Dipakai kalau ada selisih yang aneh.`,
        ],
      },
      {
        judul: "Barang Keluar (di luar Marketplace)",
        langkah: [
          `Dipakai kalau stok berkurang bukan karena Marketplace. Contohnya barang terjual langsung di tempat, rusak, hilang, atau dikembalikan ke supplier.`,
          `Catat barang apa yang berkurang, berapa jumlahnya, dan kenapa.`,
        ],
      },
      {
        judul: "Stok Opname (hitung barang asli)",
        langkah: [
          `Hitung barang yang benar-benar ada di gudang.`,
          `Bandingkan dengan angka di sistem.`,
          `Lihat selisihnya, lalu cari tahu kenapa bisa beda.`,
        ],
      },
      {
        judul: "Mengirim barang ke perusahaan lain",
        langkah: [
          `Klik Buat Transfer.`,
          `Pilih perusahaan tujuan.`,
          `Cari SKU yang mau dikirim. Hanya SKU yang stoknya ada yang bisa dipilih.`,
          `Isi jumlahnya. Tidak boleh lebih banyak dari stok.`,
          `Klik Kirim Barang. Stok kita langsung berkurang, statusnya jadi "Dalam perjalanan", dan HPP per pcs dicatat saat itu.`,
          `Cetak Surat Jalan dan Label Paket dari kartu transfer. Di surat jalan ada kode terima 6 karakter dan barcode-nya. Kode itu tidak tampil di aplikasi.`,
        ],
      },
      {
        judul: "Menerima barang kiriman",
        langkah: [
          `Pilih Terima Barang.`,
          `Scan barcode di surat jalan, atau ketik kode terimanya.`,
          `Hitung barang yang datang. Isi jumlah yang diterima untuk tiap SKU. Isi 0 kalau barangnya tidak datang.`,
          `Kalau ada selisih, wajib isi catatan alasannya.`,
          `Konfirmasi. Stok kita bertambah.`,
          `Kalau barangnya salah atau tidak sampai, pilih Tolak lalu isi alasannya.`,
        ],
      },
      {
        judul: "Kalau kiriman dibatalkan atau ditolak",
        langkah: [
          `Pengirim bisa menekan Batalkan selama statusnya masih "Dalam perjalanan".`,
          `Kalau kiriman ditolak atau ada selisih, pengirim menekan "Kembalikan ke stok".`,
          `Hapus dan kembalikan hanya bisa dilakukan orang yang punya hak. Kalau barang sudah diterima, stok penerima ditarik lagi. Kalau stok penerima sudah tidak cukup, prosesnya gagal.`,
          `Jumlah di Peta Rak tidak berubah sendiri. Jadi cek Peta Rak setelahnya.`,
        ],
      },
      {
        judul: "Meminta stok dari perusahaan lain",
        langkah: [
          `Perusahaan yang butuh barang mengajukan Permintaan Stok.`,
          `Pihak yang memberi barang menyetujuinya. Lalu masuk ke form transfer dengan jumlah yang sudah terisi.`,
          `Setelah itu langkahnya sama seperti mengirim barang di atas.`,
        ],
      },
    ],
  },
  {
    key: "rak",
    label: "Rak",
    icon: MapPin,
    ringkasan: "Mengatur barang disimpan di rak yang mana.",
    fungsi: [
      `Menu ini mengatur tempat penyimpanan barang di gudang, yaitu raknya.`,
      `Kita bisa menaruh barang ke rak, melihat barang yang belum masuk rak, mengatur daftar rak, dan melihat peta rak.`,
    ],
    cara: [
      {
        judul: "Menaruh barang ke rak",
        langkah: [
          `Buka Tempatkan Barang.`,
          `Di sini ada barang yang sudah punya SKU tapi belum ditaruh di rak.`,
          `Barang yang raknya sudah dipakai SKU lain juga ada di sini, karena perlu dicarikan rak baru.`,
          `Pilih barang, lalu pilih rak tempatnya.`,
        ],
      },
      {
        judul: "Sisa di Gudang",
        langkah: [
          `Buka Sisa di Gudang untuk melihat SKU yang stoknya belum masuk rak semua.`,
          `Biasanya karena rak yang dipakai sudah penuh.`,
        ],
      },
      {
        judul: "Master Rak",
        langkah: [`Buka Master Rak untuk melihat daftar semua rak di gudang.`],
      },
      {
        judul: "Peta Rak",
        langkah: [
          `Buka Peta Rak. Isinya gambar rak per meja (dan per zona kalau sudah diatur), lengkap dengan SKU di tiap rak.`,
          `Dari sini juga bisa mengajukan pembelian model baru, sesuai jumlah rak kosong di zona itu.`,
        ],
      },
    ],
  },
  {
    key: "cetak-label",
    label: "Cetak Label",
    icon: Printer,
    ringkasan: "Mencetak stiker harga atau barcode untuk barang.",
    fungsi: [`Menu ini untuk mencetak stiker (label) harga atau barcode yang ditempel di barang.`],
    cara: [
      {
        langkah: [
          `Buka menu Cetak Label.`,
          `Pilih SKU yang mau dicetak labelnya.`,
          `Kalau mau, tampilkan juga warna produk di label. Warnanya diambil dari data Warna di SKU.`,
          `Cetak labelnya.`,
        ],
      },
    ],
  },
  {
    key: "foto",
    label: "Foto Produk (Pemotretan)",
    icon: Camera,
    ringkasan: "Memotret dan mengunggah foto barang.",
    fungsi: [
      `Menu ini untuk mengambil dan mengunggah foto barang.`,
      `Barang yang sudah ada di rak masuk ke langkah Verifikasi Foto, dan dari sinilah fotonya dibuat.`,
    ],
    cara: [
      {
        langkah: [
          `Buka menu Foto Produk. Barang yang perlu difoto tampil di sini.`,
          `Ambil foto barangnya, atau unggah fotonya.`,
          `Setelah fotonya lengkap dan disetujui, barang otomatis pindah ke langkah Marketplace. Artinya siap diupload oleh admin marketplace.`,
        ],
      },
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace",
    icon: ShoppingBag,
    ringkasan: "Pengingat soal barang di toko online, dan daftar barang yang sudah atau belum diupload.",
    fungsi: [
      `Menu ini untuk mengurus barang di toko online (marketplace). Ada pengingat kalau toko online perlu disesuaikan dengan gudang.`,
      `Ada juga daftar barang yang belum diupload, yang sudah diupload, dan riwayat upload.`,
    ],
    cara: [
      {
        judul: "Cek Marketplace (pengingat)",
        langkah: [
          `Buka Cek Marketplace.`,
          `Di sini muncul pengingat: stok tipis atau habis, stok baru bertambah, atau rak berubah.`,
          `Sesuaikan barang di toko online sesuai pengingat itu.`,
          `Setelah selesai, klik tombol konfirmasi.`,
        ],
      },
      {
        judul: "Belum Upload",
        langkah: [
          `Buka Belum Upload. Isinya barang yang sudah lolos verifikasi foto dan siap diupload.`,
          `Klik foto untuk memperbesar.`,
          `Klik tombol Detail untuk lihat info lengkap dan download foto.`,
          `Kalau ada yang salah, kembalikan barang ke Pemotretan lewat tombol Detail.`,
        ],
      },
      {
        judul: "Sudah Upload dan Riwayat Upload",
        langkah: [
          `Sudah Upload: daftar barang yang sudah berhasil diupload ke marketplace.`,
          `Riwayat Upload: semua catatan upload, yang terbaru ada di paling atas.`,
        ],
      },
    ],
  },
  {
    key: "grosir",
    label: "Grosir (Store)",
    icon: Store,
    ringkasan: "Membuat pesanan grosir, mencetak nota dan label, dan melihat laporan.",
    fungsi: [
      `Menu ini untuk pesanan pembeli grosir, yaitu pembeli yang beli banyak sekaligus.`,
      `Kita bisa bikin pesanan, mengatur pembayarannya, mencetak Nota dan Label Pengiriman, dan melihat Laporan Grosir.`,
    ],
    cara: [
      {
        judul: "Membuat pesanan",
        langkah: [
          `Klik Buat Pesanan.`,
          `Pilih pelanggan, atau buat pelanggan baru.`,
          `Tambahkan barang dari Data Barang (SKU), atau tambahkan produk manual.`,
          `Simpan sebagai Draf kalau belum dibayar. Atau langsung tandai Lunas kalau sudah dibayar.`,
        ],
      },
      {
        judul: "Mengurus pesanan yang sudah ada",
        langkah: [
          `Buka Semua Pesanan.`,
          `Di sini bisa mengatur status bayar, mengubah isi pesanan, dan mencatat pembayaran cicilan atau pelunasan hutang.`,
          `Cetak Nota atau Label Pengiriman dari sini.`,
        ],
      },
      {
        judul: "Tentang Nota",
        langkah: [
          `Nota memuat nomor pesanan. Formatnya GSR + tanggal + nomor urut hari itu.`,
          `Setiap barang di nota punya nomor urut. Status dan cara bayar juga tertulis.`,
          `Kalau pesanan dilunasi belakangan lewat "Catat Pembayaran", cara bayar di nota diambil sendiri dari riwayat pembayaran.`,
        ],
      },
      {
        judul: "Laporan Grosir",
        langkah: [
          `Pilih rentang tanggal.`,
          `Lihat total omset dan jumlah pesanan.`,
          `Pesanan dikelompokkan per pelanggan. Klik nama pelanggan untuk membuka atau menutup rincian pesanannya.`,
        ],
      },
    ],
  },
  {
    key: "pelanggan-toko",
    label: "Master Data Grosir",
    icon: Users,
    ringkasan: "Daftar pelanggan grosir dan daftar toko pengirim.",
    fungsi: [
      `Menu ini menyimpan data pelanggan grosir dan reseller, serta data toko pengirim.`,
      `Data ini dipakai untuk mengisi Label Pengiriman supaya tidak mengetik ulang.`,
    ],
    cara: [
      {
        judul: "Pelanggan",
        langkah: [
          `Buka tab Pelanggan.`,
          `Tambahkan pelanggan: nama, nomor WA, alamat, dan kota.`,
          `Data ini dipakai untuk mengisi Label Pengiriman.`,
        ],
      },
      {
        judul: "Toko Pengirim",
        langkah: [
          `Buka tab Toko Pengirim.`,
          `Tambahkan toko atau alamat pengirim.`,
          `Saat mencetak Label Pengiriman, toko ini bisa dipilih sebagai pengirim. Kalau tidak dipilih, dipakai alamat toko utama.`,
        ],
      },
    ],
  },
  {
    key: "toko-offline",
    label: "Toko Offline",
    icon: Home,
    ringkasan: "Mencatat hasil jualan harian di toko offline.",
    fungsi: [
      `Menu ini untuk mencatat total jualan harian di toko offline (toko yang pembelinya datang langsung).`,
      `Uangnya dipisah dua: Cash (uang tunai) dan Transfer.`,
    ],
    cara: [
      {
        langkah: [
          `Buka menu Toko Offline.`,
          `Isi total penjualan hari itu untuk Cash.`,
          `Isi total penjualan hari itu untuk Transfer.`,
          `Pilih rekening penampungnya. Rekening ini sudah tetap dan tidak bisa dipilih manual: Cash masuk ke Petty Cash, Cashless masuk ke rekening BCA yang tetap.`,
          `Simpan.`,
          `Begitu disimpan, otomatis tercatat sebagai pemasukan di Keuangan dengan kategori "OFFLINE CASH" atau "OFFLINE TRANSFER". Jangan dicatat lagi di menu Keuangan.`,
        ],
      },
    ],
  },
  {
    key: "penjualan-marketplace",
    label: "Marketplace (Keuangan per Platform)",
    icon: Globe,
    ringkasan: "Uang masuk dan biaya iklan Shopee, TikTok, dan Lazada, dipisah per toko.",
    fungsi: [
      `Menu ini mencatat uang masuk dan biaya iklan dari Shopee, TikTok, dan Lazada.`,
      `Setiap toko punya saldo sendiri-sendiri, jadi tidak tercampur.`,
    ],
    cara: [
      {
        langkah: [
          `Pilih platform dan tokonya.`,
          `Catat pemasukan dan biaya iklan toko itu. Saldo tiap toko dihitung sendiri-sendiri, termasuk pencairan.`,
          `Pemasukan dan biaya iklan yang dicatat di sini BELUM masuk ke Keuangan.`,
          `Saat saldo dicairkan, barulah tercatat sebagai pemasukan di menu Keuangan.`,
        ],
      },
    ],
  },
  {
    key: "reseller",
    label: "Reseller",
    icon: Users,
    ringkasan: "Pesanan reseller, tagihan, dan pencairan.",
    fungsi: [
      `Menu ini untuk pesanan reseller, yaitu orang yang menjual lagi barang kita.`,
      `Ada dua jenis. Reseller Toko dicatat sebagai hutang. Reseller Cekout dibayar sesuai uang yang cair dari marketplace.`,
    ],
    cara: [
      {
        judul: "Reseller Toko (hutang)",
        langkah: [
          `Buat pesanan. Nomor pesanan diisi manual.`,
          `Pesanan ini SELALU tercatat sebagai hutang saat dibuat.`,
          `Tagih rutin tiap hari Kamis.`,
        ],
      },
      {
        judul: "Reseller Cekout",
        langkah: [
          `Buat pesanan.`,
          `Pesanan dibayar sesuai jumlah uang yang benar-benar cair dari marketplace.`,
          `Kalau uang yang cair lebih besar, kelebihannya otomatis jadi saldo deposit pelanggan.`,
          `Kalau uang yang cair kurang, sisanya tetap tercatat sebagai piutang.`,
        ],
      },
      {
        judul: "Penagihan atau Pencairan",
        langkah: [
          `Buka tab Penagihan atau Pencairan.`,
          `Di sini ada rekap hutang yang masih aktif dari Reseller Toko, dan status pencairan Reseller Cekout.`,
          `Riwayat penagihan atau pencairan yang sudah selesai juga ada di sini.`,
        ],
      },
    ],
  },
  {
    key: "scan-resi",
    label: "Scan Resi",
    icon: ScanLine,
    ringkasan: "Scan resi paket yang mau dikirim, dan tahu mana pesanan yang dibatalkan.",
    fungsi: [
      `Menu ini untuk men-scan resi paket yang mau dikirim. Resi itu kertas yang ada barcode pengiriman.`,
      `Sistem menghitung paket per ekspedisi dan memberi tahu kalau ada pesanan yang dibatalkan (cancel), supaya paketnya jangan sampai dikirim.`,
    ],
    cara: [
      {
        judul: "Men-scan resi",
        langkah: [
          `Buka tab Scan Resi.`,
          `Arahkan scanner barcode ke resi. Atau tekan tombol Kamera.`,
          `Lihat warnanya. HIJAU berarti OK. KUNING berarti resi itu sudah pernah di-scan. MERAH berarti pesanannya cancel, jadi JANGAN dikirim.`,
          `Ekspedisi terbaca sendiri dari nomor resi dan dihitung di tabel rekap.`,
        ],
      },
      {
        judul: "Daftar Cancel",
        langkah: [
          `Buka tab Daftar Cancel.`,
          `Tempel nomor resi pesanan yang dibatalkan. Atau upload file export pesanan dari Shopee, TikTok, atau Lazada.`,
          `Kalau ada resi yang ternyata sudah terlanjur di-scan, muncul peringatan merah. Tarik paketnya.`,
        ],
      },
      {
        judul: "Rekap",
        langkah: [
          `Buka tab Rekap.`,
          `Pilih rentang tanggal.`,
          `Lihat jumlah resi yang valid dan yang cancel, per ekspedisi.`,
          `Kalau mau, ekspor ke Excel.`,
        ],
      },
    ],
  },
  {
    key: "urut-resi",
    label: "Urut Resi",
    icon: ListOrdered,
    ringkasan: "Mengurutkan resi supaya packing lebih cepat.",
    fungsi: [
      `Menu ini mengurutkan tumpukan resi dari Shopee, TikTok Shop, dan Tokopedia supaya packing jadi lebih cepat.`,
      `Resi yang barangnya sama dikumpulkan jadi satu, jadi petugas tidak bolak-balik mencari barang.`,
    ],
    cara: [
      {
        langkah: [
          `Upload satu atau beberapa PDF resi (J&T, GTL, SPX).`,
          `Resi yang ganda dilewati. Resi yang lebih dari 1 halaman tetap digabung.`,
          `Pilih cara mengurutkan: per produk (kategori lalu kode), per kurir lalu produk, atau per kode rak gudang.`,
          `Lihat Ringkasan packing. Isinya total pcs tiap produk dan ukuran.`,
          `Klik Download PDF terurut, lalu cetak.`,
        ],
      },
    ],
  },
  {
    key: "keuangan",
    label: "Keuangan",
    icon: Landmark,
    ringkasan: "Mencatat uang masuk dan keluar, mengecek saldo, dan melihat laporan.",
    fungsi: [
      `Menu ini seperti buku catatan uang. Semua uang yang masuk, keluar, dan pindah dicatat di sini.`,
      `Isinya: Transaksi, Kas (rekening dan saldo), Laporan Keuangan, dan Pengaturan.`,
      `Ada dua jenis kas. Saldo Bank adalah uang yang ada di bank. Uang Cash adalah uang tunai yang dipegang.`,
    ],
    cara: [
      {
        judul: "ATURAN PALING PENTING: jangan mencatat dua kali",
        langkah: [
          `Beberapa menu sudah mencatat ke Keuangan sendiri: Toko Offline, Grosir "Langsung Bayar", Belanja Habis Pakai, dan pencairan marketplace.`,
          `Kalau sudah otomatis, jangan dicatat lagi pakai tangan.`,
          `Cek daftar Transaksi dulu supaya tidak terhitung dua kali.`,
        ],
      },
      {
        judul: "Mencatat transaksi sendiri",
        langkah: [
          `Buka Transaksi lalu tambah transaksi.`,
          `Pilih jenisnya: Pemasukan, Pengeluaran, atau Transfer.`,
          `Isi tanggal, rekening, kategori, jumlah, dan keterangan.`,
          `Mau bikin beberapa transaksi dengan nominal sama? Isi beberapa baris keterangan. Saldo dicek terhadap jumlah totalnya.`,
          `Kalau saldo rekening kurang, sistem menolak.`,
          `Kalau salah catat, pakai Edit. Atau Hapus lalu catat ulang.`,
        ],
      },
      {
        judul: "Memindahkan uang antar kas (Isi Uang Cash)",
        langkah: [
          `Buka Transaksi lalu tab Transfer Antar Kas.`,
          `Pilih rekening Saldo Bank sebagai asal, dan Uang Cash sebagai tujuan.`,
          `Isi jumlahnya.`,
          `Lampirkan foto bukti. Kalau kosong, ditandai "Belum ada bukti" dan bisa dilampirkan nanti dari daftar.`,
          `Arah sebaliknya (dari Uang Cash ke bank) tercatat sebagai "Setoran dari Uang Cash".`,
          `Perpindahan ini bukan pemasukan dan bukan pengeluaran, jadi laba tidak berubah.`,
        ],
      },
      {
        judul: "Kas (melihat rekening dan saldo)",
        langkah: [
          `Akun Kas: daftar rekening, jenisnya, lokasinya, dan saldonya.`,
          `Buku Kas: riwayat uang tiap akun, lengkap dengan saldo yang berjalan. Bisa diunduh sebagai CSV.`,
          `Rekonsiliasi: mencocokkan saldo di aplikasi dengan uang asli.`,
        ],
      },
      {
        judul: "Rekonsiliasi (cocokkan uang asli)",
        langkah: [
          `Buka Kas lalu Rekonsiliasi.`,
          `Isi saldo asli tiap akun yang dicek. Untuk Uang Cash, hitung uang fisiknya. Untuk Saldo Bank, lihat saldo di mutasi bank.`,
          `Sistem menampilkan selisihnya: Sesuai, Lebih, atau Kurang. Isi catatan penyebabnya.`,
          `Cari tahu dulu kenapa ada selisih. Mungkin ada transaksi yang belum dicatat, salah rekening, atau salah jumlah. Perbaiki transaksinya.`,
          `Kalau selisihnya benar-benar tidak ketahuan sebabnya, baru catat sebagai penyesuaian. Pilih kategori pemasukan kalau Lebih, atau kategori pengeluaran kalau Kurang.`,
          `Sistem meminta konfirmasi, lalu mencatat "Penyesuaian rekonsiliasi kas" bertanggal hari ini.`,
        ],
      },
      {
        judul: "Laporan Keuangan",
        langkah: [
          `Pilih rentang tanggal.`,
          `Lihat ringkasan, grafik arus kas, dan rincian pengeluaran.`,
          `Laporan bisa dibuat PDF bulanan dan tahunan.`,
          `Ada juga ringkasan tulisan untuk dikirim lewat WhatsApp.`,
        ],
      },
      {
        judul: "Pengaturan",
        langkah: [
          `Log Keterangan: daftar keterangan yang pernah dipakai. Nanti muncul sebagai saran saat mengisi keterangan transaksi baru. Kalau dihapus di sini, cuma disembunyikan dari saran. Transaksi aslinya tidak ikut terhapus.`,
          `Rekening & Kategori: kelola daftar rekening dan kategori pemasukan serta pengeluaran yang muncul di form Transaksi. Kalau kode rekening atau kategori diganti, semua transaksi yang memakai kode itu ikut berganti ke kode baru.`,
          `Tiap rekening bisa ditandai Saldo Bank atau Uang Cash. Rekening yang belum ditandai otomatis masuk Uang Cash.`,
        ],
      },
      {
        judul: "Kebiasaan yang disarankan",
        langkah: [
          `Setiap hari: isi Toko Offline, catat pengeluaran yang belum otomatis, dan lampirkan bukti yang masih kosong.`,
          `Setiap minggu: tagih Reseller Toko tiap Kamis, cairkan saldo marketplace, dan rekonsiliasi Uang Cash.`,
          `Setiap bulan: rekonsiliasi semua rekening bank, beri penanda pada transfer antar perusahaan yang masih "Belum ditandai", buat laporan bulanan PDF, dan periksa Konsolidasi.`,
        ],
      },
    ],
  },
  {
    key: "holding",
    label: "Pusat (Holding) & Perusahaan Grup",
    icon: Landmark,
    ringkasan: "Kirim uang antar perusahaan, penarikan pemilik, dan gabungan laporan.",
    fungsi: [
      `Pusat (Holding) adalah perusahaan induk grup, ibarat ibunya. Perusahaan lain adalah anak-anaknya.`,
      `Setiap perusahaan, termasuk Pusat, punya buku keuangan sendiri-sendiri.`,
      `Menu ini untuk mengirim uang antar perusahaan, mencatat Penarikan Pemilik, dan melihat laporan gabungan (Konsolidasi).`,
    ],
    cara: [
      {
        judul: "Sebelum mencatat, cek dulu",
        langkah: [
          `Pastikan menu dan perusahaan yang dibuka sudah benar.`,
          `Kalau salah perusahaan, transaksinya masuk ke buku perusahaan lain.`,
        ],
      },
      {
        judul: "Jenis kiriman uang (mengikuti arahnya)",
        langkah: [
          `Dari Pusat ke perusahaan: "Pemberian Modal" (bukan pemasukan untuk penerima) atau "Pinjaman" (jadi utang penerima).`,
          `Dari perusahaan ke Pusat: "Setoran Pemasukan" (jadi pemasukan Pusat, bukan beban pengirim) atau "Pembayaran Pinjaman".`,
          `Antar dua perusahaan: "Pinjaman" atau "Pembayaran Pinjaman".`,
        ],
      },
      {
        judul: "Mengirim uang antar perusahaan",
        langkah: [
          `Buka Perusahaan Grup, lalu Antar Entitas, lalu Transfer Antar Entitas.`,
          `Isi tanggal.`,
          `Pilih jenisnya lebih dulu. Pilihan rekening menyesuaikan jenis yang dipilih.`,
          `Pilih rekening asal dan rekening tujuan. Saldonya tampil di pilihan.`,
          `Isi jumlah dan keterangan.`,
          `Lampirkan foto bukti (boleh menyusul).`,
          `Simpan. Tombol Simpan baru aktif kalau perusahaannya beda, jumlahnya lebih dari nol, dan saldo asal cukup.`,
        ],
      },
      {
        judul: "Mengatur rekening supaya terisi otomatis",
        langkah: [
          `Sumber dana Pusat bisa dibuat tetap. Atur rekening banknya di Keuangan Holding, lalu Pengaturan, lalu Penggunaan Rekening, lalu "Sumber dana transfer antar perusahaan".`,
          `Setelah itu, saat Pusat yang mengirim, rekening asal terisi sendiri dan terkunci.`,
          `Tiap perusahaan juga bisa menetapkan maksimal 2 rekening penerima uang dari Pusat. Atur di Keuangan, lalu Pengaturan, lalu Penggunaan Rekening ("Rekening penerima dari Pusat 1 dan 2").`,
          `Kalau sudah diatur, saat Pusat mengirim, rekening tujuan perusahaan itu hanya menampilkan rekening tersebut.`,
        ],
      },
      {
        judul: "Setoran Pemasukan",
        langkah: [
          `Centang pemasukan cabang yang ikut disetor, misalnya Grosir Transfer atau Cash.`,
          `Jumlahnya otomatis sama dengan total yang dicentang.`,
          `Pemasukan yang sudah pernah disetor tidak muncul lagi.`,
          `Pindahkan dulu uang Petty Cash ke bank. Setoran keluar dari satu rekening bank.`,
        ],
      },
      {
        judul: "Siapa yang boleh mencatat",
        langkah: [
          `Dari Pusat ke perusahaan: Pemilik.`,
          `Dari perusahaan ke Pusat: Super Admin.`,
          `Antar dua perusahaan: hanya Super Appa.`,
          `Super Appa bisa mengubahnya di Pengaturan, lalu Hak Akses.`,
        ],
      },
      {
        judul: "Pinjaman dan Konsolidasi",
        langkah: [
          `Posisi pinjaman tiap perusahaan dihitung dari seluruh riwayat. Angka positif artinya piutang, angka negatif artinya utang.`,
          `Di Konsolidasi, kiriman uang antar perusahaan dihapus dari hitungan supaya tidak terhitung dua kali.`,
        ],
      },
      {
        judul: "Kirim barang antar perusahaan",
        langkah: [
          `Kirim barang tidak membuat catatan uang.`,
          `Kalau barangnya harus dibayar, catat pembayarannya sendiri sebagai transfer uang di menu ini.`,
          `Cara kirim dan terima barang ada di panduan Stok.`,
        ],
      },
      {
        judul: "Penarikan Pemilik (dicatat oleh Pemilik)",
        langkah: [
          `Buka Keuangan Holding, lalu Penarikan Pemilik.`,
          `Semua jenis menggerakkan saldo kas Pusat. Tapi cuma "Gaji Pemilik" yang menjadi beban di laba rugi.`,
          `Untuk Gaji Pemilik, wajib memilih kategori.`,
          `Namanya "Prive" kalau tanggalnya sebelum PT berdiri, Tanggal berdirinya diatur di pengaturan Pusat.`,
          `Sisa pinjaman pemilik dihitung dari seluruh riwayat.`,
          `Kalau salah catat, hapus lalu catat ulang. Laba rugi tidak ikut berubah, kecuali untuk Gaji Pemilik.`,
        ],
      },
    ],
  },
  {
    key: "absensi",
    label: "Absensi",
    icon: CalendarClock,
    ringkasan: "Catatan kehadiran karyawan.",
    fungsi: [
      `Menu ini untuk melihat siapa saja yang masuk kerja dan jam berapa.`,
      `Di sini juga ada data akun karyawan dan pengaturan shift serta lokasi kantor.`,
    ],
    cara: [
      {
        judul: "Rekap Absensi",
        langkah: [
          `Buka Rekap Absensi. Datanya per minggu.`,
          `Lihat atau perbaiki jam masuk dan jam pulang karyawan.`,
          `Kalau karyawan tidak masuk, tandai Sakit, Izin, atau Libur.`,
        ],
      },
      {
        judul: "Data Karyawan",
        langkah: [
          `Buka Data Karyawan.`,
          `Di sini bisa mengubah nama, reset password, atau menghapus akun karyawan.`,
        ],
      },
      {
        judul: "Pengaturan Absensi",
        langkah: [
          `Buka Pengaturan Absensi.`,
          `Atur shift kerja dan lokasi kantor.`,
          `Lokasi kantor dipakai untuk mengecek apakah karyawan absen di tempat yang benar.`,
        ],
      },
    ],
  },
  {
    key: "dashboard-owner",
    label: "Dashboard & Persetujuan Restok",
    icon: LayoutDashboard,
    ringkasan: "Ringkasan semua menu dalam satu layar, dan menyetujui permintaan beli barang lagi.",
    fungsi: [
      `Dashboard itu layar utama. Semua ringkasan penting dikumpulkan di satu tempat, jadi tidak perlu membuka menu satu-satu.`,
      `Persetujuan Restok untuk menyetujui atau menolak permintaan Gudang yang ingin membeli barang lagi.`,
    ],
    cara: [
      {
        judul: "Dashboard",
        langkah: [
          `Buka Dashboard.`,
          `Lihat ringkasan alur barang, penjualan, keuangan, dan lain-lain.`,
          `Di bagian kas, tab Saldo Bank dan Uang Cash bisa dipilih untuk melihat salah satunya.`,
        ],
      },
      {
        judul: "Persetujuan Restok",
        langkah: [
          `Buka Persetujuan Restok.`,
          `Di sini ada permintaan restock dari Gudang. Gudang mengajukannya lewat menu Stok Menipis.`,
          `Baca permintaannya.`,
          `Pilih setujui atau tolak.`,
        ],
      },
    ],
  },
  {
    key: "pengaturan",
    label: "Pengaturan (Khusus Superadmin)",
    icon: Settings,
    ringkasan: "Mengatur akun pengguna dan persentase naik harga.",
    fungsi: [
      `Menu ini hanya untuk superadmin. Isinya pengaturan penting yang tidak boleh sembarang orang mengubahnya.`,
      `Di sini kita mengatur siapa saja yang bisa masuk ke aplikasi, apa yang boleh mereka lakukan, dan persentase naik harga jual.`,
    ],
    cara: [
      {
        judul: "Kelola User",
        langkah: [
          `Buka Kelola User.`,
          `Tambah user baru.`,
          `Ubah role, reset password, atau hapus akun karyawan atau admin.`,
        ],
      },
      {
        judul: "Persentase naik harga (markup)",
        langkah: [
          `Cari pengaturan markup.`,
          `Atur persentase untuk harga jual Grosir, Tengah, dan Ecer.`,
        ],
      },
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
  grosir: ["grosir", "pelanggan-toko", "toko-offline", "penjualan-marketplace", "reseller", "scan-resi", "urut-resi"],
  keuangan: ["keuangan"],
  scan_resi: ["scan-resi", "urut-resi"],
};

function visibleSections(role) {
  if (isSuperadminLike(role)) return SECTIONS; // semua bagian, termasuk Pengaturan
  if (role === "owner") return SECTIONS.filter((s) => s.key !== "pengaturan"); // semua kecuali Pengaturan
  const keys = ROLE_SECTIONS[role];
  if (!keys) return SECTIONS; // role tidak dikenali — aman default tampilkan semua
  return SECTIONS.filter((s) => keys.includes(s.key));
}

// Semua teks satu bagian dijadikan satu string kecil, dipakai untuk pencarian.
function teksPencarian(sec) {
  return [
    sec.label,
    sec.ringkasan,
    ...(sec.fungsi || []),
    ...(sec.cara || []).flatMap((g) => [g.judul || "", ...(g.langkah || [])]),
  ]
    .join(" \n ")
    .toLowerCase();
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
  const filtered = s ? sections.filter((sec) => teksPencarian(sec).includes(s)) : sections;

  return (
    <div>
      <PageHeader
        title="Panduan Penggunaan"
        description={
          showAllBadge
            ? "Penjelasan semua menu dengan bahasa gampang. Tiap menu dijelaskan gunanya dulu, lalu cara memakainya."
            : "Penjelasan menu untuk bagian kerjamu dengan bahasa gampang. Gunanya dulu, lalu cara memakainya."
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
                    {/* 1. Fungsi menu */}
                    <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3.5 py-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-amber-400 mb-1.5">
                        Fungsi menu ini
                      </div>
                      <div className="space-y-1.5">
                        {(sec.fungsi || []).map((f, i) => (
                          <p key={i} className="text-sm text-slate-300">
                            {f}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* 2. Cara menggunakan */}
                    <div className="mt-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-sky-400 mb-2">
                        Cara menggunakan
                      </div>
                      <div className="space-y-4">
                        {(sec.cara || []).map((g, gi) => (
                          <div key={gi}>
                            {g.judul && <div className="text-sm font-semibold text-slate-200 mb-1.5">{g.judul}</div>}
                            <ol className="space-y-1.5">
                              {g.langkah.map((l, li) => (
                                <li key={li} className="text-sm text-slate-300 flex gap-2.5">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-semibold flex items-center justify-center mt-0.5">
                                    {li + 1}
                                  </span>
                                  <span>{l}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    </div>
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