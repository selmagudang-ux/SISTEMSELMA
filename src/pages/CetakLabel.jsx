import { useEffect, useMemo, useState } from "react";
import { Search, Printer, CheckSquare, Square } from "lucide-react";
import { EmptyState, SearchableSelect } from "../components/ui";
import { priceCode } from "../lib/api";
import { rakForSku, skuForRak } from "./Rak";

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
function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!saved) return DEFAULT_LAYOUT;
    return { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// Ukuran halaman CSS (@page) berdasarkan ukuran kertas yang dipilih.
function pageSizeCss(ukuranKertas) {
  if (ukuranKertas === "F4") return "215mm 330mm";
  if (ukuranKertas === "Termal") return "100mm 150mm";
  return ukuranKertas; // A4 | Letter
}

export default function CetakLabel({ penempatan, rak, skuMaster }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState({}); // { rakCode: { qty, warna, catatan } }

  // Ukuran & posisi lembar stiker — bisa disesuaikan dengan kertas stiker yang dipakai.
  const [layout, setLayout] = useState(loadLayout);

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

  const filteredRak = rakList.filter(
    (r) => r.code.toLowerCase().includes(q.toLowerCase()) || r.occupantSku.toLowerCase().includes(q.toLowerCase())
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
    const next = {};
    filteredRak.forEach((r) => (next[r.code] = { ...DEFAULT_ROW }));
    setSelected(next);
  };
  const batalSemua = () => setSelected({});

  // ---- Bangun daftar label final (flat, sesuai qty) untuk dicetak ----
  const labels = useMemo(() => {
    const out = [];
    filteredRak.forEach((r) => {
      const row = selected[r.code];
      if (!row || !row.qty) return;
      const s = skuMap[r.occupantSku];
      const kode = priceCode(s.grosir, s.tengah, s.ecer);
      for (let n = 0; n < row.qty; n++) {
        out.push({
          key: `${r.code}-${n}`,
          sku: skuDenganWarna(s, row.tampilkanWarnaProduk),
          rak: r.code,
          kode,
          warna: row.warna,
          catatan: row.catatan,
        });
      }
    });
    return out;
  }, [filteredRak, selected, skuMap]);

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
            onClick={pilihSemua}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700"
          >
            <CheckSquare size={13} /> Pilih Semua
          </button>
          <button
            onClick={batalSemua}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700"
          >
            <Square size={13} /> Batal Pilih
          </button>
        </div>

        {/* ---- Daftar pilihan ---- */}
        {filteredRak.length === 0 ? (
          <EmptyState label="Tidak ada rak yang sedang berisi SKU." />
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto mb-5">
            <table className="w-full text-sm min-w-[860px]">
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
                {filteredRak.map((r) => {
                  const s = skuMap[r.occupantSku];
                  const kode = priceCode(s.grosir, s.tengah, s.ecer);
                  return renderRow(r.code, r.code, r.occupantSku, kode, 1);
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Pengaturan ukuran kertas stiker ---- */}
        <div className="rounded-xl border border-slate-800 p-4 mb-5">
          <div className="text-xs font-semibold text-slate-300 mb-3">Pengaturan Kertas Stiker</div>

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
                    ...(val === "Termal" ? TERMAL_PRESET : {}),
                  }));
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="F4">F4 (Folio)</option>
                <option value="Termal">Termal 100×150mm</option>
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

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={layout.border}
              onChange={(e) => setLayout((prev) => ({ ...prev, border: e.target.checked }))}
              className="accent-amber-500"
            />
            Tampilkan garis kotak (border) di setiap label
          </label>
          <p className="text-[11px] text-slate-500 mt-3">
            Sesuaikan ukuran ini dengan kertas stiker fisik yang dipakai agar posisi cetak pas. Maksimal{" "}
            {layout.kolom * layout.baris} label per lembar {layout.ukuranKertas}.
          </p>
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
          @page { size: ${pageSizeCss(layout.ukuranKertas)} ${layout.orientasi}; margin: 0; }
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
        `}</style>
        <div className="ss-print-page">
          <div
            className="ss-print-sheet"
            style={{ width: `${layout.kolom * (layout.lebarLabel + layout.gapX)}mm` }}
          >
            {labels.map((l) => (
              <div key={l.key} className="ss-print-label">
                <div className="ss-print-rak">{l.rak}</div>
                <div>
                  <div className="ss-print-sku" style={{ color: warnaCss(l.warna) }}>{l.sku}</div>
                  {l.catatan && <div className="ss-print-catatan">{l.catatan}</div>}
                </div>
                <div className="ss-print-kode">{l.kode}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}