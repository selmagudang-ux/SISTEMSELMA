import { useEffect, useMemo, useState } from "react";
import { Loader2, Calculator, RotateCcw, AlertTriangle } from "lucide-react";
import { sb, sbAll, calcHarga, rumusHargaEntitas, entitasSesi, daftarkanProfilEntitas, fmtRp } from "../../lib/api";

// =========================================================
// VERSI HP — KALKULATOR HARGA (menu "kalkulator-harga")
// Menghitung HPP, Harga Grosir, Tengah, dan Ecer dari Harga Asli (atau mundur dari HPP).
// Rumusnya MEMAKAI ULANG calcHarga (lib/api.js), jadi hasilnya sama persis dengan form SKU / Barang Masuk
// di versi komputer, termasuk angka rumus per PT yang diatur di Pengaturan > Pengaturan per Perusahaan.
// Layar ini hanya menghitung — tidak ada data yang disimpan.
// =========================================================

const angka = (s) => Number(String(s || "").replace(/\D/g, "")) || 0;
const ribuan = (s) => {
  const n = angka(s);
  return n ? n.toLocaleString("id-ID") : "";
};

function Baris({ label, nilai, tebal = false, redup = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className={`text-sm ${redup ? "text-md-on-surface-variant" : "text-md-on-surface"}`}>{label}</span>
      <span className={`tabular-nums ${tebal ? "text-lg font-bold text-md-on-surface" : "text-sm font-medium text-md-on-surface"}`}>{nilai}</span>
    </div>
  );
}

