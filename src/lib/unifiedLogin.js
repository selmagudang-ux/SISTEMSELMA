import { login as loginAdmin } from "./auth";
import { loginKaryawan } from "./absensi";

// ---- Login gabungan ----
// Satu form, satu link, buat semua orang (admin/role SELMA & karyawan absen).
// Alurnya: coba dulu sebagai akun SELMA (app_users). Kalau username-nya
// memang tidak terdaftar di sana, baru dicoba sebagai akun karyawan absen
// (tabel `karyawan`, pakai ID Karyawan). Kalau username KETEMU di salah satu
// tabel tapi passwordnya salah, error langsung ditampilkan dari situ (tidak
// lanjut coba tabel satunya) supaya pesan errornya akurat.
export async function unifiedLogin(identifier, password) {
  const id = (identifier || "").trim();
  if (!id || !password) throw new Error("Username/ID dan password wajib diisi");

  try {
    const session = await loginAdmin(id, password);
    return { type: "admin", session };
  } catch (err) {
    if (err.message !== "Username tidak ditemukan") throw err;
  }

  try {
    const session = await loginKaryawan(id, password);
    return { type: "karyawan", session };
  } catch (err) {
    if (err.message === "ID Karyawan tidak ditemukan.") {
      throw new Error("Username/ID tidak ditemukan");
    }
    throw err;
  }
}