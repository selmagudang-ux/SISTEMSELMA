import { useState } from "react";
import { PageHeader, StatCard, EmptyState } from "../components/ui";
import { STAGE_ORDER, STAGE_META, COLOR } from "../lib/constants";
import {
  fmtRp,
  sisaHutangPesanan,
  saldoDepositPelanggan,
  ringkasanKeuangan,
  saldoPerRekening,
  breakdownPengeluaranKategori,
} from "../lib/api";
import { BreakdownPengeluaran } from "./Keuangan";
import {
  Tag, Boxes, Wallet, MapPin, Upload, UploadCloud, Warehouse, ShoppingCart,
  TrendingUp, TrendingDown, Users, Landmark, ArrowRight,
} from "lucide-react";

// Tab kecil di atas Laporan — pisahkan ringkasan Gudang vs Grosir vs Keuangan
// supaya masing-masing tetap fokus (angka gudang tidak nyampur sama angka
// grosir/keuangan), tapi tetap satu halaman "Laporan" seperti sebelumnya,
// bukan menu terpisah.
const TABS = [
  { key: "gudang", label: "Laporan Gudang", icon: Warehouse },
  { key: "grosir", label: "Laporan Grosir", icon: ShoppingCart },
  { key: "keuangan", label: "Laporan Keuangan", icon: Wallet },
];

