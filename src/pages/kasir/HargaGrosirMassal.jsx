import { useMemo, useState } from "react";
import { Loader2, Check, FileDown, FileUp, AlertCircle } from "lucide-react";
import { sb, fmtRp } from "../../lib/api";
import { downloadXlsx } from "../../lib/exportData";
import { Kerangka, Galat, pesanError, inp } from "./BarangToko";

// =========================================================
// ATUR HARGA GROSIR MASSAL — Barang Toko (master_toko.harga_grosir)
// Dua cara, hasilnya selalu ditampilkan dulu (pratinjau) sebelum disimpan:
//  1) RUMUS : barang yang sedang tampil di daftar (ikut pencarian / filter / kategori) dihitung otomatis
//             dari harga jual — potong % atau potong Rp, dengan pembulatan. Bisa hanya mengisi yang masih
//             kosong, atau menimpa yang sudah ada. Bisa juga mengosongkan harga grosir.
//  2) EXCEL : unduh daftar barang (kolom Harga Grosir sudah ada), isi/ubah di Excel, upload lagi.
//             Kunci pencocokan = Kode toko (kalau kosong: Barcode). Sel Harga Grosir kosong = tidak diubah,
//             isi 0 = hapus harga grosir barang itu.
// Aturan yang sama dengan form barang: harga grosir harus lebih kecil dari harga jual.
// Tidak menyentuh stok, harga jual, HPP, atau data lain.
// =========================================================

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS = { kode: ["kode", "kodetoko"], barcode: ["barcode", "kodebarcode"], grosir: ["hargagrosir", "grosir"] };

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
  const iHeader = aoa.findIndex((r) => r.some((c) => ALIAS.grosir.includes(norm(c))));
  if (iHeader < 0) throw new Error('Kolom "Harga Grosir" tidak ditemukan. Pakai file hasil "Unduh daftar barang" di layar ini.');
  const kolom = {};
  aoa[iHeader].forEach((c, i) => {
    const n = norm(c);
    for (const [k, alias] of Object.entries(ALIAS)) if (kolom[k] === undefined && alias.includes(n)) kolom[k] = i;
  });
  if (kolom.kode === undefined && kolom.barcode === undefined) throw new Error('Kolom "Kode" atau "Barcode" tidak ditemukan.');
  return aoa
    .slice(iHeader + 1)
    .map((r, i) => ({ baris: iHeader + i + 2, r }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ""))
    .map(({ baris, r }) => ({
      baris,
      kode: kolom.kode === undefined ? "" : String(r[kolom.kode] ?? "").trim(),
      barcode: kolom.barcode === undefined ? "" : String(r[kolom.barcode] ?? "").trim(),
      grosir: angka(r[kolom.grosir]),
    }));
}

const BULAT = [
  [1, "Tanpa pembulatan"],
  [100, "Dibulatkan ke 100"],
  [500, "Dibulatkan ke 500"],
  [1000, "Dibulatkan ke 1.000"],
];

