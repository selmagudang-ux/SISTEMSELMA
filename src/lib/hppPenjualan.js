import { useEffect, useState } from "react";
import { sb, sbAll, entitasBacaSaatIni } from "./api";
import { getSession } from "./auth";
import { bangunIndeksAwalan, cocokkanItemManual, kandidatItemManual, normKode } from "./hppGrosirCocok";
import { muatRekapKasir, olahRekap } from "../pages/kasir/kasirLaporan";

// =========================================================
// HPP PENJUALAN untuk Laporan Laba Rugi.
//
// HPP = jumlah barang TERJUAL x HPP satuan (sku_master.hpp / master_toko.hpp),
// BUKAN uang pembelian ke supplier. Tiga jalur penjualan dihitung terpisah:
//   1. Marketplace : marketplace_penjualan (hpp_satuan x (qty - qty_retur)),
//                    tanggal = tanggal dana dilepas (sama dengan Rincian Penjualan).
//   2. Grosir      : grosir_detail_pesanan (qty x sku_master.hpp), pesanan "Batal" dibuang.
//                    Item manual dicocokkan lewat nama (= kode SKU tanpa ukuran) ke Master Barang,
//                    aturannya di lib/hppGrosirCocok.js. Yang tidak ketemu / ambigu -> `tanpaHpp`.
//   3. Toko/Kasir  : sama dengan Laporan Kasir (olahRekap): void & retur sudah dibuang.
//
// Tiap jalur dimuat sendiri-sendiri: kalau satu gagal (mis. tabel belum ada),
// jalur lain tetap jalan dan galatnya ditampilkan di `galat`.
// Semua query lewat sb/sbAll jadi otomatis mengikuti PT (entitas) yang sedang aktif.
// =========================================================

const num = (v) => Number(v) || 0;

async function dalamPotongan(ids, ukuran, fn) {
  const hasil = [];
  for (let i = 0; i < ids.length; i += ukuran) {
    const bagian = await fn(ids.slice(i, i + ukuran));
    if (bagian) hasil.push(...bagian);
  }
  return hasil;
}

async function hppMarketplace(dari, sampai) {
  const rows = await sbAll(
    `marketplace_penjualan?select=qty,qty_retur,hpp_satuan&tanggal_dilepas=gte.${dari}&tanggal_dilepas=lte.${sampai}`
  );
  let total = 0;
  let tanpaHpp = 0;
  for (const b of rows || []) {
    if (b.hpp_satuan == null || b.qty == null) {
      tanpaHpp += 1; // SKU belum cocok / qty tidak diketahui -> HPP belum bisa dihitung
      continue;
    }
    total += num(b.hpp_satuan) * Math.max(0, num(b.qty) - num(b.qty_retur));
  }
  return { total: Math.round(total), tanpaHpp };
}

// ---------------------------------------------------------
// HPP MANUAL SEMENTARA (item yang tidak ketemu / ambigu / HPP Master kosong).
// Disimpan di master_data tipe "hpp_grosir_manual": kode = "<PT>:<NAMA ITEM>", label = angka HPP.
// Dipakai HANYA kalau HPP dari Master tidak bisa dipakai, jadi begitu Master dibetulkan, HPP Master
// otomatis menang dan isian sementara ini diabaikan.
// ---------------------------------------------------------
export const TIPE_HPP_MANUAL = "hpp_grosir_manual";
const kodeHppManual = (nama) => `${entitasBacaSaatIni()}:${normKode(nama)}`;

async function muatHppManual() {
  try {
    const awalan = `${entitasBacaSaatIni()}:`;
    const rows = await sbAll(`master_data?select=id,kode,label&tipe=eq.${TIPE_HPP_MANUAL}`);
    const peta = new Map();
    for (const r of rows || []) {
      if (!String(r.kode).startsWith(awalan)) continue;
      const hpp = num(r.label);
      if (hpp > 0) peta.set(String(r.kode).slice(awalan.length), { id: r.id, hpp });
    }
    return peta;
  } catch {
    return new Map(); // master_data belum bisa dibaca -> lanjut tanpa HPP manual
  }
}

