import { useState } from "react";
import { Search, Camera, Download, Plus } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { STAGE_META } from "../lib/constants";
import { downloadCsv } from "../lib/api";
import { rakForSku } from "./Rak";

// Warna badge untuk jenis barang masuk (field "gudang" di tabel items menyimpan
// nilai Pembelian/Retur/Lainnya, lihat BarangMasukForm) — dipetakan ke warna
// yang konsisten dengan dropdown pilihan jenisnya.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

export default function DataBarang({ items, penempatan, setModal }) {
  const [q, setQ] = useState("");

  // Kode rak diambil dari data penempatan terbaru (sumber yang sama dengan Peta Rak),
  // BUKAN dari field items.rak_code yang bisa basi kalau SKU-nya sudah dipindah rak.
  const rakSaatIni = (i) => rakForSku(i.sku, penempatan);
  const filtered = items.filter((i) => {
    const s = q.toLowerCase();
    if (!s) return true;
    return (
      (i.sku || "").toLowerCase().includes(s) ||
      (i.barcode_supplier || "").toLowerCase().includes(s) ||
      (i.gudang || "").toLowerCase().includes(s) ||
      rakSaatIni(i).toLowerCase().includes(s)
    );
  });

  const handleDownload = () => {
    downloadCsv(
      `data-barang-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "tanggal", label: "Tanggal" },
        { key: "sku", label: "SKU" },
        { key: "barcode_supplier", label: "Model/Barcode Supplier" },
        { key: "jumlah", label: "Jumlah" },
        { key: "jenis", label: "Jenis" },
        { key: "rak", label: "Rak" },
        { key: "tahap", label: "Tahap" },
      ],
      filtered.map((i) => ({
        tanggal: i.tanggal,
        sku: i.sku || "",
        barcode_supplier: i.barcode_supplier || "",
        jumlah: i.jumlah,
        jenis: i.gudang || "",
        rak: rakSaatIni(i) || "",
        tahap: STAGE_META[i.stage]?.label || i.stage,
      }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Alur Barang"
        description="Cari dan lihat detail semua barang yang tercatat di sistem."
        sticky
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              <Download size={14} /> Download CSV
            </button>
            <button
              onClick={() => setModal({ type: "barang-masuk" })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Barang Masuk
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU, model/barcode supplier, jenis, atau rak…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label="Tidak ada barang yang cocok." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Foto</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Model/Barcode Supplier</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Rak</th>
                <th className="px-4 py-2.5">Tahap</th>
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
                        <img src={i.foto_url} alt={i.sku} loading="lazy" decoding="async" className="w-9 h-9 object-cover rounded-md border border-slate-800" />
                      ) : (
                        <div className="w-9 h-9 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                          <Camera size={13} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{i.tanggal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{i.sku || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{i.barcode_supplier || "—"}</td>
                    <td className="px-4 py-2.5">
                      {i.jumlah}x
                      {i.jumlah_rusak > 0 && i.stage === "sku" && (
                        <span className="block text-[10px] text-red-400">termasuk {i.jumlah_rusak}x rusak</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {i.gudang ? <Badge color={jenisColor(i.gudang)}>{i.gudang}</Badge> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{rakSaatIni(i) || "—"}</td>
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