// =========================================================
// UNDUH APLIKASI ANDROID SISTEMSELMA (APK)
// Pola sama dengan aplikasi desktop kasir (URL_UNDUH_APP_KASIR di pages/kasir/kasirLaci.js): link ke GitHub Releases
// yang selalu menunjuk rilis TERBARU. Untuk versi baru cukup buat rilis baru di repo itu dan unggah APK dengan
// NAMA FILE YANG SAMA (SISTEMSELMA.apk) — link di bawah tidak perlu diubah dan kode ini tidak perlu di-deploy ulang.
// CATATAN: "latest" hanya satu per repo. Jangan pakai repo yang sama dengan unduhan kasir desktop kecuali kedua
// file ada di rilis yang sama; sebaiknya repo sendiri.
// GANTI <nama-repo> di bawah dengan repo GitHub tempat APK diunggah.
// =========================================================
export const URL_UNDUH_APP_ANDROID =
  "https://github.com/selmagudang-ux/selma-android-download/releases/latest/download/SISTEMSELMA.apk";

// Di dalam aplikasi Android SISTEMSELMA (WebView) ada jembatan window.SelmaAndroid.
export const adalahAppAndroid = () => typeof window !== "undefined" && !!window.SelmaAndroid;

// Tombol unduh hanya perlu tampil di browser Android yang BELUM memakai aplikasinya.
export const perluTawarkanAppAndroid = () =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "") && !adalahAppAndroid();
