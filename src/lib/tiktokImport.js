// =========================================================
// IMPORT TIKTOK SHOP -> Rincian Penjualan (tahap 1: KODE LIVE).
// Dipakai pages/KodeLiveTiktok.jsx (dan nanti parser pesanan/penghasilan TikTok).
//
// Di export pesanan TikTok ("Semua pesanan" / "Untuk Dikirim", sheet OrderSKUList):
//   - KODE LIVE ada di kolom "Variation", BUKAN "Seller SKU". Bentuknya:
//       "A-161"            -> kode saja
//       "CI-72, 7"         -> kode + ukuran (cincin)       -> kode live = "CI-72"
//       "CH-36, SIZE 7"    -> kode + ukuran                -> kode live = "CH-36"
//       "CF170, SIZE 6"    -> kode tanpa tanda strip       -> kode live = "CF170"
//   - Seller SKU kosong di sebagian besar baris. Kalau terisi, isinya kode rak / SKU Master,
//     mis. "G4E-7B/TDCC-SIM-113-PER" atau "DUS/TDCC-NOR-651-RSG" (SKU Master ada setelah "/").
//     Dipakai hanya sebagai SARAN pemetaan, bukan sebagai kode live.
//   - Baris ke-2 file = keterangan kolom (dilewati); dimensi sheet kadang salah (hanya kolom A).
//
// Daftar kode live -> SKU disimpan di marketplace_sku_alias (platform = "tiktok"), per entitas (PT),
// sama seperti pemetaan SKU Shopee, jadi cariMaster() di marketplaceImport.js langsung bisa memakainya.
// =========================================================

import { normSku, cariMaster } from "./marketplaceImport";

export const PLATFORM_TIKTOK = "tiktok";

// Huruf (1-3) + angka, strip opsional: A-161, CI-72, CF170, HA-60
const POLA_KODE_LIVE = /^[A-Z]{1,3}-?\d+$/;

// Ambil kode live dari isi kolom Variation. Kosong ("") kalau bentuknya bukan kode live.
export function kodeLiveDariVariasi(variasi) {
  const dasar = String(variasi ?? "").split(",")[0].trim();
  const k = normSku(dasar);
  return POLA_KODE_LIVE.test(k) ? k : "";
}

const RE_ORDER = /^order\s*id$/i;
const RE_VARIASI = /^variation$/i;
const RE_SKU = /^seller\s*sku$/i;
const RE_NAMA = /^product\s*name$/i;
const RE_STATUS = /^order\s*status$/i;
const RE_BATAL = /(dibatalkan|batal|cancel|belum\s*dibayar|unpaid)/i;

// Beberapa export TikTok menulis dimensi sheet yang salah; hitung ulang dari sel yang benar-benar ada.
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

