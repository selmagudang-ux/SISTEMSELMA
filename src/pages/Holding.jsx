import { useState, useMemo, useEffect } from "react";
import { Plus, ArrowRightLeft, Landmark, Paperclip, AlertTriangle, Pencil, Trash2, TrendingUp, TrendingDown, Building2, ChevronDown } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge, InputTanggal, formatTanggalID, ModalShell, Field, InputRupiah } from "../components/ui";
import { sb, fmtRp, LABEL_KAS, KAS_KECIL, KAS_BANK, URUTAN_KAS, PENANDA_ANTAR_ENTITAS, kodeEntitasHolding, kodeHoldingPasti, bukanLabaRugi, pengaturanEntitas, breakdownPengeluaranKategori, breakdownPemasukanKategori } from "../lib/api";
import { bolehTransferAntarEntitas, bisaTransferAntarEntitas, fiturTersediaEntitas, fiturMatiEntitas } from "../lib/constants";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";
import { useDataKas, hariIniLokal, awalBulanIni, unggahBukti, fileCls } from "./AlurKas";

// =========================================================
// FASE 4 — HOLDING
//   Antar Entitas : transfer uang antar perusahaan (modal, dividen, pinjaman,
//                   pelunasan pinjaman), plus posisi pinjaman yang belum lunas.
//   Konsolidasi   : ringkasan tiap entitas + gabungan, HANYA BACA.
// Entitas & pemetaan rekening: lihat ENTITAS di lib/api.js. Transfer antar
// rekening beda entitas bukan pemasukan/pengeluaran — jadi otomatis "terhapus"
// (eliminasi) saat digabung di Konsolidasi.
// =========================================================

const WARNA_PENANDA = { modal: "sky", dividen: "emerald", pinjaman: "amber", pelunasan_pinjaman: "amber", biaya_antar: "violet" };
const nilai = (t) => Number(t.jumlah) || 0;

// Transfer yang melintasi dua entitas -> { asal, tujuan } (kode entitas), selain itu null.
function lintasEntitas(t, k) {
  if (t.tipe !== "transfer") return null;
  const asal = k.entDari(t.rekening);
  const tujuan = k.entDari(t.rekening_tujuan);
  return asal === tujuan ? null : { asal, tujuan };
}

// Dua jenis transfer antar-entitas ikut masuk laba rugi tiap entitas, lalu dieliminasi di Konsolidasi:
//   dividen     : pendapatan dividen bagi penerima (anak -> induk). Bagi pembayar BUKAN beban.
//   biaya_antar : pengeluaran bagi pembayar + pemasukan bagi penerima (management fee, sewa, royalti).
// Keduanya tidak boleh dihitung di angka gabungan (sudah dihitung di sisi perusahaan asalnya).
const efekLaba = (t, k) => {
  const x = lintasEntitas(t, k);
  if (!x) return null;
  const j = nilai(t);
  if (t.penanda === "dividen") return { tujuan: x.tujuan, dividen: j };
  if (t.penanda === "biaya_antar") return { asal: x.asal, tujuan: x.tujuan, biaya: j };
  return null;
};

// Posisi pinjaman antar-entitas per entitas (+ piutang, - utang), dari SELURUH riwayat.
function posisiPinjaman(semua, k) {
  const hasil = {};
  k.entitasList.forEach((e) => {
    hasil[e.kode] = 0;
  });
  semua.forEach((t) => {
    const x = lintasEntitas(t, k);
    if (!x) return;
    const j = nilai(t);
    if (t.penanda === "pinjaman") {
      hasil[x.asal] = (hasil[x.asal] || 0) + j; // pemberi pinjaman: piutang naik
      hasil[x.tujuan] = (hasil[x.tujuan] || 0) - j; // penerima: utang naik
    } else if (t.penanda === "pelunasan_pinjaman") {
      hasil[x.asal] = (hasil[x.asal] || 0) + j; // yang melunasi: utang turun
      hasil[x.tujuan] = (hasil[x.tujuan] || 0) - j; // yang dilunasi: piutang turun
    }
  });
  return hasil;
}

const PesanSetup = () => (
  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs px-4 py-3">
    Entitas belum diatur. Jalankan <span className="font-mono">fase4_holding.sql</span> di database, lalu muat ulang halaman.
  </div>
);

// =========================================================
// RINGKASAN GRUP — halaman awal menu Holding.
// Kartu per perusahaan (saldo kas, pemasukan, pengeluaran, laba bulan ini),
// kartu gabungan, dan tren laba 6 bulan terakhir. HANYA BACA.
// Transfer antar rekening (termasuk antar entitas) tidak dihitung sebagai
// pemasukan/pengeluaran, jadi tidak ada hitung ganda di angka gabungan.
// =========================================================
const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const labelBulan = (ym) => {
  const [y, m] = ym.split("-");
  return `${NAMA_BULAN[Number(m) - 1]} ${y}`;
};
// Angka ringkas untuk baris/grafik ("Rp 12,3 jt"); angka lengkap tetap tampil di kartu utama & rincian.
const fmtSingkat = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  const dua = (x) => x.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  if (a >= 1e9) return `${s}Rp ${dua(a / 1e9)} M`;
  if (a >= 1e6) return `${s}Rp ${dua(a / 1e6)} jt`;
  return fmtRp(v);
};
const KOSONG = { masuk: 0, keluar: 0, dividen: 0, antarMasuk: 0, antarKeluar: 0, trx: [] };

