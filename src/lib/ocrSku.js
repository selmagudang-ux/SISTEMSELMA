// Baca otomatis kode SKU dari foto produk — dipakai di "Buat SKU Baru —
// Banyak Sekaligus" (khusus superadmin) supaya admin tidak perlu ketik ulang
// Bahan/Peruntukan/Kategori/Subkategori/Model/Warna/Ukuran/Harga satu-satu,
// karena semua info itu sudah tercetak di foto (lihat template desain SELMA,
// mis. "BAHAN.TEMBAGA PREMIUM WARNA.PERHIASAN", "PANJANG.-/+18CM", dan kode
// "4256112 TDGL-GJR-135" di pojok kanan bawah foto — angka di depan kode SKU
// itu KODE HARGA, lihat decodeKodeHarga di bawah).
//
// Alur: foto -> OCR (tesseract.js, jalan di browser, tidak perlu server) ->
// teks mentah -> di-parse dengan pola regex sesuai template -> kode disamakan
// ke Master Data (bahan/peruntukan/kategori/warna/ukuran) yang sudah ada.
//
// Ini best-effort, bukan tebakan yang selalu 100% benar — hasilnya tetap
// ditaruh di field yang sama seperti pengisian manual (Combobox dll), jadi
// admin tetap bisa koreksi sebelum simpan kalau bacaannya meleset.

// tesseract.js sengaja TIDAK diimpor statis di sini — library ini berat
// (~700KB), dan tanpa dynamic import dia ikut masuk ke bundle awal yang
// wajib didownload semua orang, walau fitur scan-foto ini cuma dipakai
// sesekali. createWorker() di-import di dalam bacaFotoSku saja, jadi cuma
// diambil browser pas tombol scan diklik.

const bersih = (s) => (s || "").replace(/\s+/g, " ").trim();

// Parse teks mentah hasil OCR jadi bagian-bagian yang relevan.
export function parseTeksSku(rawText) {
  const teks = bersih(rawText).toUpperCase();

  // Kode SKU: pola AAAA-BBB-CCC (huruf/angka, minimal 2 tanda strip),
  // biasanya muncul sebagai baris terakhir, kadang didahului nomor referensi
  // internal (mis. "4256112 TDGL-GJR-135" -> yang diambil cuma "TDGL-GJR-135").
  const codeMatch = teks.match(/\b([A-Z0-9]{2,}-[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/);
  const kodeSegments = codeMatch ? codeMatch[1].split("-") : [];

  // Nomor 6-8 digit tepat sebelum kode SKU itu KODE HARGA (lihat
  // decodeKodeHarga), mis. "4256112 TDGL-GJR-135" -> kodeHargaText: "4256112".
  const kodeHargaMatch = teks.match(/\b(\d{6,8})\s+[A-Z0-9]{2,}-[A-Z0-9]+-[A-Z0-9]+/);

  // "BAHAN.TEMBAGA PREMIUM WARNA.PUTIH" -> bahanText: "TEMBAGA PREMIUM"
  const bahanMatch = teks.match(/BAHAN[.:\s]+([A-Z ]+?)(?=\s*WARNA|\s*PANJANG|\s*UKURAN|$)/);
  // -> warnaText: "PUTIH"
  const warnaMatch = teks.match(/WARNA[.:\s]+([A-Z ]+?)(?=\s*PANJANG|\s*UKURAN|\s*BAHAN|$)/);
  // "PANJANG.-/+18CM KELEBIHAN R.-/+3CM" -> kode Ukuran dibentuk sebagai
  // "P18CM" (P + angka + CM), PERSIS format kode Ukuran di Master Data (lihat
  // contoh kode gabungan "TDGL-GJR-216-PER-P18CM") — bukan cuma "18CM" —
  // supaya cocok langsung ke kode, tidak perlu tebak-tebak lewat label.
  const panjangMatch = teks.match(/PANJANG[.:\s]+[^0-9]*([0-9]+)\s*CM/);
  // Fallback kalau template fotonya pakai "UKURAN.XXX" (bukan "PANJANG"),
  // mis. ukuran baju S/M/L — di sini teksnya dipakai apa adanya, dicocokkan
  // ke label seperti biasa (bukan ke kode "P..CM").
  const ukuranAltMatch = !panjangMatch ? teks.match(/UKURAN[.:\s]+([A-Z0-9 ]+)/) : null;

  return {
    raw: rawText,
    kodeSegments, // mis. ["TDGL", "GJR", "135"]
    kodeHargaText: kodeHargaMatch ? kodeHargaMatch[1] : "",
    bahanText: bahanMatch ? bersih(bahanMatch[1]) : "",
    warnaText: warnaMatch ? bersih(warnaMatch[1]) : "",
    ukuranText: panjangMatch ? `P${panjangMatch[1]}CM` : ukuranAltMatch ? bersih(ukuranAltMatch[1]) : "",
  };
}

// Kode harga tercetak di foto (mis. "4256112") BUKAN barcode acak — ini price
// code yang sengaja disamarkan biar harga jual tidak kelihatan jelas di foto,
// tapi tetap bisa dibaca ulang oleh admin sendiri. Aturannya (dikonfirmasi
// user): 2 digit paling depan = Harga Grosir x1000, 2 digit berikutnya =
// Harga Tengah x1000, sisa 2-3 digit di belakang = Harga Ecer x1000.
// Contoh: "4256112" -> "42"=Grosir 42rb, "56"=Tengah 56rb, "112"=Ecer 112rb.
export function decodeKodeHarga(kode) {
  if (!kode) return null;
  const digits = String(kode).replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 8) return null;
  const depan = digits.slice(0, 2);
  const tengah = digits.slice(2, 4);
  const belakang = digits.slice(4);
  if (belakang.length < 2 || belakang.length > 3) return null;
  return {
    grosir: Number(depan) * 1000,
    tengah: Number(tengah) * 1000,
    ecer: Number(belakang) * 1000,
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

// Cocokkan teks bebas hasil OCR (mis. "TEMBAGA PREMIUM", "PUTIH", "P18CM",
// "ROSEGOLD") ke Master Data. Dibandingkan dalam bentuk "dinormalisasi" —
// spasi & tanda baca dibuang, huruf kecil semua — supaya "ROSEGOLD" (dari
// foto, tanpa spasi) tetap cocok ke label Master Data yang ditulis "Rose
// Gold" (pakai spasi); kalau dibandingkan apa adanya keduanya dianggap beda.
// Urutan cek: kode dulu (kasus ukuran "P18CM" dari pola PANJANG, lihat
// parseTeksSku), baru label persis, baru label sebagian. Balikan null kalau
// tidak ada yang cukup mirip (biar tidak salah pasang kode yang jauh beda).
const normalisasi = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function cariKodeDariTeks(teks, list) {
  if (!teks) return null;
  const t = normalisasi(teks);
  if (!t) return null;
  const items = list || [];
  const kodeExact = items.find((m) => t === normalisasi(m.kode));
  if (kodeExact) return kodeExact.kode;
  const exact = items.find((m) => t === normalisasi(m.label));
  if (exact) return exact.kode;
  const partial = items.find((m) => {
    const label = normalisasi(m.label);
    return label && (t.includes(label) || label.includes(t));
  });
  return partial ? partial.kode : null;
}

// Jalankan OCR pada file foto dan langsung parse hasilnya. Worker dibuat lalu
// dimatikan lagi tiap panggilan (dipakainya jarang & satu-satu per foto,
// tidak perlu worker yang hidup terus).
export async function bacaFotoSku(file) {
  const { createWorker } = await import("tesseract.js");
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