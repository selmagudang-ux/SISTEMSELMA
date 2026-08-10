import { useState } from "react";
import { ModalShell, Field, Select, inputClass } from "./ui";
import { fmtRp, calcHarga } from "../lib/api";

export function BarangMasukForm({ onClose, onSubmit, saving, presetStatus }) {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [gudang, setGudang] = useState("");
  const [jumlah, setJumlah] = useState(1);
  const [status, setStatus] = useState(presetStatus || "baru");

  return (
    <ModalShell title="Barang Masuk" onClose={onClose}>
      <Field label="Tanggal">
        <input type="date" className={inputClass} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </Field>
      <Field label="Gudang (opsional)">
        <input className={inputClass} value={gudang} onChange={(e) => setGudang(e.target.value)} placeholder="Contoh: Gudang A" />
      </Field>
      <Field label="Jumlah">
        <input type="number" min="1" className={inputClass} value={jumlah} onChange={(e) => setJumlah(Number(e.target.value))} />
      </Field>
      <Field label="Status">
        <div className="flex gap-2">
          {["baru", "lama"].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                status === s ? "bg-amber-500 border-amber-500 text-slate-950" : "border-slate-800 text-slate-400"
              }`}
            >
              {s === "baru" ? "Barang Baru" : "Barang Lama"}
            </button>
          ))}
        </div>
      </Field>
      <button
        disabled={saving || jumlah < 1}
        onClick={() => onSubmit({ tanggal, gudang: gudang || null, jumlah, status })}
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

export function BuatSkuForm({ item, master, settings, onClose, onSubmit, saving }) {
  const [bahan, setBahan] = useState("");
  const [peruntukan, setPeruntukan] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [model, setModel] = useState("1");
  const [warna, setWarna] = useState("");
  const [ukuran, setUkuran] = useState("");
  const [hargaAsli, setHargaAsli] = useState("");

  const ready = bahan && peruntukan && kategori && subkategori && model && warna && ukuran && hargaAsli;
  const preview =
    ready && settings
      ? `${bahan}${peruntukan}${kategori}-${subkategori}-${model}-${warna}-${ukuran}`
      : null;

  return (
    <ModalShell title={`Buat SKU — ${item.jumlah}x barang`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Bahan"><Select value={bahan} onChange={setBahan} options={master.bahan || []} /></Field>
        <Field label="Peruntukan"><Select value={peruntukan} onChange={setPeruntukan} options={master.peruntukan || []} /></Field>
        <Field label="Kategori"><Select value={kategori} onChange={setKategori} options={master.kategori || []} /></Field>
        <Field label="Subkategori"><Select value={subkategori} onChange={setSubkategori} options={master.subkategori || []} /></Field>
        <Field label="Warna"><Select value={warna} onChange={setWarna} options={master.warna || []} /></Field>
        <Field label="Ukuran"><Select value={ukuran} onChange={setUkuran} options={master.ukuran || []} /></Field>
      </div>
      <Field label="Model (kode bebas)">
        <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <Field label="Harga Asli (Rp)">
        <input type="number" className={inputClass} value={hargaAsli} onChange={(e) => setHargaAsli(e.target.value)} placeholder="0" />
      </Field>

      {preview && (
        <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <div className="text-[11px] text-slate-500">SKU</div>
          <div className="font-mono text-sm text-amber-400">{preview}</div>
          {settings && hargaAsli && (
            <div className="text-[11px] text-slate-500 mt-1.5">
              Ecer: <span className="text-slate-300 font-medium">{fmtRp(calcHarga(hargaAsli, settings).ecer)}</span>
            </div>
          )}
        </div>
      )}

      <button
        disabled={!ready || saving}
        onClick={() => onSubmit({ bahan, peruntukan, kategori, subkategori, model, warna, ukuran }, Number(hargaAsli))}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Buat SKU & Lanjut ke Rak"}
      </button>
    </ModalShell>
  );
}

export function TempatkanRakForm({ item, rakList, onClose, onSubmit, saving }) {
  const [rakCode, setRakCode] = useState("");
  const [qty, setQty] = useState(item.jumlah || 1);
  return (
    <ModalShell title={`Tempatkan — ${item.sku}`} onClose={onClose}>
      <Field label="Rak">
        <select value={rakCode} onChange={(e) => setRakCode(e.target.value)} className={inputClass}>
          <option value="">Pilih rak…</option>
          {rakList.map((r) => (
            <option key={r.id} value={r.code}>{r.code}</option>
          ))}
        </select>
      </Field>
      <Field label="Jumlah">
        <input type="number" min="1" className={inputClass} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      </Field>
      <button
        disabled={!rakCode || saving}
        onClick={() => onSubmit(rakCode, qty)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan & Lanjut ke Sample"}
      </button>
    </ModalShell>
  );
}

export function VerifikasiForm({ item, onClose, onSubmit, saving }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [cocok, setCocok] = useState(false);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCocok(false);
  };

  return (
    <ModalShell title={`Verifikasi Foto — ${item.sku || "SKU belum ada"}`} onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">SKU barang ini</div>
        <div className="font-mono text-sm text-amber-400">{item.sku || "—"}</div>
        <div className="text-[11px] text-slate-500 mt-1">{item.jumlah}x · {item.rak_code || "belum ada rak"}</div>
      </div>

      <Field label="Ambil / upload foto barang">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className={inputClass}
        />
      </Field>

      {preview ? (
        <div className="mb-3">
          <img
            src={preview}
            alt="Preview foto barang"
            className="w-full max-h-64 object-contain rounded-lg border border-slate-800 bg-slate-950"
          />
        </div>
      ) : (
        <div className="mb-3 h-40 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">
          Belum ada foto dipilih
        </div>
      )}

      <label className="flex items-start gap-2 mb-4 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={cocok}
          onChange={(e) => setCocok(e.target.checked)}
          className="mt-0.5"
          disabled={!file}
        />
        <span>Saya sudah cek, foto di atas sesuai dengan barang ber-SKU <span className="font-mono text-amber-400">{item.sku}</span></span>
      </label>

      <button
        disabled={!file || !cocok || saving}
        onClick={() => onSubmit(file)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Mengunggah…" : "Simpan & Lanjut ke Marketplace"}
      </button>
    </ModalShell>
  );
}

export function TambahRakForm({ onClose, onSubmit, saving }) {
  const [code, setCode] = useState("");
  const [meja, setMeja] = useState("");
  const [baris, setBaris] = useState("");
  return (
    <ModalShell title="Tambah Rak" onClose={onClose}>
      <Field label="Kode Rak"><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: M02-B03" /></Field>
      <Field label="Meja"><input className={inputClass} value={meja} onChange={(e) => setMeja(e.target.value)} /></Field>
      <Field label="Baris"><input className={inputClass} value={baris} onChange={(e) => setBaris(e.target.value)} /></Field>
      <button
        disabled={!code || saving}
        onClick={() => onSubmit({ code, meja: meja || null, baris: baris || null })}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}
