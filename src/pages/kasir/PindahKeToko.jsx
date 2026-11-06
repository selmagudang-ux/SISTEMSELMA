import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { sb, sbAll, entitasSesi, fmtRp } from "../../lib/api";
import { Kerangka, Galat, inp, pesanError } from "./BarangToko";

// =========================================================
// PINDAHKAN SKU DARI MASTER BARANG (gudang) KE BARANG TOKO (kasir).
// - Membuat baris master_toko dari data SKU:
//     kode   = KODE ENTITAS-nomor urut (mis. OPS-0001), nomor lanjut dari yang terbesar
//     nama   = nama subkategori + nomor urut per subkategori (mis. "Kemeja 12")
//     barcode = SKU gudang (bukan kode toko), foto = foto SKU di gudang (kalau sudah ada)
//     harga jual = Ecer, HPP = HPP, sku_gudang = SKU (tertaut, jadi bisa dimutasi stoknya).
// - Kalau SKU sudah ada di Barang Toko (dicek lewat sku_gudang), tidak dibuat dobel (dilewati).
// - Kalau satu SKU dipilih & jumlah diisi, stok gudang ikut dipindah ke toko
//   lewat fungsi database toko_mutasi_dari_gudang (atomik, tercatat riwayatnya).
// Hanya dipanggil dari Master Barang untuk role superappa.
// =========================================================

