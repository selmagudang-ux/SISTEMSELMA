import { BellRing, ChevronRight, LayoutGrid } from "lucide-react";
import { punyaLayar, rapikanLabel } from "./mobileMenu";

// Layar Beranda versi HP (/m): sapaan + semua menu tingkat atas, sama dengan sidebar versi web.
// Menu yang layar HP-nya belum jadi tampil redup ("Segera hadir").
// `tree` = menu tingkat atas yang boleh dibuka role ini; `buka(path)` = pindah ke menu itu.
export default function Beranda({ session, tree, buka, badges = {}, perlu = [], bukaNotif }) {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-md-primary-container text-md-on-primary-container p-4">
        <div className="text-xs opacity-80">Selamat datang</div>
        <div className="text-lg font-bold leading-tight">{session.nama || session.username}</div>
        <div className="text-xs opacity-80 mt-0.5">SELMA ERP · Versi HP</div>
      </div>

      {perlu.length > 0 && (
        <div className="rounded-2xl border border-md-error/40 bg-md-error-container/40 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-md-on-surface">
            <BellRing size={14} className="text-md-error" /> Perlu tindakan
          </div>
          {perlu.map((n) => (
            <button
              key={n.kunci}
              onClick={() => bukaNotif?.(n)}
              className="w-full flex items-center gap-2 text-left text-sm text-md-on-surface py-1.5 active:opacity-70"
            >
              <span className="flex-1 min-w-0">{n.teks}</span>
              <ChevronRight size={14} className="text-md-on-surface-variant flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

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
                  {badges[n.key] > 0 && (
                    <span className="ml-auto mr-1 text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {badges[n.key] > 99 ? "99+" : badges[n.key]}
                    </span>
                  )}
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
