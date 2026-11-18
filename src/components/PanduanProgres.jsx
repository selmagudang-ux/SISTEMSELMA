import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2, Save, Download, Loader2, AlertTriangle, Hammer } from "lucide-react";
import { sbAll } from "../lib/api";
import { sbTulis } from "../lib/marketplaceImport";

// =========================================================
// PANDUAN: "SEDANG DIKERJAKAN" — catatan pengembangan yang ditulis sendiri.
// Hanya dirender oleh pages/Panduan.jsx kalau role = superappa. TIDAK masuk ke SECTIONS,
// jadi tidak ikut pencarian maupun PDF panduan biasa, dan tidak pernah tampil ke role lain.
// Tabel: panduan_progres (supabase/migrations/20261118_panduan_progres.sql).
// =========================================================
const STATUS = {
  dikerjakan: { label: "Sedang dikerjakan", warna: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  rencana: { label: "Rencana", warna: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  tertunda: { label: "Tertunda", warna: "text-slate-300 bg-slate-500/10 border-slate-500/30" },
  selesai: { label: "Selesai", warna: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
};
const URUT = ["dikerjakan", "rencana", "tertunda", "selesai"];
const field = "w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500";

export default function PanduanProgres() {
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState("");
  const [buka, setBuka] = useState(false);
  const [edit, setEdit] = useState({}); // id -> draf yang sedang diubah
  const [baru, setBaru] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [membuatPdf, setMembuatPdf] = useState(false);

  const muat = useCallback(async () => {
    try {
      setGalat("");
      setDaftar((await sbAll("panduan_progres?select=*&order=dibuat.desc")) || []);
    } catch (e) {
      const t = String(e?.message || e);
      setDaftar([]);
      setGalat(/panduan_progres|does not exist|relation/i.test(t)
        ? "Tabel panduan_progres belum ada. Jalankan SQL supabase/migrations/20261118_panduan_progres.sql di Supabase, lalu muat ulang halaman."
        : t);
    }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const simpan = async (draf, id) => {
    if (!draf.judul.trim()) { alert("Judul wajib diisi."); return; }
    setSibuk(true);
    try {
      const body = JSON.stringify({ judul: draf.judul.trim(), status: draf.status, isi: draf.isi || "", diubah: new Date().toISOString() });
      await sbTulis(id ? `panduan_progres?id=eq.${id}` : "panduan_progres", { method: id ? "PATCH" : "POST", prefer: "return=minimal", body });
      if (id) setEdit((p) => { const n = { ...p }; delete n[id]; return n; });
      else setBaru(null);
      await muat();
    } catch (e) { alert("Gagal menyimpan: " + (e?.message || e)); }
    finally { setSibuk(false); }
  };

  const hapus = async (r) => {
    if (!window.confirm(`Hapus catatan "${r.judul}"?`)) return;
    try {
      await sbTulis(`panduan_progres?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });
      await muat();
    } catch (e) { alert("Gagal menghapus: " + (e?.message || e)); }
  };

  const unduhPdf = async () => {
    if (membuatPdf || !daftar?.length) return;
    setMembuatPdf(true);
    try {
      const { generatePanduanPdf } = await import("../lib/PanduanPdf");
      const urut = [...daftar].sort((a, b) => URUT.indexOf(a.status) - URUT.indexOf(b.status));
      generatePanduanPdf({
        judul: "SEDANG DIKERJAKAN",
        namaFile: "Catatan-Progres",
        judulFungsi: "CATATAN",
        peran: "Rahasia - tidak untuk dibagikan",
        sections: urut.map((r) => ({
          label: r.judul,
          ringkasan: STATUS[r.status]?.label || r.status,
          fungsi: String(r.isi || "").split(/\n+/).map((x) => x.trim()).filter(Boolean),
          cara: [],
        })),
      });
    } catch (e) { alert("Gagal membuat PDF: " + (e?.message || e)); }
    finally { setMembuatPdf(false); }
  };

  const Form = ({ draf, onUbah, onSimpan, onBatal }) => (
    <div className="space-y-2.5 mt-3">
      <input className={field} placeholder="Judul (mis. Barang Aset)" value={draf.judul} onChange={(e) => onUbah({ ...draf, judul: e.target.value })} />
      <select className={field} value={draf.status} onChange={(e) => onUbah({ ...draf, status: e.target.value })}>
        {URUT.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
      </select>
      <textarea className={`${field} min-h-[140px]`} placeholder="Tulis isi catatan di sini. Satu baris = satu paragraf di PDF." value={draf.isi} onChange={(e) => onUbah({ ...draf, isi: e.target.value })} />
      <div className="flex gap-2">
        <button disabled={sibuk} onClick={onSimpan} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950">
          {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan
        </button>
        <button onClick={onBatal} className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">Batal</button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-amber-500/40 overflow-hidden mb-4">
      <button onClick={() => setBuka(!buka)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-900/60">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0"><Hammer size={16} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-200">Sedang Dikerjakan (catatan pribadi)</div>
          <div className="text-xs text-slate-500 truncate">Menu yang masih progres. Diisi sendiri, tidak tampil untuk role lain.</div>
        </div>
        <ChevronDown size={16} className={`text-slate-500 flex-shrink-0 transition-transform ${buka ? "rotate-180" : ""}`} />
      </button>

      {buka && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setBaru({ judul: "", status: "dikerjakan", isi: "" })} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">
              <Plus size={13} /> Tambah catatan
            </button>
            <button onClick={unduhPdf} disabled={membuatPdf || !daftar?.length} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950">
              <Download size={13} /> {membuatPdf ? "Membuat PDF…" : "Cetak PDF"}
            </button>
          </div>

          {galat && (
            <div className="mt-3 flex gap-2 text-xs text-amber-400"><AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {galat}</div>
          )}

          {baru && <div className="rounded-lg border border-slate-800 p-3 mt-3"><div className="text-xs font-bold uppercase tracking-wide text-amber-400">Catatan baru</div><Form draf={baru} onUbah={setBaru} onSimpan={() => simpan(baru)} onBatal={() => setBaru(null)} /></div>}

          {daftar === null ? (
            <div className="mt-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Memuat…</div>
          ) : daftar.length === 0 && !baru && !galat ? (
            <div className="mt-4 text-sm text-slate-500">Belum ada catatan. Klik "Tambah catatan".</div>
          ) : (
            <div className="space-y-3 mt-3">
              {[...daftar].sort((a, b) => URUT.indexOf(a.status) - URUT.indexOf(b.status)).map((r) => {
                const draf = edit[r.id];
                const st = STATUS[r.status] || STATUS.dikerjakan;
                return (
                  <div key={r.id} className="rounded-lg border border-slate-800 p-3.5">
                    {draf ? (
                      <Form draf={draf} onUbah={(d) => setEdit((p) => ({ ...p, [r.id]: d }))} onSimpan={() => simpan(draf, r.id)}
                        onBatal={() => setEdit((p) => { const n = { ...p }; delete n[r.id]; return n; })} />
                    ) : (
                      <>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-200">{r.judul}</div>
                            <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${st.warna}`}>{st.label}</span>
                          </div>
                          <button onClick={() => setEdit((p) => ({ ...p, [r.id]: { judul: r.judul, status: r.status, isi: r.isi || "" } }))} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">Ubah</button>
                          <button onClick={() => hapus(r)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400" aria-label="Hapus"><Trash2 size={14} /></button>
                        </div>
                        {r.isi ? <p className="text-sm text-slate-300 whitespace-pre-wrap mt-2.5">{r.isi}</p> : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
