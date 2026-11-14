import { useEffect, useMemo, useState } from "react";
import { LogOut, Store, Repeat, History, Package, Lock, Loader2, AlertCircle, Archive, Download, BadgePercent, Menu, X } from "lucide-react";
import Login from "../Login";
import ThemeToggle from "../../components/ThemeToggle";
import { getSession, logout } from "../../lib/auth";
import { bolehKasir as bolehKasirRole, setAksesRole, bisa, kasirHanyaKeranjang, kasirBisaPilihMode, kasirModeMaster } from "../../lib/constants";
import { PasangAplikasi, adalahHp } from "./kasirPasang";
import { sb } from "../../lib/api";
import LayarKasir from "./LayarKasir";
import RiwayatStruk from "./RiwayatStruk";
import BarangToko from "./BarangToko";
import PromoToko from "./PromoToko";
import { LayarBukaShift, ModalTutupShift } from "./ShiftKasir";
import { muatShiftAktif } from "./kasirApi";
import { tglJamId } from "./kasirStruk";
import { bukaLaciManual, adalahAppDesktop, URL_UNDUH_APP_KASIR } from "./kasirLaci";
import {
  mulaiPenjadwal,
  adalahGalatJaringan,
  tandaiOffline,
  tandaiOnline,
  simpanCacheEnt,
  bacaCacheEnt,
  hapusCacheEnt,
  jumlahBelumTerkirim,
  kirimAntrian,
} from "./kasirOffline";
import { ChipKoneksi, BannerOffline, PanelAntrian } from "./StatusOffline";

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
  const [antrianBuka, setAntrianBuka] = useState(false);
  const [menuHp, setMenuHp] = useState(false); // menu aksi (HP): lembar dari bawah
  // Pilihan sumber barang kasir (Barang Toko / Master Barang) untuk Super Appa & role dengan izin "kasir.pilih_mode".
  // Diingat per akun di perangkat ini. null = belum memilih -> mode bawaan role.
  // Hak akses yang diatur Super Appa (master_data tipe "role_akses") dimuat dulu sebelum role dicek.
  const [aksesSiap, setAksesSiap] = useState(false);
  const kunciMode = `kasir_mode_master_${session?.id ?? "x"}`;
  const [pilihMaster, setPilihMaster] = useState(() => {
    try {
      const v = localStorage.getItem(`kasir_mode_master_${getSession()?.id ?? "x"}`);
      return v === "1" ? true : v === "0" ? false : null;
    } catch {
      return null;
    }
  });
  // Ganti akun di perangkat yang sama -> pakai pilihan mode milik akun itu.
  useEffect(() => {
    try {
      const v = localStorage.getItem(kunciMode);
      setPilihMaster(v === "1" ? true : v === "0" ? false : null);
    } catch {
      setPilihMaster(null);
    }
  }, [kunciMode]);
  const modeMasterSekarang = kasirModeMaster(session?.role, pilihMaster);
  const bisaGantiMode = !!session && aksesSiap && kasirBisaPilihMode(session.role);
  const gantiMode = () => {
    if (!window.confirm(`Pindah ke mode ${modeMasterSekarang ? "Barang Toko" : "Master Barang (harga grosir)"}? Keranjang yang sedang berisi akan dikosongkan.`)) return;
    const baru = !modeMasterSekarang;
    try {
      sessionStorage.removeItem(`kasir_keranjang_${session?.id ?? "x"}`);
      localStorage.setItem(kunciMode, baru ? "1" : "0");
    } catch {
      /* penyimpanan diblokir — mode tetap berganti untuk sesi ini */
    }
    setPilihMaster(baru);
  };

  // Mode offline: pengirim ulang transaksi antrian berjalan selama halaman kasir terbuka.
  useEffect(() => {
    mulaiPenjadwal();
  }, []);

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
      .then((rows) => {
        const daftar = Array.isArray(rows) ? rows : [];
        simpanCacheEnt("role_akses", daftar);
        setAksesRole(daftar);
      })
      .catch(async (e) => {
        // Offline: pakai hak akses yang terakhir tersimpan; tidak ada -> aturan bawaan.
        if (adalahGalatJaringan(e)) {
          tandaiOffline();
          const c = await bacaCacheEnt("role_akses");
          setAksesRole(Array.isArray(c?.data) ? c.data : []);
        } else setAksesRole([]); // gagal muat -> pakai aturan bawaan
      })
      .finally(() => !batal && setAksesSiap(true));
    return () => {
      batal = true;
    };
  }, [session?.id, session?.role]);

  const bolehKasir = !!session && aksesSiap && bolehKasirRole(session.role);
  // Mode keranjang HP: tanpa shift, tanpa pembayaran. Hanya mengisi keranjang lalu Simpan.
  const hanyaKeranjang = !!session && aksesSiap && kasirHanyaKeranjang(session.role);
  useEffect(() => {
    if (!bolehKasir || hanyaKeranjang) return undefined;
    let batal = false;
    setShift(undefined);
    setErrShift("");
    const kunciShift = `shift:${session.id}`;
    muatShiftAktif(session)
      .then((s) => {
        tandaiOnline();
        // Shift yang sedang buka disalin ke perangkat, supaya setelah halaman dimuat ulang saat offline
        // kasir tetap bisa berjualan di shift yang sama.
        if (s) simpanCacheEnt(kunciShift, s);
        else hapusCacheEnt(kunciShift);
        if (!batal) setShift(s);
      })
      .catch(async (e) => {
        if (batal) return;
        if (adalahGalatJaringan(e)) {
          tandaiOffline();
          const c = await bacaCacheEnt(kunciShift);
          if (batal) return;
          if (c?.data) {
            setShift(c.data);
            return;
          }
          setErrShift("Tidak ada koneksi dan belum ada shift yang tersimpan di perangkat ini. Buka kasir butuh internet.");
          setShift(null);
          return;
        }
        setErrShift(e.message || "Gagal memeriksa shift");
        setShift(null);
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSesi, bolehKasir, hanyaKeranjang]);

  // Shift yang baru dibuka langsung disalin ke perangkat (dipakai kalau halaman dimuat ulang saat offline).
  useEffect(() => {
    if (shift && session?.id != null) simpanCacheEnt(`shift:${session.id}`, shift);
  }, [shift, session?.id]);

  // Sesi yang dibawa ke layar kasir memuat shiftId (dipakai saat menyimpan transaksi & retur).
  // Dibuat stabil supaya LayarKasir tidak menyimpan ulang keranjang tiap render.
  const sesiKasir = useMemo(() => (session ? { ...session, shiftId: shift?.id ?? null } : session), [session, shift?.id]);

  // Tutup Kasir butuh semua transaksi sudah ada di server (kas dihitung dari data server).
  const mintaTutup = async () => {
    if ((await jumlahBelumTerkirim()) > 0) {
      await kirimAntrian({ paksa: true });
      const sisa = await jumlahBelumTerkirim();
      if (sisa > 0) {
        window.alert(
          `Belum bisa Tutup Kasir: masih ada ${sisa} transaksi yang belum terkirim ke server.\n\nSambungkan internet lalu coba lagi, atau buka daftar antrian (tombol Online/Offline di atas) untuk melihat detailnya.`
        );
        setAntrianBuka(true);
        return;
      }
    }
    setTutupBuka(true);
  };

  const keluar = async () => {
    const belum = await jumlahBelumTerkirim();
    if (belum > 0 && !window.confirm(`Masih ada ${belum} transaksi yang belum terkirim ke server. Transaksi itu tetap tersimpan di perangkat ini dan terkirim saat internet kembali (selama halaman kasir dibuka). Tetap keluar?`)) return;
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

  if (!aksesSiap) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!bolehKasirRole(session.role)) {
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

  // Daftar aksi header. Di layar lebar tampil sebagai deretan tombol; di HP masuk ke lembar "Menu".
  const aksi = [
    bisaGantiMode && { k: "mode", Ikon: Repeat, label: `Mode: ${modeMasterSekarang ? "Master Barang" : "Barang Toko"}`, onClick: gantiMode, aksen: true },
    !hanyaKeranjang && bisa(session.role, "kasir.buka_laci") && { k: "laci", Ikon: Archive, label: "Buka Laci", onClick: () => bukaLaciManual({ kasir: session.nama || session.username }) },
    !hanyaKeranjang && bisa(session.role, "kasir.barang_toko") && { k: "barang", Ikon: Package, label: "Barang Toko", onClick: () => setBarangBuka(true) },
    !hanyaKeranjang && bisa(session.role, "kasir.promo") && { k: "promo", Ikon: BadgePercent, label: "Promo", onClick: () => setPromoBuka(true) },
    !hanyaKeranjang && { k: "riwayat", Ikon: History, label: "Riwayat", onClick: () => setRiwayatBuka(true) },
  ].filter(Boolean);
  const kelasTombol = "flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors";

  return (
    <div className="bg-slate-950 text-slate-100 flex flex-col tabular-nums" style={{ height: "100dvh", minHeight: "-webkit-fill-available" }}>
      <header
        className="flex items-center justify-between gap-2 px-3 lg:px-5 py-2.5 lg:py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <Store size={18} className="text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base lg:text-[15px] leading-tight">Kasir Selma</div>
            <div className="text-xs text-slate-500 truncate mt-0.5">
              {session.nama || session.username}
              {shift ? ` · shift sejak ${tglJamId(shift.buka_at)}` : ""}
            </div>
          </div>
        </div>

        {/* ===== HP / layar kecil: ringkas — status, Tutup Kasir, tombol Menu ===== */}
        <div className="flex items-center gap-2 lg:hidden flex-shrink-0">
          <ChipKoneksi onBuka={() => setAntrianBuka(true)} />
          {shift && (
            <button
              onClick={mintaTutup}
              aria-label="Tutup Kasir"
              className="flex items-center gap-1.5 text-sm text-slate-950 bg-amber-500 active:bg-amber-400 font-bold px-3.5 h-11 rounded-xl"
            >
              <Lock size={16} /> <span className="hidden min-[400px]:inline">Tutup</span>
            </button>
          )}
          <button
            onClick={() => setMenuHp(true)}
            aria-label="Menu"
            className="w-11 h-11 flex items-center justify-center rounded-xl border border-slate-700 text-slate-200 active:bg-slate-800"
          >
            <Menu size={22} />
          </button>
        </div>

        {/* ===== Layar lebar (tablet landscape / desktop): deretan tombol seperti semula ===== */}
        <div className="hidden lg:flex items-center gap-2 flex-wrap justify-end">
          <ChipKoneksi onBuka={() => setAntrianBuka(true)} />
          <ThemeToggle />
          <PasangAplikasi />
          {!adalahAppDesktop() && !adalahHp() && (
            <a href={URL_UNDUH_APP_KASIR} title="Unduh aplikasi kasir untuk Windows" className={kelasTombol}>
              <Download size={13} /> Unduh Aplikasi
            </a>
          )}
          {aksi.map(({ k, Ikon, label, onClick, aksen }) => (
            <button
              key={k}
              onClick={onClick}
              className={aksen ? "flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 hover:bg-slate-800 px-3 py-2 rounded-xl border border-amber-500/40 transition-colors" : kelasTombol}
            >
              <Ikon size={13} /> {label}
            </button>
          ))}
          {shift && (
            <button
              onClick={mintaTutup}
              className="flex items-center gap-1.5 text-xs text-slate-950 bg-amber-500 hover:bg-amber-400 font-bold px-3.5 py-2 rounded-xl transition-colors"
            >
              <Lock size={13} /> Tutup Kasir
            </button>
          )}
          <button onClick={keluar} className={kelasTombol}>
            <LogOut size={13} /> Keluar
          </button>
        </div>
      </header>

      {/* Lembar Menu (HP): tombol besar, mudah disentuh */}
      {menuHp && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setMenuHp(false)}>
          <div
            className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-3 max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <div className="font-bold text-base">Menu</div>
              <button onClick={() => setMenuHp(false)} aria-label="Tutup menu" className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 active:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {aksi.map(({ k, Ikon, label, onClick, aksen }) => (
                <button
                  key={k}
                  onClick={() => {
                    setMenuHp(false);
                    onClick();
                  }}
                  className={`flex items-center gap-3 w-full text-left text-base font-medium px-4 h-14 rounded-2xl border active:bg-slate-800 ${
                    aksen ? "text-amber-300 border-amber-500/40" : "text-slate-100 border-slate-800"
                  }`}
                >
                  <Ikon size={20} /> {label}
                </button>
              ))}
              <div className="flex items-center gap-2 px-1 pt-1">
                <ThemeToggle />
                <PasangAplikasi />
              </div>
              <button
                onClick={() => {
                  setMenuHp(false);
                  keluar();
                }}
                className="flex items-center gap-3 w-full text-left text-base font-medium px-4 h-14 rounded-2xl border border-slate-800 text-red-300 active:bg-slate-800 mt-1"
              >
                <LogOut size={20} /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      <BannerOffline onBuka={() => setAntrianBuka(true)} />
      {hanyaKeranjang ? (
        <LayarKasir session={sesiKasir} versiData={versiData} hanyaKeranjang />
      ) : shift === undefined ? (
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
        <LayarKasir key={modeMasterSekarang ? "m" : "t"} session={sesiKasir} versiData={versiData} pilihMaster={pilihMaster} />
      )}
      {riwayatBuka && <RiwayatStruk session={sesiKasir} shift={shift || null} onClose={() => setRiwayatBuka(false)} />}
      {tutupBuka && shift && (
        <ModalTutupShift
          shift={shift}
          onClose={() => setTutupBuka(false)}
          onSelesai={() => {
            setTutupBuka(false);
            hapusCacheEnt(`shift:${session.id}`);
            setShift(null);
          }}
        />
      )}
      {antrianBuka && <PanelAntrian onClose={() => setAntrianBuka(false)} />}
      {promoBuka && bisa(session.role, "kasir.promo") && <PromoToko onClose={() => { setPromoBuka(false); setVersiData((v) => v + 1); }} />}
      {barangBuka && bisa(session.role, "kasir.barang_toko") && <BarangToko onClose={() => { setBarangBuka(false); setVersiData((v) => v + 1); }} />}
    </div>
  );
}