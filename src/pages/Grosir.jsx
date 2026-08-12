import { useState } from "react";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";

export default function Grosir({ sub, pelangganGrosir, tokoGrosir, setModal }) {
  if (sub === "toko") return <TokoList tokoGrosir={tokoGrosir} setModal={setModal} />;
  return <PelangganList pelangganGrosir={pelangganGrosir} setModal={setModal} />;
}

function PelangganList({ pelangganGrosir, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (pelangganGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.nama?.toLowerCase().includes(s) ||
      p.kode?.toLowerCase().includes(s) ||
      p.kota?.toLowerCase().includes(s) ||
      p.wa?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Pelanggan Grosir"
        description="Daftar pelanggan/toko langganan untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-pelanggan-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Pelanggan
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, kode, kota, atau WA…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan grosir."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{p.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{p.nama}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[p.wa, p.kota].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "grosir-pelanggan-form", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-pelanggan", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TokoList({ tokoGrosir, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (tokoGrosir || []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      t.nama_toko?.toLowerCase().includes(s) ||
      t.kode?.toLowerCase().includes(s) ||
      t.jenis_toko?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Toko Pengirim"
        description="Daftar toko/reseller pengirim untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-toko-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Toko
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama toko, kode, atau jenis…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada toko yang cocok." : "Belum ada toko pengirim."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{t.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{t.nama_toko}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[t.jenis_toko, t.telepon].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "grosir-toko-form", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-toko", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}