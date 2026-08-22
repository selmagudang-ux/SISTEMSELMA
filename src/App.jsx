import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertCircle, Loader2, Bell, MapPin } from "lucide-react";
import { sb, sbAll } from "./lib/api";
import { STAGE_ORDER, STAGE_META, findNavLabel, allowedMenus, allowedSubMenus, NAV, withParentBadges } from "./lib/constants";
import { getSession, logout } from "./lib/auth";
import { getAbsenSession, logoutKaryawan } from "./lib/absensi";
import Sidebar, { MobileMenuButton } from "./components/Sidebar";
import ModalRouter from "./components/ModalRouter";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import BarangDatang from "./pages/BarangDatang";
import BarangMasuk from "./pages/BarangMasuk";
import DataBarang from "./pages/DataBarang";
import Rusak from "./pages/Rusak";
import SkuHarga from "./pages/SkuHarga";
import Stok from "./pages/Stok";
import Rak, { cariPerluDitempatkanUlang, rakTerpakai, barangSisaDiGudang } from "./pages/Rak";
import CetakLabel from "./pages/CetakLabel";
import FotoProduk from "./pages/FotoProduk";
import Marketplace from "./pages/Marketplace";
import { latestHistoryBySku, computeStokTipisNotifs, computeStokTambahNotifs, computeRakBerubahNotifs, computeRakPindahNotifs, computeRakKosongNotifs } from "./lib/marketplaceNotif";
import Grosir from "./pages/Grosir";
import Keuangan from "./pages/Keuangan";
import Pengaturan from "./pages/Pengaturan";
import Absensi from "./pages/Absensi";
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

