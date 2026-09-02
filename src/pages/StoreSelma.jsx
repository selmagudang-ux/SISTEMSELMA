import { Building2 } from "lucide-react";
import { PageHeader } from "../components/ui";

// Halaman "Store Selma" — menu terpisah dari "Grosir" tapi masih di dalam
// group "ADMIN GROSIR" (lihat constants.js NAV → grosir-group). Kosong dulu,
// isinya menyusul.
export default function StoreSelma() {
  return (
    <div>
      <PageHeader title="Store Selma" description="Halaman ini belum ada isinya." />
      <div className="flex flex-col items-center justify-center py-20 text-md-on-surface-variant">
        <Building2 size={40} className="mb-3 opacity-40" />
        <div className="text-sm">Belum ada konten di sini.</div>
      </div>
    </div>
  );
}