import { Suspense, useEffect, useMemo, useState } from "react";
import { LogOut, Loader2, Hammer, X, ExternalLink } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { getSession, logout } from "../../lib/auth";
import { allowedMenus, setAksesRole } from "../../lib/constants";
import { sb } from "../../lib/api";
import { MENU_HP, IKON_LAINNYA } from "./mobileMenu";

// =========================================================
// SISTEMSELMA VERSI HP — pintu masuk di alamat /m.
// Satu kode & satu database dengan SELMA desktop dan kasir. Login memakai gerbang yang sama
// (lib/unifiedLogin.js via pages/Login.jsx) dan hak akses mengikuti menu role di ERP:
// menu HP hanya tampil kalau role-nya memang boleh membuka menu ERP yang bersangkutan.
// Navigasi: bar bawah (menu "pin") + lembar "Lainnya". Posisi menu disimpan di hash (/m#stok)
// supaya tombol Kembali di HP bekerja dan halaman bisa dimuat ulang di menu yang sama.
// =========================================================

const MAKS_PIN = 4; // jumlah tombol di bar bawah, di luar "Lainnya"

const bacaHash = () => {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch {
    return "";
  }
};

function LayarSegeraHadir({ label }) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center">
      <div className="max-w-xs">
        <div className="w-14 h-14 rounded-2xl bg-md-container mx-auto mb-3 flex items-center justify-center text-md-primary">
          <Hammer size={24} />
        </div>
        <div className="font-bold text-md-on-surface mb-1">{label}</div>
        <p className="text-sm text-md-on-surface-variant">Menu ini belum tersedia di versi HP. Untuk sementara buka lewat SISTEMSELMA versi komputer.</p>
        <a href="/" className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-md-primary underline">
          Buka versi komputer <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

