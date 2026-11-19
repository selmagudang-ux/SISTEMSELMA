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

import { normSku, cariMaster, FIELD_BIAYA } from "./marketplaceImport";

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


// =========================================================
// TAHAP 2 — LAPORAN PENGHASILAN + EXPORT PESANAN -> baris marketplace_penjualan
//
// Laporan Penghasilan TikTok (income_*.xlsx), sheet "Detail pesanan": satu baris per pesanan/penyesuaian.
//   Jumlah penyelesaian pembayaran = Total Pendapatan + Total Biaya + Jumlah penyesuaian  (cocok di semua baris)
//   Total Pendapatan = Subtotal setelah diskon penjual + Total pengembalian dana setelah diskon
//   "Waktu pembayaran pesanan" di laporan ini = tanggal dana cair (dipakai sebagai tanggal dilepas).
//   Pesanan batal punya penyelesaian 0 -> dilewati. Satu ID bisa muncul 2x (mis. -22.289 lalu +18.249) -> dijumlahkan.
//   Baris non-"Pesanan" (Penggantian dana oleh platform / Penggantian Biaya Logistik) menempel ke
//   "ID pesanan terkait" dan masuk "biaya_lain" (angka positif = tambahan dana).
//
// Pemetaan biaya TikTok ke kolom yang sama dengan Shopee (tabel & tampilan tidak berubah):
//   biaya_admin = Biaya komisi platform | biaya_proses = Biaya pemrosesan pesanan
//   biaya_ongkir_xtra = Program Growth Xtra | biaya_layanan = Komisi dinamis | biaya_ams = Komisi afiliasi
//   pajak = PPh Pasal 22 | ongkir_net = Ongkir (sudah termasuk biaya layanan logistik)
//   biaya_lain = sisanya (penyesuaian, subsidi, dll.) -> total per pesanan SELALU pas dengan dana cair TikTok.
// =========================================================

const FIELD_UANG_TT = ["harga_produk", "refund", "dana_dilepas", ...FIELD_BIAYA];

function numT(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s || s === "-" || s === "/") return 0;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const bersih = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = Number(bersih);
  return Number.isFinite(n) ? n : 0;
}

