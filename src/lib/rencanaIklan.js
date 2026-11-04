// =========================================================
// RENCANA IKLAN (Shopee) — logika murni, tanpa UI/database.
//
// Dasar hitungan (sama dengan evaluasi di PenjualanRincian, hanya arahnya dibalik):
//   margin sebelum iklan (= ACOS impas) = laba sebelum iklan / harga jual, dari baris HPP-lengkap
//   ROAS impas   = 100 / margin          (di bawah ini iklan memakan seluruh laba)
//   ROAS target  = 100 / ACOS target     (ACOS target tidak pernah di atas margin)
//   Proyeksi     : omzet iklan = anggaran x ROAS; laba = omzet iklan x margin - anggaran
// Anggapan: margin penjualan dari iklan sama dengan margin etalase (anggapan yang sama dipakai evaluasi).
// =========================================================

export const SKENARIO = {
  konservatif: { label: "Konservatif", faktor: 0.7 },
  dasar: { label: "Dasar", faktor: 1 },
  optimis: { label: "Optimis", faktor: 1.2 },
};

export const STATUS = {
  layak: { label: "Layak", warna: "emerald", urut: 0 },
  uji: { label: "Uji kecil", warna: "sky", urut: 1 },
  hati2: { label: "Hati-hati", warna: "amber", urut: 2 },
  jangan: { label: "Jangan dulu", warna: "red", urut: 3 },
  tanpa_hpp: { label: "HPP belum ada", warna: "slate", urut: 4 },
};

const bulat = (v, k = 1) => Math.round(v / k) * k;

// ROAS rata-rata seluruh toko dari etalase yang punya riwayat iklan (dipakai sebagai perkiraan kasar etalase tanpa riwayat)
export function roasRataToko(etalase) {
  let biaya = 0, omzet = 0;
  for (const e of etalase) {
    if (e.iklan > 0 && e.perf?.omzetIklan > 0) { biaya += e.iklan; omzet += e.perf.omzetIklan; }
  }
  return biaya > 0 && omzet > 0 ? omzet / biaya : null;
}

// Satu etalase hasil evaluasi (etalaseSemua di PenjualanRincian) -> profil perencanaan
export function profilEtalase(e, { targetAcos, hariRiwayat, roasToko }) {
  const margin = e.acosImpas; // % dari harga jual, null kalau HPP belum ada
  const adaRiwayat = e.iklan > 0 && e.perf?.omzetIklan > 0;
  const roasHist = adaRiwayat ? e.perf.omzetIklan / e.iklan : null;
  const acosTarget = margin != null && margin > 0 ? Math.min(targetAcos, margin) : null;
  const roasImpas = margin != null && margin > 0 ? 100 / margin : null;
  const roasTarget = acosTarget ? 100 / acosTarget : null;
  const hargaSatuan = e.qty > 0 ? e.r.penjualan / e.qty : null;
  const biayaHarian = adaRiwayat && hariRiwayat > 0 ? e.iklan / hariRiwayat : null;
  const cpk = e.perf?.klik > 0 && e.iklan > 0 ? e.iklan / e.perf.klik : null; // biaya per klik

  let status, alasan;
  if (margin == null) { status = "tanpa_hpp"; alasan = "HPP/SKU belum lengkap, margin tidak bisa dihitung. Lengkapi dulu di Master Barang."; }
  else if (margin <= 0) { status = "jangan"; alasan = "Laba sebelum iklan sudah nol atau minus; iklan hanya menambah rugi."; }
  else if (adaRiwayat) {
    if (roasHist < roasImpas) { status = "jangan"; alasan = `Iklan sebelumnya di bawah titik impas (ROAS ${roasHist.toFixed(1)}x, impas ${roasImpas.toFixed(1)}x).`; }
    else if (roasHist < roasTarget) { status = "hati2"; alasan = `Masih untung (ROAS ${roasHist.toFixed(1)}x, impas ${roasImpas.toFixed(1)}x), tapi ACOS ${(100 / roasHist).toFixed(1)}% melewati target ${acosTarget.toFixed(1)}%. Boleh dijalankan kalau target ACOS dinaikkan.`; }
    else { status = "layak"; alasan = `ROAS riwayat ${roasHist.toFixed(1)}x melewati target ${roasTarget.toFixed(1)}x.`; }
  } else if (margin >= targetAcos) { status = "uji"; alasan = "Belum ada riwayat iklan; margin cukup, coba anggaran kecil dulu."; }
  else { status = "jangan"; alasan = `Belum ada riwayat dan margin ${margin.toFixed(1)}% lebih kecil dari target ACOS ${targetAcos}%.`; }

  return {
    kunci: e.kunci, kode: e.kode, nama: e.nama, qty: e.qty, penjualan: e.r.penjualan,
    margin, roasImpas, acosTarget, roasTarget, adaRiwayat, roasHist,
    roasPakai: roasHist ?? roasToko ?? null, // dasar proyeksi; null = tidak bisa diproyeksikan
    perkiraanKasar: !adaRiwayat && roasToko != null,
    hargaSatuan, biayaHarian, cpk, status, alasan,
  };
}

