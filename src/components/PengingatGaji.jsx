import { useEffect, useState } from "react";
import { Banknote, X } from "lucide-react";
import { btnFilled, btnText } from "./ui";
import {
  hariIniWib, pengingatUntuk, sudahDitandai, tandaiSelesai, tipePeriodeUntuk, KUNCI_TIPE_PERIODE,
} from "../lib/pengingatGaji";

// Pengingat gajian di bagian atas semua halaman (bukan push notification: muncul saat aplikasi dibuka).
//   Sabtu & Minggu : gajian mingguan karyawan harian
//   Tanggal 23     : gajian bulanan (gaji karyawan bulanan + premi jabatan/kehadiran semua karyawan)
// "Sudah dibayar" menyembunyikannya sampai gajian berikutnya; "x" hanya menyembunyikan sementara
// (muncul lagi saat halaman dibuka ulang). Hanya tampil untuk akun yang boleh mengelola gaji.
//
// Tombol "Siapkan gaji" memilih periode yang pas di halaman Penggajian lewat dua jalur:
//   • localStorage  -> dibaca Penggajian kalau halamannya baru dibuka,
//   • event         -> didengar Penggajian kalau halamannya sedang terbuka.
export const EVENT_PILIH_PERIODE_GAJI = "selma-gaji-pilih-periode";

export default function PengingatGaji({ bolehKelola, menuAktif, onNavigate }) {
  const [hari, setHari] = useState(() => hariIniWib());
  const [disembunyikan, setDisembunyikan] = useState(() => new Set()); // sementara, per kunci
  const [, paksaRender] = useState(0);

  // Tanggal bisa berganti saat aplikasi dibiarkan terbuka semalaman.
  useEffect(() => {
    const t = setInterval(() => setHari(hariIniWib()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!bolehKelola) return null;
  const daftar = pengingatUntuk(hari).filter((p) => !sudahDitandai(p.kunci) && !disembunyikan.has(p.kunci));
  if (daftar.length === 0) return null;

  const siapkan = (p) => {
    try { localStorage.setItem(KUNCI_TIPE_PERIODE, tipePeriodeUntuk(p.tipe)); } catch { /* abaikan */ }
    window.dispatchEvent(new CustomEvent(EVENT_PILIH_PERIODE_GAJI, { detail: p }));
    if (menuAktif !== "penggajian") onNavigate?.("penggajian");
  };
  const sudah = (p) => {
    tandaiSelesai(p.kunci);
    paksaRender((n) => n + 1);
  };
  const nanti = (p) => setDisembunyikan((s) => new Set(s).add(p.kunci));

  return (
    <div className="mb-4 space-y-2 print:hidden" role="status">
      {daftar.map((p) => (
        <div
          key={p.kunci}
          className="flex flex-wrap items-center gap-3 bg-md-primary-container text-md-on-primary-container rounded-md-xl px-4 py-3"
        >
          <Banknote size={20} className="shrink-0" />
          <div className="flex-1 min-w-[14rem]">
            <div className="text-sm font-medium">{p.judul}</div>
            <div className="text-xs opacity-80">{p.detail}</div>
          </div>
          <div className="flex items-center gap-1">
            <button className={btnFilled + " !py-2"} onClick={() => siapkan(p)}>
              {menuAktif === "penggajian" ? "Pakai periode ini" : "Siapkan gaji"}
            </button>
            <button className={btnText} onClick={() => sudah(p)}>Sudah dibayar</button>
            <button className="p-2 rounded-full hover:bg-black/10" onClick={() => nanti(p)} aria-label="Tutup sementara">
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
