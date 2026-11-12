import { useEffect, useState } from "react";
import { sb, sbAll, entitasBacaSaatIni } from "../../lib/api";
import { bisa } from "../../lib/constants";
import { SKEMA, HARI_WIB, tanggalWib } from "./kasirApi";

// =========================================================
// KASIR — FASE 6: laporan & integrasi
//  - muatRekapKasir()   : tarik transaksi/item/pembayaran/shift dalam rentang tanggal (hari kalender WIB)
//  - olahRekap()        : hitungan murni -> ringkasan, harian, per kasir, per produk (tanpa React/database)
//  - muatTanggalMulaiKasir() : tanggal transaksi kasir PERTAMA -> batas "data lama (input manual)" vs "data kasir"
//  - rentangDashboard() / useRekapKasir(): dipakai Dashboard & halaman Toko Offline
//  - hitungSinkronKeuangan(): cek angka kasir cocok dengan baris Keuangan yang ditulis saat transaksi
//
// Aturan hitung (sama dengan ShiftRincian.jsx):
//  - transaksi void tidak dihitung
//  - omzet bersih = total - total_retur
//  - retur dicatat di tanggal transaksi ASLINYA (bukan tanggal returnya)
//  - barang: qty bersih = qty - qty_retur, nilai bersih = subtotal - nilai_retur
//    (nilai barang SEBELUM diskon level transaksi, jadi jumlahnya bisa sedikit di atas omzet bersih)
//  - PROFIT (laba kotor) = omzet bersih - HPP barang terjual. HPP = master_toko.hpp SAAT LAPORAN DIBUKA
//    (kasir_item tidak menyimpan HPP per transaksi), dikali qty bersih (qty - qty_retur).
//    Per produk: laba = nilai - HPP (sebelum diskon level transaksi).
//    Barang yang HPP-nya 0/belum diisi dihitung HPP 0 (laba terlalu besar) dan dihitung di `tanpaHpp`.
// =========================================================

// Kalau terisi (format "YYYY-MM-DD"), dipakai sebagai batas awal data kasir menggantikan tanggal
// transaksi kasir pertama. Isi mis. "2026-11-10" kalau sebelum tanggal itu hanya uji coba.
export const TANGGAL_MULAI_KASIR_MANUAL = null;

const T = SKEMA.trx;
const I = SKEMA.item;
const B = SKEMA.bayar;
const num = (v) => Number(v) || 0;
const statusTrx = (r) => r[T.status] || "selesai";

export const METODE_CASHLESS = ["Transfer", "QRIS"];
const jenisMetode = (m) => (m === "Cash" ? "cash" : "cashless");

