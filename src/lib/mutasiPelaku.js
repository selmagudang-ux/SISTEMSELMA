import { getSession } from "./auth";

// =========================================================
// PELAKU PERPINDAHAN BARANG (Master Barang <-> Barang Toko / Barang TikTok).
// Setiap perpindahan dicatat dengan SISI yang menjalankannya:
//   "gudang" = dilakukan dari Master Barang (gudang yang mengirim / menarik barang)
//   "toko"   = dilakukan dari Barang Toko   (toko yang mengambil / mengembalikan barang)
//   "tiktok" = dilakukan dari Barang TikTok (TikTok yang mengambil / mengembalikan barang)
// Fungsi database (toko_mutasi_dari_gudang, dst.) hanya menerima `catatan`, jadi sisi + pelaku dititipkan di awal catatan
// sebagai penanda "[[mp:sisi|username|nama]]". Trigger di sql/2026-11-27_mutasi_pelaku.sql memindahkannya ke kolom
// sisi / pelaku / pelaku_nama dan membersihkan catatan. Kalau SQL itu belum dijalankan, bacaPelaku() tetap bisa membaca
// penanda dari catatan, jadi tampilan tidak rusak.
// =========================================================

const POLA = /^\[\[mp:([^|\]]*)\|([^|\]]*)\|([^\]]*)\]\]\s*/;
const bersih = (v) => String(v ?? "").replace(/[|\[\]]/g, " ").replace(/\s+/g, " ").trim();

// Dipakai saat memanggil fungsi database: hasilnya dikirim sebagai `catatan`.
export function catatanDenganPelaku(sisi, catatan) {
  const ses = getSession();
  const tag = `[[mp:${bersih(sisi)}|${bersih(ses?.username)}|${bersih(ses?.nama)}]]`;
  const isi = String(catatan ?? "").trim();
  return isi ? `${tag} ${isi}` : tag;
}

// Baca satu baris riwayat mutasi -> { sisi, pelaku, pelakuNama, catatan (bersih dari penanda) }.
export function bacaPelaku(m) {
  const mentah = String(m?.catatan ?? "");
  const cocok = mentah.match(POLA);
  const sisi = (m?.sisi || (cocok ? cocok[1] : "") || "").trim();
  const pelaku = (m?.pelaku || (cocok ? cocok[2] : "") || "").trim();
  const pelakuNama = (m?.pelaku_nama || (cocok ? cocok[3] : "") || "").trim();
  return { sisi, pelaku, pelakuNama, catatan: mentah.replace(POLA, "").trim() };
}
