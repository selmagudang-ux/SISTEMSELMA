import { useState } from "react";
import { Search, AlertTriangle, CheckCircle2, MinusCircle, Download } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtTgl, downloadCsv } from "../lib/api";
import { AMBANG_MENIPIS_RESTOCK } from "../lib/constants";

export default function Stok({ sub, skuMaster, penempatan, stockHistory, pengajuanRestock, session, setModal }) {
  if (sub === "menipis") return <StokMenipis skuMaster={skuMaster} pengajuanRestock={pengajuanRestock} session={session} setModal={setModal} />;
  if (sub === "keluar") return <BarangKeluar skuMaster={skuMaster} setModal={setModal} />;
  if (sub === "hitung") return <HitungQty skuMaster={skuMaster} setModal={setModal} />;
  if (sub === "riwayat") return <RiwayatStok stockHistory={stockHistory} />;
  return <StokBarang skuMaster={skuMaster} />;
}

// Sub-menu "Stok Menipis" — pindahan dari tab Dashboard (dulu "Barang
// Menipis"), sekarang jadi bagian dari menu Stok supaya gudang mengajukan
// restock dari tempat yang sama dengan kerja stok sehari-hari. Dashboard kini
// murni untuk tab "Menunggu Persetujuan" (owner/superadmin saja).
function StokMenipis({ skuMaster, pengajuanRestock, session, setModal }) {
  const bisaAjukan = ["gudang", "owner", "superadmin"].includes(session?.role);
  const [q, setQ] = useState("");

  const menipis = (skuMaster || [])
    .filter((s) => !s.nonaktif && Number(s.stok || 0) <= AMBANG_MENIPIS_RESTOCK)
    .filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.stok || 0) - (b.stok || 0));

  // Pengajuan TERBARU per SKU (apapun statusnya) — supaya tiap baris bisa
  // langsung nunjukin balasan owner: masih menunggu, sudah disetujui, atau
  // ditolak. Kalau sudah "disetujui"/"ditolak" (bukan "menunggu"), pengajuan
  // itu dianggap selesai jadi SKU boleh diajukan ulang kalau stoknya masih
  // menipis.
  const pengajuanTerbaruPerSku = new Map();
  [...(pengajuanRestock || [])]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((p) => pengajuanTerbaruPerSku.set(p.sku, p));

  return (
    <div>
      <PageHeader
        title="Stok Menipis"
        description={`SKU yang stoknya sudah turun (≤ ${AMBANG_MENIPIS_RESTOCK}pcs) dan siap diajukan restock ke owner.`}
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
      {menipis.length === 0 ? (
        <EmptyState label={q ? "Tidak ada SKU menipis yang cocok dengan pencarian." : "Tidak ada SKU dengan stok menipis."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {menipis.map((s, i) => {
            const pengajuan = pengajuanTerbaruPerSku.get(s.sku);
            const sudahDiajukan = pengajuan?.status === "menunggu";
            return (
              <div
                key={s.id}
                className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-200 truncate">{s.sku}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
                    {s.stok <= 0 ? (
                      <span className="text-red-400 font-medium">Habis</span>
                    ) : (
                      <span className="text-amber-400 font-medium">Sisa {s.stok}</span>
                    )}
                    {pengajuan?.status === "menunggu" && <Badge color="amber">Menunggu Respon</Badge>}
                    {pengajuan?.status === "disetujui" && <Badge color="emerald">Disetujui Owner</Badge>}
                    {pengajuan?.status === "ditolak" && <Badge color="red">Ditolak Owner</Badge>}
                    {pengajuan?.status && pengajuan.status !== "menunggu" && pengajuan.catatan_owner && (
                      <span className="text-slate-500 truncate">"{pengajuan.catatan_owner}"</span>
                    )}
                  </div>
                </div>
                {bisaAjukan && (
                  <button
                    disabled={sudahDiajukan}
                    onClick={() => setModal({ type: "ajukan-restock", item: s })}
                    className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    {sudahDiajukan ? "Sudah diajukan" : "Ajukan Order →"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

function HitungQty({ skuMaster, setModal }) {
  const [q, setQ] = useState("");
  // Qty hasil hitung fisik (stok opname) yang baru saja diketik user — { [sku_master.id]: string }.
  // Belum tersimpan ke sistem sampai user klik "Sesuaikan Stok" (lewat modal konfirmasi).
  const [fisik, setFisik] = useState({});

  const setQtyFisik = (id, val) => {
    setFisik((prev) => ({ ...prev, [id]: val }));
  };

  const rows = skuMaster
    .filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()))
    .map((s) => {
      const raw = fisik[s.id];
      const ada = raw !== undefined && raw !== "";
      const qtyFisik = ada ? Number(raw) : null;
      const selisih = ada ? qtyFisik - (s.stok || 0) : null;
      return { ...s, raw: raw ?? "", ada, qtyFisik, selisih };
    });

  return (
    <div>
      <PageHeader
        title="Hitung Qty"
        description="Hitung fisik stok di gudang (stok opname), lalu bandingkan dengan Stok Sistem untuk mengecek selisih."
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
      {rows.length === 0 ? (
        <EmptyState label="Belum ada data untuk dihitung." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Stok Sistem</th>
                <th className="px-4 py-2.5">Qty Fisik (Stok Opname)</th>
                <th className="px-4 py-2.5">Selisih</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                  <td className="px-4 py-2.5">{r.stok}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      value={r.raw}
                      onChange={(e) => setQtyFisik(r.id, e.target.value)}
                      placeholder="Hasil hitung…"
                      className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-amber-500"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {!r.ada ? (
                      <span className="text-slate-600 text-xs">—</span>
                    ) : r.selisih === 0 ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 size={13} /> Cocok
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 text-xs">
                        <AlertTriangle size={13} /> {r.selisih > 0 ? `+${r.selisih}` : r.selisih}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      disabled={!r.ada || r.selisih === 0}
                      onClick={() => setModal({ type: "stok-opname", item: r, qtyFisik: r.qtyFisik })}
                      className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      Sesuaikan Stok
                    </button>
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