// ---------- tanggal (hari kalender WIB) ----------
export const hariIniWib = () => tanggalWib(new Date());
export const tambahHari = (iso, n) => {
  const d = new Date(`${iso}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return tanggalWib(d);
};
export const awalBulanWib = (iso) => `${iso.slice(0, 7)}-01`;
export const akhirBulanWib = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return tambahHari(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
};
const batasIso = (dari, sampai) => ({
  awal: new Date(`${dari}T00:00:00+07:00`).toISOString(),
  akhir: new Date(`${tambahHari(sampai, 1)}T00:00:00+07:00`).toISOString(), // eksklusif
});

// ---------- tanggal mulai kasir (cache singkat per PT) ----------
let cacheMulai = { kunci: null, waktu: 0, janji: null };
export function muatTanggalMulaiKasir() {
  if (TANGGAL_MULAI_KASIR_MANUAL) return Promise.resolve(TANGGAL_MULAI_KASIR_MANUAL);
  const kunci = entitasBacaSaatIni();
  if (cacheMulai.kunci === kunci && Date.now() - cacheMulai.waktu < 5 * 60 * 1000 && cacheMulai.janji) return cacheMulai.janji;
  const janji = sb(`kasir_transaksi?select=${T.waktu}&order=${T.waktu}.asc&limit=1`)
    .then((rows) => (rows?.[0]?.[T.waktu] ? tanggalWib(rows[0][T.waktu]) : null))
    .catch((e) => {
      cacheMulai = { kunci: null, waktu: 0, janji: null }; // jangan simpan kegagalan
      throw e;
    });
  cacheMulai = { kunci, waktu: Date.now(), janji };
  return janji;
}

// ---------- ambil data ----------
async function dalamPotongan(ids, ukuran, kerja, serentak = 4) {
  const potongan = [];
  for (let i = 0; i < ids.length; i += ukuran) potongan.push(ids.slice(i, i + ukuran));
  const hasil = [];
  for (let i = 0; i < potongan.length; i += serentak) {
    const gelombang = await Promise.all(potongan.slice(i, i + serentak).map(kerja));
    gelombang.forEach((h) => hasil.push(...(h || [])));
  }
  return hasil;
}

// Item kasir menyimpan KODE TOKO (mis. OPS-0007). Di laporan yang ditampilkan SKU Master Barang (mis. TDCC-…)
// untuk barang yang tertaut ke Master Barang (sku_gudang). Barang import tanpa SKU gudang tetap tampil kode tokonya.
// Hanya tampilan laporan: data transaksi di database tidak diubah. Peta kode -> { sku_gudang, hpp } disimpan 5 menit.
// HPP ikut diambil dari sini untuk menghitung profit.
let cacheBarangToko = { waktu: 0, janji: null };
function petaBarangToko() {
  if (cacheBarangToko.janji && Date.now() - cacheBarangToko.waktu < 5 * 60 * 1000) return cacheBarangToko.janji;
  const janji = sbAll("master_toko?select=kode,sku_gudang,hpp")
    .then((rows) => new Map((rows || []).map((r) => [r.kode, { sku_gudang: r.sku_gudang || null, hpp: num(r.hpp) }])))
    .catch(() => {
      cacheBarangToko = { waktu: 0, janji: null }; // jangan simpan kegagalan; laporan tetap tampil dengan kode toko
      return new Map();
    });
  cacheBarangToko = { waktu: Date.now(), janji };
  return janji;
}

// dari/sampai = "YYYY-MM-DD" (hari WIB, inklusif). Role tanpa kasir.lihat_semua hanya melihat miliknya.
// ringan = true: hanya kolom yang dibutuhkan untuk menjumlah omzet per hari (tanpa nama kasir/nomor) — hemat egress
// untuk rentang panjang (mis. setahun di Dashboard).
export async function muatRekapKasir({ session, dari, sampai, denganItem = true, denganBayar = true, denganShift = false, ringan = false }) {
  const { awal, akhir } = batasIso(dari, sampai);
  const kolom = ringan ? [T.id, T.waktu, T.status, T.total, T.totalRetur] : [T.id, T.nomor, T.waktu, T.status, T.total, T.totalRetur, T.kasirId, T.kasirNama, T.shiftId];
  const q = [
    `select=${kolom.join(",")}`,
    `${T.waktu}=gte.${encodeURIComponent(awal)}`,
    `${T.waktu}=lt.${encodeURIComponent(akhir)}`,
    `order=${T.waktu}.asc`,
  ];
  const lihatSemua = bisa(session?.role, "kasir.lihat_semua");
  if (!lihatSemua) q.push(`${T.kasirId}=eq.${encodeURIComponent(String(session?.id ?? ""))}`);
  const transaksi = (await sbAll(`kasir_transaksi?${q.join("&")}`)) || [];
  const ids = transaksi.map((r) => encodeURIComponent(r[T.id]));

  const [items, pembayaran, shift] = await Promise.all([
    denganItem
      ? dalamPotongan(ids, 60, (c) =>
          sbAll(`kasir_item?select=${[I.trxId, I.sku, I.nama, I.qty, "qty_retur", I.harga, I.diskon, "subtotal", "nilai_retur"].join(",")}&${I.trxId}=in.(${c.join(",")})`)
        )
      : [],
    denganBayar
      ? dalamPotongan(ids, 60, (c) => sbAll(`kasir_pembayaran?select=${[B.trxId, B.metode, B.jumlah].join(",")}&${B.trxId}=in.(${c.join(",")})`))
      : [],
    denganShift
      ? sbAll(
          `kasir_shift?select=*&buka_at=gte.${encodeURIComponent(awal)}&buka_at=lt.${encodeURIComponent(akhir)}${
            lihatSemua ? "" : `&kasir_id=eq.${encodeURIComponent(String(session?.id ?? ""))}`
          }`
        )
      : [],
  ]);
  if (items.length) {
    const peta = await petaBarangToko();
    for (const it of items) {
      const b = peta.get(it[I.sku]);
      it.hpp_satuan = b ? b.hpp : 0; // HPP per pcs saat ini (0 = belum diisi / barang tidak ditemukan)
      if (b?.sku_gudang) {
        it.kode_toko = it[I.sku];
        it[I.sku] = b.sku_gudang;
      }
    }
  }
  return { transaksi, items, pembayaran, shift: shift || [] };
}

// ---------- hitungan murni ----------
const barisKosong = () => ({ jumlah: 0, kotor: 0, retur: 0, bersih: 0, voidCount: 0, returCount: 0, qty: 0, cash: 0, cashless: 0, hpp: 0 });

function tambahTrx(a, d) {
  if (d.status === "void") {
    a.voidCount += 1;
    return;
  }
  a.jumlah += 1;
  a.kotor += d.total;
  a.retur += d.retur;
  a.bersih += d.total - d.retur;
  if (d.retur > 0) a.returCount += 1;
}

export function olahRekap({ transaksi = [], items = [], pembayaran = [], shift = [] }) {
  const peta = new Map(); // id transaksi -> { tanggal, kasirId, kasirNama, status, total, retur }
  for (const r of transaksi) {
    peta.set(r[T.id], {
      tanggal: tanggalWib(r[T.waktu]),
      kasirId: String(r[T.kasirId] ?? ""),
      kasirNama: r[T.kasirNama] || "Tanpa nama",
      status: statusTrx(r),
      total: num(r[T.total]),
      retur: num(r[T.totalRetur]),
    });
  }

  const ringkas = barisKosong();
  const harian = new Map();
  const perKasir = new Map();
  const perKasirHarian = new Map();
  const perMetode = {};

  const ambil = (mp, kunci, awal) => {
    let v = mp.get(kunci);
    if (!v) {
      v = { ...barisKosong(), ...awal };
      mp.set(kunci, v);
    }
    return v;
  };

  for (const d of peta.values()) {
    tambahTrx(ringkas, d);
    tambahTrx(ambil(harian, d.tanggal, { tanggal: d.tanggal }), d);
    tambahTrx(ambil(perKasir, d.kasirId, { kasirId: d.kasirId, nama: d.kasirNama, jumlahShift: 0, selisihKas: 0 }), d);
    tambahTrx(ambil(perKasirHarian, `${d.tanggal}|${d.kasirId}`, { tanggal: d.tanggal, kasirId: d.kasirId, nama: d.kasirNama }), d);
  }

  for (const p of pembayaran) {
    const d = peta.get(p[B.trxId]);
    if (!d || d.status === "void") continue;
    const jumlah = num(p[B.jumlah]);
    const j = jenisMetode(p[B.metode]);
    ringkas[j] += jumlah;
    ambil(harian, d.tanggal, { tanggal: d.tanggal })[j] += jumlah;
    ambil(perKasir, d.kasirId, { kasirId: d.kasirId, nama: d.kasirNama, jumlahShift: 0, selisihKas: 0 })[j] += jumlah;
    ambil(perKasirHarian, `${d.tanggal}|${d.kasirId}`, { tanggal: d.tanggal, kasirId: d.kasirId, nama: d.kasirNama })[j] += jumlah;
    perMetode[p[B.metode]] = (perMetode[p[B.metode]] || 0) + jumlah;
  }

  // per produk (total periode & per hari)
  const produk = new Map();
  const produkHarian = new Map();
  const trxProduk = new Set();
  const tambahProduk = (mp, kunci, awal, qty, nilai, diskon, trxId, hppNilai, tanpaHpp) => {
    const v = ambil(mp, kunci, { ...awal, qty: 0, nilai: 0, diskon: 0, jumlahTrx: 0, tanpaHpp: false });
    v.qty += qty;
    v.nilai += nilai;
    v.diskon += diskon;
    v.hpp += hppNilai;
    if (tanpaHpp) v.tanpaHpp = true;
    const k = `${kunci}|${trxId}`;
    if (!trxProduk.has(`${mp === produk ? "t" : "h"}${k}`)) {
      trxProduk.add(`${mp === produk ? "t" : "h"}${k}`);
      v.jumlahTrx += 1;
    }
  };
  for (const it of items) {
    const d = peta.get(it[I.trxId]);
    if (!d || d.status === "void") continue;
    const qty = num(it[I.qty]) - num(it.qty_retur);
    if (qty <= 0) continue;
    const nilai = num(it.subtotal) - num(it.nilai_retur);
    // diskon item dikurangi sebanding qty yang diretur
    const diskon = num(it[I.qty]) > 0 ? Math.round((num(it[I.diskon]) * qty) / num(it[I.qty])) : 0;
    const kunci = it[I.sku] || it[I.nama] || "-";
    const awal = { sku: it[I.sku] || "", kode: it.kode_toko || "", nama: it[I.nama] || it[I.sku] || "-" };
    const hppSatuan = num(it.hpp_satuan);
    const hppNilai = Math.round(hppSatuan * qty);
    const tanpaHpp = hppSatuan <= 0;
    tambahProduk(produk, kunci, awal, qty, nilai, diskon, it[I.trxId], hppNilai, tanpaHpp);
    tambahProduk(produkHarian, `${d.tanggal}|${kunci}`, { ...awal, tanggal: d.tanggal }, qty, nilai, diskon, it[I.trxId], hppNilai, tanpaHpp);
    ringkas.qty += qty;
    ringkas.hpp += hppNilai;
    const hr = ambil(harian, d.tanggal, { tanggal: d.tanggal });
    hr.qty += qty;
    hr.hpp += hppNilai;
    const pk = ambil(perKasir, d.kasirId, { kasirId: d.kasirId, nama: d.kasirNama, jumlahShift: 0, selisihKas: 0 });
    pk.qty += qty;
    pk.hpp += hppNilai;
    const pkh = ambil(perKasirHarian, `${d.tanggal}|${d.kasirId}`, { tanggal: d.tanggal, kasirId: d.kasirId, nama: d.kasirNama });
    pkh.qty += qty;
    pkh.hpp += hppNilai;
  }

  // shift -> selisih kas per kasir
  for (const s of shift) {
    const id = String(s.kasir_id ?? "");
    const k = perKasir.get(id);
    if (!k) continue;
    k.jumlahShift += 1;
    if (s.selisih !== null && s.selisih !== undefined) k.selisihKas += num(s.selisih);
  }

  const urutTanggalTurun = (a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0);
  // laba hanya bermakna kalau data barang ikut ditarik (items.length > 0); kalau tidak, null supaya UI menyembunyikannya.
  const punyaItem = items.length > 0;
  const withRata = (r) => ({
    ...r,
    rata2: r.jumlah > 0 ? Math.round(r.bersih / r.jumlah) : 0,
    laba: punyaItem ? r.bersih - r.hpp : null,
    margin: punyaItem && r.bersih > 0 ? ((r.bersih - r.hpp) / r.bersih) * 100 : null,
  });
  // profit per produk = nilai barang (sebelum diskon level transaksi) - HPP
  const withLabaProduk = (r) => ({ ...r, laba: r.nilai - r.hpp, margin: r.nilai > 0 ? ((r.nilai - r.hpp) / r.nilai) * 100 : null });
  const daftarProduk = [...produk.values()].map(withLabaProduk);
  const ringkasan = withRata(ringkas);
  ringkasan.tanpaHpp = daftarProduk.filter((p) => p.tanpaHpp).length; // jumlah SKU terjual yang HPP-nya kosong
  return {
    ringkas: ringkasan,
    perMetode,
    harian: [...harian.values()].map(withRata).sort(urutTanggalTurun),
    perKasir: [...perKasir.values()].map(withRata).sort((a, b) => b.bersih - a.bersih),
    perKasirHarian: [...perKasirHarian.values()].map(withRata).sort((a, b) => urutTanggalTurun(a, b) || b.bersih - a.bersih),
    perProduk: daftarProduk.sort((a, b) => b.nilai - a.nilai),
    perProdukHarian: [...produkHarian.values()].map(withLabaProduk).sort((a, b) => urutTanggalTurun(a, b) || b.nilai - a.nilai),
  };
}

// Barang terlaris: urut berdasarkan jumlah terjual (atau nilai / laba), ambil N teratas.
export function barangTerlaris(perProduk, { urut = "qty", batas = 10 } = {}) {
  return [...(perProduk || [])]
    .sort((a, b) =>
      urut === "laba" ? b.laba - a.laba || b.qty - a.qty : urut === "nilai" ? b.nilai - a.nilai || b.qty - a.qty : b.qty - a.qty || b.nilai - a.nilai
    )
    .slice(0, batas);
}

// ---------- sinkron Keuangan ----------
// Penjualan kasir ditulis ke keuangan_transaksi oleh fungsi database saat Bayar (kategori
// OFFLINE CASH / OFFLINE TRANSFER / Offline Qris by BCA), void & retur memakai kategori pengeluaran
// "Retur & Void Penjualan Kasir". Di sini angka kasir dibandingkan dengan baris-baris itu.
const LABEL_MASUK = ["OFFLINE CASH", "OFFLINE TRANSFER", "Offline Qris by BCA"];
const LABEL_KELUAR = "Retur & Void Penjualan Kasir";
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "").trim();

export function hitungSinkronKeuangan({ keuangan = [], master = {}, dari, sampai, bersihKasir }) {
  const kodeMasuk = new Set((master.kategori_masuk || []).filter((k) => LABEL_MASUK.some((l) => norm(l) === norm(k.label))).map((k) => k.kode));
  const kodeKeluar = new Set((master.kategori_keluar || []).filter((k) => norm(k.label) === norm(LABEL_KELUAR)).map((k) => k.kode));
  let masuk = 0;
  let keluar = 0;
  for (const t of keuangan) {
    if (!t.tanggal || t.tanggal < dari || t.tanggal > sampai) continue;
    if (t.tipe === "masuk" && kodeMasuk.has(t.kategori)) masuk += num(t.jumlah);
    else if (t.tipe === "keluar" && kodeKeluar.has(t.kategori)) keluar += num(t.jumlah);
  }
  const bersihKeuangan = masuk - keluar;
  return { masuk, keluar, bersihKeuangan, bersihKasir, selisih: bersihKasir - bersihKeuangan, kategoriMasukAda: kodeMasuk.size > 0 };
}

// ---------- hook & rangkuman untuk Dashboard ----------
// Satu kali tarik per perubahan rentang; hanya jalan kalau `aktif` (tab Toko Offline sedang dibuka).
export function useRekapKasir(opsi, aktif = true) {
  const { session, dari, sampai, denganItem = true, denganBayar = true, denganShift = false, ringan = false, versi = 0 } = opsi;
  const [state, setState] = useState({ memuat: false, error: "", data: null });
  useEffect(() => {
    if (!aktif || !dari || !sampai) return undefined;
    let batal = false;
    setState((s) => ({ ...s, memuat: true, error: "" }));
    muatRekapKasir({ session, dari, sampai, denganItem, denganBayar, denganShift, ringan })
      .then((raw) => !batal && setState({ memuat: false, error: "", data: olahRekap(raw) }))
      .catch((e) => !batal && setState({ memuat: false, error: e?.message || "Gagal memuat data kasir", data: null }));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif, dari, sampai, denganItem, denganBayar, denganShift, ringan, versi, session?.id, session?.role]);
  return state;
}

export function useTanggalMulaiKasir(aktif = true) {
  const [state, setState] = useState({ siap: false, tanggal: null });
  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    muatTanggalMulaiKasir()
      .then((tanggal) => !batal && setState({ siap: true, tanggal }))
      .catch(() => !batal && setState({ siap: true, tanggal: null })); // gagal -> perlakukan "belum ada kasir"
    return () => {
      batal = true;
    };
  }, [aktif, entitasBacaSaatIni()]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export { HARI_WIB, tanggalWib };