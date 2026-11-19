import { useEffect, useState } from "react";
import { Warehouse, Store, Clock, Boxes, Package, Truck, ClipboardList, Wallet, ShoppingBag, UserCheck, Users, UserX, ArrowRight, Loader2 } from "lucide-react";
import { sbAll, fmtRp, bacaPerEntitas, kodeHoldingPasti, namaUsahaEntitas, ENTITAS_DEFAULT } from "../lib/api";
import { STAGE_META } from "../lib/constants";
import { hariIniWib } from "./kasir/kasirLaporan";

// Kartu per perusahaan (entitas) di Dashboard untuk akun PUSAT (Pemilik / Super Appa).
// Dipakai tab Operasional, Penjualan, dan Absensi: kartu dulu, klik salah satu -> dashboard
// lengkap perusahaan itu (isi yang lama). Angka tiap kartu ditarik sendiri per perusahaan dan
// sengaja ringan: hanya kolom yang dibutuhkan, tanpa mengubah data yang sedang dimuat App.jsx.

// Urutan tampil untuk akun pusat: Holding dulu, lalu SELMA, lalu PT lainnya (mis. ALIVIA) sesuai urutan master.
export function urutEntitasPusat(list = [], kodeHolding) {
  const rank = (kode) => (kode === kodeHolding ? 0 : kode === ENTITAS_DEFAULT ? 1 : 2);
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.kode) - rank(b.e.kode) || a.i - b.i)
    .map((x) => x.e);
}

const fmtAngka = (n) => Number(n || 0).toLocaleString("id-ID");
const q = encodeURIComponent;

async function muatOperasional(kode) {
  // Request dimulai bersamaan di dalam bacaPerEntitas (harus dimulai tanpa await di antaranya).
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
    angka: [
      { label: "SKU Aktif", nilai: fmtAngka(skuAktif.length), icon: Boxes, warna: "text-amber-400" },
      { label: "Total Stok", nilai: fmtAngka(skuAktif.reduce((a, s) => a + (Number(s.stok) || 0), 0)), icon: Package, warna: "text-sky-400" },
      { label: "Barang Dalam Proses", nilai: fmtAngka((proses || []).length), icon: Truck, warna: "text-teal-400" },
      { label: "Restok Menunggu", nilai: fmtAngka((restok || []).length), icon: ClipboardList, warna: "text-orange-400" },
    ],
    chip: Object.entries(perTahap)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${STAGE_META[t]?.label || t}: ${n}`),
  };
}

async function muatPenjualan(kode) {
  // Bulan berjalan. Angka kartu = Grosir saja (Reseller, Marketplace & Toko Offline ada di dalam dashboard-nya).
  const hariIni = hariIniWib();
  const awal = `${hariIni.slice(0, 7)}-01`;
  const rows = await bacaPerEntitas(kode, () =>
    sbAll(`grosir_pesanan?select=total,status&tanggal=gte.${awal}&tanggal=lte.${hariIni}`)
  );
  const aktif = (rows || []).filter((p) => p.status !== "Batal");
  return {
    angka: [
      { label: "Omset Grosir Bulan Ini", nilai: fmtRp(aktif.reduce((a, p) => a + (Number(p.total) || 0), 0)), icon: Wallet, warna: "text-emerald-400" },
      { label: "Pesanan Grosir", nilai: fmtAngka(aktif.length), icon: ShoppingBag, warna: "text-sky-400" },
    ],
    chip: [],
  };
}

async function muatAbsensi(kode) {
  const hari = hariIniWib();
  const [karyawan, masuk] = await Promise.all([
    sbAll(`karyawan?select=id_karyawan,aktif&entitas=eq.${q(kode)}`),
    sbAll(`absensi?select=id_karyawan&tipe=eq.Masuk&tanggal=eq.${hari}&entitas=eq.${q(kode)}`),
  ]);
  const aktif = (karyawan || []).filter((k) => k.aktif);
  const aktifSet = new Set(aktif.map((k) => k.id_karyawan));
  const hadir = new Set((masuk || []).map((r) => r.id_karyawan).filter((id) => aktifSet.has(id))).size;
  return {
    angka: [
      { label: "Karyawan Aktif", nilai: fmtAngka(aktif.length), icon: Users, warna: "text-violet-400" },
      { label: "Hadir Hari Ini", nilai: fmtAngka(hadir), icon: UserCheck, warna: "text-emerald-400" },
      { label: "Belum Hadir", nilai: fmtAngka(Math.max(aktif.length - hadir, 0)), icon: UserX, warna: "text-amber-400" },
    ],
    chip: [],
  };
}

const JENIS = {
  gudang: { muat: muatOperasional, icon: Warehouse, warnaIkon: "bg-sky-500/10 text-sky-400", tombol: "Lihat dashboard operasional" },
  penjualan: { muat: muatPenjualan, icon: Store, warnaIkon: "bg-emerald-500/10 text-emerald-400", tombol: "Lihat dashboard penjualan" },
  absensi: { muat: muatAbsensi, icon: Clock, warnaIkon: "bg-violet-500/10 text-violet-400", tombol: "Lihat dashboard absensi" },
};

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

// jenis: "gudang" (Operasional) | "penjualan" | "absensi"
export default function KartuOperasionalEntitas({ master = {}, onBuka, jenis = "gudang" }) {
  const cfg = JENIS[jenis] || JENIS.gudang;
  const Ikon = cfg.icon;
  const kodeHolding = kodeHoldingPasti(master.entitas, master.entitas_set);
  // Semua entitas ditampilkan, termasuk Holding (ditandai "Pusat").
  const daftar = urutEntitasPusat(master.entitas || [], kodeHolding);
  const kunci = `${jenis}:${daftar.map((e) => e.kode).join("|")}`;
  const [hasil, setHasil] = useState({});

  useEffect(() => {
    let batal = false;
    setHasil({});
    daftar.forEach(async (e) => {
      try {
        const data = await cfg.muat(e.kode);
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
        return (
          <button
            key={e.kode}
            type="button"
            onClick={() => onBuka && onBuka(e.kode)}
            className="rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70 p-5 text-left transition flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${cfg.warnaIkon}`}>
                <Ikon size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-100 truncate">{nama}</div>
                <div className="text-[11px] text-slate-500">{e.kode}{e.kode === kodeHolding ? " · Pusat" : ""}</div>
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
                  {r.angka.map((a) => (
                    <Angka key={a.label} {...a} />
                  ))}
                </div>
                {r.chip.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {r.chip.map((c) => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="mt-4 text-[11px] font-medium text-sky-400 flex items-center gap-1">
              {cfg.tombol} <ArrowRight size={12} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
