import { useState } from "react";
import { Loader2, Check, AlertCircle, FileDown, FileUp } from "lucide-react";
import { sb, entitasSesi, fmtRp } from "../../lib/api";
import { downloadXlsx } from "../../lib/exportData";
import { Kerangka, Galat, pesanError } from "./BarangToko";

// =========================================================
// IMPORT BARANG TOKO DARI FILE EXCEL / CSV
// Kolom file: Nama, Kategori, HPP, Harga Jual, Stok Awal.
//  - Kode toko dibuat otomatis: KODE ENTITAS-nomor urut (mis. OPS-0001), lanjut dari yang terbesar.
//  - Barcode = kode toko. Barang tidak ditautkan ke SKU gudang.
//  - Barang yang namanya sudah ada di Barang Toko (atau dobel di file) DILEWATI.
//  - Stok awal dicatat lewat fungsi toko_opname supaya ada riwayatnya di toko_stok_mutasi.
// =========================================================

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const namaKey = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const ALIAS = {
  nama: ["nama", "namabarang"],
  kategori: ["kategori"],
  hpp: ["hpp", "hargabeli", "modal"],
  harga: ["hargajual", "harga", "hargaecer"],
  stok: ["stokawal", "stok", "jumlah"],
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
    for (const [k, alias] of Object.entries(ALIAS)) if (kolom[k] === undefined && alias.includes(norm(c))) kolom[k] = i;
  });
  if (kolom.harga === undefined) throw new Error('Kolom "Harga Jual" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.');
  return aoa
    .slice(iHeader + 1)
    .map((r, i) => ({ baris: iHeader + i + 2, r }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ""))
    .map(({ baris, r }) => ({
      baris,
      nama: String(r[kolom.nama] ?? "").trim(),
      kategori: kolom.kategori === undefined ? "" : String(r[kolom.kategori] ?? "").trim(),
      hpp: kolom.hpp === undefined ? 0 : angka(r[kolom.hpp]),
      harga: angka(r[kolom.harga]),
      stok: kolom.stok === undefined ? 0 : angka(r[kolom.stok]),
    }));
}

export default function ImporBarangToko({ barangAda, onSelesai, onClose }) {
  const [baris, setBaris] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [error, setError] = useState("");
  const [proses, setProses] = useState(null); // teks progres
  const [hasil, setHasil] = useState(null);

  const unduhTemplate = () =>
    downloadXlsx("template-import-barang-toko.xlsx", [
      {
        name: "Barang Toko",
        columns: [
          { key: "nama", label: "Nama" },
          { key: "kategori", label: "Kategori" },
          { key: "hpp", label: "HPP" },
          { key: "harga", label: "Harga Jual" },
          { key: "stok", label: "Stok Awal" },
        ],
        rows: [
          { nama: "Kemeja Flanel 1", kategori: "Kemeja", hpp: 35000, harga: 59000, stok: 10 },
          { nama: "Kemeja Flanel 2", kategori: "Kemeja", hpp: 38000, harga: 65000, stok: 5 },
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
      const dalamFile = new Set();
      setBaris(
        data.map((d) => {
          let status = "ok";
          let pesan = "";
          if (!d.nama) { status = "salah"; pesan = "Nama kosong"; }
          else if (!(d.harga > 0)) { status = "salah"; pesan = "Harga jual harus lebih dari 0"; }
          else if (Number.isNaN(d.hpp) || (d.hpp ?? 0) < 0) { status = "salah"; pesan = "HPP tidak valid"; }
          else if (Number.isNaN(d.stok) || (d.stok ?? 0) < 0 || !Number.isInteger(d.stok ?? 0)) { status = "salah"; pesan = "Stok awal harus bilangan bulat 0 atau lebih"; }
          else if (ada.has(namaKey(d.nama))) { status = "lewati"; pesan = "Sudah ada di Barang Toko"; }
          else if (dalamFile.has(namaKey(d.nama))) { status = "lewati"; pesan = "Nama dobel di file"; }
          if (status === "ok") dalamFile.add(namaKey(d.nama));
          return { ...d, hpp: Math.round(d.hpp || 0), harga: Math.round(d.harga || 0), stok: d.stok || 0, status, pesan };
        })
      );
    } catch (err) {
      setError(err.message || "Gagal membaca file");
    }
  };

  const jalankan = async () => {
    const valid = baris.filter((b) => b.status === "ok");
    if (!valid.length) return;
    setError("");
    const out = { dibuat: 0, stok: 0, dilewati: baris.filter((b) => b.status === "lewati").length, salah: baris.filter((b) => b.status === "salah").length, gagal: [] };
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
                barcode: b.kode,
                harga_jual: b.harga,
                hpp: b.hpp,
                nonaktif: false,
              }))
            ),
          });
          tersimpan.push(...bagian);
          out.dibuat += bagian.length;
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
        Kolom file: <b className="text-slate-200">Nama, Kategori, HPP, Harga Jual, Stok Awal</b>. Kode toko dan barcode dibuat otomatis (contoh OPS-0001).
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

      {baris && (
        <>
          <div className="text-xs text-slate-400">
            {namaFile}: <span className="text-emerald-300">{jumlah.ok} siap diimpor</span>
            {jumlah.lewati > 0 && <span className="text-slate-300"> · {jumlah.lewati} dilewati</span>}
            {jumlah.salah > 0 && <span className="text-amber-300"> · {jumlah.salah} tidak valid</span>}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-500 text-left">
                  <th className="font-medium px-3 py-1.5">Nama</th>
                  <th className="font-medium px-2 py-1.5 text-right">Harga</th>
                  <th className="font-medium px-2 py-1.5 text-right">Stok</th>
                  <th className="font-medium px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {baris.slice(0, 200).map((b) => (
                  <tr key={b.baris} className="border-t border-slate-800">
                    <td className="px-3 py-1.5">{b.nama || "(kosong)"}</td>
                    <td className="px-2 py-1.5 text-right">{b.harga > 0 ? fmtRp(b.harga) : "–"}</td>
                    <td className="px-2 py-1.5 text-right">{b.stok}</td>
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
