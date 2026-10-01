import { useEffect, useMemo, useState } from "react";
import { Search, Printer, CheckSquare, Square, ChevronDown, List } from "lucide-react";
import { EmptyState, SearchableSelect } from "../components/ui";
import { priceCode, labelFor } from "../lib/api";
import { skuForRak } from "./Rak";
import Barcode128 from "../components/Barcode128";

// SKU versi singkat untuk label cetak: Bahan+Peruntukan+Kategori - Subkategori - Model
// (warna & ukuran tidak ikut ditampilkan di label).
function shortSku(s) {
  if (!s) return "";
  return `${s.bahan || ""}${s.peruntukan || ""}${s.kategori || ""}-${s.subkategori || ""}-${s.model || ""}`;
}

// Jika "Warna Produk?" dicentang, kode warna (mis. KUN) digabung langsung ke
// belakang SKU dengan tanda "-", contoh: "TDCC-SIM-1-KUN" — bukan ditampilkan
// terpisah di baris bawah.
function skuDenganWarna(s, tampilkanWarna) {
  const base = shortSku(s);
  if (!tampilkanWarna || !s?.warna) return base;
  return `${base}-${s.warna}`;
}

const WARNA_OPTIONS = [
  { key: "hitam", label: "Hitam", css: "#000000" },
  { key: "merah", label: "Merah", css: "#dc2626" },
  { key: "biru", label: "Biru", css: "#1d4ed8" },
];
const warnaCss = (key) => (WARNA_OPTIONS.find((w) => w.key === key) || WARNA_OPTIONS[0]).css;

const DEFAULT_ROW = { qty: 1, warna: "hitam", catatan: "", tampilkanWarnaProduk: false };

// Kode harga grosir di label = harga Grosir dalam RIBUAN, tanpa "000":
// Rp 27.000 -> "27", Rp 135.000 -> "135". Sisa di bawah seribu dibulatkan.
function kodeHargaGrosir(harga) {
  const ribu = Math.round((Number(harga) || 0) / 1000);
  return ribu > 0 ? String(ribu) : "";
}

