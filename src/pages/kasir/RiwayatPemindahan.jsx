import { useEffect, useMemo, useState } from "react";
import { Loader2, FileDown, Trash2 } from "lucide-react";
import { sb, sbAll, entitasSesi } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { bisa } from "../../lib/constants";
import { rentangWib } from "../../lib/rekapPerpindahan";
import { Kerangka, Galat, inp } from "./BarangToko";

// =========================================================
// RIWAYAT PEMINDAHAN BARANG TOKO ⇄ GUDANG (dibuka dari Barang Toko > "Riwayat").
// Sumber data: tabel toko_stok_mutasi (jenis mutasi_masuk = gudang -> toko, mutasi_keluar = toko -> gudang),
// ditulis oleh fungsi database toko_mutasi_dari_gudang & toko_kembalikan_ke_gudang. TIDAK ada perubahan database.
//  - Filter tanggal (WIB) + filter arah.
//  - PDF per baris, atau centang beberapa lalu satukan dalam satu PDF (lib/PdfPemindahanToko.js, arah "campur").
//  - HAPUS catatan riwayat (satu per baris, atau yang dicentang) — hanya catatannya; stok toko & stok gudang TIDAK berubah.
//    Lewat fungsi database toko_hapus_mutasi (supabase/migrations/20261114_toko_hapus_mutasi.sql), dijaga izin "stok.hapus_mutasi_toko".
// TikTok: perpindahan Gudang <-> TikTok (tabel tiktok_stok_mutasi, ditulis fungsi tiktok_mutasi_dari_gudang & tiktok_kembalikan_ke_gudang)
// ikut tampil kalau akunnya punya izin "sku.barang_tiktok". Hanya baris jenis mutasi_masuk (Gudang -> TikTok) & mutasi_keluar
// (TikTok -> Gudang) yang diambil; penjualan/scan resi/opname tidak ikut. Catatan TikTok belum bisa dihapus dari sini
// (belum ada fungsi hapusnya di database), jadi tombol hapus tidak muncul di baris TikTok.
// Barang yang sudah dihapus dari Barang Toko tetap tampil (nama kosong, SKU gudang diambil dari kolom ref riwayat).
// =========================================================

