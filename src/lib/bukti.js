// Helper bukti transfer (keuangan_transaksi): boleh BANYAK file, berupa foto atau PDF.
// Kolom bukti_urls (jsonb array) menyimpan semua URL; kolom lama bukti_url tetap diisi file PERTAMA
// supaya data lama & kode lain yang membaca bukti_url tetap jalan.
export const BUKTI_ACCEPT = "image/*,application/pdf,.pdf";
export const fileAdalahPdf = (f) => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));
export const urlAdalahPdf = (u) => /\.pdf(\?|#|$)/i.test(String(u || ""));

// Semua URL bukti sebuah transaksi (data lama yang hanya punya bukti_url ikut terbaca).
export function daftarBukti(t) {
  if (!t) return [];
  if (Array.isArray(t.bukti_urls) && t.bukti_urls.length) return t.bukti_urls.filter(Boolean);
  return t.bukti_url ? [t.bukti_url] : [];
}
