import { sb, sbAll, entitasSesi, cariAtauBuatRekeningTetap } from "../../lib/api";
import { suggestKode } from "../../components/ui";
import {
  REKENING_TOKO_OFFLINE_CASH,
  REKENING_TOKO_OFFLINE_CASHLESS,
  KODE_REKENING_TOKO_OFFLINE_CASHLESS,
} from "../../lib/constants";
import { hitungItem } from "./kasirHitung";
import { susunStruk } from "./kasirStruk";

// =========================================================
// KASIR — jembatan ke database (fase 3)
// Rekening & kategori keuangan memakai aturan yang SAMA dengan Toko Offline
// (pages/TokoOffline.jsx): Cash -> rekening Cash toko offline, Transfer/QRIS ->
// rekening Cashless. Kategori dicocokkan persis by nama dan harus sudah
// terdaftar di Keuangan > Rekening & Kategori.
// =========================================================

const LABEL_KATEGORI = {
  Cash: "OFFLINE CASH",
  Transfer: "OFFLINE TRANSFER",
  QRIS: "Offline Qris by BCA",
};

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "").trim();

// master_data dikelompokkan per tipe (rekening, kategori_masuk, entitas, dst) —
// bentuk yang sama dengan `master` di App.jsx.
export async function muatMaster() {
  const rows = (await sbAll("master_data?select=id,tipe,kode,label")) || [];
  const grouped = {};
  rows.forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  return grouped;
}

// Tentukan rekening & kategori untuk metode yang dipakai. Kategori diperiksa
// DULU (sebelum rekening dibuat otomatis) supaya tidak meninggalkan rekening
// baru kalau kategorinya ternyata belum didaftarkan.
export async function siapkanKeuangan(master, metodeDipakai) {
  const daftarKategori = master?.kategori_masuk || [];
  const kategori = {};
  for (const m of metodeDipakai) {
    const label = LABEL_KATEGORI[m];
    const ada = daftarKategori.find((k) => norm(k.label) === norm(label));
    if (!ada) {
      throw new Error(`Kategori pemasukan "${label}" belum terdaftar. Daftarkan dulu di Keuangan > Rekening & Kategori.`);
    }
    kategori[m] = ada.kode;
  }

  const hasil = {};
  let rekCashless = null; // Transfer & QRIS berbagi satu rekening — resolve SEKALI.
  for (const m of metodeDipakai) {
    let rekening;
    if (m === "Cash") {
      rekening = await cariAtauBuatRekeningTetap(master, REKENING_TOKO_OFFLINE_CASH, suggestKode, "toko_offline_cash");
    } else {
      if (!rekCashless) {
        rekCashless = await cariAtauBuatRekeningTetap(
          master,
          REKENING_TOKO_OFFLINE_CASHLESS,
          () => KODE_REKENING_TOKO_OFFLINE_CASHLESS,
          "toko_offline_cashless"
        );
      }
      rekening = rekCashless;
    }
    hasil[m] = { rekening, kategori: kategori[m] };
  }
  return hasil;
}

