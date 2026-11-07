import { useState } from "react";
import { PageHeader, EmptyState } from "../../components/ui";
import { getSession } from "../../lib/auth";
import BarangToko from "./BarangToko";
import PromoToko from "./PromoToko";

// =========================================================
// MENU POS di Penjualan > Toko Offline (sejajar dengan Transaksi Offline).
// Isi: tab Barang Toko (master_toko: harga jual, HPP, stok toko) dan tab Promo (kasir_promo).
// Hanya role superappa — dijaga di sini juga, bukan cuma disembunyikan di sidebar.
// Layar kasirnya sendiri tetap di alamat /kasir.
// =========================================================

const TAB = [
  ["barang", "Barang Toko"],
  ["promo", "Promo"],
];

export default function PosToko({ reload }) {
  const [tab, setTab] = useState("barang");
  const role = getSession()?.role;
  if (role !== "superappa") return <EmptyState label="Halaman ini khusus untuk role superappa." />;

  return (
    <div>
      <PageHeader
        title="POS"
        description="Atur barang yang dijual di aplikasi kasir (harga, HPP, stok toko) dan promo per barang atau per kategori. Layar kasir dibuka di alamat /kasir."
        action={
          <a href="/kasir" target="_blank" rel="noreferrer" className="text-xs font-semibold text-md-primary border border-md-outline-variant rounded-full px-3.5 py-2 hover:bg-md-surface-variant whitespace-nowrap">
            Buka Kasir
          </a>
        }
      />
      <div className="flex items-center gap-2 mb-4">
        {TAB.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`text-sm px-4 py-2 rounded-full border transition-colors ${
              tab === k ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-md-outline-variant text-md-on-surface-variant hover:border-amber-500/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "barang" ? <BarangToko inline onBerubah={() => reload?.()} /> : <PromoToko inline />}
    </div>
  );
}
