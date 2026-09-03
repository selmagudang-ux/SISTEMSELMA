import { PageHeader, EmptyState } from "../components/ui";

// Halaman "Marketplace" di dalam group sidebar "PENJUALAN" (lihat
// constants.js NAV → penjualan-group, key menu "penjualan-marketplace").
// BEDA dari halaman "Marketplace" di group "ADMIN MARKETPLACE" (key
// "marketplace") yang urusannya upload produk — ini khusus input keuangan:
// pemasukan bulanan semua marketplace & pengeluaran iklan, yang nantinya
// konek ke Keuangan. Kosong dulu, isinya menyusul (sidebar-nya dibangun
// duluan sesuai permintaan).
const SUB_LABEL = {
  "pemasukan-bulanan": "Pemasukan Bulanan Semua Marketplace",
  "pengeluaran-iklan": "Pengeluaran Iklan",
};

export default function PenjualanMarketplace({ sub }) {
  const label = SUB_LABEL[sub] || "Marketplace";
  return (
    <div>
      <PageHeader
        title={label}
        description="Input keuangan marketplace (pemasukan bulanan & pengeluaran iklan), konek ke Keuangan. Halaman ini belum ada isinya."
      />
      <EmptyState label={`Segera hadir — ${label}`} />
    </div>
  );
}