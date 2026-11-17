import { sb, sbAll } from "../../lib/api";
import { muatTanggalMulaiKasir } from "./kasirLaporan";
import { bangunIndeksAwalan, cocokkanItemManual, normKode } from "../../lib/hppGrosirCocok";
import { buatPelengkapHpp } from "../../lib/hppTokoCocok";

// =========================================================
// PENJUALAN TOKO OFFLINE LAMA (sebelum kasir dipakai) — per barang.
// Omzetnya sudah ada di Keuangan (Input Harian), jadi data ini TIDAK menambah omzet di mana pun
// dan tidak menyentuh stok maupun Keuangan. Fungsinya: rincian barang terjual + HPP/laba periode lama.
// Tabel: toko_penjualan_lama (supabase/migrations/20261117_toko_penjualan_lama.sql).
//
// Pengaman dobel hitung:
//   - Baris bertanggal SAMA ATAU SESUDAH transaksi kasir pertama dilewati (periode itu sudah dihitung kasir).
//   - Baris yang persis sama (tanggal, SKU, qty, harga) dengan yang sudah pernah diimpor dilewati,
//     jadi mengimpor file yang sama dua kali tidak menggandakan data.
// HPP dihitung saat laporan dibuka dari Master Barang (sama seperti kasir), dengan pencocokan SKU
// bertingkat dari lib/hppGrosirCocok.js (warna/ukuran yang tak ada ikut ke model yang sama).
// =========================================================

export const TABEL_LAMA = "toko_penjualan_lama";
const KOLOM_HARGA = ["ecer", "grosir"];
const num = (v) => Number(v) || 0;

