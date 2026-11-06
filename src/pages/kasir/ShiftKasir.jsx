import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, CheckCircle2, LockOpen, LogOut, Download } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { bukaShift, ringkasShift, tutupShift, pesanErrorKasir } from "./kasirApi";
import { tglJamId } from "./kasirStruk";
import { bukaLaciSaatBukaKasir, adalahAppDesktop, URL_UNDUH_APP_KASIR } from "./kasirLaci";

// =========================================================
// KASIR — SHIFT (fase 5)
//  - LayarBukaShift : layar awal sebelum bisa berjualan (isi kas awal -> Buka Kasir)
//  - ModalTutupShift: hitung kas seharusnya, kasir mengisi uang yang dihitung, selisih,
//                     lalu tutup shift.
// Kas seharusnya = kas awal + penjualan cash - retur yang dikembalikan lewat cash.
// Transfer & QRIS tidak masuk laci kas.
// =========================================================

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-base outline-none transition-colors focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10";

// Input angka rupiah yang membedakan "kosong" dan "0" (InputRupiah biasa menampilkan 0 sebagai kosong).
function InputUang({ value, onChange, placeholder = "0", autoFocus }) {
  const tampil = value === "" ? "" : Number(value).toLocaleString("id-ID");
  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={tampil}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "");
        onChange(d === "" ? "" : Number(d));
      }}
      placeholder={placeholder}
      className={`${inputCls} text-2xl font-bold`}
    />
  );
}

function Baris({ label, nilai, tebal, warna = "", tanda }) {
  return (
    <div className={`flex justify-between gap-3 ${tebal ? "font-semibold" : ""}`}>
      <span className={tebal ? "text-slate-200" : "text-slate-400"}>
        {tanda ? `${tanda} ` : ""}
        {label}
      </span>
      <span className={warna}>{nilai}</span>
    </div>
  );
}

const warnaSelisih = (n) => (n === 0 ? "text-emerald-400" : n > 0 ? "text-amber-400" : "text-red-400");
const teksSelisih = (n) => (n === 0 ? "Pas" : n > 0 ? `Lebih ${fmtRp(n)}` : `Kurang ${fmtRp(-n)}`);

