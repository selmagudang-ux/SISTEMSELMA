import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell, Field, Combobox, SearchableSelect, inputClass } from "./ui";
import { fmtRp, calcHarga, sameProdukKecualiUkuran } from "../lib/api";
import { rakForSku } from "../pages/Rak";

export function BarangMasukForm({ onClose, onSubmit, saving }) {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [gudang, setGudang] = useState("");
  const [jumlah, setJumlah] = useState(1);

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
      <button
        disabled={saving || jumlah < 1}
        onClick={() => onSubmit({ tanggal, gudang: gudang || null, jumlah })}
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// Form pembuatan SKU — DIGABUNG jadi satu alur "search-first":
// 1) User cari dulu apakah SKU-nya sudah ada (ketik kode SKU).
// 2) Kalau ketemu → pilih dari hasil pencarian, stok tinggal ditambahkan ke SKU itu.
// 3) Kalau tidak ketemu → lanjut ke form pembuatan SKU baru (bahan/kategori/dst).
// Ini menggantikan pemisahan lama "Barang Baru" vs "Barang Lama" yang dulu
// ditentukan di form Barang Masuk — sekarang keputusannya murni dari hasil pencarian.
export function SkuEntryForm({ item, master, settings, skuMaster, onClose, onSubmitExisting, onSubmitNew, saving }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("cari"); // "cari" | "buat"
  const [hargaBaru, setHargaBaru] = useState("");

  const filtered = q.trim()
    ? skuMaster.filter((s) => s.sku.toLowerCase().includes(q.trim().toLowerCase()))
    : skuMaster;

  const [bahan, setBahan] = useState("");
  const [peruntukan, setPeruntukan] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [model, setModel] = useState("1");
  const [modelTouched, setModelTouched] = useState(false);
  const [warna, setWarna] = useState("");
  const [ukuran, setUkuran] = useState("");
  const [hargaAsli, setHargaAsli] = useState("");

  // Rekomendasi nomor Model berikutnya: cari SKU lain dengan kombinasi bahan +
  // peruntukan + kategori + subkategori yang sama, ambil nomor model tertinggi + 1.
  // Kalau belum ada kombinasi yang sama sama sekali, rekomendasinya "1".
  const modelSuggestion = useMemo(() => {
    if (!bahan || !peruntukan || !kategori || !subkategori) return null;
    const numbers = (skuMaster || [])
      .filter(
        (s) =>
          s.bahan === bahan &&
          s.peruntukan === peruntukan &&
          s.kategori === kategori &&
          s.subkategori === subkategori
      )
      .map((s) => Number(s.model))
      .filter((n) => Number.isFinite(n) && n > 0);
    return String((numbers.length ? Math.max(...numbers) : 0) + 1);
  }, [bahan, peruntukan, kategori, subkategori, skuMaster]);

  // Isi otomatis field Model dengan rekomendasi selama user belum mengetik manual
  // sendiri — begitu user ubah field Model, berhenti menimpa supaya tidak mengganggu.
  useEffect(() => {
    if (modelSuggestion && !modelTouched) setModel(modelSuggestion);
  }, [modelSuggestion, modelTouched]);

  const ready = bahan && peruntukan && kategori && subkategori && model && warna && ukuran && hargaAsli;
  const preview =
    ready && settings
      ? `${bahan}${peruntukan}${kategori}-${subkategori}-${model}-${warna}-${ukuran}`
      : null;

  if (mode === "buat") {
    return (
      <ModalShell title={`Buat SKU Baru — ${item.jumlah}x barang`} onClose={onClose}>
        <button
          onClick={() => setMode("cari")}
          className="text-xs text-slate-500 hover:text-slate-300 mb-3"
        >
          ← Kembali ke pencarian SKU
        </button>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Bahan"><Combobox value={bahan} onChange={setBahan} options={master.bahan || []} /></Field>
          <Field label="Peruntukan"><Combobox value={peruntukan} onChange={setPeruntukan} options={master.peruntukan || []} /></Field>
          <Field label="Kategori"><Combobox value={kategori} onChange={setKategori} options={master.kategori || []} /></Field>
          <Field label="Subkategori"><Combobox value={subkategori} onChange={setSubkategori} options={master.subkategori || []} /></Field>
          <Field label="Warna"><Combobox value={warna} onChange={setWarna} options={master.warna || []} /></Field>
          <Field label="Ukuran"><Combobox value={ukuran} onChange={setUkuran} options={master.ukuran || []} /></Field>
        </div>
        <Field label="Model (kode bebas)">
          <input
            className={inputClass}
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setModelTouched(true);
            }}
          />
          {modelSuggestion && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Rekomendasi nomor berikutnya untuk kombinasi ini:{" "}
              <span className="text-amber-400 font-medium">{modelSuggestion}</span>
              {model !== modelSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setModel(modelSuggestion);
                    setModelTouched(false);
                  }}
                  className="ml-2 text-amber-400 hover:underline"
                >
                  Pakai
                </button>
              )}
            </p>
          )}
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
          onClick={() => onSubmitNew({ bahan, peruntukan, kategori, subkategori, model, warna, ukuran }, Number(hargaAsli))}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Buat SKU & Lanjut ke Rak"}
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Buat SKU — ${item.jumlah}x barang`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Cari dulu apakah SKU-nya sudah ada. Kalau ketemu, stok tinggal ditambahkan. Kalau belum ada, buat SKU baru.
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
          autoFocus
        />
      </Field>

      <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg mb-3 divide-y divide-slate-800">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500 text-center">
            {q.trim() ? "SKU tidak ditemukan." : "Belum ada SKU tersimpan."}
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s);
                setHargaBaru("");
              }}
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
          <div className="text-[11px] text-slate-500 mt-2">Harga asli SKU ini saat ini</div>
          <div className="font-mono text-sm text-slate-300">{fmtRp(selected.harga_asli)}</div>
        </div>
      )}

      {selected && (
        <Field label="Harga Asli barang ini (kosongkan kalau sama)">
          <input
            type="number"
            className={inputClass}
            value={hargaBaru}
            onChange={(e) => setHargaBaru(e.target.value)}
            placeholder={`${selected.harga_asli}`}
          />
          {hargaBaru && Number(hargaBaru) !== selected.harga_asli && (
            <p className="text-[11px] text-amber-400 mt-1.5">
              Harga beda dari harga lama — nanti di Master Barang akan muncul pilihan mau pakai harga lama atau
              harga baru ini. Stok tetap masuk dulu memakai harga jual yang berlaku sekarang.
            </p>
          )}
        </Field>
      )}

      <button
        disabled={!selected || saving}
        onClick={() =>
          onSubmitExisting(
            selected,
            hargaBaru && Number(hargaBaru) !== selected.harga_asli ? Number(hargaBaru) : null
          )
        }
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg mb-2"
      >
        {saving ? "Menyimpan…" : "Tambahkan Stok & Lanjut ke Rak"}
      </button>

      <button
        onClick={() => setMode("buat")}
        className="w-full border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-medium py-2.5 rounded-lg"
      >
        SKU tidak ditemukan? Buat SKU baru →
      </button>
    </ModalShell>
  );
}

export function TempatkanRakForm({ item, rakList, penempatan, skuMaster, onClose, onSubmit, saving }) {
  // Rekomendasi rak untuk "barang lama": kalau SKU ini sudah pernah ditempatkan
  // di rak sebelumnya, tawarkan rak yang sama itu sebagai default (penempatan
  // sudah diurutkan created_at desc, jadi rakForSku = penempatan terbaru).
  const rakRekomendasi = useMemo(() => rakForSku(item.sku, penempatan), [item.sku, penempatan]);
  const [rakCode, setRakCode] = useState(() => rakRekomendasi || "");
  const [qty, setQty] = useState(item.jumlah || 1);
  const [confirmingOverride, setConfirmingOverride] = useState(false);

  // Aturan: 1 rak untuk 1 SKU — KECUALI kalau SKU yang menempati rak itu adalah
  // produk yang sama dan cuma beda ukuran, itu boleh digabung di rak yang sama.
  // Penempatan terbaru untuk rak yang sama dianggap "SKU yang sedang menempati"
  // (penempatan sudah diurutkan created_at desc saat dimuat, jadi .find = data terbaru).
  const occupant = useMemo(() => {
    if (!rakCode) return null;
    return (penempatan || []).find((p) => p.rak_code === rakCode) || null;
  }, [rakCode, penempatan]);

  const bolehGabung = occupant && sameProdukKecualiUkuran(occupant.sku, item.sku, skuMaster);
  const conflict = occupant && occupant.sku !== item.sku && !bolehGabung;

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
            <span className="font-mono">{occupant.sku}</span>, produk yang berbeda. Menempatkan SKU{" "}
            <span className="font-mono">{item.sku}</span> di sini akan menimpanya (satu rak hanya untuk satu SKU,
            kecuali produk sama dan cuma beda ukuran).
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
        <SearchableSelect
          value={rakCode}
          onChange={setRakCode}
          options={rakList.map((r) => ({ value: r.code, label: r.code }))}
          placeholder="Ketik atau pilih rak…"
        />
      </Field>
      {rakRekomendasi && rakCode !== rakRekomendasi && (
        <div className="flex items-center justify-between gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs px-3 py-2 rounded-lg mb-3">
          <span>
            Rekomendasi: rak <span className="font-mono">{rakRekomendasi}</span> — sebelumnya dipakai SKU ini.
          </span>
          <button
            type="button"
            onClick={() => setRakCode(rakRekomendasi)}
            className="text-sky-300 hover:underline font-medium flex-shrink-0"
          >
            Pakai
          </button>
        </div>
      )}
      {bolehGabung && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> — produk yang sama, cuma
            beda ukuran. Boleh digabung, tidak akan menimpa.
          </div>
        </div>
      )}
      {conflict && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> (produk berbeda). Akan
            diminta konfirmasi sebelum menimpa.
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

export function BarangKeluarForm({ item, onClose, onSubmit, saving }) {
  const [qty, setQty] = useState(1);
  const [alasan, setAlasan] = useState("terjual-langsung");
  const [catatan, setCatatan] = useState("");

  const ALASAN_OPTIONS = [
    { key: "terjual-langsung", label: "Terjual di luar sistem" },
    { key: "rusak", label: "Rusak / Cacat" },
    { key: "hilang", label: "Hilang" },
    { key: "retur-supplier", label: "Retur ke Supplier" },
    { key: "lainnya", label: "Lainnya" },
  ];

  const stokBaru = Math.max((item.stok || 0) - (Number(qty) || 0), 0);
  const valid = qty > 0 && qty <= (item.stok || 0);

  return (
    <ModalShell title={`Barang Keluar — ${item.sku}`} onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">Stok saat ini</div>
        <div className="font-mono text-sm text-amber-400">{item.stok || 0}</div>
      </div>

      <Field label="Jumlah Keluar">
        <input
          type="number"
          min="1"
          max={item.stok || 0}
          className={inputClass}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </Field>

      <Field label="Alasan">
        <SearchableSelect
          value={alasan}
          onChange={setAlasan}
          options={ALASAN_OPTIONS.map((a) => ({ value: a.key, label: a.label }))}
        />
      </Field>

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Detail tambahan…" />
      </Field>

      {!valid && qty > (item.stok || 0) && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Jumlah keluar tidak boleh melebihi stok yang tersedia ({item.stok || 0}).</div>
        </div>
      )}

      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">Stok setelah dikurangi</div>
        <div className="font-mono text-sm text-slate-200">
          {item.stok || 0} - {qty || 0} = {stokBaru}
        </div>
      </div>

      <button
        disabled={!valid || saving}
        onClick={() => {
          const alasanLabel = ALASAN_OPTIONS.find((a) => a.key === alasan)?.label || alasan;
          const note = catatan ? `${alasanLabel} — ${catatan}` : alasanLabel;
          onSubmit(Number(qty), note);
        }}
        className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Catat Barang Keluar"}
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