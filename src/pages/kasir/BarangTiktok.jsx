import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Loader2, Pencil, ArrowDownToLine, ClipboardCheck, Trash2, Camera, ImagePlus, FileDown, Check, Send, Radio } from "lucide-react";
import { sb, sbAll, fmtRp, entitasSesi, sbUploadFoto, kompresFotoProduk } from "../../lib/api";
import { InputRupiah } from "../../components/ui";
import { getSession } from "../../lib/auth";
import { Kerangka, Galat, inp, pesanError } from "./BarangToko";
import TambahDariMaster, { muatKonteksDariTiktok } from "./TambahDariMaster";
import PindahKeToko from "./PindahKeToko";
import { FotoZoom, FotoThumb } from "./FotoZoom";
import { rapikanKodeLive, sinkronAliasKodeLive } from "./kodeLiveAlias";

// =========================================================
// BARANG TIKTOK — seperti Barang Toko (master_toko), tapi untuk jualan TikTok dan punya KODE LIVE.
// Tabel master_tiktok + tiktok_stok_mutasi (supabase/migrations/20261124_barang_tiktok.sql), per entitas.
//  - Dari Master        : pilih SKU di Master Barang -> jadi barang TikTok (kode otomatis ENT-TT-0001, harga jual = Ecer, HPP dari Master)
//  - Mutasi             : Gudang <-> TikTok (fungsi database tiktok_mutasi_dari_gudang / tiktok_kembalikan_ke_gudang)
//  - Kirim ke Toko      : stok TikTok dipindah ke Barang Toko (fungsi toko_ambil_dari_tiktok); barang toko dibuat otomatis kalau belum ada
//  - Opname             : tiktok_opname
//  - Kode live          : diisi di sini; otomatis dicatat juga di daftar Kode Live TikTok (marketplace_sku_alias) untuk Rincian Penjualan
//  - Hapus              : hanya kalau stok 0
// Stok TIDAK bisa diketik langsung di form barang — hanya berubah lewat mutasi / opname supaya selalu ada catatannya.
// Hanya role dengan izin "sku.barang_tiktok" (Super Appa selalu boleh; dijaga di SkuHarga.jsx, tab "Barang TikTok (Kode Live)" di Master Barang).
// =========================================================

const TABEL = "master_tiktok";
const PER_TAHAP = 50;
const kolator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
const stokAngka = (r) => Number(r.stok) || 0;

const FILTER = [
  ["semua", "Semua"],
  ["ada", "Ada stok"],
  ["habis", "Stok habis"],
  ["tanpalive", "Tanpa kode live"],
  ["tanpafoto", "Tanpa foto"],
  ["nonaktif", "Nonaktif"],
];
const cocokFilter = (r, f) =>
  f === "habis" ? stokAngka(r) <= 0
  : f === "ada" ? stokAngka(r) > 0
  : f === "tanpalive" ? !r.kode_live
  : f === "tanpafoto" ? !r.foto_url
  : f === "nonaktif" ? !!r.nonaktif
  : true;
const URUTAN = [
  ["kode", "Urut: Kode"],
  ["live", "Urut: Kode live"],
  ["nama", "Urut: Nama A–Z"],
  ["stok-asc", "Urut: Stok terkecil"],
  ["stok-desc", "Urut: Stok terbanyak"],
];
const PEMBANDING = {
  kode: (a, b) => kolator.compare(a.kode || "", b.kode || ""),
  live: (a, b) => kolator.compare(a.kode_live || "\uffff", b.kode_live || "\uffff"),
  nama: (a, b) => kolator.compare(a.nama || "", b.nama || ""),
  "stok-asc": (a, b) => stokAngka(a) - stokAngka(b) || kolator.compare(a.nama || "", b.nama || ""),
  "stok-desc": (a, b) => stokAngka(b) - stokAngka(a) || kolator.compare(a.nama || "", b.nama || ""),
};
const KOLOM = "lg:grid-cols-[3rem_minmax(0,1fr)_7rem_6rem_6.5rem_4rem_11rem]";

