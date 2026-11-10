// KODE TERIMA transfer antar entitas — 6 karakter (A-Z, 0-9) yang dihitung dari id + kode transfer.
// Kode ini HANYA dicetak di surat jalan (dan jadi barcode-nya), TIDAK ditampilkan di aplikasi,
// jadi penerima baru bisa mengonfirmasi penerimaan kalau surat jalannya benar-benar ada di tangan.
// File ini sengaja kecil & terpisah dari PdfTransfer.js supaya jsPDF tidak ikut ke bundle awal.
export function kodeTerima(t) {
  const s = `${t?.id ?? ""}|${t?.kode ?? ""}|SELMA-TRF`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}
