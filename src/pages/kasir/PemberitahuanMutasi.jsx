import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { sb, entitasSesi } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { bacaPelaku } from "../../lib/mutasiPelaku";

// =========================================================
// PEMBERITAHUAN PERPINDAHAN BARANG di Master Barang.
// Menampilkan barang yang DIAMBIL dari Master Barang ke Barang Toko / Barang TikTok, dan yang DIKEMBALIKAN
// dari Barang Toko / Barang TikTok ke Master Barang. TIDAK ada perubahan database: datanya dibaca dari tabel
// riwayat yang sudah ada (sama dengan tombol "Riwayat"):
//   toko_stok_mutasi   : mutasi_masuk = Master -> Toko,   mutasi_keluar = Toko -> Master
//   tiktok_stok_mutasi : mutasi_masuk = Master -> TikTok, mutasi_keluar = TikTok -> Master
// TikTok -> Toko (toko_ambil_dari_tiktok) TIDAK ikut, karena tidak menyentuh stok Master Barang. Cara mengenalinya sama
// dengan RiwayatPemindahan.jsx: jenis menyebut tiktok, atau catatan toko & TikTok dengan waktu (sampai detik) dan jumlah yang sama.
// Hanya 3 hari terakhir yang dibaca (maks. 300 baris per tabel) supaya egress tetap kecil. Tidak ada polling: data dimuat
// saat halaman dibuka, setelah ada mutasi dari tab Barang Toko / Barang TikTok, atau lewat tombol "Muat ulang".
// SIAPA YANG MEMINDAHKAN dibaca dari kolom sisi / pelaku (lib/mutasiPelaku.js): "gudang" = dari Master Barang, "toko" / "tiktok" =
// dari tab Barang Toko / Barang TikTok. Panel yang sama dipakai di tiga tempat (parameter `untuk`):
//   "gudang" : di Master Barang, menampilkan yang dilakukan TOKO / TIKTOK (aksi gudang sendiri tidak dihitung baru)
//   "toko"   : di Barang Toko,   menampilkan yang dilakukan GUDANG ke / dari Barang Toko
//   "tiktok" : di Barang TikTok, menampilkan yang dilakukan GUDANG ke / dari Barang TikTok
// Baris lama (sebelum ada kolom sisi) tidak diketahui pelakunya: tetap tampil di Master Barang dengan kata lama.
// Status "sudah dibaca" disimpan per akun & per PT di perangkat ini (localStorage), jadi tidak perlu tabel baru.
// =========================================================

const HARI_DIBACA = 3;
const MAKS_BARIS = 300;
const WIB = "Asia/Jakarta";

const INFO_ARAH = {
  ke_toko: {
    label: "Diambil ke Barang Toko",
    pendek: "Ke Toko",
    teks: "text-emerald-300",
    chip: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  },
  ke_tiktok: {
    label: "Diambil ke Barang TikTok",
    pendek: "Ke TikTok",
    teks: "text-pink-300",
    chip: "text-pink-300 bg-pink-500/10 border-pink-500/30",
  },
  ke_gudang: {
    label: "Dikembalikan dari Barang Toko",
    pendek: "Balik dari Toko",
    teks: "text-sky-300",
    chip: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  },
  dari_tiktok: {
    label: "Dikembalikan dari Barang TikTok",
    pendek: "Balik dari TikTok",
    teks: "text-violet-300",
    chip: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  },
};

// Kata yang tampil menurut arah + sisi pelaku. Tanpa sisi (data lama) memakai kata lama dari INFO_ARAH.
const KATA = {
  ke_toko: { gudang: ["Dikirim oleh Gudang ke Barang Toko", "Dikirim ke Toko"], toko: ["Diambil oleh Toko", "Diambil Toko"] },
  ke_tiktok: { gudang: ["Dikirim oleh Gudang ke Barang TikTok", "Dikirim ke TikTok"], tiktok: ["Diambil oleh TikTok", "Diambil TikTok"] },
  ke_gudang: { gudang: ["Ditarik Gudang dari Barang Toko", "Ditarik dari Toko"], toko: ["Dikembalikan oleh Toko ke Gudang", "Balik dari Toko"] },
  dari_tiktok: { gudang: ["Ditarik Gudang dari Barang TikTok", "Ditarik dari TikTok"], tiktok: ["Dikembalikan oleh TikTok ke Gudang", "Balik dari TikTok"] },
};
export function kataMutasi(d) {
  const info = INFO_ARAH[d?.arah];
  const k = KATA[d?.arah]?.[d?.sisi];
  return { label: k ? k[0] : info?.label || "", pendek: k ? k[1] : info?.pendek || "" };
}