const pesan = (e) => {
  const m = String(e?.message || e || "");
  if (/master_tiktok_kode_live_uq|duplicate key/i.test(m)) return "Kode live ini sudah dipakai barang TikTok lain.";
  if (/master_tiktok|tiktok_(mutasi|kembalikan|opname)|toko_ambil_dari_tiktok|PGRST20[24]|does not exist|schema cache/i.test(m) && !/[A-Z_]{4,}\|/.test(m)) {
    return "Fitur Barang TikTok belum aktif di database. Jalankan supabase/migrations/20261124_barang_tiktok.sql di Supabase > SQL Editor.";
  }
  return pesanError(e);
};

async function namaUsahaSesi() {
  try {
    const e = await sb(`master_data?select=kode,label&tipe=eq.entitas&kode=eq.${encodeURIComponent(entitasSesi())}`);
    if (e?.[0]?.label) return e[0].label;
  } catch {
    /* pakai kode entitas */
  }
  return String(entitasSesi());
}

// ---------------------------------------------------------
function FormBarang({ barang, kodeSaran, onSimpan, onClose }) {
  const baru = !barang.id;
  const [f, setF] = useState({
    kode: barang.kode || kodeSaran || "",
    kode_live: barang.kode_live || "",
    nama: barang.nama || "",
    kategori: barang.kategori || "",
    harga_jual: barang.harga_jual ?? "",
    hpp: barang.hpp ?? "",
    sku_gudang: barang.sku_gudang || "",
    nonaktif: !!barang.nonaktif,
  });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(barang.foto_url || "");
  const [fotoPreview, setFotoPreview] = useState("");
  const [zoomFoto, setZoomFoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!fotoFile) return setFotoPreview("");
    const u = URL.createObjectURL(fotoFile);
    setFotoPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [fotoFile]);

  const simpan = async () => {
    const kode = f.kode.trim();
    if (!kode || !f.nama.trim()) return setError("Kode dan nama wajib diisi.");
    if (!(Number(f.harga_jual) > 0)) return setError("Harga jual harus lebih dari 0.");
    setSaving(true);
    setError("");
    const live = rapikanKodeLive(f.kode_live);
    const sku = f.sku_gudang.trim();
    const data = {
      nama: f.nama.trim(),
      kategori: f.kategori.trim() || null,
      kode_live: live || null,
      barcode: sku || (baru ? kode : barang.barcode || barang.kode),
      harga_jual: Math.round(Number(f.harga_jual) || 0),
      hpp: Math.round(Number(f.hpp) || 0),
      sku_gudang: sku || null,
      nonaktif: f.nonaktif,
    };
    try {
      if (fotoFile) {
        const kecil = await kompresFotoProduk(fotoFile);
        const ext = (kecil.name.split(".").pop() || "jpg").toLowerCase();
        data.foto_url = await sbUploadFoto(kecil, `tiktok/${kode.replace(/[^a-zA-Z0-9-_]/g, "-")}-${Date.now()}.${ext}`);
      } else if (!baru && (barang.foto_url || "") !== fotoUrl) {
        data.foto_url = fotoUrl || null;
      }
      if (baru) await sb(TABEL, { method: "POST", body: JSON.stringify({ kode, ...data }) });
      else await sb(`${TABEL}?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
    } catch (e) {
      setError(pesan(e));
      setSaving(false);
      return;
    }
    // Catat kode live ke daftar Kode Live TikTok (butuh SKU gudang). Gagal di sini tidak membatalkan simpan barang.
    let catatan = "";
    if (live && sku) {
      try {
        const r = await sinkronAliasKodeLive(live, sku);
        if (r.status === "beda") catatan = `Barang tersimpan. Tapi kode live ${live} di daftar Kode Live TikTok sudah dipetakan ke SKU ${r.skuLama}, jadi tidak ditimpa. Ubah di tab Kode Live kalau memang perlu.`;
      } catch {
        catatan = `Barang tersimpan, tapi kode live ${live} belum tercatat di daftar Kode Live TikTok (coba simpan ulang).`;
      }
    } else if (live && !sku) {
      catatan = "Barang tersimpan. Kode live baru dicatat di daftar Kode Live TikTok (untuk HPP penjualan) kalau SKU gudang diisi.";
    }
    setSaving(false);
    if (catatan) setInfo(catatan);
    else onSimpan();
  };

  if (info) {
    return (
      <Kerangka judul="Tersimpan" onClose={onSimpan}>
        <div className="text-sm text-amber-300">{info}</div>
        <button onClick={onSimpan} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">Selesai</button>
      </Kerangka>
    );
  }

  return (
    <Kerangka judul={baru ? "Tambah Barang TikTok" : `Ubah ${barang.kode}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">Kode {!baru && "(tidak bisa diubah)"}</div>
          <input value={f.kode} onChange={(e) => set("kode")(e.target.value)} disabled={!baru} className={`${inp} font-mono disabled:opacity-60`} />
        </label>
        <label className="block">
          <div className="text-xs text-amber-300 mb-1">Kode live</div>
          <input value={f.kode_live} onChange={(e) => set("kode_live")(e.target.value)} className={`${inp} font-mono`} placeholder="mis. A-11" />
        </label>
      </div>
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
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Kategori</div>
        <input value={f.kategori} onChange={(e) => set("kategori")(e.target.value)} className={inp} />
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">SKU gudang (wajib kalau stoknya mau dipindah dari/ke Master Barang atau Toko)</div>
        <input value={f.sku_gudang} onChange={(e) => set("sku_gudang")(e.target.value)} className={`${inp} font-mono`} />
      </label>
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
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setFotoFile(file); }} />
            </label>
            {(fotoPreview || fotoUrl) && (
              <button type="button" onClick={() => { setFotoFile(null); setFotoUrl(""); }} className="text-left text-xs text-red-400 hover:text-red-300">Hapus foto</button>
            )}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={f.nonaktif} onChange={(e) => set("nonaktif")(e.target.checked)} /> Nonaktif
      </label>
      <Galat pesan={error} />
      <button onClick={simpan} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan
      </button>
      {zoomFoto && (fotoPreview || fotoUrl) && <FotoZoom src={fotoPreview || fotoUrl} judul={`${f.kode} · ${f.nama}`} onClose={() => setZoomFoto(false)} />}
    </Kerangka>
  );
}

