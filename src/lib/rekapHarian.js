// =========================================================
// REKAP HARIAN — perpindahan BARANG & UANG ANTAR TEMPAT pada satu hari.
// Tidak ada tabel baru; datanya dirangkum dari tabel yang sudah ada:
//   Barang  Gudang <-> Toko    : toko_stok_mutasi (jenis mutasi_masuk / mutasi_keluar,
//                                ditulis fungsi toko_mutasi_dari_gudang & toko_kembalikan_ke_gudang)
//   Barang  Antar Entitas      : transfer_barang (dikirim / diterima / ditolak / dibatalkan)
//   Uang    Antar Entitas      : keuangan_transaksi tipe "transfer" ber-penanda (modal, pinjaman, setoran, ...)
//   Uang    Antar Kas          : keuangan_transaksi tipe "transfer" tanpa penanda (Kas Besar -> Kas Kecil, dst)
// Penjualan, opname, dan perubahan stok biasa SENGAJA tidak ikut.
// =========================================================
import { sb, sbAll, fmtRp, PENANDA_ANTAR_ENTITAS } from "./api";

const jam = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

// Satu hari penuh menurut WIB (UTC+7).
export function rentangHariWib(tgl) {
  const awal = new Date(`${tgl}T00:00:00+07:00`);
  const akhir = new Date(awal.getTime() + 24 * 3600 * 1000);
  return { dari: awal.toISOString(), sampai: akhir.toISOString(), awalMs: awal.getTime(), akhirMs: akhir.getTime() };
}

const dalamHari = (iso, r) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.awalMs && t < r.akhirMs;
};

const urutWaktu = (a, b) => String(a._t || "").localeCompare(String(b._t || ""));

// Tarik data barang. toko_stok_mutasi & master_toko otomatis difilter per PT oleh sb()/sbAll();
// transfer_barang difilter manual (PT asal ATAU tujuan), sama seperti halaman Transfer Antar Entitas.
export async function ambilPerpindahanBarang(tgl, entitas) {
  const r = rentangHariWib(tgl);
  const q = `created_at=gte.${encodeURIComponent(r.dari)}&created_at=lt.${encodeURIComponent(r.sampai)}&order=created_at.asc`;
  const [mutasi, transfer, tokoMaster] = await Promise.all([
    sbAll(`toko_stok_mutasi?select=*&jenis=in.(mutasi_masuk,mutasi_keluar)&${q}`),
    sb(`transfer_barang?or=(entitas_asal.eq.${entitas},entitas_tujuan.eq.${entitas})&order=created_at.desc&limit=300`).catch(() => []),
    sbAll("master_toko?select=kode,nama").catch(() => []),
  ]);
  return { mutasi: mutasi || [], transfer: transfer || [], tokoMaster: tokoMaster || [] };
}

const jumlahItem = (items, kunci = "qty") => (items || []).reduce((a, it) => a + (Number(it[kunci]) || 0), 0);
const daftarItem = (items, kunci = "qty") =>
  (items || [])
    .map((it) => ({ sku: it.sku, qty: Number(it[kunci]) || 0 }))
    .filter((it) => it.qty > 0)
    .map((it) => `${it.sku} x${it.qty}`)
    .join(", ");