function MainApp({ session, onLogout }) {
  const allowed = allowedMenus(session.role);

  // Menu terakhir disimpan di sessionStorage supaya begitu halaman di-reload
  // (lihat fungsi navigate di bawah), tampilan langsung kembali ke menu yang
  // baru saja diklik, bukan balik lagi ke dashboard.
  const [nav, setNav] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("selma-nav") || "null");
      if (saved && allowed.includes(saved.menu)) return saved;
    } catch {}
    return { menu: allowed.includes("dashboard") ? "dashboard" : allowed[0], sub: null };
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [items, setItems] = useState([]);
  const [pesananMasuk, setPesananMasuk] = useState([]);
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

  const [modal, setModal] = useState(null); // {type, item}
  const [saving, setSaving] = useState(false);
  const hasNotifiedRef = useRef(false);
  const hasNotifiedRakRef = useRef(false);

  const showToast = (msg, kind = "ok", duration = 3200) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), duration);
  };

  // Cegah akses ke menu (atau sub-menu) yang tidak diizinkan untuk role ini
  // (mis. lewat state lama, atau URL/badge yang mengarah ke sub tertentu).
  // Setiap pindah menu, halaman di-reload penuh (bukan cuma ganti state React)
  // supaya datanya selalu segar — menu tujuan disimpan dulu ke sessionStorage
  // supaya setelah reload langsung terbuka di menu itu (lihat useState nav).
  const navigate = (menu, sub) => {
    if (!allowed.includes(menu)) return;
    const subs = allowedSubMenus(session.role, menu);
    if (subs && sub && !subs.includes(sub)) return;

    if (menu === nav.menu && (sub || null) === (nav.sub || null)) return; // sudah di menu itu, tidak perlu reload

    try {
      sessionStorage.setItem("selma-nav", JSON.stringify({ menu, sub: sub || null }));
    } catch {}
    window.location.reload();
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
      await loadAll();
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
      await loadAll();
    } catch (e) {
      if (e.pgCode === "23505") {
        await loadAll();
        return;
      }
      showToast(e.message || "Gagal menyimpan konfirmasi", "err");
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, pesananMasukRes, skuRes, rakRes, masterRes, settingsRes, penempatanRes, historyRes, rakEventsRes, barangRusakRes, notifAckRes, pelangganRes, tokoRes, produkManualRes, pesananRes, detailPesananRes, pembayaranRes, depositRes, keuanganRes, absensiRes, karyawanRes] = await Promise.all([
        sbAll("items?select=*&order=created_at.desc"),
        sbAll("pesanan_masuk?select=*&order=created_at.desc"),
        sbAll("sku_master?select=*&order=created_at.desc"),
        sbAll("rak?select=*&order=code"),
        sbAll("master_data?select=*&order=label"),
        sb("settings?select=*"),
        sbAll("penempatan?select=*&order=created_at.desc"),
        sbAll("stock_history?select=*&order=created_at.desc"),
        sbAll("rak_events?select=*&order=created_at.desc"),
        sbAll("barang_rusak?select=*&order=created_at.desc"),
        sbAll("marketplace_notif_ack?select=*"),
        sbAll("grosir_pelanggan?select=*&order=nama"),
        sbAll("grosir_toko?select=*&order=nama_toko"),
        sbAll("grosir_produk_manual?select=*&order=nama_produk"),
        sbAll("grosir_pesanan?select=*&order=created_at.desc"),
        sbAll("grosir_detail_pesanan?select=*"),
        sbAll("grosir_pembayaran?select=*&order=created_at.desc"),
        sbAll("grosir_deposit?select=*&order=created_at.desc"),
        sbAll("keuangan_transaksi?select=*&order=tanggal.desc"),
        listAbsensi(),
        listKaryawan(),
      ]);
      setItems(itemsRes || []);
      setPesananMasuk(pesananMasukRes || []);
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
      setPelangganGrosir(pelangganRes || []);
      setTokoGrosir(tokoRes || []);
      setProdukManualGrosir(produkManualRes || []);
      setPesananGrosir(pesananRes || []);
      setDetailPesananGrosir(detailPesananRes || []);
      setPembayaranGrosir(pembayaranRes || []);
      setDepositGrosir(depositRes || []);
      setKeuanganTransaksi(keuanganRes || []);
      setAbsensiRows(absensiRes || []);
      setKaryawanList(karyawanRes || []);
    } catch (e) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  const sidebarBadges = withParentBadges(NAV, {
    "sku-harga.buat": stageCounts.sku,
    "rak.tempatkan": tanpaRakCount,
    "rak.gudang": sisaGudangList.length,
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex">
      <Sidebar
        active={nav}
        onNavigate={navigate}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        badges={sidebarBadges}
        allowedMenuKeys={allowed}
        user={session}
        onLogout={onLogout}
        setModal={setModal}
      />

      <div className="flex-1 min-w-0">
        {/* Header — selalu tampil di semua halaman (termasuk Cetak Label) supaya
            tombol buka menu di HP tetap bisa diakses. Disembunyikan otomatis saat
            print lewat class print:hidden. */}
        <header className="print:hidden border-b border-slate-800 sticky top-0 bg-slate-950/90 backdrop-blur z-20">
          <div className="px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <MobileMenuButton onClick={() => setMobileOpen(true)} />
              <div className="min-w-0">
                <div className="text-xs text-slate-500 truncate">
                  {menuLabel}{subLabel ? ` / ${subLabel}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canSee("data-barang") && belumSelesaiCount > 0 && (
                <button
                  onClick={() => navigate("data-barang", null)}
                  className="relative p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  title={`${belumSelesaiCount} barang belum selesai`}
                >
                  <Bell size={14} />
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                    {belumSelesaiCount}
                  </span>
                </button>
              )}
              {canSee("rak") && (
                <button
                  onClick={() => navigate("rak", "tempatkan")}
                  className="relative p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  title={tanpaRakCount > 0 ? `${tanpaRakCount} SKU belum punya rak` : "Tidak ada SKU tanpa rak"}
                >
                  <MapPin size={14} />
                  {tanpaRakCount > 0 && (
                    <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                      {tanpaRakCount}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={loadAll}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                title="Muat ulang"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-5 py-6 max-w-6xl">
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-slate-500 gap-2 text-sm">
              <Loader2 size={18} className="animate-spin" /> Memuat data…
            </div>
          ) : !canSee(nav.menu) || !canSeeSub(nav.menu, nav.sub) ? (
            <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
              Anda tidak punya akses ke halaman ini.
            </div>
          ) : (
            <>
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
                  pesananGrosir={pesananGrosir}
                  pembayaranGrosir={pembayaranGrosir}
                  depositGrosir={depositGrosir}
                  pelangganGrosir={pelangganGrosir}
                  keuanganTransaksi={keuanganTransaksi}
                  master={master}
                  absensiRows={absensiRows}
                  karyawanList={karyawanList}
                />
              )}
              {nav.menu === "barang-datang" && (
                <BarangDatang pesananMasuk={pesananMasuk} setModal={setModal} />
              )}
              {nav.menu === "barang-masuk" && (
                <BarangMasuk items={items} setModal={setModal} />
              )}
              {nav.menu === "data-barang" && (
                <DataBarang items={items} penempatan={penempatan} setModal={setModal} />
              )}
              {nav.menu === "rusak" && (
                <Rusak barangRusak={barangRusak} pesananMasuk={pesananMasuk} setModal={setModal} />
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
                />
              )}
              {nav.menu === "stok" && (
                <Stok sub={nav.sub || "barang"} skuMaster={skuMaster} penempatan={penempatan} stockHistory={stockHistory} setModal={setModal} />
              )}
              {nav.menu === "rak" && (
                <Rak sub={nav.sub || "tempatkan"} items={items} rak={rak} penempatan={penempatan} skuMaster={skuMaster} master={master} setModal={setModal} />
              )}
              {nav.menu === "cetak-label" && (
                <CetakLabel items={items} skuMaster={skuMaster} penempatan={penempatan} rak={rak} master={master} />
              )}
              {nav.menu === "foto" && (
                <FotoProduk items={items} setModal={setModal} />
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
            </>
          )}
        </main>
      </div>

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

      {toast && (
        <div
          className={`fixed bottom-5 right-5 max-w-xs px-4 py-3 rounded-lg text-sm font-medium shadow-xl z-50 ${
            toast.kind === "ok"
              ? "bg-emerald-500 text-slate-950"
              : toast.kind === "warn"
              ? "bg-amber-500 text-slate-950"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}