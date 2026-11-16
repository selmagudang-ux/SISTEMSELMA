import { Landmark } from "lucide-react";
import { PageHeader } from "../components/ui";

// =========================================================
// BARANG ASET (sub-menu Pengadaan Barang di ADMIN GUDANG)
// Tempat mencatat aset perusahaan (komputer, rak, printer, kendaraan, dst).
// Fitur ini belum dibuat — halaman ini masih "segera hadir".
// =========================================================
export default function Aset() {
  return (
    <div>
      <PageHeader
        title="Barang Aset"
        description="Pencatatan aset perusahaan (komputer, rak, printer, kendaraan, dan sejenisnya)."
      />
      <div className="flex flex-col items-center justify-center py-16 text-md-on-surface-variant gap-2 border-2 border-dashed border-md-outline-variant rounded-md-lg">
        <Landmark size={22} />
        <div className="text-sm font-medium">Segera hadir</div>
        <div className="text-xs">Menu ini sedang disiapkan dan belum bisa dipakai.</div>
      </div>
    </div>
  );
}
