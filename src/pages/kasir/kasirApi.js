import { sb, sbAll, entitasSesi, cariAtauBuatRekeningTetap } from "../../lib/api";
import { suggestKode } from "../../components/ui";
import {
  REKENING_TOKO_OFFLINE_CASH,
  REKENING_TOKO_OFFLINE_CASHLESS,
  KODE_REKENING_TOKO_OFFLINE_CASHLESS,
} from "../../lib/constants";
import { hitungItem } from "./kasirHitung";

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
export function pesanErrorKasir(err) {
  const msg = String(err?.message || err || "");
  const [kode, a, b] = (msg.match(/[A-Z_]{4,}(\|[^\n]*)?/)?.[0] || "").split("|");
  const rp = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;
  switch (kode) {
    case "STOK_KURANG":
      return { pesan: `Stok ${a} tinggal ${b}. Keranjang sudah disesuaikan — cek lalu tekan Bayar lagi.`, perluMuatUlang: true };
    case "HARGA_BERUBAH":
      return { pesan: `Harga ${a} berubah menjadi ${rp(b)}. Keranjang sudah disesuaikan — cek total lalu tekan Bayar lagi.`, perluMuatUlang: true };
    case "SKU_TIDAK_ADA":
    case "SKU_NONAKTIF":
      return { pesan: `${a} sudah tidak bisa dijual. Hapus dari keranjang.`, perluMuatUlang: true };
    case "REKENING_KATEGORI_KOSONG":
      return { pesan: `Rekening/kategori untuk ${a} belum diatur.`, perluMuatUlang: false };
    case "PEMBAYARAN_TIDAK_SAMA":
      return { pesan: "Jumlah pembayaran tidak sama dengan total. Coba lagi.", perluMuatUlang: false };
    default:
      break;
  }
  if (/Failed to fetch|NetworkError|timeout|abort/i.test(msg)) {
    return {
      pesan: "Koneksi terputus. Transaksi MUNGKIN sudah tersimpan — tekan Bayar sekali lagi (tidak akan tersimpan dobel).",
      perluMuatUlang: false,
    };
  }
  return { pesan: msg || "Gagal menyimpan transaksi", perluMuatUlang: false };
}
