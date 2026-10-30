import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScanLine, Trash2, Upload, RefreshCw, Volume2, VolumeX, AlertTriangle,
  CheckCircle2, Ban, Download, Search, Copy, CloudOff, Package, FileSpreadsheet,
} from "lucide-react";
import {
  PageHeader, EmptyState, StatCard, Badge, Field, InputTanggal, inputClass,
  btnFilled, btnOutlined, btnText, formatTanggalID,
} from "../components/ui";
import { TombolScanKamera } from "../components/ScanKamera";
import { sb, sbAll } from "../lib/api";
import { downloadXlsx } from "../lib/exportData";
import { parseFileOrderan, ringkasBarang } from "../lib/resiOrderan";
import {
  DAFTAR_EKSPEDISI, labelEkspedisi, normalisasiResi, deteksiEkspedisi, bukanResi,
  parseTeksResi, parseFileCancel,
} from "../lib/resiEkspedisi";

// =========================================================
// SCAN RESI — scan resi paket yang akan dikirim, hitung per ekspedisi, dan
// otomatis memisahkan resi yang pesanannya CANCEL.
//
// Tabel (lihat scan_resi.sql): resi_scan (resi yang sudah di-scan, 1 resi = 1 baris)
// dan resi_cancel (daftar resi cancel dari export marketplace / input manual).
// Status cancel TIDAK disimpan di resi_scan, tapi dihitung dari kecocokan resi dengan
// resi_cancel — jadi resi yang baru diketahui cancel SETELAH di-scan ikut terfilter
// (ditandai "terlanjur di-scan", paketnya perlu ditarik).
//
// Sub-menu: "scan" (scan + rekap hari ini), "cancel" (daftar & input cancel),
// "rekap" (rekap rentang tanggal + export Excel).
//
// ORDERAN (tabel resi_barang, lihat scan_resi_barang.sql): file export TikTok Shop "Untuk Dikirim"
// di-import di halaman Scan, lalu tiap resi yang di-scan dicocokkan dengan orderan — barang & qty
// ikut tampil, resi yang tidak ada di orderan diberi peringatan (tetap tercatat), dan rekap
// menampilkan orderan yang BELUM di-scan. Orderan yang resinya ada di daftar cancel tidak dihitung
// sebagai "harus dikirim". Kalau belum ada orderan sama sekali, scan jalan seperti biasa.
// =========================================================

const HARI_RIWAYAT_CANCEL = 90; // daftar cancel yang dimuat ke layar (hari terakhir)
const POLL_CANCEL_MS = 20000;
const POLL_SCAN_MS = 30000;
const BATAS_BARIS = 300;
const PLATFORM = ["Shopee", "TikTok Shop", "Lazada", "Tokopedia", "Lainnya"];
const KOLOM_SCAN = "id,resi,ekspedisi,tanggal,discan_oleh,created_at";
const KOLOM_CANCEL = "id,resi,no_pesanan,platform,alasan,created_at";
const KOLOM_ORDERAN = "resi,order_id,platform,barang,total_qty,tanggal";
const HARI_ORDERAN = 7; // orderan yang dimuat untuk pencocokan: sampai 7 hari sebelum tanggal yang dibuka

// ---- ANTREAN OFFLINE ----
// Tiap scan langsung tercatat di perangkat ini (localStorage) lalu dikirim ke server di
// belakang layar dan diulang otomatis sampai berhasil. Jadi scanning tetap lancar walau
// sinyal putus / lambat, dan tidak ada resi yang hilang kalau halaman ditutup.
const KUNCI_ANTREAN = "selma-scan-resi-antrean";
const INTERVAL_KIRIM_MS = 8000;
function bacaAntrean() {
  try {
    const a = JSON.parse(localStorage.getItem(KUNCI_ANTREAN) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function simpanAntrean(a) {
  try {
    localStorage.setItem(KUNCI_ANTREAN, JSON.stringify(a));
  } catch {
    // penyimpanan penuh / diblokir — antrean tetap jalan di memori
  }
}

const hariIni = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const geserHari = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
// Tanggal (WIB) dari timestamp ISO — dipakai untuk filter daftar cancel per hari.
const tglWIB = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : "");
const jam = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }) : "";

// ---- suara & getar: operator tidak perlu melihat layar tiap scan ----
let audioCtx = null;
function bunyi(tipe) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const pola = {
      ok: [{ f: 880, d: 0.08, t: "sine" }],
      dup: [{ f: 330, d: 0.12, t: "square" }, { f: 330, d: 0.12, t: "square", jeda: 0.08 }],
      cancel: [{ f: 220, d: 0.35, t: "sawtooth" }, { f: 180, d: 0.45, t: "sawtooth", jeda: 0.05 }],
      asing: [{ f: 440, d: 0.18, t: "triangle" }, { f: 300, d: 0.25, t: "triangle", jeda: 0.06 }],
    }[tipe] || [];
    let t0 = audioCtx.currentTime;
    pola.forEach((n) => {
      t0 += n.jeda || 0;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = n.t;
      osc.frequency.value = n.f;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + n.d);
      t0 += n.d;
    });
    if (tipe !== "ok") navigator.vibrate?.(tipe === "cancel" ? [200, 100, 200] : 120);
  } catch {
    // perangkat/browser tanpa audio — abaikan
  }
}

function hitungRekap(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const x = m.get(r.ekspedisi) || { kode: r.ekspedisi, valid: 0, cancel: 0 };
    if (r.cancel) x.cancel += 1;
    else x.valid += 1;
    m.set(r.ekspedisi, x);
  });
  const urut = DAFTAR_EKSPEDISI.map((e) => e.kode);
  return [...m.values()].sort((a, b) => urut.indexOf(a.kode) - urut.indexOf(b.kode));
}

