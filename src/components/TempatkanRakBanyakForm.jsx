import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell, Field, SearchableSelect, inputClass } from "./ui";
import { sameProdukKecualiUkuran } from "../lib/api";
import { rakForSku } from "../pages/Rak";

// Tempatkan BANYAK barang (mis. satu produk beda ukuran) ke SATU rak sekaligus.
// Dibuka dari halaman Rak > Tempatkan Barang setelah beberapa kartu dicentang.
// Aturan rak sama seperti TempatkanRakForm: 1 rak untuk 1 SKU, KECUALI produknya sama dan cuma beda ukuran
// (sameProdukKecualiUkuran). Kalau ada yang tidak cocok, diminta konfirmasi dulu sebelum menimpa.
// Simpan: handler "advance-rak-banyak" di ModalRouter.
export default function TempatkanRakBanyakForm({ items, rakList, penempatan, skuMaster, onClose, onSubmit, saving }) {
  const [rakCode, setRakCode] = useState(() => items.map((i) => rakForSku(i.sku, penempatan)).find(Boolean) || "");
  const [qty, setQty] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.jumlah || 1])));
  const [konfirmasi, setKonfirmasi] = useState(false);

  const occupant = useMemo(() => {
    if (!rakCode) return null;
    return (penempatan || []).find((p) => p.rak_code === rakCode) || null;
  }, [rakCode, penempatan]);

  const acuan = items[0];
  // Barang yang dipilih bukan satu produk (beda model/warna/dst), bukan sekadar beda ukuran.
  const campur = items.some((i) => !sameProdukKecualiUkuran(acuan.sku, i.sku, skuMaster));
  // Rak sudah ditempati produk lain.
  const rakBentrok = !!occupant && items.some((i) => i.sku !== occupant.sku && !sameProdukKecualiUkuran(occupant.sku, i.sku, skuMaster));
  const rakGabung = !!occupant && !rakBentrok && items.some((i) => i.sku !== occupant.sku);
  const bermasalah = campur || rakBentrok;

  const qtyBaris = (i) => Math.max(1, Math.round(Number(qty[i.id]) || 1));
  const totalQty = items.reduce((n, i) => n + qtyBaris(i), 0);
  const rows = () => items.map((i) => ({ item: i, qty: qtyBaris(i) }));

  const klik = () => {
    if (bermasalah && !konfirmasi) return setKonfirmasi(true);
    onSubmit(rakCode, rows());
  };

  if (konfirmasi && bermasalah) {
    return (
      <ModalShell title={`Tempatkan ${items.length} barang`} onClose={onClose}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            {campur && <div>Barang yang dipilih bukan satu produk — ada yang beda selain ukuran. Satu rak sebaiknya hanya untuk satu produk.</div>}
            {rakBentrok && (
              <div>
                Rak <span className="font-mono">{rakCode}</span> saat ini berisi SKU <span className="font-mono">{occupant.sku}</span>, produk yang berbeda.
                Menempatkan barang ini di sana akan menimpanya.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setKonfirmasi(false)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            disabled={saving}
            onClick={() => onSubmit(rakCode, rows())}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Ya, Tetap Tempatkan"}
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Tempatkan ${items.length} barang di 1 rak`} onClose={onClose}>
      <Field label="Rak">
        <SearchableSelect
          value={rakCode}
          onChange={setRakCode}
          options={rakList.map((r) => ({ value: r.code, label: r.code }))}
          placeholder="Ketik atau pilih rak…"
        />
      </Field>
      {rakGabung && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> — produk yang sama, cuma beda ukuran. Boleh digabung, tidak akan menimpa.
          </div>
        </div>
      )}
      {rakBentrok && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> (produk berbeda). Akan diminta konfirmasi sebelum menimpa.</div>
        </div>
      )}
      {campur && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Barang yang dipilih bukan satu produk (beda selain ukuran). Akan diminta konfirmasi sebelum disimpan.</div>
        </div>
      )}

      <div className="text-xs text-slate-400 mb-1">Jumlah per SKU</div>
      <div className="mb-3 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-3 py-2">
            <span className="font-mono text-xs text-slate-300 truncate flex-1" title={i.sku}>{i.sku}</span>
            <input
              type="number"
              min="1"
              value={qty[i.id]}
              onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
              className={`${inputClass} !w-24 text-right`}
            />
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 mb-3">Total {items.length} SKU · {totalQty} pcs</div>

      <button
        disabled={!rakCode || saving}
        onClick={klik}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : `Simpan ${items.length} SKU & Lanjut`}
      </button>
    </ModalShell>
  );
}