// "2026/11/18" -> "2026-11-18" ; "18/11/2026 15:42:50" -> "2026-11-18"
function tglT(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function bagiProporsional(total, bobot) {
  const n = bobot.length;
  const t = Math.round(total);
  const jumlah = bobot.reduce((a, b) => a + b, 0);
  const hasil = bobot.map((b) => (jumlah > 0 ? Math.round((t * b) / jumlah) : Math.round(t / n)));
  hasil[n - 1] += t - hasil.reduce((a, b) => a + b, 0);
  return hasil;
}

async function bacaWorkbook(buffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  return { XLSX, wb };
}

export async function parseLaporanPenghasilanTiktok(buffer) {
  const { XLSX, wb } = await bacaWorkbook(buffer);
  const namaDetail = wb.SheetNames.find((n) => /detail\s*pesanan/i.test(n));
  if (!namaDetail) throw new Error('Ini bukan Laporan Penghasilan TikTok (sheet "Detail pesanan" tidak ditemukan). Unduh dari TikTok Seller Center → Finance → Revenue/Penghasilan → Unduh laporan.');
  const ws = wb.Sheets[namaDetail];
  perbaikiRef(XLSX, ws);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  const hIdx = aoa.slice(0, 10).findIndex((r) => r.some((c) => String(c).trim() === "ID Pesanan/Penyesuaian"));
  if (hIdx < 0) throw new Error('Kolom "ID Pesanan/Penyesuaian" tidak ditemukan di sheet Detail pesanan.');
  const kol = {};
  aoa[hIdx].forEach((c, i) => { const k = String(c).trim(); if (k && !(k in kol)) kol[k] = i; });
  const wajib = ["Jenis transaksi", "Jumlah penyelesaian pembayaran", "Total Pendapatan", "Total Biaya", "Waktu pemesanan", "Waktu pembayaran pesanan"];
  const hilang = wajib.filter((k) => !(k in kol));
  if (hilang.length) throw new Error(`Kolom laporan tidak lengkap: ${hilang.join(", ")}.`);
  const nilai = (r, k) => (k in kol ? numT(r[kol[k]]) : 0);
  const teks = (r, k) => (k in kol ? String(r[kol[k]] ?? "").trim() : "");

  const orders = new Map();
  let tidakPas = 0;
  let barisPesanan = 0;
  let barisPenyesuaian = 0;
  const ambil = (no) => {
    let o = orders.get(no);
    if (!o) {
      o = { no_pesanan: no, tanggal_pesanan: null, tanggal_dilepas: null, adaPesanan: false, harga_produk: 0, refund: 0, dana_dilepas: 0, adaBiayaLain: 0 };
      FIELD_BIAYA.forEach((f) => (o[f] = 0));
      orders.set(no, o);
    }
    return o;
  };

  for (const r of aoa.slice(hIdx + 1)) {
    const id = teks(r, "ID Pesanan/Penyesuaian");
    if (!id) continue;
    const jenis = teks(r, "Jenis transaksi");
    const dana = nilai(r, "Jumlah penyelesaian pembayaran");
    const pendapatan = nilai(r, "Total Pendapatan");
    const biaya = nilai(r, "Total Biaya");
    const penyesuaian = nilai(r, "Jumlah penyesuaian");
    if (Math.abs(dana - (pendapatan + biaya + penyesuaian)) > 1) tidakPas++;
    const dilepas = tglT(teks(r, "Waktu pembayaran pesanan"));

    if (jenis === "Pesanan") {
      barisPesanan++;
      const o = ambil(id);
      o.adaPesanan = true;
      const pesan = tglT(teks(r, "Waktu pemesanan"));
      if (pesan && (!o.tanggal_pesanan || pesan < o.tanggal_pesanan)) o.tanggal_pesanan = pesan;
      if (dilepas && (!o.tanggal_dilepas || dilepas > o.tanggal_dilepas)) o.tanggal_dilepas = dilepas;
      const refund = nilai(r, "Total pengembalian dana setelah diskon");
      o.refund += refund;
      o.harga_produk += pendapatan - refund; // = Subtotal setelah diskon penjual
      o.dana_dilepas += dana;
      o.ongkir_net += nilai(r, "Ongkir");
      o.biaya_admin += nilai(r, "Biaya komisi platform");
      o.biaya_proses += nilai(r, "Biaya pemrosesan pesanan");
      o.biaya_ongkir_xtra += nilai(r, "Biaya layanan Program Growth Xtra");
      o.biaya_layanan += nilai(r, "Komisi dinamis");
      o.biaya_ams += nilai(r, "Komisi Afiliasi") + nilai(r, "Komisi mitra afiliasi") + nilai(r, "Komisi Iklan Toko afiliasi") + nilai(r, "Komisi iklan toko Mitra Afiliasi");
      o.pajak += nilai(r, "PPh Pasal 22 dipungut");
    } else {
      // penyesuaian / penggantian: menempel ke pesanan terkait kalau ada
      barisPenyesuaian++;
      const terkait = teks(r, "ID pesanan terkait");
      const o = ambil(terkait && terkait !== "/" ? terkait : id);
      if (dilepas && (!o.tanggal_dilepas || dilepas > o.tanggal_dilepas)) o.tanggal_dilepas = dilepas;
      o.dana_dilepas += dana;
      o.adaBiayaLain += dana;
    }
  }

  // biaya_lain = sisa supaya harga + refund + semua biaya = dana cair (apa pun komponen baru yang ditambah TikTok)
  let nol = 0;
  for (const [no, o] of [...orders]) {
    if (Math.round(o.dana_dilepas) === 0) { orders.delete(no); nol++; continue; }
    const dikenal = FIELD_BIAYA.filter((f) => f !== "biaya_lain").reduce((a, f) => a + o[f], 0);
    o.biaya_lain = o.dana_dilepas - o.harga_produk - o.refund - dikenal;
    if (!o.tanggal_pesanan) o.tanggal_pesanan = o.tanggal_dilepas;
  }

  // total resmi dari sheet "Laporan" (untuk dicocokkan)
  let totalLaporan = null;
  let periode = "";
  const namaLap = wb.SheetNames.find((n) => /^laporan$/i.test(n));
  if (namaLap) {
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets[namaLap], { header: 1, raw: true, defval: "" })) {
      const label = r.map((c) => String(c).trim());
      if (label.includes("Periode")) periode = String(r[label.indexOf("Periode") + 1] || r[r.length - 1] || "").trim();
      if (label.includes("Jumlah penyelesaian pembayaran") && totalLaporan == null) totalLaporan = numT(r[label.indexOf("Jumlah penyelesaian pembayaran") + 1] || r[r.length - 1]);
    }
  }
  const totalDana = [...orders.values()].reduce((a, o) => a + o.dana_dilepas, 0);
  const tanpaPesanan = [...orders.values()].filter((o) => !o.adaPesanan).length;
  return { orders, tidakPas, barisPesanan, barisPenyesuaian, pesananNol: nol, tanpaPesanan, totalDana, totalLaporan, periode };
}

