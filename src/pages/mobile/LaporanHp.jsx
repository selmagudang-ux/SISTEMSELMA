import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, Copy, Download, FileText, X,
  TrendingUp, TrendingDown, Wallet, Landmark, Scale, MessageCircle,
} from "lucide-react";
import { formatTanggalID } from "../../components/ui";
import {
  sb, sbAll, fmtRp, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  lingkupEntitas, ringkasanKeuangan, saldoPerRekening, saldoPerKas, petaKasRekening, kasDariRekening,
  arusKasPerPeriode, breakdownPengeluaranKategori, breakdownPemasukanKategori, kelompokkanBreakdown,
  laporanLabaRugi, setoranSebagaiPemasukan, saringLabaRugi, downloadCsv,
  setSaldoDasarRekening, resetKeuanganLama, awalRentangKeuanganDefault,
  LABEL_KAS, URUTAN_KAS, ENTITAS_DEFAULT,
} from "../../lib/api";
import { useKeuanganRentang } from "../../lib/useKeuanganRentang";
import { useHppPenjualan } from "../../lib/hppPenjualan";
import { usePersediaanBarang } from "../kasir/persediaanToko";
import { useDataNeraca } from "../../lib/neracaData";
import { buatLaporanNarasi } from "../../lib/laporanNarasi";

// =========================================================
// VERSI HP — KEUANGAN > Laporan (file LaporanHp.jsx)
// Empat tab, tampilan KARTU (bukan tabel lebar):
//   1. Saldo Kas   : total Uang Cash / Saldo Bank + saldo tiap rekening (posisi hari ini).
//   2. Arus Kas    : kas masuk, kas keluar, saldo, grafik batang per hari/minggu, rincian per kategori.
//   3. Laba Rugi   : pendapatan, HPP, laba kotor, beban, laba bersih + margin. Ketuk kategori = lihat transaksinya.
//   4. Neraca      : aktiva & pasiva (pos yang sudah terhubung: Kas Kecil, Bank, Persediaan).
// Rumus SAMA dengan versi komputer (Keuangan.jsx > LaporanKeuangan): lib/api.js, useKeuanganRentang,
// useHppPenjualan, usePersediaanBarang. Dikunci ke PT akun yang login (lingkupEntitas).
// Hanya-baca: tidak ada yang diubah dari layar ini.
// Yang BELUM ada di HP (masih di komputer): Saldo Awal Bulan (ubah manual), Laporan Bulanan / Rekap Tahunan (PDF),
// daftar item HPP bermasalah.
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
const awalTahun = () => `${new Date().getFullYear()}-01-01`;

const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

// Angka negatif gaya akuntansi: (1.000.000)
const fmtAkun = (v) => (v < 0 ? `(${fmtRp(Math.abs(v)).replace("Rp ", "")})` : fmtRp(v));

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

const TAB = [
  { key: "saldo", label: "Saldo Kas" },
  { key: "arus", label: "Arus Kas" },
  { key: "labarugi", label: "Laba Rugi" },
  { key: "neraca", label: "Neraca" },
];

const inputCls =
  "w-full rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5 text-sm text-md-on-surface outline-none focus:border-md-primary";

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

function Peringatan({ children }) {
  return <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2">{children}</div>;
}

function KotakAngka({ label, nilai, warna = "text-md-on-surface", Ikon }) {
  return (
    <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-md-on-surface-variant">
        {Ikon && <Ikon size={12} />} {label}
      </div>
      <div className={`text-sm font-bold break-words ${warna}`}>{nilai}</div>
    </div>
  );
}

