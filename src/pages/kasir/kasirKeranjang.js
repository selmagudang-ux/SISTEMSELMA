import { sb, entitasSesi } from "../../lib/api";
import { bisa } from "../../lib/constants";

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

export async function simpanKeranjangTersimpan({ session, items, diskonTrx, nama, jumlahPcs, totalPerkiraan }) {
  const baris = {
    entitas: entitasSesi(),
    kasir_id: String(session?.id ?? ""),
    kasir_nama: session?.nama || session?.username || "",
    nama: (nama || "").trim() || null,
    items,
    diskon_trx: diskonTrx || null,
    jumlah_pcs: Math.round(Number(jumlahPcs) || 0),
    total_perkiraan: Math.round(Number(totalPerkiraan) || 0),
  };
  const hasil = await sb(TABEL, { method: "POST", body: JSON.stringify(baris) });
  return Array.isArray(hasil) ? hasil[0] : hasil;
}

// Kasir biasa hanya melihat keranjang miliknya; role dengan kasir.lihat_semua melihat semua kasir di PT ini.
export async function muatKeranjangTersimpan(session) {
  const q = [`select=${KOLOM}`, `entitas=eq.${encodeURIComponent(entitasSesi())}`, "order=created_at.desc", `limit=${BATAS_DAFTAR}`];
  if (!bisa(session?.role, "kasir.lihat_semua")) q.push(`kasir_id=eq.${encodeURIComponent(String(session?.id ?? ""))}`);
  return (await sb(`${TABEL}?${q.join("&")}`)) || [];
}

export async function hapusKeranjangTersimpan(id) {
  await sb(`${TABEL}?id=eq.${encodeURIComponent(id)}&entitas=eq.${encodeURIComponent(entitasSesi())}`, { method: "DELETE" });
}