// Pengaturan kertas stiker terakhir disimpan di HP/komputer supaya tidak perlu diatur ulang.
const LAYOUT_STORAGE_KEY = "ss-cetak-label-layout";
const DEFAULT_LAYOUT = {
  ukuranKertas: "A4", // A4 | Letter | F4 | Termal
  orientasi: "portrait", // portrait | landscape
  posisi: "kiri", // kiri | tengah
  kolom: 3,
  baris: 6,
  marginAtas: 8,
  marginKiri: 8,
  lebarLabel: 63,
  tinggiLabel: 46,
  gapX: 2,
  gapY: 2,
  spasiBaris: 2,
  border: true,
  // Ukuran huruf per baris pada label (dalam pt) — bisa diatur masing-masing.
  fontRak: 13, // baris kode rak, mis. "G2C-1A"
  fontSku: 13, // baris SKU, mis. "TDCC-SIM-1" (atau "TDCC-SIM-1-KUN" jika warna produk dicentang)
  fontKode: 17, // baris kode harga, mis. "334488"
  fontCatatan: 8, // baris catatan (bila diisi)
  // Barcode Code 128 di bagian bawah label — isinya SKU LENGKAP (termasuk warna & ukuran),
  // supaya tiap varian punya barcode sendiri dan bisa di-scan di Stok / Stok Opname.
  barcode: false,
  tinggiBarcode: 10, // mm
  // Gaya label: "rak" = gaya lama (kode rak, SKU, kode harga); "harga" = stiker harga
  // (nama produk + kode grosir di atas, barcode besar di tengah, kode & harga di bawah).
  gaya: "rak",
  fontNama: 10, // pt — baris atas gaya "harga", mis. GELANG 24K
  fontBawah: 10, // pt — kode di kiri bawah, mis. 5101K
  fontHarga: 13, // pt — harga di kanan bawah, mis. Rp.54000
  // Ruang di dalam label gaya "harga" (mm). Makin kecil = barcode makin tinggi.
  paddingV: 2, // padding atas & bawah
  paddingH: 2.5, // padding kiri & kanan
  gapHarga: 1, // jarak antara baris nama, barcode, dan baris harga
  // Kode harga GROSIR (angka ribuan, mis. 27 = Rp 27.000) di pojok kanan atas stiker gaya "harga" —
  // supaya staf/pelanggan grosir tahu harga grosirnya tanpa buka aplikasi.
  kodeGrosir: true,
  fontKodeGrosir: 9, // pt — kode di pojok kanan atas
};
// Preset khusus saat memilih kertas termal 100x150mm: satu label per lembar, tanpa margin/jarak.
const TERMAL_PRESET = {
  kolom: 1,
  baris: 1,
  lebarLabel: 100,
  tinggiLabel: 150,
  marginAtas: 0,
  marginKiri: 0,
  gapX: 0,
  gapY: 0,
};
// Preset kertas roll stiker 110 mm (lebar) x 15 mm (panjang): satu label per lembar, tanpa margin/jarak.
const PRESET_110X15 = {
  kolom: 1,
  baris: 1,
  lebarLabel: 110,
  tinggiLabel: 15,
  marginAtas: 0,
  marginKiri: 0,
  gapX: 0,
  gapY: 0,
  paddingV: 0.5,
  paddingH: 2,
  gapHarga: 0.3,
};
function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!saved) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(saved);
    // Pengaturan 110x15 yang tersimpan sebelum ada opsi padding: pakai padding ringkas dari preset.
    const dasar = parsed.ukuranKertas === "110x15" && parsed.paddingV === undefined
      ? { paddingV: PRESET_110X15.paddingV, paddingH: PRESET_110X15.paddingH, gapHarga: PRESET_110X15.gapHarga }
      : {};
    return { ...DEFAULT_LAYOUT, ...dasar, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// Format angka dengan titik pemisah ribuan, mis. 54000 -> "54.000".
function formatRibuan(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Perkiraan tinggi barcode (mm) pada stiker gaya "harga" = tinggi label dikurangi padding, border, dua baris teks, dan jarak.
function estimasiTinggiBarcode(l) {
  const PT = 0.3528; // 1pt = 0.3528mm; line-height baris teks = 1
  const atas = Math.max(l.fontNama, l.kodeGrosir ? l.fontKodeGrosir : 0) * PT;
  const bawah = Math.max(l.fontBawah, l.fontHarga) * PT;
  const border = l.border ? 0.53 : 0;
  return l.tinggiLabel - 2 * l.paddingV - border - atas - bawah - 2 * l.gapHarga;
}

// Ukuran halaman CSS (@page) berdasarkan ukuran kertas yang dipilih.
function pageSizeCss(ukuranKertas) {
  if (ukuranKertas === "F4") return "215mm 330mm";
  if (ukuranKertas === "Termal") return "100mm 150mm";
  if (ukuranKertas === "110x15") return "110mm 15mm";
  return ukuranKertas; // A4 | Letter
}

export default function CetakLabel({ penempatan, rak, skuMaster, master }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState({}); // { rakCode: { qty, warna, catatan } }

  // Ukuran & posisi lembar stiker — bisa disesuaikan dengan kertas stiker yang dipakai.
  const [layout, setLayout] = useState(loadLayout);

  // Tampilan sesuai permintaan: daftar rak & pengaturan kertas tidak langsung
  // dibuka. Daftar baru muncul kalau user mengetik di kolom cari atau klik
  // "Tampilkan Semua Rak"; pengaturan kertas baru terbuka kalau header-nya diklik.
  const [showDaftar, setShowDaftar] = useState(false);
  const [showPengaturan, setShowPengaturan] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // abaikan jika penyimpanan tidak tersedia (mis. mode private browsing)
    }
  }, [layout]);

  const skuMap = useMemo(() => {
    const m = {};
    (skuMaster || []).forEach((s) => (m[s.sku] = s));
    return m;
  }, [skuMaster]);

  // Rak yang sedang berisi SKU aktif (aturan 1 rak = 1 SKU). Cetak label selalu per rak.
  const rakList = useMemo(
    () =>
      (rak || [])
        .map((r) => ({ ...r, occupantSku: skuForRak(r.code, penempatan) }))
        .filter((r) => r.occupantSku && skuMap[r.occupantSku]),
    [rak, penempatan, skuMap]
  );

  const daftarTampil = showDaftar || q.trim() !== "";

  const filteredRak = rakList.filter(
    (r) => r.code.toLowerCase().includes(q.toLowerCase()) || r.occupantSku.toLowerCase().includes(q.toLowerCase())
  );

  // Baris yang ditampilkan di tabel pemilihan: rak yang SUDAH DICEKLIS selalu
  // ikut tampil (tidak hilang waktu kolom cari diganti/dikosongkan), ditambah
  // hasil pencarian / semua rak kalau daftar sedang dibuka.
  const rowsTampil = rakList.filter(
    (r) =>
      selected[r.code] != null ||
      (daftarTampil &&
        (r.code.toLowerCase().includes(q.toLowerCase()) || r.occupantSku.toLowerCase().includes(q.toLowerCase())))
  );

  const toggle = (key, defaultQty) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key] != null) delete next[key];
      else next[key] = { ...DEFAULT_ROW, qty: defaultQty };
      return next;
    });
  };

  const patchRow = (key, patch) => {
    setSelected((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };

  const pilihSemua = () => {
    setSelected((prev) => {
      const next = { ...prev };
      filteredRak.forEach((r) => {
        if (next[r.code] == null) next[r.code] = { ...DEFAULT_ROW };
      });
      return next;
    });
  };
  const batalSemua = () => setSelected({});

  // ---- Bangun daftar label final (flat, sesuai qty) untuk dicetak ----
  const labels = useMemo(() => {
    const out = [];
    rakList.forEach((r) => {
      const row = selected[r.code];
      if (!row || !row.qty) return;
      const s = skuMap[r.occupantSku];
      const kode = priceCode(s.grosir, s.tengah, s.ecer);
      for (let n = 0; n < row.qty; n++) {
        out.push({
          key: `${r.code}-${n}`,
          sku: skuDenganWarna(s, row.tampilkanWarnaProduk),
          skuLengkap: s.sku,
          // ---- dipakai gaya "harga" ----
          nama: [labelFor(master || {}, "kategori", s.kategori), labelFor(master || {}, "bahan", s.bahan)]
            .filter((x) => x && x !== "—")
            .join(" ")
            .toUpperCase(),
          kodeBawah: (s.barcode_supplier || "").trim() || shortSku(s),
          harga: Number(s.ecer) > 0 ? `Rp.${formatRibuan(s.ecer)}` : "",
          grosir: s.grosir,
          rak: r.code,
          kode,
          warna: row.warna,
          catatan: row.catatan,
        });
      }
    });
    return out;
  }, [rakList, selected, skuMap, master]);

  const totalTerpilih = Object.keys(selected).length;

  const cetak = () => {
    if (labels.length === 0) return;
    window.print();
  };

  // Baris tabel pemilihan rak.
  const renderRow = (key, kodeRak, skuLabel, kode, defaultQty) => {
    const row = selected[key];
    const checked = row != null;
    return (
      <tr key={key} className="border-b border-slate-800/60 last:border-0">
        <td className="px-3 py-2">
          <input type="checkbox" checked={checked} onChange={() => toggle(key, defaultQty)} className="accent-amber-500" />
        </td>
        <td className="px-3 py-2 font-mono text-xs">{kodeRak}</td>
        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{skuLabel}</td>
        <td className="px-3 py-2 font-mono text-amber-400 text-xs">{kode}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="0"
            disabled={!checked}
            value={row?.qty ?? defaultQty}
            onChange={(e) => patchRow(key, { qty: Math.max(0, Number(e.target.value) || 0) })}
            className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-40"
          />
        </td>
        <td className="px-3 py-2">
          <SearchableSelect
            compact
            disabled={!checked}
            value={row?.warna ?? "hitam"}
            onChange={(v) => patchRow(key, { warna: v })}
            options={WARNA_OPTIONS.map((w) => ({ value: w.key, label: w.label }))}
          />
        </td>
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            disabled={!checked}
            checked={row?.tampilkanWarnaProduk ?? false}
            onChange={(e) => patchRow(key, { tampilkanWarnaProduk: e.target.checked })}
            className="accent-amber-500 disabled:opacity-40"
            title="Tampilkan warna produk (dari kategori Warna di SKU) di label SKU ini"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            disabled={!checked}
            placeholder="cth: P.-/+18CM"
            value={row?.catatan ?? ""}
            onChange={(e) => patchRow(key, { catatan: e.target.value })}
            className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-40"
          />
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* ====== Area layar (tidak ikut tercetak) ====== */}
      <div className="print:hidden">
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-200">Cetak Label per Rak</div>
          <p className="text-xs text-slate-500 mt-0.5">
            Label dicetak berdasarkan rak yang sedang berisi SKU (aturan 1 rak = 1 SKU).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
            <Search size={14} className="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode rak atau SKU…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={() => {
              if (showDaftar) {
                setShowDaftar(false);
                setQ("");
              } else {
                setShowDaftar(true);
              }
            }}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border ${
              daftarTampil ? "border-amber-500/50 text-amber-300" : "border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <List size={13} /> {showDaftar ? "Sembunyikan Daftar" : "Tampilkan Semua Rak"}
          </button>
          {daftarTampil && (
            <button
              onClick={pilihSemua}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700"
            >
              <CheckSquare size={13} /> Pilih Semua
            </button>
          )}
          {totalTerpilih > 0 && (
            <button
              onClick={batalSemua}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700"
            >
              <Square size={13} /> Batal Pilih ({totalTerpilih})
            </button>
          )}
        </div>

        {/* ---- Daftar pilihan ---- */}
        {rowsTampil.length === 0 ? (
          !daftarTampil ? (
            <div className="rounded-xl border border-dashed border-slate-800 px-4 py-6 mb-5 text-center text-xs text-slate-500">
              Ketik kode rak atau SKU di kolom cari, atau klik “Tampilkan Semua Rak”, untuk memilih label yang mau dicetak.
            </div>
          ) : (
            <EmptyState label="Tidak ada rak yang sedang berisi SKU." />
          )
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto mb-5">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5">Kode Rak</th>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Kode Harga</th>
                  <th className="px-3 py-2.5">Jumlah</th>
                  <th className="px-3 py-2.5">Warna</th>
                  <th className="px-3 py-2.5 text-center">Warna Produk?</th>
                  <th className="px-3 py-2.5">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rowsTampil.map((r) => {
                  const s = skuMap[r.occupantSku];
                  const kode = priceCode(s.grosir, s.tengah, s.ecer);
                  return renderRow(r.code, r.code, r.occupantSku, kode, 1);
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Pengaturan ukuran kertas stiker ---- */}
        <div className="rounded-xl border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => setShowPengaturan((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <div className="text-xs font-semibold text-slate-300">Pengaturan Kertas Stiker</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {layout.gaya === "harga" ? "Stiker Harga" : "Label Rak"} · {layout.ukuranKertas}{" "}
                {layout.orientasi === "portrait" ? "Portrait" : "Landscape"} · {layout.kolom}×{layout.baris} label
              </div>
            </div>
            <ChevronDown
              size={16}
              className={`text-slate-500 transition-transform flex-shrink-0 ${showPengaturan ? "rotate-180" : ""}`}
            />
          </button>
          {showPengaturan && (
          <div className="p-4 border-t border-slate-800">

          <label className="block mb-3 max-w-xs">
            <div className="text-[11px] text-slate-500 mb-1">Gaya Label</div>
            <select
              value={layout.gaya}
              onChange={(e) => setLayout((prev) => ({ ...prev, gaya: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
            >
              <option value="rak">Label Rak (kode rak, SKU, kode harga)</option>
              <option value="harga">Stiker Harga (nama, barcode besar, kode, harga)</option>
            </select>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Ukuran Kertas</div>
              <select
                value={layout.ukuranKertas}
                onChange={(e) => {
                  const val = e.target.value;
                  setLayout((prev) => ({
                    ...prev,
                    ukuranKertas: val,
                    // Kertas termal 100x150mm: langsung terapkan preset 1 label per lembar, tanpa margin.
                    ...(val === "Termal" ? TERMAL_PRESET : val === "110x15" ? PRESET_110X15 : {}),
                  }));
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="F4">F4 (Folio)</option>
                <option value="Termal">Termal 100×150mm</option>
                <option value="110x15">Stiker 110×15mm (lebar 110, panjang 15)</option>
              </select>
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Orientasi</div>
              <select
                value={layout.orientasi}
                onChange={(e) => setLayout((prev) => ({ ...prev, orientasi: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              >
                <option value="portrait">Portrait (Tegak)</option>
                <option value="landscape">Landscape (Rebah)</option>
              </select>
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Tata Letak</div>
              <select
                value={layout.posisi}
                onChange={(e) => setLayout((prev) => ({ ...prev, posisi: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              >
                <option value="kiri">Rata Kiri (pakai margin)</option>
                <option value="tengah">Di Tengah Halaman</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              ["kolom", "Kolom"],
              ["baris", "Baris"],
              ["marginAtas", "Margin Atas (mm)"],
              ["marginKiri", "Margin Kiri (mm)"],
              ["lebarLabel", "Lebar Label (mm)"],
              ["tinggiLabel", "Tinggi Label (mm)"],
              ["gapX", "Jarak Kolom (mm)"],
              ["gapY", "Jarak Baris (mm)"],
              ["spasiBaris", "Jarak Antar Tulisan (mm)"],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                <input
                  type="number"
                  min="0"
                  value={layout[key]}
                  onChange={(e) =>
                    setLayout((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                />
              </label>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mb-1.5 mt-1">Ukuran Huruf per Baris (pt)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              ["fontRak", "Kode Rak", "cth: G2C-1A"],
              ["fontSku", "SKU", "cth: TDCC-SIM-1"],
              ["fontKode", "Kode Harga", "cth: 334488"],
              ["fontCatatan", "Catatan", "cth: P.-/+18CM"],
            ].map(([key, label, contoh]) => (
              <label key={key} className="block">
                <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                <input
                  type="number"
                  min="1"
                  value={layout[key]}
                  onChange={(e) =>
                    setLayout((prev) => ({ ...prev, [key]: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                />
                <div className="text-[10px] text-slate-600 mt-0.5">{contoh}</div>
              </label>
            ))}
          </div>

          {layout.gaya === "harga" && (
            <>
              <div className="text-[11px] text-slate-500 mb-1.5">Ukuran Huruf Stiker Harga (pt)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {[
                  ["fontNama", "Nama Produk", "cth: GELANG 24K"],
                  ["fontBawah", "Kode Bawah", "cth: 5101K"],
                  ["fontHarga", "Harga", "cth: Rp.54.000"],
                ].map(([key, label, contoh]) => (
                  <label key={key} className="block">
                    <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                    <input
                      type="number"
                      min="1"
                      value={layout[key]}
                      onChange={(e) =>
                        setLayout((prev) => ({ ...prev, [key]: Math.max(1, Number(e.target.value) || 1) }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                    />
                    <div className="text-[10px] text-slate-600 mt-0.5">{contoh}</div>
                  </label>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mb-1.5">Ruang di Dalam Label (mm) — kecilkan supaya barcode lebih tinggi</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {[
                  ["paddingV", "Padding Atas/Bawah"],
                  ["paddingH", "Padding Kiri/Kanan"],
                  ["gapHarga", "Jarak Antar Baris"],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <div className="text-[11px] text-slate-500 mb-1">{label}</div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={layout[key]}
                      onChange={(e) =>
                        setLayout((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                    />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Tinggi barcode otomatis mengisi sisa ruang label (perkiraan sekarang:{" "}
                <span className={estimasiTinggiBarcode(layout) < 4 ? "text-red-400 font-semibold" : "text-slate-300 font-semibold"}>
                  {Math.max(0, estimasiTinggiBarcode(layout)).toFixed(1)} mm
                </span>
                ). Kalau masih pendek, kecilkan ukuran huruf Nama/Kode/Harga di atas. Harga diambil dari harga Ecer.
              </p>
              <div className="rounded-lg border border-slate-800 p-3 mb-3">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={layout.kodeGrosir}
                    onChange={(e) => setLayout((prev) => ({ ...prev, kodeGrosir: e.target.checked }))}
                    className="accent-amber-500"
                  />
                  Tampilkan kode harga Grosir (angka ribuan, mis. 27 = Rp 27.000) di pojok kanan atas label
                </label>
                {layout.kodeGrosir && (
                  <label className="block mt-3 max-w-[180px]">
                    <div className="text-[11px] text-slate-500 mb-1">Ukuran huruf kode (pt)</div>
                    <input
                      type="number"
                      min="3"
                      step="0.5"
                      value={layout.fontKodeGrosir}
                      onChange={(e) =>
                        setLayout((prev) => ({ ...prev, fontKodeGrosir: Math.max(3, Number(e.target.value) || 3) }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
                    />
                  </label>
                )}
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={layout.border}
              onChange={(e) => setLayout((prev) => ({ ...prev, border: e.target.checked }))}
              className="accent-amber-500"
            />
            Tampilkan garis kotak (border) di setiap label
          </label>
          {layout.gaya !== "harga" && (
          <label className="flex items-center gap-2 text-xs text-slate-300 mt-2">
            <input
              type="checkbox"
              checked={layout.barcode}
              onChange={(e) => setLayout((prev) => ({ ...prev, barcode: e.target.checked }))}
              className="accent-amber-500"
            />
            Tampilkan barcode di label (isi barcode = SKU lengkap)
          </label>
          )}
          {layout.gaya !== "harga" && layout.barcode && (
            <label className="block mt-2 max-w-[180px]">
              <div className="text-[11px] text-slate-500 mb-1">Tinggi Barcode (mm)</div>
              <input
                type="number"
                min="4"
                value={layout.tinggiBarcode}
                onChange={(e) =>
                  setLayout((prev) => ({ ...prev, tinggiBarcode: Math.max(4, Number(e.target.value) || 4) }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              />
            </label>
          )}
          <p className="text-[11px] text-slate-500 mt-3">
            Sesuaikan ukuran ini dengan kertas stiker fisik yang dipakai agar posisi cetak pas. Maksimal{" "}
            {layout.kolom * layout.baris} label per lembar {layout.ukuranKertas}.
          </p>
          </div>
          )}
        </div>

        <button
          onClick={cetak}
          disabled={labels.length === 0}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm px-4 py-2.5 rounded-lg"
        >
          <Printer size={15} /> Cetak {labels.length > 0 ? `${labels.length} Label` : ""}
        </button>
        {totalTerpilih > 0 && (
          <span className="ml-3 text-xs text-slate-500">{totalTerpilih} item dipilih</span>
        )}
      </div>

      {/* ====== Area cetak (hanya tampil saat print) ====== */}
      <div className="hidden print:block">
        <style>{`
          @page { size: ${pageSizeCss(layout.ukuranKertas)}${layout.ukuranKertas === "110x15" ? "" : " " + layout.orientasi}; margin: 0; }
          @media print { html, body { margin: 0 !important; padding: 0 !important; } }
          .ss-print-page {
            padding-top: ${layout.marginAtas}mm;
            display: flex;
            justify-content: ${layout.posisi === "tengah" ? "center" : "flex-start"};
          }
          .ss-print-sheet {
            padding-left: ${layout.posisi === "tengah" ? 0 : layout.marginKiri}mm;
            display: flex;
            flex-wrap: wrap;
          }
          .ss-print-label {
            width: ${layout.lebarLabel}mm;
            height: ${layout.tinggiLabel}mm;
            margin-right: ${layout.gapX}mm;
            margin-bottom: ${layout.gapY}mm;
            box-sizing: border-box;
            padding: 2mm 2.5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: ${layout.spasiBaris}mm;
            break-inside: avoid;
            overflow: hidden;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            ${layout.border ? "border: 1px solid #000;" : ""}
            text-align: center;
          }
          .ss-print-rak { font-size: ${layout.fontRak}pt; font-weight: 700; }
          .ss-print-sku { font-size: ${layout.fontSku}pt; font-weight: 800; }
          .ss-print-catatan { font-size: ${layout.fontCatatan}pt; font-weight: 700; color: #dc2626; margin-top: 1mm; }
          .ss-print-kode { font-size: ${layout.fontKode}pt; font-weight: 800; letter-spacing: 0.5px; }
          .ss-print-harga { width: 100%; height: 100%; display: flex; flex-direction: column; gap: ${layout.gapHarga}mm; text-align: left; }
          .ss-print-harga-atas { display: flex; justify-content: space-between; align-items: baseline; line-height: 1; }
          .ss-print-harga-nama { font-size: ${layout.fontNama}pt; font-weight: 700; }
          .ss-print-harga-bar { flex: 1 1 auto; min-height: 0; }
          .ss-print-harga-bawah { display: flex; justify-content: space-between; align-items: baseline; line-height: 1; }
          .ss-print-harga-kode { font-size: ${layout.fontBawah}pt; font-weight: 700; }
          .ss-print-harga-rp { font-size: ${layout.fontHarga}pt; font-weight: 800; }
          .ss-print-harga-kg { font-size: ${layout.fontKodeGrosir}pt; font-weight: 800; letter-spacing: 0.3px; }
          .ss-print-barcode { width: 100%; }
          .ss-print-barcode-teks { font-size: 6pt; line-height: 1.1; margin-top: 0.5mm; font-family: Arial, Helvetica, sans-serif; }
        `}</style>
        <div className="ss-print-page">
          <div
            className="ss-print-sheet"
            style={{ width: `${layout.kolom * (layout.lebarLabel + layout.gapX)}mm` }}
          >
            {labels.map((l) => layout.gaya === "harga" ? (
              <div key={l.key} className="ss-print-label" style={{ padding: `${layout.paddingV}mm ${layout.paddingH}mm`, justifyContent: "stretch", alignItems: "stretch" }}>
                <div className="ss-print-harga">
                  <div className="ss-print-harga-atas">
                    <span className="ss-print-harga-nama">{l.nama}</span>
                    {layout.kodeGrosir && kodeHargaGrosir(l.grosir) && (
                      <span className="ss-print-harga-kg">{kodeHargaGrosir(l.grosir)}</span>
                    )}
                  </div>
                  <div className="ss-print-harga-bar">
                    <Barcode128 value={l.skuLengkap} tinggiMm={null} />
                  </div>
                  <div className="ss-print-harga-bawah">
                    <span className="ss-print-harga-kode">{l.kodeBawah}</span>
                    <span className="ss-print-harga-rp">{l.harga}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div key={l.key} className="ss-print-label">
                <div className="ss-print-rak">{l.rak}</div>
                <div>
                  <div className="ss-print-sku" style={{ color: warnaCss(l.warna) }}>{l.sku}</div>
                  {l.catatan && <div className="ss-print-catatan">{l.catatan}</div>}
                </div>
                <div className="ss-print-kode">{l.kode}</div>
                {layout.barcode && (
                  <div className="ss-print-barcode">
                    <Barcode128 value={l.skuLengkap} tinggiMm={layout.tinggiBarcode} />
                    <div className="ss-print-barcode-teks">{l.skuLengkap}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}