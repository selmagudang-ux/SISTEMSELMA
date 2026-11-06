import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, CheckCircle2, Banknote, Landmark, QrCode, Split, Receipt } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { InputRupiah } from "../../components/ui";
import { hitungPembayaran, saranUang, hitungItem } from "./kasirHitung";
import { muatMaster, siapkanKeuangan, simpanTransaksiKasir, pesanErrorKasir } from "./kasirApi";
import { susunStruk, identitasStruk } from "./kasirStruk";
import ModalStruk from "./StrukKasir";
import { bukaLaciKalauDesktop } from "./kasirLaci";

// =========================================================
// KASIR — PEMBAYARAN (fase 3)
// Cash (uang diterima -> kembalian), Transfer, QRIS, atau Split (gabungan).
// Transfer & QRIS dianggap pas. Penyimpanan lewat satu fungsi database
// (kasir_simpan_transaksi): stok, rak, riwayat stok & Keuangan terbarui sekaligus
// atau batal semua. `kunci` mencegah transaksi tersimpan dobel kalau Bayar ditekan ulang.
// Fase 4: setelah bayar, data struk DIFOTO (snapshot) sebelum keranjang dikosongkan oleh
// LayarKasir, lalu bisa dicetak / PDF / WhatsApp lewat StrukKasir.jsx.
// =========================================================

const MODE = [
  { key: "Cash", label: "Cash", icon: Banknote },
  { key: "Transfer", label: "Transfer", icon: Landmark },
  { key: "QRIS", label: "QRIS", icon: QrCode },
  { key: "Split", label: "Split", icon: Split },
];

const inputCls =
  "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-base outline-none focus:border-amber-500";

