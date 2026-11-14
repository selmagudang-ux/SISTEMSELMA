// =========================================================
// REKAP PERPINDAHAN — barang & uang yang PINDAH ANTAR TEMPAT dalam satu rentang
// tanggal (harian / mingguan / bulanan). Tidak ada tabel baru; datanya dirangkum
// dari tabel yang sudah ada:
//   Barang  Gudang <-> Toko : toko_stok_mutasi (jenis mutasi_masuk / mutasi_keluar,
//                             ditulis fungsi toko_mutasi_dari_gudang & toko_kembalikan_ke_gudang)
//   Barang  Antar Entitas   : transfer_barang (dikirim / diterima / ditolak / dibatalkan)
//   Uang    Antar Entitas   : keuangan_transaksi tipe "transfer" ber-penanda (modal, pinjaman, setoran, ...)
//   Uang    Antar Kas       : keuangan_transaksi tipe "transfer" tanpa penanda (Kas Besar -> Kas Kecil, dst)
//   Uang    Transaksi       : SEMUA keuangan_transaksi (pemasukan, pengeluaran, transfer) pada rentang terpilih
// Penjualan, opname, dan perubahan stok biasa SENGAJA tidak ikut.
// Semua tanggal dihitung menurut WIB (UTC+7).
// =========================================================
import { sbAll, fmtRp, PENANDA_ANTAR_ENTITAS } from "./api";

const WIB = "Asia/Jakarta";
const enc = encodeURIComponent;