// SKU di file lama sering = kode / barcode / SKU gudang di Barang Toko (master_toko), bukan SKU Master Barang.
// Dicari ke Barang Toko dulu (HPP-nya = HPP Barang Toko, dilengkapi dari barang mirip), baru ke Master Barang.
const SELECT_TOKO = "master_toko?select=kode,nama,barcode,sku_gudang,hpp,harga_jual";
export function bangunPetaToko(rowsToko, rowsMaster) {
  const lengkapi = buatPelengkapHpp(rowsToko, rowsMaster);
  const peta = new Map();
  for (const r of rowsToko || []) {
    const hpp = lengkapi.hppToko(r);
    for (const k of [r.kode, r.barcode, r.sku_gudang]) {
      const n = normKode(k);
      if (n && !peta.has(n)) peta.set(n, { hpp });
    }
  }
  return peta;
}
function cocokkanSku(peta, indeks, sku, harga) {
  const t = peta.get(normKode(sku));
  if (t) return t.hpp > 0 ? { status: "cocok", hpp: t.hpp } : { status: "tanpaHpp", hpp: 0 };
  return cocokkanItemManual(indeks, sku, harga, KOLOM_HARGA);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIAS = {
  tanggal: ["tanggal", "tgl", "date", "tanggaljual", "tanggalpenjualan"],
  sku: ["sku", "kodesku", "kode", "kodebarang", "skugudang"],
  nama: ["nama", "namabarang", "namaproduk", "namaitem"],
  qty: ["qty", "jumlah", "terjual", "qtyterjual", "jumlahterjual"],
  harga: ["harga", "hargasatuan", "hargajual", "hargaecer", "hargasatuanrp"],
};

// "1.250.000" / "1250000" / 1250000 -> angka. Kosong -> null. Tidak valid -> NaN.
export function angkaId(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (t === "") return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

const adaTanggal = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Excel serial / "2026-10-05" / "05/10/2026" (hari dulu, format Indonesia) -> "YYYY-MM-DD" atau "".
export function tanggalIso(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return adaTanggal(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : "";
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return adaTanggal(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : "";
  }
  return "";
}

// ---------- baca file Excel / CSV ----------
export async function bacaFilePenjualanLama(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const iHeader = aoa.findIndex((r) => r.some((c) => ALIAS.tanggal.includes(norm(c))) && r.some((c) => ALIAS.sku.includes(norm(c))));
  if (iHeader < 0) throw new Error('Kolom "Tanggal" dan "SKU" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.');
  const kolom = {};
  aoa[iHeader].forEach((c, i) => {
    const n = norm(c);
    for (const [k, alias] of Object.entries(ALIAS)) if (kolom[k] === undefined && alias.includes(n)) kolom[k] = i;
  });
  for (const k of ["qty", "harga"]) {
    if (kolom[k] === undefined) throw new Error(`Kolom "${k === "qty" ? "Qty" : "Harga"}" tidak ditemukan. Pakai template yang bisa diunduh di layar ini.`);
  }
  return aoa
    .slice(iHeader + 1)
    .map((r, i) => ({ baris: iHeader + i + 2, r }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ""))
    .map(({ baris, r }) => ({
      baris,
      tanggal: tanggalIso(r[kolom.tanggal]),
      tanggalMentah: String(r[kolom.tanggal] ?? "").trim(),
      sku: String(r[kolom.sku] ?? "").trim(),
      nama: kolom.nama === undefined ? "" : String(r[kolom.nama] ?? "").trim(),
      qty: angkaId(r[kolom.qty]),
      harga: angkaId(r[kolom.harga]),
    }));
}

// ---------- periksa baris (murni, bisa dites tanpa database) ----------
// status: ok | salah | kasir (sudah ada data kasir) | dobel (sudah pernah diimpor)
// hppStatus (hanya untuk info di pratinjau): cocok | ambigu | tidakKetemu | tanpaHpp
export function periksaBaris(baris, { tanggalMulaiKasir = null, master = [], toko = [], sudahAda = [] } = {}) {
  const indeks = bangunIndeksAwalan(master);
  const petaToko = bangunPetaToko(toko, master);
  const sisa = new Map();
  for (const e of sudahAda) {
    const k = `${e.tanggal}|${normKode(e.sku)}|${num(e.qty)}|${num(e.harga_satuan)}`;
    sisa.set(k, (sisa.get(k) || 0) + 1);
  }
  return baris.map((b) => {
    const hasil = { ...b, status: "ok", pesan: "", hppStatus: "" };
    if (!b.tanggal) return { ...hasil, status: "salah", pesan: `Tanggal tidak terbaca (${b.tanggalMentah || "kosong"})` };
    if (!b.sku) return { ...hasil, status: "salah", pesan: "SKU kosong" };
    if (!(b.qty > 0)) return { ...hasil, status: "salah", pesan: "Qty harus lebih dari 0" };
    if (b.harga === null || Number.isNaN(b.harga) || b.harga < 0) return { ...hasil, status: "salah", pesan: "Harga kosong / tidak valid" };
    if (tanggalMulaiKasir && b.tanggal >= tanggalMulaiKasir) {
      return { ...hasil, status: "kasir", pesan: `Sudah ada data kasir sejak ${tanggalMulaiKasir}` };
    }
    const k = `${b.tanggal}|${normKode(b.sku)}|${num(b.qty)}|${num(b.harga)}`;
    if ((sisa.get(k) || 0) > 0) {
      sisa.set(k, sisa.get(k) - 1);
      return { ...hasil, status: "dobel", pesan: "Sudah pernah diimpor" };
    }
    hasil.hppStatus = cocokkanSku(petaToko, indeks, b.sku, b.harga).status;
    return hasil;
  });
}

// Muat pembanding dari database lalu periksa.
export async function periksaFile(baris) {
  const tanggal = baris.map((b) => b.tanggal).filter(Boolean).sort();
  const [tanggalMulaiKasir, master, toko, sudahAda] = await Promise.all([
    muatTanggalMulaiKasir().catch(() => null),
    sbAll("sku_master?select=sku,hpp,ecer,grosir").catch(() => []),
    sbAll(SELECT_TOKO).catch(() => []),
    tanggal.length
      ? sbAll(`${TABEL_LAMA}?select=tanggal,sku,qty,harga_satuan&tanggal=gte.${tanggal[0]}&tanggal=lte.${tanggal[tanggal.length - 1]}`)
      : [],
  ]);
  return periksaBaris(baris, { tanggalMulaiKasir, master: master || [], toko: toko || [], sudahAda: sudahAda || [] });
}

// Simpan baris berstatus "ok" sebagai satu batch. Mengembalikan { batch, jumlah }.
export async function simpanPenjualanLama(barisOk) {
  const batch = `LAMA-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const data = barisOk.map((b) => ({
    batch,
    tanggal: b.tanggal,
    sku: b.sku,
    nama_produk: b.nama || null,
    qty: b.qty,
    harga_satuan: b.harga,
  }));
  for (let i = 0; i < data.length; i += 200) {
    await sb(TABEL_LAMA, { method: "POST", body: JSON.stringify(data.slice(i, i + 200)) });
  }
  return { batch, jumlah: data.length };
}

export async function hapusBatchLama(batch) {
  await sb(`${TABEL_LAMA}?batch=eq.${encodeURIComponent(batch)}`, { method: "DELETE" });
}

// Riwayat impor: satu baris per batch.
export async function muatBatchLama() {
  const rows = (await sbAll(`${TABEL_LAMA}?select=batch,tanggal,qty,harga_satuan,created_at`)) || [];
  const peta = new Map();
  for (const r of rows) {
    let b = peta.get(r.batch);
    if (!b) {
      b = { batch: r.batch, dari: r.tanggal, sampai: r.tanggal, baris: 0, qty: 0, nilai: 0, dibuat: r.created_at };
      peta.set(r.batch, b);
    }
    b.baris += 1;
    b.qty += num(r.qty);
    b.nilai += num(r.qty) * num(r.harga_satuan);
    if (r.tanggal < b.dari) b.dari = r.tanggal;
    if (r.tanggal > b.sampai) b.sampai = r.tanggal;
  }
  return [...peta.values()].sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));
}

// ---------- ringkasan per produk + HPP (murni) ----------
export function hitungRingkasLama(rows, master, toko = []) {
  const indeks = bangunIndeksAwalan(master);
  const petaToko = bangunPetaToko(toko, master);
  const peta = new Map();
  for (const r of rows || []) {
    const qty = num(r.qty);
    const harga = num(r.harga_satuan);
    const cocok = cocokkanSku(petaToko, indeks, r.sku, harga);
    const hppSatuan = cocok.status === "cocok" ? cocok.hpp : 0;
    const kunci = normKode(r.sku);
    let p = peta.get(kunci);
    if (!p) {
      p = { sku: r.sku, nama: r.nama_produk || r.sku, qty: 0, nilai: 0, hpp: 0, tanpaHpp: false, status: cocok.status };
      peta.set(kunci, p);
    }
    p.qty += qty;
    p.nilai += qty * harga;
    p.hpp += qty * hppSatuan;
    if (hppSatuan <= 0) {
      p.tanpaHpp = true;
      p.status = cocok.status;
    }
  }
  const daftar = [...peta.values()].map((p) => ({ ...p, hpp: Math.round(p.hpp), laba: Math.round(p.nilai - p.hpp) })).sort((a, b) => b.nilai - a.nilai);
  const total = daftar.reduce(
    (t, p) => ({ qty: t.qty + p.qty, nilai: t.nilai + p.nilai, hpp: t.hpp + p.hpp, laba: t.laba + p.laba, tanpaHpp: t.tanpaHpp + (p.tanpaHpp ? 1 : 0) }),
    { qty: 0, nilai: 0, hpp: 0, laba: 0, tanpaHpp: 0 }
  );
  return { daftar, total };
}

// Baris lama dalam rentang, tanpa tanggal yang sudah tercakup kasir (anti dobel hitung dengan HPP kasir).
export async function muatPenjualanLama(dari, sampai) {
  const [rows, master, toko, mulai] = await Promise.all([
    sbAll(`${TABEL_LAMA}?select=tanggal,sku,nama_produk,qty,harga_satuan&tanggal=gte.${dari}&tanggal=lte.${sampai}`),
    sbAll("sku_master?select=sku,hpp,ecer,grosir").catch(() => []),
    sbAll(SELECT_TOKO).catch(() => []),
    muatTanggalMulaiKasir().catch(() => null),
  ]);
  const dipakai = (rows || []).filter((r) => !mulai || r.tanggal < mulai);
  return hitungRingkasLama(dipakai, master || [], toko || []);
}

// Dipakai Laporan Laba Rugi (lib/hppPenjualan.js): HPP penjualan lama dalam rentang.
export async function hppPenjualanLama(dari, sampai) {
  const { total } = await muatPenjualanLama(dari, sampai);
  return { total: Math.round(total.hpp), tanpaHpp: total.tanpaHpp };
}