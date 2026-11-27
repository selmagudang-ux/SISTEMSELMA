import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  sb, sbAll, entitasBacaSaatIni, masterDataUntukPT, daftarkanProfilEntitas, lingkupTokoMarketplace,
  setSaldoDasarRekening, resetKeuanganLama, awalRentangKeuanganDefault,
} from "../../lib/api";

// =========================================================
// VERSI HP — PENJUALAN (file PenjualanHp.jsx)
// Satu "induk" untuk semua menu di grup PENJUALAN:
//   Grosir (semua-pesanan / produk-manual / cek-hpp / laporan) · Toko Offline (Transaksi Offline / POS)
//   Reseller (toko / cekout / penagihan) · Master Data Grosir (Pelanggan, Toko Pengirim)
//   Marketplace (shopee / tiktok / lazada) · Scan Resi (scan / cancel / retur / rekap) · Urut Resi
// Layar-layarnya MEMAKAI ULANG halaman versi komputer + modalnya (components/ModalRouter), jadi aturan pesanan,
// hutang/deposit, HPP, pencairan, scan resi TIDAK ditulis dua kali dan hasilnya sama persis dengan SELMA komputer.
// Sumber data & hak akses SAMA dengan versi komputer (susunan menu HP sudah disaring role di MobileApp).
// Tabel lebar di halaman-halaman itu sudah bisa digeser ke samping (overflow-x-auto).
// Daftarkan di mobileMenu.js (lihat LAYAR_HP).
// =========================================================

const ModalRouter = lazy(() => import("../../components/ModalRouter"));
const Grosir = lazy(() => import("../Grosir"));
const PelangganList = lazy(() => import("../Grosir").then((m) => ({ default: m.PelangganList })));
const TokoList = lazy(() => import("../Grosir").then((m) => ({ default: m.TokoList })));
const TokoOffline = lazy(() => import("../TokoOffline"));
const Reseller = lazy(() => import("../Reseller"));
const Penjualanmarketplace = lazy(() => import("../Penjualanmarketplace"));
const ScanResi = lazy(() => import("../ScanResi"));
const UrutResi = lazy(() => import("../UrutResi"));

// Kolom SKU master: SAMA dengan KOLOM_SKU_MASTER di GudangHp.jsx / App.jsx.
const KOLOM_SKU_MASTER = [
  "id", "created_at", "sku", "bahan", "peruntukan", "kategori", "subkategori", "model",
  "warna", "ukuran", "harga_asli", "harga_asli_baru", "hpp", "grosir", "tengah", "ecer",
  "stok", "barcode_supplier", "nonaktif",
].join(",");

// Menu yang memakai tiap kelompok data.
const BUTUH_GROSIR = ["grosir", "pelanggan", "toko", "reseller"];
const BUTUH_SKU = ["grosir", "reseller", "penjualan-marketplace"];
const BUTUH_KEUANGAN = ["grosir", "pelanggan", "reseller", "toko-offline", "penjualan-marketplace"];
const BUTUH_MARKETPLACE = ["penjualan-marketplace"];
const TANPA_DATA = ["scan-resi", "urut-resi"];

async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// Transaksi bulan berjalan + saldo dasar (akumulasi semua transaksi SEBELUM bulan ini) — sama dengan App.jsx loadKeuangan().
async function muatTransaksi() {
  const awal = awalRentangKeuanganDefault();
  resetKeuanganLama();
  const rows = await sbAll(`keuangan_transaksi?select=*&tanggal=gte.${awal}&order=tanggal.desc`);
  try {
    const dasar = await sb(`rpc/saldo_rekening_sebelum?p_tanggal=${awal}`);
    const peta = {};
    (dasar || []).forEach((r) => {
      if (r.rekening) peta[r.rekening] = Number(r.saldo) || 0;
    });
    setSaldoDasarRekening(awal, peta);
  } catch (e) {
    console.warn("saldo_rekening_sebelum belum tersedia:", e?.message || e);
  }
  return rows || [];
}

