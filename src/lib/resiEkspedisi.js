// =========================================================
// SCAN RESI — deteksi ekspedisi dari nomor resi + pembaca daftar resi cancel.
// Dipakai pages/ScanResi.jsx.
//
// PENTING: pola di POLA_EKSPEDISI dibuat dari pola resi yang umum di Indonesia.
// Bentuk resi tiap ekspedisi bisa berbeda tergantung marketplace/layanan, jadi
// kalau ada resi yang salah terbaca / masuk "Lainnya", cukup tambah/ubah baris
// polanya di bawah (urutan penting: yang paling spesifik di atas).
// =========================================================

// Urutan penting: yang paling spesifik di atas. Pola dicocokkan ke resi yang sudah dinormalisasi
// (huruf besar). Sumber format: contoh resi yang dipakai situs pelacak (cek-resi.org, dll) +
// resi asli dari label J&T milik toko ini (JY…); BUKAN dokumentasi resmi ekspedisi.
export const POLA_EKSPEDISI = [
  // --- kurir marketplace ---
  { kode: "SPX", label: "SPX (Shopee Xpress)", pola: /^SPX/ },                       // SPXID + 12 angka
  { kode: "GTL", label: "GTL (GoTo Logistics / Tokopedia)", pola: /^TKGTL/ },        // TKGTL-000002123456
  { kode: "TKP", label: "Kurir Rekomendasi Tokopedia", pola: /^TKP01/ },             // TKP01-GM1FD123
  { kode: "LEX", label: "Lazada Express (LEX)", pola: /^LX[A-Z]{2}-?\d+/ },          // LXAD-2302808969
  // --- kurir nasional ---
  { kode: "NINJA", label: "Ninja Xpress", pola: /^(NLID|NJV|NVID|NINJA)/ },          // NLIDAP1198604122, NJVTT00089949722
  { kode: "IDEXPRESS", label: "ID Express", pola: /^ID[VDES]\d{12}$/ },              // IDD150963332202
  { kode: "SPX", label: "SPX (Shopee Xpress)", pola: /^ID\d{12}$/ },                 // format lama SPX: ID + 12 angka
  { kode: "JX", label: "JX Express", pola: /^JX[A-Z]+\d+/ },                         // JXPOP01675206525
  { kode: "JNT", label: "J&T Express", pola: /^J[A-Z]\d{8,}$/ },                     // JP/JD/JO/JX/JB/JY + 10 angka
  { kode: "JNE", label: "JNE", pola: /^(CGK|TJE|JNAC|JNE|CM\d|TLJ[A-Z])/ },          // TJE1552766682341, JNAC-0005177888
  { kode: "SICEPAT", label: "SiCepat", pola: /^00\d{10}$/ },                         // 12 angka diawali 00
  { kode: "ANTERAJA", label: "AnterAja", pola: /^(1[01]\d{12}|BLIAJS\d+)$/ },        // 14 angka (10/11…), Same Day BLIAJS…
  { kode: "JNE", label: "JNE", pola: /^\d{15,16}$/ },                               // 15–16 angka
  { kode: "POS", label: "Pos Indonesia / EMS", pola: /^(P\d{13}|[A-Z]{2}\d{9}ID)$/ }, // P + 13 angka; EE…ID
  { kode: "LION", label: "Lion Parcel", pola: /^(\d{2}LP\d+|LP\d+|88-\d{2}-\d+)/ },  // 11LP1715223403123
  { kode: "INDOPAKET", label: "Indopaket", pola: /^IP\d{13}$/ },                      // IP2210614091516
  { kode: "WAHANA", label: "Wahana", pola: /^(?=[A-Z0-9]{8}$)(?=.*[A-Z])(?=.*\d)/ },  // LN2U66CX (8 karakter)
  { kode: "SAP", label: "SAP Express", pola: /^[A-Z]{3}\d{13}$/ },                   // TGR1100067556864
  { kode: "INDAH", label: "Indah Logistik Cargo", pola: /^[A-Z]{3}\d[A-Z]{2,3}\d+$/ }, // SGN1CS20303123
];

// Hanya angka tanpa awalan — formatnya sama antar kurir (12 angka dipakai J&T Cargo, TIKI, JET,
// RPX, Rosalia, dst), jadi TIDAK bisa ditebak otomatis. Masuk "Lainnya" lalu dipilih manual
// lewat dropdown di daftar scan.
export const EKSPEDISI_MANUAL = [
  { kode: "JNTCARGO", label: "J&T Cargo" },
  { kode: "TIKI", label: "TIKI" },
  { kode: "JET", label: "JET Express" },
  { kode: "RPX", label: "RPX" },
];

export const EKSPEDISI_LAINNYA = { kode: "LAINNYA", label: "Lainnya (belum dikenali)" };

// Daftar lengkap untuk dropdown (koreksi manual) & urutan tampil rekap.
// (kode yang sama di beberapa pola, mis. SPX/JNE, hanya ditampilkan satu kali)
export const DAFTAR_EKSPEDISI = [
  ...POLA_EKSPEDISI.filter((e, i, a) => a.findIndex((x) => x.kode === e.kode) === i),
  ...EKSPEDISI_MANUAL,
  EKSPEDISI_LAINNYA,
];

