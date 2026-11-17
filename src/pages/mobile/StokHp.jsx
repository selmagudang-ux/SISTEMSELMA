import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Loader2, AlertCircle, X, MapPin, Send, CheckCircle2, Clock } from "lucide-react";
import { sb, sbAll } from "../../lib/api";
import { bisa, allowedSubMenus, AMBANG_MENIPIS_RESTOCK } from "../../lib/constants";
import { cariSkuDariBarcode } from "../../lib/code128";
import { TombolScanKamera } from "../../components/ScanKamera";

// =========================================================
// VERSI HP — STOK (gudang) — file StokHp.jsx (bukan Stok.jsx, supaya tidak tertukar dengan pages/Stok.jsx desktop)
// Isi: Stok Barang (cari / scan barcode / urut) dan Stok Menipis (+ ajukan restok ke owner).
// Sumber data SAMA dengan SELMA desktop: sku_master (stok per PT lewat lib/api.js), penempatan (lokasi rak)
// dan pengajuan_restock. Tampilan kartu, bukan tabel. Sub-menu mengikuti hak akses role (allowedSubMenus).
// Yang belum ada di HP: Barang Keluar, Stok Opname, Riwayat Stok (masih di versi komputer).
// =========================================================

const AMBANG_MENIPIS_BADGE = 5; // sama dengan badge per baris di Stok Barang desktop
const PER_TAMPIL = 40;

const URUTAN = [
  { k: "tertinggi", label: "Stok tertinggi" },
  { k: "terendah", label: "Stok terendah" },
  { k: "az", label: "Model A-Z" },
  { k: "za", label: "Model Z-A" },
];

// SKU: {bahan}{peruntukan}{kategori}-{subkategori}-{model}-{warna}-{ukuran} -> model = segmen ke-3.
const modelDariSku = (sku) => (sku || "").split("-")[2] || "";
const bandingModel = (a, b, arah) => {
  const ma = modelDariSku(a.sku);
  const mb = modelDariSku(b.sku);
  if (!ma && !mb) return 0;
  if (!ma) return 1;
  if (!mb) return -1;
  return arah * ma.localeCompare(mb, "id", { numeric: true, sensitivity: "base" });
};

function LencanaStok({ stok }) {
  if (stok <= 0) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-md-error-container text-md-on-error-container">Habis</span>;
  if (stok < AMBANG_MENIPIS_BADGE)
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">Menipis · {stok}</span>;
  return <span className="text-base font-bold text-md-on-surface">{stok.toLocaleString("id-ID")}</span>;
}

