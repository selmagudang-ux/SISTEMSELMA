// =========================================================
// IMPORT LAPORAN SHOPEE -> RINCIAN PENJUALAN (SKU, HPP, biaya marketplace,
// laba bersih). Dipakai pages/PenjualanRincian.jsx.
//
// Dua file Shopee yang dibaca (keduanya .xlsx dari Seller Centre):
//   1. "Laporan Penghasilan" (Income sudah dilepas) — sheet "Penghasilan":
//      satu baris "Order" per pesanan (semua biaya + Total Penghasilan yang
//      cair ke saldo) + baris "Sku" per produk (tanpa variasi & qty).
//   2. "Export Pesanan" (Order.all) — satu baris per SKU/variasi: ini satu-
//      satunya sumber SKU variasi ("Nomor Referensi SKU") dan qty.
//
// Biaya per pesanan dibagi ke tiap baris SKU secara PROPORSIONAL terhadap
// subtotal barisnya (sisa pembulatan masuk baris terakhir, jadi total per
// pesanan selalu pas dengan angka Shopee). Pola yang sama dipakai Shopee
// sendiri untuk baris "Sku" di laporan penghasilannya.
//
// Ini murni LAPORAN — tidak menyentuh marketplace_transaksi / saldo toko /
// Keuangan, jadi tidak ada risiko saldo terhitung dobel.
// =========================================================

import { sb } from "./api";

// POST dengan Prefer: return=minimal dibalas PostgREST 201 + isi KOSONG (bukan 204),
// dan sb() mencoba res.json() pada isi kosong itu -> SyntaxError "Unexpected end of JSON
// input" padahal data SUDAH tersimpan. Helper ini menelan error khusus itu saja;
// error lain (jaringan, validasi, RLS) tetap dilempar.
export async function sbTulis(path, opts) {
  try {
    return await sb(path, opts);
  } catch (e) {
    if (e instanceof SyntaxError || /Unexpected end of JSON/i.test(e?.message || "")) return null;
    throw e;
  }
}

// Normalisasi untuk pencocokan SKU: buang karakter tak terlihat (zero-width, BOM, soft hyphen),
// samakan semua jenis tanda strip (– — ‑ − dst) jadi "-", spasi ganda/NBSP jadi satu spasi biasa,
// lalu trim + huruf besar. Supaya SKU yang tampak sama di layar juga dianggap sama oleh sistem.
export const normSku = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

// Awalan KODE RAK yang ditempel di SKU Shopee supaya mudah diambil di gudang, mis.
// "G6J-1B-TDKA-KLR-89-PER-P60CM" (satu pasang) atau "G3J-6C-G4I-6C-TDKA-KLL-9-PER-P45CM" (dua pasang;
// bisa dua digit: "G4I-10A-..."). SKU di Master Barang hanya "TDKA-KLR-89-PER-P60CM". Kode rak berubah
// kalau barang pindah rak, jadi bukan bagian identitas SKU — dibuang saat mencocokkan.
const POLA_KODE_RAK = /^(?:[A-Z]\d[A-Z]-\d{1,2}[A-Z]-)+/;
export const buangKodeRak = (s) => normSku(s).replace(POLA_KODE_RAK, "");

// Cari baris Master Barang untuk satu kode referensi marketplace.
// Urutan: pemetaan manual (alias) -> kalau SKU tujuannya sudah tidak ada di Master, tetap coba
// cocok langsung dengan SKU yang sama persis -> terakhir, coba lagi tanpa awalan kode rak.
export function cariMaster(ref, aliasMap, skuMap) {
  const k = normSku(ref);
  if (!k) return null;
  const viaAlias = aliasMap?.get(k);
  if (viaAlias) {
    const m = skuMap.get(normSku(viaAlias));
    if (m) return m;
  }
  const langsung = skuMap.get(k);
  if (langsung) return langsung;
  const polos = k.replace(POLA_KODE_RAK, "");
  if (polos && polos !== k) {
    const aliasPolos = aliasMap?.get(polos);
    if (aliasPolos) {
      const m = skuMap.get(normSku(aliasPolos));
      if (m) return m;
    }
    return skuMap.get(polos) || null;
  }
  return null;
}

