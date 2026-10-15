import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  ArrowRightLeft,
  Landmark,
  Download,
  Paperclip,
  Image as ImageIcon,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Check,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  EmptyState,
  inputClass,
  Badge,
  InputTanggal,
  formatTanggalID,
  ModalShell,
  Field,
  InputRupiah,
  ZoomableImage,
} from "../components/ui";
import {
  sb,
  sbUploadFoto,
  kompresFotoProduk,
  fmtRp,
  saldoPerRekening,
  saldoPerKas,
  petaKasRekening,
  petaLokasiRekening,
  lokasiDariRekening,
  LOKASI_TANPA,
  kasDariRekening,
  LABEL_KAS,
  KAS_BANK,
  KAS_KECIL,
  URUTAN_KAS,
  saldoSebelumTanggal,
  petaEntitasRekening,
  entitasDariRekening,
  PENANDA_ANTAR_ENTITAS,
} from "../lib/api";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";

// =========================================================
// FASE 3 — ALUR KAS
//   1. Transaksi Kas     : transfer ANTAR kas (Besar/Bank <-> Kas Kecil), termasuk
//                          "Isi Kas Kecil" dengan upload bukti transfer.
//   2. Buku Kas          : buku besar per akun / per jenis kas, saldo berjalan.
//   3. Rekonsiliasi Kas  : bandingkan saldo sistem vs uang fisik / mutasi bank.
// Tidak ada tabel baru untuk Transaksi Kas & Buku Kas — keduanya dibaca dari
// keuangan_transaksi (kolom baru bukti_url). Rekonsiliasi pakai tabel
// rekonsiliasi_kas (lihat fase3_alur_kas.sql).
// =========================================================

const pad2 = (n) => String(n).padStart(2, "0");
export function hariIniLokal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export const selectCls = "bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40";
export const fileCls =
  "block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700";

// Foto bukti transfer: diperkecil sedikit (tetap tajam supaya nominal/nama
// terbaca), lalu diupload ke bucket yang sama dengan bukti lain.
export async function unggahBukti(file, tanda) {
  const kecil = await kompresFotoProduk(file, { maxDim: 1600, quality: 0.88 });
  return sbUploadFoto(kecil, `bukti-kas-${Date.now()}-${tanda}.jpg`);
}

// Data turunan yang dipakai ketiga halaman: peta kas/lokasi, saldo per akun.
export function useDataKas(master, keuanganTransaksi) {
  const rekeningList = master.rekening || [];
  const lokasiList = master.lokasi || [];
  const petaKas = useMemo(() => petaKasRekening(master.kas_grup), [master.kas_grup]);
  const petaLok = useMemo(() => petaLokasiRekening(master.rekening_lokasi), [master.rekening_lokasi]);
  const saldoMap = useMemo(
    () => new Map(saldoPerRekening(keuanganTransaksi, rekeningList, true).map((r) => [r.kode, r.saldo])),
    [keuanganTransaksi, rekeningList]
  );
  const saldoKas = useMemo(
    () => saldoPerKas(saldoPerRekening(keuanganTransaksi, rekeningList, true), petaKas),
    [keuanganTransaksi, rekeningList, petaKas]
  );
  const entitasList = master.entitas || [];
  const petaEnt = useMemo(() => petaEntitasRekening(master.rekening_entitas), [master.rekening_entitas]);
  const entDari = (kode) => entitasDariRekening(petaEnt, entitasList, kode);
  const entNama = (kode) => entitasList.find((e) => e.kode === kode)?.label || kode;
  const labelRek = (kode) => rekeningList.find((r) => r.kode === kode)?.label || kode || "";
  const kasDari = (kode) => kasDariRekening(petaKas, kode);
  const lokasiNama = (kode) => {
    const lk = lokasiDariRekening(petaLok, lokasiList, kode);
    return lk === LOKASI_TANPA ? "" : lokasiList.find((l) => l.kode === lk)?.label || "";
  };
  const urutKas = (a, b) => URUTAN_KAS.indexOf(kasDari(a.kode)) - URUTAN_KAS.indexOf(kasDari(b.kode)) || (a.label || "").localeCompare(b.label || "");
  return { rekeningList, lokasiList, petaKas, petaLok, saldoMap, saldoKas, labelRek, kasDari, lokasiNama, urutKas, entitasList, entDari, entNama };
}

// Jenis transfer antar kas (null = transfer di dalam kas yang sama, bukan "antar kas").
function jenisTransferKas(t, kasDari) {
  if (t.tipe !== "transfer") return null;
  const asal = kasDari(t.rekening);
  const tujuan = kasDari(t.rekening_tujuan);
  if (asal === tujuan) return null;
  if (tujuan === KAS_KECIL) return "pengisian";
  if (asal === KAS_KECIL) return "setoran";
  return null;
}
const LABEL_JENIS_TRANSFER = {
  pengisian: "Pengisian Kas Kecil",
  setoran: "Setoran dari Kas Kecil",
};
const WARNA_JENIS_TRANSFER = { pengisian: "emerald", setoran: "amber" };

