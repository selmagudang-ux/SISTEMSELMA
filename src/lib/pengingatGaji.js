// =========================================================
// PENGINGAT GAJIAN
//   • Karyawan harian  : gajian MINGGUAN, setiap Sabtu / Minggu.
//   • Karyawan bulanan : gajian BULANAN, setiap tanggal 23.
//   • Premi jabatan & kehadiran dibayar sebulan sekali, ikut gajian tanggal 23
//     (untuk karyawan harian dan bulanan).
// Semua perhitungan hari memakai WIB (UTC+7), sama dengan kolom absensi.tanggal.
// File ini murni logika (tanpa React) supaya gampang dites.
// =========================================================

export const TANGGAL_GAJIAN_BULANAN = 23;
// Siklus gaji mulai tanggal 24 bulan lalu, berakhir tanggal 23 (hari gajian ikut dihitung).
export const HARI_MULAI_SIKLUS = 24;
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const dua = (n) => String(n).padStart(2, "0");

// Tanggal hari ini di WIB, format "YYYY-MM-DD". `sekarang` bisa diisi untuk tes.
export function hariIniWib(sekarang = Date.now()) {
  return new Date(sekarang + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function tambahHari(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 0 = Minggu ... 6 = Sabtu
export const hariDalamMinggu = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// Siklus gaji bulanan yang BERAKHIR di bulan `bulan` ("2026-11") dengan tanggal mulai `hariMulai`:
// 24 Okt s/d 23 Nov => "2026-10-24_2026-11-23". Sama dengan periodeSiklus() di Penggajian.jsx.
export function periodeSiklus(bulan, hariMulai = HARI_MULAI_SIKLUS) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(bulan || "");
  const h = Number(hariMulai);
  if (!m || !Number.isInteger(h) || h < 2 || h > 28) return "";
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const yAwal = mm === 1 ? y - 1 : y;
  const mAwal = mm === 1 ? 12 : mm - 1;
  return `${yAwal}-${dua(mAwal)}-${dua(h)}_${y}-${dua(mm)}-${dua(h - 1)}`;
}

// Pengingat yang berlaku untuk tanggal `iso`. Hasil: daftar (0, 1, atau 2 item) — bisa dua kalau
// tanggal 23 jatuh di Sabtu/Minggu.
//   kunci : dipakai untuk mengingat "sudah dibayar". Akhir pekan memakai tanggal SABTU-nya, jadi
//           kalau sudah ditandai di hari Sabtu, hari Minggu tidak mengingatkan lagi. Bulanan
//           memakai bulannya.
//   tipe  : "mingguan" | "bulanan" — dipakai Penggajian untuk memilih periode.
export function pengingatUntuk(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return [];
  const hasil = [];
  const hari = hariDalamMinggu(iso);

  if (hari === 6 || hari === 0) {
    const sabtu = hari === 6 ? iso : tambahHari(iso, -1);
    hasil.push({
      tipe: "mingguan",
      kunci: `mingguan:${sabtu}`,
      judul: `Hari ini ${NAMA_HARI[hari]}: waktunya gajian mingguan`,
      detail: "Bayar gaji pokok karyawan harian minggu ini. Premi tidak ikut (dibayar bulanan); lembur sudah dibayar di hari itu.",
      tglGajian: iso,
    });
  }

  const [y, m, d] = iso.split("-").map(Number);
  if (d === TANGGAL_GAJIAN_BULANAN) {
    const bulan = `${y}-${dua(m)}`;
    hasil.push({
      tipe: "bulanan",
      kunci: `bulanan:${bulan}`,
      judul: `Hari ini tanggal ${TANGGAL_GAJIAN_BULANAN}: waktunya gajian bulanan`,
      detail: `Bayar gaji karyawan bulanan, lalu premi jabatan dan premi kehadiran ${NAMA_BULAN[m - 1]} untuk semua karyawan (harian dan bulanan).`,
      bulan,
    });
  }
  return hasil;
}

// Pilihan layar Penggajian untuk satu pengingat (dibaca Penggajian saat dibuka).
export const KUNCI_TIPE_PERIODE = "selma-gaji-tipe-periode";
export const tipePeriodeUntuk = (tipe) => (tipe === "mingguan" ? "mingguan" : "siklus");

// ---- Ingatan "sudah dibayar" (per browser; kenyamanan saja, aman kalau penyimpanan gagal) ----
const KUNCI_SUDAH = "selma-gaji-pengingat-selesai";

function bacaSelesai() {
  try {
    const v = JSON.parse(localStorage.getItem(KUNCI_SUDAH) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const sudahDitandai = (kunci) => bacaSelesai().includes(kunci);

export function tandaiSelesai(kunci) {
  try {
    // Simpan secukupnya saja (24 terakhir) supaya tidak menumpuk selamanya.
    const baru = [...new Set([...bacaSelesai(), kunci])].slice(-24);
    localStorage.setItem(KUNCI_SUDAH, JSON.stringify(baru));
  } catch {
    /* abaikan */
  }
}