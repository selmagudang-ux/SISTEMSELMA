// SET di Master Barang = SKU yang isinya beberapa SKU lain (kolom sku_master.komponen: [{ sku, qty }]).
// Tidak punya stok sendiri: stok = jumlah set yang bisa dipenuhi isinya (yang paling sedikit),
// HPP = jumlah HPP isi x qty. Hasil hitung ini hanya untuk tampilan; kolom stok Set di database tetap 0.
export const KATEGORI_SET = "SET";

export const adalahSet = (s) => Array.isArray(s?.komponen);

export function olahSetMaster(list) {
  const rows = list || [];
  if (!rows.some(adalahSet)) return rows;
  const peta = new Map(rows.map((r) => [r.sku, r]));
  return rows.map((r) => {
    if (!adalahSet(r)) return r;
    let stok = Infinity;
    let hpp = 0;
    let hilang = false;
    for (const k of r.komponen) {
      const c = peta.get(k.sku);
      const q = Math.max(parseInt(k.qty, 10) || 1, 1);
      if (!c || adalahSet(c) || c.nonaktif) {
        hilang = true;
        stok = 0;
        continue;
      }
      stok = Math.min(stok, Math.floor(Math.max(Number(c.stok) || 0, 0) / q));
      hpp += (Number(c.hpp) || 0) * q;
    }
    return { ...r, stok: Number.isFinite(stok) ? stok : 0, hpp: Math.round(hpp), _komponenHilang: hilang };
  });
}