export default function Laporan({
  items,
  skuMaster,
  rak,
  pesananGrosir = [],
  pembayaranGrosir = [],
  depositGrosir = [],
  pelangganGrosir = [],
  keuanganTransaksi = [],
  master = {},
  onNavigate,
}) {
  const [tab, setTab] = useState("gudang");

  return (
    <div>
      <PageHeader
        title="Laporan"
        description={
          tab === "grosir"
            ? "Ringkasan penjualan, piutang, dan deposit grosir berdasarkan data terkini."
            : tab === "keuangan"
            ? "Ringkasan kas masuk, kas keluar, dan laba/rugi tahun berjalan."
            : "Ringkasan performa gudang berdasarkan data terkini."
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
        <LaporanGudang items={items} skuMaster={skuMaster} rak={rak} />
      ) : tab === "grosir" ? (
        <LaporanGrosir
          pesananGrosir={pesananGrosir}
          pembayaranGrosir={pembayaranGrosir}
          depositGrosir={depositGrosir}
          pelangganGrosir={pelangganGrosir}
        />
      ) : (
        <LaporanKeuangan keuanganTransaksi={keuanganTransaksi} master={master} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function LaporanKeuangan({ keuanganTransaksi, master, onNavigate }) {
  const tahunIni = new Date().getFullYear();
  const ringkasanTahunIni = ringkasanKeuangan(keuanganTransaksi, `${tahunIni}-01-01`, `${tahunIni}-12-31`);
  const saldoRekening = saldoPerRekening(keuanganTransaksi, master.rekening || []);
  const totalSaldoKas = saldoRekening.reduce((a, r) => a + r.saldo, 0);
  const breakdown = breakdownPengeluaranKategori(ringkasanTahunIni.list, master.kategori_keluar || []);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Saldo Kas Saat Ini" value={fmtRp(totalSaldoKas)} accent="text-amber-400" icon={Landmark} iconColor="text-amber-500" />
        <StatCard label={`Kas Masuk ${tahunIni}`} value={fmtRp(ringkasanTahunIni.masuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label={`Kas Keluar ${tahunIni}`} value={fmtRp(ringkasanTahunIni.keluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard
          label={`Laba (Rugi) ${tahunIni}`}
          value={fmtRp(ringkasanTahunIni.saldo)}
          accent={ringkasanTahunIni.saldo >= 0 ? "text-emerald-400" : "text-red-400"}
          icon={Wallet}
          iconColor={ringkasanTahunIni.saldo >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

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

      <div className="rounded-xl border border-slate-800 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-200">Butuh rincian Laba Rugi per bulan/tahun?</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Laporan Laba Rugi lengkap (per kategori, per bulan, siap cetak PDF/CSV) ada di menu Keuangan.
          </div>
        </div>
        <button
          onClick={() => onNavigate && onNavigate("keuangan", "laporan")}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3.5 py-2 rounded-lg whitespace-nowrap"
        >
          Lihat Laporan Laba Rugi <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function LaporanGudang({ items, skuMaster, rak }) {
  const totalStok = skuMaster.reduce((a, s) => a + (s.stok || 0), 0);
  const totalNilaiAsli = skuMaster.reduce((a, s) => a + (s.stok || 0) * (s.harga_asli || 0), 0);
  const belumUpload = items.filter((i) => i.stage === "marketplace").length;
  const sudahUpload = items.filter((i) => i.marketplace_status === "sudah").length;

  const topStok = [...skuMaster].sort((a, b) => (b.stok || 0) - (a.stok || 0)).slice(0, 5);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total SKU" value={skuMaster.length} icon={Tag} />
        <StatCard label="Total Stok" value={totalStok.toLocaleString("id-ID")} icon={Boxes} />
        <StatCard label="Estimasi Nilai Stok (Harga Asli)" value={fmtRp(totalNilaiAsli)} accent="text-amber-400" icon={Wallet} iconColor="text-amber-500" />
        <StatCard label="Total Rak Terpakai" value={rak.length} icon={MapPin} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Barang per Tahap</div>
          <div className="p-4 space-y-2">
            {STAGE_ORDER.map((s) => {
              const meta = STAGE_META[s];
              const c = COLOR[meta.color];
              const count = items.filter((i) => i.stage === s).length;
              const pct = items.length ? Math.round((count / items.length) * 100) : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{meta.label}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${c.solid}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Ringkasan Marketplace</div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <StatCard label="Belum Upload" value={belumUpload} icon={Upload} />
            <StatCard label="Sudah Upload" value={sudahUpload} accent="text-emerald-400" icon={UploadCloud} iconColor="text-emerald-500" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">5 SKU dengan Stok Terbanyak</div>
        {topStok.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada data SKU." /></div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {topStok.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{s.sku}</td>
                  <td className="px-4 py-2.5 text-slate-400">{fmtRp(s.ecer)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{s.stok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Ringkasan grosir: dihitung dari SEMUA pesanan (bukan cuma hari ini, beda
// dengan Dashboard Grosir yang fokus ke hari berjalan) — supaya Laporan
// menggambarkan performa keseluruhan sejak awal, cocok dipakai untuk rekap.
function LaporanGrosir({ pesananGrosir, pembayaranGrosir, depositGrosir, pelangganGrosir }) {
  const pesananAktif = pesananGrosir.filter((p) => p.status !== "Batal");
  const totalOmset = pesananAktif.reduce((a, p) => a + (Number(p.total) || 0), 0);
  const totalPiutang = pesananAktif.reduce((a, p) => a + sisaHutangPesanan(p, pembayaranGrosir), 0);
  const totalDeposit = depositGrosir.reduce((a, d) => a + (Number(d.jumlah) || 0), 0);
  const pesananBatal = pesananGrosir.length - pesananAktif.length;

  const namaPelanggan = (id) => pelangganGrosir.find((c) => c.id === id)?.nama || "—";

  // Breakdown status bayar (Lunas / Sebagian / Belum Bayar), pola sama seperti
  // "Barang per Tahap" di Laporan Gudang supaya konsisten gaya visualnya.
  const statusList = ["Lunas", "Sebagian", "Belum Bayar"];
  const statusColor = { Lunas: "emerald", Sebagian: "sky", "Belum Bayar": "amber" };

  // Top 5 pelanggan berdasarkan total omset (dari pesanan aktif).
  const omsetPerPelanggan = {};
  pesananAktif.forEach((p) => {
    omsetPerPelanggan[p.pelanggan_id] = (omsetPerPelanggan[p.pelanggan_id] || 0) + (Number(p.total) || 0);
  });
  const topPelanggan = Object.entries(omsetPerPelanggan)
    .map(([id, total]) => ({ id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Omset" value={fmtRp(totalOmset)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Total Pesanan" value={pesananAktif.length} icon={ShoppingCart} />
        <StatCard label="Piutang Belum Lunas" value={fmtRp(totalPiutang)} accent="text-amber-400" icon={Wallet} iconColor="text-amber-500" />
        <StatCard label="Total Saldo Deposit" value={fmtRp(totalDeposit)} icon={Boxes} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Pesanan per Status Bayar</div>
          <div className="p-4 space-y-2">
            {statusList.map((s) => {
              const count = pesananAktif.filter((p) => p.status_bayar === s).length;
              const pct = pesananAktif.length ? Math.round((count / pesananAktif.length) * 100) : 0;
              const c = COLOR[statusColor[s]];
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{s}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${c.solid}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Ringkasan Pesanan</div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <StatCard label="Pesanan Aktif" value={pesananAktif.length} icon={ShoppingCart} />
            <StatCard label="Pesanan Dibatalkan" value={pesananBatal} icon={Users} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">5 Pelanggan dengan Omset Terbanyak</div>
        {topPelanggan.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada data pesanan grosir." /></div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {topPelanggan.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.id)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-right">
                    Saldo deposit: {fmtRp(saldoDepositPelanggan(p.id, depositGrosir))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmtRp(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}