const ms = (iso) => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function waktuRelatif(iso) {
  const t = ms(iso);
  if (!t) return "";
  const selisih = Date.now() - t;
  const menit = Math.floor(selisih / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari === 1) return "kemarin";
  return new Date(t).toLocaleDateString("id-ID", { timeZone: WIB, day: "2-digit", month: "short" });
}

const waktuLengkap = (iso) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: WIB, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const kunciDibaca = (untuk = "gudang") =>
  `selma_notif_mutasi:${entitasSesi()}:${getSession()?.username || "anon"}${untuk === "gudang" ? "" : `:${untuk}`}`;

function bacaDibaca(untuk = "gudang") {
  try {
    const v = Number(localStorage.getItem(kunciDibaca(untuk)));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* abaikan */
  }
  // Belum pernah menandai: yang dianggap baru hanya 24 jam terakhir (bukan seluruh 3 hari).
  return Date.now() - 24 * 3600 * 1000;
}

// Sama dengan logika RiwayatPemindahan.jsx: pasangan catatan toko & TikTok (waktu sampai detik + jumlah sama) = TikTok -> Toko.
function susunDaftar(mutasiToko, mutasiTt) {
  const kunci = (m) => `${Math.abs(Number(m.qty_change) || 0)}|${String(m.created_at || "").slice(0, 19)}`;
  const ttRelevan = (mutasiTt || []).filter(
    (m) => m.jenis === "mutasi_masuk" || m.jenis === "mutasi_keluar" || /toko/i.test(String(m.jenis || ""))
  );
  const kunciTt = new Set(ttRelevan.map(kunci));
  const kunciPasangan = new Set();
  const out = [];

  (mutasiToko || []).forEach((m) => {
    const dariTiktokKeToko = /tiktok/i.test(String(m.jenis || "")) || (m.jenis === "mutasi_masuk" && kunciTt.has(kunci(m)));
    if (dariTiktokKeToko) {
      kunciPasangan.add(kunci(m));
      return; // TikTok -> Toko: tidak menyentuh Master Barang
    }
    if (m.jenis !== "mutasi_masuk" && m.jenis !== "mutasi_keluar") return;
    const p = bacaPelaku(m);
    out.push({
      id: `toko-${m.id ?? `${m.kode}-${m.created_at}`}`,
      waktu: m.created_at,
      arah: m.jenis === "mutasi_masuk" ? "ke_toko" : "ke_gudang",
      sku: m.ref || "",
      kode: m.kode || "",
      qty: Math.abs(Number(m.qty_change) || 0),
      catatan: p.catatan,
      sisi: p.sisi,
      pelaku: p.pelakuNama || p.pelaku,
    });
  });

  ttRelevan.forEach((m) => {
    if (kunciPasangan.has(kunci(m))) return; // sisi TikTok dari TikTok -> Toko
    if (m.jenis !== "mutasi_masuk" && m.jenis !== "mutasi_keluar") return; // jenis yang menyebut toko = TikTok -> Toko
    const p = bacaPelaku(m);
    out.push({
      id: `tt-${m.id ?? `${m.kode}-${m.created_at}`}`,
      waktu: m.created_at,
      arah: m.jenis === "mutasi_masuk" ? "ke_tiktok" : "dari_tiktok",
      sku: m.ref || "",
      kode: m.kode || "",
      qty: Math.abs(Number(m.qty_change) || 0),
      catatan: p.catatan,
      sisi: p.sisi,
      pelaku: p.pelakuNama || p.pelaku,
    });
  });

  return out.filter((d) => d.sku && d.qty > 0).sort((a, b) => ms(b.waktu) - ms(a.waktu));
}