const RE_QTY = /^quantity$/i;
const RE_QTY_RETUR = /^sku\s*quantity\s*of\s*return$/i;
const RE_HARGA = /^sku\s*unit\s*original\s*price$/i;
const RE_SUBTOTAL = /^sku\s*subtotal\s*after\s*discount$/i;

// Export pesanan TikTok ("Semua pesanan" / "Untuk Dikirim") -> baris barang per Order ID.
// Hasil: { lines: Map(orderId -> [line]), jumlahBaris, jumlahPesanan, awal, akhir }
export async function parseExportPesananTiktok(buffer) {
  const { XLSX, wb } = await bacaWorkbook(buffer);
  const lines = new Map();
  let jumlahBaris = 0;
  let awal = null;
  let akhir = null;
  let adaFormat = false;
  for (const namaSheet of wb.SheetNames) {
    const ws = wb.Sheets[namaSheet];
    perbaikiRef(XLSX, ws);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    const hIdx = aoa.slice(0, 15).findIndex((r) => r.some((c) => RE_ORDER.test(String(c).trim())) && r.some((c) => RE_VARIASI.test(String(c).trim())));
    if (hIdx < 0) continue;
    adaFormat = true;
    const head = aoa[hIdx].map((c) => String(c).trim());
    const col = (re) => head.findIndex((c) => re.test(c));
    const iOrder = col(RE_ORDER), iVar = col(RE_VARIASI), iSku = col(RE_SKU), iNama = col(RE_NAMA), iStatus = col(RE_STATUS);
    const iQty = col(RE_QTY), iRetur = col(RE_QTY_RETUR), iHarga = col(RE_HARGA), iSub = col(RE_SUBTOTAL);
    const iBuat = head.findIndex((c) => /^created\s*time$/i.test(c));
    const teks = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    for (const r of aoa.slice(hIdx + 1)) {
      const oid = teks(r, iOrder);
      if (!oid || /\s/.test(oid)) continue; // baris kosong / keterangan kolom
      jumlahBaris++;
      const variasi = teks(r, iVar);
      const sellerSku = iSku >= 0 ? teks(r, iSku) : "";
      const kode = kodeLiveDariVariasi(variasi);
      const buat = tglT(teks(r, iBuat));
      if (buat) { if (!awal || buat < awal) awal = buat; if (!akhir || buat > akhir) akhir = buat; }
      const qty = Math.max(1, Math.round(numT(r[iQty])) || 1);
      const arr = lines.get(oid) || [];
      arr.push({
        sku_referensi: kode || sellerSku || variasi,
        kode_live: kode, seller_sku: sellerSku,
        nama_produk: teks(r, iNama).slice(0, 160), variasi,
        qty, qty_retur: iRetur >= 0 ? Math.round(numT(r[iRetur])) : 0,
        harga_satuan: iHarga >= 0 ? numT(r[iHarga]) : null,
        subtotal: iSub >= 0 ? numT(r[iSub]) : null,
        status_pesanan: teks(r, iStatus),
      });
      lines.set(oid, arr);
    }
  }
  if (!adaFormat) throw new Error('Kolom "Order ID" dan "Variation" tidak ditemukan. Pakai export pesanan TikTok Shop (.xlsx, sheet OrderSKUList).');
  return { lines, jumlahBaris, jumlahPesanan: lines.size, awal, akhir };
}

// Cari baris Master Barang untuk satu baris pesanan TikTok.
// Urutan: (1) pemetaan kode live yang disimpan di tab Kode Live, (2) Seller SKU yang cocok dengan Master
// (bagian setelah "/" dicoba dulu, mis. "G4E-7B/TDCC-SIM-113-PER"). Hasil null = belum cocok.
export function cariMasterTiktok(l, aliasMap, skuMap) {
  if (l.kode_live) {
    const m = cariMaster(l.kode_live, aliasMap, skuMap);
    if (m) return m;
  }
  if (l.seller_sku) {
    const bagian = String(l.seller_sku).split("/").map((b) => b.trim()).filter(Boolean);
    for (const b of [...bagian].reverse()) {
      const m = cariMaster(b, aliasMap, skuMap);
      if (m) return m;
    }
  }
  if (!l.kode_live && l.sku_referensi) return cariMaster(l.sku_referensi, aliasMap, skuMap);
  return null;
}

