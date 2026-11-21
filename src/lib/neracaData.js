import { useEffect, useMemo, useState } from "react";
import {
  sbAll, totalHutangPerPelanggan, totalDepositPerPelanggan, saldoMarketplace, PLATFORM_MARKETPLACE, statusKonfirmasiDatang,
  PENARIKAN_PEMILIK, TIPE_PENARIKAN, ENTITAS_DEFAULT, petaEntitasRekening, entitasDariRekening,
  setoranSebagaiPemasukan, gajiPusatSebagaiPengeluaran, saringLabaRugi, laporanLabaRugi,
} from "./api";
import { ringkasAset } from "./aset";
import { useKeuanganRentang } from "./useKeuanganRentang";
import { useHppPenjualan } from "./hppPenjualan";
import { usePemakaianHabisPakai } from "./persediaanHabisPakai";

// =========================================================
// DATA NERACA yang bisa dihitung langsung dari data yang sudah ada:
//   - Aktiva Tetap  : tabel aset (harga perolehan per kategori + akumulasi penyusutan), lihat lib/aset.js
//   - Piutang Grosir: sisa hutang semua pesanan grosir aktif (bukan Batal) = total - pembayaran
//   - Saldo Marketplace: pemasukan - iklan - pencairan semua toko (Shopee/TikTok/Lazada), termasuk toko "Gudang"
//   - Uang Muka Barang: pesanan barang (Pesan Barang) yang sudah dibayar tapi belum dikonfirmasi datang
//     (sama dengan "Barang Belum Datang" di halaman Barang Datang). Pos Uang Muka di Neraca = ini + uang muka habis pakai.
//   - Utang Supplier: Rp 0 — pembelian selalu dibayar dulu (tidak ada utang dagang); yang ada hanya uang muka di atas.
//   - Titipan Deposit: saldo deposit positif pelanggan grosir / reseller (toko berhutang ke pelanggan)
// Semua tabel otomatis dibatasi ke PT yang sedang dibuka oleh sbAll().
// Tiap bagian dimuat sendiri-sendiri: kalau satu gagal (mis. tabel aset belum dibuat), pos lain tetap tampil.
// Pos yang gagal dimuat tidak masuk `nilai` (tampil "-"), dan alasannya ada di `galat`.
// =========================================================

const jumlah = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export async function muatDataNeraca() {
  const nilai = {};
  const galat = [];
  const rincian = {};

  const coba = async (nama, fn) => {
    try {
      await fn();
    } catch (e) {
      galat.push(`${nama}: ${String(e?.message || e)}`);
    }
  };

  await Promise.all([
    coba("Aktiva Tetap", async () => {
      const aset = (await sbAll("aset?select=*")) || [];
      const r = ringkasAset(aset);
      nilai.peralatan = r.perKategori.peralatan?.harga || 0;
      nilai.kendaraan = r.perKategori.kendaraan?.harga || 0;
      nilai.akum_penyusutan = r.akumulasi;
      rincian.aset = { jumlah: r.jumlah, harga: r.harga, akumulasi: r.akumulasi, nilaiBuku: r.nilaiBuku };
    }),
    coba("Piutang Grosir", async () => {
      const [pesanan, bayar] = await Promise.all([
        sbAll("grosir_pesanan?select=id,pelanggan_id,total,status"),
        sbAll("grosir_pembayaran?select=pesanan_id,jumlah"),
      ]);
      const peta = totalHutangPerPelanggan(pesanan || [], bayar || []);
      nilai.piutang_grosir = Math.round(jumlah(Object.values(peta)));
      rincian.piutang = { pelanggan: Object.keys(peta).length };
    }),
    coba("Uang Muka Barang", async () => {
      const semua =
        (await sbAll(
          "pesanan_masuk?select=id,induk_id,kode_pesanan,jenis,dibatalkan,draft,konfirmasi_datang,harga_kesepakatan,harga_pembayaran,jumlah_diterima,jumlah_pesan,versi_struktur,selesai_manual,rincian_invoice,jumlah_box"
        )) || [];
      // Nominal pembayaran per pesanan = harga_kesepakatan; kalau kosong (data lama) jumlah harga_pembayaran induk + bon tambahan.
      const bayar = (p) => {
        const k = Number(p.harga_kesepakatan) || 0;
        if (k > 0) return k;
        return semua.filter((x) => x.id === p.id || x.induk_id === p.id).reduce((a, x) => a + (Number(x.harga_pembayaran) || 0), 0);
      };
      const belumDatang = semua.filter((p) => !p.induk_id && p.jenis !== "Retur" && statusKonfirmasiDatang(p) === "belum");
      nilai.uang_muka_barang = Math.round(jumlah(belumDatang.map(bayar)));
      nilai.utang_supplier = 0;
      rincian.uangMukaBarang = { pesanan: belumDatang.length };
    }),
    coba("Titipan Deposit", async () => {
      const deposit = (await sbAll("grosir_deposit?select=pelanggan_id,jumlah")) || [];
      const peta = totalDepositPerPelanggan(deposit);
      nilai.titipan_deposit = Math.round(jumlah(Object.values(peta)));
      rincian.deposit = { pelanggan: Object.keys(peta).length };
    }),
    coba("Saldo Marketplace", async () => {
      const trx = (await sbAll("marketplace_transaksi?select=platform,toko,tipe,jumlah,rekening")) || [];
      const perPlatform = {};
      PLATFORM_MARKETPLACE.forEach((pf) => {
        perPlatform[pf] = saldoMarketplace(trx, pf);
      });
      nilai.saldo_marketplace = Math.round(jumlah(Object.values(perPlatform)));
      rincian.marketplace = perPlatform;
    }),
  ]);

  return { nilai, galat, rincian };
}

