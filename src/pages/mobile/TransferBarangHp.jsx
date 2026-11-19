import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { sbAll, entitasBacaSaatIni, masterDataUntukPT, daftarkanProfilEntitas, lingkupTokoMarketplace } from "../../lib/api";
import TransferEntitas from "../TransferEntitas";

// =========================================================
// VERSI HP — TRANSFER BARANG ANTAR ENTITAS (file TransferBarangHp.jsx)
// Memakai ulang halaman versi komputer (pages/TransferEntitas.jsx): tampilannya sudah berupa kartu bertumpuk dan
// form modal, jadi muat di layar HP, dan logika stok / surat jalan / kode terima TIDAK ditulis dua kali
// (kirim -> stok pengirim berkurang, penerima konfirmasi, Permintaan Stok, Surat Jalan & Label Paket).
// Layar ini hanya memuat data yang dibutuhkan halaman itu (katalog SKU, penempatan rak, master data) lalu
// menampilkannya. Sumber data & hak akses SAMA dengan versi komputer.
// Daftarkan di mobileMenu.js: "transfer-entitas".
// =========================================================

const KOLOM_SKU_MASTER = [
  "id", "created_at", "sku", "bahan", "peruntukan", "kategori", "subkategori", "model",
  "warna", "ukuran", "harga_asli", "harga_asli_baru", "hpp", "grosir", "tengah", "ecer",
  "stok", "barcode_supplier", "nonaktif",
].join(",");

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

export default function TransferBarangHp({ session }) {
  const [data, setData] = useState(null); // null = belum dimuat
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  const muat = useCallback(async () => {
    setErr("");
    try {
      const [master, skuMaster, penempatan] = await Promise.all([
        muatMaster(),
        sbAll(`sku_master?select=${KOLOM_SKU_MASTER}&order=created_at.desc`),
        sbAll("penempatan?select=id,created_at,sku,rak_code,qty&order=created_at.desc"),
      ]);
      setData({ master, skuMaster: skuMaster || [], penempatan: penempatan || [] });
    } catch (e) {
      setErr(e.message || "Gagal memuat data transfer barang");
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  if (err) {
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
  if (!data) {
    return (
      <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
        <Loader2 size={18} className="animate-spin" /> Memuat…
      </div>
    );
  }

  return (
    <div className="p-3">
      <TransferEntitas
        skuMaster={data.skuMaster}
        penempatan={data.penempatan}
        master={data.master}
        session={session}
        reload={muat}
        showToast={tampilToast}
      />
      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
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
