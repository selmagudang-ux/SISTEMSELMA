import { useState } from "react";
import { X, PencilLine } from "lucide-react";
import { fmtRp } from "../../lib/api";

// =========================================================
// KASIR (mode Master Barang / grosir) — ITEM MANUAL
// Barang yang tidak ada di Master Barang (nama + harga diketik langsung), sama seperti Produk Manual di menu Grosir.
// Tidak memotong stok dan tidak punya HPP. Saat tutup kasir tercatat di Pesanan Grosir sebagai produk manual.
// =========================================================

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base outline-none transition-colors focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10";

export default function ModalItemManual({ onTambah, onClose }) {
  const [nama, setNama] = useState("");
  const [harga, setHarga] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState("");

  const h = Math.round(Number(harga) || 0);
  const q = Math.floor(Number(qty) || 0);

  const simpan = () => {
    if (!nama.trim()) return setError("Nama barang wajib diisi.");
    if (h <= 0) return setError("Harga harus lebih dari 0.");
    if (q < 1) return setError("Jumlah minimal 1.");
    onTambah({ nama: nama.trim(), harga: h, qty: q });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold">
            <PencilLine size={17} className="text-amber-400" /> Item Manual
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">Nama barang</label>
            <input autoFocus value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Plastik packing besar" className={`${inputCls} mt-1`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400">Harga satuan (Rp)</label>
              <input type="number" inputMode="numeric" min="0" value={harga} onChange={(e) => setHarga(e.target.value)} placeholder="0" className={`${inputCls} mt-1 tabular-nums`} />
            </div>
            <div>
              <label className="text-xs text-slate-400">Jumlah</label>
              <input type="number" inputMode="numeric" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} mt-1 tabular-nums`} />
            </div>
          </div>
          {h > 0 && q > 0 && <div className="text-xs text-slate-400">Subtotal: <span className="font-semibold text-amber-400 tabular-nums">{fmtRp(h * q)}</span></div>}
          <p className="text-[11px] text-slate-500">Item manual tidak memotong stok dan tidak punya HPP. Tercatat di Pesanan Grosir sebagai produk manual.</p>
          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
          <button onClick={simpan} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-2xl transition-colors">
            Tambah ke Keranjang
          </button>
        </div>
      </div>
    </div>
  );
}