function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  // Export Pesanan memakai format Indonesia ("26.000"); Laporan Penghasilan
  // kadang angka murni, kadang string ("36200").
  const bersih = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = Number(bersih);
  return Number.isFinite(n) ? n : 0;
}

function tgl(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function bacaSheetRows(buffer, pilihSheet) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const nama = pilihSheet(wb.SheetNames);
  if (!nama) throw new Error("Sheet yang dibutuhkan tidak ditemukan di file ini.");
  return XLSX.utils.sheet_to_json(wb.Sheets[nama], { header: 1, raw: true, defval: "" });
}

function petaKolom(rows, penandaKolom) {
  const idx = rows.findIndex((r) => r.some((c) => String(c).trim() === penandaKolom));
  if (idx < 0) return null;
  const kol = {};
  rows[idx].forEach((c, i) => {
    const k = String(c).trim();
    if (k && !(k in kol)) kol[k] = i;
  });
  return { barisHeader: idx, kol };
}

// Kelompok biaya. Aturan berdasarkan NAMA kolom (bukan posisi), dan semua kolom
// angka di antara "Ongkir Dibayar Pembeli" dan "Username (Pembeli)" yang tidak
// dikenali otomatis masuk "biaya_lain" — jadi kalau Shopee menambah jenis biaya
// baru, angkanya tetap terhitung (dan totalnya tetap pas dengan Total Penghasilan).
function kelompokBiaya(namaKolom) {
  const n = namaKolom;
  if (/^(Ongkir Dibayar Pembeli|Ongkos Kirim|Potongan Ongkos Kirim|Gratis Ongkir dari Shopee|Return to Seller Fee|Pengembalian Biaya Kirim)/.test(n)) return "ongkir_net";
  if (/^(Voucher|Cashback Koin|Diskon Produk dari Shopee)/.test(n)) return "voucher_penjual";
  if (n === "Biaya Administrasi") return "biaya_admin";
  if (n === "Biaya Proses Pesanan") return "biaya_proses";
  if (/^Biaya Gratis Ongkir XTRA/.test(n)) return "biaya_ongkir_xtra";
  if (n === "Biaya Transaksi" || n === "Biaya Layanan Promo XTRA") return "biaya_layanan";
  if (n === "Biaya Kampanye" || n === "Biaya Komisi AMS" || /^Biaya Isi Saldo/.test(n)) return "biaya_promosi";
  if (n === "PPh 22") return "pajak";
  return "biaya_lain";
}

export const FIELD_BIAYA = [
  "ongkir_net", "voucher_penjual", "biaya_admin", "biaya_proses",
  "biaya_ongkir_xtra", "biaya_layanan", "biaya_promosi", "biaya_lain", "pajak",
];

