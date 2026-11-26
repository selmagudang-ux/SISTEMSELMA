import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search, Loader2 } from "lucide-react";
import { EmptyState, btnOutlined, inputClass } from "../components/ui";
import { sbAll } from "../lib/api";
import { downloadXlsx } from "../lib/exportData";
import { kodeLiveBarang } from "../lib/resiOrderan";

// =========================================================
// REKAP BARANG KELUAR — bagian di halaman Scan Resi > Rekap Scan Resi.
// Barang yang keluar = barang di orderan (tabel resi_barang) dari resi yang SUDAH DI-SCAN pada rentang tanggal rekap.
//  - Dikelompokkan per KODE LIVE + UKURAN (identitas barang di Barang TikTok). Tidak dipetakan ke Master Barang / Barang Toko.
//  - Resi cancel tidak dihitung sebagai barang keluar (jumlahnya ditampilkan terpisah).
//  - Resi yang di-scan tapi tidak ada di orderan (belum di-import) tidak punya data barang -> dihitung terpisah.
//  - Nama & stok sekarang dibaca dari master_tiktok kalau kode live + ukurannya cocok (hanya baca, tidak mengubah apa pun).
// Orderan diambil per resi yang ada di rekap (bukan jendela 7 hari), disimpan sementara supaya tidak diunduh ulang.
// =========================================================

