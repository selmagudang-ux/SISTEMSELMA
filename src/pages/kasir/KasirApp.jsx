import { useEffect, useMemo, useState } from "react";
import { LogOut, Store, History, Package, Lock, Loader2, AlertCircle, Archive, Download, BadgePercent } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { getSession, logout } from "../../lib/auth";
import { ROLE_BOLEH_KASIR } from "../../lib/constants";
import LayarKasir from "./LayarKasir";
import RiwayatStruk from "./RiwayatStruk";
import BarangToko from "./BarangToko";
import PromoToko from "./PromoToko";
import { LayarBukaShift, ModalTutupShift } from "./ShiftKasir";
import { muatShiftAktif } from "./kasirApi";
import { tglJamId } from "./kasirStruk";
import { bukaLaciManual, adalahAppDesktop, URL_UNDUH_APP_KASIR } from "./kasirLaci";

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
// PROMO: tombol Promo (hanya superappa) — PromoToko.jsx; promo per barang terpasang otomatis di keranjang.
// FASE 5: shift — kasir harus Buka Kasir (kas awal) sebelum berjualan, dan Tutup Kasir
//   (hitung kas, selisih) saat selesai; Riwayat berisi rekap per kasir, void & retur.
// =========================================================

// Role yang boleh membuka /kasir didefinisikan di lib/constants.js (ROLE_BOLEH_KASIR),
// supaya panel "Hak Akses" di Pengaturan selalu sama dengan yang dipakai di sini.

export default function KasirApp() {
  const [session, setSession] = useState(() => getSession());
  const [riwayatBuka, setRiwayatBuka] = useState(false);
  const [barangBuka, setBarangBuka] = useState(false);
  const [promoBuka, setPromoBuka] = useState(false);
  const [versiData, setVersiData] = useState(0); // dinaikkan setelah Barang Toko ditutup -> kasir muat ulang
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
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col tabular-nums">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <Store size={18} className="text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[15px] leading-tight">Kasir Selma</div>
            <div className="text-xs text-slate-500 truncate mt-0.5">
              {session.nama || session.username}
              {shift ? ` · shift sejak ${tglJamId(shift.buka_at)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!adalahAppDesktop() && (
            <a
              href={URL_UNDUH_APP_KASIR}
              title="Unduh aplikasi kasir untuk Windows"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
            >
              <Download size={13} /> Unduh Aplikasi
            </a>
          )}
          {session.role === "superappa" && (
            <button
              onClick={() => bukaLaciManual({ kasir: session.nama || session.username })}
              title="Cetak slip kecil agar printer membuka laci"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
            >
              <Archive size={13} /> Buka Laci
            </button>
          )}
          {session.role === "superappa" && (
            <button
              onClick={() => setBarangBuka(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
            >
              <Package size={13} /> Barang Toko
            </button>
          )}
          {session.role === "superappa" && (
            <button
              onClick={() => setPromoBuka(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
            >
              <BadgePercent size={13} /> Promo
            </button>
          )}
          {shift && (
            <button
              onClick={() => setTutupBuka(true)}
              className="flex items-center gap-1.5 text-xs text-slate-950 bg-amber-500 hover:bg-amber-400 font-bold px-3.5 py-2 rounded-xl transition-colors"
            >
              <Lock size={13} /> Tutup Kasir
            </button>
          )}
          <button
            onClick={() => setRiwayatBuka(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
          >
            <History size={13} /> Riwayat
          </button>
          <button
            onClick={keluar}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
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
        <LayarKasir session={sesiKasir} versiData={versiData} />
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
      {promoBuka && session.role === "superappa" && <PromoToko onClose={() => { setPromoBuka(false); setVersiData((v) => v + 1); }} />}
      {barangBuka && session.role === "superappa" && <BarangToko onClose={() => { setBarangBuka(false); setVersiData((v) => v + 1); }} />}
    </div>
  );
}