// idLama = id baris master_data kalau item itu sudah pernah diisi (diubah, bukan dibuat baru).
export async function simpanHppManual(nama, hpp, idLama) {
  const nilai = Math.round(num(hpp));
  if (!(nilai > 0)) throw new Error("HPP harus lebih dari 0");
  if (idLama) {
    await sb(`master_data?id=eq.${idLama}`, { method: "PATCH", body: JSON.stringify({ label: String(nilai) }) });
    return idLama;
  }
  const hasil = await sb("master_data", {
    method: "POST",
    body: JSON.stringify({ tipe: TIPE_HPP_MANUAL, kode: kodeHppManual(nama), label: String(nilai) }),
  });
  return Array.isArray(hasil) ? hasil[0]?.id : hasil?.id;
}

export async function hapusHppManual(id) {
  await sb(`master_data?id=eq.${id}`, { method: "DELETE" });
}

const LABEL_MASALAH = {
  tidakKetemu: "Tidak ketemu di Master",
  ambigu: "Ambigu (beberapa ukuran, HPP berbeda)",
  tanpaHpp: "HPP Master kosong",
  skuTanpaHpp: "Item dari Data Barang, HPP kosong",
};

export async function hppGrosir(dari, sampai) {
  const pesanan = await sbAll(`grosir_pesanan?select=id,status,nomor_pesanan&tanggal=gte.${dari}&tanggal=lte.${sampai}`);
  const aktif = (pesanan || []).filter((p) => p.status !== "Batal");
  const ids = aktif.map((p) => p.id);
  if (ids.length === 0) return { total: 0, tanpaHpp: 0 };
  const nomorPesanan = new Map(aktif.map((p) => [p.id, p.nomor_pesanan]));

  const [detail, master, hppManual] = await Promise.all([
    dalamPotongan(ids, 60, (c) =>
      sbAll(`grosir_detail_pesanan?select=pesanan_id,sku,qty,nama_produk,harga&pesanan_id=in.(${c.join(",")})`)
    ),
    sbAll("sku_master?select=sku,hpp,grosir"),
    muatHppManual(),
  ]);
  const petaHpp = new Map((master || []).map((m) => [m.sku, m.hpp == null ? null : num(m.hpp)]));
  const indeks = bangunIndeksAwalan(master);

  let total = 0;
  let tanpaHpp = 0;
  const hitung = { tidakKetemu: 0, ambigu: 0, tanpaHpp: 0 };
  const masalah = new Map(); // "status|nama" -> baris ringkasan untuk daftar
  const catat = (status, nama, d, manual) => {
    const kunci = `${status}|${normKode(nama)}`;
    let m = masalah.get(kunci);
    if (!m) {
      const kandidat = status === "ambigu" || status === "tanpaHpp" ? kandidatItemManual(indeks, nama).map((k) => `${k.sku} (HPP ${k.hpp}, Grosir ${k.grosir})`).join(" ; ") : "";
      m = {
        kunci: normKode(nama),
        status,
        masalah: LABEL_MASALAH[status],
        nama: String(nama || "").trim(),
        jumlahBaris: 0,
        qty: 0,
        harga: num(d.harga),
        pesanan: [],
        kandidat,
        hppManual: manual ? manual.hpp : 0, // > 0 = sudah diisi sementara
        idManual: manual ? manual.id : null,
      };
      masalah.set(kunci, m);
    }
    m.jumlahBaris += 1;
    m.qty += num(d.qty);
    const no = nomorPesanan.get(d.pesanan_id);
    if (no && m.pesanan.length < 3 && !m.pesanan.includes(no)) m.pesanan.push(no);
  };

  for (const d of detail) {
    let hpp = null;
    if (d.sku) {
      hpp = petaHpp.get(d.sku); // item "Dari Data Barang"
      if (hpp == null || hpp <= 0) {
        const man = hppManual.get(normKode(d.sku));
        catat("skuTanpaHpp", d.sku, d, man);
        if (man) hpp = man.hpp;
      }
    } else {
      const r = cocokkanItemManual(indeks, d.nama_produk, d.harga); // item manual
      if (r.status === "cocok") hpp = r.hpp;
      else {
        const man = hppManual.get(normKode(d.nama_produk));
        catat(r.status, d.nama_produk, d, man);
        if (man) hpp = man.hpp; // isian sementara dipakai, tidak dihitung sebagai masalah
        else hitung[r.status] += 1;
      }
    }
    if (hpp == null || hpp <= 0) {
      tanpaHpp += 1;
      continue;
    }
    total += hpp * num(d.qty);
  }
  const gagal = [
    hitung.tidakKetemu && `${hitung.tidakKetemu} item manual tidak ketemu di Master`,
    hitung.ambigu && `${hitung.ambigu} item manual ambigu (beberapa ukuran, HPP berbeda)`,
    hitung.tanpaHpp && `${hitung.tanpaHpp} item manual HPP Master-nya kosong`,
  ].filter(Boolean);
  const daftar = [...masalah.values()].sort((x, y) => y.qty - x.qty);
  return { total: Math.round(total), tanpaHpp, catatan: gagal.join(", "), daftar };
}

