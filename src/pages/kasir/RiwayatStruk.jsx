import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, Receipt, RefreshCw } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { muatMaster, muatRiwayat, muatStrukDariDb, SKEMA } from "./kasirApi";
import { identitasStruk, tglJamId } from "./kasirStruk";
import ModalStruk from "./StrukKasir";

// =========================================================
// KASIR — RIWAYAT TRANSAKSI & CETAK ULANG STRUK (fase 4)
// Daftar transaksi hari ini (kasir hanya melihat miliknya sendiri). Ketuk satu
// transaksi -> struk dibaca dari database lalu bisa dicetak ulang / dikirim lagi.
// Riwayat per kasir dengan rentang tanggal: fase 5.
// =========================================================

function awalHariIni() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function RiwayatStruk({ session, onClose }) {
  const [daftar, setDaftar] = useState(null);
  const [error, setError] = useState("");
  const [master, setMaster] = useState(null);
  const [membuka, setMembuka] = useState(null);
  const [struk, setStruk] = useState(null);

  const muat = async () => {
    setError("");
    setDaftar(null);
    try {
      const [rows, m] = await Promise.all([muatRiwayat({ session, sejak: awalHariIni() }), master ? master : muatMaster()]);
      setMaster(m);
      setDaftar(rows);
    } catch (e) {
      setError(e.message || "Gagal memuat riwayat");
      setDaftar([]);
    }
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buka = async (row) => {
    setMembuka(row[SKEMA.trx.id]);
    setError("");
    try {
      setStruk(await muatStrukDariDb(row, identitasStruk(master)));
    } catch (e) {
      setError(e.message || "Gagal membuka struk");
    } finally {
      setMembuka(null);
    }
  };

  const T = SKEMA.trx;
  const jumlahTotal = (daftar || []).length;
  const semuaKasir = session?.role !== "kasir";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
        <div
          className="w-full sm:max-w-md bg-slate-900 border border-slate-800 sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800">
            <div>
              <div className="font-bold">Riwayat Hari Ini</div>
              <div className="text-xs text-slate-500">
                {daftar ? `${jumlahTotal} transaksi` : "Memuat…"}
                {semuaKasir ? " · semua kasir" : ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={muat} className="p-2 text-slate-500 hover:text-slate-200" title="Muat ulang">
                <RefreshCw size={16} />
              </button>
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-5 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {!daftar ? (
              <div className="py-10 flex justify-center text-slate-500">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : daftar.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">Belum ada transaksi hari ini.</div>
            ) : (
              <ul className="space-y-1.5">
                {daftar.map((r) => (
                  <li key={r[T.id]}>
                    <button
                      onClick={() => buka(r)}
                      disabled={membuka !== null}
                      className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl border border-slate-800 hover:border-amber-500 disabled:opacity-60"
                    >
                      <Receipt size={16} className="text-slate-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-mono truncate">{r[T.nomor]}</div>
                        <div className="text-[11px] text-slate-500">
                          {tglJamId(r[T.waktu])}
                          {semuaKasir && r[T.kasirNama] ? ` · ${r[T.kasirNama]}` : ""}
                        </div>
                      </div>
                      {membuka === r[T.id] ? (
                        <Loader2 size={15} className="animate-spin text-amber-400" />
                      ) : (
                        <div className="text-sm font-semibold text-amber-400">
                          {fmtRp(Number(r[T.total]) || (Number(r[T.bayar]) || 0) - (Number(r[T.kembalian]) || 0))}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {struk && <ModalStruk struk={struk} onClose={() => setStruk(null)} />}
    </>
  );
}
