import { sb, sbAll, SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";

// =========================================================
// ABSENSI — migrasi dari sistem lama (Google Apps Script).
// Beda dengan login SELMA (app_users): karyawan absen pakai akun sendiri
// (tabel `karyawan`, ID + password terpisah), bukan akun admin SELMA.
// Rekap harian/bulanan TIDAK disimpan sebagai sheet statis seperti sistem
// lama — selalu dihitung ulang dari data mentah `absensi` (sama pola dengan
// ringkasanKeuangan / arusKasPerPeriode di lib/api.js), supaya tidak pernah
// "basi" kalau ada absen yang dikoreksi/dihapus.
// =========================================================

const SESSION_KEY = "selma_absen_session";

// ---- Hash password (pola sama seperti auth.js: SHA-256 hex) ----
export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- Sesi login karyawan (sessionStorage, terpisah dari sesi admin SELMA) ----
export function getAbsenSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAbsenSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function logoutKaryawan() {
  sessionStorage.removeItem(SESSION_KEY);
}

// KHUSUS login, verifikasi password TIDAK lagi dilakukan di sini — sudah
// dipindah ke Edge Function verify-login-karyawan supaya password_hash
// tidak pernah terkirim ke browser (lihat
// supabase/functions/verify-login-karyawan).
export async function loginKaryawan(idKaryawan, password) {
  const id = (idKaryawan || "").trim();
  if (!id || !password) throw new Error("ID dan Password wajib diisi.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-login-karyawan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ id_karyawan: id, password }),
  });
  const user = await res.json().catch(() => null);
  if (!res.ok || !user) throw new Error(user?.error || "Gagal login");

  const session = { id: user.id, id_karyawan: user.id_karyawan, nama: user.nama };
  setAbsenSession(session);
  return session;
}

// Verifikasi password lama + simpan password baru dilakukan di Edge Function
// change-password-karyawan (service_role), password_hash tidak pernah lewat
// anon key.
export async function gantiPasswordKaryawan(karyawanId, passwordLama, passwordBaru) {
  if (!passwordLama || !passwordBaru) throw new Error("Password lama dan password baru wajib diisi.");
  if (String(passwordBaru).trim().length < 4) throw new Error("Password baru minimal 4 karakter.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-password-karyawan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ karyawanId, oldPassword: passwordLama, newPassword: passwordBaru }),
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.ok) throw new Error(result?.error || "Gagal mengganti password");
}

// ---- Kelola data karyawan (dipakai di halaman Absensi, khusus superadmin/owner) ----
export async function listKaryawan() {
  return sbAll("karyawan?select=*&order=nama");
}

export async function tambahKaryawan({ id_karyawan, nama, password }) {
  const password_hash = await sha256Hex(password);
  return sb("karyawan", {
    method: "POST",
    body: JSON.stringify({ id_karyawan: (id_karyawan || "").trim(), nama, password_hash }),
  });
}

export async function resetPasswordKaryawan(id, newPassword) {
  const password_hash = await sha256Hex(newPassword);
  return sb(`karyawan?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash }),
  });
}

export async function setAktifKaryawan(id, aktif) {
  return sb(`karyawan?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ aktif }),
  });
}

