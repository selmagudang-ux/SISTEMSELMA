import { useState } from "react";
import { LogOut, Store } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { getSession, logout } from "../../lib/auth";
import LayarKasir from "./LayarKasir";

// =========================================================
// KASIR (POS) — pintu masuk aplikasi kasir di alamat /kasir.
// Satu kode & satu database dengan SELMA, tapi tampilannya berdiri sendiri
// (tanpa sidebar/menu SELMA). Sesi login memakai gerbang login yang sama
// (lib/unifiedLogin.js), jadi akun kasir dibuat lewat Pengaturan > Kelola User
// dengan role "Kasir".
//
// TAHAP 1: rute, login, pembatasan role, kerangka tampilan.
// TAHAP 2: layar kasir (cari/scan SKU, keranjang, diskon, total) — LayarKasir.jsx.
// =========================================================

// Role yang boleh membuka /kasir. Superadmin & superappa ikut supaya bisa menguji.
const ROLE_BOLEH_KASIR = ["kasir", "superadmin", "superappa"];

export default function KasirApp() {
  const [session, setSession] = useState(() => getSession());

  const keluar = () => {
    logout();
    setSession(null);
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
            Akun <span className="text-slate-200">{session.username}</span> belum diberi role Kasir.
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
            <div className="text-[11px] text-slate-500 truncate">{session.nama || session.username}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={keluar}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-800"
          >
            <LogOut size={13} /> Keluar
          </button>
        </div>
      </header>

      <LayarKasir session={session} />
    </div>
  );
}