// Gabungkan penghasilan + export pesanan jadi baris siap simpan ke marketplace_penjualan
// (bentuknya sama dengan bangunBaris() milik Shopee, jadi seluruh tampilan Rincian Penjualan bisa dipakai).
export function bangunBarisTiktok({ income, pesanan, existingByOrder, aliasMap, skuMap, platform, toko }) {
  const hasil = [];
  const ringkas = { pesanan: 0, dariExport: 0, dariTersimpan: 0, tanpaSku: 0, barisCocok: 0, barisTidakCocok: 0, referensiTidakCocok: new Set(), tanggalPesananTertua: null, tanpaSkuPerBulan: new Map() };

  for (const [no, o] of income.orders) {
    ringkas.pesanan++;
    if (o.tanggal_pesanan && (!ringkas.tanggalPesananTertua || o.tanggal_pesanan < ringkas.tanggalPesananTertua)) ringkas.tanggalPesananTertua = o.tanggal_pesanan;
    let lines = pesanan?.lines.get(no);
    let sumber = "order_export";
    if (lines?.length) ringkas.dariExport++;
    else {
      const lama = (existingByOrder?.get(no) || []).filter((b) => b.sumber_sku !== "laporan");
      if (lama.length) {
        lines = lama.sort((a, b) => a.no_baris - b.no_baris).map((b) => ({
          sku_referensi: b.sku_referensi || "", kode_live: kodeLiveDariVariasi(b.sku_referensi), seller_sku: "", nama_produk: b.nama_produk, variasi: b.variasi || "",
          qty: b.qty, qty_retur: b.qty_retur || 0, harga_satuan: b.harga_satuan, subtotal: b.subtotal, status_pesanan: b.status_pesanan || "",
          _tersimpan: true, _sku: b.sku, _hpp: b.hpp_satuan,
        }));
        ringkas.dariTersimpan++;
      } else {
        sumber = "laporan";
        lines = [{ sku_referensi: "", kode_live: "", seller_sku: "", nama_produk: o.adaPesanan ? "(produk tidak terbaca — export pesanan belum mencakup pesanan ini)" : "(penyesuaian dari platform)", variasi: "", qty: null, qty_retur: 0, harga_satuan: null, subtotal: o.harga_produk, status_pesanan: "" }];
        ringkas.tanpaSku++;
        const bln = String(o.tanggal_pesanan || "").slice(0, 7) || "?";
        ringkas.tanpaSkuPerBulan.set(bln, (ringkas.tanpaSkuPerBulan.get(bln) || 0) + 1);
      }
    }

    const bobot = lines.map((l) => Math.max(0, l.subtotal || 0));
    const bagi = {};
    for (const f of FIELD_UANG_TT) bagi[f] = bagiProporsional(o[f], bobot);

    lines.forEach((l, i) => {
      // baris dari data tersimpan dicocokkan ulang (supaya pemetaan baru langsung terpakai); kalau tetap tidak
      // ketemu, SKU/HPP yang sudah tersimpan dipertahankan (mis. dulu cocok lewat Seller SKU).
      const master = cariMasterTiktok(l, aliasMap, skuMap);
      const ref = normSku(l.sku_referensi);
      const sku = master ? master.sku : l._tersimpan ? l._sku || null : null;
      const cocok = !!sku;
      if (ref) {
        if (cocok) ringkas.barisCocok++;
        else { ringkas.barisTidakCocok++; ringkas.referensiTidakCocok.add(l.sku_referensi); }
      }
      const baris = {
        platform, toko: toko || "", no_pesanan: no, no_baris: i + 1,
        tanggal_pesanan: o.tanggal_pesanan, tanggal_dilepas: o.tanggal_dilepas,
        status_pesanan: l.status_pesanan || null,
        sku_referensi: l.sku_referensi || null,
        sku,
        nama_produk: l.nama_produk || null, variasi: l.variasi || null,
        qty: l.qty, qty_retur: l.qty_retur || 0,
        harga_satuan: l.harga_satuan, subtotal: l.subtotal,
        hpp_satuan: master ? (master.hpp != null ? Number(master.hpp) : null) : l._tersimpan && l._sku ? (l._hpp ?? null) : null,
        sumber_sku: sumber,
        kode_produk: null,
      };
      for (const f of FIELD_UANG_TT) baris[f] = bagi[f][i];
      // dana per baris = jumlah komponennya, supaya tiap baris pas (pembulatan per komponen tidak menyisakan selisih)
      baris.dana_dilepas = baris.harga_produk + baris.refund + FIELD_BIAYA.reduce((a, f) => a + baris[f], 0);
      hasil.push(baris);
    });
  }
  return { baris: hasil, ringkas };
}
