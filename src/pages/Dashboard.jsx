import { useState } from "react";
import {
  Camera, MapPin, Tag, Boxes, PackageCheck, ClipboardList,
  ShoppingCart, Wallet, TrendingUp, TrendingDown, Package, Warehouse, Store,
  Landmark, ArrowRight, Clock, UserCheck, CalendarRange, BarChart3, Trash2,
  Activity, Truck, ShoppingBag, DollarSign, LayoutGrid, Search, Megaphone, Banknote,
} from "lucide-react";
import { STAGE_ORDER, STAGE_META, COLOR, PO_STATUS_META } from "../lib/constants";
import {
  fmtRp,
  sisaHutangPesanan,
  ringkasanKeuangan,
  saldoPerRekening,
  arusKasPerPeriode,
  breakdownPengeluaranKategori,
  breakdownPemasukanKategori,
  laporanLabaRugi,
  ringkasanGrosir,
  statusPesananMasuk,
  detailModelPesanan,
  labelFor,
  daftarTokoMarketplace,
} from "../lib/api";
import { rekapHarianAbsensi, rekapMingguanAbsensi, rekapBulananAbsensi, NAMA_HARI } from "../lib/absensi";
import { StatCard, PageHeader, EmptyState, Badge, inputClass, formatTanggalID } from "../components/ui";
import { GrafikArusKas, BreakdownPengeluaran, BreakdownPemasukan, DetailTransaksiKategoriModal, LaporanLabaRugi } from "./Keuangan";
import { isEntriTokoOffline } from "./TokoOffline";
import { PLATFORM_LABEL, PLATFORM_COLOR } from "./Penjualanmarketplace";

// Tab kecil di atas Dashboard — pisahkan ringkasan Gudang vs Penjualan vs
// Keuangan vs Absensi supaya masing-masing tetap fokus (angka gudang tidak
// nyampur sama angka penjualan/keuangan/absensi), tapi tetap satu halaman
// "Dashboard" (pola sama seperti halaman Laporan), bukan menu terpisah di
// sidebar. Menu "dashboard" sendiri HANYA bisa diakses role owner &
// superadmin (lihat ROLE_MENUS di lib/constants.js). Tab "Stok Menipis"
// (ajukan restock) sudah dipindah jadi sub-menu di dalam Gudang → Stok,
// supaya gudang mengajukan restock dari halaman kerjanya sendiri tanpa perlu
// akses dashboard. Tab "Menunggu Persetujuan" (sisi approve dari alur yang
// sama) juga sudah dipindah keluar dari sini — sekarang jadi menu sidebar
// tersendiri, halaman "Persetujuan Restok" (lihat pages/PersetujuanRestock.jsx),
// supaya tidak perlu masuk Dashboard dulu buat menindaklanjuti pengajuan.
//
// Tab "Dashboard Penjualan" (key "penjualan") dulu bernama "Dashboard Grosir"
// dan cuma menghitung pesanan Grosir. Sekarang diperluas jadi ringkasan
// SEMUA channel penjualan: Grosir, Reseller (Toko + Cekout), Marketplace
// (Shopee/TikTok/Lazada — dari marketplace_transaksi tipe "pemasukan"), dan
// Toko Offline (dari keuangan_transaksi yang ditandai isEntriTokoOffline —
// lihat pages/TokoOffline.jsx). Lihat fungsi DashboardPenjualan di bawah.
const TABS = [
  { key: "monitoring", label: "Dashboard Monitoring", icon: Activity },
  { key: "gudang", label: "Dashboard Gudang", icon: Warehouse },
  { key: "penjualan", label: "Dashboard Penjualan", icon: Store },
  { key: "keuangan", label: "Dashboard Keuangan", icon: Wallet },
  { key: "absensi", label: "Dashboard Absensi", icon: Clock },
];

function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}

// Nama bulan panjang berbahasa Indonesia, dipakai untuk label & dropdown
// filter periode Dashboard (mengikuti pola yang sama seperti di Keuangan.jsx).
const BULAN_LABEL_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}
// Tanggal pertama & terakhir dari bulan+tahun tertentu, format "YYYY-MM-DD" —
// dipakai sebagai rentang "dari"/"sampai" untuk semua ringkasan yang mengikuti
// filter Bulan & Tahun di atas Dashboard.
function awalBulanPeriode(tahun, bulan) {
  return `${tahun}-${pad2(bulan)}-01`;
}
function akhirBulanPeriode(tahun, bulan) {
  const lastDay = new Date(tahun, bulan, 0).getDate();
  return `${tahun}-${pad2(bulan)}-${pad2(lastDay)}`;
}

