import { useEffect, useMemo, useRef, useState } from "react";
import { X, Inbox, CalendarDays, Plus, Loader2, Check, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { sb } from "../lib/api";

export const inputClass =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";

export function ModalShell({ title, onClose, children, maxWidth }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className={`bg-slate-900 border border-slate-800 rounded-xl w-full ${maxWidth || "max-w-md"} max-h-[85vh] overflow-y-auto`}>
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

// Viewer foto dengan zoom pakai scroll mouse + geser (drag) waktu sudah
// di-zoom, plus tombol +/-/reset (buat yang pakai touchscreen / tanpa
// scroll wheel). Batas zoom 1x-6x. Zoom balik ke 1x otomatis reset posisi
// geser supaya gambar tidak "nyangkut" di pojok waktu di-zoom-out lagi.
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;

export function ZoomableImage({ src, alt, height = "h-[65vh]" }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const clamp = (v) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));

  const applyZoom = (next) => {
    const clamped = clamp(next);
    setScale(clamped);
    if (clamped === ZOOM_MIN) setPos({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    // Sensitivitas proporsional ke scale saat ini biar zoom terasa halus
    // baik waktu masih 1x maupun sudah dekat 6x.
    applyZoom(scale - e.deltaY * 0.0025 * scale);
  };

  const startDrag = (e) => {
    if (scale === ZOOM_MIN) return;
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onDrag = (e) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  };
  const stopDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const reset = () => {
    setScale(ZOOM_MIN);
    setPos({ x: 0, y: 0 });
  };

  return (
    <div className="relative select-none">
      <div
        onWheel={handleWheel}
        onMouseDown={startDrag}
        onMouseMove={onDrag}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onDoubleClick={() => applyZoom(scale === ZOOM_MIN ? 2.5 : ZOOM_MIN)}
        className={`w-full ${height} overflow-hidden rounded-lg border border-slate-800 bg-slate-950 ${
          scale > ZOOM_MIN ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full h-full object-contain"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 100ms ease-out",
          }}
        />
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-slate-950/90 border border-slate-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => applyZoom(scale - 0.6)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
          title="Perkecil"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-[10px] text-slate-400 w-9 text-center font-mono">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => applyZoom(scale + 0.6)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
          title="Perbesar"
        >
          <ZoomIn size={14} />
        </button>
        {scale > ZOOM_MIN && (
          <button
            type="button"
            onClick={reset}
            className="w-7 h-7 flex items-center justify-center rounded-md text-amber-400 hover:text-amber-300 hover:bg-slate-800"
            title="Reset zoom"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      <div className="mt-1 text-center text-[10px] text-slate-600">
        Scroll mouse untuk zoom · geser gambar untuk lihat bagian lain
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

// Input angka Rupiah dengan tanda ribuan otomatis saat mengetik (mis. "150.000").
// Sengaja pakai type="text" (bukan type="number") supaya: (1) titik ribuan bisa
// ditampilkan, dan (2) scroll mouse di atas input tidak diam-diam mengubah
// angkanya — perilaku bawaan browser pada <input type="number"> yang sering
// bikin nominal berubah sendiri tanpa sengaja saat user scroll halaman.
export function InputRupiah({ value, onChange, className, placeholder }) {
  const display = value === "" || value === null || value === undefined ? "" : Number(value).toLocaleString("id-ID");

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digitsOnly = e.target.value.replace(/\D/g, "");
        onChange(digitsOnly === "" ? "" : Number(digitsOnly));
      }}
      className={className || inputClass}
      placeholder={placeholder}
    />
  );
}

// Input teks dengan dropdown rekomendasi berdasarkan riwayat (dipakai untuk
// "Keterangan" di form Transaksi Keuangan). Rekomendasi difilter dari daftar
// `suggestions` (biasanya keterangan-keterangan yang pernah diketik sebelumnya,
// sudah diurutkan dari yang paling sering dipakai), cocok kalau teksnya
// mengandung apa yang sedang diketik. Klik salah satu rekomendasi langsung
// mengisi field-nya.
export function SuggestInput({ value, onChange, suggestions, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const filtered = (suggestions || [])
    .filter((s) => s.toLowerCase() !== q)
    .filter((s) => !q || s.toLowerCase().includes(q))
    .slice(0, 6);

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={className || inputClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-amber-400 truncate"
            >
              {s}
            </button>
          ))}
        </div>
      )}
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
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-2">
                  <div className="text-[11px] text-slate-500 mb-1.5">Data belum ada — isi untuk menambah baru:</div>
                  <div className="flex gap-1.5">
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
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!newKode.trim() || !newLabel.trim() || creating}
                    onClick={submitNew}
                    className="w-full flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-2.5 py-1.5 rounded-md mt-1.5"
                  >
                    {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Tambah
                  </button>
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

// Box ketik manual untuk gabungan beberapa kode master data sekaligus, mis.
// Bahan+Peruntukan+Kategori (digabung tanpa pemisah, contoh: bahan "T" +
// peruntukan "D" + kategori "GL" = "TDGL") ditambah Subkategori (dipisah "-",
// jadi "TDGL-XX") ditambah lagi Model-Warna-Ukuran (masing-masing dipisah
// "-" lagi, jadi "TDGL-XX-216-PER-P18CM"), sesuai format SKU LENGKAP
// (Bahan,Peruntukan,Kategori)-Subkategori-Model-Warna-Ukuran. User cukup
// ketik gabungan kodenya — boleh pakai "-" seperti nulis SKU beneran (untuk
// bagian Bahan/Peruntukan/Kategori/Subkategori pemisah "-" opsional, boleh
// ditulis atau tidak, dua-duanya tetap cocok karena diabaikan saat
// pencocokan bagian itu). Daftar di bawah menampilkan semua kombinasi
// Bahan/Peruntukan/Kategori/Subkategori yang ADA di master data dan kodenya
// diawali (atau mengawali) yang diketik. Kalau yang diketik lebih panjang
// dari kombinasi itu (mis. "TDGL-GJR-216-PER-P18CM" sedangkan kombinasi
// hanya "TDGLGJR"), sisanya ("216-PER-P18CM") diperlakukan sebagai ekor
// Model-Warna-Ukuran — DIPISAH PAKAI "-" (dash di bagian ini wajib supaya
// jelas batasnya, karena Model kodenya bebas/tidak dari master data): bagian
// pertama = Model (bebas, tidak perlu ada di master data), bagian kedua =
// dicocokkan ke master Warna, bagian ketiga = dicocokkan ke master Ukuran.
// Pilih salah satu untuk langsung mengisi dropdown-dropdown terkait (Bahan,
// Peruntukan, Kategori, Subkategori) plus Model/Warna/Ukuran kalau ada.
// segments: [{ options: [{kode,label}, ...], sep }, ...] — urutan sesuai
// urutan penggabungan kode di SKU, HANYA untuk bagian yang punya daftar
// tetap di master data (Model TIDAK dimasukkan sebagai segmen karena
// nilainya bebas ketik, bukan dari daftar — otomatis tertangkap sebagai
// bagian pertama ekor). `sep` (opsional) adalah pemisah yang ditulis
// SEBELUM kode segmen ini di tampilan (mis. "-" untuk Subkategori).
// tailOptions: { warna: [{kode,label}, ...], ukuran: [{kode,label}, ...] } —
// dipakai untuk mencocokkan bagian kedua & ketiga dari ekor (Warna & Ukuran)
// setelah Model. Opsional — kalau tidak diisi, ekor cuma dipecah jadi Model
// (perilaku lama, kompatibel untuk pemakaian di form lain kalau ada).
// onPick(picks, tail) — picks: array opsi terpilih (urutan sama dengan
// segments); tail: { model, warna, warnaText, ukuran, ukuranText } — warna/
// ukuran berisi opsi master yang cocok (atau null kalau teksnya tidak ada di
// master/belum ketik), warnaText/ukuranText adalah teks mentah yang diketik.
export function KodeGabunganInput({ segments, tailOptions, onPick, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const norm = (v) => String(v).toUpperCase();

  // origUpper = query asli (diuppercase, dash TETAP dipertahankan — dipakai
  // nanti untuk memisah ekor Model-Warna-Ukuran). q/qChars = versi tanpa
  // dash/simbol lain, dipakai untuk mencocokkan segmen Bahan/Peruntukan/
  // Kategori/Subkategori seperti sebelumnya. origIdxOfQChar memetakan tiap
  // karakter di q kembali ke posisinya di origUpper, supaya begitu segmen-
  // segmen itu selesai dicocokkan, kita bisa tahu persis di mana ekor
  // (dengan dash aslinya) dimulai di string asli.
  const origUpper = query.toUpperCase();
  const qChars = [];
  const origIdxOfQChar = [];
  for (let i = 0; i < origUpper.length; i++) {
    if (/[A-Z0-9]/.test(origUpper[i])) {
      qChars.push(origUpper[i]);
      origIdxOfQChar.push(i);
    }
  }
  const q = qChars.join("");

  // Bangun teks kode gabungan (dengan pemisah "-" sesuai `sep` tiap segmen)
  // dari sekumpulan picks yang urutannya sama dengan `segments`.
  const buildKode = (picks) => picks.map((p, i) => (segments[i]?.sep || "") + norm(p.kode)).join("");

  // Resolusi BERTAHAP, bukan cartesian sekaligus: konsumsi remaining dari
  // kiri, segmen demi segmen. Begitu sebuah segmen match PERSIS (kode opsi
  // = awalan remaining) DAN tidak ada sisa karakter lagi, berhenti di situ —
  // supaya "T" cuma menampilkan Bahan yang cocok (Tembaga), bukan langsung
  // meloncat ke daftar Peruntukan/Kategori/Subkategori di bawahnya. Kalau
  // masih ada sisa karakter, baru lanjut ke segmen berikutnya. Kalau semua
  // segmen sudah habis dan masih ada sisa, itu jadi ekor Model-Warna-Ukuran.
  const resolveState = (remaining, level, picks) => {
    if (level >= segments.length) {
      return { kind: "done", picks, leftoverLen: remaining.length };
    }
    const opts = segments[level].options || [];
    if (remaining === "") {
      return { kind: "level", level, picks, candidates: opts };
    }
    const fullMatches = opts.filter((o) => remaining.startsWith(norm(o.kode)));
    if (fullMatches.length > 0) {
      const maxLen = Math.max(...fullMatches.map((o) => norm(o.kode).length));
      const chosen = fullMatches.find((o) => norm(o.kode).length === maxLen);
      const rest = remaining.slice(norm(chosen.kode).length);
      const nextPicks = [...picks, chosen];
      if (rest === "") {
        return { kind: "resolved", level, picks: nextPicks };
      }
      return resolveState(rest, level + 1, nextPicks);
    }
    const partial = opts.filter((o) => norm(o.kode).startsWith(remaining));
    return { kind: "level", level, picks, candidates: partial };
  };

  const state = q ? resolveState(q, 0, []) : null;

  // Ambil ekor MENTAH (dengan dash asli) dari original string, mulai dari
  // posisi tepat setelah karakter stripped terakhir yang sudah terpakai
  // segmen-segmen di atas — lalu pecah pakai "-" jadi Model/Warna/Ukuran.
  const rawTailOf = (leftoverLen) => {
    const startInQ = q.length - leftoverLen;
    if (startInQ <= 0) return origUpper.replace(/^-+/, "");
    const startInOrig = origIdxOfQChar[startInQ];
    if (startInOrig === undefined) return "";
    return origUpper.slice(startInOrig).replace(/^-+/, "");
  };

  const parseTail = (leftoverLen) => {
    const rawTail = rawTailOf(leftoverLen);
    const parts = rawTail.split("-").map((s) => s.trim()).filter(Boolean);
    const [modelText, warnaText, ukuranText] = parts;
    const findOpt = (list, text) => (text ? (list || []).find((o) => norm(o.kode) === norm(text)) || null : null);
    return {
      rawTail,
      model: modelText || "",
      warnaText: warnaText || "",
      warna: findOpt(tailOptions?.warna, warnaText),
      ukuranText: ukuranText || "",
      ukuran: findOpt(tailOptions?.ukuran, ukuranText),
    };
  };

  const commit = (picks, tail) => {
    onPick(picks, tail);
    setQuery("");
    setOpen(false);
  };

  // Klik opsi di tengah jalan (belum segmen terakhir): isi otomatis sisa
  // kode segmen itu ke input, lalu tetap terbuka supaya user lanjut mengetik
  // segmen berikutnya.
  const extend = (picks, candidate) => {
    setQuery(buildKode([...picks, candidate]));
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder || "Ketik gabungan kode, mis. TDGL-"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && q && state && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-lg">
          {state.kind === "done" && (() => {
            const tail = parseTail(state.leftoverLen);
            return (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(state.picks, tail)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
              >
                <span className="text-slate-300 text-xs">
                  {state.picks.map((p) => p.label).join(" / ")}
                  {tail.model && <span className="text-slate-500"> · Model {tail.model}</span>}
                  {tail.warnaText && (
                    <span className={tail.warna ? "text-slate-500" : "text-amber-500/80"}>
                      {" "}
                      · Warna {tail.warna ? tail.warna.label : `"${tail.warnaText}" (tidak dikenal)`}
                    </span>
                  )}
                  {tail.ukuranText && (
                    <span className={tail.ukuran ? "text-slate-500" : "text-amber-500/80"}>
                      {" "}
                      · Ukuran {tail.ukuran ? tail.ukuran.label : `"${tail.ukuranText}" (tidak dikenal)`}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-amber-400 whitespace-nowrap">
                  {buildKode(state.picks)}
                  {tail.rawTail && `-${tail.rawTail}`}
                </span>
              </button>
            );
          })()}

          {state.kind === "resolved" && (
            <div className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm">
              <span className="text-slate-300 text-xs">{state.picks.map((p) => p.label).join(" / ")}</span>
              <span className="font-mono text-[11px] text-amber-400 whitespace-nowrap">{buildKode(state.picks)}</span>
            </div>
          )}

          {state.kind === "level" &&
            (state.candidates.length > 0 ? (
              state.candidates.map((c) => {
                const isLast = state.level === segments.length - 1;
                return (
                  <button
                    key={c.kode}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (isLast ? commit([...state.picks, c], parseTail(0)) : extend(state.picks, c))}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900"
                  >
                    <span className="text-slate-300 text-xs">
                      {[...state.picks.map((p) => p.label), c.label].join(" / ")}
                    </span>
                    <span className="font-mono text-[11px] text-amber-400 whitespace-nowrap">
                      {buildKode([...state.picks, c])}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500">Tidak ada kombinasi kode yang cocok.</div>
            ))}
        </div>
      )}
    </div>
  );
}

// Pola "pilih dari daftar ATAU tambah baru" — mirip Combobox (field Bahan/
// Kategori/dll di form SKU): ketik untuk cari opsi yang sudah ada, dan kalau
// yang diketik belum ada di daftar, baru muncul prompt "+ Tambah baru" —
// diklik dulu baru kolom Kode + Nama terbuka (prefilled dari yang diketik).
// Jadi kolom Kode/Nama TIDAK selalu tampil, hanya muncul saat memang
// dibutuhkan (user mengetik nama yang belum ada). Memilih salah satu
// (existing vs baru) otomatis mengosongkan yang lain.
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false); // true = kolom Kode/Nama sedang terbuka
  const [kodeTouched, setKodeTouched] = useState(false);
  const wrapRef = useRef(null);

  const selectedOption = options.find((o) => String(o.value) === String(value));
  const hasPendingNew = !value && newLabel && newLabel.trim();

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
        setAdding(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q))
    : options;
  const exactMatch = options.some((o) => o.label.toLowerCase() === q || String(o.value).toLowerCase() === q);
  const showAddPrompt = q && !exactMatch;

  const commitExisting = (opt) => {
    onChange(opt.value);
    onNewKodeChange("");
    onNewLabelChange("");
    setKodeTouched(false);
    setQuery("");
    setOpen(false);
    setAdding(false);
  };

  const startAdd = () => {
    onChange("");
    onNewLabelChange(query.trim());
    onNewKodeChange(suggestKode(query.trim()));
    setKodeTouched(false);
    setAdding(true);
  };

  const confirmAdd = () => {
    if (!newKode.trim() || !newLabel.trim()) return;
    setQuery("");
    setOpen(false);
    setAdding(false);
  };

  const displayValue = open
    ? query
    : selectedOption
    ? selectedOption.label
    : hasPendingNew
    ? `${newLabel.trim()} (baru: ${(newKode || "").trim() || "?"})`
    : "";

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        value={displayValue}
        placeholder={placeholder || "Cari atau ketik nama baru…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setAdding(false);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitExisting(o)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-900 ${
                  String(o.value) === String(value) ? "bg-amber-500/15 text-amber-400" : "text-slate-200"
                }`}
              >
                {o.label}
              </button>
            ))
          ) : !showAddPrompt ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              {q ? "Tidak ada yang cocok." : "Ketik untuk mencari…"}
            </div>
          ) : null}

          {showAddPrompt && (
            <div className="border-t border-slate-800 p-2.5">
              {!adding ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={startAdd}
                  className="w-full flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 px-1 py-1"
                >
                  <Plus size={13} /> Tambah baru "{query.trim()}"
                </button>
              ) : (
                <div>
                  <div className="text-[11px] text-slate-500 mb-1.5">Data belum ada — isi untuk menambah baru:</div>
                  <div className="flex gap-1.5">
                    <div className="w-16 flex-shrink-0">
                      <div className="text-[10px] text-slate-500 mb-1">Kode</div>
                      <input
                        value={newKode}
                        onChange={(e) => {
                          onNewKodeChange(e.target.value);
                          setKodeTouched(true);
                        }}
                        placeholder="KODE"
                        maxLength={8}
                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs outline-none focus:border-amber-500 uppercase text-center"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-slate-500 mb-1">Nama</div>
                      <input
                        value={newLabel}
                        onChange={(e) => {
                          const nama = e.target.value;
                          onNewLabelChange(nama);
                          if (!kodeTouched) onNewKodeChange(suggestKode(nama));
                        }}
                        placeholder={newPlaceholder || "Nama baru"}
                        className="w-full min-w-0 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                        onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!newKode.trim() || !newLabel.trim()}
                    onClick={confirmAdd}
                    className="w-full flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-2.5 py-1.5 rounded-md mt-1.5"
                  >
                    <Check size={12} /> Pakai kode ini
                  </button>
                </div>
              )}
            </div>
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

// `sticky` opsional: dipakai di halaman yang tombol aksinya (mis. "+ Barang
// Masuk", "+ Transaksi") perlu tetap terlihat walau daftar di bawahnya
// discroll — nempel di bawah header utama (yang tingginya ~53px), sama
// seperti pola sticky search bar di halaman Peta Rak.
export function PageHeader({ title, description, action, sticky }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 mb-5 ${
        sticky ? "sticky top-[53px] z-10 bg-slate-950 py-3 -mt-3" : ""
      }`}
    >
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