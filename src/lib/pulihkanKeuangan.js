// =========================================================
// PEMULIHAN TRANSAKSI KEUANGAN YANG TERHAPUS
// Dipakai tab "Riwayat Perubahan" (pages/Keuangan.jsx). Tabel keuangan_audit_log
// menyimpan salinan LENGKAP baris yang dihapus di kolom data_lama, jadi memulihkan
// = memasukkan lagi baris itu ke keuangan_transaksi (dengan id yang sama kalau bisa).
//
// Yang DIPULIHKAN : baris Keuangan-nya saja (tanggal, tipe, rekening, kategori,
//                   jumlah, keterangan, bukti, penanda, dst).
// Yang TIDAK      : tautan ke Marketplace (keuangan_transaksi_id di
//                   marketplace_transaksi) — tautan itu sudah dilepas saat
//                   transaksi dihapus dan tidak dipasang ulang otomatis.
// Pemulihan tercatat lagi di Riwayat Perubahan sebagai "Ditambah" atas nama
// user yang memulihkan (trigger audit di database, tidak perlu kode tambahan).
// =========================================================
import { sb } from "./api";

const TABEL = "keuangan_transaksi";

// Cek id mana saja (dari daftar) yang SAAT INI ada di keuangan_transaksi.
// Dipotong per 40 id supaya URL tidak kepanjangan. Gagal baca = anggap kosong
// (pemulihan tetap mengecek ulang sendiri sebelum menulis).
export async function idTransaksiMasihAda(daftarId = []) {
  const unik = [...new Set(daftarId.filter((x) => x !== null && x !== undefined && x !== "").map(String))];
  const ada = new Set();
  for (let i = 0; i < unik.length; i += 40) {
    const potong = unik.slice(i, i + 40);
    try {
      const rows = await sb(`${TABEL}?select=id&id=in.(${potong.map(encodeURIComponent).join(",")})`);
      (rows || []).forEach((r) => ada.add(String(r.id)));
    } catch {
      /* abaikan: tombol Pulihkan tetap aman karena dicek ulang saat diklik */
    }
  }
  return ada;
}

async function sudahAda(id) {
  if (id === null || id === undefined || id === "") return false;
  try {
    const rows = await sb(`${TABEL}?select=id&id=eq.${encodeURIComponent(String(id))}&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// logRow = satu baris keuangan_audit_log dengan aksi "DELETE".
// Mengembalikan baris yang baru dimasukkan. Melempar Error berpesan ramah kalau gagal.
export async function pulihkanTransaksiKeuangan(logRow) {
  if (!logRow || logRow.aksi !== "DELETE" || !logRow.data_lama || typeof logRow.data_lama !== "object") {
    throw new Error("Catatan ini bukan penghapusan, atau salinan datanya tidak tersimpan, jadi tidak bisa dipulihkan.");
  }

  const asli = { ...logRow.data_lama };
  const id = asli.id ?? logRow.transaksi_id;
  if (asli.id === undefined && id !== undefined && id !== null) asli.id = id;

  if (await sudahAda(id)) {
    throw new Error("Transaksi ini sudah ada lagi di Keuangan (mungkin sudah pernah dipulihkan). Klik Muat ulang.");
  }

  // Percobaan 1: persis seperti semula (id + created_at ikut), supaya jejaknya tetap utuh.
  try {
    const [baru] = await sb(TABEL, { method: "POST", body: JSON.stringify(asli) });
    return baru || asli;
  } catch (e1) {
    // Kalau ternyata barisnya sudah masuk (mis. koneksi putus sesudah tersimpan), anggap berhasil.
    if (await sudahAda(id)) return asli;
    // Izin / sesi bermasalah: percobaan ulang tidak akan membantu.
    if (/izin|sesi login|read-only|hanya bisa melihat/i.test(String(e1?.message || ""))) throw e1;

    // Percobaan 2: biarkan database membuat id baru (kolom id yang tidak bisa diisi manual).
    const { id: _id, created_at: _c, updated_at: _u, ...tanpaId } = asli;
    try {
      const [baru] = await sb(TABEL, { method: "POST", body: JSON.stringify(tanpaId) });
      return baru || tanpaId;
    } catch (e2) {
      throw new Error(`Gagal memulihkan transaksi: ${e2?.message || e1?.message || "kesalahan tidak diketahui"}`);
    }
  }
}
