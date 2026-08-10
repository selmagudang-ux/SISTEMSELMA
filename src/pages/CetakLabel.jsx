import { useMemo, useState } from "react";
import { Search, Printer, CheckSquare, Square } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { priceCode } from "../lib/api";

// Cari kode rak untuk sebuah SKU dari data penempatan (ambil yang paling baru).
function rakForSku(sku, penempatan) {
  const found = (penempatan || []).find((p) => p.sku === sku);
  return found ? found.rak_code : "";
}

export default function CetakLabel({ items, skuMaster, penempatan }) {
  const [tab, setTab] = useState("barang"); // "barang" | "sku"
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState({}); // { key: qty }

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

  const filteredBarang = barangList.filter((i) => i.sku.toLowerCase().includes(q.toLowerCase()));
  const filteredSku = skuList.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));

  const toggle = (key, defaultQty) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key] != null) delete next[key];
      else next[key] = defaultQty;
      return next;
    });
  };

  const setQty = (key, val) => {
    const n = Math.max(0, Number(val) || 0);
    setSelected((prev) => ({ ...prev, [key]: n }));
  };

  const pilihSemua = () => {
    if (tab === "barang") {
      const next = {};
      filteredBarang.forEach((i) => (next[i.id] = i.jumlah || 1));
      setSelected(next);
    } else {
      const next = {};
      filteredSku.forEach((s) => (next[s.sku] = 1));
      setSelected(next);
    }
  };
  const batalSemua = () => setSelected({});

  // ---- Bangun daftar label final (flat, sesuai qty) untuk dicetak ----
  const labels = useMemo(() => {
    const out = [];
    if (tab === "barang") {
      filteredBarang.forEach((i) => {
        const qty = selected[i.id];
        if (!qty) return;
        const s = skuMap[i.sku];
        const kode = priceCode(s.grosir, s.tengah, s.ecer);
        for (let n = 0; n < qty; n++) {
          out.push({ key: `${i.id}-${n}`, sku: i.sku, rak: i.rak_code || "", kode });
        }
      });
    } else {
      filteredSku.forEach((s) => {
        const qty = selected[s.sku];
        if (!qty) return;
        const kode = priceCode(s.grosir, s.tengah, s.ecer);
        const rak = rakForSku(s.sku, penempatan);
        for (let n = 0; n < qty; n++) {
          out.push({ key: `${s.sku}-${n}`, sku: s.sku, rak, kode });
        }
      });
    }
    return out;
  }, [tab, filteredBarang, filteredSku, selected, skuMap, penempatan]);

  const totalTerpilih = Object.values(selected).filter((v) => v > 0).length;

  const cetak = () => {
    if (labels.length === 0) return;
    window.print();
  };

  return (
    <div>
      <PageHeader
        title="Cetak Label Harga"
        description="Pilih barang atau SKU, atur jumlah label, lalu cetak ke kertas stiker A4."
      />

      {/* ====== Area layar (tidak ikut tercetak) ====== */}
      <div className="print:hidden">
        <div className="flex gap-2 mb-4">
          {[
            { key: "barang", label: "Per Barang" },
            { key: "sku", label: "Per SKU" },
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
              placeholder="Cari SKU…"
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
        {(tab === "barang" ? filteredBarang : filteredSku).length === 0 ? (
          <EmptyState label="Tidak ada data yang cocok." />
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto mb-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Kode Rak</th>
                  <th className="px-4 py-2.5">Kode Harga</th>
                  <th className="px-4 py-2.5">Jumlah Label</th>
                </tr>
              </thead>
              <tbody>
                {tab === "barang"
                  ? filteredBarang.map((i) => {
                      const s = skuMap[i.sku];
                      const kode = priceCode(s.grosir, s.tengah, s.ecer);
                      const checked = selected[i.id] != null;
                      return (
                        <tr key={i.id} className="border-b border-slate-800/60 last:border-0">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(i.id, i.jumlah || 1)}
                              className="accent-amber-500"
                            />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{i.sku}</td>
                          <td className="px-4 py-2 text-slate-400">{i.rak_code || "—"}</td>
                          <td className="px-4 py-2 font-mono text-amber-400">{kode}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              disabled={!checked}
                              value={selected[i.id] ?? i.jumlah ?? 1}
                              onChange={(e) => setQty(i.id, e.target.value)}
                              className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      );
                    })
                  : filteredSku.map((s) => {
                      const kode = priceCode(s.grosir, s.tengah, s.ecer);
                      const rak = rakForSku(s.sku, penempatan);
                      const checked = selected[s.sku] != null;
                      return (
                        <tr key={s.sku} className="border-b border-slate-800/60 last:border-0">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(s.sku, 1)}
                              className="accent-amber-500"
                            />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{s.sku}</td>
                          <td className="px-4 py-2 text-slate-400">{rak || "—"}</td>
                          <td className="px-4 py-2 font-mono text-amber-400">{kode}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              disabled={!checked}
                              value={selected[s.sku] ?? 1}
                              onChange={(e) => setQty(s.sku, e.target.value)}
                              className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500 disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Pengaturan ukuran kertas stiker ---- */}
        <div className="rounded-xl border border-slate-800 p-4 mb-5">
          <div className="text-xs font-semibold text-slate-300 mb-3">Pengaturan Kertas Stiker (A4)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            justify-content: space-between;
            break-inside: avoid;
            overflow: hidden;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
          }
          .ss-print-rak { font-size: 8pt; font-weight: 600; }
          .ss-print-sku { font-size: 9pt; font-family: 'Courier New', monospace; text-align: center; }
          .ss-print-kode { font-size: 18pt; font-weight: 800; text-align: center; letter-spacing: 0.5px; }
        `}</style>
        <div className="ss-print-sheet">
          {labels.map((l) => (
            <div key={l.key} className="ss-print-label">
              <div className="ss-print-rak">{l.rak}</div>
              <div className="ss-print-sku">{l.sku}</div>
              <div className="ss-print-kode">{l.kode}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}