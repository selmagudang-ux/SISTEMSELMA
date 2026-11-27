import { Suspense, useEffect, useMemo, useState } from "react";
import { LogOut, Loader2, Hammer, ChevronLeft, ChevronRight, ExternalLink, MoreHorizontal, Home, LayoutGrid, BellRing, X, Calculator } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { logout, pulihkanSesiIngat } from "../../lib/auth";
import { lepasPushServer } from "../../lib/pushNotif";
import TombolNotif from "./TombolNotif";
import { NAV, allowedMenus, filterNavByAllowed, fiturMatiEntitas, setAksesRole } from "../../lib/constants";
import { sb } from "../../lib/api";
import { cariLayar, kunciLayar, punyaLayar, rapikanLabel } from "./mobileMenu";
import Beranda from "./Beranda";
import useNotifHp from "./useNotifHp";

// =========================================================
// SISTEMSELMA VERSI HP — pintu masuk di alamat /m.
// Satu kode & satu database dengan SELMA desktop dan kasir. Login memakai gerbang yang sama
// (lib/unifiedLogin.js via pages/Login.jsx).
//
// SUSUNAN MENU = sama dengan sidebar versi web: diambil dari NAV (lib/constants.js) lalu disaring dengan
// aturan yang sama (hak akses role, sub-menu, fitur yang dimatikan per PT). Menu bertingkat dibuka satu tingkat
// per layar (Operasional > Admin Gudang > Stok > Stok Barang). Menu yang layar HP-nya belum dibuat tetap tampil
// tapi redup ("Segera hadir"); daftar layar yang sudah jadi ada di mobileMenu.js.
//
// Posisi disimpan di hash, mis. /m#/operasional-group/gudang-group/stok/barang — urutan key NAV dari atas ke bawah,
// jadi tombol Kembali HP bekerja dan halaman bisa dimuat ulang di tempat yang sama.
// Bar bawah: Beranda + sampai 3 menu tingkat atas (grup lebih dulu) + "Lainnya" (sisanya).
// =========================================================

const MAKS_PIN = 3;

// Menu khusus versi HP (tidak ada di NAV versi komputer): Kalkulator Harga. Tampil untuk akun yang boleh membuka SKU & Harga.
const MENU_KALKULATOR = { key: "kalkulator-harga", label: "Kalkulator Harga", icon: Calculator };

const bacaPath = () => {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#\/?/, ""))
      .split("/")
      .filter(Boolean);
  } catch {
    return [];
  }
};

// Telusuri `path` (urutan key) di pohon menu. Hasil: daftar node dari atas ke bawah, atau null kalau tidak ketemu.
function telusuri(akar, path) {
  let daftar = akar;
  const jejak = [];
  for (const k of path) {
    const n = daftar.find((x) => x.key === k);
    if (!n) return null;
    jejak.push(n);
    daftar = n.children || [];
  }
  return jejak;
}

// Urutan key dari akar menu ke satu menu (dan sub-menunya) — untuk membuka layar dari notifikasi.
function jalurKe(akar, menuKey, subKey) {
  const cari = (daftar, jejak) => {
    for (const n of daftar) {
      const j = [...jejak, n.key];
      if (n.key === menuKey) return subKey && (n.children || []).some((c) => c.key === subKey) ? [...j, subKey] : j;
      const h = cari(n.children || [], j);
      if (h) return h;
    }
    return null;
  };
  return cari(akar, []);
}

