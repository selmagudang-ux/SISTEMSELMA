import { useState } from "react";
import {
  Camera, MapPin, Tag, Boxes, PackageCheck, ClipboardList,
  ShoppingCart, Wallet, TrendingUp, TrendingDown, Package, Warehouse, Store,
  Landmark, ArrowRight, Clock, UserCheck, CalendarRange, BarChart3, Trash2,
  Activity, Truck, ShoppingBag, DollarSign, LayoutGrid,
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
} from "../lib/api";
import { rekapHarianAbsensi, rekapMingguanAbsensi, rekapBulananAbsensi, NAMA_HARI } from "../lib/absensi";
import { StatCard, PageHeader, EmptyState, Badge } from "../components/ui";
import { GrafikArusKas, BreakdownPengeluaran, BreakdownPemasukan, DetailTransaksiKategoriModal, LaporanLabaRugi } from "./Keuangan";

// Tab kecil di atas Dashboard — pisahkan ringkasan Gudang vs Grosir vs Keuangan
// vs Absensi supaya masing-masing tetap fokus (angka gudang tidak nyampur sama
// angka grosir/keuangan/absensi), tapi tetap satu halaman "Dashboard" (pola
// sama seperti halaman Laporan), bukan menu terpisah di sidebar.
// Menu "dashboard" sendiri HANYA bisa diakses role owner & superadmin (lihat
// ROLE_MENUS di lib/constants.js). Tab "Stok Menipis" (ajukan restock) sudah
// dipindah jadi sub-menu di dalam Gudang → Stok, supaya gudang mengajukan
// restock dari halaman kerjanya sendiri tanpa perlu akses dashboard. Tab
// "Menunggu Persetujuan" (sisi approve dari alur yang sama) juga sudah
// dipindah keluar dari sini — sekarang jadi menu sidebar tersendiri, halaman
// "Persetujuan Restok" (lihat pages/PersetujuanRestock.jsx), supaya tidak
// perlu masuk Dashboard dulu buat menindaklanjuti pengajuan.
const TABS = [
  { key: "monitoring", label: "Dashboard Monitoring", icon: Activity },
  { key: "gudang", label: "Dashboard Gudang", icon: Warehouse },
  { key: "grosir", label: "Dashboard Grosir", icon: Store },
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
  master = {},
  absensiRows = [],
  karyawanList = [],
  pengajuanRestock = [],
}) {
  const [tab, setTab] = useState("monitoring");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          tab === "grosir"
            ? "Ringkasan penjualan, piutang, dan deposit pelanggan grosir."
            : tab === "keuangan"
            ? "Ringkasan kas masuk, kas keluar, saldo rekening, dan arus kas terkini."
            : tab === "absensi"
            ? "Ringkasan kehadiran karyawan hari ini, rekap mingguan, dan rekap bulanan."
            : tab === "monitoring"
            ? "Pantau tiap tahap alur barang — dari pesanan ke supplier sampai siap dijual — plus akses cepat ke laporan keuangan & penjualan grosir."
            : "Ringkasan alur barang, stok, dan SKU di SELMA ACC BANDUNG."
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
        />
      ) : tab === "grosir" ? (
        <DashboardGrosir
          pesananGrosir={pesananGrosir}
          pembayaranGrosir={pembayaranGrosir}
          depositGrosir={depositGrosir}
          pelangganGrosir={pelangganGrosir}
          onNavigate={onNavigate}
        />
      ) : tab === "keuangan" ? (
        <DashboardKeuangan
          keuanganTransaksi={keuanganTransaksi}
          master={master}
          onNavigate={onNavigate}
        />
      ) : (
        <DashboardAbsensi
          absensiRows={absensiRows}
          karyawanList={karyawanList}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function DashboardKeuangan({ keuanganTransaksi, master, onNavigate }) {
  const [detailKategori, setDetailKategori] = useState(null);
  const dari = awalBulanIni();
  const sampai = hariIniIso();
  const ringkasanBulanIni = ringkasanKeuangan(keuanganTransaksi, dari, sampai);
  const saldoRekening = saldoPerRekening(keuanganTransaksi, master.rekening || []);
  const totalSaldoKas = saldoRekening.reduce((a, r) => a + r.saldo, 0);

  // Arus kas 60 hari terakhir supaya grafik dashboard fokus ke tren terkini,
  // bukan sejak awal berdirinya usaha (itu ranahnya Laporan Keuangan).
  const batasAwal = new Date();
  batasAwal.setDate(batasAwal.getDate() - 60);
  const batasAwalIso = batasAwal.toISOString().slice(0, 10);
  const transaksi60Hari = keuanganTransaksi.filter((t) => t.tanggal >= batasAwalIso);
  const { mode, data: dataArusKas } = arusKasPerPeriode(transaksi60Hari);

  const breakdown = breakdownPengeluaranKategori(ringkasanBulanIni.list, master.kategori_keluar || []);
  const breakdownMasuk = breakdownPemasukanKategori(ringkasanBulanIni.list, master.kategori_masuk || []);

  const labaRugiBulanIni = laporanLabaRugi(keuanganTransaksi, master.kategori_masuk || [], master.kategori_keluar || [], dari, sampai);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Saldo Kas Saat Ini" value={fmtRp(totalSaldoKas)} icon={Landmark} accent="text-amber-400" iconColor="text-amber-500" />
        <StatCard label="Kas Masuk (Bulan Ini)" value={fmtRp(ringkasanBulanIni.masuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Kas Keluar (Bulan Ini)" value={fmtRp(ringkasanBulanIni.keluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard
          label="Laba (Rugi) Bulan Ini"
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
          subtitle="Bulan Ini"
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
        subtitle="Bulan Ini"
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

function DashboardGudang({ onNavigate, setModal, pengajuanRestock = [], items = [], pesananMasuk = [] }) {
  const [tabAlur, setTabAlur] = useState(null); // null = panel tertutup
  const [showRestokDisetujui, setShowRestokDisetujui] = useState(false);

  const semuaPengajuan = pengajuanRestock || [];

  // Daftar barang restok (jenis SKU, bukan zona) yang statusnya sudah
  // disetujui — ditampilkan saat kartu "Total Restok (SKU)" diklik, supaya
  // owner/superadmin bisa langsung lihat SKU mana saja yang disetujui tanpa
  // pindah halaman, dan buka detail SKU-nya langsung dari sini.
  const restokDisetujui = semuaPengajuan
    .filter((p) => p.jenis !== "zona" && p.status === "disetujui")
    .sort((a, b) => new Date(b.direspon_pada || b.created_at) - new Date(a.direspon_pada || a.created_at));

  // Kartu ringkasan di atas tab "Barang Diajukan" — "Total Restok (SKU)"
  // dihitung dari restokDisetujui supaya angkanya selalu sama dengan jumlah
  // baris yang tampil saat kartu ini diklik (cuma yang sudah disetujui,
  // bukan gabungan menunggu + ditolak). Model baru dihitung dari total rak
  // kosong yang diajukan lewat pengajuan zona (semua status, jumlah_rak_kosong
  // dijumlah — satu pengajuan zona bisa berisi beberapa rak kosong).
  const totalRestokSku = restokDisetujui.length;
  const totalModelBaru = semuaPengajuan
    .filter((p) => p.jenis === "zona")
    .reduce((sum, p) => sum + (Number(p.jumlah_rak_kosong) || 0), 0);
  const totalDisetujui = semuaPengajuan.filter((p) => p.status === "disetujui").length;

  // Buka modal detail pengajuan restock (read-only karena statusnya sudah
  // disetujui) — komponen yang sama dipakai untuk "Tinjau" di halaman
  // Persetujuan Restok, cuma tanpa tombol Setujui/Tolak.
  const bukaDetailPengajuan = (p) => {
    setModal && setModal({ type: "respon-pengajuan-restock", item: p });
  };

  const sedangDipesan = (pesananMasuk || [])
    .filter((p) => {
      const st = statusPesananMasuk(p);
      return st === "menunggu" || st === "sebagian";
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const byStage = (stage) => items.filter((i) => i.stage === stage);
  const TAHAP_ALUR = STAGE_ORDER.slice(0, 4); // sku, rak, menunggu-harga, verifikasi (Buat SKU s/d Pemotretan)

  const ALUR_TABS = [
    { key: "diajukan", label: "Barang Diajukan", icon: ClipboardList },
    { key: "datang", label: "Barang Datang", icon: Truck },
    { key: "alur", label: "Alur Barang", icon: Boxes },
  ];

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <button
          type="button"
          onClick={() => setTabAlur((v) => (v ? null : "diajukan"))}
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
          onClick={() => {}}
          className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-left hover:border-slate-700 hover:bg-slate-900/70 transition min-h-[180px] flex flex-col"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-3">
            <Boxes size={17} />
          </div>
          <div className="text-base font-semibold text-slate-100">Data Barang</div>
        </button>
      </div>

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
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Total Restok (SKU)"
                  value={totalRestokSku}
                  accent="text-amber-400"
                  icon={Boxes}
                  iconColor="text-amber-500"
                  onClick={() => setShowRestokDisetujui((v) => !v)}
                />
                <StatCard
                  label="Total Model Baru (Rak Kosong)"
                  value={totalModelBaru}
                  accent="text-amber-400"
                  icon={LayoutGrid}
                  iconColor="text-amber-500"
                  onClick={onNavigate ? () => onNavigate("persetujuan-restock", "zona") : undefined}
                />
                <StatCard
                  label="Jumlah Disetujui"
                  value={totalDisetujui}
                  accent="text-emerald-400"
                  icon={PackageCheck}
                  iconColor="text-emerald-500"
                  onClick={onNavigate ? () => onNavigate("persetujuan-restock") : undefined}
                />
              </div>

              {showRestokDisetujui && (
                <div className="mt-4 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Restok (SKU) — Disetujui</div>
                    <button
                      onClick={() => onNavigate && onNavigate("persetujuan-restock", "sku")}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      Buka Halaman Lengkap <ArrowRight size={12} />
                    </button>
                  </div>
                  {restokDisetujui.length === 0 ? (
                    <EmptyState label="Belum ada pengajuan restock SKU yang disetujui." />
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
            </div>
          ) : tabAlur === "datang" ? (
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
                  subLabel: `${detail.length} model · dipesan ${p.tanggal || "—"}`,
                  rightLabel: meta?.label,
                  onClick: setModal ? () => setModal({ type: "konfirmasi-datang", item: p }) : undefined,
                };
              })}
              onNavigate={onNavigate}
              navTarget={{ menu: "barang-datang" }}
              emptyLabel="Tidak ada pesanan yang masih ditunggu — semua sudah datang."
            />
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Alur Barang — dari Buat SKU sampai Pemotretan</div>
                <button
                  onClick={() => onNavigate && onNavigate("data-barang")}
                  className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  Buka Halaman <ArrowRight size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                {TAHAP_ALUR.map((s) => {
                  const meta = STAGE_META[s];
                  const c = COLOR[meta.color];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={s}
                      onClick={() => onNavigate && onNavigate("data-barang")}
                      className={`rounded-xl border border-slate-800 p-3 text-left ${c.bg} hover:brightness-110 transition`}
                    >
                      <Icon size={16} className={c.text} />
                      <div className="text-xl font-bold mt-2">{byStage(s).length}</div>
                      <div className="text-[11px] text-slate-400">{meta.label}</div>
                    </button>
                  );
                })}
              </div>
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

function DashboardMonitoring({ items, pesananMasuk, penempatan, keuanganTransaksi, pesananGrosir, onNavigate, setModal }) {
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

  // Ringkasan singkat Laporan Keuangan (bulan berjalan) — angka lengkap ada
  // di menu Keuangan > Laporan Keuangan, di sini cuma jalan pintas.
  const dari = awalBulanIni();
  const sampai = hariIniIso();
  const ringkasanKeuanganBulanIni = ringkasanKeuangan(keuanganTransaksi, dari, sampai);

  // Ringkasan singkat Penjualan Grosir (bulan berjalan) — jalan pintas ke
  // Laporan Grosir lengkap.
  const laporanGrosirBulanIni = ringkasanGrosir(pesananGrosir, dari, sampai);

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
            subLabel: `${detail.length} model · dipesan ${p.tanggal || "—"}`,
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
              <div className="text-[11px] text-slate-500 mb-1">Kas Masuk (Bulan Ini)</div>
              <div className="text-sm font-bold text-emerald-400">{fmtRp(ringkasanKeuanganBulanIni.masuk)}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-slate-500 mb-1">Kas Keluar (Bulan Ini)</div>
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
              <div className="text-[11px] text-slate-500 mb-1">Omset (Bulan Ini)</div>
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

function DashboardGrosir({ pesananGrosir, pembayaranGrosir, depositGrosir, pelangganGrosir, onNavigate }) {
  const pesananAktif = pesananGrosir.filter((p) => p.status !== "Batal");
  const pesananHariIni = pesananAktif.filter((p) => isToday(p.created_at));
  const omsetHariIni = pesananHariIni.reduce((a, p) => a + (Number(p.total) || 0), 0);

  const totalPiutang = pesananAktif.reduce((a, p) => a + sisaHutangPesanan(p, pembayaranGrosir), 0);
  const totalDeposit = depositGrosir.reduce((a, d) => a + (Number(d.jumlah) || 0), 0);

  const belumLunas = pesananAktif
    .filter((p) => p.status_bayar !== "Lunas")
    .sort((a, b) => sisaHutangPesanan(b, pembayaranGrosir) - sisaHutangPesanan(a, pembayaranGrosir));

  const recentHariIni = [...pesananHariIni].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const namaPelanggan = (id) => pelangganGrosir.find((c) => c.id === id)?.nama || "—";

  // Laporan cepat harian/bulanan/tahunan — angka lengkapnya (grafik, tabel per
  // bulan/tahun, unduh CSV) ada di menu Grosir > Laporan Grosir; di sini cuma
  // ringkasan sekilas supaya tidak perlu pindah halaman untuk cek omset.
  const hariIniStr = hariIniIso();
  const bulanIniAwal = awalBulanIni();
  const tahunIniAwal = `${new Date().getFullYear()}-01-01`;
  const laporanHarian = ringkasanGrosir(pesananGrosir, hariIniStr, hariIniStr);
  const laporanBulanan = ringkasanGrosir(pesananGrosir, bulanIniAwal, hariIniStr);
  const laporanTahunan = ringkasanGrosir(pesananGrosir, tahunIniAwal, hariIniStr);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Omset Hari Ini" value={fmtRp(omsetHariIni)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Pesanan Hari Ini" value={pesananHariIni.length} icon={ShoppingCart} />
        <StatCard label="Piutang Belum Lunas" value={fmtRp(totalPiutang)} accent="text-amber-400" icon={Wallet} iconColor="text-amber-500" />
        <StatCard label="Total Saldo Deposit" value={fmtRp(totalDeposit)} icon={Package} />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Laporan Grosir — Harian / Bulanan / Tahunan</div>
          <button
            onClick={() => onNavigate && onNavigate("grosir", "laporan")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Lihat Laporan Lengkap <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <Clock size={12} /> Hari Ini ({hariIniStr.slice(8, 10)}/{hariIniStr.slice(5, 7)})
            </div>
            <div className="text-lg font-bold text-amber-400">{fmtRp(laporanHarian.omset)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{laporanHarian.jumlahPesanan} pesanan</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <CalendarRange size={12} /> Bulan Ini
            </div>
            <div className="text-lg font-bold text-amber-400">{fmtRp(laporanBulanan.omset)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{laporanBulanan.jumlahPesanan} pesanan</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <BarChart3 size={12} /> Tahun Ini
            </div>
            <div className="text-lg font-bold text-amber-400">{fmtRp(laporanTahunan.omset)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{laporanTahunan.jumlahPesanan} pesanan</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Pesanan Belum Lunas</div>
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
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Pesanan Hari Ini</div>
        {recentHariIni.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada pesanan hari ini." />
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
    </div>
  );
}

function DashboardAbsensi({ absensiRows, karyawanList, onNavigate }) {
  const hariIniStr = hariIniIso();

  const rekapHarian = rekapHarianAbsensi(absensiRows);
  const rekapBulanan = rekapBulananAbsensi(rekapHarian);
  const rekapMingguan = rekapMingguanAbsensi(rekapHarian, hariIniStr, karyawanList);

  const hadirHariIni = rekapHarian.filter((r) => r.tanggal === hariIniStr && r.masuk);
  const telatHariIni = hadirHariIni.filter((r) => r.telatMenit > 0).length;

  const bulanIni = hariIniStr.slice(0, 7);
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
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Rekap Bulanan ({bulanIni})</div>
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