import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, ChevronDown, ChevronRight, Search, AlertTriangle, RefreshCw, Link2,
  TrendingUp, Receipt, Package, Wallet, Download, Megaphone,
} from "lucide-react";
import { StatCard, EmptyState, Badge, inputClass, btnFilled, btnTonal, btnOutlined, btnText, formatTanggalID } from "../components/ui";
import { sb, sbAll, fmtRp, downloadCsv } from "../lib/api";
import { downloadXlsx } from "../lib/exportData";
import { parseLaporanPenghasilan, parseExportPesanan, parseLaporanIklan, parseRincianIklanOtomatis, gabungIklan, parseMassUpdate, bangunIndeksProduk, bagiIklanKeSku, biayaIklanDiRentang, bangunBaris, normSku, buangKodeRak, cariMaster, sbTulis, FIELD_BIAYA, produkDariBaris, normJudul } from "../lib/marketplaceImport";

// =========================================================
// RINCIAN PENJUALAN MARKETPLACE (per toko) — SKU, HPP, biaya dari marketplace,
// laba bersih. Sumber data: import 2 file Shopee (lihat lib/marketplaceImport.js).
//
// Rumus (per pesanan):
//   Dana Dilepas   = angka "Total Penghasilan" Shopee (sudah dipotong semua biaya,
//                    voucher penjual, selisih ongkir, PPh, refund)
//   Potongan       = Harga Produk + Refund - Dana Dilepas   (= total biaya marketplace)
//   HPP            = HPP satuan SKU (sku_master.hpp) x (qty - qty retur)
//   Laba Bersih    = Dana Dilepas - HPP
// Pesanan yang SKU-nya belum cocok / belum ada datanya TIDAK ikut dihitung ke
// Laba & HPP (supaya laba tidak kelihatan semu besar) — jumlahnya ditampilkan.
//
// Biaya iklan (import CSV "Data Keseluruhan Iklan" -> tabel marketplace_iklan) dikurangkan
// SEKALI di level total periode: Laba Bersih Setelah Iklan = Laba Bersih - Biaya Iklan.
// Di tab Per SKU, biaya iklan tiap produk dibagi ke SKU-nya sesuai porsi omzet (perkiraan) lewat
// pemetaan Kode Produk -> judul/SKU dari import Mass Update (tabel marketplace_produk_map).
// Yang tidak bisa dibagi tetap ikut di total dan ditampilkan sebagai "iklan tidak terbagi".
//
// TIDAK menyentuh saldo toko (marketplace_transaksi) maupun Keuangan.
// =========================================================

const PER_HALAMAN = 50;
const LABEL_BIAYA = {
  voucher_penjual: "Voucher/diskon penjual",
  biaya_admin: "Biaya administrasi",
  biaya_proses: "Biaya proses pesanan",
  biaya_ongkir_xtra: "Gratis Ongkir XTRA",
  biaya_layanan: "Layanan Promo XTRA / transaksi",
  biaya_ams: "Komisi AMS",
  biaya_kampanye: "Biaya kampanye",
  biaya_isi_saldo: "Isi saldo iklan (otomatis)",
  biaya_promosi: "Promosi (data lama, belum dipisah)",
  biaya_lain: "Biaya lainnya",
  pajak: "PPh 22",
  ongkir_net: "Selisih ongkir",
};

