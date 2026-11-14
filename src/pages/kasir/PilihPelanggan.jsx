import { useMemo, useState } from "react";
import { X, Search, Loader2, Users, Check } from "lucide-react";

// =========================================================
// KASIR (mode Master Barang / grosir) — PILIH PELANGGAN
// Pelanggan berasal dari menu Grosir (tabel grosir_pelanggan). Kategori pelanggan (grosir / tengah / ecer)
// menentukan harga barang di kasir, sama seperti Buat Pesanan di menu Grosir.
// Transaksi yang punya pelanggan masuk ke Pesanan Grosir saat tutup kasir.
// =========================================================

export const LABEL_KATEGORI_PELANGGAN = { grosir: "Grosir", tengah: "Tengah", ecer: "Ecer" };

// Kunci kolom harga di sku_master untuk pelanggan ini. Belum dipilih / kategori kosong = grosir (sama seperti menu Grosir).
export const kunciHargaPelanggan = (p) => (p?.kategori === "tengah" || p?.kategori === "ecer" ? p.kategori : "grosir");

export const warnaKategori = (k) =>
  k === "ecer" ? "bg-sky-500/15 text-sky-300" : k === "tengah" ? "bg-violet-500/15 text-violet-300" : "bg-amber-500/15 text-amber-300";

export default function PilihPelanggan({ daftar, terpilih, memuat = false, onPilih, onClose }) {
  const [q, setQ] = useState("");
  const hasil = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = daftar || [];
    if (!kata.length) return rows.slice(0, 60);
    return rows
      .filter((p) => {
        const j = `${p.nama || ""} ${p.kode || ""} ${p.wa || ""}`.toLowerCase();
        return kata.every((k) => j.includes(k));
      })
      .slice(0, 60);
  }, [daftar, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 font-bold">
            <Users size={17} className="text-amber-400" /> Pilih Pelanggan
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / kode pelanggan"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Harga barang mengikuti kategori pelanggan. Pelanggan baru ditambahkan lewat menu Grosir.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {memuat && !(daftar || []).length ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Memuat pelanggan…
            </div>
          ) : hasil.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">{(daftar || []).length ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan di menu Grosir."}</div>
          ) : (
            <ul className="space-y-1">
              {hasil.map((p) => {
                const aktif = terpilih?.id === p.id;
                const kat = kunciHargaPelanggan(p);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onPilih({ id: p.id, nama: p.nama, kategori: kat })}
                      className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl border transition-colors ${
                        aktif ? "border-amber-500/60 bg-amber-500/10" : "border-transparent hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.nama}</div>
                        <div className="text-[11px] text-slate-500 truncate">{[p.kode, p.wa].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${warnaKategori(kat)}`}>{LABEL_KATEGORI_PELANGGAN[kat]}</span>
                      {aktif && <Check size={15} className="text-amber-400 flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
