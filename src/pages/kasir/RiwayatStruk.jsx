import { useEffect, useMemo, useState } from "react";
import { bisa } from "../../lib/constants";
import { X, Loader2, AlertCircle, Receipt, RefreshCw, Undo2, Ban, Trash2, Printer } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { muatMaster, muatRiwayat, muatStrukDariDb, muatDaftarShift, muatIdShiftBuka, muatRincianShift, ringkasShift, nomorShiftHarian, ROLE_BOLEH_VOID, BATAS_RIWAYAT, SKEMA } from "./kasirApi";
import { identitasStruk, tglJamId } from "./kasirStruk";
import ModalStruk from "./StrukKasir";
import { cetakRincianShift } from "./ShiftRincian";
import { ModalVoid, ModalRetur, ModalHapus, ModalHapusShift } from "./KoreksiTransaksi";

// =========================================================
// KASIR — RIWAYAT TRANSAKSI, SHIFT, VOID & RETUR
//  Tab Transaksi: rentang tanggal, filter kasir, ringkasan per kasir, cetak ulang struk,
//                 tombol Retur / Void per transaksi.
//  Tab Shift    : kas awal, kas akhir & selisih tiap shift; tombol Cetak untuk mencetak ulang rincian penjualan shift.
// Role kasir hanya melihat miliknya sendiri; superadmin/superappa melihat semua kasir.
// =========================================================

const T = SKEMA.trx;

const pad = (n) => String(n).padStart(2, "0");
const tglInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const geser = (hari) => {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return tglInput(d);
};
// "2026-11-05" -> awal hari itu (waktu setempat)
const awalHari = (str) => new Date(`${str}T00:00:00`);
const akhirHari = (str) => {
  const d = awalHari(str);
  d.setDate(d.getDate() + 1);
  return d;
};

const statusTrx = (r) => r[T.status] || "selesai";
const num = (v) => Number(v) || 0;