export function buatKunci() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* lanjut ke cadangan */
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Simpan transaksi lewat fungsi database kasir_simpan_transaksi (satu transaksi
// atomik: stok, rak, riwayat stok, keuangan). Angka final dihitung ulang & diperiksa
// di database; kalau tidak cocok, seluruh transaksi dibatalkan.
export async function simpanTransaksiKasir({ session, items, diskonTransaksi, hitungBayar, keuangan, catatan, kunci }) {
  const payload = {
    entitas: entitasSesi(),
    kunci,
    kasir_id: String(session?.id ?? ""),
    kasir_nama: session?.nama || session?.username || "",
    shift_id: session?.shiftId ?? null, // wajib: transaksi hanya boleh disimpan saat shift sedang buka
    catatan: (catatan || "").trim() || null,
    diskon: diskonTransaksi,
    bayar: hitungBayar.bayar,
    kembalian: hitungBayar.kembalian,
    items: items.map((it) => ({
      sku: it.sku,
      nama_produk: it.nama,
      qty: it.qty,
      harga_satuan: it.harga,
      diskon: hitungItem(it).diskon,
    })),
    pembayaran: hitungBayar.pembayaran.map((p) => ({
      metode: p.metode,
      jumlah: p.jumlah,
      rekening: keuangan[p.metode].rekening,
      kategori: keuangan[p.metode].kategori,
    })),
  };
  return sb("rpc/kasir_simpan_transaksi", { method: "POST", body: JSON.stringify({ p: payload }) });
}

// Ubah pesan error teknis dari database jadi kalimat untuk kasir.
// perluMuatUlang = true -> data stok/harga di layar sudah basi, muat ulang.
// konteks "koreksi" = layar void/retur/shift (bukan keranjang), supaya kalimatnya pas.
export function pesanErrorKasir(err, konteks) {
  const msg = String(err?.message || err || "");
  const [kode, a, b] = (msg.match(/[A-Z_]{4,}(\|[^\n]*)?/)?.[0] || "").split("|");
  const rp = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;
  switch (kode) {
    case "STOK_KURANG":
      return { pesan: `Stok ${a} tinggal ${b}. Keranjang sudah disesuaikan — cek lalu tekan Bayar lagi.`, perluMuatUlang: true };
    case "HARGA_BERUBAH":
      return { pesan: `Harga ${a} berubah menjadi ${rp(b)}. Keranjang sudah disesuaikan — cek total lalu tekan Bayar lagi.`, perluMuatUlang: true };
    case "SKU_TIDAK_ADA":
      if (konteks === "koreksi") return { pesan: `Barang ${a} sudah tidak ada di Master Barang Toko, jadi stoknya tidak bisa dikembalikan.`, perluMuatUlang: false };
      return { pesan: `${a} sudah tidak bisa dijual. Hapus dari keranjang.`, perluMuatUlang: true };
    case "SKU_NONAKTIF":
      return { pesan: `${a} sudah tidak bisa dijual. Hapus dari keranjang.`, perluMuatUlang: true };
    case "REKENING_KATEGORI_KOSONG":
      return { pesan: `Rekening/kategori untuk ${a} belum diatur.`, perluMuatUlang: false };
    case "PEMBAYARAN_TIDAK_SAMA":
      return { pesan: "Jumlah pembayaran tidak sama dengan total. Coba lagi.", perluMuatUlang: false };
    case "SHIFT_BELUM_BUKA":
    case "SHIFT_TIDAK_AKTIF":
      return { pesan: "Shift kasir tidak aktif (sudah ditutup atau belum dibuka). Buka kasir dulu, lalu coba lagi.", perluMuatUlang: false, shiftBermasalah: true };
    case "SHIFT_SUDAH_TUTUP":
      return {
        pesan: konteks === "koreksi" ? "Shift transaksi ini sudah ditutup, jadi tidak bisa di-void. Gunakan Retur." : "Shift ini sudah ditutup.",
        perluMuatUlang: false,
      };
    case "CATATAN_SELISIH_WAJIB":
      return { pesan: "Ada selisih kas — isi catatan penyebab selisihnya dulu.", perluMuatUlang: false };
    case "KAS_AKHIR_WAJIB":
      return { pesan: "Isi jumlah uang kas yang dihitung.", perluMuatUlang: false };
    case "ALASAN_WAJIB":
      return { pesan: "Alasan wajib diisi.", perluMuatUlang: false };
    case "SUDAH_VOID":
      return { pesan: "Transaksi ini sudah di-void.", perluMuatUlang: true };
    case "SUDAH_ADA_RETUR":
      return { pesan: "Transaksi ini sudah pernah diretur, jadi tidak bisa di-void.", perluMuatUlang: true };
    case "SUDAH_RETUR_PENUH":
      return { pesan: "Semua barang di transaksi ini sudah diretur.", perluMuatUlang: true };
    case "QTY_RETUR_LEBIH":
      return { pesan: `Jumlah retur ${a} melebihi sisa yang bisa diretur (${b}).`, perluMuatUlang: true };
    case "ITEM_RETUR_KOSONG":
      return { pesan: "Pilih minimal satu barang yang diretur.", perluMuatUlang: false };
    case "TRANSAKSI_TIDAK_ADA":
      return { pesan: "Transaksi tidak ditemukan.", perluMuatUlang: true };
    default:
      break;
  }
  if (/Failed to fetch|NetworkError|timeout|abort/i.test(msg)) {
    return {
      pesan:
        konteks === "koreksi"
          ? "Koneksi terputus. Prosesnya MUNGKIN sudah tersimpan — buka Riwayat dan cek statusnya sebelum mengulang."
          : "Koneksi terputus. Transaksi MUNGKIN sudah tersimpan — tekan Bayar sekali lagi (tidak akan tersimpan dobel).",
      perluMuatUlang: false,
    };
  }
  return { pesan: msg || "Gagal menyimpan transaksi", perluMuatUlang: false };
}

// =========================================================
// FASE 4 — riwayat & cetak ulang struk
// SEMUA nama kolom tabel kasir dikumpulkan di SKEMA ini. Kalau nama kolom di
// database berbeda, cukup ubah di sini — tidak ada nama kolom lain di fase 4.
// =========================================================
export const SKEMA = {
  trx: {
    id: "id",
    nomor: "nomor",
    subtotal: "subtotal",
    total: "total",
    waktu: "created_at",
    kasirId: "kasir_id",
    kasirNama: "kasir_nama",
    diskon: "diskon",
    bayar: "bayar",
    kembalian: "kembalian",
    catatan: "catatan",
    status: "status", // selesai | retur | void
    totalRetur: "total_retur",
    shiftId: "shift_id",
    voidAlasan: "void_alasan",
  },
  item: { trxId: "transaksi_id", sku: "sku", nama: "nama_produk", qty: "qty", harga: "harga_satuan", diskon: "diskon" },
  bayar: { trxId: "transaksi_id", metode: "metode", jumlah: "jumlah" },
};

// Transaksi dalam rentang waktu (sejak <= waktu < sampai). Role kasir hanya melihat transaksinya
// sendiri; superadmin/superappa melihat semua kasir (di PT yang sedang login — difilter
// otomatis oleh sb()). Batas 300 baris; hasil.penuh = true kalau masih ada yang terpotong.
export const BATAS_RIWAYAT = 300;
export async function muatRiwayat({ session, sejak, sampai }) {
  const T = SKEMA.trx;
  const q = [`select=*`, `order=${T.waktu}.desc`, `limit=${BATAS_RIWAYAT}`];
  if (sejak) q.push(`${T.waktu}=gte.${encodeURIComponent(sejak.toISOString())}`);
  if (sampai) q.push(`${T.waktu}=lt.${encodeURIComponent(sampai.toISOString())}`);
  if (session?.role === "kasir") q.push(`${T.kasirId}=eq.${encodeURIComponent(String(session.id))}`);
  return (await sb(`kasir_transaksi?${q.join("&")}`)) || [];
}

// Rincian satu transaksi -> data struk siap tampil (ditandai salinan/cetak ulang).
export async function muatStrukDariDb(row, identitas) {
  const T = SKEMA.trx;
  const id = encodeURIComponent(row[T.id]);
  const [items, bayar] = await Promise.all([
    sb(`kasir_item?select=*&${SKEMA.item.trxId}=eq.${id}`),
    sb(`kasir_pembayaran?select=*&${SKEMA.bayar.trxId}=eq.${id}`),
  ]);
  const I = SKEMA.item;
  const B = SKEMA.bayar;
  const daftarItem = (items || []).map((it) => ({ sku: it[I.sku], nama: it[I.nama], qty: it[I.qty], harga: it[I.harga], diskon: it[I.diskon] }));
  // Diskon transaksi dihitung dari selisih subtotal item dan total yang tersimpan, supaya cetak
  // ulang SELALU sama dengan struk asli, apa pun arti kolom kasir_transaksi.diskon.
  const subtotalItem = daftarItem.reduce((a, it) => a + Math.round((Number(it.qty) || 0) * (Number(it.harga) || 0)) - (Number(it.diskon) || 0), 0);
  const totalTersimpan = Number(row[T.total]);
  const diskonTransaksi = Number.isFinite(totalTersimpan) && totalTersimpan > 0 ? Math.max(subtotalItem - totalTersimpan, 0) : Number(row[T.diskon]) || 0;
  return susunStruk({
    nomor: row[T.nomor],
    waktu: row[T.waktu],
    kasir: row[T.kasirNama],
    catatan: row[T.catatan],
    diskonTransaksi,
    bayar: row[T.bayar],
    kembalian: row[T.kembalian],
    items: daftarItem,
    pembayaran: (bayar || []).map((p) => ({ metode: p[B.metode], jumlah: p[B.jumlah] })),
    identitas,
    salinan: true,
  });
}

// =========================================================
// FASE 5 — SHIFT, VOID & RETUR
// Semua perubahan data lewat fungsi database (atomik) — lihat
// supabase/migrations/20261106_kasir_shift_void_retur.sql.
// =========================================================

// Siapa yang boleh membatalkan seluruh transaksi (void). Retur boleh dilakukan semua kasir
// selama shift-nya buka. Ubah daftar ini kalau aturannya berbeda.
export const ROLE_BOLEH_VOID = ["superadmin", "superappa"];

const KATEGORI_KELUAR_KOREKSI = "Retur & Void Penjualan Kasir";

const rpc = (nama, payload) => sb(`rpc/${nama}`, { method: "POST", body: JSON.stringify(payload) });

// ---------- shift ----------
export async function muatShiftAktif(session) {
  const rows = await sb(`kasir_shift?select=*&kasir_id=eq.${encodeURIComponent(String(session.id))}&status=eq.buka&limit=1`);
  return rows?.[0] || null;
}

export async function bukaShift({ session, kasAwal }) {
  return rpc("kasir_buka_shift", {
    p: {
      entitas: entitasSesi(),
      kasir_id: String(session?.id ?? ""),
      kasir_nama: session?.nama || session?.username || "",
      kas_awal: Number(kasAwal) || 0,
    },
  });
}

export async function ringkasShift(shiftId) {
  return rpc("kasir_hitung_shift", { p_shift: shiftId });
}

export async function tutupShift({ shiftId, kasAkhir, catatan }) {
  return rpc("kasir_tutup_shift", {
    p: { entitas: entitasSesi(), shift_id: shiftId, kas_akhir: Number(kasAkhir) || 0, catatan: (catatan || "").trim() },
  });
}

// Id shift yang masih buka (semua kasir di PT ini) — untuk tahu transaksi mana yang masih bisa di-void.
export async function muatIdShiftBuka() {
  const rows = (await sb("kasir_shift?select=id&status=eq.buka")) || [];
  return new Set(rows.map((r) => r.id));
}

export async function muatDaftarShift({ session, sejak, sampai }) {
  const q = [`select=*`, `order=buka_at.desc`, `limit=200`];
  if (sejak) q.push(`buka_at=gte.${encodeURIComponent(sejak.toISOString())}`);
  if (sampai) q.push(`buka_at=lt.${encodeURIComponent(sampai.toISOString())}`);
  if (session?.role === "kasir") q.push(`kasir_id=eq.${encodeURIComponent(String(session.id))}`);
  return (await sb(`kasir_shift?${q.join("&")}`)) || [];
}

// ---------- keuangan untuk uang KELUAR (void & retur) ----------
// Rekening sama dengan penjualan (Cash -> Petty Cash toko offline, Transfer/QRIS -> Cashless),
// kategori pengeluaran "Retur & Void Penjualan Kasir" dibuat otomatis kalau belum ada.
export async function siapkanKeuanganKeluar(master, metodeDipakai) {
  const daftar = master?.kategori_keluar || [];
  let kodeKategori = daftar.find((k) => norm(k.label) === norm(KATEGORI_KELUAR_KOREKSI))?.kode;
  if (!kodeKategori) {
    let kode = suggestKode(KATEGORI_KELUAR_KOREKSI);
    if (daftar.some((m) => m.kode === kode)) kode = `${kode}${daftar.length + 1}`;
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "kategori_keluar", kode, label: KATEGORI_KELUAR_KOREKSI }) });
    } catch {
      throw new Error(`Kategori pengeluaran "${KATEGORI_KELUAR_KOREKSI}" belum terdaftar. Daftarkan dulu di Keuangan > Rekening & Kategori (tipe pengeluaran).`);
    }
    kodeKategori = kode;
    master.kategori_keluar = [...daftar, { tipe: "kategori_keluar", kode, label: KATEGORI_KELUAR_KOREKSI }];
  }

  const hasil = {};
  let rekCashless = null;
  for (const m of new Set(metodeDipakai)) {
    let rekening;
    if (m === "Cash") {
      rekening = await cariAtauBuatRekeningTetap(master, REKENING_TOKO_OFFLINE_CASH, suggestKode, "toko_offline_cash");
    } else {
      if (!rekCashless) {
        rekCashless = await cariAtauBuatRekeningTetap(master, REKENING_TOKO_OFFLINE_CASHLESS, () => KODE_REKENING_TOKO_OFFLINE_CASHLESS, "toko_offline_cashless");
      }
      rekening = rekCashless;
    }
    hasil[m] = { rekening, kategori: kodeKategori };
  }
  return hasil;
}