export async function parseLaporanPenghasilan(buffer) {
  const rows = await bacaSheetRows(buffer, (names) => names.find((s) => s.toLowerCase() === "penghasilan"));
  const pm = petaKolom(rows, "No. Pesanan");
  const wajib = ["Lihat berdasarkan", "Total Penghasilan", "Harga Produk", "Jumlah Pengembalian Dana ke Pembeli", "Ongkir Dibayar Pembeli", "Username (Pembeli)"];
  if (!pm || wajib.some((k) => !(k in pm.kol))) {
    throw new Error("Ini bukan file Laporan Penghasilan Shopee (sheet \"Penghasilan\" / kolom biaya tidak ditemukan). Unduh dari Seller Centre > Penghasilan Saya > Sudah Dilepas > Laporan Penghasilan.");
  }
  const { kol, barisHeader } = pm;
  const kolBiaya = Object.entries(kol)
    .filter(([, i]) => i >= kol["Ongkir Dibayar Pembeli"] && i < kol["Username (Pembeli)"])
    .map(([nama, i]) => ({ i, grup: kelompokBiaya(nama) }));

  const orders = new Map();
  const skuRows = new Map();
  for (const r of rows.slice(barisHeader + 1)) {
    const no = String(r[kol["No. Pesanan"]] ?? "").trim();
    if (!no) continue;
    const jenis = String(r[kol["Lihat berdasarkan"]]).trim();
    if (jenis === "Order") {
      const o = {
        no_pesanan: no,
        tanggal_pesanan: tgl(r[kol["Waktu Pesanan Dibuat"]]),
        tanggal_dilepas: tgl(r[kol["Tanggal Dana Dilepaskan"]]),
        dana_dilepas: num(r[kol["Total Penghasilan"]]),
        harga_produk: num(r[kol["Harga Produk"]]),
        refund: num(r[kol["Jumlah Pengembalian Dana ke Pembeli"]]),
        skuRows: [],
      };
      FIELD_BIAYA.forEach((f) => (o[f] = 0));
      for (const { i, grup } of kolBiaya) o[grup] += num(r[i]);
      orders.set(no, o);
    } else if (jenis === "Sku") {
      if (!skuRows.has(no)) skuRows.set(no, []);
      skuRows.get(no).push({
        nama_produk: String(r[kol["Nama Produk"]] ?? "").trim(),
        harga_produk: num(r[kol["Harga Produk"]]),
      });
    }
  }
  let tidakPas = 0;
  for (const [no, o] of orders) {
    o.skuRows = skuRows.get(no) || [];
    const hitung = o.harga_produk + o.refund + FIELD_BIAYA.reduce((a, f) => a + o[f], 0);
    if (Math.abs(hitung - o.dana_dilepas) > 1) tidakPas++;
  }
  return { orders, tidakPas };
}

export async function parseExportPesanan(buffer) {
  const rows = await bacaSheetRows(buffer, (names) => names.find((s) => s.toLowerCase() === "orders") || names[0]);
  const pm = petaKolom(rows, "No. Pesanan");
  const wajib = ["Nomor Referensi SKU", "Jumlah", "Subtotal Pesanan", "Nama Produk"];
  if (!pm || wajib.some((k) => !(k in pm.kol))) {
    throw new Error("Ini bukan file Export Pesanan Shopee (kolom \"Nomor Referensi SKU\" / \"Jumlah\" tidak ditemukan). Unduh dari Seller Centre > Pesanan Saya > Export (Order.all).");
  }
  const { kol, barisHeader } = pm;
  const lines = new Map();
  for (const r of rows.slice(barisHeader + 1)) {
    const no = String(r[kol["No. Pesanan"]] ?? "").trim();
    if (!no) continue;
    if (!lines.has(no)) lines.set(no, []);
    lines.get(no).push({
      sku_referensi: String(r[kol["Nomor Referensi SKU"]] ?? "").trim(),
      nama_produk: String(r[kol["Nama Produk"]] ?? "").trim(),
      variasi: String(r[kol["Nama Variasi"]] ?? "").trim(),
      qty: num(r[kol["Jumlah"]]) || 1,
      qty_retur: num(r[kol["Returned quantity"]]),
      harga_satuan: num(r[kol["Harga Setelah Diskon"]]),
      subtotal: num(r[kol["Subtotal Pesanan"]]),
      status_pesanan: String(r[kol["Status Pesanan"]] ?? "").trim(),
    });
  }
  return { lines };
}

// =========================================================
// LAPORAN IKLAN SHOPEE (CSV) -> biaya iklan per periode, dikurangkan dari laba
// bersih di Rincian Penjualan. File yang dibaca: "Data Keseluruhan Iklan"
// (Seller Centre > Iklan Shopee > Data Keseluruhan > Unduh) — satu baris per
// kampanye (Iklan Produk Otomatis + GMV Max), kolom "Biaya" = uang iklan
// yang terpakai. File "Rincian Data Iklan Produk Otomatis" TIDAK dipakai:
// isinya hanya pecahan per produk dari baris "Iklan Produk Otomatis" di file
// keseluruhan (kalau ikut dijumlahkan, biayanya terhitung dobel).
// =========================================================