export const labelEkspedisi = (kode) => DAFTAR_EKSPEDISI.find((e) => e.kode === kode)?.label || kode;

// Rapikan hasil scan: huruf besar, buang spasi/kutip/karakter kontrol yang
// kadang ikut dikirim scanner. Return "" kalau tidak layak jadi resi.
export function normalisasiResi(raw) {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
    .replace(/["'`\s]/g, "")
    .toUpperCase();
  return /^[A-Z0-9\-_.]{6,40}$/.test(s) ? s : "";
}

// Hasil scan yang jelas BUKAN resi: hanya angka dan kurang dari 10 digit (mis. 11117728 —
// biasanya QR / barcode lain di paket). Resi asli minimal 10 digit angka (SiCepat 12,
// AnterAja 14, JNE 15–16) atau berawalan huruf (JY…, SPXID…, TKGTL…).
export function bukanResi(resi) {
  const r = normalisasiResi(resi);
  return /^\d{1,9}$/.test(r);
}

export function deteksiEkspedisi(resi) {
  const r = normalisasiResi(resi);
  return (POLA_EKSPEDISI.find((e) => e.pola.test(r)) || EKSPEDISI_LAINNYA).kode;
}

// Daftar resi yang ditempel (dipisah baris / koma / titik koma / tab / spasi).
export function parseTeksResi(teks) {
  const unik = new Map();
  let ditolak = 0;
  String(teks || "")
    .split(/[\n\r,;\t ]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t) => {
      const r = normalisasiResi(t);
      if (!r) ditolak += 1;
      else if (!unik.has(r)) unik.set(r, { resi: r, no_pesanan: null, alasan: null });
    });
  return { baris: [...unik.values()], ditolak };
}

const RE_HEADER_RESI = /(no\.?\s*resi|nomor\s*resi|^resi$|tracking|awb|airway)/i;
const RE_HEADER_PESANAN = /(no\.?\s*pesanan|nomor\s*pesanan|order\s*(id|no)|id\s*pesanan)/i;
const RE_HEADER_STATUS = /^(status\s*pesanan|order\s*status|status)$/i;
const RE_HEADER_ALASAN = /(alasan\s*pembatalan|cancel(lation)?\s*reason|alasan)/i;
const RE_STATUS_BATAL = /(batal|cancel|dibatalkan)/i;

// File export marketplace (Shopee / TikTok Shop / Lazada / Tokopedia): .xlsx / .xls / .csv.
// - Kolom resi dicari lewat judul kolom ("No. Resi", "Tracking ID", "Tracking Code", dst).
// - Kalau ada kolom status pesanan, HANYA baris berstatus batal/cancel yang diambil
//   (jadi aman walau yang diupload export semua pesanan). Kalau tidak ada kolom status,
//   semua baris dianggap cancel (file khusus pesanan batal).
// CATATAN: kalau resi di Excel tersimpan sebagai ANGKA, nol di depan (mis. SiCepat
// 000123...) sudah hilang sebelum dibaca — simpan kolom resi sebagai Teks di Excel.
export async function parseFileCancel(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const hasil = new Map();
  let adaKolomResi = false;
  let diabaikanBukanBatal = 0;

  for (const nama of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nama], { header: 1, raw: false, defval: "" });
    const hIdx = aoa.slice(0, 15).findIndex((r) => r.some((c) => RE_HEADER_RESI.test(String(c).trim())));
    if (hIdx < 0) continue;
    adaKolomResi = true;
    const head = aoa[hIdx].map((c) => String(c).trim());
    const iResi = head.findIndex((c) => RE_HEADER_RESI.test(c));
    const iPesanan = head.findIndex((c) => RE_HEADER_PESANAN.test(c));
    const iStatus = head.findIndex((c) => RE_HEADER_STATUS.test(c));
    const iAlasan = head.findIndex((c) => RE_HEADER_ALASAN.test(c));

    for (const row of aoa.slice(hIdx + 1)) {
      const r = normalisasiResi(row[iResi]);
      if (!r) continue;
      if (iStatus >= 0 && !RE_STATUS_BATAL.test(String(row[iStatus]))) {
        diabaikanBukanBatal += 1;
        continue;
      }
      if (!hasil.has(r)) {
        hasil.set(r, {
          resi: r,
          no_pesanan: iPesanan >= 0 ? String(row[iPesanan]).trim() || null : null,
          alasan: iAlasan >= 0 ? String(row[iAlasan]).trim() || null : null,
        });
      }
    }
  }
  if (!adaKolomResi) {
    throw new Error('Kolom resi tidak ditemukan. Pastikan ada kolom berjudul "No. Resi" / "Tracking ID" / "Tracking Code" / "AWB".');
  }
  return { baris: [...hasil.values()], diabaikanBukanBatal };
}