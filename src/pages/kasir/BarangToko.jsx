import { useEffect, useMemo, useState } from "react";
import { X, Search, Plus, Loader2, AlertCircle, Pencil, ArrowDownToLine, ClipboardCheck, FileUp, Trash2, Camera, ImagePlus } from "lucide-react";
import { sb, sbAll, fmtRp, entitasSesi, sbUploadFoto, kompresFotoProduk } from "../../lib/api";
import { InputRupiah } from "../../components/ui";
import ImporBarangToko from "./ImporBarangToko";
import FotoMassalToko from "./FotoMassalToko";
import { FotoZoom, FotoThumb } from "./FotoZoom";

// =========================================================
// MASTER BARANG TOKO (offline store) — terpisah dari Master Barang gudang besar.
// Dibuka dari tombol "Barang Toko" di header kasir DAN dari Master Barang > "Barang Toko (Kasir)"
// (mode inline). Keduanya HANYA untuk role superappa.
//  - Tambah / ubah barang toko (kode toko bebas; boleh ditautkan ke SKU gudang;
//    barcode = SKU gudang kalau tertaut, selain itu bebas)
//  - Foto barang         : bisa difoto / dipilih dari galeri saat tambah atau ubah (disimpan di kolom foto_url)
//  - Foto massal         : tombol Foto di header (FotoMassalToko.jsx), cocokkan nama file dengan kode/barcode/nama
//  - Mutasi dari gudang  : fungsi database toko_mutasi_dari_gudang (atomik)
//  - Opname              : fungsi database toko_opname (koreksi stok hasil hitung fisik)
//  - Hapus               : HANYA kalau stok toko 0 (dicek di layar DAN di database lewat filter stok=eq.0)
// Stok toko TIDAK bisa diketik langsung di form barang — hanya berubah lewat mutasi,
// penjualan kasir, atau opname, supaya selalu ada catatannya (toko_stok_mutasi).
// =========================================================

export const inp =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";

export function pesanError(e) {
  const msg = String(e?.message || e || "");
  const [kode, a, b] = (msg.match(/[A-Z_]{4,}(\|[^\n]*)?/)?.[0] || "").split("|");
  switch (kode) {
    case "STOK_TOKO_KURANG":
      return `Stok toko ${a} hanya ${b}.`;
    case "STOK_GUDANG_KURANG":
      return `Stok gudang ${a} hanya ${b}.`;
    case "TIDAK_TERTAUT":
      return `Barang ${a} belum ditautkan ke SKU gudang. Isi "SKU gudang" lewat tombol ubah.`;
    case "SKU_GUDANG_TIDAK_ADA":
      return `SKU gudang ${a} tidak ditemukan di Master Barang gudang.`;
    case "BARANG_TOKO_TIDAK_ADA":
      return `Barang toko ${a} tidak ditemukan.`;
    case "QTY_TIDAK_VALID":
      return "Jumlah tidak valid.";
    default:
      return msg || "Terjadi kesalahan";
  }
}