export function susunRekap({ tgl, tglLabel, transaksi, mutasi, transfer, tokoMaster, master, namaUsaha }) {
  const r = rentangHariWib(tgl);
  const namaEnt = (kode) => labelDari(master?.entitas, kode);
  const rekening = master?.rekening || [];
  const namaToko = new Map((tokoMaster || []).map((t) => [t.kode, t.nama]));

  // ---------- BARANG: Gudang <-> Toko ----------
  const gudangToko = (mutasi || [])
    .map((m) => {
      const keToko = m.jenis === "mutasi_masuk";
      return {
        _t: m.created_at,
        jam: jam(m.created_at),
        arah: keToko ? "ke_toko" : "ke_gudang",
        arahLabel: keToko ? "Gudang -> Toko" : "Toko -> Gudang",
        sku: m.ref || "",
        kodeToko: m.kode,
        namaToko: namaToko.get(m.kode) || "",
        qty: Math.abs(Number(m.qty_change) || 0),
        catatan: m.catatan || "",
      };
    })
    .sort(urutWaktu);
  const keToko = gudangToko.filter((b) => b.arah === "ke_toko").reduce((a, b) => a + b.qty, 0);
  const keGudang = gudangToko.filter((b) => b.arah === "ke_gudang").reduce((a, b) => a + b.qty, 0);

  // ---------- BARANG: Antar Entitas ----------
  const antarEntitas = [];
  (transfer || []).forEach((t) => {
    const dasar = { kode: t.kode, asal: namaEnt(t.entitas_asal), tujuan: namaEnt(t.entitas_tujuan) };
    if (dalamHari(t.created_at, r)) {
      antarEntitas.push({
        ...dasar,
        _t: t.created_at,
        jam: jam(t.created_at),
        jenis: "Dikirim",
        qty: jumlahItem(t.items, "qty"),
        daftar: daftarItem(t.items, "qty"),
        catatan: t.catatan || "",
        petugas: t.dibuat_oleh_nama || "",
      });
    }
    if ((t.status === "diterima" || t.status === "ditolak") && dalamHari(t.diterima_at, r)) {
      const diterima = t.status === "diterima";
      antarEntitas.push({
        ...dasar,
        _t: t.diterima_at,
        jam: jam(t.diterima_at),
        jenis: diterima ? "Diterima" : "Ditolak",
        qty: diterima ? jumlahItem(t.items, "qty_diterima") : jumlahItem(t.items, "qty"),
        daftar: diterima ? daftarItem(t.items, "qty_diterima") : daftarItem(t.items, "qty"),
        selisih: diterima ? jumlahItem(t.items, "qty") - jumlahItem(t.items, "qty_diterima") : 0,
        catatan: t.catatan_terima || "",
        petugas: t.diterima_oleh_nama || "",
      });
    }
  });
  antarEntitas.sort(urutWaktu);

  // Transfer yang masih di jalan (belum dikonfirmasi penerima), berapa pun umurnya.
  const menggantung = (transfer || [])
    .filter((t) => t.status === "dikirim")
    .map((t) => ({
      kode: t.kode,
      asal: namaEnt(t.entitas_asal),
      tujuan: namaEnt(t.entitas_tujuan),
      qty: jumlahItem(t.items, "qty"),
      sejak: t.created_at ? new Date(t.created_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short" }) : "",
    }));

  // ---------- UANG ----------
  const uangSemua = (transaksi || [])
    .filter((t) => t.tipe === "transfer" && t.tanggal === tgl)
    .map((t) => ({
      _t: t.created_at,
      jam: jam(t.created_at),
      antarEntitas: !!t.penanda,
      jenis: t.penanda ? PENANDA_ANTAR_ENTITAS[t.penanda] || t.penanda : "Transfer antar kas",
      dari: labelDari(rekening, t.rekening),
      ke: labelDari(rekening, t.rekening_tujuan),
      jumlah: Number(t.jumlah) || 0,
      keterangan: t.keterangan || "",
      rincian: Array.isArray(t.rincian_setoran) ? t.rincian_setoran.length : 0,
    }))
    .sort(urutWaktu);
  const uangAntarEntitas = uangSemua.filter((u) => u.antarEntitas);
  const uangAntarKas = uangSemua.filter((u) => !u.antarEntitas);
  const total = (arr) => arr.reduce((a, u) => a + u.jumlah, 0);

  return {
    tgl,
    tglLabel: tglLabel || tgl,
    namaUsaha: namaUsaha || "SELMA",
    barang: {
      gudangToko,
      keToko,
      keGudang,
      antarEntitas,
      dikirimQty: antarEntitas.filter((b) => b.jenis === "Dikirim").reduce((a, b) => a + b.qty, 0),
      diterimaQty: antarEntitas.filter((b) => b.jenis === "Diterima").reduce((a, b) => a + b.qty, 0),
      menggantung,
    },
    uang: {
      antarEntitas: uangAntarEntitas,
      antarKas: uangAntarKas,
      totalAntarEntitas: total(uangAntarEntitas),
      totalAntarKas: total(uangAntarKas),
    },
  };
}

export function adaIsi(r) {
  return !!(
    r.barang.gudangToko.length ||
    r.barang.antarEntitas.length ||
    r.barang.menggantung.length ||
    r.uang.antarEntitas.length ||
    r.uang.antarKas.length
  );
}

// ---------- Teks WhatsApp (ringkas; detail lengkap ada di PDF) ----------
export function rekapKeTeksWa(r, maks = 8) {
  const L = [`*REKAP PERPINDAHAN ${String(r.namaUsaha).toUpperCase()}*`, r.tglLabel, ""];
  const potong = (arr, fmt) => {
    arr.slice(0, maks).forEach((x) => L.push(fmt(x)));
    if (arr.length > maks) L.push(`...dan ${arr.length - maks} lainnya`);
  };

  L.push("*BARANG: GUDANG <-> TOKO*");
  if (!r.barang.gudangToko.length) L.push("Tidak ada.");
  else {
    L.push(`Ke Toko: ${r.barang.keToko} pcs | Ke Gudang: ${r.barang.keGudang} pcs`);
    potong(r.barang.gudangToko, (b) => `${b.arahLabel} | ${b.sku} x${b.qty}`);
  }

  L.push("", "*BARANG: ANTAR ENTITAS*");
  if (!r.barang.antarEntitas.length) L.push("Tidak ada.");
  else potong(r.barang.antarEntitas, (b) => `${b.jenis} ${b.kode} | ${b.asal} -> ${b.tujuan} | ${b.qty} pcs${b.selisih > 0 ? ` (selisih ${b.selisih})` : ""}`);
  if (r.barang.menggantung.length) {
    L.push("", "*MASIH DI JALAN (belum diterima)*");
    potong(r.barang.menggantung, (b) => `${b.kode} | ${b.asal} -> ${b.tujuan} | ${b.qty} pcs | sejak ${b.sejak}`);
  }

  L.push("", "*UANG: ANTAR ENTITAS*");
  if (!r.uang.antarEntitas.length) L.push("Tidak ada.");
  else {
    L.push(`Total: ${fmtRp(r.uang.totalAntarEntitas)}`);
    potong(r.uang.antarEntitas, (u) => `${u.jenis} | ${u.dari} -> ${u.ke} | ${fmtRp(u.jumlah)}`);
  }

  L.push("", "*UANG: ANTAR KAS*");
  if (!r.uang.antarKas.length) L.push("Tidak ada.");
  else {
    L.push(`Total: ${fmtRp(r.uang.totalAntarKas)}`);
    potong(r.uang.antarKas, (u) => `${u.dari} -> ${u.ke} | ${fmtRp(u.jumlah)}`);
  }

  L.push("", "_Detail lengkap ada di PDF Rekap Perpindahan._");
  return L.join("\n");
}
