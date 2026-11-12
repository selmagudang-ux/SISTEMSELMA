import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ScanLine, Plus, Minus, Trash2, RefreshCw, ShoppingCart, Loader2, AlertCircle, Tag, BadgePercent } from "lucide-react";
import { sbAll, fmtRp } from "../../lib/api";
import { ScanKameraModal } from "../../components/ScanKamera";
import { hitungItem, hitungKeranjang, buatJerami, namaTampil } from "./kasirHitung";
import { muatPromoKasir, petaPromoAktif, hargaSetelahPromo, labelDiskon, tglPendek, muatDataGrosir, grosirBerjalan } from "./kasirPromo";
import ModalBayar from "./ModalBayar";
import { buatKunci } from "./kasirApi";
import {
  useStatusKasir,
  statusSekarang,
  simpanCacheEnt,
  bacaCacheEnt,
  qtyDiAntrian,
  adalahGalatJaringan,
  tandaiOnline,
  tandaiOffline,
  padaTersinkron,
  hangatkanCache,
} from "./kasirOffline";

// =========================================================
// KASIR — LAYAR KASIR INTI (fase 2)
// Cari/scan SKU -> keranjang -> diskon -> total.
// Barang & harga jual = Master Barang TOKO (master_toko: harga_jual, stok toko), terpisah
// dari Master Barang gudang. Stok dibatasi sesuai stok toko yang tercatat. Pembayaran & potong stok (fase 3): ModalBayar.jsx
// + kasirApi.js, disimpan lewat fungsi database kasir_simpan_transaksi.
// Scanner USB/Bluetooth bekerja seperti keyboard: ketik kode + Enter di kolom cari.
// =========================================================

const KOLOM = "id,kode,nama,kategori,barcode,hpp,harga_jual,stok,nonaktif,foto_url,sku_gudang";
// Bentuk master_toko disamakan dengan bentuk lama (sku/model/ecer/...) supaya seluruh
// layar kasir, pencarian, scan dan keranjang di bawah tidak perlu diubah.
const dariToko = (r) => ({
  id: r.id,
  sku: r.kode,
  model: r.nama,
  kategori: r.kategori,
  barcode_supplier: r.barcode,
  hpp: r.hpp,
  ecer: r.harga_jual,
  stok: r.stok,
  nonaktif: r.nonaktif,
  foto: r.foto_url,
  skuGudang: r.sku_gudang,
});
const MAKS_HASIL = 40;
const tglPendekJam = (ms) => new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function kunciSimpan(session) {
  return `kasir_keranjang_${session?.id ?? "x"}`;
}
function bacaSimpan(session) {
  try {
    const raw = sessionStorage.getItem(kunciSimpan(session));
    const d = raw ? JSON.parse(raw) : null;
    return {
      items: Array.isArray(d?.items) ? d.items : [],
      diskonTrx: d?.diskonTrx || { tipe: "rp", nilai: "" },
      kunci: d?.kunci || null,
    };
  } catch {
    return { items: [], diskonTrx: { tipe: "rp", nilai: "" }, kunci: null };
  }
}

// Samakan isi keranjang dengan data terbaru (harga, stok, SKU yang dinonaktifkan).
// Dipakai tiap kali daftar barang dimuat — termasuk keranjang yang dipulihkan setelah refresh.
function sinkronItems(items, rows, promoMap) {
  const peta = new Map(rows.map((s) => [s.sku, s]));
  const catatan = [];
  const out = [];
  for (const it of items) {
    const s = peta.get(it.sku);
    if (!s || s.nonaktif) {
      catatan.push(`${it.sku} dihapus (tidak dijual)`);
      continue;
    }
    const stok = Number(s.stok) || 0;
    const harga = Number(s.ecer) || 0;
    if (harga <= 0 || stok <= 0) {
      catatan.push(`${it.sku} dihapus (${harga <= 0 ? "harga kosong" : "stok habis"})`);
      continue;
    }
    let qty = it.qty;
    if (qty > stok) {
      qty = stok;
      catatan.push(`${it.sku} jumlah jadi ${stok}`);
    }
    if (harga !== it.harga) catatan.push(`${it.sku} harga jadi ${fmtRp(harga)}`);
    // Promo ikut disinkronkan: mulai, berakhir, atau berubah nilainya sejak barang masuk keranjang.
    const promoBaru = promoMap?.get(it.sku) || null;
    const promoLama = it.promo || null;
    if (promoBaru && !promoLama) catatan.push(`${it.sku} kena promo ${labelDiskon(promoBaru)}`);
    else if (!promoBaru && promoLama) catatan.push(`promo ${it.sku} sudah berakhir`);
    else if (promoBaru && promoLama && (promoBaru.id !== promoLama.id || promoBaru.nilai !== promoLama.nilai || promoBaru.tipe !== promoLama.tipe)) catatan.push(`promo ${it.sku} berubah jadi ${labelDiskon(promoBaru)}`);
    out.push({ ...it, harga, hpp: Number(s.hpp) || 0, stok, qty, promo: promoBaru, promoLepas: promoBaru ? !!it.promoLepas && promoLama?.id === promoBaru.id : false });
  }
  return { items: out, catatan };
}

