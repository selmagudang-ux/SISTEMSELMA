import { sb, entitasSesi, fmtRp } from "../../lib/api";
import { hitungDiskonPromo } from "./kasirHitung";

// =========================================================
// KASIR — PROMO PER BARANG
// Tabel: kasir_promo (lihat supabase/migrations/20261107_kasir_promo.sql).
// Satu baris = satu SKU toko (master_toko.kode) ATAU satu kategori toko (master_toko.kategori)
// + diskon % atau Rp PER PCS + tanggal mulai & selesai. Promo kategori berlaku untuk semua barang di kategori itu.
// Promo yang sedang berjalan otomatis terpasang sebagai diskon item di keranjang kasir
// (lihat hitungItem di kasirHitung.js). Di database tidak ada yang berubah: transaksi tetap
// menyimpan diskon item dalam rupiah, jadi fungsi kasir_simpan_transaksi tidak perlu diubah.
// Tabel ini tidak masuk TABEL_PER_PT di lib/api.js, jadi kolom & filter `entitas` diurus di sini.
// =========================================================

const KOLOM = "id,sku,kategori,nama,tipe,nilai,mulai,selesai,aktif,created_at";

// Kategori dicocokkan tanpa peduli huruf besar/kecil dan spasi di pinggir.
export const normKat = (k) => String(k || "").trim().toLowerCase();

// Tanggal hari ini (YYYY-MM-DD) menurut WIB, bukan jam perangkat — supaya promo ganti hari tepat tengah malam WIB.
export function tanggalHariIni() {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  } catch {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

// "berjalan" | "akan" | "berakhir" | "nonaktif"
export function statusPromo(p, hariIni = tanggalHariIni()) {
  if (!p.aktif) return "nonaktif";
  if (p.selesai < hariIni) return "berakhir";
  if (p.mulai > hariIni) return "akan";
  return "berjalan";
}

export function labelDiskon(p) {
  const n = Number(p.nilai) || 0;
  return p.tipe === "persen" ? `${n % 1 === 0 ? n : n.toFixed(1)}%` : `${fmtRp(n)}/pcs`;
}

export function tglPendek(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Harga satuan setelah promo (dibulatkan ke rupiah).
export function hargaSetelahPromo(harga, promo) {
  const h = Number(harga) || 0;
  return h - hitungDiskonPromo(h, 1, promo);
}

// Dari daftar promo -> Map(sku -> promo terbaik yang BERJALAN hari ini), untuk semua barang toko.
// infoSku: Map(sku -> { harga, kategori }). Promo bisa per SKU atau per kategori; kalau satu barang
// kena beberapa promo sekaligus, dipakai yang potongannya paling besar (per pcs).
export function petaPromoAktif(rows, infoSku, hariIni = tanggalHariIni()) {
  const perSku = new Map();
  const perKat = new Map();
  for (const p of rows || []) {
    if (statusPromo(p, hariIni) !== "berjalan") continue;
    if (p.sku) (perSku.get(p.sku) || perSku.set(p.sku, []).get(p.sku)).push(p);
    else if (p.kategori) (perKat.get(normKat(p.kategori)) || perKat.set(normKat(p.kategori), []).get(normKat(p.kategori))).push(p);
  }
  const peta = new Map();
  for (const [sku, info] of infoSku || []) {
    const calon = [...(perSku.get(sku) || []), ...(perKat.get(normKat(info?.kategori)) || [])];
    let terbaik = null;
    let potongMaks = -1;
    for (const p of calon) {
      const potong = hitungDiskonPromo(Number(info?.harga) || 0, 1, p);
      if (potong > potongMaks) {
        potongMaks = potong;
        terbaik = p;
      }
    }
    if (terbaik) {
      peta.set(sku, { id: terbaik.id, sku, nama: terbaik.nama || "", tipe: terbaik.tipe, nilai: Number(terbaik.nilai) || 0, selesai: terbaik.selesai, kategori: terbaik.sku ? "" : terbaik.kategori });
    }
  }
  return peta;
}

// Hanya promo yang masih relevan (belum berakhir) yang dimuat untuk layar kasir.
export async function muatPromoKasir() {
  const hari = tanggalHariIni();
  const rows = await sb(
    `kasir_promo?select=${KOLOM}&aktif=eq.true&selesai=gte.${hari}&mulai=lte.${hari}&entitas=eq.${encodeURIComponent(entitasSesi())}&order=id`
  );
  return rows || [];
}

// Semua promo (untuk layar kelola promo).
export async function muatSemuaPromo() {
  const rows = await sb(`kasir_promo?select=${KOLOM}&entitas=eq.${encodeURIComponent(entitasSesi())}&order=mulai.desc,id.desc&limit=2000`);
  return rows || [];
}

export async function tambahPromo(daftar) {
  const e = entitasSesi();
  return sb("kasir_promo", { method: "POST", body: JSON.stringify(daftar.map((p) => ({ ...p, entitas: e }))) });
}

export async function ubahPromo(id, data) {
  const hasil = await sb(`kasir_promo?id=eq.${id}&entitas=eq.${encodeURIComponent(entitasSesi())}`, { method: "PATCH", body: JSON.stringify(data) });
  if (Array.isArray(hasil) && hasil.length === 0) throw new Error("Promo tidak tersimpan: promo sudah tidak ada atau Anda tidak punya izin.");
  return hasil;
}

export async function hapusPromo(id) {
  const hasil = await sb(`kasir_promo?id=eq.${id}&entitas=eq.${encodeURIComponent(entitasSesi())}`, { method: "DELETE" });
  if (Array.isArray(hasil) && hasil.length === 0) throw new Error("Promo tidak terhapus: promo sudah tidak ada atau Anda tidak punya izin.");
  return hasil;
}