async function hppToko(dari, sampai) {
  const rekap = await muatRekapKasir({ session: getSession(), dari, sampai, denganItem: true, denganBayar: false });
  const o = olahRekap({ transaksi: rekap.transaksi, items: rekap.items });
  return { total: Math.round(o.ringkas.hpp || 0), tanpaHpp: o.ringkas.tanpaHpp || 0 };
}

// dari/sampai = "YYYY-MM-DD" (inklusif). Mengembalikan:
// { total, marketplace, grosir, toko, tanpaHpp, galat: {...}, catatan: { grosir?: "..." }, daftar: { grosir?: [...] } }
export async function muatHppPenjualan(dari, sampai) {
  const sumber = { marketplace: hppMarketplace, grosir: hppGrosir, toko: hppToko };
  const hasil = { total: 0, marketplace: 0, grosir: 0, toko: 0, tanpaHpp: 0, galat: {}, catatan: {}, daftar: {} };
  await Promise.all(
    Object.entries(sumber).map(async ([kunci, fn]) => {
      try {
        const r = await fn(dari, sampai);
        hasil[kunci] = r.total;
        hasil.tanpaHpp += r.tanpaHpp || 0;
        if (r.catatan) hasil.catatan[kunci] = r.catatan;
        if (r.daftar?.length) hasil.daftar[kunci] = r.daftar;
      } catch (e) {
        hasil.galat[kunci] = e?.message || "gagal dimuat";
      }
    })
  );
  hasil.total = hasil.marketplace + hasil.grosir + hasil.toko;
  return hasil;
}

// Hook untuk halaman laporan. Mengembalikan { hpp, memuat }. hpp = null selama belum ada
// rentang tanggal lengkap (HPP butuh dari & sampai) atau belum selesai dimuat.
export function useHppPenjualan(dari, sampai) {
  const [state, setState] = useState({ kunci: "", hpp: null });
  const kunci = dari && sampai ? `${dari}|${sampai}` : "";

  useEffect(() => {
    if (!kunci) return undefined;
    let batal = false;
    muatHppPenjualan(dari, sampai)
      .then((hpp) => {
        if (!batal) setState({ kunci, hpp });
      })
      .catch(() => {
        if (!batal) setState({ kunci, hpp: null });
      });
    return () => {
      batal = true;
    };
  }, [kunci, dari, sampai]);

  return { hpp: kunci && state.kunci === kunci ? state.hpp : null, memuat: !!kunci && state.kunci !== kunci };
}