export default function MobileApp() {
  const [session, setSession] = useState(() => getSession());
  const [aksesSiap, setAksesSiap] = useState(false);
  const [aktif, setAktif] = useState(() => bacaHash() || "beranda");
  const [lainnyaBuka, setLainnyaBuka] = useState(false);
  const [layarMuat, setLayarMuat] = useState(null); // { key, Komponen } layar yang sudah dimuat

  // Hak akses yang diatur Super Appa (master_data tipe "role_akses") dimuat dulu sebelum menu dihitung.
  const idSesi = session?.id;
  useEffect(() => {
    if (!session) return undefined;
    if (session.role === "superappa") {
      setAksesSiap(true);
      return undefined;
    }
    let batal = false;
    setAksesSiap(false);
    sb("master_data?tipe=eq.role_akses&select=kode,label", { timeoutMs: 10000 })
      .then((rows) => setAksesRole(Array.isArray(rows) ? rows : []))
      .catch(() => setAksesRole([])) // gagal muat -> aturan bawaan role
      .finally(() => !batal && setAksesSiap(true));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSesi, session?.role]);

  // Menu HP yang boleh dibuka role ini.
  const menu = useMemo(() => {
    if (!session || !aksesSiap) return [];
    const boleh = new Set(allowedMenus(session.role, session.entitas));
    return MENU_HP.filter((m) => !m.menuKey || boleh.has(m.menuKey));
  }, [session, aksesSiap]);

  const pin = menu.filter((m) => m.pin).slice(0, MAKS_PIN);
  const lainnya = menu.filter((m) => !pin.includes(m));

  // Hash <-> menu aktif (tombol Kembali HP).
  useEffect(() => {
    const onHash = () => setAktif(bacaHash() || "beranda");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const buka = (key) => {
    setLainnyaBuka(false);
    if (key === "beranda") {
      if (window.location.hash) window.history.pushState(null, "", window.location.pathname);
      setAktif("beranda");
    } else window.location.hash = key;
  };

  const menuAktif = menu.find((m) => m.key === aktif) || menu.find((m) => m.key === "beranda");

  // Muat layar menu aktif (malas).
  useEffect(() => {
    if (!menuAktif?.muat) {
      setLayarMuat(null);
      return undefined;
    }
    let batal = false;
    setLayarMuat(null);
    menuAktif
      .muat()
      .then((m) => !batal && setLayarMuat({ key: menuAktif.key, Komponen: m.default }))
      .catch(() => !batal && setLayarMuat({ key: menuAktif.key, Komponen: null }));
    return () => {
      batal = true;
    };
  }, [menuAktif?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const keluar = () => {
    if (!window.confirm("Keluar dari SELMA?")) return;
    logout();
    setSession(null);
    setAksesSiap(false);
  };

  if (!session) {
    return (
      <Login
        onLogin={(hasil) => {
          // Akun karyawan absen (bukan app_users) tidak punya akses ke menu ERP HP.
          if (hasil.type !== "admin") {
            logout();
            window.alert("Akun ini tidak punya akses ke SELMA versi HP. Untuk absen, gunakan alamat utama.");
            return;
          }
          setSession(hasil.session);
        }}
      />
    );
  }

  if (!aksesSiap) {
    return (
      <div className="min-h-screen bg-md-surface text-md-on-surface-variant flex items-center justify-center">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const Komponen = layarMuat?.key === menuAktif?.key ? layarMuat.Komponen : null;

  return (
    <div className="bg-md-surface text-md-on-surface flex flex-col" style={{ height: "100dvh", minHeight: "-webkit-fill-available" }}>
      <header
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-md-outline-variant bg-md-container-low"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="min-w-0">
          <div className="font-bold text-base leading-tight truncate">{menuAktif?.label || "SELMA"}</div>
          <div className="text-[11px] text-md-on-surface-variant truncate">
            {session.nama || session.username} · {session.entitas || "OPS"}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ThemeToggle />
          <button onClick={keluar} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant hover:bg-md-on-surface/10" title="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {!menuAktif ? (
          <LayarSegeraHadir label="Menu tidak tersedia" />
        ) : !menuAktif.muat ? (
          <LayarSegeraHadir label={menuAktif.label} />
        ) : Komponen ? (
          <Suspense fallback={null}>
            <Komponen session={session} menu={menu} buka={buka} />
          </Suspense>
        ) : layarMuat?.key === menuAktif.key ? (
          <LayarSegeraHadir label={menuAktif.label} />
        ) : (
          <div className="h-full flex items-center justify-center text-md-on-surface-variant">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
      </main>

      <nav
        className="flex items-stretch border-t border-md-outline-variant bg-md-container-low"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {pin.map(({ key, label, Ikon }) => {
          const on = menuAktif?.key === key;
          return (
            <button key={key} onClick={() => buka(key)} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium">
              <span className={`px-4 py-1 rounded-full transition ${on ? "bg-md-primary-container text-md-on-primary-container" : "text-md-on-surface-variant"}`}>
                <Ikon size={20} />
              </span>
              <span className={on ? "text-md-on-surface" : "text-md-on-surface-variant"}>{label}</span>
            </button>
          );
        })}
        {lainnya.length > 0 && (
          <button onClick={() => setLainnyaBuka(true)} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium">
            <span className={`px-4 py-1 rounded-full transition ${lainnya.some((m) => m.key === menuAktif?.key) ? "bg-md-primary-container text-md-on-primary-container" : "text-md-on-surface-variant"}`}>
              <IKON_LAINNYA size={20} />
            </span>
            <span className="text-md-on-surface-variant">Lainnya</span>
          </button>
        )}
      </nav>

      {lainnyaBuka && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setLainnyaBuka(false)}>
          <div
            className="w-full bg-md-container-low rounded-t-3xl p-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">Menu lainnya</div>
              <button onClick={() => setLainnyaBuka(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-md-on-surface/10">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {lainnya.map(({ key, label, Ikon }) => (
                <button key={key} onClick={() => buka(key)} className="rounded-2xl bg-md-container border border-md-outline-variant p-3 flex flex-col items-center gap-1.5 text-center">
                  <Ikon size={20} className="text-md-primary" />
                  <span className="text-[11px] font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
            <a href="/" className="block text-center text-xs text-md-primary underline mt-4">
              Buka versi komputer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
