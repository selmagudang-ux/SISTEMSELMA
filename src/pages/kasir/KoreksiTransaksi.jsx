import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, AlertCircle, CheckCircle2, Minus, Plus, Banknote, Landmark, QrCode } from "lucide-react";
import { fmtRp } from "../../lib/api";
import {
  SKEMA,
  buatKunci,
  muatMaster,
  muatRincianKoreksi,
  siapkanKeuanganKeluar,
  voidTransaksi,
  hapusTransaksi,
  hapusShift,
  muatTransaksiShift,
  returTransaksi,
  perkiraanNilaiRetur,
  pesanErrorKasir,
} from "./kasirApi";

// =========================================================
// KASIR — VOID & RETUR (fase 5)
//  - ModalVoid : batalkan SELURUH transaksi (stok kembali, uang dikeluarkan lagi di Keuangan).
//                Hanya selama shift transaksi itu masih buka & belum ada retur.
//  - ModalRetur: kembalikan sebagian/seluruh barang. Stok bertambah, uang keluar lewat
//                metode yang dipilih dan dicatat di shift yang sedang buka.
// Angka final selalu dihitung & diperiksa database; layar hanya menampilkan perkiraan.
// =========================================================

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-500";

function Kerangka({ judul, subjudul, onClose, bebasTutup, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={() => bebasTutup && onClose()}>
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="min-w-0">
            <div className="font-bold">{judul}</div>
            {subjudul && <div className="text-xs text-slate-500 font-mono truncate">{subjudul}</div>}
          </div>
          <button onClick={onClose} disabled={!bebasTutup} className="p-2 text-slate-500 hover:text-slate-200 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function KotakError({ pesan }) {
  if (!pesan) return null;
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{pesan}</span>
    </div>
  );
}

function Memuat() {
  return (
    <div className="py-8 flex justify-center text-slate-500">
      <Loader2 className="animate-spin" size={20} />
    </div>
  );
}

// Muat rincian transaksi + master (untuk rekening keuangan) sekali di awal.
function useRincian(row) {
  const [data, setData] = useState(null);
  const [master, setMaster] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let batal = false;
    Promise.all([muatRincianKoreksi(row), muatMaster()])
      .then(([r, m]) => {
        if (batal) return;
        setData(r);
        setMaster(m);
      })
      .catch((e) => !batal && setError(e.message || "Gagal memuat transaksi"));
    return () => {
      batal = true;
    };
  }, [row]);
  return { data, master, error };
}

const T = SKEMA.trx;