// Baca satu atau beberapa file export pesanan TikTok dan kumpulkan kode live-nya.
// Hasil: { daftar: [{ kode, pesanan, baris, nama, contohVariasi, sellerSku: Map(sku -> jumlah) }],
//          totalBaris, totalPesanan, barisTanpaKode, file }
// "pesanan" = jumlah pesanan yang tidak batal / belum dibayar (dasar pengurutan: yang paling sering terjual dulu).
export async function bacaKodeLiveDariFilePesanan(files) {
  const XLSX = await import("xlsx");
  const peta = new Map();
  const semuaPesanan = new Set();
  let totalBaris = 0;
  let barisTanpaKode = 0;
  let adaFormat = false;

  for (const file of files) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
    for (const namaSheet of wb.SheetNames) {
      const ws = wb.Sheets[namaSheet];
      perbaikiRef(XLSX, ws);
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const hIdx = aoa.slice(0, 15).findIndex(
        (r) => r.some((c) => RE_ORDER.test(String(c).trim())) && r.some((c) => RE_VARIASI.test(String(c).trim()))
      );
      if (hIdx < 0) continue;
      adaFormat = true;
      const head = aoa[hIdx].map((c) => String(c).trim());
      const col = (re) => head.findIndex((c) => re.test(c));
      const iOrder = col(RE_ORDER);
      const iVar = col(RE_VARIASI);
      const iSku = col(RE_SKU);
      const iNama = col(RE_NAMA);
      const iStatus = col(RE_STATUS);
      const ambil = (row, i) => (i >= 0 ? String(row[i] ?? "").trim() : "");

      for (const row of aoa.slice(hIdx + 1)) {
        const oid = ambil(row, iOrder);
        if (!oid || /\s/.test(oid)) continue; // baris kosong / baris keterangan kolom
        totalBaris += 1;
        const kode = kodeLiveDariVariasi(ambil(row, iVar));
        if (!kode) { barisTanpaKode += 1; continue; }
        const aktif = !(iStatus >= 0 && RE_BATAL.test(ambil(row, iStatus)));
        let x = peta.get(kode);
        if (!x) {
          x = { kode, ordersAktif: new Set(), baris: 0, nama: ambil(row, iNama).slice(0, 120), contohVariasi: ambil(row, iVar), sellerSku: new Map() };
          peta.set(kode, x);
        }
        x.baris += 1;
        if (aktif) { x.ordersAktif.add(oid); semuaPesanan.add(oid); }
        const sku = iSku >= 0 ? ambil(row, iSku) : "";
        if (sku) x.sellerSku.set(sku, (x.sellerSku.get(sku) || 0) + 1);
      }
    }
  }

  if (!adaFormat) {
    throw new Error('Kolom "Order ID" dan "Variation" tidak ditemukan. Pakai export pesanan TikTok Shop (.xlsx, sheet OrderSKUList).');
  }
  const daftar = [...peta.values()]
    .map((x) => ({ kode: x.kode, pesanan: x.ordersAktif.size, baris: x.baris, nama: x.nama, contohVariasi: x.contohVariasi, sellerSku: x.sellerSku }))
    .sort((a, b) => b.pesanan - a.pesanan || b.baris - a.baris || a.kode.localeCompare(b.kode));
  return { daftar, totalBaris, totalPesanan: semuaPesanan.size, barisTanpaKode, file: files.length };
}

// Saran SKU Master untuk satu kode live, diambil dari Seller SKU yang terisi di baris-barisnya.
// Seller SKU bisa berupa "KODERAK/SKU-MASTER" -> tiap bagian dicoba dicocokkan ke Master Barang.
// Hasil: { sku, jumlah } kalau SATU SKU Master saja yang cocok; { beragam: [sku...] } kalau lebih dari satu
// (tidak disarankan otomatis); null kalau tidak ada yang cocok.
export function saranSkuDariSellerSku(sellerSku, aliasMap, skuMap) {
  const hitung = new Map();
  for (const [teks, jumlah] of sellerSku || []) {
    const bagian = String(teks).split("/").map((b) => b.trim()).filter(Boolean);
    for (const b of [...bagian].reverse()) {
      const m = cariMaster(b, aliasMap, skuMap);
      if (m) { hitung.set(m.sku, (hitung.get(m.sku) || 0) + jumlah); break; }
    }
  }
  if (hitung.size === 0) return null;
  if (hitung.size === 1) { const [sku, jumlah] = [...hitung][0]; return { sku, jumlah }; }
  return { beragam: [...hitung.keys()] };
}

// Pecah teks tempelan "KODE<tab/koma/spasi>SKU" per baris -> [{ kode, sku, baris }]
export function parseTempelan(teks) {
  const hasil = [];
  String(teks ?? "").split(/\r?\n/).forEach((mentah, i) => {
    const t = mentah.trim();
    if (!t) return;
    const bagian = t.split(/[\t,;]+|\s+/).map((b) => b.trim()).filter(Boolean);
    hasil.push({ baris: i + 1, kode: normSku(bagian[0] || ""), sku: bagian[1] ? normSku(bagian[1]) : "" });
  });
  return hasil;
}
