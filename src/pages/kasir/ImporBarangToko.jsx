import { useMemo, useState } from "react";
import { Loader2, Check, AlertCircle, FileDown, FileUp, ImagePlus } from "lucide-react";
import { sb, sbAll, entitasSesi, fmtRp, sbUploadFoto, kompresFotoProduk } from "../../lib/api";
import { downloadXlsx } from "../../lib/exportData";
import { Kerangka, Galat, pesanError } from "./BarangToko";

// =========================================================
// IMPORT BARANG TOKO DARI FILE EXCEL / CSV
// Kolom file: Nama, Kategori, HPP, Harga Jual, Stok Awal.
//  - Kode toko dibuat otomatis: KODE ENTITAS-nomor urut (mis. OPS-0001), lanjut dari yang terbesar.
//  - SKU (opsional): BOLEH BEBAS, tidak harus sama dengan Master Barang. Isi SKU selalu jadi barcode barang.
//    Kalau kebetulan SKU-nya ada di Master Barang (sku_master) dan belum dipakai barang toko lain,
//    barang otomatis ditautkan (sku_gudang) supaya bisa mutasi stok gudang ⇄ toko; kalau tidak, barang jadi barang bebas.
//  - Barcode BEBAS: boleh diisi di kolom "Barcode" (opsional); kosong = sama dengan kode toko.
//    Barang tidak ditautkan ke SKU gudang.
//  - Variasi (opsional): kolom "Variasi" (mis. Merah, atau Merah / L). Tiap variasi = SATU BARIS sendiri
//    (stok, barcode, foto sendiri); nama barang disimpan "Nama - Variasi", mis. "Cincin - S6".
//  - Barang yang namanya sudah ada di Barang Toko (atau dobel di file) DILEWATI.
//  - Foto lewat LINK: kolom "Foto (link)" berisi alamat gambar https://… ; disimpan apa adanya di foto_url
//    (tidak diunggah ulang). Kalau ada file foto yang cocok juga, file itu yang dipakai.
//  - Foto (opsional): pilih banyak foto sekaligus; nama file = Barcode barang (kalau diisi) atau Nama barang,
//    mis. 8991234567890.jpg atau "cincin.jpg". Diunggah setelah barang dibuat.
//  - Stok awal dicatat lewat fungsi toko_opname supaya ada riwayatnya di toko_stok_mutasi.
// =========================================================

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const namaKey = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const ALIAS = {
  nama: ["nama", "namabarang"],
  variasi: ["variasi", "varian", "variation", "namavariasi", "variasiopsional", "varianopsional"],
  kategori: ["kategori"],
  hpp: ["hpp", "hargabeli", "modal"],
  harga: ["hargajual", "harga", "hargaecer"],
  grosir: ["hargagrosir", "grosir"],
  stok: ["stokawal", "stok", "jumlah"],
  sku: ["sku", "skuopsional", "skugudang", "kodesku"],
  barcode: ["barcode", "kodebarcode", "barcodeopsional"],
  foto: ["fotolink", "linkfoto", "fotourl", "urlfoto", "linkgambar", "gambar", "foto"],
};

