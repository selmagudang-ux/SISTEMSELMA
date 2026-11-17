import { useEffect, useMemo, useState } from "react";
import { FileDown, FileUp, Loader2, Trash2, Check, AlertTriangle } from "lucide-react";
import { EmptyState, Badge, formatTanggalID, inputClass } from "../../components/ui";
import { fmtRp } from "../../lib/api";
import { downloadXlsx } from "../../lib/exportData";
import { hariIniWib, awalBulanWib } from "./kasirLaporan";
import {
  bacaFilePenjualanLama, periksaFile, simpanPenjualanLama, muatBatchLama, hapusBatchLama, muatPenjualanLama, TABEL_LAMA,
} from "./penjualanLama";

// =========================================================
// PENJUALAN LAMA (tab di POS Toko Offline) — impor penjualan toko offline SEBELUM kasir dipakai,
// per barang (tanggal, SKU, qty, harga). Omzetnya sudah ada di Keuangan lewat Input Harian, jadi
// impor ini TIDAK menulis ke Keuangan dan TIDAK mengubah stok. Dipakai untuk rincian barang terjual
// dan HPP / laba periode lama (ikut masuk HPP Laba Rugi).
// =========================================================

const STATUS = {
  ok: ["Diimpor", "emerald"],
  salah: ["Tidak valid", "red"],
  kasir: ["Sudah ada data kasir", "amber"],
  dobel: ["Sudah pernah diimpor", "slate"],
};
const HPP_TEKS = { cocok: "", ambigu: "HPP ambigu", tidakKetemu: "SKU tidak ketemu di Master", tanpaHpp: "HPP Master kosong" };

const pesanTabel = (e) => {
  const t = String(e?.message || e || "");
  return t.includes(TABEL_LAMA) || /does not exist|relation/i.test(t)
    ? `Tabel ${TABEL_LAMA} belum ada. Jalankan dulu SQL supabase/migrations/20261117_toko_penjualan_lama.sql di Supabase.`
    : t || "Terjadi kesalahan";
};