// ---------------------------------------------------------
export function LayarBukaShift({ session, onBuka, onKeluar }) {
  const [kasAwal, setKasAwal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const buka = async () => {
    if (kasAwal === "" || saving) return;
    setSaving(true);
    setError("");
    try {
      const shift = await bukaShift({ session, kasAwal });
      bukaLaciSaatBukaKasir({ kasir: session?.nama || session?.username, kasAwal }); // cetak slip -> driver printer membuka laci
      onBuka(shift);
    } catch (e) {
      setError(pesanErrorKasir(e, "koreksi").pesan);
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-elevation-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center mb-4">
          <LockOpen size={20} className="text-slate-950" />
        </div>
        <div className="font-bold text-xl">Buka Kasir</div>
        <p className="text-sm text-slate-400 mt-1.5 mb-5 leading-relaxed">
          Halo {session?.nama || session?.username}. Hitung uang tunai di laci, lalu isi sebagai kas awal. Penjualan baru bisa dimulai setelah kasir dibuka.
        </p>

        <label className="text-sm font-medium text-slate-300 mb-1.5 block">Kas awal (uang tunai di laci)</label>
        <InputUang value={kasAwal} onChange={setKasAwal} autoFocus />

        {error && (
          <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        <button
          onClick={buka}
          disabled={kasAwal === "" || saving}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-base py-4 rounded-2xl transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <LockOpen size={16} />} Buka Kasir
        </button>
        {!adalahAppDesktop() && (
          <a
            href={URL_UNDUH_APP_KASIR}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 border border-slate-800 rounded-lg py-2"
          >
            <Download size={13} /> Unduh Aplikasi Kasir (laci terbuka otomatis)
          </a>
        )}
        <button onClick={onKeluar} className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
          <LogOut size={13} /> Keluar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
export function ModalTutupShift({ shift, onSelesai, onClose }) {
  const [ringkas, setRingkas] = useState(null);
  const [error, setError] = useState("");
  const [kasAkhir, setKasAkhir] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasil, setHasil] = useState(null);

  useEffect(() => {
    let batal = false;
    ringkasShift(shift.id)
      .then((r) => !batal && setRingkas(r))
      .catch((e) => !batal && setError(pesanErrorKasir(e, "koreksi").pesan));
    return () => {
      batal = true;
    };
  }, [shift.id]);

  const sistem = Number(ringkas?.kas_sistem) || 0;
  const selisih = kasAkhir === "" ? null : kasAkhir - sistem;
  const perluCatatan = selisih !== null && selisih !== 0;
  const bisaTutup = ringkas && kasAkhir !== "" && (!perluCatatan || catatan.trim()) && !saving;

  const tutup = async () => {
    if (!bisaTutup) return;
    setSaving(true);
    setError("");
    try {
      setHasil(await tutupShift({ shiftId: shift.id, kasAkhir, catatan }));
    } catch (e) {
      setError(pesanErrorKasir(e, "koreksi").pesan);
    } finally {
      setSaving(false);
    }
  };

  const r = hasil || ringkas;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={() => !saving && !hasil && onClose()}>
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <div className="font-bold">{hasil ? "Kasir ditutup" : "Tutup Kasir"}</div>
            <div className="text-xs text-slate-500">Dibuka {tglJamId(shift.buka_at)}</div>
          </div>
          {!hasil && (
            <button onClick={onClose} disabled={saving} className="p-2 text-slate-500 hover:text-slate-200">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {!r && !error && (
            <div className="py-8 flex justify-center text-slate-500">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}

          {r && (
            <>
              <div className="space-y-2 text-sm">
                <Baris label="Kas awal" nilai={fmtRp(r.kas_awal)} />
                <Baris label="Penjualan cash" nilai={fmtRp(r.penjualan_cash)} tanda="+" />
                <Baris label="Retur cash" nilai={fmtRp(r.retur_cash)} tanda="−" />
                <div className="border-t border-slate-800 pt-1.5">
                  <Baris label="Kas seharusnya" nilai={fmtRp(r.kas_sistem)} tebal />
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 space-y-1.5 text-xs text-slate-400">
                <Baris label={`Transaksi (${r.jumlah_transaksi})`} nilai={fmtRp(r.omzet)} />
                <Baris label="Transfer" nilai={fmtRp(r.penjualan_transfer)} />
                <Baris label="QRIS" nilai={fmtRp(r.penjualan_qris)} />
                <Baris label={`Retur (${r.jumlah_retur})`} nilai={fmtRp((Number(r.retur_cash) || 0) + (Number(r.retur_noncash) || 0))} />
                <Baris label="Transaksi di-void" nilai={`${r.jumlah_void}`} />
              </div>
            </>
          )}

          {hasil ? (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-1" />
                <div className="text-xs text-slate-500">Uang dihitung</div>
                <div className="text-3xl font-extrabold tracking-tight">{fmtRp(hasil.kas_akhir)}</div>
                <div className={`mt-1 text-sm font-semibold ${warnaSelisih(Number(hasil.selisih))}`}>
                  Selisih: {teksSelisih(Number(hasil.selisih))}
                </div>
                {hasil.catatan && <div className="mt-2 text-xs text-slate-400">Catatan: {hasil.catatan}</div>}
              </div>
              <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl">
                Selesai
              </button>
            </>
          ) : (
            ringkas && (
              <>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 block">Uang tunai yang dihitung di laci</label>
                  <InputUang value={kasAkhir} onChange={setKasAkhir} />
                  {selisih !== null && (
                    <div className={`mt-1.5 text-sm font-semibold ${warnaSelisih(selisih)}`}>Selisih: {teksSelisih(selisih)}</div>
                  )}
                </div>

                {perluCatatan && (
                  <div>
                    <label className="text-sm font-medium text-slate-300 mb-1.5 block">Catatan selisih (wajib)</label>
                    <textarea
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      rows={2}
                      placeholder="Mis. uang parkir Rp 3.000 belum dicatat"
                      className={`${inputCls} text-sm`}
                    />
                  </div>
                )}
              </>
            )
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {!hasil && ringkas && (
            <button
              onClick={tutup}
              disabled={!bisaTutup}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold py-3.5 rounded-2xl"
            >
              {saving && <Loader2 size={16} className="animate-spin" />} Tutup Kasir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
