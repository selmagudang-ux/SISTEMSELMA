import { X, Inbox, Sparkles } from "lucide-react";

export const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";

export function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">{placeholder || "Pilih…"}</option>
      {options.map((o) => (
        <option key={o.kode} value={o.kode}>
          {o.label} ({o.kode})
        </option>
      ))}
    </select>
  );
}

export function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-slate-800 p-4 bg-slate-900/50">
      <div className={`text-2xl font-bold ${accent || ""}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-lg font-bold text-slate-100">{title}</h1>
        {description && <p className="text-xs text-slate-500 mt-1 max-w-xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2 border border-dashed border-slate-800 rounded-xl">
      <Inbox size={22} />
      <div className="text-sm">{label}</div>
    </div>
  );
}

export function ComingSoon({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-800 rounded-xl">
      <div className="w-11 h-11 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
        <Sparkles size={20} className="text-amber-400" />
      </div>
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <div className="text-xs text-slate-500 mt-1 max-w-sm">{description}</div>
    </div>
  );
}

export function Badge({ children, color = "slate" }) {
  const map = {
    slate: "bg-slate-800 text-slate-300",
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    sky: "bg-sky-500/10 text-sky-400",
    violet: "bg-violet-500/10 text-violet-400",
    pink: "bg-pink-500/10 text-pink-400",
    teal: "bg-teal-500/10 text-teal-400",
    red: "bg-red-500/10 text-red-300",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${map[color] || map.slate}`}>
      {children}
    </span>
  );
}