export default function HargaGrosirMassal({ daftar, semua, onSelesai, onClose }) {
  const [mode, setMode] = useState("rumus"); // "rumus" | "excel"
  // rumus
  const [tipe, setTipe] = useState("persen"); // persen | nominal | kosongkan
  const [nilai, setNilai] = useState("");
  const [bulat, setBulat] = useState(500);
  const [timpa, setTimpa] = useState(false); // false = hanya yang grosirnya masih kosong
  const [lewatiHpp, setLewatiHpp] = useState(true);
  // excel
  const [barisFile, setBarisFile] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  // umum
  const [error, setError] = useState("");
  const [proses, setProses] = useState(null);
  const [hasil, setHasil] = useState(null);

  // ---------- rencana (pratinjau) ----------
  const rencanaRumus = useMemo(() => {
    const n = Number(String(nilai).replace(",", "."));
    if (tipe !== "kosongkan" && !(n > 0)) return [];
    return daftar.map((r) => {
      const jual = Number(r.harga_jual) || 0;
      const lama = Number(r.harga_grosir) > 0 ? Number(r.harga_grosir) : null;
      const dasar = { id: r.id, kode: r.kode, nama: r.nama, jual, lama, hpp: Number(r.hpp) || 0 };
      if (tipe === "kosongkan") {
        if (lama === null) return { ...dasar, baru: null, status: "lewati", pesan: "Memang belum ada" };
        return { ...dasar, baru: null, status: "ok", pesan: "Dikosongkan" };
      }
      if (lama !== null && !timpa) return { ...dasar, baru: lama, status: "lewati", pesan: "Sudah punya grosir" };
      if (!(jual > 0)) return { ...dasar, baru: null, status: "salah", pesan: "Harga jual 0" };
      let baru = tipe === "persen" ? jual * (1 - n / 100) : jual - n;
      baru = Math.round(baru / bulat) * bulat;
      if (!(baru > 0)) return { ...dasar, baru, status: "salah", pesan: "Hasil 0 atau minus" };
      if (baru >= jual) return { ...dasar, baru, status: "salah", pesan: "Tidak lebih kecil dari harga jual" };
      if (lewatiHpp && dasar.hpp > 0 && baru < dasar.hpp) return { ...dasar, baru, status: "salah", pesan: "Di bawah HPP" };
      if (baru === lama) return { ...dasar, baru, status: "lewati", pesan: "Sama dengan harga sekarang" };
      return { ...dasar, baru, status: "ok", pesan: baru < dasar.hpp && dasar.hpp > 0 ? "Siap (di bawah HPP!)" : "Siap" };
    });
  }, [daftar, tipe, nilai, bulat, timpa, lewatiHpp]);

  const rencanaExcel = useMemo(() => {
    if (!barisFile) return [];
    const perKode = new Map(semua.map((r) => [String(r.kode).toLowerCase(), r]));
    const perBarcode = new Map(semua.filter((r) => r.barcode).map((r) => [String(r.barcode).toLowerCase(), r]));
    const dipakai = new Set();
    return barisFile.map((b) => {
      const r = (b.kode && perKode.get(b.kode.toLowerCase())) || (b.barcode && perBarcode.get(b.barcode.toLowerCase())) || null;
      if (!r) return { id: null, kode: b.kode || b.barcode, nama: "(tidak ditemukan)", jual: 0, lama: null, baru: null, status: "salah", pesan: "Kode/barcode tidak ada di Barang Toko", baris: b.baris };
      const jual = Number(r.harga_jual) || 0;
      const lama = Number(r.harga_grosir) > 0 ? Number(r.harga_grosir) : null;
      const dasar = { id: r.id, kode: r.kode, nama: r.nama, jual, lama, hpp: Number(r.hpp) || 0, baris: b.baris };
      if (dipakai.has(r.id)) return { ...dasar, baru: null, status: "lewati", pesan: "Barang dobel di file" };
      dipakai.add(r.id);
      if (b.grosir === null) return { ...dasar, baru: lama, status: "lewati", pesan: "Harga grosir kosong (tidak diubah)" };
      if (Number.isNaN(b.grosir) || b.grosir < 0) return { ...dasar, baru: null, status: "salah", pesan: "Harga grosir tidak valid" };
      if (b.grosir === 0) {
        if (lama === null) return { ...dasar, baru: null, status: "lewati", pesan: "Memang belum ada" };
        return { ...dasar, baru: null, status: "ok", pesan: "Dikosongkan" };
      }
      const baru = Math.round(b.grosir);
      if (baru >= jual) return { ...dasar, baru, status: "salah", pesan: "Harus lebih kecil dari harga jual" };
      if (baru === lama) return { ...dasar, baru, status: "lewati", pesan: "Sama dengan harga sekarang" };
      return { ...dasar, baru, status: "ok", pesan: "Siap" };
    });
  }, [barisFile, semua]);

  const rencana = mode === "rumus" ? rencanaRumus : rencanaExcel;
  const jumlah = {
    ok: rencana.filter((b) => b.status === "ok").length,
    lewati: rencana.filter((b) => b.status === "lewati").length,
    salah: rencana.filter((b) => b.status === "salah").length,
  };

  // ---------- Excel ----------
  const unduhDaftar = () =>
    downloadXlsx("harga-grosir-barang-toko.xlsx", [
      {
        name: "Harga Grosir",
        columns: [
          { key: "kode", label: "Kode" },
          { key: "nama", label: "Nama" },
          { key: "barcode", label: "Barcode" },
          { key: "jual", label: "Harga Jual" },
          { key: "grosir", label: "Harga Grosir" },
        ],
        rows: daftar.map((r) => ({
          kode: r.kode,
          nama: r.nama,
          barcode: r.barcode || "",
          jual: Number(r.harga_jual) || 0,
          grosir: Number(r.harga_grosir) > 0 ? Number(r.harga_grosir) : "",
        })),
      },
    ]);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBarisFile(null);
    setNamaFile(file.name);
    try {
      const data = await bacaFile(file);
      if (!data.length) throw new Error("File kosong, tidak ada baris barang.");
      setBarisFile(data);
    } catch (err) {
      setError(err.message || "Gagal membaca file");
    }
  };

  // ---------- simpan ----------
  const jalankan = async () => {
    const perlu = rencana.filter((b) => b.status === "ok" && b.id);
    if (!perlu.length) return;
    setError("");
    const out = { diubah: 0, dikosongkan: 0, lewati: jumlah.lewati, salah: jumlah.salah, gagal: [] };
    let selesai = 0;
    let antre = 0;
    setProses(`Menyimpan 0 / ${perlu.length}…`);
    const kerja = async () => {
      while (antre < perlu.length) {
        const b = perlu[antre++];
        try {
          await sb(`master_toko?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ harga_grosir: b.baru }) });
          if (b.baru === null) out.dikosongkan += 1;
          else out.diubah += 1;
        } catch (e) {
          out.gagal.push(`${b.kode} ${b.nama}: ${pesanError(e)}`);
        }
        selesai += 1;
        setProses(`Menyimpan ${selesai} / ${perlu.length}…`);
      }
    };
    await Promise.all([kerja(), kerja(), kerja(), kerja(), kerja()]);
    setProses(null);
    setHasil(out);
  };

  if (hasil) {
    return (
      <Kerangka judul="Hasil atur harga grosir" onClose={() => onSelesai(hasil)}>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-emerald-300"><Check size={15} /> {hasil.diubah} barang harga grosirnya diisi/diubah</div>
          {hasil.dikosongkan > 0 && <div className="text-slate-300">{hasil.dikosongkan} barang harga grosirnya dikosongkan</div>}
          {hasil.lewati > 0 && <div className="text-slate-400">{hasil.lewati} dilewati (tidak ada perubahan)</div>}
          {hasil.salah > 0 && <div className="text-amber-300">{hasil.salah} tidak valid dan tidak diubah</div>}
        </div>
        {hasil.gagal.length > 0 && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">{hasil.gagal.slice(0, 20).map((g, i) => <div key={i}>{g}</div>)}</div>
          </div>
        )}
        <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">
          Selesai
        </button>
      </Kerangka>
    );
  }

  const tab = (k, label) => (
    <button
      type="button"
      onClick={() => !proses && setMode(k)}
      className={`flex-1 text-sm py-2 rounded-lg border ${mode === k ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-slate-700 text-slate-300 hover:border-amber-500/60"}`}
    >
      {label}
    </button>
  );

  return (
    <Kerangka judul="Atur Harga Grosir Massal" onClose={proses ? () => {} : onClose} lebar="sm:max-w-2xl">
      <div className="flex gap-2">
        {tab("rumus", "Pakai rumus")}
        {tab("excel", "Lewat Excel")}
      </div>

      {mode === "rumus" ? (
        <>
          <div className="text-xs text-slate-400 leading-relaxed">
            Berlaku untuk <b className="text-slate-200">{daftar.length.toLocaleString("id-ID")} barang yang sedang tampil</b> di daftar
            {daftar.length !== semua.length ? ` (dari total ${semua.length.toLocaleString("id-ID")})` : ""}. Mau satu kategori saja? Pilih kategorinya dulu di daftar, lalu buka layar ini lagi.
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["persen", "Potong %"], ["nominal", "Potong Rp"], ["kosongkan", "Kosongkan"]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTipe(k)}
                className={`text-sm py-2 rounded-lg border ${tipe === k ? "bg-amber-500/15 text-amber-300 border-amber-500" : "border-slate-700 text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tipe !== "kosongkan" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-slate-400 mb-1">{tipe === "persen" ? "Potongan dari harga jual (%)" : "Potongan dari harga jual (Rp)"}</div>
                  <input value={nilai} onChange={(e) => setNilai(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={tipe === "persen" ? "mis. 15" : "mis. 5000"} className={inp} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Pembulatan</div>
                  <select value={bulat} onChange={(e) => setBulat(Number(e.target.value))} className={inp}>
                    {BULAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={timpa} onChange={(e) => setTimpa(e.target.checked)} />
                Timpa juga barang yang sudah punya harga grosir (kalau tidak, hanya yang masih kosong)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={lewatiHpp} onChange={(e) => setLewatiHpp(e.target.checked)} />
                Lewati barang yang hasilnya di bawah HPP
              </label>
            </>
          )}
        </>
      ) : (
        <>
          <div className="text-xs text-slate-400 leading-relaxed">
            1) Unduh daftar barang yang sedang tampil. 2) Isi kolom <b className="text-slate-200">Harga Grosir</b> di Excel (kosong = tidak diubah, <b className="text-slate-200">0 = hapus harga grosir</b>). 3) Upload lagi. Pencocokan lewat kolom <b className="text-slate-200">Kode</b> (atau Barcode). Jangan ubah kolom Kode.
          </div>
          <div className="flex gap-2">
            <button onClick={unduhDaftar} disabled={!daftar.length} className="flex-1 flex items-center justify-center gap-1.5 border border-slate-700 hover:border-amber-500 disabled:opacity-40 text-slate-200 text-sm font-medium py-2.5 rounded-xl">
              <FileDown size={15} /> Unduh daftar barang ({daftar.length.toLocaleString("id-ID")})
            </button>
            <label className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold py-2.5 rounded-xl cursor-pointer">
              <FileUp size={15} /> Pilih file
              <input type="file" accept=".xlsx,.xls,.csv" onChange={pilihFile} className="hidden" disabled={!!proses} />
            </label>
          </div>
        </>
      )}

      <Galat pesan={error} />

      {rencana.length > 0 && (
        <>
          <div className="text-xs text-slate-400">
            {mode === "excel" && namaFile ? `${namaFile}: ` : ""}
            <span className="text-emerald-300">{jumlah.ok} akan diubah</span>
            {jumlah.lewati > 0 && <span className="text-slate-300"> · {jumlah.lewati} dilewati</span>}
            {jumlah.salah > 0 && <span className="text-amber-300"> · {jumlah.salah} tidak valid</span>}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-500 text-left">
                  <th className="font-medium px-3 py-1.5">Barang</th>
                  <th className="font-medium px-2 py-1.5 text-right">Jual</th>
                  <th className="font-medium px-2 py-1.5 text-right">Grosir lama</th>
                  <th className="font-medium px-2 py-1.5 text-right">Grosir baru</th>
                  <th className="font-medium px-3 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...rencana.filter((b) => b.status !== "lewati"), ...rencana.filter((b) => b.status === "lewati")].slice(0, 200).map((b, i) => (
                  <tr key={`${b.id ?? "x"}-${i}`} className="border-t border-slate-800">
                    <td className="px-3 py-1.5">
                      <div className="truncate max-w-[14rem]">{b.nama}</div>
                      <div className="text-[10px] text-slate-500">{b.kode}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{b.jual > 0 ? fmtRp(b.jual) : "–"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{b.lama ? fmtRp(b.lama) : "–"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{b.baru ? fmtRp(b.baru) : "–"}</td>
                    <td className={`px-3 py-1.5 ${b.status === "ok" ? "text-emerald-300" : b.status === "lewati" ? "text-slate-400" : "text-amber-300"}`}>{b.pesan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rencana.length > 200 && <div className="text-[11px] text-slate-500">Pratinjau 200 baris pertama dari {rencana.length}; semua yang berstatus siap tetap disimpan.</div>}
          <button
            onClick={jalankan}
            disabled={!!proses || jumlah.ok === 0}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl"
          >
            {proses && <Loader2 size={15} className="animate-spin" />}
            {proses || `Simpan ${jumlah.ok} barang`}
          </button>
        </>
      )}
    </Kerangka>
  );
}
