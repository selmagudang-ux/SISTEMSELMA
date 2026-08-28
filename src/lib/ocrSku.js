// Baca otomatis kode SKU dari foto produk — dipakai di "Buat SKU Baru —
// Banyak Sekaligus" (khusus superadmin) supaya admin tidak perlu ketik ulang
// Bahan/Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran satu-satu, karena
// semua info itu sudah tercetak di foto (lihat template desain SELMA, mis.
// "BAHAN.TEMBAGA PREMIUM WARNA.PUTIH", "PANJANG.-/+17CM", dan kode
// "214284 TDGL-GJR-130" di pojok kanan bawah foto).
//
// Alur: foto -> OCR (tesseract.js, jalan di browser, tidak perlu server) ->
// teks mentah -> di-parse dengan pola regex sesuai template -> kode disamakan
// ke Master Data (bahan/peruntukan/kategori/warna/ukuran) yang sudah ada.
//
// Ini best-effort, bukan tebakan yang selalu 100% benar — hasilnya tetap
// ditaruh di field yang sama seperti pengisian manual (Combobox dll), jadi
// admin tetap bisa koreksi sebelum simpan kalau bacaannya meleset.

import { createWorker } from "tesseract.js";

const bersih = (s) => (s || "").replace(/\s+/g, " ").trim();

// Parse teks mentah hasil OCR jadi bagian-bagian yang relevan.
export function parseTeksSku(rawText) {
  const teks = bersih(rawText).toUpperCase();

  // Kode SKU: pola AAAA-BBB-CCC (huruf/angka, minimal 2 tanda strip),
  // biasanya muncul sebagai baris terakhir, kadang didahului nomor referensi
  // internal (mis. "214284 TDGL-GJR-130" -> yang diambil cuma "TDGL-GJR-130").
  const codeMatch = teks.match(/\b([A-Z0-9]{2,}-[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/);
  const kodeSegments = codeMatch ? codeMatch[1].split("-") : [];

  // "BAHAN.TEMBAGA PREMIUM WARNA.PUTIH" -> bahanText: "TEMBAGA PREMIUM"
  const bahanMatch = teks.match(/BAHAN[.:\s]+([A-Z ]+?)(?=\s*WARNA|\s*PANJANG|\s*UKURAN|$)/);
  // -> warnaText: "PUTIH"
  const warnaMatch = teks.match(/WARNA[.:\s]+([A-Z ]+?)(?=\s*PANJANG|\s*UKURAN|\s*BAHAN|$)/);
  // "PANJANG.-/+17CM KELEBIHAN R.-/+3CM" -> ukuranText: "17CM"
  const panjangMatch = teks.match(/PANJANG[.:\s]+[^0-9]*([0-9]+\s*CM)/) || teks.match(/UKURAN[.:\s]+([A-Z0-9 ]+)/);

  return {
    raw: rawText,
    kodeSegments, // mis. ["TDGL", "GJR", "130"]
    bahanText: bahanMatch ? bersih(bahanMatch[1]) : "",
    warnaText: warnaMatch ? bersih(warnaMatch[1]) : "",
    ukuranText: panjangMatch ? bersih(panjangMatch[1]) : "",
  };
}

// Segmen pertama kode gabungan adalah bahan+peruntukan+kategori ditempel
// tanpa pemisah (lihat aturan pembentukan SKU di BuatSkuBanyakForm). Supaya
// bisa dipecah balik, dicoba semua kombinasi kode yang SUDAH ada di Master
// Data sampai ketemu yang persis menyusun segmen itu. Kalau kode Bahan/
// Peruntukan/Kategori-nya belum pernah didaftarkan di Master Data, segmen
// ini tidak bisa ditebak (dikembalikan null) — admin isi manual untuk kode
// yang benar-benar baru pertama kali dipakai.
export function pecahSegmenPertama(segmen, master) {
  if (!segmen) return null;
  const bahanList = master?.bahan || [];
  const peruntukanList = master?.peruntukan || [];
  const kategoriList = master?.kategori || [];
  for (const b of bahanList) {
    if (!segmen.startsWith(b.kode)) continue;
    const sisaSetelahBahan = segmen.slice(b.kode.length);
    for (const p of peruntukanList) {
      if (!sisaSetelahBahan.startsWith(p.kode)) continue;
      const sisaSetelahPeruntukan = sisaSetelahBahan.slice(p.kode.length);
      const k = kategoriList.find((x) => x.kode === sisaSetelahPeruntukan);
      if (k) return { bahan: b.kode, peruntukan: p.kode, kategori: k.kode };
    }
  }
  return null;
}

// Cocokkan teks bebas hasil OCR (mis. "TEMBAGA PREMIUM", "PUTIH", "17CM") ke
// kode Master Data yang label-nya paling mirip. Balikan null kalau tidak ada
// yang cukup mirip (biar tidak salah pasang kode yang jauh beda).
export function cariKodeDariTeks(teks, list) {
  if (!teks) return null;
  const t = teks.toLowerCase();
  const items = list || [];
  const exact = items.find((m) => t === m.label.toLowerCase());
  if (exact) return exact.kode;
  const partial = items.find(
    (m) => t.includes(m.label.toLowerCase()) || m.label.toLowerCase().includes(t)
  );
  return partial ? partial.kode : null;
}

// Jalankan OCR pada file foto dan langsung parse hasilnya. Worker dibuat lalu
// dimatikan lagi tiap panggilan (dipakainya jarang & satu-satu per foto,
// tidak perlu worker yang hidup terus).
export async function bacaFotoSku(file) {
  const worker = await createWorker("ind");
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return parseTeksSku(text);
  } finally {
    await worker.terminate();
  }
}