// Parser CSV kecil (mendukung tanda kutip, koma di dalam kutip, CRLF, BOM)
function parseCsv(teks) {
  const t = String(teks).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", kutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (kutip) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else kutip = false; }
      else cell += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "01/09/2026" -> "2026-09-01"
function tglDmy(s) {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Baca CSV laporan iklan Shopee: header tabel (baris "Urutan"), blok info di atasnya
// (Periode, Nama Toko, ...) dan periode dalam ISO.
function bacaCsvIklan(buffer) {
  const rows = parseCsv(new TextDecoder("utf-8").decode(buffer));
  const idxHeader = rows.findIndex((r) => r.some((c) => c.trim() === "Urutan"));
  const header = idxHeader >= 0 ? rows[idxHeader].map((c) => c.trim()) : [];
  const meta = {};
  if (idxHeader > 0) for (const r of rows.slice(0, idxHeader)) if (r[0] && r[1] != null) meta[r[0].trim()] = String(r[1]).trim();
  const [d1, d2] = String(meta["Periode"] || "").split(" - ");
  return { rows, idxHeader, header, meta, dari: tglDmy(d1), sampai: tglDmy(d2) };
}

// Ubah baris tabel CSV jadi baris iklan. kolNama = kolom nama ("Nama Iklan" / "Nama Produk").
function barisIklan(csv, kolNama, modeTetap) {
  const { rows, idxHeader, header } = csv;
  const k = (nama) => header.indexOf(nama);
  const ambil = (r, nama) => (k(nama) >= 0 ? r[k(nama)] : "");
  const hasil = [];
  for (const r of rows.slice(idxHeader + 1)) {
    if (!r.length || !String(r[0]).trim() || !String(ambil(r, kolNama)).trim()) continue;
    hasil.push({
      urutan: num(r[0]),
      nama_iklan: String(ambil(r, kolNama)).trim(),
      status: String(ambil(r, "Status")).trim() || null,
      mode: modeTetap || String(ambil(r, "Mode Bidding")).trim() || null,
      kode_produk: String(ambil(r, "Kode Produk")).trim().replace(/^-$/, "") || null,
      dilihat: num(ambil(r, "Dilihat")),
      klik: num(ambil(r, "Jumlah Klik")),
      produk_terjual: num(ambil(r, "Produk Terjual")),
      omzet: num(ambil(r, "Omzet Penjualan")),
      biaya: num(ambil(r, "Biaya")),
    });
  }
  return hasil;
}

const jumlahBiaya = (list) => list.reduce((a, x) => a + x.biaya, 0);
const jumlahOmzet = (list) => list.reduce((a, x) => a + x.omzet, 0);
const MODE_OTOMATIS = "Iklan Produk Otomatis";

// File 1: "Data Keseluruhan Iklan" — satu baris per kampanye
export async function parseLaporanIklan(buffer) {
  const csv = bacaCsvIklan(buffer);
  if (csv.header.includes("Nama Produk") && !csv.header.includes("Nama Iklan")) {
    throw new Error("Ini file \"Rincian Data Iklan Produk Otomatis\" — isi di kotak ke-2. Kotak ke-1 untuk file \"Data Keseluruhan Iklan\".");
  }
  if (!csv.header.includes("Nama Iklan") || !csv.header.includes("Biaya")) {
    throw new Error("Ini bukan file Data Keseluruhan Iklan Shopee (kolom \"Nama Iklan\" / \"Biaya\" tidak ditemukan). Unduh dari Seller Centre > Iklan Shopee > Data Keseluruhan.");
  }
  if (!csv.dari || !csv.sampai) throw new Error("Periode laporan iklan tidak terbaca di bagian atas file.");
  const iklan = barisIklan(csv, "Nama Iklan", null);
  return {
    dari: csv.dari, sampai: csv.sampai, iklan,
    namaToko: csv.meta["Nama Toko"] || "", username: csv.meta["Username"] || "",
    totalBiaya: jumlahBiaya(iklan), totalOmzet: jumlahOmzet(iklan),
  };
}

// File 2 (opsional): "Rincian Data Iklan Produk Otomatis" — pecahan per produk dari baris
// "Iklan Produk Otomatis" di file 1 (baris pertamanya, Kode Produk "-", adalah ringkasannya).
export async function parseRincianIklanOtomatis(buffer) {
  const csv = bacaCsvIklan(buffer);
  if (csv.header.includes("Nama Iklan")) {
    throw new Error("Ini file \"Data Keseluruhan Iklan\" — isi di kotak ke-1. Kotak ke-2 untuk \"Rincian Data Iklan Produk Otomatis\".");
  }
  if (!csv.header.includes("Nama Produk") || !csv.header.includes("Kode Produk") || !csv.header.includes("Biaya")) {
    throw new Error("Ini bukan file Rincian Data Iklan Produk Otomatis Shopee (kolom \"Nama Produk\" / \"Kode Produk\" / \"Biaya\" tidak ditemukan).");
  }
  if (!csv.dari || !csv.sampai) throw new Error("Periode laporan iklan tidak terbaca di bagian atas file.");
  const semua = barisIklan(csv, "Nama Produk", MODE_OTOMATIS);
  return {
    dari: csv.dari, sampai: csv.sampai,
    iklan: semua.filter((x) => x.kode_produk),
    ringkasanBiaya: semua.filter((x) => !x.kode_produk).reduce((a, x) => a + x.biaya, 0),
  };
}

// Gabungkan: baris ringkasan "Iklan Produk Otomatis" di file 1 diganti pecahan per produk dari
// file 2. Selisih pembulatan (mis. Rp 4) dijadikan satu baris tanpa kode produk supaya total
// biaya tetap persis sama dengan angka Shopee.
export function gabungIklan(utama, rincian) {
  if (!rincian) return { ...utama, selisihBulat: 0, rincianDipakai: false };
  if (rincian.dari !== utama.dari || rincian.sampai !== utama.sampai) {
    throw new Error("Periode kedua file iklan berbeda — unduh keduanya dengan periode yang sama.");
  }
  const ringkas = utama.iklan.find((x) => x.mode === MODE_OTOMATIS && !x.kode_produk);
  if (!ringkas) throw new Error("File Data Keseluruhan tidak punya baris \"Iklan Produk Otomatis\", jadi file rincian tidak bisa dipasangkan.");
  const sisa = utama.iklan.filter((x) => x !== ringkas);
  const selisih = Math.round((ringkas.biaya - jumlahBiaya(rincian.iklan)) * 100) / 100;
  const tambahan = Math.abs(selisih) >= 0.5
    ? [{ ...ringkas, nama_iklan: "Selisih pembulatan Iklan Produk Otomatis", biaya: selisih, dilihat: 0, klik: 0, produk_terjual: 0, omzet: 0 }]
    : [];
  const iklan = [...sisa, ...rincian.iklan, ...tambahan];
  return { ...utama, iklan, totalBiaya: jumlahBiaya(iklan), totalOmzet: jumlahOmzet(iklan), selisihBulat: selisih, rincianDipakai: true };
}

// =========================================================
// MASS UPDATE PRODUK SHOPEE (.xlsx "Info Penjualan") -> tabel pemetaan
// Kode Produk (item ID) <-> judul produk <-> SKU tiap variasi. Dipakai untuk membagi biaya
// iklan (yang hanya tahu Kode Produk) ke SKU. Import berkala; menambah/memperbarui per
// (produk, variasi) dan TIDAK menghapus yang tidak ada di file baru.
// =========================================================
export async function parseMassUpdate(buffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const idxHeader = rows.findIndex((r) => r.some((c) => String(c).trim() === "et_title_product_id"));
  const kol = {};
  if (idxHeader >= 0) rows[idxHeader].forEach((c, i) => { const k = String(c).trim(); if (k && !(k in kol)) kol[k] = i; });
  if (idxHeader < 0 || ["et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_sku"].some((k) => !(k in kol))) {
    throw new Error("Ini bukan file Mass Update Shopee (kolom et_title_product_id / et_title_variation_sku tidak ditemukan). Unduh dari Seller Centre > Produk Saya > Ubah Massal > Info Penjualan.");
  }
  let filter = null, idToko = "";
  for (const r of rows.slice(idxHeader + 1, idxHeader + 4)) {
    const j = r.find((c) => String(c).startsWith("{\"search_condition\""));
    if (j) { try { filter = JSON.parse(j).search_condition || null; } catch { /* abaikan */ } }
    if (String(r[0]) === "sales_info") idToko = String(r[3] ?? "").trim();
  }
  const teks = (r, nama) => (nama in kol ? String(r[kol[nama]] ?? "").trim() : "");
  const peta = new Map();
  for (const r of rows.slice(idxHeader + 1)) {
    const kode = teks(r, "et_title_product_id");
    if (!/^\d+$/.test(kode)) continue; // lewati baris petunjuk / info
    const variasi = teks(r, "et_title_variation_id");
    peta.set(`${kode}|${variasi}`, {
      kode_produk: kode, kode_variasi: variasi,
      nama_produk: teks(r, "et_title_product_name") || null,
      nama_variasi: teks(r, "et_title_variation_name") || null,
      sku_induk: teks(r, "et_title_parent_sku") || null,
      sku_variasi: teks(r, "et_title_variation_sku") || null,
    });
  }
  const baris = [...peta.values()];
  return {
    baris, idToko, filter,
    difilter: !!(filter && (filter.product_status || filter.stock_condition)),
    jumlahProduk: new Set(baris.map((b) => b.kode_produk)).size,
    tanpaSku: baris.filter((b) => !b.sku_variasi).length,
  };
}

// =========================================================
// PEMBAGIAN BIAYA IKLAN KE SKU
// Iklan hanya tahu Kode Produk (induk). Pesanan hanya tahu judul produk + SKU variasi.
// SKU yang sama bisa dipakai di beberapa listing, jadi pesanan dicocokkan ke produk lewat
// JUDUL dulu (hampir unik), baru SKU (hanya kalau SKU itu milik tepat satu produk).
// Biaya satu produk dibagi ke SKU-SKU-nya sesuai porsi harga jual (omzet) di periode itu.
// =========================================================
export const normJudul = (s) => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function bangunIndeksProduk(petaRows) {
  const produk = new Map(); // kode -> { kode, nama, skuSet }
  for (const r of petaRows || []) {
    if (!produk.has(r.kode_produk)) produk.set(r.kode_produk, { kode: r.kode_produk, nama: r.nama_produk || "", skuSet: new Set() });
    const p = produk.get(r.kode_produk);
    if (!p.nama && r.nama_produk) p.nama = r.nama_produk;
    if (r.sku_variasi) p.skuSet.add(buangKodeRak(r.sku_variasi));
  }
  const byJudul = new Map(), bySku = new Map();
  for (const p of produk.values()) {
    const j = normJudul(p.nama);
    if (j) byJudul.set(j, [...(byJudul.get(j) || []), p.kode]);
    for (const k of p.skuSet) bySku.set(k, [...(bySku.get(k) || []), p.kode]);
  }
  return { produk, byJudul, bySku };
}

export function produkDariBaris(b, idx) {
  const kand = idx.byJudul.get(normJudul(b.nama_produk)) || [];
  const ref = buangKodeRak(b.sku_referensi);
  if (kand.length === 1) return kand[0];
  if (kand.length > 1) {
    const cocok = ref ? kand.filter((k) => idx.produk.get(k).skuSet.has(ref)) : [];
    return cocok.length === 1 ? cocok[0] : null;
  }
  const dariSku = ref ? idx.bySku.get(ref) || [] : [];
  return dariSku.length === 1 ? dariSku[0] : null;
}

// Pecahan (0..1) dari periode iklan yang jatuh di rentang tampilan
function faktorRentang(pDari, pSampai, dari, sampai) {
  const hari = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const a = Math.max(hari(pDari), hari(dari)), b = Math.min(hari(pSampai), hari(sampai));
  if (b < a) return 0;
  return (b - a + 1) / (hari(pSampai) - hari(pDari) + 1);
}

// iklanRows: baris marketplace_iklan; lines: baris marketplace_penjualan di rentang; kunciBaris(b) -> kunci SKU di tabel Per SKU
export function bagiIklanKeSku({ iklanRows, dari, sampai, lines, idx, kunciBaris }) {
  const perKunci = new Map();
  const tidakTerbagi = [];
  const biayaProduk = new Map(); // kode -> { nama, biaya }
  for (const x of iklanRows || []) {
    const biaya = Number(x.biaya) * faktorRentang(x.periode_dari, x.periode_sampai, dari, sampai);
    if (!biaya) continue;
    if (!x.kode_produk) { tidakTerbagi.push({ kode: "", nama: x.nama_iklan, biaya, alasan: "tanpa kode produk" }); continue; }
    if (!biayaProduk.has(x.kode_produk)) biayaProduk.set(x.kode_produk, { nama: x.nama_iklan, biaya: 0 });
    biayaProduk.get(x.kode_produk).biaya += biaya;
  }
  // porsi omzet tiap SKU di tiap produk beriklan
  const bobot = new Map(); // kode -> Map(kunci -> omzet)
  if (idx?.produk?.size) {
    const cache = new Map();
    for (const b of lines || []) {
      const ck = `${b.nama_produk || ""}|${b.sku_referensi || ""}`;
      if (!cache.has(ck)) cache.set(ck, produkDariBaris(b, idx));
      const kode = cache.get(ck);
      if (!kode || !biayaProduk.has(kode)) continue;
      if (!bobot.has(kode)) bobot.set(kode, new Map());
      const m = bobot.get(kode), kunci = kunciBaris(b);
      m.set(kunci, (m.get(kunci) || 0) + Math.max(0, Number(b.harga_produk) || 0));
    }
  }
  let terbagi = 0;
  for (const [kode, { nama, biaya }] of biayaProduk) {
    const m = bobot.get(kode);
    const total = m ? [...m.values()].reduce((a, v) => a + v, 0) : 0;
    if (!m || total <= 0) {
      const namaPeta = idx?.produk?.get(kode)?.nama;
      tidakTerbagi.push({ kode, nama: namaPeta || nama, biaya, alasan: idx?.produk?.has(kode) ? "tidak ada penjualan produk ini di periode ini" : "produk belum ada di pemetaan (import Mass Update)" });
      continue;
    }
    const kunci = [...m.keys()];
    const bagi = alokasi(biaya, kunci.map((k) => m.get(k)));
    kunci.forEach((k, i) => perKunci.set(k, (perKunci.get(k) || 0) + bagi[i]));
    terbagi += Math.round(biaya);
  }
  // biayaProduk: Map kode produk (etalase) -> { nama, biaya } — biaya iklan ASLI per etalase di rentang tampilan (dipakai tab Per Etalase)
  return { perKunci, terbagi, tidakTerbagi, totalTidakTerbagi: tidakTerbagi.reduce((a, x) => a + x.biaya, 0), biayaProduk };
}

// Biaya iklan yang jatuh di rentang [dari, sampai] (ISO). Laporan iklan hanya
// punya total per periode (tidak per hari), jadi kalau rentang tampilan hanya
// memotong sebagian periode, biayanya dibagi rata per hari (perkiraan).
export function biayaIklanDiRentang(daftarPeriode, dari, sampai) {
  const hari = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  let biaya = 0, perkiraan = false;
  for (const p of daftarPeriode || []) {
    const a = Math.max(hari(p.periode_dari), hari(dari));
    const b = Math.min(hari(p.periode_sampai), hari(sampai));
    if (b < a) continue;
    const panjang = hari(p.periode_sampai) - hari(p.periode_dari) + 1;
    const irisan = b - a + 1;
    biaya += Number(p.biaya) * (irisan / panjang);
    if (irisan < panjang) perkiraan = true;
  }
  return { biaya: Math.round(biaya), perkiraan };
}

// Bagi `total` ke beberapa baris sesuai bobot; selisih pembulatan -> baris terakhir
function alokasi(total, bobot) {
  const jumlah = bobot.reduce((a, b) => a + b, 0);
  const hasil = bobot.map((b) => Math.round((total * (jumlah > 0 ? b / jumlah : 1 / bobot.length))));
  const selisih = Math.round(total) - hasil.reduce((a, b) => a + b, 0);
  hasil[hasil.length - 1] += selisih;
  return hasil;
}

// existingByOrder: Map no_pesanan -> baris tersimpan di DB (supaya import ulang
// laporan penghasilan SAJA tidak menghapus data SKU hasil import Export Pesanan
// sebelumnya). aliasMap: Map normSku(referensi Shopee) -> SKU sistem.
// skuMap: Map normSku(sku) -> baris sku_master.
export function bangunBaris({ income, pesanan, existingByOrder, aliasMap, skuMap, platform, toko }) {
  const hasil = [];
  const ringkas = { pesanan: 0, dariExport: 0, dariTersimpan: 0, tanpaSku: 0, barisCocok: 0, barisTidakCocok: 0, referensiTidakCocok: new Set() };

  for (const [no, o] of income.orders) {
    ringkas.pesanan++;
    let lines = pesanan?.lines.get(no);
    let sumber = "order_export";
    if (lines?.length) ringkas.dariExport++;
    else {
      const lama = (existingByOrder?.get(no) || []).filter((b) => b.sumber_sku !== "laporan");
      if (lama.length) {
        lines = lama
          .sort((a, b) => a.no_baris - b.no_baris)
          .map((b) => ({
            sku_referensi: b.sku_referensi || "", nama_produk: b.nama_produk, variasi: b.variasi || "",
            qty: b.qty, qty_retur: b.qty_retur || 0, harga_satuan: b.harga_satuan, subtotal: b.subtotal, status_pesanan: b.status_pesanan || "",
          }));
        ringkas.dariTersimpan++;
      } else {
        sumber = "laporan";
        lines = o.skuRows.length
          ? o.skuRows.map((s) => ({ sku_referensi: "", nama_produk: s.nama_produk, variasi: "", qty: null, qty_retur: 0, harga_satuan: null, subtotal: s.harga_produk, status_pesanan: "" }))
          : [{ sku_referensi: "", nama_produk: "(produk tidak terbaca)", variasi: "", qty: null, qty_retur: 0, harga_satuan: null, subtotal: o.harga_produk, status_pesanan: "" }];
        ringkas.tanpaSku++;
      }
    }

    const bobot = lines.map((l) => Math.max(0, l.subtotal || 0));
    const bagi = {};
    for (const f of ["harga_produk", "refund", "dana_dilepas", ...FIELD_BIAYA]) bagi[f] = alokasi(o[f], bobot);

    lines.forEach((l, i) => {
      const ref = normSku(l.sku_referensi);
      const master = ref ? cariMaster(l.sku_referensi, aliasMap, skuMap) : null;
      if (ref) {
        if (master) ringkas.barisCocok++;
        else { ringkas.barisTidakCocok++; ringkas.referensiTidakCocok.add(l.sku_referensi); }
      }
      const baris = {
        platform, toko: toko || "", no_pesanan: no, no_baris: i + 1,
        tanggal_pesanan: o.tanggal_pesanan, tanggal_dilepas: o.tanggal_dilepas,
        status_pesanan: l.status_pesanan || null,
        sku_referensi: l.sku_referensi || null,
        sku: master ? master.sku : null,
        nama_produk: l.nama_produk || null, variasi: l.variasi || null,
        qty: l.qty, qty_retur: l.qty_retur || 0,
        harga_satuan: l.harga_satuan, subtotal: l.subtotal,
        hpp_satuan: master && master.hpp != null ? Number(master.hpp) : null,
        sumber_sku: sumber,
      };
      for (const f of ["harga_produk", "refund", "dana_dilepas", ...FIELD_BIAYA]) baris[f] = bagi[f][i];
      hasil.push(baris);
    });
  }
  return { baris: hasil, ringkas };
}