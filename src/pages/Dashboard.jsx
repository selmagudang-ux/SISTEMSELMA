import { useState } from "react";
import {
  Camera, MapPin, Tag, Boxes, PackageCheck, ClipboardList,
  ShoppingCart, Wallet, TrendingUp, TrendingDown, Package, Warehouse, Store,
  Landmark, ArrowRight,
} from "lucide-react";
import { STAGE_ORDER, STAGE_META, COLOR } from "../lib/constants";
import {
  fmtRp,
  sisaHutangPesanan,
  ringkasanKeuangan,
  saldoPerRekening,
  arusKasPerPeriode,
  breakdownPengeluaranKategori,
} from "../lib/api";
import { StatCard, PageHeader, EmptyState, Badge } from "../components/ui";
import { GrafikArusKas, BreakdownPengeluaran, labelDari } from "./Keuangan";

// Tab kecil di atas Dashboard — pisahkan ringkasan Gudang vs Grosir vs Keuangan
// supaya masing-masing tetap fokus (angka gudang tidak nyampur sama angka
// grosir/keuangan), tapi tetap satu halaman "Dashboard" (pola sama seperti
// halaman Laporan), bukan menu terpisah di sidebar.
const TABS = [
  { key: "gudang", label: "Dashboard Gudang", icon: Warehouse },
  { key: "grosir", label: "Dashboard Grosir", icon: Store },
  { key: "keuangan", label: "Dashboard Keuangan", icon: Wallet },
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
  pesananGrosir = [],
  pembayaranGrosir = [],
  depositGrosir = [],
  pelangganGrosir = [],
  keuanganTransaksi = [],
  master = {},
}) {
  const [tab, setTab] = useState("gudang");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          tab === "grosir"
            ? "Ringkasan penjualan, piutang, dan deposit pelanggan grosir."
            : tab === "keuangan"
            ? "Ringkasan kas masuk, kas keluar, saldo rekening, dan arus kas terkini."
            : "Ringkasan alur barang, stok, dan SKU di SELMA ACC BANDUNG."
        }
      />

      <div className="flex items-center gap-2 mb-5 bg-slate-900 border border-slate-800 rounded-lg p-1 max-w-md">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition ${
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
          stageCounts={stageCounts}
          skuCount={skuCount}
          totalStok={totalStok}
          rakCount={rakCount}
          rakKosong={rakKosong}
          items={items}
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
      ) : (
        <DashboardKeuangan
          keuanganTransaksi={keuanganTransaksi}
          master={master}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function DashboardKeuangan({ keuanganTransaksi, master, onNavigate }) {
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

  const transaksiTerbaru = keuanganTransaksi.slice(0, 6);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <BreakdownPengeluaran total={breakdown.total} data={breakdown.data} />

        <div className="rounded-xl border border-slate-800 overflow-hidden">
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
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Transaksi Terbaru</div>
          <button
            onClick={() => onNavigate && onNavigate("keuangan", "transaksi")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Kelola Keuangan <ArrowRight size={12} />
          </button>
        </div>
        {transaksiTerbaru.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada transaksi keuangan." /></div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {transaksiTerbaru.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{t.tanggal}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={t.tipe === "masuk" ? "emerald" : t.tipe === "keluar" ? "red" : "sky"}>
                      {t.tipe === "masuk" ? "Masuk" : t.tipe === "keluar" ? "Keluar" : "Transfer"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {t.keterangan || labelDari(master[t.tipe === "keluar" ? "kategori_keluar" : "kategori_masuk"], t.kategori) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{labelDari(master.rekening, t.rekening)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${t.tipe === "masuk" ? "text-emerald-400" : t.tipe === "keluar" ? "text-red-400" : "text-slate-300"}`}>
                    {fmtRp(t.jumlah)}
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

function DashboardGudang({ stageCounts, skuCount, totalStok, rakCount, rakKosong, items, onNavigate, setModal }) {
  const recent = items.slice(0, 6);
  const daftarRakKosong = rakKosong || [];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total SKU" value={skuCount} icon={Tag} />
        <StatCard label="Total Stok" value={totalStok.toLocaleString("id-ID")} icon={Boxes} />
        <StatCard label="Rak Terpakai" value={rakCount} icon={MapPin} />
        <StatCard label="Rak Kosong" value={daftarRakKosong.length} accent="text-emerald-400" icon={PackageCheck} iconColor="text-emerald-500" />
        <StatCard label="Barang Aktif" value={items.filter((i) => i.stage !== "selesai").length} icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {STAGE_ORDER.map((s) => {
          const meta = STAGE_META[s];
          const c = COLOR[meta.color];
          const Icon = meta.icon;
          return (
            <button
              key={s}
              onClick={() => onNavigate && onNavigate("data-barang", "semua")}
              className={`rounded-xl border border-slate-800 p-3 text-left ${c.bg} hover:brightness-110 transition`}
            >
              <Icon size={16} className={c.text} />
              <div className="text-xl font-bold mt-2">{stageCounts[s]}</div>
              <div className="text-[11px] text-slate-400">{meta.label}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Barang terbaru</div>
        {recent.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada barang masuk." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((i) => {
                const meta = STAGE_META[i.stage];
                const c = COLOR[meta.color];
                return (
                  <tr key={i.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5">
                      {i.foto_url ? (
                        <img
                          src={i.foto_url}
                          alt={i.sku || "foto barang"}
                          onClick={() => setModal({ type: "lihat-foto", item: i })}
                          className="w-10 h-10 object-cover rounded-md border border-slate-800 cursor-pointer hover:opacity-80"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                          <Camera size={14} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{i.tanggal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{i.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-400">{i.jumlah}x</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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