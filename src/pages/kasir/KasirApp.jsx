import { useEffect, useMemo, useState } from "react";
import { LogOut, Store, History, Package, Lock, Loader2, AlertCircle, Archive } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { getSession, logout } from "../../lib/auth";
import LayarKasir from "./LayarKasir";
import RiwayatStruk from "./RiwayatStruk";
import BarangToko from "./BarangToko";
import { LayarBukaShift, ModalTutupShift } from "./ShiftKasir";
import { muatShiftAktif } from "./kasirApi";
import { tglJamId } from "./kasirStruk";
import { bukaLaciManual } from "./kasirLaci";

// =========================================================
// KASIR (POS) — pintu masuk aplikasi kasir di alamat /kasir.
// Satu kode & satu database dengan SELMA, tapi tampilannya berdiri sendiri
// (tanpa sidebar/menu SELMA). Sesi login memakai gerbang login yang sama
// (lib/unifiedLogin.js), jadi akun kasir dibuat lewat Pengaturan > Kelola User
// dengan role "Kasir".
//
// TAHAP 1: rute, login, pembatasan role, kerangka tampilan.
// TAHAP 2: layar kasir (cari/scan SKU, keranjang, diskon, total) — LayarKasir.jsx.
// TAHAP 4: tombol Riwayat (cetak ulang struk) — RiwayatStruk.jsx.
// MASTER TOKO: tombol Barang Toko (hanya superappa) — BarangToko.jsx.
// FASE 5: shift — kasir harus Buka Kasir (kas awal) sebelum berjualan, dan Tutup Kasir
//   (hitung kas, selisih) saat selesai; Riwayat berisi rekap per kasir, void & retur.
// =========================================================

// Role yang boleh membuka /kasir. SEMENTARA hanya superappa (tahap uji coba).
// Untuk membuka ke kasir lagi nanti, tambahkan "kasir" (dan "superadmin") ke daftar ini.
const ROLE_BOLEH_KASIR = ["superappa"];

export default function KasirApp() {
  const [session, setSession] = useState(() => getSession());
  const [riwayatBuka, setRiwayatBuka] = useState(false);
  const [barangBuka, setBarangBuka] = useState(false);
  // shift: undefined = sedang dicek, null = belum buka, objek = shift yang sedang buka
  const [shift, setShift] = useState(undefined);
  const [errShift, setErrShift] = useState("");
  const [tutupBuka, setTutupBuka] = useState(false);

  const idSesi = session?.id;
  const bolehKasir = !!session && ROLE_BOLEH_KASIR.includes(session.role);
  useEffect(() => {
    if (!bolehKasir) return undefined;
    let batal = false;
    setShift(undefined);
    setErrShift("");
    muatShiftAktif(session)
      .then((s) => !batal && setShift(s))
      .catch((e) => {
        if (batal) return;
        setErrShift(e.message || "Gagal memeriksa shift");
        setShift(null);
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSesi, bolehKasir]);

  // Sesi yang dibawa ke layar kasir memuat shiftId (dipakai saat menyimpan transaksi & retur).
  // Dibuat stabil supaya LayarKasir tidak menyimpan ulang keranjang tiap render.
  const sesiKasir = useMemo(() => (session ? { ...session, shiftId: shift?.id ?? null } : session), [session, shift?.id]);

  const keluar = () => {
    if (shift && !window.confirm("Shift kasir masih buka. Keluar sekarang? (Shift tetap buka dan bisa dilanjutkan saat login lagi — gunakan Tutup Kasir untuk mengakhirinya.)")) return;
    logout();
    setSession(null);
    setShift(undefined);
  };

  if (!session) {
    return (
      <Login
        onLogin={(hasil) => {
          // Akun karyawan absen (bukan app_users) tidak punya akses kasir.
          if (hasil.type !== "admin") {
            logout();
            window.alert("Akun ini tidak punya akses ke aplikasi kasir.");
            return;
          }
          setSession(hasil.session);
        }}
      />
    );
  }

  if (!ROLE_BOLEH_KASIR.includes(session.role)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="font-bold text-lg mb-1">Tidak punya akses kasir</div>
          <p className="text-sm text-slate-400 mb-5">
            Akun <span className="text-slate-200">{session.username}</span> belum diizinkan memakai aplikasi kasir.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/" className="text-xs font-medium bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg border border-slate-700">
              Ke SISTEM SELMA
            </a>
            <button onClick={keluar} className="text-xs text-slate-500 hover:text-slate-300 underline">
              Keluar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
            <Store size={16} className="text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight">Kasir Selma</div>
            <div className="text-[11px] text-slate-500 truncate">
              {session.nama || session.username}
              {shift ? ` · shift sejak ${tglJamId(shift.buka_at)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session.role === "superappa" && (
            <button
              onClick={() => bukaLaciManual({ kasir: session.nama || session.username })}
              title="Cetak slip kecil agar printer membuka laci"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-800"
            >
              <Archive size={13} /> Buka Laci
            </button>
          )}
          {session.role === "superappa" && (
            <button
              onClick={() => setBarangBuka(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-800"
            >
              <Package size={13} /> Barang Toko
            </button>
          )}
          {shift && (
            <button
              onClick={() => setTutupBuka(true)}
              className="flex items-center gap-1.5 text-xs text-slate-950 bg-amber-500 hover:bg-amber-400 font-semibold px-2.5 py-1.5 rounded-lg"
            >
              <Lock size={13} /> Tutup Kasir
            </button>
          )}
          <button
            onClick={() => setRiwayatBuka(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-800"
          >
            <History size={13} /> Riwayat
          </button>
          <button
            onClick={keluar}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-800"
          >
            <LogOut size={13} /> Keluar
          </button>
        </div>
      </header>

      {shift === undefined ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : shift === null ? (
        <>
          {errShift && (
            <div className="mx-4 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{errShift}</span>
            </div>
          )}
          <LayarBukaShift session={session} onBuka={(s) => setShift(s)} onKeluar={keluar} />
        </>
      ) : (
        <LayarKasir session={sesiKasir} />
      )}
      {riwayatBuka && <RiwayatStruk session={sesiKasir} shift={shift || null} onClose={() => setRiwayatBuka(false)} />}
      {tutupBuka && shift && (
        <ModalTutupShift
          shift={shift}
          onClose={() => setTutupBuka(false)}
          onSelesai={() => {
            setTutupBuka(false);
            setShift(null);
          }}
        />
      )}
      {barangBuka && session.role === "superappa" && <BarangToko onClose={() => setBarangBuka(false)} />}
    </div>
  );
}