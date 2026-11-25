import { useState } from "react";
import { ModalShell, Field, inputClass } from "./ui";

// Foto verifikasi lewat SKU INDUK. Dibuka dari kartu induk di halaman Pemotretan:
// 1) pilih foto untuk SKU induknya, 2) tentukan SKU isi (anak) yang ikut memakai
// foto induk itu — atau pilih foto sendiri untuk SKU anak tertentu.
// SKU anak yang tidak dicentang dan tidak diberi foto sendiri tidak disentuh
// (tetap menunggu di Pemotretan). Lihat handler "advance-verifikasi-induk" di ModalRouter.
export default function VerifikasiIndukForm({ item, anak, onClose, onSubmit, saving }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [cocok, setCocok] = useState(false);
  // Per SKU anak: { ikut: pakai foto induk?, file: foto sendiri (opsional) }
  const [baris, setBaris] = useState(() => Object.fromEntries((anak || []).map((a) => [a.id, { ikut: true, file: null }])));

  const ubah = (id, patch) => setBaris((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCocok(false);
  };

  const semuaIkut = (anak || []).length > 0 && (anak || []).every((a) => baris[a.id]?.ikut && !baris[a.id]?.file);
  const setSemua = (v) => setBaris((b) => Object.fromEntries(Object.entries(b).map(([id, r]) => [id, { ...r, ikut: v }])));
  const jumlahDiproses = (anak || []).filter((a) => baris[a.id]?.ikut || baris[a.id]?.file).length;

  const kirim = () =>
    onSubmit({
      indukFile: file,
      anakPilihan: (anak || [])
        .filter((a) => baris[a.id]?.ikut || baris[a.id]?.file)
        .map((a) => ({ item: a, file: baris[a.id].file || null })),
    });

  return (
    <ModalShell title={`Foto Induk — ${item.sku}`} onClose={onClose}>
      <p className="text-[11px] text-slate-500 -mt-1 mb-3">
        Langkah 1: pilih foto untuk SKU induk. Langkah 2: pilih SKU isi yang ikut memakai foto induk, atau beri foto sendiri
        untuk SKU tertentu.
      </p>

      <div className="text-xs font-semibold text-slate-300 mb-1">1. Foto SKU induk</div>
      <Field label="Ambil / upload foto">
        <input type="file" accept="image/*" onChange={handleFile} className={inputClass} />
      </Field>
      {preview ? (
        <img src={preview} alt="Preview foto induk" className="w-full max-h-52 object-contain rounded-lg border border-slate-800 bg-slate-950 mb-3" />
      ) : (
        <div className="mb-3 h-28 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">
          Belum ada foto induk dipilih
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-slate-300">2. SKU isi induk ({(anak || []).length} menunggu foto)</div>
        {(anak || []).length > 0 && (
          <button type="button" onClick={() => setSemua(!semuaIkut)} className="text-[11px] text-amber-400 hover:text-amber-300">
            {semuaIkut ? "Batal pilih semua" : "Pilih semua"}
          </button>
        )}
      </div>
      {(anak || []).length === 0 ? (
        <div className="mb-3 text-[11px] text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          Tidak ada SKU isi induk ini yang sedang menunggu foto. Hanya foto induk yang akan disimpan.
        </div>
      ) : (
        <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800">
          {anak.map((a) => {
            const r = baris[a.id] || {};
            return (
              <div key={a.id} className="px-3 py-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!r.ikut}
                    disabled={!!r.file}
                    onChange={(e) => ubah(a.id, { ikut: e.target.checked })}
                  />
                  <span className="font-mono text-amber-400 truncate flex-1">{a.sku}</span>
                  <span className="text-slate-500">{a.jumlah}x{a.rak_code ? ` · ${a.rak_code}` : ""}</span>
                </label>
                <div className="mt-1 pl-6 flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 flex-shrink-0">Foto sendiri:</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => ubah(a.id, { file: e.target.files?.[0] || null })}
                    className="text-[10px] text-slate-400 min-w-0"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <label className="flex items-start gap-2 mb-4 text-xs text-slate-300">
        <input type="checkbox" checked={cocok} onChange={(e) => setCocok(e.target.checked)} className="mt-0.5" disabled={!file} />
        <span>Saya sudah cek, foto induk sesuai dan cocok untuk SKU isi yang dicentang</span>
      </label>

      <button
        disabled={!file || !cocok || saving}
        onClick={kirim}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Mengunggah…" : `Simpan Induk${jumlahDiproses ? ` + ${jumlahDiproses} SKU isi` : ""} & Lanjut ke Marketplace`}
      </button>
    </ModalShell>
  );
}
