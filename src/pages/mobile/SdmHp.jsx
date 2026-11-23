import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { sbAll, entitasBacaSaatIni, masterDataUntukPT, daftarkanProfilEntitas, lingkupTokoMarketplace } from "../../lib/api";

// =========================================================
// VERSI HP — SDM (file SdmHp.jsx)
// Satu layar untuk 4 sub-menu SDM (key menu NAV tetap "absensi"):
//   Rekap Absensi (rekap) · Penggajian (penggajian) · Data Karyawan (karyawan) · Pengaturan (pengaturan)
// Memakai ulang halaman versi komputer (pages/Absensi.jsx dan pages/Penggajian.jsx), jadi aturan absensi, gaji,
// serah terima, dan hak akses (bisa/lihat-saja per role) TIDAK ditulis dua kali dan hasilnya sama persis dengan
// SELMA komputer. Tabel lebar di halaman itu sudah bisa digeser ke samping (overflow-x-auto).
// Layar ini hanya memuat master data (rekening, entitas, dst.) yang dibutuhkan kedua halaman itu.
// Daftarkan di mobileMenu.js: absensi.
// =========================================================

const Absensi = lazy(() => import("../Absensi"));
const Penggajian = lazy(() => import("../Penggajian"));

// Master data dengan aturan yang sama seperti KeuanganHp.jsx / KasHp.jsx (kode per PT, profil entitas, toko marketplace).
async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

const Memuat = () => (
  <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
    <Loader2 size={18} className="animate-spin" /> Memuat…
  </div>
);

export default function SdmHp({ session, sub }) {
  const [master, setMaster] = useState(null); // null = belum dimuat
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  const muat = useCallback(async () => {
    setErr("");
    try {
      setMaster(await muatMaster());
    } catch (e) {
      setErr(e.message || "Gagal memuat data SDM");
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  if (err) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="break-words">{err}</div>
          <button onClick={muat} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }
  if (!master) return <Memuat />;

  return (
    <div className="p-3">
      <Suspense fallback={<Memuat />}>
        {sub === "penggajian" ? (
          <Penggajian session={session} master={master} showToast={tampilToast} />
        ) : (
          <Absensi sub={sub || "rekap"} session={session} master={master} showToast={tampilToast} />
        )}
      </Suspense>
      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