// Baris kecil "label ..... nilai" + batang persen, dipakai untuk 5 kategori teratas.
function BarisKategori({ label, jumlah, persen, warna }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-slate-300 truncate">{label}</span>
        <span className="text-slate-400 whitespace-nowrap">{fmtRp(jumlah)} · {Math.round(persen)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, Math.max(2, persen))}%` }} />
      </div>
    </div>
  );
}

// Grafik batang laba (rugi) per bulan — sederhana: satu seri, batang merah kalau rugi.
function GrafikLaba({ bulanList, nilaiBulan, terpilih, onPilih }) {
  const vals = bulanList.map(nilaiBulan);
  const maks = Math.max(0, ...vals);
  const mins = Math.min(0, ...vals);
  const rentang = maks - mins || 1;
  const garisNol = (maks / rentang) * 100; // % dari atas
  return (
    <div>
      <div className="relative h-32">
        <div className="absolute left-0 right-0 border-t border-slate-700/70" style={{ top: `${garisNol}%` }} />
        <div className="absolute inset-0 flex gap-2 sm:gap-4">
          {bulanList.map((b, i) => {
            const v = vals[i];
            const tinggi = (Math.abs(v) / rentang) * 100;
            const aktif = b === terpilih;
            return (
              <button
                key={b}
                type="button"
                onClick={() => onPilih(b)}
                title={`${labelBulan(b)}: ${fmtRp(v)}`}
                className="relative flex-1 group"
                aria-label={`${labelBulan(b)} ${fmtRp(v)}`}
              >
                <div
                  className={`absolute left-1/4 right-1/4 rounded-sm transition ${v < 0 ? "bg-red-400" : "bg-emerald-400"} ${aktif ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`}
                  style={v < 0 ? { top: `${garisNol}%`, height: `${tinggi}%` } : { bottom: `${100 - garisNol}%`, height: `${tinggi}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 sm:gap-4 mt-1.5">
        {bulanList.map((b, i) => (
          <div key={b} className={`flex-1 text-center leading-tight ${b === terpilih ? "text-slate-100" : "text-slate-500"}`}>
            <div className="text-[10px] sm:text-[11px]">{NAMA_BULAN[Number(b.split("-")[1]) - 1]}</div>
            <div className={`text-[10px] ${vals[i] < 0 ? "text-red-400" : ""}`}>{fmtSingkat(vals[i])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RingkasanGrup({ keuanganTransaksi = [], master = {}, onBuka, tanpaHeader = false, labelBuka = "Lihat keuangan" }) {
  const k = useDataKas(master, keuanganTransaksi);
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");
  const ents = k.entitasList;
  const bulanIni = hariIniLokal().slice(0, 7);
  const [bulanPilih, setBulanPilih] = useState(bulanIni);
  const [terbuka, setTerbuka] = useState(() => new Set());
  const [lihatAngka, setLihatAngka] = useState(false);
  const [lihatCara, setLihatCara] = useState(false);
  const toggle = (kode) =>
    setTerbuka((s) => {
      const n = new Set(s);
      if (n.has(kode)) n.delete(kode);
      else n.add(kode);
      return n;
    });

  const data = useMemo(() => {
    // 7 bulan: 6 yang ditampilkan + 1 bulan sebelumnya untuk pembanding "naik/turun".
    const daftarBulan = [];
    let [y, m] = bulanIni.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      daftarBulan.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    const perEnt = {};
    ents.forEach((e) => {
      perEnt[e.kode] = {
        kas: 0,
        kasJenis: { [KAS_BANK]: 0, [KAS_KECIL]: 0 },
        bulan: Object.fromEntries(daftarBulan.map((b) => [b, { ...KOSONG, trx: [] }])),
      };
    });
    k.rekeningList.forEach((r) => {
      const e = perEnt[k.entDari(r.kode)];
      if (!e) return;
      const s = k.saldoMap.get(r.kode) || 0;
      e.kas += s;
      const jenis = k.kasDari(r.kode);
      e.kasJenis[jenis] = (e.kasJenis[jenis] || 0) + s;
    });
    const ember = (kode, tanggal) => perEnt[kode] && perEnt[kode].bulan[(tanggal || "").slice(0, 7)];
    // 5 transaksi terakhir per entitas (semua jenis, berdasarkan rekening asal), tidak terikat bulan yang dipilih.
    const terakhir = Object.fromEntries(ents.map((e) => [e.kode, []]));
    semua.forEach((t) => {
      const lst = terakhir[k.entDari(t.rekening)];
      if (lst) lst.push(t);
    });
    const urut = (a, b) => ((b.tanggal || "") + (b.created_at || "")).localeCompare((a.tanggal || "") + (a.created_at || ""));
    Object.keys(terakhir).forEach((kode) => {
      terakhir[kode] = terakhir[kode].sort(urut).slice(0, 5);
    });
    semua.forEach((t) => {
      if (bukanLabaRugi(t)) return; // prive/dividen & pinjaman pemilik bukan laba rugi
      if (t.tipe === "masuk" || t.tipe === "keluar") {
        const b = ember(k.entDari(t.rekening), t.tanggal);
        if (b) {
          b[t.tipe] += nilai(t);
          b.trx.push(t);
        }
        return;
      }
      const f = efekLaba(t, k);
      if (!f) return;
      if (f.dividen) {
        const b = ember(f.tujuan, t.tanggal);
        if (b) b.dividen += f.dividen;
      } else if (f.biaya) {
        const bm = ember(f.tujuan, t.tanggal);
        if (bm) {
          bm.masuk += f.biaya;
          bm.antarMasuk += f.biaya;
        }
        const bk = ember(f.asal, t.tanggal);
        if (bk) {
          bk.keluar += f.biaya;
          bk.antarKeluar += f.biaya;
        }
      }
    });
    return { perEnt, daftarBulan, terakhir, pinjaman: posisiPinjaman(semua, k) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semua, master.rekening, master.rekening_entitas, master.entitas, master.kas_grup, keuanganTransaksi]);

  if (ents.length < 2) return <PesanSetup />;

  const bulan6 = data.daftarBulan.slice(1);
  const bulanSebelum = data.daftarBulan[data.daftarBulan.indexOf(bulanPilih) - 1];
  const warna = (v) => (v < 0 ? "text-red-400" : "text-slate-100");

  // Laba entitas = pemasukan - pengeluaran + pendapatan dividen (dividen yang diterima dari perusahaan lain).
  const ringkas = (kode, b) => {
    const x = data.perEnt[kode].bulan[b] || KOSONG;
    return { masuk: x.masuk, keluar: x.keluar, dividen: x.dividen, antarMasuk: x.antarMasuk, antarKeluar: x.antarKeluar, laba: x.masuk - x.keluar + x.dividen };
  };
  // Gabungan: buang transaksi antar perusahaan (biaya antar perusahaan & dividen) supaya tidak dihitung ganda.
  const gabungan = (b) =>
    ents.reduce(
      (a, e) => {
        const r = ringkas(e.kode, b);
        const masuk = a.masuk + r.masuk - r.antarMasuk;
        const keluar = a.keluar + r.keluar - r.antarKeluar;
        return { masuk, keluar, laba: masuk - keluar };
      },
      { masuk: 0, keluar: 0, laba: 0 }
    );
  const kasGab = ents.reduce((a, e) => a + data.perEnt[e.kode].kas, 0);
  const gab = gabungan(bulanPilih);
  const gabLalu = bulanSebelum ? gabungan(bulanSebelum) : null;
  const selisih = gabLalu ? gab.laba - gabLalu.laba : null;
  const margin = gab.masuk > 0 ? (gab.laba / gab.masuk) * 100 : null;
  const labaBulan = (b) => gabungan(b).laba;
  const labaEnt = (kode, b) => ringkas(kode, b).laba;

  const semuaRingkas = ents.map((e) => ({ e, r: ringkas(e.kode, bulanPilih) }));
  const labaTertinggi = Math.max(1, ...semuaRingkas.map(({ r }) => Math.abs(r.laba)));

  const Rincian = ({ e, r }) => {
    const d = data.perEnt[e.kode];
    const trx = (d.bulan[bulanPilih] || KOSONG).trx;
    const keluar = breakdownPengeluaranKategori(trx, master.kategori_keluar || []);
    const masuk = breakdownPemasukanKategori(trx, master.kategori_masuk || []);
    const pinjam = data.pinjaman[e.kode] || 0;
    const mrg = r.masuk > 0 ? (r.laba / r.masuk) * 100 : null;
    return (
      <div className="px-4 pb-4 pt-1 border-t border-slate-800/70 grid gap-5 md:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Posisi kas saat ini</div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">{LABEL_KAS[KAS_BANK]}</span><span className={warna(d.kasJenis[KAS_BANK])}>{fmtRp(d.kasJenis[KAS_BANK])}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">{LABEL_KAS[KAS_KECIL]}</span><span className={warna(d.kasJenis[KAS_KECIL])}>{fmtRp(d.kasJenis[KAS_KECIL])}</span></div>
            <div className="flex justify-between border-t border-slate-800 pt-1 font-medium"><span className="text-slate-300">Total</span><span className={warna(d.kas)}>{fmtRp(d.kas)}</span></div>
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-4 mb-2">Bulan {labelBulan(bulanPilih)}</div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">Pemasukan</span><span className="text-emerald-400">{fmtRp(r.masuk)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Pengeluaran</span><span className="text-red-400">{fmtRp(r.keluar)}</span></div>
            {r.dividen > 0 && <div className="flex justify-between"><span className="text-slate-400">Dividen diterima</span><span className="text-slate-200">{fmtRp(r.dividen)}</span></div>}
            <div className="flex justify-between border-t border-slate-800 pt-1 font-medium"><span className="text-slate-300">Laba (rugi)</span><span className={warna(r.laba)}>{fmtRp(r.laba)}</span></div>
            {mrg !== null && <div className="flex justify-between"><span className="text-slate-500">Margin</span><span className="text-slate-400">{mrg.toFixed(1)}%</span></div>}
          </div>
          {pinjam !== 0 && (
            <div className="mt-3 text-[11px] text-slate-400">
              {pinjam > 0 ? "Piutang pinjaman antar perusahaan" : "Utang pinjaman antar perusahaan"}: <span className="text-amber-400">{fmtRp(Math.abs(pinjam))}</span>
            </div>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Pengeluaran terbesar</div>
          {keluar.data.length === 0 ? <div className="text-xs text-slate-500">Belum ada pengeluaran.</div> : keluar.data.slice(0, 5).map((d2) => <BarisKategori key={d2.kode || "_"} label={d2.label} jumlah={d2.jumlah} persen={d2.persen} warna="bg-red-400/70" />)}
          {r.antarKeluar > 0 && <div className="text-[11px] text-slate-500 mt-2">+ biaya antar perusahaan {fmtRp(r.antarKeluar)} (tidak masuk daftar)</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Sumber pemasukan</div>
          {masuk.data.length === 0 ? <div className="text-xs text-slate-500">Belum ada pemasukan.</div> : masuk.data.slice(0, 5).map((d2) => <BarisKategori key={d2.kode || "_"} label={d2.label} jumlah={d2.jumlah} persen={d2.persen} warna="bg-emerald-400/70" />)}
          {r.antarMasuk > 0 && <div className="text-[11px] text-slate-500 mt-2">+ biaya antar perusahaan {fmtRp(r.antarMasuk)} (tidak masuk daftar)</div>}
          {onBuka && (
            <button onClick={() => onBuka(e.kode)} className="mt-4 text-[11px] text-amber-400 hover:text-amber-300">
              {labelBuka} {e.label} →
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      {!tanpaHeader && <PageHeader title="Ringkasan Grup" description="Keuangan seluruh perusahaan dalam grup, hanya untuk dilihat." sticky />}

      {/* Pilih bulan */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs text-slate-500">Dipilih: <span className="text-slate-300">{labelBulan(bulanPilih)}</span></div>
        <select value={bulanPilih} onChange={(ev) => setBulanPilih(ev.target.value)} className={`${inputClass} w-auto text-xs py-1.5`} aria-label="Pilih bulan">
          {[...bulan6].reverse().map((b) => (
            <option key={b} value={b}>{labelBulan(b)}</option>
          ))}
        </select>
      </div>

      {/* 1. Ringkasan gabungan — 4 angka saja */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={14} className="text-amber-400" />
          <div className="text-sm font-semibold text-slate-100">Gabungan grup</div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
          <div>
            <div className="text-[11px] text-slate-500">Total kas saat ini</div>
            <div className={`text-lg sm:text-xl font-semibold ${warna(kasGab)}`}>{fmtRp(kasGab)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Pemasukan</div>
            <div className="text-lg sm:text-xl font-semibold text-emerald-400">{fmtRp(gab.masuk)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Pengeluaran</div>
            <div className="text-lg sm:text-xl font-semibold text-red-400">{fmtRp(gab.keluar)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Laba (rugi)</div>
            <div className={`text-lg sm:text-xl font-semibold ${warna(gab.laba)}`}>{fmtRp(gab.laba)}</div>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          {margin !== null && <span>Margin {margin.toFixed(1)}%</span>}
          {selisih !== null && selisih !== 0 && (
            <span className={selisih > 0 ? "text-emerald-400" : "text-red-400"}>
              {selisih > 0 ? "▲" : "▼"} {fmtSingkat(Math.abs(selisih))} dibanding {labelBulan(bulanSebelum)}
            </span>
          )}
          <span>Dividen &amp; biaya antar perusahaan sudah dieliminasi</span>
        </div>
      </div>

      {/* 2. Per perusahaan — satu baris ringkas, klik untuk rincian */}
      <div className="text-sm font-semibold text-slate-200 mb-2">Per perusahaan</div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 mb-5">
        {semuaRingkas.map(({ e, r }) => {
          const buka = terbuka.has(e.kode);
          const kas = data.perEnt[e.kode].kas;
          return (
            <div key={e.kode}>
              <button type="button" onClick={() => toggle(e.kode)} aria-expanded={buka} className="w-full text-left px-4 py-3 hover:bg-slate-800/40 transition">
                <div className="flex items-center gap-3">
                  <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${buka ? "rotate-180" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100 truncate">{e.label}</div>
                    <div className="text-[11px] text-slate-500">Kas {fmtSingkat(kas)}</div>
                  </div>
                  <div className="hidden md:block w-28 text-right">
                    <div className="text-[10px] text-slate-500">Pemasukan</div>
                    <div className="text-xs text-emerald-400">{fmtSingkat(r.masuk)}</div>
                  </div>
                  <div className="hidden md:block w-28 text-right">
                    <div className="text-[10px] text-slate-500">Pengeluaran</div>
                    <div className="text-xs text-red-400">{fmtSingkat(r.keluar)}</div>
                  </div>
                  <div className="w-28 text-right">
                    <div className="text-[10px] text-slate-500">Laba (rugi)</div>
                    <div className={`text-sm font-semibold ${warna(r.laba)}`}>{fmtSingkat(r.laba)}</div>
                  </div>
                </div>
                <div className="mt-2 ml-7 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${r.laba < 0 ? "bg-red-400/70" : "bg-emerald-400/70"}`} style={{ width: `${Math.max(2, (Math.abs(r.laba) / labaTertinggi) * 100)}%` }} />
                </div>
              </button>
              {buka && <Rincian e={e} r={r} />}
            </div>
          );
        })}
      </div>

      {/* 3. Transaksi terakhir per perusahaan */}
      <div className="text-sm font-semibold text-slate-200 mb-2">5 transaksi terakhir</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {ents.map((e) => {
          const daftar = data.terakhir[e.kode] || [];
          return (
            <div key={e.kode} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={13} className="text-slate-500" />
                <div className="text-xs font-semibold text-slate-200 truncate">{e.label}</div>
              </div>
              {daftar.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">Belum ada transaksi.</div>
              ) : (
                <div className="divide-y divide-slate-800/70">
                  {daftar.map((t) => {
                    const masuk = t.tipe === "masuk";
                    const transfer = t.tipe === "transfer";
                    const kat = (master[masuk ? "kategori_masuk" : "kategori_keluar"] || []).find((x) => x.kode === t.kategori)?.label;
                    const judul = t.keterangan || (transfer ? `Transfer ke ${k.labelRek(t.rekening_tujuan)}` : kat || "—");
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-200 truncate">{judul}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {formatTanggalID(t.tanggal)}
                            {!transfer && kat ? ` · ${kat}` : ""}
                            {transfer ? " · Transfer" : ""}
                          </div>
                        </div>
                        <div className={`text-xs font-medium whitespace-nowrap ${transfer ? "text-slate-300" : masuk ? "text-emerald-400" : "text-red-400"}`}>
                          {masuk ? "+" : transfer ? "" : "−"}{fmtRp(t.jumlah)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Tren 6 bulan */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-200">Laba gabungan 6 bulan</div>
        <div className="text-[11px] text-slate-500">Klik batang untuk ganti bulan</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <GrafikLaba bulanList={bulan6} nilaiBulan={labaBulan} terpilih={bulanPilih} onPilih={setBulanPilih} />
      </div>

      <button type="button" onClick={() => setLihatAngka((v) => !v)} className="mt-3 text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1">
        <ChevronDown size={13} className={`transition-transform ${lihatAngka ? "rotate-180" : ""}`} />
        {lihatAngka ? "Sembunyikan" : "Lihat"} tabel laba per perusahaan
      </button>
      {lihatAngka && (
        <div className="rounded-xl border border-slate-800 overflow-x-auto mt-2">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 font-medium">Bulan</th>
                {ents.map((e) => (
                  <th key={e.kode} className="px-2 py-2.5 font-medium text-right">{e.label}</th>
                ))}
                <th className="px-4 py-2.5 font-medium text-right text-amber-400">Gabungan</th>
              </tr>
            </thead>
            <tbody>
              {[...bulan6].reverse().map((b) => {
                const total = labaBulan(b);
                return (
                  <tr key={b} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2 text-slate-300">{labelBulan(b)}</td>
                    {ents.map((e) => {
                      const v = labaEnt(e.kode, b);
                      return <td key={e.kode} className={`px-2 py-2 text-right whitespace-nowrap ${v < 0 ? "text-red-400" : ""}`}>{fmtRp(v)}</td>;
                    })}
                    <td className={`px-4 py-2 text-right whitespace-nowrap font-semibold ${total < 0 ? "text-red-400" : ""}`}>{fmtRp(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={() => setLihatCara((v) => !v)} className="mt-3 block text-[11px] text-slate-500 hover:text-slate-400">
        {lihatCara ? "Tutup" : "Cara hitung laba?"}
      </button>
      {lihatCara && (
        <div className="text-[11px] text-slate-500 mt-1">
          Laba per perusahaan = pemasukan − pengeluaran tercatat di Keuangan + dividen yang diterima dari perusahaan lain + biaya antar perusahaan (sebagai pemasukan penerima / pengeluaran pembayar). Kolom Gabungan membuang dividen dan biaya antar perusahaan agar tidak dihitung ganda. Modal dan pinjaman tidak dihitung sebagai laba. Saldo kas selalu posisi saat ini, bukan posisi akhir bulan yang dipilih. Lihat tab Konsolidasi untuk rinciannya.
        </div>
      )}
    </div>
  );
}

// =========================================================
// ANTAR ENTITAS
// =========================================================
export function AntarEntitas({ keuanganTransaksi = [], master = {}, reload, showToast, setModal, role }) {
  const k = useDataKas(master, keuanganTransaksi);
  // Hak per arah transfer (lihat ARAH_ANTAR_ENTITAS di lib/constants.js):
  // Pemilik = Holding -> perusahaan, Super Admin = perusahaan -> Holding, Super Appa = keduanya.
  const kodeHolding = kodeEntitasHolding(k.entitasList);
  const bisaTambah = bisaTransferAntarEntitas(role);
  const bolehKelola = (t) => {
    const x = lintasEntitas(t, k);
    return !!x && bolehTransferAntarEntitas(role, x.asal, x.tujuan, kodeHolding);
  };
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [filterPenanda, setFilterPenanda] = useState("semua");
  const [formBuka, setFormBuka] = useState(false);
  const [menyimpanId, setMenyimpanId] = useState(null);

  // Seluruh riwayat dimuat (posisi pinjaman = akumulasi dari awal).
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");

  const daftar = useMemo(
    () =>
      semua
        .filter((t) => lintasEntitas(t, k))
        .filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai))
        .filter((t) => filterPenanda === "semua" || (filterPenanda === "kosong" ? !t.penanda : t.penanda === filterPenanda))
        .sort((a, b) => ((b.tanggal || "") + (b.created_at || "")).localeCompare((a.tanggal || "") + (a.created_at || ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semua, dari, sampai, filterPenanda, master.rekening_entitas, master.entitas]
  );
  const total = (p) => daftar.filter((t) => t.penanda === p).reduce((a, t) => a + nilai(t), 0);
  const belumDitandai = daftar.filter((t) => !t.penanda).length;
  const posisi = useMemo(() => posisiPinjaman(semua, k), [semua, master.rekening_entitas, master.entitas]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPenanda = async (t, penanda) => {
    setMenyimpanId(t.id);
    try {
      await sb(`keuangan_transaksi?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ penanda: penanda || null }) });
      await reload?.();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan penanda", "err");
    } finally {
      setMenyimpanId(null);
    }
  };

  if (k.entitasList.length < 2) return <PesanSetup />;

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Antar Entitas"
        description="Uang yang pindah antar perusahaan (mis. SELMA ↔ Holding): modal, dividen, pinjaman, dan pelunasannya. Bukan pemasukan/pengeluaran, jadi tidak masuk laba rugi masing-masing."
        sticky
        action={
          bisaTambah ? (
            <button
              onClick={() => setFormBuka(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Transfer Antar Entitas
            </button>
          ) : null
        }
      />
      {role === "owner" && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-sky-300 bg-sky-500/5 border border-sky-500/20">
          Anda hanya bisa mencatat transfer <b>dari Holding ke perusahaan</b> (mis. modal, pinjaman). Transfer dari perusahaan ke Holding dicatat oleh Admin.
        </div>
      )}
      {role === "superadmin" && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-sky-300 bg-sky-500/5 border border-sky-500/20">
          Anda hanya bisa mencatat transfer <b>dari perusahaan ke Holding</b> (mis. dividen, pelunasan pinjaman). Transfer dari Holding ke perusahaan dicatat oleh Pemilik.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Modal (periode)" value={fmtRp(total("modal"))} accent="text-sky-400" icon={Building2} iconColor="text-sky-500" />
        <StatCard label="Dividen (periode)" value={fmtRp(total("dividen"))} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Pinjaman (periode)" value={fmtRp(total("pinjaman"))} accent="text-amber-400" icon={TrendingDown} iconColor="text-amber-500" />
        <StatCard label="Belum ditandai" value={`${belumDitandai} transaksi`} accent={belumDitandai ? "text-amber-400" : "text-slate-100"} icon={Paperclip} iconColor="text-slate-400" />
      </div>

      <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/50 mb-4">
        <div className="text-xs text-slate-300 mb-2">Posisi pinjaman antar entitas (dari awal, belum lunas)</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {k.entitasList.map((e) => {
            const p = posisi[e.kode] || 0;
            return (
              <div key={e.kode} className="text-sm">
                <span className="text-slate-400">{e.label}: </span>
                <span className={`font-semibold ${p > 0 ? "text-emerald-400" : p < 0 ? "text-red-400" : "text-slate-100"}`}>
                  {p === 0 ? "Lunas / tidak ada" : p > 0 ? `Piutang ${fmtRp(p)}` : `Utang ${fmtRp(-p)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={filterPenanda} onChange={(e) => setFilterPenanda(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="semua">Semua Penanda</option>
          {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          <option value="kosong">Belum ditandai</option>
        </select>
      </div>

      {daftar.length === 0 ? (
        <EmptyState label="Belum ada transfer antar entitas di rentang ini." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map((t, i) => {
            const x = lintasEntitas(t, k);
            const kelola = bolehKelola(t);
            return (
              <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.penanda ? (
                      <Badge color={WARNA_PENANDA[t.penanda]}>{PENANDA_ANTAR_ENTITAS[t.penanda]}</Badge>
                    ) : !kelola ? (
                      <Badge color="amber">Belum ditandai</Badge>
                    ) : (
                      <select
                        value=""
                        disabled={menyimpanId === t.id}
                        onChange={(e) => setPenanda(t, e.target.value)}
                        className="bg-slate-900 border border-amber-500/40 text-amber-400 rounded-md px-2 py-1 text-[11px]"
                        aria-label="Beri penanda"
                      >
                        <option value="">Belum ditandai ▾</option>
                        {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      {k.entNama(x.asal)} · {k.labelRek(t.rekening)} <ArrowRightLeft size={10} /> {k.entNama(x.tujuan)} · {k.labelRek(t.rekening_tujuan)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {formatTanggalID(t.tanggal)}
                    {t.keterangan ? ` · ${t.keterangan}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-sm font-semibold text-sky-400">{fmtRp(t.jumlah)}</div>
                  {t.penanda && kelola && (
                    <button onClick={() => setPenanda(t, "")} disabled={menyimpanId === t.id} className="text-[10px] text-slate-500 hover:text-slate-300" title="Hapus penanda">
                      ubah
                    </button>
                  )}
                  {t.bukti_url && (
                    <a href={t.bukti_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-emerald-400/80 hover:text-emerald-300 hover:bg-slate-800" title="Lihat bukti transfer">
                      <Paperclip size={13} />
                    </a>
                  )}
                  {kelola && (
                    <>
                      <button onClick={() => setModal?.({ type: "keuangan-transaksi-form", item: t })} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setModal?.({ type: "hapus-keuangan-transaksi", item: t })} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800" title="Hapus">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formBuka && (
        <FormAntarEntitas
          k={k}
          role={role}
          kodeHolding={kodeHolding}
          onClose={() => setFormBuka(false)}
          showToast={showToast}
          onSaved={async () => {
            await reload?.();
            setFormBuka(false);
          }}
        />
      )}
    </div>
  );
}

function FormAntarEntitas({ k, role, kodeHolding, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(hariIniLokal());
  const [penanda, setPenanda] = useState("");
  const [sumber, setSumber] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const jumlahNum = Number(jumlah) || 0;
  const saldoSumber = sumber ? k.saldoMap.get(sumber) ?? 0 : null;
  const saldoKurang = sumber && jumlahNum > 0 && jumlahNum > (saldoSumber ?? 0);
  const sama = sumber && tujuan && k.entDari(sumber) === k.entDari(tujuan);
  const arahDilarang = !!(sumber && tujuan && !sama && !bolehTransferAntarEntitas(role, k.entDari(sumber), k.entDari(tujuan), kodeHolding));
  const valid = tanggal && penanda && sumber && tujuan && jumlahNum > 0 && !saldoKurang && !sama && !arahDilarang;

  // Entitas yang masih mungkin dipilih sebagai sumber / tujuan untuk role ini
  // (mis. Pemilik: sumber hanya Holding, tujuan hanya perusahaan lain).
  const entCocok = (kode, peran) =>
    k.entitasList.some((e) =>
      peran === "sumber"
        ? bolehTransferAntarEntitas(role, kode, e.kode, kodeHolding)
        : bolehTransferAntarEntitas(role, e.kode, kode, kodeHolding)
    );

  const opsi = (kecualiKode, peran) =>
    k.entitasList.map((e) => {
      if (!entCocok(e.kode, peran)) return null;
      const items = k.rekeningList.filter((r) => k.entDari(r.kode) === e.kode && r.kode !== kecualiKode).sort(k.urutKas);
      if (!items.length) return null;
      return (
        <optgroup key={e.kode} label={e.label}>
          {items.map((r) => (
            <option key={r.kode} value={r.kode}>
              {r.label} ({LABEL_KAS[k.kasDari(r.kode)]}) — saldo {fmtRp(k.saldoMap.get(r.kode) || 0)}
            </option>
          ))}
        </optgroup>
      );
    });

  const simpan = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const buktiUrl = foto ? await unggahBukti(foto, `ent-${tujuan}`) : null;
      await sb("keuangan_transaksi", {
        method: "POST",
        body: JSON.stringify({
          tanggal,
          tipe: "transfer",
          rekening: sumber,
          rekening_tujuan: tujuan,
          kategori: null,
          jumlah: jumlahNum,
          penanda,
          keterangan: keterangan.trim() || PENANDA_ANTAR_ENTITAS[penanda],
          ...(buktiUrl ? { bukti_url: buktiUrl } : {}),
        }),
      });
      showToast?.(`${PENANDA_ANTAR_ENTITAS[penanda]} tercatat`);
      await onSaved();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Transfer Antar Entitas" onClose={onClose}>
      <Field label="Jenis">
        <select className={inputClass} value={penanda} onChange={(e) => setPenanda(e.target.value)}>
          <option value="">Pilih jenis…</option>
          {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <div className="text-[11px] text-slate-500 mt-1">
          {penanda === "modal" && "Setoran modal: biasanya dari rekening Holding ke rekening SELMA."}
          {penanda === "dividen" && "Dividen: biasanya dari rekening SELMA ke rekening Holding. Jadi pendapatan dividen Holding, bukan beban SELMA."}
          {penanda === "pinjaman" && "Pinjaman: dari pihak yang meminjamkan ke pihak yang meminjam."}
          {penanda === "pelunasan_pinjaman" && "Pelunasan: dari pihak yang berutang ke pihak yang meminjamkan."}
          {penanda === "biaya_antar" && "Biaya antar perusahaan (management fee, sewa, royalti): dari pihak yang membayar ke pihak yang menagih, mis. SELMA → Holding. Jadi pengeluaran pembayar dan pemasukan penerima, lalu dieliminasi di Konsolidasi."}
        </div>
      </Field>
      <Field label="Tanggal">
        <InputTanggal className={inputClass} value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Dari rekening">
        <select className={inputClass} value={sumber} onChange={(e) => setSumber(e.target.value)}>
          <option value="">Pilih rekening sumber…</option>
          {opsi(tujuan, "sumber")}
        </select>
      </Field>
      <Field label="Ke rekening">
        <select className={inputClass} value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
          <option value="">Pilih rekening tujuan…</option>
          {opsi(sumber, "tujuan")}
        </select>
      </Field>
      {sama && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Kedua rekening milik entitas yang sama. Untuk perpindahan di dalam satu perusahaan pakai menu Transaksi (tab Transaksi atau Transfer Antar Kas).</div>
        </div>
      )}
      {arahDilarang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            {role === "owner"
              ? "Akun Anda hanya boleh mencatat transfer dari Holding ke perusahaan."
              : role === "superadmin"
                ? "Akun Anda hanya boleh mencatat transfer dari perusahaan ke Holding."
                : "Akun ini tidak boleh mencatat transfer dengan arah tersebut."}
          </div>
        </div>
      )}
      <Field label="Jumlah (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
      </Field>
      {saldoKurang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo {k.labelRek(sumber)} hanya {fmtRp(saldoSumber ?? 0)}, kurang dari {fmtRp(jumlahNum)}.</div>
        </div>
      )}
      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </Field>
      <Field label="Bukti Transfer (opsional)">
        <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className={fileCls} />
      </Field>
      <button
        disabled={!valid || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// =========================================================
// KONSOLIDASI (hanya baca)
// =========================================================
export function Konsolidasi({ keuanganTransaksi = [], master = {} }) {
  const k = useDataKas(master, keuanganTransaksi);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");

  const ents = k.entitasList;

  const data = useMemo(() => {
    const periode = semua.filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai));
    const perEnt = {};
    ents.forEach((e) => {
      perEnt[e.kode] = { kas: { [KAS_BANK]: 0, [KAS_KECIL]: 0 }, masuk: 0, keluar: 0, prive: 0, antarMasuk: 0, antarKeluar: 0, dividenMasuk: 0, modal: 0, dividen: 0, pinjaman: 0, biaya: 0, tanpa: 0 };
    });
    k.rekeningList.forEach((r) => {
      const e = perEnt[k.entDari(r.kode)];
      if (e) e.kas[k.kasDari(r.kode)] += k.saldoMap.get(r.kode) || 0;
    });
    periode.forEach((t) => {
      const j = nilai(t);
      if (bukanLabaRugi(t)) {
        // Prive/dividen ke pemilik: uang keluar dari grup, tapi bukan beban. Pinjaman ke pemilik
        // dan pelunasannya tidak masuk laba rugi maupun baris ini (lihat menu Penarikan Pemilik).
        if (t.tipe === "keluar" && t.penanda === "prive_dividen") {
          const e = perEnt[k.entDari(t.rekening)];
          if (e) e.prive += j;
        }
        return;
      }
      if (t.tipe === "masuk") {
        const e = perEnt[k.entDari(t.rekening)];
        if (e) e.masuk += j;
      } else if (t.tipe === "keluar") {
        const e = perEnt[k.entDari(t.rekening)];
        if (e) e.keluar += j;
      } else {
        const x = lintasEntitas(t, k);
        if (!x) return;
        const kunci =
          t.penanda === "modal" ? "modal"
          : t.penanda === "dividen" ? "dividen"
          : t.penanda === "biaya_antar" ? "biaya"
          : t.penanda === "pinjaman" || t.penanda === "pelunasan_pinjaman" ? "pinjaman"
          : "tanpa";
        if (perEnt[x.tujuan]) perEnt[x.tujuan][kunci] += j; // diterima
        if (perEnt[x.asal]) perEnt[x.asal][kunci] -= j; // diberikan
        // Dividen & biaya antar perusahaan ikut laba rugi tiap entitas (dieliminasi di kolom Konsolidasi).
        if (t.penanda === "dividen" && perEnt[x.tujuan]) perEnt[x.tujuan].dividenMasuk += j;
        if (t.penanda === "biaya_antar") {
          if (perEnt[x.tujuan]) {
            perEnt[x.tujuan].masuk += j;
            perEnt[x.tujuan].antarMasuk += j;
          }
          if (perEnt[x.asal]) {
            perEnt[x.asal].keluar += j;
            perEnt[x.asal].antarKeluar += j;
          }
        }
      }
    });
    return { perEnt, posisi: posisiPinjaman(semua, k), periode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semua, dari, sampai, master.rekening, master.rekening_entitas, master.entitas, master.kas_grup, keuanganTransaksi]);

  if (ents.length < 2) return <PesanSetup />;

  const jumlahSemua = (fn) => ents.reduce((a, e) => a + fn(data.perEnt[e.kode], e.kode), 0);
  const totalKas = (p) => p.kas[KAS_BANK] + p.kas[KAS_KECIL];

  const baris = [
    { judul: "Saldo kas saat ini" },
    ...URUTAN_KAS.map((kk) => ({ label: LABEL_KAS[kk], ambil: (p) => p.kas[kk], indent: true })),
    { label: "Total kas", ambil: totalKas, tebal: true },
    { judul: "Operasional (periode terpilih)" },
    { label: "Pemasukan", ambil: (p) => p.masuk, gabung: () => jumlahSemua((p) => p.masuk - p.antarMasuk), warna: "text-emerald-400" },
    { label: "Pengeluaran", ambil: (p) => p.keluar, gabung: () => jumlahSemua((p) => p.keluar - p.antarKeluar), warna: "text-red-400" },
    { label: "Laba operasional", ambil: (p) => p.masuk - p.keluar, tebal: true },
    { label: "Pendapatan dividen (dieliminasi di Konsolidasi)", ambil: (p) => p.dividenMasuk, gabung: () => 0, indent: true },
    { label: "Laba (rugi) entitas", ambil: (p) => p.masuk - p.keluar + p.dividenMasuk, gabung: () => jumlahSemua((p) => p.masuk - p.keluar), tebal: true },
    { label: "Prive / dividen ke pemilik (tidak mengurangi laba)", ambil: (p) => p.prive, indent: true },
    { judul: "Dana antar entitas (periode; + diterima, − diberikan)" },
    { label: "Modal", ambil: (p) => p.modal, indent: true },
    { label: "Dividen", ambil: (p) => p.dividen, indent: true },
    { label: "Pinjaman & pelunasan", ambil: (p) => p.pinjaman, indent: true },
    { label: "Biaya antar perusahaan", ambil: (p) => p.biaya, indent: true },
    { label: "Belum ditandai", ambil: (p) => p.tanpa, indent: true },
    { judul: "Posisi pinjaman antar entitas (dari awal)" },
    { label: "Piutang (+) / Utang (−)", ambil: (_p, kode) => data.posisi[kode] || 0, indent: true },
  ];

  const sel = (v, warna) => (
    <span className={v < 0 ? "text-red-400" : warna || ""}>{fmtRp(v)}</span>
  );

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Konsolidasi"
        description="Gabungan seluruh entitas — hanya untuk dilihat. Perpindahan uang antar entitas (modal, dividen, pinjaman) saling menghapus di kolom Konsolidasi, jadi tidak dihitung ganda."
        sticky
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
        <span className="text-slate-500 text-xs">s/d</span>
        <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total kas gabungan" value={fmtRp(jumlahSemua((p) => totalKas(p)))} accent="text-slate-100" icon={Landmark} iconColor="text-slate-400" />
        <StatCard label="Pemasukan gabungan" value={fmtRp(jumlahSemua((p) => p.masuk - p.antarMasuk))} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Laba (rugi) gabungan" value={fmtRp(jumlahSemua((p) => p.masuk - p.keluar))} accent="text-slate-100" icon={TrendingDown} iconColor="text-slate-400" />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2.5 font-medium"></th>
              {ents.map((e) => (
                <th key={e.kode} className="px-2 py-2.5 font-medium text-right">{e.label}</th>
              ))}
              <th className="px-4 py-2.5 font-medium text-right text-amber-400">Konsolidasi</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) =>
              b.judul ? (
                <tr key={i} className="bg-slate-900/60">
                  <td colSpan={ents.length + 2} className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-slate-500">{b.judul}</td>
                </tr>
              ) : (
                <tr key={i} className="border-b border-slate-800/60 last:border-0">
                  <td className={`px-4 py-2 ${b.indent ? "pl-8 text-slate-400" : "text-slate-200"} ${b.tebal ? "font-semibold" : ""}`}>{b.label}</td>
                  {ents.map((e) => (
                    <td key={e.kode} className={`px-2 py-2 text-right whitespace-nowrap ${b.tebal ? "font-semibold" : ""}`}>
                      {sel(b.ambil(data.perEnt[e.kode], e.kode), b.warna)}
                    </td>
                  ))}
                  <td className={`px-4 py-2 text-right whitespace-nowrap ${b.tebal ? "font-semibold" : ""}`}>
                    {sel(b.gabung ? b.gabung() : jumlahSemua((p, kode) => b.ambil(p, kode)), b.warna)}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        Saldo kas dihitung dari akun yang dipetakan ke tiap entitas (Keuangan &gt; Kas &gt; Akun Kas). Laba di sini = pemasukan − pengeluaran tercatat di Keuangan, belum termasuk penyusutan atau penyesuaian lain. Di kolom Konsolidasi, dividen dan biaya antar perusahaan dibuang (sudah terhitung di perusahaan asalnya), jadi pemasukan dan pengeluaran gabungan tidak membengkak.
      </div>
    </div>
  );
}
// =========================================================
// KELOLA PERUSAHAAN (Perusahaan Grup > Kelola Perusahaan) — khusus Super Appa.
// Menambah perusahaan (entitas) baru dan rekening miliknya. Entitas = baris
// master_data tipe "entitas"; rekening milik entitas = master_data tipe "rekening"
// + pemetaan tipe "rekening_entitas" (kode rekening -> kode entitas).
// Transaksi tidak punya kolom entitas: milik entitas mana ditentukan dari rekeningnya.
// =========================================================
export function KelolaPerusahaan({ master = {}, reload, showToast }) {
  const entitas = master.entitas || [];
  const petaEnt = useMemo(() => {
    const p = {};
    (master.rekening_entitas || []).forEach((m) => {
      p[m.kode] = m.label;
    });
    return p;
  }, [master.rekening_entitas]);
  const rekeningDari = (kodeEnt) => (master.rekening || []).filter((r) => (petaEnt[r.kode] || "OPS") === kodeEnt);

  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [saving, setSaving] = useState(false);
  const kodeBersih = kode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const kodeAda = entitas.some((e) => e.kode === kodeBersih);

  const tambahEntitas = async () => {
    if (!kodeBersih || !nama.trim() || kodeAda || saving) return;
    setSaving(true);
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "entitas", kode: kodeBersih, label: nama.trim() }) });
      showToast?.(`Perusahaan ${nama.trim()} ditambahkan`);
      setKode("");
      setNama("");
      await reload?.();
    } catch (e) {
      showToast?.(e.message || "Gagal menambah perusahaan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kelola Perusahaan"
        description="Tambah perusahaan baru ke grup, lalu buat rekening kas/bank miliknya. Setelah itu transaksi, kas, dan laporannya muncul di Keuangan Perusahaan dan Konsolidasi."
        sticky
      />
      <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/50 mb-4">
        <div className="text-xs text-slate-300 mb-2">Tambah perusahaan</div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Kode (huruf/angka, mis. PTB)">
            <input className={`${inputClass} w-40`} value={kode} onChange={(e) => setKode(e.target.value)} placeholder="PTB" />
          </Field>
          <Field label="Nama perusahaan">
            <input className={`${inputClass} w-64`} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="PT Contoh Baru" />
          </Field>
          <button
            onClick={tambahEntitas}
            disabled={!kodeBersih || !nama.trim() || kodeAda || saving}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg mb-3"
          >
            <Plus size={14} /> {saving ? "Menyimpan…" : "Tambah"}
          </button>
        </div>
        {kodeAda && <div className="text-[11px] text-red-400">Kode {kodeBersih} sudah dipakai.</div>}
      </div>

      {entitas.length === 0 ? (
        <EmptyState label="Belum ada perusahaan terdaftar." />
      ) : (
        <div className="space-y-3">
          {entitas.map((e) => (
            <KartuPerusahaan key={e.kode} e={e} rekening={rekeningDari(e.kode)} master={master} reload={reload} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}

function KartuPerusahaan({ e, rekening, master, reload, showToast }) {
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const kodeBersih = kode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const kodeAda = (master.rekening || []).some((r) => r.kode === kodeBersih);
  const isDefault = e.kode === "OPS";
  const adalahHolding = e.kode === kodeHoldingPasti(master.entitas, master.entitas_set);

  const tambahRekening = async () => {
    if (!kodeBersih || !label.trim() || kodeAda || saving) return;
    setSaving(true);
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening", kode: kodeBersih, label: label.trim() }) });
      // Entitas default (OPS) = tanpa penanda; entitas lain dipetakan lewat rekening_entitas.
      if (!isDefault) {
        await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening_entitas", kode: kodeBersih, label: e.kode }) });
      }
      showToast?.(`Rekening ${label.trim()} ditambahkan ke ${e.label}`);
      setKode("");
      setLabel("");
      await reload?.();
    } catch (err) {
      showToast?.(err.message || "Gagal menambah rekening", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Building2 size={14} className="text-amber-400" />
        <div className="text-sm font-semibold text-slate-100">{e.label}</div>
        <Badge color="slate">{e.kode}</Badge>
      </div>
      {rekening.length === 0 ? (
        <div className="text-[11px] text-slate-500 mb-2">Belum ada rekening. Tambahkan minimal satu supaya bisa mencatat transaksi.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {rekening.map((r) => (
            <span key={r.kode} className="text-[11px] px-2 py-1 rounded-md bg-slate-800 text-slate-300">
              {r.label} <span className="text-slate-500">({r.kode})</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} w-32`} value={kode} onChange={(x) => setKode(x.target.value)} placeholder="Kode rek." />
        <input className={`${inputClass} w-52`} value={label} onChange={(x) => setLabel(x.target.value)} placeholder="Nama rekening, mis. BCA PTB" />
        <button
          onClick={tambahRekening}
          disabled={!kodeBersih || !label.trim() || kodeAda || saving}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
        >
          + Rekening
        </button>
        {kodeAda && <span className="text-[11px] text-red-400">Kode rekening sudah dipakai.</span>}
      </div>
      <ProfilPerusahaan e={e} master={master} isDefault={isDefault} reload={reload} showToast={showToast} />
      {!adalahHolding && <FiturPerusahaan e={e} master={master} reload={reload} showToast={showToast} />}
    </div>
  );
}

// Fitur (menu) yang aktif di satu perusahaan. Default semua nyala; yang dimatikan disimpan di
// master_data tipe "entitas_fitur" (lihat fiturMatiEntitas di lib/constants.js) dan hilang dari
// sidebar semua akun perusahaan itu (kecuali Super Appa). Datanya tidak dihapus.
function FiturPerusahaan({ e, master, reload, showToast }) {
  const grup = useMemo(() => fiturTersediaEntitas(e.kode), [e.kode]);
  const semuaKunci = useMemo(() => grup.flatMap((g) => g.fitur.map((f) => f.key)), [grup]);
  const matiAwal = fiturMatiEntitas(master, e.kode).filter((k) => semuaKunci.includes(k));
  const penandaAwal = matiAwal.slice().sort().join("|");
  const [mati, setMati] = useState(() => new Set(matiAwal));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMati(new Set(penandaAwal ? penandaAwal.split("|") : []));
  }, [penandaAwal]);

  const berubah = [...mati].sort().join("|") !== penandaAwal;
  const nyala = semuaKunci.length - semuaKunci.filter((k) => mati.has(k)).length;
  const toggle = (key) =>
    setMati((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const simpan = async () => {
    if (saving || !berubah) return;
    setSaving(true);
    try {
      const baris = master.entitas_fitur || [];
      for (const key of semuaKunci) {
        const kodeBaris = `${e.kode}:${key}`;
        const ada = baris.find((m) => m.kode === kodeBaris);
        const harusMati = mati.has(key);
        if (harusMati && !ada) await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "entitas_fitur", kode: kodeBaris, label: "mati" }) });
        else if (harusMati && ada && ada.label !== "mati") await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: "mati" }) });
        else if (!harusMati && ada) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      }
      showToast?.(`Fitur ${e.label} disimpan`);
      await reload?.();
    } catch (err) {
      showToast?.(err.message || "Gagal menyimpan fitur", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="text-xs text-slate-300">
          Fitur perusahaan <span className="text-slate-500">({nyala} dari {semuaKunci.length} aktif)</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <button type="button" onClick={() => setMati(new Set())} className="text-amber-400 hover:text-amber-300">Nyalakan semua</button>
          <button type="button" onClick={() => setMati(new Set(semuaKunci))} className="text-slate-400 hover:text-slate-200">Matikan semua</button>
        </div>
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        Fitur yang dimatikan hilang dari menu semua akun {e.label} (Super Appa tetap melihat semuanya). Data tidak dihapus, dan bisa dinyalakan lagi kapan saja.
      </div>
      <div className="space-y-3 mb-3">
        {grup.map((g) => (
          <div key={g.grup}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">{g.grup}</div>
            <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1.5">
              {g.fitur.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-[12px] text-slate-300">
                  <input type="checkbox" checked={!mati.has(f.key)} onChange={() => toggle(f.key)} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={simpan}
        disabled={saving || !berubah}
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
      >
        {saving ? "Menyimpan…" : "Simpan fitur"}
      </button>
    </div>
  );
}

// Profil perusahaan: nama di kop nota & laporan, alamat kop, nama store, dan penanda Holding.
// Disimpan di master_data tipe "entitas_set" (lihat pengaturanEntitas di lib/api.js) — perusahaan
// baru cukup diisi di sini, tanpa ubah kode. Kosong = bawaan (OPS: kop Selma; lainnya: nama perusahaan).
function ProfilPerusahaan({ e, master, isDefault, reload, showToast }) {
  const awal = pengaturanEntitas(master, e.kode);
  const [namaPT, setNamaPT] = useState(e.label || "");
  const [namaUsaha, setNamaUsaha] = useState(awal.nama_usaha || "");
  const [alamat, setAlamat] = useState((awal.alamat || "").split("|").join("\n"));
  const [namaStore, setNamaStore] = useState(awal.nama_store || "");
  const [holding, setHolding] = useState(awal.jenis === "holding");
  const [saving, setSaving] = useState(false);

  const simpan = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const baris = master.entitas_set || [];
      const tulis = async (kodeEnt, kunci, isi) => {
        const kodeBaris = `${kodeEnt}:${kunci}`;
        const ada = baris.find((m) => m.kode === kodeBaris);
        if (ada && isi) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: isi }) });
        else if (ada && !isi) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
        else if (!ada && isi) await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "entitas_set", kode: kodeBaris, label: isi }) });
      };
      // Nama perusahaan (label entitas) boleh diganti; kodenya tidak, karena dipakai di semua data.
      if (namaPT.trim() && namaPT.trim() !== e.label && e.id) {
        await sb(`master_data?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ label: namaPT.trim() }) });
      }
      await tulis(e.kode, "nama_usaha", namaUsaha.trim());
      await tulis(e.kode, "alamat", alamat.split("\n").map((x) => x.trim()).filter(Boolean).join("|"));
      await tulis(e.kode, "nama_store", namaStore.trim());
      await tulis(e.kode, "jenis", holding ? "holding" : "");
      // Hanya satu perusahaan yang boleh bertanda Holding.
      if (holding) {
        for (const m of baris) {
          if (m.label === "holding" && String(m.kode).endsWith(":jenis") && m.kode !== `${e.kode}:jenis`) {
            await sb(`master_data?id=eq.${m.id}`, { method: "DELETE" });
          }
        }
      }
      showToast?.(`Profil ${e.label} disimpan`);
      await reload?.();
    } catch (err) {
      showToast?.(err.message || "Gagal menyimpan profil", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="text-xs text-slate-300 mb-2">Profil perusahaan</div>
      <Field label={`Nama perusahaan (kode ${e.kode} tidak bisa diubah)`}>
        <input className={inputClass} value={namaPT} onChange={(x) => setNamaPT(x.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Nama usaha (kop nota & laporan)">
          <input className={inputClass} value={namaUsaha} onChange={(x) => setNamaUsaha(x.target.value)} placeholder={isDefault ? "SELMA ACC BANDUNG" : e.label} />
        </Field>
        <Field label="Nama store (judul grup penjualan)">
          <input className={inputClass} value={namaStore} onChange={(x) => setNamaStore(x.target.value)} placeholder={isDefault ? "Store Selma" : `Store ${e.label}`} />
        </Field>
      </div>
      <Field label="Alamat kop nota (satu baris per baris)">
        <textarea className={inputClass} rows={3} value={alamat} onChange={(x) => setAlamat(x.target.value)} placeholder={isDefault ? "Kosong = alamat bawaan Selma" : "Jl. ...\nKota ..."} />
      </Field>
      {!isDefault && (
        <label className="flex items-center gap-2 text-[11px] text-slate-300 mb-3">
          <input type="checkbox" checked={holding} onChange={(x) => setHolding(x.target.checked)} />
          Perusahaan ini adalah Holding
        </label>
      )}
      <button
        onClick={simpan}
        disabled={saving}
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
      >
        {saving ? "Menyimpan…" : "Simpan profil"}
      </button>
    </div>
  );
}