// =========================================================
// 1. TRANSAKSI KAS
// =========================================================
export function TransaksiKas({ keuanganTransaksi = [], master = {}, reload, showToast, setModal }) {
  const k = useDataKas(master, keuanganTransaksi);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [jenis, setJenis] = useState("semua");
  const [formBuka, setFormBuka] = useState(false);
  const [lihatBukti, setLihatBukti] = useState(null);
  const [mengunggahId, setMengunggahId] = useState(null);
  const fileRef = useRef(null);
  const targetRef = useRef(null);

  const { data: dataRentang, status: statusLama } = useKeuanganRentang(keuanganTransaksi, dari);

  const daftar = useMemo(
    () =>
      dataRentang
        .map((t) => ({ t, jenis: jenisTransferKas(t, k.kasDari) }))
        .filter((x) => x.jenis)
        .filter((x) => (!dari || x.t.tanggal >= dari) && (!sampai || x.t.tanggal <= sampai))
        .filter((x) => jenis === "semua" || x.jenis === jenis)
        .sort((a, b) => ((b.t.tanggal || "") + (b.t.created_at || "")).localeCompare((a.t.tanggal || "") + (a.t.created_at || ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataRentang, dari, sampai, jenis, master.kas_grup]
  );

  const totalPengisian = daftar.filter((x) => x.jenis === "pengisian").reduce((a, x) => a + (Number(x.t.jumlah) || 0), 0);
  const totalSetoran = daftar.filter((x) => x.jenis === "setoran").reduce((a, x) => a + (Number(x.t.jumlah) || 0), 0);
  const tanpaBukti = daftar.filter((x) => !x.t.bukti_url).length;

  const mintaBukti = (t) => {
    targetRef.current = t;
    fileRef.current?.click();
  };
  const onPilihFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const t = targetRef.current;
    if (!f || !t) return;
    setMengunggahId(t.id);
    try {
      const url = await unggahBukti(f, t.id);
      await sb(`keuangan_transaksi?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ bukti_url: url }) });
      showToast?.("Bukti transfer dilampirkan");
      await reload?.();
    } catch (err) {
      showToast?.(err.message || "Gagal mengunggah bukti", "err");
    } finally {
      setMengunggahId(null);
    }
  };

  const adaBank = k.rekeningList.some((r) => k.kasDari(r.kode) === KAS_BANK);
  const adaKasKecil = k.rekeningList.some((r) => k.kasDari(r.kode) === KAS_KECIL);

  return (
    <div>
      {statusLama && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>
      )}
      <PageHeader
        title="Transaksi Kas"
        description="Perpindahan uang ANTAR kas: isi kas kecil dari Bank (dengan bukti transfer) dan setoran kembali ke Bank. Pemasukan & pengeluaran biasa tetap dicatat di menu Transaksi."
        sticky
        action={
          <button
            onClick={() => setFormBuka(true)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Isi Kas Kecil
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        {URUTAN_KAS.map((kk) => (
          <div key={kk} className="rounded-xl border border-slate-800 p-3 bg-slate-900/50">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <Landmark size={12} /> Saldo {LABEL_KAS[kk]}
            </div>
            <div className={`text-base font-semibold ${k.saldoKas[kk] >= 0 ? "text-slate-100" : "text-red-400"}`}>{fmtRp(k.saldoKas[kk])}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Pengisian Kas Kecil (periode)" value={fmtRp(totalPengisian)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Setoran dari Kas Kecil (periode)" value={fmtRp(totalSetoran)} accent="text-amber-400" icon={TrendingDown} iconColor="text-amber-500" />
        <StatCard
          label="Belum ada bukti"
          value={`${tanpaBukti} transaksi`}
          accent={tanpaBukti ? "text-amber-400" : "text-slate-100"}
          icon={Paperclip}
          iconColor="text-slate-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={jenis} onChange={(e) => setJenis(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="semua">Semua Jenis</option>
          {Object.entries(LABEL_JENIS_TRANSFER).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {(!adaBank || !adaKasKecil) && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">
          Untuk isi kas kecil, perlu minimal satu akun Bank dan satu akun Kas Kecil. Atur jenis akun di Keuangan &gt; Akun Kas.
        </div>
      )}

      {daftar.length === 0 ? (
        <EmptyState label="Belum ada transfer antar kas di rentang ini." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map(({ t, jenis: jt }, i) => {
            const lokTujuan = k.lokasiNama(t.rekening_tujuan);
            return (
              <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={WARNA_JENIS_TRANSFER[jt]}>{LABEL_JENIS_TRANSFER[jt]}</Badge>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      {k.labelRek(t.rekening)} <ArrowRightLeft size={10} /> {k.labelRek(t.rekening_tujuan)}
                      {lokTujuan ? <span className="text-slate-600"> · {lokTujuan}</span> : null}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {formatTanggalID(t.tanggal)}
                    {t.keterangan ? ` · ${t.keterangan}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-sm font-semibold text-sky-400">{fmtRp(t.jumlah)}</div>
                  {t.bukti_url ? (
                    <button
                      onClick={() => setLihatBukti(t)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-emerald-400 hover:bg-slate-800"
                      title="Lihat bukti transfer"
                    >
                      <ImageIcon size={13} /> Bukti
                    </button>
                  ) : (
                    <button
                      onClick={() => mintaBukti(t)}
                      disabled={mengunggahId === t.id}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-amber-400 hover:bg-slate-800 disabled:opacity-50"
                      title="Lampirkan bukti transfer"
                    >
                      <Paperclip size={13} /> {mengunggahId === t.id ? "Mengunggah…" : "Belum ada bukti"}
                    </button>
                  )}
                  <button
                    onClick={() => setModal?.({ type: "keuangan-transaksi-form", item: t })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setModal?.({ type: "hapus-keuangan-transaksi", item: t })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                    title="Hapus"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPilihFile} />

      {formBuka && (
        <FormPengisianKas
          k={k}
          onClose={() => setFormBuka(false)}
          showToast={showToast}
          onSaved={async () => {
            await reload?.();
            setFormBuka(false);
          }}
        />
      )}

      {lihatBukti && (
        <ModalShell title="Bukti Transfer" onClose={() => setLihatBukti(null)} maxWidth="max-w-2xl">
          <div className="text-xs text-slate-400 mb-2">
            {formatTanggalID(lihatBukti.tanggal)} · {k.labelRek(lihatBukti.rekening)} → {k.labelRek(lihatBukti.rekening_tujuan)} · {fmtRp(lihatBukti.jumlah)}
          </div>
          <ZoomableImage src={lihatBukti.bukti_url} alt="Bukti transfer" />
          <div className="flex gap-2 mt-3">
            <a
              href={lihatBukti.bukti_url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold py-2.5 rounded-lg"
            >
              Buka di tab baru
            </a>
            <button
              onClick={() => {
                const t = lihatBukti;
                setLihatBukti(null);
                mintaBukti(t);
              }}
              className="flex-1 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold py-2.5 rounded-lg"
            >
              Ganti bukti
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// Form "Isi Kas Kecil": transfer dari akun Bank ke akun Kas Kecil + bukti.
// Disimpan sebagai transaksi tipe "transfer" biasa (supaya saldo, laporan, dan
// panel Pengisian Kas Kecil di Dashboard otomatis ikut) + kolom bukti_url.
function FormPengisianKas({ k, onClose, onSaved, showToast }) {
  const sumberList = k.rekeningList.filter((r) => k.kasDari(r.kode) !== KAS_KECIL).sort(k.urutKas);
  const tujuanList = k.rekeningList.filter((r) => k.kasDari(r.kode) === KAS_KECIL).sort(k.urutKas);

  const [tanggal, setTanggal] = useState(hariIniLokal());
  const [sumber, setSumber] = useState(sumberList.length === 1 ? sumberList[0].kode : "");
  const [tujuan, setTujuan] = useState(tujuanList.length === 1 ? tujuanList[0].kode : "");
  const [jumlah, setJumlah] = useState("");
  const [keterangan, setKeterangan] = useState("Pengisian kas kecil");
  const [foto, setFoto] = useState(null);
  const [penanda, setPenanda] = useState("");
  const [saving, setSaving] = useState(false);

  // Sumber & tujuan beda entitas (mis. rekening Holding -> Kas Kecil usaha)
  // = pendanaan antar-entitas; boleh diberi penanda modal / pinjaman.
  const antarEntitas = !!(sumber && tujuan && k.entDari(sumber) !== k.entDari(tujuan));

  const jumlahNum = Number(jumlah) || 0;
  const saldoSumber = sumber ? k.saldoMap.get(sumber) ?? 0 : null;
  const saldoKurang = sumber && jumlahNum > 0 && jumlahNum > (saldoSumber ?? 0);
  const valid = tanggal && sumber && tujuan && jumlahNum > 0 && !saldoKurang;

  const simpan = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const buktiUrl = foto ? await unggahBukti(foto, `${tujuan}`) : null;
      await sb("keuangan_transaksi", {
        method: "POST",
        body: JSON.stringify({
          tanggal,
          tipe: "transfer",
          rekening: sumber,
          rekening_tujuan: tujuan,
          kategori: null,
          jumlah: jumlahNum,
          keterangan: keterangan.trim() || "Pengisian kas kecil",
          ...(buktiUrl ? { bukti_url: buktiUrl } : {}),
          ...(antarEntitas && penanda ? { penanda } : {}),
        }),
      });
      showToast?.(buktiUrl ? "Kas kecil terisi — bukti tersimpan" : "Kas kecil terisi (belum ada bukti)");
      await onSaved();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan pengisian kas", "err");
      setSaving(false);
    }
  };

  const opsi = (list) =>
    URUTAN_KAS.map((kk) => {
      const items = list.filter((r) => k.kasDari(r.kode) === kk);
      if (!items.length) return null;
      return (
        <optgroup key={kk} label={LABEL_KAS[kk]}>
          {items.map((r) => (
            <option key={r.kode} value={r.kode}>
              {r.label}
              {k.lokasiNama(r.kode) ? ` · ${k.lokasiNama(r.kode)}` : ""} — saldo {fmtRp(k.saldoMap.get(r.kode) || 0)}
            </option>
          ))}
        </optgroup>
      );
    });

  return (
    <ModalShell title="Isi Kas Kecil" onClose={onClose}>
      <Field label="Tanggal">
        <InputTanggal className={inputClass} value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Dari (Bank)">
        <select className={inputClass} value={sumber} onChange={(e) => setSumber(e.target.value)}>
          <option value="">Pilih akun sumber…</option>
          {opsi(sumberList)}
        </select>
      </Field>
      <Field label="Ke (Kas Kecil)">
        <select className={inputClass} value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
          <option value="">Pilih akun kas kecil…</option>
          {opsi(tujuanList)}
        </select>
      </Field>
      <Field label="Jumlah (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
      </Field>
      {saldoKurang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo {k.labelRek(sumber)} hanya {fmtRp(saldoSumber ?? 0)}, kurang dari {fmtRp(jumlahNum)}.</div>
        </div>
      )}
      {antarEntitas && (
        <Field label={`Penanda antar entitas (${k.entNama(k.entDari(sumber))} → ${k.entNama(k.entDari(tujuan))})`}>
          <select className={inputClass} value={penanda} onChange={(e) => setPenanda(e.target.value)}>
            <option value="">Belum ditandai</option>
            {["modal", "pinjaman", "pelunasan_pinjaman", "dividen"].map((v) => (
              <option key={v} value={v}>{PENANDA_ANTAR_ENTITAS[v]}</option>
            ))}
          </select>
          <div className="text-[11px] text-slate-500 mt-1">Uang pindah antar perusahaan. Penanda dipakai tab Konsolidasi; bisa diisi nanti di Antar Entitas.</div>
        </Field>
      )}
      <Field label="Keterangan">
        <input className={inputClass} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Pengisian kas kecil" />
      </Field>
      <Field label="Bukti Transfer (foto)">
        <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className={fileCls} />
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {foto ? foto.name : 'Boleh dikosongkan — nanti ditandai "Belum ada bukti" dan bisa dilampirkan dari daftar.'}
        </div>
      </Field>
      <button
        disabled={!valid || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Pengisian"}
      </button>
    </ModalShell>
  );
}

// =========================================================
// 2. BUKU KAS
// =========================================================
function csvCell(val) {
  const s = String(val ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BukuKas({ keuanganTransaksi = [], master = {}, showToast }) {
  const k = useDataKas(master, keuanganTransaksi);
  const [pilih, setPilih] = useState(`kas:${KAS_BANK}`);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [q, setQ] = useState("");

  const { data: dataRentang, status: statusLama } = useKeuanganRentang(keuanganTransaksi, dari);
  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];
  const labelKat = (list, kode) => list.find((x) => x.kode === kode)?.label || kode || "";

  const kodeSet = useMemo(() => {
    if (pilih.startsWith("rek:")) return [pilih.slice(4)];
    const kas = pilih.slice(4);
    return k.rekeningList.filter((r) => k.kasDari(r.kode) === kas).map((r) => r.kode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilih, k.rekeningList, master.kas_grup]);
  const modeKas = pilih.startsWith("kas:");

  const { baris, saldoAwal, totalMasuk, totalKeluar, saldoAkhir } = useMemo(() => {
    const inSet = new Set(kodeSet);
    const awal = saldoSebelumTanggal(dataRentang, kodeSet, dari || "0000-01-01");
    const urut = [...dataRentang]
      .filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai))
      .sort(
        (a, b) =>
          ((a.tanggal || "") + (a.created_at || "")).localeCompare((b.tanggal || "") + (b.created_at || "")) ||
          String(a.id).localeCompare(String(b.id))
      );
    let saldo = awal;
    let tm = 0;
    let tk = 0;
    const out = [];
    urut.forEach((t) => {
      const j = Number(t.jumlah) || 0;
      let masuk = 0;
      let keluar = 0;
      let uraian = "";
      let rek = t.rekening;
      if (t.tipe === "masuk" && inSet.has(t.rekening)) {
        masuk = j;
        uraian = labelKat(kategoriMasuk, t.kategori);
      } else if (t.tipe === "keluar" && inSet.has(t.rekening)) {
        keluar = j;
        uraian = labelKat(kategoriKeluar, t.kategori);
      } else if (t.tipe === "transfer") {
        const a = inSet.has(t.rekening);
        const b = inSet.has(t.rekening_tujuan);
        if (a && !b) {
          keluar = j;
          uraian = `Transfer ke ${k.labelRek(t.rekening_tujuan)}`;
        } else if (!a && b) {
          masuk = j;
          rek = t.rekening_tujuan;
          uraian = `Transfer dari ${k.labelRek(t.rekening)}`;
        } else {
          return; // di luar set, atau transfer di dalam set yang sama (saldo set tidak berubah)
        }
      } else {
        return;
      }
      saldo += masuk - keluar;
      tm += masuk;
      tk += keluar;
      out.push({ id: t.id, tanggal: t.tanggal, rek, uraian, keterangan: t.keterangan || "", masuk, keluar, saldo, bukti: t.bukti_url || null });
    });
    return { baris: out, saldoAwal: awal, totalMasuk: tm, totalKeluar: tk, saldoAkhir: saldo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRentang, kodeSet, dari, sampai, master.rekening, master.kategori_masuk, master.kategori_keluar]);

  const tampil = baris.filter((r) => {
    const s = q.trim().toLowerCase();
    return !s || `${r.uraian} ${r.keterangan} ${k.labelRek(r.rek)}`.toLowerCase().includes(s);
  });

  const namaPilihan = modeKas ? `Semua ${LABEL_KAS[pilih.slice(4)]}` : k.labelRek(pilih.slice(4));

  const unduhCsv = () => {
    const lines = [["Tanggal", "Akun", "Uraian", "Keterangan", "Masuk", "Keluar", "Saldo"].map(csvCell).join(";")];
    lines.push(["", "", "Saldo awal", "", "", "", saldoAwal].map(csvCell).join(";"));
    tampil.forEach((r) =>
      lines.push([r.tanggal, k.labelRek(r.rek), r.uraian, r.keterangan, r.masuk || "", r.keluar || "", r.saldo].map(csvCell).join(";"))
    );
    lines.push("");
    lines.push([csvCell("Total Masuk"), csvCell(totalMasuk)].join(";"));
    lines.push([csvCell("Total Keluar"), csvCell(totalKeluar)].join(";"));
    lines.push([csvCell("Saldo Akhir"), csvCell(saldoAkhir)].join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-kas_${namaPilihan.replace(/\s+/g, "-")}_${dari || "awal"}_sd_${sampai || "sekarang"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast?.("Buku kas diunduh");
  };

  return (
    <div>
      {statusLama && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>
      )}
      <PageHeader
        title="Buku Kas"
        description="Buku besar per akun atau per jenis kas: saldo awal, setiap uang masuk/keluar, dan saldo berjalan. Transfer di dalam satu kas tidak ditampilkan karena tidak mengubah saldo kas itu."
        sticky
        action={
          <button
            onClick={unduhCsv}
            disabled={baris.length === 0}
            className="flex items-center gap-1.5 border border-slate-700 hover:border-slate-600 disabled:opacity-40 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Unduh CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={pilih} onChange={(e) => setPilih(e.target.value)} className={`${inputClass} w-auto`} aria-label="Pilih kas atau akun">
          <optgroup label="Per jenis kas">
            {URUTAN_KAS.map((kk) => (
              <option key={kk} value={`kas:${kk}`}>Semua {LABEL_KAS[kk]}</option>
            ))}
          </optgroup>
          {URUTAN_KAS.map((kk) => {
            const items = k.rekeningList.filter((r) => k.kasDari(r.kode) === kk);
            if (!items.length) return null;
            return (
              <optgroup key={kk} label={`Akun ${LABEL_KAS[kk]}`}>
                {items.map((r) => (
                  <option key={r.kode} value={`rek:${r.kode}`}>
                    {r.label}
                    {k.lokasiNama(r.kode) ? ` · ${k.lokasiNama(r.kode)}` : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-xs flex-1 min-w-[160px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari uraian atau keterangan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Saldo Awal" value={fmtRp(saldoAwal)} accent="text-slate-100" icon={Landmark} iconColor="text-slate-400" />
        <StatCard label="Total Masuk" value={fmtRp(totalMasuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Total Keluar" value={fmtRp(totalKeluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard label="Saldo Akhir" value={fmtRp(saldoAkhir)} accent={saldoAkhir >= 0 ? "text-slate-100" : "text-red-400"} icon={Landmark} iconColor="text-slate-400" />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">Tanggal</th>
              {modeKas && <th className="px-2 py-2.5 font-medium">Akun</th>}
              <th className="px-2 py-2.5 font-medium">Uraian</th>
              <th className="px-2 py-2.5 font-medium text-right">Masuk</th>
              <th className="px-2 py-2.5 font-medium text-right">Keluar</th>
              <th className="px-4 py-2.5 font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800/60 bg-slate-900/40">
              <td className="px-4 py-2 text-xs text-slate-500" colSpan={modeKas ? 5 : 4}>Saldo awal ({dari ? formatTanggalID(dari) : "awal"})</td>
              <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{fmtRp(saldoAwal)}</td>
            </tr>
            {tampil.length === 0 ? (
              <tr>
                <td colSpan={modeKas ? 6 : 5} className="p-6"><EmptyState label="Tidak ada mutasi pada rentang ini." /></td>
              </tr>
            ) : (
              tampil.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{formatTanggalID(r.tanggal)}</td>
                  {modeKas && <td className="px-2 py-2 text-xs text-slate-300 whitespace-nowrap">{k.labelRek(r.rek)}</td>}
                  <td className="px-2 py-2 text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span>{r.uraian}</span>
                      {r.bukti && (
                        <a href={r.bukti} target="_blank" rel="noreferrer" title="Lihat bukti transfer" className="text-emerald-400 hover:text-emerald-300">
                          <Paperclip size={12} />
                        </a>
                      )}
                    </div>
                    {r.keterangan && <div className="text-[11px] text-slate-500 truncate max-w-[320px]">{r.keterangan}</div>}
                  </td>
                  <td className="px-2 py-2 text-right text-emerald-400 whitespace-nowrap">{r.masuk ? fmtRp(r.masuk) : ""}</td>
                  <td className="px-2 py-2 text-right text-red-400 whitespace-nowrap">{r.keluar ? fmtRp(r.keluar) : ""}</td>
                  <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${r.saldo < 0 ? "text-red-400" : ""}`}>{fmtRp(r.saldo)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {q.trim() && baris.length !== tampil.length && (
        <div className="text-[11px] text-slate-500 mt-2">
          Menampilkan {tampil.length} dari {baris.length} mutasi. Saldo berjalan tetap dihitung dari seluruh mutasi.
        </div>
      )}
    </div>
  );
}

// =========================================================
// 3. REKONSILIASI KAS
// =========================================================
function InputSaldoFisik({ value, onChange }) {
  const tampil = value === "" || value == null ? "" : Number(value).toLocaleString("id-ID");
  return (
    <input
      type="text"
      inputMode="numeric"
      value={tampil}
      placeholder="Isi saldo fisik"
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "");
        onChange(d === "" ? "" : Number(d));
      }}
      className="w-36 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-right text-slate-100 outline-none focus:border-amber-500"
    />
  );
}

export function RekonsiliasiKas({ keuanganTransaksi = [], master = {}, reload, showToast, session }) {
  const k = useDataKas(master, keuanganTransaksi);
  const [riwayat, setRiwayat] = useState(null);
  const [errRiwayat, setErrRiwayat] = useState("");
  const [jenisTab, setJenisTab] = useState("semua");
  const [fisik, setFisik] = useState({});
  const [catatan, setCatatan] = useState({});
  const [sesuaikan, setSesuaikan] = useState({});
  const [katMasuk, setKatMasuk] = useState("");
  const [katKeluar, setKatKeluar] = useState("");
  const [saving, setSaving] = useState(false);

  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];

  const muatRiwayat = useCallback(async () => {
    try {
      const rows = await sb("rekonsiliasi_kas?select=*&order=tanggal.desc,created_at.desc&limit=300");
      setRiwayat(rows || []);
      setErrRiwayat("");
    } catch (e) {
      setErrRiwayat(e?.message || "Gagal memuat riwayat rekonsiliasi");
      setRiwayat([]);
    }
  }, []);
  useEffect(() => {
    muatRiwayat();
  }, [muatRiwayat]);

  // Tebakan awal kategori penyesuaian: yang namanya mengandung "selisih"/"penyesuaian".
  useEffect(() => {
    const cari = (list) => list.find((x) => /selisih|penyesuaian/i.test(x.label || ""))?.kode || "";
    setKatMasuk((v) => v || cari(kategoriMasuk));
    setKatKeluar((v) => v || cari(kategoriKeluar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.kategori_masuk, master.kategori_keluar]);

  const terakhir = useMemo(() => {
    const m = {};
    (riwayat || []).forEach((r) => {
      if (!m[r.rekening]) m[r.rekening] = r; // riwayat sudah terurut terbaru dulu
    });
    return m;
  }, [riwayat]);

  const baris = k.rekeningList
    .filter((r) => jenisTab === "semua" || k.kasDari(r.kode) === jenisTab)
    .sort(k.urutKas)
    .map((r) => {
      const sistem = Math.round((k.saldoMap.get(r.kode) || 0) * 100) / 100;
      const terisi = fisik[r.kode] !== undefined && fisik[r.kode] !== "";
      const selisih = terisi ? Math.round((Number(fisik[r.kode]) - sistem) * 100) / 100 : null;
      return { ...r, kas: k.kasDari(r.kode), sistem, terisi, selisih };
    });

  const terisiSemua = baris.filter((r) => r.terisi);
  const adaSelisih = terisiSemua.filter((r) => r.selisih !== 0);
  const jumlahPenyesuaian = adaSelisih.filter((r) => sesuaikan[r.kode]).length;

  const simpan = async () => {
    if (!terisiSemua.length) {
      showToast?.("Isi saldo fisik minimal satu akun dulu", "err");
      return;
    }
    for (const r of adaSelisih) {
      if (sesuaikan[r.kode] && !(r.selisih > 0 ? katMasuk : katKeluar)) {
        showToast?.(`Pilih kategori ${r.selisih > 0 ? "pemasukan" : "pengeluaran"} untuk penyesuaian dulu`, "err");
        return;
      }
    }
    if (jumlahPenyesuaian > 0 && !window.confirm(`Akan mencatat ${jumlahPenyesuaian} transaksi penyesuaian ke Keuangan agar saldo sistem sama dengan saldo fisik. Lanjut?`)) {
      return;
    }
    setSaving(true);
    const tanggal = hariIniLokal();
    const selesai = [];
    try {
      for (const r of terisiSemua) {
        const cat = (catatan[r.kode] || "").trim();
        let penyesuaianId = null;
        if (r.selisih !== 0 && sesuaikan[r.kode]) {
          const res = await sb("keuangan_transaksi", {
            method: "POST",
            body: JSON.stringify({
              tanggal,
              tipe: r.selisih > 0 ? "masuk" : "keluar",
              rekening: r.kode,
              kategori: r.selisih > 0 ? katMasuk : katKeluar,
              jumlah: Math.abs(r.selisih),
              keterangan: `Penyesuaian rekonsiliasi kas${cat ? ` — ${cat}` : ""}`,
            }),
          });
          penyesuaianId = res?.[0]?.id ?? null;
        }
        await sb("rekonsiliasi_kas", {
          method: "POST",
          body: JSON.stringify({
            tanggal,
            rekening: r.kode,
            saldo_sistem: r.sistem,
            saldo_fisik: Number(fisik[r.kode]),
            selisih: r.selisih,
            status: r.selisih === 0 ? "sesuai" : penyesuaianId ? "disesuaikan" : "selisih",
            catatan: cat || null,
            penyesuaian_id: penyesuaianId,
            dicatat_oleh: session?.username || null,
          }),
        });
        selesai.push(r.kode);
      }
      showToast?.(`${selesai.length} akun direkonsiliasi${jumlahPenyesuaian ? `, ${jumlahPenyesuaian} penyesuaian dicatat` : ""}`);
    } catch (e) {
      showToast?.(`${e.message || "Gagal menyimpan"}${selesai.length ? ` (${selesai.length} akun sebelumnya sudah tersimpan)` : ""}`, "err");
    } finally {
      const bersih = (obj) => {
        const n = { ...obj };
        selesai.forEach((kode) => delete n[kode]);
        return n;
      };
      setFisik(bersih);
      setCatatan(bersih);
      setSesuaikan(bersih);
      await Promise.all([muatRiwayat(), reload?.()]);
      setSaving(false);
    }
  };

  const status = (r) => {
    if (!r.terisi) return null;
    if (r.selisih === 0) return <Badge color="emerald">Sesuai</Badge>;
    return <Badge color="amber">{r.selisih > 0 ? "Lebih" : "Kurang"} {fmtRp(Math.abs(r.selisih))}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Rekonsiliasi Kas"
        description="Cocokkan saldo menurut aplikasi dengan uang fisik (kas) atau mutasi rekening (bank). Isi saldo fisik tiap akun yang dicek, lalu simpan sekaligus. Selisih bisa langsung dicatat sebagai transaksi penyesuaian."
        sticky
        action={
          <button
            onClick={simpan}
            disabled={saving || terisiSemua.length === 0}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Check size={14} /> {saving ? "Menyimpan…" : `Simpan Rekonsiliasi${terisiSemua.length ? ` (${terisiSemua.length})` : ""}`}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex flex-wrap gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
          {[{ key: "semua", label: "Semua" }, ...URUTAN_KAS.map((kk) => ({ key: kk, label: LABEL_KAS[kk] }))].map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setJenisTab(tb.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${jenisTab === tb.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            muatRiwayat();
            reload?.();
          }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          title="Muat ulang saldo & riwayat"
        >
          <RefreshCw size={12} /> Muat ulang
        </button>
      </div>

      {errRiwayat && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">
          Riwayat rekonsiliasi belum bisa dimuat ({errRiwayat}). Pastikan fase3_alur_kas.sql sudah dijalankan di database.
        </div>
      )}

      <div className="rounded-xl border border-slate-800 overflow-x-auto mb-4">
        {baris.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada akun kas." /></div>
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 font-medium">Akun</th>
                <th className="px-2 py-2.5 font-medium">Jenis · Lokasi</th>
                <th className="px-2 py-2.5 font-medium text-right">Saldo Sistem</th>
                <th className="px-2 py-2.5 font-medium text-right">Saldo Fisik / Bank</th>
                <th className="px-2 py-2.5 font-medium">Hasil</th>
                <th className="px-2 py-2.5 font-medium">Terakhir Dicek</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((r) => {
                const t = terakhir[r.kode];
                return (
                  <tr key={r.kode} className="border-b border-slate-800/60 last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      <div className="text-slate-200">{r.label}</div>
                      <div className="font-mono text-[11px] text-amber-400">{r.kode}</div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {LABEL_KAS[r.kas]}
                      {k.lokasiNama(r.kode) ? ` · ${k.lokasiNama(r.kode)}` : ""}
                    </td>
                    <td className={`px-2 py-2.5 text-right font-semibold whitespace-nowrap ${r.sistem < 0 ? "text-red-400" : ""}`}>{fmtRp(r.sistem)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <InputSaldoFisik value={fisik[r.kode] ?? ""} onChange={(v) => setFisik((p) => ({ ...p, [r.kode]: v }))} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col gap-1.5 items-start">
                        {status(r)}
                        {r.terisi && r.selisih !== 0 && (
                          <>
                            <input
                              value={catatan[r.kode] || ""}
                              onChange={(e) => setCatatan((p) => ({ ...p, [r.kode]: e.target.value }))}
                              placeholder="Catatan penyebab (opsional)"
                              className="w-52 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-amber-500"
                            />
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!sesuaikan[r.kode]}
                                onChange={(e) => setSesuaikan((p) => ({ ...p, [r.kode]: e.target.checked }))}
                              />
                              Catat penyesuaian {r.selisih > 0 ? "(+)" : "(−)"} {fmtRp(Math.abs(r.selisih))}
                            </label>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                      {t ? (
                        <>
                          {formatTanggalID(t.tanggal)}
                          <div className={Number(t.selisih) === 0 ? "text-emerald-500" : "text-amber-500"}>
                            {Number(t.selisih) === 0 ? "Sesuai" : `Selisih ${fmtRp(t.selisih)}`}
                          </div>
                        </>
                      ) : (
                        "Belum pernah"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {jumlahPenyesuaian > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 mb-4">
          <div className="text-xs text-slate-300 mb-2">Kategori untuk transaksi penyesuaian (dipakai semua akun yang dicentang)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Kalau uang fisik LEBIH banyak (pemasukan)</div>
              <select className={`${inputClass} w-full`} value={katMasuk} onChange={(e) => setKatMasuk(e.target.value)}>
                <option value="">Pilih kategori pemasukan…</option>
                {kategoriMasuk.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Kalau uang fisik KURANG (pengeluaran)</div>
              <select className={`${inputClass} w-full`} value={katKeluar} onChange={(e) => setKatKeluar(e.target.value)}>
                <option value="">Pilih kategori pengeluaran…</option>
                {kategoriKeluar.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="text-sm font-semibold text-slate-200 mb-2">Riwayat Rekonsiliasi</div>
      {riwayat === null ? (
        <div className="text-xs text-slate-500">Memuat…</div>
      ) : riwayat.length === 0 ? (
        <EmptyState label="Belum ada rekonsiliasi yang tersimpan." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 font-medium">Tanggal</th>
                <th className="px-2 py-2.5 font-medium">Akun</th>
                <th className="px-2 py-2.5 font-medium text-right">Sistem</th>
                <th className="px-2 py-2.5 font-medium text-right">Fisik</th>
                <th className="px-2 py-2.5 font-medium text-right">Selisih</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="px-2 py-2.5 font-medium">Catatan</th>
                <th className="px-4 py-2.5 font-medium">Oleh</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.slice(0, 60).map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">{formatTanggalID(r.tanggal)}</td>
                  <td className="px-2 py-2 text-slate-200">{k.labelRek(r.rekening)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtRp(r.saldo_sistem)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtRp(r.saldo_fisik)}</td>
                  <td className={`px-2 py-2 text-right whitespace-nowrap ${Number(r.selisih) === 0 ? "text-emerald-400" : "text-amber-400"}`}>{fmtRp(r.selisih)}</td>
                  <td className="px-2 py-2">
                    <Badge color={r.status === "sesuai" ? "emerald" : r.status === "disesuaikan" ? "sky" : "amber"}>
                      {r.status === "sesuai" ? "Sesuai" : r.status === "disesuaikan" ? "Disesuaikan" : "Selisih"}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-slate-500 max-w-[220px] truncate">{r.catatan || ""}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">{r.dicatat_oleh || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {riwayat && riwayat.length > 60 && <div className="text-[11px] text-slate-500 mt-2">Menampilkan 60 rekonsiliasi terbaru dari {riwayat.length}.</div>}
    </div>
  );
}