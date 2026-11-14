import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, CloudDownload, Trash2, ShoppingCart } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { muatKeranjangTersimpan, hapusKeranjangTersimpan } from "./kasirKeranjang";

// =========================================================
// KASIR — daftar keranjang tersimpan. "Ambil" memuat keranjang ke layar kasir ini (onAmbil dari LayarKasir,
// yang menyamakan harga/stok/promo terbaru), lalu salinan di database dihapus supaya tidak terambil dua kali.
// =========================================================

const tglJam = (v) => new Date(v).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function KeranjangTersimpan({ session, sumber = "toko", onAmbil, onClose }) {
  const semuaKasir = true;
  const [daftar, setDaftar] = useState(null);
  const [error, setError] = useState("");
  const [sibuk, setSibuk] = useState(null); // id yang sedang diproses

  const muat = async () => {
    setError("");
    try {
      setDaftar(await muatKeranjangTersimpan(session, sumber));
    } catch (e) {
      setDaftar([]);
      setError(e?.message || "Gagal memuat keranjang tersimpan");
    }
  };
  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ambil = async (r) => {
    if (sibuk) return;
    setSibuk(r.id);
    setError("");
    try {
      const ok = await onAmbil(r); // false = dibatalkan (mis. kasir menolak mengganti keranjang yang sedang berisi)
      if (!ok) return;
      try {
        await hapusKeranjangTersimpan(r.id);
      } catch {
        /* keranjang sudah termuat; salinan di database gagal dihapus — bisa dihapus manual dari daftar ini */
      }
      onClose();
    } catch (e) {
      setError(e?.message || "Gagal mengambil keranjang");
    } finally {
      setSibuk(null);
    }
  };

  const hapus = async (r) => {
    if (sibuk) return;
    if (!window.confirm("Hapus keranjang tersimpan ini?")) return;
    setSibuk(r.id);
    setError("");
    try {
      await hapusKeranjangTersimpan(r.id);
      setDaftar((d) => (d || []).filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e?.message || "Gagal menghapus");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && !sibuk && onClose()}>
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <div className="font-bold">Keranjang Tersimpan</div>
            <div className="text-xs text-slate-500">Dari semua petugas di toko ini</div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          {!daftar ? (
            <div className="py-10 flex justify-center text-slate-500">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : daftar.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart size={30} className="mx-auto mb-2 text-slate-700" />
              <div className="text-sm text-slate-400">Belum ada keranjang tersimpan</div>
              <div className="text-xs text-slate-500 mt-1">Petugas mengisi keranjang di HP lalu menekan "Simpan"; keranjangnya muncul di sini.</div>
            </div>
          ) : (
            daftar.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{r.nama || "Keranjang tanpa nama"}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {tglJam(r.created_at)}
                      {semuaKasir && r.kasir_nama ? ` · ${r.kasir_nama}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs flex-shrink-0">
                    <div className="font-semibold text-slate-200">{r.jumlah_pcs} pcs</div>
                    <div className="text-slate-500">≈ {fmtRp(r.total_perkiraan)}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
                  {(Array.isArray(r.items) ? r.items : []).map((it) => `${it.nama || it.sku} ×${it.qty}`).join(", ")}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => ambil(r)}
                    disabled={!!sibuk}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold py-2.5 rounded-xl"
                  >
                    {sibuk === r.id ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />} Ambil
                  </button>
                  <button
                    onClick={() => hapus(r)}
                    disabled={!!sibuk}
                    title="Hapus keranjang tersimpan"
                    className="px-3 border border-slate-700 hover:border-red-500/50 hover:text-red-300 disabled:opacity-40 text-slate-400 rounded-xl"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
