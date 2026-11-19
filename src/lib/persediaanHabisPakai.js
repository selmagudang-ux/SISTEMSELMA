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

// =========================================================
// PEMAKAIAN BARANG HABIS PAKAI untuk Laporan Laba Rugi (BEBAN).
//
// Beban = jumlah DIPAKAI x harga beli rata-rata saat dipakai (mutasi tipe "pakai", kolom hpp), pada
// tanggal pemakaian di rentang laporan. BUKAN uang pembelian: pembelian masuk Neraca (persediaan) dulu.
// Koreksi stok & transfer antar PT tidak dihitung sebagai beban.
// Pemakaian tanpa harga beli dihitung Rp 0 dan dicatat di `tanpaHarga`.
// =========================================================
export function hitungPemakaianHabisPakai(rowsMutasi, rowsBarang) {
  const nama = Object.fromEntries((rowsBarang || []).map((b) => [String(b.id), b]));
  const peta = new Map();
  let total = 0;
  let tanpaHarga = 0;
  for (const r of rowsMutasi || []) {
    const qty = -num(r.jumlah);
    if (qty <= 0) continue;
    const harga = num(r.hpp);
    if (harga <= 0) tanpaHarga += 1;
    const nilai = qty * harga;
    total += nilai;
    const k = String(r.perlengkapan_id);
    const cur = peta.get(k) || { id: k, nama: nama[k]?.nama || "Barang dihapus", satuan: nama[k]?.satuan || "", qty: 0, nilai: 0 };
    cur.qty += qty;
    cur.nilai += nilai;
    peta.set(k, cur);
  }
  const daftar = [...peta.values()].map((d) => ({ ...d, nilai: Math.round(d.nilai) })).sort((a, b) => b.nilai - a.nilai);
  return { total: Math.round(total), daftar, tanpaHarga };
}

export async function muatPemakaianHabisPakai(dari, sampai) {
  const f = ["tipe=eq.pakai"];
  if (dari) f.push(`tanggal=gte.${dari}`);
  if (sampai) f.push(`tanggal=lte.${sampai}`);
  const [mutasi, barang] = await Promise.all([
    sbAll(`perlengkapan_mutasi?select=perlengkapan_id,jumlah,hpp,tanggal&${f.join("&")}&order=id`),
    sbAll("perlengkapan?select=id,nama,satuan&order=id"),
  ]);
  return hitungPemakaianHabisPakai(mutasi || [], barang || []);
}

// aktif=false -> tidak memuat (hemat egress). data = { total, daftar, tanpaHarga } | null.
export function usePemakaianHabisPakai(dari, sampai, aktif = true) {
  const [state, setState] = useState({ memuat: false, data: null, error: "" });
  useEffect(() => {
    if (!aktif) return undefined;
    let batal = false;
    setState((s) => ({ ...s, memuat: true, error: "" }));
    muatPemakaianHabisPakai(dari, sampai)
      .then((data) => !batal && setState({ memuat: false, data, error: "" }))
      .catch((e) => !batal && setState({ memuat: false, data: null, error: String(e?.message || e) }));
    return () => {
      batal = true;
    };
  }, [aktif, dari, sampai]);
  return state;
}
