import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Warehouse, Plus, X, PackageCheck, Camera, ScanLine, Loader2, CheckCircle2, Search, ShoppingBag } from "lucide-react";
import { ModalShell, Field, Combobox, SearchableSelect, SearchableSelectOrNew, KodeGabunganInput, inputClass, InputTanggal, InputRupiah, SuggestInput, Badge } from "./ui";
import { fmtRp, calcHarga, sameProdukKecualiUkuran, saldoPerRekening, pelangganDenganWa } from "../lib/api";
import { rakForSku } from "../pages/Rak";
import { bacaFotoSku, pecahSegmenPertama, cariKodeDariTeks, decodeKodeHarga } from "../lib/ocrSku";

// Opsi jenis/asal barang masuk. "Lainnya" membuka input teks bebas supaya
// tetap fleksibel untuk kasus di luar Pembelian & Retur. Diexport supaya
// dipakai juga di PesananMasukForm (Barang Datang) — jenisnya sama persis.
export const JENIS_BARANG_MASUK = ["Pembelian", "Retur", "Lainnya"];

// Datalist HTML bersama untuk kolom Supplier/Toko di form-form Barang Datang
// (Pesan Barang, Input Barang Datang, Edit Riwayat) — dropdown saran diambil
// dari tabel "suppliers" (master data, lihat SupplierForm & ModalRouter
// "supplier-form"), tapi kolomnya tetap teks bebas (boleh ketik nama baru)
// supaya tidak memblokir input kalau supplier belum sempat didaftarkan dulu.
function SupplierDatalist({ suppliers }) {
  return (
    <datalist id="supplier-datalist">
      {(suppliers || []).map((s) => (
        <option key={s.id} value={s.nama} />
      ))}
    </datalist>
  );
}

// Datalist saran "Nama Model" — diambil dari daftar model yang sudah
// didaftarkan di data Supplier (field `models`, lihat SupplierForm), TAPI
// cuma untuk supplier yang namanya cocok dengan yang sedang diisi di kolom
// Supplier/Toko form ini (pencocokan case-insensitive, karena kolom Supplier
// masih teks bebas). Kalau belum ada yang cocok, datalist-nya kosong saja —
// kolom "Nama Model" tetap teks bebas seperti biasa.
function ModelNamaDatalist({ id, suppliers, supplierNama }) {
  const s = (suppliers || []).find(
    (x) => x.nama?.trim().toLowerCase() === (supplierNama || "").trim().toLowerCase()
  );
  const models = Array.isArray(s?.models) ? s.models : [];
  return (
    <datalist id={id}>
      {models.map((m, i) => (
        <option key={`${m}-${i}`} value={m} />
      ))}
    </datalist>
  );
}

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

// Form "Input Barang Datang" — SATU LANGKAH: dicatat begitu barang fisik
// sudah di tangan (bukan janji pesanan dulu baru dikonfirmasi belakangan).
// Tiap model: "Qty Datang" = TOTAL fisik yang diterima (baik + rusak jadi
// satu angka), "Qty Rusak" = berapa dari total itu yang rusak (subset dari
// Qty Datang, jadi tidak boleh lebih besar). SELURUH Qty Datang (totalnya)
// ikut masuk ke alur barang (items, tahap "sku") supaya bisa lanjut dibuatkan
// SKU seperti biasa. Begitu SKU-nya dibuat (lihat ModalRouter "buat-sku"),
// qty rusak otomatis dipisah: qty final (Qty Datang - Qty Rusak) yang masuk
// stok/rak, dan qty rusak tercatat ke menu "Rusak" (SKU + qty rusak).
// Satu baris model dalam input barang datang (dipakai berulang di
// BarangDatangForm).
function barisBarangDatang() {
  return { nama: "", jumlahDatang: 1, jumlahRusak: 0, alasanRusak: "", harga: "" };
}