function TabelRekap({ rows, aktif, onPilih }) {
  const rekap = hitungRekap(rows);
  if (!rekap.length) return <EmptyState label="Belum ada resi di-scan." />;
  const tot = rekap.reduce((a, r) => ({ valid: a.valid + r.valid, cancel: a.cancel + r.cancel }), { valid: 0, cancel: 0 });
  return (
    <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-md-on-surface-variant text-left">
            <th className="px-4 py-3 font-medium">Ekspedisi</th>
            <th className="px-4 py-3 font-medium text-right">Valid</th>
            <th className="px-4 py-3 font-medium text-right">Cancel</th>
            <th className="px-4 py-3 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rekap.map((r) => (
            <tr
              key={r.kode}
              onClick={onPilih ? () => onPilih(aktif === r.kode ? null : r.kode) : undefined}
              className={`border-t border-md-outline-variant ${onPilih ? "cursor-pointer hover:bg-md-on-surface/[0.05]" : ""} ${
                aktif === r.kode ? "bg-md-primary/10" : ""
              }`}
            >
              <td className="px-4 py-2.5 text-md-on-surface">{labelEkspedisi(r.kode)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-emerald-300">{r.valid}</td>
              <td className={`px-4 py-2.5 text-right font-medium ${r.cancel ? "text-red-400" : "text-md-on-surface-variant"}`}>{r.cancel}</td>
              <td className="px-4 py-2.5 text-right text-md-on-surface">{r.valid + r.cancel}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-md-outline-variant font-semibold">
            <td className="px-4 py-2.5 text-md-on-surface">Total</td>
            <td className="px-4 py-2.5 text-right text-emerald-300">{tot.valid}</td>
            <td className={`px-4 py-2.5 text-right ${tot.cancel ? "text-red-400" : "text-md-on-surface-variant"}`}>{tot.cancel}</td>
            <td className="px-4 py-2.5 text-right text-md-on-surface">{tot.valid + tot.cancel}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function KartuHasil({ hasil }) {
  if (!hasil) {
    return (
      <div className="rounded-md-lg border-2 border-dashed border-md-outline-variant p-6 text-center text-sm text-md-on-surface-variant">
        Scan resi — hasilnya muncul di sini.
      </div>
    );
  }
  const gaya = {
    ok: { box: "bg-emerald-500/15 border-emerald-400/50 text-emerald-200", Ikon: CheckCircle2, judul: "OK — Valid" },
    cancel: { box: "bg-red-600/25 border-red-500 text-red-100", Ikon: Ban, judul: "CANCEL — JANGAN DIKIRIM" },
    dup: { box: "bg-amber-500/20 border-amber-400/60 text-amber-100", Ikon: AlertTriangle, judul: "SUDAH PERNAH DI-SCAN" },
    asing: { box: "bg-amber-500/20 border-amber-400/60 text-amber-100", Ikon: AlertTriangle, judul: "TIDAK ADA DI ORDERAN" },
    err: { box: "bg-md-error-container border-red-400/60 text-md-on-error-container", Ikon: AlertTriangle, judul: "GAGAL" },
  }[hasil.tipe];
  const { Ikon } = gaya;
  return (
    <div className={`rounded-md-lg border-2 p-5 ${gaya.box}`}>
      <div className="flex items-center gap-3">
        <Ikon size={hasil.tipe === "cancel" ? 36 : 28} />
        <div className="min-w-0">
          <div className={`font-bold ${hasil.tipe === "cancel" ? "text-2xl" : "text-lg"}`}>{hasil.tipe === "ok" && hasil.barang?.length ? "OK — Sesuai orderan" : gaya.judul}</div>
          <div className="font-mono text-sm break-all">{hasil.resi}</div>
        </div>
      </div>
      <div className="mt-2 text-sm">
        {hasil.ekspedisi && <span className="mr-3 font-medium">{labelEkspedisi(hasil.ekspedisi)}</span>}
        {hasil.orderId && <span className="mr-3 text-xs opacity-80">Pesanan {hasil.orderId}</span>}
        {hasil.info}
      </div>
      {hasil.barang?.length > 0 && (
        <div className="mt-3 rounded-md bg-black/20 p-3 space-y-2">
          {hasil.barang.map((b, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base break-words">{[b.sku, b.variasi].filter(Boolean).join(" · ") || b.nama}</div>
                {(b.sku || b.variasi) && <div className="text-xs opacity-80 break-words">{b.nama}</div>}
              </div>
              <div className="text-xl font-bold shrink-0">×{b.qty}</div>
            </div>
          ))}
          {hasil.barang.length > 1 && (
            <div className="text-xs opacity-80 pt-1 border-t border-white/10">
              {hasil.barang.length} jenis barang · total {hasil.barang.reduce((a, b) => a + b.qty, 0)} pcs
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScanResi({ sub = "scan", session, showToast }) {
  const toast = useCallback((m, k) => showToast?.(m, k), [showToast]);
  const operator = session?.nama || session?.username || null;

  // ---------------- data ----------------
  const [hari, setHari] = useState(hariIni());
  const [dari, setDari] = useState(geserHari(hariIni(), -6));
  const [sampai, setSampai] = useState(hariIni());
  const [scans, setScans] = useState([]);
  const [belumKirim, setBelumKirim] = useState(bacaAntrean); // scan yang belum terkirim ke server
  const belumKirimRef = useRef(belumKirim);
  const [infoKirim, setInfoKirim] = useState("");
  const setAntreanSync = useCallback((fn) => {
    const baru = fn(belumKirimRef.current);
    belumKirimRef.current = baru;
    simpanAntrean(baru);
    setBelumKirim(baru);
  }, []);
  const [cancelRows, setCancelRows] = useState([]);
  const [orderanRows, setOrderanRows] = useState([]);
  const [orderanGalat, setOrderanGalat] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const lastCancel = useRef(null);

  const rentang = sub === "rekap" ? [dari, sampai] : [hari, hari];

  const muatScan = useCallback(async (d1, d2) => {
    const rows = await sbAll(
      `resi_scan?select=${KOLOM_SCAN}&tanggal=gte.${d1}&tanggal=lte.${d2}&order=created_at.desc,id.desc`
    );
    setScans(rows || []);
  }, []);

  const muatCancel = useCallback(async () => {
    const batas = new Date(Date.now() - HARI_RIWAYAT_CANCEL * 864e5).toISOString();
    const rows = await sbAll(
      `resi_cancel?select=${KOLOM_CANCEL}&created_at=gte.${encodeURIComponent(batas)}&order=created_at.desc,id.desc`
    );
    setCancelRows(rows || []);
    lastCancel.current = rows?.[0]?.created_at || batas;
  }, []);

  // Orderan (resi -> barang) hanya dimuat SEKALI per buka halaman / ganti tanggal / "Muat ulang"
  // (tidak di-poll) supaya hemat egress; pencocokan saat scan dikerjakan di perangkat.
  const muatOrderan = useCallback(async () => {
    try {
      const rows = await sbAll(
        `resi_barang?select=${KOLOM_ORDERAN}&tanggal=gte.${geserHari(hari, -HARI_ORDERAN)}&tanggal=lte.${hari}&order=tanggal.desc,id.asc`
      );
      setOrderanRows(rows || []);
      setOrderanGalat("");
    } catch (e) {
      setOrderanGalat(e.message || "Gagal memuat orderan.");
    }
  }, [hari]);

  const muatSemua = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      await Promise.all([muatScan(rentang[0], rentang[1]), muatCancel()]);
    } catch (e) {
      setGalat(e.message || "Gagal memuat data scan resi.");
    } finally {
      setMemuat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muatScan, muatCancel, rentang[0], rentang[1]]);

  useEffect(() => {
    muatSemua();
  }, [muatSemua]);

  useEffect(() => {
    if (sub === "scan") muatOrderan();
  }, [sub, muatOrderan]);

  // Ambil resi cancel yang BARU masuk dari perangkat lain (incremental), dan segarkan scan
  // dari perangkat lain — tanpa menarik ulang seluruh daftar.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || !lastCancel.current) return;
      try {
        const baru = await sb(
          `resi_cancel?select=${KOLOM_CANCEL}&created_at=gt.${encodeURIComponent(lastCancel.current)}&order=created_at.asc&limit=1000`
        );
        if (baru?.length) {
          lastCancel.current = baru[baru.length - 1].created_at;
          setCancelRows((lama) => {
            const ada = new Set(lama.map((r) => r.id));
            return [...baru.filter((r) => !ada.has(r.id)).reverse(), ...lama];
          });
        }
      } catch {
        // gagal sesaat (sinyal) — coba lagi di putaran berikutnya
      }
    }, POLL_CANCEL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (sub !== "scan") return undefined;
    const t = setInterval(() => {
      if (!document.hidden) muatScan(hari, hari).catch(() => {});
    }, POLL_SCAN_MS);
    return () => clearInterval(t);
  }, [sub, hari, muatScan]);

  const cancelMap = useMemo(() => new Map(cancelRows.map((r) => [r.resi, r])), [cancelRows]);
  const orderanMap = useMemo(() => new Map(orderanRows.map((o) => [o.resi, o])), [orderanRows]);
  const adaOrderan = orderanRows.length > 0;
  // Scan dari server + scan yang masih menunggu terkirim (ditandai tertunda).
  const gabungScan = useMemo(() => {
    const sudah = new Set(scans.map((x) => x.resi));
    const tertunda = belumKirim
      .filter((a) => !sudah.has(a.resi) && a.tanggal >= rentang[0] && a.tanggal <= rentang[1])
      .map((a) => ({ ...a, id: `t-${a.resi}`, tertunda: true }))
      .reverse();
    return [...tertunda, ...scans];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scans, belumKirim, rentang[0], rentang[1]]);
  const rows = useMemo(
    () =>
      gabungScan.map((s) => {
        const c = cancelMap.get(s.resi);
        const o = orderanMap.get(s.resi) || null;
        // Resi yang dulu tersimpan "Lainnya" dihitung ulang dengan pola terbaru, jadi kalau pola
        // ekspedisi diperbaiki, scan lama ikut benar tanpa perlu update database.
        const ekspedisi = s.ekspedisi === "LAINNYA" ? deteksiEkspedisi(s.resi) : s.ekspedisi;
        return {
          ...s, ekspedisi, cancel: !!c, infoCancel: c || null, terlanjur: !!c && new Date(s.created_at) < new Date(c.created_at),
          orderan: o, asing: adaOrderan && !c && !o,
        };
      }),
    [gabungScan, cancelMap, orderanMap, adaOrderan]
  );
  const terlanjur = useMemo(() => rows.filter((r) => r.terlanjur), [rows]);

  // ---------------- scan ----------------
  const [input, setInput] = useState("");
  const [hasil, setHasil] = useState(null);
  const [suara, setSuara] = useState(() => {
    try {
      return localStorage.getItem("selma-scan-resi-suara") !== "off";
    } catch {
      return true;
    }
  });
  const inputRef = useRef(null);
  const antrean = useRef(Promise.resolve());
  const ref = useRef({});
  ref.current = { scans, cancelMap, suara, hari, operator, orderanMap, adaOrderan };

  const sedangKirim = useRef(false);
  const kirimAntrean = useCallback(async () => {
    if (sedangKirim.current) return;
    sedangKirim.current = true;
    try {
      while (belumKirimRef.current.length) {
        // Kirim BANYAK resi sekaligus (1 request) supaya antrean cepat habis walau sinyal lambat.
        // Kalau ada yang ditolak (mis. duplikat), jatuh ke pengiriman satu-satu di bawah.
        if (belumKirimRef.current.length > 1) {
          const paket = belumKirimRef.current.slice(0, 50);
          try {
            const hasilBatch = await sb("resi_scan", {
              method: "POST",
              body: JSON.stringify(paket.map((it) => ({
                resi: it.resi, ekspedisi: it.ekspedisi, tanggal: it.tanggal,
                created_at: it.created_at, discan_oleh: it.discan_oleh,
              }))),
            });
            const resiTerkirim = new Set(paket.map((x) => x.resi));
            const barisBaru = (Array.isArray(hasilBatch) ? hasilBatch : []).filter((b) => b.tanggal === ref.current.hari);
            if (barisBaru.length) {
              const idBaru = new Set(barisBaru.map((b) => b.id));
              setScans((l) => [...barisBaru.reverse(), ...l.filter((x) => !idBaru.has(x.id))]);
            }
            setAntreanSync((a) => a.filter((x) => !resiTerkirim.has(x.resi)));
            continue;
          } catch (e) {
            if (!e.pgCode) {
              setInfoKirim(e.message || "jaringan bermasalah");
              return;
            }
            // ditolak database -> lanjut kirim satu-satu supaya yang bermasalah bisa dipilah
          }
        }
        const it = belumKirimRef.current[0];
        const buang = () => setAntreanSync((a) => a.filter((x) => x.resi !== it.resi));
        try {
          const hasilPost = await sb("resi_scan", {
            method: "POST",
            body: JSON.stringify({
              resi: it.resi, ekspedisi: it.ekspedisi, tanggal: it.tanggal,
              created_at: it.created_at, discan_oleh: it.discan_oleh,
            }),
          });
          const baris = Array.isArray(hasilPost) ? hasilPost[0] : hasilPost;
          if (baris && baris.tanggal === ref.current.hari) setScans((l) => [baris, ...l.filter((x) => x.id !== baris.id)]);
          buang();
        } catch (e) {
          if (e.pgCode === "23505") {
            // Sudah ada di server: scan sebelumnya yang timeout (sebenarnya tersimpan), atau
            // sudah di-scan dari perangkat lain. Keduanya tidak perlu dikirim lagi.
            buang();
            toast(`Resi ${it.resi} ternyata sudah pernah di-scan (mungkin dari perangkat lain).`, "err");
            if (ref.current.suara) bunyi("dup");
            continue;
          }
          if (e.pgCode) {
            buang();
            toast(`Resi ${it.resi} ditolak server: ${e.message}`, "err");
            continue;
          }
          // Tanpa kode database = masalah jaringan / timeout: simpan di antrean, coba lagi nanti.
          setInfoKirim(e.message || "jaringan bermasalah");
          return;
        }
      }
      setInfoKirim("");
    } finally {
      sedangKirim.current = false;
    }
  }, [setAntreanSync, toast]);

  useEffect(() => {
    kirimAntrean();
    const t = setInterval(() => {
      if (belumKirimRef.current.length) kirimAntrean();
    }, INTERVAL_KIRIM_MS);
    const saatOnline = () => kirimAntrean();
    const saatTutup = (e) => {
      if (belumKirimRef.current.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", saatOnline);
    document.addEventListener("visibilitychange", saatOnline);
    window.addEventListener("beforeunload", saatTutup);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", saatOnline);
      document.removeEventListener("visibilitychange", saatOnline);
      window.removeEventListener("beforeunload", saatTutup);
    };
  }, [kirimAntrean]);

  const kerjakanScan = useCallback(async (raw) => {
    const { scans: daftar, cancelMap: cmap, suara: bunyiAktif, hari: hariAktif, operator: op, orderanMap: omap, adaOrderan: adaO } = ref.current;
    const bip = (t) => bunyiAktif && bunyi(t);
    const resi = normalisasiResi(raw);
    if (!resi) {
      setHasil({ tipe: "err", resi: String(raw).trim().slice(0, 60), info: "Bukan format resi yang valid (6–40 karakter huruf/angka)." });
      bip("dup");
      return;
    }
    if (bukanResi(resi)) {
      setHasil({ tipe: "err", resi, info: "Ini bukan nomor resi (hanya angka pendek) — kemungkinan QR/barcode lain di paket. TIDAK disimpan. Arahkan ke barcode resi (garis)." });
      bip("dup");
      return;
    }
    const ada = daftar.find((s) => s.resi === resi);
    if (ada) {
      setHasil({ tipe: "dup", resi, ekspedisi: ada.ekspedisi, info: `Sudah di-scan ${formatTanggalID(ada.tanggal)} pukul ${jam(ada.created_at)}.` });
      bip("dup");
      return;
    }
    const tunda = belumKirimRef.current.find((x) => x.resi === resi);
    if (tunda) {
      setHasil({ tipe: "dup", resi, ekspedisi: tunda.ekspedisi, info: `Sudah di-scan pukul ${jam(tunda.created_at)} (menunggu terkirim ke server).` });
      bip("dup");
      return;
    }
    const ekspedisi = deteksiEkspedisi(resi);
    // Catat dulu di perangkat ini, kirim ke server di belakang layar (lihat ANTREAN OFFLINE).
    setAntreanSync((a) => [...a, { resi, ekspedisi, tanggal: hariAktif, discan_oleh: op, created_at: new Date().toISOString() }]);
    kirimAntrean();
    const c = cmap.get(resi);
    const o = omap.get(resi);
    if (c) {
      setHasil({
        tipe: "cancel", resi, ekspedisi, barang: o?.barang,
        info: [c.platform, c.no_pesanan && `Pesanan ${c.no_pesanan}`, c.alasan].filter(Boolean).join(" · ") || "Pesanan sudah dibatalkan.",
      });
      bip("cancel");
    } else if (adaO && !o) {
      // Orderan sudah di-import tapi resi ini tidak ada di dalamnya: tetap dicatat, hanya diperingatkan.
      setHasil({
        tipe: "asing", resi, ekspedisi,
        info: "Resi ini tidak ada di daftar orderan — cek paketnya (salah paket?) atau file orderan terbaru belum di-import. Tetap tercatat.",
      });
      bip("asing");
    } else {
      setHasil({
        tipe: "ok", resi, ekspedisi, barang: o?.barang, orderId: o?.order_id,
        info: ekspedisi === "LAINNYA" ? "Ekspedisi belum dikenali — bisa dikoreksi manual di daftar bawah." : "",
      });
      bip("ok");
    }
  }, [kirimAntrean, setAntreanSync]);

  // Antrean berurutan: scanner cepat tidak membuat dua scan saling menimpa.
  const prosesScan = useCallback(
    (raw) => {
      antrean.current = antrean.current.then(() => kerjakanScan(raw)).catch(() => {});
    },
    [kerjakanScan]
  );

  const kirimInput = () => {
    const v = input;
    setInput("");
    if (v.trim()) prosesScan(v);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (sub === "scan") inputRef.current?.focus();
  }, [sub, memuat]);

  const gantiSuara = () => {
    const baru = !suara;
    setSuara(baru);
    try {
      localStorage.setItem("selma-scan-resi-suara", baru ? "on" : "off");
    } catch {
      // abaikan
    }
  };

  // ---------------- pencocokan dengan orderan (hanya halaman Scan) ----------------
  // Orderan "tanggal yang dibuka" dibandingkan dengan resi yang sudah di-scan (termasuk yang masih
  // antre kirim). Orderan yang resinya cancel dikeluarkan dari hitungan "harus dikirim".
  const cocok = useMemo(() => {
    if (sub !== "scan" || !adaOrderan) return null;
    const batch = orderanRows.filter((o) => o.tanggal === hari);
    const sudahSet = new Set(rows.map((r) => r.resi));
    const aktif = batch.filter((o) => !cancelMap.has(o.resi));
    const belum = aktif
      .filter((o) => !sudahSet.has(o.resi))
      .map((o) => ({ ...o, ekspedisi: deteksiEkspedisi(o.resi) }))
      .sort((a, b) => a.ekspedisi.localeCompare(b.ekspedisi) || a.resi.localeCompare(b.resi));
    return {
      batch, sudahSet,
      total: batch.length,
      cancel: batch.length - aktif.length,
      aktif: aktif.length,
      sudah: aktif.length - belum.length,
      belum,
      asing: rows.filter((r) => r.asing),
    };
  }, [sub, adaOrderan, orderanRows, hari, rows, cancelMap]);
  const [bukaBelum, setBukaBelum] = useState(false);

  // ---------------- daftar scan: filter & aksi ----------------
  const [filter, setFilter] = useState("semua");
  const [ekspFilter, setEkspFilter] = useState(null);
  const [cariResi, setCariResi] = useState("");
  const tampil = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "semua" || (filter === "cancel" ? r.cancel : !r.cancel)) &&
          (!ekspFilter || r.ekspedisi === ekspFilter) &&
          (!cariResi || r.resi.includes(cariResi.trim().toUpperCase()))
      ),
    [rows, filter, ekspFilter, cariResi]
  );
  const totalValid = rows.filter((r) => !r.cancel).length;
  const totalCancel = rows.length - totalValid;

  // ---- hapus massal: HANYA role superappa ----
  const bisaHapusMassal = session?.role === "superappa";
  const [pilih, setPilih] = useState(() => new Set());
  const [sedangHapus, setSedangHapus] = useState(false);
  const terpilih = useMemo(() => tampil.filter((r) => pilih.has(r.id)), [tampil, pilih]);
  const semuaTerpilih = tampil.length > 0 && terpilih.length === tampil.length;
  const togglePilih = (id) =>
    setPilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  const pilihSemua = () => setPilih(semuaTerpilih ? new Set() : new Set(tampil.map((r) => r.id)));

  const hapusTerpilih = async () => {
    if (!bisaHapusMassal || !terpilih.length || sedangHapus) return;
    if (!window.confirm(`Hapus ${terpilih.length} hasil scan yang dipilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    setSedangHapus(true);
    try {
      const tunda = terpilih.filter((r) => r.tertunda);
      const server = terpilih.filter((r) => !r.tertunda);
      if (tunda.length) {
        const resiTunda = new Set(tunda.map((r) => r.resi));
        setAntreanSync((a) => a.filter((x) => !resiTunda.has(x.resi)));
      }
      const terhapus = new Set();
      try {
        for (let i = 0; i < server.length; i += 100) {
          const potong = server.slice(i, i + 100);
          await sb(`resi_scan?id=in.(${potong.map((r) => r.id).join(",")})`, { method: "DELETE", prefer: "return=minimal" });
          potong.forEach((r) => terhapus.add(r.id));
        }
      } finally {
        // Yang sudah terhapus tetap dibuang dari layar walau putaran berikutnya gagal.
        if (terhapus.size) setScans((l) => l.filter((x) => !terhapus.has(x.id)));
        setPilih((lama) => {
          const baru = new Set(lama);
          terhapus.forEach((id) => baru.delete(id));
          tunda.forEach((r) => baru.delete(r.id));
          return baru;
        });
      }
      toast(`${tunda.length + server.length} hasil scan dihapus.`);
    } catch (e) {
      toast(`Sebagian gagal dihapus: ${e.message}`, "err");
    } finally {
      setSedangHapus(false);
    }
  };

  const hapusScan = async (r) => {
    if (!window.confirm(`Hapus scan resi ${r.resi}?`)) return;
    if (r.tertunda) {
      setAntreanSync((a) => a.filter((x) => x.resi !== r.resi));
      return;
    }
    try {
      await sb(`resi_scan?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });
      setScans((l) => l.filter((x) => x.id !== r.id));
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const koreksiEkspedisi = async (r, ekspedisi) => {
    if (r.tertunda) {
      setAntreanSync((a) => a.map((x) => (x.resi === r.resi ? { ...x, ekspedisi } : x)));
      return;
    }
    try {
      await sb(`resi_scan?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ ekspedisi }), prefer: "return=minimal" });
      setScans((l) => l.map((x) => (x.id === r.id ? { ...x, ekspedisi } : x)));
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const exportExcel = () => {
    const nama = sub === "rekap" ? `${dari}_sd_${sampai}` : hari;
    const lembar = [
      {
        name: "Rekap",
        columns: [
          { key: "ekspedisi", label: "Ekspedisi" }, { key: "valid", label: "Valid" },
          { key: "cancel", label: "Cancel" }, { key: "total", label: "Total" },
        ],
        rows: hitungRekap(rows).map((r) => ({ ekspedisi: labelEkspedisi(r.kode), valid: r.valid, cancel: r.cancel, total: r.valid + r.cancel })),
      },
      {
        name: "Detail",
        columns: [
          { key: "tanggal", label: "Tanggal" }, { key: "jam", label: "Jam" }, { key: "resi", label: "Resi" },
          { key: "ekspedisi", label: "Ekspedisi" }, { key: "status", label: "Status" },
          { key: "oleh", label: "Discan oleh" }, { key: "pesanan", label: "No. Pesanan (cancel)" },
          { key: "barang", label: "Barang (orderan)" },
        ],
        rows: [...rows].reverse().map((r) => ({
          tanggal: r.tanggal, jam: jam(r.created_at), resi: r.resi, ekspedisi: labelEkspedisi(r.ekspedisi),
          status: r.cancel ? (r.terlanjur ? "CANCEL (terlanjur di-scan)" : "CANCEL") : r.asing ? "Tidak ada di orderan" : "Valid",
          oleh: r.discan_oleh || "", pesanan: r.infoCancel?.no_pesanan || "",
          barang: r.orderan ? ringkasBarang(r.orderan.barang) : "",
        })),
      },
    ];
    if (cocok && cocok.total) {
      lembar.push({
        name: "Orderan",
        columns: [
          { key: "resi", label: "Resi" }, { key: "ekspedisi", label: "Ekspedisi" }, { key: "pesanan", label: "No. Pesanan" },
          { key: "barang", label: "Barang" }, { key: "qty", label: "Qty" }, { key: "status", label: "Status" },
        ],
        rows: cocok.batch.map((o) => ({
          resi: o.resi, ekspedisi: labelEkspedisi(deteksiEkspedisi(o.resi)), pesanan: o.order_id || "",
          barang: ringkasBarang(o.barang), qty: o.total_qty,
          status: cancelMap.has(o.resi) ? "CANCEL" : cocok.sudahSet.has(o.resi) ? "Sudah di-scan" : "Belum di-scan",
        })),
      });
    }
    downloadXlsx(`scan-resi-${nama}.xlsx`, lembar).catch((e) => toast(e.message, "err"));
  };

  // ---------------- orderan: import ----------------
  const [draftOrderan, setDraftOrderan] = useState(null);
  const [menyimpanOrderan, setMenyimpanOrderan] = useState(false);
  const [laporanOrderan, setLaporanOrderan] = useState("");
  const fileOrderanRef = useRef(null);

  const pilihFileOrderan = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLaporanOrderan("");
    try {
      const hasilBaca = await parseFileOrderan(f);
      setDraftOrderan({ ...hasilBaca, nama: f.name });
    } catch (err) {
      setDraftOrderan(null);
      toast(err.message, "err");
    }
  };

  const simpanOrderan = async () => {
    if (!draftOrderan?.baris.length || menyimpanOrderan) return;
    setMenyimpanOrderan(true);
    try {
      let n = 0;
      for (let i = 0; i < draftOrderan.baris.length; i += 300) {
        const potong = draftOrderan.baris.slice(i, i + 300).map((b) => ({
          resi: b.resi, order_id: b.order_id, platform: b.platform,
          barang: b.barang, total_qty: b.total_qty, tanggal: hari,
        }));
        // Resi yang sudah ada diperbarui (tidak digandakan). select=id supaya respons kecil.
        const res = await sb("resi_barang?on_conflict=entitas,resi&select=id", {
          method: "POST",
          body: JSON.stringify(potong),
          prefer: "resolution=merge-duplicates,return=representation",
        });
        n += (res || []).length;
      }
      await muatOrderan();
      setLaporanOrderan(
        `${n} resi orderan disimpan untuk ${formatTanggalID(hari)} (yang sudah ada diperbarui).` +
          (draftOrderan.tanpaResi ? ` ${draftOrderan.tanpaResi} pesanan belum punya resi — import ulang nanti setelah resinya terbit.` : "")
      );
      setDraftOrderan(null);
      toast(`${n} resi orderan disimpan.`);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setMenyimpanOrderan(false);
    }
  };

  // ---------------- cancel: input ----------------
  const [teks, setTeks] = useState("");
  const [dariFile, setDariFile] = useState([]);
  const [infoFile, setInfoFile] = useState("");
  const [platform, setPlatform] = useState(PLATFORM[0]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [laporan, setLaporan] = useState(null);
  const [cariCancel, setCariCancel] = useState("");
  const fileRef = useRef(null);

  const draft = useMemo(() => {
    const { baris, ditolak } = parseTeksResi(teks);
    const m = new Map();
    [...dariFile, ...baris].forEach((b) => !m.has(b.resi) && m.set(b.resi, b));
    const semua = [...m.values()];
    return { semua, baru: semua.filter((b) => !cancelMap.has(b.resi)), ditolak };
  }, [teks, dariFile, cancelMap]);

  const pilihFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { baris, diabaikanBukanBatal } = await parseFileCancel(f);
      setDariFile(baris);
      setInfoFile(`${f.name}: ${baris.length} resi cancel terbaca${diabaikanBukanBatal ? `, ${diabaikanBukanBatal} baris non-batal diabaikan` : ""}.`);
    } catch (err) {
      setDariFile([]);
      setInfoFile("");
      toast(err.message, "err");
    }
  };

  const simpanCancel = async () => {
    if (!draft.baru.length) return;
    setMenyimpan(true);
    try {
      const simpanan = [];
      for (let i = 0; i < draft.baru.length; i += 500) {
        const potong = draft.baru.slice(i, i + 500).map((b) => ({ resi: b.resi, no_pesanan: b.no_pesanan, alasan: b.alasan, platform }));
        const res = await sb("resi_cancel?on_conflict=entitas,resi", {
          method: "POST",
          body: JSON.stringify(potong),
          prefer: "resolution=ignore-duplicates,return=representation",
        });
        simpanan.push(...(res || []));
      }
      // Resi yang ternyata SUDAH di-scan sebelum cancel diketahui -> paketnya perlu ditarik.
      const sudahDiscan = [];
      for (let i = 0; i < simpanan.length; i += 80) {
        const daftar = simpanan.slice(i, i + 80).map((r) => encodeURIComponent(r.resi)).join(",");
        const hit = await sb(`resi_scan?select=resi,ekspedisi,tanggal&resi=in.(${daftar})`);
        sudahDiscan.push(...(hit || []));
      }
      setCancelRows((l) => {
        const ada = new Set(l.map((r) => r.id));
        return [...simpanan.filter((r) => !ada.has(r.id)), ...l];
      });
      if (simpanan.length) {
        lastCancel.current = simpanan.reduce((a, r) => (r.created_at > a ? r.created_at : a), lastCancel.current || "");
      }
      setLaporan({ disimpan: simpanan.length, sudahAda: draft.semua.length - draft.baru.length, sudahDiscan });
      setTeks("");
      setDariFile([]);
      setInfoFile("");
      toast(`${simpanan.length} resi cancel disimpan.`);
      muatScan(rentang[0], rentang[1]).catch(() => {});
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setMenyimpan(false);
    }
  };

  const hapusCancel = async (r) => {
    if (!window.confirm(`Hapus ${r.resi} dari daftar cancel?`)) return;
    try {
      await sb(`resi_cancel?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });
      setCancelRows((l) => l.filter((x) => x.id !== r.id));
    } catch (e) {
      toast(e.message, "err");
    }
  };

  // Filter tanggal daftar cancel: default hari ini, bisa pilih hari lain atau semua tanggal.
  const [tglCancel, setTglCancel] = useState(hariIni());
  const [semuaTglCancel, setSemuaTglCancel] = useState(false);
  const cancelPerTanggal = useMemo(
    () => (semuaTglCancel ? cancelRows : cancelRows.filter((r) => tglWIB(r.created_at) === tglCancel)),
    [cancelRows, tglCancel, semuaTglCancel]
  );
  const cancelTampil = useMemo(() => {
    const q = cariCancel.trim().toUpperCase();
    return q ? cancelPerTanggal.filter((r) => r.resi.includes(q) || (r.no_pesanan || "").toUpperCase().includes(q)) : cancelPerTanggal;
  }, [cancelPerTanggal, cariCancel]);

  // ---------------- render ----------------
  const tombolMuat = (
    <button type="button" onClick={() => { muatSemua(); if (sub === "scan") muatOrderan(); }} className={btnOutlined} disabled={memuat}>
      <RefreshCw size={14} className={memuat ? "animate-spin" : ""} /> Muat ulang
    </button>
  );

  const judul = { scan: "Scan Resi", cancel: "Daftar Resi Cancel", rekap: "Rekap Scan Resi" }[sub] || "Scan Resi";
  const deskripsi = {
    scan: "Scan resi paket yang mau dikirim. Resi dihitung per ekspedisi, dicocokkan dengan orderan (barang ikut tampil), dan resi yang pesanannya cancel langsung ditandai merah.",
    cancel: "Masukkan resi pesanan yang dibatalkan (tempel / upload export marketplace). Resi ini otomatis terfilter saat di-scan.",
    rekap: "Rekap jumlah resi per ekspedisi untuk rentang tanggal, bisa diekspor ke Excel.",
  }[sub];

  return (
    <div>
      <PageHeader title={judul} description={deskripsi} action={tombolMuat} />
      {galat && <div className="mb-4 rounded-md-lg bg-md-error-container text-md-on-error-container text-sm p-3">{galat}</div>}

      {sub === "scan" && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), kirimInput())}
                  placeholder="Scan / ketik nomor resi lalu Enter"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={`${inputClass} font-mono text-base`}
                />
                <TombolScanKamera continuous format="resi" label="Kamera" judul="Scan Resi" onDetect={prosesScan} />
                <button type="button" onClick={gantiSuara} className="px-3 rounded-lg border border-md-outline-variant text-md-on-surface-variant" aria-label="Suara">
                  {suara ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </div>
              {belumKirim.length > 0 && (
                <div className="rounded-lg bg-amber-500/15 text-amber-200 text-sm p-3 flex items-center gap-2">
                  <CloudOff size={16} className="shrink-0" />
                  <span className="flex-1">
                    {belumKirim.length} resi tersimpan di perangkat ini, belum terkirim ke server
                    {infoKirim ? ` (${infoKirim})` : ""}. Dikirim otomatis begitu jaringan pulih; tetap aman kalau halaman ditutup.
                  </span>
                  <button type="button" onClick={kirimAntrean} className={btnText}>Kirim sekarang</button>
                </div>
              )}
              <KartuHasil hasil={hasil} />
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
              <StatCard label="Total di-scan" value={rows.length} icon={ScanLine} onClick={() => setFilter("semua")} />
              <StatCard label="Valid (kirim)" value={totalValid} accent="text-emerald-300" icon={CheckCircle2} iconColor="text-emerald-300" onClick={() => setFilter("valid")} />
              <StatCard label="Cancel" value={totalCancel} accent={totalCancel ? "text-red-400" : undefined} icon={Ban} iconColor="text-red-400" onClick={() => setFilter("cancel")} />
            </div>
          </div>

          {terlanjur.length > 0 && (
            <div className="rounded-md-lg border border-red-500/60 bg-red-600/15 p-4">
              <div className="flex items-center gap-2 font-semibold text-red-200">
                <AlertTriangle size={16} /> {terlanjur.length} resi sudah di-scan sebelum ketahuan cancel — tarik paketnya
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {terlanjur.map((r) => (
                  <span key={r.id} className="font-mono text-xs bg-red-500/20 text-red-100 rounded-full px-2.5 py-1">
                    {r.resi} · {labelEkspedisi(r.ekspedisi)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-52">
              <Field label="Tanggal">
                <InputTanggal value={hari} onChange={(v) => v && setHari(v)} />
              </Field>
            </div>
            <button type="button" onClick={exportExcel} disabled={!rows.length} className={`${btnOutlined} mb-3`}>
              <Download size={14} /> Export Excel
            </button>
          </div>

          <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-md-on-surface">
                <Package size={16} /> Orderan untuk dikirim · {formatTanggalID(hari)}
              </div>
              <input ref={fileOrderanRef} type="file" accept=".xlsx,.xls,.csv" onChange={pilihFileOrderan} className="hidden" />
              <button type="button" onClick={() => fileOrderanRef.current?.click()} className={`${btnOutlined} ml-auto`}>
                <FileSpreadsheet size={14} /> Import orderan (TikTok Shop .xlsx)
              </button>
            </div>

            {orderanGalat && (
              <div className="rounded-lg bg-md-error-container text-md-on-error-container text-sm p-3">
                Orderan belum bisa dimuat: {orderanGalat}. Pastikan scan_resi_barang.sql sudah dijalankan. Scan tetap jalan seperti biasa, hanya tanpa pencocokan orderan.
              </div>
            )}

            {draftOrderan && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-md-container-high p-3 text-sm text-md-on-surface">
                <span>
                  {draftOrderan.nama}: {draftOrderan.baris.length} resi · {draftOrderan.totalPcs} pcs terbaca
                  {draftOrderan.tanpaResi ? ` · ${draftOrderan.tanpaResi} pesanan belum punya resi (dilewati)` : ""}
                  {draftOrderan.diabaikanBatal ? ` · ${draftOrderan.diabaikanBatal} baris batal diabaikan` : ""}
                  {` · akan disimpan untuk ${formatTanggalID(hari)}`}.
                </span>
                <button type="button" onClick={simpanOrderan} disabled={!draftOrderan.baris.length || menyimpanOrderan} className={`${btnFilled} ml-auto`}>
                  {menyimpanOrderan ? "Menyimpan…" : `Simpan ${draftOrderan.baris.length} orderan`}
                </button>
                <button type="button" onClick={() => setDraftOrderan(null)} className={btnText}>Batal</button>
              </div>
            )}

            {laporanOrderan && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-md-on-surface">{laporanOrderan}</div>
            )}

            {cocok && cocok.total > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Harus dikirim (orderan)" value={cocok.aktif} icon={Package} />
                  <StatCard label="Sudah di-scan" value={cocok.sudah} accent="text-emerald-300" icon={CheckCircle2} iconColor="text-emerald-300" />
                  <StatCard
                    label="Belum di-scan" value={cocok.belum.length}
                    accent={cocok.belum.length ? "text-amber-300" : undefined} icon={ScanLine}
                    iconColor={cocok.belum.length ? "text-amber-300" : undefined}
                    onClick={() => setBukaBelum((v) => !v)}
                  />
                  <StatCard
                    label="Scan tidak ada di orderan" value={cocok.asing.length}
                    accent={cocok.asing.length ? "text-amber-300" : undefined} icon={AlertTriangle}
                    iconColor={cocok.asing.length ? "text-amber-300" : undefined}
                  />
                </div>
                {cocok.cancel > 0 && (
                  <div className="text-xs text-md-on-surface-variant">
                    {cocok.cancel} orderan sudah masuk daftar cancel — tidak dihitung sebagai "harus dikirim".
                  </div>
                )}
                {cocok.belum.length === 0 && cocok.asing.length === 0 ? (
                  <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-200">
                    Cocok — semua {cocok.aktif} orderan sudah di-scan, tidak ada scan di luar orderan.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Belum cocok: {cocok.belum.length} orderan belum di-scan, {cocok.asing.length} resi ter-scan tidak ada di orderan.
                  </div>
                )}
                {cocok.asing.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {cocok.asing.map((r) => (
                      <span key={r.id} className="font-mono text-xs bg-amber-500/20 text-amber-100 rounded-full px-2.5 py-1">
                        {r.resi} · {labelEkspedisi(r.ekspedisi)}
                      </span>
                    ))}
                  </div>
                )}
                {cocok.belum.length > 0 && (
                  <button type="button" onClick={() => setBukaBelum((v) => !v)} className={btnText}>
                    {bukaBelum ? "Sembunyikan" : "Lihat"} daftar belum di-scan ({cocok.belum.length})
                  </button>
                )}
                {bukaBelum && cocok.belum.length > 0 && (
                  <div className="rounded-md-lg border border-md-outline-variant overflow-x-auto">
                    <div className="flex items-center justify-between px-4 py-2 text-xs text-md-on-surface-variant">
                      <span>{cocok.belum.length} resi belum di-scan</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(cocok.belum.map((o) => o.resi).join("\n"))}
                        className={btnText}
                      >
                        <Copy size={13} /> Salin daftar resi
                      </button>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {cocok.belum.slice(0, BATAS_BARIS).map((o) => (
                          <tr key={o.resi} className="border-t border-md-outline-variant">
                            <td className="px-4 py-2 font-mono text-md-on-surface">{o.resi}</td>
                            <td className="px-2 py-2 text-xs text-md-on-surface-variant whitespace-nowrap">{labelEkspedisi(o.ekspedisi)}</td>
                            <td className="px-2 py-2 text-xs text-md-on-surface-variant">{ringkasBarang(o.barang)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cocok.belum.length > BATAS_BARIS && (
                      <div className="px-4 py-2 text-xs text-md-on-surface-variant border-t border-md-outline-variant">
                        Menampilkan {BATAS_BARIS} dari {cocok.belum.length} — Export Excel (sheet "Orderan") untuk semuanya.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-md-on-surface-variant">
                {adaOrderan
                  ? "Belum ada orderan untuk tanggal ini — import file orderan untuk tanggal yang dipilih."
                  : 'Belum ada orderan. Import file "Untuk Dikirim" dari TikTok Shop supaya hasil scan dicocokkan dengan orderan (barang ikut tampil).'}
              </div>
            )}
          </div>

          <TabelRekap rows={rows} aktif={ekspFilter} onPilih={setEkspFilter} />
          {ekspFilter && (
            <div className="text-xs text-md-on-surface-variant">
              Daftar di bawah difilter: {labelEkspedisi(ekspFilter)} —{" "}
              <button type="button" onClick={() => setEkspFilter(null)} className="text-md-primary underline">tampilkan semua</button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {["semua", "valid", "cancel"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full border ${filter === f ? "bg-md-primary-container text-md-on-primary-container border-transparent" : "border-md-outline-variant text-md-on-surface-variant"}`}
              >
                {f === "semua" ? "Semua" : f === "valid" ? "Valid" : "Cancel"}
              </button>
            ))}
            <div className="relative ml-auto w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
              <input value={cariResi} onChange={(e) => setCariResi(e.target.value)} placeholder="Cari resi" className={`${inputClass} pl-9`} />
            </div>
          </div>

          {bisaHapusMassal && tampil.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md-lg border border-md-outline-variant px-3 py-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={semuaTerpilih} onChange={pilihSemua} />
                Pilih semua ({tampil.length})
              </label>
              {terpilih.length > 0 && (
                <>
                  <span className="text-md-on-surface-variant">{terpilih.length} dipilih</span>
                  <button type="button" onClick={() => setPilih(new Set())} className={btnText}>Batal pilih</button>
                  <button
                    type="button"
                    onClick={hapusTerpilih}
                    disabled={sedangHapus}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  >
                    <Trash2 size={14} /> {sedangHapus ? "Menghapus…" : `Hapus ${terpilih.length} terpilih`}
                  </button>
                </>
              )}
            </div>
          )}

          {memuat ? (
            <div className="text-sm text-md-on-surface-variant py-8 text-center">Memuat…</div>
          ) : tampil.length === 0 ? (
            <EmptyState label="Tidak ada resi untuk filter ini." />
          ) : (
            <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {tampil.slice(0, BATAS_BARIS).map((r) => (
                    <tr key={r.id} className={`border-b border-md-outline-variant last:border-0 ${r.cancel ? "bg-red-600/10" : ""} ${pilih.has(r.id) ? "bg-md-primary/10" : ""}`}>
                      {bisaHapusMassal && (
                        <td className="pl-3 py-2 w-8">
                          <input type="checkbox" checked={pilih.has(r.id)} onChange={() => togglePilih(r.id)} aria-label={`Pilih ${r.resi}`} />
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs text-md-on-surface-variant whitespace-nowrap">{jam(r.created_at)}</td>
                      <td className="px-2 py-2 font-mono text-md-on-surface">{r.resi}</td>
                      <td className="px-2 py-2">
                        {r.ekspedisi === "LAINNYA" ? (
                          <select value={r.ekspedisi} onChange={(e) => koreksiEkspedisi(r, e.target.value)} className="bg-md-container-high text-xs rounded px-1.5 py-1 text-md-on-surface">
                            {DAFTAR_EKSPEDISI.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-md-on-surface-variant">{labelEkspedisi(r.ekspedisi)}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-md-on-surface-variant hidden lg:table-cell max-w-[260px] truncate" title={r.orderan ? ringkasBarang(r.orderan.barang) : undefined}>
                        {r.orderan ? ringkasBarang(r.orderan.barang) : ""}
                      </td>
                      <td className="px-2 py-2">
                        {r.cancel ? (
                          <Badge color="red">{r.terlanjur ? "Cancel · terlanjur" : "Cancel"}</Badge>
                        ) : r.asing ? (
                          <Badge color="amber">Tdk di orderan</Badge>
                        ) : (
                          <Badge color="emerald">Valid</Badge>
                        )}
                        {r.tertunda && <span className="ml-1 text-[10px] text-amber-300 whitespace-nowrap">menunggu kirim</span>}
                      </td>
                      <td className="px-2 py-2 text-xs text-md-on-surface-variant hidden md:table-cell">{r.discan_oleh}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => hapusScan(r)} className="text-md-on-surface-variant hover:text-red-400" aria-label="Hapus scan">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tampil.length > BATAS_BARIS && (
                <div className="px-4 py-2 text-xs text-md-on-surface-variant border-t border-md-outline-variant">
                  Menampilkan {BATAS_BARIS} dari {tampil.length} resi — pakai pencarian/filter, atau Export Excel untuk semuanya.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sub === "cancel" && (
        <div className="space-y-5">
          <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Field label="Platform">
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
                  {PLATFORM.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Tempel daftar resi cancel (satu per baris, atau pisah koma/spasi)">
                <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={4} placeholder="SPXID0123456789&#10;JP1234567890" className={`${inputClass} font-mono`} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={pilihFile} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} className={btnOutlined}>
                <Upload size={14} /> Upload export marketplace (.xlsx / .csv)
              </button>
              {infoFile && <span className="text-xs text-md-on-surface-variant">{infoFile}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={simpanCancel} disabled={!draft.baru.length || menyimpan} className={btnFilled}>
                {menyimpan ? "Menyimpan…" : `Simpan ${draft.baru.length} resi cancel`}
              </button>
              <span className="text-xs text-md-on-surface-variant">
                {draft.semua.length} terbaca · {draft.semua.length - draft.baru.length} sudah ada di daftar
                {draft.ditolak ? ` · ${draft.ditolak} teks diabaikan (bukan format resi)` : ""}
              </span>
            </div>
          </div>

          {laporan && (
            <div className={`rounded-md-lg border p-4 ${laporan.sudahDiscan.length ? "border-red-500/60 bg-red-600/15" : "border-emerald-400/40 bg-emerald-500/10"}`}>
              <div className="text-sm font-medium text-md-on-surface">
                {laporan.disimpan} resi cancel disimpan{laporan.sudahAda ? `, ${laporan.sudahAda} sudah ada sebelumnya` : ""}.
              </div>
              {laporan.sudahDiscan.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
                    <AlertTriangle size={15} /> {laporan.sudahDiscan.length} di antaranya SUDAH di-scan — tarik paketnya
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {laporan.sudahDiscan.map((r) => (
                      <span key={r.resi} className="font-mono text-xs bg-red-500/20 text-red-100 rounded-full px-2.5 py-1">
                        {r.resi} · {labelEkspedisi(r.ekspedisi)} · {formatTanggalID(r.tanggal)}
                      </span>
                    ))}
                  </div>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(laporan.sudahDiscan.map((r) => r.resi).join("\n"))} className={`${btnText} mt-2`}>
                    <Copy size={13} /> Salin daftar resi
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Tanggal">
                <InputTanggal value={tglCancel} onChange={(v) => { if (v) { setTglCancel(v); setSemuaTglCancel(false); } }} />
              </Field>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setTglCancel(hariIni()); setSemuaTglCancel(false); }}
                className={`text-xs px-3 py-1.5 rounded-full border ${!semuaTglCancel && tglCancel === hariIni() ? "bg-md-primary-container text-md-on-primary-container border-transparent" : "border-md-outline-variant text-md-on-surface-variant"}`}
              >
                Hari ini
              </button>
              <button
                type="button"
                onClick={() => setSemuaTglCancel(true)}
                className={`text-xs px-3 py-1.5 rounded-full border ${semuaTglCancel ? "bg-md-primary-container text-md-on-primary-container border-transparent" : "border-md-outline-variant text-md-on-surface-variant"}`}
              >
                Semua ({HARI_RIWAYAT_CANCEL} hari)
              </button>
            </div>
            <div className="mb-3 text-sm text-md-on-surface-variant">
              {cancelPerTanggal.length} resi cancel {semuaTglCancel ? `(${HARI_RIWAYAT_CANCEL} hari terakhir)` : `pada ${formatTanggalID(tglCancel)}`}
            </div>
            <div className="relative mb-3 ml-auto w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
              <input value={cariCancel} onChange={(e) => setCariCancel(e.target.value)} placeholder="Cari resi / no. pesanan" className={`${inputClass} pl-9`} />
            </div>
          </div>
          {cancelTampil.length === 0 ? (
            <EmptyState label={semuaTglCancel ? "Belum ada resi cancel." : "Tidak ada resi cancel pada tanggal ini."} />
          ) : (
            <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {cancelTampil.slice(0, BATAS_BARIS).map((r) => (
                    <tr key={r.id} className="border-b border-md-outline-variant last:border-0">
                      <td className="px-4 py-2 font-mono text-md-on-surface">{r.resi}</td>
                      <td className="px-2 py-2 text-xs text-md-on-surface-variant">{labelEkspedisi(deteksiEkspedisi(r.resi))}</td>
                      <td className="px-2 py-2 text-xs text-md-on-surface-variant hidden md:table-cell">{[r.platform, r.no_pesanan].filter(Boolean).join(" · ")}</td>
                      <td className="px-2 py-2 text-xs text-md-on-surface-variant hidden md:table-cell">{formatTanggalID(tglWIB(r.created_at))}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => hapusCancel(r)} className="text-md-on-surface-variant hover:text-red-400" aria-label="Hapus">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cancelTampil.length > BATAS_BARIS && (
                <div className="px-4 py-2 text-xs text-md-on-surface-variant border-t border-md-outline-variant">
                  Menampilkan {BATAS_BARIS} dari {cancelTampil.length} — pakai pencarian untuk menemukan resi tertentu.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sub === "rekap" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Dari"><InputTanggal value={dari} onChange={(v) => v && setDari(v)} /></Field>
            </div>
            <div className="w-48">
              <Field label="Sampai"><InputTanggal value={sampai} onChange={(v) => v && setSampai(v)} /></Field>
            </div>
            <button type="button" onClick={exportExcel} disabled={!rows.length} className={`${btnOutlined} mb-3`}>
              <Download size={14} /> Export Excel
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            <StatCard label="Total di-scan" value={rows.length} icon={ScanLine} />
            <StatCard label="Valid" value={totalValid} accent="text-emerald-300" />
            <StatCard label="Cancel" value={totalCancel} accent={totalCancel ? "text-red-400" : undefined} />
          </div>
          {memuat ? <div className="text-sm text-md-on-surface-variant py-8 text-center">Memuat…</div> : <TabelRekap rows={rows} />}
        </div>
      )}
    </div>
  );
}