import { ShoppingBag, CheckCircle2 } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtTgl } from "../lib/api";

export default function Marketplace({ sub, items, quickAdvance, setModal }) {
  if (sub === "sudah") return <SudahUpload items={items} />;
  if (sub === "riwayat") return <RiwayatUpload items={items} />;
  return <BelumUpload items={items} quickAdvance={quickAdvance} setModal={setModal} />;
}

function BelumUpload({ items, quickAdvance, setModal }) {
  const list = items.filter((i) => i.stage === "marketplace");
  return (
    <div>
      <PageHeader
        title="Belum Upload"
        description="Barang yang sudah lolos verifikasi foto dan siap diupload ke marketplace. Klik foto untuk memperbesar, atau tombol Detail untuk lihat info lengkap, download foto, atau kembalikan ke Pemotretan kalau ada yang salah."
      />
      {list.length === 0 ? (
        <EmptyState label="Semua barang sudah diupload." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              {item.foto_url ? (
                <img
                  src={item.foto_url}
                  alt={item.sku}
                  onClick={() => setModal({ type: "lihat-foto", item })}
                  className="w-full h-24 object-cover rounded-md mb-2 border border-slate-800 cursor-zoom-in hover:opacity-90"
                />
              ) : (
                <div className="w-full h-24 rounded-md mb-2 border border-dashed border-slate-700" />
              )}
              <ShoppingBag size={14} className="text-teal-400 mb-1" />
              <div className="text-xs font-mono text-slate-300 truncate">{item.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.jumlah}x</div>
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={() => setModal({ type: "detail-item", item })}
                  className="flex-1 text-[11px] font-medium border border-slate-700 hover:border-slate-600 text-slate-300 rounded-md py-1.5"
                >
                  Detail
                </button>
                <button
                  onClick={() => quickAdvance(item, "marketplace")}
                  className="flex-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
                >
                  Sudah upload →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SudahUpload({ items }) {
  const list = items.filter((i) => i.marketplace_status === "sudah");
  return (
    <div>
      <PageHeader title="Sudah Upload" description="Barang yang sudah berhasil diupload ke marketplace." />
      {list.length === 0 ? (
        <EmptyState label="Belum ada barang yang diupload." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">Waktu Upload</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-2.5">{i.jumlah}x</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtTgl(i.marketplace_uploaded_at)}</td>
                  <td className="px-4 py-2.5">
                    <Badge color="emerald">Selesai</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RiwayatUpload({ items }) {
  const list = items
    .filter((i) => i.marketplace_uploaded_at)
    .sort((a, b) => new Date(b.marketplace_uploaded_at) - new Date(a.marketplace_uploaded_at));
  return (
    <div>
      <PageHeader title="Riwayat Upload" description="Semua histori upload ke marketplace, terbaru di atas." />
      {list.length === 0 ? (
        <EmptyState label="Belum ada riwayat upload." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {list.map((i, idx) => (
            <div
              key={i.id}
              className={`flex items-center justify-between px-4 py-2.5 ${idx % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="font-mono text-xs text-slate-300">{i.sku}</span>
                <span className="text-[11px] text-slate-500">{i.jumlah}x</span>
              </div>
              <span className="text-[11px] text-slate-500">{fmtTgl(i.marketplace_uploaded_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}