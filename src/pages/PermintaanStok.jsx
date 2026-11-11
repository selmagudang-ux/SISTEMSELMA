import { useState, useMemo } from "react";
import { Plus, Search, Trash2, ArrowRight, HandHelping, Send, XCircle, Ban } from "lucide-react";
import { Badge, EmptyState, ModalShell, Field, inputClass } from "../components/ui";
import { sb } from "../lib/api";
import { fiturMatiEntitas } from "../lib/constants";

// =========================================================
// PERMINTAAN STOK ANTAR ENTITAS (tampil sebagai tab di pages/TransferEntitas.jsx)
// Alur: Peminta memilih SKU + qty dari PT lain -> status "menunggu"
//       -> Pemberi: Setujui & Kirim (membuka form transfer yang sudah terisi, qty boleh dikurangi)
//          atau Tolak (wajib alasan)
//       -> setelah disetujui, barang berjalan lewat TRANSFER biasa (surat jalan + kode terima);
//          status permintaan mengikuti status transfernya (dalam perjalanan / selesai).
// Tidak ada stok yang bergerak di sini — stok hanya berubah lewat transfer_barang.
// Tabel: permintaan_stok (supabase/migrations/20261111_permintaan_stok.sql).
// =========================================================

const fmtWaktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "");

export function kodePermintaan() {
  const d = new Date();
  const tgl = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `REQ-${tgl}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// Status tampilan: permintaan yang sudah "diproses" mengikuti status transfernya.
export function statusPermintaan(p, transfers) {
  if (p.status === "menunggu") return { label: "Menunggu persetujuan", color: "amber", akhir: false };
  if (p.status === "ditolak") return { label: "Ditolak", color: "red", akhir: true };
  if (p.status === "dibatalkan") return { label: "Dibatalkan", color: "slate", akhir: true };
  const t = (transfers || []).find((x) => String(x.id) === String(p.transfer_id));
  if (!t) return { label: "Disetujui — barang dikirim", color: "sky", akhir: false };
  if (t.status === "diterima") return { label: "Selesai — barang diterima", color: "emerald", akhir: true };
  if (t.status === "ditolak") return { label: "Transfer ditolak penerima", color: "red", akhir: true };
  if (t.status === "dibatalkan") return { label: "Transfer dibatalkan pengirim", color: "slate", akhir: true };
  return { label: "Disetujui — dalam perjalanan", color: "sky", akhir: false };
}

export default function PermintaanStok({
  rows, transfers, entSaya, namaEnt, skuMaster, master, session, bisaMinta, bisaKirim, proses, jalankan, muat, memuat, tabelAda, onSetujui,
}) {
  const [filter, setFilter] = useState("perlu");
  const [modal, setModal] = useState(null); // {jenis:"minta"} | {jenis:"tolak", p}

  const perluTindakan = (p) => p.status === "menunggu" && p.entitas_pemberi === entSaya;
  const tampil = rows.filter((p) =>
    filter === "perlu"
      ? perluTindakan(p)
      : filter === "masuk"
      ? p.entitas_pemberi === entSaya
      : filter === "keluar"
      ? p.entitas_peminta === entSaya
      : true
  );

  // ---------- Peminta: buat permintaan ----------
  const minta = (pemberi, daftar, catatan) =>
    jalankan(async () => {
      await sb("permintaan_stok", {
        method: "POST",
        body: JSON.stringify({
          kode: kodePermintaan(),
          entitas_peminta: entSaya,
          entitas_pemberi: pemberi,
          items: daftar.map((d) => ({ sku: d.sku, qty: d.jumlah, qty_dikirim: 0 })),
          catatan: catatan || null,
          dibuat_oleh: session?.username || null,
          dibuat_oleh_nama: session?.nama || session?.username || null,
        }),
      });
    }, "Permintaan terkirim — menunggu persetujuan " + namaEnt(pemberi));

  // ---------- Peminta: batalkan (hanya selama masih menunggu) ----------
  const batalkan = (p) =>
    jalankan(async () => {
      const klaim = await sb(`permintaan_stok?id=eq.${p.id}&status=eq.menunggu`, { method: "PATCH", body: JSON.stringify({ status: "dibatalkan" }) });
      if (!klaim?.length) throw new Error("Permintaan ini sudah diproses pihak lain, tidak bisa dibatalkan. Muat ulang.");
    }, "Permintaan dibatalkan");

  // ---------- Pemberi: tolak ----------
  const tolak = (p, alasan) =>
    jalankan(async () => {
      if (!alasan.trim()) throw new Error("Isi alasan penolakan.");
      const klaim = await sb(`permintaan_stok?id=eq.${p.id}&status=eq.menunggu`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "ditolak", alasan_tolak: alasan.trim(),
          diproses_oleh_nama: session?.nama || session?.username || null, diproses_at: new Date().toISOString(),
        }),
      });
      if (!klaim?.length) throw new Error("Permintaan ini sudah dibatalkan peminta atau diproses. Muat ulang.");
    }, "Permintaan ditolak");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          ["perlu", `Perlu tindakan${rows.filter(perluTindakan).length ? ` (${rows.filter(perluTindakan).length})` : ""}`],
          ["masuk", "Diminta ke saya"],
          ["keluar", "Permintaan saya"],
          ["semua", "Semua"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filter === k ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            {l}
          </button>
        ))}
        {bisaMinta && (
          <button
            onClick={() => setModal({ jenis: "minta" })}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-amber-500 text-slate-900 hover:bg-amber-400"
          >
            <Plus size={14} /> Minta Barang
          </button>
        )}
      </div>

      {!tabelAda ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm p-4">
          Tabel permintaan_stok belum dibuat — jalankan SQL migrasi <span className="font-mono">20261111_permintaan_stok.sql</span> di Supabase dulu.
        </div>
      ) : memuat && !rows.length ? (
        <div className="text-sm text-slate-500 py-10 text-center">Memuat…</div>
      ) : tampil.length === 0 ? (
        <EmptyState label={filter === "perlu" ? "Tidak ada permintaan yang perlu Anda tanggapi." : "Belum ada permintaan stok."} />
      ) : (
        <div className="space-y-3">
          {tampil.map((p) => {
            const saya = p.entitas_peminta === entSaya;
            const st = statusPermintaan(p, transfers);
            const totalQty = (p.items || []).reduce((a, it) => a + (Number(it.qty) || 0), 0);
            return (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
                  <span className="font-mono text-xs text-slate-300">{p.kode}</span>
                  <Badge color={st.color}>{st.label}</Badge>
                  <span className="flex items-center gap-1.5 text-sm text-slate-200 ml-1">
                    {namaEnt(p.entitas_peminta)} <span className="text-[11px] text-slate-500">meminta dari</span> <ArrowRight size={13} className="text-slate-500" /> {namaEnt(p.entitas_pemberi)}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    {fmtWaktu(p.created_at)}
                    {p.dibuat_oleh_nama ? ` · ${p.dibuat_oleh_nama}` : ""}
                  </span>
                </div>
                <div className="px-4 py-2">
                  {(p.items || []).map((it) => (
                    <div key={it.sku} className="flex items-center justify-between py-1 text-xs">
                      <span className="font-mono text-slate-300 truncate">{it.sku}</span>
                      <span className="text-slate-400 shrink-0 ml-3">
                        {p.status === "diproses" ? `dikirim ${it.qty_dikirim ?? 0} dari diminta ${it.qty}` : `${it.qty} pcs`}
                      </span>
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 mt-1">
                    {(p.items || []).length} SKU · {totalQty} pcs diminta
                    {p.catatan ? ` · Catatan: ${p.catatan}` : ""}
                  </div>
                  {p.status === "ditolak" && p.alasan_tolak && (
                    <div className="text-[11px] text-red-300 mt-0.5">
                      Ditolak{p.diproses_oleh_nama ? ` oleh ${p.diproses_oleh_nama}` : ""}: {p.alasan_tolak}
                    </div>
                  )}
                  {p.status === "diproses" && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Disetujui{p.diproses_oleh_nama ? ` oleh ${p.diproses_oleh_nama}` : ""} {fmtWaktu(p.diproses_at)}
                      {p.transfer_kode ? ` · Transfer ${p.transfer_kode} (lihat tab Transfer)` : ""}
                    </div>
                  )}
                </div>
                {p.status === "menunggu" && (
                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800">
                    {!saya && bisaKirim && (
                      <>
                        <button
                          disabled={proses}
                          onClick={() => onSetujui(p)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                        >
                          <Send size={13} /> Setujui & Kirim
                        </button>
                        <button
                          disabled={proses}
                          onClick={() => setModal({ jenis: "tolak", p })}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          <XCircle size={13} /> Tolak
                        </button>
                      </>
                    )}
                    {saya && bisaMinta && (
                      <button
                        disabled={proses}
                        onClick={() => window.confirm(`Batalkan permintaan ${p.kode}?`) && batalkan(p)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Ban size={13} /> Batalkan
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal?.jenis === "minta" && (
        <FormMinta skuMaster={skuMaster} master={master} entSaya={entSaya} saving={proses} onClose={() => setModal(null)} onSubmit={(...a) => minta(...a).then((ok) => ok && setModal(null))} />
      )}
      {modal?.jenis === "tolak" && (
        <FormTolakPermintaan
          p={modal.p}
          namaEnt={namaEnt}
          saving={proses}
          onClose={() => setModal(null)}
          onSubmit={(p, alasan) => tolak(p, alasan).then((ok) => ok && setModal(null))}
        />
      )}
    </div>
  );
}

function FormMinta({ skuMaster, master, entSaya, saving, onClose, onSubmit }) {
  const pilihanPemberi = (master?.entitas || []).filter(
    (e) => e.kode !== entSaya && !fiturMatiEntitas(master, e.kode).includes("stok")
  );
  const [pemberi, setPemberi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState([]); // [{src, jumlah}]

  // Peminta boleh memilih SKU apa pun di katalog (stok sendiri boleh 0 — justru itu alasan meminta).
  const hasil = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    const terpilih = new Set(pilih.map((p) => p.src.id));
    return skuMaster.filter((s) => !s.nonaktif && !terpilih.has(s.id) && s.sku.toLowerCase().includes(k)).slice(0, 8);
  }, [q, skuMaster, pilih]);

  const ubahJumlah = (id, v) =>
    setPilih((l) => l.map((p) => (p.src.id === id ? { ...p, jumlah: Math.min(Math.max(Math.floor(Number(v) || 0), 0), 99999) } : p)));

  const valid = pemberi && pilih.length > 0 && pilih.every((p) => p.jumlah > 0);

  return (
    <ModalShell title="Minta Barang dari Entitas Lain" onClose={onClose} maxWidth="max-w-xl">
      <Field label="Minta ke">
        <select value={pemberi} onChange={(e) => setPemberi(e.target.value)} className={inputClass}>
          <option value="">Pilih perusahaan yang dimintai…</option>
          {pilihanPemberi.map((e) => (
            <option key={e.kode} value={e.kode}>
              {e.label || e.kode}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cari SKU yang dibutuhkan">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <Search size={14} className="text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik kode SKU…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600" />
        </div>
      </Field>
      {hasil.length > 0 && (
        <div className="rounded-lg border border-slate-700 mb-3 overflow-hidden">
          {hasil.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setPilih((l) => [...l, { src: s, jumlah: 1 }]);
                setQ("");
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0"
            >
              <span className="font-mono text-slate-200 truncate">{s.sku}</span>
              <span className="text-slate-500 shrink-0 ml-3">stok saya {Number(s.stok) || 0}</span>
            </button>
          ))}
        </div>
      )}

      {pilih.length > 0 && (
        <div className="rounded-lg border border-slate-700 mb-3">
          {pilih.map((p) => (
            <div key={p.src.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-200 truncate">{p.src.sku}</div>
                <div className="text-[11px] text-slate-500">stok saya sekarang {Number(p.src.stok) || 0}</div>
              </div>
              <input
                type="number" min={1} value={p.jumlah || ""}
                onChange={(e) => ubahJumlah(p.src.id, e.target.value)}
                className={`${inputClass} !w-20 text-center`}
              />
              <button onClick={() => setPilih((l) => l.filter((x) => x.src.id !== p.src.id))} className="p-1.5 text-slate-500 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Field label="Catatan (opsional)">
        <input value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass} placeholder="mis. untuk stok toko minggu depan" />
      </Field>

      <div className="text-[11px] text-slate-500 mb-3">
        Permintaan ini belum menggerakkan stok. Pihak yang dimintai bisa menyetujui (qty boleh dikurangi) lalu mengirim barang, atau menolak.
      </div>
      <button
        disabled={!valid || saving}
        onClick={() => onSubmit(pemberi, pilih.map((p) => ({ sku: p.src.sku, jumlah: p.jumlah })), catatan.trim())}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-40"
      >
        <HandHelping size={15} /> {saving ? "Memproses…" : "Kirim Permintaan"}
      </button>
    </ModalShell>
  );
}

function FormTolakPermintaan({ p, namaEnt, saving, onClose, onSubmit }) {
  const [alasan, setAlasan] = useState("");
  return (
    <ModalShell title={`Tolak ${p.kode}`} onClose={onClose}>
      <Field label="Alasan penolakan">
        <input value={alasan} onChange={(e) => setAlasan(e.target.value)} className={inputClass} placeholder="mis. stok sedang kosong / belum bisa dikirim minggu ini" />
      </Field>
      <div className="text-[11px] text-slate-500 mb-3">{namaEnt(p.entitas_peminta)} akan melihat alasan ini di daftar permintaannya.</div>
      <button
        disabled={saving || !alasan.trim()}
        onClick={() => onSubmit(p, alasan)}
        className="w-full text-sm font-medium py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-40"
      >
        {saving ? "Memproses…" : "Tolak Permintaan"}
      </button>
    </ModalShell>
  );
}