function InputDiskon({ tipe, nilai, onTipe, onNilai, kecil = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex p-0.5 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0">
        {["rp", "persen"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTipe(t)}
            className={`px-2.5 ${kecil ? "py-1 text-[11px]" : "py-1.5 text-xs"} font-semibold rounded-md transition-colors ${
              tipe === t ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "rp" ? "Rp" : "%"}
          </button>
        ))}
      </div>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={nilai}
        onChange={(e) => onNilai(e.target.value)}
        placeholder="0"
        className={`w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2.5 tabular-nums ${
          kecil ? "py-1.5 text-xs" : "py-2 text-sm"
        } outline-none focus:border-amber-500`}
      />
    </div>
  );
}

// versiData: angka yang dinaikkan induk (mis. setelah Barang Toko ditutup) supaya daftar barang dimuat ulang.
export default function LayarKasir({ session, versiData = 0 }) {
  const [skuList, setSkuList] = useState([]);
  // Map(sku -> promo yang sedang berjalan). Gagal dimuat (mis. tabel belum dibuat) = tanpa promo, kasir tetap jalan.
  const [promoMap, setPromoMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [errMuat, setErrMuat] = useState("");
  // Data barang berasal dari salinan di perangkat (internet putus). waktu = kapan salinan itu dibuat.
  const [dariCache, setDariCache] = useState(null);
  const statusKoneksi = useStatusKasir();
  const [q, setQ] = useState("");
  const [items, setItems] = useState(() => bacaSimpan(session).items);
  const [diskonTrx, setDiskonTrx] = useState(() => bacaSimpan(session).diskonTrx);
  // Satu keranjang = satu kunci. Dikirim ke database supaya transaksi yang sama tidak
  // tersimpan dua kali kalau tombol Bayar ditekan ulang (mis. koneksi putus).
  const [kunci, setKunci] = useState(() => bacaSimpan(session).kunci);
  const [bayarBuka, setBayarBuka] = useState(false);
  const [bukaDiskon, setBukaDiskon] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [scanBuka, setScanBuka] = useState(false);
  const [hasilScan, setHasilScan] = useState(null);
  const inputRef = useRef(null);
  const toastTimer = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const promoRef = useRef(new Map());
  // Promo grosir: pengaturan (min pcs, tanggal) + peta harga grosir per SKU toko. Gagal dimuat = tanpa promo grosir.
  const [cfgGrosir, setCfgGrosir] = useState(null);
  const [grosirMap, setGrosirMap] = useState(() => new Map());
  const grosirRef = useRef({ cfg: null, master: new Map() });

  const tampilToast = useCallback((pesan, tipe = "err") => {
    clearTimeout(toastTimer.current);
    setToast({ pesan, tipe });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const terakhirMuat = useRef(0);
  // Terapkan daftar barang + promo (dari server ATAU dari salinan di perangkat) ke layar.
  // Stok dikurangi penjualan yang masih antri (belum terkirim ke server) supaya barang yang sama
  // tidak terjual melebihi stok saat offline.
  const terapkan = useCallback(
    async (rowsToko, rowsPromo, dataGrosir) => {
      const antri = await qtyDiAntrian();
      const rows = (rowsToko || [])
        .map(dariToko)
        .map((r) => (antri.has(r.sku) ? { ...r, stok: Math.max(0, (Number(r.stok) || 0) - antri.get(r.sku)) } : r));
      setSkuList(rows.filter((s) => !s.nonaktif));
      // Kalau promo gagal dimuat, pakai promo terakhir yang berhasil dimuat (jangan hilang mendadak).
      const peta = rowsPromo ? petaPromoAktif(rowsPromo, new Map(rows.map((s) => [s.sku, { harga: Number(s.ecer) || 0, kategori: s.kategori }]))) : promoRef.current;
      promoRef.current = peta;
      setPromoMap(peta);
      // Harga grosir: dataGrosir null/undefined = pakai yang terakhir berhasil dimuat.
      if (dataGrosir) grosirRef.current = { cfg: dataGrosir.cfg, master: new Map(dataGrosir.master || []) };
      const gm = grosirRef.current.master;
      const pg = new Map();
      rows.forEach((r) => {
        const g = r.skuGudang ? gm.get(r.skuGudang) : 0;
        if (g > 0) pg.set(r.sku, g);
      });
      setGrosirMap(pg);
      setCfgGrosir(grosirRef.current.cfg);
      const { items: baru, catatan } = sinkronItems(itemsRef.current, rows, peta);
      if (catatan.length) {
        setItems(baru);
        tampilToast(`Keranjang disesuaikan: ${catatan.join("; ")}`);
      }
    },
    [tampilToast]
  );

  // diam = true: muat ulang di latar belakang (tanpa spinner / pesan galat), dipakai sinkronisasi otomatis.
  // Saat status offline, muat diam-diam langsung memakai salinan di perangkat (tidak menunggu jaringan).
  const muat = useCallback(async (diam = false) => {
    if (!diam) {
      setLoading(true);
      setErrMuat("");
    }
    try {
      if (diam && statusSekarang().offline) {
        const c = await bacaCacheEnt("master_toko");
        if (c) {
          const p = await bacaCacheEnt("promo");
          const g = await bacaCacheEnt("grosir");
          await terapkan(c.data, p?.data ?? null, g?.data ?? null);
          setDariCache({ waktu: c.waktu });
          return;
        }
      }
      const [rowsToko, rowsPromo, dataGrosir] = await Promise.all([
        sbAll(`master_toko?select=${KOLOM}&order=kode`),
        muatPromoKasir().catch(() => null), // null = promo gagal dimuat, jangan ganggu penjualan
        muatDataGrosir().catch(() => null), // null = promo grosir gagal dimuat, jangan ganggu penjualan
      ]);
      terakhirMuat.current = Date.now();
      tandaiOnline();
      setDariCache(null);
      simpanCacheEnt("master_toko", rowsToko || []);
      if (rowsPromo) simpanCacheEnt("promo", rowsPromo);
      if (dataGrosir) simpanCacheEnt("grosir", dataGrosir);
      await terapkan(rowsToko, rowsPromo, dataGrosir);
    } catch (e) {
      if (adalahGalatJaringan(e)) {
        tandaiOffline();
        const c = await bacaCacheEnt("master_toko");
        if (c) {
          const p = await bacaCacheEnt("promo");
          const g = await bacaCacheEnt("grosir");
          await terapkan(c.data, p?.data ?? null, g?.data ?? null);
          setDariCache({ waktu: c.waktu });
          return;
        }
        if (!diam) setErrMuat("Tidak ada koneksi dan daftar barang belum tersimpan di perangkat ini. Sambungkan internet sekali untuk memuat barang.");
        return;
      }
      if (!diam) setErrMuat(e.message || "Gagal memuat daftar barang");
    } finally {
      if (!diam) setLoading(false);
    }
  }, [terapkan]);
  useEffect(() => {
    muat();
  }, [muat, versiData]);

  // Sinkronisasi otomatis (perubahan dari perangkat lain: stok, harga, barang baru, foto):
  // muat ulang diam-diam tiap 60 detik, dan saat jendela/aplikasi kembali dibuka kalau sudah >20 detik.
  useEffect(() => {
    const cukupLama = (ms) => Date.now() - terakhirMuat.current > ms;
    const tiapMenit = setInterval(() => {
      if (!document.hidden && cukupLama(55000)) muat(true);
    }, 60000);
    const saatKembali = () => {
      if (!document.hidden && cukupLama(20000)) muat(true);
    };
    document.addEventListener("visibilitychange", saatKembali);
    window.addEventListener("focus", saatKembali);
    return () => {
      clearInterval(tiapMenit);
      document.removeEventListener("visibilitychange", saatKembali);
      window.removeEventListener("focus", saatKembali);
    };
  }, [muat]);

  // Mode offline: (1) siapkan bahan penjualan offline ke perangkat saat online, (2) begitu transaksi antrian
  // terkirim muat ulang stok dari server, (3) begitu koneksi kembali dari offline muat ulang juga.
  useEffect(() => {
    hangatkanCache();
    const lepas = padaTersinkron(() => muat(true));
    const tiapMenit = setInterval(() => {
      if (!statusSekarang().offline) hangatkanCache();
    }, 5 * 60 * 1000);
    return () => {
      lepas();
      clearInterval(tiapMenit);
    };
  }, [muat]);
  const pernahOffline = useRef(false);
  useEffect(() => {
    if (statusKoneksi.offline) pernahOffline.current = true;
    else if (pernahOffline.current) {
      pernahOffline.current = false;
      muat(true);
      hangatkanCache({ paksa: true });
    }
  }, [statusKoneksi.offline, muat]);

  // Keranjang bertahan kalau halaman di-refresh (hilang saat tab ditutup / logout).
  useEffect(() => {
    try {
      sessionStorage.setItem(kunciSimpan(session), JSON.stringify({ items, diskonTrx, kunci }));
    } catch {
      /* penyimpanan penuh / diblokir — abaikan */
    }
  }, [items, diskonTrx, kunci, session]);

  // Indeks pencarian: dibuat sekali per daftar SKU.
  const indeks = useMemo(() => {
    const perKode = new Map();
    const jerami = [];
    for (const s of skuList) {
      perKode.set(String(s.sku).toLowerCase(), s);
      if (s.barcode_supplier) perKode.set(String(s.barcode_supplier).toLowerCase(), s);
      jerami.push([buatJerami(s), s]);
    }
    return { perKode, jerami };
  }, [skuList]);

  const hasilCari = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return [];
    const out = [];
    for (const [j, s] of indeks.jerami) {
      if (kata.every((k) => j.includes(k))) {
        out.push(s);
        if (out.length >= MAKS_HASIL) break;
      }
    }
    return out;
  }, [q, indeks]);

  // Kolom cari kosong -> tampilkan daftar barang toko (urut kode) supaya kasir bisa
  // langsung pilih tanpa mengetik. Ada isi -> tampilkan hasil pencarian.
  const cariKosong = !q.trim();
  const daftarTampil = cariKosong ? skuList.slice(0, MAKS_HASIL) : hasilCari;

  // Tambah 1 pcs ke keranjang. Mengembalikan { ok, pesan } supaya bisa dipakai
  // oleh klik hasil cari, Enter (scanner USB), dan kamera.
  const tambah = useCallback(
    (s) => {
      const harga = Number(s.ecer) || 0;
      const stok = Number(s.stok) || 0;
      if (harga <= 0) return { ok: false, pesan: `${s.sku}: harga ecer belum diisi di Master Barang` };
      if (stok <= 0) return { ok: false, pesan: `${s.sku}: stok habis` };
      const ada = items.find((it) => it.sku === s.sku);
      if (ada && ada.qty + 1 > stok) return { ok: false, pesan: `${s.sku}: stok hanya ${stok}` };
      setItems((prev) =>
        ada
          ? prev.map((it) => (it.sku === s.sku ? { ...it, qty: it.qty + 1, stok } : it))
          : [
              ...prev,
              { sku: s.sku, nama: namaTampil(s), harga, hpp: Number(s.hpp) || 0, stok, qty: 1, diskonTipe: "rp", diskonNilai: "", promo: promoMap.get(s.sku) || null, promoLepas: false },
            ]
      );
      return { ok: true, pesan: `${namaTampil(s)} ditambahkan` };
    },
    [items, promoMap]
  );

  const tambahDariKode = (kode) => {
    const s = indeks.perKode.get(String(kode).trim().toLowerCase());
    if (!s) return { ok: false, pesan: `Kode "${kode}" tidak ditemukan` };
    return tambah(s);
  };

  const onEnterCari = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const teks = q.trim();
    if (!teks) return;
    // Kode persis (scanner / ketik SKU lengkap) menang atas hasil pencarian.
    let s = indeks.perKode.get(teks.toLowerCase());
    if (!s && hasilCari.length === 1) s = hasilCari[0];
    if (!s) {
      tampilToast(hasilCari.length ? "Pilih salah satu dari daftar" : `"${teks}" tidak ditemukan`);
      return;
    }
    const r = tambah(s);
    if (!r.ok) tampilToast(r.pesan);
    else {
      setQ("");
      inputRef.current?.focus();
    }
  };

  const pilihHasil = (s) => {
    const r = tambah(s);
    if (!r.ok) return tampilToast(r.pesan);
    setQ("");
    inputRef.current?.focus();
  };

  const onDetectKamera = (kode) => {
    const r = tambahDariKode(kode);
    setHasilScan({ tipe: r.ok ? "ok" : "err", pesan: r.pesan });
  };

  const ubahQty = (sku, qtyBaru) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.sku !== sku) return it;
        let n = Math.floor(Number(qtyBaru) || 0);
        if (n < 1) n = 1;
        if (n > it.stok) {
          tampilToast(`${sku}: stok hanya ${it.stok}`);
          n = it.stok;
        }
        return { ...it, qty: n };
      })
    );
  };
  const hapusItem = (sku) => setItems((prev) => prev.filter((it) => it.sku !== sku));
  const ubahItem = (sku, patch) => setItems((prev) => prev.map((it) => (it.sku === sku ? { ...it, ...patch } : it)));
  const toggleDiskon = (sku) =>
    setBukaDiskon((prev) => {
      const n = new Set(prev);
      n.has(sku) ? n.delete(sku) : n.add(sku);
      return n;
    });
  const kosongkan = () => {
    if (!items.length) return;
    if (!window.confirm("Kosongkan keranjang?")) return;
    setItems([]);
    setDiskonTrx({ tipe: "rp", nilai: "" });
    setBukaDiskon(new Set());
    setKunci(null);
  };

  const bukaBayar = () => {
    if (!kunci) setKunci(buatKunci());
    setBayarBuka(true);
  };
  // Transaksi tersimpan -> keranjang langsung dikosongkan (supaya tidak bisa terbayar dua kali),
  // stok di layar dimuat ulang. Modal tetap terbuka menampilkan kembalian.
  const setelahBayar = () => {
    setItems([]);
    setDiskonTrx({ tipe: "rp", nilai: "" });
    setBukaDiskon(new Set());
    setKunci(null);
    muat(true);
  };

  // Promo grosir: total pcs gabungan seluruh keranjang >= minimal -> barang yang punya harga grosir dihitung harga grosir.
  const totalQty = items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
  const grosirNyala = grosirBerjalan(cfgGrosir);
  const grosirTercapai = grosirNyala && totalQty >= cfgGrosir.min_qty;
  const itemsH = useMemo(
    () => (grosirTercapai ? items.map((it) => (grosirMap.get(it.sku) > 0 ? { ...it, hargaGrosirAktif: grosirMap.get(it.sku) } : it)) : items),
    [items, grosirMap, grosirTercapai]
  );
  const ringkas = hitungKeranjang(itemsH, diskonTrx);
  const totalDiskonItem = itemsH.reduce((a, it) => a + hitungItem(it).diskon, 0);
  const qtyDiKeranjang = useMemo(() => new Map(items.map((it) => [it.sku, it.qty])), [items]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
      {/* ===== KIRI: cari & pilih barang ===== */}
      <section className="lg:flex-1 p-3 lg:p-5 lg:overflow-y-auto">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              autoFocus={typeof window !== "undefined" && window.matchMedia?.("(pointer:fine)").matches}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onEnterCari}
              placeholder="Scan atau ketik kode, nama barang"
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-[15px] outline-none transition-colors focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10"
            />
          </div>
          <button
            onClick={() => {
              setHasilScan(null);
              setScanBuka(true);
            }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm px-4 py-3.5 rounded-2xl flex-shrink-0 transition-colors"
          >
            <ScanLine size={18} /> <span className="hidden sm:inline">Scan</span>
          </button>
          <button
            onClick={() => muat()}
            disabled={loading}
            title="Muat ulang stok & harga"
            className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 disabled:opacity-50 flex-shrink-0 transition-colors"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {dariCache && (
          <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>
              Memakai data barang yang tersimpan di perangkat (terakhir diperbarui {tglPendekJam(dariCache.waktu)}). Stok dihitung dari penjualan di perangkat ini.
            </span>
          </div>
        )}
        {errMuat && (
          <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0" /> {errMuat}
          </div>
        )}

        {loading && !skuList.length ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Memuat daftar barang…
          </div>
        ) : daftarTampil.length === 0 ? (
          cariKosong ? (
            <div className="mt-12 text-center text-sm text-slate-400">
              <Tag size={28} className="mx-auto mb-2 text-slate-600" />
              Belum ada barang toko aktif.
              <div className="text-xs text-slate-500 mt-1">Tambahkan lewat Barang Toko atau pindahkan dari Master Barang.</div>
            </div>
          ) : (
            <div className="mt-12 text-center text-sm text-slate-400">
              Tidak ada barang yang cocok dengan “{q.trim()}”.
              <div className="text-xs text-slate-500 mt-1">Coba kata kunci lain atau scan barcode barangnya.</div>
            </div>
          )
        ) : (
          <>
            <div className="mt-4 mb-2.5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-200">{cariKosong ? "Barang toko" : "Hasil pencarian"}</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {cariKosong ? `${skuList.length} barang aktif` : `${daftarTampil.length} barang`}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {daftarTampil.map((s) => {
                const stok = Number(s.stok) || 0;
                const harga = Number(s.ecer) || 0;
                const tidakBisa = stok <= 0 || harga <= 0;
                const diKeranjang = qtyDiKeranjang.get(s.sku) || 0;
                const promo = promoMap.get(s.sku) || null;
                const hargaPromo = promo ? hargaSetelahPromo(harga, promo) : 0;
                return (
                  <button
                    key={s.id ?? s.sku}
                    onClick={() => pilihHasil(s)}
                    disabled={tidakBisa}
                    className={`relative text-left rounded-2xl p-3.5 border transition-all active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed ${
                      diKeranjang > 0
                        ? "bg-amber-500/[0.06] border-amber-500/50"
                        : "bg-slate-900/70 border-slate-800 hover:border-slate-600 hover:bg-slate-900"
                    }`}
                  >
                    {diKeranjang > 0 && (
                      <span className="absolute top-3 right-3 text-[11px] font-bold bg-amber-500 text-slate-950 rounded-full px-2 py-0.5 tabular-nums">
                        × {diKeranjang}
                      </span>
                    )}
                    {promo && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-400 rounded-full px-2 py-0.5 mb-2">
                        <BadgePercent size={12} /> Promo {labelDiskon(promo)}
                      </span>
                    )}
                    <div className="flex gap-3">
                      {s.foto && (
                        <img
                          src={s.foto}
                          alt=""
                          loading="lazy"
                          className="w-14 h-14 rounded-xl object-cover bg-slate-800 flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-semibold text-slate-100 leading-snug line-clamp-2 min-h-[2.5rem] ${diKeranjang > 0 ? "pr-12" : ""}`}>
                          {namaTampil(s)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 font-mono">{s.sku}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-slate-800">
                      {promo && harga > 0 ? (
                        <span className="flex flex-col leading-tight">
                          <span className="text-[11px] text-slate-500 line-through tabular-nums">{fmtRp(harga)}</span>
                          <span className="text-base font-bold tabular-nums text-emerald-400">{fmtRp(hargaPromo)}</span>
                        </span>
                      ) : (
                        <span className={`text-base font-bold tabular-nums ${harga > 0 ? "text-amber-400" : "text-red-400"}`}>
                          {harga > 0 ? fmtRp(harga) : "Harga kosong"}
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 tabular-nums ${
                          stok <= 0
                            ? "bg-red-500/15 text-red-400"
                            : stok <= 3
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {stok <= 0 ? "Stok habis" : stok <= 3 ? `Sisa ${stok}` : `Stok ${stok}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {daftarTampil.length >= MAKS_HASIL && (!cariKosong || skuList.length > MAKS_HASIL) && (
          <div className="mt-3 text-xs text-slate-500 text-center">Menampilkan {MAKS_HASIL} pertama. Persempit pencarian untuk melihat yang lain.</div>
        )}
      </section>

      {/* ===== KANAN: keranjang (seperti struk) ===== */}
      <aside className="lg:w-[420px] lg:border-l border-t lg:border-t-0 border-slate-800 bg-slate-900/50 flex flex-col lg:overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShoppingCart size={17} className="text-amber-500" />
            <span className="text-[15px] font-semibold">Keranjang</span>
            {ringkas.jumlahQty > 0 && (
              <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-0.5 tabular-nums">{ringkas.jumlahQty} pcs</span>
            )}
          </div>
          <button
            onClick={kosongkan}
            disabled={!items.length}
            className="text-xs font-medium text-slate-500 hover:text-red-400 disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
          >
            Kosongkan
          </button>
        </div>

        {grosirNyala && items.length > 0 && (
          <div className={`mx-3 mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${grosirTercapai ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
            <BadgePercent size={14} className="flex-shrink-0" />
            {grosirTercapai
              ? `Harga grosir aktif (${totalQty} pcs, min. ${cfgGrosir.min_qty})`
              : `Beli ${cfgGrosir.min_qty} pcs (campur barang boleh) → harga grosir. Kurang ${cfgGrosir.min_qty - totalQty} pcs`}
          </div>
        )}
        <div className="flex-1 lg:overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart size={30} className="mx-auto mb-2 text-slate-700" />
              <div className="text-sm text-slate-400">Keranjang masih kosong</div>
              <div className="text-xs text-slate-500 mt-1">Scan barcode atau pilih barang di sebelah kiri.</div>
            </div>
          ) : (
            itemsH.map((it) => {
              const h = hitungItem(it);
              const terbuka = bukaDiskon.has(it.sku) || h.diskonManual > 0;
              return (
                <div key={it.sku} className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 leading-snug">{it.nama}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {it.sku} · <span className="tabular-nums">{fmtRp(it.harga)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => hapusItem(it.sku)}
                      className="p-1.5 -m-1 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 transition-colors"
                      title="Hapus dari keranjang"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => ubahQty(it.sku, it.qty - 1)}
                        disabled={it.qty <= 1}
                        className="w-9 h-9 rounded-xl border border-slate-700 hover:bg-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-35 transition-colors"
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={it.qty}
                        onChange={(e) => ubahQty(it.sku, e.target.value)}
                        className="w-12 h-9 text-center bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold tabular-nums outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => ubahQty(it.sku, it.qty + 1)}
                        disabled={it.qty >= it.stok}
                        className="w-9 h-9 rounded-xl border border-slate-700 hover:bg-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-35 transition-colors"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <div className="text-right">
                      {h.diskon > 0 && <div className="text-[11px] text-slate-500 line-through tabular-nums">{fmtRp(h.kotor)}</div>}
                      <div className="text-[15px] font-bold text-slate-100 tabular-nums">{fmtRp(h.subtotal)}</div>
                    </div>
                  </div>

                  {h.grosir && (
                    <div className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <BadgePercent size={13} /> Harga grosir <span className="tabular-nums">{fmtRp(it.hargaGrosirAktif)}</span>
                      <span className="tabular-nums">· − {fmtRp(h.diskonPromo)}</span>
                    </div>
                  )}
                  {it.promo && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 font-semibold ${it.promoLepas ? "text-slate-500 line-through" : "text-emerald-400"}`}>
                        <BadgePercent size={13} /> Promo {labelDiskon(it.promo)}{it.promo.kategori ? ` · ${it.promo.kategori}` : ""}
                        {!it.promoLepas && !h.grosir && h.diskonPromo > 0 && <span className="tabular-nums">· − {fmtRp(h.diskonPromo)}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => ubahItem(it.sku, { promoLepas: !it.promoLepas })}
                        title={`Berlaku s/d ${tglPendek(it.promo.selesai)}`}
                        className="text-slate-500 hover:text-amber-400 font-medium transition-colors"
                      >
                        {it.promoLepas ? "Pakai promo" : "Lepas promo"}
                      </button>
                    </div>
                  )}

                  {terbuka ? (
                    <div className="mt-2.5">
                      <InputDiskon
                        kecil
                        tipe={it.diskonTipe}
                        nilai={it.diskonNilai}
                        onTipe={(t) => ubahItem(it.sku, { diskonTipe: t })}
                        onNilai={(v) => ubahItem(it.sku, { diskonNilai: v })}
                      />
                    </div>
                  ) : (
                    <button onClick={() => toggleDiskon(it.sku)} className="mt-2.5 text-xs font-medium text-slate-500 hover:text-amber-400 transition-colors">
                      + Diskon item
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Ringkasan & tombol bayar */}
        <div className="border-t border-slate-800 px-5 pt-4 pb-5 space-y-2.5 bg-slate-900 sticky bottom-0">
          <div className="flex items-center justify-between text-[13px] text-slate-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmtRp(ringkas.subtotal + totalDiskonItem)}</span>
          </div>
          {totalDiskonItem > 0 && (
            <div className="flex items-center justify-between text-[13px] text-slate-400">
              <span>Diskon item</span>
              <span className="text-emerald-400 tabular-nums">− {fmtRp(totalDiskonItem)}</span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between text-[13px] text-slate-400 mb-1.5">
              <span>Diskon transaksi</span>
              {ringkas.diskonTransaksi > 0 && <span className="text-emerald-400 tabular-nums">− {fmtRp(ringkas.diskonTransaksi)}</span>}
            </div>
            <InputDiskon
              kecil
              tipe={diskonTrx.tipe}
              nilai={diskonTrx.nilai}
              onTipe={(t) => setDiskonTrx((d) => ({ ...d, tipe: t }))}
              onNilai={(v) => setDiskonTrx((d) => ({ ...d, nilai: v }))}
            />
          </div>
          <div className="flex items-end justify-between pt-3 mt-1 border-t border-dashed border-slate-700">
            <span className="text-sm font-semibold text-slate-300 pb-1">Total</span>
            <span className="text-3xl font-extrabold text-amber-400 tabular-nums tracking-tight leading-none">{fmtRp(ringkas.total)}</span>
          </div>
          <button
            onClick={bukaBayar}
            disabled={!items.length || ringkas.total <= 0}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold text-base py-3.5 rounded-2xl transition-colors"
          >
            Bayar
          </button>
        </div>
      </aside>

      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-50 max-w-[90vw] px-4 py-3 rounded-2xl text-sm font-medium shadow-elevation-3 border ${
            toast.tipe === "err"
              ? "bg-red-950 border-red-500/40 text-red-200"
              : "bg-emerald-950 border-emerald-500/40 text-emerald-200"
          }`}
        >
          {toast.pesan}
        </div>
      )}

      {bayarBuka && (
        <ModalBayar
          total={ringkas.total}
          items={itemsH}
          diskonTransaksi={ringkas.diskonTransaksi}
          session={session}
          kunci={kunci}
          onSukses={setelahBayar}
          onMuatUlang={muat}
          onClose={() => setBayarBuka(false)}
        />
      )}

      {scanBuka && (
        <ScanKameraModal
          continuous
          judul="Scan Barang"
          onDetect={onDetectKamera}
          onClose={() => setScanBuka(false)}
          hasil={hasilScan}
          renderHasil={(h) => <div className="text-sm font-medium text-center px-3">{h.pesan}</div>}
        />
      )}
    </div>
  );
}