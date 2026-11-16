import { useEffect, useMemo, useState } from "react";
import { Loader2, FileDown } from "lucide-react";
import { sb, sbAll, entitasSesi } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { rentangWib } from "../../lib/rekapPerpindahan";
import { Kerangka, Galat, inp } from "./BarangToko";

// =========================================================
// RIWAYAT PEMINDAHAN BARANG TOKO ⇄ GUDANG (dibuka dari Barang Toko > "Riwayat").
// Sumber data: tabel toko_stok_mutasi (jenis mutasi_masuk = gudang -> toko, mutasi_keluar = toko -> gudang),
// ditulis oleh fungsi database toko_mutasi_dari_gudang & toko_kembalikan_ke_gudang. TIDAK ada perubahan database.
//  - Filter tanggal (WIB) + filter arah.
//  - PDF per baris, atau centang beberapa lalu satukan dalam satu PDF (lib/PdfPemindahanToko.js, arah "campur").
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
];

export default function RiwayatPemindahan({ onClose }) {
  const [dari, setDari] = useState(hariIni());
  const [sampai, setSampai] = useState(hariIni());
  const [arah, setArah] = useState("semua");
  const [data, setData] = useState(null); // null = memuat
  const [error, setError] = useState("");
  const [pilih, setPilih] = useState(() => new Set());
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (!dari || !sampai || dari > sampai) {
      setData([]);
      setError(dari > sampai ? "Tanggal awal tidak boleh setelah tanggal akhir." : "");
      return undefined;
    }
    let batal = false;
    setData(null);
    setError("");
    setPilih(new Set());
    const r = rentangWib(dari, sampai);
    const q = `created_at=gte.${encodeURIComponent(r.dari)}&created_at=lt.${encodeURIComponent(r.sampai)}`;
    Promise.all([
      sbAll(`toko_stok_mutasi?select=*&jenis=in.(mutasi_masuk,mutasi_keluar)&${q}&order=created_at.desc`),
      sbAll("master_toko?select=kode,nama,sku_gudang").catch(() => []),
    ])
      .then(([mutasi, toko]) => {
        if (batal) return;
        const peta = new Map((toko || []).map((t) => [t.kode, t]));
        setData(
          (mutasi || []).map((m) => {
            const t = peta.get(m.kode);
            return {
              id: m.id ?? `${m.kode}-${m.created_at}`,
              waktu: m.created_at,
              arah: m.jenis === "mutasi_masuk" ? "ke_toko" : "ke_gudang",
              kode: m.kode,
              nama: t?.nama || "(barang sudah dihapus)",
              sku: m.ref || t?.sku_gudang || "",
              qty: Math.abs(Number(m.qty_change) || 0),
              catatan: m.catatan || "",
            };
          }),
        );
      })
      .catch((e) => {
        if (batal) return;
        setData([]);
        setError(`Gagal memuat riwayat: ${e?.message || e}`);
      });
    return () => {
      batal = true;
    };
  }, [dari, sampai]);

  const tampil = useMemo(() => (data || []).filter((r) => arah === "semua" || r.arah === arah), [data, arah]);
  const terpilih = useMemo(() => tampil.filter((r) => pilih.has(r.id)), [tampil, pilih]);
  const semuaDicentang = tampil.length > 0 && terpilih.length === tampil.length;

  const toggle = (id) =>
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
        periode: dari === sampai ? fmtTgl(dari) : `${fmtTgl(dari)} s/d ${fmtTgl(sampai)}`,
        // urut dari yang paling lama ke paling baru supaya enak dibaca di kertas
        baris: [...daftar].sort((a, b) => String(a.waktu).localeCompare(String(b.waktu))),
      });
    } catch (e) {
      setError(`Gagal membuat PDF: ${e?.message || e}`);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Kerangka judul="Riwayat pemindahan toko ⇄ gudang" onClose={onClose} lebar="sm:max-w-3xl">
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
          {ARAH.map(([v, l]) => (
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
                  <div className={`text-[11px] font-semibold ${r.arah === "ke_gudang" ? "text-sky-300" : "text-emerald-300"}`}>
                    {r.arah === "ke_gudang" ? "Toko → Gudang" : "Gudang → Toko"}
                  </div>
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
              </div>
            ))}
          </div>
        </>
      )}
    </Kerangka>
  );
}
