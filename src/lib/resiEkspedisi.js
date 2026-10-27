// =========================================================
// SCAN RESI — deteksi ekspedisi dari nomor resi + pembaca daftar resi cancel.
// Dipakai pages/ScanResi.jsx.
//
// PENTING: pola di POLA_EKSPEDISI dibuat dari pola resi yang umum di Indonesia.
// Bentuk resi tiap ekspedisi bisa berbeda tergantung marketplace/layanan, jadi
// kalau ada resi yang salah terbaca / masuk "Lainnya", cukup tambah/ubah baris
// polanya di bawah (urutan penting: yang paling spesifik di atas).
// =========================================================

export const POLA_EKSPEDISI = [
  { kode: "SPX", label: "SPX (Shopee Xpress)", pola: /^SPX/ },
  { kode: "NINJA", label: "Ninja Xpress", pola: /^(NLID|NVID|NINJA)/ },
  { kode: "IDEXPRESS", label: "ID Express", pola: /^IDE/ },
  { kode: "JNT", label: "J&T Express", pola: /^(JP|JT|JD|JX|JO|JB)\d{8,}$/ },
  { kode: "JNE", label: "JNE", pola: /^(CM\d{6,}|JNE|TLJ[A-Z]|\d{16})/ },
  { kode: "SICEPAT", label: "SiCepat", pola: /^00\d{10}$/ },
  { kode: "ANTERAJA", label: "AnterAja", pola: /^(AA\d{8,}|1\d{11,13})$/ },
  { kode: "LION", label: "Lion Parcel", pola: /^(LP|LNP)\d/ },
  { kode: "POS", label: "Pos Indonesia", pola: /^(P\d{12,}|[A-Z]{2}\d{9}ID)$/ },
];

export const EKSPEDISI_LAINNYA = { kode: "LAINNYA", label: "Lainnya (belum dikenali)" };

// Daftar lengkap untuk dropdown (koreksi manual) & urutan tampil rekap.
export const DAFTAR_EKSPEDISI = [...POLA_EKSPEDISI, EKSPEDISI_LAINNYA];

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