export default function Stok({ session, sub }) {
  // allowedSubMenus mengembalikan null kalau role tidak dibatasi (artinya semua sub boleh).
  const subBoleh = allowedSubMenus(session.role, "stok");
  const adaSub = (k) => !Array.isArray(subBoleh) || subBoleh.includes(k);
  // `sub` diisi kalau layar dibuka dari satu sub-menu tertentu (Stok Barang / Stok Menipis) -> tampilkan itu saja.
  const adaMenipis = sub ? sub === "menipis" : adaSub("menipis");
  const adaBarang = sub ? sub === "barang" : adaSub("barang");
  const [tab, setTab] = useState(adaBarang ? "barang" : "menipis");

  const [data, setData] = useState(null); // null = belum dimuat
  const [diajukan, setDiajukan] = useState(new Map()); // sku -> pengajuan menunggu
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [urut, setUrut] = useState("tertinggi");
  const [tampil, setTampil] = useState(PER_TAMPIL);
  const [dipilih, setDipilih] = useState(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setErr("");
    try {
      const [sku, ajuan] = await Promise.all([
        sbAll("sku_master?select=id,sku,barcode_supplier,nonaktif&order=sku"),
        sbAll("pengajuan_restock?select=sku,status,created_at&status=eq.menunggu").catch(() => []),
      ]);
      setData(Array.isArray(sku) ? sku : []);
      const m = new Map();
      (ajuan || []).forEach((p) => p.sku && m.set(p.sku, p));
      setDiajukan(m);
    } catch (e) {
      setErr(e.message || "Gagal memuat stok");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const ubahCari = (v) => {
    setQ(v);
    setTampil(PER_TAMPIL);
  };

  const semua = data || [];
  const ringkas = useMemo(() => {
    let total = 0;
    let habis = 0;
    let menipis = 0;
    semua.forEach((s) => {
      const st = Number(s.stok) || 0;
      total += st;
      if (st <= 0) habis += 1;
      else if (st < AMBANG_MENIPIS_BADGE) menipis += 1;
    });
    return { total, habis, menipis };
  }, [semua]);

  const daftar = useMemo(() => {
    const kata = q.trim().toLowerCase();
    let hasil = semua.filter((s) => !kata || (s.sku || "").toLowerCase().includes(kata));
    if (tab === "menipis") {
      hasil = hasil.filter((s) => !s.nonaktif && (Number(s.stok) || 0) <= AMBANG_MENIPIS_RESTOCK).sort((a, b) => (a.stok || 0) - (b.stok || 0));
    } else {
      hasil = [...hasil].sort((a, b) => {
        if (urut === "az") return bandingModel(a, b, 1);
        if (urut === "za") return bandingModel(a, b, -1);
        if (urut === "terendah") return (a.stok || 0) - (b.stok || 0);
        return (b.stok || 0) - (a.stok || 0);
      });
    }
    return hasil;
  }, [semua, q, tab, urut]);

  if (!adaBarang && !adaMenipis) {
    return <div className="p-6 text-center text-sm text-md-on-surface-variant">Akun ini tidak punya akses ke sub-menu Stok yang tersedia di HP.</div>;
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-md-surface px-4 pt-3 pb-2 space-y-2 border-b border-md-outline-variant">
        {adaBarang && adaMenipis && (
          <div className="flex gap-1 p-1 rounded-full bg-md-container">
            {[
              { k: "barang", label: "Stok Barang" },
              { k: "menipis", label: "Stok Menipis" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => {
                  setTab(t.k);
                  setTampil(PER_TAMPIL);
                }}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition ${
                  tab === t.k ? "bg-md-primary-container text-md-on-primary-container" : "text-md-on-surface-variant"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-md-container rounded-full px-3 py-2 border border-md-outline-variant">
            <Search size={15} className="text-md-on-surface-variant flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => ubahCari(e.target.value)}
              placeholder="Cari SKU atau scan…"
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-md-on-surface-variant"
            />
            {q && (
              <button onClick={() => ubahCari("")} className="text-md-on-surface-variant">
                <X size={14} />
              </button>
            )}
          </div>
          <TombolScanKamera
            label="Scan"
            judul="Scan Barcode — Cek Stok"
            onDetect={(kode) => {
              const cocok = cariSkuDariBarcode(semua, kode);
              ubahCari(cocok ? cocok.sku : kode);
              if (cocok) setDipilih(cocok);
            }}
          />
          <button
            onClick={muat}
            disabled={memuat}
            className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant hover:bg-md-on-surface/10 disabled:opacity-50 flex-shrink-0"
            title="Muat ulang"
          >
            <RefreshCw size={16} className={memuat ? "animate-spin" : ""} />
          </button>
        </div>
        {tab === "barang" && (
          <select
            value={urut}
            onChange={(e) => {
              setUrut(e.target.value);
              setTampil(PER_TAMPIL);
            }}
            className="w-full bg-md-container border border-md-outline-variant rounded-full px-3 py-1.5 text-xs text-md-on-surface-variant outline-none"
          >
            {URUTAN.map((o) => (
              <option key={o.k} value={o.k}>
                Urut: {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="p-4 space-y-3">
        {tab === "barang" && data && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-md-container p-2.5">
              <div className="text-[10px] text-md-on-surface-variant">Total SKU</div>
              <div className="text-base font-bold">{semua.length.toLocaleString("id-ID")}</div>
            </div>
            <div className="rounded-2xl bg-md-container p-2.5">
              <div className="text-[10px] text-md-on-surface-variant">Menipis</div>
              <div className={`text-base font-bold ${ringkas.menipis ? "text-amber-500" : ""}`}>{ringkas.menipis}</div>
            </div>
            <div className="rounded-2xl bg-md-container p-2.5">
              <div className="text-[10px] text-md-on-surface-variant">Habis</div>
              <div className={`text-base font-bold ${ringkas.habis ? "text-md-error" : ""}`}>{ringkas.habis}</div>
            </div>
          </div>
        )}
        {tab === "menipis" && (
          <p className="text-xs text-md-on-surface-variant">SKU dengan stok ≤ {AMBANG_MENIPIS_RESTOCK} pcs. Ketuk SKU untuk mengajukan restok ke owner.</p>
        )}

        {err && (
          <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-3 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        {!data && memuat && (
          <div className="py-10 flex justify-center text-md-on-surface-variant">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {data && daftar.length === 0 && (
          <div className="py-10 text-center text-sm text-md-on-surface-variant">
            {q ? "Tidak ada SKU yang cocok dengan pencarian." : tab === "menipis" ? "Tidak ada SKU dengan stok menipis." : "Belum ada data stok."}
          </div>
        )}

        <div className="space-y-2">
          {daftar.slice(0, tampil).map((s) => {
            const stok = Number(s.stok) || 0;
            const ajuan = diajukan.get(s.sku);
            return (
              <button
                key={s.id}
                onClick={() => setDipilih(s)}
                className="w-full text-left rounded-2xl bg-md-container border border-md-outline-variant px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.99] transition"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-md-on-surface break-all">{s.sku}</div>
                  {s.nonaktif && <div className="text-[10px] text-md-on-surface-variant mt-0.5">Nonaktif</div>}
                  {ajuan && (
                    <div className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1">
                      <Clock size={10} /> Restok menunggu persetujuan
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <LencanaStok stok={stok} />
                </div>
              </button>
            );
          })}
        </div>

        {daftar.length > tampil && (
          <button onClick={() => setTampil((n) => n + PER_TAMPIL)} className="w-full py-2.5 rounded-full border border-md-outline-variant text-xs font-medium text-md-primary">
            Tampilkan lebih banyak ({daftar.length - tampil} lagi)
          </button>
        )}
      </div>

      {dipilih && (
        <DetailSku
          sku={dipilih}
          session={session}
          sudahDiajukan={diajukan.has(dipilih.sku)}
          onTutup={() => setDipilih(null)}
          onTerkirim={() => {
            setDipilih(null);
            muat();
          }}
        />
      )}
    </div>
  );
}

// Lembar dari bawah: stok, lokasi rak (tabel penempatan), dan ajukan restok.
function DetailSku({ sku, session, sudahDiajukan, onTutup, onTerkirim }) {
  const stok = Number(sku.stok) || 0;
  const bolehAjukan = bisa(session.role, "stok.ajukan_restock");
  const [rak, setRak] = useState(null); // null = memuat
  const [catatan, setCatatan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [err, setErr] = useState("");
  const [sukses, setSukses] = useState(false);

  useEffect(() => {
    let batal = false;
    sb(`penempatan?sku=eq.${encodeURIComponent(sku.sku)}&select=rak_code,qty&order=rak_code`)
      .then((rows) => !batal && setRak((Array.isArray(rows) ? rows : []).filter((r) => Number(r.qty) > 0)))
      .catch(() => !batal && setRak([]));
    return () => {
      batal = true;
    };
  }, [sku.sku]);

  const ajukan = async () => {
    setKirim(true);
    setErr("");
    try {
      await sb("pengajuan_restock", {
        method: "POST",
        body: JSON.stringify({
          jenis: "sku",
          sku: sku.sku,
          stok_saat_ajuan: stok,
          catatan: catatan.trim() || null,
          status: "menunggu",
          dibuat_oleh_id: session?.id || null,
          dibuat_oleh_nama: session?.nama || session?.username || null,
        }),
      });
      setSukses(true);
      setTimeout(onTerkirim, 900);
    } catch (e) {
      setErr(e.message || "Gagal mengirim pengajuan");
      setKirim(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onTutup}>
      <div
        className="w-full max-h-[85dvh] overflow-y-auto bg-md-container-low rounded-t-3xl p-4 space-y-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-md-on-surface-variant">Detail SKU</div>
            <div className="font-mono text-sm font-semibold break-all">{sku.sku}</div>
          </div>
          <button onClick={onTutup} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-md-on-surface/10">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-2xl bg-md-container p-4 flex items-center justify-between">
          <span className="text-sm text-md-on-surface-variant">Stok sekarang</span>
          <span className={`text-2xl font-bold ${stok <= 0 ? "text-md-error" : stok < AMBANG_MENIPIS_BADGE ? "text-amber-500" : ""}`}>{stok.toLocaleString("id-ID")}</span>
        </div>

        <div>
          <div className="text-xs font-semibold text-md-on-surface-variant mb-1.5 flex items-center gap-1">
            <MapPin size={12} /> Lokasi rak
          </div>
          {rak === null ? (
            <Loader2 size={16} className="animate-spin text-md-on-surface-variant" />
          ) : rak.length === 0 ? (
            <div className="text-sm text-md-on-surface-variant">Belum ditempatkan di rak.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rak.map((r) => (
                <span key={r.rak_code} className="px-3 py-1.5 rounded-full bg-md-container border border-md-outline-variant text-xs">
                  <b className="font-mono">{r.rak_code}</b> · {Number(r.qty)} pcs
                </span>
              ))}
            </div>
          )}
        </div>

        {bolehAjukan && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-md-on-surface-variant">Ajukan restok ke owner</div>
            {sudahDiajukan ? (
              <div className="rounded-2xl bg-amber-500/15 text-amber-500 text-sm p-3 flex items-center gap-2">
                <Clock size={16} /> Pengajuan SKU ini masih menunggu persetujuan.
              </div>
            ) : sukses ? (
              <div className="rounded-2xl bg-emerald-500/15 text-emerald-500 text-sm p-3 flex items-center gap-2">
                <CheckCircle2 size={16} /> Pengajuan restok terkirim ke owner.
              </div>
            ) : (
              <>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={2}
                  placeholder="Catatan (opsional), mis. jumlah yang diminta"
                  className="w-full bg-md-container border border-md-outline-variant rounded-2xl px-3 py-2 text-sm outline-none placeholder:text-md-on-surface-variant"
                />
                {err && <div className="text-xs text-md-error">{err}</div>}
                <button
                  onClick={ajukan}
                  disabled={kirim}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-md-primary text-md-on-primary text-sm font-semibold disabled:opacity-50"
                >
                  {kirim ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Ajukan Restok
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
