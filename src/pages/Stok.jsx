import { useState } from "react";
import { Search, AlertTriangle, CheckCircle2, MinusCircle, Download } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtTgl, downloadCsv } from "../lib/api";

export default function Stok({ sub, skuMaster, penempatan, stockHistory, setModal }) {
  if (sub === "keluar") return <BarangKeluar skuMaster={skuMaster} setModal={setModal} />;
  if (sub === "hitung") return <HitungQty skuMaster={skuMaster} penempatan={penempatan} />;
  if (sub === "riwayat") return <RiwayatStok stockHistory={stockHistory} />;
  return <StokBarang skuMaster={skuMaster} />;
}

function StokBarang({ skuMaster }) {
  const [q, setQ] = useState("");
  const sorted = [...skuMaster]
    .filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.stok || 0) - (a.stok || 0));

  const handleDownload = () => {
    downloadCsv(
      `stok-barang-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "sku", label: "SKU" },
        { key: "stok", label: "Stok" },
      ],
      sorted
    );
  };

  return (
    <div>
      <PageHeader
        title="Stok Barang"
        description="Level stok terkini untuk setiap SKU."
        action={
          <button
            onClick={handleDownload}
            disabled={sorted.length === 0}
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
      {sorted.length === 0 ? (
        <EmptyState label="Belum ada data stok." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {sorted.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <span className="font-mono text-xs text-slate-300">{s.sku}</span>
              <div className="flex items-center gap-2">
                {s.stok <= 0 ? (
                  <Badge color="red">Habis</Badge>
                ) : s.stok < 5 ? (
                  <Badge color="amber">Menipis · {s.stok}</Badge>
                ) : (
                  <span className="text-sm font-semibold text-slate-200">{s.stok}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BarangKeluar({ skuMaster, setModal }) {
  const [q, setQ] = useState("");
  const sorted = [...skuMaster]
    .filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.stok || 0) - (a.stok || 0));

  return (
    <div>
      <PageHeader
        title="Barang Keluar"
        description="Catat pengurangan stok di luar alur Marketplace — misalnya terjual langsung, rusak, hilang, atau retur ke supplier."
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
      {sorted.length === 0 ? (
        <EmptyState label="Belum ada data stok." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {sorted.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div>
                <div className="font-mono text-xs text-slate-300">{s.sku}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Stok: {s.stok || 0}</div>
              </div>
              <button
                disabled={!s.stok || s.stok <= 0}
                onClick={() => setModal({ type: "barang-keluar", item: s })}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <MinusCircle size={13} /> Catat Keluar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HitungQty({ skuMaster, penempatan }) {
  const placedBySku = {};
  penempatan.forEach((p) => {
    placedBySku[p.sku] = (placedBySku[p.sku] || 0) + Number(p.qty || 0);
  });

  const rows = skuMaster.map((s) => {
    const placed = placedBySku[s.sku] || 0;
    const selisih = (s.stok || 0) - placed;
    return { ...s, placed, selisih };
  });

  return (
    <div>
      <PageHeader
        title="Hitung Qty"
        description="Bandingkan jumlah stok di Master SKU dengan total yang sudah ditempatkan di rak — untuk mengecek selisih."
      />
      {rows.length === 0 ? (
        <EmptyState label="Belum ada data untuk dihitung." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Stok Sistem</th>
                <th className="px-4 py-2.5">Ditempatkan di Rak</th>
                <th className="px-4 py-2.5">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                  <td className="px-4 py-2.5">{r.stok}</td>
                  <td className="px-4 py-2.5 text-slate-400">{r.placed}</td>
                  <td className="px-4 py-2.5">
                    {r.selisih === 0 ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 size={13} /> Cocok
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 text-xs">
                        <AlertTriangle size={13} /> {r.selisih > 0 ? `+${r.selisih}` : r.selisih}
                      </span>
                    )}
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

function RiwayatStok({ stockHistory }) {
  const handleDownload = () => {
    downloadCsv(
      `riwayat-stok-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "waktu", label: "Waktu" },
        { key: "sku", label: "SKU" },
        { key: "type", label: "Tipe" },
        { key: "qty_before", label: "Sebelum" },
        { key: "qty_change", label: "Perubahan" },
        { key: "qty_after", label: "Sesudah" },
        { key: "note", label: "Catatan" },
      ],
      stockHistory.map((h) => ({ ...h, waktu: fmtTgl(h.created_at) }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Riwayat Stok"
        description="Catatan setiap perubahan stok — masuk, keluar, atau penyesuaian."
        action={
          <button
            onClick={handleDownload}
            disabled={stockHistory.length === 0}
            className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Download CSV
          </button>
        }
      />
      {stockHistory.length === 0 ? (
        <EmptyState label="Belum ada riwayat stok." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Waktu</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Tipe</th>
                <th className="px-4 py-2.5">Sebelum</th>
                <th className="px-4 py-2.5">Perubahan</th>
                <th className="px-4 py-2.5">Sesudah</th>
                <th className="px-4 py-2.5">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {stockHistory.map((h) => (
                <tr key={h.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 text-xs">{fmtTgl(h.created_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{h.sku}</td>
                  <td className="px-4 py-2.5 capitalize">{h.type}</td>
                  <td className="px-4 py-2.5 text-slate-400">{h.qty_before}</td>
                  <td className="px-4 py-2.5">{h.qty_change > 0 ? `+${h.qty_change}` : h.qty_change}</td>
                  <td className="px-4 py-2.5 font-semibold">{h.qty_after}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{h.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}