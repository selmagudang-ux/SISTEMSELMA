import { useMemo, useState } from "react";
import { Search, Printer, CheckSquare, Square } from "lucide-react";
import { EmptyState } from "../components/ui";
import { priceCode } from "../lib/api";

// Cari kode rak untuk sebuah SKU dari data penempatan (ambil yang paling baru).
function rakForSku(sku, penempatan) {
  const found = (penempatan || []).find((p) => p.sku === sku);
  return found ? found.rak_code : "";
}

// Cari SKU yang sedang menempati sebuah rak (aturan: 1 rak = 1 SKU, ambil penempatan terbaru).
function skuForRak(rakCode, penempatan) {
  const found = (penempatan || []).find((p) => p.rak_code === rakCode);
  return found ? found.sku : "";
}

// SKU versi singkat untuk label cetak: Bahan+Peruntukan+Kategori - Subkategori - Model
// (warna & ukuran tidak ikut ditampilkan di label).
function shortSku(s) {
  if (!s) return "";
  return `${s.bahan || ""}${s.peruntukan || ""}${s.kategori || ""}-${s.subkategori || ""}-${s.model || ""}`;
}

const WARNA_OPTIONS = [
  { key: "hitam", label: "Hitam", css: "#000000" },
  { key: "merah", label: "Merah", css: "#dc2626" },
  { key: "biru", label: "Biru", css: "#1d4ed8" },
];
const warnaCss = (key) => (WARNA_OPTIONS.find((w) => w.key === key) || WARNA_OPTIONS[0]).css;

const DEFAULT_ROW = { qty: 1, warna: "hitam", catatan: "" };