function angka(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (t === "") return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

async function bacaFile(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const iHeader = aoa.findIndex((r) => r.some((c) => ALIAS.nama.includes(norm(c))));
  if (iHeader < 0) throw new Error('Kolom "Nama" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.');
  const kolom = {};
  aoa[iHeader].forEach((c, i) => {
    const n = norm(c);
    for (const [k, alias] of Object.entries(ALIAS)) {
      if (kolom[k] !== undefined) continue;
      if (alias.includes(n) || (k === "variasi" && /^(variasi|varian|variation)/.test(n))) kolom[k] = i;
    }
  });
  if (kolom.harga === undefined) throw new Error('Kolom "Harga Jual" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.');
  return aoa
    .slice(iHeader + 1)
    .map((r, i) => ({ baris: iHeader + i + 2, r }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ""))
    .map(({ baris, r }) => ({
      baris,
      nama: [String(r[kolom.nama] ?? "").trim(), kolom.variasi === undefined ? "" : String(r[kolom.variasi] ?? "").trim().replace(/\s*\/\s*/g, " - ")]
        .filter(Boolean)
        .join(" - "),
      variasi: kolom.variasi === undefined ? "" : String(r[kolom.variasi] ?? "").trim(),
      kategori: kolom.kategori === undefined ? "" : String(r[kolom.kategori] ?? "").trim(),
      hpp: kolom.hpp === undefined ? 0 : angka(r[kolom.hpp]),
      harga: angka(r[kolom.harga]),
      grosir: kolom.grosir === undefined ? null : angka(r[kolom.grosir]),
      stok: kolom.stok === undefined ? 0 : angka(r[kolom.stok]),
      sku: kolom.sku === undefined ? "" : String(r[kolom.sku] ?? "").trim(),
      barcode: kolom.barcode === undefined ? "" : String(r[kolom.barcode] ?? "").trim(),
      fotoMentah: kolom.foto === undefined ? "" : String(r[kolom.foto] ?? "").trim(),
    }));
}

export default function ImporBarangToko({ barangAda, onSelesai, onClose }) {
  const [baris, setBaris] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [error, setError] = useState("");
  const [proses, setProses] = useState(null); // teks progres
  const [hasil, setHasil] = useState(null);
  const [fotoFiles, setFotoFiles] = useState([]);

  const unduhTemplate = () =>
    downloadXlsx("template-import-barang-toko.xlsx", [
      {
        name: "Barang Toko",
        columns: [
          { key: "nama", label: "Nama" },
          { key: "variasi", label: "Variasi (opsional)" },
          { key: "kategori", label: "Kategori" },
          { key: "hpp", label: "HPP" },
          { key: "harga", label: "Harga Jual" },
          { key: "grosir", label: "Harga Grosir (opsional)" },
          { key: "stok", label: "Stok Awal" },
          { key: "sku", label: "SKU (opsional)" },
          { key: "barcode", label: "Barcode (opsional)" },
          { key: "foto", label: "Foto (link)" },
        ],
        rows: [
          { nama: "Cincin", variasi: "S6", kategori: "cincin", hpp: 35000, harga: 59000, grosir: 49000, stok: 10, sku: "SKU-CONTOH-001", barcode: "SKU-CONTOH-001", foto: "https://contoh.com/cincin1.jpg" },
          { nama: "kalung", variasi: "", kategori: "kalung", hpp: 55000, harga: 109000, grosir: "", stok: 6, sku: "SKU-CONTOH-002", barcode: "SKU-CONTOH-002", foto: "" },
          ],
      },
    ]);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBaris(null);
    setNamaFile(file.name);
    try {
      const data = await bacaFile(file);
      if (!data.length) throw new Error("File kosong, tidak ada baris barang.");
      const ada = new Set(barangAda.map((b) => namaKey(b.nama)));
      // SKU (opsional): bebas. Kalau cocok dengan Master Barang -> ditautkan; kalau tidak -> hanya jadi barcode.
      let masterSku = null;
      if (data.some((d) => d.sku)) {
        const m = await sbAll("sku_master?select=sku");
        masterSku = new Map((m || []).map((x) => [String(x.sku).toLowerCase(), x.sku]));
      }
      const skuToko = new Map(barangAda.filter((b) => b.sku_gudang).map((b) => [String(b.sku_gudang).toLowerCase(), b.kode]));
      const dalamFile = new Set();
      const barcodeAda = new Set(barangAda.map((b) => String(b.barcode || "").toLowerCase()).filter(Boolean));
      const barcodeFile = new Set();
      setBaris(
        data.map((d) => {
          // tautkan ke gudang hanya kalau SKU ada di Master Barang dan belum dipakai barang toko lain
          const skuAsli = d.sku && !skuToko.has(d.sku.toLowerCase()) ? masterSku?.get(d.sku.toLowerCase()) || null : null;
          const bc = d.sku || d.barcode; // SKU diisi -> barcode = SKU (apa adanya)
          let status = "ok";
          let pesan = "";
          if (!d.nama) { status = "salah"; pesan = "Nama kosong"; }
          else if (!(d.harga > 0)) { status = "salah"; pesan = "Harga jual harus lebih dari 0"; }
          else if (Number.isNaN(d.hpp) || (d.hpp ?? 0) < 0) { status = "salah"; pesan = "HPP tidak valid"; }
          else if (Number.isNaN(d.grosir) || (d.grosir > 0 && d.grosir >= d.harga)) { status = "salah"; pesan = "Harga grosir harus lebih kecil dari harga jual"; }
          else if (Number.isNaN(d.stok) || (d.stok ?? 0) < 0 || !Number.isInteger(d.stok ?? 0)) { status = "salah"; pesan = "Stok awal harus bilangan bulat 0 atau lebih"; }
          else if (bc && barcodeAda.has(bc.toLowerCase())) { status = "salah"; pesan = "Barcode sudah dipakai barang lain"; }
          else if (bc && barcodeFile.has(bc.toLowerCase())) { status = "salah"; pesan = "Barcode dobel di file"; }
          else if (ada.has(namaKey(d.nama))) { status = "lewati"; pesan = "Sudah ada di Barang Toko"; }
          else if (dalamFile.has(namaKey(d.nama))) { status = "lewati"; pesan = d.variasi ? "Nama + variasi dobel di file" : "Nama dobel di file (beda variasi? isi kolom Variasi)"; }
          if (status === "ok") { dalamFile.add(namaKey(d.nama)); if (bc) barcodeFile.add(bc.toLowerCase()); }
          const adaLink = /^https?:\/\/\S+$/i.test(d.fotoMentah);
          return { ...d, barcode: bc, sku: skuAsli || "", fotoUrl: adaLink ? d.fotoMentah : "", fotoSalah: !!d.fotoMentah && !adaLink, hpp: Math.round(d.hpp || 0), harga: Math.round(d.harga || 0), grosir: d.grosir > 0 ? Math.round(d.grosir) : null, stok: d.stok || 0, status, pesan };
        })
      );
    } catch (err) {
      setError(err.message || "Gagal membaca file");
    }
  };

  // Pasangkan foto ke baris: nama file (tanpa ekstensi) = barcode, kalau tidak ada = nama barang.
  const fotoPerBaris = useMemo(() => {
    const m = new Map();
    if (!baris || !fotoFiles.length) return m;
    const peta = new Map(fotoFiles.map((f) => [namaKey(f.name.replace(/\.[^.]+$/, "")), f]));
    for (const b of baris) {
      const f = (b.barcode && peta.get(namaKey(b.barcode))) || peta.get(namaKey(b.nama));
      if (f) m.set(b.baris, f);
    }
    return m;
  }, [baris, fotoFiles]);

  const jalankan = async () => {
    const valid = baris.filter((b) => b.status === "ok");
    if (!valid.length) return;
    setError("");
    const out = { dibuat: 0, stok: 0, foto: 0, fotoLink: 0, dilewati: baris.filter((b) => b.status === "lewati").length, salah: baris.filter((b) => b.status === "salah").length, gagal: [] };
    try {
      const prefix = String(entitasSesi()).toUpperCase();
      let nomor = 0;
      for (const t of barangAda) {
        const m = String(t.kode || "").toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
        if (m) nomor = Math.max(nomor, parseInt(m[1], 10));
      }
      const siap = valid.map((b) => ({ ...b, kode: `${prefix}-${String(++nomor).padStart(4, "0")}` }));

      // 1) Buat barang, per 100 baris.
      const tersimpan = [];
      for (let i = 0; i < siap.length; i += 100) {
        const bagian = siap.slice(i, i + 100);
        setProses(`Menyimpan barang ${Math.min(i + 100, siap.length)} / ${siap.length}…`);
        try {
          await sb("master_toko", {
            method: "POST",
            body: JSON.stringify(
              bagian.map((b) => ({
                kode: b.kode,
                nama: b.nama,
                kategori: b.kategori || null,
                barcode: b.barcode || b.kode,
                sku_gudang: b.sku || null,
                harga_jual: b.harga,
                harga_grosir: b.grosir || null,
                hpp: b.hpp,
                foto_url: b.fotoUrl || null,
                nonaktif: false,
              }))
            ),
          });
          tersimpan.push(...bagian);
          out.dibuat += bagian.length;
          out.fotoLink += bagian.filter((b) => b.fotoUrl).length;
        } catch (e) {
          out.gagal.push(`Baris ${bagian[0].baris}–${bagian[bagian.length - 1].baris}: ${pesanError(e)}`);
        }
      }

      // 2) Stok awal lewat opname (tercatat riwayatnya), 4 sekaligus.
      const perluStok = tersimpan.filter((b) => b.stok > 0);
      let selesai = 0;
      let antre = 0;
      const kerja = async () => {
        while (antre < perluStok.length) {
          const b = perluStok[antre++];
          try {
            await sb("rpc/toko_opname", {
              method: "POST",
              body: JSON.stringify({ p: { entitas: entitasSesi(), kode: b.kode, stok_baru: b.stok, catatan: "Stok awal (import file)" } }),
            });
            out.stok += 1;
          } catch (e) {
            out.gagal.push(`${b.kode} ${b.nama}: stok awal gagal — ${pesanError(e)}`);
          }
          selesai += 1;
          setProses(`Mengisi stok awal ${selesai} / ${perluStok.length}…`);
        }
      };
      await Promise.all([kerja(), kerja(), kerja(), kerja()]);

      // 3) Foto: unggah yang cocok, 3 sekaligus, lalu simpan alamatnya di foto_url.
      const perluFoto = tersimpan.filter((b) => fotoPerBaris.has(b.baris));
      let fSelesai = 0;
      let fAntre = 0;
      const kerjaFoto = async () => {
        while (fAntre < perluFoto.length) {
          const b = perluFoto[fAntre++];
          try {
            const kecil = await kompresFotoProduk(fotoPerBaris.get(b.baris));
            const ext = (kecil.name.split(".").pop() || "jpg").toLowerCase();
            const url = await sbUploadFoto(kecil, `toko/${b.kode.replace(/[^a-zA-Z0-9-_]/g, "-")}-${Date.now()}.${ext}`);
            await sb(`master_toko?kode=eq.${encodeURIComponent(b.kode)}`, { method: "PATCH", body: JSON.stringify({ foto_url: url }) });
            out.foto += 1;
          } catch (e) {
            out.gagal.push(`${b.kode} ${b.nama}: foto gagal — ${pesanError(e)}`);
          }
          fSelesai += 1;
          setProses(`Mengunggah foto ${fSelesai} / ${perluFoto.length}…`);
        }
      };
      if (perluFoto.length) await Promise.all([kerjaFoto(), kerjaFoto(), kerjaFoto()]);
    } catch (e) {
      out.gagal.push(pesanError(e));
    }
    setProses(null);
    setHasil(out);
  };

  if (hasil) {
    return (
      <Kerangka judul="Hasil import Barang Toko" onClose={() => onSelesai(hasil)}>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-emerald-300"><Check size={15} /> {hasil.dibuat} barang ditambahkan</div>
          {hasil.fotoLink > 0 && <div className="text-slate-300">{hasil.fotoLink} foto dipasang dari link</div>}
          {hasil.foto > 0 && <div className="text-slate-300">{hasil.foto} foto tersimpan</div>}
          {hasil.stok > 0 && <div className="text-slate-300">{hasil.stok} barang sudah diisi stok awalnya</div>}
          {hasil.dilewati > 0 && <div className="text-slate-400">{hasil.dilewati} dilewati (sudah ada atau dobel di file)</div>}
          {hasil.salah > 0 && <div className="text-amber-300">{hasil.salah} baris tidak valid dan tidak diimpor</div>}
        </div>
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

  const jumlah = baris ? { ok: baris.filter((b) => b.status === "ok").length, lewati: baris.filter((b) => b.status === "lewati").length, salah: baris.filter((b) => b.status === "salah").length } : null;

  return (
    <Kerangka judul="Import Barang Toko dari file" onClose={proses ? () => {} : onClose}>
      <div className="text-xs text-slate-400 leading-relaxed">
        Kolom file: <b className="text-slate-200">Nama, Kategori, HPP, Harga Jual, Stok Awal</b>. Kolom opsional: <b className="text-slate-200">SKU</b> (bebas, tidak harus ada di Master Barang; jadi barcode barang, dan otomatis tertaut ke gudang kalau kebetulan sama dengan SKU Master Barang), <b className="text-slate-200">Barcode</b> (bebas; kosong = sama dengan kode toko; diabaikan kalau SKU diisi) dan <b className="text-slate-200">Foto (link)</b> (alamat gambar yang diawali https://). <b className="text-slate-200">Variasi</b> (mis. Merah / L): tiap variasi ditulis di baris sendiri dengan stok &amp; barcode sendiri, namanya jadi "Nama - Variasi". Kode toko dibuat otomatis (contoh OPS-0001).
        Barang yang namanya sudah ada dilewati.
      </div>

      <div className="flex gap-2">
        <button onClick={unduhTemplate} className="flex-1 flex items-center justify-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 text-sm font-medium py-2.5 rounded-xl">
          <FileDown size={15} /> Unduh template
        </button>
        <label className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold py-2.5 rounded-xl cursor-pointer">
          <FileUp size={15} /> Pilih file
          <input type="file" accept=".xlsx,.xls,.csv" onChange={pilihFile} className="hidden" disabled={!!proses} />
        </label>
      </div>

      <Galat pesan={error} />

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
          <ImagePlus size={14} /> {fotoFiles.length ? `${fotoFiles.length} foto dipilih` : "Pilih foto (opsional)"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={!!proses}
            onChange={(e) => {
              setFotoFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
        {fotoFiles.length > 0 && (
          <button type="button" onClick={() => setFotoFiles([])} disabled={!!proses} className="text-xs text-red-400 hover:text-red-300">Kosongkan</button>
        )}
      </div>
      <div className="text-[11px] text-slate-500 leading-snug">
        Nama file foto = <b className="text-slate-300">Barcode</b> barang (kalau diisi) atau <b className="text-slate-300">Nama</b> barang, mis. <span className="font-mono">cincin1.jpg</span>.
      </div>

      {baris && (
        <>
          <div className="text-xs text-slate-400">
            {namaFile}: <span className="text-emerald-300">{jumlah.ok} siap diimpor</span>
            {jumlah.lewati > 0 && <span className="text-slate-300"> · {jumlah.lewati} dilewati</span>}
            {jumlah.salah > 0 && <span className="text-amber-300"> · {jumlah.salah} tidak valid</span>}
            {fotoFiles.length > 0 && <span className="text-sky-300"> · {baris.filter((b) => b.status === "ok" && fotoPerBaris.has(b.baris)).length} foto cocok</span>}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-500 text-left">
                  <th className="font-medium px-3 py-1.5">Nama</th>
                  <th className="font-medium px-2 py-1.5 text-right">Harga</th>
                  <th className="font-medium px-2 py-1.5 text-right">Stok</th>
                  <th className="font-medium px-2 py-1.5">Foto</th>
                  <th className="font-medium px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {baris.slice(0, 200).map((b) => (
                  <tr key={b.baris} className="border-t border-slate-800">
                    <td className="px-3 py-1.5">{b.nama || "(kosong)"}</td>
                    <td className="px-2 py-1.5 text-right">{b.harga > 0 ? fmtRp(b.harga) : "–"}</td>
                    <td className="px-2 py-1.5 text-right">{b.stok}</td>
                    <td className="px-2 py-1.5">{fotoPerBaris.has(b.baris) ? "✓ file" : b.fotoUrl ? "✓ link" : b.fotoSalah ? <span className="text-amber-300">link salah</span> : "–"}</td>
                    <td className={`px-3 py-1.5 ${b.status === "ok" ? "text-emerald-300" : b.status === "lewati" ? "text-slate-400" : "text-amber-300"}`}>
                      {b.status === "ok" ? "Siap" : b.pesan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {baris.length > 200 && <div className="text-[11px] text-slate-500">Menampilkan 200 baris pertama dari {baris.length}.</div>}
          <button
            onClick={jalankan}
            disabled={!!proses || jumlah.ok === 0}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl"
          >
            {proses && <Loader2 size={15} className="animate-spin" />}
            {proses || `Impor ${jumlah.ok} barang`}
          </button>
        </>
      )}
    </Kerangka>
  );
}