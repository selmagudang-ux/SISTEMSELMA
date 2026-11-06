import { useMemo, useState } from "react";
import { Loader2, Check, AlertCircle, ImagePlus } from "lucide-react";
import { sb, sbUploadFoto, kompresFotoProduk } from "../../lib/api";
import { Kerangka, Galat, pesanError } from "./BarangToko";

// =========================================================
// FOTO MASSAL BARANG TOKO (untuk barang hasil import / barang tanpa foto)
// Pilih banyak foto sekaligus. Nama file dicocokkan dengan barang toko:
//     <kode toko | barcode | SKU gudang | nama barang>.jpg
//   mis. OPS-0001.jpg, 8991234567890.jpg, "Kemeja Flanel 1.jpg"
// Pencocokan tidak membedakan huruf besar/kecil. Foto yang tidak cocok dilewati.
// Kalau barang sudah punya foto, hanya diganti kalau kotak "Ganti foto yang sudah ada" dicentang.
// Foto dikecilkan lalu diunggah (3 sekaligus) dan disimpan di kolom foto_url.
// =========================================================

const kunci = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const tanpaEkstensi = (n) => n.replace(/\.[^.]+$/, "");

export default function FotoMassalToko({ barangAda, onSelesai, onClose }) {
  const [files, setFiles] = useState([]);
  const [ganti, setGanti] = useState(false);
  const [proses, setProses] = useState(null);
  const [hasil, setHasil] = useState(null);
  const [error, setError] = useState("");

  const peta = useMemo(() => {
    const m = new Map();
    // Urutan prioritas: kode > barcode > SKU gudang > nama (yang lebih dulu tidak ditimpa).
    for (const kolom of ["kode", "barcode", "sku_gudang", "nama"]) {
      for (const b of barangAda) {
        const k = kunci(b[kolom]);
        if (k && !m.has(k)) m.set(k, b);
      }
    }
    return m;
  }, [barangAda]);

  const daftar = useMemo(() => {
    const dipakai = new Set();
    return files.map((f) => {
      const b = peta.get(kunci(tanpaEkstensi(f.name)));
      let status = "ok";
      let pesan = "";
      if (!b) { status = "tidakcocok"; pesan = "Nama file tidak cocok dengan barang mana pun"; }
      else if (b.foto_url && !ganti) { status = "lewati"; pesan = "Sudah punya foto"; }
      else if (dipakai.has(b.id)) { status = "lewati"; pesan = "Barang yang sama sudah ada di file lain"; }
      if (status === "ok") dipakai.add(b.id);
      return { f, b, status, pesan };
    });
  }, [files, peta, ganti]);

  const siap = daftar.filter((d) => d.status === "ok");

  const jalankan = async () => {
    setError("");
    const out = { berhasil: 0, gagal: [] };
    let antre = 0;
    let selesai = 0;
    const kerja = async () => {
      while (antre < siap.length) {
        const { f, b } = siap[antre++];
        try {
          const kecil = await kompresFotoProduk(f);
          const ext = (kecil.name.split(".").pop() || "jpg").toLowerCase();
          const nama = String(b.kode).replace(/[^a-zA-Z0-9-_]/g, "-");
          const url = await sbUploadFoto(kecil, `toko/${nama}-${Date.now()}.${ext}`);
          const r = await sb(`master_toko?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ foto_url: url }) });
          if (Array.isArray(r) && r.length === 0) throw new Error("tidak tersimpan (tidak ada izin?)");
          out.berhasil += 1;
        } catch (e) {
          out.gagal.push(`${b.kode} (${f.name}): ${pesanError(e)}`);
        }
        selesai += 1;
        setProses(`Mengunggah foto ${selesai} / ${siap.length}…`);
      }
    };
    setProses(`Mengunggah foto 0 / ${siap.length}…`);
    await Promise.all([kerja(), kerja(), kerja()]);
    setProses(null);
    setHasil(out);
  };

  if (hasil) {
    return (
      <Kerangka judul="Hasil foto massal" onClose={() => onSelesai(hasil)}>
        <div className="flex items-center gap-2 text-emerald-300 text-sm"><Check size={15} /> {hasil.berhasil} foto tersimpan</div>
        {hasil.gagal.length > 0 && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">{hasil.gagal.map((g, i) => <div key={i}>{g}</div>)}</div>
          </div>
        )}
        <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">
          Selesai
        </button>
      </Kerangka>
    );
  }

  return (
    <Kerangka judul="Foto massal Barang Toko" onClose={proses ? () => {} : onClose}>
      <div className="text-xs text-slate-400 leading-relaxed">
        Pilih banyak foto sekaligus. Beri nama file sesuai <b className="text-slate-200">kode toko</b>, <b className="text-slate-200">barcode</b>, <b className="text-slate-200">SKU gudang</b>, atau <b className="text-slate-200">nama barang</b>
        {" "}(contoh: <span className="font-mono">OPS-0001.jpg</span>, <span className="font-mono">Kemeja Flanel 1.jpg</span>).
      </div>

      <label className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold py-2.5 rounded-xl cursor-pointer">
        <ImagePlus size={15} /> Pilih foto
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={!!proses}
          onChange={(e) => {
            setFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={ganti} onChange={(e) => setGanti(e.target.checked)} disabled={!!proses} /> Ganti foto yang sudah ada
      </label>

      <Galat pesan={error} />

      {files.length > 0 && (
        <>
          <div className="text-xs text-slate-400">
            <span className="text-emerald-300">{siap.length} siap diunggah</span>
            {daftar.length - siap.length > 0 && <span className="text-amber-300"> · {daftar.length - siap.length} dilewati</span>}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <tbody>
                {daftar.slice(0, 300).map((d, i) => (
                  <tr key={i} className="border-t first:border-t-0 border-slate-800">
                    <td className="px-3 py-1.5 font-mono truncate max-w-[10rem]">{d.f.name}</td>
                    <td className="px-2 py-1.5 truncate max-w-[8rem]">{d.b ? d.b.kode : "–"}</td>
                    <td className={`px-3 py-1.5 ${d.status === "ok" ? "text-emerald-300" : "text-amber-300"}`}>{d.status === "ok" ? "Siap" : d.pesan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={jalankan}
            disabled={!!proses || siap.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl"
          >
            {proses && <Loader2 size={15} className="animate-spin" />}
            {proses || `Unggah ${siap.length} foto`}
          </button>
        </>
      )}
    </Kerangka>
  );
}