export default function ModalBayar({ total, items, diskonTransaksi, session, kunci, onSukses, onMuatUlang, onClose }) {
  const [master, setMaster] = useState(null);
  const [errMaster, setErrMaster] = useState("");
  const [mode, setMode] = useState("Cash");
  const [cashDiterima, setCashDiterima] = useState("");
  const [transfer, setTransfer] = useState("");
  const [qris, setQris] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasil, setHasil] = useState(null);
  const [struk, setStruk] = useState(null);
  const [strukBuka, setStrukBuka] = useState(false);

  useEffect(() => {
    let batal = false;
    muatMaster()
      .then((m) => !batal && setMaster(m))
      .catch((e) => !batal && setErrMaster(e.message || "Gagal memuat data rekening"));
    return () => {
      batal = true;
    };
  }, []);

  const nilai =
    mode === "Cash"
      ? { cashDiterima }
      : mode === "Transfer"
      ? { transfer: total }
      : mode === "QRIS"
      ? { qris: total }
      : { cashDiterima, transfer, qris };
  const hb = hitungPembayaran(total, nilai);

  const bayar = async () => {
    if (!hb.valid || saving || !master) return;
    setSaving(true);
    setError("");
    try {
      const keuangan = await siapkanKeuangan(
        master,
        hb.pembayaran.map((p) => p.metode)
      );
      const res = await simpanTransaksiKasir({ session, items, diskonTransaksi, hitungBayar: hb, keuangan, catatan, kunci });
      // Snapshot struk SEBELUM onSukses: setelah itu LayarKasir mengosongkan keranjang,
      // sehingga prop `items` di sini ikut menjadi kosong.
      setStruk(
        susunStruk({
          nomor: res.nomor,
          waktu: res.waktu,
          kasir: session?.nama || session?.username,
          items: items.map((it) => ({ sku: it.sku, nama: it.nama, qty: it.qty, harga: it.harga, diskon: hitungItem(it).diskon })),
          diskonTransaksi,
          pembayaran: hb.pembayaran,
          bayar: hb.bayar,
          kembalian: hb.kembalian,
          catatan,
          identitas: identitasStruk(master),
        })
      );
      setHasil(res);
      if (hb.pembayaran.some((p) => p.metode === "Cash")) bukaLaciKalauDesktop();
      onSukses?.(res);
    } catch (e) {
      const { pesan, perluMuatUlang } = pesanErrorKasir(e);
      setError(pesan);
      if (perluMuatUlang) onMuatUlang?.();
    } finally {
      setSaving(false);
    }
  };

  const tutup = () => {
    if (!saving) onClose();
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={tutup}>
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {hasil ? (
          <div className="p-6 text-center">
            <CheckCircle2 size={44} className="mx-auto text-emerald-400 mb-2" />
            <div className="font-bold text-lg">{hasil.duplikat ? "Transaksi sudah tersimpan" : "Pembayaran berhasil"}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{hasil.nomor}</div>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-semibold">{fmtRp(hasil.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Dibayar</span><span>{fmtRp(hasil.bayar)}</span></div>
            </div>
            {Number(hasil.kembalian) > 0 && (
              <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl py-3">
                <div className="text-xs text-emerald-300">KEMBALIAN</div>
                <div className="text-3xl font-bold text-emerald-300">{fmtRp(hasil.kembalian)}</div>
              </div>
            )}
            {hasil.duplikat && (
              <p className="mt-3 text-xs text-slate-400">Transaksi ini sudah pernah disimpan sebelumnya, jadi tidak disimpan dua kali.</p>
            )}
            {struk && (
              <button
                onClick={() => setStrukBuka(true)}
                className="mt-5 w-full flex items-center justify-center gap-2 border border-slate-700 hover:border-amber-500 text-slate-200 font-medium py-3 rounded-xl"
              >
                <Receipt size={16} /> Struk — Cetak / WhatsApp / PDF
              </button>
            )}
            <button onClick={onClose} className="mt-2.5 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3 rounded-xl">
              Transaksi Baru
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-500">Total bayar</div>
                <div className="text-2xl font-bold text-amber-400">{fmtRp(total)}</div>
              </div>
              <button onClick={tutup} disabled={saving} className="p-2 text-slate-500 hover:text-slate-200 disabled:opacity-40">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-1.5">
                {MODE.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    disabled={saving}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium ${
                      mode === key ? "bg-amber-500 border-amber-500 text-slate-950" : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>

              {mode === "Split" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="text-xs text-slate-400 mb-1">Transfer</div>
                    <InputRupiah value={transfer} onChange={setTransfer} className={inputCls} placeholder="0" />
                  </label>
                  <label className="block">
                    <div className="text-xs text-slate-400 mb-1">QRIS</div>
                    <InputRupiah value={qris} onChange={setQris} className={inputCls} placeholder="0" />
                  </label>
                </div>
              )}

              {(mode === "Cash" || mode === "Split") && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Uang diterima (Cash)</span>
                    {mode === "Split" && <span>Sisa Cash: {fmtRp(hb.cashPerlu)}</span>}
                  </div>
                  <InputRupiah value={cashDiterima} onChange={setCashDiterima} className={inputCls} placeholder="0" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {saranUang(mode === "Split" ? hb.cashPerlu : total).map((n, i) => (
                      <button
                        key={n}
                        onClick={() => setCashDiterima(n)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-500"
                      >
                        {i === 0 ? "Uang pas" : fmtRp(n)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "Transfer" && <p className="text-sm text-slate-400">Pelanggan transfer {fmtRp(total)}. Pastikan dana sudah masuk sebelum konfirmasi.</p>}
              {mode === "QRIS" && <p className="text-sm text-slate-400">Pelanggan bayar QRIS {fmtRp(total)}. Pastikan pembayaran sudah berhasil sebelum konfirmasi.</p>}

              {hb.valid && hb.kembalian > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
                  <span className="text-sm text-emerald-300">Kembalian</span>
                  <span className="text-xl font-bold text-emerald-300">{fmtRp(hb.kembalian)}</span>
                </div>
              )}
              {!hb.valid && hb.pesan && (mode !== "Cash" || cashDiterima !== "") && (
                <div className="text-xs text-amber-400">{hb.kurang > 0 ? `Uang kurang ${fmtRp(hb.kurang)}` : hb.pesan}</div>
              )}

              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Catatan (opsional)"
                maxLength={200}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              />

              {(error || errMaster) && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error || errMaster}</span>
                </div>
              )}

              <button
                onClick={bayar}
                disabled={!hb.valid || saving || !master}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-3 rounded-xl"
              >
                {(saving || (!master && !errMaster)) && <Loader2 size={15} className="animate-spin" />}
                {saving ? "Menyimpan…" : !master && !errMaster ? "Memuat…" : "Konfirmasi Bayar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    {strukBuka && struk && <ModalStruk struk={struk} onClose={() => setStrukBuka(false)} />}
    </>
  );
}