export function BarangDatangForm({ onClose, onSubmit, saving, suppliers }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [fotoBon, setFotoBon] = useState(null);
  const [fotoBonPreview, setFotoBonPreview] = useState(null);
  const [supplier, setSupplier] = useState("");
  const [jenis, setJenis] = useState("Pembelian");
  const [jenisLainnya, setJenisLainnya] = useState("");
  const [models, setModels] = useState([barisBarangDatang()]);
  const [catatan, setCatatan] = useState("");

  const handleFotoBon = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoBon(f);
    setFotoBonPreview(URL.createObjectURL(f));
  };

  const updateModel = (idx, patch) =>
    setModels((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const tambahModel = () => setModels((rows) => [...rows, barisBarangDatang()]);
  const hapusModel = (idx) => setModels((rows) => rows.filter((_, i) => i !== idx));

  // totalDatang = total fisik yang diterima (sudah termasuk rusak, karena
  // Qty Datang sekarang memang diisi sebagai TOTAL, bukan cuma yang baik).
  const totalDatang = models.reduce((sum, m) => sum + (Number(m.jumlahDatang) || 0), 0);
  const totalRusak = models.reduce((sum, m) => sum + (Number(m.jumlahRusak) || 0), 0);
  // Nilai (Rp) dihitung dari TOTAL qty datang (bukan cuma qty baik) — qty
  // rusak tetap ikut dihitung nilainya, karena barang rusak yang diterima
  // tetap dianggap dibeli/dibayar penuh (klaim ke supplier itu urusan
  // terpisah, bukan pengurang nilai pembelian di sini).
  const totalNilai = models.reduce(
    (sum, m) => sum + (Number(m.jumlahDatang) || 0) * (Number(m.harga) || 0),
    0
  );
  const jenisFinal = jenis === "Lainnya" ? jenisLainnya.trim() : jenis;
  // Qty rusak tidak boleh lebih besar dari qty datang di baris yang sama —
  // rusak itu bagian DARI yang datang, jadi maksimal ya sebanyak yang datang.
  const rusakMelebihiDatang = (m) => (Number(m.jumlahRusak) || 0) > (Number(m.jumlahDatang) || 0);
  const valid =
    models.length > 0 &&
    models.every((m) => (Number(m.jumlahDatang) || 0) >= 1) &&
    models.every((m) => !rusakMelebihiDatang(m)) &&
    (jenis !== "Lainnya" || jenisLainnya.trim());

  return (
    <ModalShell title="Input Barang Datang" onClose={onClose}>
      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label="Foto Bon (opsional)">
        <input type="file" accept="image/*" onChange={handleFotoBon} className={inputClass} />
      </Field>
      {fotoBonPreview && (
        <div className="mb-3">
          <img
            src={fotoBonPreview}
            alt="Preview bon/nota"
            className="w-full max-h-48 object-contain rounded-lg border border-slate-800 bg-slate-950"
          />
        </div>
      )}

      <Field label="Supplier/Distributor (opsional)">
        <input
          className={inputClass}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Nama supplier/distributor"
          list="supplier-datalist"
        />
        <SupplierDatalist suppliers={suppliers} />
      </Field>
      <ModelNamaDatalist id="barang-datang-model-datalist" suppliers={suppliers} supplierNama={supplier} />
      <Field label="Jenis Barang Datang">
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

      <p className="text-[11px] uppercase text-slate-500 font-semibold mb-2">Model Barang</p>
      <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1 mb-1">
        {models.map((m, idx) => {
          // Qty Datang = TOTAL fisik baris ini (baik + rusak jadi satu angka).
          // Qty baik yang bakal masuk stok = Qty Datang - Qty Rusak.
          const totalQtyBaris = Number(m.jumlahDatang) || 0;
          const qtyBaikBaris = Math.max(totalQtyBaris - (Number(m.jumlahRusak) || 0), 0);
          return (
            <div key={idx} className="rounded-lg border border-slate-800 p-2.5 flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  className={inputClass}
                  value={m.nama}
                  onChange={(e) => updateModel(idx, { nama: e.target.value })}
                  placeholder={`Kode/nama model ${idx + 1} (opsional)`}
                  list="barang-datang-model-datalist"
                />
                <div className="flex gap-2">
                  <Field label="Qty Datang (total)">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={m.jumlahDatang}
                      onChange={(e) => updateModel(idx, { jumlahDatang: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Qty Rusak">
                    <input
                      type="number"
                      min="0"
                      className={`${inputClass} ${rusakMelebihiDatang(m) ? "border-red-500" : ""}`}
                      value={m.jumlahRusak}
                      onChange={(e) => updateModel(idx, { jumlahRusak: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-slate-500 -mt-1">
                  Isi Qty Datang dengan TOTAL fisik yang diterima (baik + rusak jadi satu angka).
                </p>
                {rusakMelebihiDatang(m) && (
                  <p className="text-[11px] text-red-400">Qty rusak tidak boleh lebih dari qty datang.</p>
                )}
                {Number(m.jumlahRusak) > 0 && (
                  <input
                    className={inputClass}
                    value={m.alasanRusak}
                    onChange={(e) => updateModel(idx, { alasanRusak: e.target.value })}
                    placeholder="Alasan rusak (contoh: sobek, cacat produksi, dll)"
                  />
                )}
                <InputRupiah
                  value={m.harga}
                  onChange={(v) => updateModel(idx, { harga: v })}
                  placeholder="Harga/pcs"
                />
                <p className="text-[11px] text-slate-500">
                  Total qty baris ini: {totalQtyBaris}x
                  {Number(m.jumlahRusak) > 0 ? ` (baik: ${qtyBaikBaris}x, rusak: ${m.jumlahRusak}x)` : ""}
                  {totalQtyBaris > 0 && Number(m.harga) > 0 ? ` · Nilai ${fmtRp(totalQtyBaris * (Number(m.harga) || 0))}` : ""}
                </p>
              </div>
              {models.length > 1 && (
                <button
                  onClick={() => hapusModel(idx)}
                  className="text-slate-500 hover:text-red-400 mt-1"
                  title="Hapus model ini"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={tambahModel}
        className="w-full mb-3 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg"
      >
        <Plus size={14} /> Tambah Model
      </button>
      <p className="text-[11px] text-slate-500 -mt-2 mb-3">
        Total: {models.length} model / {totalDatang}x datang
        {totalRusak > 0 ? ` · ${totalRusak}x rusak` : ""}
        {totalNilai > 0 ? ` · ${fmtRp(totalNilai)}` : ""}
      </p>

      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: no. bon, keterangan tambahan, dll"
        />
      </Field>
      <button
        disabled={saving || !valid}
        onClick={() =>
          onSubmit({
            tanggal,
            fotoBon,
            supplier: supplier.trim() || null,
            jenis: jenisFinal || null,
            models: models.map((m) => ({
              nama: m.nama.trim() || null,
              jumlahDatang: Number(m.jumlahDatang) || 0,
              jumlahRusak: Number(m.jumlahRusak) || 0,
              alasanRusak: Number(m.jumlahRusak) > 0 ? m.alasanRusak.trim() || null : null,
              harga: Number(m.harga) || 0,
            })),
            catatan: catatan.trim() || null,
          })
        }
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan & Lanjut ke Alur Barang"}
      </button>
    </ModalShell>
  );
}

// Form "Pesan Barang" — dicatat begitu ORDER ke supplier dibuat, bukan pas
// barangnya sudah sampai. Sengaja TIDAK minta rincian model/qty karena pada
// prakteknya itu baru ketahuan begitu barang dibuka fisiknya — saat pesan,
// yang biasanya sudah pasti cuma toko & harga kesepakatan. Rincian model,
// qty, dan foto bon diisi belakangan lewat "Konfirmasi Datang" (dibuka dari
// baris pesanan ini di halaman Barang Datang) begitu barangnya benar-benar
// di tangan — supaya riwayat toko/harga/kodenya tetap satu, nyambung dari
// pesan sampai datang, bukan dua catatan terpisah yang tidak berhubungan.
// `initial` (opsional) dipakai untuk pre-fill saat form dibuka dari pengajuan
// restock yang sudah disetujui — supplier/catatan diisi otomatis dari riwayat
// SKU tersebut, tapi tetap bisa diubah manual sebelum disimpan.
export function PesanBarangForm({ onClose, onSubmit, saving, initial = {}, suppliers }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(today);
  const [supplier, setSupplier] = useState(initial.supplier || "");
  const [jenis, setJenis] = useState("Pembelian");
  const [jenisLainnya, setJenisLainnya] = useState("");
  const [harga, setHarga] = useState("");
  const [catatan, setCatatan] = useState(initial.catatan || "");

  const jenisFinal = jenis === "Lainnya" ? jenisLainnya.trim() : jenis;
  const valid = supplier.trim() && (jenis !== "Lainnya" || jenisLainnya.trim());

  return (
    <ModalShell title="Pesan Barang ke Supplier" onClose={onClose}>
      {initial.dariRestock && (
        <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
          Dibuat dari pengajuan restock SKU <span className="font-mono font-semibold">{initial.sku}</span> yang
          sudah disetujui. Toko/supplier & catatan sudah diisi otomatis dari riwayat — cek dulu sebelum kirim.
        </div>
      )}
      <p className="text-[11px] text-slate-500 -mt-1 mb-3">
        Dicatat begitu order dibuat — biasanya baru tahu toko &amp; harganya dulu. Rincian model
        &amp; qty diisi belakangan lewat "Konfirmasi Datang" begitu barangnya benar-benar sampai.
      </p>
      <Field label="Tanggal Pesan">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Toko/Supplier">
        <input
          className={inputClass}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Nama toko/supplier"
          autoFocus
          list="supplier-datalist"
        />
        <SupplierDatalist suppliers={suppliers} />
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
      <Field label="Total Harga Kesepakatan (opsional)">
        <InputRupiah value={harga} onChange={setHarga} placeholder="Total nilai pesanan (bukan harga per pcs)" />
      </Field>
      <p className="text-[11px] text-slate-500 -mt-2 mb-3">
        Ini TOTAL nilai/nota yang disepakati untuk seluruh pesanan — bukan harga per pcs, karena
        model &amp; qty per model memang belum ketahuan sekarang. Harga per pcs tiap model diisi
        nanti pas "Konfirmasi Datang", setelah rinciannya jelas.
      </p>
      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: perkiraan qty, model yang dipesan, dll"
        />
      </Field>
      <button
        disabled={saving || !valid}
        onClick={() =>
          onSubmit({
            tanggal,
            supplier: supplier.trim(),
            jenis: jenisFinal || null,
            totalHarga: Number(harga) || 0,
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

// Form "Konfirmasi Datang" — dibuka dari baris pesanan (dibuat lewat
// PesanBarangForm di atas) yang statusnya masih Menunggu/Sebagian Datang.
// Isi rincian model & qty yang SEBENARNYA datang di sini, persis pola
// BarangDatangForm — bedanya, submit-nya meng-UPDATE baris pesanan yang SAMA
// (bukan bikin baris baru), supaya kode/toko/riwayatnya tetap satu dari pesan
// sampai datang. Total harga kesepakatan waktu pesan ditampilkan sebagai info
// di atas (BUKAN harga per pcs — itu memang beda satuan), jadi harga per pcs
// tiap model tetap harus diisi manual di sini setelah rinciannya jelas.
export function KonfirmasiDatangForm({ pesanan, onClose, onSubmit, saving, suppliers }) {
  const today = new Date().toISOString().slice(0, 10);
  // harga_kesepakatan = kolom baru (persisten, tidak hilang setelah konfirmasi).
  // Fallback ke detail_model[0].harga_total_pesan untuk pesanan lama yang
  // dibuat sebelum kolom ini ada.
  const totalHargaAwal = Number(pesanan?.harga_kesepakatan ?? pesanan?.detail_model?.[0]?.harga_total_pesan) || 0;
  const [tanggal, setTanggal] = useState(today);
  const [fotoBon, setFotoBon] = useState(null);
  const [fotoBonPreview, setFotoBonPreview] = useState(null);
  const [models, setModels] = useState([barisBarangDatang()]);
  const [catatan, setCatatan] = useState(pesanan?.catatan || "");
  const [keteranganSelisih, setKeteranganSelisih] = useState(pesanan?.keterangan_selisih || "");

  const handleFotoBon = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoBon(f);
    setFotoBonPreview(URL.createObjectURL(f));
  };

  const updateModel = (idx, patch) =>
    setModels((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const tambahModel = () => setModels((rows) => [...rows, barisBarangDatang()]);
  const hapusModel = (idx) => setModels((rows) => rows.filter((_, i) => i !== idx));

  const totalDatang = models.reduce((sum, m) => sum + (Number(m.jumlahDatang) || 0), 0);
  const totalRusak = models.reduce((sum, m) => sum + (Number(m.jumlahRusak) || 0), 0);
  // Nilai (Rp) dihitung dari TOTAL qty datang (bukan cuma qty baik) — qty
  // rusak tetap ikut dihitung nilainya (lihat catatan sama di BarangDatangForm).
  const totalNilai = models.reduce(
    (sum, m) => sum + (Number(m.jumlahDatang) || 0) * (Number(m.harga) || 0),
    0
  );
  // Selisih antara total harga kesepakatan (waktu pesan) dan total harga
  // barang yang benar-benar datang (qty total x harga/pcs, diisi di atas).
  // Cuma relevan kalau ada harga kesepakatan tercatat (totalHargaAwal > 0).
  const adaKesepakatan = totalHargaAwal > 0;
  const selisih = adaKesepakatan ? totalNilai - totalHargaAwal : 0;
  const adaSelisih = adaKesepakatan && selisih !== 0;
  const rusakMelebihiDatang = (m) => (Number(m.jumlahRusak) || 0) > (Number(m.jumlahDatang) || 0);
  const valid =
    models.length > 0 &&
    models.every((m) => (Number(m.jumlahDatang) || 0) >= 1) &&
    models.every((m) => !rusakMelebihiDatang(m)) &&
    // Kalau harga kesepakatan & harga barang datang tidak sama persis,
    // wajib isi keterangan (alasan kurang/lebihnya) sebelum bisa disimpan.
    (!adaSelisih || keteranganSelisih.trim() !== "");

  return (
    <ModalShell title={`Konfirmasi Datang — ${pesanan?.kode_bon || ""}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 mb-3 text-[11px] text-slate-400 space-y-0.5">
        <div>
          Toko/Supplier: <span className="text-slate-200 font-medium">{pesanan?.supplier || "—"}</span>
        </div>
        <div>Tanggal pesan: <span className="text-slate-300">{pesanan?.tanggal_pesan || "—"}</span></div>
        {totalHargaAwal > 0 && (
          <div>
            Total harga kesepakatan: <span className="text-slate-300">{fmtRp(totalHargaAwal)}</span>
            <span className="text-slate-600"> (total, bukan per pcs — isi harga per pcs tiap model di bawah)</span>
          </div>
        )}
        {pesanan?.catatan && <div>Catatan awal: <span className="text-slate-300">{pesanan.catatan}</span></div>}
      </div>

      {adaKesepakatan && (
        <div
          className={`rounded-lg border px-3 py-2.5 mb-3 text-[11px] space-y-1 ${
            adaSelisih ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex justify-between text-slate-400">
            <span>Total harga kesepakatan</span>
            <span className="text-slate-300 font-medium">{fmtRp(totalHargaAwal)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Total harga barang datang</span>
            <span className="text-slate-300 font-medium">{fmtRp(totalNilai)}</span>
          </div>
          {adaSelisih ? (
            <div className={`flex justify-between font-semibold ${selisih < 0 ? "text-amber-400" : "text-sky-400"}`}>
              <span>{selisih < 0 ? "Kurang dari kesepakatan" : "Lebih dari kesepakatan"}</span>
              <span>{fmtRp(Math.abs(selisih))}</span>
            </div>
          ) : (
            <div className="text-emerald-400 font-semibold">Sesuai kesepakatan</div>
          )}
        </div>
      )}

      <Field label="Tanggal Barang Datang">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label="Foto Bon (opsional)">
        <input type="file" accept="image/*" onChange={handleFotoBon} className={inputClass} />
      </Field>
      {fotoBonPreview && (
        <div className="mb-3">
          <img
            src={fotoBonPreview}
            alt="Preview bon/nota"
            className="w-full max-h-48 object-contain rounded-lg border border-slate-800 bg-slate-950"
          />
        </div>
      )}

      <p className="text-[11px] uppercase text-slate-500 font-semibold mb-2">Model Barang yang Datang</p>
      <ModelNamaDatalist id="konfirmasi-datang-model-datalist" suppliers={suppliers} supplierNama={pesanan?.supplier} />
      <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1 mb-1">
        {models.map((m, idx) => {
          const totalQtyBaris = Number(m.jumlahDatang) || 0;
          const qtyBaikBaris = Math.max(totalQtyBaris - (Number(m.jumlahRusak) || 0), 0);
          return (
            <div key={idx} className="rounded-lg border border-slate-800 p-2.5 flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  className={inputClass}
                  value={m.nama}
                  onChange={(e) => updateModel(idx, { nama: e.target.value })}
                  placeholder={`Kode/nama model ${idx + 1} (opsional)`}
                  list="konfirmasi-datang-model-datalist"
                />
                <div className="flex gap-2">
                  <Field label="Qty Datang (total)">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={m.jumlahDatang}
                      onChange={(e) => updateModel(idx, { jumlahDatang: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Qty Rusak">
                    <input
                      type="number"
                      min="0"
                      className={`${inputClass} ${rusakMelebihiDatang(m) ? "border-red-500" : ""}`}
                      value={m.jumlahRusak}
                      onChange={(e) => updateModel(idx, { jumlahRusak: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-slate-500 -mt-1">
                  Isi Qty Datang dengan TOTAL fisik yang diterima (baik + rusak jadi satu angka).
                </p>
                {rusakMelebihiDatang(m) && (
                  <p className="text-[11px] text-red-400">Qty rusak tidak boleh lebih dari qty datang.</p>
                )}
                {Number(m.jumlahRusak) > 0 && (
                  <input
                    className={inputClass}
                    value={m.alasanRusak}
                    onChange={(e) => updateModel(idx, { alasanRusak: e.target.value })}
                    placeholder="Alasan rusak (contoh: sobek, cacat produksi, dll)"
                  />
                )}
                <InputRupiah
                  value={m.harga}
                  onChange={(v) => updateModel(idx, { harga: v })}
                  placeholder="Harga/pcs"
                />
                <p className="text-[11px] text-slate-500">
                  Total qty baris ini: {totalQtyBaris}x
                  {Number(m.jumlahRusak) > 0 ? ` (baik: ${qtyBaikBaris}x, rusak: ${m.jumlahRusak}x)` : ""}
                  {totalQtyBaris > 0 && Number(m.harga) > 0 ? ` · Nilai ${fmtRp(totalQtyBaris * (Number(m.harga) || 0))}` : ""}
                </p>
              </div>
              {models.length > 1 && (
                <button
                  onClick={() => hapusModel(idx)}
                  className="text-slate-500 hover:text-red-400 mt-1"
                  title="Hapus model ini"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={tambahModel}
        className="w-full mb-3 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg"
      >
        <Plus size={14} /> Tambah Model
      </button>
      <p className="text-[11px] text-slate-500 -mt-2 mb-3">
        Total: {models.length} model / {totalDatang}x datang
        {totalRusak > 0 ? ` · ${totalRusak}x rusak` : ""}
        {totalNilai > 0 ? ` · ${fmtRp(totalNilai)}` : ""}
      </p>

      {adaSelisih && (
        <Field label="Keterangan Selisih (wajib diisi)">
          <input
            className={`${inputClass} ${keteranganSelisih.trim() === "" ? "border-amber-500" : ""}`}
            value={keteranganSelisih}
            onChange={(e) => setKeteranganSelisih(e.target.value)}
            placeholder="Contoh: diskon tambahan dari supplier, ongkir dipisah, dll"
            autoFocus
          />
          <p className="text-[11px] text-amber-400/80 mt-1">
            Total harga barang datang tidak sama dengan harga kesepakatan — jelaskan alasannya
            sebelum bisa disimpan.
          </p>
        </Field>
      )}

      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: no. bon, keterangan tambahan, dll"
        />
      </Field>
      <button
        disabled={saving || !valid}
        onClick={() =>
          onSubmit({
            tanggal,
            fotoBon,
            models: models.map((m) => ({
              nama: m.nama.trim() || null,
              jumlahDatang: Number(m.jumlahDatang) || 0,
              jumlahRusak: Number(m.jumlahRusak) || 0,
              alasanRusak: Number(m.jumlahRusak) > 0 ? m.alasanRusak.trim() || null : null,
              harga: Number(m.harga) || 0,
            })),
            catatan: catatan.trim() || null,
            hargaKesepakatan: adaKesepakatan ? totalHargaAwal : null,
            keteranganSelisih: adaSelisih ? keteranganSelisih.trim() : null,
          })
        }
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Konfirmasi & Lanjut ke Alur Barang"}
      </button>
    </ModalShell>
  );
}

// Form "Edit Riwayat Barang Datang" — dibuka dari tombol "Edit" di baris
// Riwayat Barang Datang, untuk baris yang SUDAH datang (bukan yang masih
// "Menunggu"/"Sebagian" — itu pakai "Konfirmasi Datang" seperti biasa).
//
// SENGAJA cuma boleh edit info yang AMAN diubah belakangan: tanggal,
// supplier, jenis, catatan, foto bon, dan per-model nama/harga-pcs/alasan
// rusak. Qty (jumlah datang & jumlah rusak) TIDAK BISA diedit di sini —
// begitu "Konfirmasi Datang"/"Input Barang Datang" disimpan, qty itu sudah
// jadi baris "items" tersendiri dan lanjut ke alur SKU/rak/dst (lihat
// handler "barang-datang" & "konfirmasi-datang" di ModalRouter). Kalau qty
// ikut diubah di sini tanpa menyentuh baris items yang sudah terlanjur
// dibuat, riwayat & stok jadi tidak nyambung lagi. Kalau qty-nya memang
// salah, cara paling aman: hapus riwayat ini (otomatis ikut hapus barang
// turunannya) lalu input ulang dari awal.
export function EditBarangDatangForm({ pesanan, onClose, onSubmit, saving, suppliers }) {
  const detailAwal = pesanan?.detail_model || [];
  const jenisAwal = pesanan?.jenis || "Pembelian";
  const jenisDikenal = JENIS_BARANG_MASUK.includes(jenisAwal);

  const [tanggal, setTanggal] = useState(pesanan?.tanggal_pesan || new Date().toISOString().slice(0, 10));
  const [fotoBon, setFotoBon] = useState(null);
  const [fotoBonPreview, setFotoBonPreview] = useState(pesanan?.foto_bon_url || null);
  const [supplier, setSupplier] = useState(pesanan?.supplier || "");
  const [jenis, setJenis] = useState(jenisDikenal ? jenisAwal : "Lainnya");
  const [jenisLainnya, setJenisLainnya] = useState(jenisDikenal ? "" : jenisAwal);
  const [models, setModels] = useState(
    detailAwal.map((m) => ({ ...m, nama: m.nama || "", harga: m.harga ?? "", alasan_rusak: m.alasan_rusak || "" }))
  );
  const [catatan, setCatatan] = useState(pesanan?.catatan || "");

  const handleFotoBon = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoBon(f);
    setFotoBonPreview(URL.createObjectURL(f));
  };

  const updateModel = (idx, patch) =>
    setModels((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const jenisFinal = jenis === "Lainnya" ? jenisLainnya.trim() : jenis;
  const valid = jenis !== "Lainnya" || jenisLainnya.trim();

  return (
    <ModalShell title={`Edit Riwayat — ${pesanan?.kode_bon || ""}`} onClose={onClose}>
      <div className="mb-3 flex items-start gap-2 bg-slate-950 border border-slate-800 text-slate-400 text-[11px] px-3 py-2.5 rounded-lg">
        <span>
          Qty datang &amp; qty rusak tidak bisa diubah di sini karena sudah jadi barang di alur
          SKU/rak. Kalau qty-nya salah, hapus riwayat ini lalu input ulang.
        </span>
      </div>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label="Foto Bon (opsional — kosongkan kalau tidak ganti)">
        <input type="file" accept="image/*" onChange={handleFotoBon} className={inputClass} />
      </Field>
      {fotoBonPreview && (
        <div className="mb-3">
          <img
            src={fotoBonPreview}
            alt="Preview bon/nota"
            className="w-full max-h-48 object-contain rounded-lg border border-slate-800 bg-slate-950"
          />
        </div>
      )}

      <Field label="Supplier/Distributor (opsional)">
        <input
          className={inputClass}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Nama supplier/distributor"
          list="supplier-datalist"
        />
        <SupplierDatalist suppliers={suppliers} />
      </Field>
      <ModelNamaDatalist id="edit-barang-datang-model-datalist" suppliers={suppliers} supplierNama={supplier} />
      <Field label="Jenis Barang Datang">
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

      {models.length > 0 && (
        <>
          <p className="text-[11px] uppercase text-slate-500 font-semibold mb-2">Model Barang</p>
          <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1 mb-3">
            {models.map((m, idx) =>
              m.datang === false ? (
                <div key={idx} className="rounded-lg border border-slate-800 p-2.5 text-xs text-amber-400/80 italic">
                  Belum datang — belum ada yang bisa diedit di baris ini.
                </div>
              ) : (
                <div key={idx} className="rounded-lg border border-slate-800 p-2.5 space-y-2">
                  <input
                    className={inputClass}
                    value={m.nama || ""}
                    onChange={(e) => updateModel(idx, { nama: e.target.value })}
                    placeholder={`Kode/nama model ${idx + 1} (opsional)`}
                    list="edit-barang-datang-model-datalist"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded-md bg-slate-950 border border-slate-800 px-2 py-1 text-slate-400">
                      Qty {m.jumlah ?? 0}x{Number(m.rusak) > 0 ? ` (rusak ${m.rusak}x)` : ""} — tidak bisa diubah
                    </span>
                  </div>
                  {Number(m.rusak) > 0 && (
                    <input
                      className={inputClass}
                      value={m.alasan_rusak || ""}
                      onChange={(e) => updateModel(idx, { alasan_rusak: e.target.value })}
                      placeholder="Alasan rusak (contoh: sobek, cacat produksi, dll)"
                    />
                  )}
                  <InputRupiah
                    value={m.harga}
                    onChange={(v) => updateModel(idx, { harga: v })}
                    placeholder="Harga/pcs"
                  />
                </div>
              )
            )}
          </div>
        </>
      )}

      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: no. bon, keterangan tambahan, dll"
        />
      </Field>

      <button
        disabled={saving || !valid}
        onClick={() =>
          onSubmit({
            tanggal,
            fotoBon,
            supplier: supplier.trim() || null,
            jenis: jenisFinal || null,
            models: models.map((m) => ({
              ...m,
              nama: (m.nama || "").trim() || null,
              harga: Number(m.harga) || 0,
              alasan_rusak: Number(m.rusak) > 0 ? (m.alasan_rusak || "").trim() || null : null,
            })),
            catatan: catatan.trim() || null,
          })
        }
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Perubahan"}
      </button>
    </ModalShell>
  );
}
// layar (dulu "cari" → "buat" dengan tombol kembali). Persis pola field
// Pelanggan di Grosir > Buat Pesanan Baru: pilih dari daftar yang sudah ada
// DI ATAS, atau isi bagian "buat SKU baru" di bawahnya — dua-duanya kelihatan
// sekaligus, user tinggal pakai salah satu lalu simpan.
export function SkuEntryForm({ item, master, settings, skuMaster, reload, onClose, onSubmitExisting, onSubmitNew, onSubmitSplit, saving, session }) {
  const isSuperadmin = session?.role === "superadmin";
  const [selectedId, setSelectedId] = useState("");
  const [hargaBaru, setHargaBaru] = useState(() => (Number(item?.harga) > 0 ? String(item.harga) : ""));

  // Auto-hubung ke SKU lama berdasarkan Model/Barcode Supplier — kalau model
  // yang sama pernah dipakai bikin SKU sebelumnya (barang datang lagi dari
  // supplier untuk model yang sama), langsung tersambung ke SKU itu begitu
  // form dibuka, jadi user tinggal cek/isi harga & simpan (tidak perlu cari
  // manual lagi). Cuma auto-pilih kalau PERSIS SATU SKU yang cocok — kalau
  // model yang sama ternyata dipakai lebih dari satu SKU (mis. varian warna/
  // ukuran beda tapi kode dari supplier sama), tidak ditebak sepihak, biarkan
  // user pilih sendiri dari daftarnya (tetap dikasih tahu ada beberapa yang cocok).
  const kodeModelItem = (item?.barcode_supplier || "").trim().toLowerCase();
  const skuModelCocok = kodeModelItem
    ? (skuMaster || []).filter((s) => (s.barcode_supplier || "").trim().toLowerCase() === kodeModelItem)
    : [];
  const [autoLinked, setAutoLinked] = useState(false);
  useEffect(() => {
    if (skuModelCocok.length === 1) {
      setSelectedId(skuModelCocok[0].id);
      setHargaBaru(Number(item?.harga) > 0 ? String(item.harga) : "");
      setAutoLinked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = skuMaster.find((s) => String(s.id) === String(selectedId)) || null;
  const skuOptions = skuMaster.map((s) => ({ value: s.id, label: `${s.sku} · stok ${s.stok}` }));

  // Deteksi harga asli baru: kalau field "Harga Asli barang ini" diisi manual,
  // pakai itu. Kalau dikosongkan, JANGAN langsung anggap "sama seperti
  // sebelumnya" — jatuhkan ke harga/pcs yang sudah tercatat sejak Barang
  // Masuk/Barang Datang (item.harga), karena itu sering sudah beda dari
  // harga_asli SKU lama meskipun user tidak sempat mengetik ulang di sini.
  // Dibandingkan dengan Number() di kedua sisi supaya tidak salah beda gara-gara
  // tipe data (string vs number) dari API.
  const hargaAsliBaruDeteksi =
    selected == null
      ? null
      : (() => {
          const dariField = hargaBaru !== "" ? Number(hargaBaru) : null;
          const dariItem = Number(item?.harga) > 0 ? Number(item.harga) : null;
          const kandidat = dariField != null ? dariField : dariItem;
          if (kandidat == null) return null;
          return Number(kandidat) !== Number(selected.harga_asli) ? Number(kandidat) : null;
        })();
  const previewBaru =
    hargaAsliBaruDeteksi != null && settings ? calcHarga(hargaAsliBaruDeteksi, settings) : null;

  const [bahan, setBahan] = useState("");
  const [peruntukan, setPeruntukan] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [model, setModel] = useState("1");
  const [modelTouched, setModelTouched] = useState(false);
  const [warna, setWarna] = useState("");
  const [ukuran, setUkuran] = useState("");
  const [hargaAsli, setHargaAsli] = useState(() => (Number(item?.harga) > 0 ? String(item.harga) : ""));
  const [showPanduanHarga, setShowPanduanHarga] = useState(false);

  // Mode "pecah ke beberapa ukuran": satu baris Alur Barang (1 model, qty
  // gabungan) dipecah jadi beberapa SKU sekaligus — Bahan/Peruntukan/
  // Kategori/Subkategori/Model/Warna/Harga tetap satu (sama untuk semua
  // ukuran), cuma Ukuran & Qty yang beda-beda per baris pecahan. Tetap bisa
  // dipakai walau ada qty rusak — totalnya (pecahTotalJumlah) divalidasi pas
  // dengan jumlahFinal (qty baik, rusak sudah dikeluarkan duluan), dan qty
  // rusaknya dicatat sebagai SATU baris total ke menu "Rusak" (ditautkan ke
  // SKU ukuran baris pertama) — tidak dipecah per ukuran, karena rusaknya
  // sendiri tidak diketahui ukurannya yang mana.
  const [pecahMode, setPecahMode] = useState(false);
  const [pecahRows, setPecahRows] = useState([{ ukuran: "", jumlah: "" }]);
  const updatePecahRow = (idx, patch) =>
    setPecahRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const tambahPecahRow = () => setPecahRows((rows) => [...rows, { ukuran: "", jumlah: "" }]);
  const hapusPecahRow = (idx) => setPecahRows((rows) => rows.filter((_, i) => i !== idx));

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

  // Qty rusak (kalau ada) sudah dicatat sejak Barang Datang dan ikut terbawa
  // di item ini — begitu SKU dibuat/dipilih di sini, qty final yang masuk
  // stok/rak = qty total dikurangi qty rusak. Qty rusaknya sendiri akan
  // tercatat ke menu Rusak (lihat ModalRouter "buat-sku"), bukan ikut stok.
  const jumlahRusak = Number(item.jumlah_rusak) || 0;
  const jumlahFinal = Math.max((Number(item.jumlah) || 0) - jumlahRusak, 0);

  // Validasi mode pecah: tiap baris harus punya ukuran & qty (>=1), ukurannya
  // tidak boleh dobel antar baris, dan totalnya harus PAS sama jumlahFinal
  // (tidak boleh kurang/lebih) sebelum boleh disimpan.
  const pecahTotalJumlah = pecahRows.reduce((sum, r) => sum + (Number(r.jumlah) || 0), 0);
  const pecahUkuranDobel = pecahRows.some(
    (r, idx) => r.ukuran && pecahRows.findIndex((x) => x.ukuran === r.ukuran) !== idx
  );
  const pecahRowsLengkap = pecahRows.length > 0 && pecahRows.every((r) => r.ukuran && Number(r.jumlah) >= 1);
  const pecahTotalPas = pecahTotalJumlah === jumlahFinal;
  const commonFieldsLengkap =
    bahan && peruntukan && kategori && subkategori && model && warna && hargaAsli && (!hargaManual || manualLengkap);
  const readyPecah = commonFieldsLengkap && pecahRowsLengkap && !pecahUkuranDobel && pecahTotalPas && settings;

  return (
    <ModalShell title={`Buat SKU — ${jumlahFinal}x barang`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Pilih SKU yang sudah ada untuk menambah stok, atau isi bagian "buat SKU baru" di bawah kalau belum ada.
      </p>

      {jumlahRusak > 0 && (
        <div className="mb-3 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          <div className="text-[11px] text-red-400">Ada qty rusak dari Barang Datang</div>
          <div className="font-mono text-sm text-red-300">
            {item.jumlah}x total − {jumlahRusak}x rusak = {jumlahFinal}x masuk stok
          </div>
          <p className="text-[11px] text-red-400/80 mt-1.5">
            {jumlahRusak}x rusak ini akan otomatis tercatat ke menu "Barang Reject" (SKU & Harga) untuk SKU ini, tidak ikut masuk stok/rak.
            {item.alasan_rusak ? ` Alasan: ${item.alasan_rusak}.` : ""}
          </p>
        </div>
      )}

      <Field label="SKU yang sudah ada (opsional)">
        <SearchableSelect
          value={selectedId}
          onChange={(id) => {
            setSelectedId(id);
            setAutoLinked(false);
            // Auto-isi dari harga bon (item.harga, hasil input di Konfirmasi
            // Datang) — user tinggal cek/koreksi, tidak perlu ketik ulang.
            // Kalau kebetulan sama dengan harga lama SKU, tetap aman: saat
            // submit dianggap "tidak berubah" (lihat kondisi di tombol
            // simpan di bawah).
            setHargaBaru(Number(item?.harga) > 0 ? String(item.harga) : "");
          }}
          options={skuOptions}
          placeholder="Cari kode SKU…"
        />
      </Field>

      {autoLinked && selected && (
        <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-[11px] text-emerald-300 flex items-start justify-between gap-2">
          <span>
            Otomatis tersambung ke SKU <span className="font-mono font-semibold">{selected.sku}</span> — model/barcode
            supplier <span className="font-mono">{item.barcode_supplier}</span> ini pernah dipakai untuk SKU itu. Tinggal
            cek/isi harga di bawah lalu simpan.
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedId("");
              setAutoLinked(false);
              setHargaBaru(Number(item?.harga) > 0 ? String(item.harga) : "");
            }}
            className="flex-shrink-0 text-emerald-400 hover:text-emerald-200 underline underline-offset-2"
          >
            Bukan ini
          </button>
        </div>
      )}
      {!autoLinked && skuModelCocok.length > 1 && !selected && (
        <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-300">
          Model/barcode supplier <span className="font-mono">{item.barcode_supplier}</span> ini cocok dengan{" "}
          {skuModelCocok.length} SKU berbeda ({skuModelCocok.map((s) => s.sku).join(", ")}) — pilih sendiri yang mana
          di kolom di atas, tidak bisa ditebak otomatis.
        </div>
      )}

      {selected && (
        <>
          <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500">Stok setelah ditambah</div>
            <div className="font-mono text-sm text-amber-400">
              {selected.stok} + {jumlahFinal} = {selected.stok + jumlahFinal}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Harga asli SKU ini saat ini (data lama di sistem)</div>
            <div className="font-mono text-sm text-slate-300">{fmtRp(selected.harga_asli)}</div>
          </div>

          <Field label="Harga Asli barang ini (dari bon barang datang — kosongkan kalau sama)">
            <input
              type="number"
              className={inputClass}
              value={hargaBaru}
              onChange={(e) => setHargaBaru(e.target.value)}
              placeholder={`${selected.harga_asli}`}
            />
            {Number(item?.harga) > 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Otomatis terisi dari harga/pcs saat Input Barang Datang — ubah/kosongkan di sini kalau perlu.
              </p>
            )}
            {hargaAsliBaruDeteksi != null && (
              <p className="text-[11px] text-amber-400 mt-1.5">
                Harga beda dari harga lama — barang ini akan lanjut ke Admin Pemotretan (tab "Foto Ulang") setelah
                ditempatkan di rak, sampai harga barunya diputuskan di Master Barang. Stok tetap masuk dulu memakai
                harga jual yang berlaku sekarang.
              </p>
            )}
          </Field>

          {hargaAsliBaruDeteksi != null && settings && (
            <div className="mb-3 rounded-lg border border-amber-500/30 overflow-hidden text-xs">
              <div className="px-3 py-1.5 bg-amber-500/10 text-amber-400 font-medium">
                Perbandingan harga (akan tampil di Foto Ulang)
              </div>
              <div className="grid grid-cols-3 text-[11px] uppercase text-slate-500 px-3 pt-2">
                <span></span>
                <span>Lama</span>
                <span>Baru</span>
              </div>
              {[
                ["Harga Asli", selected.harga_asli, previewBaru.hargaDasar],
                ["HPP", selected.hpp, previewBaru.hpp],
                ["Grosir", selected.grosir, previewBaru.grosir],
                ["Tengah", selected.tengah, previewBaru.tengah],
                ["Ecer", selected.ecer, previewBaru.ecer],
              ].map(([label, lama, baru], i) => (
                <div
                  key={label}
                  className={`grid grid-cols-3 px-3 py-1.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
                >
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-400">{fmtRp(lama)}</span>
                  <span className="text-amber-300 font-medium">{fmtRp(baru)}</span>
                </div>
              ))}
            </div>
          )}

          <button
            disabled={saving}
            onClick={() => onSubmitExisting(selected, hargaAsliBaruDeteksi)}
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
        <Field label="Ketik Kode Gabungan SKU Lengkap (opsional)">
          <KodeGabunganInput
            segments={[
              { options: master.bahan || [] },
              { options: master.peruntukan || [] },
              { options: master.kategori || [] },
              { options: master.subkategori || [], sep: "-" },
            ]}
            tailOptions={{ warna: master.warna || [], ukuran: master.ukuran || [] }}
            onPick={([b, p, k, sub], tail) => {
              setBahan(b.kode);
              setPeruntukan(p.kode);
              setKategori(k.kode);
              setSubkategori(sub.kode);
              if (tail.model) {
                setModel(tail.model);
                setModelTouched(true);
              }
              if (tail.warna) setWarna(tail.warna.kode);
              if (tail.ukuran) setUkuran(tail.ukuran.kode);
            }}
            placeholder="Ketik gabungan kode, mis. TDGL-GJR-216-PER-P18CM"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            Pilih dari daftar yang muncul untuk otomatis mengisi dropdown Bahan, Peruntukan, Kategori &amp;
            Subkategori di bawah — kalau ada sisa di belakangnya (format: Model-Warna-Ukuran, mis.
            "216-PER-P18CM"), Model/Warna/Ukuran ikut terisi juga.
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Bahan"><Combobox value={bahan} onChange={setBahan} options={master.bahan || []} tipe="bahan" reload={reload} /></Field>
          <Field label="Peruntukan"><Combobox value={peruntukan} onChange={setPeruntukan} options={master.peruntukan || []} tipe="peruntukan" reload={reload} /></Field>
          <Field label="Kategori"><Combobox value={kategori} onChange={setKategori} options={master.kategori || []} tipe="kategori" reload={reload} /></Field>
          <Field label="Subkategori"><Combobox value={subkategori} onChange={setSubkategori} options={master.subkategori || []} tipe="subkategori" reload={reload} /></Field>
          <Field label="Warna"><Combobox value={warna} onChange={setWarna} options={master.warna || []} tipe="warna" reload={reload} /></Field>
          {!pecahMode && (
            <Field label="Ukuran"><Combobox value={ukuran} onChange={setUkuran} options={master.ukuran || []} tipe="ukuran" reload={reload} /></Field>
          )}
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

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none mb-3">
          <input
            type="checkbox"
            checked={pecahMode}
            onChange={(e) => setPecahMode(e.target.checked)}
            className="accent-amber-500"
          />
          Model ini isinya campuran beberapa ukuran — pecah ke beberapa SKU sekaligus
        </label>

        {pecahMode && jumlahRusak > 0 && (
          <p className="text-[11px] text-red-400/80 -mt-2 mb-3">
            {jumlahRusak}x rusak akan dicatat total (tidak dipecah per ukuran) di menu "Barang Reject", ditautkan ke SKU
            ukuran baris pertama di bawah.
          </p>
        )}

        {pecahMode && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] uppercase text-slate-500 font-semibold">Pecah ke Ukuran</p>
              <span className={`text-[11px] font-mono ${pecahTotalPas ? "text-emerald-400" : "text-amber-400"}`}>
                Total {pecahTotalJumlah} / {jumlahFinal}x
              </span>
            </div>
            <div className="space-y-2">
              {pecahRows.map((r, idx) => {
                const dobel = r.ukuran && pecahRows.findIndex((x) => x.ukuran === r.ukuran) !== idx;
                return (
                  <div key={idx}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <Combobox
                          value={r.ukuran}
                          onChange={(v) => updatePecahRow(idx, { ukuran: v })}
                          options={master.ukuran || []}
                          tipe="ukuran"
                          reload={reload}
                        />
                      </div>
                      <div className="w-20 shrink-0">
                        <input
                          type="number"
                          min="1"
                          className={inputClass}
                          value={r.jumlah}
                          onChange={(e) => updatePecahRow(idx, { jumlah: e.target.value })}
                          placeholder="Qty"
                        />
                      </div>
                      {pecahRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => hapusPecahRow(idx)}
                          className="text-slate-500 hover:text-red-400 mt-2 shrink-0"
                          title="Hapus baris ini"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {dobel && <p className="text-[11px] text-red-400 mt-1">Ukuran ini sudah dipakai di baris lain.</p>}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={tambahPecahRow}
              className="w-full mt-2 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg"
            >
              <Plus size={14} /> Tambah Ukuran
            </button>
            {!pecahTotalPas && (
              <p className="text-[11px] text-amber-400 mt-1.5">
                Total qty semua ukuran harus pas {jumlahFinal}x dulu sebelum bisa disimpan.
              </p>
            )}
          </div>
        )}

        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowPanduanHarga((v) => !v)}
            className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
          >
            {showPanduanHarga ? "▾" : "▸"} Catatan cara hitung Harga Asli per distributor
          </button>
          {showPanduanHarga && (
            <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-[11px] text-slate-400 space-y-2.5">
              <div>
                <div className="font-semibold text-slate-300">Yaxiya</div>
                <div className="font-mono text-amber-300/90">Harga Asli = (harga barang / 2) − 20%</div>
              </div>
              <div>
                <div className="font-semibold text-slate-300">Xuping Prem</div>
                <div className="text-slate-500">1. Meylin &nbsp;2. Everlin &nbsp;3. Xuping</div>
                <div className="font-mono text-amber-300/90">Harga Asli = Harga barcode / 4</div>
              </div>
              <div>
                <div className="font-semibold text-slate-300">Standar</div>
                <div className="text-slate-500">Pakai Harga Asli apa adanya (sesuai bon), tidak ada rumus.</div>
              </div>
            </div>
          )}
        </div>

        <Field label="Harga Asli (Rp)">
          <input type="number" className={inputClass} value={hargaAsli} onChange={(e) => setHargaAsli(e.target.value)} placeholder="0" />
          {Number(item?.harga) > 0 && (
            <p className="text-[11px] text-slate-500 mt-1">
              Otomatis terisi dari harga/pcs saat Input Barang Datang — ubah di sini kalau perlu.
            </p>
          )}
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

        {pecahMode ? (
          <>
            <p className="text-[11px] text-slate-500 mb-3">
              Tiap ukuran di atas otomatis dicek: kalau SKU-nya sudah ada, stok tinggal ditambah; kalau belum, SKU
              baru dibuat pakai kode &amp; harga di atas (ukuran beda-beda, sisanya sama).
            </p>
            <button
              disabled={!readyPecah || saving}
              onClick={() =>
                onSubmitSplit(
                  { bahan, peruntukan, kategori, subkategori, model, warna },
                  Number(hargaAsli),
                  isSuperadmin && hargaManual
                    ? { grosir: Number(grosirManual), tengah: Number(tengahManual), ecer: Number(ecerManual) }
                    : null,
                  pecahRows.map((r) => ({ ukuran: r.ukuran, jumlah: Number(r.jumlah) }))
                )
              }
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              {saving ? "Menyimpan…" : `Buat/Tambah ${pecahRows.length} SKU Sekaligus`}
            </button>
          </>
        ) : (
          <>
            {skuSudahAda && (
              <div className="mb-3 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                <div className="text-[11px] text-red-400">SKU ini sudah ada di daftar</div>
                <div className="font-mono text-sm text-red-300">{skuKombinasi}</div>
                <p className="text-[11px] text-red-400/80 mt-1.5">
                  Stok: {skuSudahAda.stok}. Kalau mau menambah stok barang ini, pilih SKU-nya di kolom "SKU yang
                  sudah ada" di atas — bukan lewat "buat SKU baru".
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
                      Ecer:{" "}
                      <span className="text-slate-300 font-medium">{fmtRp(calcHarga(hargaAsli, settings).ecer)}</span>
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
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ============================================================
// BUAT SKU BARU — BANYAK SEKALIGUS. Beda dari SkuEntryForm di atas (yang
// selalu terikat ke satu `item` hasil Barang Masuk/Barang Datang): form ini
// dipakai untuk bikin SKU BARU dari nol, tanpa perlu catat Barang Masuk
// dulu — dipakai kalau sekaligus ada banyak produk baru yang mau
// didaftarkan. Tiap baris = 1 SKU baru lengkap: kode SKU + jumlah stok awal
// + harga asli + FOTO (wajib, supaya tidak perlu mampir ke tahap Verifikasi
// Foto lagi) + rak penempatan. Begitu disimpan, tiap baris langsung jadi SKU
// "Selesai" (lewati tahap Verifikasi Foto & Marketplace) — lihat alasan
// lengkap di ModalRouter "buat-sku-banyak".
function barisSkuBaru() {
  return {
    bahan: "", peruntukan: "", kategori: "", subkategori: "",
    model: "1", modelTouched: false,
    warna: "", ukuran: "",
    jumlah: 1,
    hargaAsli: "",
    hargaManual: false, grosirManual: "", tengahManual: "", ecerManual: "",
    fotoFile: null, fotoPreview: null,
    rakCode: "",
    // Status baca-otomatis dari foto (lihat handleFoto): "idle" | "membaca" | "selesai" | "gagal"
    ocrStatus: "idle",
    ocrRaw: "",
    ocrTakTerbaca: [], // label field yang gagal dicocokkan ke Master Data, buat peringatan ke admin
  };
}

export function BuatSkuBanyakForm({ master, settings, skuMaster, rakList, penempatan, reload, onClose, onSubmit, saving, session }) {
  const isSuperadmin = session?.role === "superadmin";
  const [rows, setRows] = useState([barisSkuBaru()]);

  const updateRow = (idx, patch) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const tambahRow = () => setRows((rs) => [...rs, barisSkuBaru()]);
  const hapusRow = (idx) => setRows((rs) => rs.filter((_, i) => i !== idx));

  // ------------------------------------------------------------
  // GENERATOR KOMBINASI — buat banyak baris sekaligus dari 1 produk dasar
  // (Bahan/Peruntukan/Kategori/Subkategori/Model) disilangkan dengan banyak
  // Warna x banyak Ukuran yang dicentang. Tiap kombinasi jadi 1 baris SKU;
  // baris yang sudah ada (foto, jumlah, dst per baris tetap harus diisi satu
  // per satu setelah digenerate, sesuai alur form ini). Ini cuma bantu isi
  // Bahan/Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran + default
  // Jumlah/Harga secara otomatis, supaya tidak perlu ketik ulang per baris.
  const [showGenerator, setShowGenerator] = useState(false);
  const [genBase, setGenBase] = useState({ bahan: "", peruntukan: "", kategori: "", subkategori: "", model: "1" });
  const [genWarna, setGenWarna] = useState([]);
  const [genUkuran, setGenUkuran] = useState([]);
  const [genJumlah, setGenJumlah] = useState(1);
  const [genHarga, setGenHarga] = useState("");

  const toggleGenWarna = (kode) =>
    setGenWarna((ws) => (ws.includes(kode) ? ws.filter((w) => w !== kode) : [...ws, kode]));
  const toggleGenUkuran = (kode) =>
    setGenUkuran((us) => (us.includes(kode) ? us.filter((u) => u !== kode) : [...us, kode]));

  const genBaseLengkap = genBase.bahan && genBase.peruntukan && genBase.kategori && genBase.subkategori && genBase.model;
  const genWarnaList = genWarna.length > 0 ? genWarna : [""];
  const genUkuranList = genUkuran.length > 0 ? genUkuran : [""];
  const genCombosCount = genWarnaList.length * genUkuranList.length;

  const handleGenerate = () => {
    if (!genBaseLengkap || genCombosCount < 1) return;
    const generated = [];
    for (const warna of genWarnaList) {
      for (const ukuran of genUkuranList) {
        generated.push({
          ...barisSkuBaru(),
          bahan: genBase.bahan,
          peruntukan: genBase.peruntukan,
          kategori: genBase.kategori,
          subkategori: genBase.subkategori,
          model: genBase.model,
          modelTouched: true,
          warna,
          ukuran,
          jumlah: Number(genJumlah) || 1,
          hargaAsli: genHarga === "" ? "" : Number(genHarga),
        });
      }
    }
    setRows(generated);
    setShowGenerator(false);
  };

  // Begitu foto dipilih, langsung dibaca otomatis (OCR) supaya Bahan/
  // Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran terisi sendiri dari
  // teks yang tercetak di foto (lihat lib/ocrSku.js) — admin tinggal cek
  // sekilas lalu isi Rak. Kalau ada bagian yang tidak berhasil dicocokkan ke
  // Master Data (mis. kode Bahan yang belum pernah didaftarkan), field itu
  // dibiarkan kosong dan ditandai di ocrTakTerbaca supaya admin tahu harus
  // isi manual, bukan diam-diam salah.
  const handleFoto = async (idx, e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    updateRow(idx, {
      fotoFile: f,
      fotoPreview: URL.createObjectURL(f),
      ocrStatus: "membaca",
      ocrRaw: "",
      ocrTakTerbaca: [],
    });

    try {
      const hasil = await bacaFotoSku(f);
      const [seg1, seg2, seg3] = hasil.kodeSegments;
      const decoded = seg1 ? pecahSegmenPertama(seg1, master) : null;
      const warnaKode = cariKodeDariTeks(hasil.warnaText, master.warna || []);
      const ukuranKode = cariKodeDariTeks(hasil.ukuranText, master.ukuran || []);
      // Kode harga (mis. "4256112" sebelum kode SKU) didekode jadi
      // Grosir/Tengah/Ecer — lihat decodeKodeHarga di ocrSku.js. Harga Asli
      // (harga beli) TETAP selalu 0 dari OCR karena memang tidak pernah
      // tercetak di foto — cuma harga jual (Grosir/Tengah/Ecer) yang ada di
      // kode ini, jadi diisi lewat toggle "Isi harga manual" (superadmin only,
      // dan form ini memang khusus superadmin).
      const hargaKode = hasil.kodeHargaText ? decodeKodeHarga(hasil.kodeHargaText) : null;

      const takTerbaca = [];
      if (seg1 && !decoded) takTerbaca.push("Bahan/Peruntukan/Kategori");
      if (!seg2) takTerbaca.push("Subkategori");
      if (hasil.warnaText && !warnaKode) takTerbaca.push("Warna");
      if (hasil.ukuranText && !ukuranKode) takTerbaca.push("Ukuran");
      if (hasil.kodeHargaText && !hargaKode) takTerbaca.push("Kode Harga");
      if (hasil.kodeSegments.length === 0) takTerbaca.push("Kode SKU tidak ketemu di foto");

      updateRow(idx, {
        ...(decoded ? { bahan: decoded.bahan, peruntukan: decoded.peruntukan, kategori: decoded.kategori } : {}),
        ...(seg2 ? { subkategori: seg2.toUpperCase() } : {}),
        ...(seg3 ? { model: seg3, modelTouched: true } : {}),
        ...(warnaKode ? { warna: warnaKode } : {}),
        ...(ukuranKode ? { ukuran: ukuranKode } : {}),
        jumlah: 1,
        hargaAsli: 0,
        ...(hargaKode
          ? { hargaManual: true, grosirManual: String(hargaKode.grosir), tengahManual: String(hargaKode.tengah), ecerManual: String(hargaKode.ecer) }
          : {}),
        ocrStatus: "selesai",
        ocrRaw: hasil.raw,
        ocrTakTerbaca: takTerbaca,
      });
    } catch (err) {
      updateRow(idx, { ocrStatus: "gagal", ocrRaw: "" });
    }
  };

  const skuOf = (r) =>
    r.bahan && r.peruntukan && r.kategori && r.subkategori && r.model && r.warna && r.ukuran
      ? `${r.bahan}${r.peruntukan}${r.kategori}-${r.subkategori}-${r.model}-${r.warna}-${r.ukuran}`
      : null;

  // Info turunan per baris: kode SKU, apakah sudah ada di Master Barang atau
  // dobel dengan baris lain di batch ini, dan apakah rak yang dipilih sudah
  // dipakai SKU lain (occupant) — di form ini SKU-nya selalu baru, jadi rak
  // yang sudah terisi SKU apapun dianggap konflik (tidak ada mode "gabung"
  // seperti di TempatkanRakForm, biar aman dipakai banyak baris sekaligus).
  const rowInfos = rows.map((r, idx) => {
    const sku = skuOf(r);
    const sudahAdaDiMaster = sku ? (skuMaster || []).some((s) => s.sku === sku) : false;
    const dobelDiBatch = sku ? rows.findIndex((x, i) => i !== idx && skuOf(x) === sku) !== -1 : false;
    const occupant = r.rakCode ? (penempatan || []).find((p) => p.rak_code === r.rakCode) : null;
    const rakConflict = !!occupant;
    const manualLengkap = r.grosirManual !== "" && r.tengahManual !== "" && r.ecerManual !== "";
    // Harga Asli boleh 0 (dipakai kalau foto sudah dibaca otomatis dan harga
    // belinya memang belum/tidak diisi lewat foto) — yang penting bukan string
    // kosong, supaya tidak kebobolan baris yang field-nya belum tersentuh.
    const lengkap =
      sku && !sudahAdaDiMaster && !dobelDiBatch &&
      Number(r.jumlah) >= 1 && r.hargaAsli !== "" && Number(r.hargaAsli) >= 0 &&
      r.fotoFile && r.rakCode && !rakConflict &&
      (!r.hargaManual || manualLengkap);
    return { sku, sudahAdaDiMaster, dobelDiBatch, occupant, rakConflict, lengkap };
  });

  const semuaLengkap = rows.length > 0 && rowInfos.every((info) => info.lengkap);

  const handleSubmit = () => {
    onSubmit(
      rows.map((r, i) => ({
        bahan: r.bahan, peruntukan: r.peruntukan, kategori: r.kategori, subkategori: r.subkategori,
        model: r.model, warna: r.warna, ukuran: r.ukuran,
        sku: rowInfos[i].sku,
        jumlah: Number(r.jumlah),
        hargaAsli: Number(r.hargaAsli),
        hargaManual:
          isSuperadmin && r.hargaManual
            ? { grosir: Number(r.grosirManual), tengah: Number(r.tengahManual), ecer: Number(r.ecerManual) }
            : null,
        fotoFile: r.fotoFile,
        rakCode: r.rakCode,
      }))
    );
  };

  return (
    <ModalShell title="Buat SKU Baru — Banyak Sekaligus" maxWidth="max-w-2xl" onClose={onClose}>
      <p className="text-[11px] text-slate-500 mb-3">
        Untuk produk baru yang belum pernah punya SKU sama sekali. Tiap baris langsung jadi SKU siap jual — foto
        sudah ikut diupload di sini, jadi lewat tahap Verifikasi Foto &amp; Marketplace, langsung "Selesai". Begitu
        foto dipilih, Bahan/Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran dicoba dibaca otomatis dari teks di
        foto — cek dulu hasilnya, lalu tinggal isi Rak.
      </p>

      <button
        type="button"
        onClick={() => setShowGenerator((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg mb-3"
      >
        <ScanLine size={14} /> {showGenerator ? "Tutup Generator Kombinasi" : "Generate Banyak SKU dari Kombinasi Warna & Ukuran"}
      </button>

      {showGenerator && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5 mb-4">
          <p className="text-[11px] text-slate-400">
            Isi produk dasarnya sekali, centang Warna &amp; Ukuran yang mau dibuat — tiap kombinasi jadi 1 baris SKU
            di bawah (baris yang sudah ada akan diganti). Foto tetap wajib diisi satu-satu per baris setelah ini.
          </p>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Bahan">
              <Combobox value={genBase.bahan} onChange={(v) => setGenBase((b) => ({ ...b, bahan: v }))} options={master.bahan || []} tipe="bahan" reload={reload} />
            </Field>
            <Field label="Peruntukan">
              <Combobox value={genBase.peruntukan} onChange={(v) => setGenBase((b) => ({ ...b, peruntukan: v }))} options={master.peruntukan || []} tipe="peruntukan" reload={reload} />
            </Field>
            <Field label="Kategori">
              <Combobox value={genBase.kategori} onChange={(v) => setGenBase((b) => ({ ...b, kategori: v }))} options={master.kategori || []} tipe="kategori" reload={reload} />
            </Field>
            <Field label="Subkategori">
              <Combobox value={genBase.subkategori} onChange={(v) => setGenBase((b) => ({ ...b, subkategori: v }))} options={master.subkategori || []} tipe="subkategori" reload={reload} />
            </Field>
          </div>

          <Field label="Model (kode bebas)">
            <input
              className={inputClass}
              value={genBase.model}
              onChange={(e) => setGenBase((b) => ({ ...b, model: e.target.value }))}
            />
          </Field>

          <Field label={`Warna (${genWarna.length || "semua kosong — 1 kombinasi tanpa warna"})`}>
            <div className="flex flex-wrap gap-1.5">
              {(master.warna || []).map((w) => (
                <button
                  key={w.kode}
                  type="button"
                  onClick={() => toggleGenWarna(w.kode)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                    genWarna.includes(w.kode)
                      ? "bg-amber-500/20 border-amber-500 text-amber-400"
                      : "border-slate-800 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {w.kode}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Ukuran (${genUkuran.length || "semua kosong — 1 kombinasi tanpa ukuran"})`}>
            <div className="flex flex-wrap gap-1.5">
              {(master.ukuran || []).map((u) => (
                <button
                  key={u.kode}
                  type="button"
                  onClick={() => toggleGenUkuran(u.kode)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono border ${
                    genUkuran.includes(u.kode)
                      ? "bg-amber-500/20 border-amber-500 text-amber-400"
                      : "border-slate-800 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {u.kode}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Jumlah default per SKU">
              <input
                type="number"
                min="1"
                className={inputClass}
                value={genJumlah}
                onChange={(e) => setGenJumlah(Number(e.target.value))}
              />
            </Field>
            <Field label="Harga Asli default (opsional)">
              <InputRupiah value={genHarga} onChange={setGenHarga} />
            </Field>
          </div>

          <button
            type="button"
            disabled={!genBaseLengkap || genCombosCount < 1}
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs py-2 rounded-lg"
          >
            <Plus size={13} /> Generate {genCombosCount} SKU
          </button>
        </div>
      )}

      <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
        {rows.map((r, idx) => {
          const info = rowInfos[idx];
          const modelSuggestion = (() => {
            if (!r.bahan || !r.peruntukan || !r.kategori || !r.subkategori) return null;
            const numbers = new Set(
              (skuMaster || [])
                .filter(
                  (s) =>
                    s.bahan === r.bahan && s.peruntukan === r.peruntukan &&
                    s.kategori === r.kategori && s.subkategori === r.subkategori
                )
                .map((s) => Number(s.model))
                .filter((n) => Number.isFinite(n) && n > 0)
            );
            let next = 1;
            while (numbers.has(next)) next++;
            return String(next);
          })();

          return (
            <div key={idx} className="rounded-lg border border-slate-800 p-3 space-y-2 relative">
              {rows.length > 1 && (
                <button
                  onClick={() => hapusRow(idx)}
                  className="absolute top-2 right-2 text-slate-500 hover:text-red-400"
                  title="Hapus baris ini"
                >
                  <X size={14} />
                </button>
              )}

              <Field label="Foto SKU (wajib) — kode, bahan, warna & ukuran dibaca otomatis dari foto">
                <input type="file" accept="image/*" onChange={(e) => handleFoto(idx, e)} className={inputClass} />
              </Field>
              {r.fotoPreview && (
                <img
                  src={r.fotoPreview}
                  alt="Preview"
                  className="w-full max-h-40 object-contain rounded-lg border border-slate-800 bg-slate-950"
                />
              )}
              {r.ocrStatus === "membaca" && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
                  <Loader2 size={12} className="animate-spin" /> Membaca kode dari foto…
                </p>
              )}
              {r.ocrStatus === "selesai" && r.ocrTakTerbaca.length === 0 && (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 size={12} /> Terbaca otomatis dari foto — cek sebelum simpan.
                </p>
              )}
              {r.ocrStatus === "selesai" && r.ocrTakTerbaca.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] text-orange-400">
                  <ScanLine size={12} className="mt-0.5 flex-shrink-0" />
                  Sebagian terbaca — <strong>{r.ocrTakTerbaca.join(", ")}</strong> tidak berhasil dicocokkan ke
                  Master Data, isi manual di bawah.
                </p>
              )}
              {r.ocrStatus === "gagal" && (
                <p className="flex items-center gap-1.5 text-[11px] text-red-400">
                  <AlertTriangle size={12} /> Gagal membaca foto — isi field di bawah manual.
                </p>
              )}
              {r.ocrRaw && (
                <details className="text-[10px] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-400">Lihat teks mentah hasil baca foto</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono bg-slate-950 border border-slate-800 rounded-md p-2">
                    {r.ocrRaw}
                  </pre>
                </details>
              )}

              <p className="text-[11px] uppercase text-slate-500 font-semibold">SKU Baru {idx + 1}</p>

              <Field label="Ketik Kode Gabungan SKU (opsional)">
                <KodeGabunganInput
                  segments={[
                    { options: master.bahan || [] },
                    { options: master.peruntukan || [] },
                    { options: master.kategori || [] },
                    { options: master.subkategori || [], sep: "-" },
                  ]}
                  tailOptions={{ warna: master.warna || [], ukuran: master.ukuran || [] }}
                  onPick={([b, p, k, sub], tail) => {
                    const patch = { bahan: b.kode, peruntukan: p.kode, kategori: k.kode, subkategori: sub.kode };
                    if (tail.model) {
                      patch.model = tail.model;
                      patch.modelTouched = true;
                    }
                    if (tail.warna) patch.warna = tail.warna.kode;
                    if (tail.ukuran) patch.ukuran = tail.ukuran.kode;
                    updateRow(idx, patch);
                  }}
                  placeholder="mis. TDGL-GJR-216-PER-P18CM"
                />
              </Field>

              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Bahan">
                  <Combobox value={r.bahan} onChange={(v) => updateRow(idx, { bahan: v })} options={master.bahan || []} tipe="bahan" reload={reload} />
                </Field>
                <Field label="Peruntukan">
                  <Combobox value={r.peruntukan} onChange={(v) => updateRow(idx, { peruntukan: v })} options={master.peruntukan || []} tipe="peruntukan" reload={reload} />
                </Field>
                <Field label="Kategori">
                  <Combobox value={r.kategori} onChange={(v) => updateRow(idx, { kategori: v })} options={master.kategori || []} tipe="kategori" reload={reload} />
                </Field>
                <Field label="Subkategori">
                  <Combobox value={r.subkategori} onChange={(v) => updateRow(idx, { subkategori: v })} options={master.subkategori || []} tipe="subkategori" reload={reload} />
                </Field>
                <Field label="Warna">
                  <Combobox value={r.warna} onChange={(v) => updateRow(idx, { warna: v })} options={master.warna || []} tipe="warna" reload={reload} />
                </Field>
                <Field label="Ukuran">
                  <Combobox value={r.ukuran} onChange={(v) => updateRow(idx, { ukuran: v })} options={master.ukuran || []} tipe="ukuran" reload={reload} />
                </Field>
              </div>

              <Field label="Model (kode bebas)">
                <input
                  className={inputClass}
                  value={r.model}
                  onChange={(e) => updateRow(idx, { model: e.target.value, modelTouched: true })}
                />
                {modelSuggestion && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Rekomendasi: <span className="text-amber-400 font-medium">{modelSuggestion}</span>
                    {r.model !== modelSuggestion && (
                      <button
                        type="button"
                        onClick={() => updateRow(idx, { model: modelSuggestion, modelTouched: false })}
                        className="ml-2 text-amber-400 hover:underline"
                      >
                        Pakai
                      </button>
                    )}
                  </p>
                )}
              </Field>

              {info.sudahAdaDiMaster && (
                <p className="text-[11px] text-red-400">
                  SKU <span className="font-mono">{info.sku}</span> sudah ada di Master Barang — pakai menu "Buat SKU" biasa untuk menambah stok.
                </p>
              )}
              {info.dobelDiBatch && (
                <p className="text-[11px] text-red-400">SKU ini sama dengan baris lain di bawah — ubah salah satunya.</p>
              )}
              {info.sku && !info.sudahAdaDiMaster && !info.dobelDiBatch && (
                <p className="text-[11px] text-slate-500">
                  SKU: <span className="font-mono text-amber-400">{info.sku}</span>
                </p>
              )}

              <Field label="Jumlah (stok awal)">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={r.jumlah}
                  onChange={(e) => updateRow(idx, { jumlah: Number(e.target.value) })}
                />
              </Field>

              <Field label="Harga Asli">
                <InputRupiah value={r.hargaAsli} onChange={(v) => updateRow(idx, { hargaAsli: v })} />
              </Field>

              {isSuperadmin && (
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={r.hargaManual}
                    onChange={(e) => updateRow(idx, { hargaManual: e.target.checked })}
                    className="accent-amber-500"
                  />
                  Isi harga Grosir/Tengah/Ecer manual (lewati rumus otomatis)
                </label>
              )}
              {isSuperadmin && r.hargaManual && (
                <div className="grid grid-cols-3 gap-x-2">
                  <Field label="Grosir"><InputRupiah value={r.grosirManual} onChange={(v) => updateRow(idx, { grosirManual: v })} /></Field>
                  <Field label="Tengah"><InputRupiah value={r.tengahManual} onChange={(v) => updateRow(idx, { tengahManual: v })} /></Field>
                  <Field label="Ecer"><InputRupiah value={r.ecerManual} onChange={(v) => updateRow(idx, { ecerManual: v })} /></Field>
                </div>
              )}
              {!r.hargaManual && settings && Number(r.hargaAsli) > 0 && (
                <p className="text-[11px] text-slate-500">
                  Ecer otomatis: <span className="text-slate-300 font-medium">{fmtRp(calcHarga(Number(r.hargaAsli), settings).ecer)}</span>
                </p>
              )}

              <Field label="Rak">
                <SearchableSelect
                  value={r.rakCode}
                  onChange={(v) => updateRow(idx, { rakCode: v })}
                  options={(rakList || []).map((rk) => ({ value: rk.code, label: rk.code }))}
                  placeholder="Ketik atau pilih rak…"
                />
              </Field>
              {info.rakConflict && (
                <p className="text-[11px] text-red-400">
                  Rak <span className="font-mono">{r.rakCode}</span> sudah dipakai SKU{" "}
                  <span className="font-mono">{info.occupant.sku}</span> — pilih rak lain.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={tambahRow}
        className="w-full mt-3 flex items-center justify-center gap-1.5 border border-dashed border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 text-xs font-semibold py-2 rounded-lg"
      >
        <Plus size={14} /> Tambah SKU
      </button>

      <button
        disabled={saving || !semuaLengkap}
        onClick={handleSubmit}
        className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : `Simpan ${rows.length} SKU`}
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

// Versi "banyak sekaligus" dari VerifikasiForm — dibuka waktu admin pilih
// lebih dari satu SKU di halaman Pemotretan lalu upload SATU foto yang
// berlaku untuk semua SKU terpilih (mis. beberapa varian warna/ukuran yang
// tampilannya sama persis waktu difoto). Satu file yang sama di-PATCH ke
// foto_url tiap item terpilih (lihat handler "advance-verifikasi-banyak" di
// ModalRouter) — bukan upload berulang per SKU seperti VerifikasiForm biasa.
export function VerifikasiBanyakForm({ items, onClose, onSubmit, saving }) {
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

  const sudahPunyaFoto = items.filter((i) => i.foto_url);

  return (
    <ModalShell title={`Verifikasi Foto — ${items.length} SKU Sekaligus`} onClose={onClose}>
      <p className="text-[11px] text-slate-500 -mt-1 mb-3">
        Satu foto ini dipakai sebagai foto verifikasi untuk SEMUA SKU di bawah — cocok kalau
        barangnya memang tampilannya identik waktu difoto (mis. beberapa varian sekaligus).
      </p>

      <div className="mb-3 max-h-32 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="font-mono text-amber-400">{it.sku || "—"}</span>
            <span className="text-slate-500">{it.jumlah}x{it.rak_code ? ` · ${it.rak_code}` : ""}</span>
          </div>
        ))}
      </div>

      {sudahPunyaFoto.length > 0 && (
        <div className="mb-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2.5 rounded-lg">
          <span>
            {sudahPunyaFoto.length} dari {items.length} SKU ini sudah punya foto — akan ditimpa foto baru.
          </span>
        </div>
      )}

      <Field label="Ambil / upload foto barang">
        <input type="file" accept="image/*" onChange={handleFile} className={inputClass} />
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
        <span>Saya sudah cek, foto di atas sesuai untuk SEMUA {items.length} SKU di atas</span>
      </label>

      <button
        disabled={!file || !cocok || saving}
        onClick={() => onSubmit(file)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Mengunggah…" : `Simpan & Lanjut ke Marketplace (${items.length} SKU)`}
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
// Kategori pelanggan grosir — dipakai buat pisahin daftar Pelanggan jadi 3
// tab (lihat PelangganList di pages/Grosir.jsx). "grosir" jadi default resmi
// (juga default kolom "kategori" di database) supaya pelanggan lama/yang
// dibuat inline dari Buat Pesanan (belum pernah pilih kategori) otomatis
// masuk situ, bukan hilang tanpa kategori.
export const KATEGORI_PELANGGAN = [
  { value: "grosir", label: "Grosir" },
  { value: "tengah", label: "Tengah" },
  { value: "ecer", label: "Ecer" },
];

export function PelangganForm({ pelanggan, pelangganList, kodeBaru, onClose, onSubmit, saving }) {
  const [nama, setNama] = useState(pelanggan?.nama || "");
  const [kategori, setKategori] = useState(pelanggan?.kategori || "grosir");
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
      <Field label="Kategori">
        <select className={inputClass} value={kategori} onChange={(e) => setKategori(e.target.value)}>
          {KATEGORI_PELANGGAN.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </Field>
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
            kategori,
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

// Form Tambah/Edit Supplier — master data supplier disimpan di tabel
// "suppliers" sendiri (lihat ModalRouter "supplier-form"), dipakai sebagai
// saran nama di kolom Supplier/Toko pada form-form Barang Datang di bawah.
export function SupplierForm({ supplier, kodeBaru, onClose, onSubmit, saving }) {
  const [nama, setNama] = useState(supplier?.nama || "");
  const [alamat, setAlamat] = useState(supplier?.alamat || "");
  const [telepon, setTelepon] = useState(supplier?.telepon || "");
  const [catatan, setCatatan] = useState(supplier?.catatan || "");
  const [models, setModels] = useState(() => (Array.isArray(supplier?.models) ? supplier.models : []));
  const [modelInput, setModelInput] = useState("");
  const kode = supplier?.kode || kodeBaru;

  // Tambah satu nama model ke daftar (dedup, trim) — dipanggil dari tombol
  // "+" maupun tekan Enter/koma di kolom ketiknya. Model-model ini nanti
  // muncul sebagai saran (datalist) di kolom "Nama Model" pada form Input
  // Barang Datang / Konfirmasi Datang / Edit Riwayat, begitu supplier yang
  // sama dipilih di form itu (lihat SupplierDatalist & ModelNamaDatalist).
  const tambahModel = () => {
    const v = modelInput.trim();
    if (!v) return;
    setModels((rows) => (rows.some((r) => r.toLowerCase() === v.toLowerCase()) ? rows : [...rows, v]));
    setModelInput("");
  };
  const hapusModel = (i) => setModels((rows) => rows.filter((_, idx) => idx !== i));

  return (
    <ModalShell title={supplier ? `Edit Supplier — ${kode}` : "Tambah Supplier"} onClose={onClose}>
      <Field label="Nama Supplier/Distributor"><input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} autoFocus /></Field>
      <Field label="Alamat"><input className={inputClass} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
      <Field label="Telepon"><input className={inputClass} value={telepon} onChange={(e) => setTelepon(e.target.value)} /></Field>
      <Field label="Catatan"><input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" /></Field>

      <Field label="Model dari Supplier Ini (opsional)">
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                tambahModel();
              }
            }}
            placeholder="Ketik nama/kode model, lalu Enter"
          />
          <button
            type="button"
            onClick={tambahModel}
            disabled={!modelInput.trim()}
            className="px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex-shrink-0"
          >
            + Tambah
          </button>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {models.map((m, i) => (
              <span
                key={`${m}-${i}`}
                className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 text-[11px] px-2 py-1 rounded-full"
              >
                {m}
                <button
                  type="button"
                  onClick={() => hapusModel(i)}
                  className="text-slate-500 hover:text-red-400"
                  title="Hapus model ini"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>

      <button
        disabled={!nama.trim() || saving}
        onClick={() =>
          onSubmit({
            kode,
            nama: nama.trim(),
            alamat: alamat.trim() || null,
            telepon: telepon.trim() || null,
            catatan: catatan.trim() || null,
            models,
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
// Helper kategori pemasukan Grosir (Cash/Transfer) — sama persis dengan yang
// dipakai di BuatPesanan (pages/Grosir.jsx) & Toko Offline. Diduplikasi di
// sini (bukan di-import) karena forms.jsx & pages/Grosir.jsx sengaja tidak
// saling import satu sama lain (lihat pola file lain di project ini).
const LABEL_KATEGORI_GROSIR_CASH = "GROSIR CASH";
const LABEL_KATEGORI_GROSIR_TRANSFER = "GROSIR TRANSFER";
// Bayar Hutang pesanan Reseller Toko (baik per-pesanan maupun gabungan per-
// pelanggan) TIDAK pakai GROSIR CASH/GROSIR TRANSFER — satu kategori
// pemasukan saja ("Reseller Toko") terlepas dari metode Cash/Transfer-nya,
// karena kategori ini sudah ada duluan di Keuangan > Rekening & Kategori.
const LABEL_KATEGORI_RESELLER_TOKO = "Reseller Toko";
// Kategori pengeluaran khusus buat "Cairkan Deposit ke Pelanggan" — uang
// beneran keluar dari rekening Keuangan (Cash/Transfer) waktu deposit
// pelanggan dibayar balik, jadi harus tercatat sebagai baris pengeluaran,
// BUKAN cuma pengurangan grosir_deposit doang. Berlaku sama buat semua
// jenis_transaksi (Grosir/Reseller Toko/Reseller Cekout) — depositnya
// sendiri asalnya boleh beda-beda, tapi begitu dicairkan ke pelanggan,
// uangnya selalu dianggap keluar dari Keuangan.
const LABEL_KATEGORI_KEMBALIAN_DEPOSIT = "PENGEMBALIAN DEPOSIT";
// Kategori pengeluaran khusus buat "Pencairan" ke pelanggan Reseller Cekout
// (tab "Pencairan" di menu Reseller > Penagihan atau Pencairan) — dipisah
// dari LABEL_KATEGORI_KEMBALIAN_DEPOSIT supaya kelihatan beda di Laporan
// Keuangan (arus kas keluar untuk Reseller Cekout Toko Gudang secara
// spesifik, bukan pengembalian deposit pelanggan pada umumnya). Sama-sama
// dicatat sebagai pengeluaran (tipe "keluar") begitu dicairkan — cuma
// kategorinya beda, lewat kategoriLabel di CairkanDepositForm (lihat
// ModalRouter.jsx, modal "reseller-cekout-cairkan-deposit").
export const LABEL_KATEGORI_PENCAIRAN_RESELLER_CEKOUT = "Reseller Checkout";
function normalisasiLabelBayar(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "").trim();
}
function cariKategoriByLabelBayar(daftarKategori, label) {
  const target = normalisasiLabelBayar(label);
  return (daftarKategori || []).find((k) => normalisasiLabelBayar(k.label) === target) || null;
}

export function BayarHutangForm({ pesanan, sisaHutang, saldoDeposit, master, onClose, onSubmit, saving }) {
  // Reseller Cekout: uang masuk lewat pencairan marketplace, BUKAN
  // langsung ke rekening kas/bank seperti Grosir/Reseller Toko — jadi opsi
  // "Cash"/"Transfer" (yang wajib pilih Rekening Penampung & langsung
  // tercatat di Keuangan) diganti satu opsi "Pencairan Marketplace" yang
  // TIDAK langsung tercatat di Keuangan, melainkan ditampung dulu sebagai
  // saldo di toko Shopee "Gudang" (menu Marketplace > Shopee) — sama
  // seperti nominal cair di "Buat Pesanan Reseller Cekout". Baru pindah ke
  // Keuangan belakangan saat admin "Cairkan" saldo toko itu (lihat catatan
  // panjang di pages/Reseller.jsx & handler "grosir-bayar-hutang" di
  // ModalRouter.jsx).
  const isCekout = pesanan.jenis_transaksi === "reseller_cekout";
  const [jumlah, setJumlah] = useState(sisaHutang);
  const [metodeBayar, setMetodeBayar] = useState(isCekout ? "Marketplace" : "Cash");
  const [rekening, setRekening] = useState("");
  const [catatan, setCatatan] = useState("");

  const daftarRekening = master?.rekening || [];
  const daftarKategoriMasuk = master?.kategori_masuk || [];
  const rekeningOptions = daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));
  const isReseller = pesanan.jenis_transaksi === "reseller";
  // Reseller Toko: satu kategori "Reseller Toko" saja, tidak dipecah
  // Cash/Transfer seperti Grosir biasa.
  const labelKategoriDipakai = isReseller
    ? LABEL_KATEGORI_RESELLER_TOKO
    : metodeBayar === "Transfer"
      ? LABEL_KATEGORI_GROSIR_TRANSFER
      : LABEL_KATEGORI_GROSIR_CASH;
  const kategoriGrosirObj = cariKategoriByLabelBayar(daftarKategoriMasuk, labelKategoriDipakai);

  const jumlahNum = Number(jumlah) || 0;
  const kelebihan = metodeBayar !== "Deposit" && jumlahNum > sisaHutang ? jumlahNum - sisaHutang : 0;
  const depositTidakCukup = metodeBayar === "Deposit" && jumlahNum > saldoDeposit;
  // Cash/Transfer wajib pilih rekening + kategorinya harus ada dulu di
  // Keuangan > Rekening & Kategori, supaya uang yang diterima otomatis
  // kecatat sebagai pemasukan (sama seperti alur Langsung Bayar di Buat
  // Pesanan) — Deposit & Pencairan Marketplace tidak butuh ini: Deposit
  // karena bukan uang baru masuk, Pencairan Marketplace karena masuknya ke
  // saldo toko Shopee "Gudang" dulu, bukan ke rekening Keuangan langsung
  // (lihat catatan di atas).
  const catatKeKeuangan = metodeBayar !== "Deposit" && metodeBayar !== "Marketplace";
  const siapDicatat = !catatKeKeuangan || (rekening && kategoriGrosirObj);
  const canSubmit = jumlahNum > 0 && !depositTidakCukup && siapDicatat && !saving;

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
        <select
          value={metodeBayar}
          onChange={(e) => { setMetodeBayar(e.target.value); setRekening(""); }}
          className={inputClass}
        >
          {isCekout ? (
            <option value="Marketplace">Pencairan Marketplace</option>
          ) : (
            <>
              <option value="Cash">Cash</option>
              <option value="Transfer">Transfer</option>
            </>
          )}
          <option value="Deposit">Pakai Saldo Deposit</option>
        </select>
      </Field>

      {metodeBayar === "Marketplace" && (
        <div className="text-[11px] text-slate-500 mb-3 -mt-2">
          Tidak langsung tercatat di Keuangan — ditampung dulu sebagai saldo toko Shopee "Gudang" lewat menu
          Marketplace {">"} Shopee. Baru masuk Keuangan saat saldo toko itu di-"Cairkan".
        </div>
      )}

      {catatKeKeuangan && (
        <Field label="Rekening Penampung">
          <SearchableSelect
            value={rekening}
            onChange={setRekening}
            options={rekeningOptions}
            placeholder={metodeBayar === "Transfer" ? "Pilih rekening tujuan…" : "Pilih rekening kas…"}
          />
          {kategoriGrosirObj ? (
            <div className="text-[11px] text-slate-500 mt-1">
              Tercatat di Keuangan sebagai pemasukan kategori{" "}
              <span className="text-slate-300 font-medium">{kategoriGrosirObj.label}</span>.
            </div>
          ) : (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Kategori "{labelKategoriDipakai}"
              belum ada. Buat dulu di Keuangan {">"} Rekening & Kategori dengan nama persis ini.
            </div>
          )}
        </Field>
      )}

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
            Kelebihannya langsung masuk sebagai saldo deposit pelanggan — pesanan lain yang belum lunas TIDAK ikut
            terbayar otomatis.
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
        onClick={() =>
          onSubmit({
            jumlah: jumlahNum,
            metodeBayar,
            catatan: catatan.trim(),
            rekening: catatKeKeuangan ? rekening : null,
            kategoriKode: catatKeKeuangan ? kategoriGrosirObj?.kode || null : null,
          })
        }
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
export function BayarHutangPelangganForm({
  pelanggan, totalHutang, daftarPesanan, saldoDeposit, master, onClose, onSubmit, saving,
  // true kalau dipanggil dari modal "reseller-bayar-hutang-pelanggan"
  // (Penagihan Hutang Reseller Toko) — daftarPesanan-nya sudah difilter
  // cuma pesanan reseller, jadi kategori Keuangan-nya pakai "Reseller Toko"
  // (satu kategori, tidak dipecah Cash/Transfer), bukan GROSIR CASH/GROSIR
  // TRANSFER seperti pesanan Grosir biasa.
  isReseller = false,
}) {
  const [jumlah, setJumlah] = useState(totalHutang);
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [rekening, setRekening] = useState("");
  const [catatan, setCatatan] = useState("");

  const daftarRekening = master?.rekening || [];
  const daftarKategoriMasuk = master?.kategori_masuk || [];
  const rekeningOptions = daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));
  const labelKategoriDipakai = isReseller
    ? LABEL_KATEGORI_RESELLER_TOKO
    : metodeBayar === "Transfer"
      ? LABEL_KATEGORI_GROSIR_TRANSFER
      : LABEL_KATEGORI_GROSIR_CASH;
  const kategoriGrosirObj = cariKategoriByLabelBayar(daftarKategoriMasuk, labelKategoriDipakai);

  const jumlahNum = Number(jumlah) || 0;
  const kelebihan = metodeBayar !== "Deposit" && jumlahNum > totalHutang ? jumlahNum - totalHutang : 0;
  const depositTidakCukup = metodeBayar === "Deposit" && Math.min(jumlahNum, totalHutang) > saldoDeposit + 0.0001;
  const catatKeKeuangan = metodeBayar !== "Deposit";
  const siapDicatat = !catatKeKeuangan || (rekening && kategoriGrosirObj);
  const canSubmit = jumlahNum > 0 && !depositTidakCukup && siapDicatat && !saving;

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

      {daftarPesanan && daftarPesanan.length > 0 && (
        <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
          <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-900 border-b border-slate-800">
            Rincian Pesanan ({daftarPesanan.length})
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-800/70">
            {daftarPesanan.map((ps) => (
              <div key={ps.id} className="flex items-center justify-between px-3 py-2 text-xs bg-slate-950">
                <div className="min-w-0">
                  <div className="text-slate-200 font-medium truncate">{ps.nomor_pesanan}</div>
                  <div className="text-[11px] text-slate-500">
                    {ps.created_at ? new Date(ps.created_at).toLocaleString("id-ID") : ""}
                  </div>
                </div>
                <span className="text-red-400 font-semibold shrink-0 ml-2">{fmtRp(ps.sisa)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 mb-3">
        Uang yang masuk otomatis dialokasikan ke pesanan yang paling lama belum lunas dulu, sampai semua hutang
        terbayar atau jumlahnya habis.
      </p>

      <Field label="Metode Bayar">
        <select
          value={metodeBayar}
          onChange={(e) => { setMetodeBayar(e.target.value); setRekening(""); }}
          className={inputClass}
        >
          <option value="Cash">Cash</option>
          <option value="Transfer">Transfer</option>
          <option value="Deposit">Pakai Saldo Deposit</option>
        </select>
      </Field>

      {catatKeKeuangan && (
        <Field label="Rekening Penampung">
          <SearchableSelect
            value={rekening}
            onChange={setRekening}
            options={rekeningOptions}
            placeholder={metodeBayar === "Transfer" ? "Pilih rekening tujuan…" : "Pilih rekening kas…"}
          />
          {kategoriGrosirObj ? (
            <div className="text-[11px] text-slate-500 mt-1">
              Tercatat di Keuangan sebagai pemasukan kategori{" "}
              <span className="text-slate-300 font-medium">{kategoriGrosirObj.label}</span>.
            </div>
          ) : (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Kategori "{labelKategoriDipakai}"
              belum ada. Buat dulu di Keuangan {">"} Rekening & Kategori dengan nama persis ini.
            </div>
          )}
        </Field>
      )}

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
        onClick={() =>
          onSubmit({
            jumlah: jumlahNum,
            metodeBayar,
            catatan: catatan.trim(),
            rekening: catatKeKeuangan ? rekening : null,
            kategoriKode: catatKeKeuangan ? kategoriGrosirObj?.kode || null : null,
          })
        }
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
export function CairkanDepositForm({
  pelanggan, saldoDeposit, master, onClose, onSubmit, saving,
  // Override opsional — dipakai modal "reseller-cekout-cairkan-deposit"
  // (tab "Pencairan" di Reseller > Penagihan atau Pencairan) supaya form
  // yang sama persis ini bisa dipakai ulang dengan kategori pengeluaran &
  // judul/teks yang beda, tanpa menduplikasi seluruh komponen. Kalau tidak
  // diisi, perilakunya identik dengan sebelumnya (kategori "PENGEMBALIAN
  // DEPOSIT", dipakai dari modal "grosir-cairkan-deposit").
  kategoriLabel = LABEL_KATEGORI_KEMBALIAN_DEPOSIT,
  title,
  description,
  submitLabel,
}) {
  const [jumlah, setJumlah] = useState(saldoDeposit);
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [rekening, setRekening] = useState("");
  const [catatan, setCatatan] = useState("");

  const daftarRekening = master?.rekening || [];
  const daftarKategoriKeluar = master?.kategori_keluar || [];
  const rekeningOptions = daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));
  const kategoriObj = cariKategoriByLabelBayar(daftarKategoriKeluar, kategoriLabel);

  const jumlahNum = Number(jumlah) || 0;
  const melebihi = jumlahNum > saldoDeposit;
  // Uang beneran keluar dari rekening Keuangan waktu deposit dicairkan ke
  // pelanggan, jadi wajib pilih rekening & kategori pengeluarannya (label
  // di atas) harus sudah ada dulu di Keuangan > Rekening & Kategori (sama
  // pola dengan LABEL_KATEGORI_GROSIR_CASH/TRANSFER di BayarHutangForm).
  const siapDicatat = Boolean(rekening) && Boolean(kategoriObj);
  const canSubmit = jumlahNum > 0 && !melebihi && siapDicatat && !saving;

  return (
    <ModalShell title={title || `Cairkan Deposit — ${pelanggan.nama}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-900">
          <span className="text-slate-500 text-xs">Saldo Deposit Saat Ini</span>
          <span className="text-emerald-400 font-semibold">{fmtRp(saldoDeposit)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {description ||
          "Catat kalau uang ini benar-benar sudah dibayar/dikembalikan ke pelanggan (cash atau transfer). Saldo deposit pelanggan akan berkurang sebesar jumlah yang dicairkan, dan uangnya tercatat sebagai pengeluaran di Keuangan."}
      </p>

      <Field label="Metode Bayar">
        <select
          value={metodeBayar}
          onChange={(e) => { setMetodeBayar(e.target.value); setRekening(""); }}
          className={inputClass}
        >
          <option value="Cash">Cash</option>
          <option value="Transfer">Transfer</option>
        </select>
      </Field>

      <Field label="Rekening Sumber">
        <SearchableSelect
          value={rekening}
          onChange={setRekening}
          options={rekeningOptions}
          placeholder={metodeBayar === "Transfer" ? "Pilih rekening pengirim…" : "Pilih rekening kas…"}
        />
        {kategoriObj ? (
          <div className="text-[11px] text-slate-500 mt-1">
            Tercatat di Keuangan sebagai pengeluaran kategori{" "}
            <span className="text-slate-300 font-medium">{kategoriObj.label}</span>.
          </div>
        ) : (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Kategori pengeluaran "{kategoriLabel}" belum ada. Buat dulu di Keuangan {">"} Rekening
            & Kategori dengan nama persis ini.
          </div>
        )}
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
        onClick={() => onSubmit({ jumlah: jumlahNum, metodeBayar, rekening, kategoriKode: kategoriObj?.kode, catatan: catatan.trim() })}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : submitLabel || "Cairkan Deposit"}
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

// Bulk-assign zona (label kategori bebas, mis. "Cincin") ke beberapa Meja
// sekaligus — dipakai dari tombol "Atur Zona" di Peta Rak. Pilih Meja lewat
// checkbox (bukan ketik range manual) supaya tidak salah ketik; kolom Zona
// dikosongkan berarti Meja terpilih dikeluarkan dari zona (dikembalikan ke
// "Tanpa Zona"). Menyimpan menimpa kolom rak.zona untuk SEMUA rak yang ada
// di tiap Meja terpilih — jadi satu Meja selalu 1 zona.
export function AturZonaForm({ rak, onClose, onSubmit, saving }) {
  const mejaList = Array.from(new Set((rak || []).map((r) => r.meja).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const zonaPerMeja = {};
  (rak || []).forEach((r) => {
    if (!r.meja) return;
    if (r.zona && !zonaPerMeja[r.meja]) zonaPerMeja[r.meja] = r.zona;
  });
  const zonaTerpakai = Array.from(new Set(Object.values(zonaPerMeja))).sort();

  const [dipilih, setDipilih] = useState(new Set());
  const [zona, setZona] = useState("");
  const [cariMeja, setCariMeja] = useState("");

  const toggle = (meja) => {
    setDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(meja)) next.delete(meja);
      else next.add(meja);
      return next;
    });
  };

  const mejaTerpilih = Array.from(dipilih);
  const valid = mejaTerpilih.length > 0;

  const qLower = cariMeja.trim().toLowerCase();
  const mejaListTampil = qLower
    ? mejaList.filter((meja) => meja.toLowerCase().includes(qLower))
    : mejaList;

  return (
    <ModalShell title="Atur Zona Meja" onClose={onClose}>
      <p className="text-[11px] text-slate-500 -mt-1 mb-3">
        Kelompokkan beberapa Meja jadi satu zona, contoh: Meja A sampai Z untuk kategori "Cincin". Centang Meja
        yang mau dimasukkan, lalu isi nama zonanya.
      </p>

      <Field label={`Pilih Meja (${mejaTerpilih.length} dipilih)`}>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 mb-2">
          <Search size={13} className="text-slate-500 flex-shrink-0" />
          <input
            value={cariMeja}
            onChange={(e) => setCariMeja(e.target.value)}
            placeholder="Cari meja…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800/70">
          {mejaListTampil.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 text-center">Tidak ada meja yang cocok.</div>
          ) : (
          mejaListTampil.map((meja) => (
            <label
              key={meja}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-900"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dipilih.has(meja)}
                  onChange={() => toggle(meja)}
                  className="accent-amber-500"
                />
                Meja {meja}
              </span>
              {zonaPerMeja[meja] && (
                <span className="text-[10px] text-amber-400">{zonaPerMeja[meja]}</span>
              )}
            </label>
          ))
          )}
        </div>
      </Field>

      <Field label="Nama Zona (kosongkan untuk keluarkan dari zona)">
        <input
          className={inputClass}
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          placeholder="Contoh: Cincin, Kalung, Gelang"
        />
      </Field>
      {zonaTerpakai.length > 0 && (
        <div className="flex flex-wrap gap-1.5 -mt-2 mb-3">
          {zonaTerpakai.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZona(z)}
              className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              {z}
            </button>
          ))}
        </div>
      )}

      <button
        disabled={!valid || saving}
        onClick={() => onSubmit({ mejaTerpilih, zona: zona.trim() || null })}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : zona.trim() ? "Simpan Zona" : "Keluarkan dari Zona"}
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

// Form "Ajukan Order" dari Dashboard > Barang Menipis — gudang mengajukan
// satu SKU sekaligus ke owner untuk SKU yang stoknya sudah turun sampai
// AMBANG_MENIPIS_RESTOCK (lihat lib/constants.js). Tidak ada input jumlah —
// gudang cuma memberi tahu SKU mana yang perlu di-restock beserta catatan
// opsional; owner yang menentukan tindak lanjutnya (mis. bikin PO manual
// lewat alur Pesan Barang yang sudah ada).
export function AjukanRestockForm({ sku, onClose, onSubmit, saving }) {
  const [catatan, setCatatan] = useState("");

  return (
    <ModalShell title="Ajukan Order ke Owner" onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">SKU</div>
        <div className="font-mono text-sm text-slate-200">{sku?.sku}</div>
        <div className="text-[11px] text-slate-500 mt-2">Stok saat ini</div>
        <div className="font-mono text-sm text-amber-400">{sku?.stok || 0}</div>
      </div>

      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: laris di grosir, supplier langganan, dll"
        />
      </Field>

      <button
        disabled={saving}
        onClick={() => onSubmit(catatan.trim() || null)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Mengirim…" : "Ajukan ke Owner"}
      </button>
    </ModalShell>
  );
}

// Form "Ajukan Order" per ZONA — dipakai dari Peta Rak saat sebuah zona (mis.
// "Gelang Jurai") punya rak kosong. Beda dari AjukanRestockForm (per SKU
// yang stoknya menipis): di sini gudang melapor jumlah SLOT/rak kosong di
// satu zona, supaya owner tahu berapa model baru yang bisa dibeli untuk
// mengisi zona itu — jumlah rak kosong = perkiraan jumlah model yang bisa
// dibeli (asumsi 1 rak muat 1 model).
export function AjukanRestockZonaForm({ zona, jumlahKosong, onClose, onSubmit, saving }) {
  const [catatan, setCatatan] = useState("");

  return (
    <ModalShell title="Ajukan Order ke Owner" onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">Zona</div>
        <div className="text-sm font-semibold text-slate-200">{zona}</div>
        <div className="text-[11px] text-slate-500 mt-2">Rak kosong di zona ini</div>
        <div className="font-mono text-sm text-amber-400">{jumlahKosong} rak</div>
        <div className="text-[10px] text-slate-500 mt-1">
          Perkiraan slot untuk model baru — 1 rak kosong ≈ 1 model yang bisa dibeli.
        </div>
      </div>

      <Field label="Catatan (opsional)">
        <input
          className={inputClass}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Contoh: model laris, mau nambah varian warna, dll"
        />
      </Field>

      <button
        disabled={saving}
        onClick={() => onSubmit(catatan.trim() || null)}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Mengirim…" : "Ajukan ke Owner"}
      </button>
    </ModalShell>
  );
}

// Form tinjau pengajuan restock — dipakai owner/superadmin untuk
// Setujui/Tolak. Sesuai arahan user: menyetujui TIDAK otomatis membuat
// Pesan Barang (PO) baru — cuma menandai status "disetujui" (mirip badge
// "Habis" di Katalog/Master Barang), gudang yang nanti bikin PO manual
// lewat alur Pesan Barang yang sudah ada kalau memang mau ditindaklanjuti.
// Pengajuan bisa dua jenis: "sku" (dari Stok Menipis, per SKU) atau "zona"
// (dari Peta Rak, jumlah rak kosong di satu zona) — tampilannya beda karena
// datanya beda, tapi alur setuju/tolak-nya sama persis.
export function ResponPengajuanForm({ pengajuan: p, fotoUrl, barcodeSupplier, namaSupplier, onLihatFoto, onClose, onSubmitSetujui, onSubmitTolak, onBuatPesanBarang, saving }) {
  const [mauTolak, setMauTolak] = useState(false);
  const [catatanOwner, setCatatanOwner] = useState("");
  const isZona = p.jenis === "zona";
  // Pengajuan yang sudah direspon (disetujui/ditolak) ditampilkan read-only
  // — cuma detailnya, tanpa tombol Setujui/Tolak — dipakai saat SKU diklik
  // dari daftar "Restok (SKU) — Disetujui" di Dashboard Gudang.
  const sudahDirespon = p.status && p.status !== "menunggu";

  return (
    <ModalShell title={sudahDirespon ? "Detail Pengajuan Restock" : "Tinjau Pengajuan Restock"} onClose={onClose}>
      {!isZona && (fotoUrl ? (
        <img
          src={fotoUrl}
          alt={p.sku}
          onClick={onLihatFoto || undefined}
          className="w-full max-h-56 object-contain rounded-lg border border-slate-800 bg-slate-950 mb-3 cursor-zoom-in hover:opacity-90"
        />
      ) : (
        <div className="w-full h-28 flex items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950 mb-3 text-slate-700">
          <Camera size={20} />
        </div>
      ))}
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 space-y-1.5">
        {isZona ? (
          <>
            <div>
              <div className="text-[11px] text-slate-500">Zona</div>
              <div className="text-base font-semibold text-amber-400">{p.zona}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Rak kosong saat diajukan</div>
              <div className="font-mono text-sm text-slate-300">{p.jumlah_rak_kosong} rak</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-[11px] text-slate-500">SKU</div>
              <div className="font-mono text-base font-semibold text-amber-400">{p.sku}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Kode barang</div>
              <div className="font-mono text-sm text-slate-300">{barcodeSupplier || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Nama Toko/Supplier</div>
              <div className="text-sm text-slate-300">{namaSupplier || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Stok saat diajukan</div>
              <div className="font-mono text-sm text-slate-300">{p.stok_saat_ajuan}</div>
            </div>
          </>
        )}
        <div className="text-[11px] text-slate-500">
          Diajukan oleh <span className="text-slate-300">{p.dibuat_oleh_nama || "—"}</span>
        </div>
        {p.catatan && (
          <div className="text-[11px] text-slate-500">
            Catatan: <span className="text-slate-300">{p.catatan}</span>
          </div>
        )}
        {sudahDirespon && (
          <>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              Status: <Badge color={p.status === "disetujui" ? "emerald" : "red"}>
                {p.status === "disetujui" ? "Disetujui" : "Ditolak"}
              </Badge>
            </div>
            {p.direspon_oleh_nama && (
              <div className="text-[11px] text-slate-500">
                Direspon oleh <span className="text-slate-300">{p.direspon_oleh_nama}</span>
                {p.direspon_pada ? ` · ${p.direspon_pada.slice(0, 10)}` : ""}
              </div>
            )}
            {p.catatan_owner && (
              <div className="text-[11px] text-slate-500">
                Catatan owner: <span className="text-slate-300">{p.catatan_owner}</span>
              </div>
            )}
          </>
        )}
      </div>


      {sudahDirespon ? (
        p.status === "disetujui" && !isZona && onBuatPesanBarang ? (
          <button
            onClick={onBuatPesanBarang}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          >
            <ShoppingBag size={14} /> Buat Pesan Barang
          </button>
        ) : null
      ) : mauTolak ? (
        <>
          <Field label="Alasan ditolak (opsional)">
            <input
              className={inputClass}
              value={catatanOwner}
              onChange={(e) => setCatatanOwner(e.target.value)}
              placeholder="Contoh: stok masih cukup, tunggu bulan depan, dll"
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={() => setMauTolak(false)}
              className="flex-1 border border-slate-800 text-slate-300 text-sm py-2.5 rounded-lg"
            >
              Batal
            </button>
            <button
              disabled={saving}
              onClick={() => onSubmitTolak(catatanOwner)}
              className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg"
            >
              {saving ? "Menyimpan…" : "Konfirmasi Tolak"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={saving}
            onClick={() => setMauTolak(true)}
            className="flex-1 border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-sm font-medium py-2.5 rounded-lg"
          >
            Tolak
          </button>
          <button
            disabled={saving}
            onClick={onSubmitSetujui}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
          >
            {saving ? "Menyimpan…" : "Setujui"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
// =========================================================
// MARKETPLACE (Shopee/TikTok/Lazada) — lihat catatan lengkap soal desain
// datanya di saldoMarketplace() (lib/api.js). Dua form di bawah ini dipakai
// ModalRouter untuk 3 jenis transaksi: Pemasukan, Iklan (form yang sama,
// dibedakan lewat prop `tipe`), dan Pencairan (form terpisah karena butuh
// pilih rekening tujuan di Keuangan).
// =========================================================

const PLATFORM_LABEL_FORM = { shopee: "Shopee", tiktok: "TikTok", lazada: "Lazada" };

// Toko baru untuk satu platform (Shopee/TikTok/Lazada bisa punya beberapa
// toko sendiri-sendiri, masing-masing saldonya dihitung terpisah — lihat
// daftarTokoMarketplace() di lib/api.js). Kode dibuat otomatis di belakang
// layar (lihat prop `kodeBaru`, dibuat ModalRouter lewat nextKode — pola
// sama seperti PelangganForm/TokoForm/SupplierForm), tidak diminta ke user.
export function MarketplaceTokoForm({ platform, toko, kodeBaru, onClose, onSubmit, saving }) {
  const [nama, setNama] = useState(toko?.label || "");
  const isEdit = !!toko;
  return (
    <ModalShell title={`${isEdit ? "Edit" : "Tambah"} Toko — ${PLATFORM_LABEL_FORM[platform] || platform}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Tiap toko dihitung terpisah — pemasukan, iklan, dan saldonya tidak digabung dengan toko lain di platform ini.
      </p>
      <Field label="Nama Toko">
        <input
          className={inputClass}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder={`mis. ${PLATFORM_LABEL_FORM[platform] || "Toko"} Selma Official`}
          autoFocus
        />
      </Field>
      <button
        disabled={!nama.trim() || saving}
        onClick={() => onSubmit({ kode: isEdit ? toko.kode : kodeBaru, nama: nama.trim() })}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

export function MarketplaceTransaksiForm({ tipe, platform, tokoLabel, onClose, onSubmit, saving }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(todayIso);
  const [jumlah, setJumlah] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const jumlahNum = Number(jumlah) || 0;
  const canSubmit = !saving && tanggal && jumlahNum > 0;
  const isPemasukan = tipe === "pemasukan";
  const judul = isPemasukan ? "Tambah Pemasukan" : "Tambah Pengeluaran Iklan";
  const namaPlatform = PLATFORM_LABEL_FORM[platform] || platform;

  return (
    <ModalShell title={`${judul} — ${namaPlatform}${tokoLabel ? ` (${tokoLabel})` : ""}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        {isPemasukan
          ? "Dicatat sebagai penambah saldo marketplace — belum masuk ke Keuangan sampai dicairkan."
          : "Otomatis dipotong dari saldo marketplace (dianggap auto-debit dari saldo, bukan dibayar dari rekening Keuangan)."}
      </p>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label="Jumlah">
        <InputRupiah value={jumlah} onChange={setJumlah} placeholder="0" />
      </Field>

      <Field label={isPemasukan ? "Keterangan (mis. Pemasukan Agustus 2026)" : "Keterangan (mis. Iklan Gimmick 8.8)"}>
        <input
          className={inputClass}
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Opsional"
        />
      </Field>

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit({ tanggal, jumlah: jumlahNum, keterangan: keterangan.trim() })}
        className={`w-full disabled:opacity-40 text-sm font-semibold py-2.5 rounded-lg ${
          isPemasukan ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950" : "bg-amber-500 hover:bg-amber-400 text-slate-950"
        }`}
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

export function MarketplacePencairanForm({ platform, tokoLabel, saldo, rekeningList, kategoriList, onClose, onSubmit, saving }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [tanggal, setTanggal] = useState(todayIso);
  const [jumlah, setJumlah] = useState(saldo > 0 ? saldo : "");
  const [rekening, setRekening] = useState("");
  const [kategori, setKategori] = useState("");
  const [keterangan, setKeterangan] = useState("");

  const jumlahNum = Number(jumlah) || 0;
  const melebihi = jumlahNum > saldo + 0.0001;
  const rekeningOptions = (rekeningList || []).map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));
  const kategoriOptions = (kategoriList || []).map((k) => ({ value: k.kode, label: `${k.label} (${k.kode})` }));
  const canSubmit = !saving && tanggal && jumlahNum > 0 && !melebihi && rekening && kategori;
  const namaPlatform = PLATFORM_LABEL_FORM[platform] || platform;

  return (
    <ModalShell title={`Cairkan Saldo — ${namaPlatform}${tokoLabel ? ` (${tokoLabel})` : ""}`} onClose={onClose}>
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 text-sm bg-slate-900">
          <span className="text-slate-500 text-xs">Saldo Tersedia</span>
          <span className="text-md-primary font-semibold">{fmtRp(saldo)}</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Catat kalau uangnya benar-benar sudah cair ke rekening bank. Ini otomatis tercatat juga sebagai transaksi
        Pemasukan di Keuangan, ke rekening & kategori yang dipilih di bawah.
      </p>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <Field label="Jumlah Dicairkan">
        <InputRupiah value={jumlah} onChange={setJumlah} placeholder="0" />
      </Field>

      {melebihi && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Jumlah melebihi saldo yang tersedia.</div>
        </div>
      )}

      <Field label="Rekening Tujuan (di Keuangan)">
        <SearchableSelect
          value={rekening}
          onChange={setRekening}
          options={rekeningOptions}
          placeholder="Pilih rekening bank…"
        />
      </Field>

      <Field label="Kategori Pemasukan (di Keuangan)">
        <SearchableSelect
          value={kategori}
          onChange={setKategori}
          options={kategoriOptions}
          placeholder="Pilih kategori…"
        />
        {kategoriOptions.length === 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400 mt-1">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Belum ada kategori pemasukan di master data. Buat dulu lewat menu Keuangan {">"} Rekening & Kategori.
          </div>
        )}
      </Field>

      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </Field>

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit({ tanggal, jumlah: jumlahNum, rekening, kategori, keterangan: keterangan.trim() })}
        className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Cairkan"}
      </button>
    </ModalShell>
  );
}