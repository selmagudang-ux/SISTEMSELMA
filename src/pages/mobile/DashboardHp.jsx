import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  sb,
  sbAll,
  setSaldoDasarRekening,
  awalRentangKeuanganDefault,
  resetKeuanganLama,
  aturEntitasBaca,
  entitasBacaSaatIni,
  masterDataUntukPT,
  daftarkanProfilEntitas,
  lingkupTokoMarketplace,
  ENTITAS_DEFAULT,
} from "../../lib/api";
import { STAGE_ORDER } from "../../lib/constants";
import { listAbsensi, listKaryawan } from "../../lib/absensi";
import { rakTerpakai } from "../Rak";

// =========================================================
// VERSI HP — DASHBOARD MONITORING (menu "dashboard", file DashboardHp.jsx)
// MEMAKAI ULANG halaman komputer pages/Dashboard.jsx (4 tab: Operasional, Penjualan, Absensi, Keuangan) dengan data yang
// sama, jadi angkanya persis sama dengan SELMA komputer. Data dimuat di sini dengan cara yang sama seperti App.jsx
// (loadCore, loadGrosir, loadKeuangan, loadMarketplace, loadAbsensi) — kalau di App.jsx ada kolom / tabel baru untuk
// Dashboard, samakan juga di sini. Pemilik / Super Appa boleh memilih perusahaan (atau Gabungan) seperti di komputer;
// pilihan itu dikembalikan ke PT sendiri begitu layar ini ditutup.
// Navigasi dari kartu Dashboard (mis. "Lihat Laporan") memakai `bukaMenu` dari MobileApp.
// Daftarkan di mobileMenu.js (lihat LAYAR_HP).
// =========================================================

const Dashboard = lazy(() => import("../Dashboard"));
const ModalRouter = lazy(() => import("../../components/ModalRouter"));

// Kolom yang ditarik: SAMA dengan KOLOM_* di App.jsx.
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
const KOLOM_SKU_MASTER_SET = KOLOM_SKU_MASTER + ",nama,pelengkap,komponen,jenis_set";
const KOLOM_SKU_MASTER_SET_MINIM = KOLOM_SKU_MASTER + ",nama,komponen,jenis_set";
const KOLOM_PENEMPATAN = ["id", "created_at", "sku", "rak_code", "qty"].join(",");
const KOLOM_RAK = ["id", "code", "meja", "baris", "zona"].join(",");
const KOLOM_MASTER_DATA = ["id", "tipe", "kode", "label"].join(",");
const KOLOM_MASTER_DATA_PT = KOLOM_MASTER_DATA + ",entitas";

// Sama dengan awalRentangEgressDefault di App.jsx: awal bulan sebelumnya.
const awalRentangEgressDefault = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function muatCore() {
  const [items, pesananMasuk, skuMaster, rak, masterRows, settings, penempatan, pengajuanRestock] = await Promise.all([
    sbAll(`items?select=${KOLOM_ITEMS}&order=created_at.desc`),
    sbAll("pesanan_masuk?select=*&order=created_at.desc"),
    sbAll(`sku_master?select=${KOLOM_SKU_MASTER_SET}&order=created_at.desc`).catch(() =>
      sbAll(`sku_master?select=${KOLOM_SKU_MASTER_SET_MINIM}&order=created_at.desc`).catch(() =>
        sbAll(`sku_master?select=${KOLOM_SKU_MASTER}&order=created_at.desc`)
      )
    ),
    sbAll(`rak?select=${KOLOM_RAK}&order=code`),
    sbAll(`master_data?select=${KOLOM_MASTER_DATA_PT}&order=label`).catch(() => sbAll(`master_data?select=${KOLOM_MASTER_DATA}&order=label`)),
    sb("settings?select=*"),
    sbAll(`penempatan?select=${KOLOM_PENEMPATAN}&order=created_at.desc`),
    // Status "menunggu" berapa pun umurnya; yang sudah direspon dibatasi ke bulan berjalan + 1 bulan sebelumnya.
    sbAll(`pengajuan_restock?select=*&order=created_at.desc&or=(status.eq.menunggu,created_at.gte.${awalRentangEgressDefault()})`).catch(() => []),
  ]);
  const grouped = {};
  masterDataUntukPT(masterRows || [], entitasBacaSaatIni()).forEach((m) => {
    grouped[m.tipe] = grouped[m.tipe] || [];
    grouped[m.tipe].push(m);
  });
  daftarkanProfilEntitas(grouped);
  return {
    items: items || [],
    pesananMasuk: pesananMasuk || [],
    skuMaster: skuMaster || [],
    rak: rak || [],
    master: lingkupTokoMarketplace(grouped, entitasBacaSaatIni()),
    settings: (settings || [])[0] || null,
    penempatan: penempatan || [],
    pengajuanRestock: pengajuanRestock || [],
  };
}

async function muatGrosir() {
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

// Keuangan: bulan ini + bulan lalu saja (bulan/tahun yang lebih lama ditarik Dashboard sendiri lewat lib/useKeuanganRentang.js).
async function muatKeuangan() {
  const awalRentang = awalRentangKeuanganDefault();
  resetKeuanganLama();
  const rows = await sbAll(`keuangan_transaksi?select=*&tanggal=gte.${awalRentang}&order=tanggal.desc`);
  // Saldo semua transaksi SEBELUM rentang itu (agregat dari database). Gagal di sini tidak membatalkan halaman.
  try {
    const dasar = await sb(`rpc/saldo_rekening_sebelum?p_tanggal=${awalRentang}`);
    const peta = {};
    (dasar || []).forEach((r) => {
      if (r.rekening) peta[r.rekening] = Number(r.saldo) || 0;
    });
    setSaldoDasarRekening(awalRentang, peta);
  } catch (e) {
    console.warn("saldo_rekening_sebelum belum tersedia:", e?.message || e);
  }
  return rows || [];
}

async function muatAbsensi(force, entitasSesi) {
  const entLihat = entitasBacaSaatIni() || entitasSesi || ENTITAS_DEFAULT;
  const [absensiRows, karyawanList] = await Promise.all([listAbsensi(force, entLihat), listKaryawan(force, entLihat)]);
  return { absensiRows: absensiRows || [], karyawanList: karyawanList || [] };
}

function Memuat() {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> Memuat…
    </div>
  );
}

