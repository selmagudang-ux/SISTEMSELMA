import { useState } from "react";
import { Search, Download, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { downloadCsv, fmtTgl } from "../lib/api";

// Halaman "Rusak" — daftar barang yang rusak, otomatis tercatat di sini
// begitu SKU-nya dibuat (lihat ModalRouter "buat-sku"): qty rusak yang sudah
// dicatat sejak Barang Datang baru resmi punya SKU setelah tahap ini, jadi
// baru muncul di menu ini begitu SKU sudah diketahui. Qty rusak TIDAK pernah
// ikut masuk stok — ini murni catatan/riwayat.
export default function Rusak({ barangRusak, setModal }) {
  const [q, setQ] = useState("");

  const list = [...(barangRusak || [])]
    .filter((r) => (r.sku || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const totalQty = list.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);

  const handleDownload = () => {
    downloadCsv(
      `rusak-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "tanggal", label: "Tanggal" },
        { key: "sku", label: "SKU" },
        { key: "qty", label: "Qty Rusak" },
        { key: "catatan", label: "Catatan" },
      ],
      list.map((r) => ({ tanggal: fmtTgl(r.created_at), sku: r.sku, qty: r.qty, catatan: r.catatan || "" }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Rusak"
        description="Barang yang tercatat rusak sejak Barang Datang — otomatis dipisahkan dari stok begitu SKU-nya dibuat."
        action={
          <button
            onClick={handleDownload}
            disabled={list.length === 0}
            className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Download CSV
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState label="Belum ada barang rusak yang tercatat." />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs text-red-400">
            <AlertTriangle size={13} /> Total {totalQty}x rusak dari {list.length} catatan
          </div>
          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5">Tanggal</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Qty Rusak</th>
                  <th className="px-4 py-2.5">Catatan</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 text-xs">{fmtTgl(r.created_at)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                    <td className="px-4 py-2.5 text-red-400 font-semibold">{r.qty}x</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.catatan || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setModal({ type: "hapus-barang-rusak", item: r })}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-400"
                        title="Hapus catatan ini"
                      >
                        <Trash2 size={13} /> Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}