// aktif=false -> tidak memuat (hemat egress). versi: ubah angkanya untuk memuat ulang.
export function useDataNeraca(aktif = true, versi = 0) {
  const [state, setState] = useState({ memuat: false, data: null, error: "" });
  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    setState((s) => ({ ...s, memuat: true, error: "" }));
    muatDataNeraca()
      .then((data) => !batal && setState({ memuat: false, data, error: "" }))
      .catch((e) => !batal && setState({ memuat: false, data: null, error: String(e?.message || e) }));
    return () => {
      batal = true;
    };
  }, [aktif, versi]);
  return state;
}

// =========================================================
// EKUITAS, PIUTANG PEMILIK & PINJAMAN ANTAR ENTITAS
//
// Pengaturan (master_data tipe "neraca_awal", kode "<kunci>:<kode entitas>"):
//   tanggal_awal : tanggal pertama pencatatan di sistem (bawaan 14 Nov 2026). Laba Berjalan dihitung dari sini.
//   laba_ditahan : saldo awal Laba Ditahan, diinput SEKALI per hari sebelum tanggal_awal supaya Neraca seimbang
//                  saat mulai. Setelah itu selisih Aktiva - Pasiva = ada transaksi salah / belum tercatat.
// =========================================================
export const TANGGAL_AWAL_NERACA_BAWAAN = "2026-11-14";

export function pengaturanNeraca(master, entitasKode) {
  const ent = entitasKode || ENTITAS_DEFAULT;
  const baris = master?.neraca_awal || [];
  const cari = (kunci) => baris.find((m) => m.kode === `${kunci}:${ent}`) || null;
  const bTanggal = cari("tanggal_awal");
  const bLaba = cari("laba_ditahan");
  return {
    entitas: ent,
    tanggalAwal: bTanggal?.label || TANGGAL_AWAL_NERACA_BAWAAN,
    labaDitahan: Number(bLaba?.label) || 0,
    barisTanggal: bTanggal,
    barisLaba: bLaba,
  };
}

// Hitung pos Neraca yang berasal dari transaksi Keuangan bertanda (penanda), dari SELURUH riwayat:
//   Holding / pemilik : setoran_modal -> Modal Disetor, prive_dividen -> Prive/Dividen,
//                       pinjaman_pemilik - pelunasan_pemilik -> Piutang Pemilik
//   Antar entitas     : modal (diterima) -> Modal Disetor; modal (diberikan Pusat) -> Penyertaan Modal pada Entitas;
//                       setoran_penghasilan / dividen (dikirim cabang) -> Prive/Dividen (bukan beban);
//                       pinjaman & pelunasan_pinjaman -> posisi bersih: positif = Piutang Antar Entitas, negatif = Utang Pusat
//   biaya_antar       : bukan transaksi laba rugi biasa (transfer), jadi dihitung terpisah sebagai penyesuaian laba
//                       sejak tanggalAwal (pembayar -, penerima +).
export function hitungPosEkuitas(semua, master, entitasKode, tanggalAwal) {
  const entitasList = master?.entitas || [];
  const banyak = entitasList.length >= 2;
  const ent = entitasKode || ENTITAS_DEFAULT;
  const peta = petaEntitasRekening(master?.rekening_entitas);
  const entDari = (kode) => entitasDariRekening(peta, entitasList, kode);
  const milik = (rek) => !banyak || entDari(rek) === ent;

  const h = { modal_disetor: 0, prive: 0, piutang_pemilik: 0, penyertaan_entitas: 0, biayaAntar: 0 };
  let posisi = 0;
  (semua || []).forEach((t) => {
    const j = Number(t.jumlah) || 0;
    if (t.penanda && PENARIKAN_PEMILIK[t.penanda] && TIPE_PENARIKAN[t.penanda] === t.tipe) {
      if (!milik(t.rekening)) return;
      if (t.penanda === "setoran_modal") h.modal_disetor += j;
      else if (t.penanda === "prive_dividen") h.prive += j;
      else if (t.penanda === "pinjaman_pemilik") h.piutang_pemilik += j;
      else if (t.penanda === "pelunasan_pemilik") h.piutang_pemilik -= j;
      return;
    }
    if (!banyak || t.tipe !== "transfer") return;
    const asal = entDari(t.rekening);
    const tujuan = entDari(t.rekening_tujuan);
    if (asal === tujuan) return;
    if (t.penanda === "modal") {
      if (tujuan === ent) h.modal_disetor += j;
      // Gaji cabang yang dibayar Pusat = beban Pusat (lihat gajiPusatSebagaiPengeluaran), bukan penyertaan modal.
      if (asal === ent && !t.untuk_gaji) h.penyertaan_entitas += j;
    } else if (t.penanda === "setoran_penghasilan" || t.penanda === "dividen") {
      if (asal === ent) h.prive += j; // cabang menyetor ke Pusat: kas turun, bukan beban
    } else if (t.penanda === "pinjaman" || t.penanda === "pelunasan_pinjaman") {
      if (asal === ent) posisi += j;
      if (tujuan === ent) posisi -= j;
    } else if (t.penanda === "biaya_antar") {
      if (!tanggalAwal || (t.tanggal || "") >= tanggalAwal) {
        if (asal === ent) h.biayaAntar -= j;
        if (tujuan === ent) h.biayaAntar += j;
      }
    }
  });
  return {
    modal_disetor: Math.round(h.modal_disetor),
    prive: Math.round(h.prive),
    piutang_pemilik: Math.round(h.piutang_pemilik),
    penyertaan_entitas: Math.round(h.penyertaan_entitas),
    piutang_antar_entitas: Math.round(Math.max(posisi, 0)),
    utang_pusat: Math.round(Math.max(-posisi, 0)),
    biayaAntar: Math.round(h.biayaAntar),
  };
}