// ---------- rincian untuk layar void / retur ----------
export async function muatRincianKoreksi(row) {
  const id = encodeURIComponent(row[SKEMA.trx.id]);
  const [items, bayar] = await Promise.all([
    sb(`kasir_item?select=sku,nama_produk,qty,qty_retur,nilai_retur,harga_satuan,diskon,subtotal&transaksi_id=eq.${id}&order=sku`),
    sb(`kasir_pembayaran?select=metode,jumlah&transaksi_id=eq.${id}`),
  ]);
  return { items: items || [], pembayaran: bayar || [] };
}

// ---------- void ----------
export async function voidTransaksi({ session, row, alasan, keuangan }) {
  return rpc("kasir_void_transaksi", {
    p: {
      entitas: entitasSesi(),
      transaksi_id: row[SKEMA.trx.id],
      alasan: (alasan || "").trim(),
      oleh_nama: session?.nama || session?.username || "",
      keuangan,
    },
  });
}

// ---------- retur ----------
export async function returTransaksi({ session, row, items, alasan, metode, keuangan, kunci }) {
  return rpc("kasir_retur_transaksi", {
    p: {
      entitas: entitasSesi(),
      transaksi_id: row[SKEMA.trx.id],
      shift_id: session?.shiftId ?? null,
      kasir_id: String(session?.id ?? ""),
      kasir_nama: session?.nama || session?.username || "",
      alasan: (alasan || "").trim(),
      metode,
      kunci,
      items: items.map((i) => ({ sku: i.sku, qty: i.qty })),
      keuangan,
    },
  });
}

// Perkiraan nilai retur per barang di layar (angka FINAL dihitung database).
export function perkiraanNilaiRetur(row, item, qty) {
  const T = SKEMA.trx;
  const subtotalTrx = Number(row[T.subtotal]) || 0;
  const rasio = subtotalTrx > 0 ? Number(row[T.total]) / subtotalTrx : 1;
  const bersih = Math.round((Number(item.subtotal) || 0) * rasio);
  const sisa = item.qty - (item.qty_retur || 0);
  return qty >= sisa ? Math.max(bersih - (item.nilai_retur || 0), 0) : Math.round((bersih * qty) / item.qty);
}
