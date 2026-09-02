import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { RefreshCw, AlertCircle, Loader2, Bell, MapPin } from "lucide-react";
import { sb, sbAll } from "./lib/api";
import { STAGE_ORDER, STAGE_META, findNavLabel, allowedMenus, allowedSubMenus, NAV, withParentBadges, AMBANG_MENIPIS_RESTOCK } from "./lib/constants";
import { getSession, logout } from "./lib/auth";
import { getAbsenSession, logoutKaryawan } from "./lib/absensi";
import Sidebar, { MobileMenuButton } from "./components/Sidebar";
import { rippleEffect, iconBtnClass } from "./components/ui";
import ModalRouter from "./components/ModalRouter";
import Login from "./pages/Login";

// Halaman-halaman di bawah ini di-load "malas" (lazy) — kode & library
// beratnya (mis. jszip/html2canvas dipakai Keuangan, SkuHarga) baru diambil
// browser begitu menu itu benar-benar dibuka, bukan ikut numpuk di bundle
// awal. Tidak mengubah tampilan/fitur sama sekali, cuma mempercepat loading.
// "Rak" TETAP diimpor biasa (bukan lazy) karena beberapa fungsinya
// (cariPerluDitempatkanUlang, dst) dipakai di luar halaman Rak sendiri, mis.
// untuk badge & notifikasi di Dashboard/Sidebar yang selalu dihitung.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PersetujuanRestock = lazy(() => import("./pages/PersetujuanRestock"));
const BarangDatang = lazy(() => import("./pages/BarangDatang"));
const BarangMasuk = lazy(() => import("./pages/BarangMasuk"));
const DataBarang = lazy(() => import("./pages/DataBarang"));
const SkuHarga = lazy(() => import("./pages/SkuHarga"));
const Stok = lazy(() => import("./pages/Stok"));
import Rak, { cariPerluDitempatkanUlang, rakTerpakai, barangSisaDiGudang } from "./pages/Rak";
const CetakLabel = lazy(() => import("./pages/CetakLabel"));
const FotoProduk = lazy(() => import("./pages/FotoProduk"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
import { latestHistoryBySku, computeStokTipisNotifs, computeStokTambahNotifs, computeRakBerubahNotifs, computeRakPindahNotifs, computeRakKosongNotifs } from "./lib/marketplaceNotif";
const Grosir = lazy(() => import("./pages/Grosir"));
const Keuangan = lazy(() => import("./pages/Keuangan"));
const Pengaturan = lazy(() => import("./pages/Pengaturan"));
const Absensi = lazy(() => import("./pages/Absensi"));
import { FormAbsen } from "./pages/AbsenKaryawan";
import { listAbsensi, listKaryawan } from "./lib/absensi";

// Satu gerbang login untuk semua orang — link yang dibagikan ke karyawan
// maupun ke pemegang role SELMA (admin, gudang, dst.) SAMA PERSIS. Login.jsx
// (lewat lib/unifiedLogin.js) yang menentukan jenis akunnya (admin/app_users
// vs karyawan absen), lalu di sini tinggal dirutekan ke tampilan yang sesuai.
export default function SistemSelmaApp() {
  const [session, setSession] = useState(() => getSession());
  const [absenSession, setAbsenSession] = useState(() => getAbsenSession());

  if (session) {
    return <MainApp session={session} onLogout={() => { logout(); setSession(null); }} />;
  }

  if (absenSession) {
    return (
      <FormAbsen
        session={absenSession}
        onLogout={() => {
          logoutKaryawan();
          setAbsenSession(null);
        }}
      />
    );
  }

  return (
    <Login
      onLogin={(result) => {
        if (result.type === "admin") setSession(result.session);
        else setAbsenSession(result.session);
      }}
    />
  );
}

// Dipisah dari MainApp SENGAJA supaya state buka/tutup sidebar di HP
// (mobileOpen) tidak ikut memicu render ulang seluruh halaman yang sedang
// aktif (mis. tabel Stok/Data Barang yang bisa ribuan baris) — dulu
// mobileOpen disimpan di MainApp yang sama dengan semua data aplikasi,
// jadi tiap klik tombol ☰ ikut me-render ulang SEMUANYA (kerasa lag,
// apalagi di halaman dengan tabel besar). Sekarang mobileOpen cuma dikenal
// komponen ini sendiri — konten halaman (children) sudah "jadi" dari render
// MainApp sebelumnya dan referensinya tidak berubah kalau MainApp sendiri
// tidak re-render, jadi klik ☰ cuma menggeser sidebar tanpa menyentuh
// konten halaman di baliknya. TIDAK ada perubahan tampilan/fitur, murni
// perbaikan kecepatan.
function AppShell({
  active,
  onNavigate,
  badges,
  allowedMenuKeys,
  user,
  onLogout,
  setModal,
  menuLabel,
  subLabel,
  canSee,
  belumSelesaiCount,
  tanpaRakCount,
  navigate,
  loadAll,
  loading,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <Sidebar
        active={active}
        onNavigate={onNavigate}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        badges={badges}
        allowedMenuKeys={allowedMenuKeys}
        user={user}
        onLogout={onLogout}
        setModal={setModal}
      />

      <div className="flex-1 min-w-0">
        {/* Top App Bar Material 3 — selalu tampil di semua halaman (termasuk
            Cetak Label) supaya tombol buka menu di HP tetap bisa diakses.
            Disembunyikan otomatis saat print lewat class print:hidden. */}
        <header className="print:hidden sticky top-0 bg-md-surface/95 backdrop-blur z-20 h-16 flex items-center">
          <div className="px-3 w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 min-w-0">
              <MobileMenuButton onClick={() => setMobileOpen(true)} />
              <div className="min-w-0 px-2">
                <div className="text-base font-medium text-md-on-surface truncate">
                  {menuLabel}{subLabel ? <span className="text-md-on-surface-variant font-normal"> / {subLabel}</span> : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canSee("data-barang") && belumSelesaiCount > 0 && (
                <button
                  onClick={() => navigate("data-barang", null)}
                  onMouseDown={rippleEffect}
                  className={`relative ${iconBtnClass}`}
                  title={`${belumSelesaiCount} barang belum selesai`}
                >
                  <Bell size={17} />
                  <span className="absolute top-1 right-1 text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                    {belumSelesaiCount}
                  </span>
                </button>
              )}
              {canSee("rak") && (
                <button
                  onClick={() => navigate("rak", "tempatkan")}
                  onMouseDown={rippleEffect}
                  className={`relative ${iconBtnClass}`}
                  title={tanpaRakCount > 0 ? `${tanpaRakCount} SKU belum punya rak` : "Tidak ada SKU tanpa rak"}
                >
                  <MapPin size={17} />
                  {tanpaRakCount > 0 && (
                    <span className="absolute top-1 right-1 text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                      {tanpaRakCount}
                    </span>
                  )}
                </button>
              )}
              <button onClick={loadAll} onMouseDown={rippleEffect} className={iconBtnClass} title="Muat ulang">
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </>
  );
}

function MainApp({ session, onLogout }) {
  const allowed = allowedMenus(session.role);

  // Menu terakhir disimpan di sessionStorage supaya begitu halaman di-reload
  // (lihat fungsi navigate di bawah), tampilan langsung kembali ke menu yang
  // baru saja diklik, bukan balik lagi ke dashboard.
  // Landing awal login pakai "dashboard" HANYA untuk role yang dashboard-nya
  // memang halaman utama (superadmin/owner) — role operasional (termasuk
  // gudang) tidak punya akses "dashboard" sama sekali, langsung ke halaman
  // kerja masing-masing (allowed[0]).
  const landingKeDashboard = allowed.includes("dashboard") && ["superadmin", "owner"].includes(session.role);
  const [nav, setNav] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("selma-nav") || "null");
      if (saved && allowed.includes(saved.menu)) return saved;
    } catch {}
    return { menu: landingKeDashboard ? "dashboard" : allowed[0], sub: null };
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [items, setItems] = useState([]);
  const [pesananMasuk, setPesananMasuk] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [skuMaster, setSkuMaster] = useState([]);
  const [rak, setRak] = useState([]);
  const [master, setMaster] = useState({});
  const [settings, setSettings] = useState(null);
  const [penempatan, setPenempatan] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [rakEvents, setRakEvents] = useState([]);
  const [barangRusak, setBarangRusak] = useState([]);
  const [marketplaceNotifAck, setMarketplaceNotifAck] = useState([]);
  const [pelangganGrosir, setPelangganGrosir] = useState([]);
  const [tokoGrosir, setTokoGrosir] = useState([]);
  const [produkManualGrosir, setProdukManualGrosir] = useState([]);
  const [pesananGrosir, setPesananGrosir] = useState([]);
  const [detailPesananGrosir, setDetailPesananGrosir] = useState([]);
  const [pembayaranGrosir, setPembayaranGrosir] = useState([]);
  const [depositGrosir, setDepositGrosir] = useState([]);
  const [keuanganTransaksi, setKeuanganTransaksi] = useState([]);
  const [absensiRows, setAbsensiRows] = useState([]);
  const [karyawanList, setKaryawanList] = useState([]);
  const [pengajuanRestock, setPengajuanRestock] = useState([]);

  const [modal, setModal] = useState(null); // {type, item}
  const [saving, setSaving] = useState(false);
  const hasNotifiedRef = useRef(false);
  const hasNotifiedRakRef = useRef(false);

  const showToast = (msg, kind = "ok", duration = 3200) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), duration);
  };

  // Setiap pindah menu, datanya tetap di-refresh (loadForMenu()) supaya
  // selalu segar — penting karena sistemnya sering dipakai barengan
  // beberapa staf sekaligus. TAPI sebelumnya ini dilakukan lewat
  // window.location.reload() (reload total browser: layar putih kedip,
  // seluruh JS di-parse ulang dari nol, sesi login di-cek ulang) — sekarang
  // cukup ganti state `nav` dan panggil loadForMenu() di background. Selama
  // data lama masih ada di memori (items.length > 0), tampilan lama tetap
  // kelihatan sambil data baru dimuat (lihat kondisi "loading &&
  // items.length === 0" di bawah), jadi pindah menu jadi terasa instan,
  // bukan nunggu reload total tiap kali. loadForMenu() juga cuma menarik
  // data yang relevan sama menu tujuan (bukan SEMUA tabel), lihat penjelasan
  // lengkap di dekat definisinya.
  const navigate = (menu, sub) => {
    if (!allowed.includes(menu)) return;
    const subs = allowedSubMenus(session.role, menu);
    if (subs && sub && !subs.includes(sub)) return;

    if (menu === nav.menu && (sub || null) === (nav.sub || null)) return; // sudah di menu itu, tidak perlu apa-apa

    try {
      sessionStorage.setItem("selma-nav", JSON.stringify({ menu, sub: sub || null }));
    } catch {}
    setModal(null); // dulu ikut ke-reset otomatis gara-gara reload total — sekarang ditutup manual
    setNav({ menu, sub: sub || null });
    // Dulu loadAll() (narik SEMUA 22 tabel) tiap pindah menu — sekarang
    // cukup data yang relevan sama menu tujuan (lihat loadForMenu di atas),
    // supaya pindah menu jadi jauh lebih ringan tanpa kehilangan data fresh
    // yang memang dibutuhkan menu itu.
    loadForMenu(menu);
  };

  // Aksi satu-klik untuk tahap yang tidak butuh form (marketplace)
  const quickAdvance = async (item, stage) => {
    const patches = {
      marketplace: {
        marketplace_status: "sudah",
        marketplace_uploaded_at: new Date().toISOString(),
        stage: "selesai",
      },
    };
    const messages = {
      marketplace: "Ditandai sudah upload — selesai!",
    };
    try {
      await sb(`items?id=eq.${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patches[stage]),
      });
      await loadCore(); // cuma tabel items yang berubah — bagian dari core
      showToast(messages[stage]);
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    }
  };

  // Konfirmasi notifikasi "Cek Marketplace" (stok tipis / stok bertambah /
  // rak berubah) — simpan key-nya sebagai "sudah dikonfirmasi". Kalau kena
  // duplikat (mis. sudah diklik dari sesi lain persis di saat yang sama),
  // anggap sukses, cukup refresh datanya. Terima satu key (string) atau
  // banyak key sekaligus (array) — dipakai fitur "bulk aksi" khusus
  // superadmin di halaman Cek Marketplace, dikirim jadi satu kali POST saja.
  const ackNotif = async (keyOrKeys) => {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    if (keys.length === 0) return;
    try {
      await sb("marketplace_notif_ack?on_conflict=notif_key", {
        method: "POST",
        prefer: "return=representation,resolution=merge-duplicates",
        body: JSON.stringify(keys.map((k) => ({ notif_key: k }))),
      });
      await loadCore(); // cuma tabel marketplace_notif_ack yang berubah — bagian dari core
    } catch (e) {
      if (e.pgCode === "23505") {
        await loadCore();
        return;
      }
      showToast(e.message || "Gagal menyimpan konfirmasi", "err");
    }
  };

  // ---- Loader per "kelompok data" -----------------------------------------
  // loadAll() (dulu) selalu menarik SEMUA 22 tabel tiap kali pindah menu —
  // termasuk data Grosir/Keuangan/Absensi yang sebenarnya cuma dipakai di
  // halaman masing-masing. Efeknya app kerasa berat terus-menerus (tiap
  // klik menu = 22 request + render ulang semua data), apalagi di WebView
  // Android yang lebih berat dibanding browser desktop.
  // Sekarang dipecah jadi 4 kelompok:
  //  - loadCore()    : dipakai badge sidebar & hampir semua halaman gudang
  //                    (persetujuan restok, barang datang/masuk, data
  //                    barang, sku & harga, stok, rak, cetak label, foto,
  //                    marketplace, pengaturan) — SELALU ditarik tiap
  //                    pindah menu karena badge sidebar butuh ini.
  //  - loadGrosir()  : data modul Grosir saja — cuma ditarik kalau lagi
  //                    buka menu Grosir (atau Dashboard).
  //  - loadKeuangan(): data modul Keuangan saja — cuma ditarik kalau lagi
  //                    buka menu Keuangan (atau Dashboard).
  //  - loadAbsensi() : dipakai HANYA oleh tab "Dashboard Absensi" (halaman
  //                    Absensi sendiri sudah narik datanya sendiri-sendiri,
  //                    lihat pages/Absensi.jsx) — cuma ditarik kalau lagi
  //                    buka Dashboard.
  // loadAll() (gabungan keempatnya) TETAP dipakai untuk: load pertama kali
  // app dibuka, tombol "Muat ulang" manual di header, dan tiap kali ada
  // form/modal yang habis disimpan (reload={loadAll} di banyak tempat) —
  // supaya data yang direfresh setelah SIMPAN tetap lengkap seperti semula,
  // TIDAK ada perubahan di situ. Yang berubah cuma pemicu OTOMATIS saat
  // pindah-pindah menu (lihat loadForMenu & fungsi navigate di bawah).
  const loadCore = useCallback(async () => {
    const [itemsRes, pesananMasukRes, supplierRes, skuRes, rakRes, masterRes, settingsRes, penempatanRes, historyRes, rakEventsRes, barangRusakRes, notifAckRes, pengajuanRestockRes] = await Promise.all([
      sbAll("items?select=*&order=created_at.desc"),
      sbAll("pesanan_masuk?select=*&order=created_at.desc"),
      sbAll("suppliers?select=*&order=nama"),
      sbAll("sku_master?select=*&order=created_at.desc"),
      sbAll("rak?select=*&order=code"),
      sbAll("master_data?select=*&order=label"),
      sb("settings?select=*"),
      sbAll("penempatan?select=*&order=created_at.desc"),
      sbAll("stock_history?select=*&order=created_at.desc"),
      sbAll("rak_events?select=*&order=created_at.desc"),
      sbAll("barang_rusak?select=*&order=created_at.desc"),
      sbAll("marketplace_notif_ack?select=*"),
      sbAll("pengajuan_restock?select=*&order=created_at.desc"),
    ]);
    setItems(itemsRes || []);
    setPesananMasuk(pesananMasukRes || []);
    setSuppliers(supplierRes || []);
    setSkuMaster(skuRes || []);
    setRak(rakRes || []);
    const grouped = {};
    (masterRes || []).forEach((m) => {
      grouped[m.tipe] = grouped[m.tipe] || [];
      grouped[m.tipe].push(m);
    });
    setMaster(grouped);
    setSettings((settingsRes || [])[0] || null);
    setPenempatan(penempatanRes || []);
    setStockHistory(historyRes || []);
    setRakEvents(rakEventsRes || []);
    setBarangRusak(barangRusakRes || []);
    setMarketplaceNotifAck(notifAckRes || []);
    setPengajuanRestock(pengajuanRestockRes || []);
  }, []);

  const loadGrosir = useCallback(async () => {
    const [pelangganRes, tokoRes, produkManualRes, pesananRes, detailPesananRes, pembayaranRes, depositRes] = await Promise.all([
      sbAll("grosir_pelanggan?select=*&order=nama"),
      sbAll("grosir_toko?select=*&order=nama_toko"),
      sbAll("grosir_produk_manual?select=*&order=nama_produk"),
      sbAll("grosir_pesanan?select=*&order=created_at.desc"),
      sbAll("grosir_detail_pesanan?select=*"),
      sbAll("grosir_pembayaran?select=*&order=created_at.desc"),
      sbAll("grosir_deposit?select=*&order=created_at.desc"),
    ]);
    setPelangganGrosir(pelangganRes || []);
    setTokoGrosir(tokoRes || []);
    setProdukManualGrosir(produkManualRes || []);
    setPesananGrosir(pesananRes || []);
    setDetailPesananGrosir(detailPesananRes || []);
    setPembayaranGrosir(pembayaranRes || []);
    setDepositGrosir(depositRes || []);
  }, []);

  const loadKeuangan = useCallback(async () => {
    const keuanganRes = await sbAll("keuangan_transaksi?select=*&order=tanggal.desc");
    setKeuanganTransaksi(keuanganRes || []);
  }, []);

  const loadAbsensi = useCallback(async () => {
    const [absensiRes, karyawanRes] = await Promise.all([listAbsensi(), listKaryawan()]);
    setAbsensiRows(absensiRes || []);
    setKaryawanList(karyawanRes || []);
  }, []);

  // Bungkus 1+ loader di atas jadi satu pemanggilan dengan indikator
  // loading & error yang seragam — persis perilaku loadAll() yang lama.
  const runLoaders = useCallback(async (...loaders) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all(loaders.map((fn) => fn()));
    } catch (e) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAll = useCallback(
    () => runLoaders(loadCore, loadGrosir, loadKeuangan, loadAbsensi),
    [runLoaders, loadCore, loadGrosir, loadKeuangan, loadAbsensi]
  );

  // Data apa saja yang perlu ditarik tergantung menu yang dituju — dashboard
  // butuh semuanya (dia nampilin ringkasan tiap modul dalam beberapa tab),
  // Grosir & Keuangan cuma butuh datanya sendiri (+ core buat badge &
  // data gabungan seperti skuMasterGrosir), sisanya cukup loadCore saja.
  const loadForMenu = useCallback(
    (menu) => {
      if (menu === "dashboard") return runLoaders(loadCore, loadGrosir, loadKeuangan, loadAbsensi);
      if (menu === "grosir") return runLoaders(loadCore, loadGrosir);
      if (menu === "keuangan") return runLoaders(loadCore, loadKeuangan);
      return runLoaders(loadCore);
    },
    [runLoaders, loadCore, loadGrosir, loadKeuangan, loadAbsensi]
  );

  useEffect(() => {
    // Sengaja cuma sekali saat app pertama dibuka, pakai menu awal (nav.menu)
    // saat itu — pindah menu berikutnya sudah ditangani fungsi navigate().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadForMenu(nav.menu);
  }, []);

  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = items.filter((i) => i.stage === s).length;
    return acc;
  }, {});
  const totalStok = skuMaster.reduce((a, s) => a + (s.stok || 0), 0);

  // SKU yang sudah tuntas alur barangnya (stage "selesai" — sama dengan sudah
  // diupload ke marketplace, lihat quickAdvance) — inilah barang yang boleh
  // dipilih untuk transaksi Grosir. Ditandai lewat flag "siapGrosir" di
  // skuMaster (bukan filter array) supaya skuMaster tetap utuh dipakai
  // halaman lain (SKU & Harga, Stok, Rak, Marketplace, Laporan, dll).
  const skuSelesaiSet = new Set(
    items.filter((i) => i.stage === "selesai" && i.sku).map((i) => i.sku)
  );
  const skuMasterGrosir = skuMaster.map((s) => ({ ...s, siapGrosir: skuSelesaiSet.has(s.sku) }));
  const belumSelesaiCount = items.filter((i) => i.stage !== "selesai").length;

  // SKU tanpa rak = barang yang belum pernah ditempatkan + SKU yang rak lamanya
  // sudah ditimpa SKU lain (butuh ditempatkan ulang).
  const perluRakUlang = cariPerluDitempatkanUlang(skuMaster, penempatan);
  const tanpaRakCount = stageCounts.rak + perluRakUlang.length;
  // Rak Terpakai (Dashboard) = rak yang benar-benar masih diisi SKU berstok > 0,
  // pakai logika yang SAMA dengan Peta Rak supaya angkanya selalu sinkron.
  const rakTerpakaiList = rakTerpakai(rak, penempatan, skuMaster);
  const rakTerpakaiCount = rakTerpakaiList.length;
  // Rak Kosong (Dashboard) = rak yang terdaftar tapi tidak ada di daftar rak terpakai.
  const rakKosong = rak.filter((r) => !rakTerpakaiList.some((t) => t.id === r.id));
  // Sisa di Gudang = SKU berstok yang belum sepenuhnya masuk rak (belum pernah
  // ditempatkan, atau rak yang biasa dipakai sudah penuh sehingga sisanya nyangkut).
  const sisaGudangList = barangSisaDiGudang(skuMaster, rak, penempatan);
  // Cek Marketplace — notifikasi stok tipis/habis, stok bertambah, dan rak
  // berubah, dikurangi yang sudah dikonfirmasi (marketplace_notif_ack).
  const ackedKeys = new Set((marketplaceNotifAck || []).map((a) => a.notif_key));
  const historyMap = latestHistoryBySku(stockHistory);
  const notifTipis = computeStokTipisNotifs(skuMaster, historyMap).filter((n) => !ackedKeys.has(n.key));
  const notifTambah = computeStokTambahNotifs(skuMaster, historyMap).filter((n) => !ackedKeys.has(n.key));
  const notifRak = computeRakBerubahNotifs(skuMaster, rak, penempatan).filter((n) => !ackedKeys.has(n.key));
  const notifRakPindah = computeRakPindahNotifs(rakEvents).filter((n) => !ackedKeys.has(n.key));
  const notifRakKosong = computeRakKosongNotifs(rak, penempatan, rakEvents).filter((n) => !ackedKeys.has(n.key));
  const cekMarketplaceCount =
    notifTipis.length + notifTambah.length + notifRak.length + notifRakPindah.length + notifRakKosong.length;

  const stokMenipisCount = skuMaster.filter(
    (s) => !s.nonaktif && Number(s.stok || 0) <= AMBANG_MENIPIS_RESTOCK
  ).length;

  // Badge di menu "Persetujuan Restok" (sidebar) = jumlah pengajuan restock
  // yang masih "menunggu" — supaya owner/superadmin langsung lihat ada yang
  // perlu ditinjau tanpa harus buka halamannya dulu (reminder pasif, bukan
  // notifikasi push — cukup untuk kasus ini karena menu ini memang sudah
  // dibatasi hanya untuk role owner/superadmin di ROLE_MENUS).
  const pengajuanMenungguCount = (pengajuanRestock || []).filter((p) => p.status === "menunggu").length;

  const sidebarBadges = withParentBadges(NAV, {
    "persetujuan-restock": pengajuanMenungguCount,
    "sku-harga.buat": stageCounts.sku,
    "rak.tempatkan": tanpaRakCount,
    "rak.gudang": sisaGudangList.length,
    "stok.menipis": stokMenipisCount,
    foto: stageCounts.verifikasi,
    "marketplace.belum": stageCounts.marketplace,
    "marketplace.cek": cekMarketplaceCount,
  });
  const belumSelesaiBreakdown = STAGE_ORDER.filter((s) => s !== "selesai")
    .map((s) => ({ label: STAGE_META[s]?.label || s, count: stageCounts[s] }))
    .filter((s) => s.count > 0);

  // Notif sekali saat data pertama kali selesai dimuat (bukan tiap reload manual).
  useEffect(() => {
    if (!loading && !hasNotifiedRef.current && items.length > 0) {
      hasNotifiedRef.current = true;
      if (belumSelesaiCount > 0) {
        const rincian = belumSelesaiBreakdown
          .map((s) => `${s.count} di ${s.label}`)
          .join(", ");
        showToast(`${belumSelesaiCount} barang belum selesai: ${rincian}`, "warn", 6000);
      }
    }
  }, [loading, items, belumSelesaiCount]);

  // Notif terpisah khusus SKU tanpa rak — digeser sedikit biar tidak tabrakan
  // dengan toast "belum selesai" di atas (toast cuma bisa tampil satu per waktu).
  useEffect(() => {
    if (!loading && !hasNotifiedRakRef.current && items.length > 0) {
      hasNotifiedRakRef.current = true;
      if (tanpaRakCount > 0) {
        const delay = belumSelesaiCount > 0 ? 6300 : 0;
        setTimeout(() => {
          showToast(`${tanpaRakCount} SKU belum punya rak — cek Tempatkan Barang`, "warn", 5000);
        }, delay);
      }
    }
  }, [loading, items, tanpaRakCount, belumSelesaiCount]);

  const { menuLabel, subLabel } = findNavLabel(nav.menu, nav.sub);
  const canSee = (menuKey) => allowed.includes(menuKey);
  const canSeeSub = (menuKey, subKey) => {
    if (!subKey) return true;
    const subs = allowedSubMenus(session.role, menuKey);
    return !subs || subs.includes(subKey);
  };

  return (
    <div className="min-h-screen bg-md-surface text-md-on-surface font-sans flex">
      <AppShell
        active={nav}
        onNavigate={navigate}
        badges={sidebarBadges}
        allowedMenuKeys={allowed}
        user={session}
        onLogout={onLogout}
        setModal={setModal}
        menuLabel={menuLabel}
        subLabel={subLabel}
        canSee={canSee}
        belumSelesaiCount={belumSelesaiCount}
        tanpaRakCount={tanpaRakCount}
        navigate={navigate}
        loadAll={loadAll}
        loading={loading}
      >
        <main className="px-5 py-6 max-w-6xl">
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-md-error-container text-md-on-error-container text-sm px-4 py-3 rounded-md-md">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-md-on-surface-variant gap-2 text-sm">
              <Loader2 size={18} className="animate-spin" /> Memuat data…
            </div>
          ) : !canSee(nav.menu) || !canSeeSub(nav.menu, nav.sub) ? (
            <div className="flex items-center justify-center py-24 text-md-on-surface-variant text-sm">
              Anda tidak punya akses ke halaman ini.
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-24 text-md-on-surface-variant gap-2 text-sm">
                  <Loader2 size={18} className="animate-spin" /> Memuat halaman…
                </div>
              }
            >
              {nav.menu === "dashboard" && (
                <Dashboard
                  stageCounts={stageCounts}
                  skuCount={skuMaster.length}
                  totalStok={totalStok}
                  rakCount={rakTerpakaiCount}
                  rakKosong={rakKosong}
                  items={items}
                  onNavigate={navigate}
                  setModal={setModal}
                  pesananMasuk={pesananMasuk}
                  penempatan={penempatan}
                  pesananGrosir={pesananGrosir}
                  pembayaranGrosir={pembayaranGrosir}
                  depositGrosir={depositGrosir}
                  pelangganGrosir={pelangganGrosir}
                  keuanganTransaksi={keuanganTransaksi}
                  master={master}
                  absensiRows={absensiRows}
                  karyawanList={karyawanList}
                  pengajuanRestock={pengajuanRestock}
                />
              )}
              {nav.menu === "persetujuan-restock" && (
                <PersetujuanRestock
                  pengajuanRestock={pengajuanRestock}
                  session={session}
                  setModal={setModal}
                  filterJenis={nav.sub}
                  onNavigate={navigate}
                />
              )}
              {nav.menu === "barang-datang" && (
                <BarangDatang
                  sub={nav.sub || "datang"}
                  pesananMasuk={pesananMasuk}
                  suppliers={suppliers}
                  setModal={setModal}
                />
              )}
              {nav.menu === "barang-masuk" && (
                <BarangMasuk items={items} setModal={setModal} />
              )}
              {nav.menu === "data-barang" && (
                <DataBarang items={items} penempatan={penempatan} setModal={setModal} />
              )}
              {nav.menu === "sku-harga" && (
                <SkuHarga
                  sub={nav.sub || "buat"}
                  items={items}
                  skuMaster={skuMaster}
                  master={master}
                  penempatan={penempatan}
                  setModal={setModal}
                  reload={loadAll}
                  showToast={showToast}
                  session={session}
                  barangRusak={barangRusak}
                  pesananMasuk={pesananMasuk}
                />
              )}
              {nav.menu === "stok" && (
                <Stok
                  sub={nav.sub || "barang"}
                  skuMaster={skuMaster}
                  penempatan={penempatan}
                  stockHistory={stockHistory}
                  pengajuanRestock={pengajuanRestock}
                  session={session}
                  setModal={setModal}
                />
              )}
              {nav.menu === "rak" && (
                <Rak
                  sub={nav.sub || "tempatkan"}
                  items={items}
                  rak={rak}
                  penempatan={penempatan}
                  skuMaster={skuMaster}
                  master={master}
                  pengajuanRestock={pengajuanRestock}
                  session={session}
                  setModal={setModal}
                />
              )}
              {nav.menu === "cetak-label" && (
                <CetakLabel items={items} skuMaster={skuMaster} penempatan={penempatan} rak={rak} master={master} />
              )}
              {nav.menu === "foto" && (
                <FotoProduk items={items} setModal={setModal} skuMaster={skuMaster} settings={settings} />
              )}
              {nav.menu === "marketplace" && (
                <Marketplace
                  sub={nav.sub || "belum"}
                  items={items}
                  quickAdvance={quickAdvance}
                  setModal={setModal}
                  skuMaster={skuMaster}
                  rak={rak}
                  penempatan={penempatan}
                  stockHistory={stockHistory}
                  navigate={navigate}
                  notifTipis={notifTipis}
                  notifTambah={notifTambah}
                  notifRak={notifRak}
                  notifRakPindah={notifRakPindah}
                  notifRakKosong={notifRakKosong}
                  ackNotif={ackNotif}
                  session={session}
                />
              )}
              {nav.menu === "grosir" && (
                <Grosir
                  sub={nav.sub || "semua-pesanan"}
                  pelangganGrosir={pelangganGrosir}
                  tokoGrosir={tokoGrosir}
                  produkManualGrosir={produkManualGrosir}
                  skuMaster={skuMasterGrosir}
                  pesananGrosir={pesananGrosir}
                  detailPesananGrosir={detailPesananGrosir}
                  pembayaranGrosir={pembayaranGrosir}
                  depositGrosir={depositGrosir}
                  reload={loadAll}
                  showToast={showToast}
                  setModal={setModal}
                />
              )}
              {nav.menu === "keuangan" && (
                <Keuangan
                  sub={nav.sub || "transaksi"}
                  keuanganTransaksi={keuanganTransaksi}
                  master={master}
                  reload={loadAll}
                  showToast={showToast}
                  setModal={setModal}
                />
              )}
              {nav.menu === "absensi" && (
                <Absensi sub={nav.sub || "rekap"} showToast={showToast} session={session} />
              )}
              {nav.menu === "pengaturan" && (
                <Pengaturan settings={settings} reload={loadAll} showToast={showToast} session={session} />
              )}
            </Suspense>
          )}
        </main>
      </AppShell>

      {modal && (
        <ModalRouter
          modal={modal}
          setModal={setModal}
          master={master}
          settings={settings}
          rakList={rak}
          skuMaster={skuMasterGrosir}
          penempatan={penempatan}
          items={items}
          pesananMasuk={pesananMasuk}
          suppliers={suppliers}
          keuanganTransaksi={keuanganTransaksi}
          saving={saving}
          setSaving={setSaving}
          reload={loadAll}
          showToast={showToast}
          session={session}
          quickAdvance={quickAdvance}
          pelangganGrosir={pelangganGrosir}
          tokoGrosir={tokoGrosir}
          produkManualGrosir={produkManualGrosir}
          pesananGrosir={pesananGrosir}
          detailPesananGrosir={detailPesananGrosir}
          pembayaranGrosir={pembayaranGrosir}
          depositGrosir={depositGrosir}
        />
      )}

      {/* Snackbar Material 3 — sudut kecil (4px, khas snackbar, beda dari
          dialog/kartu yang membulat besar), permukaan inverse + elevation 3. */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 max-w-xs px-4 py-3.5 rounded-md-xs text-sm font-medium shadow-elevation-3 z-50 ${
            toast.kind === "ok"
              ? "bg-emerald-200 text-emerald-950"
              : toast.kind === "warn"
              ? "bg-md-primary text-md-on-primary"
              : "bg-md-error-container text-md-on-error-container"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}