// ---------------------------------------------------------
export function ModalVoid({ row, session, onSelesai, onMuatUlang, onClose }) {
  const { data, master, error: errMuat } = useRincian(row);
  const [alasan, setAlasan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);

  const void_ = async () => {
    if (!alasan.trim() || saving || !data || !master) return;
    setSaving(true);
    setError("");
    try {
      const keuangan = await siapkanKeuanganKeluar(
        master,
        data.pembayaran.map((p) => p.metode)
      );
      setHasil(await voidTransaksi({ session, row, alasan, keuangan }));
    } catch (e) {
      const { pesan, perluMuatUlang } = pesanErrorKasir(e, "koreksi");
      setError(pesan);
      if (perluMuatUlang) onMuatUlang?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={hasil ? "Transaksi di-void" : "Void Transaksi"} subjudul={row[T.nomor]} onClose={hasil ? onSelesai : onClose} bebasTutup={!saving}>
      {hasil ? (
        <>
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-2" />
            <div className="font-semibold">{fmtRp(hasil.total)} dikembalikan ke pembeli</div>
            <p className="text-xs text-slate-400 mt-1">Stok barang sudah kembali dan pengeluarannya tercatat di Keuangan.</p>
          </div>
          <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl">
            Selesai
          </button>
        </>
      ) : (
        <>
          {!data && !errMuat && <Memuat />}
          <KotakError pesan={errMuat} />
          {data && (
            <>
              <div className="rounded-xl border border-slate-800 p-3 text-sm space-y-1">
                {data.items.map((it) => (
                  <div key={it.sku} className="flex justify-between gap-3">
                    <span className="text-slate-300 truncate">
                      {it.qty} × {it.nama_produk || it.sku}
                    </span>
                    <span className="text-slate-400 flex-shrink-0">{fmtRp(it.subtotal)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-800 pt-1.5 flex justify-between font-semibold">
                  <span>Total dikembalikan</span>
                  <span className="text-amber-400">{fmtRp(row[T.total])}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Dibayar via {data.pembayaran.map((p) => `${p.metode} ${fmtRp(p.jumlah)}`).join(" + ")}; pengembalian lewat rekening yang sama.
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Alasan void (wajib)</label>
                <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} placeholder="Mis. salah input barang" className={inputCls} />
              </div>

              <KotakError pesan={error} />

              <button
                onClick={void_}
                disabled={!alasan.trim() || saving || !master}
                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl"
              >
                {saving && <Loader2 size={16} className="animate-spin" />} Void Transaksi
              </button>
            </>
          )}
        </>
      )}
    </Kerangka>
  );
}

// ---------------------------------------------------------
const METODE = [
  { key: "Cash", label: "Cash", icon: Banknote },
  { key: "Transfer", label: "Transfer", icon: Landmark },
  { key: "QRIS", label: "QRIS", icon: QrCode },
];

export function ModalRetur({ row, session, onSelesai, onMuatUlang, onClose }) {
  const { data, master, error: errMuat } = useRincian(row);
  const [qty, setQty] = useState({}); // sku -> jumlah yang diretur
  const [alasan, setAlasan] = useState("");
  const [metode, setMetode] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);
  const kunci = useRef(buatKunci()); // cegah retur tersimpan dobel kalau tombol ditekan ulang

  const daftar = useMemo(() => (data?.items || []).map((it) => ({ ...it, sisa: it.qty - (it.qty_retur || 0) })), [data]);
  const dipilih = daftar.filter((it) => (qty[it.sku] || 0) > 0);
  const perkiraan = dipilih.reduce((a, it) => a + perkiraanNilaiRetur(row, it, qty[it.sku]), 0);

  const ubah = (it, n) => setQty((q) => ({ ...q, [it.sku]: Math.max(0, Math.min(it.sisa, n)) }));
  const semua = () => setQty(Object.fromEntries(daftar.map((it) => [it.sku, it.sisa])));

  const retur = async () => {
    if (!dipilih.length || !alasan.trim() || saving || !master) return;
    setSaving(true);
    setError("");
    try {
      const keuangan = await siapkanKeuanganKeluar(master, [metode]);
      setHasil(
        await returTransaksi({
          session,
          row,
          items: dipilih.map((it) => ({ sku: it.sku, qty: qty[it.sku] })),
          alasan,
          metode,
          keuangan,
          kunci: kunci.current,
        })
      );
    } catch (e) {
      const { pesan, perluMuatUlang } = pesanErrorKasir(e, "koreksi");
      setError(pesan);
      if (perluMuatUlang) onMuatUlang?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={hasil ? "Retur berhasil" : "Retur Barang"} subjudul={row[T.nomor]} onClose={hasil ? onSelesai : onClose} bebasTutup={!saving}>
      {hasil ? (
        <>
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-2" />
            <div className="text-xs text-slate-500 font-mono">{hasil.nomor}</div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">{fmtRp(hasil.total)}</div>
            <p className="text-xs text-slate-400 mt-1">
              Kembalikan uang ke pembeli lewat {metode}. Stok barang sudah bertambah{hasil.penuh ? "; semua barang transaksi ini sudah diretur" : ""}.
            </p>
          </div>
          <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl">
            Selesai
          </button>
        </>
      ) : (
        <>
          {!data && !errMuat && <Memuat />}
          <KotakError pesan={errMuat} />
          {data && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400">Pilih barang yang diretur</div>
                <button onClick={semua} className="text-xs text-amber-400 hover:text-amber-300">
                  Retur semua
                </button>
              </div>

              <ul className="space-y-1.5">
                {daftar.map((it) => (
                  <li key={it.sku} className={`flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2 ${it.sisa === 0 ? "opacity-40" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{it.nama_produk || it.sku}</div>
                      <div className="text-[11px] text-slate-500">
                        {fmtRp(it.harga_satuan)} · beli {it.qty}
                        {it.qty_retur > 0 ? ` · sudah retur ${it.qty_retur}` : ""}
                      </div>
                    </div>
                    {it.sisa > 0 ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => ubah(it, (qty[it.sku] || 0) - 1)} className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center">
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{qty[it.sku] || 0}</span>
                        <button onClick={() => ubah(it, (qty[it.sku] || 0) + 1)} className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center">
                          <Plus size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">habis diretur</span>
                    )}
                  </li>
                ))}
              </ul>

              <div>
                <div className="text-xs text-slate-400 mb-1">Uang dikembalikan lewat</div>
                <div className="grid grid-cols-3 gap-2">
                  {METODE.map(({ key, label, icon: Ikon }) => (
                    <button
                      key={key}
                      onClick={() => setMetode(key)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium ${
                        metode === key ? "bg-amber-500 text-slate-950 border-amber-500" : "border-slate-700 text-slate-300"
                      }`}
                    >
                      <Ikon size={13} /> {label}
                    </button>
                  ))}
                </div>
                {metode === "Cash" && <div className="text-[11px] text-slate-500 mt-1">Retur cash mengurangi kas laci pada shift yang sedang buka.</div>}
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Alasan retur (wajib)</label>
                <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} placeholder="Mis. barang cacat / salah ukuran" className={inputCls} />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5">
                <span className="text-sm text-slate-400">Perkiraan pengembalian</span>
                <span className="text-lg font-bold text-amber-400">{fmtRp(perkiraan)}</span>
              </div>
              <p className="text-[11px] text-slate-500 -mt-2">Sudah memperhitungkan diskon. Angka final dihitung saat disimpan.</p>

              <KotakError pesan={error} />

              <button
                onClick={retur}
                disabled={!dipilih.length || !alasan.trim() || saving || !master}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold py-3.5 rounded-2xl"
              >
                {saving && <Loader2 size={16} className="animate-spin" />} Proses Retur
              </button>
            </>
          )}
        </>
      )}
    </Kerangka>
  );
}

// ---------------------------------------------------------
// Hapus SHIFT permanen (khusus superappa). Transaksi di dalam shift ikut dihapus (stok kembali, Keuangan disesuaikan).
export function ModalHapusShift({ shift, onSelesai, onClose }) {
  const [konfirmasi, setKonfirmasi] = useState("");
  const [daftar, setDaftar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progres, setProgres] = useState(null);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);
  const siap = konfirmasi.trim().toUpperCase() === "HAPUS";
  const tutup = shift?.status === "tutup";

  useEffect(() => {
    let batal = false;
    muatTransaksiShift(shift.id)
      .then((r) => !batal && setDaftar(r))
      .catch((e) => !batal && setError(e?.message || "Gagal memuat transaksi shift"));
    return () => {
      batal = true;
    };
  }, [shift.id]);

  const hapus = async () => {
    if (!siap || saving || !tutup || !daftar) return;
    setSaving(true);
    setError("");
    try {
      setHasil(await hapusShift({ shift, onProgres: (a, b) => setProgres([a, b]) }));
    } catch (e) {
      const sudah = e?.sudahDihapus || 0;
      const pesan = pesanErrorKasir(e, "koreksi").pesan;
      setError(`${pesan}${sudah ? ` (${sudah} transaksi sudah terhapus sebelum berhenti — tekan Hapus lagi untuk melanjutkan)` : ""}`);
      muatTransaksiShift(shift.id).then(setDaftar).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const jumlah = daftar?.length ?? 0;
  const total = (daftar || []).filter((r) => (r[SKEMA.trx.status] || "selesai") !== "void").reduce((a, r) => a + (Number(r[SKEMA.trx.total]) || 0), 0);

  return (
    <Kerangka judul={hasil ? "Shift dihapus" : "Hapus Shift"} subjudul={shift.kasir_nama} onClose={hasil ? onSelesai : onClose} bebasTutup={!saving}>
      {hasil ? (
        <>
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-2" />
            <div className="font-semibold">Shift sudah dihapus</div>
            <p className="text-xs text-slate-400 mt-1">
              {hasil.transaksiDihapus > 0 ? `${hasil.transaksiDihapus} transaksi di dalamnya ikut dihapus, stok dikembalikan.` : "Shift ini tidak punya transaksi."}
            </p>
          </div>
          <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl">
            Selesai
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Kasir</span><span className="font-semibold">{shift.kasir_nama || "-"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Kas awal</span><span>{fmtRp(Number(shift.kas_awal) || 0)}</span></div>
            <div className="flex justify-between">
              <span className="text-slate-400">Transaksi</span>
              <span>{daftar ? `${jumlah} (${fmtRp(total)})` : "memuat…"}</span>
            </div>
          </div>

          {!tutup ? (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Shift ini masih buka. Tutup kasir dulu, baru bisa dihapus.</span>
            </div>
          ) : (
            <>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                <li>Shift dihapus permanen dari Riwayat dan tidak bisa dikembalikan.</li>
                <li>{jumlah > 0 ? `${jumlah} transaksi di shift ini ikut dihapus: stok dikembalikan dan catatan uangnya di Keuangan dihapus atau dikurangi.` : "Shift ini tidak punya transaksi."}</li>
                <li>Tidak ada catatan yang tersisa tentang penghapusan ini.</li>
              </ul>
              <div>
                <label className="text-sm font-medium text-slate-300 mb-1.5 block">Ketik HAPUS untuk melanjutkan</label>
                <input value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} placeholder="HAPUS" className={inputCls} />
              </div>
            </>
          )}

          <KotakError pesan={error} />

          <button
            onClick={hapus}
            disabled={!siap || saving || !tutup || !daftar}
            className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving && progres ? `Menghapus ${progres[0]}/${progres[1]}…` : "Hapus Shift Permanen"}
          </button>
        </>
      )}
    </Kerangka>
  );
}

// ---------------------------------------------------------
// Hapus permanen: transaksi hilang dari Riwayat & Keuangan, stok kembali, tanpa log.
export function ModalHapus({ row, shiftSudahTutup, onSelesai, onClose }) {
  const [konfirmasi, setKonfirmasi] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);
  const siap = konfirmasi.trim().toUpperCase() === "HAPUS";

  const hapus = async () => {
    if (!siap || saving) return;
    setSaving(true);
    setError("");
    try {
      setHasil(await hapusTransaksi({ row }));
    } catch (e) {
      setError(pesanErrorKasir(e, "koreksi").pesan);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={hasil ? "Transaksi dihapus" : "Hapus Transaksi"} subjudul={row[T.nomor]} onClose={hasil ? onSelesai : onClose} bebasTutup={!saving}>
      {hasil ? (
        <>
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-2" />
            <div className="font-semibold">{hasil.nomor} sudah dihapus</div>
            <p className="text-xs text-slate-400 mt-1">Transaksi hilang dari Riwayat dan Keuangan, dan stok barang sudah dikembalikan.</p>
          </div>
          {Number(hasil.keuangan_tidak_ditemukan) > 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                {hasil.keuangan_tidak_ditemukan} catatan uang di Keuangan tidak ditemukan, kemungkinan dicatat dengan cara lama. Periksa Keuangan dan hapus manual kalau masih ada.
              </span>
            </div>
          )}
          <button onClick={onSelesai} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-2xl">
            Selesai
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Nomor</span><span className="font-mono">{row[T.nomor]}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-semibold">{fmtRp(Number(row[T.total]) || 0)}</span></div>
          </div>

          <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
            <li>Transaksi dihapus permanen dari Riwayat dan tidak bisa dikembalikan.</li>
            <li>Catatan uangnya di Keuangan ikut dihapus atau dikurangi.</li>
            <li>Stok barang dikembalikan.</li>
            <li>Tidak ada catatan yang tersisa tentang penghapusan ini.</li>
          </ul>

          {shiftSudahTutup && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Shift transaksi ini sudah ditutup. Kas seharusnya dan selisih shift itu ikut dihitung ulang.</span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Ketik HAPUS untuk melanjutkan</label>
            <input value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} placeholder="HAPUS" className={inputCls} />
          </div>

          <KotakError pesan={error} />

          <button
            onClick={hapus}
            disabled={!siap || saving}
            className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl"
          >
            {saving && <Loader2 size={16} className="animate-spin" />} Hapus Permanen
          </button>
        </>
      )}
    </Kerangka>
  );
}