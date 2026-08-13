import { useEffect, useRef, useState } from "react";
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

// Kolom pilih yang bisa diketik manual (combobox).
// - Mengetik akan memfilter daftar opsi (kode/label yang cocok saja yang muncul).
// - Kalau kode yang diketik belum ada di opsi, tetap bisa dipakai — nanti
//   dianggap "kode baru" oleh pemanggilnya (mis. dibuat otomatis ke Master Data saat disimpan).
export function Combobox({ value, onChange, options, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.kode.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    : options;
  const exactMatch = options.some((o) => o.kode.toLowerCase() === q);

  const commit = (kode) => {
    setQuery(kode);
    onChange(kode);
    setOpen(false);
  };

  const handleChange = (raw) => {
    setQuery(raw);
    onChange(raw.trim().toUpperCase());
    setOpen(true);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder || "Ketik atau pilih…"}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-44 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((o) => (
              <button
                key={o.kode}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o.kode)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-900"
              >
                <span className="text-slate-200">{o.label}</span>
                <span className="font-mono text-[11px] text-amber-400">{o.kode}</span>
              </button>
            ))
          ) : q ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              Tidak ada yang cocok — kode baru{" "}
              <span className="font-mono text-amber-400">"{query.trim().toUpperCase()}"</span> akan dibuat otomatis.
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">Ketik untuk mencari atau membuat kode baru…</div>
          )}
        </div>
      )}
      {q && !exactMatch && (
        <div className="text-[10px] text-amber-500/80 mt-1">Kode baru, akan dibuat otomatis saat disimpan.</div>
      )}
    </div>
  );
}

// Dropdown yang bisa diketik untuk MEMFILTER opsi yang sudah ada (bukan combobox
// master-data yang bisa bikin kode baru). Dipakai untuk semua dropdown pilihan
// referensi di aplikasi ini: Rak, Alasan Barang Keluar, Role User, Warna Label, dst.
// options: [{ value, label }]
export function SearchableSelect({ value, onChange, options, placeholder, disabled, compact }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selectedOption = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)
      )
    : options;

  const commit = (opt) => {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  };

  const sizeClass = compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";

  return (
    <div className="relative" ref={wrapRef}>
      <input
        disabled={disabled}
        className={`w-full bg-slate-950 border border-slate-800 rounded-lg outline-none focus:border-amber-500 disabled:opacity-40 ${sizeClass}`}
        value={open ? query : selectedOption ? selectedOption.label : ""}
        placeholder={placeholder || "Ketik untuk mencari…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-900 ${
                  String(o.value) === String(value) ? "bg-amber-500/15 text-amber-400" : "text-slate-200"
                }`}
              >
                {o.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">Tidak ada yang cocok.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, accent, icon: Icon, iconColor }) {
  return (
    <div className="rounded-xl border border-slate-800 p-4 bg-slate-900/50">
      {Icon && <Icon size={16} className={`mb-2 ${iconColor || "text-slate-500"}`} />}
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