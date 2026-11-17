import { ChevronRight, LayoutGrid } from "lucide-react";
import { punyaLayar, rapikanLabel } from "./mobileMenu";

// Layar Beranda versi HP (/m): sapaan + semua menu tingkat atas, sama dengan sidebar versi web.
// Menu yang layar HP-nya belum jadi tampil redup ("Segera hadir").
// `tree` = menu tingkat atas yang boleh dibuka role ini; `buka(path)` = pindah ke menu itu.
export default function Beranda({ session, tree, buka }) {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-md-primary-container text-md-on-primary-container p-4">
        <div className="text-xs opacity-80">Selamat datang</div>
        <div className="text-lg font-bold leading-tight">{session.nama || session.username}</div>
        <div className="text-xs opacity-80 mt-0.5">SELMA ERP · Versi HP</div>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-2xl bg-md-container p-4 text-sm text-md-on-surface-variant">Belum ada menu untuk akun ini.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tree.map((n) => {
            const Ikon = n.icon || LayoutGrid;
            const siap = punyaLayar(n, null);
            return (
              <button
                key={n.key}
                onClick={() => buka([n.key])}
                className={`rounded-2xl bg-md-container p-4 text-left active:scale-[0.98] transition flex flex-col gap-2 border border-md-outline-variant ${siap ? "" : "opacity-50"}`}
              >
                <div className="flex items-center justify-between">
                  <Ikon size={22} className="text-md-primary" />
                  {(n.group || n.children?.length) && <ChevronRight size={14} className="text-md-on-surface-variant" />}
                </div>
                <span className="text-sm font-semibold text-md-on-surface leading-tight">{rapikanLabel(n.label)}</span>
                {!siap && <span className="text-[10px] text-md-on-surface-variant">Segera hadir</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