export default function CetakLabel({ items, skuMaster, penempatan, rak }) {
  const [tab, setTab] = useState("barang"); // "barang" | "sku" | "rak"
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState({}); // { key: { qty, warna, catatan } }

  // Ukuran & posisi lembar stiker — bisa disesuaikan dengan kertas stiker yang dipakai.
  const [layout, setLayout] = useState({
    kolom: 3,
    baris: 6,
    marginAtas: 8,
    marginKiri: 8,
    lebarLabel: 63,
    tinggiLabel: 46,
    gapX: 2,
    gapY: 2,
    border: true,
  });

  const skuMap = useMemo(() => {
    const m = {};
    (skuMaster || []).forEach((s) => (m[s.sku] = s));
    return m;
  }, [skuMaster]);

  // ---- Data sumber per tab ----
  const barangList = useMemo(
    () => (items || []).filter((i) => i.sku && skuMap[i.sku]),
    [items, skuMap]
  );
  const skuList = skuMaster || [];
  // Rak yang sedang berisi SKU aktif (aturan 1 rak = 1 SKU).
  const rakList = useMemo(
    () =>
      (rak || [])
        .map((r) => ({ ...r, occupantSku: skuForRak(r.code, penempatan) }))
        .filter((r) => r.occupantSku && skuMap[r.occupantSku]),
    [rak, penempatan, skuMap]
  );

  const filteredBarang = barangList.filter((i) => i.sku.toLowerCase().includes(q.toLowerCase()));
  const filteredSku = skuList.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));
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
    if (tab === "barang") {
      const next = {};
      filteredBarang.forEach((i) => (next[i.id] = { ...DEFAULT_ROW, qty: i.jumlah || 1 }));
      setSelected(next);
    } else if (tab === "sku") {
      const next = {};
      filteredSku.forEach((s) => (next[s.sku] = { ...DEFAULT_ROW }));
      setSelected(next);
    } else {
      const next = {};
      filteredRak.forEach((r) => (next[r.code] = { ...DEFAULT_ROW }));
      setSelected(next);
    }
  };
  const batalSemua = () => setSelected({});

  // ---- Bangun daftar label final (flat, sesuai qty) untuk dicetak ----
  const labels = useMemo(() => {
    const out = [];
    if (tab === "barang") {
      filteredBarang.forEach((i) => {
        const row = selected[i.id];
        if (!row || !row.qty) return;
        const s = skuMap[i.sku];
        const kode = priceCode(s.grosir, s.tengah, s.ecer);
        for (let n = 0; n < row.qty; n++) {
          out.push({
            key: `${i.id}-${n}`,
            sku: shortSku(s),
            rak: i.rak_code || "",
            kode,
            warna: row.warna,
            catatan: row.catatan,
          });
        }
      });
    } else if (tab === "sku") {
      filteredSku.forEach((s) => {
        const row = selected[s.sku];
        if (!row || !row.qty) return;
        const kode = priceCode(s.grosir, s.tengah, s.ecer);
        const rakCode = rakForSku(s.sku, penempatan);
        for (let n = 0; n < row.qty; n++) {
          out.push({
            key: `${s.sku}-${n}`,
            sku: shortSku(s),
            rak: rakCode,
            kode,
            warna: row.warna,
            catatan: row.catatan,
          });
        }
      });
    } else {
      filteredRak.forEach((r) => {
        const row = selected[r.code];
        if (!row || !row.qty) return;
        const s = skuMap[r.occupantSku];
        const kode = priceCode(s.grosir, s.tengah, s.ecer);
        for (let n = 0; n < row.qty; n++) {
          out.push({
            key: `${r.code}-${n}`,
            sku: shortSku(s),
            rak: r.code,
            kode,
            warna: row.warna,
            catatan: row.catatan,
          });
        }
      });
    }
    return out;
  }, [tab, filteredBarang, filteredSku, filteredRak, selected, skuMap, penempatan]);

  const totalTerpilih = Object.keys(selected).length;

  const cetak = () => {
    if (labels.length === 0) return;
    window.print();
  };

  // Baris tabel pemilihan — sama bentuknya untuk ketiga tab, beda sumber datanya saja.
  const renderRow = (key, kodeRak, skuLabel, kode, defaultQty) => {
    const row = selected[key];
    const checked = row != null;
    return (
      <tr key={key} className="border-b border-slate-800/60 last:border-0">
        <td className="px-3 py-2">
          <input type="checkbox" checked={checked} onChange={() => toggle(key, defaultQty)} className="accent-amber-500" />
        </td>
        <td className="px-3 py-2 font-mono text-xs">{skuLabel}</td>
        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{kodeRak || "—"}</td>
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
          <select
            disabled={!checked}
            value={row?.warna ?? "hitam"}
            onChange={(e) => patchRow(key, { warna: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-40"
          >
            {WARNA_OPTIONS.map((w) => (
              <option key={w.key} value={w.key}>{w.label}</option>
            ))}
          </select>
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

  const listForTab =
    tab === "barang" ? filteredBarang : tab === "sku" ? filteredSku : filteredRak;

  return (
    <div>
      {/* ====== Area layar (tidak ikut tercetak) ====== */}
      <div className="print:hidden">
        <div className="flex gap-2 mb-4">
          {[
            { key: "barang", label: "Per Barang" },
            { key: "sku", label: "Per SKU" },
            { key: "rak", label: "Per Rak" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelected({});
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                tab === t.key
                  ? "bg-amber-500 border-amber-500 text-slate-950"
                  : "border-slate-800 text-slate-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
            <Search size={14} className="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari SKU atau kode rak…"
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
        {listForTab.length === 0 ? (
          <EmptyState
            label={tab === "rak" ? "Tidak ada rak yang sedang berisi SKU." : "Tidak ada data yang cocok."}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto mb-5">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5">{tab === "rak" ? "Kode Rak" : "SKU"}</th>
                  <th className="px-3 py-2.5">{tab === "rak" ? "SKU" : "Kode Rak"}</th>
                  <th className="px-3 py-2.5">Kode Harga</th>
                  <th className="px-3 py-2.5">Jumlah</th>
                  <th className="px-3 py-2.5">Warna</th>
                  <th className="px-3 py-2.5">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {tab === "barang"
                  ? filteredBarang.map((i) => {
                      const s = skuMap[i.sku];
                      const kode = priceCode(s.grosir, s.tengah, s.ecer);
                      return renderRow(i.id, i.rak_code, i.sku, kode, i.jumlah || 1);
                    })
                  : tab === "sku"
                  ? filteredSku.map((s) => {
                      const kode = priceCode(s.grosir, s.tengah, s.ecer);
                      const rakCode = rakForSku(s.sku, penempatan);
                      return renderRow(s.sku, rakCode, s.sku, kode, 1);
                    })
                  : filteredRak.map((r) => {
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
          <div className="text-xs font-semibold text-slate-300 mb-3">Pengaturan Kertas Stiker (A4)</div>
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
            {layout.kolom * layout.baris} label per lembar A4.
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
          @page { size: A4; margin: 0; }
          .ss-print-sheet {
            padding-top: ${layout.marginAtas}mm;
            padding-left: ${layout.marginKiri}mm;
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
            justify-content: space-between;
            break-inside: avoid;
            overflow: hidden;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            ${layout.border ? "border: 1px solid #000;" : ""}
            text-align: center;
          }
          .ss-print-rak { font-size: 13pt; font-weight: 700; }
          .ss-print-sku { font-size: 13pt; font-weight: 800; }
          .ss-print-catatan { font-size: 8pt; font-weight: 700; color: #dc2626; margin-top: 1mm; }
          .ss-print-kode { font-size: 17pt; font-weight: 800; letter-spacing: 0.5px; }
        `}</style>
        <div className="ss-print-sheet">
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
  );
}