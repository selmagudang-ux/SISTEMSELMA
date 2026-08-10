import { useState } from "react";
import { Search, Camera, Trash2 } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { STAGE_META } from "../lib/constants";

export default function DataBarang({ sub, items, setModal }) {
  const [q, setQ] = useState("");

  const label = sub === "semua" ? "Semua Barang" : sub === "baru" ? "Barang Baru" : "Barang Lama";
  const bySub = sub === "semua" ? items : items.filter((i) => i.status === sub);
  const filtered = bySub.filter((i) => {
    const s = q.toLowerCase();
    if (!s) return true;
    return (
      (i.sku || "").toLowerCase().includes(s) ||
      (i.gudang || "").toLowerCase().includes(s) ||
      (i.rak_code || "").toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title={`Data Barang — ${label}`}
        description="Cari dan lihat detail semua barang yang tercatat di sistem."
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU, gudang, atau rak…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label="Tidak ada barang yang cocok." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Foto</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Rak</th>
                <th className="px-4 py-2.5">Tahap</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const meta = STAGE_META[i.stage];
                return (
                  <tr
                    key={i.id}
                    className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/50 cursor-pointer"
                    onClick={() => setModal({ type: "detail-item", item: i })}
                  >
                    <td className="px-4 py-2.5">
                      {i.foto_url ? (
                        <img src={i.foto_url} alt={i.sku} className="w-9 h-9 object-cover rounded-md border border-slate-800" />
                      ) : (
                        <div className="w-9 h-9 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                          <Camera size={13} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{i.tanggal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{i.sku || "—"}</td>
                    <td className="px-4 py-2.5">{i.jumlah}x</td>
                    <td className="px-4 py-2.5 text-slate-400 capitalize">{i.status}</td>
                    <td className="px-4 py-2.5 text-slate-400">{i.rak_code || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ type: "hapus-item", item: i });
                        }}
                        title="Hapus barang"
                        className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}