function Badge({ r }) {
  const st = statusTrx(r);
  if (st === "void") return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">Void</span>;
  if (st === "retur") return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300">Retur</span>;
  if (num(r[T.totalRetur]) > 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300">Retur sebagian</span>;
  return null;
}

const warnaSelisih = (n) => (n === 0 ? "text-emerald-400" : n > 0 ? "text-amber-400" : "text-red-400");

export default function RiwayatStruk({ session, shift, onClose }) {
  const semuaKasir = bisa(session?.role, "kasir.lihat_semua");
  const bolehVoidRole = bisa(session?.role, "kasir.void");
  const bolehHapusShift = session?.role === "superappa"; // hapus shift: khusus superappa (bukan lewat pengaturan izin)

  const [tab, setTab] = useState("transaksi");
  const [dari, setDari] = useState(() => tglInput(new Date()));
  const [sampai, setSampai] = useState(() => tglInput(new Date()));
  const [kasirPilih, setKasirPilih] = useState("");

  const [daftar, setDaftar] = useState(null);
  const [daftarShift, setDaftarShift] = useState(null);
  const [shiftBuka, setShiftBuka] = useState(() => new Set());
  const [error, setError] = useState("");
  const [master, setMaster] = useState(null);
  const [membuka, setMembuka] = useState(null);
  const [mencetakShift, setMencetakShift] = useState(null); // id shift yang sedang dicetak
  const [struk, setStruk] = useState(null);
  const [aksi, setAksi] = useState(null); // { tipe: "void" | "retur" | "hapus", row } atau { tipe: "hapusShift", shift }

  const muat = async () => {
    setError("");
    setDaftar(null);
    setDaftarShift(null);
    const rentang = { sejak: awalHari(dari), sampai: akhirHari(sampai) };
    try {
      const [rows, shifts, idBuka, m] = await Promise.all([
        muatRiwayat({ session, ...rentang }),
        muatDaftarShift({ session, ...rentang }),
        muatIdShiftBuka(),
        master ? master : muatMaster(),
      ]);
      setMaster(m);
      setShiftBuka(idBuka);
      setDaftarShift(shifts);
      setDaftar(rows);
    } catch (e) {
      setError(e.message || "Gagal memuat riwayat");
      setDaftar([]);
      setDaftarShift([]);
    }
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const buka = async (row) => {
    setMembuka(row[T.id]);
    setError("");
    try {
      setStruk(await muatStrukDariDb(row, identitasStruk(master)));
    } catch (e) {
      setError(e.message || "Gagal membuka struk");
    } finally {
      setMembuka(null);
    }
  };

  // Cetak ulang rincian penjualan satu shift (sama dengan cetakan di layar Tutup Kasir).
  // Nilai penutupan (kas akhir, selisih, catatan) diambil dari yang tersimpan di shift;
  // rincian transaksi dimuat ulang dari database.
  const cetakUlangShift = async (s) => {
    if (mencetakShift) return;
    setMencetakShift(s.id);
    setError("");
    try {
      const [rincian, nomor, hitungKas] = await Promise.all([
        muatRincianShift(s.id),
        nomorShiftHarian(s),
        ringkasShift(s.id).catch(() => null),
      ]);
      let identitas = { nama: "" };
      try {
        identitas = identitasStruk(master || (await muatMaster()));
      } catch {
        /* kop kosong, tetap cetak */
      }
      const tutup = s.status === "tutup";
      let kas = hitungKas ? { ...hitungKas } : {};
      // Shift sudah ditutup: kalau hitungan ulang tidak lagi cocok dengan kas seharusnya yang tersimpan
      // (mis. ada retur susulan), rincian cash-nya tidak dicetak supaya tidak membingungkan.
      if (tutup && s.kas_sistem != null && kas.penjualan_cash != null) {
        const cocok = num(kas.kas_awal) + num(kas.penjualan_cash) - num(kas.retur_cash) === num(s.kas_sistem);
        if (!cocok) kas = { ...kas, penjualan_cash: undefined, retur_cash: undefined };
      }
      const info = {
        identitas,
        shift: s,
        nomorHarian: nomor.nomor,
        tanggal: nomor.tanggal,
        kasir: s.kasir_nama,
        ringkas: { ...kas, kas_awal: s.kas_awal, kas_sistem: tutup && s.kas_sistem != null ? s.kas_sistem : kas.kas_sistem },
        hasil: tutup
          ? { ...kas, kas_awal: s.kas_awal, kas_sistem: s.kas_sistem ?? kas.kas_sistem, kas_akhir: s.kas_akhir, selisih: s.selisih, catatan: s.catatan_tutup, tutup_at: s.tutup_at }
          : null,
      };
      await cetakRincianShift({ rincian, info });
    } catch (e) {
      setError(e?.message || "Gagal mencetak rincian shift");
    } finally {
      setMencetakShift(null);
    }
  };

  // Kasir yang muncul di rentang ini (untuk filter).
  const daftarKasir = useMemo(() => {
    const m = new Map();
    (daftar || []).forEach((r) => m.set(String(r[T.kasirId] ?? ""), r[T.kasirNama] || "(tanpa nama)"));
    return [...m.entries()];
  }, [daftar]);

  const tampil = useMemo(
    () => (daftar || []).filter((r) => !kasirPilih || String(r[T.kasirId] ?? "") === kasirPilih),
    [daftar, kasirPilih]
  );

  // Ringkasan: total & per kasir. Void tidak dihitung sebagai penjualan.
  const ringkas = useMemo(() => {
    const per = new Map();
    const baru = () => ({ nama: "", n: 0, jual: 0, retur: 0, nVoid: 0, nilaiVoid: 0 });
    const semua = baru();
    for (const r of tampil) {
      const id = String(r[T.kasirId] ?? "");
      if (!per.has(id)) per.set(id, { ...baru(), nama: r[T.kasirNama] || "(tanpa nama)" });
      for (const x of [semua, per.get(id)]) {
        if (statusTrx(r) === "void") {
          x.nVoid += 1;
          x.nilaiVoid += num(r[T.total]);
        } else {
          x.n += 1;
          x.jual += num(r[T.total]);
          x.retur += num(r[T.totalRetur]);
        }
      }
    }
    return { semua, per: [...per.values()].sort((a, b) => b.jual - a.jual) };
  }, [tampil]);

  const bolehVoid = (r) =>
    bolehVoidRole && statusTrx(r) === "selesai" && !(num(r[T.totalRetur]) > 0) && r[T.shiftId] != null && shiftBuka.has(r[T.shiftId]);
  // Transaksi grosir yang punya pelanggan masuk Pesanan Grosir saat tutup kasir, jadi retur dari kasir diblokir (pakai Void / menu Grosir).
  const trxGrosirPelanggan = (r) => r.sumber === "master" && !!r.pelanggan_id;
  const bolehRetur = (r) => !!shift && ["selesai"].includes(statusTrx(r)) && !trxGrosirPelanggan(r);

  const selesaiAksi = () => {
    setAksi(null);
    muat();
  };

  const chip = (aktif) =>
    `px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${aktif ? "bg-amber-500 text-slate-950 border-amber-500" : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"}`;
  const hariIni = tglInput(new Date());

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4" onClick={onClose}>
        <div
          className="w-full sm:max-w-xl bg-slate-900 border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-elevation-3 max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
            <div>
              <div className="font-bold">Riwayat</div>
              <div className="text-xs text-slate-500">
                {tab === "transaksi"
                  ? daftar
                    ? `${tampil.length} transaksi${daftar.length >= BATAS_RIWAYAT ? ` (maks ${BATAS_RIWAYAT} terbaru)` : ""}`
                    : "Memuat…"
                  : daftarShift
                  ? `${daftarShift.length} shift`
                  : "Memuat…"}
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

          {/* tab + periode */}
          <div className="px-5 pt-3 space-y-2.5">
            <div className="flex gap-1.5">
              <button onClick={() => setTab("transaksi")} className={chip(tab === "transaksi")}>
                Transaksi
              </button>
              <button onClick={() => setTab("shift")} className={chip(tab === "shift")}>
                Shift
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => { setDari(hariIni); setSampai(hariIni); }} className={chip(dari === hariIni && sampai === hariIni)}>
                Hari ini
              </button>
              <button onClick={() => { setDari(geser(-1)); setSampai(geser(-1)); }} className={chip(dari === geser(-1) && sampai === geser(-1))}>
                Kemarin
              </button>
              <button onClick={() => { setDari(geser(-6)); setSampai(hariIni); }} className={chip(dari === geser(-6) && sampai === hariIni)}>
                7 hari
              </button>
              <input
                type="date"
                value={dari}
                max={sampai}
                onChange={(e) => e.target.value && setDari(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500"
              />
              <span className="text-slate-600 text-xs">–</span>
              <input
                type="date"
                value={sampai}
                min={dari}
                onChange={(e) => e.target.value && setSampai(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-500"
              />
            </div>
            {tab === "transaksi" && semuaKasir && daftarKasir.length > 1 && (
              <select
                value={kasirPilih}
                onChange={(e) => setKasirPilih(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-500"
              >
                <option value="">Semua kasir</option>
                {daftarKasir.map(([id, nama]) => (
                  <option key={id} value={id}>
                    {nama}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="mx-5 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 mt-1">
            {tab === "transaksi" ? (
              !daftar ? (
                <div className="py-10 flex justify-center text-slate-500">
                  <Loader2 className="animate-spin" size={20} />
                </div>
              ) : tampil.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Belum ada transaksi di periode ini.<div className="text-xs text-slate-500 mt-1">Pilih tanggal lain untuk melihat transaksi sebelumnya.</div></div>
              ) : (
                <>
                  {/* ringkasan */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 px-3.5 py-3">
                      <div className="text-[11px] text-slate-500">Penjualan bersih</div>
                      <div className="text-base font-bold text-amber-400">{fmtRp(ringkas.semua.jual - ringkas.semua.retur)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 px-3.5 py-3">
                      <div className="text-[11px] text-slate-500">Retur</div>
                      <div className="text-base font-bold text-orange-300">{fmtRp(ringkas.semua.retur)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 px-3.5 py-3">
                      <div className="text-[11px] text-slate-500">Void</div>
                      <div className="text-base font-bold text-red-300">
                        {ringkas.semua.nVoid} <span className="text-[10px] font-normal text-slate-500">({fmtRp(ringkas.semua.nilaiVoid)})</span>
                      </div>
                    </div>
                  </div>

                  {semuaKasir && ringkas.per.length > 1 && (
                    <div className="rounded-xl border border-slate-800 mb-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 text-left">
                            <th className="font-medium px-3 py-1.5">Kasir</th>
                            <th className="font-medium px-2 py-1.5 text-right">Trx</th>
                            <th className="font-medium px-2 py-1.5 text-right">Penjualan</th>
                            <th className="font-medium px-2 py-1.5 text-right">Retur</th>
                            <th className="font-medium px-3 py-1.5 text-right">Void</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ringkas.per.map((k) => (
                            <tr key={k.nama} className="border-t border-slate-800">
                              <td className="px-3 py-1.5">{k.nama}</td>
                              <td className="px-2 py-1.5 text-right">{k.n}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRp(k.jual)}</td>
                              <td className="px-2 py-1.5 text-right text-orange-300">{k.retur ? fmtRp(k.retur) : "–"}</td>
                              <td className="px-3 py-1.5 text-right text-red-300">{k.nVoid || "–"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <ul className="space-y-1.5">
                    {tampil.map((r) => {
                      const st = statusTrx(r);
                      const void_ = st === "void";
                      return (
                        <li key={r[T.id]} className="rounded-2xl border border-slate-800 bg-slate-900/60">
                          <button
                            onClick={() => buka(r)}
                            disabled={membuka !== null}
                            className="w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-2xl hover:bg-slate-800/50 disabled:opacity-60 transition-colors"
                          >
                            <Receipt size={16} className="text-slate-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-mono truncate">{r[T.nomor]}</span>
                                <Badge r={r} />
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {tglJamId(r[T.waktu])}
                                {semuaKasir && r[T.kasirNama] ? ` · ${r[T.kasirNama]}` : ""}
                              </div>
                              {trxGrosirPelanggan(r) && (
                                <div className="text-[11px] text-violet-300/80">
                                  Grosir · {r.pelanggan_nama || "Pelanggan"}
                                  {r.grosir_pesanan_id ? " · sudah masuk Pesanan Grosir" : " · masuk Pesanan Grosir saat tutup kasir"}
                                </div>
                              )}
                              {void_ && r[T.voidAlasan] && <div className="text-[11px] text-red-300/80">Alasan void: {r[T.voidAlasan]}</div>}
                              {num(r[T.totalRetur]) > 0 && (
                                <div className="text-[11px] text-orange-300/80">Diretur {fmtRp(r[T.totalRetur])}</div>
                              )}
                            </div>
                            {membuka === r[T.id] ? (
                              <Loader2 size={15} className="animate-spin text-amber-400" />
                            ) : (
                              <div className={`text-sm font-semibold ${void_ ? "text-slate-500 line-through" : "text-amber-400"}`}>
                                {fmtRp(num(r[T.total]) || num(r[T.bayar]) - num(r[T.kembalian]))}
                              </div>
                            )}
                          </button>
                          {(bolehRetur(r) || bolehVoid(r) || bolehVoidRole) && (
                            <div className="flex gap-2 px-3 pb-2.5">
                              {bolehRetur(r) && (
                                <button
                                  onClick={() => setAksi({ tipe: "retur", row: r })}
                                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-500"
                                >
                                  <Undo2 size={12} /> Retur
                                </button>
                              )}
                              {bolehVoid(r) && (
                                <button
                                  onClick={() => setAksi({ tipe: "void", row: r })}
                                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
                                >
                                  <Ban size={12} /> Void
                                </button>
                              )}
                              {bolehVoidRole && (
                                <button
                                  onClick={() => setAksi({ tipe: "hapus", row: r })}
                                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-red-500/50 hover:text-red-300"
                                >
                                  <Trash2 size={12} /> Hapus
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )
            ) : !daftarShift ? (
              <div className="py-10 flex justify-center text-slate-500">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : daftarShift.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">Belum ada shift di periode ini.</div>
            ) : (
              <ul className="space-y-1.5">
                {daftarShift.map((s) => {
                  const tutup = s.status === "tutup";
                  const sel = num(s.selisih);
                  return (
                    <li key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm">{s.kasir_nama || "(tanpa nama)"}</div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tutup ? "bg-slate-700/60 text-slate-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                            {tutup ? "DITUTUP" : "MASIH BUKA"}
                          </span>
                          <button
                            type="button"
                            onClick={() => cetakUlangShift(s)}
                            disabled={!!mencetakShift}
                            title="Cetak rincian penjualan shift ini"
                            className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 disabled:opacity-40 text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                          >
                            {mencetakShift === s.id ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Cetak
                          </button>
                          {bolehHapusShift && (
                            <button
                              type="button"
                              onClick={() => setAksi({ tipe: "hapusShift", shift: s })}
                              disabled={!!mencetakShift}
                              title="Hapus shift ini (khusus superappa)"
                              className="flex items-center gap-1.5 border border-slate-700 hover:border-red-500/50 hover:text-red-300 disabled:opacity-40 text-slate-400 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <Trash2 size={13} /> Hapus
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {tglJamId(s.buka_at)}
                        {tutup && s.tutup_at ? ` → ${tglJamId(s.tutup_at)}` : ""}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <div className="text-[10px] text-slate-500">Kas awal</div>
                          <div>{fmtRp(s.kas_awal)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Kas akhir</div>
                          <div>{tutup ? fmtRp(s.kas_akhir) : "–"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Selisih</div>
                          <div className={tutup ? `font-semibold ${warnaSelisih(sel)}` : ""}>
                            {tutup ? (sel === 0 ? "Pas" : `${sel > 0 ? "+" : "−"}${fmtRp(Math.abs(sel))}`) : "–"}
                          </div>
                        </div>
                      </div>
                      {tutup && s.kas_sistem != null && <div className="mt-1.5 text-[11px] text-slate-500">Kas seharusnya {fmtRp(s.kas_sistem)}</div>}
                      {s.catatan_tutup && <div className="mt-1 text-[11px] text-slate-400">Catatan: {s.catatan_tutup}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {struk && <ModalStruk struk={struk} onClose={() => setStruk(null)} />}
      {aksi?.tipe === "void" && <ModalVoid row={aksi.row} session={session} onSelesai={selesaiAksi} onMuatUlang={muat} onClose={() => setAksi(null)} />}
      {aksi?.tipe === "hapus" && (
        <ModalHapus row={aksi.row} shiftSudahTutup={aksi.row[T.shiftId] != null && !shiftBuka.has(aksi.row[T.shiftId])} onSelesai={selesaiAksi} onClose={() => setAksi(null)} />
      )}
      {aksi?.tipe === "hapusShift" && bolehHapusShift && <ModalHapusShift shift={aksi.shift} onSelesai={selesaiAksi} onClose={() => setAksi(null)} />}
      {aksi?.tipe === "retur" && <ModalRetur row={aksi.row} session={session} onSelesai={selesaiAksi} onMuatUlang={muat} onClose={() => setAksi(null)} />}
    </>
  );
}