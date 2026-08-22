// =========================================================
// KONEKSI SUPABASE (REST / PostgREST — anon key)
// =========================================================
const SUPABASE_URL = "https://mctzwsfnidxvckadqlhq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdHp3c2ZuaWR4dmNrYWRxbGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNTAwNDQsImV4cCI6MjEwMTcyNjA0NH0.0RN1_Kbk4MS_FBR2b9ahZtKIzEaDNR0IzgoeSSdp8eQ";

// Terjemahan kode error Postgres (lewat PostgREST) jadi pesan yang bisa dibaca
// orang biasa, bukan JSON mentah. code 23503 = foreign key violation (data
// masih dipakai/direferensikan di tabel lain), 23505 = unique violation (data
// sudah ada), 23502 = not-null violation (kolom wajib kosong), dst.
function friendlyDbError(parsed, status) {
  const code = parsed?.code;
  if (code === "23503") {
    return "Data ini masih dipakai di bagian lain sistem (mis. sudah ada di transaksi/pesanan), jadi tidak bisa dihapus. Nonaktifkan saja kalau memang tidak mau dipakai lagi.";
  }
  if (code === "23505") {
    return "Data dengan kode/SKU yang sama sudah ada sebelumnya.";
  }
  if (code === "23502") {
    return "Ada isian wajib yang belum diisi. Cek lagi formnya ya.";
  }
  if (code === "22P02") {
    return "Ada isian yang formatnya tidak sesuai (mis. angka diisi huruf).";
  }
  if (status === 401 || status === 403) {
    return "Tidak punya akses untuk melakukan ini. Coba login ulang.";
  }
  if (status >= 500) {
    return "Server sedang bermasalah. Coba lagi sebentar lagi.";
  }
  return null;
}

export async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const friendly = friendlyDbError(parsed, res.status);
    const err = new Error(friendly || parsed?.message || text || `${res.status} ${res.statusText}`);
    // pgCode dipakai di beberapa tempat (mis. hapus SKU) untuk tahu kapan harus
    // fallback ke "nonaktifkan" alih-alih gagal total waktu kena foreign key.
    if (parsed?.code) err.pgCode = parsed.code;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// PostgREST (API Supabase) cuma balikin maksimal 1000 baris per request
// secara default. sbAll() otomatis "nyicil" pakai header Range sampai semua
// baris kebawa, jadi aman dipakai untuk tabel yang datanya bisa > 1000 baris
// (mis. items, sku_master, stock_history, dst). Query builder (select=,
// order=, filter=, dst) tetap ditulis sama seperti biasa lewat sb().
const SB_PAGE_SIZE = 1000;

export async function sbAll(path, opts = {}) {
  let all = [];
  let offset = 0;
  while (true) {
    const from = offset;
    const to = offset + SB_PAGE_SIZE - 1;
    const rows = await sb(path, {
      ...opts,
      headers: {
        Range: `${from}-${to}`,
        ...(opts.headers || {}),
      },
    });
    const batch = rows || [];
    all = all.concat(batch);
    if (batch.length < SB_PAGE_SIZE) break; // baris didapat < page size -> udah abis
    offset += SB_PAGE_SIZE;
  }
  return all;
}

// Nama bucket Storage di Supabase untuk menyimpan foto verifikasi.
// Pastikan bucket ini sudah dibuat (public, dengan policy insert untuk anon).
export const STORAGE_BUCKET = "verifikasi-foto";

