import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell, Field, SearchableSelect, inputClass } from "./ui";
import { sameProdukKecualiUkuran } from "../lib/api";
import { rakForSku } from "../pages/Rak";

// Tempatkan BANYAK barang (tahap "Rak") ke SATU rak sekaligus — dipakai dari
// halaman Alur Barang (DataBarang.jsx) lewat modal "advance-rak-banyak".
// Aturan rak sama seperti TempatkanRakForm: 1 rak = 1 SKU, KECUALI produknya
// sama dan cuma beda ukuran (itu boleh digabung). Kalau ada SKU berbeda produk
// yang dipilih bareng, atau rak tujuan dihuni produk lain, diminta konfirmasi
// dulu sebelum disimpan.
export function TempatkanRakBanyakForm({ items, rakList, penempatan, skuMaster, onClose, onSubmit, saving }) {
  // Rekomendasi rak: kalau SEMUA SKU terpilih pernah di rak yang sama, tawarkan itu.
  const rakRekomendasi = useMemo(() => {
    const raks = new Set(items.map((i) => rakForSku(i.sku, penempatan)).filter(Boolean));
    return raks.size === 1 ? [...raks][0] : "";
  }, [items, penempatan]);

  const [rakCode, setRakCode] = useState(() => rakRekomendasi || "");
  const [qtyMap, setQtyMap] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.jumlah || 1])));
  const [konfirmasi, setKonfirmasi] = useState(false);

  const occupant = useMemo(() => {
    if (!rakCode) return null;
    return (penempatan || []).find((p) => p.rak_code === rakCode) || null;
  }, [rakCode, penempatan]);

  // Penghuni rak yang BUKAN salah satu SKU terpilih & beda produk dari semuanya = konflik.
  const konflikPenghuni =
    !!occupant &&
    !items.some((i) => i.sku === occupant.sku) &&
    !items.every((i) => sameProdukKecualiUkuran(occupant.sku, i.sku, skuMaster));

  const bolehGabungPenghuni =
    !!occupant &&
    !items.some((i) => i.sku === occupant.sku) &&
    !konflikPenghuni;

  // SKU terpilih sendiri harus produk yang sama (beda ukuran saja) supaya muat satu rak.
  const sesamaProduk = items.every((i) => sameProdukKecualiUkuran(items[0].sku, i.sku, skuMaster));

  const qtyValid = items.every((i) => Number(qtyMap[i.id]) >= 1);
  const totalQty = items.reduce((a, i) => a + (Number(qtyMap[i.id]) || 0), 0);
  const perluKonfirmasi = konflikPenghuni || !sesamaProduk;

  const simpan = () => onSubmit(rakCode, qtyMap);
  const handleClick = () => {
    if (perluKonfirmasi && !konfirmasi) {
      setKonfirmasi(true);
      return;
    }
    simpan();
  };

  if (konfirmasi && perluKonfirmasi) {
    return (
      <ModalShell title={`Tempatkan ${items.length} SKU — Konfirmasi`} onClose={onClose}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            {!sesamaProduk && (
              <div>
                SKU yang dipilih berasal dari <b>produk yang berbeda</b>. Satu rak hanya untuk satu SKU (kecuali produk
                sama dan cuma beda ukuran), jadi di Peta Rak <b>cuma SKU yang ditempatkan paling akhir</b> yang tercatat
                sebagai penghuni rak <span className="font-mono">{rakCode}</span>.
              </div>
            )}
            {konflikPenghuni && (
              <div>
                Rak <span className="font-mono">{rakCode}</span> saat ini berisi SKU{" "}
                <span className="font-mono">{occupant.sku}</span> (produk berbeda) — akan tertimpa.
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
            Kembali
          </button>
          <button
            disabled={saving}
            onClick={simpan}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Ya, Lanjutkan"}
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Tempatkan ${items.length} SKU di 1 Rak`} onClose={onClose}>
      <Field label="Rak">
        <SearchableSelect
          value={rakCode}
          onChange={setRakCode}
          options={rakList.map((r) => ({ value: r.code, label: r.code }))}
          placeholder="Ketik atau pilih rak…"
        />
      </Field>

      {rakRekomendasi && rakCode !== rakRekomendasi && (
        <div className="flex items-center justify-between gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs px-3 py-2 rounded-lg mb-3">
          <span>
            Rekomendasi: rak <span className="font-mono">{rakRekomendasi}</span> — sebelumnya dipakai SKU-SKU ini.
          </span>
          <button type="button" onClick={() => setRakCode(rakRekomendasi)} className="text-sky-300 hover:underline font-medium flex-shrink-0">
            Pakai
          </button>
        </div>
      )}

      {bolehGabungPenghuni && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> — produk yang sama, cuma beda
            ukuran. Boleh digabung, tidak akan menimpa.
          </div>
        </div>
      )}
      {konflikPenghuni && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Rak ini sudah berisi SKU <span className="font-mono">{occupant.sku}</span> (produk berbeda). Akan diminta
            konfirmasi sebelum menimpa.
          </div>
        </div>
      )}
      {!sesamaProduk && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>SKU terpilih bukan produk yang sama (beda lebih dari sekadar ukuran). Akan diminta konfirmasi.</div>
        </div>
      )}

      <div className="text-xs text-slate-400 mb-1.5">Jumlah per SKU</div>
      <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 divide-y divide-slate-800">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="font-mono text-xs text-amber-400 truncate">{it.sku}</span>
            <input
              type="number"
              min="1"
              value={qtyMap[it.id]}
              onChange={(e) => setQtyMap((m) => ({ ...m, [it.id]: Number(e.target.value) }))}
              className={`${inputClass} !w-24 !py-1 text-right`}
            />
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        Total {totalQty}x dari {items.length} SKU
      </div>

      <button
        disabled={!rakCode || !qtyValid || saving}
        onClick={handleClick}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : `Simpan ${items.length} SKU & Lanjut`}
      </button>
    </ModalShell>
  );
}