async function muatDataGrosir() {
  const [pelanggan, toko, produkManual, pesanan, pembayaran, deposit] = await Promise.all([
    sbAll("grosir_pelanggan?select=*&order=nama"),
    sbAll("grosir_toko?select=*&order=nama_toko"),
    sbAll("grosir_produk_manual?select=*&order=nama_produk"),
    sbAll("grosir_pesanan?select=*&order=created_at.desc"),
    sbAll("grosir_pembayaran?select=*&order=created_at.desc"),
    sbAll("grosir_deposit?select=*&order=created_at.desc"),
  ]);
  return {
    pelangganGrosir: pelanggan || [],
    tokoGrosir: toko || [],
    produkManualGrosir: produkManual || [],
    pesananGrosir: pesanan || [],
    pembayaranGrosir: pembayaran || [],
    depositGrosir: deposit || [],
  };
}

async function muatDataSku() {
  const [skuMaster, penempatan, items, rak, settings] = await Promise.all([
    sbAll(`sku_master?select=${KOLOM_SKU_MASTER}&order=created_at.desc`),
    sbAll("penempatan?select=id,created_at,sku,rak_code,qty&order=created_at.desc"),
    // Dipakai untuk menandai SKU yang alurnya sudah "selesai" (siapGrosir) + foto di modal detail SKU.
    sbAll("items?select=id,sku,stage,foto_url,tanggal&sku=not.is.null").catch(() => []),
    sbAll("rak?select=id,code,meja,baris,zona&order=code").catch(() => []),
    sb("settings?select=*").catch(() => []),
  ]);
  return {
    skuMaster: skuMaster || [],
    penempatan: penempatan || [],
    items: items || [],
    rak: rak || [],
    settings: (settings || [])[0] || null,
  };
}

function Memuat() {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> Memuat…
    </div>
  );
}

