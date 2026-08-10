import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell, Field, Combobox, inputClass } from "./ui";
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
        <Field label="Bahan"><Combobox value={bahan} onChange={setBahan} options={master.bahan || []} /></Field>
        <Field label="Peruntukan"><Combobox value={peruntukan} onChange={setPeruntukan} options={master.peruntukan || []} /></Field>
        <Field label="Kategori"><Combobox value={kategori} onChange={setKategori} options={master.kategori || []} /></Field>
        <Field label="Subkategori"><Combobox value={subkategori} onChange={setSubkategori} options={master.subkategori || []} /></Field>
        <Field label="Warna"><Combobox value={warna} onChange={setWarna} options={master.warna || []} /></Field>
        <Field label="Ukuran"><Combobox value={ukuran} onChange={setUkuran} options={master.ukuran || []} /></Field>
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

export function TambahSkuLamaForm({ item, skuMaster, onClose, onSubmit, saving }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = skuMaster.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));

  return (
    <ModalShell title={`Tambah ke SKU — ${item.jumlah}x barang lama`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Barang lama tidak membuat SKU baru — pilih SKU yang sudah ada, stoknya akan ditambah {item.jumlah}x.
      </p>

      <Field label="Cari SKU">
        <input
          className={inputClass}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSelected(null);
          }}
          placeholder="Ketik kode SKU…"
        />
      </Field>

      <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg mb-3 divide-y divide-slate-800">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500 text-center">Tidak ada SKU yang cocok.</div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm ${
                selected?.id === s.id ? "bg-amber-500/15" : "hover:bg-slate-900"
              }`}
            >
              <span className="font-mono text-xs text-slate-200">{s.sku}</span>
              <span className="text-[11px] text-slate-500">Stok: {s.stok}</span>
            </button>
          ))
        )}
      </div>

      {selected && (
        <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <div className="text-[11px] text-slate-500">Stok setelah ditambah</div>
          <div className="font-mono text-sm text-amber-400">
            {selected.stok} + {item.jumlah} = {selected.stok + item.jumlah}
          </div>
        </div>
      )}

      <button
        disabled={!selected || saving}
        onClick={() => onSubmit(selected)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Tambahkan Stok & Lanjut ke Rak"}
      </button>
    </ModalShell>
  );
}

export function TempatkanRakForm({ item, rakList, penempatan, onClose, onSubmit, saving }) {
  const [rakCode, setRakCode] = useState("");
  const [qty, setQty] = useState(item.jumlah || 1);
  const [confirmingOverride, setConfirmingOverride] = useState(false);

  // Aturan: 1 rak hanya untuk 1 SKU. Penempatan terbaru untuk rak yang sama
  // dianggap sebagai "SKU yang sedang menempati" rak itu.
  // (penempatan sudah diurutkan created_at desc saat dimuat, jadi .find = data terbaru)
  const occupant = useMemo(() => {
    if (!rakCode) return null;
    return (penempatan || []).find((p) => p.rak_code === rakCode) || null;
  }, [rakCode, penempatan]);

  const conflict = occupant && occupant.sku !== item.sku;

  const handleClick = () => {
    if (conflict && !confirmingOverride) {
      setConfirmingOverride(true);
      return;
    }
    onSubmit(rakCode, qty);
  };

  if (confirmingOverride && conflict) {
    return (
      <ModalShell title={`Tempatkan — ${item.sku}`} onClose={onClose}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak <span className="font-mono">{rakCode}</span> saat ini berisi SKU{" "}
            <span className="font-mono">{occupant.sku}</span>. Menempatkan SKU{" "}
            <span className="font-mono">{item.sku}</span> di sini akan menimpanya (satu rak hanya untuk satu SKU).
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmingOverride(false)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            disabled={saving}
            onClick={() => onSubmit(rakCode, qty)}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Ya, Timpa SKU"}
          </button>
        </div>
      </ModalShell>
    );
  }

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
      {conflict && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span>. Akan diminta konfirmasi
            sebelum menimpa.
          </div>
        </div>
      )}
      <Field label="Jumlah">
        <input type="number" min="1" className={inputClass} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      </Field>
      <button
        disabled={!rakCode || saving}
        onClick={handleClick}
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