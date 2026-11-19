import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Loader2, Pencil, Trash2, Paperclip, RefreshCw, AlertTriangle, ArrowRightLeft, Landmark, Wallet,
} from "lucide-react";
import ModalRouter from "../../components/ModalRouter";
import { Badge, formatTanggalID } from "../../components/ui";
import {
  sb, sbAll, fmtRp, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  lingkupEntitas, ringkasanKeuangan, saldoPerRekening, saldoPerKas, petaKasRekening, kasDariRekening, kasTerkait,
  ringkasanPerKas, setSaldoDasarRekening, resetKeuanganLama, awalRentangKeuanganDefault,
  LABEL_KAS, URUTAN_KAS, KAS_BANK, KAS_KECIL, ENTITAS_DEFAULT,
} from "../../lib/api";
import { roleHanyaLihat } from "../../lib/constants";
import { daftarBukti } from "../../lib/bukti";
import { useKeuanganRentang } from "../../lib/useKeuanganRentang";

// Tab "Transfer Antar Kas" memakai ulang komponen desktop (pages/AlurKas.jsx) — dimuat malas.
const TransaksiKasDesktop = lazy(() => import("../AlurKas").then((m) => ({ default: m.TransaksiKas })));

// =========================================================
// VERSI HP — KEUANGAN > Transaksi (file KeuanganHp.jsx)
// Daftar transaksi versi KARTU: saldo per kas (Bank / Uang Cash), filter tanggal / jenis / pencarian,
// tambah, edit, hapus. Form & hapus memakai ModalRouter YANG SAMA dengan versi komputer, jadi aturan
// (cek saldo cukup, transfer antar kas, bukti transfer, rekening/kategori baru) identik.
// Sumber data sama: keuangan_transaksi + master_data. Dikunci ke PT akun yang login (lingkupEntitas),
// sama seperti Keuangan versi komputer mode "ops". Akun read-only tidak bisa membuka form.
// Yang BELUM ada di HP (masih di komputer): unduh Excel/PDF, ikon detail pesanan barang, Kas, Laporan, Pengaturan.
// =========================================================

const pad2 = (n) => String(n).padStart(2, "0");
const isoLokal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hariIni = () => isoLokal(new Date());
const awalBulan = (offset = 0) => {
  const d = new Date();
  return isoLokal(new Date(d.getFullYear(), d.getMonth() + offset, 1));
};
const akhirBulan = (offset = 0) => {
  const d = new Date();
  return isoLokal(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0));
};
const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

const PER_TAMPIL = 40;
const TAB_KAS = [
  { key: "semua", label: "Semua" },
  { key: KAS_BANK, label: LABEL_KAS[KAS_BANK] },
  { key: KAS_KECIL, label: LABEL_KAS[KAS_KECIL] },
];

// Master data dengan aturan yang sama seperti layar HP lain (kode SKU per PT, profil entitas, toko marketplace).
async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// Transaksi bulan berjalan + saldo dasar (akumulasi semua transaksi SEBELUM bulan ini) — sama dengan App.jsx loadKeuangan().
async function muatTransaksi() {
  const awal = awalRentangKeuanganDefault();
  resetKeuanganLama();
  const rows = await sbAll(`keuangan_transaksi?select=*&tanggal=gte.${awal}&order=tanggal.desc`);
  try {
    const dasar = await sb(`rpc/saldo_rekening_sebelum?p_tanggal=${awal}`);
    const peta = {};
    (dasar || []).forEach((r) => {
      if (r.rekening) peta[r.rekening] = Number(r.saldo) || 0;
    });
    setSaldoDasarRekening(awal, peta);
  } catch (e) {
    console.warn("saldo_rekening_sebelum belum tersedia:", e?.message || e);
  }
  return rows || [];
}

function Memuat({ teks = "Memuat…" }) {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> {teks}
    </div>
  );
}

