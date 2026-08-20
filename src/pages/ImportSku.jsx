import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { PageHeader, EmptyState, inputClass } from "../components/ui";
import { sb } from "../lib/api";

// Kode cepat: ketik angka gabungan (mis. "102040") supaya Grosir/Tengah/Ecer
// otomatis kepisah jadi 3 bagian sama panjang lalu dikali 1000 (10.000 /
// 20.000 / 40.000). Juga menerima pemisah manual (spasi/strip/koma) untuk
// harga yang jumlah digitnya beda-beda, mis. "100 20 40".
// Sama persis dengan logika kode cepat di form Buat SKU manual.
function parseKodeCepat(raw) {
  const bySeparator = raw.split(/[\s\-/,]+/).filter(Boolean);
  let parts = null;
  if (bySeparator.length === 3 && bySeparator.every((p) => /^\d+$/.test(p))) {
    parts = bySeparator;
  } else {
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length > 0 && digitsOnly.length % 3 === 0) {
      const chunkLen = digitsOnly.length / 3;
      parts = [
        digitsOnly.slice(0, chunkLen),
        digitsOnly.slice(chunkLen, chunkLen * 2),
        digitsOnly.slice(chunkLen * 2),
      ];
    }
  }
  if (!parts) return null;
  const [g, t, e] = parts.map((p) => Number(p) * 1000);
  return [g, t, e].every((n) => Number.isFinite(n)) ? { grosir: g, tengah: t, ecer: e } : null;
}

// =========================================================
// IMPORT SKU DARI EXCEL
// -----------------------------------------------------------
// Dipakai kalau data SKU sudah ada di file Excel (satu kolom teks SKU utuh,
// format PERSIS sama seperti yang dipakai sistem:
//   bahan+peruntukan+kategori-subkategori-model-warna-ukuran
// Contoh: KWPT-A-1-HTM-XL  ->  bahan=K, peruntukan=W, kategori=PT,
//         subkategori=A, model=1, warna=HTM, ukuran=XL
//
// Harga (asli/HPP/grosir/tengah/ecer) SENGAJA diisi 0 dulu — tidak ada di
// Excel, jadi harus diedit satu-satu belakangan lewat SKU & Harga > Master
// Barang (pensil "Edit harga"). Stok dan Kode Rak TIDAK diambil dari Excel,
// diketik manual di sini untuk tiap baris.
// =========================================================

// bahan+peruntukan+kategori digabung TANPA pemisah di segmen pertama SKU,
// jadi satu-satunya cara membedahnya otomatis adalah mencocokkan ke daftar
// kode yang sudah terdaftar di Master Data. Kalau cocok persis 1 kombinasi,
// itu dipakai. Kalau 0 atau lebih dari 1 kemungkinan, dikembalikan ke user.
function guessBPK(segment, master) {
  const bahanList = (master.bahan || []).map((m) => m.kode);
  const peruntukanList = (master.peruntukan || []).map((m) => m.kode);
  const kategoriList = (master.kategori || []).map((m) => m.kode);
  const matches = [];
  for (const b of bahanList) {
    if (!segment.startsWith(b)) continue;
    const sisaB = segment.slice(b.length);
    for (const p of peruntukanList) {
      if (!sisaB.startsWith(p)) continue;
      const sisaP = sisaB.slice(p.length);
      if (kategoriList.includes(sisaP)) matches.push({ bahan: b, peruntukan: p, kategori: sisaP });
    }
  }
  return matches;
}

function parseSkuRow(rawSku, master, skuMaster) {
  const sku = String(rawSku ?? "").trim();
  const row = {
    sku, stok: "", rakCode: "",
    kodeCepat: "", grosir: "", tengah: "", ecer: "",
    bahan: "", peruntukan: "", kategori: "", subkategori: "", model: "", warna: "", ukuran: "",
    segment1: "", ambiguous: null, existing: null, error: null,
  };
  if (!sku) {
    row.error = "SKU kosong";
    return row;
  }
  const parts = sku.split("-");
  if (parts.length !== 5) {
    row.error = "Bukan 5 bagian (harusnya bahan+peruntukan+kategori-subkategori-model-warna-ukuran)";
    return row;
  }
  const [segment1, subkategori, model, warna, ukuran] = parts;
  row.segment1 = segment1;
  row.subkategori = subkategori;
  row.model = model;
  row.warna = warna;
  row.ukuran = ukuran;

  const matches = guessBPK(segment1, master);
  if (matches.length === 1) {
    row.bahan = matches[0].bahan;
    row.peruntukan = matches[0].peruntukan;
    row.kategori = matches[0].kategori;
  } else if (matches.length > 1) {
    row.ambiguous = matches;
    row.error = `"${segment1}" cocok ke ${matches.length} kombinasi — pilih manual`;
  } else {
    row.error = `"${segment1}" tidak dikenali sebagai kombinasi Bahan+Peruntukan+Kategori — isi manual`;
  }

  row.existing = (skuMaster || []).find((s) => s.sku === sku) || null;
  return row;
}

