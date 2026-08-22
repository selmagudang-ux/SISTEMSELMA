import { useState } from "react";
import { Plus, PackageCheck, Ban, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader, EmptyState, Badge, formatTanggalID } from "../components/ui";
import { PO_STATUS_META } from "../lib/constants";
import { statusPesananMasuk, detailModelPesanan, fmtRp } from "../lib/api";

// Nilai (Rp) satu baris model = jumlah dipesan x harga/pcs-nya. Dipakai baik
// di rincian per-model maupun ringkasan total per pesanan di tabel utama.
const nilaiModel = (m) => (Number(m.jumlah) || 0) * (Number(m.harga) || 0);
const totalNilaiPesanan = (detail) => detail.reduce((sum, m) => sum + nilaiModel(m), 0);

// Warna badge jenis pesanan — sama seperti jenis di Barang Masuk (Pembelian/
// Retur/Lainnya) supaya konsisten secara visual di seluruh sistem.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

// Ringkasan singkat daftar nama model, dipakai di kolom "Model" supaya tabel
// tidak perlu diperlebar — nama lengkap per model tetap bisa dilihat dengan
// membuka baris (lihat DetailModelPanel).
function ringkasNamaModel(detail) {
  const nama = detail.map((m, i) => m.nama || `Model ${i + 1}`);
  const joined = nama.join(", ");
  return joined.length > 42 ? joined.slice(0, 42) + "…" : joined;
}

function DetailModelPanel({ detail, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="bg-slate-900/50 px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-slate-500">
              <th className="pb-1.5 pr-4">Model</th>
              <th className="pb-1.5 pr-4">Qty</th>
              <th className="pb-1.5 pr-4">Status</th>
              <th className="pb-1.5 pr-4">Harga/pcs</th>
              <th className="pb-1.5">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {detail.map((m, idx) => (
              <tr key={idx} className="border-t border-slate-800/60">
                <td className="py-1.5 pr-4 text-slate-300">{m.nama || `Model ${idx + 1}`}</td>
                <td className="py-1.5 pr-4 text-slate-400">{m.jumlah}x</td>
                <td className={`py-1.5 pr-4 ${m.datang ? "text-emerald-400" : "text-amber-400"}`}>
                  {m.datang ? "Sudah Datang" : "Menunggu"}
                </td>
                <td className="py-1.5 pr-4 text-slate-400">{m.harga ? fmtRp(m.harga) : "—"}</td>
                <td className="py-1.5 text-slate-300">{m.harga ? fmtRp(nilaiModel(m)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export default function BarangDatang({ pesananMasuk, setModal }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const list = [...pesananMasuk].sort((a, b) => (a.tanggal_pesan < b.tanggal_pesan ? 1 : -1));
  const aktif = list.filter((p) => statusPesananMasuk(p) === "menunggu" || statusPesananMasuk(p) === "sebagian");
  const riwayat = list.filter((p) => statusPesananMasuk(p) === "selesai" || statusPesananMasuk(p) === "batal");

  return (
    <div>
      <PageHeader
        title="Barang Datang"
        description="Catat pesanan ke supplier di sini dulu, sebelum barangnya fisik tiba. Begitu barang datang (bisa sekaligus atau bertahap), konfirmasi di sini — otomatis lanjut ke Barang Masuk & alur SKU seperti biasa."
        action={
          <button
            onClick={() => setModal({ type: "pesanan-masuk" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Pesanan
          </button>
        }
      />

      <h2 className="text-xs font-semibold uppercase text-slate-500 mb-2">Pesanan Aktif</h2>
      {aktif.length === 0 ? (
        <EmptyState label="Tidak ada pesanan yang sedang ditunggu." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto mb-6">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5"></th>
                <th className="px-4 py-2.5">Tanggal Pesan</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Qty Dipesan</th>
                <th className="px-4 py-2.5">Qty Datang</th>
                <th className="px-4 py-2.5">Nilai</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {aktif.map((p) => {
                const status = statusPesananMasuk(p);
                const meta = PO_STATUS_META[status];
                const detail = detailModelPesanan(p);
                const nilai = totalNilaiPesanan(detail);
                const sisa = p.jumlah_pesan - (p.jumlah_diterima || 0);
                const isOpen = expanded.has(p.id);
                return (
                  <>
                    <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="pl-3">
                        <button
                          onClick={() => toggle(p.id)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Lihat rincian per model"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{formatTanggalID(p.tanggal_pesan)}</td>
                      <td className="px-4 py-2.5 text-slate-300">{p.supplier || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        <button onClick={() => toggle(p.id)} className="text-left hover:text-slate-200">
                          {detail.length} model
                          <span className="block text-slate-600 text-[11px]">{ringkasNamaModel(detail)}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5">{p.jumlah_pesan}x</td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {p.jumlah_diterima || 0}x <span className="text-slate-600">(sisa {sisa}x)</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{nilai ? fmtRp(nilai) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={meta.color}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setModal({ type: "konfirmasi-datang", item: p })}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 mr-3"
                        >
                          <PackageCheck size={13} /> Konfirmasi Datang
                        </button>
                        <button
                          onClick={() => setModal({ type: "batalkan-pesanan", item: p })}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-400"
                        >
                          <Ban size={13} /> Batalkan
                        </button>
                      </td>
                    </tr>
                    {isOpen && <DetailModelPanel key={`${p.id}-detail`} detail={detail} colSpan={10} />}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-xs font-semibold uppercase text-slate-500 mb-2">Riwayat</h2>
      {riwayat.length === 0 ? (
        <EmptyState label="Belum ada pesanan yang selesai atau dibatalkan." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5"></th>
                <th className="px-4 py-2.5">Tanggal Pesan</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Qty Dipesan</th>
                <th className="px-4 py-2.5">Qty Diterima</th>
                <th className="px-4 py-2.5">Nilai</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((p) => {
                const meta = PO_STATUS_META[statusPesananMasuk(p)];
                const detail = detailModelPesanan(p);
                const nilai = totalNilaiPesanan(detail);
                const isOpen = expanded.has(p.id);
                return (
                  <>
                    <tr key={p.id} className="border-b border-slate-800/60 last:border-0 text-slate-400">
                      <td className="pl-3">
                        <button
                          onClick={() => toggle(p.id)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Lihat rincian per model"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(p.tanggal_pesan)}</td>
                      <td className="px-4 py-2.5">{p.supplier || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggle(p.id)} className="text-left hover:text-slate-200">
                          {detail.length} model
                          <span className="block text-slate-600 text-[11px]">{ringkasNamaModel(detail)}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5">{p.jumlah_pesan}x</td>
                      <td className="px-4 py-2.5">{p.jumlah_diterima || 0}x</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{nilai ? fmtRp(nilai) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={meta.color}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setModal({ type: "hapus-pesanan-masuk", item: p })}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-400"
                          title="Hapus riwayat pesanan ini"
                        >
                          <Trash2 size={13} /> Hapus
                        </button>
                      </td>
                    </tr>
                    {isOpen && <DetailModelPanel key={`${p.id}-detail`} detail={detail} colSpan={10} />}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}