const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Hook untuk tab Neraca (komputer & HP). `transaksi` = transaksi yang sudah dibatasi ke entitas (lingkup.transaksi),
// `master` = master yang sudah dibatasi (lingkup.master). aktif=false -> tidak memuat apa pun (hemat egress).
// Mengembalikan { nilai, pengaturan, labaBerjalan, status } — nilai hanya berisi pos yang SUDAH siap dihitung.
export function useEkuitasNeraca({ transaksi, master, entitasKode, aktif }) {
  const pengaturan = pengaturanNeraca(master, entitasKode);
  const { tanggalAwal } = pengaturan;
  const sampai = hariIni();

  // Seluruh riwayat dimuat hanya saat tab Neraca dibuka (hari ini = tidak perlu data lama).
  const { data: semua, status } = useKeuanganRentang(transaksi, aktif ? "" : sampai);
  const { hpp } = useHppPenjualan(aktif ? tanggalAwal : null, aktif ? sampai : null);
  const { data: pemakaian } = usePemakaianHabisPakai(tanggalAwal, sampai, aktif);

  const hasil = useMemo(() => {
    if (!aktif || status) return null;
    const pos = hitungPosEkuitas(semua, master, entitasKode, tanggalAwal);
    // Laba Berjalan = Laba Rugi dari tanggal awal sampai hari ini (aturan sama dengan tab Laporan Laba Rugi).
    const dataLR = saringLabaRugi(
      [...setoranSebagaiPemasukan(semua, master, entitasKode), ...gajiPusatSebagaiPengeluaran(semua, master, entitasKode)],
      master
    );
    const lr = laporanLabaRugi(
      dataLR, master.kategori_masuk || [], master.kategori_keluar || [], tanggalAwal, sampai,
      master.kelompok_masuk, master.kelompok_keluar, hpp?.total || 0, pemakaian?.total || 0
    );
    return { pos, labaRugi: lr.labaRugi };
  }, [aktif, status, semua, master, entitasKode, tanggalAwal, sampai, hpp, pemakaian]);

  const nilai = {};
  if (hasil) {
    const { pos } = hasil;
    nilai.modal_disetor = pos.modal_disetor;
    nilai.prive = pos.prive;
    nilai.piutang_pemilik = pos.piutang_pemilik;
    nilai.piutang_antar_entitas = pos.piutang_antar_entitas;
    nilai.utang_pusat = pos.utang_pusat;
    nilai.penyertaan_entitas = pos.penyertaan_entitas;
    nilai.utang_lain = 0;
    nilai.laba_ditahan = pengaturan.labaDitahan;
    // Laba Berjalan baru ditampilkan setelah HPP penjualan & pemakaian habis pakai selesai dimuat (supaya tidak "loncat").
    if (hpp && pemakaian) nilai.laba_berjalan = Math.round(hasil.labaRugi + pos.biayaAntar);
  }
  return { nilai, pengaturan, status: aktif ? status : "", memuat: !!aktif && !status && (!hasil || !hpp || !pemakaian) };
}
