// SKU INDUK di Master Barang = pengelompokan: satu SKU yang daftar isinya SKU-SKU lain di Master Barang
// (kolom sku_master.komponen: [{ sku }]). Induk TIDAK dijual, tidak punya harga/HPP, dan tidak punya stok sendiri;
// tiap SKU isi tetap dijual sendiri-sendiri. Stok induk hanya info: jumlah stok semua SKU isinya.
// Hasil hitung ini hanya untuk tampilan; kolom stok induk di database tetap 0.
export const KATEGORI_INDUK = "INDUK";

export const adalahSet = (s) => Array.isArray(s?.komponen);

export function olahSetMaster(list) {
  const rows = list || [];
  if (!rows.some(adalahSet)) return rows;
  const peta = new Map(rows.map((r) => [r.sku, r]));
  return rows.map((r) => {
    if (!adalahSet(r)) return r;
    let stok = 0;
    let hilang = false;
    const isi = r.komponen.map((k) => {
      const c = peta.get(k.sku);
      if (!c || adalahSet(c)) {
        hilang = true;
        return { sku: k.sku, stok: null, ada: false };
      }
      const st = Math.max(Number(c.stok) || 0, 0);
      stok += st;
      return { sku: k.sku, stok: st, ada: true, nonaktif: !!c.nonaktif };
    });
    return { ...r, stok, _isi: isi, _komponenHilang: hilang };
  });
}
