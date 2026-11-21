// =========================================================
// BARANG ASET — rumus penyusutan & ringkasan (dipakai pages/Aset.jsx, nanti juga Neraca & Laba Rugi)
//
// Metode: GARIS LURUS.
//   susut per bulan = (harga beli - nilai sisa) / (umur pakai dalam bulan)
//   akumulasi susut = susut per bulan x jumlah BULAN PENUH sejak tanggal beli (maksimal sampai habis)
//   nilai buku      = harga beli - akumulasi susut
// Tidak ada angka yang disimpan per bulan: semuanya dihitung dari data aset setiap kali dilihat,
// jadi tidak ada pekerjaan input bulanan dan tidak bisa "lupa" mencatat penyusutan.
//
// Aset yang sudah DIJUAL / HILANG berhenti menyusut di tanggal_lepas dan tidak ikut total aset.
// =========================================================

export const KATEGORI_ASET = {
  peralatan: { label: "Peralatan & Perlengkapan", umurBawaan: 4 },
  kendaraan: { label: "Kendaraan", umurBawaan: 8 },
};

export const STATUS_ASET = {
  aktif: { label: "Aktif", color: "emerald", dimiliki: true },
  rusak: { label: "Rusak", color: "amber", dimiliki: true },
  dijual: { label: "Dijual", color: "slate", dimiliki: false },
  hilang: { label: "Hilang / Dibuang", color: "red", dimiliki: false },
};

export const asetMasihDimiliki = (a) => !!STATUS_ASET[a?.status]?.dimiliki;

// Jumlah bulan PENUH dari tanggal `dari` sampai `sampai` (keduanya "YYYY-MM-DD" atau Date).
// 15 Nov -> 14 Des = 0 bulan, 15 Nov -> 15 Des = 1 bulan.
export function bulanPenuh(dari, sampai) {
  const a = new Date(dari);
  const b = new Date(sampai);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  let n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) n -= 1;
  return Math.max(n, 0);
}

// Hitung penyusutan satu aset pada tanggal acuan (bawaan: hari ini).
// Aset yang sudah dilepas (dijual / hilang) dihitung sampai tanggal_lepas.
export function hitungPenyusutan(aset, acuan = new Date()) {
  const harga = Number(aset?.harga_beli) || 0;
  const sisa = Math.min(Number(aset?.nilai_sisa) || 0, harga);
  const umurBulan = Math.round((Number(aset?.umur_tahun) || 0) * 12);
  const dasar = Math.max(harga - sisa, 0); // bagian yang disusutkan
  const perBulan = umurBulan > 0 ? dasar / umurBulan : 0;

  const lepas = !asetMasihDimiliki(aset) && aset?.tanggal_lepas ? aset.tanggal_lepas : null;
  const sampai = lepas || acuan;
  const bulanBerjalan = aset?.tanggal_beli ? bulanPenuh(aset.tanggal_beli, sampai) : 0;
  const bulanDisusutkan = umurBulan > 0 ? Math.min(bulanBerjalan, umurBulan) : 0;

  // Bulat ke rupiah penuh; pada bulan terakhir ambil sisa persis supaya akumulasi = dasar (tidak selisih pembulatan).
  const akumulasi = bulanDisusutkan >= umurBulan && umurBulan > 0 ? dasar : Math.round(perBulan * bulanDisusutkan);
  return {
    harga,
    nilaiSisa: sisa,
    umurBulan,
    perBulan: Math.round(perBulan),
    bulanBerjalan: bulanDisusutkan,
    sisaBulan: Math.max(umurBulan - bulanDisusutkan, 0),
    akumulasi,
    nilaiBuku: harga - akumulasi,
    habisDisusutkan: umurBulan > 0 && bulanDisusutkan >= umurBulan,
    persen: dasar > 0 ? Math.min(akumulasi / dasar, 1) : 0,
  };
}

// Ringkasan semua aset yang MASIH DIMILIKI (aktif + rusak), total dan per kategori.
// Bentuk per kategori cocok dengan pos Neraca: peralatan / kendaraan (harga perolehan) dan akumulasi susutnya.
export function ringkasAset(daftar, acuan = new Date()) {
  const hasil = {
    jumlah: 0,
    harga: 0,
    akumulasi: 0,
    nilaiBuku: 0,
    perBulan: 0,
    perKategori: Object.fromEntries(Object.keys(KATEGORI_ASET).map((k) => [k, { jumlah: 0, harga: 0, akumulasi: 0, nilaiBuku: 0, perBulan: 0 }])),
  };
  for (const a of daftar || []) {
    if (!asetMasihDimiliki(a)) continue;
    const h = hitungPenyusutan(a, acuan);
    const sisaBerjalan = h.habisDisusutkan ? 0 : h.perBulan; // aset yang sudah habis disusutkan tidak menyusut lagi
    const kat = hasil.perKategori[a.kategori] || (hasil.perKategori[a.kategori] = { jumlah: 0, harga: 0, akumulasi: 0, nilaiBuku: 0, perBulan: 0 });
    for (const t of [hasil, kat]) {
      t.jumlah += 1;
      t.harga += h.harga;
      t.akumulasi += h.akumulasi;
      t.nilaiBuku += h.nilaiBuku;
      t.perBulan += sisaBerjalan;
    }
  }
  return hasil;
}

// Kode aset berikutnya: ASET-0001, ASET-0002, ... (dari kode terbesar yang sudah ada).
export function kodeAsetBerikut(daftar) {
  let maks = 0;
  for (const a of daftar || []) {
    const m = /^ASET-(\d+)$/i.exec(String(a.kode || ""));
    if (m) maks = Math.max(maks, Number(m[1]));
  }
  return `ASET-${String(maks + 1).padStart(4, "0")}`;
}
