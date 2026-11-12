import { useEffect, useMemo, useState } from "react";
import { X, Search, Plus, Loader2, AlertCircle, Pencil, Trash2, Power, BadgePercent } from "lucide-react";
import { sbAll, fmtRp } from "../../lib/api";
import { hitungDiskonPromo } from "./kasirHitung";
import {
  muatSemuaPromo,
  tambahPromo,
  ubahPromo,
  hapusPromo,
  tanggalHariIni,
  statusPromo,
  labelDiskon,
  tglPendek,
  hargaSetelahPromo,
  normKat,
  muatCfgGrosirRow,
  simpanCfgGrosir,
  CFG_GROSIR_BAWAAN,
} from "./kasirPromo";
import { inp } from "./BarangToko";

// =========================================================
// KELOLA PROMO KASIR (hanya superappa) — dibuka dari tombol "Promo" di header kasir.
// Promo per barang (SKU toko) ATAU per kategori (semua barang di kategori itu) + diskon % atau Rp per pcs + tanggal mulai & selesai (keduanya ikut berlaku).
// Promo yang sedang berjalan otomatis terpasang di keranjang kasir; kasir bisa melepasnya per item.
// Kalau satu SKU punya beberapa promo yang berjalan bersamaan, dipakai yang potongannya paling besar.
// =========================================================

const STATUS = {
  berjalan: { label: "Berjalan", cls: "bg-emerald-500/15 text-emerald-400" },
  akan: { label: "Akan datang", cls: "bg-sky-500/15 text-sky-400" },
  berakhir: { label: "Berakhir", cls: "bg-slate-800 text-slate-400" },
  nonaktif: { label: "Nonaktif", cls: "bg-red-500/15 text-red-400" },
};
const FILTER = [
  ["semua", "Semua"],
  ["berjalan", "Berjalan"],
  ["akan", "Akan datang"],
  ["berakhir", "Berakhir"],
  ["nonaktif", "Nonaktif"],
];