// ---------------------------------------------------------
// Pilih periode (dipakai tab Arus Kas & Laba Rugi)
// ---------------------------------------------------------
function PilihPeriode({ dari, sampai, setDari, setSampai }) {
  const cepat = [
    { label: "Bulan ini", d: awalBulan(), s: hariIni() },
    { label: "Bulan lalu", d: awalBulan(-1), s: akhirBulan(-1) },
    { label: "3 bulan", d: awalBulan(-2), s: hariIni() },
    { label: "Tahun ini", d: awalTahun(), s: hariIni() },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
        {cepat.map((c) => (
          <ChipTab key={c.label} aktif={dari === c.d && sampai === c.s} onClick={() => { setDari(c.d); setSampai(c.s); }}>
            {c.label}
          </ChipTab>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-md-on-surface-variant">Dari</span>
          <input type="date" className={inputCls} value={dari} max={sampai || undefined} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[11px] text-md-on-surface-variant">Sampai</span>
          <input type="date" className={inputCls} value={sampai} min={dari || undefined} onChange={(e) => setSampai(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Bottom sheet rincian transaksi satu kategori
// ---------------------------------------------------------
function kodeDaun(d) {
  return d.isGrup ? (d.anak || []).flatMap(kodeDaun) : [d.kode];
}

function SheetRincian({ kategori, list, rekeningList, subtitle, onClose }) {
  const kodes = useMemo(() => new Set(kodeDaun(kategori)), [kategori]);
  const baris = useMemo(
    () =>
      list
        .filter((t) => t.tipe === kategori.tipe && kodes.has(t.kategori || ""))
        .sort((a, b) => (b.tanggal + (b.created_at || "")).localeCompare(a.tanggal + (a.created_at || ""))),
    [list, kategori, kodes]
  );
  const total = baris.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-h-[80dvh] rounded-t-3xl bg-md-surface flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-md-outline-variant">
          <div className="min-w-0">
            <div className="font-bold text-sm text-md-on-surface truncate">{kategori.label}</div>
            <div className="text-[11px] text-md-on-surface-variant">{subtitle}</div>
            <div className={`text-sm font-bold mt-1 ${kategori.tipe === "masuk" ? "text-emerald-500" : "text-red-500"}`}>
              {fmtRp(total)} <span className="text-[11px] font-normal text-md-on-surface-variant">· {baris.length} transaksi</span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-md-on-surface/10" title="Tutup">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {baris.length === 0 && <div className="text-center text-xs text-md-on-surface-variant py-6">Tidak ada transaksi.</div>}
          {baris.map((t) => (
            <div key={t.id} className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-md-on-surface-variant">{formatTanggalID(t.tanggal)}</span>
                <span className="text-sm font-semibold text-md-on-surface">{fmtRp(Number(t.jumlah) || 0)}</span>
              </div>
              {t.keterangan && <div className="text-xs text-md-on-surface mt-0.5 break-words">{t.keterangan}</div>}
              <div className="text-[11px] text-md-on-surface-variant mt-0.5">{labelDari(rekeningList, t.rekening)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Baris kategori (bertingkat) — dipakai Arus Kas & Laba Rugi
// ---------------------------------------------------------
function BarisKategori({ d, depth, seksi, terbuka, toggle, onDetail, warna, tampilBar }) {
  const kunci = `${seksi}:${d.kode}`;
  const open = d.isGrup && terbuka.has(kunci);
  const klik = () => (d.isGrup ? toggle(kunci) : onDetail({ tipe: seksi, kode: d.kode, label: d.label, isGrup: false, anak: d.anak }));
  return (
    <>
      <button
        type="button"
        onClick={klik}
        className="w-full text-left py-2 active:bg-md-on-surface/5 rounded-lg"
        style={{ paddingLeft: depth * 14 }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 min-w-0 text-xs text-md-on-surface">
            {d.isGrup ? (open ? <ChevronDown size={13} className="flex-shrink-0 text-md-on-surface-variant" /> : <ChevronRight size={13} className="flex-shrink-0 text-md-on-surface-variant" />) : <span className="w-[13px] flex-shrink-0" />}
            <span className={`truncate ${d.isGrup ? "font-semibold" : ""}`}>{d.label}</span>
            {d.isGrup && <span className="text-[10px] text-md-on-surface-variant">({d.anak.length})</span>}
          </span>
          <span className="text-xs font-semibold text-md-on-surface whitespace-nowrap">{fmtRp(d.jumlah)}</span>
        </div>
        {tampilBar && (
          <div className="flex items-center gap-2 mt-1 pl-[17px]">
            <div className="flex-1 h-1.5 rounded-full bg-md-on-surface/10 overflow-hidden">
              <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, Math.max(0, d.persen || 0))}%` }} />
            </div>
            <span className="text-[10px] text-md-on-surface-variant w-10 text-right">{(Math.round((d.persen || 0) * 10) / 10).toLocaleString("id-ID")}%</span>
          </div>
        )}
      </button>
      {open &&
        d.anak.map((c) => (
          <BarisKategori key={c.kode || c.label} d={c} depth={depth + 1} seksi={seksi} terbuka={terbuka} toggle={toggle} onDetail={onDetail} warna={warna} tampilBar={tampilBar} />
        ))}
    </>
  );
}

function useBukaTutup() {
  const [terbuka, setTerbuka] = useState(() => new Set());
  const toggle = useCallback(
    (k) =>
      setTerbuka((s) => {
        const n = new Set(s);
        n.has(k) ? n.delete(k) : n.add(k);
        return n;
      }),
    []
  );
  return { terbuka, toggle };
}

function KartuBreakdown({ judul, total, data, seksi, warnaTeks, warnaBar, onDetail, terbuka, toggle, kosong }) {
  return (
    <section className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-md-on-surface">{judul}</h3>
        <span className={`text-sm font-bold ${warnaTeks}`}>{fmtRp(total)}</span>
      </div>
      {data.length === 0 ? (
        <div className="text-center text-xs text-md-on-surface-variant py-4">{kosong}</div>
      ) : (
        <div className="divide-y divide-md-outline-variant/50">
          {data.map((d) => (
            <BarisKategori key={d.kode || d.label} d={d} depth={0} seksi={seksi} terbuka={terbuka} toggle={toggle} onDetail={onDetail} warna={warnaBar} tampilBar />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// 1. SALDO KAS
// ---------------------------------------------------------
function TabSaldoKas({ saldoRekening, saldoKas, petaKas }) {
  const totalSemua = URUTAN_KAS.reduce((a, k) => a + (saldoKas[k] || 0), 0);
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-md-on-surface">Saldo Saat Ini</h3>
          <p className="text-[11px] text-md-on-surface-variant">Posisi hari ini — akumulasi semua transaksi sejak awal dicatat. Tidak terpengaruh filter tanggal.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {URUTAN_KAS.map((k) => (
            <KotakAngka key={k} label={`Total ${LABEL_KAS[k]}`} nilai={fmtRp(saldoKas[k] || 0)} warna={(saldoKas[k] || 0) >= 0 ? "text-md-on-surface" : "text-red-500"} />
          ))}
        </div>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <div className="text-[11px] font-medium text-amber-500">Total Semua Kas</div>
          <div className={`text-lg font-bold ${totalSemua >= 0 ? "text-md-on-surface" : "text-red-500"}`}>{fmtRp(totalSemua)}</div>
        </div>
      </section>

      <div className="text-[11px] text-md-on-surface-variant px-1">Saldo per rekening</div>
      {saldoRekening.length === 0 && <div className="rounded-xl bg-md-container text-md-on-surface-variant text-xs px-4 py-6 text-center">Belum ada rekening.</div>}
      <div className="space-y-2">
        {saldoRekening.map((r) => (
          <div key={r.kode} className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm text-md-on-surface">
                <Landmark size={13} className="flex-shrink-0 text-md-on-surface-variant" />
                <span className="truncate">{r.label}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-md-on-surface/10 text-md-on-surface-variant">{LABEL_KAS[kasDariRekening(petaKas, r.kode)]}</span>
            </div>
            <div className={`text-sm font-bold whitespace-nowrap ${r.saldo >= 0 ? "text-md-on-surface" : "text-red-500"}`}>{fmtRp(r.saldo)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// 2. ARUS KAS
// ---------------------------------------------------------
function GrafikArus({ mode, data }) {
  if (!data.length) return null;
  const maks = Math.max(1, ...data.map((d) => Math.max(d.masuk, d.keluar)));
  return (
    <section className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-md-on-surface">Arus Kas {mode === "mingguan" ? "Mingguan" : "Harian"}</h3>
        <div className="flex items-center gap-2 text-[10px] text-md-on-surface-variant">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Masuk</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Keluar</span>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
        {[...data].reverse().map((d) => (
          <div key={d.key}>
            <div className="text-[11px] text-md-on-surface-variant mb-0.5">{d.label}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-md-on-surface/10 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${(d.masuk / maks) * 100}%` }} />
              </div>
              <span className="text-[11px] w-24 text-right text-emerald-500">{fmtRp(d.masuk)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-2 rounded-full bg-md-on-surface/10 overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${(d.keluar / maks) * 100}%` }} />
              </div>
              <span className="text-[11px] w-24 text-right text-red-500">{fmtRp(d.keluar)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TabArusKas({ ringkas, arusKas, breakdownMasuk, breakdownKeluar, dataMasukGrup, dataKeluarGrup, onDetail }) {
  const mk = useBukaTutup();
  const kl = useBukaTutup();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <KotakAngka label="Kas Masuk" nilai={fmtRp(ringkas.masuk)} warna="text-emerald-500" Ikon={TrendingUp} />
        <KotakAngka label="Kas Keluar" nilai={fmtRp(ringkas.keluar)} warna="text-red-500" Ikon={TrendingDown} />
      </div>
      <KotakAngka label="Saldo (Masuk − Keluar)" nilai={fmtAkun(ringkas.saldo)} warna={ringkas.saldo >= 0 ? "text-emerald-500" : "text-red-500"} Ikon={Wallet} />
      <GrafikArus mode={arusKas.mode} data={arusKas.data} />
      <KartuBreakdown judul="Pemasukan per Kategori" total={breakdownMasuk.total} data={dataMasukGrup} seksi="masuk" warnaTeks="text-emerald-500" warnaBar="bg-emerald-500" onDetail={onDetail} terbuka={mk.terbuka} toggle={mk.toggle} kosong="Belum ada pemasukan pada rentang ini." />
      <KartuBreakdown judul="Pengeluaran per Kategori" total={breakdownKeluar.total} data={dataKeluarGrup} seksi="keluar" warnaTeks="text-red-500" warnaBar="bg-red-500" onDetail={onDetail} terbuka={kl.terbuka} toggle={kl.toggle} kosong="Belum ada pengeluaran pada rentang ini." />
    </div>
  );
}

// ---------------------------------------------------------
// 3. LABA RUGI
// ---------------------------------------------------------
function SeksiLR({ judul, warnaHead, total, warnaTotal, children }) {
  return (
    <div>
      <div className={`px-3 py-2 text-xs font-bold ${warnaHead}`}>{judul}</div>
      <div className="px-3 divide-y divide-md-outline-variant/50">{children}</div>
      <div className="flex items-center justify-between px-3 py-2 bg-md-on-surface/5">
        <span className="text-xs font-semibold text-md-on-surface">Total {judul.split(" (")[0].toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
        <span className={`text-xs font-bold ${warnaTotal}`}>{total}</span>
      </div>
    </div>
  );
}

function TabLabaRugi({ lr, hpp, subtitle, onDetail }) {
  const mk = useBukaTutup();
  const kl = useBukaTutup();
  const untung = lr.labaRugi >= 0;
  const baris = [
    ["marketplace", "HPP Marketplace"],
    ["grosir", "HPP Grosir"],
    ["toko", "HPP Toko"],
  ];
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-4 border ${untung ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
        <div className="flex items-center gap-1.5 text-[11px] text-md-on-surface-variant"><Scale size={12} /> Laba (Rugi) Bersih · {subtitle}</div>
        <div className={`text-2xl font-bold ${untung ? "text-emerald-500" : "text-red-500"}`}>{fmtAkun(lr.labaRugi)}</div>
        <div className="text-[11px] text-md-on-surface-variant mt-0.5">Margin {(Math.round(lr.marginPersen * 10) / 10).toLocaleString("id-ID")}%</div>
      </div>

      <div className="rounded-2xl bg-md-container border border-md-outline-variant overflow-hidden divide-y divide-md-outline-variant">
        <SeksiLR judul="PENDAPATAN" warnaHead="text-emerald-500 bg-emerald-500/5" total={fmtRp(lr.pendapatan.total)} warnaTotal="text-emerald-500">
          {lr.pendapatan.data.length === 0 ? (
            <div className="text-center text-xs text-md-on-surface-variant py-3">Belum ada pendapatan pada rentang ini.</div>
          ) : (
            lr.pendapatan.data.map((d) => <BarisKategori key={d.kode || d.label} d={d} depth={0} seksi="masuk" terbuka={mk.terbuka} toggle={mk.toggle} onDetail={onDetail} />)
          )}
        </SeksiLR>

        {hpp && (
          <div>
            <div className="px-3 py-2 text-xs font-bold text-orange-500 bg-orange-500/5">HARGA POKOK PENJUALAN (HPP)</div>
            <div className="px-3 divide-y divide-md-outline-variant/50">
              {baris.map(([k, label]) => (
                <div key={k} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-md-on-surface">{label}</span>
                    <span className="text-xs font-semibold text-md-on-surface">{fmtRp(hpp[k] || 0)}</span>
                  </div>
                  {hpp.galat?.[k] && <div className="text-[11px] text-amber-500">Gagal dimuat: {hpp.galat[k]}</div>}
                  {hpp.catatan?.[k] && <div className="text-[11px] text-amber-500">{hpp.catatan[k]}</div>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-md-on-surface/5">
              <span className="text-xs font-semibold text-md-on-surface">Total HPP</span>
              <span className="text-xs font-bold text-orange-500">{fmtRp(hpp.total)}</span>
            </div>
            {hpp.tanpaHpp > 0 && (
              <div className="px-3 py-2 text-[11px] text-amber-500">
                {hpp.tanpaHpp} baris/SKU terjual belum punya HPP, dihitung Rp 0. Lengkapi HPP di Master Barang (versi komputer) supaya laba tidak terlihat terlalu besar.
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-2 bg-md-on-surface/5 border-t border-md-outline-variant">
              <span className="text-xs font-semibold text-md-on-surface">Laba Kotor</span>
              <span className="text-xs font-bold text-md-on-surface">{fmtAkun(lr.labaKotor)}</span>
            </div>
          </div>
        )}

        <SeksiLR judul="BEBAN (PENGELUARAN)" warnaHead="text-red-500 bg-red-500/5" total={fmtRp(lr.beban.total)} warnaTotal="text-red-500">
          {lr.beban.data.length === 0 ? (
            <div className="text-center text-xs text-md-on-surface-variant py-3">Belum ada beban pada rentang ini.</div>
          ) : (
            lr.beban.data.map((d) => <BarisKategori key={d.kode || d.label} d={d} depth={0} seksi="keluar" terbuka={kl.terbuka} toggle={kl.toggle} onDetail={onDetail} />)
          )}
        </SeksiLR>
      </div>
      <p className="text-[11px] text-md-on-surface-variant px-1">Ketuk kategori untuk melihat transaksinya. Ketuk kelompok untuk membuka isinya.</p>
    </div>
  );
}

// ---------------------------------------------------------
// 4. NERACA (struktur sama dengan versi komputer)
// ---------------------------------------------------------
const NERACA_STRUKTUR = {
  aktiva: [
    {
      kunci: "lancar",
      judul: "Aktiva Lancar",
      baris: [
        { kunci: "kas_kecil", label: "Kas Kecil" },
        { kunci: "bank", label: "Bank" },
        { kunci: "saldo_marketplace", label: "Saldo Marketplace" },
        { kunci: "piutang_grosir", label: "Piutang Grosir" },
        { kunci: "piutang_pemilik", label: "Piutang Pemilik" },
        { kunci: "piutang_antar_entitas", label: "Piutang Antar Entitas" },
        { kunci: "persediaan", label: "Persediaan Barang" },
        { kunci: "uang_muka", label: "Uang Muka" },
      ],
    },
    {
      kunci: "tetap",
      judul: "Aktiva Tetap",
      baris: [
        { kunci: "peralatan", label: "Peralatan & Perlengkapan" },
        { kunci: "kendaraan", label: "Kendaraan" },
        { kunci: "akum_penyusutan", label: "Akumulasi Penyusutan", pengurang: true },
      ],
    },
  ],
  pasiva: [
    {
      kunci: "kewajiban",
      judul: "Kewajiban (Utang)",
      baris: [
        { kunci: "titipan_deposit", label: "Titipan Deposit Reseller / Mitra" },
        { kunci: "utang_supplier", label: "Utang ke Supplier" },
        { kunci: "utang_pusat", label: "Utang Pusat" },
        { kunci: "utang_lain", label: "Utang Lain" },
      ],
    },
    {
      kunci: "modal",
      judul: "Modal (Ekuitas)",
      baris: [
        { kunci: "modal_disetor", label: "Modal Disetor Pemilik" },
        { kunci: "prive", label: "Prive / Dividen", pengurang: true },
        { kunci: "laba_ditahan", label: "Laba Ditahan" },
        { kunci: "laba_berjalan", label: "Laba (Rugi) Tahun Berjalan" },
      ],
    },
  ],
};

function TabNeraca({ nilai, memuatPersediaan, galatPersediaan, rincianPersediaan }) {
  const angka = (k) => (nilai[k] === undefined || nilai[k] === null ? null : Number(nilai[k]) || 0);
  const totalKelompok = (g) => g.baris.reduce((a, b) => a + (b.pengurang ? -1 : 1) * (angka(b.kunci) || 0), 0);
  const totalSisi = (s) => NERACA_STRUKTUR[s].reduce((a, g) => a + totalKelompok(g), 0);
  const totalAktiva = totalSisi("aktiva");
  const totalPasiva = totalSisi("pasiva");
  const selisih = totalAktiva - totalPasiva;
  const adaIsi = Object.values(nilai).some((v) => v !== undefined && v !== null);
  const tampil = (v, pengurang) => (v === null ? "-" : pengurang ? `(${fmtRp(v)})` : fmtRp(v));

  const Sisi = ({ sisi, judul, warna, total }) => (
    <div className="rounded-2xl bg-md-container border border-md-outline-variant overflow-hidden">
      <div className={`px-3 py-2.5 text-sm font-bold ${warna}`}>{judul}</div>
      {NERACA_STRUKTUR[sisi].map((g) => (
        <div key={g.kunci}>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-md-on-surface-variant bg-md-on-surface/5">{g.judul}</div>
          <div className="px-3 divide-y divide-md-outline-variant/50">
            {g.baris.map((b) => {
              const v = angka(b.kunci);
              return (
                <div key={b.kunci} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="text-md-on-surface">
                    {b.label}
                    {b.pengurang && <span className="text-md-on-surface-variant"> (pengurang)</span>}
                  </span>
                  <span className={`whitespace-nowrap ${v === null ? "text-md-on-surface-variant" : "text-md-on-surface font-medium"}`}>{tampil(v, b.pengurang)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-medium bg-md-on-surface/5">
            <span className="text-md-on-surface-variant">Total {g.judul}</span>
            <span className="text-md-on-surface">{adaIsi ? fmtRp(totalKelompok(g)) : "-"}</span>
          </div>
        </div>
      ))}
      <div className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-bold ${warna}`}>
        <span>Total {judul}</span>
        <span>{adaIsi ? fmtRp(total) : "-"}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-md-on-surface-variant px-1">Posisi per {formatTanggalID(hariIni())}</div>
      {memuatPersediaan && <Peringatan>Memuat nilai persediaan barang…</Peringatan>}
      {galatPersediaan && <Peringatan>Persediaan gagal dimuat: {galatPersediaan}</Peringatan>}
      <Sisi sisi="aktiva" judul="AKTIVA" warna="text-emerald-500 bg-emerald-500/5" total={totalAktiva} />
      <Sisi sisi="pasiva" judul="PASIVA" warna="text-sky-400 bg-sky-500/5" total={totalPasiva} />
      {rincianPersediaan && (
        <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-3 text-xs space-y-1">
          <div className="font-semibold text-md-on-surface">Rincian Persediaan Barang (stok × HPP)</div>
          <div className="flex justify-between gap-3 text-md-on-surface-variant">
            <span>Gudang (Master Barang) · {rincianPersediaan.gudang.pcs} pcs, {rincianPersediaan.gudang.jenis} SKU</span>
            <span className="text-md-on-surface whitespace-nowrap">{fmtRp(rincianPersediaan.gudang.nilai)}</span>
          </div>
          <div className="flex justify-between gap-3 text-md-on-surface-variant">
            <span>Toko (Barang Toko) · {rincianPersediaan.toko.pcs} pcs, {rincianPersediaan.toko.jenis} jenis</span>
            <span className="text-md-on-surface whitespace-nowrap">{fmtRp(rincianPersediaan.toko.nilai)}</span>
          </div>
          {(rincianPersediaan.gudang.tanpaHpp > 0 || rincianPersediaan.toko.tanpaHpp > 0) && (
            <div className="text-amber-500">
              Ber-stok tapi tanpa HPP (dihitung Rp 0): {rincianPersediaan.gudang.tanpaHpp} SKU gudang, {rincianPersediaan.toko.tanpaHpp} barang toko.
            </div>
          )}
        </div>
      )}
      <div
        className={`rounded-xl border px-3 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
          !adaIsi
            ? "border-md-outline-variant bg-md-container text-md-on-surface-variant"
            : Math.round(selisih) === 0
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500"
              : "border-red-500/30 bg-red-500/5 text-red-500"
        }`}
      >
        <span>Aktiva = Pasiva</span>
        <span className="font-semibold">
          {!adaIsi ? "Belum diisi" : Math.round(selisih) === 0 ? "Seimbang" : `Belum seimbang — selisih ${fmtRp(Math.abs(selisih))}`}
        </span>
      </div>
      <p className="text-[11px] text-md-on-surface-variant px-1">
        Neraca masih bertahap: sudah terhubung: Kas Kecil, Bank, Persediaan Barang, Saldo Marketplace, Piutang Grosir, Aktiva Tetap, dan Titipan Deposit. Pos lain tampil "-".
      </p>
    </div>
  );
}

// ---------------------------------------------------------
// Laporan sederhana (narasi) — salin / kirim ke WhatsApp
// ---------------------------------------------------------
function SheetNarasi({ teks, onClose, tampilToast }) {
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teks);
      tampilToast("Teks laporan disalin");
    } catch {
      tampilToast("Gagal menyalin. Tahan teks lalu salin manual.", "err");
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="w-full max-h-[85dvh] rounded-t-3xl bg-md-surface flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-md-outline-variant">
          <div className="font-bold text-sm text-md-on-surface">Laporan Sederhana</div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-md-on-surface/10" title="Tutup">
            <X size={18} />
          </button>
        </div>
        <pre className="flex-1 overflow-y-auto p-4 text-xs text-md-on-surface whitespace-pre-wrap break-words font-sans">{teks}</pre>
        <div className="grid grid-cols-2 gap-2 p-4 border-t border-md-outline-variant">
          <button onClick={salin} className="flex items-center justify-center gap-1.5 rounded-xl bg-md-container border border-md-outline-variant text-md-on-surface text-xs font-semibold py-2.5">
            <Copy size={14} /> Salin
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(teks)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold py-2.5"
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// LAYAR UTAMA
// ---------------------------------------------------------
export default function LaporanHp({ session, entitas }) {
  // Menu Keuangan Pusat / Keuangan Perusahaan (GrupHp.jsx) mengunci layar ini ke PT lain lewat `entitas` dan mengatur read-only lewat `bacaSajaPaksa`.
  const kodeAktif = entitas || session?.entitas || ENTITAS_DEFAULT;

  const [master, setMaster] = useState({});
  const [trx, setTrx] = useState([]);
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("saldo");
  const [dari, setDari] = useState(awalBulan());
  const [sampai, setSampai] = useState(hariIni());
  const [detail, setDetail] = useState(null);
  const [narasi, setNarasi] = useState(false);
  const [toast, setToast] = useState(null);

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Komponen keuangan membaca PT aktif dari sini — sama seperti Keuangan.jsx desktop.
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
  const m = lingkup.master;
  const rekeningList = m.rekening || [];
  const kategoriMasukList = m.kategori_masuk || [];
  const kategoriKeluarList = m.kategori_keluar || [];

  // --- Data periode (Arus Kas & Laba Rugi) ---
  const { data: dataRentangAsli, status: statusLama } = useKeuanganRentang(lingkup.transaksi, dari);
  // Setoran Pemasukan dari cabang dihitung sebagai pemasukan Pusat di laporan (saldo kas tetap dari transaksi asli).
  const dataRentang = useMemo(() => setoranSebagaiPemasukan(dataRentangAsli, m, kodeAktif), [dataRentangAsli, m, kodeAktif]);
  const ringkas = useMemo(() => ringkasanKeuangan(dataRentang, dari || null, sampai || null), [dataRentang, dari, sampai]);
  const list = ringkas.list;

  // Saldo per rekening SENGAJA pakai data yang dimuat saja + saldo dasar (bukan dataRentang) supaya tidak terhitung dua kali.
  const saldoRekening = useMemo(() => saldoPerRekening(lingkup.transaksi, rekeningList, true), [lingkup.transaksi, rekeningList]);
  const petaKas = useMemo(() => petaKasRekening(m.kas_grup), [m.kas_grup]);
  const saldoKas = useMemo(() => saldoPerKas(saldoRekening, petaKas), [saldoRekening, petaKas]);

  const arusKas = useMemo(() => arusKasPerPeriode(list), [list]);
  const breakdownKeluar = useMemo(() => breakdownPengeluaranKategori(list, kategoriKeluarList), [list, kategoriKeluarList]);
  const breakdownMasuk = useMemo(() => breakdownPemasukanKategori(list, kategoriMasukList), [list, kategoriMasukList]);
  const dataMasukGrup = useMemo(() => kelompokkanBreakdown(breakdownMasuk.data, m.kelompok_masuk, breakdownMasuk.total), [breakdownMasuk, m.kelompok_masuk]);
  const dataKeluarGrup = useMemo(() => kelompokkanBreakdown(breakdownKeluar.data, m.kelompok_keluar, breakdownKeluar.total), [breakdownKeluar, m.kelompok_keluar]);

  // Laba Rugi: kategori yang tujuannya Neraca tidak dihitung. HPP penjualan hanya dimuat saat tab Laba Rugi dibuka.
  const dataLabaRugi = useMemo(() => saringLabaRugi(dataRentang, m), [dataRentang, m]);
  const { hpp: hppPenjualan } = useHppPenjualan(tab === "labarugi" ? dari || null : null, tab === "labarugi" ? sampai || null : null);
  const lr = useMemo(
    () =>
      laporanLabaRugi(dataLabaRugi, kategoriMasukList, kategoriKeluarList, dari || null, sampai || null, m.kelompok_masuk, m.kelompok_keluar, hppPenjualan?.total || 0),
    [dataLabaRugi, kategoriMasukList, kategoriKeluarList, dari, sampai, m.kelompok_masuk, m.kelompok_keluar, hppPenjualan]
  );
  const listLR = useMemo(() => ringkasanKeuangan(dataLabaRugi, dari || null, sampai || null).list, [dataLabaRugi, dari, sampai]);

  const persediaan = usePersediaanBarang(tab === "neraca");
  const dataNeraca = useDataNeraca(tab === "neraca");

  const subtitle = dari && sampai ? `${formatTanggalID(dari)} – ${formatTanggalID(sampai)}` : "";

  const teksNarasi = useMemo(
    () => (narasi ? buatLaporanNarasi({ dari, sampai, list, saldoRekening, kategoriKeluarList }) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [narasi]
  );

  const unduhCsv = () => {
    const rows = [...list]
      .sort((a, b) => (b.tanggal + (b.created_at || "")).localeCompare(a.tanggal + (a.created_at || "")))
      .map((t) => ({
        tanggal: t.tanggal,
        jenis: t.tipe === "masuk" ? "Pemasukan" : t.tipe === "keluar" ? "Pengeluaran" : "Transfer",
        rekening: labelDari(rekeningList, t.rekening),
        tujuan: t.tipe === "transfer" ? labelDari(rekeningList, t.rekening_tujuan) : "",
        kategori: t.tipe === "masuk" ? labelDari(kategoriMasukList, t.kategori) : t.tipe === "keluar" ? labelDari(kategoriKeluarList, t.kategori) : "",
        keterangan: t.keterangan || "",
        jumlah: t.jumlah,
      }));
    if (!rows.length) {
      tampilToast("Tidak ada transaksi pada rentang ini.", "warn");
      return;
    }
    downloadCsv(
      `laporan-keuangan_${dari || "awal"}_sd_${sampai || "sekarang"}.csv`,
      [
        { key: "tanggal", label: "Tanggal" },
        { key: "jenis", label: "Jenis" },
        { key: "rekening", label: "Rekening" },
        { key: "tujuan", label: "Rekening Tujuan" },
        { key: "kategori", label: "Kategori" },
        { key: "keterangan", label: "Keterangan" },
        { key: "jumlah", label: "Jumlah" },
      ],
      rows
    );
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

  const perluPeriode = tab === "arus" || tab === "labarugi";

  return (
    <div className="relative pb-28">
      <div className="p-4 space-y-4">
        {err && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2 flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{err}</span>
            <button onClick={muat} className="underline font-semibold flex-shrink-0">Muat ulang</button>
          </div>
        )}
        {statusLama && <Peringatan>{statusLama}</Peringatan>}

        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          {TAB.map((t) => (
            <ChipTab key={t.key} aktif={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </ChipTab>
          ))}
        </div>

        {perluPeriode && <PilihPeriode dari={dari} sampai={sampai} setDari={setDari} setSampai={setSampai} />}

        {perluPeriode && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={unduhCsv} className="flex items-center justify-center gap-1.5 rounded-xl bg-md-container border border-md-outline-variant text-md-on-surface text-xs font-semibold py-2.5">
              <Download size={14} /> Unduh CSV
            </button>
            <button onClick={() => setNarasi(true)} className="flex items-center justify-center gap-1.5 rounded-xl bg-md-container border border-md-outline-variant text-md-on-surface text-xs font-semibold py-2.5">
              <FileText size={14} /> Laporan Sederhana
            </button>
          </div>
        )}

        {tab === "saldo" && <TabSaldoKas saldoRekening={saldoRekening} saldoKas={saldoKas} petaKas={petaKas} />}
        {tab === "arus" && (
          <TabArusKas
            ringkas={ringkas}
            arusKas={arusKas}
            breakdownMasuk={breakdownMasuk}
            breakdownKeluar={breakdownKeluar}
            dataMasukGrup={dataMasukGrup}
            dataKeluarGrup={dataKeluarGrup}
            onDetail={(k) => setDetail({ ...k, sumber: "arus" })}
          />
        )}
        {tab === "labarugi" && <TabLabaRugi lr={lr} hpp={hppPenjualan} subtitle={subtitle} onDetail={(k) => setDetail({ ...k, sumber: "lr" })} />}
        {tab === "neraca" && (
          <TabNeraca
            nilai={{
              // Sama persis dengan Total Uang Cash / Saldo Bank di tab Saldo Kas.
              kas_kecil: saldoKas.kecil,
              bank: saldoKas.bank,
              // Stok Barang Toko × HPP + stok Master Barang (gudang) × HPP.
              persediaan: persediaan.data ? persediaan.data.nilai : undefined,
              // Aset tetap, piutang grosir, saldo marketplace, titipan deposit (lib/neracaData.js).
              ...(dataNeraca.data ? dataNeraca.data.nilai : {}),
            }}
            memuatPersediaan={persediaan.memuat}
            galatPersediaan={persediaan.error}
            rincianPersediaan={persediaan.data}
          />
        )}
      </div>

      {detail && (
        <SheetRincian
          kategori={detail}
          list={detail.sumber === "lr" ? listLR : list}
          rekeningList={rekeningList}
          subtitle={subtitle}
          onClose={() => setDetail(null)}
        />
      )}
      {narasi && <SheetNarasi teks={teksNarasi} onClose={() => setNarasi(false)} tampilToast={tampilToast} />}

      {toast && (
        <div
          className={`fixed left-4 right-4 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
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
