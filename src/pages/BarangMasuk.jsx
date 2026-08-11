import { Plus } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { STAGE_META } from "../lib/constants";

export default function BarangMasuk({ items, setModal }) {
  const list = items;

  return (
    <div>
      <PageHeader
        title="Barang Masuk"
        description="Catat barang yang masuk ke gudang. Status baru/lama sudah tidak perlu dipilih di sini — nanti otomatis ditentukan lewat pencarian SKU saat pembuatan SKU."
        action={
          <button
            onClick={() => setModal({ type: "barang-masuk" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Barang Masuk
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState label="Belum ada catatan barang masuk." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">Gudang</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Tahap</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const meta = STAGE_META[i.stage];
                return (
                  <tr key={i.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{i.tanggal}</td>
                    <td className="px-4 py-2.5 text-slate-400">{i.gudang || "—"}</td>
                    <td className="px-4 py-2.5">{i.jumlah}x</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{i.sku || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={meta.color}>{meta.label}</Badge>
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