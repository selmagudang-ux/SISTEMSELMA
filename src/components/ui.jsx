import { useEffect, useRef, useState } from "react";
import { X, Inbox, Sparkles, CalendarDays, Plus, Loader2 } from "lucide-react";
import { sb } from "../lib/api";

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

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Ubah "YYYY-MM-DD" jadi "14 Agustus 2026". Mengembalikan "" kalau kosong/invalid.
export function formatTanggalID(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
}

// Input tanggal dengan tampilan format Indonesia ("14 Agustus 2026"), tapi tetap
// pakai date picker bawaan browser (value tersimpan tetap "YYYY-MM-DD" seperti biasa,
// jadi tidak perlu ubah logika lain yang bergantung pada format ini).
// Input asli (type="date") langsung jadi target klik — tanpa perantara JS —
// supaya kalender terbuka secepat input date biasa.
export function InputTanggal({ value, onChange, className }) {
  const display = formatTanggalID(value);

  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className || inputClass} relative z-10 opacity-0 cursor-pointer`}
        aria-label="Pilih tanggal"
      />
      <div
        className={`${className || inputClass} absolute inset-0 flex items-center justify-between pointer-events-none`}
      >
        <span className={display ? "" : "text-slate-500"}>{display || "Pilih tanggal"}</span>
        <CalendarDays size={14} className="text-slate-500 shrink-0 ml-2" />
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

// Kolom pilih yang bisa diketik manual (combobox) untuk referensi master_data
// bertipe {kode, label} (bahan/peruntukan/kategori/subkategori/warna/ukuran
// untuk SKU, atau rekening/kategori_masuk/kategori_keluar untuk Keuangan).
// - Mengetik memfilter daftar opsi yang sudah ada (kode ATAU nama yang cocok).
// - Kalau yang dicari belum ada, muncul mini-form "Kode" + "Nama" di bawah
//   daftar — begitu diisi dan klik "Tambah", entri baru langsung disimpan ke
//   master_data (tipe sesuai prop `tipe`) lalu otomatis kepilih. Entri ini
//   juga langsung muncul di halaman Master Data / Rekening & Kategori karena
//   sama-sama baca dari tabel yang sama.
// Props wajib: tipe (string tipe master_data) dan reload (refresh state
// `master` di App.jsx supaya opsi baru langsung kepakai di form ini juga).
// Sarankan kode singkat dari nama yang diketik, supaya user jarang perlu
// ngetik kode manual sendiri — tetap bisa diubah bebas sebelum "Tambah".
// - 1 kata: 3 huruf pertama ("Beludru" -> "BEL").
// - 2+ kata: huruf pertama tiap kata, maks 4 huruf ("Anting Jurai" -> "AJ").
export function suggestKode(label) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

export function Combobox({ value, onChange, options, placeholder, tipe, reload }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [newKode, setNewKode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);

  const selected = options.find((o) => o.kode === value);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
        setNewKode("");
        setNewLabel("");
        setError("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.kode.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    : options;
  const exactMatch = options.some((o) => o.kode.toLowerCase() === q || o.label.toLowerCase() === q);

  const commit = (kode) => {
    onChange(kode);
    setQuery("");
    setOpen(false);
  };

  const startAdd = () => {
    setNewKode(suggestKode(query.trim()));
    setNewLabel(query.trim());
    setError("");
  };

  const submitNew = async () => {
    const kode = newKode.trim().toUpperCase();
    const label = newLabel.trim();
    if (!kode || !label || creating) return;
    if (options.some((o) => o.kode === kode)) {
      setError(`Kode "${kode}" sudah dipakai — pilih dari daftar atau ganti kode.`);
      return;
    }
    setCreating(true);
    setError("");
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe, kode, label }) });
      await reload?.();
      onChange(kode);
      setQuery("");
      setNewKode("");
      setNewLabel("");
      setOpen(false);
    } catch (e) {
      setError(e.message || "Gagal menambah");
    } finally {
      setCreating(false);
    }
  };

  const showAddForm = !!tipe && q && !exactMatch;

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        value={open ? query : selected ? `${selected.label} (${selected.kode})` : ""}
        placeholder={placeholder || "Ketik atau pilih…"}
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
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((o) => (
              <button
                key={o.kode}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(o.kode)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-900 ${
                  o.kode === value ? "bg-amber-500/15 text-amber-400" : "text-slate-200"
                }`}
              >
                <span>{o.label}</span>
                <span className="font-mono text-[11px] text-slate-500">{o.kode}</span>
              </button>
            ))
          ) : !showAddForm ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              {q ? "Tidak ada yang cocok." : "Ketik untuk mencari…"}
            </div>
          ) : null}

          {showAddForm && (
            <div className="border-t border-slate-800 p-2.5">
              {newKode === "" && newLabel === "" ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={startAdd}
                  className="w-full flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 px-1 py-1"
                >
                  <Plus size={13} /> Tambah baru "{query.trim()}"
                </button>
              ) : (
                <div onMouseDown={(e) => e.preventDefault()} className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-[11px] text-slate-500 mb-1.5">Data belum ada — isi untuk menambah baru:</div>
                  <div className="flex gap-1.5 items-end">
                    <div className="w-16 flex-shrink-0">
                      <div className="text-[10px] text-slate-500 mb-1">Kode</div>
                      <input
                        value={newKode}
                        onChange={(e) => setNewKode(e.target.value)}
                        placeholder="KODE"
                        maxLength={8}
                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs outline-none focus:border-amber-500 uppercase text-center"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-slate-500 mb-1">Nama</div>
                      <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Nama baru"
                        className="w-full min-w-0 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                        onKeyDown={(e) => e.key === "Enter" && submitNew()}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!newKode.trim() || !newLabel.trim() || creating}
                      onClick={submitNew}
                      className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-2.5 py-1.5 rounded-md flex-shrink-0"
                    >
                      {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Tambah
                    </button>
                  </div>
                  {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
                </div>
              )}
            </div>
          )}
        </div>
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

// Pola "pilih dari daftar ATAU tambah baru langsung di bawahnya" — bagian
// pilihnya sama seperti field Pelanggan di Grosir > Buat Pesanan Baru
// (SearchableSelect di atas, input di bawahnya selalu terlihat, tidak perlu
// buka popup). Beda dari versi pelanggan: entri baru di sini butuh Kode +
// Nama terpisah (bukan cuma satu nama), konsisten dengan field master_data
// lain seperti Bahan/Peruntukan/Kategori di form SKU (lihat Combobox).
// Kode disarankan otomatis dari Nama yang diketik (lihat suggestKode), tapi
// tetap bisa diubah manual — begitu diubah manual, saran otomatis berhenti
// menimpa. Memilih salah satu (existing vs baru) otomatis mengosongkan yang lain.
export function SearchableSelectOrNew({
  value,
  onChange,
  newKode,
  onNewKodeChange,
  newLabel,
  onNewLabelChange,
  options,
  placeholder,
  newPlaceholder,
}) {
  const [kodeTouched, setKodeTouched] = useState(false);

  return (
    <div>
      <SearchableSelect
        value={value}
        onChange={(kode) => {
          onChange(kode);
          onNewKodeChange("");
          onNewLabelChange("");
          setKodeTouched(false);
        }}
        options={options}
        placeholder={placeholder || "Cari…"}
      />

      <div className="flex items-center gap-2 my-2">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">atau tambah baru</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div className="flex gap-2 p-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/40">
        <div className="w-20 flex-shrink-0">
          <div className="text-[10px] text-slate-500 mb-1">Kode</div>
          <input
            className={`${inputClass} px-2 uppercase text-center`}
            value={newKode}
            onChange={(e) => {
              onNewKodeChange(e.target.value);
              setKodeTouched(true);
              onChange("");
            }}
            placeholder="KODE"
            maxLength={8}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-500 mb-1">Nama</div>
          <input
            className={`${inputClass} min-w-0`}
            value={newLabel}
            onChange={(e) => {
              const nama = e.target.value;
              onNewLabelChange(nama);
              onChange("");
              if (!kodeTouched) onNewKodeChange(suggestKode(nama));
            }}
            placeholder={newPlaceholder || "Atau ketik nama baru"}
          />
        </div>
      </div>
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
    orange: "bg-orange-500/10 text-orange-400",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${map[color] || map.slate}`}>
      {children}
    </span>
  );
}