import { useMemo, useState } from "react";
import { FileDown, FileUp, Loader2, Check, AlertCircle, ImagePlus } from "lucide-react";
import { ModalShell } from "./ui";
import { sb, fmtRp, calcHarga, sbUploadFoto, kompresFotoProduk } from "../lib/api";
import { downloadXlsx } from "../lib/exportData";

// =========================================================
// IMPORT SKU BARU MASSAL DARI EXCEL (Master Barang).
// Kolom: Bahan, Peruntukan, Kategori, Subkategori, Model, Warna, Ukuran, Stok Awal, Harga Asli,
//        Barcode Supplier (opsional).
//  - Kode SKU dibentuk SAMA seperti Buat SKU manual: {bahan}{peruntukan}{kategori}-{subkategori}-{model}-{warna}-{ukuran}.
//  - Kolom kode boleh berisi KODE atau LABEL dari Master Data; kode yang tidak dikenal = baris ditolak
//    (tambahkan dulu di Master Data supaya salah ketik tidak mengotori Master Data).
//  - Harga (HPP, Grosir, Tengah, Ecer) dihitung otomatis dari Harga Asli lewat rumus yang sama dengan Buat SKU.
//  - SKU yang sudah ada di PT ini / dobel di file DILEWATI. Data lama tidak pernah ditimpa.
//  - Membuat SKU + stok awal (+ riwayat stok). Penempatan rak dilakukan setelahnya (stok muncul di "Sisa di Gudang").
//  - FOTO (opsional), dua cara: (1) pilih banyak file foto, nama file (tanpa ekstensi) = kode SKU lengkap
//    atau Barcode Supplier; (2) kolom "Foto (link)" berisi alamat gambar https://… (disimpan apa adanya).
//    Foto disimpan di tabel items (foto_url) seperti Buat SKU Banyak, stage "selesai".
//  - Disimpan satu per satu (bukan sekaligus) supaya SKU yang sudah ada di katalog bersama Holding
//    otomatis "diambil" PT ini tanpa menimpa data master (lihat api.js, bagian MASTER BARANG BERSAMA).
// =========================================================

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIAS = {
  bahan: ["bahan"],
  peruntukan: ["peruntukan"],
  kategori: ["kategori"],
  subkategori: ["subkategori", "sub"],
  model: ["model", "nomormodel", "nomorurut"],
  warna: ["warna"],
  ukuran: ["ukuran"],
  stok: ["stokawal", "stok", "jumlah", "qty"],
  harga: ["hargaasli", "hargabeli", "harga", "modal"],
  barcode: ["barcodesupplier", "barcode", "barcodesupplieropsional", "barcodeopsional"],
  foto: ["fotolink", "linkfoto", "fotourl", "urlfoto", "linkgambar", "gambar", "foto"],
};
const KODE_FIELDS = ["bahan", "peruntukan", "kategori", "subkategori", "warna", "ukuran"];