// Dropdown filter "Bulan" & "Tahun" yang tampil di kanan atas Dashboard (semua
// tab) — dipakai untuk menggeser rentang ringkasan bulanan (Keuangan, Grosir,
// Monitoring, Absensi) ke bulan/tahun tertentu, bukan cuma bulan berjalan.
// Rentang tahun: 4 tahun ke belakang s/d 1 tahun ke depan dari tahun berjalan.
function FilterBulanTahun({ bulan, tahun, onChangeBulan, onChangeTahun }) {
  const tahunSekarang = new Date().getFullYear();
  const daftarTahun = Array.from({ length: 6 }, (_, i) => tahunSekarang - 4 + i);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={bulan}
        onChange={(e) => onChangeBulan(Number(e.target.value))}
        className={`${inputClass} w-auto text-xs py-1.5`}
      >
        {BULAN_LABEL_PANJANG.map((l, i) => (
          <option key={l} value={i + 1}>{l}</option>
        ))}
      </select>
      <select
        value={tahun}
        onChange={(e) => onChangeTahun(Number(e.target.value))}
        className={`${inputClass} w-auto text-xs py-1.5`}
      >
        {daftarTahun.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Jumlah baris per halaman untuk tabel "Total Barang — Rincian Pesanan yang
// Sudah Selesai" di Dashboard Gudang, supaya listnya tidak terlalu panjang.
const BARIS_PER_HALAMAN_BARANG_DATANG = 10;

export default function Dashboard({
  stageCounts,
  skuCount,
  totalStok,
  rakCount,
  rakKosong,
  items,
  onNavigate,
  setModal,
  pesananMasuk = [],
  penempatan = [],
  pesananGrosir = [],
  pembayaranGrosir = [],
  depositGrosir = [],
  pelangganGrosir = [],
  keuanganTransaksi = [],
  marketplaceTransaksi = [],
  master = {},
  absensiRows = [],
  karyawanList = [],
  pengajuanRestock = [],
  skuMaster = [],
}) {
  const [tab, setTab] = useState("monitoring");

  // Filter periode global "Bulan & Tahun" — dipakai oleh ringkasan yang
  // sifatnya berbasis periode (Keuangan, Grosir, Monitoring, Absensi). Default
  // ke bulan & tahun berjalan supaya perilaku dashboard tetap sama seperti
  // sebelumnya kalau belum diubah.
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const periodeDari = awalBulanPeriode(tahun, bulan);
  const periodeSampai = akhirBulanPeriode(tahun, bulan);
  const periodeLabel = `${BULAN_LABEL_PANJANG[bulan - 1]} ${tahun}`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          tab === "penjualan"
            ? "Ringkasan penjualan dari semua channel — Grosir, Reseller, Marketplace, dan Toko Offline — plus piutang & deposit pelanggan grosir."
            : tab === "keuangan"
            ? "Ringkasan kas masuk, kas keluar, saldo rekening, dan arus kas terkini."
            : tab === "absensi"
            ? "Ringkasan kehadiran karyawan hari ini, rekap mingguan, dan rekap bulanan."
            : tab === "monitoring"
            ? "Pantau tiap tahap alur barang — dari pesanan ke supplier sampai siap dijual — plus akses cepat ke laporan keuangan & penjualan grosir."
            : "Ringkasan alur barang, stok, dan SKU di SELMA ACC BANDUNG."
        }
        action={
          <FilterBulanTahun
            bulan={bulan}
            tahun={tahun}
            onChangeBulan={setBulan}
            onChangeTahun={setTahun}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-1.5 mb-5 bg-slate-900 border border-slate-800 rounded-lg p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition whitespace-nowrap ${
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "gudang" ? (
        <DashboardGudang
          onNavigate={onNavigate}
          setModal={setModal}
          pengajuanRestock={pengajuanRestock}
          items={items}
          pesananMasuk={pesananMasuk}
          skuMaster={skuMaster}
          master={master}
          periodeDari={periodeDari}
          periodeSampai={periodeSampai}
          periodeLabel={periodeLabel}
        />
      ) : tab === "monitoring" ? (
        <DashboardMonitoring
          items={items}
          pesananMasuk={pesananMasuk}
          penempatan={penempatan}
          keuanganTransaksi={keuanganTransaksi}
          pesananGrosir={pesananGrosir}
          onNavigate={onNavigate}
          setModal={setModal}
          periodeDari={periodeDari}
          periodeSampai={periodeSampai}
          periodeLabel={periodeLabel}
        />
      ) : tab === "penjualan" ? (
        <DashboardPenjualan
          pesananGrosir={pesananGrosir}
          pembayaranGrosir={pembayaranGrosir}
          depositGrosir={depositGrosir}
          pelangganGrosir={pelangganGrosir}
          keuanganTransaksi={keuanganTransaksi}
          marketplaceTransaksi={marketplaceTransaksi}
          master={master}
          onNavigate={onNavigate}
          tahun={tahun}
          periodeDari={periodeDari}
          periodeSampai={periodeSampai}
          periodeLabel={periodeLabel}
        />
      ) : tab === "keuangan" ? (
        <DashboardKeuangan
          keuanganTransaksi={keuanganTransaksi}
          marketplaceTransaksi={marketplaceTransaksi}
          master={master}
          onNavigate={onNavigate}
          periodeDari={periodeDari}
          periodeSampai={periodeSampai}
          periodeLabel={periodeLabel}
        />
      ) : (
        <DashboardAbsensi
          absensiRows={absensiRows}
          karyawanList={karyawanList}
          onNavigate={onNavigate}
          bulan={bulan}
          tahun={tahun}
          periodeLabel={periodeLabel}
        />
      )}
    </div>
  );
}

function DashboardKeuangan({ keuanganTransaksi, marketplaceTransaksi = [], master, onNavigate, periodeDari, periodeSampai, periodeLabel }) {
  const [detailKategori, setDetailKategori] = useState(null);
  const dari = periodeDari || awalBulanIni();
  const sampai = periodeSampai || hariIniIso();
  const ringkasanBulanIni = ringkasanKeuangan(keuanganTransaksi, dari, sampai);
  const saldoRekening = saldoPerRekening(keuanganTransaksi, master.rekening || []);
  const totalSaldoKas = saldoRekening.reduce((a, r) => a + r.saldo, 0);

  // Info tambahan (bukan transaksi Keuangan sungguhan) — total iklan
  // marketplace pada periode yang sama, sudah otomatis dipotong dari saldo
  // marketplace sebelum dicairkan, jadi TIDAK ikut dihitung ke labaRugiBulanIni.
  const iklanPeriode = (marketplaceTransaksi || [])
    .filter((t) => t.tipe === "iklan" && t.tanggal >= dari && t.tanggal <= sampai)
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  // Arus kas mengikuti bulan & tahun yang dipilih di filter atas Dashboard
  // (bukan lagi selalu 60 hari terakhir), supaya grafiknya konsisten dengan
  // kartu ringkasan "Kas Masuk/Keluar (bulan terpilih)" di bawahnya.
  const transaksiPeriode = keuanganTransaksi.filter((t) => t.tanggal >= dari && t.tanggal <= sampai);
  const { mode, data: dataArusKas } = arusKasPerPeriode(transaksiPeriode);

  const breakdown = breakdownPengeluaranKategori(ringkasanBulanIni.list, master.kategori_keluar || []);
  const breakdownMasuk = breakdownPemasukanKategori(ringkasanBulanIni.list, master.kategori_masuk || []);

  const labaRugiBulanIni = laporanLabaRugi(keuanganTransaksi, master.kategori_masuk || [], master.kategori_keluar || [], dari, sampai);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Saldo Kas Saat Ini" value={fmtRp(totalSaldoKas)} icon={Landmark} accent="text-amber-400" iconColor="text-amber-500" />
        <StatCard label={`Kas Masuk (${periodeLabel})`} value={fmtRp(ringkasanBulanIni.masuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label={`Kas Keluar (${periodeLabel})`} value={fmtRp(ringkasanBulanIni.keluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard
          label={`Laba (Rugi) ${periodeLabel}`}
          value={fmtRp(ringkasanBulanIni.saldo)}
          accent={ringkasanBulanIni.saldo >= 0 ? "text-emerald-400" : "text-red-400"}
          icon={Wallet}
          iconColor={ringkasanBulanIni.saldo >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

      <GrafikArusKas mode={mode} data={dataArusKas} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPemasukan
          total={breakdownMasuk.total}
          data={breakdownMasuk.data}
          onKategoriClick={(d) => setDetailKategori({ tipe: "masuk", kode: d.kode, label: d.label })}
        />
        <BreakdownPengeluaran
          total={breakdown.total}
          data={breakdown.data}
          onKategoriClick={(d) => setDetailKategori({ tipe: "keluar", kode: d.kode, label: d.label })}
        />
      </div>

      {detailKategori && (
        <DetailTransaksiKategoriModal
          kategori={detailKategori}
          tipe={detailKategori.tipe}
          list={ringkasanBulanIni.list}
          rekeningList={master.rekening || []}
          subtitle={periodeLabel}
          onClose={() => setDetailKategori(null)}
        />
      )}

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Saldo per Rekening</div>
        {saldoRekening.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada rekening terdaftar." /></div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {saldoRekening.map((r) => (
                <tr key={r.kode} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 text-slate-300">{r.label}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.saldo < 0 ? "text-red-400" : ""}`}>
                    {fmtRp(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LaporanLabaRugi
        pendapatan={labaRugiBulanIni.pendapatan}
        beban={labaRugiBulanIni.beban}
        labaRugi={labaRugiBulanIni.labaRugi}
        marginPersen={labaRugiBulanIni.marginPersen}
        subtitle={periodeLabel}
        iklanInfo={iklanPeriode}
        action={
          <button
            onClick={() => onNavigate && onNavigate("keuangan", "laporan")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Lihat Laporan Lengkap <ArrowRight size={12} />
          </button>
        }
      />
    </div>
  );
}

function DashboardGudang({
  onNavigate,
  setModal,
  pengajuanRestock = [],
  items = [],
  pesananMasuk = [],
  skuMaster = [],
  master = {},
  periodeDari,
  periodeSampai,
  periodeLabel,
}) {
  const [tabAlur, setTabAlur] = useState(null); // null = panel tertutup
  const [panelTerbuka, setPanelTerbuka] = useState(null); // null | "restok" | "model-baru" | "menunggu" — cuma satu yang boleh terbuka sekaligus
  const showRestokDisetujui = panelTerbuka === "restok";
  const showModelBaru = panelTerbuka === "model-baru";
  const showMenunggu = panelTerbuka === "menunggu";
  const [subTabDatang, setSubTabDatang] = useState(null); // null | "restok" | "model-baru" — null = semua panel tertutup by default, cuma satu yang boleh terbuka sekaligus
  const [showTotalBarangDatang, setShowTotalBarangDatang] = useState(false);
  const [halamanBarangDatang, setHalamanBarangDatang] = useState(1);
  const [halamanModelLama, setHalamanModelLama] = useState(1);
  const [halamanModelBaru, setHalamanModelBaru] = useState(1);
  const [filterSupplier, setFilterSupplier] = useState(""); // "" = semua supplier
  const [stageTerbuka, setStageTerbuka] = useState(null); // null | salah satu key STAGE_ORDER — tahap yang listnya sedang ditampilkan di tab "Tahapan Barang"
  const [showDataBarang, setShowDataBarang] = useState(false); // panel "Data Barang" (sumber: skuMaster, sama seperti Master Barang di menu SKU & Harga)
  const [qDataBarang, setQDataBarang] = useState("");
  const [kategoriDataBarang, setKategoriDataBarang] = useState("");

  // Terapkan filter Bulan & Tahun (dari header Dashboard) ke data yang
  // sifatnya berbasis tanggal kejadian — pesanan/kedatangan barang
  // (pesananMasuk, per tanggal PO) & pengajuan restock (per tanggal
  // diajukan). Kalau periodeDari/periodeSampai belum diisi (mis. dipanggil
  // dari tempat lain tanpa filter), semua data tetap ditampilkan seperti
  // sebelumnya.
  const dalamPeriode = (tanggal) => {
    if (!periodeDari || !periodeSampai || !tanggal) return true;
    const t = String(tanggal).slice(0, 10);
    return t >= periodeDari && t <= periodeSampai;
  };

  const pesananMasukPeriode = (pesananMasuk || []).filter((p) => dalamPeriode(p.tanggal_pesan));
  const pengajuanRestockPeriode = (pengajuanRestock || []).filter((p) => dalamPeriode(p.created_at));

  const semuaPengajuan = pengajuanRestockPeriode;

  // Nama toko/supplier untuk sebuah SKU ditelusuri dari barang masuk
  // TERBARU dengan SKU tsb (items.kode_bon -> pesanan_masuk.kode_bon ->
  // pesanan_masuk.supplier) — pola yang sama dipakai di modal "Tinjau
  // Pengajuan Restock" (lihat ModalRouter.jsx).
  const cariSupplier = (sku) => {
    const itemTerbaru = items
      .filter((i) => i.sku === sku && i.kode_bon)
      .sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0))[0];
    if (!itemTerbaru) return null;
    const pesanan = pesananMasuk.find((pm) => pm.kode_bon === itemTerbaru.kode_bon);
    return pesanan?.supplier || null;
  };

  // Daftar barang restok (jenis SKU, bukan zona) yang statusnya sudah
  // disetujui — ditampilkan saat kartu "Total Restok (SKU)" diklik, supaya
  // owner/superadmin bisa langsung lihat SKU mana saja yang disetujui tanpa
  // pindah halaman, dan buka detail SKU-nya langsung dari sini. Tiap baris
  // dilengkapi nama supplier supaya bisa difilter per toko/supplier.
  const restokDisetujuiSemua = semuaPengajuan
    .filter((p) => p.jenis !== "zona" && p.status === "disetujui")
    .map((p) => ({ ...p, _supplier: cariSupplier(p.sku) }))
    .sort((a, b) => new Date(b.direspon_pada || b.created_at) - new Date(a.direspon_pada || a.created_at));

  const daftarSupplier = [...new Set(restokDisetujuiSemua.map((p) => p._supplier).filter(Boolean))].sort();

  const restokDisetujui = filterSupplier
    ? restokDisetujuiSemua.filter((p) => p._supplier === filterSupplier)
    : restokDisetujuiSemua;

  // Kartu ringkasan di atas tab "Barang Diajukan" — "Total Restok (SKU)"
  // dihitung dari restokDisetujuiSemua (bukan hasil filter supplier) supaya
  // angkanya tetap mewakili total keseluruhan, sama dengan jumlah baris
  // yang tampil saat kartu ini diklik sebelum difilter (cuma yang sudah
  // disetujui, bukan gabungan menunggu + ditolak). Model baru dihitung dari
  // total rak kosong yang diajukan lewat pengajuan zona (semua status,
  // jumlah_rak_kosong dijumlah — satu pengajuan zona bisa berisi beberapa
  // rak kosong).
  const totalRestokSku = restokDisetujuiSemua.length;
  const pengajuanZonaSemua = semuaPengajuan
    .filter((p) => p.jenis === "zona")
    .sort((a, b) => new Date(b.direspon_pada || b.created_at) - new Date(a.direspon_pada || a.created_at));
  const totalModelBaru = pengajuanZonaSemua.reduce((sum, p) => sum + (Number(p.jumlah_rak_kosong) || 0), 0);
  const totalMenunggu = semuaPengajuan.filter((p) => p.status === "menunggu").length;
  const pengajuanMenungguSemua = semuaPengajuan
    .filter((p) => p.status === "menunggu")
    .map((p) => (p.jenis === "zona" ? p : { ...p, _supplier: cariSupplier(p.sku) }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const STATUS_MODEL_BARU_META = {
    disetujui: { label: "Disetujui", color: "emerald" },
    ditolak: { label: "Ditolak", color: "red" },
  };

  // Buka modal detail pengajuan restock (read-only karena statusnya sudah
  // disetujui) — komponen yang sama dipakai untuk "Tinjau" di halaman
  // Persetujuan Restok, cuma tanpa tombol Setujui/Tolak.
  const bukaDetailPengajuan = (p) => {
    setModal && setModal({ type: "respon-pengajuan-restock", item: p });
  };

  const sedangDipesan = pesananMasukPeriode
    .filter((p) => {
      const st = statusPesananMasuk(p);
      return st === "menunggu" || st === "sebagian";
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Pesanan yang sudah selesai (semua model sudah datang penuh) — dipakai
  // untuk kartu "Total Barang" di tab "Barang yang Sudah Datang".
  const barangSelesai = pesananMasukPeriode
    .filter((p) => statusPesananMasuk(p) === "selesai")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Rincian per-model (bukan per-PO) dari semua pesanan yang sudah selesai —
  // dipakai saat kartu "Total Barang" diklik, supaya langsung kelihatan
  // supplier, nama model, dan qty tiap barang tanpa perlu buka satu-satu PO.
  const rincianBarangDipesan = barangSelesai.flatMap((p) => {
    const detail = detailModelPesanan(p);
    return detail.map((m, i) => ({
      key: `${p.id}-${i}`,
      supplier: p.supplier || "—",
      nama: m.nama || "—",
      jumlah: Number(m.jumlah) || 0,
      harga: Number(m.harga) || 0,
      datang: m.datang,
      tanggal: p.tanggal_pesan,
    }));
  });

  // Total MODEL (jumlah baris/model, bukan qty) dari pesanan yang sudah
  // selesai — ditampilkan sebagai kartu "Total Barang".
  const totalBarangDipesan = rincianBarangDipesan.length;

  // "Model Lama" = model yang, PAS DATANG/DIKONFIRMASI DITERIMA, ternyata
  // supplier-nya sudah pernah dipakai bikin SKU kita sebelumnya (restock ke
  // SKU lama) — bukan dari tabel items, tapi langsung dari data pesanan
  // (detail_model per pesanan), disinkronkan ke sku_master.barcode_supplier
  // (trim + lowercase), sama seperti pola auto-hubung SKU lama di
  // SkuEntryForm (components/forms.jsx). Satu baris hasil = SATU SKU,
  // gabungan qty dari semua kali model itu datang (bukan satu baris per
  // kedatangan).
  //
  // Pesanan yang PERTAMA KALI membawa suatu kode model (yang jadi alasan SKU
  // itu dibuat) DIKECUALIKAN dari hitungan restock — soalnya kode modelnya
  // otomatis "cocok" dengan barcode_supplier SKU yang baru dibuat dari
  // pesanan itu sendiri, padahal itu bukan restock. Origin (pesanan
  // pertama) ditentukan dari tabel items, diurutkan kronologis per kode
  // model (created_at, lalu tanggal, lalu id sebagai tie-break terakhir).
  const kodeModelKeOriginKodeBon = {};
  [...(items || [])]
    .filter((i) => i.barcode_supplier && i.kode_bon)
    .sort((a, b) => {
      const byCreated = new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (byCreated !== 0) return byCreated;
      const byTanggal = new Date(a.tanggal || 0) - new Date(b.tanggal || 0);
      if (byTanggal !== 0) return byTanggal;
      return String(a.id).localeCompare(String(b.id));
    })
    .forEach((i) => {
      const kode = (i.barcode_supplier || "").trim().toLowerCase();
      if (kode && !(kode in kodeModelKeOriginKodeBon)) {
        kodeModelKeOriginKodeBon[kode] = i.kode_bon;
      }
    });

  const skuMasterByKode = new Map();
  (skuMaster || []).forEach((s) => {
    const kode = (s.barcode_supplier || "").trim().toLowerCase();
    if (kode && !skuMasterByKode.has(kode)) skuMasterByKode.set(kode, s);
  });

  const modelLamaMap = new Map(); // sku id -> baris gabungan
  pesananMasukPeriode.forEach((p) => {
    if (p.dibatalkan) return;
    detailModelPesanan(p)
      .filter((m) => m.datang && m.nama)
      .forEach((m) => {
        const kode = m.nama.trim().toLowerCase();
        if (!kode) return;
        const skuRow = skuMasterByKode.get(kode);
        if (!skuRow) return; // belum ada SKU yang cocok -> bukan "Model Lama"
        if (kodeModelKeOriginKodeBon[kode] === p.kode_bon) return; // origin, bukan restock

        const jumlah = Number(m.jumlah) || 0;
        const existing = modelLamaMap.get(skuRow.id);
        if (existing) {
          existing.jumlah += jumlah;
          existing.kaliDatang += 1;
          if (p.supplier) existing.supplierSet.add(p.supplier);
          if (new Date(p.tanggal_pesan || 0) > new Date(existing.tanggalTerakhir || 0)) {
            existing.tanggalTerakhir = p.tanggal_pesan;
          }
        } else {
          modelLamaMap.set(skuRow.id, {
            key: skuRow.id,
            sku: skuRow.sku,
            nama: m.nama,
            jumlah,
            kaliDatang: 1,
            supplierSet: new Set(p.supplier ? [p.supplier] : []),
            tanggalTerakhir: p.tanggal_pesan,
          });
        }
      });
  });

  const rincianModelLama = Array.from(modelLamaMap.values())
    .map((r) => ({
      ...r,
      supplier: r.supplierSet.size > 0 ? Array.from(r.supplierSet).join(", ") : "—",
    }))
    .sort((a, b) => new Date(b.tanggalTerakhir || 0) - new Date(a.tanggalTerakhir || 0));

  const totalModelLama = rincianModelLama.length;

  // "Model Baru" = KEBALIKAN dari "Model Lama" — model yang datang tapi
  // BUKAN restock ke SKU yang sudah ada. Ini mencakup dua kasus: (1) model
  // yang kodenya belum cocok ke sku_master manapun sama sekali (belum
  // pernah dibuatkan SKU), dan (2) pesanan origin/pencipta SKU itu sendiri
  // (kedatangan pertama yang bikin SKU-nya dibuat, dikecualikan dari "Model
  // Lama" — lihat kodeModelKeOriginKodeBon di atas). Digabung per KODE MODEL
  // (bukan per SKU, karena kasus (1) belum tentu punya SKU), satu baris =
  // satu kode model, qty dijumlah dari semua kali datang.
  const modelBaruDatangMap = new Map(); // kode model (barcode_supplier dinormalisasi) -> baris gabungan
  pesananMasukPeriode.forEach((p) => {
    if (p.dibatalkan) return;
    detailModelPesanan(p)
      .filter((m) => m.datang && m.nama)
      .forEach((m) => {
        const kode = m.nama.trim().toLowerCase();
        if (!kode) return;
        const skuRow = skuMasterByKode.get(kode);
        const sudahRestock = skuRow && kodeModelKeOriginKodeBon[kode] !== p.kode_bon;
        if (sudahRestock) return; // sudah dihitung sebagai "Model Lama"

        const jumlah = Number(m.jumlah) || 0;
        const existing = modelBaruDatangMap.get(kode);
        if (existing) {
          existing.jumlah += jumlah;
          existing.kaliDatang += 1;
          if (p.supplier) existing.supplierSet.add(p.supplier);
          if (new Date(p.tanggal_pesan || 0) > new Date(existing.tanggalTerakhir || 0)) {
            existing.tanggalTerakhir = p.tanggal_pesan;
          }
          if (!existing.sku && skuRow) existing.sku = skuRow.sku;
        } else {
          modelBaruDatangMap.set(kode, {
            key: kode,
            sku: skuRow ? skuRow.sku : null,
            nama: m.nama,
            jumlah,
            kaliDatang: 1,
            supplierSet: new Set(p.supplier ? [p.supplier] : []),
            tanggalTerakhir: p.tanggal_pesan,
          });
        }
      });
  });

  const rincianModelBaruDatang = Array.from(modelBaruDatangMap.values())
    .map((r) => ({
      ...r,
      supplier: r.supplierSet.size > 0 ? Array.from(r.supplierSet).join(", ") : "—",
    }))
    .sort((a, b) => new Date(b.tanggalTerakhir || 0) - new Date(a.tanggalTerakhir || 0));

  const totalModelBaruDatang = rincianModelBaruDatang.length;

  const byStage = (stage) => items.filter((i) => i.stage === stage);
  const TAHAP_ALUR = STAGE_ORDER; // semua tahap — rincian dari halaman "Alur Barang" di sidebar (DataBarang.jsx)

  const ALUR_TABS = [
    { key: "diajukan", label: "Barang yang di Pesan", icon: ClipboardList },
    { key: "datang", label: "Barang yang Sudah Datang", icon: Truck },
    { key: "alur", label: "Tahapan Barang", icon: Boxes },
  ];

  // Panel "Data Barang" — sumber datanya SAMA PERSIS dengan Master Barang di
  // menu SKU & Harga (tabel sku_master via prop skuMaster), bukan data
  // terpisah. Ringkasan & pencarian di sini cuma jendela cepat dari
  // Dashboard; daftar lengkap dengan semua filter/fitur (download CSV/foto,
  // katalog PDF, dll) tetap di halaman SKU & Harga (lihat tombol "Buka
  // Halaman Lengkap" di bawah).
  const kategoriLabelDataBarang = (kode) => labelFor(master || {}, "kategori", kode);
  const skuAktif = skuMaster.filter((s) => !s.nonaktif);
  const totalStokSemua = skuAktif.reduce((sum, s) => sum + (Number(s.stok) || 0), 0);
  const jumlahPerubahanHargaSemua = skuAktif.filter(
    (s) => s.harga_asli_baru != null && s.harga_asli_baru !== s.harga_asli
  ).length;
  const kategoriOptionsDataBarang = Array.from(
    new Set(skuAktif.map((s) => s.kategori).filter(Boolean))
  ).sort();

  const MAX_TAMPIL_DATA_BARANG = 12;
  const filteredDataBarangSemua = skuAktif.filter((s) => {
    const ql = qDataBarang.trim().toLowerCase();
    const cocokQ =
      !ql ||
      (s.sku || "").toLowerCase().includes(ql) ||
      (s.barcode_supplier || "").toLowerCase().includes(ql);
    if (!cocokQ) return false;
    if (kategoriDataBarang && s.kategori !== kategoriDataBarang) return false;
    return true;
  });
  const filteredDataBarang = filteredDataBarangSemua.slice(0, MAX_TAMPIL_DATA_BARANG);
  const lebihDataBarang = filteredDataBarangSemua.length - filteredDataBarang.length;

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <button
          type="button"
          onClick={() => {
            setTabAlur((v) => (v ? null : "diajukan"));
            setShowDataBarang(false);
          }}
          className={`rounded-xl border p-6 text-left transition min-h-[180px] flex flex-col ${
            tabAlur ? "border-amber-500/50 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <Truck size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Alur Barang</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDataBarang((v) => !v);
            setTabAlur(null);
          }}
          className={`rounded-xl border p-6 text-left transition min-h-[180px] flex flex-col ${
            showDataBarang ? "border-amber-500/50 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <Boxes size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Data Barang</div>
        </button>
      </div>

      {showDataBarang && (
        <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Data Barang</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Sumber data sama dengan Master Barang di menu SKU & Harga.
              </div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate("sku-harga")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Buka Halaman Lengkap <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-800">
            <StatCard label="Total SKU Aktif" value={skuAktif.length} icon={Boxes} accent="text-amber-400" iconColor="text-amber-500" />
            <StatCard label="Total Stok" value={totalStokSemua} icon={Package} accent="text-sky-400" iconColor="text-sky-500" />
            <StatCard label="Ada Perubahan Harga" value={jumlahPerubahanHargaSemua} icon={DollarSign} accent="text-red-400" iconColor="text-red-500" />
            <StatCard label="Kategori" value={kategoriOptionsDataBarang.length} icon={Tag} accent="text-teal-400" iconColor="text-teal-500" />
          </div>

          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-800">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
              <Search size={14} className="text-slate-500" />
              <input
                value={qDataBarang}
                onChange={(e) => setQDataBarang(e.target.value)}
                placeholder="Cari SKU atau barcode supplier…"
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
              />
            </div>
            <select
              value={kategoriDataBarang}
              onChange={(e) => setKategoriDataBarang(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
            >
              <option value="">Semua Kategori</option>
              {kategoriOptionsDataBarang.map((k) => (
                <option key={k} value={k}>{kategoriLabelDataBarang(k)}</option>
              ))}
            </select>
          </div>

          {filteredDataBarang.length === 0 ? (
            <EmptyState label="Tidak ada barang yang cocok." />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {filteredDataBarang.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setModal && setModal({ type: "detail-sku", item: s })}
                    className="text-left rounded-xl border border-slate-800 hover:border-amber-500/40 bg-slate-900/50 p-3 transition"
                  >
                    <div className="font-mono text-xs font-semibold text-slate-100 truncate">{s.sku}</div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{kategoriLabelDataBarang(s.kategori) || "—"}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-slate-400">Stok {s.stok || 0}</span>
                      <span className="text-[11px] font-medium text-slate-300">{fmtRp(s.harga_asli)}</span>
                    </div>
                  </button>
                ))}
              </div>
              {lebihDataBarang > 0 && (
                <div className="px-4 pb-4 text-[11px] text-slate-500">
                  +{lebihDataBarang} barang lainnya — buka halaman lengkap untuk lihat semua.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tabAlur && (
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
            {ALUR_TABS.map((t) => {
              const Icon = t.icon;
              const active = tabAlur === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTabAlur(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition whitespace-nowrap ${
                    active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {tabAlur === "diajukan" ? (
            <div>
              {periodeLabel && (
                <div className="text-[11px] text-slate-500 mb-2">Periode: {periodeLabel}</div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Total Restok (SKU)"
                  value={totalRestokSku}
                  accent="text-amber-400"
                  icon={Boxes}
                  iconColor="text-amber-500"
                  onClick={() => setPanelTerbuka((v) => (v === "restok" ? null : "restok"))}
                />
                <StatCard
                  label="Total Model Baru (Rak Kosong)"
                  value={totalModelBaru}
                  accent="text-amber-400"
                  icon={LayoutGrid}
                  iconColor="text-amber-500"
                  onClick={() => setPanelTerbuka((v) => (v === "model-baru" ? null : "model-baru"))}
                />
                <StatCard
                  label="Menunggu Persetujuan Owner"
                  value={totalMenunggu}
                  accent="text-amber-400"
                  icon={PackageCheck}
                  iconColor="text-amber-500"
                  onClick={() => setPanelTerbuka((v) => (v === "menunggu" ? null : "menunggu"))}
                />
              </div>

              {showRestokDisetujui && (
                <div className="mt-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-semibold">Restok (SKU) — Disetujui</div>
                    <div className="flex items-center gap-2">
                      {daftarSupplier.length > 0 && (
                        <select
                          value={filterSupplier}
                          onChange={(e) => setFilterSupplier(e.target.value)}
                          className="text-[11px] bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-slate-300"
                        >
                          <option value="">Semua Supplier</option>
                          {daftarSupplier.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => onNavigate && onNavigate("persetujuan-restock", "sku")}
                        className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                      >
                        Buka Halaman Lengkap <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                  {restokDisetujui.length === 0 ? (
                    <EmptyState
                      label={
                        filterSupplier
                          ? `Tidak ada pengajuan restock SKU disetujui dari supplier "${filterSupplier}".`
                          : "Belum ada pengajuan restock SKU yang disetujui."
                      }
                    />
                  ) : (
                    <div className="divide-y divide-slate-800/70">
                      {restokDisetujui.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => bukaDetailPengajuan(p)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-900/70 transition flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <Boxes size={14} className="text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-semibold text-slate-100 truncate">{p.sku}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {p.dibuat_oleh_nama || "—"} · stok saat itu {p.stok_saat_ajuan}
                                {p._supplier ? ` · ${p._supplier}` : ""}
                                {p.direspon_pada ? ` · disetujui ${p.direspon_pada.slice(0, 10)}` : ""}
                              </div>
                            </div>
                          </div>
                          <Badge color="emerald">Disetujui</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showModelBaru && (
                <div className="mt-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-semibold">Model Baru (Rak Kosong) — per Zona</div>
                    <button
                      onClick={() => onNavigate && onNavigate("persetujuan-restock", "zona")}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      Buka Halaman Lengkap <ArrowRight size={12} />
                    </button>
                  </div>
                  {pengajuanZonaSemua.length === 0 ? (
                    <EmptyState label="Belum ada pengajuan model baru (zona) yang diajukan." />
                  ) : (
                    <div className="divide-y divide-slate-800/70">
                      {pengajuanZonaSemua.map((p) => {
                        const meta = STATUS_MODEL_BARU_META[p.status];
                        return (
                          <button
                            key={p.id}
                            onClick={() => bukaDetailPengajuan(p)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-900/70 transition flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                <LayoutGrid size={14} className="text-amber-500" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-100 truncate">Zona: {p.zona}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {p.jumlah_rak_kosong} rak kosong · {p.dibuat_oleh_nama || "—"}
                                  {p.direspon_pada ? ` · direspon ${p.direspon_pada.slice(0, 10)}` : ""}
                                </div>
                              </div>
                            </div>
                            <Badge color={meta?.color || "amber"}>{meta?.label || "Menunggu"}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {showMenunggu && (
                <div className="mt-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-semibold">Menunggu Persetujuan Owner</div>
                    <button
                      onClick={() => onNavigate && onNavigate("persetujuan-restock")}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      Buka Halaman Lengkap <ArrowRight size={12} />
                    </button>
                  </div>
                  {pengajuanMenungguSemua.length === 0 ? (
                    <EmptyState label="Tidak ada pengajuan yang sedang menunggu persetujuan owner." />
                  ) : (
                    <div className="divide-y divide-slate-800/70">
                      {pengajuanMenungguSemua.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => bukaDetailPengajuan(p)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-900/70 transition flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                              {p.jenis === "zona" ? (
                                <LayoutGrid size={14} className="text-amber-500" />
                              ) : (
                                <Boxes size={14} className="text-amber-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              {p.jenis === "zona" ? (
                                <>
                                  <div className="text-xs font-semibold text-slate-100 truncate">Zona: {p.zona}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {p.jumlah_rak_kosong} rak kosong · {p.dibuat_oleh_nama || "—"}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-mono text-xs font-semibold text-slate-100 truncate">{p.sku}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {p.dibuat_oleh_nama || "—"} · stok saat itu {p.stok_saat_ajuan}
                                    {p._supplier ? ` · ${p._supplier}` : ""}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge color="amber">Menunggu</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : tabAlur === "datang" ? (
            <div>
              {periodeLabel && (
                <div className="text-[11px] text-slate-500 mb-2">Periode: {periodeLabel}</div>
              )}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard
                  label="Total Barang"
                  value={totalBarangDipesan}
                  accent="text-amber-400"
                  icon={Boxes}
                  iconColor="text-amber-500"
                  onClick={() => {
                    setShowTotalBarangDatang((v) => !v);
                    setSubTabDatang(null);
                    setHalamanBarangDatang(1);
                  }}
                />
                <StatCard
                  label="Total Model Lama"
                  value={totalModelLama}
                  accent="text-amber-400"
                  icon={Truck}
                  iconColor="text-amber-500"
                  onClick={() => {
                    setSubTabDatang((v) => (v === "restok" ? null : "restok"));
                    setShowTotalBarangDatang(false);
                    setHalamanModelLama(1);
                  }}
                />
                <StatCard
                  label="Total Model Baru"
                  value={totalModelBaruDatang}
                  accent="text-amber-400"
                  icon={LayoutGrid}
                  iconColor="text-amber-500"
                  onClick={() => {
                    setSubTabDatang((v) => (v === "model-baru" ? null : "model-baru"));
                    setShowTotalBarangDatang(false);
                    setHalamanModelBaru(1);
                  }}
                />
              </div>

              {showTotalBarangDatang && (
                <div className="mb-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">
                    Total Barang — Rincian Pesanan yang Sudah Selesai
                  </div>
                  {rincianBarangDipesan.length === 0 ? (
                    <EmptyState label="Belum ada pesanan yang sudah selesai." />
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-900/70 text-slate-400 text-xs">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium">Supplier</th>
                            <th className="text-left px-4 py-2.5 font-medium">Model</th>
                            <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                            <th className="text-right px-4 py-2.5 font-medium">Harga</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rincianBarangDipesan
                            .slice(
                              (halamanBarangDatang - 1) * BARIS_PER_HALAMAN_BARANG_DATANG,
                              halamanBarangDatang * BARIS_PER_HALAMAN_BARANG_DATANG
                            )
                            .map((r) => (
                              <tr key={r.key} className="border-t border-slate-800/70">
                                <td className="px-4 py-2.5 text-slate-300">{r.supplier}</td>
                                <td className="px-4 py-2.5 text-slate-300">{r.nama}</td>
                                <td className="px-4 py-2.5 text-right font-semibold">{r.jumlah}</td>
                                <td className="px-4 py-2.5 text-right text-slate-300">{fmtRp(r.harga)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {rincianBarangDipesan.length > BARIS_PER_HALAMAN_BARANG_DATANG && (
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-800/70 text-xs text-slate-400">
                          <span>
                            Halaman {halamanBarangDatang} dari{" "}
                            {Math.ceil(rincianBarangDipesan.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setHalamanBarangDatang((h) => Math.max(1, h - 1))}
                              disabled={halamanBarangDatang <= 1}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setHalamanBarangDatang((h) =>
                                  Math.min(Math.ceil(rincianBarangDipesan.length / BARIS_PER_HALAMAN_BARANG_DATANG), h + 1)
                                )
                              }
                              disabled={halamanBarangDatang >= Math.ceil(rincianBarangDipesan.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Berikutnya
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {subTabDatang === "restok" && (
                <div className="mb-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">
                    Total Model Lama — Model yang Supplier-nya Sudah Punya SKU Kita
                  </div>
                  {rincianModelLama.length === 0 ? (
                    <EmptyState label="Belum ada model lama yang datang." />
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-900/70 text-slate-400 text-xs">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium">SKU</th>
                            <th className="text-left px-4 py-2.5 font-medium">Model</th>
                            <th className="text-left px-4 py-2.5 font-medium">Supplier</th>
                            <th className="text-right px-4 py-2.5 font-medium">Total Qty</th>
                            <th className="text-right px-4 py-2.5 font-medium">Kali Datang</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rincianModelLama
                            .slice(
                              (halamanModelLama - 1) * BARIS_PER_HALAMAN_BARANG_DATANG,
                              halamanModelLama * BARIS_PER_HALAMAN_BARANG_DATANG
                            )
                            .map((r) => (
                              <tr key={r.key} className="border-t border-slate-800/70">
                                <td className="px-4 py-2.5 font-mono text-slate-100">{r.sku}</td>
                                <td className="px-4 py-2.5 text-slate-300">{r.nama}</td>
                                <td className="px-4 py-2.5 text-slate-300">{r.supplier}</td>
                                <td className="px-4 py-2.5 text-right font-semibold">{r.jumlah}</td>
                                <td className="px-4 py-2.5 text-right text-slate-400">{r.kaliDatang}x</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {rincianModelLama.length > BARIS_PER_HALAMAN_BARANG_DATANG && (
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-800/70 text-xs text-slate-400">
                          <span>
                            Halaman {halamanModelLama} dari{" "}
                            {Math.ceil(rincianModelLama.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setHalamanModelLama((h) => Math.max(1, h - 1))}
                              disabled={halamanModelLama <= 1}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setHalamanModelLama((h) =>
                                  Math.min(Math.ceil(rincianModelLama.length / BARIS_PER_HALAMAN_BARANG_DATANG), h + 1)
                                )
                              }
                              disabled={halamanModelLama >= Math.ceil(rincianModelLama.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Berikutnya
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {subTabDatang === "model-baru" && (
                <div className="mb-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">
                    Total Model Baru — Model yang Belum Punya SKU Kita
                  </div>
                  {rincianModelBaruDatang.length === 0 ? (
                    <EmptyState label="Belum ada model baru yang datang." />
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-900/70 text-slate-400 text-xs">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium">Model</th>
                            <th className="text-left px-4 py-2.5 font-medium">Supplier</th>
                            <th className="text-right px-4 py-2.5 font-medium">Total Qty</th>
                            <th className="text-right px-4 py-2.5 font-medium">Kali Datang</th>
                            <th className="text-left px-4 py-2.5 font-medium">Status SKU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rincianModelBaruDatang
                            .slice(
                              (halamanModelBaru - 1) * BARIS_PER_HALAMAN_BARANG_DATANG,
                              halamanModelBaru * BARIS_PER_HALAMAN_BARANG_DATANG
                            )
                            .map((r) => (
                              <tr key={r.key} className="border-t border-slate-800/70">
                                <td className="px-4 py-2.5 text-slate-300">{r.nama}</td>
                                <td className="px-4 py-2.5 text-slate-300">{r.supplier}</td>
                                <td className="px-4 py-2.5 text-right font-semibold">{r.jumlah}</td>
                                <td className="px-4 py-2.5 text-right text-slate-400">{r.kaliDatang}x</td>
                                <td className="px-4 py-2.5">
                                  {r.sku ? (
                                    <Badge color="emerald">SKU dibuat: {r.sku}</Badge>
                                  ) : (
                                    <Badge color="amber">Belum dibuat SKU</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {rincianModelBaruDatang.length > BARIS_PER_HALAMAN_BARANG_DATANG && (
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-800/70 text-xs text-slate-400">
                          <span>
                            Halaman {halamanModelBaru} dari{" "}
                            {Math.ceil(rincianModelBaruDatang.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setHalamanModelBaru((h) => Math.max(1, h - 1))}
                              disabled={halamanModelBaru <= 1}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setHalamanModelBaru((h) =>
                                  Math.min(Math.ceil(rincianModelBaruDatang.length / BARIS_PER_HALAMAN_BARANG_DATANG), h + 1)
                                )
                              }
                              disabled={halamanModelBaru >= Math.ceil(rincianModelBaruDatang.length / BARIS_PER_HALAMAN_BARANG_DATANG)}
                              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              Berikutnya
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Tahapan Barang — rincian dari Alur Barang</div>
                <button
                  onClick={() => onNavigate && onNavigate("data-barang")}
                  className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  Buka Halaman <ArrowRight size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
                {TAHAP_ALUR.map((s) => {
                  const meta = STAGE_META[s];
                  const c = COLOR[meta.color];
                  const Icon = meta.icon;
                  const aktif = stageTerbuka === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStageTerbuka((v) => (v === s ? null : s))}
                      className={`rounded-xl border p-3 text-left ${c.bg} hover:brightness-110 transition ${
                        aktif ? "border-amber-500/70" : "border-slate-800"
                      }`}
                    >
                      <Icon size={16} className={c.text} />
                      <div className="text-xl font-bold mt-2">{byStage(s).length}</div>
                      <div className="text-[11px] text-slate-400">{meta.label}</div>
                    </button>
                  );
                })}
              </div>

              {stageTerbuka && (
                <div className="border-t border-slate-800">
                  <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs font-semibold text-slate-300">
                      {STAGE_META[stageTerbuka]?.label} — {byStage(stageTerbuka).length} barang
                    </div>
                    <button
                      onClick={() => onNavigate && onNavigate("data-barang")}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      Buka Halaman Lengkap <ArrowRight size={12} />
                    </button>
                  </div>
                  {byStage(stageTerbuka).length === 0 ? (
                    <EmptyState label="Belum ada barang di tahap ini." />
                  ) : (
                    <div className="divide-y divide-slate-800/70 max-h-96 overflow-y-auto">
                      {byStage(stageTerbuka).map((i) => (
                        <button
                          key={i.id}
                          onClick={() => setModal && setModal({ type: "detail-item", item: i })}
                          className="w-full text-left px-4 py-3 hover:bg-slate-900/70 transition flex items-center gap-3"
                        >
                          {i.foto_url ? (
                            <img
                              src={i.foto_url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="w-8 h-8 object-cover rounded-md border border-slate-800 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700 shrink-0">
                              <Boxes size={12} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-xs font-semibold text-slate-100 truncate">
                              {i.sku || i.barcode_supplier || "—"}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {i.jumlah || 0}x{i.tanggal ? ` · ${i.tanggal}` : ""}
                              {i.gudang ? ` · ${i.gudang}` : ""}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tab "Dashboard Monitoring" — satu layar untuk memantau posisi tiap barang
// di sepanjang alur, dari pesanan ke supplier sampai siap dijual, plus akses
// cepat ke Laporan Keuangan & Penjualan Grosir. Beda dari "Dashboard Gudang"
// (yang cuma menghitung), tab ini menampilkan DAFTAR barangnya langsung per
// tahap supaya owner/superadmin bisa lihat & klik satu-satu tanpa perlu
// bolak-balik ke tiap halaman kerja.
const MAX_BARIS_MONITORING = 8;

function SeksiMonitoring({ icon: Icon, color = "slate", title, description, count, rows, onNavigate, navTarget, emptyLabel }) {
  const c = COLOR[color] || COLOR.slate;
  const lebih = rows.length - MAX_BARIS_MONITORING;
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${c.bg}`}>
            <Icon size={15} className={c.text} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2">
              {title}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>{count}</span>
            </div>
            <div className="text-[11px] text-slate-500 truncate">{description}</div>
          </div>
        </div>
        {onNavigate && navTarget && (
          <button
            onClick={() => onNavigate(navTarget.menu, navTarget.sub)}
            className="shrink-0 text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Buka Halaman <ArrowRight size={12} />
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState label={emptyLabel} />
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-800/60">
            {rows.slice(0, MAX_BARIS_MONITORING).map((r) => (
              <div key={r.key} onClick={r.onClick} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${r.onClick ? "cursor-pointer hover:bg-slate-900/50" : ""}`}>
                <div className="min-w-0 flex items-center gap-3">
                  {r.foto_url ? (
                    <img src={r.foto_url} alt={r.label} loading="lazy" decoding="async" className="w-8 h-8 object-cover rounded-md border border-slate-800 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700 shrink-0">
                      <Icon size={12} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-200 truncate">{r.label}</div>
                    {r.subLabel && <div className="text-[11px] text-slate-500 truncate">{r.subLabel}</div>}
                  </div>
                </div>
                {r.rightLabel && <div className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">{r.rightLabel}</div>}
              </div>
            ))}
          </div>
          {lebih > 0 && (
            <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800/60">
              +{lebih} barang lainnya — buka halaman terkait untuk lihat semua.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DashboardMonitoring({ items, pesananMasuk, penempatan, keuanganTransaksi, pesananGrosir, onNavigate, setModal, periodeDari, periodeSampai, periodeLabel }) {
  // 1) Barang yang sedang dipesan ke supplier (PO belum "selesai"/"batal").
  const sedangDipesan = (pesananMasuk || [])
    .filter((p) => {
      const st = statusPesananMasuk(p);
      return st === "menunggu" || st === "sebagian";
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // 2)-6) Barang di tiap tahap alur (lihat STAGE_ORDER/STAGE_META di lib/constants.js).
  const byStage = (stage) => items.filter((i) => i.stage === stage);
  const belumSku = byStage("sku");
  const belumRak = byStage("rak");
  const hargaBelumPasti = byStage("menunggu-harga");
  const belumFoto = byStage("verifikasi");
  const belumUpload = byStage("marketplace");

  const labelItem = (i) => i.sku || i.barcode_supplier || "—";
  const itemRow = (i, rightLabel) => ({
    key: i.id,
    label: labelItem(i),
    subLabel: `${i.jumlah || 0}x${i.tanggal ? ` · ${i.tanggal}` : ""}`,
    foto_url: i.foto_url,
    rightLabel,
    onClick: setModal ? () => setModal({ type: "detail-item", item: i }) : undefined,
  });

  // Ringkasan singkat Laporan Keuangan & Penjualan Grosir — mengikuti filter
  // Bulan & Tahun di atas Dashboard, jalan pintas ke laporan lengkapnya.
  const dari = periodeDari || awalBulanIni();
  const sampai = periodeSampai || hariIniIso();
  const ringkasanKeuanganBulanIni = ringkasanKeuangan(keuanganTransaksi, dari, sampai);
  // Cuma pesanan Grosir asli — Reseller Toko/Cekout dihitung terpisah, bukan
  // di sini (sama seperti Semua Pesanan & Laporan Grosir).
  const pesananGrosirSajaMonitoring = (pesananGrosir || []).filter(
    (p) => !p.jenis_transaksi || p.jenis_transaksi === "grosir"
  );
  const laporanGrosirBulanIni = ringkasanGrosir(pesananGrosirSajaMonitoring, dari, sampai);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Sedang Dipesan" value={sedangDipesan.length} icon={Truck} />
        <StatCard label="Belum Ada SKU" value={belumSku.length} icon={Boxes} accent="text-amber-400" iconColor="text-amber-500" />
        <StatCard label="Belum Ada Rak" value={belumRak.length} icon={MapPin} accent="text-sky-400" iconColor="text-sky-500" />
        <StatCard label="Harga Belum Pasti" value={hargaBelumPasti.length} icon={DollarSign} accent="text-orange-400" iconColor="text-orange-500" />
        <StatCard label="Belum Pemotretan" value={belumFoto.length} icon={Camera} accent="text-pink-400" iconColor="text-pink-500" />
        <StatCard label="Belum Upload MP" value={belumUpload.length} icon={ShoppingBag} accent="text-teal-400" iconColor="text-teal-500" />
      </div>

      <SeksiMonitoring
        icon={Truck}
        color="amber"
        title="Barang Sedang Dipesan"
        description="Pesanan ke supplier yang belum datang penuh (menunggu / sebagian datang)."
        count={sedangDipesan.length}
        rows={sedangDipesan.map((p) => {
          const st = statusPesananMasuk(p);
          const meta = PO_STATUS_META[st];
          const detail = detailModelPesanan(p);
          return {
            key: p.id,
            label: p.supplier || "—",
            subLabel: `${detail.length} model · dipesan ${p.tanggal_pesan || "—"}`,
            rightLabel: meta?.label,
            onClick: setModal ? () => setModal({ type: "konfirmasi-datang", item: p }) : undefined,
          };
        })}
        onNavigate={onNavigate}
        navTarget={{ menu: "barang-datang" }}
        emptyLabel="Tidak ada pesanan yang masih ditunggu — semua sudah datang."
      />

      <SeksiMonitoring
        icon={Boxes}
        color="amber"
        title="Sudah Datang, Belum Ada SKU"
        description="Barang fisik sudah diterima gudang, tinggal dibuatkan SKU."
        count={belumSku.length}
        rows={belumSku.map((i) => itemRow(i))}
        onNavigate={onNavigate}
        navTarget={{ menu: "sku-harga", sub: "buat" }}
        emptyLabel="Tidak ada barang yang menunggu dibuatkan SKU."
      />

      <SeksiMonitoring
        icon={MapPin}
        color="sky"
        title="Sudah Ada SKU, Belum Ada Rak"
        description="SKU sudah dibuat, tinggal ditempatkan ke rak gudang."
        count={belumRak.length}
        rows={belumRak.map((i) => itemRow(i))}
        onNavigate={onNavigate}
        navTarget={{ menu: "rak", sub: "tempatkan" }}
        emptyLabel="Tidak ada SKU yang menunggu ditempatkan ke rak."
      />

      <SeksiMonitoring
        icon={DollarSign}
        color="orange"
        title="Harga Belum Dipastikan"
        description="Sudah punya rak, tapi ada perubahan harga asli yang perlu diputuskan dulu sebelum lanjut ke pemotretan."
        count={hargaBelumPasti.length}
        rows={hargaBelumPasti.map((i) => itemRow(i))}
        onNavigate={onNavigate}
        navTarget={{ menu: "sku-harga", sub: "master-barang" }}
        emptyLabel="Tidak ada barang yang harganya belum dipastikan."
      />

      <SeksiMonitoring
        icon={Camera}
        color="pink"
        title="Sudah Ada Rak, Belum Pemotretan"
        description="Harga sudah pasti, tinggal difoto untuk keperluan katalog & marketplace."
        count={belumFoto.length}
        rows={belumFoto.map((i) => itemRow(i))}
        onNavigate={onNavigate}
        navTarget={{ menu: "foto" }}
        emptyLabel="Tidak ada barang yang menunggu difoto."
      />

      <SeksiMonitoring
        icon={ShoppingBag}
        color="teal"
        title="Sudah Ada Foto, Belum Upload Marketplace"
        description="Foto sudah siap, tinggal diupload ke marketplace."
        count={belumUpload.length}
        rows={belumUpload.map((i) => itemRow(i))}
        onNavigate={onNavigate}
        navTarget={{ menu: "marketplace", sub: "belum" }}
        emptyLabel="Tidak ada barang yang menunggu upload ke marketplace."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Wallet size={15} className="text-amber-400" />
              </span>
              <div className="text-sm font-semibold">Laporan Keuangan</div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate("keuangan", "laporan")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Lihat Laporan <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-800">
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Kas Masuk ({periodeLabel})</div>
              <div className="text-sm font-bold text-emerald-400">{fmtRp(ringkasanKeuanganBulanIni.masuk)}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Kas Keluar ({periodeLabel})</div>
              <div className="text-sm font-bold text-red-400">{fmtRp(ringkasanKeuanganBulanIni.keluar)}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Laba (Rugi)</div>
              <div className={`text-sm font-bold ${ringkasanKeuanganBulanIni.saldo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtRp(ringkasanKeuanganBulanIni.saldo)}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Store size={15} className="text-emerald-400" />
              </span>
              <div className="text-sm font-semibold">Penjualan Grosir</div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate("grosir", "laporan")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Lihat Laporan <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-800">
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Omset ({periodeLabel})</div>
              <div className="text-sm font-bold text-emerald-400">{fmtRp(laporanGrosirBulanIni.omset)}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Jumlah Pesanan</div>
              <div className="text-sm font-bold">{laporanGrosirBulanIni.jumlahPesanan}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Rata-rata / Pesanan</div>
              <div className="text-sm font-bold">{fmtRp(laporanGrosirBulanIni.rataRata)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Jumlah nominal marketplace_transaksi/keuangan_transaksi bertipe tertentu
// yang tanggalnya jatuh di rentang [dari, sampai] (format "YYYY-MM-DD",
// inklusif) — dipakai untuk menghitung omset channel Marketplace & Toko
// Offline, pola sama seperti ringkasanGrosir() di lib/api.js.
function jumlahDalamRentang(list, dari, sampai, predikat) {
  return (list || []).reduce((a, t) => {
    if (predikat && !predikat(t)) return a;
    if (dari && t.tanggal < dari) return a;
    if (sampai && t.tanggal > sampai) return a;
    return a + (Number(t.jumlah) || 0);
  }, 0);
}

// Ringkasan omset & jumlah entri Toko Offline (dari keuangan_transaksi yang
// ditandai isEntriTokoOffline — lihat pages/TokoOffline.jsx), untuk rentang
// [dari, sampai] tertentu — pola sama seperti ringkasanGrosir() di lib/api.js
// supaya kartu "Laporan Toko Offline" bisa dibaca sejajar dengan "Laporan
// Grosir" (sama-sama omset + jumlah pesanan/entri).
function ringkasanTokoOffline(keuanganTransaksi, dari, sampai) {
  const list = (keuanganTransaksi || []).filter((t) => {
    if (!isEntriTokoOffline(t)) return false;
    if (dari && t.tanggal < dari) return false;
    if (sampai && t.tanggal > sampai) return false;
    return true;
  });
  const omset = list.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  return { omset, jumlahEntri: list.length };
}

// Kartu ringkas "Hari Ini / Periode / Tahun" yang dipakai berulang di dalam
// kartu Store Selma (Laporan Grosir & Laporan Toko Offline) — satu komponen
// kecil supaya kedua laporan itu selalu tampil sejajar & konsisten.
function MiniLaporanPeriode({ hariIniStr, periodeLabel, tahunTerpilih, harian, bulanan, tahunan, satuanLabel = "pesanan" }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
          <Clock size={11} /> Hari Ini ({hariIniStr.slice(8, 10)}/{hariIniStr.slice(5, 7)})
        </div>
        <div className="text-base font-bold text-amber-400">{fmtRp(harian.omset)}</div>
        {satuanLabel && (
          <div className="text-[11px] text-slate-500 mt-0.5">{harian.jumlahPesanan ?? harian.jumlahEntri} {satuanLabel}</div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
          <CalendarRange size={11} /> {periodeLabel}
        </div>
        <div className="text-base font-bold text-amber-400">{fmtRp(bulanan.omset)}</div>
        {satuanLabel && (
          <div className="text-[11px] text-slate-500 mt-0.5">{bulanan.jumlahPesanan ?? bulanan.jumlahEntri} {satuanLabel}</div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
          <BarChart3 size={11} /> Tahun {tahunTerpilih}
        </div>
        <div className="text-base font-bold text-amber-400">{fmtRp(tahunan.omset)}</div>
        {satuanLabel && (
          <div className="text-[11px] text-slate-500 mt-0.5">{tahunan.jumlahPesanan ?? tahunan.jumlahEntri} {satuanLabel}</div>
        )}
      </div>
    </div>
  );
}

// Uraikan lagi jenis (Cash/Transfer) dari keterangan entri Toko Offline —
// re-export pola yang sama seperti uraiKeterangan() di pages/TokoOffline.jsx,
// dipakai buat pecah Cash vs Transfer per hari di Riwayat Harian bawah ini.
const PENANDA_TOKO_OFFLINE = "Toko Offline ·";
function jenisEntriTokoOffline(keterangan) {
  const sisa = (keterangan || "").slice(PENANDA_TOKO_OFFLINE.length).trim();
  return sisa.split(" — ")[0]?.trim() || "";
}

// Riwayat Harian Toko Offline — rekap per tanggal (Cash, Transfer, Total),
// dipakai di kartu "Laporan Toko Offline" pada Dashboard Penjualan supaya
// sejajar dengan "Pesanan Grosir Hari Ini" di tab Grosir. Detail per baris
// transaksi tetap di halaman Toko Offline (tombol "Buka Toko Offline").
function riwayatHarianTokoOffline(keuanganTransaksi, limit = 10) {
  const map = new Map();
  (keuanganTransaksi || []).filter(isEntriTokoOffline).forEach((t) => {
    const row = map.get(t.tanggal) || { tanggal: t.tanggal, cash: 0, transfer: 0, jumlahEntri: 0 };
    const jenis = jenisEntriTokoOffline(t.keterangan);
    if (jenis === "Cash") row.cash += Number(t.jumlah) || 0;
    else if (jenis === "Transfer") row.transfer += Number(t.jumlah) || 0;
    row.jumlahEntri += 1;
    map.set(t.tanggal, row);
  });
  return Array.from(map.values())
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0))
    .slice(0, limit);
}

// Daftar transaksi mentah satu toko marketplace (platform+kode), opsional
// difilter tipe & rentang tanggal — dipakai buat panel "rincian" saat salah
// satu dari 4 kartu (Saldo/Pemasukan/Iklan/Dicairkan) di kartu Marketplace
// diklik. Tanpa tipe & rentang = riwayat lengkap toko itu (dipakai buat
// rincian Saldo, karena saldo itu akumulasi dari awal, bukan per periode).
function daftarEntriMarketplaceToko(marketplaceTransaksi, platform, tokoKode, tipe, dari, sampai) {
  return (marketplaceTransaksi || [])
    .filter((t) => {
      if (t.platform !== platform) return false;
      if ((t.toko || null) !== (tokoKode || null)) return false;
      if (tipe && t.tipe !== tipe) return false;
      if (dari && t.tanggal < dari) return false;
      if (sampai && t.tanggal > sampai) return false;
      return true;
    })
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (b.created_at || "").localeCompare(a.created_at || "")));
}

// Total satu tipe transaksi ("pemasukan" / "iklan" / "pencairan") untuk satu
// toko marketplace (platform+kode) dalam rentang [dari, sampai] — dipakai
// buat rincian Pemasukan/Iklan/Dicairkan di kartu Marketplace, pola sama
// seperti jumlahByTipe() di Penjualanmarketplace.jsx (DetailToko).
function jumlahMarketplaceByTipe(marketplaceTransaksi, platform, tokoKode, tipe, dari, sampai) {
  return (marketplaceTransaksi || []).reduce((a, t) => {
    if (t.platform !== platform) return a;
    if ((t.toko || null) !== (tokoKode || null)) return a;
    if (t.tipe !== tipe) return a;
    if (dari && t.tanggal < dari) return a;
    if (sampai && t.tanggal > sampai) return a;
    return a + (Number(t.jumlah) || 0);
  }, 0);
}

// Panel rincian transaksi saat salah satu dari 4 kartu (Saldo/Pemasukan/
// Iklan/Dicairkan) di kartu Marketplace diklik — tabel Tanggal/Keterangan/
// Jumlah, sumbernya SAMA PERSIS dengan tabel Riwayat di DetailToko
// (Penjualanmarketplace.jsx). "Saldo" tidak difilter tanggal (akumulasi dari
// awal), yang lain (Pemasukan/Iklan/Dicairkan) ikut filter periode Dashboard.
function RincianMarketplaceToko({ platformAktif, rincianAktif, marketplaceTransaksi, periodeDari, periodeSampai, periodeLabel }) {
  const KONFIG = {
    saldo: { title: "Rincian Saldo (semua transaksi)", tipe: null, dari: null, sampai: null },
    pemasukan: { title: `Rincian Pemasukan ${periodeLabel}`, tipe: "pemasukan", dari: periodeDari, sampai: periodeSampai },
    iklan: { title: `Rincian Iklan ${periodeLabel}`, tipe: "iklan", dari: periodeDari, sampai: periodeSampai },
    dicairkan: { title: `Rincian Dicairkan ${periodeLabel}`, tipe: "pencairan", dari: periodeDari, sampai: periodeSampai },
  }[rincianAktif];

  const list = daftarEntriMarketplaceToko(
    marketplaceTransaksi, platformAktif.platform, platformAktif.kode, KONFIG.tipe, KONFIG.dari, KONFIG.sampai
  );

  return (
    <div className="rounded-lg border border-slate-800 overflow-hidden mt-3">
      <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-semibold text-slate-300">{KONFIG.title}</div>
      {list.length === 0 ? (
        <div className="p-5">
          <EmptyState label="Belum ada transaksi." />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-4 py-2 font-medium">Tipe</th>
              <th className="px-4 py-2 font-medium">Keterangan</th>
              <th className="px-4 py-2 font-medium text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 15).map((t) => (
              <tr key={t.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{formatTanggalID(t.tanggal)}</td>
                <td className="px-4 py-2">
                  <Badge color={TIPE_BADGE_MARKETPLACE[t.tipe] || "slate"}>{TIPE_LABEL_MARKETPLACE[t.tipe] || t.tipe}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-400">{t.keterangan || "—"}</td>
                <td className={`px-4 py-2 text-right font-medium ${t.tipe === "pemasukan" ? "text-emerald-400" : "text-slate-300"}`}>
                  {t.tipe === "pemasukan" ? "+" : "-"}{fmtRp(t.jumlah)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > 15 && (
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-800">
          Menampilkan 15 dari {list.length} transaksi — lihat semua di halaman Penjualan Marketplace.
        </div>
      )}
    </div>
  );
}
const TIPE_LABEL_MARKETPLACE = { pemasukan: "Pemasukan", iklan: "Iklan", pencairan: "Pencairan" };
const TIPE_BADGE_MARKETPLACE = { pemasukan: "emerald", iklan: "amber", pencairan: "sky" };

function DashboardPenjualan({ pesananGrosir, pembayaranGrosir, depositGrosir, pelangganGrosir, keuanganTransaksi, marketplaceTransaksi, master, onNavigate, tahun, periodeDari, periodeSampai, periodeLabel }) {
  // Cuma pesanan Grosir asli — Reseller Toko/Cekout belum ditampilkan di
  // kartu Dashboard Penjualan ini (kartu "Reseller" masih "Segera Hadir"),
  // riwayat & angkanya sendiri tetap ada di menu Reseller.
  const pesananGrosir_ = (pesananGrosir || []).filter(
    (p) => !p.jenis_transaksi || p.jenis_transaksi === "grosir"
  );

  const pesananAktif = pesananGrosir_.filter((p) => p.status !== "Batal");
  const pesananHariIni = pesananAktif.filter((p) => isToday(p.created_at));

  // Channel yang lagi "dibuka" panelnya di bawah kartu toggle (pola sama
  // seperti tabAlur/showDataBarang di DashboardGudang) — null = semua
  // tertutup, cuma satu channel yang bisa terbuka dalam satu waktu.
  const [channelAktif, setChannelAktif] = useState(null);

  // Tab aktif di dalam kartu "Store Selma" — pola pill-tab sama persis
  // seperti ALUR_TABS di DashboardGudang ("Barang yang di Pesan" dkk):
  // cuma satu laporan yang tampil dalam satu waktu, ganti dengan klik tab.
  const [tabStoreSelma, setTabStoreSelma] = useState("grosir");
  const STORE_SELMA_TABS = [
    { key: "grosir", label: "Laporan Grosir", icon: Store },
    { key: "toko-offline", label: "Laporan Toko Offline", icon: LayoutGrid },
  ];

  // Tab toko yang aktif di kartu Marketplace — pola pill-tab sama persis
  // seperti STORE_SELMA_TABS di atas (nama toko sebagai tab, bukan daftar
  // tombol bertumpuk).
  const [tokoAktifKey, setTokoAktifKey] = useState(null);
  // Platform yang dipilih di dalam satu grup nama toko (kalau nama tokonya
  // sama di beberapa platform) — dipakai buat nentuin laporan mana yang
  // ditampilkan di bawah badge platform.
  const [platformAktifKey, setPlatformAktifKey] = useState(null);
  // Kartu rincian yang lagi dibuka di kartu Marketplace: "saldo" | "pemasukan"
  // | "iklan" | "dicairkan" | null (semua kartu tertutup).
  const [rincianAktif, setRincianAktif] = useState(null);

  const totalPiutang = pesananAktif.reduce((a, p) => a + sisaHutangPesanan(p, pembayaranGrosir), 0);
  const totalDeposit = depositGrosir.reduce((a, d) => a + (Number(d.jumlah) || 0), 0);

  const belumLunas = pesananAktif
    .filter((p) => p.status_bayar !== "Lunas")
    .sort((a, b) => sisaHutangPesanan(b, pembayaranGrosir) - sisaHutangPesanan(a, pembayaranGrosir));

  const recentHariIni = [...pesananHariIni].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const namaPelanggan = (id) => pelangganGrosir.find((c) => c.id === id)?.nama || "—";

  // Laporan cepat harian/bulanan/tahunan (khusus Grosir) — angka lengkapnya
  // (grafik, tabel per bulan/tahun, unduh CSV) ada di menu Grosir > Laporan
  // Grosir; di sini cuma ringkasan sekilas supaya tidak perlu pindah halaman
  // untuk cek omset. "Hari Ini" tetap hari berjalan (status langsung),
  // sedangkan "Bulanan" & "Tahunan" mengikuti filter Bulan & Tahun di atas
  // Dashboard.
  const hariIniStr = hariIniIso();
  const tahunTerpilih = tahun || new Date().getFullYear();
  const awalTahunTerpilih = `${tahunTerpilih}-01-01`;
  const akhirTahunTerpilih = `${tahunTerpilih}-12-31`;
  const laporanHarian = ringkasanGrosir(pesananGrosir_, hariIniStr, hariIniStr);
  const laporanBulanan = ringkasanGrosir(pesananGrosir_, periodeDari, periodeSampai);
  const laporanTahunan = ringkasanGrosir(pesananGrosir_, awalTahunTerpilih, akhirTahunTerpilih);

  // Laporan Toko Offline — sejajar polanya dengan Laporan Grosir di atas
  // (omset + jumlah entri Hari Ini / periode terpilih / Tahun terpilih),
  // dari keuangan_transaksi yang ditandai isEntriTokoOffline (lihat
  // pages/TokoOffline.jsx).
  const laporanTokoOfflineHarian = ringkasanTokoOffline(keuanganTransaksi, hariIniStr, hariIniStr);
  const laporanTokoOfflineBulanan = ringkasanTokoOffline(keuanganTransaksi, periodeDari, periodeSampai);
  const laporanTokoOfflineTahunan = ringkasanTokoOffline(keuanganTransaksi, awalTahunTerpilih, akhirTahunTerpilih);
  const riwayatHarianTO = riwayatHarianTokoOffline(keuanganTransaksi, 10);

  // Daftar semua toko marketplace (Shopee/TikTok/Lazada digabung) — dipakai
  // di kartu "Marketplace" pada Dashboard Penjualan supaya nama toko +
  // nama marketplace-nya kelihatan langsung, tanpa perlu pindah halaman.
  // Sumber & pola hitungnya SAMA PERSIS dengan daftar toko di halaman
  // Penjualan Marketplace (lihat DaftarToko di Penjualanmarketplace.jsx).
  const daftarTokoSemuaPlatform = Object.keys(PLATFORM_LABEL).flatMap((platform) => {
    const tokoMasterList = master?.[`toko_${platform}`] || [];
    return daftarTokoMarketplace(marketplaceTransaksi, tokoMasterList, platform).map((t) => ({
      ...t,
      platform,
      platformLabel: PLATFORM_LABEL[platform],
      key: `${platform}-${t.kode ?? "tanpa-toko"}`,
    }));
  });

  // Gabungkan toko yang NAMANYA SAMA lintas platform (mis. "Selma Acc" ada
  // di Shopee & TikTok) jadi satu tab — di bawah tab itu baru ditampilkan
  // platform mana saja yang punya toko dengan nama tersebut. Dicocokkan by
  // label saja (tidak peduli besar/kecil huruf/spasi), bukan by kode, karena
  // kode toko memang beda-beda per platform meski namanya sama.
  const grupTokoByNama = new Map();
  daftarTokoSemuaPlatform.forEach((t) => {
    const namaKey = (t.label || "").trim().toLowerCase();
    const grup = grupTokoByNama.get(namaKey) || { key: namaKey, label: t.label, platforms: [] };
    grup.platforms.push(t);
    grupTokoByNama.set(namaKey, grup);
  });
  const daftarNamaTokoUnik = Array.from(grupTokoByNama.values());

  // Default tab yang aktif = nama toko pertama di daftar, biar pas kartu
  // Marketplace dibuka langsung ada yang terpilih.
  const tokoAktif = daftarNamaTokoUnik.find((t) => t.key === tokoAktifKey) || daftarNamaTokoUnik[0] || null;
  // Default platform yang aktif di dalam grup = platform pertama grup itu.
  const platformAktif = tokoAktif
    ? tokoAktif.platforms.find((p) => p.key === platformAktifKey) || tokoAktif.platforms[0]
    : null;

  // Rincian Pemasukan / Iklan / Dicairkan untuk platform yang dipilih,
  // mengikuti filter Bulan & Tahun di atas Dashboard (periodeDari-periodeSampai)
  // — pola sama seperti StatCard "Pemasukan/Iklan/Dicairkan Bulan Ini" di
  // DetailToko (Penjualanmarketplace.jsx), cuma di sini ikut filter periode
  // Dashboard, bukan selalu bulan berjalan.
  const pemasukanPeriodeMarketplace = platformAktif
    ? jumlahMarketplaceByTipe(marketplaceTransaksi, platformAktif.platform, platformAktif.kode, "pemasukan", periodeDari, periodeSampai)
    : 0;
  const iklanPeriodeMarketplace = platformAktif
    ? jumlahMarketplaceByTipe(marketplaceTransaksi, platformAktif.platform, platformAktif.kode, "iklan", periodeDari, periodeSampai)
    : 0;
  const dicairkanPeriodeMarketplace = platformAktif
    ? jumlahMarketplaceByTipe(marketplaceTransaksi, platformAktif.platform, platformAktif.kode, "pencairan", periodeDari, periodeSampai)
    : 0;

  return (
    <div>
      {/* Kartu toggle per channel penjualan — pola sama persis seperti
          "Alur Barang" / "Data Barang" di Dashboard Gudang: klik untuk
          buka/tutup panel detail channel itu di bawah, klik lagi untuk
          menutup. Cuma satu channel yang terbuka dalam satu waktu. */}
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <button
          type="button"
          onClick={() => setChannelAktif((v) => (v === "store-selma" ? null : "store-selma"))}
          className={`rounded-xl border p-6 text-left transition min-h-[180px] flex flex-col ${
            channelAktif === "store-selma" ? "border-amber-500/50 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <Store size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Store Selma</div>
          <div className="text-[11px] text-slate-500 mt-1">Grosir & Toko Offline</div>
        </button>

        <button
          type="button"
          onClick={() => setChannelAktif((v) => (v === "marketplace" ? null : "marketplace"))}
          className={`rounded-xl border p-6 text-left transition min-h-[180px] flex flex-col ${
            channelAktif === "marketplace" ? "border-amber-500/50 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <ShoppingBag size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Marketplace</div>
          <div className="text-[11px] text-slate-500 mt-1">Segera Hadir</div>
        </button>

        <button
          type="button"
          onClick={() => setChannelAktif((v) => (v === "reseller" ? null : "reseller"))}
          className={`rounded-xl border p-6 text-left transition min-h-[180px] flex flex-col ${
            channelAktif === "reseller" ? "border-amber-500/50 bg-slate-900/70" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <Truck size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Reseller</div>
          <div className="text-[11px] text-slate-500 mt-1">Segera Hadir</div>
        </button>
      </div>

      {channelAktif === "marketplace" && (
        <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-sm font-semibold flex items-center gap-2 mb-3">
              <ShoppingBag size={14} className="text-amber-400" /> Toko Marketplace
            </div>
            {daftarNamaTokoUnik.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
                {daftarNamaTokoUnik.map((t) => {
                  const active = tokoAktif?.key === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTokoAktifKey(t.key)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition whitespace-nowrap ${
                        active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Store size={13} /> {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {daftarNamaTokoUnik.length === 0 ? (
            <div className="p-6">
              <EmptyState label="Belum ada toko marketplace. Tambah toko lewat menu Penjualan Marketplace." />
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-medium text-slate-100">{tokoAktif.label}</div>
                {platformAktif && (
                  <button
                    onClick={() => onNavigate && onNavigate("penjualan-marketplace", platformAktif.platform)}
                    className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1 flex-shrink-0"
                  >
                    Buka Detail <ArrowRight size={11} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {tokoAktif.platforms.map((p) => {
                  const activePlatform = platformAktif?.key === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setPlatformAktifKey(p.key)}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition ${
                        activePlatform
                          ? "border-amber-500/50 bg-slate-900/70"
                          : "border-slate-800 hover:border-slate-700 bg-slate-900/60"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-md-on-surface/[0.06] ${PLATFORM_COLOR[p.platform]}`}>
                        <Store size={12} />
                      </div>
                      <span className={`text-xs font-medium ${activePlatform ? "text-slate-100" : "text-slate-300"}`}>{p.platformLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* 4 kartu ringkasan platform yang dipilih — Saldo (akumulasi
                  dari awal) + Pemasukan/Iklan/Dicairkan (ikut filter Bulan &
                  Tahun di atas Dashboard). Klik salah satu buka rincian
                  transaksinya di bawah. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Saldo Saat Ini"
                  value={fmtRp(platformAktif?.saldo || 0)}
                  icon={Wallet}
                  accent="text-md-primary"
                  onClick={() => setRincianAktif((v) => (v === "saldo" ? null : "saldo"))}
                />
                <StatCard
                  label={`Pemasukan ${periodeLabel}`}
                  value={fmtRp(pemasukanPeriodeMarketplace)}
                  icon={TrendingUp}
                  iconColor="text-emerald-400"
                  onClick={() => setRincianAktif((v) => (v === "pemasukan" ? null : "pemasukan"))}
                />
                <StatCard
                  label={`Iklan ${periodeLabel}`}
                  value={fmtRp(iklanPeriodeMarketplace)}
                  icon={Megaphone}
                  iconColor="text-amber-400"
                  onClick={() => setRincianAktif((v) => (v === "iklan" ? null : "iklan"))}
                />
                <StatCard
                  label={`Dicairkan ${periodeLabel}`}
                  value={fmtRp(dicairkanPeriodeMarketplace)}
                  icon={Banknote}
                  iconColor="text-sky-400"
                  onClick={() => setRincianAktif((v) => (v === "dicairkan" ? null : "dicairkan"))}
                />
              </div>

              {rincianAktif && platformAktif && (
                <RincianMarketplaceToko
                  platformAktif={platformAktif}
                  rincianAktif={rincianAktif}
                  marketplaceTransaksi={marketplaceTransaksi}
                  periodeDari={periodeDari}
                  periodeSampai={periodeSampai}
                  periodeLabel={periodeLabel}
                />
              )}
            </div>
          )}
        </div>
      )}

      {channelAktif === "reseller" && (
        <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            <div className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">Segera Hadir</div>
            <div className="text-[11px] text-slate-500 max-w-[260px]">Ringkasan Reseller di Dashboard Penjualan masih dalam pengembangan.</div>
            <button
              onClick={() => onNavigate && onNavigate("reseller", "toko")}
              className="mt-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Buka Halaman Reseller <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {channelAktif === "store-selma" && (
        <div>
      {/* Pill-tab Laporan Grosir / Laporan Toko Offline — pola sama persis
          seperti ALUR_TABS ("Barang yang di Pesan" dkk) di DashboardGudang:
          cuma satu laporan yang tampil, ganti dengan klik tab. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {STORE_SELMA_TABS.map((t) => {
          const Icon = t.icon;
          const active = tabStoreSelma === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTabStoreSelma(t.key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition whitespace-nowrap ${
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tabStoreSelma === "grosir" && (
        <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Store size={14} className="text-amber-400" /> Laporan Grosir
            </div>
            <button
              onClick={() => onNavigate && onNavigate("grosir", "laporan")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Lihat Laporan Lengkap <ArrowRight size={11} />
            </button>
          </div>
          <div className="p-4">
            <MiniLaporanPeriode
              hariIniStr={hariIniStr}
              periodeLabel={periodeLabel}
              tahunTerpilih={tahunTerpilih}
              harian={laporanHarian}
              bulanan={laporanBulanan}
              tahunan={laporanTahunan}
              satuanLabel="pesanan"
            />
          </div>
        </div>
      )}

      {tabStoreSelma === "toko-offline" && (
        <>
        <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <LayoutGrid size={14} className="text-amber-400" /> Laporan Toko Offline
            </div>
            <button
              onClick={() => onNavigate && onNavigate("toko-offline", "input-harian")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              Buka Toko Offline <ArrowRight size={11} />
            </button>
          </div>
          <div className="p-4">
            <MiniLaporanPeriode
              hariIniStr={hariIniStr}
              periodeLabel={periodeLabel}
              tahunTerpilih={tahunTerpilih}
              harian={laporanTokoOfflineHarian}
              bulanan={laporanTokoOfflineBulanan}
              tahunan={laporanTokoOfflineTahunan}
              satuanLabel=""
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Riwayat Harian Toko Offline</div>
            <button
              onClick={() => onNavigate && onNavigate("toko-offline", "input-harian")}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
            >
              Lihat Semua Riwayat →
            </button>
          </div>
          {riwayatHarianTO.length === 0 ? (
            <div className="p-6">
              <EmptyState label="Belum ada input harian toko offline." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5 font-medium">Tanggal</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cash</th>
                  <th className="px-4 py-2.5 font-medium text-right">Transfer</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {riwayatHarianTO.map((r) => (
                  <tr key={r.tanggal} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(r.tanggal)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtRp(r.cash)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtRp(r.transfer)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-amber-400">{fmtRp(r.cash + r.transfer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}

      {tabStoreSelma === "grosir" && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-8">
            <StatCard label="Piutang Grosir Belum Lunas" value={fmtRp(totalPiutang)} accent="text-amber-400" iconColor="text-amber-500" icon={Wallet} />
            <StatCard label="Total Saldo Deposit Grosir" value={fmtRp(totalDeposit)} icon={Package} />
          </div>

          <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Pesanan Grosir Belum Lunas</div>
              <button
                onClick={() => onNavigate && onNavigate("grosir", "semua-pesanan")}
                className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
              >
                Lihat Semua Pesanan →
              </button>
            </div>
            {belumLunas.length === 0 ? (
              <div className="p-6">
                <EmptyState label="Semua pesanan sudah lunas." />
              </div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {belumLunas.slice(0, 8).map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.nomor_pesanan}</td>
                      <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.pelanggan_id)}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-right">{fmtRp(sisaHutangPesanan(p, pembayaranGrosir))}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={p.status_bayar === "Sebagian" ? "sky" : "amber"}>{p.status_bayar}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Pesanan Grosir Hari Ini</div>
            {recentHariIni.length === 0 ? (
              <div className="p-6">
                <EmptyState label="Belum ada pesanan grosir hari ini." />
              </div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {recentHariIni.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.nomor_pesanan}</td>
                      <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.pelanggan_id)}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-right">{fmtRp(p.total)}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
                          {p.status_bayar}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
        </div>
      )}
    </div>
  );
}

function DashboardAbsensi({ absensiRows, karyawanList, onNavigate, bulan, tahun, periodeLabel }) {
  const hariIniStr = hariIniIso();

  const rekapHarian = rekapHarianAbsensi(absensiRows);
  const rekapBulanan = rekapBulananAbsensi(rekapHarian);
  const rekapMingguan = rekapMingguanAbsensi(rekapHarian, hariIniStr, karyawanList);

  const hadirHariIni = rekapHarian.filter((r) => r.tanggal === hariIniStr && r.masuk);
  const telatHariIni = hadirHariIni.filter((r) => r.telatMenit > 0).length;

  // Rekap Bulanan mengikuti filter Bulan & Tahun di atas Dashboard — "Hadir
  // Hari Ini" & "Rekap Mingguan" tetap mengacu ke hari berjalan karena
  // keduanya memang status kehadiran langsung, bukan rekap historis.
  const bulanIni = `${tahun}-${String(bulan).padStart(2, "0")}`;
  const rekapBulanIni = rekapBulanan.filter((r) => r.bulan === bulanIni);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Hadir Hari Ini" value={hadirHariIni.length} accent="text-emerald-400" icon={UserCheck} iconColor="text-emerald-500" />
        <StatCard label="Telat Hari Ini" value={telatHariIni} accent="text-amber-400" icon={Clock} iconColor="text-amber-500" />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Hadir Hari Ini ({hariIniStr})</div>
          <button
            onClick={() => onNavigate && onNavigate("absensi", "rekap")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Lihat Rekap Lengkap <ArrowRight size={12} />
          </button>
        </div>
        {hadirHariIni.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada karyawan yang absen hari ini." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {hadirHariIni.map((r) => (
                <tr key={r.idKaryawan} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 text-slate-200 font-medium">{r.nama}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">Masuk {r.masuk}{r.pulang ? ` — Pulang ${r.pulang}` : ""}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={r.status === "Normal" ? "emerald" : r.status.includes("Tidak Absen") ? "slate" : "amber"}>
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">
          Rekap Mingguan ({rekapMingguan.tanggalMinggu[0]} – {rekapMingguan.tanggalMinggu[6]})
        </div>
        {rekapMingguan.data.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada karyawan aktif." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/70 text-slate-400 text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium sticky left-0 bg-slate-900/70">Nama</th>
                  {rekapMingguan.tanggalMinggu.map((tgl, i) => (
                    <th key={tgl} className="text-center px-2 py-2.5 font-medium whitespace-nowrap">
                      <div>{NAMA_HARI[i]}</div>
                      <div className="text-slate-500 font-normal">{tgl.slice(8, 10)}/{tgl.slice(5, 7)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rekapMingguan.data.map((p) => (
                  <tr key={p.idKaryawan} className="border-t border-slate-800/70">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 bg-slate-950">{p.nama}</td>
                    {rekapMingguan.tanggalMinggu.map((tgl) => {
                      const r = p.hari[tgl];
                      return (
                        <td key={tgl} className="px-2 py-2.5 text-center">
                          {!r ? (
                            <span className="text-slate-600">—</span>
                          ) : !r.masuk ? (
                            <Badge color="slate">Tidak Absen</Badge>
                          ) : (
                            <span className={r.telatMenit > 0 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                              {r.masuk}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Rekap Bulanan ({periodeLabel})</div>
        {rekapBulanIni.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada data absensi bulan ini." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Nama</th>
                <th className="text-left px-4 py-2.5 font-medium">Hari Masuk</th>
                <th className="text-left px-4 py-2.5 font-medium">Hari Telat</th>
                <th className="text-left px-4 py-2.5 font-medium">Total Lembur</th>
                <th className="text-left px-4 py-2.5 font-medium">Total Jam Kerja</th>
              </tr>
            </thead>
            <tbody>
              {rekapBulanIni.map((r) => (
                <tr key={r.idKaryawan} className="border-t border-slate-800/70">
                  <td className="px-4 py-2.5 font-medium">{r.nama}</td>
                  <td className="px-4 py-2.5">{r.hariMasuk}</td>
                  <td className="px-4 py-2.5">{r.hariTelat}</td>
                  <td className="px-4 py-2.5">{r.totalLemburJam} jam</td>
                  <td className="px-4 py-2.5">{r.totalJamKerja} jam</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}