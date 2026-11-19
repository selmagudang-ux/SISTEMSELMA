import { useEffect, useState } from "react";
import { sbAll } from "./api";

// =========================================================
// PERSEDIAAN BARANG HABIS PAKAI untuk Neraca.
//
// Nilai = stok x harga beli rata-rata per barang (view perlengkapan_nilai, per PT yang sedang dibuka).
// Harga beli dicatat di tiap pergerakan stok (kolom `hpp` di perlengkapan_mutasi; barang habis pakai
// tidak punya HPP, isinya harga beli). Hanya stok > 0 yang dihitung; barang ber-stok tanpa harga beli
// dihitung Rp 0 dan dicatat di `tanpaHarga`.
//
// UANG MUKA = belanja habis pakai yang SUDAH DIBAYAR tapi barangnya BELUM DITERIMA. Uangnya sudah
// keluar dari kas, tapi stoknya belum ada; begitu barang diterima pindah jadi persediaan.
// =========================================================

const num = (v) => Number(v) || 0;

export function hitungPersediaanHabisPakai(rowsNilai, rowsBelanja) {
  let nilai = 0;
  let jenis = 0;
  let tanpaHarga = 0;
  for (const r of rowsNilai || []) {
    const stok = num(r.stok);
    if (stok <= 0) continue;
    jenis += 1;
    const hargaRata = num(r.hpp_rata);
    if (hargaRata > 0) nilai += stok * hargaRata;
    else tanpaHarga += 1;
  }
  let uangMuka = 0;
  let belanjaBelumDiterima = 0;
  for (const b of rowsBelanja || []) {
    if (b.dibayar && b.status !== "diterima") {
      uangMuka += num(b.total);
      belanjaBelumDiterima += 1;
    }
  }
  return { nilai: Math.round(nilai), jenis, tanpaHarga, uangMuka: Math.round(uangMuka), belanjaBelumDiterima };
}

export async function muatPersediaanHabisPakai() {
  const [nilai, belanja] = await Promise.all([
    sbAll("perlengkapan_nilai?select=perlengkapan_id,stok,hpp_rata,nilai&order=perlengkapan_id"),
    sbAll("belanja_habis_pakai?select=id,total,dibayar,status&order=id"),
  ]);
  return hitungPersediaanHabisPakai(nilai || [], belanja || []);
}

// aktif=false -> tidak memuat (hemat egress). versi: ubah angkanya untuk memuat ulang.
export function usePersediaanHabisPakai(aktif = true, versi = 0) {
  const [state, setState] = useState({ memuat: false, data: null, error: "" });
  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    setState((s) => ({ ...s, memuat: true, error: "" }));
    muatPersediaanHabisPakai()
      .then((data) => !batal && setState({ memuat: false, data, error: "" }))
      .catch((e) => !batal && setState({ memuat: false, data: null, error: String(e?.message || e) }));
    return () => {
      batal = true;
    };
  }, [aktif, versi]);
  return state;
}
