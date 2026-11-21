import { useEffect, useState } from "react";
import { sbAll, totalHutangPerPelanggan, totalDepositPerPelanggan, saldoMarketplace, PLATFORM_MARKETPLACE, statusKonfirmasiDatang } from "./api";
import { ringkasAset } from "./aset";

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