const jam = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { timeZone: WIB, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
const tglPendekIso = (iso) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { timeZone: WIB, day: "2-digit", month: "short" }) : "";
// "2026-11-05" (kolom date) -> "05 Nov"
const tglPendekTanggal = (tgl) =>
  tgl ? new Date(`${tgl}T12:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: WIB, day: "2-digit", month: "short" }) : "";

const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

// dari & sampai = "YYYY-MM-DD" (sama-sama termasuk). Rentang penuh menurut WIB.
export function rentangWib(dari, sampai) {
  const awal = new Date(`${dari}T00:00:00+07:00`);
  const akhir = new Date(new Date(`${sampai}T00:00:00+07:00`).getTime() + 24 * 3600 * 1000);
  return { dari: awal.toISOString(), sampai: akhir.toISOString(), awalMs: awal.getTime(), akhirMs: akhir.getTime() };
}

const dalamRentang = (iso, r) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.awalMs && t < r.akhirMs;
};

const urutWaktu = (a, b) => String(a._t || "").localeCompare(String(b._t || ""));

// Tarik data barang. toko_stok_mutasi & master_toko otomatis difilter per PT oleh sbAll();
// transfer_barang difilter manual (PT asal ATAU tujuan), sama seperti halaman Transfer Antar Entitas.
export async function ambilPerpindahanBarang(dari, sampai, entitas) {
  const r = rentangWib(dari, sampai);
  const qBuat = `created_at=gte.${enc(r.dari)}&created_at=lt.${enc(r.sampai)}`;
  const qTerima = `diterima_at=gte.${enc(r.dari)}&diterima_at=lt.${enc(r.sampai)}`;
  const ent = `or=(entitas_asal.eq.${entitas},entitas_tujuan.eq.${entitas})`;
  const [mutasi, tBuat, tTerima, tJalan, tokoMaster] = await Promise.all([
    sbAll(`toko_stok_mutasi?select=*&jenis=in.(mutasi_masuk,mutasi_keluar)&${qBuat}&order=created_at.asc`),
    sbAll(`transfer_barang?select=*&${ent}&${qBuat}&order=created_at.asc`).catch(() => []),
    sbAll(`transfer_barang?select=*&${ent}&${qTerima}&order=created_at.asc`).catch(() => []),
    sbAll(`transfer_barang?select=*&${ent}&status=eq.dikirim&order=created_at.asc`).catch(() => []),
    sbAll("master_toko?select=kode,nama").catch(() => []),
  ]);
  // Gabung tanpa dobel (satu transfer bisa muncul di beberapa query).
  const peta = new Map();
  [...(tBuat || []), ...(tTerima || []), ...(tJalan || [])].forEach((t) => peta.set(t.id, t));
  return { mutasi: mutasi || [], transfer: [...peta.values()], tokoMaster: tokoMaster || [] };
}

const jumlahItem = (items, kunci = "qty") => (items || []).reduce((a, it) => a + (Number(it[kunci]) || 0), 0);
const daftarItem = (items, kunci = "qty") =>
  (items || [])
    .map((it) => ({ sku: it.sku, qty: Number(it[kunci]) || 0 }))
    .filter((it) => it.qty > 0)
    .map((it) => `${it.sku} x${it.qty}`)
    .join(", ");

export function susunRekap({ dari, sampai, modeLabel, labelRentang, transaksi, mutasi, transfer, tokoMaster, master, namaUsaha }) {
  const r = rentangWib(dari, sampai);
  const namaEnt = (kode) => labelDari(master?.entitas, kode);
  const rekening = master?.rekening || [];
  const namaToko = new Map((tokoMaster || []).map((t) => [t.kode, t.nama]));
  const waktu = (iso) => `${tglPendekIso(iso)} ${jam(iso)}`;

  // ---------- BARANG: Gudang <-> Toko ----------
  const gudangToko = (mutasi || [])
    .map((m) => {
      const keToko = m.jenis === "mutasi_masuk";
      return {
        id: m.id,
        _t: m.created_at,
        waktu: waktu(m.created_at),
        tglPendek: tglPendekIso(m.created_at),
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

  // Ringkasan per SKU (enak dibaca kalau rentangnya panjang).
  const perSkuMap = new Map();
  gudangToko.forEach((b) => {
    const cur = perSkuMap.get(b.sku) || { sku: b.sku, keToko: 0, keGudang: 0 };
    if (b.arah === "ke_toko") cur.keToko += b.qty;
    else cur.keGudang += b.qty;
    perSkuMap.set(b.sku, cur);
  });
  const perSku = [...perSkuMap.values()].sort((a, b) => b.keToko + b.keGudang - (a.keToko + a.keGudang));

  // ---------- BARANG: Antar Entitas ----------
  const antarEntitas = [];
  (transfer || []).forEach((t) => {
    const dasar = { kode: t.kode, asal: namaEnt(t.entitas_asal), tujuan: namaEnt(t.entitas_tujuan) };
    if (dalamRentang(t.created_at, r)) {
      antarEntitas.push({
        ...dasar,
        _t: t.created_at,
        waktu: waktu(t.created_at),
        tglPendek: tglPendekIso(t.created_at),
        jenis: "Dikirim",
        qty: jumlahItem(t.items, "qty"),
        daftar: daftarItem(t.items, "qty"),
        selisih: 0,
        catatan: t.catatan || "",
        petugas: t.dibuat_oleh_nama || "",
      });
    }
    if ((t.status === "diterima" || t.status === "ditolak") && dalamRentang(t.diterima_at, r)) {
      const diterima = t.status === "diterima";
      antarEntitas.push({
        ...dasar,
        _t: t.diterima_at,
        waktu: waktu(t.diterima_at),
        tglPendek: tglPendekIso(t.diterima_at),
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

  // Transfer yang masih di jalan (belum dikonfirmasi penerima) SAAT INI, berapa pun umurnya.
  const menggantung = (transfer || [])
    .filter((t) => t.status === "dikirim")
    .map((t) => ({
      kode: t.kode,
      asal: namaEnt(t.entitas_asal),
      tujuan: namaEnt(t.entitas_tujuan),
      qty: jumlahItem(t.items, "qty"),
      sejak: tglPendekIso(t.created_at),
    }));

  // ---------- UANG ----------
  const uangSemua = (transaksi || [])
    .filter((t) => t.tipe === "transfer" && t.tanggal >= dari && t.tanggal <= sampai)
    .map((t) => ({
      _t: `${t.tanggal} ${t.created_at || ""}`,
      waktu: `${tglPendekTanggal(t.tanggal)} ${jam(t.created_at)}`.trim(),
      tglPendek: tglPendekTanggal(t.tanggal),
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

  // Semua transaksi keuangan (pemasukan, pengeluaran, transfer) yang tanggalnya masuk rentang.
  const JENIS_TRX = { masuk: "Pemasukan", keluar: "Pengeluaran", transfer: "Transfer" };
  const transaksiRentang = (transaksi || [])
    .filter((t) => JENIS_TRX[t.tipe] && t.tanggal >= dari && t.tanggal <= sampai)
    .map((t) => {
      const transfer = t.tipe === "transfer";
      const daftarKat = t.tipe === "masuk" ? master?.kategori_masuk : master?.kategori_keluar;
      return {
        _t: `${t.tanggal} ${t.created_at || ""}`,
        waktu: `${tglPendekTanggal(t.tanggal)} ${jam(t.created_at)}`.trim(),
        tglPendek: tglPendekTanggal(t.tanggal),
        tipe: t.tipe,
        jenis: transfer && t.penanda ? PENANDA_ANTAR_ENTITAS[t.penanda] || t.penanda : JENIS_TRX[t.tipe],
        rekening: transfer
          ? `${labelDari(rekening, t.rekening)} -> ${labelDari(rekening, t.rekening_tujuan)}`
          : labelDari(rekening, t.rekening),
        kategori: transfer ? "" : labelDari(daftarKat, t.kategori),
        keterangan: t.keterangan || "",
        jumlah: Number(t.jumlah) || 0,
      };
    })
    .sort(urutWaktu);
  const trxMasuk = transaksiRentang.filter((x) => x.tipe === "masuk");
  const trxKeluar = transaksiRentang.filter((x) => x.tipe === "keluar");
  const trxTransfer = transaksiRentang.filter((x) => x.tipe === "transfer");

  return {
    dari,
    sampai,
    multiHari: dari !== sampai,
    modeLabel: modeLabel || "Harian",
    labelRentang: labelRentang || (dari === sampai ? dari : `${dari} s/d ${sampai}`),
    namaUsaha: namaUsaha || "SELMA",
    barang: {
      gudangToko,
      keToko,
      keGudang,
      perSku,
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
      transaksi: transaksiRentang,
      totalMasuk: total(trxMasuk),
      totalKeluar: total(trxKeluar),
      totalTransfer: total(trxTransfer),
      jumlahMasuk: trxMasuk.length,
      jumlahKeluar: trxKeluar.length,
      jumlahTransfer: trxTransfer.length,
    },
  };
}

export function adaIsi(r) {
  return !!(
    r.barang.gudangToko.length ||
    r.barang.antarEntitas.length ||
    r.barang.menggantung.length ||
    r.uang.antarEntitas.length ||
    r.uang.transaksi.length
  );
}

// ---------- Teks WhatsApp (ringkas; detail lengkap ada di PDF) ----------
export function rekapKeTeksWa(r, maks = 8) {
  const L = [`*REKAP PERPINDAHAN ${r.modeLabel.toUpperCase()} - ${String(r.namaUsaha).toUpperCase()}*`, r.labelRentang, ""];
  const awal = (x) => (r.multiHari ? `${x.tglPendek} ` : "");
  const potong = (arr, fmt) => {
    arr.slice(0, maks).forEach((x) => L.push(fmt(x)));
    if (arr.length > maks) L.push(`...dan ${arr.length - maks} lainnya`);
  };

  L.push("*BARANG: GUDANG <-> TOKO*");
  if (!r.barang.gudangToko.length) L.push("Tidak ada.");
  else {
    L.push(`Ke Toko: ${r.barang.keToko} pcs | Ke Gudang: ${r.barang.keGudang} pcs`);
    if (r.multiHari) {
      potong(r.barang.perSku, (s) => `${s.sku}: ke toko ${s.keToko}${s.keGudang ? `, ke gudang ${s.keGudang}` : ""}`);
    } else {
      potong(r.barang.gudangToko, (b) => `${b.arahLabel} | ${b.sku} x${b.qty}`);
    }
  }

  L.push("", "*BARANG: ANTAR ENTITAS*");
  if (!r.barang.antarEntitas.length) L.push("Tidak ada.");
  else {
    L.push(`Dikirim: ${r.barang.dikirimQty} pcs | Diterima: ${r.barang.diterimaQty} pcs`);
    potong(r.barang.antarEntitas, (b) => `${awal(b)}${b.jenis} ${b.kode} | ${b.asal} -> ${b.tujuan} | ${b.qty} pcs${b.selisih > 0 ? ` (selisih ${b.selisih})` : ""}`);
  }
  if (r.barang.menggantung.length) {
    L.push("", "*MASIH DI JALAN (belum diterima)*");
    potong(r.barang.menggantung, (b) => `${b.kode} | ${b.asal} -> ${b.tujuan} | ${b.qty} pcs | sejak ${b.sejak}`);
  }

  L.push("", "*UANG: ANTAR ENTITAS*");
  if (!r.uang.antarEntitas.length) L.push("Tidak ada.");
  else {
    L.push(`Total: ${fmtRp(r.uang.totalAntarEntitas)}`);
    potong(r.uang.antarEntitas, (u) => `${awal(u)}${u.jenis} | ${u.dari} -> ${u.ke} | ${fmtRp(u.jumlah)}`);
  }

  L.push("", "*TRANSAKSI SELAMA PERIODE TERPILIH*");
  if (!r.uang.transaksi.length) L.push("Tidak ada.");
  else {
    L.push(`Pemasukan: ${fmtRp(r.uang.totalMasuk)} | Pengeluaran: ${fmtRp(r.uang.totalKeluar)} | Transfer: ${fmtRp(r.uang.totalTransfer)}`);
    potong(r.uang.transaksi, (u) => {
      const tanda = u.tipe === "masuk" ? "+" : u.tipe === "keluar" ? "-" : "";
      const info = u.tipe === "transfer" ? u.rekening : [u.kategori, u.keterangan].filter(Boolean).join(" - ") || u.rekening;
      return `${awal(u)}${u.jenis} | ${info} | ${tanda}${fmtRp(u.jumlah)}`;
    });
  }

  L.push("", "_Detail lengkap ada di PDF Rekap Perpindahan._");
  return L.join("\n");
}