export default function PindahKeToko({ daftar, labelKategori, labelSubkategori, fotoPerSku, onClose, onSelesai }) {
  const tunggal = daftar.length === 1 ? daftar[0] : null;
  const [sudahAda, setSudahAda] = useState(null); // Map sku_gudang -> kode toko yang sudah ada
  const [semuaToko, setSemuaToko] = useState([]); // { kode, nama } seluruh barang toko (untuk nomor urut)
  const [qty, setQty] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null); // { dibuat, dilewati, gagal: [], dipindah }

  useEffect(() => {
    const daftarSku = daftar.map((s) => `"${String(s.sku).replace(/"/g, "")}"`).join(",");
    Promise.all([
      sb(`master_toko?select=kode,sku_gudang&sku_gudang=in.(${encodeURIComponent(daftarSku)})`),
      sbAll("master_toko?select=kode,nama"),
    ])
      .then(([ada, semua]) => {
        setSudahAda(new Map((ada || []).map((x) => [x.sku_gudang, x.kode])));
        setSemuaToko(semua || []);
      })
      .catch(() => setSudahAda(new Map()));
  }, [daftar]);

  const jalankan = async () => {
    const n = qty === "" ? 0 : parseInt(qty, 10);
    if (qty !== "" && !(n > 0)) return setError("Jumlah harus lebih dari 0, atau kosongkan.");
    if (n > 0 && tunggal && n > (Number(tunggal.stok) || 0)) {
      return setError(`Stok gudang ${tunggal.sku} hanya ${Number(tunggal.stok) || 0}.`);
    }
    setSaving(true);
    setError("");
    const out = { dibuat: 0, dilewati: 0, gagal: [], dipindah: 0 };
    const prefix = String(entitasSesi()).toUpperCase();
    // Nomor urut kode toko: lanjut dari nomor terbesar yang sudah ada untuk entitas ini.
    let nomorKode = 0;
    for (const t of semuaToko) {
      const m = String(t.kode || "").toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) nomorKode = Math.max(nomorKode, parseInt(m[1], 10));
    }
    // Nomor urut nama per subkategori ("Kemeja 12"): lanjut dari yang terbesar.
    const nomorNama = new Map();
    const urutNama = (label) => {
      if (!nomorNama.has(label)) {
        let mx = 0;
        const awal = `${label} `;
        for (const t of semuaToko) {
          const nm = String(t.nama || "");
          if (nm.startsWith(awal) && /^\d+$/.test(nm.slice(awal.length))) mx = Math.max(mx, parseInt(nm.slice(awal.length), 10));
        }
        nomorNama.set(label, mx);
      }
      const n = nomorNama.get(label) + 1;
      nomorNama.set(label, n);
      return n;
    };
    for (const s of daftar) {
      let kodeToko = sudahAda?.get(s.sku) || null;
      try {
        if (kodeToko) {
          out.dilewati += 1;
        } else {
          if (!(Number(s.ecer) > 0)) throw new Error("Harga Ecer kosong/0 — isi harga dulu di Master Barang.");
          const labelSub = (labelSubkategori ? labelSubkategori(s.subkategori) : "") || "";
          kodeToko = `${prefix}-${String(nomorKode + 1).padStart(4, "0")}`;
          const nama = labelSub ? `${labelSub} ${urutNama(labelSub)}` : (s.nama || "").trim() || s.sku;
          await sb("master_toko", {
            method: "POST",
            body: JSON.stringify({
              kode: kodeToko,
              nama,
              kategori: labelKategori(s.kategori) || null,
              barcode: s.sku, // barang dari Master Barang: barcode = SKU gudang (bukan kode toko)
              harga_jual: Math.round(Number(s.ecer) || 0),
              hpp: Math.round(Number(s.hpp) || 0),
              sku_gudang: s.sku,
              foto_url: fotoPerSku?.get(s.sku) || null,
              nonaktif: false,
            }),
          });
          nomorKode += 1; // naik hanya kalau berhasil disimpan
          out.dibuat += 1;
        }
        if (tunggal && n > 0) {
          await sb("rpc/toko_mutasi_dari_gudang", {
            method: "POST",
            body: JSON.stringify({ p: { entitas: entitasSesi(), kode: kodeToko, qty: n, catatan: catatan.trim() || null } }),
          });
          out.dipindah = n;
        }
      } catch (e) {
        out.gagal.push(`${s.sku}: ${pesanError(e)}`);
      }
    }
    setSaving(false);
    setHasil(out);
  };

  if (hasil) {
    return (
      <Kerangka judul="Hasil pemindahan ke Barang Toko" onClose={() => onSelesai(hasil)}>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-emerald-300"><Check size={15} /> {hasil.dibuat} barang ditambahkan ke Barang Toko</div>
          {hasil.dilewati > 0 && <div className="text-slate-400">{hasil.dilewati} sudah ada di Barang Toko (tidak dibuat dobel)</div>}
          {hasil.dipindah > 0 && <div className="text-slate-300">{hasil.dipindah} stok dipindah dari gudang ke toko</div>}
        </div>
        {hasil.gagal.length > 0 && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">{hasil.gagal.map((g) => <div key={g}>{g}</div>)}</div>
          </div>
        )}
        <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">
          Selesai
        </button>
      </Kerangka>
    );
  }

  return (
    <Kerangka judul={tunggal ? `Pindahkan ke Barang Toko — ${tunggal.sku}` : `Pindahkan ${daftar.length} SKU ke Barang Toko`} onClose={onClose}>
      {tunggal ? (
        <>
          <div className="text-sm text-slate-300">{tunggal.nama || tunggal.sku}</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Harga jual toko</div>
              <div className="font-semibold text-amber-400">{fmtRp(tunggal.ecer)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">HPP</div>
              <div className="font-semibold">{fmtRp(tunggal.hpp)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Stok gudang</div>
              <div className="font-semibold">{Number(tunggal.stok) || 0}</div>
            </div>
          </div>
          {sudahAda?.has(tunggal.sku) && (
            <div className="text-xs text-sky-300">Sudah ada di Barang Toko — isi jumlah di bawah untuk menambah stok toko.</div>
          )}
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Jumlah stok dipindah ke toko (kosongkan kalau hanya mendaftarkan barang)</div>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} placeholder="0" />
          </label>
          <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={inp} />
        </>
      ) : (
        <div className="text-sm text-slate-300 space-y-2">
          <div>
            {daftar.length} SKU akan didaftarkan ke Barang Toko dengan harga jual = Ecer dan HPP dari Master Barang.
            {sudahAda && sudahAda.size > 0 && ` ${sudahAda.size} di antaranya sudah ada dan akan dilewati.`}
          </div>
          <div className="text-xs text-slate-500">Stok toko mulai dari 0. Untuk memindah stok, buka tiap barang lalu pakai tombol Pindahkan ke Toko, atau tombol Mutasi di Barang Toko.</div>
        </div>
      )}
      <Galat pesan={error} />
      <button
        onClick={jalankan}
        disabled={saving || sudahAda === null}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Pindahkan
      </button>
    </Kerangka>
  );
}
