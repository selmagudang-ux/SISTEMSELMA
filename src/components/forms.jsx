import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Warehouse, Plus, X } from "lucide-react";
import { ModalShell, Field, Combobox, SearchableSelect, SearchableSelectOrNew, KodeGabunganInput, inputClass, InputTanggal, InputRupiah, SuggestInput } from "./ui";
import { fmtRp, calcHarga, sameProdukKecualiUkuran, saldoPerRekening, pelangganDenganWa } from "../lib/api";
import { rakForSku } from "../pages/Rak";

// Opsi jenis/asal barang masuk. "Lainnya" membuka input teks bebas supaya
// tetap fleksibel untuk kasus di luar Pembelian & Retur. Diexport supaya
// dipakai juga di PesananMasukForm (Barang Datang) — jenisnya sama persis.
export const JENIS_BARANG_MASUK = ["Pembelian", "Retur", "Lainnya"];

// Satu baris input barang masuk (dipakai berulang saat mode banyak-sekaligus).
function baris(tanggal) {
  return { tanggal, jenis: "Pembelian", jenisLainnya: "", jumlah: 1 };
}

export function BarangMasukForm({ onClose, onSubmit, saving, session }) {
  const today = new Date().toISOString().slice(0, 10);
  const isSuperadmin = session?.role === "superadmin";

  // Mode banyak sekaligus: khusus superadmin. Role lain tetap pakai form
  // satu-satu seperti biasa.
  const [multi, setMulti] = useState(false);
  const [baris_, setBaris] = useState([baris(today)]);

  const updateBaris = (idx, patch) =>
    setBaris((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const tambahBaris = () => setBaris((rows) => [...rows, baris(today)]);
  const hapusBaris = (idx) => setBaris((rows) => rows.filter((_, i) => i !== idx));

  const toPayload = (r) => {
    const gudang = r.jenis === "Lainnya" ? r.jenisLainnya.trim() : r.jenis;
    return { tanggal: r.tanggal, gudang: gudang || null, jumlah: r.jumlah };
  };
  const barisValid = (r) => r.jumlah >= 1 && (r.jenis !== "Lainnya" || r.jenisLainnya.trim());

  // ---- Mode satu-satu (default, semua role) ----
  const [tanggal, setTanggal] = useState(today);
  const [jenis, setJenis] = useState("Pembelian");
  const [jenisLainnya, setJenisLainnya] = useState("");
  const [jumlah, setJumlah] = useState(1);
  const gudang = jenis === "Lainnya" ? jenisLainnya.trim() : jenis;

  if (multi) {
    const semuaValid = baris_.length > 0 && baris_.every(barisValid);
    return (
      <ModalShell title="Barang Masuk — Banyak Sekaligus" onClose={onClose}>
        <div className="flex items-center justify-between -mt-1 mb-1">
          <p className="text-[11px] text-slate-500">Isi beberapa baris, lalu simpan semuanya sekaligus.</p>
          <button
            onClick={() => setMulti(false)}
            className="text-[11px] text-amber-400 hover:text-amber-300 font-medium shrink-0 ml-2"
          >
            Kembali ke satu-satu
          </button>
        </div>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {baris_.map((r, idx) => (
            <div key={idx} className="rounded-lg border border-slate-800 p-3 space-y-2 relative">
              {baris_.length > 1 && (
                <button
                  onClick={() => hapusBaris(idx)}
                  className="absolute top-2 right-2 text-slate-500 hover:text-red-400"
                  title="Hapus baris ini"
                >
                  <X size={14} />
                </button>
              )}
              <p className="text-[11px] uppercase text-slate-500 font-semibold">Baris {idx + 1}</p>
              <Field label="Tanggal">
                <InputTanggal value={r.tanggal} onChange={(v) => updateBaris(idx, { tanggal: v })} />
              </Field>
              <Field label="Jenis Barang Masuk">
                <select
                  className={inputClass}
                  value={r.jenis}
                  onChange={(e) => updateBaris(idx, { jenis: e.target.value })}
                >
                  {JENIS_BARANG_MASUK.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </Field>
              {r.jenis === "Lainnya" && (
                <Field label="Keterangan">
                  <input
                    className={inputClass}
                    value={r.jenisLainnya}
                    onChange={(e) => updateBaris(idx, { jenisLainnya: e.target.value })}
                    placeholder="Contoh: Konsinyasi, Hadiah, dll"
                  />
                </Field>
              )}
              <Field label="Jumlah">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={r.jumlah}
                  onChange={(e) => updateBaris(idx, { jumlah: Number(e.target.value) })}
                />
              </Field>
            </div>
          ))}
        </div>

        <button
          onClick={tambahBaris}
          className="w-full mt-3 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg"
        >
          <Plus size={14} /> Tambah Baris
        </button>

        <button
          disabled={saving || !semuaValid}
          onClick={() => onSubmit(baris_.map(toPayload))}
          className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : `Simpan ${baris_.length} Baris`}
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Barang Masuk" onClose={onClose}>
      {isSuperadmin && (
        <div className="flex justify-end -mt-1 mb-1">
          <button
            onClick={() => setMulti(true)}
            className="text-[11px] text-amber-400 hover:text-amber-300 font-medium"
          >
            Input banyak sekaligus →
          </button>
        </div>
      )}
      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Jenis Barang Masuk">
        <select className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS_BARANG_MASUK.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      </Field>
      {jenis === "Lainnya" && (
        <Field label="Keterangan">
          <input
            className={inputClass}
            value={jenisLainnya}
            onChange={(e) => setJenisLainnya(e.target.value)}
            placeholder="Contoh: Konsinyasi, Hadiah, dll"
          />
        </Field>
      )}
      <Field label="Jumlah">
        <input type="number" min="1" className={inputClass} value={jumlah} onChange={(e) => setJumlah(Number(e.target.value))} />
      </Field>
      <button
        disabled={saving || jumlah < 1 || (jenis === "Lainnya" && !gudang)}
        onClick={() => onSubmit({ tanggal, gudang: gudang || null, jumlah })}
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// Form "Tambah Pesanan" (Barang Datang) — catat PO/pesanan ke supplier
// SEBELUM barangnya fisik tiba. Beda dari BarangMasukForm: di sini belum ada
// SKU, belum ada barang fisik, cuma janji jumlah yang dipesan. Barunya nanti
// dikonversi jadi Barang Masuk sedikit demi sedikit lewat KonfirmasiDatangForm.
export function PesananMasukForm({ onClose, onSubmit, saving }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggalPesan, setTanggalPesan] = useState(today);
  const [supplier, setSupplier] = useState("");
  const [jenis, setJenis] = useState("Pembelian");
  const [jenisLainnya, setJenisLainnya] = useState("");
  const [jumlahModel, setJumlahModel] = useState(1);
  const [jumlahPesan, setJumlahPesan] = useState(1);
  const [catatan, setCatatan] = useState("");

  const jenisFinal = jenis === "Lainnya" ? jenisLainnya.trim() : jenis;
  const valid = jumlahModel >= 1 && jumlahPesan >= 1 && (jenis !== "Lainnya" || jenisLainnya.trim());

  return (
    <ModalShell title="Tambah Pesanan (Barang Datang)" onClose={onClose}>
      <Field label="Tanggal Pesan">
        <InputTanggal value={tanggalPesan} onChange={setTanggalPesan} />
      </Field>
      <Field label="Supplier (opsional)">
        <input
          className={inputClass}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Nama supplier/toko"
        />
      </Field>
      <Field label="Jenis">
        <select className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS_BARANG_MASUK.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      </Field>
      {jenis === "Lainnya" && (
        <Field label="Keterangan">
          <input
            className={inputClass}
            value={jenisLainnya}
            onChange={(e) => setJenisLainnya(e.target.value)}
            placeholder="Contoh: Konsinyasi, Hadiah, dll"
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jumlah Model">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={jumlahModel}
            onChange={(e) => setJumlahModel(Number(e.target.value))}
          />
        </Field>
        <Field label="Jumlah Qty (pcs)">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={jumlahPesan}
            onChange={(e) => setJumlahPesan(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: no. PO, estimasi tiba, dll"
        />
      </Field>
      <button
        disabled={saving || !valid}
        onClick={() =>
          onSubmit({
            tanggal_pesan: tanggalPesan,
            supplier: supplier.trim() || null,
            jenis: jenisFinal || null,
            jumlah_model: jumlahModel,
            jumlah_pesan: jumlahPesan,
            catatan: catatan.trim() || null,
          })
        }
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Pesanan"}
      </button>
    </ModalShell>
  );
}

// Form "Konfirmasi Datang" — dipanggil per pesanan aktif (menunggu/sebagian).
// Default jumlah = sisa yang belum datang (kasus paling umum: datang
// sekaligus), tapi bisa diubah lebih kecil kalau kirimannya bertahap/parsial.
// Kalau diisi lebih besar dari sisa (supplier kirim lebih dari pesanan),
// tidak diblokir — cukup diberi peringatan, karena di lapangan hal ini wajar
// terjadi dan tetap harus bisa dicatat.
export function KonfirmasiDatangForm({ pesanan, sisa, sisaModel, onClose, onSubmit, saving }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [jumlahModel, setJumlahModel] = useState(sisaModel);
  const [jumlah, setJumlah] = useState(sisa);

  const lebihDariSisa = jumlah > sisa;
  const modelLebihDariSisa = jumlahModel > sisaModel;
  const valid = jumlah >= 1 && jumlahModel >= 1;

  return (
    <ModalShell title="Konfirmasi Barang Datang" onClose={onClose}>
      <div className="rounded-lg border border-slate-800 px-3 py-2.5 mb-3 text-xs text-slate-400">
        <div className="flex justify-between mb-1">
          <span>Dipesan</span>
          <span className="text-slate-200">
            {pesanan.jumlah_model} model / {pesanan.jumlah_pesan}x
          </span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Sudah datang</span>
          <span className="text-slate-200">
            {pesanan.jumlah_model_diterima || 0} model / {pesanan.jumlah_diterima || 0}x
          </span>
        </div>
        <div className="flex justify-between">
          <span>Sisa</span>
          <span className="text-amber-400 font-semibold">
            {sisaModel} model / {sisa}x
          </span>
        </div>
      </div>

      <Field label="Tanggal Datang">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jumlah Model Datang">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={jumlahModel}
            onChange={(e) => setJumlahModel(Number(e.target.value))}
          />
        </Field>
        <Field label="Jumlah Qty Datang">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={jumlah}
            onChange={(e) => setJumlah(Number(e.target.value))}
          />
        </Field>
      </div>
      {(modelLebihDariSisa || lebihDariSisa) && (
        <p className="text-[11px] text-amber-400 -mt-2 mb-3">
          {modelLebihDariSisa && `Jumlah model ini lebih besar dari sisa model pesanan (${sisaModel} model). `}
          {lebihDariSisa && `Jumlah qty ini lebih besar dari sisa qty pesanan (${sisa}x). `}
          Tetap bisa disimpan kalau memang supplier mengirim lebih dari yang dipesan.
        </p>
      )}
      <p className="text-[11px] text-slate-500 mb-3">
        Barang sejumlah ini akan langsung tercatat sebagai Barang Masuk dan lanjut ke alur pembuatan SKU seperti
        biasa. Kalau kirimannya belum genap, pesanan ini tetap muncul di daftar aktif untuk dikonfirmasi lagi
        nanti.
      </p>
      <button
        disabled={saving || !valid}
        onClick={() => onSubmit({ tanggal, jumlah, jumlahModel })}
        className="w-full mt-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Konfirmasi Datang"}
      </button>
    </ModalShell>
  );
}

// Form pembuatan SKU — satu layar saja, tidak ada lagi navigasi berpindah
// layar (dulu "cari" → "buat" dengan tombol kembali). Persis pola field
// Pelanggan di Grosir > Buat Pesanan Baru: pilih dari daftar yang sudah ada
// DI ATAS, atau isi bagian "buat SKU baru" di bawahnya — dua-duanya kelihatan
// sekaligus, user tinggal pakai salah satu lalu simpan.
export function SkuEntryForm({ item, master, settings, skuMaster, reload, onClose, onSubmitExisting, onSubmitNew, saving, session }) {
  const isSuperadmin = session?.role === "superadmin";
  const [selectedId, setSelectedId] = useState("");
  const [hargaBaru, setHargaBaru] = useState("");

  const selected = skuMaster.find((s) => String(s.id) === String(selectedId)) || null;
  const skuOptions = skuMaster.map((s) => ({ value: s.id, label: `${s.sku} · stok ${s.stok}` }));

  const [bahan, setBahan] = useState("");
  const [peruntukan, setPeruntukan] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [model, setModel] = useState("1");
  const [modelTouched, setModelTouched] = useState(false);
  const [warna, setWarna] = useState("");
  const [ukuran, setUkuran] = useState("");
  const [hargaAsli, setHargaAsli] = useState("");

  // Khusus superadmin: opsi ketik sendiri harga Grosir/Tengah/Ecer, tanpa
  // ikut rumus calcHarga otomatis. Role lain tidak lihat opsi ini sama sekali.
  const [hargaManual, setHargaManual] = useState(false);
  const [grosirManual, setGrosirManual] = useState("");
  const [tengahManual, setTengahManual] = useState("");
  const [ecerManual, setEcerManual] = useState("");

  // Kode cepat: ketik angka gabungan (mis. "1020") supaya Grosir & Tengah
  // otomatis kepisah jadi 2 bagian sama panjang lalu dikali 1000, dan Ecer
  // otomatis dihitung = Tengah x 2 (tidak diketik manual di kode).
  // "1020" (4 digit -> 2x2 digit) = 10, 20 -> Grosir 10.000, Tengah 20.000,
  // Ecer 40.000 (otomatis). Juga menerima pemisah manual seperti spasi/strip/
  // koma, mis. "10 20" atau "100-20" untuk harga yang jumlah digitnya beda-beda.
  const [kodeCepat, setKodeCepat] = useState("");
  const applyKodeCepat = (raw) => {
    setKodeCepat(raw);
    const bySeparator = raw.split(/[\s\-/,]+/).filter(Boolean);
    let parts = null;
    if (bySeparator.length === 2 && bySeparator.every((p) => /^\d+$/.test(p))) {
      parts = bySeparator;
    } else {
      const digitsOnly = raw.replace(/\D/g, "");
      if (digitsOnly.length > 0 && digitsOnly.length % 2 === 0) {
        const chunkLen = digitsOnly.length / 2;
        parts = [digitsOnly.slice(0, chunkLen), digitsOnly.slice(chunkLen)];
      }
    }
    if (parts) {
      const [g, t] = parts.map((p) => Number(p) * 1000);
      if ([g, t].every((n) => Number.isFinite(n))) {
        setGrosirManual(g);
        setTengahManual(t);
        setEcerManual(t * 2);
      }
    }
  };

  // Rekomendasi nomor Model berikutnya: cari SKU lain dengan kombinasi bahan +
  // peruntukan + kategori + subkategori yang sama, lalu ambil nomor terkecil
  // yang BELUM dipakai (mengisi celah dulu) — bukan sekadar tertinggi + 1.
  // Contoh: sudah ada 1,2,3,10 -> rekomendasinya 4 (bukan 11), karena 4 & 5 kosong.
  // Kalau belum ada kombinasi yang sama sama sekali, rekomendasinya "1".
  const modelSuggestion = useMemo(() => {
    if (!bahan || !peruntukan || !kategori || !subkategori) return null;
    const numbers = new Set(
      (skuMaster || [])
        .filter(
          (s) =>
            s.bahan === bahan &&
            s.peruntukan === peruntukan &&
            s.kategori === kategori &&
            s.subkategori === subkategori
        )
        .map((s) => Number(s.model))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    let next = 1;
    while (numbers.has(next)) next++;
    return String(next);
  }, [bahan, peruntukan, kategori, subkategori, skuMaster]);

  // Isi otomatis field Model dengan rekomendasi selama user belum mengetik manual
  // sendiri — begitu user ubah field Model, berhenti menimpa supaya tidak mengganggu.
  useEffect(() => {
    if (modelSuggestion && !modelTouched) setModel(modelSuggestion);
  }, [modelSuggestion, modelTouched]);

  const manualLengkap = grosirManual !== "" && tengahManual !== "" && ecerManual !== "";
  const fieldsLengkap =
    bahan && peruntukan && kategori && subkategori && model && warna && ukuran && hargaAsli &&
    (!hargaManual || manualLengkap);

  // Preview SKU dihitung begitu kombinasi kode sudah lengkap (belum perlu tunggu
  // harga), supaya deteksi "SKU sudah ada" bisa langsung tampil ke user.
  const skuKombinasi =
    bahan && peruntukan && kategori && subkategori && model && warna && ukuran
      ? `${bahan}${peruntukan}${kategori}-${subkategori}-${model}-${warna}-${ukuran}`
      : null;
  const skuSudahAda = skuKombinasi
    ? (skuMaster || []).find((s) => s.sku === skuKombinasi)
    : null;

  const ready = fieldsLengkap && settings && !skuSudahAda;
  const preview = fieldsLengkap && settings ? skuKombinasi : null;

  return (
    <ModalShell title={`Buat SKU — ${item.jumlah}x barang`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Pilih SKU yang sudah ada untuk menambah stok, atau isi bagian "buat SKU baru" di bawah kalau belum ada.
      </p>

      <Field label="SKU yang sudah ada (opsional)">
        <SearchableSelect
          value={selectedId}
          onChange={(id) => {
            setSelectedId(id);
            setHargaBaru("");
          }}
          options={skuOptions}
          placeholder="Cari kode SKU…"
        />
      </Field>

      {selected && (
        <>
          <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500">Stok setelah ditambah</div>
            <div className="font-mono text-sm text-amber-400">
              {selected.stok} + {item.jumlah} = {selected.stok + item.jumlah}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Harga asli SKU ini saat ini</div>
            <div className="font-mono text-sm text-slate-300">{fmtRp(selected.harga_asli)}</div>
          </div>

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

          <button
            disabled={saving}
            onClick={() =>
              onSubmitExisting(
                selected,
                hargaBaru && Number(hargaBaru) !== selected.harga_asli ? Number(hargaBaru) : null
              )
            }
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg mb-4"
          >
            {saving ? "Menyimpan…" : "Tambahkan Stok & Lanjut ke Rak"}
          </button>
        </>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[11px] text-slate-500 whitespace-nowrap">atau buat SKU baru</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div>
        <Field label="Ketik Kode Gabungan Bahan+Peruntukan+Kategori-Subkategori-Model (opsional)">
          <KodeGabunganInput
            segments={[
              { options: master.bahan || [] },
              { options: master.peruntukan || [] },
              { options: master.kategori || [] },
              { options: master.subkategori || [], sep: "-" },
            ]}
            onPick={([b, p, k, sub], modelText) => {
              setBahan(b.kode);
              setPeruntukan(p.kode);
              setKategori(k.kode);
              setSubkategori(sub.kode);
              if (modelText) {
                setModel(modelText);
                setModelTouched(true);
              }
            }}
            placeholder="Ketik gabungan kode, mis. TDGL-GJR-100"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            Pilih dari daftar yang muncul untuk otomatis mengisi dropdown Bahan, Peruntukan, Kategori &amp; Subkategori di bawah — kalau ada sisa angka/huruf di belakangnya (mis. "100"), otomatis dipakai jadi Model juga.
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Bahan"><Combobox value={bahan} onChange={setBahan} options={master.bahan || []} tipe="bahan" reload={reload} /></Field>
          <Field label="Peruntukan"><Combobox value={peruntukan} onChange={setPeruntukan} options={master.peruntukan || []} tipe="peruntukan" reload={reload} /></Field>
          <Field label="Kategori"><Combobox value={kategori} onChange={setKategori} options={master.kategori || []} tipe="kategori" reload={reload} /></Field>
          <Field label="Subkategori"><Combobox value={subkategori} onChange={setSubkategori} options={master.subkategori || []} tipe="subkategori" reload={reload} /></Field>
          <Field label="Warna"><Combobox value={warna} onChange={setWarna} options={master.warna || []} tipe="warna" reload={reload} /></Field>
          <Field label="Ukuran"><Combobox value={ukuran} onChange={setUkuran} options={master.ukuran || []} tipe="ukuran" reload={reload} /></Field>
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

        {isSuperadmin && (
          <div className="mb-3">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hargaManual}
                onChange={(e) => setHargaManual(e.target.checked)}
                className="accent-amber-500"
              />
              Isi harga Grosir/Tengah/Ecer manual (khusus superadmin)
            </label>
          </div>
        )}

        {isSuperadmin && hargaManual && (
          <>
            <Field label="Kode cepat (opsional)">
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={kodeCepat}
                onChange={(e) => applyKodeCepat(e.target.value)}
                placeholder="mis. 1020 → Grosir 10rb, Tengah 20rb, Ecer 40rb (otomatis 2x Tengah)"
              />
            </Field>
            <div className="grid grid-cols-3 gap-x-2 mb-1">
              <Field label="Grosir">
                <InputRupiah value={grosirManual} onChange={setGrosirManual} placeholder="0" />
              </Field>
              <Field label="Tengah">
                <InputRupiah value={tengahManual} onChange={setTengahManual} placeholder="0" />
              </Field>
              <Field label="Ecer">
                <InputRupiah value={ecerManual} onChange={setEcerManual} placeholder="0" />
              </Field>
            </div>
          </>
        )}

        {skuSudahAda && (
          <div className="mb-3 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            <div className="text-[11px] text-red-400">SKU ini sudah ada di daftar</div>
            <div className="font-mono text-sm text-red-300">{skuKombinasi}</div>
            <p className="text-[11px] text-red-400/80 mt-1.5">
              Stok: {skuSudahAda.stok}. Kalau mau menambah stok barang ini, pilih SKU-nya di kolom "SKU yang sudah
              ada" di atas — bukan lewat "buat SKU baru".
            </p>
          </div>
        )}

        {preview && (
          <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500">SKU</div>
            <div className="font-mono text-sm text-amber-400">{preview}</div>
            {hargaManual && manualLengkap ? (
              <div className="text-[11px] text-slate-500 mt-1.5">
                Ecer (manual): <span className="text-amber-400 font-medium">{fmtRp(ecerManual)}</span>
              </div>
            ) : (
              settings && hargaAsli && (
                <div className="text-[11px] text-slate-500 mt-1.5">
                  Ecer: <span className="text-slate-300 font-medium">{fmtRp(calcHarga(hargaAsli, settings).ecer)}</span>
                </div>
              )
            )}
          </div>
        )}

        <button
          disabled={!ready || saving}
          onClick={() =>
            onSubmitNew(
              { bahan, peruntukan, kategori, subkategori, model, warna, ukuran },
              Number(hargaAsli),
              isSuperadmin && hargaManual
                ? { grosir: Number(grosirManual), tengah: Number(tengahManual), ecer: Number(ecerManual) }
                : null
            )
          }
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Buat SKU Baru & Lanjut ke Rak"}
        </button>
      </div>
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

// Form pindahkan SKU dari rak lama ke rak baru — dipakai dari Peta Rak saat
// SKU yang sama ketahuan jadi "pemenang" di lebih dari satu rak sekaligus.
// Beda dengan TempatkanRakForm: ini tidak membuat baris penempatan baru,
// tapi mengubah rak_code baris penempatan yang sudah ada (lewat onSubmit di
// ModalRouter) supaya rak lamanya langsung kosong, bukan menambah riwayat baru.
export function PindahRakForm({ item, rakList, penempatan, skuMaster, onClose, onSubmit, saving }) {
  // "pindah" = ke rak lain (perlu rak tujuan). "keluar" = dikeluarkan dari rak
  // ini sepenuhnya (bukan dipindah ke rak lain) — barangnya tetap tercatat
  // sebagai stok, tapi tidak lagi menempati rak manapun, jadi otomatis muncul
  // lagi di "Sisa di Gudang" untuk ditempatkan ulang kapan-kapan.
  const [aksi, setAksi] = useState("pindah");
  const [rakCode, setRakCode] = useState("");
  const [confirmingOverride, setConfirmingOverride] = useState(false);

  // Qty maksimum = qty baris penempatan asal saat ini (bukan cuma nilai awal
  // yang dikirim dari Peta Rak), supaya selalu akurat walau data berubah.
  const qtyAsal = useMemo(() => {
    const baris = (penempatan || []).find((p) => p.id === item.penempatanId);
    return Number(baris?.qty ?? item.qty) || 0;
  }, [penempatan, item.penempatanId, item.qty]);
  const [qty, setQty] = useState(qtyAsal || item.qty || 1);

  const occupant = useMemo(() => {
    if (!rakCode) return null;
    return (penempatan || []).find((p) => p.rak_code === rakCode) || null;
  }, [rakCode, penempatan]);

  const skuSamaPersis = occupant && occupant.sku === item.sku;
  const bolehGabung = occupant && sameProdukKecualiUkuran(occupant.sku, item.sku, skuMaster);
  const conflict = occupant && occupant.sku !== item.sku && !bolehGabung;
  const rakSamaDenganLama = rakCode === item.rakLama;
  const qtyValid = qty >= 1 && qty <= qtyAsal;
  const sisaDiAsal = qtyAsal - qty;

  const handleClick = () => {
    if (aksi === "keluar") {
      // Tidak butuh rak tujuan — cukup kirim rakCode kosong, ModalRouter akan
      // mengosongkan/mengurangi baris penempatan asal saja tanpa bikin
      // penempatan baru di rak manapun (barangnya jadi "sisa di gudang").
      onSubmit("", qty, "keluar");
      return;
    }
    if (conflict && !confirmingOverride) {
      setConfirmingOverride(true);
      return;
    }
    onSubmit(rakCode, qty, "pindah");
  };

  if (confirmingOverride && conflict) {
    return (
      <ModalShell title={`Pindahkan — ${item.sku}`} onClose={onClose}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak <span className="font-mono">{rakCode}</span> saat ini berisi SKU{" "}
            <span className="font-mono">{occupant.sku}</span>, produk yang berbeda. Memindahkan SKU{" "}
            <span className="font-mono">{item.sku}</span> ke sini akan menimpanya.
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
            onClick={() => onSubmit(rakCode, qty, "pindah")}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Ya, Timpa SKU"}
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={`${aksi === "keluar" ? "Keluarkan" : "Pindahkan"} — ${item.sku}`}
      onClose={onClose}
    >
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">Rak asal</div>
        <div className="font-mono text-sm text-amber-400">
          {item.rakLama} <span className="text-slate-500 font-sans">· {qtyAsal}x tersedia</span>
        </div>
      </div>

      {/* Pilihan aksi: pindah ke rak lain, atau keluarkan sepenuhnya dari rak
          (barang kembali jadi "sisa di gudang", belum ditempatkan lagi). */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setAksi("pindah")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition ${
            aksi === "pindah"
              ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
              : "border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          <ArrowRightLeft size={13} /> Pindah Rak
        </button>
        <button
          type="button"
          onClick={() => setAksi("keluar")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition ${
            aksi === "keluar"
              ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
              : "border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          <Warehouse size={13} /> Keluarkan
        </button>
      </div>

      <Field label={aksi === "keluar" ? "Jumlah dikeluarkan" : "Jumlah dipindahkan"}>
        <input
          type="number"
          min="1"
          max={qtyAsal}
          className={inputClass}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </Field>
      {!qtyValid && (
        <div className="text-[11px] text-red-400 -mt-2 mb-3">Jumlah harus antara 1 – {qtyAsal}.</div>
      )}
      {qtyValid && sisaDiAsal > 0 && (
        <div className="text-[11px] text-slate-500 -mt-2 mb-3">
          Sisa <b className="text-slate-300">{sisaDiAsal}x</b> tetap di rak <span className="font-mono">{item.rakLama}</span>.
        </div>
      )}

      {aksi === "keluar" ? (
        <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs px-3 py-2 rounded-lg mb-3">
          <Warehouse size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            <b>{qty}x</b> SKU <span className="font-mono">{item.sku}</span> akan dikeluarkan dari rak{" "}
            <span className="font-mono">{item.rakLama}</span> — tidak dipindah ke rak manapun, tapi stoknya
            tetap tercatat sebagai <b>sisa di gudang</b> dan bisa ditempatkan ulang kapan-kapan.
          </div>
        </div>
      ) : (
        <>
          <Field label="Rak tujuan">
            <SearchableSelect
              value={rakCode}
              onChange={setRakCode}
              options={rakList.filter((r) => r.code !== item.rakLama).map((r) => ({ value: r.code, label: r.code }))}
              placeholder="Ketik atau pilih rak…"
            />
          </Field>
          {bolehGabung && (
            <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg mb-3">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <div>
                {skuSamaPersis ? (
                  <>
                    Rak ini sudah berisi SKU yang sama persis. Qty akan <b>ditambahkan</b> ke qty yang sudah ada di
                    rak ini, tidak akan menimpa.
                  </>
                ) : (
                  <>
                    Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> — produk yang sama, cuma
                    beda ukuran. Boleh digabung, tidak akan menimpa.
                  </>
                )}
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
        </>
      )}

      <button
        disabled={aksi === "keluar" ? !qtyValid || saving : !rakCode || rakSamaDenganLama || !qtyValid || saving}
        onClick={handleClick}
        className={`w-full disabled:opacity-40 font-semibold text-sm py-2.5 rounded-lg ${
          aksi === "keluar"
            ? "bg-orange-500 hover:bg-orange-400 text-slate-950"
            : "bg-amber-500 hover:bg-amber-400 text-slate-950"
        }`}
      >
        {saving ? "Menyimpan…" : aksi === "keluar" ? "Keluarkan dari Rak" : "Pindahkan SKU"}
      </button>
    </ModalShell>
  );
}

// Form ganti password akun sendiri — tersedia untuk SEMUA role lewat Sidebar
// (beda dengan Kelola User di Pengaturan yang cuma bisa diakses superadmin
// dan bisa ganti password user lain tanpa tahu password lama).
export function GantiPasswordForm({ onClose, onSubmit, saving }) {
  const [passwordLama, setPasswordLama] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!passwordLama || !passwordBaru || !konfirmasi) {
      setError("Semua kolom wajib diisi");
      return;
    }
    if (passwordBaru.length < 6) {
      setError("Password baru minimal 6 karakter");
      return;
    }
    if (passwordBaru !== konfirmasi) {
      setError("Konfirmasi password baru tidak cocok");
      return;
    }
    setError("");
    onSubmit(passwordLama, passwordBaru);
  };

  return (
    <ModalShell title="Ganti Password" onClose={onClose}>
      <Field label="Password Lama">
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={passwordLama}
          onChange={(e) => setPasswordLama(e.target.value)}
        />
      </Field>
      <Field label="Password Baru">
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={passwordBaru}
          onChange={(e) => setPasswordBaru(e.target.value)}
        />
      </Field>
      <Field label="Konfirmasi Password Baru">
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={konfirmasi}
          onChange={(e) => setKonfirmasi(e.target.value)}
        />
      </Field>
      {error && <div className="text-xs text-red-400 -mt-1 mb-3">{error}</div>}
      <button
        disabled={saving}
        onClick={submit}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Password Baru"}
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

      {item.foto_url && (
        <div className="mb-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2.5 rounded-lg">
          <span>SKU ini sudah punya foto. Upload baru akan menimpa foto lama.</span>
        </div>
      )}

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

// Edit data rak (kode, meja, baris) — dipakai dari Master Rak. Ubah kode rak
// sengaja tetap diizinkan (kadang perlu rapikan penomoran), tapi pemanggilnya
// (ModalRouter) yang tanggung jawab menyamakan rak_code di penempatan & items
// yang masih menunjuk ke kode lama, supaya datanya tidak jadi anak hilang.
// Form tambah/edit Pelanggan Grosir. Kalau `pelanggan` diisi berarti mode
// edit (kode tidak bisa diubah, sudah dipakai sebagai referensi di pesanan
// nanti); kalau kosong berarti tambah baru (kode dibuat otomatis oleh
// pemanggil / ModalRouter sebelum form ini tampil, lihat prop `kodeBaru`).
export function PelangganForm({ pelanggan, pelangganList, kodeBaru, onClose, onSubmit, saving }) {
  const [nama, setNama] = useState(pelanggan?.nama || "");
  const [wa, setWa] = useState(pelanggan?.wa || "");
  const [alamat, setAlamat] = useState(pelanggan?.alamat || "");
  const [kota, setKota] = useState(pelanggan?.kota || "");
  const [catatan, setCatatan] = useState(pelanggan?.catatan || "");
  const kode = pelanggan?.kode || kodeBaru;

  // Kode dibuat otomatis di belakang layar (lihat prop `kodeBaru`, dibuat oleh
  // ModalRouter sebelum form ini tampil) — TIDAK ditampilkan/diminta ke user,
  // sama seperti alur tambah pelanggan baru langsung dari Buat Pesanan Grosir.
  // Cek apakah no. WA yang lagi diketik sudah dipakai pelanggan lain —
  // dibandingkan dalam bentuk yang sudah dinormalisasi (0812.../+62812... dianggap sama).
  const bentrok = wa.trim() ? pelangganDenganWa(wa, pelangganList, pelanggan?.id) : null;

  return (
    <ModalShell title={pelanggan ? `Edit Pelanggan — ${kode}` : "Tambah Pelanggan"} onClose={onClose}>
      <Field label="Nama"><input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama pelanggan / toko" autoFocus /></Field>
      <Field label="No. WA">
        <input
          className={`${inputClass} ${bentrok ? "border-red-500/60 focus:border-red-500" : ""}`}
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder="08xxxxxxxxxx"
        />
        {bentrok && (
          <div className="text-[11px] text-red-400 mt-1">
            No. WA ini sudah terdaftar atas nama {bentrok.nama} ({bentrok.kode}).
          </div>
        )}
      </Field>
      <Field label="Alamat"><input className={inputClass} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
      <Field label="Kota"><input className={inputClass} value={kota} onChange={(e) => setKota(e.target.value)} /></Field>
      <Field label="Catatan"><input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" /></Field>
      <button
        disabled={!nama.trim() || !!bentrok || saving}
        onClick={() =>
          onSubmit({
            kode,
            nama: nama.trim(),
            wa: wa.trim() || null,
            alamat: alamat.trim() || null,
            kota: kota.trim() || null,
            catatan: catatan.trim() || null,
          })
        }
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// Form tambah/edit Toko Pengirim / Reseller.
export function TokoForm({ toko, tokoList, kodeBaru, onClose, onSubmit, saving }) {
  const [namaToko, setNamaToko] = useState(toko?.nama_toko || "");
  const [alamat, setAlamat] = useState(toko?.alamat || "");
  const [telepon, setTelepon] = useState(toko?.telepon || "");
  const [jenisToko, setJenisToko] = useState(toko?.jenis_toko || "");
  const kode = toko?.kode || kodeBaru;

  // Kode dibuat otomatis di belakang layar juga (sama seperti Pelanggan) —
  // tidak ditampilkan/diminta ke user.
  return (
    <ModalShell title={toko ? `Edit Toko — ${kode}` : "Tambah Toko Pengirim"} onClose={onClose}>
      <Field label="Nama Toko"><input className={inputClass} value={namaToko} onChange={(e) => setNamaToko(e.target.value)} autoFocus /></Field>
      <Field label="Alamat"><input className={inputClass} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
      <Field label="Telepon"><input className={inputClass} value={telepon} onChange={(e) => setTelepon(e.target.value)} /></Field>
      <Field label="Jenis Toko"><input className={inputClass} value={jenisToko} onChange={(e) => setJenisToko(e.target.value)} placeholder="Opsional" /></Field>
      <button
        disabled={!namaToko.trim() || saving}
        onClick={() =>
          onSubmit({
            kode,
            nama_toko: namaToko.trim(),
            alamat: alamat.trim() || null,
            telepon: telepon.trim() || null,
            jenis_toko: jenisToko.trim() || null,
          })
        }
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// Form catat cicilan/pembayaran hutang untuk satu pesanan grosir.
export function BayarHutangForm({ pesanan, sisaHutang, saldoDeposit, onClose, onSubmit, saving }) {
  const [jumlah, setJumlah] = useState(sisaHutang);
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [catatan, setCatatan] = useState("");

  const jumlahNum = Number(jumlah) || 0;
  const kelebihan = metodeBayar !== "Deposit" && jumlahNum > sisaHutang ? jumlahNum - sisaHutang : 0;
  const depositTidakCukup = metodeBayar === "Deposit" && jumlahNum > saldoDeposit;
  const canSubmit = jumlahNum > 0 && !depositTidakCukup && !saving;

  return (
    <ModalShell title={`Catat Pembayaran — ${pesanan.nomor_pesanan}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-900">
          <span className="text-slate-500 text-xs">Sisa Hutang</span>
          <span className="text-red-400 font-semibold">{fmtRp(sisaHutang)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-950">
          <span className="text-slate-500 text-xs">Saldo Deposit Pelanggan</span>
          <span className="text-emerald-400 font-semibold">{fmtRp(saldoDeposit)}</span>
        </div>
      </div>

      <Field label="Metode Bayar">
        <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className={inputClass}>
          <option value="Cash">Cash</option>
          <option value="Transfer">Transfer</option>
          <option value="Deposit">Pakai Saldo Deposit</option>
        </select>
      </Field>

      <Field label="Jumlah Dibayar">
        <input
          type="number"
          min="1"
          className={inputClass}
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </Field>

      {kelebihan > 0 && (
        <div className="flex items-start gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Bayar melebihi sisa hutang pesanan ini sebesar <span className="font-semibold">{fmtRp(kelebihan)}</span>.
            Kelebihannya otomatis dipakai buat melunasi pesanan lain milik pelanggan ini yang belum lunas (dari yang
            paling lama); kalau masih tersisa, baru masuk sebagai saldo deposit.
          </div>
        </div>
      )}
      {depositTidakCukup && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo deposit pelanggan tidak cukup untuk jumlah ini.</div>
        </div>
      )}

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit({ jumlah: jumlahNum, metodeBayar, catatan: catatan.trim() })}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Pembayaran"}
      </button>
    </ModalShell>
  );
}

// Form bayar hutang gabungan di level pelanggan (bukan per-pesanan) — dipakai
// dari modal Riwayat Pelanggan saat pelanggan masih punya total hutang neto.
// Uang yang masuk otomatis dialokasikan ke pesanan yang masih hutang, dari
// yang paling lama dulu, sampai jumlahnya habis atau semua hutang lunas;
// kalau masih ada sisa setelah semua hutang lunas, otomatis masuk saldo deposit.
export function BayarHutangPelangganForm({ pelanggan, totalHutang, saldoDeposit, onClose, onSubmit, saving }) {
  const [jumlah, setJumlah] = useState(totalHutang);
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [catatan, setCatatan] = useState("");

  const jumlahNum = Number(jumlah) || 0;
  const kelebihan = metodeBayar !== "Deposit" && jumlahNum > totalHutang ? jumlahNum - totalHutang : 0;
  const depositTidakCukup = metodeBayar === "Deposit" && Math.min(jumlahNum, totalHutang) > saldoDeposit + 0.0001;
  const canSubmit = jumlahNum > 0 && !depositTidakCukup && !saving;

  return (
    <ModalShell title={`Bayar Hutang — ${pelanggan.nama}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-900">
          <span className="text-slate-500 text-xs">Total Hutang</span>
          <span className="text-red-400 font-semibold">{fmtRp(totalHutang)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-950">
          <span className="text-slate-500 text-xs">Saldo Deposit Pelanggan</span>
          <span className="text-emerald-400 font-semibold">{fmtRp(saldoDeposit)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Uang yang masuk otomatis dialokasikan ke pesanan yang paling lama belum lunas dulu, sampai semua hutang
        terbayar atau jumlahnya habis.
      </p>

      <Field label="Metode Bayar">
        <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className={inputClass}>
          <option value="Cash">Cash</option>
          <option value="Transfer">Transfer</option>
          <option value="Deposit">Pakai Saldo Deposit</option>
        </select>
      </Field>

      <Field label="Jumlah Dibayar">
        <input
          type="number"
          min="1"
          className={inputClass}
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </Field>

      {kelebihan > 0 && (
        <div className="flex items-start gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Bayar melebihi total hutang sebesar <span className="font-semibold">{fmtRp(kelebihan)}</span>. Selisihnya
            otomatis dicatat sebagai saldo deposit pelanggan, tidak hangus.
          </div>
        </div>
      )}
      {depositTidakCukup && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo deposit pelanggan tidak cukup untuk jumlah ini.</div>
        </div>
      )}

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit({ jumlah: jumlahNum, metodeBayar, catatan: catatan.trim() })}
        className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Pembayaran"}
      </button>
    </ModalShell>
  );
}

// Form cairkan (bayar tunai/transfer ke pelanggan) sebagian atau seluruh
// saldo deposit — dipakai kalau TOKO yang berhutang ke pelanggan (kelebihan
// bayar/titipan) dan mau dilunasi keluar, bukan dipakai lagi buat pesanan.
export function CairkanDepositForm({ pelanggan, saldoDeposit, onClose, onSubmit, saving }) {
  const [jumlah, setJumlah] = useState(saldoDeposit);
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [catatan, setCatatan] = useState("");

  const jumlahNum = Number(jumlah) || 0;
  const melebihi = jumlahNum > saldoDeposit;
  const canSubmit = jumlahNum > 0 && !melebihi && !saving;

  return (
    <ModalShell title={`Cairkan Deposit — ${pelanggan.nama}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-900">
          <span className="text-slate-500 text-xs">Saldo Deposit Saat Ini</span>
          <span className="text-emerald-400 font-semibold">{fmtRp(saldoDeposit)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Catat kalau uang ini benar-benar sudah dibayar/dikembalikan ke pelanggan (cash atau transfer). Saldo deposit
        pelanggan akan berkurang sebesar jumlah yang dicairkan.
      </p>

      <Field label="Metode Bayar">
        <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className={inputClass}>
          <option value="Cash">Cash</option>
          <option value="Transfer">Transfer</option>
        </select>
      </Field>

      <Field label="Jumlah Dicairkan">
        <input
          type="number"
          min="1"
          className={inputClass}
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </Field>

      {melebihi && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Jumlah melebihi saldo deposit yang tersedia.</div>
        </div>
      )}

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit({ jumlah: jumlahNum, metodeBayar, catatan: catatan.trim() })}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Cairkan Deposit"}
      </button>
    </ModalShell>
  );
}

// Form tambah/edit satu baris transaksi keuangan.
// Jenis transaksi ada 3: Pemasukan, Pengeluaran, Transfer Antar Rekening.
//   - Pemasukan/Pengeluaran: wajib isi Sumber Dana (rekening) + Kategori.
//     Kategori mengikuti jenisnya (daftar beda untuk pemasukan vs pengeluaran)
//     — kalau jenis diganti dan kategori lama tidak ada di daftar baru, direset.
//   - Transfer: wajib isi Sumber Dana (rekening asal) + Rekening Tujuan, TANPA
//     kategori (bukan pemasukan/pengeluaran riil, cuma mutasi saldo sendiri).
// Rekening & kategori berasal dari master data yang didaftarkan user sendiri
// di halaman Keuangan > Rekening & Kategori (prop `master`, dengan shape
// { rekening: [], kategori_masuk: [], kategori_keluar: [] } — masing-masing
// array berisi { kode, label } dari tabel master_data).
// Ketiga field (Sumber Dana/Rekening Asal, Rekening Tujuan, Kategori) pakai
// Combobox (bisa diketik) — kalau yang diketik belum ada di daftar, tetap
// bisa dipilih apa adanya sebagai kode baru: otomatis dibuat ke master_data
// (tabel yang sama dipakai halaman Rekening & Kategori) saat transaksi
// disimpan, lihat ModalRouter.jsx.
// Field Rekening & Kategori dulu pakai Combobox (popup mini-form "Kode" +
// "Nama" di dalam dropdown untuk bikin entri baru). Sekarang pakai
// SearchableSelectOrNew — persis pola field Pelanggan di Grosir > Buat
// Pesanan Baru: pilih dari daftar di SearchableSelect, ATAU ketik nama baru
// langsung di input polos di bawahnya. Kode untuk entri baru (rekening/
// kategori) baru dibuat otomatis dari nama yang diketik saat form ini
// disimpan — lihat penanganannya di ModalRouter.
export function KeuanganTransaksiForm({ transaksi, master, keuanganTransaksi, reload, onClose, onSubmit, saving }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(transaksi?.tanggal || todayIso);
  const [tipe, setTipe] = useState(transaksi?.tipe || "masuk");
  const [rekening, setRekening] = useState(transaksi?.rekening || "");
  const [rekeningBaruKode, setRekeningBaruKode] = useState("");
  const [rekeningBaru, setRekeningBaru] = useState("");
  const [rekeningTujuan, setRekeningTujuan] = useState(transaksi?.rekening_tujuan || "");
  const [rekeningTujuanBaruKode, setRekeningTujuanBaruKode] = useState("");
  const [rekeningTujuanBaru, setRekeningTujuanBaru] = useState("");
  const [kategori, setKategori] = useState(transaksi?.kategori || "");
  const [kategoriBaruKode, setKategoriBaruKode] = useState("");
  const [kategoriBaru, setKategoriBaru] = useState("");
  const [jumlah, setJumlah] = useState(transaksi?.jumlah ?? "");
  // Keterangan berupa daftar baris — biar bisa bikin beberapa transaksi
  // sekaligus dengan nominal/rekening/kategori yang sama tapi keterangan
  // beda-beda (mis. "Gaji Isti", "Gaji Fuji", "Gaji Ido", satu per baris).
  // Mode multi HANYA untuk transaksi baru — kalau lagi edit transaksi lama,
  // tetap satu baris seperti biasa supaya tidak ambigu diedit jadi berapa.
  const [keteranganList, setKeteranganList] = useState([transaksi?.keterangan || ""]);

  const daftarRekening = master?.rekening || [];
  const daftarKategori = tipe === "masuk" ? (master?.kategori_masuk || []) : (master?.kategori_keluar || []);
  const rekeningOptions = daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));
  const kategoriOptions = daftarKategori.map((k) => ({ value: k.kode, label: `${k.label} (${k.kode})` }));
  const isTransfer = tipe === "transfer";
  const isKeluarSaldo = tipe === "keluar" || isTransfer; // dua-duanya narik dari saldo rekening asal

  const gantiTipe = (t) => {
    setTipe(t);
    if (t === "transfer") {
      setKategori("");
      setKategoriBaruKode("");
      setKategoriBaru("");
    } else {
      const list = t === "masuk" ? (master?.kategori_masuk || []) : (master?.kategori_keluar || []);
      if (!list.some((k) => k.kode === kategori)) setKategori("");
    }
  };

  // Rekomendasi "Keterangan" diambil dari riwayat transaksi yang tipenya sama
  // (masuk/keluar/transfer) — dihitung frekuensinya lalu diurutkan dari yang
  // paling sering dipakai, supaya keterangan yang berulang (mis. "Bayar
  // listrik", "Setoran harian") langsung muncul begitu mulai mengetik.
  // Keterangan yang sudah dihapus dari "Log Keterangan" (master_data tipe
  // "keterangan_hidden") tidak ikut direkomendasikan lagi.
  const keteranganSuggestions = (() => {
    const hidden = new Set((master?.keterangan_hidden || []).map((m) => m.label.toLowerCase()));
    const count = new Map();
    for (const t of keuanganTransaksi || []) {
      const k = (t.keterangan || "").trim();
      if (!k || t.tipe !== tipe || hidden.has(k.toLowerCase())) continue;
      count.set(k, (count.get(k) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();

  // Saldo rekening asal SAAT INI, dihitung dari semua transaksi lain (kalau
  // sedang edit transaksi ini, transaksi lama ini sendiri dikeluarkan dulu
  // dari perhitungan supaya tidak dobel-hitung dampaknya ke saldo). Rekening
  // yang baru diketik (belum tersimpan) dianggap saldonya 0.
  const riwayatUntukSaldo = (keuanganTransaksi || []).filter((t) => t.id !== transaksi?.id);
  const saldoSaatIni = saldoPerRekening(riwayatUntukSaldo, daftarRekening);
  const saldoRekeningAsal = rekening
    ? (saldoSaatIni.find((r) => r.kode === rekening)?.saldo ?? 0)
    : rekeningBaru.trim()
    ? 0
    : null;

  const rekeningTerisi = !!(rekening || rekeningBaru.trim());
  const kategoriTerisi = !!(kategori || kategoriBaru.trim());
  const rekeningTujuanTerisi = !!(rekeningTujuan || rekeningTujuanBaru.trim());
  const rekeningSamaDenganTujuan =
    (rekening && rekening === rekeningTujuan) ||
    (rekeningBaru.trim() && rekeningTujuanBaru.trim() && rekeningBaru.trim().toLowerCase() === rekeningTujuanBaru.trim().toLowerCase());

  const jumlahNum = Number(jumlah) || 0;
  // Kalau lagi mode multi (>1 baris keterangan terisi), saldo yang perlu dicek
  // adalah total semua baris (jumlah x banyak baris), bukan cuma satu baris —
  // supaya tidak lolos validasi padahal totalnya melebihi saldo rekening.
  const jumlahBarisTerisi = Math.max(1, keteranganList.filter((k) => k.trim()).length);
  const totalJumlah = jumlahNum * jumlahBarisTerisi;
  const saldoTidakCukup = isKeluarSaldo && rekeningTerisi && jumlahNum > 0 && totalJumlah > (saldoRekeningAsal ?? 0);

  const canSubmit =
    tanggal &&
    rekeningTerisi &&
    jumlahNum > 0 &&
    !saving &&
    !saldoTidakCukup &&
    (isTransfer ? rekeningTujuanTerisi && !rekeningSamaDenganTujuan : kategoriTerisi);

  return (
    <ModalShell title={transaksi ? "Edit Transaksi" : "Tambah Transaksi"} onClose={onClose}>
      <Field label="Jenis Transaksi">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => gantiTipe("masuk")}
            className={`py-2 rounded-lg text-[11px] font-semibold border ${
              tipe === "masuk"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            Pemasukan
          </button>
          <button
            type="button"
            onClick={() => gantiTipe("keluar")}
            className={`py-2 rounded-lg text-[11px] font-semibold border ${
              tipe === "keluar"
                ? "bg-red-500/15 border-red-500/40 text-red-400"
                : "border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            Pengeluaran
          </button>
          <button
            type="button"
            onClick={() => gantiTipe("transfer")}
            className={`py-2 rounded-lg text-[11px] font-semibold border ${
              tipe === "transfer"
                ? "bg-sky-500/15 border-sky-500/40 text-sky-400"
                : "border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            Transfer
          </button>
        </div>
      </Field>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label={isTransfer ? "Rekening Asal" : "Sumber Dana"}>
        <SearchableSelectOrNew
          value={rekening}
          onChange={setRekening}
          newKode={rekeningBaruKode}
          onNewKodeChange={setRekeningBaruKode}
          newLabel={rekeningBaru}
          onNewLabelChange={setRekeningBaru}
          options={rekeningOptions}
          placeholder="Cari rekening yang sudah ada…"
          newPlaceholder="Atau ketik nama rekening baru"
        />
        {saldoRekeningAsal !== null && (
          <div className={`text-[11px] mt-1 ${saldoTidakCukup ? "text-red-400" : "text-slate-500"}`}>
            Saldo saat ini: {fmtRp(saldoRekeningAsal)}
          </div>
        )}
      </Field>

      {isTransfer && (
        <Field label="Rekening Tujuan">
          <SearchableSelectOrNew
            value={rekeningTujuan}
            onChange={setRekeningTujuan}
            newKode={rekeningTujuanBaruKode}
            onNewKodeChange={setRekeningTujuanBaruKode}
            newLabel={rekeningTujuanBaru}
            onNewLabelChange={setRekeningTujuanBaru}
            options={rekeningOptions.filter((r) => r.value !== rekening)}
            placeholder="Cari rekening tujuan yang sudah ada…"
            newPlaceholder="Atau ketik nama rekening baru"
          />
          {rekeningSamaDenganTujuan && (
            <div className="text-[11px] text-red-400 mt-1">Rekening tujuan tidak boleh sama dengan rekening asal.</div>
          )}
        </Field>
      )}

      {!isTransfer && (
        <Field label="Kategori">
          <SearchableSelectOrNew
            value={kategori}
            onChange={setKategori}
            newKode={kategoriBaruKode}
            onNewKodeChange={setKategoriBaruKode}
            newLabel={kategoriBaru}
            onNewLabelChange={setKategoriBaru}
            options={kategoriOptions}
            placeholder={`Cari kategori ${tipe === "masuk" ? "pemasukan" : "pengeluaran"} yang sudah ada…`}
            newPlaceholder="Atau ketik nama kategori baru"
          />
        </Field>
      )}

      <Field label={keteranganList.length > 1 ? "Keterangan (satu transaksi per baris)" : "Keterangan (opsional)"}>
        <div className="space-y-1.5">
          {keteranganList.map((k, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="flex-1">
                <SuggestInput
                  value={k}
                  onChange={(val) => {
                    const next = [...keteranganList];
                    next[idx] = val;
                    setKeteranganList(next);
                  }}
                  suggestions={keteranganSuggestions}
                  placeholder={isTransfer ? "Contoh: setor tunai ke bank" : "Penjelasan tambahan dari kategori di atas"}
                />
              </div>
              {keteranganList.length > 1 && (
                <button
                  type="button"
                  onClick={() => setKeteranganList(keteranganList.filter((_, i) => i !== idx))}
                  className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 flex-shrink-0"
                  title="Hapus baris"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!transaksi && (
          <button
            type="button"
            onClick={() => setKeteranganList([...keteranganList, ""])}
            className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 hover:text-amber-300 mt-2"
          >
            <Plus size={12} /> Tambah Baris (nominal &amp; rekening sama)
          </button>
        )}
        {keteranganList.length > 1 && (
          <div className="text-[11px] text-slate-500 mt-1.5">
            Akan tersimpan sebagai {keteranganList.filter((k) => k.trim()).length || keteranganList.length} transaksi
            terpisah, masing-masing sebesar jumlah di bawah.
          </div>
        )}
      </Field>

      <Field label="Jumlah (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
        <div className="text-[11px] text-slate-500 mt-1">
          {isTransfer
            ? "Dicatat sebagai saldo keluar dari rekening asal dan masuk ke rekening tujuan."
            : `Dicatat otomatis sebagai ${tipe === "masuk" ? "kas masuk (+)" : "kas keluar (-)"}.`}
        </div>
      </Field>

      {saldoTidakCukup && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Saldo {daftarRekening.find((r) => r.kode === rekening)?.label || rekeningBaru || rekening} tidak cukup —
            saldo saat ini hanya {fmtRp(saldoRekeningAsal ?? 0)}, tapi total transaksi{" "}
            {jumlahBarisTerisi > 1 ? `${jumlahBarisTerisi} x ${fmtRp(jumlahNum)} = ${fmtRp(totalJumlah)}` : fmtRp(jumlahNum)}.
          </div>
        </div>
      )}

      <button
        disabled={!canSubmit}
        onClick={() => {
          const daftarKeterangan = keteranganList.map((k) => k.trim()).filter(Boolean);
          onSubmit({
            tanggal,
            tipe,
            rekening: rekening || null,
            rekeningBaruKode: rekeningBaruKode.trim() || null,
            rekeningBaru: rekeningBaru.trim() || null,
            rekening_tujuan: isTransfer ? rekeningTujuan || null : null,
            rekeningTujuanBaruKode: isTransfer ? rekeningTujuanBaruKode.trim() || null : null,
            rekeningTujuanBaru: isTransfer ? rekeningTujuanBaru.trim() || null : null,
            kategori: isTransfer ? null : kategori || null,
            kategoriBaruKode: isTransfer ? null : kategoriBaruKode.trim() || null,
            kategoriBaru: isTransfer ? null : kategoriBaru.trim() || null,
            jumlah: jumlahNum,
            // Kalau semua baris keterangan kosong, tetap kirim 1 transaksi tanpa
            // keterangan (perilaku lama). Kalau ada isinya, satu transaksi per baris.
            keteranganList: daftarKeterangan.length ? daftarKeterangan : [null],
          });
        }}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving
          ? "Menyimpan…"
          : keteranganList.filter((k) => k.trim()).length > 1
          ? `Simpan ${keteranganList.filter((k) => k.trim()).length} Transaksi`
          : "Simpan"}
      </button>
    </ModalShell>
  );
}

export function EditRakForm({ rak, onClose, onSubmit, saving }) {
  const [code, setCode] = useState(rak.code || "");
  const [meja, setMeja] = useState(rak.meja || "");
  const [baris, setBaris] = useState(rak.baris || "");
  return (
    <ModalShell title={`Edit Rak — ${rak.code}`} onClose={onClose}>
      <Field label="Kode Rak"><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: M02-B03" /></Field>
      <Field label="Meja"><input className={inputClass} value={meja} onChange={(e) => setMeja(e.target.value)} /></Field>
      <Field label="Baris"><input className={inputClass} value={baris} onChange={(e) => setBaris(e.target.value)} /></Field>
      {code !== rak.code && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Kode rak diganti dari <span className="font-mono">{rak.code}</span> ke{" "}
            <span className="font-mono">{code}</span>. Semua penempatan SKU dan data barang yang menunjuk ke rak
            ini akan ikut disesuaikan otomatis.
          </div>
        </div>
      )}
      <button
        disabled={!code || saving}
        onClick={() => onSubmit({ code, meja: meja || null, baris: baris || null })}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Perubahan"}
      </button>
    </ModalShell>
  );
}