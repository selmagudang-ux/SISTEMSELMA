import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, FileDown, Radio } from "lucide-react";
import { sbAll } from "../../lib/api";
import { downloadXlsx } from "../../lib/exportData";
import { kodeLiveBarang } from "../../lib/resiOrderan";
import { Kerangka, Galat, inp } from "./BarangToko";

// =========================================================
// BARANG KELUAR (SCAN RESI) — laporan di halaman Barang TikTok.
// Barang yang keluar = barang di orderan (resi_barang) dari resi yang SUDAH DI-SCAN (resi_scan) pada rentang tanggal.
//  - Dikelompokkan per KODE LIVE + UKURAN (sama dengan identitas barang di Barang TikTok). TIDAK dipetakan ke
//    Master Barang maupun Barang Toko.
//  - Resi yang ada di daftar cancel (resi_cancel) TIDAK dihitung sebagai barang keluar (dihitung terpisah).
//  - Resi yang di-scan tapi tidak ada di orderan (belum di-import) tidak punya data barang -> dihitung terpisah.
//  - Nama, foto, dan stok sekarang diambil dari master_tiktok kalau kode live + ukurannya cocok.
// Hanya membaca data (tidak mengubah stok maupun scan).
// =========================================================

const hariIni = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const angka = (n) => (Number(n) || 0).toLocaleString("id-ID");
const potong = (arr, n) => {
  const h = [];
  for (let i = 0; i < arr.length; i += n) h.push(arr.slice(i, i + n));
  return h;
};
// Sama dengan rapikanUkuran di BarangTiktok.jsx / ttscan_ukuran_dari_variasi di database.
const rapikanUkuran = (v) =>
  String(v ?? "").toUpperCase().trim().replace(/^(SIZE|UKURAN)\s*[:\-]?\s*/, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();
// "CI-72, 7" -> ukuran "7" (semua setelah koma pertama). Tanpa koma = tanpa ukuran.
const ukuranDariVariasi = (variasi) => {
  const s = String(variasi ?? "");
  const i = s.indexOf(",");
  return i < 0 ? "" : rapikanUkuran(s.slice(i + 1));
};

function Kode({ live, ukuran }) {
  if (!live) return <span className="text-[11px] text-slate-500">tanpa kode live</span>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-1.5 py-0.5">
        <Radio size={11} /> {live}
      </span>
      {ukuran ? <span className="text-[11px] font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded-md px-1.5 py-0.5">{ukuran}</span> : null}
    </span>
  );
}

