import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { sb, sbAll, entitasBacaSaatIni, masterDataUntukPT, daftarkanProfilEntitas, lingkupTokoMarketplace } from "../../lib/api";

// =========================================================
// VERSI HP — OPERASIONAL > ADMIN GUDANG (file GudangHp.jsx)
// Satu "induk" untuk menu gudang yang belum punya layar HP khusus:
//   Alur Barang (data-barang) · SKU & Harga (buat / master-barang / kategori / reject)
//   Stok > Barang Keluar / Stok Opname / Riwayat Stok · Rak (tempatkan / sisa di gudang / master / peta) · Cetak Label
// Layar-layarnya MEMAKAI ULANG halaman versi komputer (pages/DataBarang, SkuHarga, Stok, Rak, CetakLabel) lengkap dengan
// modal / form-nya (components/ModalRouter), jadi aturan stok, rak, SKU & harga TIDAK ditulis dua kali dan hasilnya
// sama persis dengan SELMA komputer. Sumber data & hak akses SAMA dengan versi komputer (susunan menu HP sudah
// disaring role di MobileApp). Layar HP bergaya kartu khusus (seperti StokHp.jsx) bisa menyusul satu per satu.
// Daftarkan di mobileMenu.js (lihat LAYAR_HP).
// =========================================================

const ModalRouter = lazy(() => import("../../components/ModalRouter"));
const DataBarang = lazy(() => import("../DataBarang"));
const SkuHarga = lazy(() => import("../SkuHarga"));
const Stok = lazy(() => import("../Stok"));
const StokOpnameHp = lazy(() => import("./StokOpnameHp.jsx"));
const Rak = lazy(() => import("../Rak"));
const CetakLabel = lazy(() => import("../CetakLabel"));

// Kolom yang ditarik: SAMA dengan KOLOM_* di App.jsx (kalau di sana ada kolom baru, tambahkan juga di sini).
const KOLOM_ITEMS = [
  "id", "created_at", "tanggal", "gudang", "jumlah", "jumlah_rusak", "alasan_rusak",
  "harga", "stage", "stage_setelah_rak", "kode_pesanan", "barcode_supplier", "sku",
  "foto_url", "rak_code", "perlu_foto_ulang", "harga_lama_foto", "harga_baru_foto",
  "marketplace_status", "marketplace_uploaded_at",
].join(",");
const KOLOM_SKU_MASTER = [
  "id", "created_at", "sku", "bahan", "peruntukan", "kategori", "subkategori", "model",
  "warna", "ukuran", "harga_asli", "harga_asli_baru", "hpp", "grosir", "tengah", "ecer",
  "stok", "barcode_supplier", "nonaktif",
].join(",");
const KOLOM_PENEMPATAN = ["id", "created_at", "sku", "rak_code", "qty"].join(",");
const KOLOM_SUPPLIERS = ["id", "kode", "nama", "alamat", "telepon", "catatan", "models"].join(",");
const KOLOM_RAK = ["id", "code", "meja", "baris", "zona"].join(",");
const KOLOM_MASTER_DATA = ["id", "tipe", "kode", "label"].join(",");