export default function PenjualanLama({ showToast, onBerubah }) {
  const toast = (p, j) => showToast?.(p, j);
  const [baris, setBaris] = useState(null);
  const [namaFile, setNamaFile] = useState("");
  const [galat, setGalat] = useState("");
  const [membaca, setMembaca] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const [batch, setBatch] = useState([]);
  const [muatBatch, setMuatBatch] = useState(false);
  const [versi, setVersi] = useState(0);

  const [dari, setDari] = useState(awalBulanWib(hariIniWib()).slice(0, 4) + "-01-01");
  const [sampai, setSampai] = useState(hariIniWib());
  const [ringkas, setRingkas] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galatRingkas, setGalatRingkas] = useState("");

  useEffect(() => {
    let batal = false;
    setMuatBatch(true);
    muatBatchLama()
      .then((r) => !batal && setBatch(r))
      .catch((e) => !batal && setGalat(pesanTabel(e)))
      .finally(() => !batal && setMuatBatch(false));
    return () => {
      batal = true;
    };
  }, [versi]);

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalatRingkas("");
    muatPenjualanLama(dari, sampai)
      .then((r) => !batal && setRingkas(r))
      .catch((e) => !batal && (setRingkas(null), setGalatRingkas(pesanTabel(e))))
      .finally(() => !batal && setMemuat(false));
    return () => {
      batal = true;
    };
  }, [dari, sampai, versi]);

  const unduhTemplate = () =>
    downloadXlsx("template-penjualan-toko-lama.xlsx", [
      {
        name: "Penjualan Lama",
        columns: [
          { key: "tanggal", label: "Tanggal" },
          { key: "sku", label: "SKU" },
          { key: "nama", label: "Nama (opsional)" },
          { key: "qty", label: "Qty" },
          { key: "harga", label: "Harga" },
        ],
        rows: [
          { tanggal: "2026-10-05", sku: "TDGL-GSR-20-PER-P18CM", nama: "Gelang", qty: 2, harga: 39000 },
          { tanggal: "2026-10-05", sku: "TDGL-GJR-92-PER-P20CM", nama: "Cincin", qty: 1, harga: 35000 },
        ],
      },
    ]);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGalat("");
    setBaris(null);
    setNamaFile(file.name);
    setMembaca(true);
    try {
      const data = await bacaFilePenjualanLama(file);
      if (!data.length) throw new Error("File kosong, tidak ada baris penjualan.");
      setBaris(await periksaFile(data));
    } catch (err) {
      setGalat(pesanTabel(err));
    } finally {
      setMembaca(false);
    }
  };

  const hitung = useMemo(() => {
    if (!baris) return null;
    const j = { ok: 0, salah: 0, kasir: 0, dobel: 0, qty: 0, nilai: 0, tanpaHpp: 0 };
    for (const b of baris) {
      j[b.status] += 1;
      if (b.status === "ok") {
        j.qty += b.qty;
        j.nilai += b.qty * b.harga;
        if (b.hppStatus !== "cocok") j.tanpaHpp += 1;
      }
    }
    return j;
  }, [baris]);

  const simpan = async () => {
    const ok = baris.filter((b) => b.status === "ok");
    if (!ok.length) return;
    setMenyimpan(true);
    setGalat("");
    try {
      const r = await simpanPenjualanLama(ok);
      toast(`${r.jumlah} baris penjualan lama tersimpan`);
      setBaris(null);
      setNamaFile("");
      setVersi((v) => v + 1);
      onBerubah?.();
    } catch (err) {
      setGalat(pesanTabel(err));
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (b) => {
    if (!window.confirm(`Hapus impor ${b.batch} (${b.baris} baris, ${formatTanggalID(b.dari)} s/d ${formatTanggalID(b.sampai)})? Omzet di Keuangan tidak berubah.`)) return;
    try {
      await hapusBatchLama(b.batch);
      toast("Impor dihapus");
      setVersi((v) => v + 1);
      onBerubah?.();
    } catch (err) {
      toast(pesanTabel(err), "err");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-xs text-md-on-surface-variant leading-relaxed">
        Impor penjualan toko offline <b>sebelum kasir dipakai</b>, per barang. Omzetnya sudah ada di Keuangan lewat Input Harian, jadi impor ini <b>tidak menambah omzet</b>,
        tidak mengubah stok, dan tidak menulis ke Keuangan. Gunanya untuk rincian barang terjual serta HPP dan laba periode lama (ikut masuk HPP Laba Rugi).
        Kolom file: <b>Tanggal, SKU, Qty, Harga</b> (Nama opsional). Baris bertanggal sama atau sesudah transaksi kasir pertama dilewati, dan baris yang persis sama dengan yang sudah pernah diimpor juga dilewati.
      </div>

      <section>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={unduhTemplate} className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-xl">
            <FileDown size={15} /> Unduh template
          </button>
          <label className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer">
            {membaca ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Pilih file
            <input type="file" accept=".xlsx,.xls,.csv" onChange={pilihFile} className="hidden" disabled={membaca || menyimpan} />
          </label>
          {namaFile && <span className="self-center text-xs text-slate-400">{namaFile}</span>}
        </div>

        {galat && <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 border border-red-500/20"><AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{galat}</div>}

        {baris && hitung && (
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs">
              <span className="text-emerald-300">{hitung.ok} baris siap diimpor ({hitung.qty} pcs, {fmtRp(hitung.nilai)})</span>
              {hitung.dobel > 0 && <span className="text-slate-400">{hitung.dobel} sudah pernah diimpor</span>}
              {hitung.kasir > 0 && <span className="text-amber-300">{hitung.kasir} sudah ada data kasir</span>}
              {hitung.salah > 0 && <span className="text-red-400">{hitung.salah} tidak valid</span>}
              {hitung.tanpaHpp > 0 && <span className="text-sky-400">{hitung.tanpaHpp} baris HPP-nya belum ketemu di Master (dihitung Rp 0)</span>}
            </div>
            <div className="rounded-xl border border-slate-800 overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-950">
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2 font-medium">Baris</th>
                    <th className="px-3 py-2 font-medium">Tanggal</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Harga</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.slice(0, 300).map((b) => {
                    const [teks, warna] = STATUS[b.status];
                    return (
                      <tr key={b.baris} className="border-b border-slate-800/60">
                        <td className="px-3 py-1.5 text-slate-500">{b.baris}</td>
                        <td className="px-3 py-1.5 text-slate-300">{b.tanggal ? formatTanggalID(b.tanggal) : b.tanggalMentah || "-"}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-200">{b.sku || "-"}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">{Number.isFinite(b.qty) ? b.qty : "-"}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">{Number.isFinite(b.harga) ? fmtRp(b.harga) : "-"}</td>
                        <td className="px-3 py-1.5 text-[12px]">
                          <Badge color={warna}>{teks}</Badge>
                          {(b.pesan && b.status === "salah") && <span className="ml-2 text-red-400">{b.pesan}</span>}
                          {b.status === "ok" && HPP_TEKS[b.hppStatus] && <span className="ml-2 text-sky-400">{HPP_TEKS[b.hppStatus]}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {baris.length > 300 && <div className="mt-1 text-[11px] text-slate-500">Menampilkan 300 baris pertama dari {baris.length}. Semua baris tetap diperiksa dan diimpor.</div>}
            <button
              onClick={simpan}
              disabled={menyimpan || hitung.ok === 0}
              className="mt-3 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm px-5 py-2.5 rounded-xl"
            >
              {menyimpan ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Impor {hitung.ok} baris
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="text-sm font-semibold text-slate-200 mb-2">Riwayat impor</div>
        {muatBatch ? (
          <div className="py-4 text-xs text-slate-500">Memuat…</div>
        ) : batch.length === 0 ? (
          <EmptyState label="Belum ada penjualan lama yang diimpor." />
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                  <th className="px-3 py-2 font-medium">Impor</th>
                  <th className="px-3 py-2 font-medium">Periode</th>
                  <th className="px-3 py-2 font-medium text-right">Baris</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Nilai</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {batch.map((b) => (
                  <tr key={b.batch} className="border-b border-slate-800/60">
                    <td className="px-3 py-2 font-mono text-[12px] text-slate-300">{b.batch}</td>
                    <td className="px-3 py-2 text-slate-300">{formatTanggalID(b.dari)} s/d {formatTanggalID(b.sampai)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{b.baris}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{b.qty}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{fmtRp(b.nilai)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => hapus(b)} title="Hapus impor ini" className="p-1.5 text-slate-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end gap-3 mb-2">
          <div className="text-sm font-semibold text-slate-200 mr-2">Ringkasan per barang</div>
          <label className="text-[11px] text-slate-400">
            Dari
            <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputClass} block mt-1`} />
          </label>
          <label className="text-[11px] text-slate-400">
            Sampai
            <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputClass} block mt-1`} />
          </label>
        </div>
        {galatRingkas && <div className="mb-2 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 border border-red-500/20">{galatRingkas}</div>}
        {memuat ? (
          <div className="py-4 text-xs text-slate-500">Memuat…</div>
        ) : !ringkas || ringkas.daftar.length === 0 ? (
          <EmptyState label="Tidak ada penjualan lama pada rentang ini." />
        ) : (
          <>
            <div className="mb-2 text-xs text-slate-400">
              {ringkas.total.qty} pcs · penjualan {fmtRp(ringkas.total.nilai)} · HPP {fmtRp(ringkas.total.hpp)} · laba kotor {fmtRp(ringkas.total.laba)}
              {ringkas.total.tanpaHpp > 0 && <span className="text-amber-300"> · {ringkas.total.tanpaHpp} barang belum punya HPP (dihitung Rp 0)</span>}
            </div>
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Penjualan</th>
                    <th className="px-3 py-2 font-medium text-right">HPP</th>
                    <th className="px-3 py-2 font-medium text-right">Laba</th>
                  </tr>
                </thead>
                <tbody>
                  {ringkas.daftar.map((p) => (
                    <tr key={p.sku} className="border-b border-slate-800/60">
                      <td className="px-3 py-1.5 font-mono text-slate-200">
                        {p.sku}
                        {p.tanpaHpp && <span className="ml-2"><Badge color="amber">HPP kosong</Badge></span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{p.qty}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{fmtRp(p.nilai)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{fmtRp(p.hpp)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{fmtRp(p.laba)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
