import { Warehouse, LayoutGrid } from "lucide-react";
import { kodeHoldingPasti, namaUsahaEntitas, ENTITAS_DEFAULT } from "../lib/api";

// Kartu pilih perusahaan (entitas) di atas Dashboard untuk akun PUSAT (Pemilik / Super Appa).
// Dipakai keempat tab (Operasional, Penjualan, Absensi, Keuangan). Kartu SELALU tampil; yang sedang
// dibuka diberi tanda, isi dashboard-nya muncul di bawah kartu. Tab Keuangan punya kartu tambahan
// "Gabungan" (ringkasan semua PT) di paling depan.

export const KODE_GABUNGAN = "GABUNGAN";

// Urutan tampil untuk akun pusat: Holding dulu, lalu SELMA, lalu PT lainnya (mis. ALIVIA) sesuai urutan master.
export function urutEntitasPusat(list = [], kodeHolding) {
  const rank = (kode) => (kode === kodeHolding ? 0 : kode === ENTITAS_DEFAULT ? 1 : 2);
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e.kode) - rank(b.e.kode) || a.i - b.i)
    .map((x) => x.e);
}

// terpilih: kode entitas (atau "GABUNGAN") yang sedang dibuka — kartunya diberi tanda; null = belum ada.
export default function KartuOperasionalEntitas({ master = {}, onBuka, terpilih = null, denganGabungan = false }) {
  const kodeHolding = kodeHoldingPasti(master.entitas, master.entitas_set);
  const daftar = urutEntitasPusat(master.entitas || [], kodeHolding);

  if (daftar.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400 mb-4">
        Belum ada perusahaan yang terdaftar. Tambahkan lewat Keuangan Grup &rsaquo; Pengaturan.
      </div>
    );
  }

  const kartu = [
    ...(denganGabungan ? [{ kode: KODE_GABUNGAN, nama: "Gabungan", ket: "Semua PT", Ikon: LayoutGrid }] : []),
    ...daftar.map((e) => ({
      kode: e.kode,
      nama: namaUsahaEntitas(master, e.kode),
      ket: e.kode === kodeHolding ? "Pusat" : null,
      Ikon: Warehouse,
    })),
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {kartu.map(({ kode, nama, ket, Ikon }) => (
        <button
          key={kode}
          type="button"
          onClick={() => onBuka && onBuka(kode)}
          className={`w-full sm:w-56 rounded-xl border p-4 text-left transition min-h-[104px] flex flex-col ${
            terpilih === kode
              ? "border-amber-500/50 bg-slate-900/70"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
          }`}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-md-on-surface/[0.06] text-md-on-surface-variant mb-2">
            <Ikon size={15} />
          </div>
          <div className="text-sm font-semibold text-slate-100 leading-snug">{nama}</div>
          {ket && <div className="text-[11px] text-slate-500 mt-1">{ket}</div>}
        </button>
      ))}
    </div>
  );
}
