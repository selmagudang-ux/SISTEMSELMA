import { Plus, PackageCheck, Ban } from "lucide-react";
import { PageHeader, EmptyState, Badge, formatTanggalID } from "../components/ui";
import { PO_STATUS_META } from "../lib/constants";
import { statusPesananMasuk } from "../lib/api";

// Warna badge jenis pesanan — sama seperti jenis di Barang Masuk (Pembelian/
// Retur/Lainnya) supaya konsisten secara visual di seluruh sistem.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

export default function BarangDatang({ pesananMasuk, setModal }) {
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
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Tanggal Pesan</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Model Dipesan</th>
                <th className="px-4 py-2.5">Model Datang</th>
                <th className="px-4 py-2.5">Qty Dipesan</th>
                <th className="px-4 py-2.5">Qty Datang</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {aktif.map((p) => {
                const status = statusPesananMasuk(p);
                const meta = PO_STATUS_META[status];
                const sisa = p.jumlah_pesan - (p.jumlah_diterima || 0);
                const sisaModel = p.jumlah_model - (p.jumlah_model_diterima || 0);
                return (
                  <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{formatTanggalID(p.tanggal_pesan)}</td>
                    <td className="px-4 py-2.5 text-slate-300">{p.supplier || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">{p.jumlah_model} model</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {p.jumlah_model_diterima || 0} model <span className="text-slate-600">(sisa {sisaModel})</span>
                    </td>
                    <td className="px-4 py-2.5">{p.jumlah_pesan}x</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {p.jumlah_diterima || 0}x <span className="text-slate-600">(sisa {sisa}x)</span>
                    </td>
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
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Tanggal Pesan</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Model Dipesan</th>
                <th className="px-4 py-2.5">Model Diterima</th>
                <th className="px-4 py-2.5">Qty Dipesan</th>
                <th className="px-4 py-2.5">Qty Diterima</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((p) => {
                const meta = PO_STATUS_META[statusPesananMasuk(p)];
                return (
                  <tr key={p.id} className="border-b border-slate-800/60 last:border-0 text-slate-400">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(p.tanggal_pesan)}</td>
                    <td className="px-4 py-2.5">{p.supplier || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">{p.jumlah_model} model</td>
                    <td className="px-4 py-2.5">{p.jumlah_model_diterima || 0} model</td>
                    <td className="px-4 py-2.5">{p.jumlah_pesan}x</td>
                    <td className="px-4 py-2.5">{p.jumlah_diterima || 0}x</td>
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