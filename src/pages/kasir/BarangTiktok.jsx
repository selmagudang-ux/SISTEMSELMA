import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Loader2, Pencil, ArrowDownToLine, ClipboardCheck, Trash2, Camera, ImagePlus, FileDown, Check, Send, Radio, History } from "lucide-react";
import { sb, sbAll, fmtRp, entitasSesi, sbUploadFoto, kompresFotoProduk } from "../../lib/api";
import { InputRupiah } from "../../components/ui";
import { getSession } from "../../lib/auth";
import { catatanDenganPelaku } from "../../lib/mutasiPelaku";
import { PanelMutasiMaster, useMutasiMaster } from "./PemberitahuanMutasi";
import { Kerangka, Galat, inp, pesanError } from "./BarangToko";
import TambahDariMaster, { muatKonteksDariTiktok } from "./TambahDariMaster";
import PindahKeToko from "./PindahKeToko";
import RiwayatPemindahan from "./RiwayatPemindahan";
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
// Stok TIDAK bisa diketik langsung di form barang — hanya berubah lewat mutasi / opname / scan resi (trigger di
// supabase/migrations/20261126_scan_resi_potong_stok_tiktok.sql: scan memotong, retur menambah, kode live baru dibuat otomatis,
// ditandai dari_scan_resi) supaya selalu ada catatannya.
// UKURAN: satu barang TikTok = kode live + ukuran (mis. "CI-72, 7" di kolom Variation orderan -> kode live CI-72, ukuran 7;
// supabase/migrations/20261127_barang_tiktok_ukuran.sql). Ukuran kosong = barang tanpa ukuran. Set tidak punya ukuran.
// Hanya role dengan izin "sku.barang_tiktok" (Super Appa selalu boleh; dijaga di SkuHarga.jsx, tab "Barang TikTok (Kode Live)" di Master Barang).
// =========================================================

const TABEL = "master_tiktok";
const PER_TAHAP = 50;
const kolator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
const stokAngka = (r) => Number(r.stok) || 0;
// Sama dengan ttscan_ukuran_dari_variasi di database: huruf besar, tanpa awalan SIZE/UKURAN, spasi dirapikan.
const rapikanUkuran = (v) =>
  String(v ?? "").toUpperCase().trim().replace(/^(SIZE|UKURAN)\s*[:\-]?\s*/, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();

const FILTER = [
  ["semua", "Semua"],
  ["set", "Set"],
  ["ada", "Ada stok"],
  ["habis", "Stok habis"],
  ["tanpalive", "Tanpa kode live"],
  ["tanpafoto", "Tanpa foto"],
  ["dariscan", "Dibuat dari scan resi"],
  ["nonaktif", "Nonaktif"],
];
const cocokFilter = (r, f) =>
  f === "set" ? !!r.komponen
  : f === "habis" ? stokAngka(r) <= 0
  : f === "ada" ? stokAngka(r) > 0
  : f === "tanpalive" ? !r.kode_live
  : f === "tanpafoto" ? !r.foto_url
  : f === "dariscan" ? !!r.dari_scan_resi
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
  live: (a, b) => kolator.compare(a.kode_live || "\uffff", b.kode_live || "\uffff") || kolator.compare(a.ukuran || "", b.ukuran || ""),
  nama: (a, b) => kolator.compare(a.nama || "", b.nama || ""),
  "stok-asc": (a, b) => stokAngka(a) - stokAngka(b) || kolator.compare(a.nama || "", b.nama || ""),
  "stok-desc": (a, b) => stokAngka(b) - stokAngka(a) || kolator.compare(a.nama || "", b.nama || ""),
};
const KOLOM = "lg:grid-cols-[1.25rem_3rem_minmax(0,1fr)_7rem_6rem_6.5rem_4rem_11rem]";