export default function ImportSku({ master, skuMaster, reload, showToast }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setReading(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Cari kolom berheader "SKU" (case-insensitive). Kalau tidak ada header
      // yang cocok, anggap semua baris mulai dari baris pertama, kolom pertama.
      let startRow = 0;
      let col = 0;
      if (data.length && data[0].some((c) => String(c).trim().toLowerCase() === "sku")) {
        col = data[0].findIndex((c) => String(c).trim().toLowerCase() === "sku");
        startRow = 1;
      }
      const skuList = data.slice(startRow).map((r) => r[col]).filter((v) => String(v ?? "").trim() !== "");
      if (skuList.length === 0) {
        showToast("Tidak ada SKU yang terbaca dari file ini", "err");
        setRows([]);
        return;
      }
      setFileName(file.name);
      setRows(skuList.map((raw) => parseSkuRow(raw, master, skuMaster)));
    } catch (e) {
      showToast("Gagal membaca file — pastikan formatnya .xlsx/.xls/.csv", "err");
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateRow = (i, patch) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        const lengkap = next.bahan && next.peruntukan && next.kategori && next.subkategori && next.model && next.warna && next.ukuran;
        next.error = lengkap ? null : (r.ambiguous ? `"${r.segment1}" cocok ke beberapa kombinasi — pilih manual` : r.error);
        return next;
      })
    );
  };

  const applyKodeCepatRow = (i, raw) => {
    const hasil = parseKodeCepat(raw);
    updateRow(i, hasil ? { kodeCepat: raw, ...hasil } : { kodeCepat: raw });
  };

  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const rowReady = (r) =>
    !r.error && r.bahan && r.peruntukan && r.kategori && r.subkategori && r.model && r.warna && r.ukuran && Number(r.stok) > 0;

  const siapDiproses = rows.filter(rowReady);

  const handleImport = async () => {
    if (siapDiproses.length === 0 || processing) return;
    setProcessing(true);
    let dibuat = 0, ditambah = 0, gagal = 0;
    const errors = [];
    const skuSukses = new Set();
    try {
      for (const r of siapDiproses) {
        try {
          // Kode subkategori/warna/ukuran yang belum ada di Master Data dibuat
          // otomatis (sama seperti alur "Buat SKU" manual biasa). Bahan/
          // Peruntukan/Kategori TIDAK dibuat otomatis di sini karena harus
          // sudah dikenali oleh guessBPK/dipilih manual dulu supaya valid.
          const tipeFields = { subkategori: r.subkategori, warna: r.warna, ukuran: r.ukuran };
          for (const [tipe, kode] of Object.entries(tipeFields)) {
            const sudahAda = (master[tipe] || []).some((m) => m.kode === kode);
            if (kode && !sudahAda) {
              await sb("master_data", { method: "POST", body: JSON.stringify({ tipe, kode, label: kode }) });
            }
          }

          const jumlah = Number(r.stok);
          // Grosir/Tengah/Ecer dari kolom manual (atau kode cepat) di baris ini —
          // kalau dikosongkan, tetap 0 dan bisa diedit belakangan lewat Master
          // Barang. Harga Asli/HPP tidak diisi dari import (tidak ada di Excel),
          // dan harga manual ini HANYA dipakai untuk SKU BARU — kalau SKU-nya
          // sudah ada, harga lama dibiarkan (tidak ditimpa cuma karena nambah stok).
          const grosir = Number(r.grosir) || 0;
          const tengah = Number(r.tengah) || 0;
          const ecer = Number(r.ecer) || 0;
          if (r.existing) {
            const stokBaru = r.existing.stok + jumlah;
            await sb(`sku_master?id=eq.${r.existing.id}`, {
              method: "PATCH",
              body: JSON.stringify({ stok: stokBaru, nonaktif: false }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku: r.sku, type: "masuk", qty_before: r.existing.stok, qty_change: jumlah, qty_after: stokBaru,
                note: "Import dari Excel — SKU lama ditambah stok",
              }),
            });
            ditambah++;
          } else {
            await sb("sku_master", {
              method: "POST",
              body: JSON.stringify({
                sku: r.sku,
                bahan: r.bahan, peruntukan: r.peruntukan, kategori: r.kategori,
                subkategori: r.subkategori, model: r.model, warna: r.warna, ukuran: r.ukuran,
                harga_asli: 0, harga_dasar: 0, hpp: 0, grosir, tengah, ecer,
                stok: jumlah,
              }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku: r.sku, type: "masuk", qty_before: 0, qty_change: jumlah, qty_after: jumlah,
                note: "Import dari Excel — SKU baru",
              }),
            });
            dibuat++;
          }

          if (r.rakCode.trim()) {
            await sb("penempatan", {
              method: "POST",
              body: JSON.stringify({ sku: r.sku, rak_code: r.rakCode.trim().toUpperCase(), qty: jumlah }),
            });
          }

          // Bikin juga baris di "items" (Alur Barang) supaya barang hasil import
          // kelihatan & bisa dipantau kelengkapannya di sana — sama seperti
          // barang yang masuk lewat Barang Masuk. Tahap-nya langsung dilompat
          // ke sesuai apa yang sudah diisi di sini:
          //  - rak sudah diisi  -> tahap "verifikasi" (tinggal kurang foto)
          //  - rak belum diisi  -> tahap "rak" (masih perlu ditempatkan)
          // Foto & Marketplace TIDAK pernah terisi dari import, jadi barang
          // ini akan otomatis muncul di Alur Barang sebagai yang belum lengkap
          // sampai foto diupload & marketplace diisi lewat alur biasa.
          const rakSudahDiisi = !!r.rakCode.trim();
          await sb("items", {
            method: "POST",
            body: JSON.stringify({
              tanggal: new Date().toISOString().slice(0, 10),
              gudang: "Import Excel",
              jumlah,
              sku: r.sku,
              stage: rakSudahDiisi ? "verifikasi" : "rak",
              rak_code: rakSudahDiisi ? r.rakCode.trim().toUpperCase() : null,
            }),
          });

          skuSukses.add(r.sku);
        } catch (e) {
          gagal++;
          errors.push(`${r.sku}: ${e.message}`);
        }
      }
      setResult({ dibuat, ditambah, gagal, errors });
      setRows((prev) => prev.filter((r) => !skuSukses.has(r.sku)));
      await reload();
      showToast(
        `Import selesai — ${dibuat} SKU baru, ${ditambah} stok ditambah${gagal ? `, ${gagal} gagal` : ""}. Cek Alur Barang untuk lanjutkan yang belum lengkap.`,
        gagal ? "err" : undefined
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import SKU dari Excel"
        description="Upload file Excel berisi kolom SKU (format lengkap, sama seperti sistem). Stok, Kode Rak, dan Grosir/Tengah/Ecer diisi manual per baris di sini — Harga Asli/HPP tetap 0 dulu, edit belakangan lewat Master Barang. Setiap SKU yang berhasil diimport otomatis masuk ke Alur Barang, supaya kelengkapannya (rak, foto, marketplace) bisa dipantau dari sana."
      />

      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 bg-slate-900 border border-dashed border-slate-700 hover:border-amber-500/50 rounded-lg px-4 py-3 cursor-pointer text-sm text-slate-300">
          <Upload size={16} className="text-amber-400" />
          {reading ? "Membaca file…" : "Pilih file Excel (.xlsx/.xls/.csv)"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={reading}
          />
        </label>
        {fileName && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <FileSpreadsheet size={14} /> {fileName} · {rows.length} baris terbaca
          </span>
        )}
      </div>

      {result && (
        <div className="mb-4 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-400 font-medium mb-1">
            <CheckCircle2 size={16} /> Import selesai
          </div>
          <div className="text-slate-400 text-xs">
            {result.dibuat} SKU baru dibuat, {result.ditambah} SKU lama ditambah stok
            {result.gagal ? `, ${result.gagal} baris gagal` : ""}.
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-red-300 list-disc list-inside">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState label="Belum ada file yang diupload." />
      ) : (
        <>
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Bahan</th>
                  <th className="px-3 py-2 font-medium">Peruntukan</th>
                  <th className="px-3 py-2 font-medium">Kategori</th>
                  <th className="px-3 py-2 font-medium">Subkategori</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Warna</th>
                  <th className="px-3 py-2 font-medium">Ukuran</th>
                  <th className="px-3 py-2 font-medium w-20">Stok</th>
                  <th className="px-3 py-2 font-medium w-24">Kode Rak</th>
                  <th className="px-3 py-2 font-medium w-28">Kode Cepat Harga</th>
                  <th className="px-3 py-2 font-medium w-20">Grosir</th>
                  <th className="px-3 py-2 font-medium w-20">Tengah</th>
                  <th className="px-3 py-2 font-medium w-20">Ecer</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const needManualBPK = !r.bahan || !r.peruntukan || !r.kategori;
                  return (
                    <tr key={i} className={`border-t border-slate-800 ${r.error ? "bg-red-500/5" : ""}`}>
                      <td className="px-3 py-2 font-mono text-slate-300 align-top">
                        {r.sku}
                        {r.existing && (
                          <div className="text-[10px] text-sky-400 mt-0.5">SKU sudah ada · stok {r.existing.stok} → akan ditambah</div>
                        )}
                        {r.error && (
                          <div className="text-[10px] text-red-400 mt-0.5 flex items-start gap-1">
                            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> {r.error}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {needManualBPK ? (
                          <select
                            value={r.bahan}
                            onChange={(e) => updateRow(i, { bahan: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-20"
                          >
                            <option value="">—</option>
                            {(master.bahan || []).map((m) => <option key={m.kode} value={m.kode}>{m.kode}</option>)}
                          </select>
                        ) : r.bahan}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {needManualBPK ? (
                          <select
                            value={r.peruntukan}
                            onChange={(e) => updateRow(i, { peruntukan: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-20"
                          >
                            <option value="">—</option>
                            {(master.peruntukan || []).map((m) => <option key={m.kode} value={m.kode}>{m.kode}</option>)}
                          </select>
                        ) : r.peruntukan}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {needManualBPK ? (
                          <select
                            value={r.kategori}
                            onChange={(e) => updateRow(i, { kategori: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-20"
                          >
                            <option value="">—</option>
                            {(master.kategori || []).map((m) => <option key={m.kode} value={m.kode}>{m.kode}</option>)}
                          </select>
                        ) : r.kategori}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.subkategori}
                          onChange={(e) => updateRow(i, { subkategori: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-16"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.model}
                          onChange={(e) => updateRow(i, { model: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-12"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.warna}
                          onChange={(e) => updateRow(i, { warna: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-14"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.ukuran}
                          onChange={(e) => updateRow(i, { ukuran: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-14"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min="1"
                          value={r.stok}
                          onChange={(e) => updateRow(i, { stok: e.target.value })}
                          placeholder="0"
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-16"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.rakCode}
                          onChange={(e) => updateRow(i, { rakCode: e.target.value })}
                          placeholder="opsional"
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-20"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          value={r.kodeCepat}
                          onChange={(e) => applyKodeCepatRow(i, e.target.value)}
                          placeholder="mis. 102040"
                          title="Ketik kode gabungan (mis. 102040 -> Grosir 10rb, Tengah 20rb, Ecer 40rb) atau pisah manual mis. 100 20 40"
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-24"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          value={r.grosir}
                          onChange={(e) => updateRow(i, { grosir: e.target.value })}
                          placeholder="0"
                          disabled={!!r.existing}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-16 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          value={r.tengah}
                          onChange={(e) => updateRow(i, { tengah: e.target.value })}
                          placeholder="0"
                          disabled={!!r.existing}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-16 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          value={r.ecer}
                          onChange={(e) => updateRow(i, { ecer: e.target.value })}
                          placeholder="0"
                          disabled={!!r.existing}
                          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-300 outline-none w-16 disabled:opacity-30"
                        />
                        {r.existing && (
                          <div className="text-[10px] text-slate-600 mt-0.5">SKU lama · harga tidak berubah</div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-slate-600 hover:text-red-400"
                          title="Hapus baris ini dari daftar import"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={siapDiproses.length === 0 || processing}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm px-4 py-2.5 rounded-lg"
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              {processing ? "Memproses…" : `Import ${siapDiproses.length} SKU Siap`}
            </button>
            {rows.length > siapDiproses.length && (
              <span className="text-[11px] text-slate-500">
                {rows.length - siapDiproses.length} baris belum lengkap/masih error — lengkapi dulu isian Bahan/Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran & Stok (harus &gt;0) sebelum ikut ke-import.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}