function angka(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (t === "") return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

const teks = (v) => (typeof v === "number" ? String(Math.round(v) === v ? v : v) : String(v ?? "")).trim();

async function bacaFile(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const iHeader = aoa.findIndex((r) => r.some((c) => ALIAS.bahan.includes(norm(c))));
  if (iHeader < 0) throw new Error('Kolom "Bahan" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.');
  const kolom = {};
  aoa[iHeader].forEach((c, i) => {
    const n = norm(c);
    for (const [k, alias] of Object.entries(ALIAS)) {
      if (kolom[k] === undefined && alias.includes(n)) kolom[k] = i;
    }
  });
  const hilang = [...KODE_FIELDS, "model", "stok", "harga"].filter((k) => kolom[k] === undefined);
  if (hilang.length) throw new Error(`Kolom belum lengkap: ${hilang.join(", ")}. Pakai template yang bisa diunduh di layar ini.`);
  return aoa
    .slice(iHeader + 1)
    .map((r, i) => ({ baris: iHeader + i + 2, r }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ""))
    .map(({ baris, r }) => ({
      baris,
      ...Object.fromEntries([...KODE_FIELDS, "model"].map((k) => [k, teks(r[kolom[k]])])),
      stok: angka(r[kolom.stok]),
      harga: angka(r[kolom.harga]),
      barcode: kolom.barcode === undefined ? "" : teks(r[kolom.barcode]),
      fotoMentah: kolom.foto === undefined ? "" : teks(r[kolom.foto]),
    }));
}

// Cocokkan teks ke kode Master Data (boleh kode atau label, tidak peka huruf besar/kecil).
function cariKode(master, tipe, nilai) {
  const v = String(nilai).trim().toLowerCase();
  if (!v) return null;
  const daftar = master?.[tipe] || [];
  return (daftar.find((m) => String(m.kode).toLowerCase() === v) || daftar.find((m) => String(m.label || "").toLowerCase() === v))?.kode || null;
}

const LABEL = { bahan: "Bahan", peruntukan: "Peruntukan", kategori: "Kategori", subkategori: "Subkategori", warna: "Warna", ukuran: "Ukuran" };

export default function ImporSkuMaster({ skuMaster, master, settings, onSelesai, onClose }) {
  const [baris, setBaris] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [error, setError] = useState("");
  const [proses, setProses] = useState(null);
  const [hasil, setHasil] = useState(null);
  const [fotoFiles, setFotoFiles] = useState([]);

  const unduhTemplate = () => {
    const c = (tipe, i = 0) => master?.[tipe]?.[i]?.kode || "";
    downloadXlsx("template-import-sku-master-barang.xlsx", [
      {
        name: "SKU Baru",
        columns: [
          { key: "bahan", label: "Bahan" },
          { key: "peruntukan", label: "Peruntukan" },
          { key: "kategori", label: "Kategori" },
          { key: "subkategori", label: "Subkategori" },
          { key: "model", label: "Model" },
          { key: "warna", label: "Warna" },
          { key: "ukuran", label: "Ukuran" },
          { key: "stok", label: "Stok Awal" },
          { key: "harga", label: "Harga Asli" },
          { key: "barcode", label: "Barcode Supplier (opsional)" },
          { key: "foto", label: "Foto (link, opsional)" },
        ],
        rows: [
          { bahan: c("bahan"), peruntukan: c("peruntukan"), kategori: c("kategori"), subkategori: c("subkategori"), model: "1", warna: c("warna"), ukuran: c("ukuran"), stok: 10, harga: 25000, barcode: "", foto: "https://contoh.com/foto1.jpg" },
          { bahan: c("bahan"), peruntukan: c("peruntukan"), kategori: c("kategori"), subkategori: c("subkategori"), model: "1", warna: c("warna", 1) || c("warna"), ukuran: c("ukuran", 1) || c("ukuran"), stok: 5, harga: 25000, barcode: "", foto: "" },
        ],
      },
    ]);
  };

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBaris(null);
    setHasil(null);
    setNamaFile(file.name);
    try {
      const data = await bacaFile(file);
      if (!data.length) throw new Error("File kosong, tidak ada baris SKU.");
      const ada = new Set((skuMaster || []).map((s) => s.sku));
      const dalamFile = new Set();
      setBaris(
        data.map((d) => {
          const kode = {};
          const salah = [];
          for (const f of KODE_FIELDS) {
            if (!d[f]) salah.push(`${LABEL[f]} kosong`);
            else {
              const k = cariKode(master, f, d[f]);
              if (!k) salah.push(`${LABEL[f]} "${d[f]}" tidak ada di Master Data`);
              else kode[f] = k;
            }
          }
          if (!d.model) salah.push("Model kosong");
          if (d.stok === null || Number.isNaN(d.stok) || d.stok < 0) salah.push("Stok Awal tidak valid");
          if (d.harga === null || Number.isNaN(d.harga) || d.harga < 0) salah.push("Harga Asli tidak valid");
          if (salah.length) return { ...d, status: "error", pesan: salah.join("; ") };
          const sku = `${kode.bahan}${kode.peruntukan}${kode.kategori}-${kode.subkategori}-${d.model}-${kode.warna}-${kode.ukuran}`;
          if (ada.has(sku)) return { ...d, ...kode, sku, status: "lewati", pesan: "SKU sudah ada, dilewati" };
          if (dalamFile.has(sku)) return { ...d, ...kode, sku, status: "lewati", pesan: "Dobel di file, dilewati" };
          dalamFile.add(sku);
          return { ...d, ...kode, sku, stok: Math.floor(d.stok), status: "ok", pesan: "" };
        })
      );
    } catch (err) {
      setError(err.message || "Gagal membaca file");
    }
  };

  const siap = (baris || []).filter((b) => b.status === "ok");

  // Pasangkan file foto ke baris: nama file (tanpa ekstensi) = kode SKU, atau Barcode Supplier.
  const fotoPerBaris = useMemo(() => {
    const m = new Map();
    if (!baris || !fotoFiles.length) return m;
    const peta = new Map(fotoFiles.map((f) => [f.name.replace(/\.[^.]+$/, "").trim().toLowerCase(), f]));
    for (const b of baris) {
      if (b.status !== "ok") continue;
      const f = peta.get(b.sku.toLowerCase()) || (b.barcode ? peta.get(b.barcode.toLowerCase()) : null);
      if (f) m.set(b.baris, f);
    }
    return m;
  }, [baris, fotoFiles]);
  const adaLink = (b) => /^https?:\/\/\S+$/i.test(b.fotoMentah || "");
  const jmlFoto = siap.filter((b) => fotoPerBaris.has(b.baris) || adaLink(b)).length;
  const jml = (s) => (baris || []).filter((b) => b.status === s).length;

  const jalankan = async () => {
    if (!settings) {
      setError("Pengaturan harga belum termuat. Tutup lalu coba lagi.");
      return;
    }
    setError("");
    const gagal = [];
    let berhasil = 0;
    let fotoOk = 0;
    for (let i = 0; i < siap.length; i++) {
      const b = siap[i];
      setProses(`Menyimpan ${i + 1} / ${siap.length}…`);
      try {
        const harga = calcHarga(b.harga, settings);
        await sb("sku_master", {
          method: "POST",
          body: JSON.stringify({
            sku: b.sku,
            bahan: b.bahan, peruntukan: b.peruntukan, kategori: b.kategori, subkategori: b.subkategori,
            model: b.model, warna: b.warna, ukuran: b.ukuran,
            harga_asli: b.harga,
            harga_dasar: harga.hargaDasar, hpp: harga.hpp, grosir: harga.grosir, tengah: harga.tengah, ecer: harga.ecer,
            stok: b.stok,
            barcode_supplier: b.barcode || null,
          }),
        });
        try {
          await sb("stock_history", {
            method: "POST",
            body: JSON.stringify({
              sku: b.sku, type: "masuk", qty_before: 0, qty_change: b.stok, qty_after: b.stok,
              note: "SKU baru dibuat (import Excel)",
            }),
          });
        } catch {
          /* SKU & stok sudah masuk; hanya riwayat yang gagal */
        }
        berhasil++;
        // Foto: file yang cocok didahulukan, kalau tidak ada pakai link di kolom Foto.
        const file = fotoPerBaris.get(b.baris);
        if (file || adaLink(b)) {
          try {
            let url = b.fotoMentah;
            if (file) {
              const kecil = await kompresFotoProduk(file);
              const ext = (kecil.name.split(".").pop() || "jpg").toLowerCase();
              url = await sbUploadFoto(kecil, `${b.sku.replace(/[^a-zA-Z0-9-_]/g, "-")}.${ext}`);
            }
            await sb("items", {
              method: "POST",
              body: JSON.stringify({
                tanggal: new Date().toISOString().slice(0, 10), gudang: "Pembelian", jumlah: b.stok, sku: b.sku, foto_url: url, stage: "selesai",
              }),
            });
            fotoOk++;
          } catch (err) {
            gagal.push(`Foto ${b.sku} gagal (SKU sudah dibuat): ${err.message || "gagal"}`);
          }
        }
      } catch (err) {
        gagal.push(`Baris ${b.baris} (${b.sku}): ${err.message || "gagal"}`);
      }
    }
    setProses(null);
    setHasil({ berhasil, gagal, fotoOk });
    if (berhasil) onSelesai?.(berhasil);
  };

  return (
    <ModalShell title="Import SKU Baru dari Excel" onClose={onClose} maxWidth="max-w-3xl">
      {hasil ? (
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
            <Check size={16} /> {hasil.berhasil} SKU berhasil dibuat{hasil.fotoOk ? `, ${hasil.fotoOk} foto tersimpan` : ""}.
          </div>
          {hasil.gagal.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs p-3 mb-3 max-h-48 overflow-auto">
              <div className="font-medium mb-1">{hasil.gagal.length} baris gagal:</div>
              {hasil.gagal.map((g, i) => (
                <div key={i}>{g}</div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-slate-500 mb-3">
            Stok awal masuk ke "Sisa di Gudang". Tempatkan di rak lewat menu Rak.
          </div>
          <button onClick={onClose} className="w-full text-sm font-medium py-2.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400">
            Selesai
          </button>
        </div>
      ) : (
        <div>
          <div className="text-xs text-slate-400 mb-3">
            Untuk membuat banyak SKU baru sekaligus. Kode SKU dibentuk otomatis dari Bahan, Peruntukan, Kategori, Subkategori, Model, Warna, dan Ukuran;
            harga jual dihitung dari Harga Asli. Kode yang belum ada di Master Data harus ditambahkan dulu.
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={unduhTemplate} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
              <FileDown size={14} /> Unduh Template
            </button>
            <label className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 cursor-pointer">
              <FileUp size={14} /> Pilih File Excel
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pilihFile} />
            </label>
            {namaFile && <span className="text-xs text-slate-500 self-center truncate">{namaFile}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            <label className="flex items-center gap-1.5 font-medium px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer">
              <ImagePlus size={14} /> Pilih Foto (banyak)
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFotoFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
            </label>
            <span className="text-slate-500">
              {fotoFiles.length ? `${fotoFiles.length} foto dipilih` : "Opsional. Nama file = kode SKU atau Barcode Supplier, mis. ABC-1-1-HTM-S.jpg. Atau isi kolom Foto (link)."}
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs p-3 mb-3">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {baris && (
            <>
              <div className="flex flex-wrap gap-3 text-xs mb-2">
                <span className="text-emerald-400">Siap dibuat: {jml("ok")}</span>
                <span className="text-slate-400">Dilewati: {jml("lewati")}</span>
                <span className="text-red-400">Ditolak: {jml("error")}</span>
                <span className="text-sky-400">Dengan foto: {jmlFoto}</span>
              </div>
              <div className="rounded-lg border border-slate-700 max-h-72 overflow-auto mb-3">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">Baris</th>
                      <th className="text-left px-2 py-1.5">SKU</th>
                      <th className="text-right px-2 py-1.5">Stok</th>
                      <th className="text-right px-2 py-1.5">Harga Asli</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baris.map((b) => (
                      <tr key={b.baris} className="border-t border-slate-800">
                        <td className="px-2 py-1 text-slate-500">{b.baris}</td>
                        <td className="px-2 py-1 font-mono text-slate-200">{b.sku || "—"}</td>
                        <td className="px-2 py-1 text-right text-slate-300">{b.status === "error" ? "" : b.stok}</td>
                        <td className="px-2 py-1 text-right text-slate-300">{b.status === "error" ? "" : fmtRp(b.harga)}</td>
                        <td className={`px-2 py-1 ${b.status === "ok" ? "text-emerald-400" : b.status === "error" ? "text-red-400" : "text-slate-500"}`}>
                          {b.status === "ok" ? `Siap${fotoPerBaris.has(b.baris) ? " · foto file" : adaLink(b) ? " · foto link" : ""}` : b.pesan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={!siap.length || !!proses}
                onClick={jalankan}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-40"
              >
                {proses ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> {proses}
                  </>
                ) : (
                  `Buat ${siap.length} SKU`
                )}
              </button>
            </>
          )}
        </div>
      )}
    </ModalShell>
  );
}