function Kerangka({ judul, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-bold text-[15px]">{judul}</div>
          <button onClick={onClose} className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormPromo({ promo, barang, onClose, onSelesai }) {
  const baru = !promo?.id;
  const hari = tanggalHariIni();
  const peta = useMemo(() => new Map(barang.map((b) => [b.kode, b])), [barang]);
  // Sasaran promo: "sku" (barang tertentu) atau "kategori" (semua barang di kategori itu).
  const [sasaran, setSasaran] = useState(promo?.kategori && !promo?.sku ? "kategori" : "sku");
  const [terpilih, setTerpilih] = useState(() => (promo?.sku ? [promo.sku] : []));
  const [katTerpilih, setKatTerpilih] = useState(() => (promo?.kategori && !promo?.sku ? [promo.kategori] : []));
  const daftarKategori = useMemo(() => {
    const m = new Map();
    barang.forEach((b) => {
      const k = String(b.kategori || "").trim();
      if (k && !b.nonaktif) m.set(normKat(k), { nama: k, jumlah: (m.get(normKat(k))?.jumlah || 0) + 1 });
    });
    return [...m.entries()].map(([nk, v]) => ({ nk, ...v })).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [barang]);
  const [cari, setCari] = useState("");
  const [tipe, setTipe] = useState(promo?.tipe || "persen");
  const [nilai, setNilai] = useState(promo?.nilai != null ? String(promo.nilai) : "");
  const [mulai, setMulai] = useState(promo?.mulai || hari);
  const [selesai, setSelesai] = useState(promo?.selesai || hari);
  const [nama, setNama] = useState(promo?.nama || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasilCari = useMemo(() => {
    const kata = cari.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return [];
    return barang
      .filter((b) => !b.nonaktif && !terpilih.includes(b.kode) && kata.every((k) => `${b.kode} ${b.nama || ""}`.toLowerCase().includes(k)))
      .slice(0, 8);
  }, [cari, barang, terpilih]);

  const n = Number(nilai) || 0;
  const contoh = terpilih.length ? peta.get(terpilih[0]) : null;
  const contohHarga = Number(contoh?.harga_jual) || 0;

  const simpan = async () => {
    setError("");
    const perKategori = sasaran === "kategori";
    if (perKategori && !katTerpilih.length) return setError("Pilih minimal satu kategori.");
    if (!perKategori && !terpilih.length) return setError("Pilih minimal satu barang.");
    if (n <= 0) return setError("Isi besar diskon (lebih dari 0).");
    if (tipe === "persen" && n > 100) return setError("Diskon persen maksimal 100.");
    if (!mulai || !selesai) return setError("Isi tanggal mulai dan selesai.");
    if (selesai < mulai) return setError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    if (tipe === "rp") {
      if (perKategori) {
        for (const k of katTerpilih) {
          const murah = barang.filter((b) => !b.nonaktif && normKat(b.kategori) === normKat(k) && Number(b.harga_jual) > 0).sort((a, b) => a.harga_jual - b.harga_jual)[0];
          if (murah && n >= Number(murah.harga_jual)) return setError(`Potongan ${fmtRp(n)} tidak boleh sama atau lebih besar dari harga ${murah.kode} (${fmtRp(murah.harga_jual)}) di kategori ${k}.`);
        }
      } else {
        const kebesaran = terpilih.find((k) => n >= (Number(peta.get(k)?.harga_jual) || 0));
        if (kebesaran) return setError(`Potongan ${fmtRp(n)} tidak boleh sama atau lebih besar dari harga ${kebesaran} (${fmtRp(peta.get(kebesaran)?.harga_jual)}).`);
      }
    }
    setSaving(true);
    try {
      const data = { tipe, nilai: n, mulai, selesai, nama: nama.trim() || null };
      if (baru) {
        await tambahPromo(perKategori ? katTerpilih.map((kategori) => ({ sku: null, kategori, aktif: true, ...data })) : terpilih.map((sku) => ({ sku, kategori: null, aktif: true, ...data })));
      } else {
        await ubahPromo(promo.id, perKategori ? { sku: null, kategori: katTerpilih[0], ...data } : { sku: terpilih[0], kategori: null, ...data });
      }
      onSelesai();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={baru ? "Tambah promo" : "Ubah promo"} onClose={onClose}>
      {baru && (
        <div className="flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
          {[
            ["sku", "Per barang"],
            ["kategori", "Per kategori"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSasaran(k)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${sasaran === k ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {sasaran === "kategori" ? (
        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            Kategori {baru && <span className="text-slate-600">(boleh lebih dari satu — berlaku untuk semua barang di kategori itu)</span>}
          </label>
          {daftarKategori.length === 0 ? (
            <div className="text-xs text-slate-500">Belum ada barang toko yang punya kategori.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {daftarKategori.map((k) => {
                const aktif = katTerpilih.some((x) => normKat(x) === k.nk);
                return (
                  <button
                    key={k.nk}
                    type="button"
                    onClick={() => setKatTerpilih((t) => (baru ? (aktif ? t.filter((x) => normKat(x) !== k.nk) : [...t, k.nama]) : [k.nama]))}
                    className={`text-xs px-3 py-1.5 rounded-full border ${aktif ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-slate-700 text-slate-300 hover:border-amber-500/60"}`}
                  >
                    {k.nama} <span className={aktif ? "text-slate-800" : "text-slate-500"}>({k.jumlah})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Barang {baru && <span className="text-slate-600">(boleh lebih dari satu)</span>}</label>
        {terpilih.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {terpilih.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-full pl-2.5 pr-1.5 py-1">
                <span className="font-mono">{k}</span>
                {(baru || terpilih.length > 1) && (
                  <button type="button" onClick={() => setTerpilih((t) => t.filter((x) => x !== k))} className="text-slate-500 hover:text-red-400">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {(baru || terpilih.length === 0) && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari kode atau nama barang toko…" className={`${inp} pl-9`} />
            {hasilCari.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden shadow-xl">
                {hasilCari.map((b) => (
                  <button
                    key={b.kode}
                    type="button"
                    onClick={() => {
                      setTerpilih((t) => (baru ? [...t, b.kode] : [b.kode]));
                      setCari("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800 flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-slate-400">{b.kode}</span> {b.nama}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">{fmtRp(b.harga_jual)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Diskon</label>
        <div className="flex items-center gap-2">
          <div className="flex p-0.5 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0">
            {[
              ["persen", "%"],
              ["rp", "Rp / pcs"],
            ].map(([t, l]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipe(t)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tipe === t ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <input type="number" inputMode="decimal" min="0" value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="0" className={`${inp} tabular-nums`} />
        </div>
        {sasaran === "sku" && contoh && n > 0 && (tipe === "persen" || n < contohHarga) && (
          <div className="text-[11px] text-slate-500 mt-1.5">
            Contoh {contoh.kode}: {fmtRp(contohHarga)} → <span className="text-emerald-400 font-semibold">{fmtRp(hargaSetelahPromo(contohHarga, { tipe, nilai: n }))}</span> per pcs
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Mulai</label>
          <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Selesai (hari ini masih berlaku)</label>
          <input type="date" value={selesai} min={mulai} onChange={(e) => setSelesai(e.target.value)} className={inp} />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Nama promo (opsional)</label>
        <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Promo Akhir Tahun" className={inp} />
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2">
          Batal
        </button>
        <button
          onClick={simpan}
          disabled={saving}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm px-4 py-2 rounded-lg"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Simpan
        </button>
      </div>
    </Kerangka>
  );
}

function KonfirmasiHapus({ promo, onClose, onSelesai }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hapus = async () => {
    setSaving(true);
    setError("");
    try {
      await hapusPromo(promo.id);
      onSelesai();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Kerangka judul={`Hapus promo ${promo.sku || promo.kategori}`} onClose={onClose}>
      <div className="text-sm text-slate-300">
        Promo {labelDiskon(promo)} ({tglPendek(promo.mulai)} – {tglPendek(promo.selesai)}) akan dihapus. Transaksi yang sudah tersimpan tidak berubah.
      </div>
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2">
          Batal
        </button>
        <button onClick={hapus} disabled={saving} className="flex items-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-lg">
          {saving && <Loader2 size={14} className="animate-spin" />} Hapus
        </button>
      </div>
    </Kerangka>
  );
}

// Promo grosir: beli minimal N pcs (gabungan semua barang di keranjang) -> harga berubah jadi harga Grosir dari Master Barang.
function KartuGrosir() {
  const [id, setId] = useState(null);
  const [f, setF] = useState(CFG_GROSIR_BAWAAN);
  const [muat, setMuat] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pesan, setPesan] = useState(null);

  useEffect(() => {
    muatCfgGrosirRow()
      .then((r) => {
        setId(r.id);
        setF({ ...r.cfg, min_qty: String(r.cfg.min_qty) });
      })
      .catch((e) => setPesan({ err: true, teks: String(e?.message || e) }))
      .finally(() => setMuat(false));
  }, []);

  const set = (k) => (v) => {
    setPesan(null);
    setF((x) => ({ ...x, [k]: v }));
  };
  const simpan = async () => {
    const n = Math.floor(Number(f.min_qty) || 0);
    if (n < 2) return setPesan({ err: true, teks: "Minimal pembelian harus 2 pcs atau lebih." });
    if (f.mulai && f.selesai && f.selesai < f.mulai) return setPesan({ err: true, teks: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
    setSaving(true);
    setPesan(null);
    try {
      await simpanCfgGrosir(id, { ...f, min_qty: n });
      const r = await muatCfgGrosirRow();
      setId(r.id);
      setF({ ...r.cfg, min_qty: String(r.cfg.min_qty) });
      setPesan({ err: false, teks: "Tersimpan. Layar kasir ikut berubah dalam ±1 menit (atau saat dimuat ulang)." });
    } catch (e) {
      setPesan({ err: true, teks: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Promo Grosir</div>
          <div className="text-[11px] text-slate-500">Beli minimal {f.min_qty || "…"} pcs (campur barang boleh) → harga otomatis jadi harga Grosir di Master Barang.</div>
        </div>
        <button
          type="button"
          disabled={muat}
          onClick={() => set("aktif")(!f.aktif)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border flex-shrink-0 ${f.aktif ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" : "border-slate-700 text-slate-400"}`}
        >
          {f.aktif ? "Aktif" : "Nonaktif"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <label className="text-[11px] text-slate-400">
          Minimal (pcs)
          <input type="number" inputMode="numeric" min="2" value={f.min_qty} onChange={(e) => set("min_qty")(e.target.value)} className={`${inp} mt-1 tabular-nums`} />
        </label>
        <label className="text-[11px] text-slate-400">
          Mulai (opsional)
          <input type="date" value={f.mulai} onChange={(e) => set("mulai")(e.target.value)} className={`${inp} mt-1`} />
        </label>
        <label className="text-[11px] text-slate-400">
          Selesai (opsional)
          <input type="date" value={f.selesai} onChange={(e) => set("selesai")(e.target.value)} className={`${inp} mt-1`} />
        </label>
      </div>
      {pesan && <div className={`mt-2 text-xs ${pesan.err ? "text-red-300" : "text-emerald-400"}`}>{pesan.teks}</div>}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="text-[11px] text-slate-500">Barang tanpa SKU gudang / tanpa harga Grosir tetap harga biasa. Tidak ditumpuk dengan promo diskon barang: dipakai yang lebih murah untuk pembeli.</div>
        <button onClick={simpan} disabled={saving || muat} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm px-4 py-2 rounded-lg flex-shrink-0">
          {saving && <Loader2 size={14} className="animate-spin" />} Simpan
        </button>
      </div>
    </div>
  );
}

// inline = tampil sebagai isi halaman (menu Toko Offline > POS > Promo), bukan layar penuh dengan tombol tutup.
export default function PromoToko({ onClose, inline = false }) {
  const [rows, setRows] = useState(null);
  const [barang, setBarang] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("semua");
  const [form, setForm] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [sibuk, setSibuk] = useState(null);

  const muat = async () => {
    setErr("");
    try {
      const [p, b] = await Promise.all([muatSemuaPromo(), sbAll("master_toko?select=kode,nama,kategori,harga_jual,nonaktif&order=kode")]);
      setRows(p);
      setBarang(b || []);
    } catch (e) {
      setRows((r) => r || []);
      setErr(
        /kasir_promo|relation|does not exist|schema cache/i.test(String(e?.message))
          ? "Tabel promo belum dibuat di database. Jalankan SQL 20261107_kasir_promo.sql di Supabase dulu."
          : String(e?.message || e)
      );
    }
  };
  useEffect(() => {
    muat();
  }, []);

  const hari = tanggalHariIni();
  const peta = useMemo(() => new Map(barang.map((b) => [b.kode, b])), [barang]);
  const dengan = useMemo(() => (rows || []).map((p) => ({ ...p, status: statusPromo(p, hari) })), [rows, hari]);
  const hitung = useMemo(() => {
    const h = { semua: dengan.length, berjalan: 0, akan: 0, berakhir: 0, nonaktif: 0 };
    dengan.forEach((p) => (h[p.status] += 1));
    return h;
  }, [dengan]);
  const tampil = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const urut = { berjalan: 0, akan: 1, berakhir: 2, nonaktif: 3 };
    return dengan
      .filter((p) => filter === "semua" || p.status === filter)
      .filter((p) => {
        if (!kata.length) return true;
        const j = `${p.sku || ""} ${p.kategori || ""} ${peta.get(p.sku)?.nama || ""} ${p.nama || ""}`.toLowerCase();
        return kata.every((k) => j.includes(k));
      })
      .sort((a, b) => urut[a.status] - urut[b.status] || String(a.selesai).localeCompare(String(b.selesai)));
  }, [dengan, filter, q, peta]);

  const toggleAktif = async (p) => {
    setSibuk(p.id);
    setErr("");
    try {
      await ubahPromo(p.id, { aktif: !p.aktif });
      await muat();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSibuk(null);
    }
  };

  const tutupForm = () => setForm(null);
  const selesaiForm = () => {
    setForm(null);
    setHapus(null);
    muat();
  };

  return (
    <div className={inline ? "rounded-xl border border-slate-800 bg-slate-950 text-slate-100 flex flex-col min-h-[60vh]" : "fixed inset-0 z-[65] bg-slate-950 text-slate-100 flex flex-col"}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div>
          <div className="font-bold text-sm">Promo Kasir</div>
          <div className="text-[11px] text-slate-500">{rows ? `${hitung.berjalan} berjalan · ${hitung.semua} promo` : "Memuat…"} · diskon per barang dengan tanggal mulai & selesai</div>
        </div>
        {!inline && (
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        )}
      </header>

      <KartuGrosir />

      <div className="p-3 space-y-2.5 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode, nama barang, nama promo…" className={`${inp} pl-9`} />
          </div>
          <button
            onClick={() => setForm({ promo: {} })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm px-3 py-2 rounded-lg"
          >
            <Plus size={15} /> Tambah promo
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTER.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                filter === k ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-slate-700 text-slate-300 hover:border-amber-500/60"
              }`}
            >
              {label}
              {rows ? ` (${hitung[k]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="mx-3 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{err}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {rows === null ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Memuat promo…
          </div>
        ) : tampil.length === 0 ? (
          <div className="mt-12 text-center text-sm text-slate-400">
            <BadgePercent size={28} className="mx-auto mb-2 text-slate-600" />
            {rows.length === 0 ? "Belum ada promo." : "Tidak ada promo yang cocok."}
            {rows.length === 0 && <div className="text-xs text-slate-500 mt-1">Tekan “Tambah promo” untuk membuat promo pertama.</div>}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {tampil.map((p) => {
              const perKat = !p.sku && !!p.kategori;
              const b = perKat ? null : peta.get(p.sku);
              const jumlahBarang = perKat ? barang.filter((x) => !x.nonaktif && normKat(x.kategori) === normKat(p.kategori)).length : 0;
              const harga = Number(b?.harga_jual) || 0;
              const st = STATUS[p.status];
              const potong = hitungDiskonPromo(harga, 1, p);
              return (
                <div key={p.id} className={`rounded-2xl p-3.5 border bg-slate-900/70 ${p.status === "berjalan" ? "border-emerald-500/40" : "border-slate-800"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 leading-snug">
                        {perKat ? `Kategori ${p.kategori}` : b?.nama || <span className="text-red-400">Barang tidak ditemukan</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {perKat ? `${jumlahBarang} barang aktif` : p.sku}
                        {p.nama ? ` · ${p.nama}` : ""}
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex items-end justify-between gap-3 mt-3">
                    <div>
                      <div className="text-base font-bold text-emerald-400 tabular-nums">Diskon {labelDiskon(p)}</div>
                      {harga > 0 && (
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          <span className="line-through">{fmtRp(harga)}</span> → <span className="text-slate-300">{fmtRp(harga - potong)}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 text-right tabular-nums">
                      {tglPendek(p.mulai)}
                      <br />s/d {tglPendek(p.selesai)}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-dashed border-slate-800">
                    <button
                      onClick={() => toggleAktif(p)}
                      disabled={sibuk === p.id}
                      title={p.aktif ? "Nonaktifkan promo" : "Aktifkan promo"}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50 ${
                        p.aktif ? "border-slate-700 text-slate-300 hover:border-red-500/60 hover:text-red-300" : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                    >
                      {sibuk === p.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} {p.aktif ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button onClick={() => setForm({ promo: p })} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-500/60">
                      <Pencil size={13} /> Ubah
                    </button>
                    <button onClick={() => setHapus(p)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10" title="Hapus promo">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {form && <FormPromo promo={form.promo} barang={barang} onClose={tutupForm} onSelesai={selesaiForm} />}
      {hapus && <KonfirmasiHapus promo={hapus} onClose={() => setHapus(null)} onSelesai={selesaiForm} />}
    </div>
  );
}