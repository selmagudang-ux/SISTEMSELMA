import { sb, entitasSesi } from "../../lib/api";

// =========================================================
// KASIR — KERANJANG TERSIMPAN (lanjutkan di perangkat lain)
// Keranjang aktif tetap hanya ada di perangkat itu (sessionStorage). Tombol "Simpan" menaruh salinannya di
// database (tabel kasir_keranjang_simpan, lihat supabase/migrations/20261112_kasir_keranjang_simpan.sql);
// tombol "Ambil" di perangkat mana pun memuatnya lagi ke keranjang, lalu salinan di database dihapus.
// Tabel ini TIDAK masuk TABEL_PER_PT di api.js, jadi filter & kolom `entitas` diisi di sini.
// =========================================================

const TABEL = "kasir_keranjang_simpan";
const KOLOM = "id,kasir_id,kasir_nama,nama,items,diskon_trx,jumlah_pcs,total_perkiraan,created_at";

// Batas keranjang tersimpan yang ditampilkan (yang terbaru dulu).
const BATAS_DAFTAR = 50;

// sumber ("toko" | "master") ikut disimpan di dalam diskon_trx (kolom json), supaya keranjang dari HP mode Master Barang
// hanya muncul di kasir yang juga mode Master Barang (kode barang kedua mode berbeda). Tanpa perubahan tabel.
export async function simpanKeranjangTersimpan({ session, items, diskonTrx, nama, jumlahPcs, totalPerkiraan, sumber = "toko", pelanggan = null }) {
  const baris = {
    entitas: entitasSesi(),
    kasir_id: String(session?.id ?? ""),
    kasir_nama: session?.nama || session?.username || "",
    nama: (nama || "").trim() || null,
    items,
    // pelanggan ({id,nama,kategori}) ikut disimpan di sini juga (mode Master Barang) supaya kasir yang mengambilnya langsung tahu kategori harganya.
    diskon_trx: { ...(diskonTrx || {}), sumber, ...(pelanggan?.id ? { pelanggan: { id: pelanggan.id, nama: pelanggan.nama, kategori: pelanggan.kategori } } : {}) },
    jumlah_pcs: Math.round(Number(jumlahPcs) || 0),
    total_perkiraan: Math.round(Number(totalPerkiraan) || 0),
  };
  const hasil = await sb(TABEL, { method: "POST", body: JSON.stringify(baris) });
  return Array.isArray(hasil) ? hasil[0] : hasil;
}

// Keranjang tersimpan adalah antrian serah-terima antar petugas (HP -> kasir meja), jadi SEMUA akun kasir di PT ini
// melihat semuanya, tapi hanya yang sumbernya sama dengan mode layar ini (toko / master).
export async function muatKeranjangTersimpan(session, sumber = "toko") {
  const q = [`select=${KOLOM}`, `entitas=eq.${encodeURIComponent(entitasSesi())}`, "order=created_at.desc", `limit=${BATAS_DAFTAR}`];
  const rows = (await sb(`${TABEL}?${q.join("&")}`)) || [];
  return rows.filter((r) => (r.diskon_trx?.sumber || "toko") === sumber);
}

export async function hapusKeranjangTersimpan(id) {
  await sb(`${TABEL}?id=eq.${encodeURIComponent(id)}&entitas=eq.${encodeURIComponent(entitasSesi())}`, { method: "DELETE" });
}
