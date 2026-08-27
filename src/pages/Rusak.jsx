import { useState } from "react";
import { Search, Download, Trash2, AlertTriangle, X, Receipt } from "lucide-react";
import { PageHeader, EmptyState, formatTanggalID } from "../components/ui";
import { downloadCsv, fmtTgl, detailModelPesanan, fmtRp } from "../lib/api";

// Modal rincian bon — dibuka saat kode bon di kolom "Dari Bon" diklik.
// Menampilkan foto bon fisiknya beserta rincian tiap model yang ada di
// transaksi barang datang itu, supaya gampang dicocokkan dengan catatan
// rusak yang sedang dilihat.
function DetailBonModal({ pesanan, kodeBon, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h3 className="font-semibold text-sm font-mono text-amber-400">{kodeBon}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {!pesanan ? (
            <div className="text-sm text-slate-500">
              Riwayat transaksi Barang Datang untuk bon ini tidak ditemukan (mungkin catatan lama sebelum kode bon
              dipakai, atau sudah dihapus).
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Tanggal</div>
                    <div className="text-slate-300">{formatTanggalID(pesanan.tanggal_pesan)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Supplier</div>
                    <div className="text-slate-300">{pesanan.supplier || "—"}</div>
                  </div>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-slate-500">
                      <th className="pb-1.5 pr-4">Model</th>
                      <th className="pb-1.5 pr-4">Qty Rusak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailModelPesanan(pesanan).map((m, idx) => (
                      <tr key={idx} className="border-t border-slate-800/60">
                        <td className="py-1.5 pr-4 text-slate-300">{m.nama || `Model ${idx + 1}`}</td>
                        <td className="py-1.5 pr-4">
                          {Number(m.rusak) > 0 ? (
                            <span className="text-red-400" title={m.alasan_rusak || ""}>
                              {m.rusak}x{m.alasan_rusak ? ` — ${m.alasan_rusak}` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}                  </tbody>
                </table>
              </div>

              <div className="shrink-0 sm:w-40">
                <div className="text-[10px] uppercase text-slate-500 mb-1.5">Foto Bon</div>
                {pesanan.foto_bon_url ? (
                  <a
                    href={pesanan.foto_bon_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full sm:w-40 h-40 rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500"
                    title="Buka foto ukuran penuh"
                  >
                    <img src={pesanan.foto_bon_url} alt="Foto bon" className="w-full h-full object-cover" />
                  </a>
                ) : (
                  <div className="w-full sm:w-40 h-40 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                    <Receipt size={20} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Halaman "Barang Reject" (dulu "Rusak") — daftar barang yang rusak, otomatis
// tercatat di sini begitu SKU-nya dibuat (lihat ModalRouter "buat-sku"): qty
// rusak yang sudah dicatat sejak Barang Datang baru resmi punya SKU setelah
// tahap ini, jadi baru muncul di menu ini begitu SKU sudah diketahui. Qty
// rusak TIDAK pernah ikut masuk stok — ini murni catatan/riwayat. Sekarang
// ditampilkan sebagai sub-menu di dalam "SKU & Harga" (bukan menu top-level
// terpisah lagi).
export default function Rusak({ barangRusak, pesananMasuk, setModal }) {
  const [q, setQ] = useState("");
  const [detailBon, setDetailBon] = useState(null);

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
        { key: "kode_bon", label: "Dari Bon" },
        { key: "catatan", label: "Catatan" },
      ],
      list.map((r) => ({
        tanggal: fmtTgl(r.created_at),
        sku: r.sku,
        qty: r.qty,
        kode_bon: r.kode_bon || "",
        catatan: r.catatan || "",
      }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Barang Reject"
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
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5">Tanggal</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Qty Rusak</th>
                  <th className="px-4 py-2.5">Dari Bon</th>
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
                    <td className="px-4 py-2.5 font-mono text-[11px]">
                      {r.kode_bon ? (
                        <button
                          onClick={() => setDetailBon(r.kode_bon)}
                          className="text-amber-400 hover:text-amber-300 hover:underline"
                          title="Lihat rincian bon ini"
                        >
                          {r.kode_bon}
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
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

      {detailBon && (
        <DetailBonModal
          kodeBon={detailBon}
          pesanan={(pesananMasuk || []).find((p) => p.kode_bon === detailBon) || null}
          onClose={() => setDetailBon(null)}
        />
      )}
    </div>
  );
}