function ChipTab({ aktif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
        aktif ? "bg-md-primary text-md-on-primary border-transparent" : "bg-md-container border-md-outline-variant text-md-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5 text-sm text-md-on-surface outline-none focus:border-md-primary";

export default function KeuanganHp({ session, sub, entitas, bacaSajaPaksa }) {
  // Menu Keuangan Pusat / Keuangan Perusahaan (GrupHp.jsx) mengunci layar ini ke PT lain lewat `entitas` dan mengatur read-only lewat `bacaSajaPaksa`.
  const kodeAktif = entitas || session?.entitas || ENTITAS_DEFAULT;
  const bacaSaja = bacaSajaPaksa ?? roleHanyaLihat(session?.role);

  const [master, setMaster] = useState({});
  const [trx, setTrx] = useState([]);
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  const [tab, setTab] = useState("transaksi"); // transaksi | transfer
  const [kasTab, setKasTab] = useState("semua");
  const [dari, setDari] = useState(awalBulan());
  const [sampai, setSampai] = useState(hariIni());
  const [tipeFilter, setTipeFilter] = useState("");
  const [q, setQ] = useState("");
  const [tampilBanyak, setTampilBanyak] = useState(PER_TAMPIL);

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  // Form transaksi (ModalRouter) membaca PT aktif dari sini — sama seperti Keuangan.jsx desktop.
  useEffect(() => {
    try {
      sessionStorage.setItem("selma-entitas", kodeAktif);
    } catch {
      /* abaikan */
    }
  }, [kodeAktif]);

  const muat = useCallback(async () => {
    setErr("");
    try {
      const [m, t] = await Promise.all([muatMaster(), muatTransaksi()]);
      setMaster(m);
      setTrx(t);
    } catch (e) {
      setErr(e.message || "Gagal memuat data keuangan");
    } finally {
      setSiap(true);
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  const lingkup = useMemo(
    () => lingkupEntitas(trx, master, kodeAktif),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trx, master.rekening, master.rekening_entitas, master.entitas, kodeAktif]
  );
  const rekeningList = lingkup.master.rekening || [];
  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];
  const petaKas = useMemo(() => petaKasRekening(master.kas_grup), [master.kas_grup]);

  const { data: dataRentang, status: statusLama } = useKeuanganRentang(lingkup.transaksi, dari);
  const { list } = useMemo(() => ringkasanKeuangan(dataRentang, dari || null, sampai || null), [dataRentang, dari, sampai]);

  const saldoKas = useMemo(
    () => saldoPerKas(saldoPerRekening(lingkup.transaksi, rekeningList, true), petaKas),
    [lingkup.transaksi, rekeningList, petaKas]
  );
  const ringkasKas = kasTab === "semua" ? null : ringkasanPerKas(list, petaKas, kasTab);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list
      .filter((t) => kasTab === "semua" || kasTerkait(t, petaKas).includes(kasTab))
      .filter((t) => !tipeFilter || t.tipe === tipeFilter)
      .filter((t) => {
        if (!s) return true;
        const kat = labelDari(t.tipe === "masuk" ? kategoriMasuk : kategoriKeluar, t.kategori);
        return (
          kat.toLowerCase().includes(s) ||
          labelDari(rekeningList, t.rekening).toLowerCase().includes(s) ||
          (t.keterangan || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));
  }, [list, kasTab, tipeFilter, q, petaKas, kategoriMasuk, kategoriKeluar, rekeningList]);

  useEffect(() => setTampilBanyak(PER_TAMPIL), [kasTab, tipeFilter, q, dari, sampai]);

  // Buka form / hapus. Akun read-only ditolak di sini (pagar sebenarnya ada di sb()).
  const bukaModal = useCallback(
    (m) => {
      if (m && bacaSaja) {
        tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
        return;
      }
      setModal(m);
    },
    [bacaSaja, tampilToast]
  );

  const periodeCepat = (d, s) => {
    setDari(d);
    setSampai(s);
  };

  if (!siap) return <Memuat />;
  if (err && !trx.length && !Object.keys(master).length) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="min-w-0 break-words">{err}</div>
          </div>
          <button onClick={() => { setSiap(false); muat(); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-28">
      <div className="p-4 space-y-4">
        {err && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2 flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{err}</span>
            <button onClick={muat} className="underline font-semibold flex-shrink-0">Muat ulang</button>
          </div>
        )}
        {bacaSaja && (
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs px-3 py-2">
            Mode lihat saja — akun ini tidak bisa menambah atau mengubah data.
          </div>
        )}

        {/* Saldo per kas */}
        <div className="grid grid-cols-2 gap-3">
          {URUTAN_KAS.map((k) => (
            <div key={k} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-md-on-surface-variant mb-1">
                {k === KAS_BANK ? <Landmark size={12} /> : <Wallet size={12} />} {LABEL_KAS[k]}
              </div>
              <div className={`text-base font-bold ${saldoKas[k] >= 0 ? "text-md-on-surface" : "text-red-400"}`}>{fmtRp(saldoKas[k])}</div>
            </div>
          ))}
        </div>

        {/* Tab Transaksi / Transfer Antar Kas */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          <ChipTab aktif={tab === "transaksi"} onClick={() => setTab("transaksi")}>Transaksi</ChipTab>
          <ChipTab aktif={tab === "transfer"} onClick={() => setTab("transfer")}>Transfer Antar Kas</ChipTab>
        </div>

        {tab === "transfer" ? (
          <Suspense fallback={<Memuat />}>
            <TransaksiKasDesktop keuanganTransaksi={lingkup.transaksi} master={lingkup.master} reload={muat} showToast={tampilToast} setModal={bukaModal} />
          </Suspense>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
              {TAB_KAS.map((t) => (
                <ChipTab key={t.key} aktif={kasTab === t.key} onClick={() => setKasTab(t.key)}>{t.label}</ChipTab>
              ))}
            </div>

            {ringkasKas && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
                  <div className="text-md-on-surface-variant">Pemasukan</div>
                  <div className="font-semibold text-emerald-400">{fmtRp(ringkasKas.masuk)}</div>
                </div>
                <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
                  <div className="text-md-on-surface-variant">Pengeluaran</div>
                  <div className="font-semibold text-red-400">{fmtRp(ringkasKas.keluar)}</div>
                </div>
                <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
                  <div className="text-md-on-surface-variant">Transfer masuk</div>
                  <div className="font-semibold text-sky-400">{fmtRp(ringkasKas.transferMasuk)}</div>
                </div>
                <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
                  <div className="text-md-on-surface-variant">Transfer keluar</div>
                  <div className="font-semibold text-sky-400">{fmtRp(ringkasKas.transferKeluar)}</div>
                </div>
              </div>
            )}

            {/* Filter */}
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
                <ChipTab aktif={dari === awalBulan() && sampai === hariIni()} onClick={() => periodeCepat(awalBulan(), hariIni())}>Bulan ini</ChipTab>
                <ChipTab aktif={dari === awalBulan(-1) && sampai === akhirBulan(-1)} onClick={() => periodeCepat(awalBulan(-1), akhirBulan(-1))}>Bulan lalu</ChipTab>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-md-on-surface-variant">
                  Dari
                  <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-[11px] text-md-on-surface-variant">
                  Sampai
                  <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputCls} mt-1`} />
                </label>
              </div>
              <select value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)} className={inputCls}>
                <option value="">Semua Jenis</option>
                <option value="masuk">Pemasukan</option>
                <option value="keluar">Pengeluaran</option>
                <option value="transfer">Transfer Antar Rekening</option>
              </select>
              <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
                <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari kategori, rekening, keterangan…"
                  className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant"
                />
              </div>
            </div>

            {statusLama && <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2">{statusLama}</div>}

            {/* Daftar */}
            <div className="text-[11px] text-md-on-surface-variant">{filtered.length} transaksi</div>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">
                {q || tipeFilter ? "Tidak ada transaksi yang cocok." : "Belum ada transaksi di rentang ini."}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.slice(0, tampilBanyak).map((t) => {
                  const isTransfer = t.tipe === "transfer";
                  const kategoriLabel = labelDari(t.tipe === "masuk" ? kategoriMasuk : kategoriKeluar, t.kategori);
                  const rekLabel = labelDari(rekeningList, t.rekening);
                  const rekTujuanLabel = labelDari(master.rekening || [], t.rekening_tujuan);
                  const kasAsal = kasDariRekening(petaKas, t.rekening);
                  const kasTujuan = isTransfer ? kasDariRekening(petaKas, t.rekening_tujuan) : null;
                  const kasTeks = isTransfer && kasAsal !== kasTujuan ? `${LABEL_KAS[kasAsal]} → ${LABEL_KAS[kasTujuan]}` : LABEL_KAS[kasAsal];
                  // Transfer yang salah satu rekeningnya milik entitas lain (modal, dividen, pinjaman).
                  const asalSendiri = rekeningList.some((r) => r.kode === t.rekening);
                  const tujuanSendiri = rekeningList.some((r) => r.kode === t.rekening_tujuan);
                  const antarEntitas = isTransfer && rekeningList.__batasi && !(asalSendiri && tujuanSendiri);
                  let arah = null;
                  if (antarEntitas) arah = asalSendiri && !tujuanSendiri ? "keluar" : !asalSendiri && tujuanSendiri ? "masuk" : null;
                  const warnaBadge = arah === "keluar" ? "red" : arah === "masuk" ? "emerald" : "sky";
                  const warnaJumlah = arah === "keluar" ? "text-red-400" : arah === "masuk" ? "text-emerald-400" : isTransfer ? "text-sky-400" : t.tipe === "masuk" ? "text-emerald-400" : "text-red-400";
                  const tanda = arah === "keluar" ? "-" : arah === "masuk" ? "+" : isTransfer ? "" : t.tipe === "masuk" ? "+" : "-";
                  return (
                    <div key={t.id} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isTransfer ? <Badge color={warnaBadge}>Transfer</Badge> : <Badge color={t.tipe === "masuk" ? "emerald" : "red"}>{kategoriLabel}</Badge>}
                            {antarEntitas && <Badge color="amber">Antar Entitas</Badge>}
                          </div>
                          <div className="text-[11px] text-md-on-surface-variant mt-1.5 flex items-center gap-1 flex-wrap">
                            {isTransfer ? (
                              <>
                                {rekLabel} <ArrowRightLeft size={10} /> {rekTujuanLabel}
                              </>
                            ) : (
                              rekLabel
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-md-container-high text-md-on-surface-variant">{kasTeks}</span>
                          </div>
                        </div>
                        <div className={`text-sm font-bold flex-shrink-0 ${warnaJumlah}`}>
                          {tanda}
                          {fmtRp(t.jumlah)}
                        </div>
                      </div>
                      <div className="text-[11px] text-md-on-surface-variant mt-1.5 break-words">
                        {formatTanggalID(t.tanggal)}
                        {t.keterangan ? ` · ${t.keterangan}` : ""}
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-2">
                        {daftarBukti(t).map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center rounded-full text-emerald-400" title={`Bukti ${i + 1}`}>
                            <Paperclip size={15} />
                          </a>
                        ))}
                        <button onClick={() => bukaModal({ type: "keuangan-transaksi-form", item: t })} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high" title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => bukaModal({ type: "hapus-keuangan-transaksi", item: t })} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high" title="Hapus">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filtered.length > tampilBanyak && (
                  <button onClick={() => setTampilBanyak((n) => n + PER_TAMPIL)} className="w-full py-3 rounded-xl border border-md-outline-variant text-xs font-semibold text-md-primary">
                    Tampilkan lebih banyak ({filtered.length - tampilBanyak} lagi)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Tombol tambah */}
      {tab === "transaksi" && !bacaSaja && (
        <button
          onClick={() => bukaModal({ type: "keuangan-transaksi-form" })}
          className="fixed right-4 z-30 w-14 h-14 rounded-2xl bg-md-primary text-md-on-primary shadow-lg flex items-center justify-center active:scale-95 transition"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
          aria-label="Tambah transaksi"
        >
          <Plus size={24} />
        </button>
      )}

      {modal && (
        <ModalRouter
          modal={modal}
          setModal={bukaModal}
          master={master}
          settings={null}
          rakList={[]}
          skuMaster={[]}
          penempatan={[]}
          items={[]}
          pesananMasuk={[]}
          suppliers={[]}
          keuanganTransaksi={trx}
          marketplaceTransaksi={[]}
          saving={saving}
          setSaving={setSaving}
          reload={muat}
          showToast={tampilToast}
          session={session}
          pelangganGrosir={[]}
          tokoGrosir={[]}
          produkManualGrosir={[]}
          pesananGrosir={[]}
          pembayaranGrosir={[]}
          depositGrosir={[]}
        />
      )}

      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