// Proyeksi satu etalase untuk anggaran tertentu (Rp, total selama rencana) di satu skenario
export function proyeksi(p, anggaran, faktor) {
  const a = Number(anggaran) || 0;
  if (!(a > 0) || p.roasPakai == null || p.margin == null) return null;
  const roas = p.roasPakai * faktor;
  const omzet = a * roas;
  const labaKotor = omzet * (p.margin / 100);
  return {
    roas, omzet, laba: labaKotor - a,
    produkTerjual: p.hargaSatuan > 0 ? omzet / p.hargaSatuan : null,
    klik: p.cpk > 0 ? a / p.cpk : null,
  };
}

// Laba bersih per rupiah iklan di skenario dasar (bobot alokasi). > 0 berarti anggaran tambahan masih menguntungkan.
const bobotUntung = (p) => (p.roasPakai != null && p.margin != null ? (p.roasPakai * p.margin) / 100 - 1 : 0);

// Bagi anggaran total ke etalase. Water-filling: bobot = laba bersih per rupiah, tiap etalase dibatasi kapasitas riwayatnya
// (biaya iklan harian x hari x kelipatan), sisa dilempar ke etalase lain. Hasil dibulatkan ke bawah per Rp 1.000.
export function bagiAnggaran(profil, total, hari, { sertakanUji = false, kelipatan = 3, porsiUjiMaks = 0.1 } = {}) {
  const T = Number(total) || 0;
  const hasil = {};
  if (!(T > 0)) return { alokasi: hasil, sisa: 0, kandidat: 0 };
  const calon = [];
  for (const p of profil) {
    const w = bobotUntung(p);
    if (!(w > 0)) continue;
    if (p.status === "layak") calon.push({ p, w, cap: Math.max(p.biayaHarian * hari * kelipatan, 1000) });
    else if (p.status === "uji" && sertakanUji) calon.push({ p, w: w * 0.5, cap: T * porsiUjiMaks });
  }
  for (const c of calon) hasil[c.p.kunci] = 0;
  let sisa = T, aktif = calon.slice();
  while (sisa > 0.5 && aktif.length) {
    const sw = aktif.reduce((s, c) => s + c.w, 0);
    const penuh = aktif.filter((c) => (sisa * c.w) / sw >= c.cap - hasil[c.p.kunci]);
    if (!penuh.length) { for (const c of aktif) hasil[c.p.kunci] += (sisa * c.w) / sw; sisa = 0; break; }
    for (const c of penuh) { const ruang = c.cap - hasil[c.p.kunci]; hasil[c.p.kunci] += ruang; sisa -= ruang; }
    aktif = aktif.filter((c) => !penuh.includes(c));
  }
  let dibagi = 0;
  for (const k of Object.keys(hasil)) { hasil[k] = Math.floor(hasil[k] / 1000) * 1000; dibagi += hasil[k]; }
  return { alokasi: hasil, sisa: Math.max(0, T - dibagi), kandidat: calon.length };
}

// Gabungan proyeksi banyak etalase (alokasi: {kunci: anggaran})
export function ringkasRencana(profil, alokasi, faktor) {
  let anggaran = 0, omzet = 0, laba = 0, tanpaProyeksi = 0;
  for (const p of profil) {
    const a = Number(alokasi[p.kunci]) || 0;
    if (!(a > 0)) continue;
    anggaran += a;
    const pr = proyeksi(p, a, faktor);
    if (!pr) { tanpaProyeksi += a; continue; }
    omzet += pr.omzet; laba += pr.laba;
  }
  return { anggaran, omzet, laba, tanpaProyeksi, roas: anggaran - tanpaProyeksi > 0 ? omzet / (anggaran - tanpaProyeksi) : null };
}

// Rencana tersimpan vs realisasi. Realisasi hanya dari laporan iklan yang periodenya MASUK PENUH di periode rencana
// (laporan iklan hanya punya total per periode, jadi tidak bisa dipotong akurat).
export function bandingkanRealisasi(isi, iklanRows, dari, sampai) {
  const dalam = (iklanRows || []).filter((x) => x.periode_dari >= dari && x.periode_sampai <= sampai);
  const per = new Map();
  for (const x of dalam) {
    if (!x.kode_produk) continue;
    if (!per.has(x.kode_produk)) per.set(x.kode_produk, { biaya: 0, omzet: 0 });
    const v = per.get(x.kode_produk);
    v.biaya += Number(x.biaya) || 0; v.omzet += Number(x.omzet) || 0;
  }
  let rencanaA = 0, realA = 0, realOmzet = 0, realLaba = 0, rencanaLaba = 0, rencanaOmzet = 0;
  const baris = (isi || []).map((it) => {
    const r = it.kode ? per.get(it.kode) : null;
    const realLabaE = r && it.margin != null ? r.omzet * (it.margin / 100) - r.biaya : null;
    rencanaA += it.anggaran || 0; rencanaOmzet += it.omzet || 0; rencanaLaba += it.laba || 0;
    if (r) { realA += r.biaya; realOmzet += r.omzet; if (realLabaE != null) realLaba += realLabaE; }
    return { ...it, real: r ? { biaya: r.biaya, omzet: r.omzet, roas: r.biaya > 0 ? r.omzet / r.biaya : null, laba: realLabaE } : null };
  });
  return { baris, adaRealisasi: dalam.length > 0, rencanaA, rencanaOmzet, rencanaLaba, realA, realOmzet, realLaba };
}

export const bulatkan = bulat;
