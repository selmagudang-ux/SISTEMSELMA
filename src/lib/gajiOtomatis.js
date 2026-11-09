import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";

// =========================================================
// GAJI OTOMATIS — pemanggil aksi baru di Edge Function gaji-admin:
//   pengaturan_daftar / pengaturan_simpan / hitung_otomatis
// Tarif gaji disimpan di tabel gaji_pengaturan yang terkunci dari anon key, jadi semua
// baca/tulis lewat gaji-admin. Bentuk request sama dengan aksi gaji lainnya:
//   { username, password, aksi, data } — server memverifikasi ulang password di setiap aksi.
// Sengaja dipisah dari api.js (yang sudah sangat besar); logika hitungnya ada di server.
// =========================================================
const SESSION_KEY = "selma_session";
const TIMEOUT_MS = 30000;

function usernameSaatIni() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}").username || "";
  } catch {
    return "";
  }
}

async function panggilGajiAdmin(aksi, passwordAdmin, data = {}) {
  if (!passwordAdmin) throw new Error("Password admin wajib diisi.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/gaji-admin`, {
      method: "POST",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ aksi, username: usernameSaatIni(), password: passwordAdmin, data }),
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Server terlalu lama menjawab. Coba lagi.");
    throw new Error("Gagal terhubung ke server. Periksa koneksi lalu coba lagi.");
  } finally {
    clearTimeout(timer);
  }
  const hasil = await res.json().catch(() => null);
  if (!res.ok || !hasil || hasil.error) {
    throw new Error(hasil?.error || `Permintaan gagal diproses (kode ${res.status}).`);
  }
  return hasil;
}

// Pengaturan gaji semua karyawan satu perusahaan.
// Hasil: [{ karyawan_id, tipe_gaji, tarif, pembagi_hari, premi_jabatan, premi_kehadiran, tarif_lembur }]
export const daftarPengaturanGaji = (passwordAdmin, entitas) =>
  panggilGajiAdmin("pengaturan_daftar", passwordAdmin, { entitas }).then((r) => r.data || []);

// Simpan pengaturan banyak karyawan sekaligus (maks 200 baris).
// baris: [{ karyawan_id, tipe_gaji: "harian"|"bulanan", tarif, pembagi_hari, premi_jabatan, premi_kehadiran, tarif_lembur }]
// Hasil per baris: [{ index, ok, error? }] — sebagian bisa berhasil dan sebagian gagal.
export const simpanPengaturanGaji = (passwordAdmin, baris, entitas) =>
  panggilGajiAdmin("pengaturan_simpan", passwordAdmin, { baris, entitas }).then((r) => r.hasil || []);

// Hitung komponen gaji satu periode dari absensi (server tidak menyimpan apa pun).
// periode: "2026-10" | "2026-10-10" | "2026-10-01_2026-10-15"
// tipeGaji (opsional): "harian" | "bulanan" = hanya hitung karyawan bertipe itu; kosong = semua.
// Hasil: { data: [{ karyawan_id, gaji_pokok, premi_jabatan, premi_kehadiran, bonus, ringkasan, catatan }],
//          dilewati: [{ karyawan_id, alasan }], lainTipe: jumlah karyawan tipe lain yang tidak ikut dihitung }
export const hitungGajiOtomatis = (passwordAdmin, periode, entitas, tipeGaji) =>
  panggilGajiAdmin("hitung_otomatis", passwordAdmin, { periode, entitas, tipe_gaji: tipeGaji || null }).then((r) => ({
    data: r.data || [],
    dilewati: r.dilewati || [],
    lainTipe: r.lain_tipe || 0,
  }));
