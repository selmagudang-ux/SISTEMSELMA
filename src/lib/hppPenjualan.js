import { useEffect, useState } from "react";
import { sbAll } from "./api";
import { getSession } from "./auth";
import { bangunIndeksAwalan, cocokkanItemManual } from "./hppGrosirCocok";
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

async function hppGrosir(dari, sampai) {
  const pesanan = await sbAll(`grosir_pesanan?select=id,status&tanggal=gte.${dari}&tanggal=lte.${sampai}`);
  const ids = (pesanan || []).filter((p) => p.status !== "Batal").map((p) => p.id);
  if (ids.length === 0) return { total: 0, tanpaHpp: 0 };

  const [detail, master] = await Promise.all([
    dalamPotongan(ids, 60, (c) =>
      sbAll(`grosir_detail_pesanan?select=sku,qty,nama_produk,harga&pesanan_id=in.(${c.join(",")})`)
    ),
    sbAll("sku_master?select=sku,hpp,grosir"),
  ]);
  const petaHpp = new Map((master || []).map((m) => [m.sku, m.hpp == null ? null : num(m.hpp)]));
  const indeks = bangunIndeksAwalan(master);

  let total = 0;
  let tanpaHpp = 0;
  const manual = { cocok: 0, ambigu: 0, tidakKetemu: 0, tanpaHpp: 0 };
  for (const d of detail) {
    let hpp = null;
    if (d.sku) {
      hpp = petaHpp.get(d.sku); // item "Dari Data Barang"
    } else {
      const r = cocokkanItemManual(indeks, d.nama_produk, d.harga); // item manual
      manual[r.status] += 1;
      hpp = r.status === "cocok" ? r.hpp : null;
    }
    if (hpp == null || hpp <= 0) {
      tanpaHpp += 1;
      continue;
    }
    total += hpp * num(d.qty);
  }
  const gagal = [
    manual.tidakKetemu && `${manual.tidakKetemu} item manual tidak ketemu di Master`,
    manual.ambigu && `${manual.ambigu} item manual ambigu (beberapa ukuran, HPP berbeda)`,
    manual.tanpaHpp && `${manual.tanpaHpp} item manual HPP Master-nya kosong`,
  ].filter(Boolean);
  return { total: Math.round(total), tanpaHpp, catatan: gagal.join(", ") };
}

async function hppToko(dari, sampai) {
  const rekap = await muatRekapKasir({ session: getSession(), dari, sampai, denganItem: true, denganBayar: false });
  const o = olahRekap({ transaksi: rekap.transaksi, items: rekap.items });
  return { total: Math.round(o.ringkas.hpp || 0), tanpaHpp: o.ringkas.tanpaHpp || 0 };
}

// dari/sampai = "YYYY-MM-DD" (inklusif). Mengembalikan:
// { total, marketplace, grosir, toko, tanpaHpp, galat: {...}, catatan: { grosir?: "..." } }
export async function muatHppPenjualan(dari, sampai) {
  const sumber = { marketplace: hppMarketplace, grosir: hppGrosir, toko: hppToko };
  const hasil = { total: 0, marketplace: 0, grosir: 0, toko: 0, tanpaHpp: 0, galat: {}, catatan: {} };
  await Promise.all(
    Object.entries(sumber).map(async ([kunci, fn]) => {
      try {
        const r = await fn(dari, sampai);
        hasil[kunci] = r.total;
        hasil.tanpaHpp += r.tanpaHpp || 0;
        if (r.catatan) hasil.catatan[kunci] = r.catatan;
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