export default function BarangKeluarScan({ onClose }) {
  const [dari, setDari] = useState(hariIni());
  const [sampai, setSampai] = useState(hariIni());
  const [data, setData] = useState(null); // null = memuat
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!dari || !sampai) return undefined;
    if (dari > sampai) {
      setData({ baris: [], resi: 0, resiCancel: 0, resiTanpaOrderan: 0, pcs: 0 });
      setError("Tanggal awal tidak boleh setelah tanggal akhir.");
      return undefined;
    }
    let batal = false;
    setData(null);
    setError("");
    (async () => {
      try {
        const scans = (await sbAll(`resi_scan?select=resi,tanggal&tanggal=gte.${dari}&tanggal=lte.${sampai}&order=tanggal`)) || [];
        const resiScan = [...new Set(scans.map((s) => s.resi))];

        // Resi cancel & orderan dimuat per potongan supaya URL tidak kepanjangan.
        const cancel = new Set();
        const orderan = new Map();
        const potongan = potong(resiScan, 100);
        for (const p of potongan) {
          const daftar = p.map(encodeURIComponent).join(",");
          const [c, o] = await Promise.all([
            sbAll(`resi_cancel?select=resi&resi=in.(${daftar})`).catch(() => []),
            sbAll(`resi_barang?select=resi,barang&resi=in.(${daftar})`).catch(() => []),
          ]);
          (c || []).forEach((x) => cancel.add(x.resi));
          (o || []).forEach((x) => orderan.set(x.resi, x.barang || []));
          if (batal) return;
        }
        const master = (await sbAll("master_tiktok?select=kode,nama,kode_live,ukuran,foto_url,stok,komponen").catch(() => [])) || [];
        if (batal) return;

        const petaMaster = new Map();
        master.forEach((m) => {
          if (m.kode_live) petaMaster.set(`${String(m.kode_live).toUpperCase()}|${rapikanUkuran(m.ukuran)}`, m);
        });

        const peta = new Map();
        let resiCancel = 0;
        let resiTanpaOrderan = 0;
        let resiHitung = 0;
        resiScan.forEach((resi) => {
          if (cancel.has(resi)) {
            resiCancel += 1;
            return;
          }
          const barang = orderan.get(resi);
          if (!barang) {
            resiTanpaOrderan += 1;
            return;
          }
          resiHitung += 1;
          barang.forEach((b) => {
            const live = kodeLiveBarang(b);
            const ukuran = live ? ukuranDariVariasi(b.variasi) : "";
            const kunci = live ? `${live}|${ukuran}` : `?|${b.sku || ""}|${b.nama || ""}|${b.variasi || ""}`;
            const x = peta.get(kunci) || { kunci, live, ukuran, namaOrderan: b.nama || b.sku || b.variasi || "", pcs: 0, resi: new Set() };
            x.pcs += Number(b.qty) || 1;
            x.resi.add(resi);
            peta.set(kunci, x);
          });
        });

        const baris = [...peta.values()]
          .map((x) => {
            const m = x.live ? petaMaster.get(`${x.live.toUpperCase()}|${x.ukuran}`) : null;
            return {
              kunci: x.kunci,
              live: x.live,
              ukuran: x.ukuran,
              nama: m?.nama || x.namaOrderan,
              ada: !!m,
              stok: m && !m.komponen ? Number(m.stok) || 0 : null,
              pcs: x.pcs,
              resi: x.resi.size,
            };
          })
          .sort((a, b) => b.pcs - a.pcs || String(a.live).localeCompare(String(b.live), "id", { numeric: true }));

        setData({ baris, resi: resiHitung, resiCancel, resiTanpaOrderan, pcs: baris.reduce((n, r) => n + r.pcs, 0) });
      } catch (e) {
        if (batal) return;
        setError(`Gagal memuat laporan: ${e?.message || e}`);
        setData({ baris: [], resi: 0, resiCancel: 0, resiTanpaOrderan: 0, pcs: 0 });
      }
    })();
    return () => {
      batal = true;
    };
  }, [dari, sampai]);

  const tampil = useMemo(() => {
    const kata = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return data?.baris || [];
    return (data?.baris || []).filter((r) => {
      const j = `${r.live} ${r.ukuran} ${r.nama}`.toLowerCase();
      return kata.every((k) => j.includes(k));
    });
  }, [data, q]);

  const unduh = async () => {
    if (!data?.baris.length) return;
    const periode = dari === sampai ? dari : `${dari}_sd_${sampai}`;
    await downloadXlsx(`barang-keluar-scan-tiktok-${periode}.xlsx`, [
      {
        name: "Barang Keluar",
        columns: [
          { key: "live", label: "Kode Live" },
          { key: "ukuran", label: "Ukuran" },
          { key: "nama", label: "Barang" },
          { key: "pcs", label: "Jumlah Keluar (pcs)" },
          { key: "resi", label: "Jumlah Resi" },
          { key: "stok", label: "Stok TikTok Sekarang" },
        ],
        rows: data.baris.map((r) => ({ live: r.live || "(tanpa kode live)", ukuran: r.ukuran, nama: r.nama, pcs: r.pcs, resi: r.resi, stok: r.stok })),
      },
    ]);
  };

  return (
    <Kerangka judul="Barang keluar (hasil scan resi)" onClose={onClose} lebar="sm:max-w-3xl">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <div className="text-[11px] text-slate-500 mb-1">Dari tanggal</div>
          <input type="date" value={dari} onChange={(e) => e.target.value && setDari(e.target.value)} className={`${inp} !w-40`} />
        </label>
        <label className="block">
          <div className="text-[11px] text-slate-500 mb-1">Sampai tanggal</div>
          <input type="date" value={sampai} onChange={(e) => e.target.value && setSampai(e.target.value)} className={`${inp} !w-40`} />
        </label>
        <button
          type="button"
          onClick={unduh}
          disabled={!data || data.baris.length === 0}
          className="ml-auto flex items-center gap-1.5 border border-amber-500/60 hover:bg-amber-500/10 disabled:opacity-40 text-amber-300 font-semibold text-xs px-3 py-2 rounded-lg"
        >
          <FileDown size={14} /> Unduh Excel
        </button>
      </div>

      <Galat pesan={error} />

      {data === null ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 size={16} className="animate-spin" /> Memuat…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Total keluar</div>
              <div className="font-semibold text-amber-400 tabular-nums">{angka(data.pcs)} pcs</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Resi dihitung</div>
              <div className="font-semibold tabular-nums">{angka(data.resi)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Jenis barang</div>
              <div className="font-semibold tabular-nums">{angka(data.baris.length)}</div>
            </div>
          </div>
          {(data.resiCancel > 0 || data.resiTanpaOrderan > 0) && (
            <div className="text-[11px] text-slate-400 leading-snug space-y-0.5">
              {data.resiCancel > 0 && <div>{angka(data.resiCancel)} resi cancel (terlanjur di-scan) tidak dihitung.</div>}
              {data.resiTanpaOrderan > 0 && <div className="text-amber-300">{angka(data.resiTanpaOrderan)} resi di-scan tapi tidak ada di orderan (belum di-import), jadi barangnya tidak diketahui.</div>}
            </div>
          )}

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode live atau nama barang…" className={`${inp} pl-9`} />
          </div>

          {tampil.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">{data.baris.length === 0 ? "Tidak ada barang keluar dari scan pada tanggal ini." : "Tidak ada yang cocok."}</div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-slate-500 text-left">
                    <th className="font-medium px-3 py-2">Kode live</th>
                    <th className="font-medium px-2 py-2">Barang</th>
                    <th className="font-medium px-2 py-2 text-right">Keluar</th>
                    <th className="font-medium px-2 py-2 text-right">Resi</th>
                    <th className="font-medium px-3 py-2 text-right">Stok TikTok</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((r) => (
                    <tr key={r.kunci} className="border-t border-slate-800">
                      <td className="px-3 py-1.5 whitespace-nowrap"><Kode live={r.live} ukuran={r.ukuran} /></td>
                      <td className="px-2 py-1.5 text-slate-300 max-w-[16rem] truncate" title={r.nama}>
                        {r.nama}
                        {r.live && !r.ada ? <span className="ml-1.5 text-[10px] text-slate-500">· belum ada di Barang TikTok</span> : null}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-amber-400 tabular-nums">{angka(r.pcs)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400 tabular-nums">{angka(r.resi)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{r.stok === null ? "–" : angka(r.stok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Kerangka>
  );
}
