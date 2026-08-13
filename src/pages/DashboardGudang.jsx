import { Camera, MapPin, Tag, Boxes, PackageCheck, ClipboardList } from "lucide-react";
import { STAGE_ORDER, STAGE_META, COLOR } from "../lib/constants";
import { StatCard, PageHeader, EmptyState } from "../components/ui";

export default function DashboardGudang({ stageCounts, skuCount, totalStok, rakCount, rakKosong, items, onNavigate, setModal }) {
  const recent = items.slice(0, 6);
  const daftarRakKosong = rakKosong || [];
  return (
    <div>
      <PageHeader
        title="Dashboard Gudang"
        description="Ringkasan alur barang, stok, dan SKU di SELMA ACC BANDUNG."
      />

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

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Rak Kosong</div>
          <button
            onClick={() => onNavigate && onNavigate("rak", "peta")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
          >
            Lihat Peta Rak →
          </button>
        </div>
        {daftarRakKosong.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Tidak ada rak kosong — semua rak sedang terisi." />
          </div>
        ) : (
          <div className="p-4 flex flex-wrap gap-2">
            {daftarRakKosong.map((r) => (
              <span
                key={r.id}
                className="flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1.5"
              >
                <MapPin size={12} /> {r.code}
              </span>
            ))}
          </div>
        )}
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