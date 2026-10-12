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

export const normSku = (s) => String(s ?? "").trim().toUpperCase();

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
      const skuSistem = ref ? aliasMap.get(ref) || (skuMap.has(ref) ? skuMap.get(ref).sku : null) : null;
      const master = skuSistem ? skuMap.get(normSku(skuSistem)) : null;
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