export async function sbUploadFoto(file, path) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Gagal unggah foto (${res.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

export function calcHarga(hargaAsli, settings) {
  const round = (n) => Math.round(n / settings.round_to) * settings.round_to;

  // Harga asli minimal Rp 7.000.
  const hargaAsliDipakai = Math.max(Number(hargaAsli) || 0, 7000);

  // HPP = Harga Asli + 10%.
  const hpp = hargaAsliDipakai * 1.1;

  // Pengali Harga Tengah tergantung besar HPP.
  let tengahMultiplier;
  if (hpp < 10000) tengahMultiplier = 3;
  else if (hpp < 20000) tengahMultiplier = 2.5;
  else tengahMultiplier = 2;

  const tengah = round(hpp * tengahMultiplier);
  const ecer = round(tengah * 2);
  const grosir = round(hpp * 1.5);

  return { hargaDasar: hargaAsliDipakai, hpp, grosir, tengah, ecer };
}

export const fmtRp = (n) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

// Kode harga untuk label: ambil ribuan tiap harga (000 dibuang), gabung jadi satu string.
// Contoh: grosir 5.000, tengah 10.000, ecer 20.000 -> "5" + "10" + "20" = "51020"
export function priceCode(grosir, tengah, ecer) {
  const part = (n) => String(Math.round((Number(n) || 0) / 1000));
  return `${part(grosir)}${part(tengah)}${part(ecer)}`;
}

export const fmtTgl = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

// Susun ulang string SKU dari field-field pembentuknya — pola ini HARUS
// selalu sama persis dengan yang dipakai waktu SKU pertama kali dibuat
// (lihat SkuEntryForm/ModalRouter "buat-sku").
export function buildSkuCode(f) {
  return `${f.bahan}${f.peruntukan}${f.kategori}-${f.subkategori}-${f.model}-${f.warna}-${f.ukuran}`;
}

// Tabel-tabel lain (selain sku_master) yang menyimpan kode SKU sebagai teks
// bebas (bukan foreign key ber-id) — semuanya perlu ikut di-update kalau ada
// SKU yang berubah kodenya, termasuk data histori (stock_history, rak_events,
// grosir_detail_pesanan) supaya laporan lama tetap nyambung ke SKU yang benar.
const SKU_TEXT_TABLES = ["items", "stock_history", "penempatan", "rak_events", "grosir_detail_pesanan"];

async function renameSkuEverywhere(oldSku, newSku) {
  for (const table of SKU_TEXT_TABLES) {
    await sb(`${table}?sku=eq.${encodeURIComponent(oldSku)}`, {
      method: "PATCH",
      body: JSON.stringify({ sku: newSku }),
    });
  }
}

// Setiap kali harga sebuah SKU diganti (baik lewat "Pilih Harga Asli Baru"
// maupun "Edit Harga" superadmin), barang yang fotonya sudah diambil dan
// sudah lanjut ke tahap Marketplace/Selesai perlu difoto ulang — soalnya
// foto lama biasanya ikut menampilkan harga, jadi begitu harga berubah
// fotonya jadi tidak akurat lagi. Fungsi ini menarik balik semua barang SKU
// itu yang sudah lewat Pemotretan ke tahap Pemotretan lagi (stage
// "verifikasi") dan menandainya `perlu_foto_ulang` supaya kelihatan jelas di
// halaman Pemotretan (badge + ringkasan jumlah). Barang yang memang belum
// pernah difoto (masih di tahap sebelum verifikasi) dibiarkan apa adanya —
// belum ada foto lama yang perlu dikoreksi.
export async function tandaiPerluFotoUlang(sku) {
  await sb(`items?sku=eq.${encodeURIComponent(sku)}&stage=in.(marketplace,selesai)`, {
    method: "PATCH",
    body: JSON.stringify({ stage: "verifikasi", perlu_foto_ulang: true }),
  });
}

// Ganti kode Master Data (mis. kategori "ANJ" -> "ANJB") dan rambatkan
// perubahannya ke semua SKU yang sudah jadi yang masih memakai kode lama itu
// — termasuk string SKU-nya sendiri (karena SKU dibentuk dari gabungan
// kode-kode ini) dan semua tabel lain yang menyimpan SKU sebagai teks
// (Stok, Rak, Riwayat Stok, histori Pesanan Grosir).
//
// Kalau hasil penggantian bikin ada SKU yang jadi kembar (baik sesama SKU
// yang lagi diganti, maupun bentrok dengan SKU lain yang sudah ada), seluruh
// operasi DIBATALKAN dari awal (tidak ada satupun PATCH yang dikirim) dan
// melempar Error — supaya tidak ada data yang kepalang berubah separuh.
export async function renameMasterKode({ masterDataId, tipe, oldKode, newKode, newLabel, skuMaster }) {
  const affected = (skuMaster || []).filter((s) => s[tipe] === oldKode);

  // Peta SKU lama -> SKU baru untuk baris yang kepengaruh oleh perubahan ini.
  const rencana = affected.map((s) => ({
    row: s,
    skuLama: s.sku,
    skuBaru: buildSkuCode({ ...s, [tipe]: newKode }),
  }));

  // Cek tabrakan: (a) dua SKU lama yang berbeda menghasilkan SKU baru yang
  // sama persis, atau (b) SKU baru itu sudah dipakai SKU lain yang TIDAK ikut
  // berubah di rencana ini.
  const skuBaruSet = new Set();
  const skuLamaYangBerubah = new Set(rencana.map((r) => r.skuLama));
  for (const r of rencana) {
    if (skuBaruSet.has(r.skuBaru)) {
      throw new Error(`Gagal ubah kode: dua SKU akan jadi sama persis ("${r.skuBaru}"). Batal, tidak ada yang disimpan.`);
    }
    skuBaruSet.add(r.skuBaru);
  }
  const bentrokDenganLain = (skuMaster || []).find(
    (s) => !skuLamaYangBerubah.has(s.sku) && skuBaruSet.has(s.sku)
  );
  if (bentrokDenganLain) {
    throw new Error(
      `Gagal ubah kode: SKU baru "${bentrokDenganLain.sku}" sudah dipakai SKU lain. Batal, tidak ada yang disimpan.`
    );
  }

  // Aman, lanjut eksekusi — SKU dulu (di semua tabel), master_data terakhir,
  // supaya kalau ada yang gagal di tengah jalan, kode di Master Data belum
  // sempat berubah (masih konsisten dengan SKU yang belum sempat di-rename).
  for (const r of rencana) {
    await renameSkuEverywhere(r.skuLama, r.skuBaru);
    await sb(`sku_master?id=eq.${r.row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [tipe]: newKode, sku: r.skuBaru }),
    });
  }
  await sb(`master_data?id=eq.${masterDataId}`, {
    method: "PATCH",
    body: JSON.stringify({ kode: newKode, label: newLabel }),
  });

  return { jumlahSkuBerubah: rencana.length };
}


export function labelFor(master, tipe, kode) {
  const found = (master[tipe] || []).find((m) => m.kode === kode);
  return found ? found.label : kode || "—";
}

// Dua SKU dianggap "produk yang sama" (boleh berbagi rak) kalau semua atribut
// pembentuknya sama PERSIS kecuali ukuran. Butuh data sku_master untuk
// membandingkan field-nya (kode SKU sendiri sudah menyertakan ukuran di dalamnya).
const FIELD_PEMBANDING = ["bahan", "peruntukan", "kategori", "subkategori", "model", "warna"];

export function sameProdukKecualiUkuran(skuA, skuB, skuMaster) {
  if (!skuA || !skuB) return false;
  if (skuA === skuB) return true;
  const a = (skuMaster || []).find((s) => s.sku === skuA);
  const b = (skuMaster || []).find((s) => s.sku === skuB);
  if (!a || !b) return false;
  return FIELD_PEMBANDING.every((f) => (a[f] || "") === (b[f] || ""));
}

// =========================================================
// GROSIR — helper umum
// =========================================================
// Bikin kode urut berikutnya dari sebuah daftar, mis. "PLG-0001", "PLG-0002".
// list: array of object, field: nama kolom kode, prefix: mis. "PLG-".
export function nextKode(list, field, prefix) {
  let max = 0;
  (list || []).forEach((item) => {
    const kode = item[field];
    if (typeof kode === "string" && kode.startsWith(prefix)) {
      const num = parseInt(kode.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(4, "0");
}

// Tanggal hari ini format ddMMyyyy (dipakai untuk prefix nomor pesanan grosir harian).
export function todayDDMMYYYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
}

// Samakan format no. WA supaya "0812...", "62812...", "+62812...", atau yang
// pakai spasi/strip/kurung semuanya dianggap nomor yang sama saat dibandingkan.
// Contoh: "0812-3456-7890" dan "+62 812 3456 7890" -> sama-sama "8123456789...".
export function normalisasiWa(wa) {
  const digit = (wa || "").replace(/\D/g, "");
  if (digit.startsWith("62")) return digit.slice(2);
  if (digit.startsWith("0")) return digit.slice(1);
  return digit;
}

// Cari pelanggan grosir lain yang sudah pakai no. WA yang sama (dibandingkan
// dalam bentuk yang sudah dinormalisasi). exceptId dipakai saat edit supaya
// pelanggan itu sendiri tidak dianggap "bentrok" dengan WA-nya sendiri.
export function pelangganDenganWa(wa, pelangganList, exceptId) {
  const target = normalisasiWa(wa);
  if (!target) return null;
  return (pelangganList || []).find(
    (p) => p.id !== exceptId && p.wa && normalisasiWa(p.wa) === target
  ) || null;
}

// =========================================================
// GROSIR — CICILAN HUTANG & DEPOSIT PELANGGAN
// (helper hitung dinamis, sama pola dengan sistem grosir lama:
//  sisa hutang & saldo deposit TIDAK disimpan sebagai angka statis,
//  selalu dihitung ulang dari riwayat grosir_pembayaran / grosir_deposit
//  supaya tidak pernah "basi" / tidak sinkron.)
// =========================================================

// Total yang sudah dibayar untuk satu pesanan (dari grosir_pembayaran).
export function totalDibayarPesanan(pesananId, pembayaranList) {
  return (pembayaranList || [])
    .filter((b) => b.pesanan_id === pesananId)
    .reduce((a, b) => a + (Number(b.jumlah) || 0), 0);
}

// Sisa hutang satu pesanan = Total - TotalDibayar (minimal 0).
export function sisaHutangPesanan(pesanan, pembayaranList) {
  const dibayar = totalDibayarPesanan(pesanan.id, pembayaranList);
  return Math.max(0, (Number(pesanan.total) || 0) - dibayar);
}

// Status bayar otomatis (dipakai lagi setelah tiap pembayaran dicatat):
//  Belum Bayar -> belum ada pembayaran sama sekali
//  Sebagian    -> sudah dibayar sebagian, masih ada sisa
//  Lunas       -> sisa <= 0
// Status "Pesanan Masuk" (Barang Datang) diturunkan dari jumlah_diterima vs
// jumlah_pesan — bukan disimpan manual oleh user, supaya selalu konsisten.
// dibatalkan (kolom terpisah) menang atas hitungan angka.
export function statusPesananMasuk(p) {
  if (p.dibatalkan) return "batal";
  if ((p.jumlah_diterima || 0) <= 0) return "menunggu";
  if (p.jumlah_diterima < p.jumlah_pesan) return "sebagian";
  return "selesai";
}

// Rincian per-model sebuah pesanan masuk — [{ nama, jumlah, harga, datang }].
// Satu model cuma punya SATU angka qty (bukan qty-dipesan & qty-diterima
// terpisah) — statusnya cukup boolean "datang" (sudah/belum), karena tiap
// model dikonfirmasi datang sekaligus penuh sesuai qty pesanannya, satu-satu
// per model (lihat KonfirmasiDatangForm), bukan dicicil per angka.
// Pesanan lama (sebelum fitur rincian per-model, atau dari format lama yang
// masih pakai angka "diterima") tetap didukung — "datang" diturunkan dari
// diterima >= jumlah kalau field "datang"-nya sendiri belum ada.
export function detailModelPesanan(p) {
  const raw =
    Array.isArray(p.detail_model) && p.detail_model.length > 0
      ? p.detail_model
      : [{ nama: null, jumlah: p.jumlah_pesan || 0, harga: 0, diterima: p.jumlah_diterima || 0 }];
  return raw.map((m) => ({
    ...m,
    datang:
      typeof m.datang === "boolean"
        ? m.datang
        : (Number(m.jumlah) || 0) > 0 && (Number(m.diterima) || 0) >= (Number(m.jumlah) || 0),
  }));
}

export function hitungStatusBayar(total, totalDibayar) {
  if (totalDibayar <= 0.0001) return "Belum Bayar";
  if (totalDibayar >= total - 0.0001) return "Lunas";
  return "Sebagian";
}

// Saldo deposit satu pelanggan = akumulasi seluruh baris grosir_deposit miliknya.
export function saldoDepositPelanggan(pelangganId, depositList) {
  return (depositList || [])
    .filter((d) => d.pelanggan_id === pelangganId)
    .reduce((a, d) => a + (Number(d.jumlah) || 0), 0);
}

// Peta {pelangganId: totalSisaHutang} lintas semua pesanan aktif (bukan Batal) milik tiap pelanggan.
export function totalHutangPerPelanggan(pesananList, pembayaranList) {
  const map = {};
  (pesananList || []).forEach((p) => {
    if (p.status === "Batal") return;
    const sisa = sisaHutangPesanan(p, pembayaranList);
    if (sisa <= 0.0001) return;
    map[p.pelanggan_id] = (map[p.pelanggan_id] || 0) + sisa;
  });
  return map;
}

// Peta {pelangganId: saldoDeposit} untuk semua pelanggan yang punya saldo deposit
// positif — artinya TOKO yang berhutang ke pelanggan itu (kelebihan bayar/titipan
// yang belum dipakai), kebalikan dari totalHutangPerPelanggan di atas.
export function totalDepositPerPelanggan(depositList) {
  const map = {};
  (depositList || []).forEach((d) => {
    map[d.pelanggan_id] = (map[d.pelanggan_id] || 0) + (Number(d.jumlah) || 0);
  });
  Object.keys(map).forEach((id) => {
    if (map[id] <= 0.0001) delete map[id];
  });
  return map;
}

// =========================================================
// GROSIR — LAPORAN HARIAN / BULANAN / TAHUNAN
// Pola sama seperti helper Laporan Keuangan di bawah: dihitung dinamis dari
// grosir_pesanan (bukan disimpan sbg angka statis) supaya selalu akurat.
// Pesanan berstatus "Batal" TIDAK pernah dihitung ke omset manapun.
// =========================================================

// Ringkasan omset & jumlah pesanan grosir, opsional difilter ke rentang
// tanggal [dari, sampai] (format "YYYY-MM-DD", inklusif di kedua ujung).
// dari/sampai kosong ("" atau null/undefined) = tidak dibatasi ke arah itu.
export function ringkasanGrosir(pesananGrosir, dari, sampai) {
  const list = (pesananGrosir || []).filter((p) => {
    if (p.status === "Batal") return false;
    if (dari && p.tanggal < dari) return false;
    if (sampai && p.tanggal > sampai) return false;
    return true;
  });
  const omset = list.reduce((a, p) => a + (Number(p.total) || 0), 0);
  const jumlahPesanan = list.length;
  return { omset, jumlahPesanan, rataRata: jumlahPesanan > 0 ? omset / jumlahPesanan : 0, list };
}

// Kelompokkan omset & jumlah pesanan grosir per hari, atau per minggu kalau
// rentang datanya cukup panjang (>31 hari) — pola & fungsi bantu (awalMingguIso
// dkk) sama persis dengan arusKasPerPeriode() di bawah supaya grafiknya konsisten.
export function omsetGrosirPerPeriode(pesananList) {
  const list = (pesananList || []).filter((p) => p.status !== "Batal" && p.tanggal);
  if (list.length === 0) return { mode: "harian", data: [] };

  const tanggalUrut = list.map((p) => p.tanggal).sort();
  const rentangHari =
    Math.round(
      (new Date(`${tanggalUrut[tanggalUrut.length - 1]}T00:00:00`) - new Date(`${tanggalUrut[0]}T00:00:00`)) /
        86400000
    ) + 1;
  const mode = rentangHari > 31 ? "mingguan" : "harian";

  const map = new Map();
  list.forEach((p) => {
    const key = mode === "harian" ? p.tanggal : awalMingguIso(p.tanggal);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: mode === "harian" ? labelHarianIso(key) : labelMingguanIso(key),
        omset: 0,
        jumlahPesanan: 0,
      });
    }
    const g = map.get(key);
    g.omset += Number(p.total) || 0;
    g.jumlahPesanan += 1;
  });

  const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { mode, data };
}

// Rekap omset & jumlah pesanan per bulan untuk satu tahun (analog dengan
// laporanBulananData di Keuangan, tapi grosir tidak dikelompokkan per
// kategori — cuma dua baris: Omset & Jumlah Pesanan per bulan + Total).
export function laporanBulananGrosir(pesananGrosir, tahun) {
  const tahunStr = String(tahun);
  const list = (pesananGrosir || []).filter(
    (p) => p.status !== "Batal" && (p.tanggal || "").slice(0, 4) === tahunStr
  );
  const omsetBulan = Array(12).fill(0);
  const jumlahBulan = Array(12).fill(0);
  list.forEach((p) => {
    const idx = Number((p.tanggal || "").slice(5, 7)) - 1;
    if (idx >= 0 && idx < 12) {
      omsetBulan[idx] += Number(p.total) || 0;
      jumlahBulan[idx] += 1;
    }
  });
  return {
    tahun: Number(tahun),
    omset: { bulan: omsetBulan, total: omsetBulan.reduce((a, v) => a + v, 0) },
    jumlahPesanan: { bulan: jumlahBulan, total: jumlahBulan.reduce((a, v) => a + v, 0) },
  };
}

// Rekap omset & jumlah pesanan per tahun, untuk `jumlahTahun` tahun berurutan
// mulai dari tahunMulai (analog rekapTahunanData di Keuangan).
export function rekapTahunanGrosir(pesananGrosir, tahunMulai, jumlahTahun = 6) {
  const tahunList = Array.from({ length: jumlahTahun }, (_, i) => Number(tahunMulai) + i);
  const perTahun = tahunList.map((tahun) => {
    const { omset, jumlahPesanan } = ringkasanGrosir(pesananGrosir, `${tahun}-01-01`, `${tahun}-12-31`);
    return { tahun, omset, jumlahPesanan, rataRata: jumlahPesanan > 0 ? omset / jumlahPesanan : 0 };
  });
  return { tahunList, perTahun };
}

// =========================================================
// KEUANGAN — pencatatan kas masuk/keluar/transfer antar rekening
// =========================================================
// Kategori pemasukan & pengeluaran TIDAK lagi hardcode di sini — sekarang
// didaftarkan sendiri oleh user lewat halaman Keuangan > Rekening & Kategori,
// disimpan di tabel master_data dengan tipe "kategori_masuk" / "kategori_keluar"
// (pola yang sama seperti master_data tipe "bahan"/"warna"/dst untuk SKU).
// Begitu juga daftar rekening, disimpan dengan tipe "rekening".
// Lihat src/pages/Keuangan.jsx (RekeningKategori) untuk halaman kelolanya.

// Ringkasan total masuk/keluar/saldo dari daftar transaksi keuangan, opsional
// difilter ke rentang tanggal [dari, sampai] (format "YYYY-MM-DD", inklusif
// di kedua ujung). dari/sampai kosong ("" atau null/undefined) = tidak
// dibatasi ke arah itu. Dipakai bareng oleh halaman Keuangan & Laporan supaya
// angkanya selalu konsisten.
//
// Transaksi tipe "transfer" (pindah dana antar rekening milik sendiri)
// SENGAJA tidak dihitung ke masuk/keluar/saldo di sini — itu bukan
// pemasukan/pengeluaran riil, cuma mutasi antar rekening. Dampaknya ke saldo
// per rekening dihitung terpisah lewat saldoPerRekening() di bawah.
export function ringkasanKeuangan(transaksi, dari, sampai) {
  const list = (transaksi || []).filter((t) => {
    if (dari && t.tanggal < dari) return false;
    if (sampai && t.tanggal > sampai) return false;
    return true;
  });
  const masuk = list
    .filter((t) => t.tipe === "masuk")
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  const keluar = list
    .filter((t) => t.tipe === "keluar")
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  return { masuk, keluar, saldo: masuk - keluar, list };
}

// Saldo per rekening, dihitung dari SELURUH transaksi (tidak dibatasi rentang
// tanggal — saldo itu akumulasi dari awal, bukan angka per periode):
//   - masuk   -> saldo rekening (sumber dana) bertambah
//   - keluar  -> saldo rekening (sumber dana) berkurang
//   - transfer -> saldo rekening asal berkurang, saldo rekening tujuan bertambah
// rekeningList = daftar master_data tipe "rekening" ({ kode, label }[]), dipakai
// supaya rekening yang belum pernah ada transaksinya tetap muncul dengan saldo 0.
export function saldoPerRekening(transaksi, rekeningList) {
  const map = {};
  (rekeningList || []).forEach((r) => {
    map[r.kode] = { kode: r.kode, label: r.label, saldo: 0 };
  });
  const ensure = (kode) => {
    if (!kode) return null;
    if (!map[kode]) map[kode] = { kode, label: kode, saldo: 0 };
    return map[kode];
  };
  (transaksi || []).forEach((t) => {
    const jumlah = Number(t.jumlah) || 0;
    if (t.tipe === "masuk") {
      const r = ensure(t.rekening);
      if (r) r.saldo += jumlah;
    } else if (t.tipe === "keluar") {
      const r = ensure(t.rekening);
      if (r) r.saldo -= jumlah;
    } else if (t.tipe === "transfer") {
      const asal = ensure(t.rekening);
      const tujuan = ensure(t.rekening_tujuan);
      if (asal) asal.saldo -= jumlah;
      if (tujuan) tujuan.saldo += jumlah;
    }
  });
  return Object.values(map);
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Awal minggu (Senin) dari sebuah tanggal ISO "YYYY-MM-DD", dikembalikan sebagai
// string ISO juga — dipakai sebagai kunci pengelompokan mode mingguan.
function awalMingguIso(tanggalIso) {
  const d = new Date(`${tanggalIso}T00:00:00`);
  const offsetKeSenin = (d.getDay() + 6) % 7; // Minggu(0) -> 6, Senin(1) -> 0, dst.
  d.setDate(d.getDate() - offsetKeSenin);
  return d.toISOString().slice(0, 10);
}

function labelHarianIso(tanggalIso) {
  const d = new Date(`${tanggalIso}T00:00:00`);
  return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}`;
}

function labelMingguanIso(seninIso) {
  const senin = new Date(`${seninIso}T00:00:00`);
  const minggu = new Date(senin);
  minggu.setDate(senin.getDate() + 6);
  const fmt = (x) => `${x.getDate()} ${BULAN_PENDEK[x.getMonth()]}`;
  return `${fmt(senin)}–${fmt(minggu)}`;
}

// Kelompokkan transaksi (kas masuk vs kas keluar) per hari, atau per minggu kalau
// rentang tanggalnya cukup panjang (>31 hari) supaya grafiknya tidak terlalu padat.
// Transfer antar rekening tidak dihitung (sama seperti ringkasanKeuangan()).
// Mengembalikan { mode: "harian"|"mingguan", data: [{ key, label, masuk, keluar }] }
// terurut dari tanggal paling lama ke paling baru.
export function arusKasPerPeriode(transaksi) {
  const list = (transaksi || []).filter((t) => t.tipe === "masuk" || t.tipe === "keluar");
  if (list.length === 0) return { mode: "harian", data: [] };

  const tanggalUrut = list.map((t) => t.tanggal).sort();
  const rentangHari =
    Math.round(
      (new Date(`${tanggalUrut[tanggalUrut.length - 1]}T00:00:00`) - new Date(`${tanggalUrut[0]}T00:00:00`)) /
        86400000
    ) + 1;
  const mode = rentangHari > 31 ? "mingguan" : "harian";

  const map = new Map();
  list.forEach((t) => {
    const key = mode === "harian" ? t.tanggal : awalMingguIso(t.tanggal);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: mode === "harian" ? labelHarianIso(key) : labelMingguanIso(key),
        masuk: 0,
        keluar: 0,
      });
    }
    const g = map.get(key);
    const jumlah = Number(t.jumlah) || 0;
    if (t.tipe === "masuk") g.masuk += jumlah;
    else g.keluar += jumlah;
  });

  const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { mode, data };
}

// Breakdown pengeluaran per kategori dari daftar transaksi (biasanya hasil
// ringkasanKeuangan(), sudah difilter rentang tanggal): total tiap kategori
// beserta persentasenya terhadap total pengeluaran, terurut dari yang terbesar.
// kategoriList = master_data tipe "kategori_keluar" ({ kode, label }[]), dipakai
// untuk menerjemahkan kode kategori ke nama yang enak dibaca.
export function breakdownPengeluaranKategori(transaksi, kategoriList) {
  const pengeluaran = (transaksi || []).filter((t) => t.tipe === "keluar");
  const total = pengeluaran.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  const map = new Map();
  pengeluaran.forEach((t) => {
    const kode = t.kategori || "";
    const found = (kategoriList || []).find((k) => k.kode === kode);
    const label = found ? found.label : kode || "Tanpa Kategori";
    if (!map.has(kode || "__tanpa__")) {
      map.set(kode || "__tanpa__", { kode, label, jumlah: 0 });
    }
    map.get(kode || "__tanpa__").jumlah += Number(t.jumlah) || 0;
  });

  const data = Array.from(map.values())
    .map((d) => ({ ...d, persen: total > 0 ? (d.jumlah / total) * 100 : 0 }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return { total, data };
}

// Breakdown pemasukan per kategori — pasangan dari breakdownPengeluaranKategori
// di atas, tapi untuk transaksi tipe "masuk". kategoriList = master_data tipe
// "kategori_masuk". Dipakai oleh Laporan Laba Rugi di bawah.
export function breakdownPemasukanKategori(transaksi, kategoriList) {
  const pemasukan = (transaksi || []).filter((t) => t.tipe === "masuk");
  const total = pemasukan.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  const map = new Map();
  pemasukan.forEach((t) => {
    const kode = t.kategori || "";
    const found = (kategoriList || []).find((k) => k.kode === kode);
    const label = found ? found.label : kode || "Tanpa Kategori";
    if (!map.has(kode || "__tanpa__")) {
      map.set(kode || "__tanpa__", { kode, label, jumlah: 0 });
    }
    map.get(kode || "__tanpa__").jumlah += Number(t.jumlah) || 0;
  });

  const data = Array.from(map.values())
    .map((d) => ({ ...d, persen: total > 0 ? (d.jumlah / total) * 100 : 0 }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return { total, data };
}

// Laporan Laba Rugi (Income Statement) untuk satu rentang tanggal: rincian
// tiap kategori Pendapatan & Beban (pakai breakdown di atas) + total masing-
// masing, Laba (Rugi) Bersih, dan margin laba bersih (%). dari/sampai kosong
// = tidak dibatasi ke arah itu (sama pola dengan ringkasanKeuangan()).
// Dipakai bareng oleh Laporan Keuangan & Dashboard Keuangan.
export function laporanLabaRugi(transaksi, kategoriMasukList, kategoriKeluarList, dari, sampai) {
  const { list } = ringkasanKeuangan(transaksi, dari, sampai);
  const pendapatan = breakdownPemasukanKategori(list, kategoriMasukList);
  const beban = breakdownPengeluaranKategori(list, kategoriKeluarList);
  const labaRugi = pendapatan.total - beban.total;
  const marginPersen = pendapatan.total > 0 ? (labaRugi / pendapatan.total) * 100 : 0;
  return { pendapatan, beban, labaRugi, marginPersen };
}

// Susun data "Laporan Bulanan" untuk satu tahun: tiap kategori pemasukan &
// pengeluaran jadi satu baris dengan 12 kolom bulan + Total, mirip format
// Laporan Bulanan di Excel (SELMA_FINANCE.xlsx). Kategori yang tidak pernah
// dipakai tahun itu tetap muncul (nilai 0) supaya strukturnya konsisten;
// kategori yang dipakai tapi belum terdaftar di master ikut ditambahkan di
// akhir daftar (fallback label = kode transaksinya).
// Dipakai bareng oleh preview di halaman Laporan Keuangan & PDF-nya.
export function laporanBulananData(transaksi, kategoriMasukList, kategoriKeluarList, tahun) {
  const tahunStr = String(tahun);
  const list = (transaksi || []).filter((t) => (t.tanggal || "").slice(0, 4) === tahunStr);

  const susunBaris = (tipe, kategoriList) => {
    const map = new Map();
    (kategoriList || []).forEach((k) => map.set(k.kode, { kode: k.kode, label: k.label, bulan: Array(12).fill(0) }));
    list
      .filter((t) => t.tipe === tipe)
      .forEach((t) => {
        const kode = t.kategori || "";
        if (!map.has(kode)) {
          const found = (kategoriList || []).find((k) => k.kode === kode);
          map.set(kode, { kode, label: found ? found.label : kode || "Tanpa Kategori", bulan: Array(12).fill(0) });
        }
        const bulanIdx = Number((t.tanggal || "").slice(5, 7)) - 1;
        if (bulanIdx >= 0 && bulanIdx < 12) {
          map.get(kode).bulan[bulanIdx] += Number(t.jumlah) || 0;
        }
      });
    return Array.from(map.values()).map((r) => ({ ...r, total: r.bulan.reduce((a, v) => a + v, 0) }));
  };

  const jumlahPerBulan = (baris) => {
    const bulan = Array(12).fill(0);
    baris.forEach((r) => r.bulan.forEach((v, i) => (bulan[i] += v)));
    return { bulan, total: bulan.reduce((a, v) => a + v, 0) };
  };

  const pendapatan = susunBaris("masuk", kategoriMasukList);
  const pengeluaran = susunBaris("keluar", kategoriKeluarList);
  const totalPendapatan = jumlahPerBulan(pendapatan);
  const totalPengeluaran = jumlahPerBulan(pengeluaran);
  const labaRugi = {
    bulan: totalPendapatan.bulan.map((v, i) => v - totalPengeluaran.bulan[i]),
    total: totalPendapatan.total - totalPengeluaran.total,
  };

  return { tahun: Number(tahun), pendapatan, pengeluaran, totalPendapatan, totalPengeluaran, labaRugi };
}

// Susun data "Rekap Tahunan": total pendapatan/pengeluaran/laba-rugi per
// tahun, untuk `jumlahTahun` tahun berurutan mulai dari tahunMulai. Mirip
// sheet REKAP TAHUNAN di Excel (SELMA_FINANCE.xlsx).
export function rekapTahunanData(transaksi, tahunMulai, jumlahTahun = 6) {
  const tahunList = Array.from({ length: jumlahTahun }, (_, i) => Number(tahunMulai) + i);
  const perTahun = tahunList.map((tahun) => {
    const { masuk, keluar } = ringkasanKeuangan(transaksi, `${tahun}-01-01`, `${tahun}-12-31`);
    const laba = masuk - keluar;
    return { tahun, pendapatan: masuk, pengeluaran: keluar, laba, marginPersen: masuk > 0 ? (laba / masuk) * 100 : 0 };
  });
  return { tahunList, perTahun };
}

// =========================================================
// columns: [{ key, label }] — key dipakai untuk ambil nilai dari tiap baris (row[key]),
// label dipakai sebagai judul kolom. rows: array of object (mis. items, sku_master, dll).
export function downloadCsv(filename, columns, rows) {
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = (rows || []).map((row) => columns.map((c) => escape(row[c.key])).join(","));
  // Tambah BOM (\uFEFF) supaya Excel langsung baca sebagai UTF-8, bukan cuma teks polos.
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================================================
// PENGELOMPOKAN PER KATEGORI -> SUBKATEGORI
// Dipakai di Master Barang dan PDF Katalog supaya
// urutan & label grup selalu konsisten di ketiga tempat.
// Struktur hasil: [{ kategori, groups: [{ subkategori, items }] }]
// - Item tanpa kategori/subkategori masuk grup "Tanpa Kategori" /
//   "Tanpa Subkategori", selalu ditaruh paling akhir.
// =========================================================
export const TANPA_KATEGORI = "Tanpa Kategori";
export const TANPA_SUBKATEGORI = "Tanpa Subkategori";

export function groupByKategori(list) {
  const byKategori = new Map();
  for (const item of list) {
    const kategori = item.kategori?.trim() || TANPA_KATEGORI;
    const subkategori = item.subkategori?.trim() || TANPA_SUBKATEGORI;
    if (!byKategori.has(kategori)) byKategori.set(kategori, new Map());
    const bySub = byKategori.get(kategori);
    if (!bySub.has(subkategori)) bySub.set(subkategori, []);
    bySub.get(subkategori).push(item);
  }

  const sortKeys = (keys) =>
    keys.sort((a, b) => {
      if (a === TANPA_KATEGORI || a === TANPA_SUBKATEGORI) return 1;
      if (b === TANPA_KATEGORI || b === TANPA_SUBKATEGORI) return -1;
      return a.localeCompare(b, "id");
    });

  return sortKeys(Array.from(byKategori.keys())).map((kategori) => {
    const bySub = byKategori.get(kategori);
    const groups = sortKeys(Array.from(bySub.keys())).map((subkategori) => ({
      subkategori,
      items: bySub.get(subkategori),
    }));
    return { kategori, groups };
  });
}

// =========================================================
// DOWNLOAD FOTO PRODUK
// Nama file = kode SKU. Kalau cuma 1 foto -> download langsung.
// Kalau lebih dari 1 -> semuanya dibungkus jadi satu file ZIP
// (pakai JSZip, dimuat lazy lewat dynamic import).
// =========================================================
function extFromUrl(url) {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url || "");
  return match ? match[1].toLowerCase() : "jpg";
}

function safeFileName(name) {
  return (name || "foto").replace(/[^a-zA-Z0-9-_]/g, "-");
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// fotos: [{ sku, url }] — url yang kosong/null otomatis dilewati.
// opts.onProgress(done, total): dipanggil selagi tiap foto diunduh.
export async function downloadFotos(fotos, opts = {}) {
  const { onProgress } = opts;
  const list = (fotos || []).filter((f) => f.url);
  if (list.length === 0) return;

  if (list.length === 1) {
    const { sku, url } = list[0];
    const res = await fetch(url);
    const blob = await res.blob();
    onProgress?.(1, 1);
    triggerBlobDownload(blob, `${safeFileName(sku)}.${extFromUrl(url)}`);
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const namaDipakai = new Map(); // hindari nama file bentrok kalau ada SKU yang sama

  let done = 0;
  for (const { sku, url } of list) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const base = safeFileName(sku);
      const ext = extFromUrl(url);
      const n = (namaDipakai.get(base) || 0) + 1;
      namaDipakai.set(base, n);
      zip.file(n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}`, blob);
    } catch (e) {
      console.error("Gagal ambil foto untuk", sku, e);
    }
    done += 1;
    onProgress?.(done, list.length);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(zipBlob, `foto-produk-${new Date().toISOString().slice(0, 10)}.zip`);
}