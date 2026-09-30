// Encoder Code 128 (subset B) tanpa dependency — dipakai untuk barcode SKU di
// Cetak Label dan dibaca lagi lewat scanner (USB/Bluetooth atau kamera).
//
// Code 128B bisa memuat karakter ASCII 32–126 (huruf besar/kecil, angka, "-",
// spasi, dll), jadi SKU seperti "TDCC-SIM-1-KUN-16" bisa langsung dipakai.
// Tiap simbol = 11 modul (bar/spasi), simbol stop = 13 modul.

const POLA = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
];

const START_B = 104;
const STOP = 106;

// Ubah teks jadi string "1"/"0" per modul (1 = garis hitam, 0 = spasi).
// Mengembalikan "" kalau teks kosong atau ada karakter di luar ASCII 32–126.
export function encodeCode128B(teks) {
  const t = String(teks ?? "");
  if (!t) return "";
  const nilai = [];
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 32 || c > 126) return "";
    nilai.push(c - 32);
  }
  let checksum = START_B;
  nilai.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;
  return [START_B, ...nilai, checksum, STOP].map((k) => POLA[k]).join("");
}

// Cocokkan hasil scan dengan Master Barang: SKU dulu (persis, tidak peduli
// huruf besar/kecil), lalu barcode_supplier sebagai cadangan.
export function cariSkuDariBarcode(daftarSku, kode) {
  const k = String(kode ?? "").trim().toLowerCase();
  if (!k) return null;
  const list = daftarSku || [];
  return (
    list.find((s) => (s.sku || "").toLowerCase() === k) ||
    list.find((s) => (s.barcode_supplier || "").trim().toLowerCase() === k) ||
    null
  );
}