// menu: key menu NAV (grosir | pelanggan | toko | toko-offline | reseller | penjualan-marketplace | scan-resi | urut-resi);
// sub: key sub-menu dari NAV (boleh kosong).
function PenjualanHp({ session, menu, sub }) {
  const tanpaData = TANPA_DATA.includes(menu);
  const [data, setData] = useState(tanpaData ? {} : null); // null = belum dimuat
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  const showToast = useCallback((msg, kind = "ok", durasi = 3500) => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), durasi);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  // Muat ulang diam-diam (data lama tetap tampil, modal tidak tertutup). Dipakai juga sebagai `reload` halaman & modal.
  const muat = useCallback(async () => {
    if (tanpaData) return;
    setErr("");
    try {
      const [master, grosir, sku, keuangan, marketplace] = await Promise.all([
        muatMaster(),
        BUTUH_GROSIR.includes(menu) ? muatDataGrosir() : Promise.resolve(null),
        BUTUH_SKU.includes(menu) ? muatDataSku() : Promise.resolve(null),
        BUTUH_KEUANGAN.includes(menu) ? muatTransaksi() : Promise.resolve(null),
        BUTUH_MARKETPLACE.includes(menu) ? sbAll("marketplace_transaksi?select=*&order=tanggal.desc") : Promise.resolve(null),
      ]);
      setData({
        master,
        pelangganGrosir: [], tokoGrosir: [], produkManualGrosir: [], pesananGrosir: [], pembayaranGrosir: [], depositGrosir: [],
        skuMaster: [], penempatan: [], items: [], rak: [], settings: null,
        keuanganTransaksi: keuangan || [],
        marketplaceTransaksi: marketplace || [],
        ...(grosir || {}),
        ...(sku || {}),
      });
    } catch (e) {
      setErr(e.message || "Gagal memuat data penjualan");
    }
  }, [menu, tanpaData]);
  useEffect(() => {
    muat();
  }, [muat]);

  // Sama dengan skuMasterGrosir di App.jsx: SKU yang alurnya sudah "selesai" ditandai siapGrosir (dibaca form pesanan & ModalRouter).
  const skuMasterGrosir = useMemo(() => {
    if (!data?.skuMaster) return [];
    const selesai = new Set((data.items || []).filter((i) => i.stage === "selesai" && i.sku).map((i) => i.sku));
    return data.skuMaster.map((s) => ({ ...s, siapGrosir: selesai.has(s.sku) }));
  }, [data]);

  if (err && !data) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="break-words">{err}</div>
          <button onClick={muat} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }
  if (!data) return <Memuat />;

  return (
    <div className="p-3 min-w-0">
      <Suspense fallback={<Memuat />}>
        {menu === "grosir" && (
          <Grosir
            sub={sub || "semua-pesanan"}
            pelangganGrosir={data.pelangganGrosir}
            tokoGrosir={data.tokoGrosir}
            produkManualGrosir={data.produkManualGrosir}
            skuMaster={skuMasterGrosir}
            pesananGrosir={data.pesananGrosir}
            pembayaranGrosir={data.pembayaranGrosir}
            depositGrosir={data.depositGrosir}
            reload={muat}
            showToast={showToast}
            setModal={setModal}
          />
        )}
        {menu === "pelanggan" && (
          <PelangganList
            pelangganGrosir={data.pelangganGrosir}
            pesananGrosir={data.pesananGrosir}
            pembayaranGrosir={data.pembayaranGrosir}
            depositGrosir={data.depositGrosir}
            setModal={setModal}
          />
        )}
        {menu === "toko" && <TokoList tokoGrosir={data.tokoGrosir} setModal={setModal} />}
        {menu === "toko-offline" && (
          <TokoOffline
            sub={sub || "input-harian"}
            master={data.master}
            keuanganTransaksi={data.keuanganTransaksi}
            reload={muat}
            showToast={showToast}
          />
        )}
        {menu === "reseller" && (
          <Reseller
            sub={sub || "toko"}
            pelangganGrosir={data.pelangganGrosir}
            produkManualGrosir={data.produkManualGrosir}
            skuMaster={skuMasterGrosir}
            penempatan={data.penempatan}
            pesananGrosir={data.pesananGrosir}
            pembayaranGrosir={data.pembayaranGrosir}
            depositGrosir={data.depositGrosir}
            keuanganTransaksi={data.keuanganTransaksi}
            session={session}
            master={data.master}
            reload={muat}
            showToast={showToast}
            setModal={setModal}
          />
        )}
        {menu === "penjualan-marketplace" && (
          <Penjualanmarketplace
            sub={sub || "shopee"}
            marketplaceTransaksi={data.marketplaceTransaksi}
            master={data.master}
            skuMaster={data.skuMaster}
            reload={muat}
            showToast={showToast}
            setModal={setModal}
          />
        )}
        {menu === "scan-resi" && <ScanResi sub={sub || "scan"} session={session} showToast={showToast} />}
        {menu === "urut-resi" && <UrutResi showToast={showToast} />}
      </Suspense>

      {modal && (
        <Suspense fallback={null}>
          <ModalRouter
            modal={modal}
            setModal={setModal}
            master={data.master}
            settings={data.settings}
            rakList={data.rak}
            skuMaster={skuMasterGrosir}
            penempatan={data.penempatan}
            items={data.items}
            pesananMasuk={[]}
            suppliers={[]}
            keuanganTransaksi={data.keuanganTransaksi}
            marketplaceTransaksi={data.marketplaceTransaksi}
            saving={saving}
            setSaving={setSaving}
            reload={muat}
            showToast={showToast}
            session={session}
            quickAdvance={async () => {}}
            pelangganGrosir={data.pelangganGrosir}
            tokoGrosir={data.tokoGrosir}
            produkManualGrosir={data.produkManualGrosir}
            pesananGrosir={data.pesananGrosir}
            pembayaranGrosir={data.pembayaranGrosir}
            depositGrosir={data.depositGrosir}
          />
        </Suspense>
      )}

      {toast && (
        <div
          className={`fixed left-4 right-4 z-[70] px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// Pembungkus per menu (mobileMenu.js memuat lewat nama ekspor ini, jadi MobileApp tidak perlu diubah).
export const GrosirHp = ({ session, sub }) => <PenjualanHp session={session} menu="grosir" sub={sub} />;
export const PelangganHp = ({ session }) => <PenjualanHp session={session} menu="pelanggan" />;
export const TokoPengirimHp = ({ session }) => <PenjualanHp session={session} menu="toko" />;
export const TokoOfflineHp = ({ session, sub }) => <PenjualanHp session={session} menu="toko-offline" sub={sub} />;
export const ResellerHp = ({ session, sub }) => <PenjualanHp session={session} menu="reseller" sub={sub} />;
export const MarketplaceHp = ({ session, sub }) => <PenjualanHp session={session} menu="penjualan-marketplace" sub={sub} />;
export const ScanResiHp = ({ session, sub }) => <PenjualanHp session={session} menu="scan-resi" sub={sub} />;
export const UrutResiHp = ({ session }) => <PenjualanHp session={session} menu="urut-resi" />;

export default PenjualanHp;
