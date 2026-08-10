import { PageHeader, StatCard, EmptyState } from "../components/ui";
import { STAGE_ORDER, STAGE_META, COLOR } from "../lib/constants";
import { fmtRp } from "../lib/api";

export default function Laporan({ items, skuMaster, rak }) {
  const totalStok = skuMaster.reduce((a, s) => a + (s.stok || 0), 0);
  const totalNilaiEcer = skuMaster.reduce((a, s) => a + (s.stok || 0) * (s.ecer || 0), 0);
  const belumUpload = items.filter((i) => i.stage === "marketplace").length;
  const sudahUpload = items.filter((i) => i.marketplace_status === "sudah").length;

  const topStok = [...skuMaster].sort((a, b) => (b.stok || 0) - (a.stok || 0)).slice(0, 5);

  return (
    <div>
      <PageHeader title="Laporan" description="Ringkasan performa gudang berdasarkan data terkini." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total SKU" value={skuMaster.length} />
        <StatCard label="Total Stok" value={totalStok.toLocaleString("id-ID")} />
        <StatCard label="Estimasi Nilai Stok (Ecer)" value={fmtRp(totalNilaiEcer)} accent="text-amber-400" />
        <StatCard label="Total Rak Terpakai" value={rak.length} />
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
            <StatCard label="Belum Upload" value={belumUpload} />
            <StatCard label="Sudah Upload" value={sudahUpload} accent="text-emerald-400" />
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