// bukaMenu(menuKey, subKey): disediakan MobileApp untuk pindah ke menu lain (mengikuti hak akses & susunan menu HP).
export default function DashboardHp({ session, bukaMenu }) {
  const [data, setData] = useState(null); // null = belum dimuat
  const [err, setErr] = useState("");
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  // Pemilik / Super Appa: pilih perusahaan yang dilihat (null = PT sendiri, "GABUNGAN" = ringkasan semua PT), seperti di komputer.
  const bolehPilihPT = ["owner", "superappa"].includes(session?.role);
  const [ptLihat, setPtLihat] = useState(bolehPilihPT ? "GABUNGAN" : null);
  const entitasSendiri = session?.entitas || "OPS";

  const showToast = useCallback((msg, kind = "ok", durasi = 3500) => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), durasi);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  // Pilihan PT hanya berlaku selama layar ini terbuka: keluar -> kembali membaca PT sendiri.
  useEffect(() => () => aturEntitasBaca(null), []);

  const muat = useCallback(
    async (force = false) => {
      setErr("");
      setMenyegarkan(true);
      try {
        const [core, grosir, keuangan, marketplace, absensi] = await Promise.all([
          muatCore(),
          muatGrosir(),
          muatKeuangan(),
          sbAll("marketplace_transaksi?select=*&order=tanggal.desc"),
          muatAbsensi(force, entitasSendiri),
        ]);
        setData({ ...core, ...grosir, ...absensi, keuanganTransaksi: keuangan, marketplaceTransaksi: marketplace || [] });
      } catch (e) {
        setErr(e?.message || "Gagal memuat Dashboard");
      } finally {
        setMenyegarkan(false);
      }
    },
    [entitasSendiri]
  );
  useEffect(() => {
    muat(false);
  }, [muat]);

  const gantiPT = async (kode) => {
    const baru = !kode || kode === entitasSendiri ? null : kode;
    aturEntitasBaca(baru && baru !== "GABUNGAN" ? baru : null);
    setPtLihat(baru);
    // Data gudang, grosir, marketplace & absensi dibaca per PT di server -> tarik ulang (Gabungan memakai data PT sendiri).
    if (baru !== "GABUNGAN") await muat(true);
  };

  // Angka ringkas Operasional: SAMA dengan blok `derived` di App.jsx.
  const turunan = useMemo(() => {
    if (!data) return null;
    const stageCounts = STAGE_ORDER.reduce((acc, s) => {
      acc[s] = data.items.filter((i) => i.stage === s).length;
      return acc;
    }, {});
    // Set / SKU Induk (kolom komponen terisi) tidak punya stok sendiri.
    const skuReal = data.skuMaster.filter((s) => !Array.isArray(s.komponen));
    const totalStok = skuReal.reduce((a, s) => a + (s.stok || 0), 0);
    const terpakai = rakTerpakai(data.rak, data.penempatan, data.skuMaster);
    const idTerpakai = new Set(terpakai.map((t) => t.id));
    return { stageCounts, totalStok, rakCount: terpakai.length, rakKosong: data.rak.filter((r) => !idTerpakai.has(r.id)) };
  }, [data]);

  // Sama dengan skuMasterGrosir di App.jsx (dibaca ModalRouter).
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
          <button onClick={() => muat(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }
  if (!data || !turunan) return <Memuat />;

  return (
    <div className="p-3 min-w-0">
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => muat(true)}
          disabled={menyegarkan}
          className="flex items-center gap-1.5 text-xs font-medium text-md-primary disabled:opacity-60"
        >
          {menyegarkan ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Muat ulang
        </button>
      </div>
      {err && <div className="rounded-xl bg-md-error-container text-md-on-error-container px-3 py-2 text-xs mb-2 break-words">{err}</div>}
      <Suspense fallback={<Memuat />}>
        <Dashboard
          stageCounts={turunan.stageCounts}
          skuCount={data.skuMaster.length}
          totalStok={turunan.totalStok}
          rakCount={turunan.rakCount}
          rakKosong={turunan.rakKosong}
          items={data.items}
          skuMaster={data.skuMaster}
          onNavigate={(menu, sub) => bukaMenu?.(menu, sub)}
          setModal={setModal}
          pesananMasuk={data.pesananMasuk}
          penempatan={data.penempatan}
          pesananGrosir={data.pesananGrosir}
          pembayaranGrosir={data.pembayaranGrosir}
          depositGrosir={data.depositGrosir}
          pelangganGrosir={data.pelangganGrosir}
          keuanganTransaksi={data.keuanganTransaksi}
          marketplaceTransaksi={data.marketplaceTransaksi}
          master={data.master}
          absensiRows={data.absensiRows}
          karyawanList={data.karyawanList}
          pengajuanRestock={data.pengajuanRestock}
          entitas={entitasSendiri}
          bolehPilihPT={bolehPilihPT}
          ptLihat={ptLihat}
          onGantiPT={gantiPT}
        />
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
            suppliers={[]}
            keuanganTransaksi={data.keuanganTransaksi}
            marketplaceTransaksi={data.marketplaceTransaksi}
            saving={saving}
            setSaving={setSaving}
            reload={() => muat(true)}
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
