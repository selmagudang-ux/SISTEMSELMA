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

// Satu kali unggah dengan bukti LEBIH dari batas ini otomatis digabung jadi SATU file PDF
// (supaya baris transaksi tidak penuh ikon paperclip). Dipakai unggahBuktiBanyak (pages/AlurKas.jsx).
export const BUKTI_MAKS_TANPA_GABUNG = 3;

// Gabungkan bukti jadi satu PDF, urut sama dengan urutan `bagian`.
//   bagian = [{ jenis: "pdf" | "gambar", buf: ArrayBuffer, tipe?: "image/png" | ... }]
// Gambar ditaruh satu per halaman A4 (diskalakan muat, tetap proporsional, di tengah);
// PDF ikut dengan semua halamannya. Mengembalikan Uint8Array.
export async function gabungBuktiJadiPdf(bagian) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const A4 = [595.28, 841.89];
  const MARGIN = 24;
  for (let i = 0; i < bagian.length; i++) {
    const b = bagian[i];
    try {
      if (b.jenis === "pdf") {
        const src = await PDFDocument.load(b.buf, { ignoreEncryption: true });
        const hal = await out.copyPages(src, src.getPageIndices());
        hal.forEach((h) => out.addPage(h));
      } else {
        const png = /png/i.test(b.tipe || "");
        const img = png ? await out.embedPng(b.buf) : await out.embedJpg(b.buf);
        const page = out.addPage(A4);
        const skala = Math.min((A4[0] - MARGIN * 2) / img.width, (A4[1] - MARGIN * 2) / img.height, 1);
        const w = img.width * skala;
        const h = img.height * skala;
        page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      }
    } catch (e) {
      throw new Error(`Bukti ke-${i + 1} tidak bisa digabung jadi PDF (${e?.message || "format tidak didukung"}). Ganti dengan foto JPG/PNG atau PDF biasa.`);
    }
  }
  return out.save();
}