function BadgeAngka({ n, className = "" }) {
  if (!(n > 0)) return null;
  return (
    <span className={`text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none ${className}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

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

// Daftar isi satu group / menu (anak-anaknya). Yang belum punya layar HP tampil redup.
function DaftarMenu({ jejak, path, buka, badges = {} }) {
  const node = jejak[jejak.length - 1];
  const induk = node;
  const anak = node.children || [];
  const atas = jejak.slice(0, -1).map((n) => rapikanLabel(n.label));
  return (
    <div className="p-4 space-y-2">
      {atas.length > 0 && <div className="text-[11px] text-md-on-surface-variant truncate">{atas.join(" › ")}</div>}
      {anak.map((c) => {
        const Ikon = c.icon;
        const punyaIsi = !!(c.group || c.children?.length);
        const siap = punyaLayar(c, induk);
        const jmlBadge = badges[node.group ? c.key : `${node.key}.${c.key}`] || badges[c.key] || 0;
        return (
          <button
            key={c.key}
            onClick={() => buka([...path, c.key])}
            className={`w-full text-left rounded-2xl bg-md-container border border-md-outline-variant px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition ${siap ? "" : "opacity-50"}`}
          >
            {Ikon ? <Ikon size={20} className="text-md-primary flex-shrink-0" /> : <span className="w-5 flex-shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-md-on-surface leading-tight">{rapikanLabel(c.label)}</span>
              {!siap && <span className="block text-[10px] text-md-on-surface-variant mt-0.5">Segera hadir</span>}
            </span>
            <BadgeAngka n={jmlBadge} />
            {punyaIsi && <ChevronRight size={16} className="text-md-on-surface-variant flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export default function MobileApp() {
  // Sesi tab, atau dipulihkan dari "Ingat saya di HP ini" (7 hari) — mis. saat dibuka dari ketukan notifikasi.
  const [session, setSession] = useState(() => pulihkanSesiIngat());
  const [aksesSiap, setAksesSiap] = useState(false);
  const [fitur, setFitur] = useState([]); // baris master_data tipe entitas_fitur (fitur yang dimatikan per PT)
  const [path, setPath] = useState(bacaPath);
  const [layarMuat, setLayarMuat] = useState(null); // { kunci, Komponen } layar yang sudah dimuat

  // Hak akses role (master_data tipe "role_akses") & fitur yang dimatikan per PT dimuat dulu sebelum menu dihitung.
  const idSesi = session?.id;
  useEffect(() => {
    if (!session) return undefined;
    let batal = false;
    setAksesSiap(false);
    sb("master_data?tipe=in.(role_akses,entitas_fitur)&select=tipe,kode,label", { timeoutMs: 10000 })
      .then((rows) => {
        const daftar = Array.isArray(rows) ? rows : [];
        setAksesRole(daftar.filter((r) => r.tipe === "role_akses"));
        if (!batal) setFitur(daftar.filter((r) => r.tipe === "entitas_fitur"));
      })
      .catch(() => {
        setAksesRole([]); // gagal muat -> aturan bawaan role
        if (!batal) setFitur([]);
      })
      .finally(() => !batal && setAksesSiap(true));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSesi, session?.role]);

  // Key menu yang boleh dibuka akun ini — aturan yang sama dengan sidebar versi web.
  const bolehMenu = useMemo(() => {
    if (!session || !aksesSiap) return [];
    const fiturMati = fiturMatiEntitas({ entitas_fitur: fitur }, session.entitas);
    return allowedMenus(session.role, session.entitas, fiturMati);
  }, [session, aksesSiap, fitur]);

  // Menu tingkat atas yang boleh dibuka.
  const tree = useMemo(() => {
    if (!session || !aksesSiap) return [];
    const t = filterNavByAllowed(NAV, bolehMenu, session.role);
    return bolehMenu.includes("sku-harga") ? [...t, MENU_KALKULATOR] : t;
  }, [session, aksesSiap, bolehMenu]);

  // Notifikasi dalam aplikasi: pengajuan dana & permintaan stok yang menunggu persetujuan (lihat useNotifHp.js).
  const { badges, perlu, banner, tutupBanner } = useNotifHp(aksesSiap ? session : null, bolehMenu);

  // Bar bawah: grup dulu (Operasional, Penjualan, Keuangan), kalau kurang diisi menu tingkat atas lain; sisanya di "Lainnya".
  const { pin, lainnya, akar } = useMemo(() => {
    const grup = tree.filter((n) => n.group);
    const lain = tree.filter((n) => !n.group);
    const p = [...grup, ...lain].slice(0, MAKS_PIN);
    const sisa = tree.filter((n) => !p.includes(n));
    const l = sisa.length ? { key: "lainnya", label: "Menu Lainnya", icon: MoreHorizontal, group: true, children: sisa } : null;
    return { pin: p, lainnya: l, akar: l ? [...tree, l] : tree };
  }, [tree]);

  // Hash <-> posisi menu (tombol Kembali HP).
  useEffect(() => {
    const onHash = () => setPath(bacaPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const buka = (arr) => {
    if (!arr.length) {
      if (window.location.hash) window.history.pushState(null, "", window.location.pathname);
      setPath([]);
    } else window.location.hash = "/" + arr.map(encodeURIComponent).join("/");
  };

  const bukaNotif = (n) => {
    const jalur = jalurKe(akar, n.menuKey, n.subKey);
    tutupBanner();
    if (jalur) buka(jalur);
  };

  const jejak = useMemo(() => (path.length ? telusuri(akar, path) : null), [akar, path]);
  const terakhir = jejak?.[jejak.length - 1] || null;
  const adaDaftar = !!terakhir && !!(terakhir.group || terakhir.children?.length);

  // Layar (daun): menuKey + subKey untuk mencari layar HP-nya.
  let menuKey = null;
  let subKey = null;
  if (terakhir && !adaDaftar) {
    const induk = jejak[jejak.length - 2];
    if (induk && !induk.group && induk.children?.length) {
      menuKey = induk.key;
      subKey = terakhir.key;
    } else menuKey = terakhir.key;
  }
  const entri = menuKey ? cariLayar(menuKey, subKey) : null;
  const kunci = menuKey ? kunciLayar(menuKey, subKey) : null;

  // Muat layar HP yang dituju (malas).
  useEffect(() => {
    if (!entri) {
      setLayarMuat(null);
      return undefined;
    }
    let batal = false;
    setLayarMuat(null);
    entri
      .muat()
      .then((m) => !batal && setLayarMuat({ kunci, Komponen: m.default }))
      .catch(() => !batal && setLayarMuat({ kunci, Komponen: null }));
    return () => {
      batal = true;
    };
  }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps

  const keluar = async () => {
    if (!window.confirm("Keluar dari SELMA?")) return;
    await lepasPushServer(); // HP ini berhenti menerima notifikasi akun ini (butuh token sesi, jadi sebelum logout)
    logout();
    setSession(null);
    setAksesSiap(false);
  };

  if (!session) {
    return (
      <Login
        tampilIngat
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

  const Komponen = layarMuat?.kunci === kunci ? layarMuat.Komponen : null;
  const judul = terakhir ? rapikanLabel(terakhir.label) : "SELMA ERP";
  const dihalamanBeranda = !jejak;
  const NavItem = ({ aktif, onClick, Ikon, label, badge = 0 }) => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium min-w-0">
      <span className={`relative px-4 py-1 rounded-full transition ${aktif ? "bg-md-primary-container text-md-on-primary-container" : "text-md-on-surface-variant"}`}>
        <Ikon size={20} />
        <BadgeAngka n={badge} className="absolute -top-0.5 right-1.5 !min-w-[16px] !h-[16px]" />
      </span>
      <span className={`truncate max-w-full px-1 ${aktif ? "text-md-on-surface" : "text-md-on-surface-variant"}`}>{label}</span>
    </button>
  );

  return (
    <div className="bg-md-surface text-md-on-surface flex flex-col" style={{ height: "100dvh", minHeight: "-webkit-fill-available" }}>
      <header
        className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-md-outline-variant bg-md-container-low"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-1 min-w-0">
          {!dihalamanBeranda && (
            <button onClick={() => buka(path.slice(0, -1))} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-md-on-surface/10" title="Kembali">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className={`min-w-0 ${dihalamanBeranda ? "pl-1" : ""}`}>
            <div className="font-bold text-base leading-tight truncate">{judul}</div>
            <div className="text-[11px] text-md-on-surface-variant truncate">
              {session.nama || session.username} · {session.entitas || "OPS"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <TombolNotif session={session} />
          <ThemeToggle />
          <button onClick={keluar} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant hover:bg-md-on-surface/10" title="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {banner.length > 0 && (
        <div className="px-3 pt-2 space-y-1.5">
          {banner.map((n) => (
            <div key={n.kunci} className="flex items-center gap-2 rounded-xl bg-md-primary text-md-on-primary pl-3 pr-1 py-2 shadow-md">
              <BellRing size={16} className="flex-shrink-0" />
              <button onClick={() => bukaNotif(n)} className="flex-1 min-w-0 text-left text-xs font-medium leading-tight">
                {n.teks} — ketuk untuk membuka
              </button>
              <button onClick={tutupBanner} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/15 flex-shrink-0" title="Tutup">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <main className="hp-main flex-1 overflow-y-auto">
        {dihalamanBeranda ? (
          <Beranda session={session} tree={tree} buka={buka} badges={badges} perlu={perlu} bukaNotif={bukaNotif} />
        ) : adaDaftar ? (
          <DaftarMenu jejak={jejak} path={path} buka={buka} badges={badges} />
        ) : !entri ? (
          <LayarSegeraHadir label={judul} />
        ) : Komponen ? (
          <Suspense fallback={null}>
            <Komponen
              key={kunci}
              session={session}
              sub={subKey}
              bukaMenu={(m, s) => {
                const j = jalurKe(akar, m, s);
                if (j) buka(j);
              }}
            />
          </Suspense>
        ) : layarMuat?.kunci === kunci ? (
          <LayarSegeraHadir label={judul} />
        ) : (
          <div className="h-full flex items-center justify-center text-md-on-surface-variant">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
      </main>

      <nav className="flex items-stretch border-t border-md-outline-variant bg-md-container-low" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <NavItem aktif={dihalamanBeranda} onClick={() => buka([])} Ikon={Home} label="Beranda" />
        {pin.map((n) => (
          <NavItem key={n.key} aktif={path[0] === n.key} onClick={() => buka([n.key])} Ikon={n.icon || LayoutGrid} label={rapikanLabel(n.label)} badge={badges[n.key] || 0} />
        ))}
        {lainnya && (
          <NavItem
            aktif={path[0] === "lainnya" || (!!path[0] && !pin.some((n) => n.key === path[0]))}
            onClick={() => buka(["lainnya"])}
            Ikon={MoreHorizontal}
            label="Lainnya"
            badge={lainnya.children.reduce((a, c) => a + (badges[c.key] || 0), 0)}
          />
        )}
      </nav>
    </div>
  );
}
