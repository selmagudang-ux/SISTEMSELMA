import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ScanLine, Plus, Minus, Trash2, RefreshCw, ShoppingCart, Loader2, AlertCircle, Tag } from "lucide-react";
import { sbAll, fmtRp } from "../../lib/api";
import { ScanKameraModal } from "../../components/ScanKamera";
import { hitungItem, hitungKeranjang, buatJerami, namaTampil } from "./kasirHitung";
import ModalBayar from "./ModalBayar";
import { buatKunci } from "./kasirApi";

// =========================================================
// KASIR — LAYAR KASIR INTI (fase 2)
// Cari/scan SKU -> keranjang -> diskon -> total.
// Harga jual = kolom "ecer" di Master Barang (sku_master). Stok dibatasi
// sesuai stok yang tercatat. Pembayaran & potong stok (fase 3): ModalBayar.jsx
// + kasirApi.js, disimpan lewat fungsi database kasir_simpan_transaksi.
// Scanner USB/Bluetooth bekerja seperti keyboard: ketik kode + Enter di kolom cari.
// =========================================================

const KOLOM = "id,sku,bahan,kategori,subkategori,model,warna,ukuran,hpp,ecer,stok,barcode_supplier,nonaktif";
const MAKS_HASIL = 40;

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
function sinkronItems(items, rows) {
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
    out.push({ ...it, harga, hpp: Number(s.hpp) || 0, stok, qty });
  }
  return { items: out, catatan };
}