// Ubah nama karyawan — khusus superadmin & owner (ditegakkan di halaman UI).
// Nama juga diselaraskan ke semua baris riwayat `absensi` milik karyawan itu
// (kolom `nama` di sana disalin/denormalisasi saat absen, bukan JOIN ke tabel
// karyawan), supaya rekap & unduhan CSV lama tidak tetap menampilkan nama usang.
export async function updateNamaKaryawan(id, namaBaru) {
  const nama = (namaBaru || "").trim();
  if (!nama) throw new Error("Nama tidak boleh kosong.");

  await sb(`karyawan?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nama }),
  });

  const rows = await sb(`karyawan?id=eq.${id}&select=id_karyawan`);
  const idKaryawan = (rows || [])[0]?.id_karyawan;
  if (idKaryawan) {
    await sb(`absensi?id_karyawan=eq.${encodeURIComponent(idKaryawan)}`, {
      method: "PATCH",
      body: JSON.stringify({ nama }),
    });
  }
}

// Hapus karyawan sekaligus SELURUH riwayat absennya (tabel `absensi`, dicocokkan
// lewat karyawan_id). Riwayat dihapus dulu sebelum baris karyawan-nya, supaya
// tidak ada data absensi "yatim" yang nyangkut nunjuk ke karyawan yang sudah
// tidak ada.
export async function hapusKaryawan(id) {
  await sb(`absensi?karyawan_id=eq.${id}`, { method: "DELETE" });
  return sb(`karyawan?id=eq.${id}`, { method: "DELETE" });
}

// ---- Pengaturan absensi (lokasi kantor, radius, jam standar) ----
export async function getAbsensiSettings() {
  const rows = await sb("absensi_settings?select=*&id=eq.1");
  return (rows || [])[0] || null;
}

export async function updateAbsensiSettings(patch) {
  return sb("absensi_settings?id=eq.1", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ---- Hitung jarak (meter) antara dua koordinat, rumus Haversine ----
export function hitungJarakMeter(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jamKeMenit(jamStr) {
  const [h, m] = String(jamStr).split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function hitungTelatMenit(jamAktualHHMM, jamMasukStandar, toleransiMenit) {
  const selisih = jamKeMenit(jamAktualHHMM) - jamKeMenit(jamMasukStandar) - toleransiMenit;
  return selisih > 0 ? selisih : 0;
}

function hitungLemburJam(jamAktualHHMM, jamPulangStandar, minLemburMenit) {
  const selisihMenit = jamKeMenit(jamAktualHHMM) - jamKeMenit(jamPulangStandar);
  if (selisihMenit >= minLemburMenit) return parseFloat((selisihMenit / 60).toFixed(2));
  return 0;
}

// ---- Daftar Shift ----
// Jam masuk & pulang standar sekarang bisa beda-beda per shift (mis. Shift
// Pagi 08:00-16:00, Shift Siang 10:00-18:00, Shift Malam 13:00-21:00) —
// bukan 1 jam standar tunggal untuk semua karyawan seperti sebelumnya.
// Daftar shift disimpan di absensi_settings.shift_list (kolom jsonb, array
// {nama, jam_masuk, jam_pulang}). Kalau kolom itu belum ada/masih kosong
// (mis. baru upgrade dari versi lama), fallback ke SATU shift "Standar" yang
// dibentuk dari kolom lama jam_masuk_standar/jam_pulang_standar, supaya
// sistem tetap jalan normal sebelum admin sempat menambah shift baru.
export function daftarShift(settings) {
  if (Array.isArray(settings?.shift_list) && settings.shift_list.length > 0) {
    return settings.shift_list;
  }
  return [
    {
      nama: "Standar",
      jam_masuk: settings?.jam_masuk_standar || "08:00",
      jam_pulang: settings?.jam_pulang_standar || "17:00",
    },
  ];
}

// ---- Submit absen (Masuk/Pulang) — dipanggil dari halaman check-in publik ----
// Menolak kalau di luar radius kantor (sama seperti sistem lama). "shift"
// ({nama, jam_masuk, jam_pulang}) dipilih sendiri oleh karyawan di form absen
// (lihat AbsenKaryawan.jsx) — telat/lembur dihitung terhadap jam shift itu,
// BUKAN lagi terhadap 1 jam standar tunggal untuk semua orang.
export async function submitAbsen({ karyawan, tipe, lat, lng, settings, shift }) {
  const jarak = hitungJarakMeter(settings.office_lat, settings.office_lng, lat, lng);
  if (jarak > settings.radius_meter) {
    const err = new Error(
      `Absen ditolak. Anda berada ${Math.round(jarak)} meter dari kantor (maksimal ${settings.radius_meter} meter). Mendekatlah ke area kantor lalu coba lagi.`
    );
    err.ditolakLokasi = true;
    err.jarak = Math.round(jarak);
    throw err;
  }

  const shiftDipakai = shift || daftarShift(settings)[0];

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const jamHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const jam = `${jamHHMM}:${pad(now.getSeconds())}`;

  let telatMenit = 0;
  let lemburJam = 0;
  let keterangan = tipe === "Masuk" ? "Tepat Waktu" : "Normal";

  if (tipe === "Masuk") {
    telatMenit = hitungTelatMenit(jamHHMM, shiftDipakai.jam_masuk, settings.toleransi_telat_menit);
    keterangan = telatMenit > 0 ? `Telat ${telatMenit} menit` : "Tepat Waktu";
  } else {
    lemburJam = hitungLemburJam(jamHHMM, shiftDipakai.jam_pulang, settings.min_lembur_menit);
    keterangan = lemburJam > 0 ? `Lembur ${lemburJam} jam` : "Normal";
  }

  await sb("absensi", {
    method: "POST",
    body: JSON.stringify({
      karyawan_id: karyawan.id,
      nama: karyawan.nama,
      id_karyawan: karyawan.id_karyawan,
      tipe,
      tanggal,
      jam,
      latitude: lat,
      longitude: lng,
      jarak_meter: Math.round(jarak),
      telat_menit: telatMenit,
      lembur_jam: lemburJam,
      keterangan,
      shift: shiftDipakai.nama || null,
    }),
  });

  return {
    jarak: Math.round(jarak),
    jam: jam.slice(0, 5),
    tanggal,
    telatMenit,
    lemburJam,
    keterangan,
    shift: shiftDipakai.nama || null,
  };
}

export async function listAbsensi() {
  return sbAll("absensi?select=*&order=tanggal.desc,jam.desc");
}

// Hapus satu baris rekap harian (= hapus SEMUA baris mentah `absensi` milik
// karyawan itu pada tanggal itu, baik tipe Masuk maupun Pulang). Karena rekap
// bulanan & mingguan selalu dihitung ulang dari tabel `absensi` (bukan tabel
// terpisah), penghapusan ini otomatis berpengaruh ke rekap bulanan & mingguan
// juga — tidak perlu sinkronisasi manual di tempat lain.
export async function hapusAbsensiHarian(idKaryawan, tanggal) {
  return sb(
    `absensi?id_karyawan=eq.${encodeURIComponent(idKaryawan)}&tanggal=eq.${encodeURIComponent(tanggal)}`,
    { method: "DELETE" }
  );
}

// ---- Absensi manual (Sakit/Izin/Libur) — khusus superadmin & owner. ----
// Dipakai kalau ada karyawan yang tidak absen (lupa / memang tidak masuk)
// tapi ternyata izin atau sakit, supaya rekap tidak menampilkan "Tidak
// Absen" begitu saja. Disimpan sebagai SATU baris di tabel `absensi` dengan
// tipe "Sakit"/"Izin"/"Libur" (bukan Masuk/Pulang). Baris asli (kalau ada, mis. mau
// mengoreksi absen asli jadi izin) dihapus dulu supaya tidak dobel dan rekap
// harian/mingguan/bulanan tetap konsisten karena semua dihitung ulang dari
// tabel ini.
// CATATAN: kolom jam/latitude/longitude/jarak_meter sengaja diisi nilai 0 /
// "00:00:00" (bukan null) — kolom-kolom itu selalu terisi oleh submitAbsen()
// jadi kemungkinan besar NOT NULL di tabel Supabase-nya. Tidak dibaca ulang
// di rekap manapun untuk baris bertipe Sakit/Izin/Libur, jadi aman dipakai
// sebagai nilai pengganti (placeholder).
export async function simpanAbsensiManual({ karyawanId, idKaryawan, nama, tanggal, tipe, keterangan }) {
  if (!["Sakit", "Izin", "Libur"].includes(tipe)) throw new Error("Status wajib Sakit, Izin, atau Libur.");
  if (!idKaryawan || !tanggal) throw new Error("Karyawan dan tanggal wajib diisi.");

  await hapusAbsensiHarian(idKaryawan, tanggal);
  return sb("absensi", {
    method: "POST",
    body: JSON.stringify({
      karyawan_id: karyawanId,
      nama,
      id_karyawan: idKaryawan,
      tipe,
      tanggal,
      jam: "00:00:00",
      latitude: 0,
      longitude: 0,
      jarak_meter: 0,
      telat_menit: 0,
      lembur_jam: 0,
      keterangan: (keterangan || "").trim() || tipe,
    }),
  });
}

// Koreksi jam Masuk/Pulang pada baris absen ASLI yang sudah ada — khusus role
// "superappa" (ditegakkan di halaman UI, lihat ROLE_BOLEH_EDIT_JAM di
// pages/Absensi.jsx). Beda dari simpanAbsensiManual di atas (yang MENIMPA
// baris jadi tipe Sakit/Izin/Libur): fungsi ini dipakai kalau baris Masuk
// atau Pulang-nya sendiri sudah benar ADA tapi jamnya keliru (mis. karyawan
// lupa tap tepat waktu padahal sebenarnya datang tepat waktu, atau salah
// input). Hanya kolom `jam` yang ditimpa, lalu telat_menit/lembur_jam
// dihitung ulang terhadap shift yang SUDAH tercatat di baris itu sendiri
// (kolom `shift`), supaya rekap harian/mingguan/bulanan (yang selalu dihitung
// ulang dari tabel ini) tetap akurat setelah dikoreksi.
export async function updateJamAbsensi({ idKaryawan, tanggal, tipe, jamBaru }) {
  if (!["Masuk", "Pulang"].includes(tipe)) throw new Error("Tipe harus Masuk atau Pulang.");
  if (!idKaryawan || !tanggal || !jamBaru) throw new Error("Data tidak lengkap.");

  const rows = await sb(
    `absensi?id_karyawan=eq.${encodeURIComponent(idKaryawan)}&tanggal=eq.${encodeURIComponent(tanggal)}&tipe=eq.${tipe}`
  );
  const row = (rows || [])[0];
  if (!row) {
    throw new Error(`Belum ada absen ${tipe} untuk dikoreksi pada tanggal ini.`);
  }

  const settings = await getAbsensiSettings();
  const shiftList = daftarShift(settings);
  const shiftDipakai = shiftList.find((s) => s.nama === row.shift) || shiftList[0];

  const jamHHMM = String(jamBaru).slice(0, 5);
  const patch = { jam: `${jamHHMM}:00` };
  if (tipe === "Masuk") {
    patch.telat_menit = hitungTelatMenit(jamHHMM, shiftDipakai.jam_masuk, settings?.toleransi_telat_menit || 0);
  } else {
    patch.lembur_jam = hitungLemburJam(jamHHMM, shiftDipakai.jam_pulang, settings?.min_lembur_menit || 0);
  }

  return sb(`absensi?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

// =========================================================
// REKAP — dihitung dinamis dari data mentah `absensi` (bukan tabel terpisah).
// =========================================================

// Rekap harian: satu baris per (karyawan, tanggal), gabungan pasangan Masuk/Pulang.
export function rekapHarianAbsensi(absensiRows) {
  const map = new Map();
  (absensiRows || []).forEach((r) => {
    const key = `${r.id_karyawan}|${r.tanggal}`;
    if (!map.has(key)) {
      map.set(key, {
        tanggal: r.tanggal,
        nama: r.nama,
        idKaryawan: r.id_karyawan,
        masuk: "",
        pulang: "",
        telatMenit: 0,
        lemburJam: 0,
        manual: null, // "Sakit" | "Izin" | "Libur" — ditandai manual oleh admin, bukan absen asli
        keteranganManual: "",
      });
    }
    const v = map.get(key);
    if (r.tipe === "Masuk") {
      v.masuk = String(r.jam).slice(0, 5);
      v.telatMenit = r.telat_menit || 0;
    } else if (r.tipe === "Pulang") {
      v.pulang = String(r.jam).slice(0, 5);
      v.lemburJam = Number(r.lembur_jam) || 0;
    } else if (r.tipe === "Sakit" || r.tipe === "Izin" || r.tipe === "Libur") {
      v.manual = r.tipe;
      v.keteranganManual = r.keterangan || r.tipe;
    }
  });

  return Array.from(map.values())
    .map((v) => {
      let jamKerja = "";
      if (v.masuk && v.pulang) {
        const d1 = new Date(`1970-01-01T${v.masuk}:00`);
        const d2 = new Date(`1970-01-01T${v.pulang}:00`);
        if (!isNaN(d1) && !isNaN(d2)) jamKerja = ((d2 - d1) / 1000 / 3600).toFixed(2);
      }
      const status = [];
      if (v.manual) {
        status.push(v.manual);
      } else {
        if (v.telatMenit > 0) status.push(`Telat ${v.telatMenit} menit`);
        if (v.lemburJam > 0) status.push(`Lembur ${v.lemburJam} jam`);
        if (!v.masuk) status.push("Tidak Absen Masuk");
        if (!v.pulang) status.push("Tidak Absen Pulang");
      }
      if (status.length === 0) status.push("Normal");
      return { ...v, jamKerja, status: status.join(", ") };
    })
    .sort((a, b) => (b.tanggal + a.nama).localeCompare(a.tanggal + b.nama));
}

// ---- Util minggu (Senin—Minggu) ----
export const NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function keTanggalStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Cari tanggal hari Senin dari minggu yang memuat `tanggalStr` ("YYYY-MM-DD").
export function seninMingguDari(tanggalStr) {
  const d = new Date(`${tanggalStr}T00:00:00`);
  const hari = d.getDay(); // 0=Minggu..6=Sabtu
  const geser = hari === 0 ? -6 : 1 - hari;
  d.setDate(d.getDate() + geser);
  return keTanggalStr(d);
}

// 7 tanggal berurutan (Senin s.d. Minggu) mulai dari `seninStr`.
export function tanggalSeminggu(seninStr) {
  const d = new Date(`${seninStr}T00:00:00`);
  const hasil = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    hasil.push(keTanggalStr(cur));
  }
  return hasil;
}

// Geser tanggal acuan minggu (dipakai tombol minggu sebelumnya/berikutnya).
export function geserTanggal(tanggalStr, hari) {
  const d = new Date(`${tanggalStr}T00:00:00`);
  d.setDate(d.getDate() + hari);
  return keTanggalStr(d);
}

// Rekap mingguan: matriks nama x hari untuk satu minggu (Senin—Minggu) yang
// memuat `tanggalAcuan`. Baris dibangun dari karyawan aktif (supaya karyawan
// yang tidak absen sama sekali tetap tampil) digabung nama yang muncul di
// rekapHarian pada minggu tsb (jaga-jaga karyawan nonaktif yang masih ada
// riwayat absen di minggu itu).
export function rekapMingguanAbsensi(rekapHarian, tanggalAcuan, daftarKaryawan) {
  const senin = seninMingguDari(tanggalAcuan || new Date().toISOString().slice(0, 10));
  const tanggalMinggu = tanggalSeminggu(senin);
  const setTanggal = new Set(tanggalMinggu);

  const perOrang = new Map(); // idKaryawan -> { nama, idKaryawan, hari: {tanggal: rowHarian} }
  (daftarKaryawan || []).forEach((k) => {
    if (k.aktif) perOrang.set(k.id_karyawan, { nama: k.nama, idKaryawan: k.id_karyawan, hari: {} });
  });
  (rekapHarian || []).forEach((r) => {
    if (!setTanggal.has(r.tanggal)) return;
    if (!perOrang.has(r.idKaryawan)) {
      perOrang.set(r.idKaryawan, { nama: r.nama, idKaryawan: r.idKaryawan, hari: {} });
    }
    perOrang.get(r.idKaryawan).hari[r.tanggal] = r;
  });

  const data = Array.from(perOrang.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  return { senin, tanggalMinggu, data };
}

// Rekap bulanan: satu baris per (karyawan, bulan), dari hasil rekapHarianAbsensi().
export function rekapBulananAbsensi(rekapHarian) {
  const map = new Map();
  (rekapHarian || []).forEach((v) => {
    const bulan = v.tanggal.slice(0, 7);
    const key = `${v.idKaryawan}|${bulan}`;
    if (!map.has(key)) {
      map.set(key, {
        bulan,
        nama: v.nama,
        idKaryawan: v.idKaryawan,
        hariMasuk: 0,
        hariTelat: 0,
        hariSakit: 0,
        hariIzin: 0,
        hariLibur: 0,
        totalTelatMenit: 0,
        totalLemburJam: 0,
        totalJamKerja: 0,
      });
    }
    const b = map.get(key);
    if (v.manual === "Sakit") b.hariSakit += 1;
    else if (v.manual === "Izin") b.hariIzin += 1;
    else if (v.manual === "Libur") b.hariLibur += 1;
    else if (v.masuk) b.hariMasuk += 1;
    if (v.telatMenit > 0) {
      b.hariTelat += 1;
      b.totalTelatMenit += v.telatMenit;
    }
    b.totalLemburJam += v.lemburJam || 0;
    b.totalJamKerja += parseFloat(v.jamKerja) || 0;
  });

  return Array.from(map.values())
    .map((b) => ({
      ...b,
      totalLemburJam: Number(b.totalLemburJam.toFixed(2)),
      totalJamKerja: Number(b.totalJamKerja.toFixed(2)),
    }))
    .sort((a, b) => (b.bulan + a.nama).localeCompare(a.bulan + b.nama));
}