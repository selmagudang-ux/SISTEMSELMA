import { useEffect, useState } from "react";
import { Download, Search, Check, Loader2 } from "lucide-react";
import { EmptyState, InputRupiah, inputClass } from "../../components/ui";
import { fmtRp, downloadCsv } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { hariIniWib, awalBulanWib } from "./kasirLaporan";
import { muatCekHppToko, simpanHppBarangToko, simpanHppManual } from "./kasirCekHpp";

// =========================================================
// CEK HPP TOKO OFFLINE (tab di POS) — barang terjual yang HPP-nya di Barang Toko masih kosong.
// Isi HPP di sini langsung disimpan ke Barang Toko (master_toko.hpp), jadi permanen dan ikut dipakai
// Laporan Kasir & Laba Rugi. Barang "dugaan" = laporan sudah memakai HPP barang mirip; klik
// "Pakai ini" untuk menjadikannya HPP tetap.
// =========================================================

const LABEL = {
  kosong: ["HPP kosong, dihitung Rp 0", "text-amber-400"],
  dugaan: ["HPP kosong, dilengkapi dari barang mirip", "text-sky-400"],
};

export default function CekHppToko({ showToast, onBerubah }) {
  const [dari, setDari] = useState(awalBulanWib(hariIniWib()));
  const [sampai, setSampai] = useState(hariIniWib());
  const [data, setData] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [filter, setFilter] = useState("belum"); // belum | dugaan | semua
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({});
  const [sibuk, setSibuk] = useState({});
  const [versi, setVersi] = useState(0);
  const toast = (pesan, jenis) => (showToast ? showToast(pesan, jenis) : jenis === "err" && setGalat(pesan));

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");
    muatCekHppToko({ session: getSession(), dari, sampai })
      .then((r) => !batal && setData(r))
      .catch((e) => !batal && setGalat(e?.message || "Gagal memuat data"))
      .finally(() => !batal && setMemuat(false));
    return () => {
      batal = true;
    };
  }, [dari, sampai, versi]);

  const kosong = data.filter((m) => m.status === "kosong");
  const dugaan = data.filter((m) => m.status === "dugaan");
  const tampil = (filter === "belum" ? kosong : filter === "dugaan" ? dugaan : data).filter((m) => {
    const t = q.trim().toLowerCase();
    return !t || m.nama.toLowerCase().includes(t) || m.kode.toLowerCase().includes(t) || m.sku.toLowerCase().includes(t);
  });

  const simpan = async (m, nilaiLangsung) => {
    const nilai = Number(nilaiLangsung ?? draft[m.kunci]);
    if (!(nilai > 0)) return toast("Isi HPP lebih dari 0", "err");
    setSibuk((x) => ({ ...x, [m.kunci]: true }));
    try {
      if (m.manual) await simpanHppManual(m.kode, m.nama, nilai);
      else await simpanHppBarangToko(m.kode, nilai);
      // sudah terisi di Barang Toko -> keluar dari daftar
      setData((d) => d.filter((x) => x.kunci !== m.kunci));
      setDraft((x) => {
        const baru = { ...x };
        delete baru[m.kunci];
        return baru;
      });
      toast(`HPP ${m.nama} tersimpan: ${fmtRp(nilai)}`);
      onBerubah?.();
    } catch (e) {
      toast(e?.message || "Gagal menyimpan HPP", "err");
    } finally {
      setSibuk((x) => ({ ...x, [m.kunci]: false }));
    }
  };

  const unduh = () =>
    downloadCsv(
      `cek-hpp-toko-${dari}-${sampai}.csv`,
      [
        { key: "masalah", label: "Masalah" },
        { key: "kode", label: "Kode Toko" },
        { key: "sku", label: "SKU Gudang" },
        { key: "nama", label: "Nama" },
        { key: "qty", label: "Total Qty" },
        { key: "hppDugaan", label: "HPP Dilengkapi Otomatis" },
      ],
      tampil.map((m) => ({ ...m, masalah: LABEL[m.status][0] }))
    );

  return (
    <div>
      <div className="mb-3 text-xs text-md-on-surface-variant">
        Barang terjual yang HPP-nya masih kosong (Barang Toko dan produk manual). HPP yang diisi di sini langsung tersimpan dan dipakai Laporan Kasir &amp; Laba Rugi.
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[11px] text-slate-400">
          Dari
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputClass} block mt-1`} />
        </label>
        <label className="text-[11px] text-slate-400">
          Sampai
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputClass} block mt-1`} />
        </label>
        <div className="flex gap-1">
          {[
            ["belum", `HPP kosong (${kosong.length})`],
            ["dugaan", `Dilengkapi otomatis (${dugaan.length})`],
            ["semua", "Semua"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border ${filter === k ? "bg-amber-500/10 border-amber-500/40 text-amber-300" : "border-slate-800 text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode / SKU…" className={`${inputClass} pl-9 w-full`} />
        </div>
        <button onClick={() => setVersi((v) => v + 1)} disabled={memuat} className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:text-slate-100 disabled:opacity-40">
          Muat ulang
        </button>
        <button onClick={unduh} disabled={tampil.length === 0} className="flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40">
          <Download size={14} /> Unduh CSV
        </button>
      </div>

      {galat && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/5 border border-red-500/20">{galat}</div>}
      {memuat ? (
        <div className="py-10 text-center text-xs text-slate-500">Memuat dan mencocokkan barang…</div>
      ) : tampil.length === 0 ? (
        <EmptyState label={filter === "belum" ? "Tidak ada barang terjual yang HPP-nya kosong pada rentang ini." : "Tidak ada barang."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 font-medium">Barang</th>
                <th className="px-3 py-2 font-medium">Masalah</th>
                <th className="px-3 py-2 font-medium text-right">Qty terjual</th>
                <th className="px-3 py-2 font-medium w-72">HPP per pcs</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((m) => {
                const loading = !!sibuk[m.kunci];
                const nilaiInput = draft[m.kunci] ?? "";
                const [teks, warna] = LABEL[m.status];
                return (
                  <tr key={m.kunci} className="border-b border-slate-800/60 align-top">
                    <td className="px-3 py-2">
                      <div className="text-slate-200">{m.nama}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                        {m.kode}
                        {m.sku && m.sku !== m.kode ? ` · ${m.sku}` : ""}
                        {m.manual ? " · produk manual" : ""}
                      </div>
                    </td>
                    <td className={`px-3 py-2 text-[12px] ${warna}`}>{teks}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{m.qty}</td>
                    <td className="px-3 py-2">
                      {m.bisaIsi ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <InputRupiah value={nilaiInput} onChange={(v) => setDraft((x) => ({ ...x, [m.kunci]: v }))} placeholder="HPP per pcs" className={`${inputClass} w-28`} />
                            <button
                              onClick={() => simpan(m)}
                              disabled={loading || nilaiInput === ""}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                            >
                              {loading ? <Loader2 size={14} className="animate-spin" /> : "Simpan"}
                            </button>
                          </div>
                          {m.status === "dugaan" && (
                            <button onClick={() => simpan(m, m.hppDugaan)} disabled={loading} className="mt-1.5 flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 disabled:opacity-40">
                              <Check size={12} /> Pakai ini: {fmtRp(m.hppDugaan)}/pcs
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          Dijual langsung dari Master Barang. Isi HPP-nya di Master Barang.
                          {m.status === "dugaan" && <div className="text-sky-400">Dipakai di laporan: {fmtRp(m.hppDugaan)}/pcs</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
