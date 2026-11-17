import { Smartphone } from "lucide-react";

// Layar Beranda versi HP (/m). Tahap 1: sapaan + pintasan ke menu yang tersedia.
// `menu` = daftar menu HP yang boleh dibuka role ini; `buka(key)` = pindah ke menu itu.
export default function Beranda({ session, menu, buka }) {
  const pintasan = menu.filter((m) => m.key !== "beranda");
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-md-primary-container text-md-on-primary-container p-4">
        <div className="text-xs opacity-80">Selamat datang</div>
        <div className="text-lg font-bold leading-tight">{session.nama || session.username}</div>
        <div className="text-xs opacity-80 mt-0.5">SELMA ERP · Versi HP</div>
      </div>

      {pintasan.length === 0 ? (
        <div className="rounded-2xl bg-md-container p-4 text-sm text-md-on-surface-variant flex items-start gap-3">
          <Smartphone size={18} className="flex-shrink-0 mt-0.5" />
          <span>Belum ada menu versi HP untuk akun ini. Gunakan SISTEMSELMA versi komputer untuk menu lainnya.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pintasan.map(({ key, label, Ikon, muat }) => (
            <button
              key={key}
              onClick={() => buka(key)}
              className="rounded-2xl bg-md-container p-4 text-left active:scale-[0.98] transition flex flex-col gap-2 border border-md-outline-variant"
            >
              <Ikon size={22} className="text-md-primary" />
              <span className="text-sm font-semibold text-md-on-surface leading-tight">{label}</span>
              {!muat && <span className="text-[10px] text-md-on-surface-variant">Segera hadir</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
