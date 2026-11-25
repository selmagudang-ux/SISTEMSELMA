// Dua jenis SKU "gabungan" di Master Barang, keduanya memakai kolom sku_master.komponen: [{ sku, qty }]
// dan dibedakan oleh kolom jenis_set:
//  - SET   (jenis_set kosong / "set"): paket yang dijual sebagai satu SKU. Tidak punya stok sendiri: stok = jumlah set yang bisa
//          dipenuhi isinya (yang paling sedikit), HPP = jumlah HPP isi x qty. Harga jual diisi sendiri.
//  - INDUK (jenis_set = "induk"): hanya pengelompokan. Tidak dijual, tanpa harga/HPP/qty; stok = jumlah stok semua SKU isinya (info).
// Hasil hitung hanya untuk tampilan; kolom stok Set/Induk di database tetap 0 dan tidak pernah ditulis.
export const KATEGORI_SET = "SET";
export const KATEGORI_INDUK = "INDUK";

export const adalahKelompok = (s) => Array.isArray(s?.komponen);
export const adalahInduk = (s) => Array.isArray(s?.komponen) && s?.jenis_set === "induk";
export const adalahSet = (s) => Array.isArray(s?.komponen) && s?.jenis_set !== "induk";

export function olahSetMaster(list) {
  const rows = list || [];
  if (!rows.some(adalahKelompok)) return rows;
  const peta = new Map(rows.map((r) => [r.sku, r]));
  return rows.map((r) => {
    if (!adalahKelompok(r)) return r;
    if (adalahInduk(r)) {
      let stok = 0;
      let hilang = false;
      const isi = r.komponen.map((k) => {
        const c = peta.get(k.sku);
        if (!c || adalahKelompok(c)) {
          hilang = true;
          return { sku: k.sku, stok: null, ada: false };
        }
        const st = Math.max(Number(c.stok) || 0, 0);
        stok += st;
        return { sku: k.sku, stok: st, ada: true };
      });
      return { ...r, stok, _isi: isi, _komponenHilang: hilang };
    }
    let stok = Infinity;
    let hpp = 0;
    let hilang = false;
    for (const k of r.komponen) {
      const c = peta.get(k.sku);
      const q = Math.max(parseInt(k.qty, 10) || 1, 1);
      if (!c || adalahKelompok(c) || c.nonaktif) {
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
