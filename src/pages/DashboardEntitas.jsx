import { useEffect, useState } from "react";
import { Warehouse, Boxes, Package, Truck, ClipboardList, ArrowRight, Loader2 } from "lucide-react";
import { sbAll, bacaPerEntitas, kodeHoldingPasti, namaUsahaEntitas } from "../lib/api";
import { STAGE_META } from "../lib/constants";

// Kartu per perusahaan (entitas) di Dashboard Operasional untuk akun PUSAT (Pemilik / Super Appa)
// saat mode "Gabungan semua PT". Pola sama seperti Ringkasan Grup di Dashboard Keuangan:
// kartu dulu, klik salah satu -> dashboard operasional lengkap perusahaan itu (isi yang lama).
//
// Angka tiap kartu ditarik sendiri per perusahaan (bacaPerEntitas) dan sengaja ringan:
// hanya kolom yang dibutuhkan, tanpa mengubah data gudang yang sedang dimuat App.jsx.

const fmtAngka = (n) => Number(n || 0).toLocaleString("id-ID");

async function muatRingkasan(kode) {
  // Ketiga request dimulai bersamaan di dalam bacaPerEntitas (harus dimulai tanpa await di antaranya).
  const [sku, proses, restok] = await bacaPerEntitas(kode, () =>
    Promise.all([
      sbAll("sku_master?select=sku,nonaktif"),
      sbAll("items?select=stage&stage=neq.selesai"),
      sbAll("pengajuan_restock?select=id&status=eq.menunggu"),
    ])
  );
  const skuAktif = (sku || []).filter((s) => !s.nonaktif);
  const perTahap = {};
  (proses || []).forEach((i) => {
    perTahap[i.stage] = (perTahap[i.stage] || 0) + 1;
  });
  return {
    skuAktif: skuAktif.length,
    totalStok: skuAktif.reduce((a, s) => a + (Number(s.stok) || 0), 0),
    dalamProses: (proses || []).length,
    perTahap,
    restokMenunggu: (restok || []).length,
  };
}

function Angka({ label, nilai, icon: Icon, warna }) {
  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon size={12} className={warna} />
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-100 mt-0.5">{nilai}</div>
    </div>
  );
}

export default function KartuOperasionalEntitas({ master = {}, onBuka }) {
  const kodeHolding = kodeHoldingPasti(master.entitas, master.entitas_set);
  const daftar = (master.entitas || []).filter((e) => e.kode !== kodeHolding);
  const kunci = daftar.map((e) => e.kode).join("|");
  const [hasil, setHasil] = useState({});

  useEffect(() => {
    let batal = false;
    setHasil({});
    daftar.forEach(async (e) => {
      try {
        const data = await muatRingkasan(e.kode);
        if (!batal) setHasil((h) => ({ ...h, [e.kode]: { status: "ok", ...data } }));
      } catch {
        if (!batal) setHasil((h) => ({ ...h, [e.kode]: { status: "gagal" } }));
      }
    });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  if (daftar.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
        Belum ada perusahaan yang terdaftar. Tambahkan lewat Keuangan Grup &rsaquo; Pengaturan.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {daftar.map((e) => {
        const r = hasil[e.kode];
        const nama = namaUsahaEntitas(master, e.kode);
        const chipTahap = r?.status === "ok" ? Object.entries(r.perTahap).filter(([, n]) => n > 0) : [];
        return (
          <button
            key={e.kode}
            type="button"
            onClick={() => onBuka && onBuka(e.kode)}
            className="rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70 p-5 text-left transition flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-sky-500/10 text-sky-400">
                <Warehouse size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-100 truncate">{nama}</div>
                <div className="text-[11px] text-slate-500">{e.kode}</div>
              </div>
            </div>

            {!r ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-6">
                <Loader2 size={14} className="animate-spin" /> Memuat…
              </div>
            ) : r.status === "gagal" ? (
              <div className="text-xs text-amber-400 py-6">Angka gagal dimuat — tetap bisa dibuka lewat tombol di bawah.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <Angka label="SKU Aktif" nilai={fmtAngka(r.skuAktif)} icon={Boxes} warna="text-amber-400" />
                  <Angka label="Total Stok" nilai={fmtAngka(r.totalStok)} icon={Package} warna="text-sky-400" />
                  <Angka label="Barang Dalam Proses" nilai={fmtAngka(r.dalamProses)} icon={Truck} warna="text-teal-400" />
                  <Angka label="Restok Menunggu" nilai={fmtAngka(r.restokMenunggu)} icon={ClipboardList} warna="text-orange-400" />
                </div>
                {chipTahap.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {chipTahap.map(([tahap, n]) => (
                      <span key={tahap} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {STAGE_META[tahap]?.label || tahap}: {n}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="mt-4 text-[11px] font-medium text-sky-400 flex items-center gap-1">
              Lihat dashboard operasional <ArrowRight size={12} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