const pad = (n) => String(n).padStart(2, "0");
const isoHariIni = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isoAwalBulan = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };
const isoAwalBulanLalu = () => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`; };
const isoAkhirBulanLalu = () => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth(), 0); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const n0 = (v) => Number(v) || 0;
// kunci baris di tabel Per SKU (dipakai juga untuk membagi biaya iklan)
// Pesanan yang belum punya data SKU (belum ada Export Pesanan) dikumpulkan di satu kelompok khusus,
// BUKAN memakai judul produk sebagai pengganti SKU supaya tidak tercampur dengan SKU asli.
const KUNCI_TANPA_SKU = "(belum ada data SKU)";
const kunciSku = (b) => b.sku || b.sku_referensi || KUNCI_TANPA_SKU;
const qtyBersih = (b) => (b.qty == null ? null : Math.max(0, n0(b.qty) - n0(b.qty_retur)));
// HPP baris: null kalau belum bisa dihitung (SKU belum cocok / qty tidak diketahui)
const hppBaris = (b) => (b.hpp_satuan == null || b.qty == null ? null : n0(b.hpp_satuan) * qtyBersih(b));
const potonganBaris = (b) => n0(b.harga_produk) + n0(b.refund) - n0(b.dana_dilepas);

// ---- pengurutan kolom (Per Pesanan & Per SKU) ----
// nilai kosong (mis. HPP belum lengkap) selalu di paling bawah, apa pun arahnya
const bandingkan = (a, b, arah) => {
  const an = a == null, bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  const r = typeof a === "string" ? a.localeCompare(b, "id", { numeric: true }) : a - b;
  return arah === "asc" ? r : -r;
};
// Etalase yang terjual di satu pesanan = judul produk Shopee-nya (satu pesanan bisa berisi beberapa etalase)
const etalasePesanan = (p) => [...new Set(p.lines.map((l) => (l.nama_produk || "").trim()).filter(Boolean))];
const AKSES_PESANAN = {
  no: (p) => p.no || "",
  dibuat: (p) => p.dibuat || "",
  tanggal: (p) => p.tanggal || "",
  etalase: (p) => etalasePesanan(p)[0] || "",
  sku: (p) => p.lines[0]?.sku || p.lines[0]?.sku_referensi || "",
  penjualan: (p) => p.r.penjualan,
  potongan: (p) => p.r.potongan,
  dana: (p) => p.r.dana,
  hpp: (p) => (p.r.hppLengkap ? p.r.hpp : null),
  laba: (p) => (p.r.hppLengkap ? p.r.laba : null),
};
const adaHpp = (s) => s.danaLengkap > 0 || s.hpp > 0;
const AKSES_SKU = {
  kunci: (s) => s.kunci,
  qty: (s) => s.qty,
  penjualan: (s) => s.r.penjualan,
  potongan: (s) => s.r.potongan,
  dana: (s) => s.r.dana,
  hpp: (s) => (adaHpp(s) ? s.hpp : null),
  laba: (s) => (adaHpp(s) ? s.laba : null),
  margin: (s) => (s.danaLengkap > 0 ? s.laba / s.danaLengkap : null),
  iklan: (s) => (s.iklan > 0 ? s.iklan : null),
  labaSetelah: (s) => (adaHpp(s) ? s.laba - s.iklan : null),
};
// Per Etalase: satu baris = satu produk/listing Shopee (Kode Produk). Iklan Shopee berjalan per etalase,
// jadi biaya iklan di sini angka asli, tidak dibagi-bagi ke SKU.
const bisaLabaEtalase = (e) => e.adaHpp || (e.lines.length === 0 && e.iklan > 0);
const AKSES_ETALASE = {
  kunci: (e) => e.nama || e.kunci,
  qty: (e) => e.qty,
  penjualan: (e) => e.r.penjualan,
  dana: (e) => e.r.dana,
  hpp: (e) => (e.adaHpp ? e.hpp : null),
  laba: (e) => (e.adaHpp ? e.laba : null),
  iklan: (e) => (e.iklan > 0 ? e.iklan : null),
  labaSetelah: (e) => (bisaLabaEtalase(e) ? e.labaSetelah : null),
  margin: (e) => (e.danaLengkap > 0 ? e.labaSetelah / e.danaLengkap : null),
};
// klik judul kolom: kolom baru -> teks naik (A-Z) / angka turun (terbesar dulu); klik lagi membalik arah
function ubahUrut(set, k) {
  set((u) => (u && u.k === k ? { k, d: u.d === "asc" ? "desc" : "asc" } : { k, d: k === "kunci" || k === "sku" || k === "no" || k === "etalase" ? "asc" : "desc" }));
}
function ThUrut({ label, k, urut, onUrut, kanan = true, children }) {
  const aktif = urut?.k === k;
  return (
    <th className={`px-3 py-2.5 font-medium ${kanan ? "text-right" : ""}`} aria-sort={aktif ? (urut.d === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onUrut(k)} className={`inline-flex items-center gap-1 hover:text-md-on-surface ${aktif ? "text-md-on-surface" : ""}`}>
        {label}{children}
        <span className={aktif ? "" : "opacity-30"}>{aktif ? (urut.d === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function ringkasBaris(list) {
  const r = { penjualan: 0, refund: 0, potongan: 0, dana: 0, hpp: 0, laba: 0, qty: 0, hppLengkap: true, barisTanpaHpp: 0 };
  for (const b of list) {
    r.penjualan += n0(b.harga_produk);
    r.refund += n0(b.refund);
    r.potongan += potonganBaris(b);
    r.dana += n0(b.dana_dilepas);
    r.qty += qtyBersih(b) || 0;
    const h = hppBaris(b);
    if (h == null) { r.hppLengkap = false; r.barisTanpaHpp++; } else r.hpp += h;
  }
  r.laba = r.dana - r.hpp;
  return r;
}

export default function PenjualanRincian({ platform, toko, skuMaster, showToast }) {
  const tokoKode = toko.kode || "";
  const [dari, setDari] = useState(isoAwalBulan());
  const [sampai, setSampai] = useState(isoHariIni());
  const [dataDb, setData] = useState([]); // baris apa adanya dari database
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tampil, setTampil] = useState("pesanan"); // pesanan | sku
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [buka, setBuka] = useState({});
  const [importOpen, setImportOpen] = useState(false);
  const [aliasList, setAliasList] = useState([]);
  const [hanyaRefund, setHanyaRefund] = useState(false);
  const [urutPesanan, setUrutPesanan] = useState(null); // null = urutan asli (tanggal dana dilepas terbaru)
  const [urutSku, setUrutSku] = useState({ k: "laba", d: "desc" });
  const [urutEtalase, setUrutEtalase] = useState({ k: "labaSetelah", d: "desc" });
  const [iklanOpen, setIklanOpen] = useState(false);
  const [iklanRows, setIklanRows] = useState([]); // baris marketplace_iklan yang periodenya menyentuh rentang tampilan
  const [petaOpen, setPetaOpen] = useState(false);
  const [petaProduk, setPetaProduk] = useState([]); // pemetaan Kode Produk -> judul/SKU (marketplace_produk_map)
  const [petaAda, setPetaAda] = useState(true);
  const [iklanTabelAda, setIklanTabelAda] = useState(true);
  const [rentangImport, setRentangImport] = useState(null); // periode data yang baru diimport (tidak memindahkan filter otomatis)

  const skuMap = useMemo(() => {
    const m = new Map();
    for (const s of skuMaster || []) if (s.sku) m.set(normSku(s.sku), s);
    return m;
  }, [skuMaster]);
  const aliasMap = useMemo(() => new Map(aliasList.map((a) => [normSku(a.referensi), a.sku])), [aliasList]);

  // Baris yang di database masih "belum cocok" dicocokkan lagi di layar dengan Master Barang TERBARU,
  // jadi SKU yang baru ditambahkan ke Master langsung terbaca tanpa menunggu tombol "Cocokkan ulang SKU".
  // Penanda _live = cocok di layar tapi belum tersimpan ke database (tombol Cocokkan ulang yang menyimpannya).
  const data = useMemo(() => dataDb.map((b) => {
    if (b.sku || !b.sku_referensi) return b;
    const m = cariMaster(b.sku_referensi, aliasMap, skuMap);
    return m ? { ...b, sku: m.sku, hpp_satuan: m.hpp != null ? Number(m.hpp) : null, _live: true } : b;
  }), [dataDb, aliasMap, skuMap]);
  const adaBelumTersimpan = useMemo(() => data.some((b) => b._live), [data]);

  const filterToko = `platform=eq.${platform}&toko=eq.${encodeURIComponent(tokoKode)}`;

  // Penjaga urutan: kalau filter diganti cepat, hanya respons dari permintaan TERAKHIR yang dipakai
  const urutanMuat = useRef(0);
  const muat = useCallback(async () => {
    const id = ++urutanMuat.current;
    const terbaru = () => id === urutanMuat.current;
    setLoading(true);
    setErr("");
    try {
      const [rows, alias] = await Promise.all([
        sbAll(`marketplace_penjualan?select=*&${filterToko}&tanggal_dilepas=gte.${dari}&tanggal_dilepas=lte.${sampai}&order=tanggal_dilepas.desc,no_pesanan.asc,no_baris.asc`),
        sb(`marketplace_sku_alias?select=referensi,sku&platform=eq.${platform}`),
      ]);
      if (!terbaru()) return;
      setData(rows || []);
      setAliasList(alias || []);
      // Biaya iklan dimuat terpisah: kalau tabel marketplace_iklan belum dibuat (SQL belum dijalankan),
      // halaman tetap jalan seperti biasa — hanya bagian iklan yang dimatikan.
      try {
        const ik = await sbAll(`marketplace_iklan?select=periode_dari,periode_sampai,kode_produk,nama_iklan,biaya&${filterToko}&periode_dari=lte.${sampai}&periode_sampai=gte.${dari}`);
        if (!terbaru()) return;
        setIklanRows(ik || []);
        setIklanTabelAda(true);
      } catch {
        if (!terbaru()) return;
        setIklanRows([]);
        setIklanTabelAda(false);
      }
    } catch (e) {
      if (terbaru()) setErr(e.message || "Gagal memuat data");
    } finally {
      if (terbaru()) setLoading(false);
    }
  }, [filterToko, dari, sampai, platform]);

  useEffect(() => { muat(); }, [muat]);

  // Pemetaan produk (Mass Update) dimuat terpisah & sekali per toko (tidak tergantung filter tanggal)
  const muatPeta = useCallback(async () => {
    try {
      setPetaProduk((await sbAll(`marketplace_produk_map?select=kode_produk,nama_produk,sku_variasi&platform=eq.${platform}&toko=eq.${encodeURIComponent(tokoKode)}`)) || []);
      setPetaAda(true);
    } catch {
      setPetaProduk([]);
      setPetaAda(false);
    }
  }, [platform, tokoKode]);
  useEffect(() => { muatPeta(); }, [muatPeta]);
  useEffect(() => { setHalaman(1); }, [cari, tampil, dari, sampai, urutPesanan, urutSku, urutEtalase, hanyaRefund]);

  // ---- olah data ----
  const pesananList = useMemo(() => {
    const m = new Map();
    for (const b of data) {
      if (!m.has(b.no_pesanan)) m.set(b.no_pesanan, { no: b.no_pesanan, tanggal: b.tanggal_dilepas, dibuat: b.tanggal_pesanan, lines: [] });
      m.get(b.no_pesanan).lines.push(b);
    }
    return [...m.values()].map((p) => ({ ...p, r: ringkasBaris(p.lines) }));
  }, [data]);

  const total = useMemo(() => {
    const lengkap = pesananList.filter((p) => p.r.hppLengkap);
    const tanpa = pesananList.length - lengkap.length;
    const acuan = ringkasBaris(lengkap.flatMap((p) => p.lines));
    const semua = ringkasBaris(data);
    return {
      penjualan: semua.penjualan, refund: semua.refund, potongan: semua.potongan, dana: semua.dana,
      hpp: acuan.hpp, laba: acuan.laba, danaLengkap: acuan.dana,
      margin: acuan.dana > 0 ? (acuan.laba / acuan.dana) * 100 : 0,
      pesananLengkap: lengkap.length, pesananTanpaHpp: tanpa,
    };
  }, [pesananList, data]);

  const iklanPeriode = useMemo(() => {
    const gab = new Map();
    for (const x of iklanRows) {
      const k = `${x.periode_dari}|${x.periode_sampai}`;
      if (!gab.has(k)) gab.set(k, { periode_dari: x.periode_dari, periode_sampai: x.periode_sampai, biaya: 0 });
      gab.get(k).biaya += Number(x.biaya) || 0;
    }
    return [...gab.values()];
  }, [iklanRows]);
  const iklan = useMemo(() => biayaIklanDiRentang(iklanPeriode, dari, sampai), [iklanPeriode, dari, sampai]);
  // Laba hanya dari pesanan dengan SKU lengkap, jadi iklan yang dikurangkan juga hanya porsi pesanan itu
  // (proporsional terhadap dana dilepas). Kalau semua pesanan lengkap, rasionya 1 = iklan penuh.
  const rasioLengkap = total.dana > 0 ? Math.min(1, Math.max(0, total.danaLengkap / total.dana)) : 1;
  const iklanUntukLaba = Math.round(iklan.biaya * rasioLengkap);
  const labaSetelahIklan = total.laba - iklanUntukLaba;
  const idxProduk = useMemo(() => bangunIndeksProduk(petaProduk), [petaProduk]);
  const bagiIklan = useMemo(
    () => bagiIklanKeSku({ iklanRows, dari, sampai, lines: data, idx: idxProduk, kunciBaris: kunciSku }),
    [iklanRows, dari, sampai, data, idxProduk]
  );

  const q = cari.trim().toLowerCase();
  const pesananFiltered = useMemo(() => {
    const dasar = hanyaRefund ? pesananList.filter((p) => n0(p.r.refund) !== 0 || p.lines.some((l) => n0(l.qty_retur) > 0)) : pesananList;
    if (!q) return dasar;
    return dasar.filter((p) => p.no.toLowerCase().includes(q) || p.lines.some((l) =>
      `${l.sku || ""} ${l.sku_referensi || ""} ${l.nama_produk || ""}`.toLowerCase().includes(q)));
  }, [pesananList, q, hanyaRefund]);

  const skuList = useMemo(() => {
    const m = new Map();
    for (const b of data) {
      const kunci = kunciSku(b);
      if (!m.has(kunci)) m.set(kunci, { kunci, cocok: !!b.sku, tanpaData: kunci === KUNCI_TANPA_SKU, nama: kunci === KUNCI_TANPA_SKU ? "Pesanan dari berbagai produk yang Export Pesanannya belum diimport" : b.nama_produk, lines: [] });
      m.get(kunci).lines.push(b);
    }
    return [...m.values()]
      .map((s) => {
        const lengkap = s.lines.filter((l) => hppBaris(l) != null);
        const r = ringkasBaris(s.lines);
        const rl = ringkasBaris(lengkap);
        return { ...s, r, laba: rl.laba, hpp: rl.hpp, danaLengkap: rl.dana, qty: r.qty, iklan: Math.round(bagiIklan.perKunci.get(s.kunci) || 0) };
      })
      .filter((s) => !q || `${s.kunci} ${s.nama || ""}`.toLowerCase().includes(q) || (s.tanpaData && s.lines.some((l) => (l.nama_produk || "").toLowerCase().includes(q))))
      .sort((a, b) => b.laba - a.laba);
  }, [data, q, bagiIklan]);

  // ---- Per Etalase ----
  // Baris pesanan dicocokkan ke etalase lewat judul/SKU (pemetaan Mass Update). Yang belum terpetakan
  // dikelompokkan per judul produk (tanpa biaya iklan). Etalase yang beriklan tapi tidak laku di periode
  // ini tetap ditampilkan (biaya iklan tanpa penjualan).
  const etalaseSemua = useMemo(() => {
    const m = new Map();
    const cache = new Map();
    const ambil = (kunci, nama, kode) => {
      if (!m.has(kunci)) m.set(kunci, { kunci, kode, nama, lines: [] });
      return m.get(kunci);
    };
    for (const b of data) {
      const ck = `${b.nama_produk || ""}|${b.sku_referensi || ""}`;
      if (!cache.has(ck)) cache.set(ck, produkDariBaris(b, idxProduk));
      const kode = cache.get(ck);
      const kunci = kode ? `kode:${kode}` : `judul:${normJudul(b.nama_produk) || "(tanpa nama)"}`;
      ambil(kunci, kode ? (idxProduk.produk.get(kode)?.nama || b.nama_produk) : b.nama_produk, kode).lines.push(b);
    }
    for (const [kode, v] of bagiIklan.biayaProduk) {
      if (!m.has(`kode:${kode}`)) ambil(`kode:${kode}`, idxProduk.produk.get(kode)?.nama || v.nama, kode);
    }
    return [...m.values()].map((e) => {
      const r = ringkasBaris(e.lines);
      const rl = ringkasBaris(e.lines.filter((l) => hppBaris(l) != null));
      const iklanE = Math.round(e.kode ? (bagiIklan.biayaProduk.get(e.kode)?.biaya || 0) : 0);
      // sama seperti kartu total: laba hanya dari baris HPP-lengkap, jadi iklan yang dikurangkan hanya porsinya
      const rasio = r.dana > 0 ? Math.min(1, Math.max(0, rl.dana / r.dana)) : 1;
      return {
        ...e, r, qty: r.qty, hpp: rl.hpp, laba: rl.laba, danaLengkap: rl.dana,
        adaHpp: rl.dana > 0 || rl.hpp > 0,
        iklan: iklanE, labaSetelah: rl.laba - Math.round(iklanE * rasio),
      };
    });
  }, [data, idxProduk, bagiIklan]);
  const etalaseList = useMemo(() => etalaseSemua.filter((e) => !q
    || `${e.nama || ""} ${e.kode || ""}`.toLowerCase().includes(q)
    || e.lines.some((l) => `${l.sku || ""} ${l.sku_referensi || ""}`.toLowerCase().includes(q))), [etalaseSemua, q]);
  const etalaseUrut = useMemo(() => {
    if (!urutEtalase) return etalaseList;
    const ak = AKSES_ETALASE[urutEtalase.k];
    return [...etalaseList].sort((a, b) => bandingkan(ak(a), ak(b), urutEtalase.d));
  }, [etalaseList, urutEtalase]);
  const iklanTanpaKode = useMemo(() => Math.round(bagiIklan.tidakTerbagi.filter((x) => !x.kode).reduce((a, x) => a + x.biaya, 0)), [bagiIklan]);

  const pesananUrut = useMemo(() => {
    if (!urutPesanan) return pesananFiltered;
    const ak = AKSES_PESANAN[urutPesanan.k];
    return [...pesananFiltered].sort((a, b) => bandingkan(ak(a), ak(b), urutPesanan.d));
  }, [pesananFiltered, urutPesanan]);
  const skuUrut = useMemo(() => {
    if (!urutSku) return skuList;
    const ak = AKSES_SKU[urutSku.k];
    return [...skuList].sort((a, b) => bandingkan(ak(a), ak(b), urutSku.d));
  }, [skuList, urutSku]);
  const daftar = tampil === "sku" ? skuUrut : tampil === "etalase" ? etalaseUrut : pesananUrut;
  const jumlahHal = tampil === "biaya" ? 1 : Math.max(1, Math.ceil(daftar.length / PER_HALAMAN));
  const potong = daftar.slice((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN);

  // ---- SKU yang belum cocok ----
  const belumCocok = useMemo(() => {
    const m = new Map();
    for (const b of data) {
      if (!b.sku && b.sku_referensi) {
        const k = normSku(b.sku_referensi);
        if (!m.has(k)) m.set(k, { ref: b.sku_referensi, k, jumlah: 0, nama: b.nama_produk, variasi: b.variasi });
        m.get(k).jumlah++;
      }
    }
    return [...m.values()].sort((a, b) => b.jumlah - a.jumlah);
  }, [data]);
  const tanpaDataSku = useMemo(() => new Set(data.filter((b) => b.sumber_sku === "laporan").map((b) => b.no_pesanan)).size, [data]);

  // ---- aksi: unduh data periode ini (CSV / Excel) ----
  // Isi = SEMUA baris periode yang dipilih (tidak ikut filter pencarian/tab di layar).
  const [sibukUnduh, setSibukUnduh] = useState(false);
  const kolomRincian = useMemo(() => [
    { key: "tanggal_dilepas", label: "Tanggal Dana Dilepas" },
    { key: "tanggal_pesanan", label: "Tanggal Pesanan" },
    { key: "no_pesanan", label: "No. Pesanan" },
    { key: "status_pesanan", label: "Status Pesanan" },
    { key: "sku_referensi", label: "SKU di Marketplace" },
    { key: "sku", label: "SKU Sistem" },
    { key: "status_sku", label: "Status Pencocokan SKU" },
    { key: "nama_produk", label: "Nama Produk" },
    { key: "variasi", label: "Variasi" },
    { key: "qty", label: "Qty" },
    { key: "qty_retur", label: "Qty Retur" },
    { key: "harga_satuan", label: "Harga Satuan" },
    { key: "subtotal", label: "Subtotal" },
    { key: "harga_produk", label: "Harga Produk (bagian baris)" },
    { key: "refund", label: "Refund" },
    ...Object.entries(LABEL_BIAYA).map(([key, label]) => ({ key, label })),
    { key: "potongan", label: "Total Potongan Marketplace" },
    { key: "dana_dilepas", label: "Dana Dilepas" },
    { key: "hpp_satuan", label: "HPP Satuan" },
    { key: "hpp_total", label: "HPP Total" },
    { key: "laba", label: "Laba Bersih" },
  ], []);
  const barisUnduh = useMemo(() => data.map((b) => {
    const hpp = hppBaris(b);
    return {
      ...b,
      status_sku: b.sku ? "cocok" : b.sku_referensi ? "belum cocok" : "belum ada data SKU",
      potongan: potonganBaris(b),
      hpp_total: hpp,
      laba: hpp == null ? null : n0(b.dana_dilepas) - hpp,
    };
  }), [data]);
  const unduh = async (format) => {
    if (!barisUnduh.length) return;
    setSibukUnduh(true);
    try {
      const nama = `rincian-penjualan-${platform}-${String(tokoKode || "toko").replace(/[^a-zA-Z0-9-_]/g, "-")}-${dari}_${sampai}`;
      if (format === "csv") {
        downloadCsv(`${nama}.csv`, kolomRincian, barisUnduh);
      } else {
        const kolomPesanan = [
          { key: "no", label: "No. Pesanan" },
          { key: "tanggal", label: "Tanggal Dana Dilepas" },
          { key: "dibuat", label: "Tanggal Pesanan" },
          { key: "etalase", label: "Etalase" },
          { key: "jumlahBaris", label: "Jumlah Baris SKU" },
          { key: "qty", label: "Qty" },
          { key: "penjualan", label: "Harga Produk" },
          { key: "refund", label: "Refund" },
          { key: "potongan", label: "Total Potongan Marketplace" },
          { key: "dana", label: "Dana Dilepas" },
          { key: "hpp", label: "HPP Total" },
          { key: "laba", label: "Laba Bersih" },
          { key: "hppLengkap", label: "HPP Lengkap?" },
        ];
        const barisPesanan = pesananList.map((p) => ({
          no: p.no, tanggal: p.tanggal, dibuat: p.dibuat, etalase: etalasePesanan(p).join(" | "), jumlahBaris: p.lines.length,
          qty: p.r.qty, penjualan: p.r.penjualan, refund: p.r.refund, potongan: p.r.potongan, dana: p.r.dana,
          hpp: p.r.hppLengkap ? p.r.hpp : null, laba: p.r.hppLengkap ? p.r.laba : null,
          hppLengkap: p.r.hppLengkap ? "ya" : "belum (SKU belum cocok / qty tidak diketahui)",
        }));
        await downloadXlsx(`${nama}.xlsx`, [
          { name: "Rincian per SKU", columns: kolomRincian, rows: barisUnduh },
          { name: "Ringkasan per Pesanan", columns: kolomPesanan, rows: barisPesanan },
          { name: "Per Etalase", columns: [
            { key: "nama", label: "Etalase" }, { key: "kode", label: "Kode Produk" }, { key: "qty", label: "Qty" },
            { key: "penjualan", label: "Harga Produk" }, { key: "dana", label: "Dana Dilepas" }, { key: "hpp", label: "HPP Total" },
            { key: "laba", label: "Laba Bersih" }, { key: "iklan", label: "Biaya Iklan" }, { key: "labaSetelah", label: "Laba setelah Iklan" },
          ], rows: etalaseSemua.map((e) => ({
            nama: e.nama, kode: e.kode || "", qty: e.qty, penjualan: e.r.penjualan, dana: e.r.dana,
            hpp: e.adaHpp ? e.hpp : null, laba: e.adaHpp ? e.laba : null, iklan: e.iklan, labaSetelah: bisaLabaEtalase(e) ? e.labaSetelah : null,
          })) },
        ]);
      }
      showToast?.(`${barisUnduh.length} baris diunduh (${format === "csv" ? "CSV" : "Excel"})`);
    } catch (e) {
      showToast?.(e.message || "Gagal mengunduh", "error");
    } finally {
      setSibukUnduh(false);
    }
  };

  // ---- aksi: cocokkan ulang SKU yang "belum cocok" dengan Master Barang terbaru ----
  const [sibukCocok, setSibukCocok] = useState(false);
  const cocokkanUlang = async () => {
    setSibukCocok(true);
    try {
      const refs = new Map(); // referensi mentah -> baris Master
      for (const b of dataDb) {
        if (b.sku || !b.sku_referensi || refs.has(b.sku_referensi)) continue;
        const m = cariMaster(b.sku_referensi, aliasMap, skuMap);
        if (m) refs.set(b.sku_referensi, m);
      }
      let barisUpdate = 0;
      for (const [ref, m] of refs) {
        const hasil = await sbTulis(`marketplace_penjualan?${filterToko}&sku_referensi=eq.${encodeURIComponent(ref)}`, {
          method: "PATCH", prefer: "return=representation",
          body: JSON.stringify({ sku: m.sku, hpp_satuan: m.hpp != null ? Number(m.hpp) : null }),
        });
        barisUpdate += Array.isArray(hasil) ? hasil.length : 0;
      }
      showToast?.(
        !refs.size ? "Tidak ada SKU yang bisa dicocokkan otomatis — lihat petunjuk di panel bawah"
        : barisUpdate ? `${refs.size} kode SKU dicocokkan (${barisUpdate} baris diperbarui)`
        : `${refs.size} kode SKU ketemu di Master, tapi 0 baris tersimpan — kemungkinan izin tulis (RLS) di tabel marketplace_penjualan`,
        barisUpdate || !refs.size ? undefined : "error"
      );
      await muat();
    } catch (e) {
      showToast?.(e.message || "Gagal mencocokkan ulang", "error");
    } finally {
      setSibukCocok(false);
    }
  };

  // ---- aksi: perbarui HPP dari sku_master ----
  const [sibuk, setSibuk] = useState(false);
  const perbaruiHpp = async () => {
    setSibuk(true);
    try {
      const berubah = new Map();
      for (const b of data) {
        if (!b.sku) continue;
        const hppBaru = skuMap.get(normSku(b.sku))?.hpp;
        if (hppBaru != null && Number(hppBaru) !== n0(b.hpp_satuan)) berubah.set(b.sku, Number(hppBaru));
      }
      for (const [sku, hpp] of berubah) {
        await sbTulis(`marketplace_penjualan?${filterToko}&sku=eq.${encodeURIComponent(sku)}&tanggal_dilepas=gte.${dari}&tanggal_dilepas=lte.${sampai}`, {
          method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ hpp_satuan: hpp }),
        });
      }
      showToast?.(berubah.size ? `HPP diperbarui untuk ${berubah.size} SKU` : "HPP sudah sama dengan Master Barang");
      await muat();
    } catch (e) {
      showToast?.(e.message || "Gagal memperbarui HPP", "error");
    } finally {
      setSibuk(false);
    }
  };

  const simpanAlias = async (ref, skuSistem) => {
    const master = skuMap.get(normSku(skuSistem));
    if (!master) { showToast?.("SKU itu tidak ada di Master Barang (SKU & Harga)", "error"); return false; }
    try {
      await sbTulis("marketplace_sku_alias?on_conflict=platform,referensi", {
        method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
        body: JSON.stringify({ platform, referensi: normSku(ref), sku: master.sku }),
      });
      // Terapkan ke semua baris toko ini dengan referensi yang sama (semua periode)
      await sbTulis(`marketplace_penjualan?${filterToko}&sku_referensi=eq.${encodeURIComponent(ref)}`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({ sku: master.sku, hpp_satuan: master.hpp != null ? Number(master.hpp) : null }),
      });
      showToast?.(`${ref} dipetakan ke ${master.sku}`);
      await muat();
      return true;
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan pemetaan", "error");
      return false;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <div className="text-[11px] text-md-on-surface-variant mb-1">Dana dilepas dari</div>
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputClass} !w-40`} />
        </div>
        <div>
          <div className="text-[11px] text-md-on-surface-variant mb-1">sampai</div>
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputClass} !w-40`} />
        </div>
        <button onClick={muat} className={btnOutlined} disabled={loading}><RefreshCw size={14} /> Muat ulang</button>
        <div className="flex rounded-full border border-md-outline-variant overflow-hidden text-xs">
          {[
            ["Bulan ini", () => { setDari(isoAwalBulan()); setSampai(isoHariIni()); }, dari === isoAwalBulan() && sampai === isoHariIni()],
            ["Bulan lalu", () => { setDari(isoAwalBulanLalu()); setSampai(isoAkhirBulanLalu()); }, dari === isoAwalBulanLalu() && sampai === isoAkhirBulanLalu()],
            ["Semua", () => { setDari("2000-01-01"); setSampai(isoHariIni()); }, dari === "2000-01-01"],
          ].map(([l, aksi, aktif]) => (
            <button key={l} onClick={aksi} className={`px-3 py-2 ${aktif ? "bg-md-primary-container text-md-on-primary-container font-medium" : "text-md-on-surface-variant"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1" />
        {(belumCocok.length > 0 || adaBelumTersimpan) && (
          <button onClick={cocokkanUlang} className={btnOutlined} disabled={sibukCocok} title="Simpan hasil pencocokan SKU dengan Master Barang terbaru ke database">
            <Link2 size={14} /> Cocokkan ulang SKU
          </button>
        )}
        <button onClick={() => unduh("csv")} className={btnOutlined} disabled={sibukUnduh || data.length === 0} title="Unduh semua baris periode ini sebagai CSV">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => unduh("xlsx")} className={btnOutlined} disabled={sibukUnduh || data.length === 0} title="Unduh periode ini sebagai Excel (2 sheet: per SKU & per pesanan)">
          <Download size={14} /> Excel
        </button>
        <button onClick={perbaruiHpp} className={btnOutlined} disabled={sibuk || data.length === 0} title="Ambil HPP terbaru dari Master Barang untuk baris di periode ini">
          Perbarui HPP
        </button>
        {platform === "shopee" && (
          <button onClick={() => setPetaOpen((v) => !v)} className={btnOutlined} title="Import file Mass Update produk Shopee (Kode Produk ↔ judul ↔ SKU) untuk membagi biaya iklan ke SKU"><Link2 size={14} /> Import Mass Update</button>
        )}
        {platform === "shopee" && (
          <button onClick={() => setIklanOpen((v) => !v)} className={btnOutlined} title="Import laporan iklan Shopee (CSV) supaya biaya iklan ikut mengurangi laba bersih"><Megaphone size={14} /> Import Iklan</button>
        )}
        {platform === "shopee" && (
          <button onClick={() => setImportOpen((v) => !v)} className={btnFilled}><Upload size={14} /> Import Laporan Shopee</button>
        )}
      </div>

      {petaOpen && (
        <PanelImportMassUpdate
          platform={platform} tokoKode={tokoKode} tabelAda={petaAda} jumlahTersimpan={petaProduk.length}
          showToast={showToast} onSelesai={() => { setPetaOpen(false); muatPeta(); }}
        />
      )}

      {iklanOpen && (
        <PanelImportIklan
          platform={platform} tokoKode={tokoKode} tokoLabel={toko.label || ""} filterToko={filterToko} tabelAda={iklanTabelAda}
          showToast={showToast} onSelesai={() => { setIklanOpen(false); muat(); }}
        />
      )}

      {importOpen && (
        <PanelImport
          platform={platform} tokoKode={tokoKode} filterToko={filterToko} skuMap={skuMap} aliasMap={aliasMap}
          showToast={showToast} onSelesai={(rentang) => { setImportOpen(false); setRentangImport(rentang || null); muat(); }}
        />
      )}

      {err && <div className="mb-4 text-sm text-red-400">{err}</div>}

      {rentangImport && rentangImport.dari && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs bg-sky-500/10 text-sky-300 rounded-md-lg px-3 py-2">
          <span>Import tersimpan untuk dana dilepas {formatTanggalID(rentangImport.dari)} – {formatTanggalID(rentangImport.sampai)}. Filter tampilan tidak diubah.</span>
          {(rentangImport.dari < dari || rentangImport.sampai > sampai) && (
            <button className="underline" onClick={() => { setDari(rentangImport.dari); setSampai(rentangImport.sampai); setRentangImport(null); }}>Lihat periode ini</button>
          )}
          <button className="underline ml-auto" onClick={() => setRentangImport(null)}>Tutup</button>
        </div>
      )}

      <div className="text-[11px] text-md-on-surface-variant mb-1">Semua pesanan di periode ({pesananList.length})</div>
      <div className={`grid grid-cols-2 ${total.refund !== 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3 mb-4`}>
        <StatCard label="Penjualan (harga produk)" value={fmtRp(total.penjualan)} icon={TrendingUp} iconColor="text-emerald-400" />
        {total.refund !== 0 && <StatCard label="Refund ke pembeli" value={fmtRp(total.refund)} accent="text-red-400" icon={Receipt} iconColor="text-red-400" />}
        <StatCard label="Biaya & potongan marketplace" value={fmtRp(total.potongan)} icon={Receipt} iconColor="text-amber-400" />
        <StatCard label="Dana dilepas ke saldo" value={fmtRp(total.dana)} icon={Wallet} iconColor="text-sky-400" />
      </div>
      <div className="text-[11px] text-md-on-surface-variant mb-1">
        Hanya pesanan dengan SKU lengkap ({total.pesananLengkap} dari {pesananList.length}) — dana − HPP = laba
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <StatCard label="Dana dilepas (SKU lengkap)" value={fmtRp(total.danaLengkap)} icon={Wallet} iconColor="text-sky-400" />
        <StatCard label="HPP barang terjual" value={fmtRp(total.hpp)} icon={Package} />
        <StatCard label={`Laba bersih (${total.margin.toFixed(1)}% dari dana)`} value={fmtRp(total.laba)} accent={total.laba >= 0 ? "text-emerald-400" : "text-red-400"} icon={TrendingUp} iconColor="text-emerald-400" />
      </div>
      {iklanTabelAda && (
        <>
          <div className="text-[11px] text-md-on-surface-variant mb-1">Setelah biaya iklan</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <StatCard label={iklan.perkiraan ? "Biaya iklan (perkiraan, dibagi per hari)" : "Biaya iklan"} value={iklanPeriode.length ? fmtRp(iklan.biaya) : "Belum diimport"} icon={Megaphone} iconColor="text-amber-400" />
            <StatCard label={rasioLengkap < 1 ? "Laba bersih setelah iklan (porsi SKU lengkap)" : "Laba bersih setelah iklan"} value={iklanPeriode.length ? fmtRp(labaSetelahIklan) : "—"} accent={iklanPeriode.length ? (labaSetelahIklan >= 0 ? "text-emerald-400" : "text-red-400") : undefined} icon={TrendingUp} iconColor="text-emerald-400" />
            <StatCard label="Iklan % dari dana dilepas" value={iklanPeriode.length && total.dana > 0 ? `${((iklan.biaya / total.dana) * 100).toFixed(1)}%` : "—"} icon={Receipt} iconColor="text-amber-400" />
          </div>
          {iklanPeriode.length > 0 && (
            <div className="mb-4 text-[11px] text-md-on-surface-variant max-w-3xl">
              Biaya iklan dihitung untuk seluruh periode. Laba bersih di atas hanya dari pesanan dengan SKU lengkap{total.pesananTanpaHpp > 0 ? ` (${total.pesananTanpaHpp} pesanan belum masuk)` : ""}
              {rasioLengkap < 1 ? <>, jadi iklan yang dikurangkan hanya porsinya: <b className="text-md-on-surface">{fmtRp(iklanUntukLaba)}</b> ({(rasioLengkap * 100).toFixed(1)}% dari biaya iklan, sesuai porsi dana dilepas)</> : null}.
              {!petaProduk.length
                ? " Iklan belum dibagi per SKU — import file Mass Update dulu (tombol Import Mass Update)."
                : <> Dibagi ke SKU (tab Per SKU): <b className="text-md-on-surface">{fmtRp(Math.round(bagiIklan.terbagi))}</b> · tidak terbagi: <b className={bagiIklan.totalTidakTerbagi > 0 ? "text-amber-400" : "text-md-on-surface"}>{fmtRp(Math.round(bagiIklan.totalTidakTerbagi))}</b> ({bagiIklan.tidakTerbagi.length} baris iklan).</>}
              {petaProduk.length > 0 && bagiIklan.tidakTerbagi.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer underline decoration-dotted">Lihat iklan yang tidak terbagi</summary>
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-md-lg bg-md-container-low p-2 space-y-1">
                    {[...bagiIklan.tidakTerbagi].sort((x, y) => y.biaya - x.biaya).slice(0, 40).map((x, i) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="min-w-0"><span className="block truncate text-md-on-surface">{x.nama}</span>{x.kode ? `${x.kode} · ` : ""}{x.alasan}</span>
                        <span className="whitespace-nowrap">{fmtRp(Math.round(x.biaya))}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
      {(total.pesananTanpaHpp > 0 || tanpaDataSku > 0) && (
        <div className="mb-4 flex gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-md-lg px-3 py-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            {total.pesananTanpaHpp} pesanan belum bisa dihitung HPP-nya, jadi tidak masuk HPP & laba di atas
            {tanpaDataSku > 0 && <> ({tanpaDataSku} di antaranya belum punya data SKU — import <b>Export Pesanan</b> yang mencakup tanggal pesanan itu)</>}
            {belumCocok.length > 0 && <>; {belumCocok.length} SKU Shopee belum cocok dengan Master Barang (lihat panel di bawah)</>}.
            Baris "Semua pesanan" tetap mencakup semuanya.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-full border border-md-outline-variant overflow-hidden text-xs">
          {[["pesanan", "Per Pesanan"], ["sku", "Per SKU"], ["etalase", "Per Etalase"], ["biaya", "Rincian Biaya"]].map(([k, l]) => (
            <button key={k} onClick={() => setTampil(k)} className={`px-4 py-2 ${tampil === k ? "bg-md-primary-container text-md-on-primary-container font-medium" : "text-md-on-surface-variant"}`}>{l}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari no. pesanan / SKU / nama produk" className={`${inputClass} !pl-9`} />
        </div>
        {(tampil === "pesanan" || tampil === "biaya") && (
          <label className="flex items-center gap-1.5 text-xs text-md-on-surface-variant cursor-pointer select-none">
            <input type="checkbox" checked={hanyaRefund} onChange={(e) => setHanyaRefund(e.target.checked)} />
            Hanya refund/retur ({pesananList.filter((p) => n0(p.r.refund) !== 0 || p.lines.some((l) => n0(l.qty_retur) > 0)).length})
          </label>
        )}
        <div className="text-xs text-md-on-surface-variant">{daftar.length} {tampil === "sku" ? "SKU" : tampil === "etalase" ? "etalase" : "pesanan"}</div>
      </div>

      {loading && data.length === 0 ? (
        <div className="text-sm text-md-on-surface-variant py-10 text-center">Memuat…</div>
      ) : data.length === 0 ? (
        <EmptyState label={platform === "shopee" ? "Belum ada data di periode ini. Klik “Import Laporan Shopee” untuk mengunggah Laporan Penghasilan + Export Pesanan." : "Import otomatis baru tersedia untuk Shopee."} />
      ) : tampil === "pesanan" ? (
        <TabelPesanan list={potong} buka={buka} setBuka={setBuka} urut={urutPesanan} onUrut={(k) => ubahUrut(setUrutPesanan, k)} />
      ) : tampil === "biaya" ? (
        <TabelBiaya list={pesananFiltered} />
      ) : tampil === "etalase" ? (
        <>
          <div className="mb-2 text-[11px] text-md-on-surface-variant max-w-3xl space-y-1">
            <div>Satu baris = satu etalase (produk/listing Shopee). Biaya iklan di sini angka asli per etalase, tidak dibagi ke SKU. Klik baris untuk melihat SKU di dalamnya.</div>
            {!petaProduk.length && <div className="text-amber-400">Etalase belum dikenali — import file Mass Update (tombol Import Mass Update) supaya biaya iklan bisa dicocokkan ke etalase. Sementara ini baris dikelompokkan per judul produk, tanpa biaya iklan.</div>}
            {iklanTabelAda && iklanPeriode.length === 0 && <div className="text-amber-400">Belum ada data biaya iklan yang periodenya masuk ke rentang tanggal ini, jadi kolom Biaya Iklan masih kosong. Klik Import Iklan, atau ubah rentang tanggal ke periode iklan yang sudah diimport.</div>}
            {!iklanTabelAda && <div className="text-amber-400">Tabel marketplace_iklan belum ada di database — jalankan dulu file SQL marketplace_iklan.sql, lalu muat ulang halaman.</div>}
            {iklanTanpaKode > 0 && <div className="text-amber-400">Iklan tanpa kode produk {fmtRp(iklanTanpaKode)} tidak bisa dimasukkan ke etalase mana pun, tapi tetap dihitung di kartu total.</div>}
          </div>
          <TabelEtalase list={potong} urut={urutEtalase} onUrut={(k) => ubahUrut(setUrutEtalase, k)} adaIklan={iklanTabelAda} iklanTerisi={iklanPeriode.length > 0} />
        </>
      ) : (
        <TabelSku list={potong} urut={urutSku} onUrut={(k) => ubahUrut(setUrutSku, k)} adaIklan={petaProduk.length > 0 && iklanPeriode.length > 0} />
      )}

      {jumlahHal > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button className={btnText} disabled={halaman <= 1} onClick={() => setHalaman((h) => h - 1)}>‹ Sebelumnya</button>
          <span className="text-md-on-surface-variant">{halaman} / {jumlahHal}</span>
          <button className={btnText} disabled={halaman >= jumlahHal} onClick={() => setHalaman((h) => h + 1)}>Berikutnya ›</button>
        </div>
      )}

      {belumCocok.length > 0 && <PanelBelumCocok list={belumCocok} skuMaster={skuMaster} onSimpan={simpanAlias} />}
    </div>
  );
}

function Angka({ v, plus }) {
  const n = n0(v);
  return <span className={n < 0 ? "text-red-300" : plus && n > 0 ? "text-emerald-400" : ""}>{fmtRp(n)}</span>;
}

function TabelPesanan({ list, buka, setBuka, urut, onUrut }) {
  return (
    <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-auto max-h-[60vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-md-container-low">
          <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
            <th className="px-3 py-2.5 w-8" />
            <ThUrut label="No. Pesanan" k="no" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Tgl Pesanan" k="dibuat" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Tgl Cair" k="tanggal" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Etalase" k="etalase" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="SKU" k="sku" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Harga Jual" k="penjualan" urut={urut} onUrut={onUrut} />
            <ThUrut label="Biaya Marketplace" k="potongan" urut={urut} onUrut={onUrut} />
            <ThUrut label="Dana Dilepas" k="dana" urut={urut} onUrut={onUrut} />
            <ThUrut label="HPP" k="hpp" urut={urut} onUrut={onUrut} />
            <ThUrut label="Laba Bersih" k="laba" urut={urut} onUrut={onUrut} />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const terbuka = !!buka[p.no];
            const adaSku = p.lines.filter((l) => l.sku_referensi || l.sku);
            return (
              <FragmenPesanan key={p.no} p={p} terbuka={terbuka} adaSku={adaSku} toggle={() => setBuka((b) => ({ ...b, [p.no]: !b[p.no] }))} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmenPesanan({ p, terbuka, adaSku, toggle }) {
  const r = p.r;
  return (
    <>
      <tr className="border-b border-md-outline-variant cursor-pointer hover:bg-md-on-surface/[0.04]" onClick={toggle}>
        <td className="px-3 py-2.5 text-md-on-surface-variant">{terbuka ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="font-medium">{p.no}</div>
          {n0(r.refund) !== 0 && <div className="mt-1"><Badge color="red">Refund {fmtRp(Math.abs(n0(r.refund)))}</Badge></div>}
          {n0(r.refund) === 0 && p.lines.some((l) => n0(l.qty_retur) > 0) && <div className="mt-1"><Badge color="amber">Ada retur</Badge></div>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-xs">{p.dibuat ? formatTanggalID(p.dibuat) : "—"}</td>
        <td className="px-3 py-2.5 whitespace-nowrap text-xs">{p.tanggal ? formatTanggalID(p.tanggal) : "—"}</td>
        <td className="px-3 py-2.5 text-xs min-w-[220px] max-w-[320px]">
          {etalasePesanan(p).length === 0 ? "—" : etalasePesanan(p).slice(0, 2).map((n, i) => <div key={i} className="whitespace-normal break-words">{n}</div>)}
          {etalasePesanan(p).length > 2 && <div className="text-md-on-surface-variant">+{etalasePesanan(p).length - 2} etalase lain</div>}
        </td>
        <td className="px-3 py-2.5 text-xs text-md-on-surface-variant max-w-[260px]">
          {p.lines.length === 0 ? "—" : p.lines.slice(0, 2).map((l, i) => (
            <div key={i} className="break-all">{l.sku || l.sku_referensi || "(SKU belum ada)"}{l.qty != null ? ` ×${qtyBersih(l)}` : ""}</div>
          ))}
          {p.lines.length > 2 && <div>+{p.lines.length - 2} lainnya</div>}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtRp(r.penjualan)}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap text-amber-400">{fmtRp(r.potongan)}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtRp(r.dana)}</td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">{r.hppLengkap ? fmtRp(r.hpp) : <Badge color="amber">SKU?</Badge>}</td>
        <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${r.hppLengkap ? (r.laba >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>
          {r.hppLengkap ? fmtRp(r.laba) : "—"}
        </td>
      </tr>
      {terbuka && (
        <tr className="border-b border-md-outline-variant bg-md-on-surface/[0.03]">
          <td />
          <td colSpan={10} className="px-3 py-3">
            <table className="w-full text-xs mb-3">
              <thead>
                <tr className="text-left text-md-on-surface-variant">
                  <th className="py-1 pr-3 font-medium">SKU</th>
                  <th className="py-1 pr-3 font-medium">Produk / variasi</th>
                  <th className="py-1 pr-3 font-medium text-right">Qty</th>
                  <th className="py-1 pr-3 font-medium text-right">Harga Jual</th>
                  <th className="py-1 pr-3 font-medium text-right">Biaya</th>
                  <th className="py-1 pr-3 font-medium text-right">Dana</th>
                  <th className="py-1 pr-3 font-medium text-right">HPP/unit</th>
                  <th className="py-1 font-medium text-right">Laba</th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((l) => {
                  const h = hppBaris(l);
                  return (
                    <tr key={l.id ?? l.no_baris} className="border-t border-md-outline-variant/60">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {l.sku ? l.sku : l.sku_referensi ? <span className="text-amber-400">{l.sku_referensi} (belum cocok)</span> : <span className="text-amber-400">belum ada data SKU</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-md-on-surface-variant min-w-[240px] max-w-[420px] whitespace-normal break-words">{l.nama_produk}{l.variasi ? ` — ${l.variasi}` : ""}</td>
                      <td className="py-1.5 pr-3 text-right">{l.qty == null ? "?" : `${qtyBersih(l)}${n0(l.qty_retur) ? ` (retur ${l.qty_retur})` : ""}`}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtRp(l.harga_produk)}</td>
                      <td className="py-1.5 pr-3 text-right text-amber-400">{fmtRp(potonganBaris(l))}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtRp(l.dana_dilepas)}</td>
                      <td className="py-1.5 pr-3 text-right">{l.hpp_satuan == null ? "—" : fmtRp(l.hpp_satuan)}</td>
                      <td className={`py-1.5 text-right font-medium ${h == null ? "text-md-on-surface-variant" : n0(l.dana_dilepas) - h >= 0 ? "text-emerald-400" : "text-red-400"}`}>{h == null ? "—" : fmtRp(n0(l.dana_dilepas) - h)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[11px] text-md-on-surface-variant mb-1">Rincian biaya dari marketplace (pesanan ini)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between gap-2"><span className="text-md-on-surface-variant">Harga produk</span><Angka v={r.penjualan} /></div>
              {n0(r.refund) !== 0 && <div className="flex justify-between gap-2"><span className="text-md-on-surface-variant">Refund pembeli</span><Angka v={r.refund} /></div>}
              {Object.keys(LABEL_BIAYA).map((f) => {
                const v = p.lines.reduce((a, l) => a + n0(l[f]), 0);
                if (v === 0) return null;
                return <div key={f} className="flex justify-between gap-2"><span className="text-md-on-surface-variant">{LABEL_BIAYA[f]}</span><Angka v={v} plus /></div>;
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Jumlah SEMUA pesanan di periode (dan sesuai kotak cari) per komponen biaya
function TabelBiaya({ list }) {
  const baris = list.flatMap((p) => p.lines);
  const jml = (f) => baris.reduce((a, b) => a + n0(b[f]), 0);
  const harga = jml("harga_produk");
  const refund = jml("refund");
  const dana = jml("dana_dilepas");
  const lengkap = list.filter((p) => p.r.hppLengkap);
  const rl = ringkasBaris(lengkap.flatMap((p) => p.lines));
  const persen = (v) => (harga > 0 ? `${((v / harga) * 100).toFixed(1)}%` : "—");

  const komponen = [
    ...(refund !== 0 ? [["Refund ke pembeli", refund]] : []),
    ...Object.keys(LABEL_BIAYA).map((f) => [LABEL_BIAYA[f], jml(f)]).filter(([, v]) => v !== 0),
  ];
  const Baris = ({ label, v, tebal, warna, pct = true }) => (
    <tr className={`border-b border-md-outline-variant last:border-0 ${tebal ? "bg-md-on-surface/[0.04] font-medium" : ""}`}>
      <td className="px-4 py-2.5">{label}</td>
      <td className={`px-4 py-2.5 text-right whitespace-nowrap ${warna || ""}`}>{fmtRp(v)}</td>
      <td className="px-4 py-2.5 text-right text-md-on-surface-variant">{pct ? persen(v) : ""}</td>
    </tr>
  );
  return (
    <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto max-w-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
            <th className="px-4 py-2.5 font-medium">Komponen ({list.length} pesanan)</th>
            <th className="px-4 py-2.5 font-medium text-right">Total</th>
            <th className="px-4 py-2.5 font-medium text-right">% harga produk</th>
          </tr>
        </thead>
        <tbody>
          <Baris label="Harga produk" v={harga} tebal />
          {komponen.map(([label, v]) => <Baris key={label} label={label} v={v} warna={v < 0 ? "text-red-300" : "text-emerald-400"} />)}
          <Baris label="Dana dilepas ke saldo" v={dana} tebal />
          <Baris label={`HPP barang terjual (${lengkap.length} pesanan dengan SKU lengkap)`} v={-rl.hpp} warna="text-red-300" pct={false} />
          <Baris label="Laba bersih (dari pesanan dengan SKU lengkap)" v={rl.laba} tebal warna={rl.laba >= 0 ? "text-emerald-400" : "text-red-400"} pct={false} />
        </tbody>
      </table>
    </div>
  );
}

const KOLOM_BIAYA = [
  ["biaya_admin", "Admin"], ["biaya_proses", "Proses"], ["biaya_ongkir_xtra", "XTRA"], ["biaya_layanan", "Layanan"],
  ["biaya_ams", "AMS"], ["biaya_kampanye", "Kampanye"], ["biaya_isi_saldo", "Isi Saldo"], ["biaya_promosi", "Promo (lama)"], ["biaya_lain", "Lainnya"], ["pajak", "PPh 22"], ["voucher_penjual", "Voucher"], ["ongkir_net", "Ongkir"],
];
const MAKS_BARIS_DETAIL = 100;

// Rincian biaya satu SKU: total per komponen + biaya yang kena di tiap pesanan
function DetailBiayaSku({ s }) {
  const lines = s.lines;
  const tampil = lines.slice(0, MAKS_BARIS_DETAIL);
  const kolom = KOLOM_BIAYA.filter(([f]) => lines.some((l) => n0(l[f]) !== 0));
  const totalKol = (f) => lines.reduce((a, l) => a + n0(l[f]), 0);
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-md-on-surface-variant mb-1">Total biaya marketplace SKU ini per komponen ({lines.length} baris pesanan)</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1 text-xs mb-4">
        {kolom.map(([f]) => (
          <div key={f} className="flex justify-between gap-2"><span className="text-md-on-surface-variant">{LABEL_BIAYA[f]}</span><Angka v={totalKol(f)} plus /></div>
        ))}
      </div>
      <div className="text-[11px] text-md-on-surface-variant mb-1">Biaya yang kena per pesanan</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-md-on-surface-variant">
              <th className="py-1 pr-3 font-medium">Pesanan</th>
              <th className="py-1 pr-3 font-medium text-right">Qty</th>
              <th className="py-1 pr-3 font-medium text-right">Harga Jual</th>
              {kolom.map(([f, l]) => <th key={f} className="py-1 pr-3 font-medium text-right">{l}</th>)}
              <th className="py-1 pr-3 font-medium text-right">Total Biaya</th>
              <th className="py-1 font-medium text-right">Dana</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((l) => (
              <tr key={l.id ?? `${l.no_pesanan}-${l.no_baris}`} className="border-t border-md-outline-variant/60">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {l.no_pesanan}<div className="text-[10px] text-md-on-surface-variant">{l.tanggal_pesanan ? `pesan ${formatTanggalID(l.tanggal_pesanan)} · ` : ""}cair {formatTanggalID(l.tanggal_dilepas)}</div>
                </td>
                <td className="py-1.5 pr-3 text-right">{l.qty == null ? "?" : qtyBersih(l)}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(l.harga_produk)}</td>
                {kolom.map(([f]) => <td key={f} className="py-1.5 pr-3 text-right whitespace-nowrap"><Angka v={l[f]} plus /></td>)}
                <td className="py-1.5 pr-3 text-right whitespace-nowrap text-amber-400">{fmtRp(potonganBaris(l))}</td>
                <td className="py-1.5 text-right whitespace-nowrap">{fmtRp(l.dana_dilepas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > tampil.length && (
        <div className="text-[11px] text-md-on-surface-variant mt-2">Menampilkan {tampil.length} dari {lines.length} baris terbaru. Total di atas tetap mencakup semuanya.</div>
      )}
      <div className="text-[11px] text-md-on-surface-variant mt-2">
        Biaya proses pesanan dari Shopee flat per pesanan, lalu dibagi ke tiap SKU sesuai harga — sama seperti baris "Sku" di Laporan Penghasilan.
      </div>
    </div>
  );
}

function TabelSku({ list, urut, onUrut, adaIklan }) {
  const [terbuka, setTerbuka] = useState({});
  return (
    <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-auto max-h-[60vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-md-container-low">
          <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
            <th className="px-3 py-2.5 w-8" />
            <ThUrut label="SKU" k="kunci" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Qty" k="qty" urut={urut} onUrut={onUrut} />
            <ThUrut label="Harga Jual" k="penjualan" urut={urut} onUrut={onUrut} />
            <ThUrut label="Biaya Marketplace" k="potongan" urut={urut} onUrut={onUrut}><span className="font-normal">(klik baris)</span></ThUrut>
            <ThUrut label="Dana Dilepas" k="dana" urut={urut} onUrut={onUrut} />
            <ThUrut label="HPP" k="hpp" urut={urut} onUrut={onUrut} />
            <ThUrut label="Laba Bersih" k="laba" urut={urut} onUrut={onUrut} />
            {adaIklan && <ThUrut label="Biaya Iklan" k="iklan" urut={urut} onUrut={onUrut}><span className="font-normal">(dibagi dari etalase)</span></ThUrut>}
            {adaIklan && <ThUrut label="Laba − Iklan" k="labaSetelah" urut={urut} onUrut={onUrut} />}
            <ThUrut label="Margin" k="margin" urut={urut} onUrut={onUrut} />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const dapat = s.danaLengkap > 0 ? (s.laba / s.danaLengkap) * 100 : null;
            const buka = !!terbuka[s.kunci];
            return (
              <FragmenSku key={s.kunci}>
                <tr className="border-b border-md-outline-variant cursor-pointer hover:bg-md-on-surface/[0.04]" onClick={() => setTerbuka((m) => ({ ...m, [s.kunci]: !m[s.kunci] }))}>
                  <td className="px-3 py-2.5 text-md-on-surface-variant">{buka ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{s.kunci}{!s.cocok && <span className="ml-2"><Badge color="amber">{s.tanpaData ? "belum ada data SKU" : "belum cocok"}</Badge></span>}</div>
                    <div className="text-[11px] text-md-on-surface-variant whitespace-normal break-words max-w-[320px]">{s.nama}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{s.qty || "—"}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtRp(s.r.penjualan)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-amber-400 underline decoration-dotted underline-offset-4">{fmtRp(s.r.potongan)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {fmtRp(s.r.dana)}
                    {Math.abs(s.danaLengkap - s.r.dana) > 0.5 && <div className="text-[10px] text-amber-400" title="Laba & HPP hanya dihitung dari baris yang HPP-nya lengkap">dasar laba: {fmtRp(s.danaLengkap)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{s.danaLengkap > 0 || s.hpp > 0 ? fmtRp(s.hpp) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${s.hpp > 0 || s.danaLengkap > 0 ? (s.laba >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>
                    {s.hpp > 0 || s.danaLengkap > 0 ? fmtRp(s.laba) : "—"}
                  </td>
                  {adaIklan && <td className="px-3 py-2.5 text-right whitespace-nowrap text-amber-400">{s.iklan > 0 ? fmtRp(s.iklan) : "—"}</td>}
                  {adaIklan && (
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${adaHpp(s) ? (s.laba - s.iklan >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>
                      {adaHpp(s) ? fmtRp(s.laba - s.iklan) : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-md-on-surface-variant">{dapat == null ? "—" : `${dapat.toFixed(1)}%`}</td>
                </tr>
                {buka && (
                  <tr className="border-b border-md-outline-variant bg-md-on-surface/[0.03]">
                    <td colSpan={adaIklan ? 11 : 9}><DetailBiayaSku s={s} /></td>
                  </tr>
                )}
              </FragmenSku>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmenSku({ children }) {
  return <>{children}</>;
}

// SKU-SKU di dalam satu etalase
function DetailEtalase({ e }) {
  const m = new Map();
  for (const b of e.lines) { const k = kunciSku(b); if (!m.has(k)) m.set(k, []); m.get(k).push(b); }
  const baris = [...m.entries()].map(([kunci, lines]) => {
    const r = ringkasBaris(lines);
    const rl = ringkasBaris(lines.filter((l) => hppBaris(l) != null));
    return { kunci, qty: r.qty, penjualan: r.penjualan, dana: r.dana, hpp: rl.hpp, laba: rl.laba, ada: rl.dana > 0 || rl.hpp > 0 };
  }).sort((a, b) => b.penjualan - a.penjualan);
  if (!baris.length) return <div className="px-4 py-3 text-xs text-md-on-surface-variant">Tidak ada penjualan etalase ini di periode ini — biaya iklan tetap berjalan.</div>;
  return (
    <div className="px-4 py-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-md-on-surface-variant">
            <th className="py-1 pr-3 font-medium">SKU</th>
            <th className="py-1 pr-3 font-medium text-right">Qty</th>
            <th className="py-1 pr-3 font-medium text-right">Harga Jual</th>
            <th className="py-1 pr-3 font-medium text-right">Dana</th>
            <th className="py-1 pr-3 font-medium text-right">HPP</th>
            <th className="py-1 font-medium text-right">Laba</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.kunci} className="border-t border-md-outline-variant/60">
              <td className="py-1.5 pr-3 whitespace-nowrap">{b.kunci}</td>
              <td className="py-1.5 pr-3 text-right">{b.qty || "—"}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(b.penjualan)}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(b.dana)}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap">{b.ada ? fmtRp(b.hpp) : "—"}</td>
              <td className={`py-1.5 text-right whitespace-nowrap font-medium ${b.ada ? (b.laba >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>{b.ada ? fmtRp(b.laba) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[11px] text-md-on-surface-variant mt-2">Biaya iklan tidak dipecah ke SKU di sini — iklan berjalan untuk etalase secara keseluruhan.</div>
    </div>
  );
}

function TabelEtalase({ list, urut, onUrut, adaIklan, iklanTerisi }) {
  const [terbuka, setTerbuka] = useState({});
  return (
    <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-auto max-h-[60vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-md-container-low">
          <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
            <th className="px-3 py-2.5 w-8" />
            <ThUrut label="Etalase" k="kunci" urut={urut} onUrut={onUrut} kanan={false} />
            <ThUrut label="Qty" k="qty" urut={urut} onUrut={onUrut} />
            <ThUrut label="Harga Jual" k="penjualan" urut={urut} onUrut={onUrut} />
            <ThUrut label="Dana Dilepas" k="dana" urut={urut} onUrut={onUrut} />
            <ThUrut label="HPP" k="hpp" urut={urut} onUrut={onUrut} />
            <ThUrut label="Laba Bersih" k="laba" urut={urut} onUrut={onUrut} />
            {adaIklan && <ThUrut label="Biaya Iklan" k="iklan" urut={urut} onUrut={onUrut} />}
            {adaIklan && <ThUrut label="Laba − Iklan" k="labaSetelah" urut={urut} onUrut={onUrut} />}
            <ThUrut label="Margin" k="margin" urut={urut} onUrut={onUrut}>{iklanTerisi && <span className="font-normal">(setelah iklan)</span>}</ThUrut>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => {
            const buka = !!terbuka[e.kunci];
            const bisaLaba = bisaLabaEtalase(e);
            const margin = e.danaLengkap > 0 ? ((iklanTerisi ? e.labaSetelah : e.laba) / e.danaLengkap) * 100 : null;
            return (
              <FragmenSku key={e.kunci}>
                <tr className="border-b border-md-outline-variant cursor-pointer hover:bg-md-on-surface/[0.04]" onClick={() => setTerbuka((m) => ({ ...m, [e.kunci]: !m[e.kunci] }))}>
                  <td className="px-3 py-2.5 text-md-on-surface-variant">{buka ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium whitespace-normal break-words max-w-[340px]">{e.nama || "(tanpa nama)"}</div>
                    <div className="text-[11px] text-md-on-surface-variant">
                      {e.kode ? `Kode ${e.kode} · ` : ""}{[...new Set(e.lines.map(kunciSku))].filter((k) => k !== KUNCI_TANPA_SKU).length} SKU{e.lines.some((l) => kunciSku(l) === KUNCI_TANPA_SKU) ? " + pesanan tanpa data SKU" : ""}
                      {!e.kode && <span className="ml-2"><Badge color="amber">belum terpetakan</Badge></span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{e.qty || "—"}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtRp(e.r.penjualan)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {fmtRp(e.r.dana)}
                    {Math.abs(e.danaLengkap - e.r.dana) > 0.5 && <div className="text-[10px] text-amber-400" title="Laba & HPP hanya dihitung dari baris yang HPP-nya lengkap">dasar laba: {fmtRp(e.danaLengkap)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{e.adaHpp ? fmtRp(e.hpp) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${e.adaHpp ? (e.laba >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>{e.adaHpp ? fmtRp(e.laba) : "—"}</td>
                  {adaIklan && <td className="px-3 py-2.5 text-right whitespace-nowrap text-amber-400">{e.iklan > 0 ? fmtRp(e.iklan) : "—"}</td>}
                  {adaIklan && !iklanTerisi && <td className="px-3 py-2.5 text-right text-md-on-surface-variant">—</td>}
                  {adaIklan && iklanTerisi && (
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${bisaLaba ? (e.labaSetelah >= 0 ? "text-emerald-400" : "text-red-400") : "text-md-on-surface-variant"}`}>
                      {bisaLaba ? fmtRp(e.labaSetelah) : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-md-on-surface-variant">{margin == null || !bisaLaba ? "—" : `${margin.toFixed(1)}%`}</td>
                </tr>
                {buka && (
                  <tr className="border-b border-md-outline-variant bg-md-on-surface/[0.03]">
                    <td colSpan={adaIklan ? 10 : 8}><DetailEtalase e={e} /></td>
                  </tr>
                )}
              </FragmenSku>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Petunjuk kenapa satu kode tidak cocok: karakter tak biasa + kandidat Master yang "mirip"
// (sama kalau semua tanda baca/spasi dibuang).
const kunciLonggar = (s) => normSku(s).replace(/[^A-Z0-9]/g, "");
function karakterAneh(s) {
  const out = [];
  [...String(s ?? "")].forEach((c, i) => {
    const cp = c.codePointAt(0);
    if (cp < 32 || cp > 126) out.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")} (posisi ${i + 1})`);
  });
  return out;
}

function PanelBelumCocok({ list, skuMaster, onSimpan }) {
  const [input, setInput] = useState({});
  const [sibuk, setSibuk] = useState("");
  const tampil = list.slice(0, 40);
  const indeksLonggar = useMemo(() => {
    const m = new Map();
    for (const s of skuMaster || []) {
      if (!s.sku) continue;
      const k = kunciLonggar(s.sku);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s.sku);
    }
    return m;
  }, [skuMaster]);
  return (
    <div className="mt-8">
      <div className="text-sm font-medium mb-1 flex items-center gap-2"><Link2 size={14} /> SKU Shopee yang belum cocok dengan Master Barang ({list.length})</div>
      <p className="text-xs text-md-on-surface-variant mb-3 max-w-2xl">
        Ketik SKU yang benar dari Master Barang, lalu Simpan — dipakai untuk semua baris yang sama (termasuk import berikutnya) dan HPP-nya langsung terisi.
        Awalan kode rak (mis. G6J-1B-) otomatis diabaikan saat mencocokkan, jadi yang tersisa di sini biasanya SKU berformat lama (kode rak + nama barang) atau huruf yang memang berbeda dari SKU sistem.
      </p>
      <datalist id="dl-sku-master">{(skuMaster || []).slice(0, 8000).map((s) => <option key={s.id ?? s.sku} value={s.sku} />)}</datalist>
      <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 divide-y divide-md-outline-variant max-h-[420px] overflow-y-auto">
        {tampil.map((x) => (
          <div key={x.k} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-sm font-medium truncate">{x.ref}</div>
              <div className="text-[11px] text-md-on-surface-variant truncate">{x.jumlah} baris · {x.nama}{x.variasi ? ` — ${x.variasi}` : ""}</div>
              {(() => {
                const aneh = karakterAneh(x.ref);
                const mirip = [...new Set([...(indeksLonggar.get(kunciLonggar(x.ref)) || []), ...(indeksLonggar.get(kunciLonggar(buangKodeRak(x.ref))) || [])])];
                return (
                  <>
                    {aneh.length > 0 && <div className="text-[11px] text-amber-400">Ada karakter tak biasa di kode Shopee: {aneh.join(", ")}</div>}
                    {mirip.length > 0 && (
                      <div className="text-[11px] text-sky-400 flex flex-wrap items-center gap-2">
                        Mirip di Master: {mirip.join(", ")}
                        <button className="underline" disabled={sibuk === x.k} onClick={async () => { setSibuk(x.k); await onSimpan(x.ref, mirip[0]); setSibuk(""); }}>Pakai ini</button>
                      </div>
                    )}
                    {!aneh.length && !mirip.length && <div className="text-[11px] text-md-on-surface-variant">Tidak ada SKU mirip di Master Barang yang dimuat ({(skuMaster || []).length} SKU).</div>}
                  </>
                );
              })()}
            </div>
            <input list="dl-sku-master" value={input[x.k] || ""} onChange={(e) => setInput((m) => ({ ...m, [x.k]: e.target.value }))}
              placeholder="SKU di Master Barang" className={`${inputClass} !w-64`} />
            <button className={btnTonal} disabled={!input[x.k] || sibuk === x.k}
              onClick={async () => { setSibuk(x.k); await onSimpan(x.ref, input[x.k]); setSibuk(""); }}>Simpan</button>
          </div>
        ))}
      </div>
      {list.length > tampil.length && <div className="text-[11px] text-md-on-surface-variant mt-2">Menampilkan 40 teratas (paling banyak muncul) — sisanya muncul setelah ini diselesaikan.</div>}
    </div>
  );
}

function PanelImportIklan({ platform, tokoKode, tokoLabel, filterToko, tabelAda, showToast, onSelesai }) {
  const [file, setFile] = useState(null);
  const [fileRincian, setFileRincian] = useState(null);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const baca = async () => {
    setSibuk(true); setStatus("Membaca file…"); setPreview(null);
    try {
      const utama = await parseLaporanIklan(await file.arrayBuffer());
      const rincian = fileRincian ? await parseRincianIklanOtomatis(await fileRincian.arrayBuffer()) : null;
      const hasil = gabungIklan(utama, rincian);
      // import iklan lain yang periodenya tumpang tindih -> akan digantikan (supaya biaya tidak dobel)
      const lama = await sbAll(`marketplace_iklan?select=periode_dari,periode_sampai,biaya&${filterToko}&periode_dari=lte.${hasil.sampai}&periode_sampai=gte.${hasil.dari}`);
      const gab = new Map();
      for (const x of lama || []) {
        const k = `${x.periode_dari}|${x.periode_sampai}`;
        if (!gab.has(k)) gab.set(k, { dari: x.periode_dari, sampai: x.periode_sampai, biaya: 0 });
        gab.get(k).biaya += Number(x.biaya) || 0;
      }
      setPreview({ ...hasil, tumpang: [...gab.values()] });
      setStatus("");
    } catch (e) {
      setStatus(e.message || "Gagal membaca file");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async () => {
    setSibuk(true);
    try {
      setStatus("Menyimpan…");
      if (preview.tumpang.length) {
        await sbTulis(`marketplace_iklan?${filterToko}&periode_dari=lte.${preview.sampai}&periode_sampai=gte.${preview.dari}`, { method: "DELETE", prefer: "return=minimal" });
      }
      const baris = preview.iklan.map((x) => ({ platform, toko: tokoKode, periode_dari: preview.dari, periode_sampai: preview.sampai, ...x }));
      for (let i = 0; i < baris.length; i += 200) {
        await sbTulis("marketplace_iklan", { method: "POST", prefer: "return=minimal", body: JSON.stringify(baris.slice(i, i + 200)) });
      }
      showToast?.(`Biaya iklan ${fmtRp(preview.totalBiaya)} (${baris.length} baris) tersimpan`);
      onSelesai();
    } catch (e) {
      setStatus(e.message || "Gagal menyimpan");
      setSibuk(false);
    }
  };

  const denganKode = preview ? preview.iklan.filter((x) => x.kode_produk).reduce((a, x) => a + x.biaya, 0) : 0;
  return (
    <div className="mb-5 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
      <div className="text-sm font-medium mb-1">Import Biaya Iklan Shopee</div>
      <p className="text-xs text-md-on-surface-variant mb-3 max-w-2xl">
        Seller Centre → Iklan Shopee → Data Keseluruhan → pilih periode → Unduh (CSV). Untuk total laba cukup file ke-1.
        File ke-2 (Rincian Data Iklan Produk Otomatis, periode yang sama) diperlukan supaya biaya Iklan Produk Otomatis ikut dibagi per SKU.
      </p>
      {!tabelAda && (
        <div className="mb-3 flex gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-md-lg px-3 py-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>Tabel <b>marketplace_iklan</b> belum ada di database — jalankan dulu file SQL <b>marketplace_iklan.sql</b>, lalu muat ulang halaman ini.</div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <label className="block text-xs text-md-on-surface-variant">
          <span className="block mb-1 text-md-on-surface">1. Data Keseluruhan Iklan (wajib)</span>
          <input type="file" accept=".csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setStatus(""); }} className="block mt-1 text-xs" />
        </label>
        <label className="block text-xs text-md-on-surface-variant">
          <span className="block mb-1 text-md-on-surface">2. Rincian Data Iklan Produk Otomatis (disarankan)</span>
          <input type="file" accept=".csv" onChange={(e) => { setFileRincian(e.target.files?.[0] || null); setPreview(null); setStatus(""); }} className="block mt-1 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnTonal} disabled={!file || sibuk || !tabelAda} onClick={baca}>Baca file</button>
        {preview && <button className={btnFilled} disabled={sibuk} onClick={simpan}>Simpan biaya iklan</button>}
        <button className={btnText} onClick={onSelesai} disabled={sibuk}>Tutup</button>
        {status && <span className="text-xs text-md-on-surface-variant">{status}</span>}
      </div>
      {preview && (
        <div className="mt-3 text-xs text-md-on-surface-variant space-y-1">
          <div>Toko di file: <b className="text-md-on-surface">{preview.namaToko || preview.username || "?"}</b> → disimpan ke toko: <b className="text-md-on-surface">{tokoLabel || tokoKode}</b></div>
          <div>Periode: <b className="text-md-on-surface">{formatTanggalID(preview.dari)} – {formatTanggalID(preview.sampai)}</b> · {preview.iklan.length} baris</div>
          <div>Total biaya iklan: <b className="text-md-on-surface">{fmtRp(preview.totalBiaya)}</b> · omzet dari iklan: {fmtRp(preview.totalOmzet)}</div>
          <div>
            Yang punya Kode Produk (bisa dibagi ke SKU): <b className="text-md-on-surface">{fmtRp(denganKode)}</b>
            {preview.totalBiaya - denganKode > 0.5 && <span className="text-amber-400"> · tanpa kode produk: {fmtRp(Math.round(preview.totalBiaya - denganKode))}{!preview.rincianDipakai ? " (file ke-2 belum diisi: Iklan Produk Otomatis belum terpecah per produk)" : ""}</span>}
            {preview.rincianDipakai && Math.abs(preview.selisihBulat) >= 0.5 && <> · selisih pembulatan {fmtRp(preview.selisihBulat)} dicatat terpisah supaya total tetap sama dengan Shopee</>}
          </div>
          {preview.tumpang.length > 0 && (
            <div className="text-amber-400">
              Sudah ada import iklan di periode yang tumpang tindih ({preview.tumpang.map((t) => `${formatTanggalID(t.dari)}–${formatTanggalID(t.sampai)}: ${fmtRp(t.biaya)}`).join("; ")}) — akan digantikan oleh file ini supaya biaya tidak dobel.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelImportMassUpdate({ platform, tokoKode, tabelAda, jumlahTersimpan, showToast, onSelesai }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const baca = async () => {
    setSibuk(true); setStatus("Membaca file…"); setPreview(null);
    try {
      setPreview(await parseMassUpdate(await file.arrayBuffer()));
      setStatus("");
    } catch (e) {
      setStatus(e.message || "Gagal membaca file");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async () => {
    setSibuk(true);
    try {
      const sekarang = new Date().toISOString();
      const baris = preview.baris.map((b) => ({ platform, toko: tokoKode, ...b, diperbarui: sekarang }));
      for (let i = 0; i < baris.length; i += 500) {
        setStatus(`Menyimpan… ${Math.min(i + 500, baris.length)}/${baris.length}`);
        await sbTulis("marketplace_produk_map?on_conflict=platform,toko,kode_produk,kode_variasi", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(baris.slice(i, i + 500)),
        });
      }
      showToast?.(`Pemetaan ${preview.jumlahProduk} produk (${baris.length} variasi) tersimpan`);
      onSelesai();
    } catch (e) {
      setStatus(e.message || "Gagal menyimpan");
      setSibuk(false);
    }
  };

  return (
    <div className="mb-5 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
      <div className="text-sm font-medium mb-1">Import Mass Update Produk Shopee</div>
      <p className="text-xs text-md-on-surface-variant mb-3 max-w-2xl">
        Seller Centre → Produk Saya → Ubah Massal → Info Penjualan → unduh <b>semua produk</b> (jangan difilter stok/status — produk habis stok tetap bisa diiklankan).
        Dipakai untuk menghubungkan Kode Produk di laporan iklan ke SKU. Boleh diimport berkala: produk baru ditambah, yang berubah diperbarui, yang tidak ada di file baru tidak dihapus.
        {jumlahTersimpan > 0 && <> Saat ini tersimpan {jumlahTersimpan} variasi.</>}
      </p>
      {!tabelAda && (
        <div className="mb-3 flex gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-md-lg px-3 py-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>Tabel <b>marketplace_produk_map</b> belum ada di database — jalankan dulu file SQL <b>marketplace_iklan.sql</b>, lalu muat ulang halaman ini.</div>
        </div>
      )}
      <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setStatus(""); }} className="block text-xs mb-3" />
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnTonal} disabled={!file || sibuk || !tabelAda} onClick={baca}>Baca file</button>
        {preview && <button className={btnFilled} disabled={sibuk} onClick={simpan}>Simpan {preview.jumlahProduk} produk</button>}
        <button className={btnText} onClick={onSelesai} disabled={sibuk}>Tutup</button>
        {status && <span className="text-xs text-md-on-surface-variant">{status}</span>}
      </div>
      {preview && (
        <div className="mt-3 text-xs text-md-on-surface-variant space-y-1">
          <div><b className="text-md-on-surface">{preview.jumlahProduk}</b> produk · <b className="text-md-on-surface">{preview.baris.length}</b> variasi{preview.idToko ? ` · ID toko Shopee ${preview.idToko}` : ""} → disimpan ke toko ini</div>
          {preview.tanpaSku > 0 && <div>{preview.tanpaSku} variasi tidak punya SKU di Shopee (tetap disimpan, tapi tidak bisa dicocokkan lewat SKU).</div>}
          {preview.difilter && (
            <div className="text-amber-400">
              File ini diekspor dengan filter ({preview.filter?.product_status ? "hanya produk aktif" : ""}{preview.filter?.stock_condition ? `${preview.filter?.product_status ? ", " : ""}stok minimal ${preview.filter.stock_condition.stock_min ?? 1}` : ""}) — produk habis stok/nonaktif tidak ikut, jadi iklannya bisa tidak terbagi. Produk yang sudah tersimpan sebelumnya tetap dipertahankan.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelImport({ platform, tokoKode, filterToko, skuMap, aliasMap, showToast, onSelesai }) {
  const [fPenghasilan, setFPenghasilan] = useState(null);
  const [fPesanan, setFPesanan] = useState(null);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const baca = async () => {
    setSibuk(true); setStatus("Membaca file…"); setPreview(null);
    try {
      const income = await parseLaporanPenghasilan(await fPenghasilan.arrayBuffer());
      const pesanan = fPesanan ? await parseExportPesanan(await fPesanan.arrayBuffer()) : null;

      // baris yang sudah tersimpan untuk pesanan-pesanan ini (supaya data SKU lama tidak hilang)
      const nomor = [...income.orders.keys()];
      const existingByOrder = new Map();
      for (let i = 0; i < nomor.length; i += 80) {
        const potong = nomor.slice(i, i + 80).map(encodeURIComponent).join(",");
        const rows = await sbAll(`marketplace_penjualan?select=*&${filterToko}&no_pesanan=in.(${potong})`);
        for (const r of rows) { if (!existingByOrder.has(r.no_pesanan)) existingByOrder.set(r.no_pesanan, []); existingByOrder.get(r.no_pesanan).push(r); }
        setStatus(`Memeriksa data lama… ${Math.min(i + 80, nomor.length)}/${nomor.length}`);
      }
      const hasil = bangunBaris({ income, pesanan, existingByOrder, aliasMap, skuMap, platform, toko: tokoKode });
      const tanggal = [...income.orders.values()].map((o) => o.tanggal_dilepas).filter(Boolean).sort();
      setPreview({ ...hasil, existingByOrder, tidakPas: income.tidakPas, dari: tanggal[0], sampai: tanggal[tanggal.length - 1] });
      setStatus("");
    } catch (e) {
      setStatus(e.message || "Gagal membaca file");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async () => {
    setSibuk(true);
    try {
      const { baris, existingByOrder } = preview;
      for (let i = 0; i < baris.length; i += 400) {
        setStatus(`Menyimpan… ${Math.min(i + 400, baris.length)}/${baris.length}`);
        await sbTulis("marketplace_penjualan?on_conflict=platform,toko,no_pesanan,no_baris", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(baris.slice(i, i + 400)),
        });
      }
      // bersihkan baris sisa kalau jumlah baris SKU suatu pesanan berkurang dibanding import lama
      const barisMax = new Map();
      for (const b of baris) barisMax.set(b.no_pesanan, Math.max(barisMax.get(b.no_pesanan) || 0, b.no_baris));
      for (const [no, lama] of existingByOrder) {
        const max = barisMax.get(no);
        if (max && lama.some((l) => l.no_baris > max)) {
          await sbTulis(`marketplace_penjualan?${filterToko}&no_pesanan=eq.${encodeURIComponent(no)}&no_baris=gt.${max}`, { method: "DELETE", prefer: "return=minimal" });
        }
      }
      showToast?.(`${barisMax.size} pesanan (${baris.length} baris SKU) tersimpan`);
      onSelesai({ dari: preview.dari, sampai: preview.sampai });
    } catch (e) {
      setStatus(e.message || "Gagal menyimpan");
      setSibuk(false);
    }
  };

  const r = preview?.ringkas;
  return (
    <div className="mb-5 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
      <div className="text-sm font-medium mb-3">Import dari Shopee</div>
      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <label className="block text-xs text-md-on-surface-variant">
          <span className="block mb-1 text-md-on-surface">1. Laporan Penghasilan (wajib)</span>
          Seller Centre → Penghasilan Saya → Sudah Dilepas → Unduh Laporan Penghasilan
          <input type="file" accept=".xlsx" onChange={(e) => { setFPenghasilan(e.target.files?.[0] || null); setPreview(null); }} className="block mt-2 text-xs" />
        </label>
        <label className="block text-xs text-md-on-surface-variant">
          <span className="block mb-1 text-md-on-surface">2. Export Pesanan (disarankan)</span>
          Pesanan Saya → Export — isi SKU variasi & qty. Pakai rentang tanggal PESANAN yang mencakup pesanan di laporan di atas.
          <input type="file" accept=".xlsx" onChange={(e) => { setFPesanan(e.target.files?.[0] || null); setPreview(null); }} className="block mt-2 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnTonal} disabled={!fPenghasilan || sibuk} onClick={baca}>Baca file</button>
        {preview && <button className={btnFilled} disabled={sibuk} onClick={simpan}>Simpan {r.pesanan} pesanan</button>}
        <button className={btnText} onClick={() => onSelesai(null)} disabled={sibuk}>Tutup</button>
        {status && <span className="text-xs text-md-on-surface-variant">{status}</span>}
      </div>
      {preview && (
        <div className="mt-3 text-xs text-md-on-surface-variant space-y-1">
          <div>Periode dana dilepas: <b className="text-md-on-surface">{formatTanggalID(preview.dari)} – {formatTanggalID(preview.sampai)}</b> · {r.pesanan} pesanan</div>
          <div>SKU lengkap dari Export Pesanan: {r.dariExport}{r.dariTersimpan > 0 && <> · memakai data SKU tersimpan: {r.dariTersimpan}</>} · <span className={r.tanpaSku ? "text-amber-400" : ""}>belum ada data SKU: {r.tanpaSku}</span></div>
          <div>Baris SKU cocok Master Barang: {r.barisCocok} · <span className={r.barisTidakCocok ? "text-amber-400" : ""}>tidak cocok: {r.barisTidakCocok} ({r.referensiTidakCocok.size} kode berbeda — bisa dipetakan manual setelah disimpan)</span></div>
          {preview.tidakPas > 0 && <div className="text-amber-400">{preview.tidakPas} pesanan angkanya tidak pas dengan Total Penghasilan Shopee — periksa file.</div>}
          <div>Menyimpan ulang pesanan yang sudah ada akan menimpanya (aman diulang).</div>
        </div>
      )}
    </div>
  );
}