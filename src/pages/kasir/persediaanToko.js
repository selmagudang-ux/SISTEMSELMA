import { useEffect, useState } from "react";
import { sbAll } from "../../lib/api";
import { buatPelengkapHpp } from "../../lib/hppTokoCocok";

// =========================================================
// NILAI PERSEDIAAN BARANG TOKO = jumlah (stok) x HPP satuan, per entitas aktif
// (master_toko otomatis difilter per entitas oleh sbAll). Dipakai Laporan Kasir
// dan pos "Persediaan Barang" di Neraca Keuangan.
// HPP kosong dilengkapi dari barang mirip (sama seperti laporan kasir, lib/hppTokoCocok.js);
// kalau tetap kosong dihitung Rp 0 dan dihitung di "tanpaHpp".
// Hanya stok > 0 yang dihitung (stok minus diabaikan).
// Stok gudang (sku_master) TIDAK ikut di sini.
// =========================================================

const num = (v) => Number(v) || 0;

export function hitungPersediaanToko(rowsToko, rowsMaster) {
  const lengkapi = buatPelengkapHpp(rowsToko, rowsMaster);
  let pcs = 0;
  let nilai = 0;
  let jenis = 0;
  let tanpaHpp = 0;
  for (const r of rowsToko || []) {
    const stok = num(r.stok);
    if (stok <= 0) continue;
    const hpp = lengkapi.hppToko(r);
    pcs += stok;
    jenis += 1;
    if (hpp > 0) nilai += stok * hpp;
    else tanpaHpp += 1;
  }
  return { pcs, jenis, nilai: Math.round(nilai), tanpaHpp };
}

export async function muatPersediaanToko() {
  const [toko, master] = await Promise.all([
    sbAll("master_toko?select=kode,nama,barcode,sku_gudang,hpp,harga_jual,stok"),
    sbAll("sku_master?select=sku,hpp,ecer,grosir").catch(() => []),
  ]);
  return hitungPersediaanToko(toko || [], master || []);
}

// versi: ubah angkanya untuk memuat ulang. aktif=false -> tidak memuat (hemat egress).
export function usePersediaanToko(aktif = true, versi = 0) {
  const [state, setState] = useState({ memuat: false, data: null, error: "" });
  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    setState((s) => ({ ...s, memuat: true, error: "" }));
    muatPersediaanToko()
      .then((data) => !batal && setState({ memuat: false, data, error: "" }))
      .catch((e) => !batal && setState({ memuat: false, data: null, error: String(e?.message || e) }));
    return () => {
      batal = true;
    };
  }, [aktif, versi]);
  return state;
}