// ---------------------------------------------------------
function FormMutasi({ barang, onSelesai, onClose }) {
  const [gudang, setGudang] = useState(null);
  const [arah, setArah] = useState("ke_tiktok"); // "ke_tiktok" (gudang -> TikTok) | "ke_gudang" (TikTok -> gudang)
  const [qty, setQty] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);
  const [errPdf, setErrPdf] = useState("");

  useEffect(() => {
    if (!barang.sku_gudang) return setGudang(-1);
    sb(`sku_master?select=sku,stok&sku=eq.${encodeURIComponent(barang.sku_gudang)}`)
      .then((r) => setGudang(r?.[0] ? Number(r[0].stok) || 0 : -1))
      .catch(() => setGudang(-1));
  }, [barang.sku_gudang]);

  const jalankan = async () => {
    const n = parseInt(qty, 10);
    if (!(n > 0)) return setError("Isi jumlah lebih dari 0.");
    if (arah === "ke_gudang" && n > stokAngka(barang)) return setError(`Stok TikTok ${barang.kode} hanya ${stokAngka(barang)}.`);
    setSaving(true);
    setError("");
    try {
      await sb(arah === "ke_gudang" ? "rpc/tiktok_kembalikan_ke_gudang" : "rpc/tiktok_mutasi_dari_gudang", {
        method: "POST",
        body: JSON.stringify({ p: { entitas: entitasSesi(), kode: barang.kode, qty: n, catatan: catatan.trim() || null } }),
      });
      setHasil({ arah, qty: n, catatan: catatan.trim(), waktu: new Date() });
    } catch (e) {
      setError(pesan(e));
    } finally {
      setSaving(false);
    }
  };

  const unduhPdf = async () => {
    setErrPdf("");
    try {
      const ses = getSession();
      const { buatPdfPemindahanToko } = await import("../../lib/PdfPemindahanToko");
      buatPdfPemindahanToko({
        namaUsaha: await namaUsahaSesi(),
        petugas: ses?.nama || ses?.username || "",
        waktu: hasil.waktu,
        catatan: hasil.catatan,
        arah: hasil.arah === "ke_gudang" ? "ke_gudang" : "ke_toko",
        labelKode: "Kode TikTok",
        judul: hasil.arah === "ke_gudang" ? "BARANG DIKEMBALIKAN DARI BARANG TIKTOK KE GUDANG" : "BARANG DIAMBIL DARI MASTER BARANG KE BARANG TIKTOK",
        baris: [{ sku: barang.sku_gudang, kode: barang.kode, nama: barang.nama || barang.kode, qty: hasil.qty }],
      });
    } catch (e) {
      setErrPdf(`Gagal membuat PDF: ${e?.message || e}`);
    }
  };

  if (hasil) {
    const kg = hasil.arah === "ke_gudang";
    return (
      <Kerangka judul={kg ? "Hasil pengembalian ke gudang" : "Hasil mutasi ke TikTok"} onClose={onSelesai}>
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <Check size={15} /> {hasil.qty} pcs {barang.kode} {kg ? "dikembalikan dari TikTok ke gudang" : "dipindah dari gudang ke TikTok"}
        </div>
        <button onClick={unduhPdf} className="w-full flex items-center justify-center gap-2 border border-amber-500/60 hover:bg-amber-500/10 text-amber-300 font-semibold py-3 rounded-2xl">
          <FileDown size={16} /> Unduh PDF
        </button>
        <Galat pesan={errPdf} />
        <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">Selesai</button>
      </Kerangka>
    );
  }

  return (
    <Kerangka judul={`${arah === "ke_gudang" ? "Kembalikan ke gudang" : "Mutasi ke TikTok"} — ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
        {[["ke_tiktok", "Gudang → TikTok"], ["ke_gudang", "TikTok → Gudang"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setArah(v); setError(""); }} className={`py-1.5 rounded-md font-semibold ${arah === v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
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
            <div className="text-[11px] text-slate-500">Stok TikTok sekarang</div>
            <div className="font-semibold">{stokAngka(barang)}</div>
          </div>
        </div>
      )}
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">{arah === "ke_gudang" ? "Jumlah dikembalikan ke gudang" : "Jumlah dipindah ke TikTok"}</div>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} placeholder="0" />
      </label>
      <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={inp} />
      <Galat pesan={error} />
      <button onClick={jalankan} disabled={saving || !barang.sku_gudang} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Pindahkan
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
function FormOpname({ barang, onSelesai, onClose }) {
  const [stok, setStok] = useState(String(stokAngka(barang)));
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const jalankan = async () => {
    const n = parseInt(stok, 10);
    if (!(n >= 0)) return setError("Isi stok hasil hitung fisik.");
    setSaving(true);
    setError("");
    try {
      await sb("rpc/tiktok_opname", {
        method: "POST",
        body: JSON.stringify({ p: { entitas: entitasSesi(), kode: barang.kode, stok_baru: n, catatan: catatan.trim() || null } }),
      });
      onSelesai();
    } catch (e) {
      setError(pesan(e));
    } finally {
      setSaving(false);
    }
  };

  const selisih = (parseInt(stok, 10) || 0) - stokAngka(barang);
  return (
    <Kerangka judul={`Opname — ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      <div className="text-xs text-slate-500">Stok TikTok tercatat: {stokAngka(barang)}</div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Stok hasil hitung fisik</div>
        <input value={stok} onChange={(e) => setStok(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} />
      </label>
      {selisih !== 0 && <div className={`text-sm ${selisih < 0 ? "text-red-300" : "text-emerald-300"}`}>Selisih: {selisih > 0 ? "+" : ""}{selisih}</div>}
      <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (mis. alasan selisih)" className={inp} />
      <Galat pesan={error} />
      <button onClick={jalankan} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan Opname
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
function FormHapus({ barang, onSelesai, onClose }) {
  const stok = stokAngka(barang);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hapus = async () => {
    if (stok !== 0) return setError(`Stok TikTok masih ${stok}. Barang hanya bisa dihapus kalau stoknya 0.`);
    setSaving(true);
    setError("");
    try {
      const h = await sb(`${TABEL}?id=eq.${barang.id}&stok=eq.0`, { method: "DELETE" });
      if (Array.isArray(h) && h.length === 0) throw new Error("Barang tidak terhapus: stok sudah tidak 0, barang sudah tidak ada, atau Anda tidak punya izin.");
      onSelesai();
    } catch (e) {
      setError(pesan(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Kerangka judul={`Hapus ${barang.kode}`} onClose={onClose}>
      <div className="text-sm text-slate-300">{barang.nama}</div>
      {stok === 0 ? (
        <div className="text-sm text-slate-400">Barang ini akan dihapus dari Barang TikTok. Daftar Kode Live TikTok tidak ikut berubah.</div>
      ) : (
        <Galat pesan={`Stok TikTok masih ${stok}. Barang hanya bisa dihapus kalau stoknya 0 — lakukan opname atau kembalikan ke gudang dulu.`} />
      )}
      <Galat pesan={stok === 0 ? error : ""} />
      <button onClick={hapus} disabled={saving || stok !== 0} className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Hapus Barang
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
function FotoBarang({ r }) {
  return (
    <div className="w-12 h-12 flex-shrink-0">
      {r.foto_url ? (
        <FotoThumb src={r.foto_url} judul={`${r.kode} · ${r.nama}`} className="w-12 h-12 rounded-lg object-cover bg-slate-800" />
      ) : (
        <div className="w-12 h-12 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-slate-700" title="Belum ada foto">
          <ImagePlus size={16} />
        </div>
      )}
    </div>
  );
}

function KodeLive({ v }) {
  return v ? (
    <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-1.5 py-0.5">
      <Radio size={11} /> {v}
    </span>
  ) : (
    <span className="text-[11px] text-slate-600">belum ada</span>
  );
}

function InfoBarang({ r }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium leading-snug line-clamp-2 break-words" title={r.nama}>{r.nama}</div>
      <div className="text-[11px] text-slate-500 font-mono truncate">
        {r.kode}
        {r.sku_gudang && r.sku_gudang !== r.kode ? ` ← ${r.sku_gudang}` : ""}
        {r.nonaktif ? <span className="ml-1.5 font-sans text-red-300">· nonaktif</span> : null}
      </div>
    </div>
  );
}

function AksiBarang({ r, onMutasi, onKeToko, onOpname, onUbah, onHapus }) {
  const tombol = "p-2 rounded-lg text-slate-400 hover:bg-slate-800";
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button onClick={() => onMutasi(r)} title="Mutasi gudang ⇄ TikTok" className={`${tombol} hover:text-amber-400`}><ArrowDownToLine size={16} /></button>
      <button onClick={() => onKeToko(r)} title="Kirim stok ke Barang Toko" className={`${tombol} hover:text-sky-400`}><Send size={16} /></button>
      <button onClick={() => onOpname(r)} title="Opname" className={`${tombol} hover:text-amber-400`}><ClipboardCheck size={16} /></button>
      <button onClick={() => onUbah(r)} title="Ubah" className={`${tombol} hover:text-amber-400`}><Pencil size={16} /></button>
      <button onClick={() => onHapus(r)} title="Hapus (stok harus 0)" className={`${tombol} hover:text-red-400`}><Trash2 size={16} /></button>
    </div>
  );
}

// onBerubah: dipanggil setelah stok gudang berubah, supaya data gudang di SELMA dimuat ulang.
export default function BarangTiktok({ onBerubah }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("semua");
  const [urut, setUrut] = useState("kode");
  const [batas, setBatas] = useState(PER_TAHAP);
  const [form, setForm] = useState(null);
  const [mutasi, setMutasi] = useState(null);
  const [opname, setOpname] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [dariMaster, setDariMaster] = useState(false);
  const [keToko, setKeToko] = useState(null); // konteks PindahKeToko (sumber TikTok)
  const [siapkan, setSiapkan] = useState(false);

  const muat = async () => {
    setError("");
    try {
      setRows((await sbAll(`${TABEL}?select=*&order=kode`)) || []);
    } catch (e) {
      setError(pesan(e));
      setRows([]);
    }
  };
  useEffect(() => { muat(); }, []);

  const hitung = useMemo(() => {
    const h = { semua: 0, ada: 0, habis: 0, tanpalive: 0, tanpafoto: 0, nonaktif: 0 };
    for (const r of rows || []) {
      h.semua++;
      if (stokAngka(r) > 0) h.ada++; else h.habis++;
      if (!r.kode_live) h.tanpalive++;
      if (!r.foto_url) h.tanpafoto++;
      if (r.nonaktif) h.nonaktif++;
    }
    return h;
  }, [rows]);
  const totalStok = useMemo(() => (rows || []).reduce((n, r) => n + stokAngka(r), 0), [rows]);

  const tampil = useMemo(() => {
    const kata = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || [])
      .filter((r) => {
        if (!cocokFilter(r, filter)) return false;
        if (!kata.length) return true;
        const j = [r.kode, r.kode_live, r.nama, r.kategori, r.barcode, r.sku_gudang].filter(Boolean).join(" ").toLowerCase();
        return kata.every((k) => j.includes(k));
      })
      .sort(PEMBANDING[urut] || PEMBANDING.kode);
  }, [rows, q, filter, urut]);
  useEffect(() => { setBatas(PER_TAHAP); }, [q, filter, urut]);
  const terlihat = useMemo(() => tampil.slice(0, batas), [tampil, batas]);
  const sisa = tampil.length - terlihat.length;

  // Kode saran untuk tambah manual: ENT-TT-nomor berikutnya
  const kodeSaran = useMemo(() => {
    const awal = `${String(entitasSesi()).toUpperCase()}-TT`;
    let mx = 0;
    for (const r of rows || []) {
      const m = String(r.kode || "").toUpperCase().match(new RegExp(`^${awal}-(\\d+)$`));
      if (m) mx = Math.max(mx, parseInt(m[1], 10));
    }
    return `${awal}-${String(mx + 1).padStart(4, "0")}`;
  }, [rows]);

  const mulaiKeToko = async (r) => {
    if (!r.sku_gudang) return setError(`Barang ${r.kode} belum ditautkan ke SKU gudang. Isi dulu lewat tombol ubah.`);
    setSiapkan(true);
    setError("");
    try {
      const k = await muatKonteksDariTiktok([r]);
      if (!k.daftar.length) throw new Error(`SKU ${r.sku_gudang} tidak ditemukan di Master Barang.`);
      setKeToko(k);
    } catch (e) {
      setError(pesan(e));
    } finally {
      setSiapkan(false);
    }
  };

  const selesai = () => {
    setForm(null); setMutasi(null); setOpname(null); setHapus(null); setDariMaster(false); setKeToko(null);
    muat();
  };

  const aksi = { onMutasi: setMutasi, onKeToko: mulaiKeToko, onOpname: setOpname, onUbah: (x) => setForm({ barang: x }), onHapus: setHapus };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100 flex flex-col min-h-[60vh]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div>
          <div className="font-bold text-sm">Barang TikTok</div>
          <div className="text-[11px] text-slate-500">{rows ? `${rows.length} barang · ${totalStok.toLocaleString("id-ID")} pcs` : "Memuat…"} · stok & kode live khusus TikTok</div>
        </div>
      </header>

      <div className="p-3 space-y-2.5 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode live, kode, nama, SKU…" className={`${inp} pl-9`} />
          </div>
          <button onClick={() => setDariMaster(true)} title="Pilih barang dari Master Barang untuk dijadikan barang TikTok" className="flex items-center gap-1.5 border border-amber-500/50 hover:bg-amber-500/10 text-amber-300 font-semibold text-sm px-3 py-2 rounded-lg">
            <ArrowDownToLine size={15} /> Dari Master
          </button>
          <button onClick={() => setForm({ barang: {} })} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm px-3 py-2 rounded-lg">
            <Plus size={15} /> Tambah
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTER.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border ${filter === k ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-slate-700 text-slate-300 hover:border-amber-500/60"}`}>
              {label}{rows ? ` (${hitung[k]})` : ""}
            </button>
          ))}
          <select value={urut} onChange={(e) => setUrut(e.target.value)} className={`${inp} !w-auto text-xs !py-1.5 ml-auto`}>
            {URUTAN.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 p-3">
        {error && <Galat pesan={error} />}
        {siapkan && <div className="text-xs text-slate-400 mb-2 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Menyiapkan…</div>}
        {!rows ? (
          <div className="py-10 flex justify-center text-slate-500"><Loader2 className="animate-spin" size={20} /></div>
        ) : tampil.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {rows.length === 0 ? "Belum ada barang TikTok. Pilih dari Master Barang, atau tambah manual." : "Tidak ada yang cocok."}
          </div>
        ) : (
          <>
            <div className="text-[11px] text-slate-500 mb-2">Menampilkan {terlihat.length} dari {tampil.length} barang{tampil.length !== rows.length ? ` (total ${rows.length})` : ""}</div>
            <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 overflow-hidden">
              <li className={`hidden lg:grid ${KOLOM} gap-3 items-center px-3 py-2 bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500`}>
                <span />
                <span>Barang</span>
                <span>Kode live</span>
                <span className="text-right">HPP</span>
                <span className="text-right">Harga jual</span>
                <span className="text-right">Stok</span>
                <span className="text-right pr-2">Aksi</span>
              </li>
              {terlihat.map((r) => {
                const habis = stokAngka(r) <= 0;
                return (
                  <li key={r.id} className={`hover:bg-slate-900/50 ${r.nonaktif ? "opacity-50" : ""}`}>
                    <div className={`hidden lg:grid ${KOLOM} gap-3 items-center px-3 py-2`}>
                      <FotoBarang r={r} />
                      <InfoBarang r={r} />
                      <div><KodeLive v={r.kode_live} /></div>
                      <div className="text-right text-xs text-slate-400 tabular-nums">{r.hpp ? fmtRp(r.hpp) : "–"}</div>
                      <div className="text-right text-sm font-semibold text-amber-400 tabular-nums">{fmtRp(r.harga_jual)}</div>
                      <div className={`text-right text-sm tabular-nums ${habis ? "text-red-400 font-semibold" : "text-slate-200"}`}>{stokAngka(r)}</div>
                      <div className="flex justify-end"><AksiBarang r={r} {...aksi} /></div>
                    </div>
                    <div className="lg:hidden p-3">
                      <div className="flex items-start gap-3">
                        <FotoBarang r={r} />
                        <div className="min-w-0 flex-1">
                          <InfoBarang r={r} />
                          <div className="mt-1"><KodeLive v={r.kode_live} /></div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-amber-400 tabular-nums">{fmtRp(r.harga_jual)}</div>
                          <div className={`text-[11px] ${habis ? "text-red-400 font-semibold" : "text-slate-400"}`}>stok {stokAngka(r)}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t border-slate-800/70 pt-1">
                        <span className="text-[11px] text-slate-500">{r.hpp ? `HPP ${fmtRp(r.hpp)}` : "HPP belum diisi"}</span>
                        <AksiBarang r={r} {...aksi} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {sisa > 0 && (
              <div className="flex items-center justify-center gap-3 pt-3">
                <button onClick={() => setBatas((n) => n + PER_TAHAP)} className="border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-medium px-4 py-2 rounded-lg">
                  Tampilkan {Math.min(PER_TAHAP, sisa)} lagi (sisa {sisa})
                </button>
                <button onClick={() => setBatas(tampil.length)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">Tampilkan semua</button>
              </div>
            )}
          </>
        )}
      </div>

      {dariMaster && <TambahDariMaster tujuan="tiktok" onSelesai={() => { selesai(); onBerubah?.(); }} onClose={() => setDariMaster(false)} />}
      {form && <FormBarang barang={form.barang} kodeSaran={kodeSaran} onSimpan={selesai} onClose={() => setForm(null)} />}
      {mutasi && <FormMutasi barang={mutasi} onSelesai={() => { selesai(); onBerubah?.(); }} onClose={() => setMutasi(null)} />}
      {opname && <FormOpname barang={opname} onSelesai={selesai} onClose={() => setOpname(null)} />}
      {hapus && <FormHapus barang={hapus} onSelesai={selesai} onClose={() => setHapus(null)} />}
      {keToko && (
        <PindahKeToko
          daftar={keToko.daftar}
          labelKategori={keToko.labelKategori}
          labelSubkategori={keToko.labelSubkategori}
          fotoPerSku={keToko.fotoPerSku}
          sumber="tiktok"
          onClose={() => setKeToko(null)}
          onSelesai={() => { selesai(); onBerubah?.(); }}
        />
      )}
    </div>
  );
}
