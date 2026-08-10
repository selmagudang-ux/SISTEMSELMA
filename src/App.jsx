import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Plus, AlertCircle, Loader2 } from "lucide-react";
import { sb } from "./lib/api";
import { STAGE_ORDER, findNavLabel } from "./lib/constants";
import Sidebar, { MobileMenuButton } from "./components/Sidebar";
import ModalRouter from "./components/ModalRouter";

import Dashboard from "./pages/Dashboard";
import BarangMasuk from "./pages/BarangMasuk";
import DataBarang from "./pages/DataBarang";
import SkuHarga from "./pages/SkuHarga";
import Stok from "./pages/Stok";
import Rak from "./pages/Rak";
import FotoProduk from "./pages/FotoProduk";
import Marketplace from "./pages/Marketplace";
import Laporan from "./pages/Laporan";
import MasterData from "./pages/MasterData";
import Pengaturan from "./pages/Pengaturan";

export default function SistemSelmaApp() {
  const [nav, setNav] = useState({ menu: "dashboard", sub: null });
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

  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  };

  const navigate = (menu, sub) => setNav({ menu, sub });

  // Aksi satu-klik untuk tahap yang tidak butuh form (sample, marketplace)
  const quickAdvance = async (item, stage) => {
    const patches = {
      sample: { sample_status: "diambil", stage: "verifikasi" },
      marketplace: {
        marketplace_status: "sudah",
        marketplace_uploaded_at: new Date().toISOString(),
        stage: "selesai",
      },
    };
    const messages = {
      sample: "Sample ditandai diambil",
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
  const sidebarBadges = { "data-barang": belumSelesaiCount };

  // Notif sekali saat data pertama kali selesai dimuat (bukan tiap reload manual).
  useEffect(() => {
    if (!loading && !hasNotifiedRef.current && items.length > 0) {
      hasNotifiedRef.current = true;
      if (belumSelesaiCount > 0) {
        showToast(`Ada ${belumSelesaiCount} barang yang belum selesai`, "warn");
      }
    }
  }, [loading, items, belumSelesaiCount]);

  const { menuLabel, subLabel } = findNavLabel(nav.menu, nav.sub);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex">
      <Sidebar
        active={nav}
        onNavigate={navigate}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        badges={sidebarBadges}
      />

      <div className="flex-1 min-w-0">
        {/* Header */}
        <header className="border-b border-slate-800 sticky top-0 bg-slate-950/90 backdrop-blur z-20">
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
              <button
                onClick={loadAll}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                title="Muat ulang"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setModal({ type: "barang-masuk" })}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
              >
                <Plus size={14} /> <span className="hidden sm:inline">Barang Masuk</span>
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
          ) : (
            <>
              {nav.menu === "dashboard" && (
                <Dashboard
                  stageCounts={stageCounts}
                  skuCount={skuMaster.length}
                  totalStok={totalStok}
                  rakCount={rak.length}
                  items={items}
                  onNavigate={navigate}
                  setModal={setModal}
                />
              )}
              {nav.menu === "barang-masuk" && (
                <BarangMasuk sub={nav.sub || "baru"} items={items} setModal={setModal} />
              )}
              {nav.menu === "data-barang" && (
                <DataBarang sub={nav.sub || "semua"} items={items} setModal={setModal} />
              )}
              {nav.menu === "sku-harga" && (
                <SkuHarga sub={nav.sub || "buat"} items={items} skuMaster={skuMaster} setModal={setModal} />
              )}
              {nav.menu === "stok" && (
                <Stok sub={nav.sub || "barang"} skuMaster={skuMaster} penempatan={penempatan} stockHistory={stockHistory} />
              )}
              {nav.menu === "rak" && (
                <Rak sub={nav.sub || "tempatkan"} items={items} rak={rak} penempatan={penempatan} setModal={setModal} />
              )}
              {nav.menu === "foto" && (
                <FotoProduk sub={nav.sub || "sample"} items={items} quickAdvance={quickAdvance} setModal={setModal} />
              )}
              {nav.menu === "marketplace" && (
                <Marketplace sub={nav.sub || "belum"} items={items} quickAdvance={quickAdvance} />
              )}
              {nav.menu === "laporan" && <Laporan items={items} skuMaster={skuMaster} rak={rak} />}
              {nav.menu === "master-data" && (
                <MasterData master={master} reload={loadAll} showToast={showToast} />
              )}
              {nav.menu === "pengaturan" && (
                <Pengaturan settings={settings} reload={loadAll} showToast={showToast} />
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
          saving={saving}
          setSaving={setSaving}
          reload={loadAll}
          showToast={showToast}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium shadow-xl z-50 ${
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