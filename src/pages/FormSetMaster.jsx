import { useMemo, useState } from "react";
import { Search, Plus, Loader2, Trash2, X } from "lucide-react";
import { sb } from "../lib/api";
import { Kerangka, Galat, inp } from "./kasir/BarangToko";
import { KATEGORI_INDUK, adalahSet } from "../lib/setMaster";

const pesanDb = (e) => {
  const m = String(e?.message || e || "");
  if (/komponen|schema cache|PGRST204|column/i.test(m)) {
    return "Kolom SKU Induk belum ada di database. Jalankan supabase/migrations/20261125_master_barang_set.sql di Supabase > SQL Editor.";
  }
  if (/duplicate key|sku_master_sku/i.test(m)) return "SKU ini sudah dipakai.";
  return m || "Gagal menyimpan.";
};

// ---------------------------------------------------------
// Tambah / ubah SKU INDUK di Master Barang: hanya pengelompokan SKU yang sudah ada (tanpa harga/stok/qty).
export function FormSetMaster({ barang, skuMaster, onSimpan, onClose }) {
  const baru = !barang;
  const biasa = useMemo(() => skuMaster.filter((s) => !adalahSet(s) && !s.nonaktif), [skuMaster]);
  const peta = useMemo(() => new Map(skuMaster.map((s) => [s.sku, s])), [skuMaster]);
  const [f, setF] = useState({ sku: barang?.sku || "", nama: barang?.nama || "" });
  const [isi, setIsi] = useState(() => (barang?.komponen || []).map((k) => k.sku));
  const [cari, setCari] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasilCari = useMemo(() => {
    const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return [];
    const sudah = new Set(isi);
    return biasa
      .filter((s) => !sudah.has(s.sku))
      .filter((s) => {
        const j = [s.sku, s.nama, s.barcode_supplier].filter(Boolean).join(" ").toLowerCase();
        return kata.every((x) => j.includes(x));
      })
      .slice(0, 8);
  }, [cari, biasa, isi]);

  const simpan = async () => {
    const sku = f.sku.trim();
    if (!sku) return setError("SKU induk wajib diisi.");
    if (baru && skuMaster.some((s) => String(s.sku).trim().toLowerCase() === sku.toLowerCase())) {
      return setError(`SKU ${sku} sudah ada di Master Barang.`);
    }
    if (isi.length < 1) return setError("Isi minimal 1 SKU.");
    const data = { nama: f.nama.trim() || null, komponen: isi.map((x) => ({ sku: x, qty: 1 })) };
    setSaving(true);
    setError("");
    try {
      if (baru) {
        await sb("sku_master", {
          method: "POST",
          // Kolom rincian & harga di sku_master NOT NULL di sebagian database -> kirim kosong/0, bukan dihilangkan.
          body: JSON.stringify({
            sku, bahan: "", peruntukan: "", kategori: KATEGORI_INDUK, subkategori: "", model: "", warna: "", ukuran: "",
            harga_asli: 0, harga_dasar: 0, hpp: 0, grosir: 0, tengah: 0, ecer: 0, stok: 0, ...data,
          }),
        });
      } else {
        await sb(`sku_master?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
      }
      onSimpan(baru ? `SKU induk ${sku} dibuat` : `SKU induk ${sku} disimpan`);
    } catch (e) {
      setError(pesanDb(e));
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={baru ? "Tambah SKU Induk" : `Ubah SKU Induk ${barang.sku}`} onClose={saving ? () => {} : onClose} lebar="sm:max-w-lg">
      <div className="text-[11px] text-slate-500">
        SKU induk hanya pengelompokan: tidak punya harga atau stok sendiri, dan tidak dijual. Tiap SKU isi tetap dijual sendiri-sendiri.
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">SKU induk</div>
        <input value={f.sku} onChange={(e) => setF((p) => ({ ...p, sku: e.target.value }))} disabled={!baru} className={`${inp} font-mono disabled:opacity-60`} placeholder="mis. TDGRP 1" />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Nama (opsional)</div>
        <input value={f.nama} onChange={(e) => setF((p) => ({ ...p, nama: e.target.value }))} className={inp} />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Isi (SKU di Master Barang)</div>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <Search size={14} className="text-slate-500" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari SKU / nama…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600" />
        </div>
        {hasilCari.length > 0 && (
          <div className="mt-1 border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
            {hasilCari.map((s) => (
              <button
                key={s.sku}
                type="button"
                onClick={() => {
                  setIsi((p) => [...p, s.sku]);
                  setCari("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-800/60"
              >
                <span className="font-mono text-xs text-slate-300 truncate">{s.sku}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500 flex-shrink-0">
                  Stok {Number(s.stok) || 0} <Plus size={12} className="text-amber-400" />
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {isi.length === 0 && <div className="text-[11px] text-slate-600">Belum ada isi. Cari SKU di atas lalu klik untuk menambah.</div>}
          {isi.map((k, i) => {
            const c = peta.get(k);
            return (
              <div key={k} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-slate-200 truncate">{k}</div>
                  <div className="text-[10px] text-slate-500">{c ? `Stok ${Number(c.stok) || 0}${c.nonaktif ? " · nonaktif" : ""}` : "SKU tidak ditemukan"}</div>
                </div>
                <button type="button" onClick={() => setIsi((p) => p.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400" title="Buang">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 mt-2">{isi.length} SKU di dalam induk ini</div>
      </div>
      <Galat pesan={error} />
      <button onClick={simpan} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan SKU Induk
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
// Hapus beberapa SKU yang dipilih di Master Barang. Sama seperti "Hapus SKU" satuan (barang, riwayat stok, penempatan rak ikut
// terhapus; SKU yang masih dipakai di riwayat transaksi cuma dinonaktifkan). SKU induk yang dihapus TIDAK menghapus SKU isinya.
const kutip = (list) => encodeURIComponent(`(${list.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")})`);

export function FormHapusSkuTerpilih({ terpilih, skuMaster, items, onSelesai, onClose }) {
  const { akan, jumlahBarang, adaStok, dalamInduk } = useMemo(() => {
    const akan = terpilih;
    const sku = new Set(akan.filter((s) => !adalahSet(s)).map((s) => s.sku));
    const jumlahBarang = (items || []).filter((i) => sku.has(i.sku)).length;
    const adaStok = akan.filter((s) => !adalahSet(s) && (Number(s.stok) || 0) > 0);
    const idPilih = new Set(akan.map((s) => s.sku));
    const dalamInduk = akan.filter((s) => !adalahSet(s) && skuMaster.some((x) => adalahSet(x) && !idPilih.has(x.sku) && x.komponen.some((k) => k.sku === s.sku)));
    return { akan, jumlahBarang, adaStok, dalamInduk };
  }, [terpilih, skuMaster, items]);
  const [ketik, setKetik] = useState("");
  const [jalan, setJalan] = useState(false);
  const [hasil, setHasil] = useState(null);

  const mulai = async () => {
    setJalan(true);
    let terhapus = 0;
    let dinonaktifkan = 0;
    const gagal = [];
    const hapusSatu = async (s) => {
      try {
        await sb(`sku_master?id=eq.${s.id}`, { method: "DELETE" });
        terhapus++;
      } catch (e) {
        if (e?.pgCode === "23503") {
          try {
            await sb(`sku_master?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ nonaktif: true }) });
            dinonaktifkan++;
          } catch {
            gagal.push(s.sku);
          }
        } else gagal.push(s.sku);
      }
    };
    // SKU induk cuma baris di sku_master (tidak punya barang/stok/rak).
    for (const s of akan.filter(adalahSet)) await hapusSatu(s);
    const biasa = akan.filter((s) => !adalahSet(s));
    for (let i = 0; i < biasa.length; i += 40) {
      const potong = biasa.slice(i, i + 40);
      const q = kutip(potong.map((s) => s.sku));
      try {
        // Urutan mengikuti foreign key ke sku_master.sku: items, stock_history, penempatan dulu.
        await sb(`items?sku=in.${q}`, { method: "DELETE" });
        await sb(`stock_history?sku=in.${q}`, { method: "DELETE" });
        await sb(`penempatan?sku=in.${q}`, { method: "DELETE" });
      } catch {
        gagal.push(...potong.map((s) => s.sku));
        continue;
      }
      try {
        await sb(`sku_master?id=in.(${potong.map((s) => s.id).join(",")})`, { method: "DELETE" });
        terhapus += potong.length;
      } catch {
        // Salah satunya masih dipakai di riwayat transaksi -> coba satu per satu, yang terikat dinonaktifkan.
        for (const s of potong) await hapusSatu(s);
      }
    }
    setJalan(false);
    setHasil({ terhapus, dinonaktifkan, gagal });
  };

  const bolehHapus = ketik.trim().toUpperCase() === "HAPUS" && akan.length > 0 && !jalan;

  return (
    <Kerangka judul={`Hapus ${terpilih.length} SKU terpilih`} onClose={jalan ? () => {} : hasil ? () => onSelesai(hasil) : onClose}>
      {hasil ? (
        <>
          <div className="text-sm text-slate-200"><b className="text-emerald-300">{hasil.terhapus}</b> SKU dihapus.</div>
          {hasil.dinonaktifkan > 0 && <div className="text-xs text-amber-300">{hasil.dinonaktifkan} SKU masih dipakai di riwayat transaksi, jadi dinonaktifkan (bukan dihapus permanen).</div>}
          {hasil.gagal.length > 0 && <Galat pesan={`Gagal: ${hasil.gagal.slice(0, 10).join(", ")}${hasil.gagal.length > 10 ? ", …" : ""}`} />}
          <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">Selesai</button>
        </>
      ) : (
        <>
          <div className="text-sm text-slate-200"><b className="text-red-300">{akan.length}</b> SKU akan dihapus permanen, beserta {jumlahBarang} barang yang tercatat, penempatan rak, dan riwayat stoknya. Tidak bisa dibatalkan.</div>
          {adaStok.length > 0 && (
            <div className="text-xs text-red-300">
              {adaStok.length} SKU masih punya stok: {adaStok.slice(0, 6).map((s) => `${s.sku} (${s.stok})`).join(", ")}{adaStok.length > 6 ? ", …" : ""}.
            </div>
          )}
          {dalamInduk.length > 0 && (
            <div className="text-xs text-amber-300">
              {dalamInduk.length} SKU masih terdaftar di SKU induk yang tidak ikut dihapus; induk itu akan menampilkan "isi tidak lengkap".
            </div>
          )}
          <div className="max-h-32 overflow-y-auto text-[11px] font-mono text-slate-500 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 space-y-0.5">
            {akan.map((s) => <div key={s.id} className="truncate">{s.sku}{adalahSet(s) ? "  (induk)" : ""}</div>)}
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Ketik <b className="text-slate-200">HAPUS</b> untuk melanjutkan</div>
            <input value={ketik} onChange={(e) => setKetik(e.target.value)} className={inp} />
          </div>
          <button onClick={mulai} disabled={!bolehHapus} className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl">
            {jalan ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Hapus {akan.length} SKU
          </button>
        </>
      )}
    </Kerangka>
  );
}
