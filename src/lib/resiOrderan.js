// =========================================================
// SCAN RESI — orderan (resi → barang) dari export marketplace.
// Dipakai pages/ScanResi.jsx. Disimpan di tabel resi_barang (scan_resi_barang.sql).
//
// Format yang didukung SAAT INI: export TikTok Shop "Untuk Dikirim" / "OrderSKUList"
// (.xlsx / .csv, judul kolom berbahasa Inggris): Order ID, Order Status, Seller SKU,
// Product Name, Variation, Quantity, Tracking ID. Shopee / Tokopedia belum.
// Satu resi bisa punya banyak baris barang → digabung per resi.
// =========================================================
import { normalisasiResi, bukanResi } from "./resiEkspedisi";

const RE_RESI = /^(tracking\s*(id|number|code))$/i;
const RE_ORDER = /^order\s*id$/i;
const RE_NAMA = /^product\s*name$/i;
const RE_VARIASI = /^variation$/i;
const RE_SKU = /^seller\s*sku$/i;
const RE_QTY = /^quantity$/i;
const RE_STATUS = /^order\s*status$/i;
const RE_BATAL = /(batal|cancel|dibatalkan)/i;

// Beberapa export TikTok menulis dimensi sheet yang salah (mis. hanya kolom A), sehingga
// pembaca hanya melihat kolom pertama. Hitung ulang rentang dari sel yang benar-benar ada.
function perbaikiRef(XLSX, ws) {
  let r2 = -1;
  let c2 = -1;
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    if (r > r2) r2 = r;
    if (c > c2) c2 = c;
  }
  if (r2 >= 0) ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r2, c: c2 } });
}

// Ringkas daftar barang jadi satu teks, mis. "G4B-13/TDGL-GSN-4 · R-45 ×1, C-170, Size 9 ×2".
export function ringkasBarang(barang) {
  return (barang || [])
    .map((b) => `${[b.sku, b.variasi].filter(Boolean).join(" · ") || b.nama} ×${b.qty}`)
    .join(", ");
}

export async function parseFileOrderan(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const perResi = new Map();
  const pesananTanpaResi = new Set();
  let diabaikanBatal = 0;
  let adaFormat = false;

  for (const nama of wb.SheetNames) {
    const ws = wb.Sheets[nama];
    perbaikiRef(XLSX, ws);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    const hIdx = aoa.slice(0, 15).findIndex(
      (r) => r.some((c) => RE_RESI.test(String(c).trim())) && r.some((c) => RE_NAMA.test(String(c).trim()))
    );
    if (hIdx < 0) continue;
    adaFormat = true;
    const head = aoa[hIdx].map((c) => String(c).trim());
    const col = (re) => head.findIndex((c) => re.test(c));
    const iResi = col(RE_RESI);
    const iOrder = col(RE_ORDER);
    const iNama = col(RE_NAMA);
    const iVar = col(RE_VARIASI);
    const iSku = col(RE_SKU);
    const iQty = col(RE_QTY);
    const iStatus = col(RE_STATUS);
    const ambil = (row, i) => (i >= 0 ? String(row[i] ?? "").trim() : "");

    for (const row of aoa.slice(hIdx + 1)) {
      const oid = ambil(row, iOrder);
      const mentah = ambil(row, iResi);
      const nm = ambil(row, iNama);
      if (!oid && !mentah && !nm) continue; // baris kosong
      if (/\s/.test(oid)) continue; // baris keterangan kolom (bukan data)
      if (iStatus >= 0 && RE_BATAL.test(ambil(row, iStatus))) {
        diabaikanBatal += 1;
        continue;
      }
      if (!mentah) {
        pesananTanpaResi.add(oid || `baris-${pesananTanpaResi.size}`);
        continue;
      }
      if (!/^[A-Za-z0-9\-_.]+$/.test(mentah)) continue;
      const resi = normalisasiResi(mentah);
      if (!resi || bukanResi(resi)) continue;

      const item = {
        nama: nm.slice(0, 160),
        variasi: ambil(row, iVar),
        sku: ambil(row, iSku),
        qty: parseInt(ambil(row, iQty), 10) || 1,
      };
      const x = perResi.get(resi) || { resi, orderIds: new Set(), barang: new Map() };
      if (oid) x.orderIds.add(oid);
      const kunci = `${item.sku}|${item.nama}|${item.variasi}`;
      const ada = x.barang.get(kunci);
      if (ada) ada.qty += item.qty;
      else x.barang.set(kunci, item);
      perResi.set(resi, x);
    }
  }

  if (!adaFormat) {
    throw new Error(
      'Kolom "Tracking ID" dan "Product Name" tidak ditemukan. Format yang didukung saat ini: export TikTok Shop "Untuk Dikirim" (.xlsx).'
    );
  }

  const baris = [...perResi.values()].map((x) => {
    const barang = [...x.barang.values()];
    return {
      resi: x.resi,
      order_id: [...x.orderIds].join(", ") || null,
      platform: "TikTok Shop",
      barang,
      total_qty: barang.reduce((a, b) => a + b.qty, 0),
    };
  });
  return {
    baris,
    totalPcs: baris.reduce((a, b) => a + b.total_qty, 0),
    tanpaResi: pesananTanpaResi.size,
    diabaikanBatal,
  };
}