export function Kerangka({ judul, onClose, children, lebar = "sm:max-w-md" }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className={`w-full ${lebar} bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="font-bold">{judul}</div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

export const Galat = ({ pesan }) =>
  pesan ? (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{pesan}</span>
    </div>
  ) : null;

function FormBarang({ barang, onSimpan, onClose }) {
  const baru = !barang.id;
  const [f, setF] = useState({
    kode: barang.kode || "",
    nama: barang.nama || "",
    kategori: barang.kategori || "",
    barcode: barang.barcode || "",
    harga_jual: barang.harga_jual ?? "",
    hpp: barang.hpp ?? "",
    sku_gudang: barang.sku_gudang || "",
    nonaktif: !!barang.nonaktif,
  });
  const [fotoFile, setFotoFile] = useState(null); // foto baru yang dipilih (belum diunggah)
  const [fotoUrl, setFotoUrl] = useState(barang.foto_url || ""); // foto tersimpan; kosong = tanpa foto
  const [fotoPreview, setFotoPreview] = useState("");
  const [zoomFoto, setZoomFoto] = useState(false);
  useEffect(() => {
    if (!fotoFile) return setFotoPreview("");
    const u = URL.createObjectURL(fotoFile);
    setFotoPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [fotoFile]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const simpan = async () => {
    const kode = f.kode.trim();
    if (!kode || !f.nama.trim()) return setError("Kode dan nama wajib diisi.");
    if (!(Number(f.harga_jual) > 0)) return setError("Harga jual harus lebih dari 0.");
    setSaving(true);
    setError("");
    const data = {
      nama: f.nama.trim(),
      kategori: f.kategori.trim() || null,
      // Barang dari Master Barang (ada SKU gudang): barcode = SKU gudang.
      // Barang lain (import / manual): barcode bebas; kosong -> sama dengan kode toko.
      barcode: f.sku_gudang.trim() || f.barcode.trim() || (baru ? kode : barang.kode),
      harga_jual: Math.round(Number(f.harga_jual) || 0),
      hpp: Math.round(Number(f.hpp) || 0),
      sku_gudang: f.sku_gudang.trim() || null,
      nonaktif: f.nonaktif,
    };
    try {
      if (fotoFile) {
        const kecil = await kompresFotoProduk(fotoFile);
        const ext = (kecil.name.split(".").pop() || "jpg").toLowerCase();
        const nama = kode.replace(/[^a-zA-Z0-9-_]/g, "-");
        data.foto_url = await sbUploadFoto(kecil, `toko/${nama}-${Date.now()}.${ext}`);
      } else if (!baru && (barang.foto_url || "") !== fotoUrl) {
        data.foto_url = fotoUrl || null; // foto dihapus
      }
      if (baru) await sb("master_toko", { method: "POST", body: JSON.stringify({ kode, ...data }) });
      else await sb(`master_toko?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
      onSimpan();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={baru ? "Tambah Barang Toko" : `Ubah ${barang.kode}`} onClose={onClose}>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Kode toko {!baru && "(tidak bisa diubah)"}</div>
        <input value={f.kode} onChange={(e) => set("kode")(e.target.value)} disabled={!baru} className={`${inp} font-mono disabled:opacity-60`} />
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Nama barang</div>
        <input value={f.nama} onChange={(e) => set("nama")(e.target.value)} className={inp} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">Harga jual</div>
          <InputRupiah value={f.harga_jual} onChange={set("harga_jual")} className={inp} placeholder="0" />
        </label>
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">HPP</div>
          <InputRupiah value={f.hpp} onChange={set("hpp")} className={inp} placeholder="0" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">Kategori</div>
          <input value={f.kategori} onChange={(e) => set("kategori")(e.target.value)} className={inp} />
        </label>
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">
            {f.sku_gudang.trim() ? "Barcode (otomatis = SKU gudang)" : "Barcode (bebas; kosong = sama dengan kode)"}
          </div>
          <input
            value={f.sku_gudang.trim() ? f.sku_gudang.trim() : f.barcode}
            onChange={(e) => set("barcode")(e.target.value)}
            disabled={!!f.sku_gudang.trim()}
            placeholder={baru ? f.kode : barang.kode}
            className={`${inp} font-mono disabled:opacity-60`}
          />
        </label>
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Foto barang (opsional)</div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center flex-shrink-0">
            {fotoPreview || fotoUrl ? (
              <button type="button" onClick={() => setZoomFoto(true)} title="Klik untuk perbesar" className="w-full h-full cursor-zoom-in">
                <img src={fotoPreview || fotoUrl} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </button>
            ) : (
              <Camera size={20} className="text-slate-600" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
              <Camera size={14} /> {fotoPreview || fotoUrl ? "Ganti foto" : "Ambil / pilih foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) setFotoFile(file);
                }}
              />
            </label>
            {(fotoPreview || fotoUrl) && (
              <button type="button" onClick={() => { setFotoFile(null); setFotoUrl(""); }} className="text-left text-xs text-red-400 hover:text-red-300">
                Hapus foto
              </button>
            )}
          </div>
        </div>
      </div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">SKU gudang (kosong kalau barang ini tidak berasal dari gudang)</div>
        <input value={f.sku_gudang} onChange={(e) => set("sku_gudang")(e.target.value)} className={`${inp} font-mono`} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={f.nonaktif} onChange={(e) => set("nonaktif")(e.target.checked)} /> Nonaktif (tidak muncul di kasir)
      </label>
      <Galat pesan={error} />
      <button
        onClick={simpan}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan
      </button>
      {zoomFoto && (fotoPreview || fotoUrl) && (
        <FotoZoom src={fotoPreview || fotoUrl} judul={baru ? f.nama || "Foto barang" : `${barang.kode} · ${f.nama}`} onClose={() => setZoomFoto(false)} />
      )}
    </Kerangka>
  );
}

function FormMutasi({ barang, onSelesai, onClose }) {
  const [gudang, setGudang] = useState(null); // stok gudang untuk SKU tertaut
  const [arah, setArah] = useState("ke_toko"); // "ke_toko" (gudang -> toko) | "ke_gudang" (toko -> gudang)
  const [qty, setQty] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!barang.sku_gudang) return setGudang(-1);
    sb(`sku_master?select=sku,stok&sku=eq.${encodeURIComponent(barang.sku_gudang)}`)
      .then((r) => setGudang(r?.[0] ? Number(r[0].stok) || 0 : -1))
      .catch(() => setGudang(-1));
  }, [barang.sku_gudang]);

  const jalankan = async () => {
    const n = parseInt(qty, 10);
    if (!(n > 0)) return setError("Isi jumlah lebih dari 0.");
    if (arah === "ke_gudang" && n > (Number(barang.stok) || 0)) {
      return setError(`Stok toko ${barang.kode} hanya ${Number(barang.stok) || 0}.`);
    }
    setSaving(true);
    setError("");
    try {
      await sb(arah === "ke_gudang" ? "rpc/toko_kembalikan_ke_gudang" : "rpc/toko_mutasi_dari_gudang", {
        method: "POST",
        body: JSON.stringify({ p: { entitas: entitasSesi(), kode: barang.kode, qty: n, catatan: catatan.trim() || null } }),
      });
      onSelesai();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={`${arah === "ke_gudang" ? "Kembalikan ke gudang" : "Mutasi ke toko"} — ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
        {[["ke_toko", "Gudang → Toko"], ["ke_gudang", "Toko → Gudang"]].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => { setArah(v); setError(""); }}
            className={`py-1.5 rounded-md font-semibold ${arah === v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {!barang.sku_gudang ? (
        <Galat pesan="Barang ini belum ditautkan ke SKU gudang. Isi dulu lewat tombol ubah." />
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500">Stok gudang ({barang.sku_gudang})</div>
            <div className="font-semibold">{gudang === null ? "…" : gudang < 0 ? "tidak ditemukan" : gudang}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500">Stok toko sekarang</div>
            <div className="font-semibold">{barang.stok}</div>
          </div>
        </div>
      )}
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">{arah === "ke_gudang" ? "Jumlah dikembalikan ke gudang" : "Jumlah dipindah ke toko"}</div>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} placeholder="0" />
      </label>
      <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={inp} />
      <Galat pesan={error} />
      <button
        onClick={jalankan}
        disabled={saving || !barang.sku_gudang}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Pindahkan
      </button>
    </Kerangka>
  );
}

function FormOpname({ barang, onSelesai, onClose }) {
  const [stok, setStok] = useState(String(barang.stok));
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const jalankan = async () => {
    const n = parseInt(stok, 10);
    if (!(n >= 0)) return setError("Isi stok hasil hitung fisik.");
    setSaving(true);
    setError("");
    try {
      await sb("rpc/toko_opname", {
        method: "POST",
        body: JSON.stringify({ p: { entitas: entitasSesi(), kode: barang.kode, stok_baru: n, catatan: catatan.trim() || null } }),
      });
      onSelesai();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  };

  const selisih = (parseInt(stok, 10) || 0) - barang.stok;
  return (
    <Kerangka judul={`Opname — ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      <div className="text-xs text-slate-500">Stok tercatat: {barang.stok}</div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Stok hasil hitung fisik</div>
        <input value={stok} onChange={(e) => setStok(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} />
      </label>
      {selisih !== 0 && <div className={`text-sm ${selisih < 0 ? "text-red-300" : "text-emerald-300"}`}>Selisih: {selisih > 0 ? "+" : ""}{selisih}</div>}
      <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (mis. alasan selisih)" className={inp} />
      <Galat pesan={error} />
      <button
        onClick={jalankan}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan Opname
      </button>
    </Kerangka>
  );
}

function FormHapus({ barang, onSelesai, onClose }) {
  const stok = Number(barang.stok) || 0;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hapus = async () => {
    if (stok !== 0) return setError(`Stok toko masih ${stok}. Barang hanya bisa dihapus kalau stoknya 0 (lakukan opname atau kembalikan ke gudang dulu).`);
    setSaving(true);
    setError("");
    try {
      // Filter stok=eq.0 ikut dikirim ke database: kalau stok berubah sejak halaman dibuka, tidak terhapus.
      const hasil = await sb(`master_toko?id=eq.${barang.id}&stok=eq.0`, { method: "DELETE" });
      if (Array.isArray(hasil) && hasil.length === 0) {
        throw new Error("Barang tidak terhapus: stok sudah tidak 0, barang sudah tidak ada, atau Anda tidak punya izin.");
      }
      onSelesai();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={`Hapus ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      {stok === 0 ? (
        <div className="text-sm text-slate-400">
          Barang ini akan dihapus dari Barang Toko dan tidak muncul lagi di kasir. Kalau barang sudah pernah dipakai di transaksi, hapus akan ditolak — pakai <b className="text-slate-200">Nonaktif</b> lewat tombol ubah.
        </div>
      ) : (
        <Galat pesan={`Stok toko masih ${stok}. Barang hanya bisa dihapus kalau stoknya 0 — lakukan opname atau kembalikan ke gudang dulu.`} />
      )}
      <Galat pesan={stok === 0 ? error : ""} />
      <button
        onClick={hapus}
        disabled={saving || stok !== 0}
        className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Hapus Barang
      </button>
    </Kerangka>
  );
}

// onBerubah: dipanggil setelah mutasi gudang <-> toko, supaya data gudang di SELMA ikut dimuat ulang.
export default function BarangToko({ onClose, inline = false, onBerubah }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // {barang}
  const [mutasi, setMutasi] = useState(null);
  const [opname, setOpname] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [impor, setImpor] = useState(false);
  const [fotoMassal, setFotoMassal] = useState(false);

  const muat = async () => {
    setError("");
    try {
      setRows((await sbAll("master_toko?select=*&order=kode")) || []);
    } catch (e) {
      setError(pesanError(e));
      setRows([]);
    }
  };
  useEffect(() => {
    muat();
  }, []);

  const tampil = useMemo(() => {
    const kata = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || []).filter((r) => {
      const j = [r.kode, r.nama, r.kategori, r.barcode, r.sku_gudang].filter(Boolean).join(" ").toLowerCase();
      return kata.every((k) => j.includes(k));
    });
  }, [rows, q]);

  const selesai = () => {
    setForm(null);
    setMutasi(null);
    setOpname(null);
    setHapus(null);
    muat();
  };

  return (
    <div className={inline ? "rounded-xl border border-slate-800 bg-slate-950 text-slate-100 flex flex-col min-h-[60vh]" : "fixed inset-0 z-[65] bg-slate-950 text-slate-100 flex flex-col"}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div>
          <div className="font-bold text-sm">Barang Toko (Kasir)</div>
          <div className="text-[11px] text-slate-500">{rows ? `${rows.length} barang` : "Memuat…"} · stok & harga khusus toko</div>
        </div>
        {!inline && (
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        )}
      </header>

      <div className="p-3 flex items-center gap-2 border-b border-slate-800">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode, nama, barcode…" className={`${inp} pl-9`} />
        </div>
        <button
          onClick={() => setImpor(true)}
          className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 font-semibold text-sm px-3 py-2 rounded-lg"
        >
          <FileUp size={15} /> Import
        </button>
        <button
          onClick={() => setFotoMassal(true)}
          title="Foto massal (cocokkan nama file dengan kode/barcode/nama)"
          className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 font-semibold text-sm px-3 py-2 rounded-lg"
        >
          <ImagePlus size={15} /> Foto
        </button>
        <button
          onClick={() => setForm({ barang: {} })}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm px-3 py-2 rounded-lg"
        >
          <Plus size={15} /> Tambah
        </button>
      </div>

      <div className={inline ? "flex-1 p-3" : "flex-1 overflow-y-auto p-3"}>
        {error && <Galat pesan={error} />}
        {!rows ? (
          <div className="py-10 flex justify-center text-slate-500">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : tampil.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {rows.length === 0 ? "Belum ada barang toko. Tambah manual, import dari file, atau pindahkan dari Master Barang." : "Tidak ada yang cocok."}
          </div>
        ) : (
          <ul className="space-y-1.5 max-w-3xl mx-auto">
            {tampil.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-800 ${r.nonaktif ? "opacity-50" : ""}`}>
                {r.foto_url && (
                  <FotoThumb
                    src={r.foto_url}
                    judul={`${r.kode} · ${r.nama}`}
                    className="w-11 h-11 rounded-lg object-cover bg-slate-800"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.nama}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {r.kode}
                    {r.sku_gudang && r.sku_gudang !== r.kode ? ` ← ${r.sku_gudang}` : ""}
                    {r.nonaktif ? " · nonaktif" : ""}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold text-amber-400">{fmtRp(r.harga_jual)}</div>
                  <div className={`text-[11px] ${r.stok <= 0 ? "text-red-400" : "text-slate-400"}`}>stok {r.stok}</div>
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button onClick={() => setMutasi(r)} title="Mutasi gudang ⇄ toko" className="p-2 text-slate-400 hover:text-amber-400">
                    <ArrowDownToLine size={16} />
                  </button>
                  <button onClick={() => setOpname(r)} title="Opname" className="p-2 text-slate-400 hover:text-amber-400">
                    <ClipboardCheck size={16} />
                  </button>
                  <button onClick={() => setForm({ barang: r })} title="Ubah" className="p-2 text-slate-400 hover:text-amber-400">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setHapus(r)} title="Hapus (stok harus 0)" className="p-2 text-slate-400 hover:text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {impor && <ImporBarangToko barangAda={rows || []} onSelesai={() => { setImpor(false); muat(); }} onClose={() => setImpor(false)} />}
      {fotoMassal && <FotoMassalToko barangAda={rows || []} onSelesai={() => { setFotoMassal(false); muat(); }} onClose={() => setFotoMassal(false)} />}
      {form && <FormBarang barang={form.barang} onSimpan={selesai} onClose={() => setForm(null)} />}
      {mutasi && <FormMutasi barang={mutasi} onSelesai={() => { selesai(); onBerubah?.(); }} onClose={() => setMutasi(null)} />}
      {hapus && <FormHapus barang={hapus} onSelesai={selesai} onClose={() => setHapus(null)} />}
      {opname && <FormOpname barang={opname} onSelesai={selesai} onClose={() => setOpname(null)} />}
    </div>
  );
}