const angka = (n) => (Number(n) || 0).toLocaleString("id-ID");
const potong = (arr, n) => {
  const h = [];
  for (let i = 0; i < arr.length; i += n) h.push(arr.slice(i, i + n));
  return h;
};
// Sama dengan rapikanUkuran di kasir/BarangTiktok.jsx (ttscan_ukuran_dari_variasi di database).
const rapikanUkuran = (v) =>
  String(v ?? "").toUpperCase().trim().replace(/^(SIZE|UKURAN)\s*[:\-]?\s*/, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();
// "CI-72, 7" -> ukuran "7" (semua setelah koma pertama). Tanpa koma = tanpa ukuran.
const ukuranDariVariasi = (variasi) => {
  const s = String(variasi ?? "");
  const i = s.indexOf(",");
  return i < 0 ? "" : rapikanUkuran(s.slice(i + 1));
};

export default function RekapBarangScan({ rows, dari, sampai }) {
  const cache = useRef(new Map()); // resi -> daftar barang orderan, atau null kalau tidak ada di orderan
  const [versi, setVersi] = useState(0);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [master, setMaster] = useState([]);
  const [q, setQ] = useState("");

  // Resi valid (bukan cancel) di rekap.
  const resiValid = useMemo(() => [...new Set(rows.filter((r) => !r.cancel).map((r) => r.resi))], [rows]);
  const resiCancel = useMemo(() => new Set(rows.filter((r) => r.cancel).map((r) => r.resi)).size, [rows]);

  useEffect(() => {
    sbAll("master_tiktok?select=nama,kode_live,ukuran,stok,komponen")
      .then((m) => setMaster(m || []))
      .catch(() => setMaster([])); // tabel belum ada / tidak ada izin: laporan tetap jalan tanpa nama & stok
  }, []);

  useEffect(() => {
    const perlu = resiValid.filter((r) => !cache.current.has(r));
    if (!perlu.length) return undefined;
    let batal = false;
    setMemuat(true);
    setGalat("");
    (async () => {
      try {
        for (const p of potong(perlu, 100)) {
          const res = (await sbAll(`resi_barang?select=resi,barang&resi=in.(${p.map(encodeURIComponent).join(",")})`)) || [];
          if (batal) return;
          const ada = new Map(res.map((x) => [x.resi, x.barang || []]));
          p.forEach((r) => cache.current.set(r, ada.get(r) || null));
        }
        if (!batal) setVersi((v) => v + 1);
      } catch (e) {
        if (!batal) setGalat(`Gagal memuat orderan: ${e?.message || e}`);
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [resiValid]);

  const data = useMemo(() => {
    const petaMaster = new Map();
    master.forEach((m) => {
      if (m.kode_live) petaMaster.set(`${String(m.kode_live).toUpperCase()}|${rapikanUkuran(m.ukuran)}`, m);
    });
    const peta = new Map();
    let tanpaOrderan = 0;
    let resiHitung = 0;
    resiValid.forEach((resi) => {
      if (!cache.current.has(resi)) return; // belum selesai dimuat
      const barang = cache.current.get(resi);
      if (!barang) {
        tanpaOrderan += 1;
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
          kunci: x.kunci, live: x.live, ukuran: x.ukuran,
          nama: m?.nama || x.namaOrderan, ada: !!m,
          stok: m && !m.komponen ? Number(m.stok) || 0 : null,
          pcs: x.pcs, resi: x.resi.size,
        };
      })
      .sort((a, b) => b.pcs - a.pcs || String(a.live).localeCompare(String(b.live), "id", { numeric: true }));
    return { baris, tanpaOrderan, resiHitung, pcs: baris.reduce((n, r) => n + r.pcs, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resiValid, master, versi]);

  const tampil = useMemo(() => {
    const kata = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return data.baris;
    return data.baris.filter((r) => {
      const j = `${r.live} ${r.ukuran} ${r.nama}`.toLowerCase();
      return kata.every((k) => j.includes(k));
    });
  }, [data, q]);

  const unduh = async () => {
    if (!data.baris.length) return;
    await downloadXlsx(`rekap-barang-keluar-scan-${dari}_sd_${sampai}.xlsx`, [
      {
        name: "Barang Keluar",
        columns: [
          { key: "live", label: "Kode Live" }, { key: "ukuran", label: "Ukuran" }, { key: "nama", label: "Barang" },
          { key: "pcs", label: "Jumlah Keluar (pcs)" }, { key: "resi", label: "Jumlah Resi" }, { key: "stok", label: "Stok TikTok Sekarang" },
        ],
        rows: data.baris.map((r) => ({ live: r.live || "(tanpa kode live)", ukuran: r.ukuran, nama: r.nama, pcs: r.pcs, resi: r.resi, stok: r.stok })),
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-md-on-surface">Rekap barang keluar</div>
          <div className="text-xs text-md-on-surface-variant">
            Barang di orderan dari resi valid yang sudah di-scan, per kode live + ukuran · {angka(data.pcs)} pcs · {angka(data.baris.length)} jenis · {angka(data.resiHitung)} resi
          </div>
        </div>
        <button type="button" onClick={unduh} disabled={!data.baris.length} className={btnOutlined}>
          <Download size={14} /> Export Excel
        </button>
      </div>

      {galat && <div className="text-xs text-red-400">{galat}</div>}
      {memuat && (
        <div className="flex items-center gap-2 text-xs text-md-on-surface-variant">
          <Loader2 size={13} className="animate-spin" /> Memuat barang dari orderan…
        </div>
      )}
      {(resiCancel > 0 || data.tanpaOrderan > 0) && !memuat && (
        <div className="text-xs text-md-on-surface-variant space-y-0.5">
          {resiCancel > 0 && <div>{angka(resiCancel)} resi cancel tidak dihitung.</div>}
          {data.tanpaOrderan > 0 && (
            <div className="text-amber-300">{angka(data.tanpaOrderan)} resi di-scan tapi tidak ada di orderan (belum di-import), jadi barangnya tidak diketahui.</div>
          )}
        </div>
      )}

      {data.baris.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode live atau nama barang…" className={`${inputClass} pl-9`} />
        </div>
      )}

      {!data.baris.length ? (
        memuat ? null : <EmptyState label="Belum ada barang keluar dari scan pada rentang ini (orderan belum di-import, atau belum ada resi valid)." />
      ) : tampil.length === 0 ? (
        <div className="text-sm text-md-on-surface-variant py-4 text-center">Tidak ada yang cocok.</div>
      ) : (
        <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-md-on-surface-variant text-left">
                <th className="px-4 py-3 font-medium">Kode live</th>
                <th className="px-4 py-3 font-medium">Ukuran</th>
                <th className="px-4 py-3 font-medium">Barang</th>
                <th className="px-4 py-3 font-medium text-right">Keluar (pcs)</th>
                <th className="px-4 py-3 font-medium text-right">Resi</th>
                <th className="px-4 py-3 font-medium text-right">Stok TikTok</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((r) => (
                <tr key={r.kunci} className="border-t border-md-outline-variant">
                  <td className="px-4 py-2.5 font-mono text-md-on-surface whitespace-nowrap">{r.live || <span className="text-xs text-md-on-surface-variant font-sans">tanpa kode live</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-md-on-surface-variant">{r.ukuran || "–"}</td>
                  <td className="px-4 py-2.5 text-md-on-surface-variant max-w-[320px] truncate" title={r.nama}>
                    {r.nama}
                    {r.live && !r.ada ? <span className="ml-1.5 text-[11px]">· belum ada di Barang TikTok</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-300 tabular-nums">{angka(r.pcs)}</td>
                  <td className="px-4 py-2.5 text-right text-md-on-surface-variant tabular-nums">{angka(r.resi)}</td>
                  <td className="px-4 py-2.5 text-right text-md-on-surface tabular-nums">{r.stok === null ? "–" : angka(r.stok)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-md-outline-variant font-semibold">
                <td className="px-4 py-2.5 text-md-on-surface" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums">{angka(data.pcs)}</td>
                <td className="px-4 py-2.5" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