function InputDiskon({ tipe, nilai, onTipe, onNilai, kecil = false }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex rounded-lg border border-slate-700 overflow-hidden flex-shrink-0">
        {["rp", "persen"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTipe(t)}
            className={`px-2 ${kecil ? "py-1 text-[11px]" : "py-1.5 text-xs"} font-medium ${
              tipe === t ? "bg-amber-500 text-slate-950" : "bg-slate-900 text-slate-400"
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
        className={`w-full min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2 ${
          kecil ? "py-1 text-xs" : "py-1.5 text-sm"
        } outline-none focus:border-amber-500`}
      />
    </div>
  );
}

export default function LayarKasir({ session }) {
  const [skuList, setSkuList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMuat, setErrMuat] = useState("");
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

  const tampilToast = useCallback((pesan, tipe = "err") => {
    clearTimeout(toastTimer.current);
    setToast({ pesan, tipe });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMuat("");
    try {
      const rows = (await sbAll(`sku_master?select=${KOLOM}&order=sku`)) || [];
      setSkuList(rows.filter((s) => !s.nonaktif));
      const { items: baru, catatan } = sinkronItems(itemsRef.current, rows);
      if (catatan.length) {
        setItems(baru);
        tampilToast(`Keranjang disesuaikan: ${catatan.join("; ")}`);
      }
    } catch (e) {
      setErrMuat(e.message || "Gagal memuat daftar barang");
    } finally {
      setLoading(false);
    }
  }, [tampilToast]);
  useEffect(() => {
    muat();
  }, [muat]);

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
              { sku: s.sku, nama: namaTampil(s), harga, hpp: Number(s.hpp) || 0, stok, qty: 1, diskonTipe: "rp", diskonNilai: "" },
            ]
      );
      return { ok: true, pesan: `${namaTampil(s)} ditambahkan` };
    },
    [items]
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
    muat();
  };

  const ringkas = hitungKeranjang(items, diskonTrx);
  const totalDiskonItem = items.reduce((a, it) => a + hitungItem(it).diskon, 0);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
      {/* ===== KIRI: cari & pilih barang ===== */}
      <section className="lg:flex-1 p-3 lg:p-4 lg:overflow-y-auto">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              autoFocus={typeof window !== "undefined" && window.matchMedia?.("(pointer:fine)").matches}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onEnterCari}
              placeholder="Scan / ketik SKU, model, warna…"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <button
            onClick={() => {
              setHasilScan(null);
              setScanBuka(true);
            }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm px-3.5 py-2.5 rounded-xl flex-shrink-0"
          >
            <ScanLine size={16} /> <span className="hidden sm:inline">Scan</span>
          </button>
          <button
            onClick={muat}
            disabled={loading}
            title="Muat ulang stok & harga"
            className="p-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {errMuat && (
          <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0" /> {errMuat}
          </div>
        )}

        {loading && !skuList.length ? (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Memuat daftar barang…
          </div>
        ) : !q.trim() ? (
          <div className="mt-10 text-center text-sm text-slate-500">
            <Tag size={26} className="mx-auto mb-2 text-slate-700" />
            Scan barcode atau ketik untuk mencari barang.
            <div className="text-[11px] text-slate-600 mt-1">{skuList.length} barang aktif</div>
          </div>
        ) : hasilCari.length === 0 ? (
          <div className="mt-10 text-center text-sm text-slate-500">Tidak ada barang yang cocok.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {hasilCari.map((s) => {
              const stok = Number(s.stok) || 0;
              const harga = Number(s.ecer) || 0;
              const tidakBisa = stok <= 0 || harga <= 0;
              return (
                <button
                  key={s.id ?? s.sku}
                  onClick={() => pilihHasil(s)}
                  disabled={tidakBisa}
                  className="text-left bg-slate-900/60 border border-slate-800 rounded-xl p-3 hover:border-amber-500/60 disabled:opacity-45 disabled:hover:border-slate-800"
                >
                  <div className="text-sm font-medium text-slate-100 leading-snug">{namaTampil(s)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{s.sku}</div>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-amber-400 font-semibold text-sm">{harga > 0 ? fmtRp(harga) : "Harga kosong"}</span>
                    <span className={`text-[11px] ${stok <= 0 ? "text-red-400" : stok <= 3 ? "text-amber-400" : "text-slate-500"}`}>
                      {stok <= 0 ? "Stok habis" : `Stok ${stok}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {hasilCari.length >= MAKS_HASIL && (
          <div className="mt-2 text-[11px] text-slate-600 text-center">Menampilkan {MAKS_HASIL} pertama — persempit pencarian.</div>
        )}
      </section>

      {/* ===== KANAN: keranjang ===== */}
      <aside className="lg:w-[400px] lg:border-l border-t lg:border-t-0 border-slate-800 bg-slate-900/40 flex flex-col lg:overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart size={15} className="text-amber-500" /> Keranjang
            {ringkas.jumlahQty > 0 && <span className="text-xs font-normal text-slate-500">· {ringkas.jumlahQty} pcs</span>}
          </div>
          <button
            onClick={kosongkan}
            disabled={!items.length}
            className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 disabled:hover:text-slate-500"
          >
            Kosongkan
          </button>
        </div>

        <div className="flex-1 lg:overflow-y-auto px-3 py-2 space-y-2 min-h-[120px]">
          {items.length === 0 ? (
            <div className="text-center text-sm text-slate-600 py-8">Keranjang kosong</div>
          ) : (
            items.map((it) => {
              const h = hitungItem(it);
              const terbuka = bukaDiskon.has(it.sku) || h.diskon > 0;
              return (
                <div key={it.sku} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 leading-snug">{it.nama}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{it.sku} · {fmtRp(it.harga)}</div>
                    </div>
                    <button onClick={() => hapusItem(it.sku)} className="p-1 text-slate-600 hover:text-red-400 flex-shrink-0" title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => ubahQty(it.sku, it.qty - 1)}
                        disabled={it.qty <= 1}
                        className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 disabled:opacity-35"
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={it.qty}
                        onChange={(e) => ubahQty(it.sku, e.target.value)}
                        className="w-12 text-center bg-slate-950 border border-slate-800 rounded-lg py-1 text-sm outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => ubahQty(it.sku, it.qty + 1)}
                        disabled={it.qty >= it.stok}
                        className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 disabled:opacity-35"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="text-right">
                      {h.diskon > 0 && <div className="text-[11px] text-slate-500 line-through">{fmtRp(h.kotor)}</div>}
                      <div className="text-sm font-semibold text-slate-100">{fmtRp(h.subtotal)}</div>
                    </div>
                  </div>

                  {terbuka ? (
                    <div className="mt-2">
                      <InputDiskon
                        kecil
                        tipe={it.diskonTipe}
                        nilai={it.diskonNilai}
                        onTipe={(t) => ubahItem(it.sku, { diskonTipe: t })}
                        onNilai={(v) => ubahItem(it.sku, { diskonNilai: v })}
                      />
                    </div>
                  ) : (
                    <button onClick={() => toggleDiskon(it.sku)} className="mt-2 text-[11px] text-slate-500 hover:text-amber-400">
                      + Diskon item
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Ringkasan & tombol bayar */}
        <div className="border-t border-slate-800 px-4 py-3 space-y-2 bg-slate-900/70 lg:sticky lg:bottom-0 sticky bottom-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Subtotal</span>
            <span>{fmtRp(ringkas.subtotal + totalDiskonItem)}</span>
          </div>
          {totalDiskonItem > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Diskon item</span>
              <span className="text-emerald-400">− {fmtRp(totalDiskonItem)}</span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Diskon transaksi</span>
              {ringkas.diskonTransaksi > 0 && <span className="text-emerald-400">− {fmtRp(ringkas.diskonTransaksi)}</span>}
            </div>
            <InputDiskon
              kecil
              tipe={diskonTrx.tipe}
              nilai={diskonTrx.nilai}
              onTipe={(t) => setDiskonTrx((d) => ({ ...d, tipe: t }))}
              onNilai={(v) => setDiskonTrx((d) => ({ ...d, nilai: v }))}
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold">TOTAL</span>
            <span className="text-xl font-bold text-amber-400">{fmtRp(ringkas.total)}</span>
          </div>
          <button
            onClick={bukaBayar}
            disabled={!items.length || ringkas.total <= 0}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm py-3 rounded-xl"
          >
            Bayar
          </button>
        </div>
      </aside>

      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-50 max-w-[90vw] px-4 py-2.5 rounded-xl text-sm shadow-lg border ${
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
          items={items}
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
