import { useEffect, useState } from "react";
import { sbAll, totalHutangPerPelanggan, totalDepositPerPelanggan, saldoMarketplace, PLATFORM_MARKETPLACE } from "./api";
import { ringkasAset } from "./aset";

// =========================================================
// DATA NERACA yang bisa dihitung langsung dari data yang sudah ada:
//   - Aktiva Tetap  : tabel aset (harga perolehan per kategori + akumulasi penyusutan), lihat lib/aset.js
//   - Piutang Grosir: sisa hutang semua pesanan grosir aktif (bukan Batal) = total - pembayaran
//   - Saldo Marketplace: pemasukan - iklan - pencairan semua toko (Shopee/TikTok/Lazada), termasuk toko "Gudang"
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