async function muatMaster() {
  const rows = await sbAll(`master_data?select=${KOLOM_MASTER_DATA},entitas&order=label`).catch(() =>
    sbAll(`master_data?select=${KOLOM_MASTER_DATA}&order=label`)
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// ringan = menu Stok (Barang Keluar / Stok Opname / Riwayat): hanya SKU, penempatan, master data & foto barang yang dibutuhkan.
// Items / pesanan masuk / supplier / rak tidak ditarik (data besar yang tidak dipakai halaman Stok), jadi layar lebih cepat terbuka.
async function muatIntiRingan() {
  const [skuMaster, penempatan, master, settings, itemsFoto] = await Promise.all([
    sbAll(`sku_master?select=${KOLOM_SKU_MASTER}&order=created_at.desc`),
    sbAll(`penempatan?select=${KOLOM_PENEMPATAN}&order=created_at.desc`),
    muatMaster(),
    sb("settings?select=*"),
    // Modal detail SKU hanya memakai foto dari items.
    sbAll("items?select=id,sku,foto_url,tanggal&foto_url=not.is.null").catch(() => []),
  ]);
  return {
    items: itemsFoto || [],
    pesananMasuk: [],
    suppliers: [],
    skuMaster: skuMaster || [],
    rak: [],
    master,
    settings: (settings || [])[0] || null,
    penempatan: penempatan || [],
    pengajuanRestock: [],
  };
}

async function muatInti() {
  const [items, pesananMasuk, suppliers, skuMaster, rak, master, settings, penempatan, pengajuanRestock] = await Promise.all([
    sbAll(`items?select=${KOLOM_ITEMS}&order=created_at.desc`),
    sbAll("pesanan_masuk?select=*&order=created_at.desc"),
    sbAll(`suppliers?select=${KOLOM_SUPPLIERS}&order=nama`),
    sbAll(`sku_master?select=${KOLOM_SKU_MASTER}&order=created_at.desc`),
    sbAll(`rak?select=${KOLOM_RAK}&order=code`),
    muatMaster(),
    sb("settings?select=*"),
    sbAll(`penempatan?select=${KOLOM_PENEMPATAN}&order=created_at.desc`),
    // Dibatasi 500 pengajuan terbaru (versi komputer: semua yang "menunggu" + riwayat 2 bulan terakhir).
    sbAll("pengajuan_restock?select=*&order=created_at.desc&limit=500").catch(() => []),
  ]);
  return {
    items: items || [],
    pesananMasuk: pesananMasuk || [],
    suppliers: suppliers || [],
    skuMaster: skuMaster || [],
    rak: rak || [],
    master,
    settings: (settings || [])[0] || null,
    penempatan: penempatan || [],
    pengajuanRestock: pengajuanRestock || [],
  };
}

function Memuat() {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> Memuat…
    </div>
  );
}

// menu: "data-barang" | "sku-harga" | "stok" | "rak" | "cetak-label"; sub: key sub-menu dari NAV (boleh kosong).
function GudangHp({ session, menu, sub }) {
  const [data, setData] = useState(null); // null = belum dimuat
  const [riwayat, setRiwayat] = useState([]); // stock_history lengkap (hanya Stok > Riwayat Stok)
  const [rusak, setRusak] = useState([]); // barang_rusak (hanya SKU & Harga > Barang Reject)
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

  const butuhRiwayat = menu === "stok" && sub === "riwayat";
  const butuhRusak = menu === "sku-harga" && sub === "reject";

  // Muat ulang diam-diam (data lama tetap tampil, modal tidak tertutup). Dipakai juga sebagai `reload` halaman & modal.
  const muat = useCallback(async () => {
    setErr("");
    try {
      const [inti, riw, rsk] = await Promise.all([
        menu === "stok" ? muatIntiRingan() : muatInti(),
        butuhRiwayat ? sbAll("stock_history?select=*&order=created_at.desc") : Promise.resolve(null),
        butuhRusak ? sbAll("barang_rusak?select=*&order=created_at.desc") : Promise.resolve(null),
      ]);
      setData(inti);
      if (riw) setRiwayat(riw);
      if (rsk) setRusak(rsk);
    } catch (e) {
      setErr(e.message || "Gagal memuat data gudang");
    }
  }, [menu, butuhRiwayat, butuhRusak]);
  useEffect(() => {
    muat();
  }, [muat]);

  // Sama dengan skuMasterGrosir di App.jsx: SKU yang alurnya sudah "selesai" ditandai siapGrosir (dibaca ModalRouter).
  const skuMasterGrosir = useMemo(() => {
    if (!data) return [];
    const selesai = new Set(data.items.filter((i) => i.stage === "selesai" && i.sku).map((i) => i.sku));
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
        {menu === "data-barang" && <DataBarang items={data.items} penempatan={data.penempatan} skuMaster={data.skuMaster} setModal={setModal} />}
        {menu === "sku-harga" && (
          <SkuHarga
            settings={data.settings}
            sub={sub || "buat"}
            items={data.items}
            skuMaster={data.skuMaster}
            master={data.master}
            penempatan={data.penempatan}
            setModal={setModal}
            reload={muat}
            showToast={showToast}
            session={session}
            barangRusak={rusak}
            pesananMasuk={data.pesananMasuk}
          />
        )}
        {menu === "stok" && sub === "hitung" && <StokOpnameHp skuMaster={data.skuMaster} setModal={setModal} />}
        {menu === "stok" && sub !== "hitung" && (
          <Stok
            sub={sub || "barang"}
            skuMaster={data.skuMaster}
            penempatan={data.penempatan}
            stockHistory={riwayat}
            pengajuanRestock={data.pengajuanRestock}
            session={session}
            setModal={setModal}
            master={data.master}
            reload={muat}
            showToast={showToast}
          />
        )}
        {menu === "rak" && (
          <Rak
            sub={sub || "tempatkan"}
            items={data.items}
            rak={data.rak}
            penempatan={data.penempatan}
            skuMaster={data.skuMaster}
            master={data.master}
            pengajuanRestock={data.pengajuanRestock}
            session={session}
            setModal={setModal}
          />
        )}
        {menu === "cetak-label" && <CetakLabel items={data.items} skuMaster={data.skuMaster} penempatan={data.penempatan} rak={data.rak} master={data.master} />}
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
            pesananMasuk={data.pesananMasuk}
            suppliers={data.suppliers}
            keuanganTransaksi={[]}
            marketplaceTransaksi={[]}
            saving={saving}
            setSaving={setSaving}
            reload={muat}
            showToast={showToast}
            session={session}
            quickAdvance={async () => {}}
            pelangganGrosir={[]}
            tokoGrosir={[]}
            produkManualGrosir={[]}
            pesananGrosir={[]}
            pembayaranGrosir={[]}
            depositGrosir={[]}
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
export const AlurBarangHp = ({ session }) => <GudangHp session={session} menu="data-barang" />;
export const SkuHargaHp = ({ session, sub }) => <GudangHp session={session} menu="sku-harga" sub={sub} />;
export const StokLainHp = ({ session, sub }) => <GudangHp session={session} menu="stok" sub={sub} />;
export const RakHp = ({ session, sub }) => <GudangHp session={session} menu="rak" sub={sub} />;
export const CetakLabelHp = ({ session }) => <GudangHp session={session} menu="cetak-label" />;

export default GudangHp;
