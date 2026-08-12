import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Plus, AlertCircle, Loader2, Bell, MapPin } from "lucide-react";
import { sb } from "./lib/api";
import { STAGE_ORDER, STAGE_META, findNavLabel, allowedMenus } from "./lib/constants";
import { getSession, logout } from "./lib/auth";
import Sidebar, { MobileMenuButton } from "./components/Sidebar";
import ModalRouter from "./components/ModalRouter";
import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import BarangMasuk from "./pages/BarangMasuk";
import DataBarang from "./pages/DataBarang";
import SkuHarga from "./pages/SkuHarga";
import Stok from "./pages/Stok";
import Rak, { cariPerluDitempatkanUlang, rakTerpakai } from "./pages/Rak";
import CetakLabel from "./pages/CetakLabel";
import FotoProduk from "./pages/FotoProduk";
import Marketplace from "./pages/Marketplace";
import Laporan from "./pages/Laporan";
import Pengaturan from "./pages/Pengaturan";

export default function SistemSelmaApp() {
  const [session, setSession] = useState(() => getSession());

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  return <MainApp session={session} onLogout={() => { logout(); setSession(null); }} />;
}

function MainApp({ session, onLogout }) {
  const allowed = allowedMenus(session.role);

  const [nav, setNav] = useState({
    menu: allowed.includes("dashboard") ? "dashboard" : allowed[0],
    sub: null,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [items, setItems] = useState([]);
  const [skuMaster, setSkuMaster] = useState([]);
  const [rak, setRak] = useState([]);
  const [master, setMaster] = useState({});
  const [settings, setSettings] = useState(null);
  const [penempatan, setPenempatan] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);

  const [modal, setModal] = useState(null); // {type, item}
  const [saving, setSaving] = useState(false);
  const hasNotifiedRef = useRef(false);
  const hasNotifiedRakRef = useRef(false);

  const showToast = (msg, kind = "ok", duration = 3200) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), duration);
  };

  // Cegah akses ke menu yang tidak diizinkan untuk role ini (mis. lewat state lama).
  const navigate = (menu, sub) => {
    if (!allowed.includes(menu)) return;
    setNav({ menu, sub });
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, skuRes, rakRes, masterRes, settingsRes, penempatanRes, historyRes] = await Promise.all([
        sb("items?select=*&order=created_at.desc"),
        sb("sku_master?select=*&order=created_at.desc"),
        sb("rak?select=*&order=code"),
        sb("master_data?select=*&order=label"),
        sb("settings?select=*"),
        sb("penempatan?select=*&order=created_at.desc"),
        sb("stock_history?select=*&order=created_at.desc"),
      ]);
      setItems(itemsRes || []);
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

  const sidebarBadges = {
    "sku-harga": stageCounts.sku,
    "sku-harga.buat": stageCounts.sku,
    rak: tanpaRakCount,
    "rak.tempatkan": tanpaRakCount,
    foto: stageCounts.verifikasi,
    "foto.pemotretan": stageCounts.verifikasi,
    marketplace: stageCounts.marketplace,
    "marketplace.belum": stageCounts.marketplace,
  };
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
              {canSee("barang-masuk") && (
                <button
                  onClick={() => setModal({ type: "barang-masuk" })}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
                >
                  <Plus size={14} /> <span className="hidden sm:inline">Barang Masuk</span>
                </button>
              )}
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
          ) : !canSee(nav.menu) ? (
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
                />
              )}
              {nav.menu === "barang-masuk" && (
                <BarangMasuk items={items} setModal={setModal} />
              )}
              {nav.menu === "data-barang" && (
                <DataBarang items={items} penempatan={penempatan} setModal={setModal} />
              )}
              {nav.menu === "sku-harga" && (
                <SkuHarga sub={nav.sub || "buat"} items={items} skuMaster={skuMaster} master={master} setModal={setModal} />
              )}
              {nav.menu === "stok" && (
                <Stok sub={nav.sub || "barang"} skuMaster={skuMaster} penempatan={penempatan} stockHistory={stockHistory} setModal={setModal} />
              )}
              {nav.menu === "rak" && (
                <Rak sub={nav.sub || "tempatkan"} items={items} rak={rak} penempatan={penempatan} skuMaster={skuMaster} setModal={setModal} />
              )}
              {nav.menu === "cetak-label" && (
                <CetakLabel items={items} skuMaster={skuMaster} penempatan={penempatan} rak={rak} master={master} />
              )}
              {nav.menu === "foto" && (
                <FotoProduk items={items} setModal={setModal} />
              )}
              {nav.menu === "marketplace" && (
                <Marketplace sub={nav.sub || "belum"} items={items} quickAdvance={quickAdvance} setModal={setModal} />
              )}
              {nav.menu === "laporan" && <Laporan items={items} skuMaster={skuMaster} rak={rak} />}
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
          skuMaster={skuMaster}
          penempatan={penempatan}
          saving={saving}
          setSaving={setSaving}
          reload={loadAll}
          showToast={showToast}
          session={session}
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