const WIB = "Asia/Jakarta";
const hariIni = () => new Date().toLocaleDateString("en-CA", { timeZone: WIB }); // "YYYY-MM-DD"
const fmtWaktu = (iso) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: WIB, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTgl = (tgl) =>
  new Date(`${tgl}T12:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: WIB, day: "2-digit", month: "short", year: "numeric" });

const ARAH = [
  ["semua", "Semua"],
  ["ke_gudang", "Toko → Gudang"],
  ["ke_toko", "Gudang → Toko"],
  ["ke_tiktok", "Gudang → TikTok"],
  ["dari_tiktok", "TikTok → Gudang"],
];
const LABEL_ARAH = { ke_gudang: "Toko → Gudang", ke_toko: "Gudang → Toko", ke_tiktok: "Gudang → TikTok", dari_tiktok: "TikTok → Gudang" };
const WARNA_ARAH = { ke_gudang: "text-sky-300", ke_toko: "text-emerald-300", ke_tiktok: "text-pink-300", dari_tiktok: "text-violet-300" };
// Untuk PDF: arah dari sisi gudang (ke_gudang = barang kembali ke gudang; ke_toko = barang keluar dari gudang) + label di kolom Arah.
const ARAH_PDF = {
  ke_gudang: { arah: "ke_gudang", label: "Ke Gudang" },
  ke_toko: { arah: "ke_toko", label: "Ke Toko" },
  ke_tiktok: { arah: "ke_tiktok", label: "Gudang > TikTok" },
  dari_tiktok: { arah: "dari_tiktok", label: "TikTok > Gudang" },
};

export default function RiwayatPemindahan({ onClose }) {
  const [dari, setDari] = useState(hariIni());
  const [sampai, setSampai] = useState(hariIni());
  const [arah, setArah] = useState("semua");
  const [data, setData] = useState(null); // null = memuat
  const [error, setError] = useState("");
  const [pilih, setPilih] = useState(() => new Set());
  const [sibuk, setSibuk] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0); // dinaikkan setelah menghapus supaya daftar dimuat lagi
  const bisaHapus = bisa(getSession()?.role, "stok.hapus_mutasi_toko");
  const denganTiktok = bisa(getSession()?.role, "sku.barang_tiktok");
  const [peringatan, setPeringatan] = useState(""); // riwayat TikTok gagal dimuat (riwayat toko tetap tampil)

  useEffect(() => {
    if (!dari || !sampai || dari > sampai) {
      setData([]);
      setError(dari > sampai ? "Tanggal awal tidak boleh setelah tanggal akhir." : "");
      return undefined;
    }
    let batal = false;
    setData(null);
    setError("");
    setPeringatan("");
    setPilih(new Set());
    const r = rentangWib(dari, sampai);
    const q = `created_at=gte.${encodeURIComponent(r.dari)}&created_at=lt.${encodeURIComponent(r.sampai)}`;
    let gagalTiktok = "";
    Promise.all([
      sbAll(`toko_stok_mutasi?select=*&jenis=in.(mutasi_masuk,mutasi_keluar)&${q}&order=created_at.desc`),
      sbAll("master_toko?select=kode,nama,sku_gudang").catch(() => []),
      // TikTok: kalau gagal dimuat, riwayat toko tetap tampil dan muncul peringatan.
      denganTiktok
        ? sbAll(`tiktok_stok_mutasi?select=*&${q}&order=created_at.desc`).catch((e) => {
            gagalTiktok = e?.message || String(e);
            return [];
          })
        : Promise.resolve([]),
      denganTiktok ? sbAll("master_tiktok?select=kode,nama,sku_gudang").catch(() => []) : Promise.resolve([]),
    ])
      .then(([mutasi, toko, mutasiTt, tiktok]) => {
        if (batal) return;
        const peta = new Map((toko || []).map((t) => [t.kode, t]));
        const petaTt = new Map((tiktok || []).map((t) => [t.kode, t]));
        const barisToko = (mutasi || []).map((m) => {
          const t = peta.get(m.kode);
          return {
            id: m.id ?? `${m.kode}-${m.created_at}`,
            idAsli: m.id ?? null, // null = tidak bisa dihapus (tidak punya id)
            waktu: m.created_at,
            arah: m.jenis === "mutasi_masuk" ? "ke_toko" : "ke_gudang",
            kode: m.kode,
            nama: t?.nama || "(barang sudah dihapus)",
            sku: m.ref || t?.sku_gudang || "",
            qty: Math.abs(Number(m.qty_change) || 0),
            catatan: m.catatan || "",
          };
        });
        const barisTiktok = (mutasiTt || [])
          .filter((m) => m.jenis === "mutasi_masuk" || m.jenis === "mutasi_keluar")
          .map((m) => {
            const t = petaTt.get(m.kode);
            return {
              id: `tt-${m.id ?? `${m.kode}-${m.created_at}`}`,
              idAsli: null, // belum ada fungsi hapus untuk riwayat TikTok
              waktu: m.created_at,
              arah: m.jenis === "mutasi_masuk" ? "ke_tiktok" : "dari_tiktok",
              kode: m.kode,
              nama: t?.nama || "(barang sudah dihapus)",
              sku: m.ref || t?.sku_gudang || "",
              qty: Math.abs(Number(m.qty_change) || 0),
              catatan: m.catatan || "",
            };
          });
        setPeringatan(gagalTiktok ? `Riwayat TikTok tidak bisa dimuat (${gagalTiktok}). Riwayat toko tetap tampil.` : "");
        setData([...barisToko, ...barisTiktok].sort((a, b) => String(b.waktu).localeCompare(String(a.waktu))));
      })
      .catch((e) => {
        if (batal) return;
        setData([]);
        setError(`Gagal memuat riwayat: ${e?.message || e}`);
      });
    return () => {
      batal = true;
    };
  }, [dari, sampai, muatUlang, denganTiktok]);

  const tampil = useMemo(() => (data || []).filter((r) => arah === "semua" || r.arah === arah), [data, arah]);
  const terpilih = useMemo(() => tampil.filter((r) => pilih.has(r.id)), [tampil, pilih]);
  const semuaDicentang = tampil.length > 0 && terpilih.length === tampil.length;
  const terpilihBisaHapus = terpilih.filter((r) => r.idAsli != null);

  const toggle = (id) =>
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Hapus catatan riwayat (bukan stok). Satu per satu lewat fungsi database; berhenti dan lapor kalau ada yang gagal.
  const hapus = async (daftar) => {
    const bisaDihapus = daftar.filter((r) => r.idAsli != null);
    if (!bisaHapus || sibuk || bisaDihapus.length === 0) return;
    const ringkas =
      bisaDihapus.length === 1
        ? [`${bisaDihapus[0].kode} · ${bisaDihapus[0].nama}`, `${fmtWaktu(bisaDihapus[0].waktu)} · ${bisaDihapus[0].qty} pcs`].join("\n")
        : `${bisaDihapus.length} catatan riwayat`;
    const ok = window.confirm(
      [
        "Hapus catatan riwayat ini?",
        "",
        ringkas,
        "",
        "Yang dihapus HANYA catatan riwayatnya. Stok toko dan stok gudang tidak berubah. Tidak bisa dibatalkan.",
      ].join("\n")
    );
    if (!ok) return;
    setSibuk(true);
    setError("");
    let berhasil = 0;
    try {
      for (const r of bisaDihapus) {
        try {
          await sb("rpc/toko_hapus_mutasi", {
            method: "POST",
            body: JSON.stringify({ p_id: String(r.idAsli), p_entitas: entitasSesi() || null }),
          });
          berhasil++;
        } catch (e) {
          const pesan = String(e?.message || e);
          // catatan yang sudah tidak ada dianggap beres
          if (/MUTASI_TIDAK_DITEMUKAN/.test(pesan)) {
            berhasil++;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      const pesan = String(e?.message || e);
      setError(
        /toko_hapus_mutasi|PGRST202|does not exist|404/i.test(pesan)
          ? "Fungsi database belum dibuat. Jalankan supabase/migrations/20261114_toko_hapus_mutasi.sql di Supabase > SQL Editor."
          : `Gagal menghapus (${berhasil} dari ${bisaDihapus.length} terhapus): ${pesan}`
      );
    } finally {
      setSibuk(false);
      if (berhasil > 0) setMuatUlang((n) => n + 1);
    }
  };

  const unduh = async (daftar) => {
    if (!daftar.length) return;
    setSibuk(true);
    setError("");
    try {
      let namaUsaha = String(entitasSesi());
      try {
        const e = await sb(`master_data?select=kode,label&tipe=eq.entitas&kode=eq.${encodeURIComponent(entitasSesi())}`);
        if (e?.[0]?.label) namaUsaha = e[0].label;
      } catch {
        /* pakai kode entitas */
      }
      const ses = getSession();
      const { buatPdfPemindahanToko } = await import("../../lib/PdfPemindahanToko");
      buatPdfPemindahanToko({
        namaUsaha,
        petugas: ses?.nama || ses?.username || "",
        waktu: new Date(),
        arah: "campur",
        ...(daftar.some((r) => r.arah === "ke_tiktok" || r.arah === "dari_tiktok") ? { judul: "RIWAYAT PERPINDAHAN BARANG GUDANG - TOKO / TIKTOK", labelKode: "Kode" } : {}),
        periode: dari === sampai ? fmtTgl(dari) : `${fmtTgl(dari)} s/d ${fmtTgl(sampai)}`,
        // urut dari yang paling lama ke paling baru supaya enak dibaca di kertas
        baris: [...daftar]
          .sort((a, b) => String(a.waktu).localeCompare(String(b.waktu)))
          .map((r) => ({ ...r, arah: ARAH_PDF[r.arah].arah, arahLabel: ARAH_PDF[r.arah].label })),
      });
    } catch (e) {
      setError(`Gagal membuat PDF: ${e?.message || e}`);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Kerangka judul={denganTiktok ? "Riwayat pemindahan gudang ⇄ toko & TikTok" : "Riwayat pemindahan toko ⇄ gudang"} onClose={onClose} lebar="sm:max-w-3xl">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <div className="text-[11px] text-slate-500 mb-1">Dari tanggal</div>
          <input type="date" value={dari} onChange={(e) => e.target.value && setDari(e.target.value)} className={`${inp} !w-40`} />
        </label>
        <label className="block">
          <div className="text-[11px] text-slate-500 mb-1">Sampai tanggal</div>
          <input type="date" value={sampai} onChange={(e) => e.target.value && setSampai(e.target.value)} className={`${inp} !w-40`} />
        </label>
        <div className="flex gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
          {ARAH.filter(([v]) => denganTiktok || (v !== "ke_tiktok" && v !== "dari_tiktok")).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setArah(v)}
              className={`px-2.5 py-1.5 rounded-md font-semibold ${arah === v ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <Galat pesan={error} />
      {peringatan && <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">{peringatan}</div>}

      {data === null ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 size={16} className="animate-spin" /> Memuat…
        </div>
      ) : tampil.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">Tidak ada pemindahan pada tanggal / arah ini.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={semuaDicentang}
                onChange={() => setPilih(semuaDicentang ? new Set() : new Set(tampil.map((r) => r.id)))}
                className="accent-amber-500"
              />
              Pilih semua ({tampil.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {bisaHapus && (
                <button
                  onClick={() => hapus(terpilihBisaHapus)}
                  disabled={sibuk || terpilihBisaHapus.length === 0}
                  className="flex items-center gap-1.5 border border-red-500/50 hover:bg-red-500/10 disabled:opacity-40 text-red-300 font-semibold px-3 py-2 rounded-lg"
                >
                  <Trash2 size={14} /> Hapus terpilih ({terpilihBisaHapus.length})
                </button>
              )}
              <button
                onClick={() => unduh(terpilih)}
                disabled={sibuk || terpilih.length === 0}
                className="flex items-center gap-1.5 border border-amber-500/60 hover:bg-amber-500/10 disabled:opacity-40 text-amber-300 font-semibold px-3 py-2 rounded-lg"
              >
                <FileDown size={14} /> PDF terpilih ({terpilih.length})
              </button>
              <button
                onClick={() => unduh(tampil)}
                disabled={sibuk}
                className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 disabled:opacity-40 text-slate-200 font-semibold px-3 py-2 rounded-lg"
              >
                <FileDown size={14} /> PDF semua yang tampil
              </button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
            {tampil.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                <input type="checkbox" checked={pilih.has(r.id)} onChange={() => toggle(r.id)} className="accent-amber-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    {r.kode} · {r.nama}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {fmtWaktu(r.waktu)}
                    {r.sku ? ` · SKU ${r.sku}` : ""}
                    {r.catatan ? ` · ${r.catatan}` : ""}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[11px] font-semibold ${WARNA_ARAH[r.arah]}`}>{LABEL_ARAH[r.arah]}</div>
                  <div className="text-sm font-semibold tabular-nums">{r.qty} pcs</div>
                </div>
                <button
                  onClick={() => unduh([r])}
                  disabled={sibuk}
                  title="Unduh PDF pemindahan ini"
                  className="p-2 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40 rounded-lg flex-shrink-0"
                >
                  <FileDown size={16} />
                </button>
                {bisaHapus && r.idAsli != null && (
                  <button
                    onClick={() => hapus([r])}
                    disabled={sibuk}
                    title="Hapus catatan riwayat ini (stok tidak berubah)"
                    className="p-2 text-red-400 hover:bg-red-500/10 disabled:opacity-40 rounded-lg flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Kerangka>
  );
}