export default function KalkulatorHargaHp() {
  const [siap, setSiap] = useState(false);
  const [gagalMuat, setGagalMuat] = useState(false);
  const [settings, setSettings] = useState(null);
  const [setList, setSetList] = useState([]);
  const [mode, setMode] = useState("asli"); // "asli" = isi Harga Asli | "hpp" = isi HPP (dihitung mundur)
  const [isi, setIsi] = useState("");

  // Muat rumus harga PT (master_data tipe entitas_set) + pengaturan pembulatan (tabel settings).
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const [rows, st] = await Promise.all([
          sbAll("master_data?select=tipe,kode,label&tipe=in.(entitas,entitas_set)"),
          sb("settings?select=*"),
        ]);
        if (batal) return;
        const daftar = Array.isArray(rows) ? rows : [];
        const entitas = daftar.filter((r) => r.tipe === "entitas");
        const set = daftar.filter((r) => r.tipe === "entitas_set");
        daftarkanProfilEntitas({ entitas, entitas_set: set }); // calcHarga membaca rumus PT dari sini
        setSetList(set);
        setSettings((Array.isArray(st) ? st : [])[0] || null);
      } catch {
        if (!batal) setGagalMuat(true); // tetap bisa menghitung, memakai rumus bawaan
      } finally {
        if (!batal) setSiap(true);
      }
    })();
    return () => {
      batal = true;
    };
  }, []);

  const rumus = useMemo(() => (siap ? rumusHargaEntitas(setList, entitasSesi(), settings) : null), [siap, setList, settings]);

  const hasil = useMemo(() => {
    const n = angka(isi);
    if (!siap || !n) return null;
    let asli = n;
    if (mode === "hpp") {
      const rasio = calcHarga(1e6, settings).hpp / 1e6;
      asli = rasio > 0 ? n / rasio : n;
    }
    const h = calcHarga(asli, settings);
    return { ...h, hppTampil: mode === "hpp" ? n : h.hpp, asli: mode === "hpp" ? Math.round(asli) : n };
  }, [isi, mode, siap, settings]);

  const pengaliTengah = hasil && rumus ? (hasil.hpp < 10000 ? rumus.tengah_x1 : hasil.hpp < 20000 ? rumus.tengah_x2 : rumus.tengah_x3) : null;
  const dinaikkanKeMinimal = hasil && mode === "asli" && hasil.hargaDasar > hasil.asli;

  if (!siap) {
    return (
      <div className="h-full flex items-center justify-center text-md-on-surface-variant">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {gagalMuat && (
        <div className="flex items-start gap-2 rounded-xl bg-md-error-container/40 border border-md-error/40 px-3 py-2 text-xs text-md-on-surface">
          <AlertTriangle size={14} className="text-md-error flex-shrink-0 mt-0.5" />
          <span>Rumus perusahaan belum bisa dimuat. Hasil di bawah memakai rumus bawaan, bisa berbeda dari angka PT Anda.</span>
        </div>
      )}

      <div className="rounded-2xl bg-md-container border border-md-outline-variant p-4 space-y-3">
        <div className="flex rounded-full bg-md-surface border border-md-outline-variant p-0.5 text-xs font-medium">
          {[
            ["asli", "Dari Harga Asli"],
            ["hpp", "Dari HPP"],
          ].map(([k, t]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex-1 rounded-full py-1.5 transition ${mode === k ? "bg-md-primary-container text-md-on-primary-container" : "text-md-on-surface-variant"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-xs text-md-on-surface-variant">{mode === "asli" ? "Harga Asli (Rp)" : "HPP (Rp)"}</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={ribuan(isi)}
              onChange={(e) => setIsi(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="flex-1 min-w-0 rounded-xl bg-md-surface border border-md-outline-variant px-3 py-2.5 text-lg font-semibold tabular-nums text-md-on-surface outline-none focus:border-md-primary"
            />
            {isi && (
              <button onClick={() => setIsi("")} className="w-10 h-10 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-on-surface/10" title="Kosongkan">
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </label>
        {mode === "hpp" && <p className="text-[11px] text-md-on-surface-variant">Harga Asli dihitung mundur dari HPP, lalu Grosir, Tengah, dan Ecer dihitung dari situ.</p>}
      </div>

      {!hasil ? (
        <div className="rounded-2xl bg-md-container border border-md-outline-variant p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-md-surface mx-auto mb-2 flex items-center justify-center text-md-primary">
            <Calculator size={22} />
          </div>
          <p className="text-sm text-md-on-surface-variant">Isi {mode === "asli" ? "Harga Asli" : "HPP"} untuk melihat harga Grosir, Tengah, dan Ecer.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-md-primary-container text-md-on-primary-container p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Grosir", hasil.grosir],
                ["Tengah", hasil.tengah],
                ["Ecer", hasil.ecer],
              ].map(([t, v]) => (
                <div key={t} className="min-w-0">
                  <div className="text-[11px] opacity-80">{t}</div>
                  <div className="text-base font-bold tabular-nums leading-tight break-words">{fmtRp(v)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-md-container border border-md-outline-variant px-4 divide-y divide-md-outline-variant">
            <Baris label="Harga Asli" nilai={fmtRp(hasil.asli)} />
            {dinaikkanKeMinimal && <Baris label="Dipakai (harga asli minimal)" nilai={fmtRp(hasil.hargaDasar)} redup />}
            <Baris label={`HPP (harga asli + ${rumus.hpp_persen}%)`} nilai={fmtRp(hasil.hppTampil)} />
            <Baris label={`Tengah (HPP × ${pengaliTengah})`} nilai={fmtRp(hasil.tengah)} />
            <Baris label={`Grosir (HPP × ${rumus.grosir_x})`} nilai={fmtRp(hasil.grosir)} />
            <Baris label={`Ecer (Tengah × ${rumus.ecer_x})`} nilai={fmtRp(hasil.ecer)} />
          </div>

          <p className="text-[11px] text-md-on-surface-variant px-1">
            Dibulatkan ke {fmtRp(rumus.round_to)} terdekat. Harga asli minimal {fmtRp(rumus.harga_min)}. Angka rumus bisa diubah di Pengaturan versi komputer.
          </p>
        </>
      )}
    </div>
  );
}