const pesan = (e) => {
  const m = String(e?.message || e || "");
  if (/master_tiktok_kode_live_(ukuran_)?uq|duplicate key/i.test(m)) return "Kode live + ukuran ini sudah dipakai barang TikTok lain.";
  if (/master_tiktok|tiktok_(mutasi|kembalikan|opname)|toko_ambil_dari_tiktok|PGRST20[24]|does not exist|schema cache/i.test(m) && !/[A-Z_]{4,}\|/.test(m)) {
    return "Fitur Barang TikTok belum aktif di database. Jalankan supabase/migrations/20261124_barang_tiktok.sql di Supabase > SQL Editor.";
  }
  return pesanError(e);
};

// SET = barang TikTok berisi beberapa barang TikTok lain (kolom komponen: [{kode, qty}]). Tidak punya stok sendiri:
// stok = jumlah set yang bisa dipenuhi komponennya (yang paling sedikit), HPP = jumlah HPP komponen x qty.
// Hasil hitung ini hanya untuk tampilan; kolom stok Set di database tetap 0 dan tidak pernah ditulis.
function olahSet(rows) {
  const peta = new Map(rows.map((r) => [r.kode, r]));
  return rows.map((r) => {
    if (!Array.isArray(r.komponen)) return r;
    let stok = Infinity;
    let hpp = 0;
    let hilang = false;
    for (const k of r.komponen) {
      const c = peta.get(k.kode);
      const q = Math.max(parseInt(k.qty, 10) || 1, 1);
      if (!c || c.komponen) {
        hilang = true;
        stok = 0;
        continue;
      }
      stok = Math.min(stok, Math.floor(Math.max(Number(c.stok) || 0, 0) / q));
      hpp += (Number(c.hpp) || 0) * q;
    }
    return { ...r, stok: Number.isFinite(stok) ? stok : 0, hpp: Math.round(hpp), _komponenHilang: hilang };
  });
}

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
    ukuran: barang.ukuran || "",
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
    const ukuran = rapikanUkuran(f.ukuran);
    if (ukuran && !live) return setError("Ukuran hanya bisa diisi kalau kode live diisi.");
    const sku = f.sku_gudang.trim();
    const data = {
      nama: f.nama.trim(),
      kategori: f.kategori.trim() || null,
      kode_live: live || null,
      ukuran: ukuran || null,
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
    if (live && ukuran) {
      // Daftar Kode Live TikTok memetakan satu kode live ke satu SKU, tidak per ukuran -> tidak disinkronkan untuk barang bersize.
      catatan = `Barang tersimpan. Barang bersize tidak dicatat otomatis ke daftar Kode Live TikTok (satu kode live hanya bisa satu SKU di sana).`;
    } else if (live && sku) {
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
        <div className="text-xs text-amber-300 mb-1">Ukuran (kosongkan kalau barang tanpa ukuran)</div>
        <input value={f.ukuran} onChange={(e) => set("ukuran")(e.target.value)} className={`${inp} font-mono`} placeholder="mis. 7 — sama dengan yang tertulis setelah koma di Variation TikTok" />
        <div className="text-[11px] text-slate-500 mt-1">Satu kode live bisa punya banyak barang, satu per ukuran. Saat scan resi, stok yang dipotong adalah barang dengan kode live dan ukuran yang sama.</div>
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
// Tambah / ubah SET. Komponen dipilih dari barang TikTok biasa (bukan Set lain); stok tiap komponen tetap di barangnya masing-masing.
function FormSet({ barang, semua, kodeSaran, onSimpan, onClose }) {
  const baru = !barang.id;
  const biasa = useMemo(() => semua.filter((r) => !r.komponen), [semua]);
  const peta = useMemo(() => new Map(biasa.map((r) => [r.kode, r])), [biasa]);
  const [f, setF] = useState({
    kode: barang.kode || kodeSaran || "",
    kode_live: barang.kode_live || "",
    nama: barang.nama || "",
    harga_jual: barang.harga_jual ?? "",
    nonaktif: !!barang.nonaktif,
  });
  const [komp, setKomp] = useState(() => (Array.isArray(barang.komponen) ? barang.komponen.map((k) => ({ kode: k.kode, qty: String(k.qty || 1) })) : []));
  const [cari, setCari] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const hasilCari = useMemo(() => {
    const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return [];
    const sudah = new Set(komp.map((k) => k.kode));
    return biasa
      .filter((r) => !sudah.has(r.kode))
      .filter((r) => {
        const j = [r.kode, r.kode_live, r.ukuran, r.nama, r.sku_gudang].filter(Boolean).join(" ").toLowerCase();
        return kata.every((x) => j.includes(x));
      })
      .slice(0, 8);
  }, [cari, biasa, komp]);

  const hppSet = komp.reduce((n, k) => n + (Number(peta.get(k.kode)?.hpp) || 0) * Math.max(parseInt(k.qty, 10) || 1, 1), 0);

  const simpan = async () => {
    const kode = f.kode.trim();
    const live = rapikanKodeLive(f.kode_live);
    if (!kode || !f.nama.trim()) return setError("Kode dan nama wajib diisi.");
    if (!live) return setError("Kode live wajib diisi — dipakai saat scan resi untuk memotong stok komponen.");
    if (komp.length < 2) return setError("Set minimal berisi 2 barang. Untuk 1 barang, pakai barang TikTok biasa.");
    if (!(Number(f.harga_jual) > 0)) return setError("Harga jual harus lebih dari 0.");
    const daftar = komp.map((k) => ({ kode: k.kode, qty: Math.max(parseInt(k.qty, 10) || 1, 1) }));
    setSaving(true);
    setError("");
    const data = {
      nama: f.nama.trim(),
      kode_live: live,
      barcode: kode,
      harga_jual: Math.round(Number(f.harga_jual) || 0),
      hpp: Math.round(hppSet),
      sku_gudang: null,
      komponen: daftar,
      nonaktif: f.nonaktif,
    };
    try {
      if (baru) await sb(TABEL, { method: "POST", body: JSON.stringify({ kode, stok: 0, ...data }) });
      else await sb(`${TABEL}?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
      onSimpan();
    } catch (e) {
      setError(pesan(e));
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={baru ? "Tambah Set" : `Ubah Set ${barang.kode}`} onClose={onClose}>
      <div className="text-[11px] text-slate-500">Set = satu kode live berisi beberapa barang TikTok. Stok Set tidak disimpan sendiri: dihitung dari komponen, dan saat resi di-scan stok tiap komponen yang terpotong.</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-xs text-slate-400 mb-1">Kode {!baru && "(tidak bisa diubah)"}</div>
          <input value={f.kode} onChange={(e) => set("kode")(e.target.value)} disabled={!baru} className={`${inp} font-mono disabled:opacity-60`} />
        </label>
        <label className="block">
          <div className="text-xs text-amber-300 mb-1">Kode live Set</div>
          <input value={f.kode_live} onChange={(e) => set("kode_live")(e.target.value)} className={`${inp} font-mono`} placeholder="mis. S-05" />
        </label>
      </div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Nama set</div>
        <input value={f.nama} onChange={(e) => set("nama")(e.target.value)} className={inp} />
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Harga jual set</div>
        <InputRupiah value={f.harga_jual} onChange={set("harga_jual")} className={inp} placeholder="0" />
      </label>

      <div>
        <div className="text-xs text-slate-400 mb-1">Isi set (barang TikTok)</div>
        <ul className="space-y-1.5 mb-2">
          {komp.map((k, i) => {
            const c = peta.get(k.kode);
            return (
              <li key={k.kode} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{c?.nama || k.kode}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {k.kode}{c?.kode_live ? ` · ${c.kode_live}${c.ukuran ? ` / ${c.ukuran}` : ""}` : ""}{c ? ` · stok ${stokAngka(c)}` : " · barang tidak ditemukan"}
                  </div>
                </div>
                <input
                  value={k.qty}
                  onChange={(e) => setKomp((l) => l.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                  inputMode="numeric"
                  className={`${inp} !w-14 text-center`}
                  title="Jumlah per set"
                />
                <button type="button" onClick={() => setKomp((l) => l.filter((_, j) => j !== i))} className="p-1.5 text-slate-500 hover:text-red-400" title="Buang"><Trash2 size={15} /></button>
              </li>
            );
          })}
          {komp.length === 0 && <li className="text-xs text-slate-500">Belum ada. Cari barang di bawah.</li>}
        </ul>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari barang TikTok untuk ditambahkan (kode live, kode, nama, SKU)…" className={`${inp} pl-9`} />
        </div>
        {hasilCari.length > 0 && (
          <ul className="mt-1 rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
            {hasilCari.map((r) => (
              <li key={r.kode}>
                <button type="button" onClick={() => { setKomp((l) => [...l, { kode: r.kode, qty: "1" }]); setCari(""); }} className="w-full text-left px-3 py-2 hover:bg-slate-900">
                  <div className="text-sm truncate">{r.nama}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{r.kode}{r.kode_live ? ` · ${r.kode_live}${r.ukuran ? ` / ${r.ukuran}` : ""}` : ""} · stok {stokAngka(r)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {cari.trim() && hasilCari.length === 0 && <div className="mt-1 text-[11px] text-slate-500">Tidak ada barang TikTok yang cocok (barang harus sudah ada di Barang TikTok).</div>}
      </div>
      <div className="text-xs text-slate-400">HPP set (jumlah HPP isi): <span className="text-slate-200 font-semibold">{fmtRp(hppSet)}</span></div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={f.nonaktif} onChange={(e) => set("nonaktif")(e.target.checked)} /> Nonaktif
      </label>
      <Galat pesan={error} />
      <button onClick={simpan} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan Set
      </button>
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
        body: JSON.stringify({ p: { entitas: entitasSesi(), kode: barang.kode, qty: n, catatan: catatanDenganPelaku("tiktok", catatan) } }),
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
function FormHapus({ barang, dipakaiSet = [], onSelesai, onClose }) {
  const stok = stokAngka(barang);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hapus = async () => {
    if (stok !== 0) return setError(`Stok TikTok masih ${stok}. Barang hanya bisa dihapus kalau stoknya 0.`);
    if (dipakaiSet.length) return setError(`Barang ini masih jadi isi Set: ${dipakaiSet.map((x) => x.kode_live || x.kode).join(", ")}. Ubah / hapus Set itu dulu.`);
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
      {dipakaiSet.length > 0 && <Galat pesan={`Barang ini masih jadi isi Set: ${dipakaiSet.map((x) => x.kode_live || x.kode).join(", ")}. Ubah / hapus Set itu dulu.`} />}
      <Galat pesan={stok === 0 && !dipakaiSet.length ? error : ""} />
      <button onClick={hapus} disabled={saving || stok !== 0 || dipakaiSet.length > 0} className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Hapus Barang
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
// Hapus beberapa barang yang dipilih. Hanya barang yang stoknya 0 (Set selalu boleh) dan tidak jadi isi Set lain di luar pilihan.
function FormHapusTerpilih({ terpilih, semua, onSelesai, onClose }) {
  const idPilih = useMemo(() => new Set(terpilih.map((r) => r.kode)), [terpilih]);
  const { akan, stokAda, dipakai } = useMemo(() => {
    const akan = [];
    const stokAda = [];
    const dipakai = [];
    for (const r of terpilih) {
      if (!r.komponen && stokAngka(r) !== 0) {
        stokAda.push(r);
        continue;
      }
      const set = semua.filter((x) => Array.isArray(x.komponen) && x.komponen.some((k) => k.kode === r.kode) && !idPilih.has(x.kode));
      if (set.length) dipakai.push({ r, set });
      else akan.push(r);
    }
    return { akan, stokAda, dipakai };
  }, [terpilih, semua, idPilih]);
  const [jalan, setJalan] = useState(false);
  const [hasil, setHasil] = useState(null);

  const nama = (r) => (r.kode_live ? `${r.kode_live}${r.ukuran ? ` / ${r.ukuran}` : ""}` : r.kode);
  const mulai = async () => {
    setJalan(true);
    let terhapus = 0;
    let dilewati = 0;
    const ditolak = [];
    // Set dulu, lalu barang biasa (isi Set tidak boleh hilang lebih dulu)
    for (const kelompok of [akan.filter((r) => r.komponen), akan.filter((r) => !r.komponen)]) {
      for (let i = 0; i < kelompok.length; i += 50) {
        const potong = kelompok.slice(i, i + 50);
        try {
          const res = await sb(`${TABEL}?id=in.(${potong.map((r) => r.id).join(",")})&stok=eq.0`, { method: "DELETE" });
          const n = Array.isArray(res) ? res.length : potong.length;
          terhapus += n;
          dilewati += potong.length - n;
        } catch {
          ditolak.push(...potong.map(nama));
        }
      }
    }
    setJalan(false);
    setHasil({ terhapus, dilewati, ditolak });
  };

  return (
    <Kerangka judul={`Hapus ${terpilih.length} barang terpilih`} onClose={jalan ? () => {} : hasil ? onSelesai : onClose}>
      {hasil ? (
        <>
          <div className="text-sm text-slate-200"><b className="text-emerald-300">{hasil.terhapus}</b> barang terhapus.</div>
          {hasil.dilewati > 0 && <div className="text-xs text-slate-400">{hasil.dilewati} dilewati karena stoknya sudah berubah / barang sudah tidak ada.</div>}
          {hasil.ditolak.length > 0 && <Galat pesan={`Ditolak database: ${hasil.ditolak.slice(0, 10).join(", ")}${hasil.ditolak.length > 10 ? ", …" : ""}`} />}
          <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">Selesai</button>
        </>
      ) : (
        <>
          <div className="text-sm text-slate-200"><b className="text-red-300">{akan.length}</b> barang akan dihapus.</div>
          {stokAda.length > 0 && (
            <div className="text-xs text-amber-300">
              {stokAda.length} barang dilewati karena stok TikTok belum 0: {stokAda.slice(0, 8).map((r) => `${nama(r)} (${stokAngka(r)})`).join(", ")}{stokAda.length > 8 ? ", …" : ""}. Opname atau kembalikan ke gudang dulu.
            </div>
          )}
          {dipakai.length > 0 && (
            <div className="text-xs text-amber-300">
              {dipakai.length} barang dilewati karena masih jadi isi Set yang tidak ikut dipilih: {dipakai.slice(0, 6).map((d) => `${nama(d.r)} → ${nama(d.set[0])}`).join(", ")}{dipakai.length > 6 ? ", …" : ""}.
            </div>
          )}
          <div className="text-[11px] text-slate-500">Daftar Kode Live TikTok (pemetaan HPP) tidak ikut berubah. Penghapusan tidak bisa dibatalkan.</div>
          <button onClick={mulai} disabled={jalan || akan.length === 0} className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl">
            {jalan && <Loader2 size={15} className="animate-spin" />} Hapus {akan.length} Barang
          </button>
        </>
      )}
    </Kerangka>
  );
}

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

function KodeLive({ v, uk }) {
  return v ? (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-1.5 py-0.5">
        <Radio size={11} /> {v}
      </span>
      {uk ? <span className="text-[11px] font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded-md px-1.5 py-0.5">{uk}</span> : null}
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
        {Array.isArray(r.komponen) ? <span className="ml-1.5 font-sans text-sky-300">· SET {r.komponen.length} barang{r._komponenHilang ? " · isi tidak lengkap" : ""}</span> : null}
      </div>
    </div>
  );
}

function AksiBarang({ r, onMutasi, onKeToko, onOpname, onUbah, onHapus }) {
  const tombol = "p-2 rounded-lg text-slate-400 hover:bg-slate-800";
  const adalahSet = Array.isArray(r.komponen);
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {!adalahSet && <>
      <button onClick={() => onMutasi(r)} title="Mutasi gudang ⇄ TikTok" className={`${tombol} hover:text-amber-400`}><ArrowDownToLine size={16} /></button>
      <button onClick={() => onKeToko(r)} title="Kirim stok ke Barang Toko" className={`${tombol} hover:text-sky-400`}><Send size={16} /></button>
      <button onClick={() => onOpname(r)} title="Opname" className={`${tombol} hover:text-amber-400`}><ClipboardCheck size={16} /></button>
      </>}
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
  const notif = useMutasiMaster(0, "tiktok"); // pemberitahuan: barang yang dikirim / ditarik gudang
  const [filter, setFilter] = useState("semua");
  const [urut, setUrut] = useState("kode");
  const [batas, setBatas] = useState(PER_TAHAP);
  const [form, setForm] = useState(null);
  const [formSet, setFormSet] = useState(null);
  const [pilih, setPilih] = useState(() => new Set()); // id barang yang dicentang
  const [hapusPilih, setHapusPilih] = useState(false);
  const [mutasi, setMutasi] = useState(null);
  const [opname, setOpname] = useState(null);
  const [hapus, setHapus] = useState(null);
  const [dariMaster, setDariMaster] = useState(false);
  const [riwayat, setRiwayat] = useState(false); // riwayat pemindahan gudang/toko/TikTok + PDF (RiwayatPemindahan.jsx)
  const [keToko, setKeToko] = useState(null); // konteks PindahKeToko (sumber TikTok)
  const [siapkan, setSiapkan] = useState(false);

  const muat = async () => {
    setError("");
    try {
      setRows(olahSet((await sbAll(`${TABEL}?select=*&order=kode`)) || []));
    } catch (e) {
      setError(pesan(e));
      setRows([]);
    }
  };
  useEffect(() => { muat(); }, []);

  const hitung = useMemo(() => {
    const h = { semua: 0, set: 0, ada: 0, habis: 0, tanpalive: 0, tanpafoto: 0, dariscan: 0, nonaktif: 0 };
    for (const r of rows || []) {
      h.semua++;
      if (r.komponen) h.set++;
      if (stokAngka(r) > 0) h.ada++; else h.habis++;
      if (!r.kode_live) h.tanpalive++;
      if (!r.foto_url) h.tanpafoto++;
      if (r.dari_scan_resi) h.dariscan++;
      if (r.nonaktif) h.nonaktif++;
    }
    return h;
  }, [rows]);
  const totalStok = useMemo(() => (rows || []).reduce((n, r) => n + (r.komponen ? 0 : stokAngka(r)), 0), [rows]); // Set tidak dihitung (stoknya turunan komponen)

  const tampil = useMemo(() => {
    const kata = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || [])
      .filter((r) => {
        if (!cocokFilter(r, filter)) return false;
        if (!kata.length) return true;
        const j = [r.kode, r.kode_live, r.ukuran, r.nama, r.kategori, r.barcode, r.sku_gudang].filter(Boolean).join(" ").toLowerCase();
        return kata.every((k) => j.includes(k));
      })
      .sort(PEMBANDING[urut] || PEMBANDING.kode);
  }, [rows, q, filter, urut]);
  useEffect(() => { setBatas(PER_TAHAP); }, [q, filter, urut]);
  const terlihat = useMemo(() => tampil.slice(0, batas), [tampil, batas]);
  const terpilih = useMemo(() => (rows || []).filter((r) => pilih.has(r.id)), [rows, pilih]);
  const semuaTampilDipilih = tampil.length > 0 && tampil.every((r) => pilih.has(r.id));
  const ubahPilih = (id) => setPilih((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pilihSemuaTampil = () => setPilih((m) => { const n = new Set(m); if (semuaTampilDipilih) tampil.forEach((r) => n.delete(r.id)); else tampil.forEach((r) => n.add(r.id)); return n; });
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
    setPilih(new Set()); setHapusPilih(false);
    setForm(null); setFormSet(null); setMutasi(null); setOpname(null); setHapus(null); setDariMaster(false); setKeToko(null);
    muat();
  };

  const aksi = { onMutasi: setMutasi, onKeToko: mulaiKeToko, onOpname: setOpname, onUbah: (x) => (x.komponen ? setFormSet({ barang: x }) : setForm({ barang: x })), onHapus: setHapus };

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
          <button onClick={() => setRiwayat(true)} title="Riwayat pemindahan gudang, toko & TikTok (bisa unduh PDF)" className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 font-semibold text-sm px-3 py-2 rounded-lg">
            <History size={15} /> Riwayat
          </button>
          <button onClick={() => setFormSet({ barang: {} })} title="Satu kode live berisi beberapa barang (dipasangkan saat dikirim)" className="flex items-center gap-1.5 border border-sky-500/50 hover:bg-sky-500/10 text-sky-300 font-semibold text-sm px-3 py-2 rounded-lg">
            <Plus size={15} /> Set
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
        <PanelMutasiMaster {...notif} onPilihSku={(sku, d) => setQ(d?.kode || sku)} />
        {error && <Galat pesan={error} />}
        {rows && tampil.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input type="checkbox" checked={semuaTampilDipilih} onChange={pilihSemuaTampil} /> Pilih semua yang tampil ({tampil.length})
            </label>
            {terpilih.length > 0 && (
              <>
                <span className="text-slate-400">{terpilih.length} dipilih</span>
                <button type="button" onClick={() => setPilih(new Set())} className="text-slate-400 hover:text-slate-200 underline">Batal pilih</button>
                <button type="button" onClick={() => setHapusPilih(true)} className="ml-auto flex items-center gap-1.5 bg-red-500 hover:bg-red-400 text-white font-semibold px-3 py-1.5 rounded-lg">
                  <Trash2 size={14} /> Hapus {terpilih.length} terpilih
                </button>
              </>
            )}
          </div>
        )}
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
                      <input type="checkbox" checked={pilih.has(r.id)} onChange={() => ubahPilih(r.id)} aria-label={`Pilih ${r.kode}`} />
                      <FotoBarang r={r} />
                      <InfoBarang r={r} />
                      <div><KodeLive v={r.kode_live} uk={r.ukuran} /></div>
                      <div className="text-right text-xs text-slate-400 tabular-nums">{r.hpp ? fmtRp(r.hpp) : "–"}</div>
                      <div className="text-right text-sm font-semibold text-amber-400 tabular-nums">{fmtRp(r.harga_jual)}</div>
                      <div className={`text-right text-sm tabular-nums ${habis ? "text-red-400 font-semibold" : "text-slate-200"}`}>{stokAngka(r)}</div>
                      <div className="flex justify-end"><AksiBarang r={r} {...aksi} /></div>
                    </div>
                    <div className="lg:hidden p-3">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={pilih.has(r.id)} onChange={() => ubahPilih(r.id)} className="mt-4" aria-label={`Pilih ${r.kode}`} />
                        <FotoBarang r={r} />
                        <div className="min-w-0 flex-1">
                          <InfoBarang r={r} />
                          <div className="mt-1"><KodeLive v={r.kode_live} uk={r.ukuran} /></div>
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

      {riwayat && <RiwayatPemindahan onClose={() => setRiwayat(false)} />}
      {dariMaster && <TambahDariMaster tujuan="tiktok" onSelesai={() => { selesai(); onBerubah?.(); }} onClose={() => setDariMaster(false)} />}
      {form && <FormBarang barang={form.barang} kodeSaran={kodeSaran} onSimpan={selesai} onClose={() => setForm(null)} />}
      {formSet && <FormSet barang={formSet.barang} semua={rows || []} kodeSaran={kodeSaran} onSimpan={selesai} onClose={() => setFormSet(null)} />}
      {hapusPilih && terpilih.length > 0 && <FormHapusTerpilih terpilih={terpilih} semua={rows || []} onSelesai={selesai} onClose={() => setHapusPilih(false)} />}
      {mutasi && <FormMutasi barang={mutasi} onSelesai={() => { selesai(); onBerubah?.(); }} onClose={() => setMutasi(null)} />}
      {opname && <FormOpname barang={opname} onSelesai={selesai} onClose={() => setOpname(null)} />}
      {hapus && <FormHapus barang={hapus} dipakaiSet={(rows || []).filter((x) => Array.isArray(x.komponen) && x.komponen.some((k) => k.kode === hapus.kode))} onSelesai={selesai} onClose={() => setHapus(null)} />}
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
