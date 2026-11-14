import { useCallback, useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Trash2, AlertTriangle, X, Loader2, CheckCircle2 } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { tglJamId } from "./kasirStruk";
import { useStatusKasir, kirimAntrian, cobaLagi, hapusAntrian, daftarAntrian, daftarSelesai, periksaKoneksi } from "./kasirOffline";

// =========================================================
// KASIR — INDIKATOR & PANEL ANTRIAN OFFLINE
//   ChipKoneksi  : titik Online/Offline di header kasir (klik = buka panel antrian)
//   BannerOffline: pita di bawah header saat offline / ada transaksi belum terkirim / perlu tindakan
//   PanelAntrian : daftar transaksi yang belum terkirim, kirim sekarang, coba lagi, hapus
// =========================================================

export function ChipKoneksi({ onBuka }) {
  const s = useStatusKasir();
  const belum = s.menunggu + s.perluTindakan;
  const warna = s.offline ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  return (
    <button
      onClick={onBuka}
      title={s.offline ? "Tidak terhubung ke server — penjualan disimpan di perangkat ini" : "Terhubung ke server"}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${warna}`}
    >
      {s.offline ? <WifiOff size={13} /> : <Wifi size={13} />}
      {s.offline ? "Offline" : "Online"}
      {belum > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-slate-950 font-bold tabular-nums">{belum}</span>}
    </button>
  );
}

export function BannerOffline({ onBuka }) {
  const s = useStatusKasir();
  const belum = s.menunggu + s.perluTindakan;
  if (!s.offline && belum === 0 && s.penyimpananAman) return null;

  let isi;
  let kelas = "bg-amber-500/10 border-amber-500/30 text-amber-200";
  if (!s.penyimpananAman) {
    kelas = "bg-red-500/10 border-red-500/30 text-red-300";
    isi = "Penyimpanan perangkat tidak bisa dipakai (mode privat / diblokir). Transaksi offline hanya tersimpan sementara di memori dan HILANG kalau halaman ditutup. Jangan tutup halaman ini sebelum terkirim.";
  } else if (s.perluTindakan > 0) {
    kelas = "bg-red-500/10 border-red-500/30 text-red-300";
    isi = `${s.perluTindakan} transaksi ditolak server saat dikirim (stok/harga/shift berubah). Buka daftar antrian untuk melihat penyebabnya.`;
  } else if (s.offline) {
    isi = `Mode offline — penjualan tetap bisa diproses dan disimpan di perangkat ini, lalu dikirim otomatis saat internet kembali.${belum ? ` Menunggu kirim: ${belum} transaksi.` : ""}`;
  } else if (s.menyinkron) {
    isi = `Mengirim ${belum} transaksi yang tertunda…`;
  } else {
    isi = `${belum} transaksi belum terkirim ke server — akan dicoba otomatis.`;
  }
  return (
    <div className={`mx-4 mt-3 flex items-center gap-2 border text-xs px-3 py-2 rounded-lg ${kelas}`}>
      {s.menyinkron ? <Loader2 size={14} className="flex-shrink-0 animate-spin" /> : <AlertTriangle size={14} className="flex-shrink-0" />}
      <span className="flex-1">{isi}</span>
      <button onClick={onBuka} className="font-semibold underline underline-offset-2 whitespace-nowrap">
        Lihat antrian
      </button>
    </div>
  );
}

export function PanelAntrian({ onClose }) {
  const s = useStatusKasir();
  const [antri, setAntri] = useState([]);
  const [selesai, setSelesai] = useState([]);
  const [sibuk, setSibuk] = useState("");

  const muat = useCallback(async () => {
    setAntri(await daftarAntrian());
    setSelesai(await daftarSelesai());
  }, []);
  // Daftar ikut diperbarui tiap status berubah (kirim berhasil, antrian bertambah).
  useEffect(() => {
    muat();
  }, [muat, s.menunggu, s.perluTindakan, s.menyinkron]);

  const kirimSekarang = async () => {
    setSibuk("kirim");
    try {
      await periksaKoneksi();
      await kirimAntrian({ paksa: true });
    } finally {
      setSibuk("");
      muat();
    }
  };
  const ulang = async (kunci) => {
    setSibuk(kunci);
    try {
      await cobaLagi(kunci);
    } finally {
      setSibuk("");
      muat();
    }
  };
  const hapus = async (e) => {
    const ok = window.confirm(
      `Hapus transaksi ${e.nomorSementara} (${fmtRp(e.ringkas?.total || 0)}) dari antrian?\n\nTransaksi ini TIDAK akan masuk ke sistem. Pastikan Anda sudah mencatatnya manual atau memang ingin dibatalkan. Tindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    await hapusAntrian(e.kunci);
    muat();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-xl bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <div className="font-bold text-lg flex items-center gap-2">
              {s.offline ? <WifiOff size={17} className="text-amber-300" /> : <Wifi size={17} className="text-emerald-300" />}
              Antrian transaksi
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{s.offline ? "Offline — belum terhubung ke server" : "Online — terhubung ke server"}</div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <button
            onClick={kirimSekarang}
            disabled={!!sibuk || s.menyinkron}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded-2xl transition-colors"
          >
            <RefreshCw size={15} className={sibuk === "kirim" || s.menyinkron ? "animate-spin" : ""} /> Cek koneksi &amp; kirim sekarang
          </button>

          {antri.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-6">
              <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400" />
              Semua transaksi sudah terkirim ke server.
            </div>
          ) : (
            <div className="space-y-2">
              {antri.map((e) => {
                const tolak = e.status === "perlu_tindakan";
                return (
                  <div key={e.kunci} className={`rounded-2xl border px-4 py-3 ${tolak ? "border-red-500/40 bg-red-500/5" : "border-slate-800 bg-slate-950/50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-slate-200">{e.nomorSementara}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {tglJamId(e.waktu)} · {e.ringkas?.jumlahItem ?? "?"} item · {(e.ringkas?.metode || []).join(" + ") || "—"}
                        </div>
                      </div>
                      <div className="font-bold text-amber-300 tabular-nums">{fmtRp(e.ringkas?.total || 0)}</div>
                    </div>
                    <div className={`text-xs mt-2 ${tolak ? "text-red-300" : "text-slate-400"}`}>
                      {tolak ? `Ditolak server: ${e.pesan}` : e.pesan || "Menunggu dikirim"}
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        onClick={() => ulang(e.kunci)}
                        disabled={!!sibuk || s.menyinkron}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 hover:border-amber-500 text-slate-200 disabled:opacity-50"
                      >
                        {sibuk === e.kunci ? "Mengirim…" : "Coba kirim lagi"}
                      </button>
                      <button onClick={() => hapus(e)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:text-red-300">
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selesai.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 mb-2">Sudah terkirim (nomor struk sementara → nomor resmi)</div>
              <div className="rounded-2xl border border-slate-800 divide-y divide-slate-800">
                {selesai.slice(0, 15).map((r) => (
                  <div key={r.kunci} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                    <span className="font-mono text-slate-400 truncate">
                      {r.nomorSementara} → <span className="text-slate-200">{r.nomorResmi || "—"}</span>
                    </span>
                    <span className="tabular-nums text-slate-400">{fmtRp(r.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Selama offline: login, buka/tutup kasir, void, retur, dan Riwayat belum bisa dipakai. Tutup Kasir baru bisa setelah semua transaksi terkirim. Antrian tersimpan di perangkat ini dan tidak hilang walau halaman
            ditutup atau komputer dimatikan.
          </p>
        </div>
      </div>
    </div>
  );
}