// Hook: dipanggil sekali di Master Barang. `versi` dinaikkan oleh induk setiap kali ada mutasi dari tab Barang Toko / Barang TikTok.
export function useMutasiMaster(versi = 0, untuk = "gudang") {
  const [daftar, setDaftar] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [error, setError] = useState("");
  const [peringatan, setPeringatan] = useState("");
  const [dibacaMs, setDibacaMs] = useState(() => bacaDibaca(untuk));
  const urutan = useRef(0);

  const muat = useCallback(async () => {
    const nomor = ++urutan.current;
    setMemuat(true);
    setError("");
    setPeringatan("");
    const dari = new Date(Date.now() - HARI_DIBACA * 24 * 3600 * 1000).toISOString();
    const q = `created_at=gte.${encodeURIComponent(dari)}&order=created_at.desc&limit=${MAKS_BARIS}`;
    let gagalTiktok = "";
    const qToko = `toko_stok_mutasi?select=*&or=(jenis.in.(mutasi_masuk,mutasi_keluar),jenis.ilike.*tiktok*)&${q}`;
    const qTt = `tiktok_stok_mutasi?select=*&${q}`;
    try {
      // Tiap panel hanya membaca tabel yang dibutuhkan: Barang Toko -> toko_stok_mutasi, Barang TikTok -> tiktok_stok_mutasi.
      const [toko, tt] = await Promise.all([
        untuk === "tiktok" ? [] : sb(qToko),
        untuk === "toko"
          ? []
          : sb(qTt).catch((e) => {
              if (untuk === "tiktok") throw e;
              gagalTiktok = e?.message || String(e);
              return [];
            }),
      ]);
      if (nomor !== urutan.current) return; // ada permintaan yang lebih baru
      const semua = susunDaftar(toko, tt);
      // gudang: semua perpindahan; yang dilakukan gudang sendiri ditandai `sendiri` (tetap tampil, tidak dihitung baru).
      // toko / tiktok: hanya yang dilakukan gudang.
      setDaftar(untuk === "gudang" ? semua.map((d) => ({ ...d, sendiri: d.sisi === "gudang" })) : semua.filter((d) => d.sisi === "gudang"));
      setPeringatan(gagalTiktok ? `Perpindahan TikTok tidak bisa dimuat (${gagalTiktok}). Perpindahan Toko tetap tampil.` : "");
    } catch (e) {
      if (nomor !== urutan.current) return;
      setDaftar([]);
      setError(`Gagal memuat pemberitahuan: ${e?.message || e}`);
    } finally {
      if (nomor === urutan.current) setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat, versi]);

  const tandaiDibaca = useCallback(() => {
    const lawan = daftar.filter((d) => !d.sendiri);
    const terbaru = lawan.length ? Math.max(...lawan.map((d) => ms(d.waktu))) : Date.now();
    const nilai = Math.max(terbaru, Date.now() - 1000);
    try {
      localStorage.setItem(kunciDibaca(untuk), String(nilai));
    } catch {
      /* abaikan: hanya status dibaca yang tidak tersimpan */
    }
    setDibacaMs(nilai);
  }, [daftar, untuk]);

  // Yang sudah ditandai dibaca hilang dari panel dan dari chip di kartu SKU: hanya yang belum dibaca yang dikembalikan.
  // Perpindahan yang dilakukan gudang sendiri tetap tampil (sampai lewat 3 hari) tapi tidak dihitung baru dan tidak ikut "Tandai sudah dibaca".
  const belumDibaca = useMemo(() => daftar.filter((d) => d.sendiri || ms(d.waktu) > dibacaMs), [daftar, dibacaMs]);
  const jumlahBaru = useMemo(() => belumDibaca.filter((d) => !d.sendiri && ms(d.waktu) > dibacaMs).length, [belumDibaca, dibacaMs]);

  // SKU -> perpindahan TERBARU (daftar sudah urut terbaru dulu). Dipakai untuk chip di kartu SKU.
  const perSku = useMemo(() => {
    const peta = new Map();
    belumDibaca.forEach((d) => {
      if (!peta.has(d.sku)) peta.set(d.sku, d);
    });
    return peta;
  }, [belumDibaca]);

  return { untuk, daftar: belumDibaca, memuat, error, peringatan, dibacaMs, jumlahBaru, perSku, muat, tandaiDibaca };
}

// Chip kecil di kartu SKU: perpindahan terbaru SKU itu.
export function ChipMutasiSku({ e, dibacaMs = 0 }) {
  if (!e) return null;
  const info = INFO_ARAH[e.arah];
  if (!info) return null;
  const kata = kataMutasi(e);
  const baru = !e.sendiri && ms(e.waktu) > dibacaMs;
  return (
    <span
      title={`${kata.label}${e.pelaku ? ` (${e.pelaku})` : ""}: ${e.qty} pcs${e.kode ? ` (${e.kode})` : ""} · ${waktuLengkap(e.waktu)}${e.catatan ? ` · ${e.catatan}` : ""}`}
      className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded px-1.5 py-0.5 ${info.chip}`}
    >
      {baru && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
      {kata.pendek} {e.qty} pcs · {waktuRelatif(e.waktu)}
    </span>
  );
}

// Panel di atas daftar Master Barang.
export function PanelMutasiMaster({ untuk = "gudang", daftar, memuat, error, peringatan, dibacaMs, jumlahBaru, muat, tandaiDibaca, onPilihSku }) {
  const [buka, setBuka] = useState(false);
  const [semua, setSemua] = useState(false);
  const sudahAutoBuka = useRef(false);

  // Pertama kali data masuk dan ada yang belum dibaca -> panel langsung terbuka.
  useEffect(() => {
    if (!memuat && !sudahAutoBuka.current) {
      sudahAutoBuka.current = true;
      if (jumlahBaru > 0) setBuka(true);
    }
  }, [memuat, jumlahBaru]);

  const tampil = semua ? daftar : daftar.slice(0, 15);

  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setBuka((v) => !v)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <Bell size={14} className={jumlahBaru > 0 ? "text-amber-400" : "text-slate-500"} />
          <span className="text-xs font-semibold text-slate-200">{untuk === "gudang" ? "Pemberitahuan perpindahan barang" : "Pemberitahuan barang dari gudang"}</span>
          {jumlahBaru > 0 && (
            <span className="text-[10px] font-semibold text-slate-950 bg-amber-400 rounded-full px-2 py-0.5">{jumlahBaru} baru</span>
          )}
          <span className="text-[11px] text-slate-500 truncate">
            {memuat
              ? "memuat…"
              : `${untuk === "toko" ? "Gudang ⇄ Barang Toko" : untuk === "tiktok" ? "Gudang ⇄ Barang TikTok" : "Master Barang ⇄ Barang Toko / TikTok"} · ${jumlahBaru} belum dibaca`}
          </span>
          {buka ? <ChevronUp size={14} className="text-slate-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />}
        </button>
        {jumlahBaru > 0 && (
          <button
            type="button"
            onClick={tandaiDibaca}
            className="flex items-center gap-1 text-[11px] text-slate-300 border border-slate-700 hover:border-amber-500/50 rounded-lg px-2 py-1"
          >
            <CheckCheck size={12} /> Tandai sudah dibaca
          </button>
        )}
        <button
          type="button"
          onClick={muat}
          disabled={memuat}
          title="Muat ulang pemberitahuan"
          className="flex items-center gap-1 text-[11px] text-slate-300 border border-slate-700 hover:border-amber-500/50 disabled:opacity-60 rounded-lg px-2 py-1"
        >
          {memuat ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Muat ulang
        </button>
      </div>

      {buka && (
        <div className="border-t border-slate-800 px-3 py-2 space-y-1.5">
          {error && <div className="text-xs text-red-300">{error}</div>}
          {peringatan && <div className="text-xs text-amber-300">{peringatan}</div>}
          {!memuat && !error && daftar.length === 0 && (
            <div className="text-xs text-slate-500">Tidak ada pemberitahuan baru.</div>
          )}
          {tampil.map((d) => {
            const info = INFO_ARAH[d.arah];
            const baru = !d.sendiri && ms(d.waktu) > dibacaMs;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onPilihSku?.(d.sku, d)}
                title="Klik untuk mencari SKU ini di daftar"
                className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 rounded-lg px-3 py-2"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${baru ? "bg-amber-400" : "bg-transparent"}`} />
                <span className={`text-[11px] font-semibold ${info.teks}`}>{kataMutasi(d).label}</span>
                <span className="font-mono text-xs text-slate-200 truncate">{d.sku}</span>
                <span className="text-xs text-slate-300 tabular-nums">{d.qty} pcs</span>
                <span className="text-[11px] text-slate-500 sm:ml-auto">
                  {d.kode ? `${d.kode} · ` : ""}
                  {d.pelaku ? `oleh ${d.pelaku} · ` : ""}
                  {waktuLengkap(d.waktu)} ({waktuRelatif(d.waktu)})
                </span>
                {d.catatan && <span className="basis-full pl-3.5 text-[11px] text-slate-500 truncate">{d.catatan}</span>}
              </button>
            );
          })}
          {daftar.length > 15 && (
            <button type="button" onClick={() => setSemua((v) => !v)} className="text-[11px] text-amber-300 hover:text-amber-200">
              {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua (${daftar.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
