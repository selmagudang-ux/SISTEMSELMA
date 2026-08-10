import { useState } from "react";
import { Search, Boxes } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtRp } from "../lib/api";

export default function SkuHarga({ sub, items, skuMaster, setModal }) {
  if (sub === "buat") return <BuatSkuList items={items} setModal={setModal} />;
  if (sub === "master-harga") return <MasterHarga skuMaster={skuMaster} />;
  return <MasterSku skuMaster={skuMaster} setModal={setModal} />;
}

function BuatSkuList({ items, setModal }) {
  const belumSku = items.filter((i) => i.stage === "sku");
  return (
    <div>
      <PageHeader
        title="Buat SKU"
        description="Barang baru yang belum punya SKU akan membuat SKU baru. Barang lama tinggal ditambahkan ke SKU yang sudah ada."
      />
      {belumSku.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu pembuatan SKU." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {belumSku.map((item) => {
            const isLama = item.status === "lama";
            return (
              <button
                key={item.id}
                onClick={() => setModal({ type: isLama ? "tambah-sku-lama" : "advance-sku", item })}
                className="text-left bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-lg p-3 transition"
              >
                <Boxes size={16} className="text-amber-400 mb-2" />
                <div className="text-xs font-mono text-slate-300">#{item.id.slice(0, 8)}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {item.jumlah}x · {item.status} · {item.tanggal}
                </div>
                <div className="mt-2 text-[11px] font-medium text-amber-400">
                  {isLama ? "Tambah ke SKU →" : "Buat SKU →"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MasterSku({ skuMaster, setModal }) {
  const [q, setQ] = useState("");
  const filtered = skuMaster.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Master SKU" description="Semua kode SKU yang pernah dibuat, lengkap dengan stok dan harga." />
      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>
      <div className="rounded-xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5">Stok</th>
              <th className="px-4 py-2.5">Harga Asli</th>
              <th className="px-4 py-2.5">HPP</th>
              <th className="px-4 py-2.5">Grosir</th>
              <th className="px-4 py-2.5">Tengah</th>
              <th className="px-4 py-2.5">Ecer</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Belum ada SKU.</td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => setModal({ type: "detail-sku", item: s })}
                className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/50 cursor-pointer"
              >
                <td className="px-4 py-2.5 font-mono text-xs">{s.sku}</td>
                <td className="px-4 py-2.5">
                  {s.stok <= 0 ? <Badge color="red">Habis</Badge> : s.stok}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{fmtRp(s.harga_asli)}</td>
                <td className="px-4 py-2.5 text-slate-400">{fmtRp(s.hpp)}</td>
                <td className="px-4 py-2.5">{fmtRp(s.grosir)}</td>
                <td className="px-4 py-2.5">{fmtRp(s.tengah)}</td>
                <td className="px-4 py-2.5 font-semibold text-amber-400">{fmtRp(s.ecer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MasterHarga({ skuMaster }) {
  const [q, setQ] = useState("");
  const filtered = skuMaster.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader
        title="Master Harga"
        description="Daftar harga jual per SKU (Grosir / Tengah / Ecer). Untuk ubah persentase markup, buka menu Pengaturan."
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
      {filtered.length === 0 ? (
        <EmptyState label="Belum ada data harga." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="font-mono text-xs text-slate-300 mb-3">{s.sku}</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 text-xs">Grosir</span>
                  <span className="text-slate-200">{fmtRp(s.grosir)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 text-xs">Tengah</span>
                  <span className="text-slate-200">{fmtRp(s.tengah)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1.5">
                  <span className="text-slate-500 text-xs">Ecer</span>
                  <span className="text-amber-400 font-semibold">{fmtRp(s.ecer)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}