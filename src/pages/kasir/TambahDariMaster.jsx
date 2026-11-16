import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Check } from "lucide-react";
import { sbAll, fmtRp, labelFor } from "../../lib/api";
import { Kerangka, Galat, inp } from "./BarangToko";
import PindahKeToko from "./PindahKeToko";

// =========================================================
// TAMBAH BARANG TOKO DARI MASTER BARANG — dibuka dari tombol "Dari Master" di Barang Toko (kasir).
// Cari SKU di Master Barang PT ini, centang satu atau banyak, lalu lanjut ke PindahKeToko (pembuatan barang toko:
// kode toko otomatis, nama, kategori, barcode = SKU gudang, harga jual = Ecer, HPP, harga grosir, foto, tertaut ke SKU gudang).
// Satu SKU saja yang dipilih = bisa sekaligus memindah stok gudang ke toko. SKU yang sudah ada di Barang Toko ditandai & tidak dobel.
// Yang tampil hanya SKU yang punya stok tercatat di PT ini (aturan sku_master di lib/api.js).
// =========================================================

const MAKS_TAMPIL = 60;
const KOLOM = "sku,model,warna,ukuran,kategori,subkategori,hpp,ecer,grosir,stok,nonaktif";

export default function TambahDariMaster({ onSelesai, onClose }) {
  const [rows, setRows] = useState(null);
  const [sudahAda, setSudahAda] = useState(new Set());
  const [master, setMaster] = useState({});
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState(() => new Set());
  const [error, setError] = useState("");
  const [menyiapkan, setMenyiapkan] = useState(false);
  const [lanjut, setLanjut] = useState(null); // { daftar, fotoPerSku }

  useEffect(() => {
    Promise.all([
      sbAll(`sku_master?select=${KOLOM}&order=sku`),
      sbAll("master_toko?select=sku_gudang&sku_gudang=not.is.null").catch(() => []),
      sbAll("master_data?select=tipe,kode,label&tipe=in.(kategori,subkategori)").catch(() => []),
    ])
      .then(([sku, toko, md]) => {
        setRows((sku || []).filter((r) => !r.nonaktif));
        setSudahAda(new Set((toko || []).map((t) => t.sku_gudang)));
        const m = { kategori: [], subkategori: [] };
        for (const d of md || []) if (m[d.tipe]) m[d.tipe].push({ kode: d.kode, label: d.label });
        setMaster(m);
      })
      .catch((e) => {
        setError(e?.message || "Gagal memuat Master Barang");
        setRows([]);
      });
  }, []);

  const labelKategori = (k) => labelFor(master, "kategori", k);
  const labelSubkategori = (k) => labelFor(master, "subkategori", k);

  const hasil = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const r of rows || []) {
      if (kata.length) {
        const j = [r.sku, r.model, r.warna, r.ukuran, labelKategori(r.kategori), labelSubkategori(r.subkategori)].filter(Boolean).join(" ").toLowerCase();
        if (!kata.every((k) => j.includes(k))) continue;
      }
      out.push(r);
      if (out.length >= MAKS_TAMPIL) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, master]);

  const toggle = (sku) =>
    setPilih((p) => {
      const n = new Set(p);
      n.has(sku) ? n.delete(sku) : n.add(sku);
      return n;
    });

  const pilihSemuaHasil = () =>
    setPilih((p) => {
      const n = new Set(p);
      for (const r of hasil) if (!sudahAda.has(r.sku)) n.add(r.sku);
      return n;
    });

  const teruskan = async () => {
    const daftar = (rows || [])
      .filter((r) => pilih.has(r.sku))
      .map((r) => ({ ...r, nama: [r.model, r.warna, r.ukuran].filter(Boolean).join(" ") || r.sku }));
    if (!daftar.length) return;
    setMenyiapkan(true);
    setError("");
    // Foto terbaru tiap SKU (tabel items). Gagal dimuat = barang toko dibuat tanpa foto.
    const fotoPerSku = new Map();
    try {
      const dipilih = new Set(daftar.map((d) => d.sku));
      const f = await sbAll("items?select=sku,foto_url,created_at,tanggal&foto_url=not.is.null");
      const terbaru = new Map();
      for (const i of f || []) {
        if (!dipilih.has(i.sku) || !i.foto_url) continue;
        const t = new Date(i.created_at || i.tanggal || 0).getTime() || 0;
        const cur = terbaru.get(i.sku);
        if (!cur || t > cur.t) terbaru.set(i.sku, { t, url: i.foto_url });
      }
      terbaru.forEach((v, k) => fotoPerSku.set(k, v.url));
    } catch {
      /* tanpa foto */
    }
    setMenyiapkan(false);
    setLanjut({ daftar, fotoPerSku });
  };

  if (lanjut) {
    return (
      <PindahKeToko
        daftar={lanjut.daftar}
        labelKategori={labelKategori}
        labelSubkategori={labelSubkategori}
        fotoPerSku={lanjut.fotoPerSku}
        onClose={() => setLanjut(null)}
        onSelesai={(h) => onSelesai?.(h)}
      />
    );
  }

  return (
    <Kerangka judul="Tambah dari Master Barang" onClose={onClose} lebar="sm:max-w-lg">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU, model, warna, kategori"
          className={`${inp} pl-9`}
        />
      </div>
      <Galat pesan={error} />
      {rows === null ? (
        <div className="py-8 flex justify-center text-slate-500">
          <Loader2 className="animate-spin" size={18} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{hasil.length} SKU tampil{hasil.length >= MAKS_TAMPIL ? ` (maks. ${MAKS_TAMPIL}, persempit pencarian)` : ""}</span>
            <span className="flex items-center gap-3">
              {pilih.size > 0 && (
                <button type="button" onClick={() => setPilih(new Set())} className="text-slate-400 hover:text-slate-200">
                  Kosongkan
                </button>
              )}
              <button type="button" onClick={pilihSemuaHasil} className="text-amber-400 hover:text-amber-300">
                Pilih semua yang tampil
              </button>
            </span>
          </div>
          <div className="max-h-[46vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
            {hasil.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-8">Tidak ada SKU yang cocok.</div>
            ) : (
              hasil.map((r) => {
                const ada = sudahAda.has(r.sku);
                const dipilih = pilih.has(r.sku);
                return (
                  <button
                    key={r.sku}
                    type="button"
                    onClick={() => !ada && toggle(r.sku)}
                    disabled={ada}
                    className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      dipilih ? "border-amber-500/60 bg-amber-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${dipilih ? "bg-amber-500 border-amber-500 text-slate-950" : "border-slate-600"}`}>
                      {dipilih && <Check size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{[r.model, r.warna, r.ukuran].filter(Boolean).join(" · ") || r.sku}</span>
                      <span className="block text-[11px] text-slate-500 font-mono truncate">{r.sku}</span>
                    </span>
                    <span className="text-right text-xs flex-shrink-0">
                      {ada ? (
                        <span className="text-sky-300">Sudah di Barang Toko</span>
                      ) : (
                        <>
                          <span className={`block font-semibold ${Number(r.ecer) > 0 ? "text-amber-400" : "text-red-400"}`}>{Number(r.ecer) > 0 ? fmtRp(r.ecer) : "Ecer kosong"}</span>
                          <span className="block text-slate-500">Stok gudang {Number(r.stok) || 0}</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="text-[11px] text-slate-500">Barang toko dibuat dengan harga jual = Ecer, HPP dari Master Barang, barcode = SKU gudang. Pilih satu SKU kalau mau sekaligus memindah stok gudang ke toko.</div>
          <button
            type="button"
            onClick={teruskan}
            disabled={!pilih.size || menyiapkan}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl"
          >
            {menyiapkan && <Loader2 size={15} className="animate-spin" />} Lanjut{pilih.size ? ` (${pilih.size} SKU)` : ""}
          </button>
        </>
      )}
    </Kerangka>
  );
}
