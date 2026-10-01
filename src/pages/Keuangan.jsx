import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Pencil, Trash2, Check, X, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, Landmark, Download, MessageCircleMore, Copy, FileText, CalendarRange, BarChart3, Scale, RotateCcw, ChevronDown, ChevronRight, Receipt, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge, InputTanggal, formatTanggalID, ModalShell, suggestKode } from "../components/ui";
import {
  fmtRp,
  ringkasanKeuangan,
  saldoPerRekening,
  saldoAwalBulan,
  kodeSaldoAwal,
  arusKasPerPeriode,
  breakdownPengeluaranKategori,
  breakdownPemasukanKategori,
  kelompokkanBreakdown,
  laporanBulananData,
  rekapTahunanData,
  laporanLabaRugi,
  sb,
} from "../lib/api";
import { DetailPesananKeuanganModal, petaPesananKeuangan } from "../components/DetailPesananKeuangan";
import { roleLabel } from "../lib/constants";
import { buatLaporanNarasi } from "../lib/laporanNarasi";
import { generateLaporanBulananPdf, generateLaporanTahunanPdf } from "../lib/LaporanKeuanganPdf";

// Bikin 1 sel CSV aman: kalau isinya mengandung pemisah (;), tanda kutip,
// atau baris baru, dibungkus tanda kutip dan tanda kutip di dalamnya di-escape.
function csvCell(val) {
  const s = String(val ?? "");
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Susun & unduh laporan transaksi (yang sedang tampil di layar, sesuai
// filter aktif) sebagai file CSV — bisa langsung dibuka di Excel/Sheets.
// Dipisah pakai titik-koma (bukan koma) karena itu default Excel versi
// Indonesia, supaya kolomnya kebaca rapi tanpa perlu diatur manual dulu.
function downloadLaporanCsv({ rows, dari, sampai, ringkasan }) {
  const header = ["Tanggal", "Jenis", "Rekening", "Rekening Tujuan", "Kategori", "Keterangan", "Jumlah"];
  const lines = [header.map(csvCell).join(";")];

  rows.forEach((r) => {
    lines.push(
      [
        r.tanggal,
        r.jenisLabel,
        r.rekeningLabel,
        r.rekeningTujuanLabel || "",
        r.kategoriLabel || "",
        r.keterangan || "",
        r.jumlah,
      ]
        .map(csvCell)
        .join(";")
    );
  });

  lines.push("");
  lines.push([csvCell("Total Kas Masuk"), csvCell(ringkasan.masuk)].join(";"));
  lines.push([csvCell("Total Kas Keluar"), csvCell(ringkasan.keluar)].join(";"));
  lines.push([csvCell("Saldo (Masuk - Keluar)"), csvCell(ringkasan.saldo)].join(";"));

  // Prefix BOM supaya karakter (mis. "→") kebaca benar saat dibuka di Excel Windows.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `laporan-keuangan_${dari || "awal"}_sd_${sampai || "sekarang"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Bulan berjalan (YYYY-MM-01 s/d hari ini) sebagai rentang default saat
// halaman pertama dibuka — cukup relevan buat cek arus kas "bulan ini"
// tanpa perlu atur filter dulu, tapi tetap bisa diubah bebas.
function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}

// Cari label rekening/kategori dari kode-nya di master data. Kalau kode tidak
// ketemu di daftar (mis. sudah dihapus), tampilkan kode-nya saja sebagai fallback.
export function labelDari(list, kode) {
  if (!kode) return "";
  const found = (list || []).find((m) => m.kode === kode);
  return found ? found.label : kode;
}

export default function Keuangan({ sub, keuanganTransaksi = [], pesananMasuk = [], marketplaceTransaksi = [], master = {}, reload, showToast, setModal, session }) {
  if (sub === "riwayat") {
    return <RiwayatPerubahan master={master} session={session} />;
  }
  if (sub === "rekening") {
    return <RekeningKategori master={master} reload={reload} showToast={showToast} />;
  }
  if (sub === "laporan") {
    return (
      <LaporanKeuangan
        keuanganTransaksi={keuanganTransaksi}
        marketplaceTransaksi={marketplaceTransaksi}
        pesananMasuk={pesananMasuk}
        master={master}
        reload={reload}
        showToast={showToast}
      />
    );
  }
  if (sub === "log") {
    return <LogKeterangan keuanganTransaksi={keuanganTransaksi} master={master} reload={reload} showToast={showToast} />;
  }
  return (
    <Transaksi keuanganTransaksi={keuanganTransaksi} pesananMasuk={pesananMasuk} master={master} setModal={setModal} showToast={showToast} />
  );
}

// Modal "Laporan Sederhana" — menampilkan ringkasan keuangan sebagai narasi
// bahasa awam (bukan tabel angka), lengkap dengan tombol salin & kirim WhatsApp.
function LaporanNarasiModal({ teks, onClose, showToast }) {
  const [disalin, setDisalin] = useState(false);

  const salinTeks = async () => {
    try {
      await navigator.clipboard.writeText(teks);
      setDisalin(true);
      showToast?.("Teks laporan disalin");
      setTimeout(() => setDisalin(false), 2000);
    } catch {
      showToast?.("Gagal menyalin, coba salin manual", "err");
    }
  };

  const kirimWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(teks)}`, "_blank");
  };

  return (
    <ModalShell title="Laporan Keuangan — Ringkasan Sederhana" onClose={onClose}>
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 mb-3 max-h-[50vh] overflow-y-auto">
        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{teks}</pre>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={salinTeks}
          className="flex items-center justify-center gap-1.5 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold py-2.5 rounded-lg"
        >
          <Copy size={14} /> {disalin ? "Tersalin!" : "Salin Teks"}
        </button>
        <button
          onClick={kirimWhatsapp}
          className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-lg"
        >
          <MessageCircleMore size={14} /> Kirim via WhatsApp
        </button>
      </div>
    </ModalShell>
  );
}

// Grafik batang arus kas: dua batang (masuk & keluar) per kelompok tanggal.
// Skala sumbu-Y otomatis dibulatkan (1/2/5 × 10^n) supaya garis bantu rapi.
// Lebar SVG pakai viewBox tetap (responsif lewat CSS), dengan scroll horizontal
// kalau kelompoknya banyak supaya label tanggal tidak berdesakan.
export function GrafikArusKas({ mode, data }) {
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 p-6 text-center text-slate-500 text-sm mb-5">
        Belum ada transaksi pada rentang ini untuk ditampilkan sebagai grafik.
      </div>
    );
  }

  const H = 220;
  const marginLeft = 46;
  const marginBottom = 30;
  const marginTop = 16;
  const marginRight = 12;
  const minGroupW = 46;
  const chartW = Math.max(560, data.length * minGroupW) - marginLeft - marginRight;
  const W = chartW + marginLeft + marginRight;
  const chartH = H - marginTop - marginBottom;

  const nilaiMax = Math.max(1, ...data.flatMap((d) => [d.masuk, d.keluar]));
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(nilaiMax)));
    const norm = nilaiMax / pow;
    const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return niceNorm * pow;
  })();

  const groupW = chartW / data.length;
  const barW = Math.min(18, groupW * 0.3);
  const gap = 4;
  const y = (v) => marginTop + chartH - (v / niceMax) * chartH;
  const skalaLabel = (v) =>
    v >= 1000000 ? `${v / 1000000}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : `${Math.round(v)}`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);
  const labelStep = Math.max(1, Math.ceil(data.length / 14));

  return (
    <div className="rounded-xl border border-slate-800 p-4 mb-5 bg-slate-900/30">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs text-slate-400">
          Arus Kas {mode === "harian" ? "per Hari" : "per Minggu"} — Masuk vs Keluar
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Masuk
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Keluar
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, minWidth: "100%" }}>
          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={marginLeft} x2={W - marginRight} y1={y(g)} y2={y(g)} stroke="#1e293b" strokeWidth="1" />
              <text x={marginLeft - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#64748b">
                {skalaLabel(g)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = marginLeft + i * groupW + groupW / 2;
            const xMasuk = cx - gap / 2 - barW;
            const xKeluar = cx + gap / 2;
            const isHover = hover === i;
            return (
              <g
                key={d.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                <rect x={xMasuk} width={barW} y={y(d.masuk)} height={Math.max(0, y(0) - y(d.masuk))} rx="2" fill="#10b981" opacity={hover === null || isHover ? 1 : 0.35} />
                <rect x={xKeluar} width={barW} y={y(d.keluar)} height={Math.max(0, y(0) - y(d.keluar))} rx="2" fill="#ef4444" opacity={hover === null || isHover ? 1 : 0.35} />
                <text x={cx} y={H - marginBottom + 14} textAnchor="middle" fontSize="9" fill="#64748b">
                  {i % labelStep === 0 ? d.label : ""}
                </text>
                {isHover && (
                  <g>
                    <rect x={Math.min(Math.max(cx - 58, marginLeft), W - marginRight - 116)} y={marginTop} width="116" height="34" rx="4" fill="#0f172a" stroke="#334155" />
                    <text x={Math.min(Math.max(cx, marginLeft + 58), W - marginRight - 58)} y={marginTop + 13} textAnchor="middle" fontSize="9" fill="#34d399">
                      Masuk: {fmtRp(d.masuk)}
                    </text>
                    <text x={Math.min(Math.max(cx, marginLeft + 58), W - marginRight - 58)} y={marginTop + 25} textAnchor="middle" fontSize="9" fill="#f87171">
                      Keluar: {fmtRp(d.keluar)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const WARNA_KATEGORI = ["#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6", "#f43f5e", "#06b6d4", "#84cc16", "#f97316"];
const WARNA_LAINNYA = "#64748b";

function titikLingkaran(cx, cy, r, sudutDerajat) {
  const rad = ((sudutDerajat - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Path SVG untuk satu potongan donat, dari sudutAwal ke sudutAkhir (derajat, 0 = jam 12).
function potonganDonat(cx, cy, rLuar, rDalam, sudutAwal, sudutAkhir) {
  const besar = sudutAkhir - sudutAwal <= 180 ? 0 : 1;
  const aLuar = titikLingkaran(cx, cy, rLuar, sudutAkhir);
  const bLuar = titikLingkaran(cx, cy, rLuar, sudutAwal);
  const aDalam = titikLingkaran(cx, cy, rDalam, sudutAwal);
  const bDalam = titikLingkaran(cx, cy, rDalam, sudutAkhir);
  return [
    `M ${aLuar.x} ${aLuar.y}`,
    `A ${rLuar} ${rLuar} 0 ${besar} 0 ${bLuar.x} ${bLuar.y}`,
    `L ${aDalam.x} ${aDalam.y}`,
    `A ${rDalam} ${rDalam} 0 ${besar} 1 ${bDalam.x} ${bDalam.y}`,
    "Z",
  ].join(" ");
}

// Breakdown per kategori (dipakai untuk Pengeluaran maupun Pemasukan): donat +
// daftar persentase. Kategori di luar 6 besar digabung jadi "Lainnya" di donat
// (biar potongannya tidak terlalu tipis/rapat), tapi daftar di sisi kanan
// tetap menampilkan semua kategori.
export function BreakdownKategori({ total, data, judul, kosong, onKategoriClick }) {
  const [hover, setHover] = useState(null);

  if (total === 0 || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 p-6 text-center text-slate-500 text-sm mb-5">
        {kosong || "Belum ada transaksi pada rentang ini untuk ditampilkan."}
      </div>
    );
  }

  const TOP_N = 6;
  const utama = data.slice(0, TOP_N);
  const sisa = data.slice(TOP_N);
  const jumlahLainnya = sisa.reduce((a, d) => a + d.jumlah, 0);
  const slices = jumlahLainnya > 0
    ? [...utama, { kode: "__lainnya__", label: `Lainnya (${sisa.length} kategori)`, jumlah: jumlahLainnya, persen: (jumlahLainnya / total) * 100 }]
    : utama;

  const cx = 60, cy = 60, rLuar = 58, rDalam = 34;
  let kumulatif = 0;
  const arcs = slices.map((s, i) => {
    const awal = (kumulatif / 100) * 360;
    kumulatif += s.persen;
    const akhir = (kumulatif / 100) * 360;
    const warna = s.kode === "__lainnya__" ? WARNA_LAINNYA : WARNA_KATEGORI[i % WARNA_KATEGORI.length];
    return { ...s, path: potonganDonat(cx, cy, rLuar, rDalam, awal, akhir), warna, idx: i };
  });

  const aktif = hover !== null ? arcs[hover] : null;

  return (
    <div className="rounded-xl border border-slate-800 p-4 mb-5 bg-slate-900/30">
      <div className="text-xs text-slate-400 mb-3">{judul || "Per Kategori"}</div>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative shrink-0">
          <svg viewBox="0 0 120 120" width="150" height="150">
            {arcs.map((a) => (
              <path
                key={a.kode || a.label}
                d={a.path}
                fill={a.warna}
                opacity={hover === null || hover === a.idx ? 1 : 0.35}
                onMouseEnter={() => setHover(a.idx)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onKategoriClick && a.kode !== "__lainnya__" && onKategoriClick(a)}
                style={{ cursor: onKategoriClick && a.kode !== "__lainnya__" ? "pointer" : "default" }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
            {aktif ? (
              <>
                <div className="text-[10px] text-slate-400 leading-tight truncate max-w-[70px]">{aktif.label}</div>
                <div className="text-xs font-semibold text-slate-100">{Math.round(aktif.persen)}%</div>
              </>
            ) : (
              <>
                <div className="text-[10px] text-slate-500">Total</div>
                <div className="text-xs font-semibold text-slate-100">{fmtRp(total)}</div>
              </>
            )}
          </div>
        </div>

        <div className="w-full flex-1 space-y-2 max-h-52 overflow-y-auto pr-1">
          {data.map((d, i) => {
            const warna = i < TOP_N ? WARNA_KATEGORI[i % WARNA_KATEGORI.length] : WARNA_LAINNYA;
            const idxSlice = i < TOP_N ? i : arcs.length - 1;
            return (
              <div
                key={d.kode || d.label}
                className={onKategoriClick ? "cursor-pointer hover:bg-slate-800/40 rounded-md -mx-1 px-1 py-0.5" : ""}
                onMouseEnter={() => setHover(idxSlice)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onKategoriClick && onKategoriClick(d)}
              >
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="flex items-center gap-1.5 text-slate-300 truncate">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: warna }} />
                    <span className="truncate">{d.label}</span>
                    {d.isGrup && (
                      <span className="text-[10px] text-slate-500 shrink-0">{d.anak.length} kategori ›</span>
                    )}
                  </span>
                  <span className="text-slate-400 shrink-0 ml-2">{fmtRp(d.jumlah)} · {Math.round(d.persen)}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${d.persen}%`, backgroundColor: warna }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Wrapper khusus Pengeluaran (dipertahankan namanya supaya pemanggil lama —
// Dashboard.jsx dll — tidak perlu diubah).
export function BreakdownPengeluaran({ total, data, onKategoriClick }) {
  return (
    <BreakdownKategori
      total={total}
      data={data}
      judul="Pengeluaran per Kategori — mana yang paling boros"
      kosong="Belum ada pengeluaran pada rentang ini untuk ditampilkan."
      onKategoriClick={onKategoriClick}
    />
  );
}

// Wrapper khusus Pemasukan — pasangan dari BreakdownPengeluaran di atas,
// menampilkan dari kategori mana pemasukan paling banyak berasal.
export function BreakdownPemasukan({ total, data, onKategoriClick }) {
  return (
    <BreakdownKategori
      total={total}
      data={data}
      judul="Pemasukan per Kategori — sumber dana paling besar"
      kosong="Belum ada pemasukan pada rentang ini untuk ditampilkan."
      onKategoriClick={onKategoriClick}
    />
  );
}

// Modal rincian transaksi untuk satu kategori (dipicu klik pada donat/daftar
// BreakdownKategori) — daftar tiap transaksi kategori itu pada rentang yang
// sama dengan grafiknya, diurutkan terbaru dulu, ditutup total keseluruhan.
export function DetailTransaksiKategoriModal({ kategori, tipe, list, rekeningList, subtitle, onClose, onBack, labelKembali, pesananMasuk = [] }) {
  const [lihatPesanan, setLihatPesanan] = useState(null); // { transaksi, pesanan }
  const petaPesanan = useMemo(() => petaPesananKeuangan(pesananMasuk), [pesananMasuk]);
  if (lihatPesanan) {
    return (
      <DetailPesananKeuanganModal
        transaksi={lihatPesanan.transaksi}
        pesanan={lihatPesanan.pesanan}
        pesananMasuk={pesananMasuk}
        onClose={onClose}
        onBack={() => setLihatPesanan(null)}
        labelKembali={kategori.label}
      />
    );
  }
  const rows = (list || [])
    .filter((t) => t.tipe === tipe && (t.kategori || "") === (kategori.kode || ""))
    .sort((a, b) => (b.tanggal + (b.created_at || "")).localeCompare(a.tanggal + (a.created_at || "")));
  const total = rows.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  return (
    <ModalShell title={kategori.label} onClose={onClose}>
      {onBack && (
        <button onClick={onBack} className="text-xs text-amber-400 hover:text-amber-300 mb-2">
          ← Kembali{labelKembali ? ` ke ${labelKembali}` : ""}
        </button>
      )}
      {subtitle && <div className="text-[11px] text-slate-500 -mt-2 mb-3">{subtitle}</div>}
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        <div className="max-h-[45vh] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              Tidak ada transaksi kategori ini pada rentang tersebut.
            </div>
          ) : (
            rows.map((t, i) => (
              <div
                key={t.id || i}
                className={`px-3.5 py-2.5 flex items-center justify-between gap-2 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <div className="min-w-0">
                  <div className="text-xs text-slate-200 truncate">{t.keterangan || "—"}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatTanggalID(t.tanggal)} · {labelDari(rekeningList, t.rekening)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {petaPesanan.get(t.id) && (
                    <button
                      onClick={() => setLihatPesanan({ transaksi: t, pesanan: petaPesanan.get(t.id) })}
                      className="p-1.5 rounded-lg text-amber-400/80 hover:text-amber-300 hover:bg-slate-800"
                      title="Lihat detail pesanan barang"
                    >
                      <Receipt size={13} />
                    </button>
                  )}
                  <div className={`text-sm font-semibold ${tipe === "masuk" ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtRp(t.jumlah)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-400">Total ({rows.length} transaksi)</span>
        <span className="text-sm font-semibold text-slate-100">{fmtRp(total)}</span>
      </div>
    </ModalShell>
  );
}

// Modal untuk satu KELOMPOK kategori — bisa ditelusuri bertingkat:
//   Kategori (mis. "Biaya Operasional") -> Sub Kategori ("Biaya Tetap")
//   -> Rincian (kategori master: "Gaji Karyawan", "Listrik", ...)
//   -> daftar transaksi kategori itu (per pesanan/catatan).
// Tiap level menampilkan isi kelompok + total, klik salah satu untuk masuk
// lebih dalam; tombol "Kembali" naik satu level.
export function DetailKelompokModal({ kelompok, tipe, list, rekeningList, subtitle, onClose, pesananMasuk = [] }) {
  const [jejak, setJejak] = useState([]); // kelompok yang sudah dimasuki (di bawah akar)
  const [daun, setDaun] = useState(null); // kategori master yang sedang dilihat transaksinya

  const jalur = [kelompok, ...jejak];
  const sekarang = jalur[jalur.length - 1];
  const induk = jalur.length > 1 ? jalur[jalur.length - 2] : null;

  if (daun) {
    return (
      <DetailTransaksiKategoriModal
        kategori={daun}
        tipe={tipe}
        list={list}
        rekeningList={rekeningList}
        subtitle={subtitle}
        onClose={onClose}
        onBack={() => setDaun(null)}
        labelKembali={sekarang.label}
        pesananMasuk={pesananMasuk}
      />
    );
  }

  const anak = [...(sekarang.anak || [])].sort((a, b) => b.jumlah - a.jumlah);
  const total = anak.reduce((a, d) => a + d.jumlah, 0);

  return (
    <ModalShell title={jalur.map((n) => n.label).join(" › ")} onClose={onClose}>
      {induk || jejak.length > 0 ? (
        <button onClick={() => setJejak((j) => j.slice(0, -1))} className="text-xs text-amber-400 hover:text-amber-300 mb-2">
          ← Kembali ke {induk.label}
        </button>
      ) : null}
      {subtitle && <div className="text-[11px] text-slate-500 -mt-2 mb-3">{subtitle}</div>}
      <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
        {anak.map((d, i) => (
          <button
            key={d.kode || d.label}
            onClick={() => (d.isGrup ? setJejak((j) => [...j, d]) : setDaun({ kode: d.kode, label: d.label }))}
            className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-2 hover:bg-slate-800/60 ${
              i % 2 ? "bg-slate-950" : "bg-slate-900"
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm text-slate-200 truncate">{d.label}</div>
              <div className="text-[11px] text-slate-500">
                {d.isGrup ? "Sub Kategori" : "Rincian"} · {total > 0 ? Math.round((d.jumlah / total) * 100) : 0}% dari{" "}
                {sekarang.label} · {d.isGrup ? "buka isinya" : "lihat transaksi"} ›
              </div>
            </div>
            <div className={`text-sm font-semibold shrink-0 ${tipe === "masuk" ? "text-emerald-400" : "text-red-400"}`}>
              {fmtRp(d.jumlah)}
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-400">Total ({anak.length} item)</span>
        <span className="text-sm font-semibold text-slate-100">{fmtRp(total)}</span>
      </div>
    </ModalShell>
  );
}

// Laporan Laba Rugi (Income Statement) — rincian tiap kategori Pendapatan &
// Beban untuk satu rentang tanggal, ditutup dengan Laba (Rugi) Bersih dan
// margin-nya. Dipakai bareng oleh halaman Laporan Keuangan (rentang bebas)
// dan Dashboard Keuangan (rentang bulan berjalan, menggantikan tabel
// Transaksi Terbaru supaya dashboard langsung menunjukkan untung/rugi).
// Satu baris (dan turunannya) di Laporan Laba Rugi. Kelompok (isGrup) bisa
// dibuka/ditutup — Kategori -> Sub Kategori -> Rincian; kategori biasa (daun)
// tampil sebagai baris polos.
function BarisLabaRugi({ d, depth, seksi, terbuka, toggle, onKategoriClick }) {
  const kunci = `${seksi}:${d.kode}`;
  const open = d.isGrup && terbuka.has(kunci);
  // Kalau onKategoriClick diberikan, baris kategori biasa (daun) bisa diklik
  // untuk membuka rincian transaksinya — sama seperti klik di grafik
  // Breakdown Pemasukan/Pengeluaran. Baris kelompok tetap buka/tutup.
  const bisaDiklik = !d.isGrup && !!onKategoriClick;
  const klik = () => onKategoriClick({ tipe: seksi, kode: d.kode, label: d.label, isGrup: false, anak: d.anak });
  return (
    <>
      <tr
        className={`border-b border-slate-800/40 last:border-0 ${bisaDiklik ? "cursor-pointer hover:bg-slate-800/40" : ""}`}
        onClick={bisaDiklik ? klik : undefined}
        title={bisaDiklik ? "Klik untuk lihat rincian transaksi" : undefined}
      >
        <td className="pr-4 py-1.5 text-slate-300" style={{ paddingLeft: 32 + depth * 20 }}>
          {d.isGrup ? (
            <button onClick={() => toggle(kunci)} className="flex items-center gap-1.5 text-left font-medium hover:text-slate-100">
              {open ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-500" />}
              {d.label}
              <span className="text-[10px] text-slate-500 font-normal">({d.anak.length})</span>
            </button>
          ) : (
            <span className={`inline-block pl-[19px] ${bisaDiklik ? "underline decoration-dotted decoration-slate-600 underline-offset-4" : ""}`}>{d.label}</span>
          )}
        </td>
        <td className={`px-4 py-1.5 text-right ${d.isGrup ? "text-slate-200 font-medium" : "text-slate-300"}`}>{fmtRp(d.jumlah)}</td>
      </tr>
      {open &&
        d.anak.map((c) => (
          <BarisLabaRugi key={c.kode || c.label} d={c} depth={depth + 1} seksi={seksi} terbuka={terbuka} toggle={toggle} onKategoriClick={onKategoriClick} />
        ))}
    </>
  );
}

function kunciSemuaKelompok(data, seksi) {
  return (data || []).flatMap((d) => (d.isGrup ? [`${seksi}:${d.kode}`, ...kunciSemuaKelompok(d.anak, seksi)] : []));
}

export function LaporanLabaRugi({ pendapatan, beban, labaRugi, marginPersen, subtitle, action, onKategoriClick }) {
  const untung = labaRugi >= 0;
  const [terbuka, setTerbuka] = useState(() => new Set());
  const toggle = (k) =>
    setTerbuka((s) => {
      const next = new Set(s);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const semuaKunci = [...kunciSemuaKelompok(pendapatan.data, "masuk"), ...kunciSemuaKelompok(beban.data, "keluar")];
  const adaKelompok = semuaKunci.length > 0;
  const semuaTerbuka = adaKelompok && semuaKunci.every((k) => terbuka.has(k));
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-slate-400" />
          <div className="text-sm font-semibold">Laporan Laba Rugi</div>
          {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3">
          {adaKelompok && (
            <button
              onClick={() => setTerbuka(semuaTerbuka ? new Set() : new Set(semuaKunci))}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              {semuaTerbuka ? "Tutup semua" : "Buka semua"}
            </button>
          )}
          {action}
        </div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td colSpan={2} className="px-4 py-2 font-semibold text-emerald-400 bg-emerald-500/5">PENDAPATAN</td>
          </tr>
          {pendapatan.data.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-3 text-center text-slate-600 text-xs">Belum ada pendapatan pada rentang ini.</td>
            </tr>
          ) : (
            pendapatan.data.map((d) => (
              <BarisLabaRugi key={d.kode || d.label} d={d} depth={0} seksi="masuk" terbuka={terbuka} toggle={toggle} onKategoriClick={onKategoriClick} />
            ))
          )}
          <tr className="bg-slate-900/60">
            <td className="px-4 py-2 font-semibold text-slate-100">Total Pendapatan</td>
            <td className="px-4 py-2 text-right font-semibold text-emerald-400">{fmtRp(pendapatan.total)}</td>
          </tr>

          <tr>
            <td colSpan={2} className="px-4 py-2 font-semibold text-red-400 bg-red-500/5">BEBAN (PENGELUARAN)</td>
          </tr>
          {beban.data.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-3 text-center text-slate-600 text-xs">Belum ada beban pada rentang ini.</td>
            </tr>
          ) : (
            beban.data.map((d) => (
              <BarisLabaRugi key={d.kode || d.label} d={d} depth={0} seksi="keluar" terbuka={terbuka} toggle={toggle} onKategoriClick={onKategoriClick} />
            ))
          )}
          <tr className="bg-slate-900/60">
            <td className="px-4 py-2 font-semibold text-slate-100">Total Beban</td>
            <td className="px-4 py-2 text-right font-semibold text-red-400">{fmtRp(beban.total)}</td>
          </tr>

          <tr className={untung ? "bg-emerald-500/10" : "bg-red-500/10"}>
            <td className={`px-4 py-3 font-bold text-base ${untung ? "text-emerald-400" : "text-red-400"}`}>
              LABA (RUGI) BERSIH
            </td>
            <td className={`px-4 py-3 text-right font-bold text-base ${untung ? "text-emerald-400" : "text-red-400"}`}>
              {labaRugi < 0 ? `(${fmtRp(Math.abs(labaRugi)).replace("Rp ", "")})` : fmtRp(labaRugi)}
            </td>
          </tr>
          <tr>
            <td className="px-4 py-1.5 text-xs text-slate-500">Margin Laba Bersih</td>
            <td className={`px-4 py-1.5 text-right text-xs font-medium ${untung ? "text-emerald-400" : "text-red-400"}`}>
              {(Math.round(marginPersen * 10) / 10).toLocaleString("id-ID")}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Transaksi({ keuanganTransaksi, pesananMasuk = [], master, setModal, showToast }) {
  const [detailPesanan, setDetailPesanan] = useState(null); // { transaksi, pesanan }
  const petaPesanan = useMemo(() => petaPesananKeuangan(pesananMasuk), [pesananMasuk]);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniIso());
  const [tipeFilter, setTipeFilter] = useState("");
  const [q, setQ] = useState("");

  const rekeningList = master.rekening || [];
  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];

  const { list } = ringkasanKeuangan(keuanganTransaksi, dari || null, sampai || null);

  const filtered = list
    .filter((t) => !tipeFilter || t.tipe === tipeFilter)
    .filter((t) => {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      const kategoriLabel = labelDari(t.tipe === "masuk" ? kategoriMasukList : kategoriKeluarList, t.kategori);
      const rekeningLabel = labelDari(rekeningList, t.rekening);
      return (
        kategoriLabel.toLowerCase().includes(s) ||
        rekeningLabel.toLowerCase().includes(s) ||
        (t.keterangan || "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));

  return (
    <div>
      <PageHeader
        title="Transaksi Keuangan"
        description="Pencatatan kas masuk, kas keluar, dan transfer antar rekening. Untuk ringkasan, grafik, dan unduh laporan, buka menu Laporan Keuangan."
        sticky
        action={
          <button
            onClick={() => setModal({ type: "keuangan-transaksi-form" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Transaksi
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Jenis</option>
          <option value="masuk">Pemasukan</option>
          <option value="keluar">Pengeluaran</option>
          <option value="transfer">Transfer Antar Rekening</option>
        </select>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kategori, rekening, atau keterangan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || tipeFilter ? "Tidak ada transaksi yang cocok." : "Belum ada transaksi di rentang ini."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((t, i) => {
            const isTransfer = t.tipe === "transfer";
            const kategoriLabel = labelDari(t.tipe === "masuk" ? kategoriMasukList : kategoriKeluarList, t.kategori);
            const rekeningLabel = labelDari(rekeningList, t.rekening);
            const rekeningTujuanLabel = labelDari(rekeningList, t.rekening_tujuan);
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <button
                  onClick={() => setModal({ type: "keuangan-transaksi-form", item: t })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isTransfer ? (
                      <Badge color="sky">Transfer</Badge>
                    ) : (
                      <Badge color={t.tipe === "masuk" ? "emerald" : "red"}>{kategoriLabel}</Badge>
                    )}
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      {isTransfer ? (
                        <>
                          {rekeningLabel} <ArrowRightLeft size={10} /> {rekeningTujuanLabel}
                        </>
                      ) : (
                        rekeningLabel
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {formatTanggalID(t.tanggal)}{t.keterangan ? ` · ${t.keterangan}` : ""}
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className={`text-sm font-semibold ${
                      isTransfer ? "text-sky-400" : t.tipe === "masuk" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isTransfer ? "" : t.tipe === "masuk" ? "+" : "-"}{fmtRp(t.jumlah)}
                  </div>
                  {petaPesanan.get(t.id) && (
                    <button
                      onClick={() => setDetailPesanan({ transaksi: t, pesanan: petaPesanan.get(t.id) })}
                      className="p-1.5 rounded-lg text-amber-400/80 hover:text-amber-300 hover:bg-slate-800"
                      title="Lihat detail pesanan barang"
                    >
                      <Receipt size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setModal({ type: "keuangan-transaksi-form", item: t })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setModal({ type: "hapus-keuangan-transaksi", item: t })}
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

      {detailPesanan && (
        <DetailPesananKeuanganModal
          transaksi={detailPesanan.transaksi}
          pesanan={detailPesanan.pesanan}
          pesananMasuk={pesananMasuk}
          onClose={() => setDetailPesanan(null)}
        />
      )}
    </div>
  );
}

// Halaman "Log Keterangan" — daftar semua keterangan transaksi yang pernah
// diketik, dikelompokkan per teks yang sama (tanpa peduli besar/kecil huruf),
// dihitung berapa kali dipakai, dan kapan terakhir dipakai. Ini sumber yang
// sama dipakai buat rekomendasi otomatis di field "Keterangan" pada form
// Tambah/Edit Transaksi — halaman ini cuma menampilkannya biar bisa dicek
// keterangan apa saja yang sudah pernah dicatat.
//
// "Hapus" di sini TIDAK menghapus transaksi aslinya (data keuangan tetap utuh,
// riwayat & laporan tidak berubah) — cuma menyembunyikan teks itu dari daftar
// log ini dan dari rekomendasi otomatis, buat keterangan typo/satu-kali-pakai
// yang tidak mau muncul lagi. Disimpan sebagai baris baru di master_data
// dengan tipe "keterangan_hidden" (pola yang sama dengan rekening/kategori).
function LogKeterangan({ keuanganTransaksi, master, reload, showToast }) {
  const [q, setQ] = useState("");
  const [tipeFilter, setTipeFilter] = useState("");
  const [hidingKey, setHidingKey] = useState(null);

  const rekeningList = master.rekening || [];
  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];
  const hiddenList = master.keterangan_hidden || [];
  const hiddenSet = new Set(hiddenList.map((m) => m.label.toLowerCase()));

  // Kelompokkan per (tipe + keterangan) — keterangan yang sama tapi beda tipe
  // (mis. "Titip Sesama" di Pemasukan vs Pengeluaran) dihitung terpisah,
  // karena konteksnya beda meski teksnya kebetulan sama.
  const grouped = (() => {
    const map = new Map();
    for (const t of keuanganTransaksi || []) {
      const keterangan = (t.keterangan || "").trim();
      if (!keterangan || hiddenSet.has(keterangan.toLowerCase())) continue;
      const groupKey = `${t.tipe}::${keterangan.toLowerCase()}`;
      const existing = map.get(groupKey);
      if (existing) {
        existing.count += 1;
        existing.total += Number(t.jumlah) || 0;
        if (t.tanggal > existing.terakhir) existing.terakhir = t.tanggal;
      } else {
        map.set(groupKey, {
          keterangan,
          tipe: t.tipe,
          kategori: t.kategori,
          count: 1,
          total: Number(t.jumlah) || 0,
          terakhir: t.tanggal,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.terakhir.localeCompare(a.terakhir));
  })();

  const filtered = grouped
    .filter((g) => !tipeFilter || g.tipe === tipeFilter)
    .filter((g) => !q.trim() || g.keterangan.toLowerCase().includes(q.trim().toLowerCase()));

  const tipeMeta = {
    masuk: { label: "Pemasukan", color: "emerald" },
    keluar: { label: "Pengeluaran", color: "red" },
    transfer: { label: "Transfer", color: "sky" },
  };

  const hapusDariLog = async (g) => {
    const key = `${g.tipe}::${g.keterangan.toLowerCase()}`;
    setHidingKey(key);
    try {
      await sb("master_data", {
        method: "POST",
        body: JSON.stringify({
          tipe: "keterangan_hidden",
          kode: `KH${Date.now()}`,
          label: g.keterangan,
        }),
      });
      await reload();
      showToast?.("Keterangan dihapus dari log & rekomendasi");
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
    } finally {
      setHidingKey(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Log Keterangan"
        description="Daftar keterangan yang pernah dicatat di Transaksi, dikelompokkan dan diurutkan dari yang paling sering dipakai. Teks ini juga yang jadi rekomendasi otomatis saat mengisi keterangan transaksi baru. Hapus di sini hanya menyembunyikan dari log & rekomendasi — transaksi aslinya tidak ikut terhapus."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Jenis</option>
          <option value="masuk">Pemasukan</option>
          <option value="keluar">Pengeluaran</option>
          <option value="transfer">Transfer Antar Rekening</option>
        </select>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari keterangan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || tipeFilter ? "Tidak ada keterangan yang cocok." : "Belum ada transaksi dengan keterangan."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((g, i) => {
            const kategoriLabel =
              g.tipe === "masuk"
                ? labelDari(kategoriMasukList, g.kategori)
                : g.tipe === "keluar"
                ? labelDari(kategoriKeluarList, g.kategori)
                : "";
            const meta = tipeMeta[g.tipe] || { label: g.tipe, color: "slate" };
            const key = `${g.tipe}::${g.keterangan.toLowerCase()}`;
            return (
              <div
                key={key}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={meta.color}>{meta.label}</Badge>
                    {kategoriLabel && <span className="text-[11px] text-slate-500">{kategoriLabel}</span>}
                  </div>
                  <div className="text-sm text-slate-200 mt-0.5 truncate">{g.keterangan}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Dipakai {g.count}x · Terakhir {formatTanggalID(g.terakhir)}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Total</div>
                    <div className="text-sm font-semibold text-slate-200">{fmtRp(g.total)}</div>
                  </div>
                  <button
                    onClick={() => hapusDariLog(g)}
                    disabled={hidingKey === key}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 disabled:opacity-40"
                    title="Hapus dari log & rekomendasi"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Halaman "Laporan Keuangan" — ringkasan, grafik arus kas, breakdown
const BULAN_LABEL_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Panel "Saldo Awal Bulan" — saldo awal per rekening utk bulan yang dipilih.
// Default OTOMATIS = nyambung dari akumulasi saldo transaksi sebelum bulan
// itu (jadi otomatis = saldo akhir bulan sebelumnya), tapi tiap rekening bisa
// dioverride manual sendiri-sendiri (mis. saat mulai pakai sistem di tengah
// tahun, atau ada koreksi/penyesuaian kas). Override tersimpan di master_data
// tipe "saldo_awal" — lihat saldoAwalBulan() di lib/api.js.
function SaldoAwalBulan({ keuanganTransaksi, rekeningList, saldoAwalList, reload, showToast }) {
  const now = new Date();
  const [tahun, setTahun] = useState(now.getFullYear());
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [editKode, setEditKode] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (rekeningList.length === 0) return null;

  const data = saldoAwalBulan(keuanganTransaksi, rekeningList, saldoAwalList, tahun, bulan);

  const startEdit = (r) => {
    setEditKode(r.kode);
    setEditValue(String(r.jumlah));
  };
  const cancelEdit = () => {
    setEditKode(null);
    setEditValue("");
  };

  const simpanOverride = async (r) => {
    const nilai = Number(editValue);
    if (Number.isNaN(nilai)) {
      showToast("Jumlah tidak valid", "err");
      return;
    }
    setSaving(true);
    try {
      if (r.manual && r.id) {
        await sb(`master_data?id=eq.${r.id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: String(nilai) }),
        });
      } else {
        await sb("master_data", {
          method: "POST",
          body: JSON.stringify({ tipe: "saldo_awal", kode: kodeSaldoAwal(tahun, bulan, r.kode), label: String(nilai) }),
        });
      }
      await reload();
      cancelEdit();
      showToast("Saldo awal disimpan");
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(false);
    }
  };

  const resetOtomatis = async (r) => {
    if (!r.id) return;
    setSaving(true);
    try {
      await sb(`master_data?id=eq.${r.id}`, { method: "DELETE" });
      await reload();
      showToast("Dikembalikan ke otomatis");
    } catch (e) {
      showToast(e.message || "Gagal menghapus", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs text-slate-400">Saldo Awal Bulan (otomatis nyambung dari bulan sebelumnya, bisa diedit manual)</div>
        <div className="flex items-center gap-1.5">
          <select
            value={bulan}
            onChange={(e) => setBulan(Number(e.target.value))}
            className={`${inputClass} w-auto text-xs py-1`}
          >
            {BULAN_LABEL_PANJANG.map((l, i) => (
              <option key={l} value={i + 1}>{l}</option>
            ))}
          </select>
          <select
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
            className={`${inputClass} w-auto text-xs py-1`}
          >
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.map((r) => (
          <div key={r.kode} className="rounded-xl border border-slate-800 p-3 bg-slate-900/50">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <Landmark size={12} className="flex-shrink-0" /> <span className="truncate">{r.label}</span>
              </div>
              <Badge color={r.manual ? "amber" : "slate"}>{r.manual ? "Manual" : "Otomatis"}</Badge>
            </div>
            {editKode === r.kode ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={`${inputClass} text-sm py-1`}
                />
                <button onClick={() => simpanOverride(r)} disabled={saving} className="text-emerald-400 hover:text-emerald-300 p-1 flex-shrink-0">
                  <Check size={14} />
                </button>
                <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-300 p-1 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1">
                <div className="text-base font-semibold text-slate-100">{fmtRp(r.jumlah)}</div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => startEdit(r)} className="text-slate-500 hover:text-slate-300 p-1" title="Edit saldo awal">
                    <Pencil size={12} />
                  </button>
                  {r.manual && (
                    <button onClick={() => resetOtomatis(r)} className="text-slate-500 hover:text-slate-300 p-1" title="Pakai otomatis">
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// pengeluaran per kategori, saldo per rekening, dan unduh laporan (CSV /
// narasi WhatsApp). Dipisah dari halaman Transaksi supaya Transaksi tetap
// ringkas (cuma daftar catatan), sementara semua "angka besar" ada di sini.
function LaporanKeuangan({ keuanganTransaksi, pesananMasuk = [], marketplaceTransaksi = [], master, reload, showToast }) {
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniIso());
  const [showLaporanNarasi, setShowLaporanNarasi] = useState(false);
  const [detailKategori, setDetailKategori] = useState(null);

  const rekeningList = master.rekening || [];
  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];

  const { masuk, keluar, saldo, list } = ringkasanKeuangan(keuanganTransaksi, dari || null, sampai || null);

  const saldoRekening = saldoPerRekening(keuanganTransaksi, rekeningList, true);
  const arusKas = arusKasPerPeriode(list);
  const breakdownKeluar = breakdownPengeluaranKategori(list, kategoriKeluarList);
  const breakdownMasuk = breakdownPemasukanKategori(list, kategoriMasukList);
  // Kelompok kategori buatan user (Keuangan > Rekening & Kategori) — kategori
  // yang dipetakan ke kelompok yang sama digabung jadi satu baris di grafik.
  const dataMasukGrup = kelompokkanBreakdown(breakdownMasuk.data, master.kelompok_masuk, breakdownMasuk.total);
  const dataKeluarGrup = kelompokkanBreakdown(breakdownKeluar.data, master.kelompok_keluar, breakdownKeluar.total);
  const labaRugi = laporanLabaRugi(
    keuanganTransaksi,
    kategoriMasukList,
    kategoriKeluarList,
    dari || null,
    sampai || null,
    master.kelompok_masuk,
    master.kelompok_keluar
  );

  const sorted = [...list].sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));

  const teksLaporanNarasi = buatLaporanNarasi({
    dari,
    sampai,
    list,
    saldoRekening,
    kategoriKeluarList,
  });

  return (
    <div>
      <PageHeader
        title="Laporan Keuangan"
        description="Ringkasan, grafik arus kas, dan breakdown pengeluaran mengikuti rentang tanggal yang dipilih di bawah. Untuk mencatat transaksi, buka menu Transaksi."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                downloadLaporanCsv({
                  rows: sorted.map((t) => ({
                    tanggal: t.tanggal,
                    jenisLabel: t.tipe === "masuk" ? "Pemasukan" : t.tipe === "keluar" ? "Pengeluaran" : "Transfer",
                    rekeningLabel: labelDari(rekeningList, t.rekening),
                    rekeningTujuanLabel: t.tipe === "transfer" ? labelDari(rekeningList, t.rekening_tujuan) : "",
                    kategoriLabel:
                      t.tipe === "masuk"
                        ? labelDari(kategoriMasukList, t.kategori)
                        : t.tipe === "keluar"
                        ? labelDari(kategoriKeluarList, t.kategori)
                        : "",
                    keterangan: t.keterangan,
                    jumlah: t.jumlah,
                  })),
                  dari,
                  sampai,
                  ringkasan: { masuk, keluar, saldo },
                })
              }
              disabled={sorted.length === 0}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Download size={14} /> Unduh CSV
            </button>
            <button
              onClick={() => setShowLaporanNarasi(true)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <FileText size={14} /> Laporan Sederhana
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Kas Masuk" value={fmtRp(masuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Kas Keluar" value={fmtRp(keluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard
          label="Saldo (Masuk - Keluar)"
          value={fmtRp(saldo)}
          accent={saldo >= 0 ? "text-emerald-400" : "text-red-400"}
          icon={Wallet}
          iconColor={saldo >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

      <SaldoAwalBulan
        keuanganTransaksi={keuanganTransaksi}
        rekeningList={rekeningList}
        saldoAwalList={master.saldo_awal || []}
        reload={reload}
        showToast={showToast}
      />

      {rekeningList.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-slate-400 mb-2">Saldo per Rekening (akumulasi seluruh transaksi)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {saldoRekening.map((r) => (
              <div key={r.kode} className="rounded-xl border border-slate-800 p-3 bg-slate-900/50">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                  <Landmark size={12} /> {r.label}
                </div>
                <div className={`text-base font-semibold ${r.saldo >= 0 ? "text-slate-100" : "text-red-400"}`}>
                  {fmtRp(r.saldo)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <LaporanLabaRugi
        pendapatan={labaRugi.pendapatan}
        beban={labaRugi.beban}
        labaRugi={labaRugi.labaRugi}
        marginPersen={labaRugi.marginPersen}
        subtitle={dari && sampai ? `${formatTanggalID(dari)} – ${formatTanggalID(sampai)}` : ""}
        onKategoriClick={setDetailKategori}
      />

      <GrafikArusKas mode={arusKas.mode} data={arusKas.data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPemasukan
          total={breakdownMasuk.total}
          data={dataMasukGrup}
          onKategoriClick={(d) => setDetailKategori({ tipe: "masuk", kode: d.kode, label: d.label, isGrup: d.isGrup, anak: d.anak })}
        />
        <BreakdownPengeluaran
          total={breakdownKeluar.total}
          data={dataKeluarGrup}
          onKategoriClick={(d) => setDetailKategori({ tipe: "keluar", kode: d.kode, label: d.label, isGrup: d.isGrup, anak: d.anak })}
        />
      </div>

      <LaporanBulananTahunan keuanganTransaksi={keuanganTransaksi} master={master} />

      {detailKategori && detailKategori.isGrup && (
        <DetailKelompokModal
          kelompok={detailKategori}
          tipe={detailKategori.tipe}
          list={list}
          pesananMasuk={pesananMasuk}
          rekeningList={rekeningList}
          subtitle={dari && sampai ? `${formatTanggalID(dari)} – ${formatTanggalID(sampai)}` : ""}
          onClose={() => setDetailKategori(null)}
        />
      )}

      {detailKategori && !detailKategori.isGrup && (
        <DetailTransaksiKategoriModal
          kategori={detailKategori}
          tipe={detailKategori.tipe}
          list={list}
          pesananMasuk={pesananMasuk}
          rekeningList={rekeningList}
          subtitle={dari && sampai ? `${formatTanggalID(dari)} – ${formatTanggalID(sampai)}` : ""}
          onClose={() => setDetailKategori(null)}
        />
      )}

      {showLaporanNarasi && (
        <LaporanNarasiModal
          teks={teksLaporanNarasi}
          onClose={() => setShowLaporanNarasi(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// Tahun-tahun yang ada transaksinya (dari data), dipakai untuk isi pilihan
// tahun di dropdown Laporan Bulanan/Tahunan. Tahun berjalan selalu disertakan
// walau belum ada transaksinya, supaya dropdown tidak pernah kosong.
function daftarTahunTersedia(keuanganTransaksi) {
  const set = new Set((keuanganTransaksi || []).map((t) => Number((t.tanggal || "").slice(0, 4))).filter(Boolean));
  set.add(new Date().getFullYear());
  return Array.from(set).sort((a, b) => b - a);
}

// Satu baris angka pada tabel pratinjau Laporan Bulanan/Tahunan — dibuat
// jadi komponen kecil supaya tidak berulang-ulang menulis className yang sama.
function BarisAngka({ label, nilai, bold, tinted, tint = "text-slate-100", labelWidth = "min-w-[160px]" }) {
  const f = (v) => (Math.round(v) === 0 ? "-" : fmtRp(v));
  return (
    <tr className={tinted ? "bg-slate-900/60" : ""}>
      <td className={`px-3 py-1.5 ${labelWidth} sticky left-0 ${tinted ? "bg-slate-900/60" : "bg-slate-950"} ${bold ? "font-semibold text-slate-100" : "text-slate-400"}`}>
        {label}
      </td>
      {nilai.map((v, i) => (
        <td
          key={i}
          className={`px-3 py-1.5 text-right whitespace-nowrap ${bold ? `font-semibold ${tint}` : v < 0 ? "text-red-400" : "text-slate-300"}`}
        >
          {v < 0 ? `(${fmtRp(Math.abs(v)).replace("Rp ", "")})` : f(v)}
        </td>
      ))}
    </tr>
  );
}

// Halaman "Laporan Bulanan" & "Rekap Tahunan" — pratinjau tabel di layar
// (dikelompokkan per kategori pemasukan/pengeluaran, gaya sama seperti
// workbook Excel SELMA_FINANCE.xlsx), lengkap dengan tombol unduh PDF siap
// cetak untuk masing-masing.
function LaporanBulananTahunan({ keuanganTransaksi, master }) {
  const [mode, setMode] = useState("bulanan"); // "bulanan" | "tahunan"
  const tahunTersedia = daftarTahunTersedia(keuanganTransaksi);
  const [tahun, setTahun] = useState(tahunTersedia[0]);
  const [tahunMulai, setTahunMulai] = useState(tahunTersedia[tahunTersedia.length - 1]);

  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];

  const dataBulanan = laporanBulananData(keuanganTransaksi, kategoriMasukList, kategoriKeluarList, tahun);
  const dataTahunan = rekapTahunanData(keuanganTransaksi, tahunMulai, 6);

  const unduhBulanan = () => generateLaporanBulananPdf({ tahun, data: dataBulanan });
  const unduhTahunan = () =>
    generateLaporanTahunanPdf({ tahunList: dataTahunan.tahunList, perTahun: dataTahunan.perTahun });

  return (
    <div className="rounded-xl border border-slate-800 mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/30">
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setMode("bulanan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              mode === "bulanan" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CalendarRange size={13} /> Laporan Bulanan
          </button>
          <button
            onClick={() => setMode("tahunan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
              mode === "tahunan" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 size={13} /> Rekap Tahunan
          </button>
        </div>

        <div className="flex items-center gap-2">
          {mode === "bulanan" ? (
            <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={`${inputClass} w-auto`}>
              {tahunTersedia.map((th) => (
                <option key={th} value={th}>
                  Tahun {th}
                </option>
              ))}
            </select>
          ) : (
            <select value={tahunMulai} onChange={(e) => setTahunMulai(Number(e.target.value))} className={`${inputClass} w-auto`}>
              {tahunTersedia.map((th) => (
                <option key={th} value={th}>
                  Mulai {th}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={mode === "bulanan" ? unduhBulanan : unduhTahunan}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Unduh PDF
          </button>
        </div>
      </div>

      <div className="p-3 text-[11px] text-slate-500">
        {mode === "bulanan"
          ? "Rekap tiap kategori pemasukan & pengeluaran per bulan untuk satu tahun, lengkap dengan total & laba/rugi bersih — bisa diunduh sebagai PDF siap cetak."
          : "Perbandingan total pendapatan, pengeluaran, laba/rugi bersih, dan margin selama 6 tahun berurutan — bisa diunduh sebagai PDF siap cetak."}
      </div>

      {mode === "bulanan" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/70 text-slate-300">
                <th className="px-3 py-2 text-left min-w-[160px] sticky left-0 bg-slate-800/70">Kategori</th>
                {BULAN_LABEL_ID.map((b) => (
                  <th key={b} className="px-3 py-2 text-right whitespace-nowrap">{b}</th>
                ))}
                <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td colSpan={14} className="px-3 py-1.5 font-semibold text-emerald-400 bg-emerald-500/5 sticky left-0">
                  PENDAPATAN
                </td>
              </tr>
              {dataBulanan.pendapatan.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-3 text-center text-slate-600">Belum ada kategori pemasukan.</td>
                </tr>
              ) : (
                dataBulanan.pendapatan.map((r) => (
                  <BarisAngka key={r.kode || r.label} label={r.label} nilai={[...r.bulan, r.total]} />
                ))
              )}
              <BarisAngka label="Total Pendapatan" nilai={[...dataBulanan.totalPendapatan.bulan, dataBulanan.totalPendapatan.total]} bold tinted tint="text-emerald-400" />

              <tr>
                <td colSpan={14} className="px-3 py-1.5 font-semibold text-red-400 bg-red-500/5 sticky left-0">
                  PENGELUARAN
                </td>
              </tr>
              {dataBulanan.pengeluaran.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-3 text-center text-slate-600">Belum ada kategori pengeluaran.</td>
                </tr>
              ) : (
                dataBulanan.pengeluaran.map((r) => (
                  <BarisAngka key={r.kode || r.label} label={r.label} nilai={[...r.bulan, r.total]} />
                ))
              )}
              <BarisAngka label="Total Pengeluaran" nilai={[...dataBulanan.totalPengeluaran.bulan, dataBulanan.totalPengeluaran.total]} bold tinted tint="text-red-400" />

              <BarisAngka
                label="LABA (RUGI) BERSIH"
                nilai={[...dataBulanan.labaRugi.bulan, dataBulanan.labaRugi.total]}
                bold
                tinted
                tint={dataBulanan.labaRugi.total >= 0 ? "text-emerald-400" : "text-red-400"}
              />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/70 text-slate-300">
                <th className="px-3 py-2 text-left min-w-[160px] sticky left-0 bg-slate-800/70">Kategori</th>
                {dataTahunan.tahunList.map((th) => (
                  <th key={th} className="px-3 py-2 text-right whitespace-nowrap">{th}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <BarisAngka label="Total Pendapatan" nilai={dataTahunan.perTahun.map((t) => t.pendapatan)} />
              <BarisAngka label="Total Pengeluaran" nilai={dataTahunan.perTahun.map((t) => t.pengeluaran)} />
              <BarisAngka
                label="LABA (RUGI) BERSIH"
                nilai={dataTahunan.perTahun.map((t) => t.laba)}
                bold
                tinted
                tint={dataTahunan.perTahun[0]?.laba >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <tr className="bg-slate-900/60">
                <td className="px-3 py-1.5 sticky left-0 bg-slate-900/60 font-semibold text-slate-100">Margin Laba Bersih</td>
                {dataTahunan.perTahun.map((t, i) => (
                  <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap font-semibold text-slate-200">
                    {(Math.round(t.marginPersen * 10) / 10).toLocaleString("id-ID")}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BULAN_LABEL_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Tab "Kategori & Sub Kategori": menyusun pohon laporan. Tiap baris = satu
// kategori master yang sudah ada (jadi "Rincian"); isi Kategori (level atas)
// dan Sub Kategori (opsional) untuknya. Contoh:
//   Gaji Karyawan | Biaya Operasional | Biaya Tetap
//   Listrik       | Biaya Operasional | Biaya Tetap
//   Grosir TF     | Grosir            | (kosong)
// Disimpan di master_data tipe "kelompok_masuk" / "kelompok_keluar"
// (kode = kode kategori master, label = "Kategori > Sub Kategori").
// Dipakai grafik per kategori di Laporan Keuangan (lihat kelompokkanBreakdown).
function pecahJalur(label) {
  const bagian = String(label || "").split(">").map((x) => x.trim()).filter(Boolean);
  return { kat: bagian[0] || "", sub: bagian.slice(1).join(" > ") };
}

function BarisPengelompokan({ m, kat, sub, berubah, onKat, onSub, saranKategori, saranSub }) {
  const kelas = `w-full bg-slate-950 border rounded-md px-2 py-1.5 text-xs outline-none focus:border-amber-500 ${
    berubah ? "border-amber-500/60" : "border-slate-800"
  }`;
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 items-center px-4 py-2">
      <div className="min-w-0">
        <div className="text-sm text-slate-200 truncate">{m.label}</div>
        <div className="font-mono text-[10px] text-amber-400/80">{m.kode}</div>
      </div>
      <input list={saranKategori} value={kat} onChange={(e) => onKat(e.target.value)} placeholder="Kategori…" className={kelas} />
      <input list={saranSub} value={sub} onChange={(e) => onSub(e.target.value)} placeholder="Sub kategori…" className={kelas} />
    </div>
  );
}

// draft = { masuk: { [kodeKategori]: { kat, sub } }, keluar: {...} } — isian yang
// BELUM disimpan. Disimpan di induk (RekeningKategori) supaya tidak hilang saat
// pindah tab Rekening/Kategori. Semua perubahan disimpan sekaligus lewat tombol
// "Simpan Perubahan" (satu kali muat ulang data, bukan tiap kali ketik).
function PengelompokanKategori({ master, reload, showToast, draft, setDraft }) {
  const [tipe, setTipe] = useState("keluar");
  const [menyimpan, setMenyimpan] = useState(false);

  const infoTipe = {
    masuk: { kategori: "kategori_masuk", kelompok: "kelompok_masuk" },
    keluar: { kategori: "kategori_keluar", kelompok: "kelompok_keluar" },
  };
  const kategoriList = master[infoTipe[tipe].kategori] || [];
  const pemetaan = master[infoTipe[tipe].kelompok] || [];

  const jalurTersimpan = (t, kode) =>
    pecahJalur((master[infoTipe[t].kelompok] || []).find((x) => x.kode === kode)?.label);
  const nilaiSekarang = (t, kode) => draft[t]?.[kode] || jalurTersimpan(t, kode);
  const susunLabel = (v) => (v.kat.trim() ? (v.sub.trim() ? `${v.kat.trim()} > ${v.sub.trim()}` : v.kat.trim()) : "");

  const ubah = (t, kode, bagian, nilai) =>
    setDraft((d) => {
      const cur = d[t]?.[kode] || jalurTersimpan(t, kode);
      return { ...d, [t]: { ...(d[t] || {}), [kode]: { ...cur, [bagian]: nilai } } };
    });

  // Daftar perubahan nyata (draft yang beda dari yang tersimpan).
  const perubahan = [];
  ["masuk", "keluar"].forEach((t) => {
    Object.entries(draft[t] || {}).forEach(([kode, v]) => {
      const ada = (master[infoTipe[t].kelompok] || []).find((x) => x.kode === kode);
      const labelBaru = susunLabel(v);
      if ((ada?.label || "") !== labelBaru) perubahan.push({ t, kode, ada, labelBaru, v });
    });
  });
  const perubahanTipeIni = new Set(perubahan.filter((x) => x.t === tipe).map((x) => x.kode));

  const saranSemua = [...pemetaan.map((x) => pecahJalur(x.label)), ...Object.values(draft[tipe] || {})];
  const saranKategori = [...new Set(saranSemua.map((j) => j.kat.trim()).filter(Boolean))];
  const saranSub = [...new Set(saranSemua.map((j) => j.sub.trim()).filter(Boolean))];

  // Urutan berdasarkan data TERSIMPAN saja, supaya baris tidak loncat saat mengetik.
  const urut = [...kategoriList].sort((a, b) => {
    const ja = jalurTersimpan(tipe, a.kode);
    const jb = jalurTersimpan(tipe, b.kode);
    const ka = ja.kat ? `0|${ja.kat}|${ja.sub}|${a.label}` : `1|${a.label}`;
    const kb = jb.kat ? `0|${jb.kat}|${jb.sub}|${b.label}` : `1|${b.label}`;
    return ka.localeCompare(kb);
  });

  const simpanSemua = async () => {
    const salah = perubahan.find((x) => !x.v.kat.trim() && x.v.sub.trim());
    if (salah) {
      showToast("Ada baris yang Sub Kategori-nya terisi tapi Kategori-nya kosong", "err");
      return;
    }
    setMenyimpan(true);
    let gagal = 0;
    for (const x of perubahan) {
      try {
        if (!x.labelBaru) {
          await sb(`master_data?id=eq.${x.ada.id}`, { method: "DELETE" });
        } else if (x.ada) {
          await sb(`master_data?id=eq.${x.ada.id}`, { method: "PATCH", body: JSON.stringify({ label: x.labelBaru }) });
        } else {
          await sb("master_data", {
            method: "POST",
            body: JSON.stringify({ tipe: infoTipe[x.t].kelompok, kode: x.kode, label: x.labelBaru }),
          });
        }
      } catch (e) {
        gagal += 1;
      }
    }
    try {
      await reload();
    } catch (e) {
      /* abaikan — data akan ikut termuat saat refresh berikutnya */
    }
    setMenyimpan(false);
    if (gagal > 0) {
      showToast(`${gagal} perubahan gagal disimpan — coba simpan lagi`, "err");
    } else {
      setDraft({});
      showToast(`${perubahan.length} perubahan disimpan`);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap gap-1.5 mb-3 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {[
          { key: "keluar", label: "Pengeluaran" },
          { key: "masuk", label: "Pemasukan" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTipe(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tipe === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-slate-500 mb-3">
        Tiap baris di bawah adalah kategori yang sudah ada (jadi <span className="text-slate-300">Rincian</span>).
        Isi <span className="text-slate-300">Kategori</span> dan (opsional) <span className="text-slate-300">Sub Kategori</span>{" "}
        supaya di Laporan Keuangan tampil bertingkat, mis. Biaya Operasional → Biaya Tetap → Gaji Karyawan. Nama yang sama
        otomatis digabung. Kosongkan kalau tidak ingin dikelompokkan. Ubah sebanyak yang Anda mau, lalu klik{" "}
        <span className="text-slate-300">Simpan Perubahan</span> sekali saja.
      </div>

      <datalist id="saran-kategori-kelompok">
        {saranKategori.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="saran-sub-kelompok">
        {saranSub.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 px-4 py-2 text-[11px] uppercase text-slate-500 border-b border-slate-800">
          <div>Rincian</div>
          <div>Kategori</div>
          <div>Sub Kategori</div>
        </div>
        {urut.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">Belum ada kategori.</div>
        ) : (
          urut.map((m, i) => {
            const v = nilaiSekarang(tipe, m.kode);
            return (
              <div key={`${tipe}-${m.id}`} className={i % 2 ? "bg-slate-950" : "bg-slate-900"}>
                <BarisPengelompokan
                  m={m}
                  kat={v.kat}
                  sub={v.sub}
                  berubah={perubahanTipeIni.has(m.kode)}
                  onKat={(n) => ubah(tipe, m.kode, "kat", n)}
                  onSub={(n) => ubah(tipe, m.kode, "sub", n)}
                  saranKategori="saran-kategori-kelompok"
                  saranSub="saran-sub-kelompok"
                />
              </div>
            );
          })
        )}
      </div>

      {perubahan.length > 0 && (
        <div className="sticky bottom-3 mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-slate-900/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-xs text-amber-300">{perubahan.length} perubahan belum disimpan</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraft({})}
              disabled={menyimpan}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg disabled:opacity-40"
            >
              Batalkan
            </button>
            <button
              onClick={simpanSemua}
              disabled={menyimpan}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-4 py-2 rounded-lg"
            >
              {menyimpan ? "Menyimpan…" : "Simpan Perubahan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Halaman kelola daftar Rekening & Kategori yang didaftarkan user sendiri.
// Disimpan di tabel master_data yang sama dipakai untuk kode SKU (bahan,
// warna, dst), tapi dengan tipe berbeda supaya tidak tercampur:
//   - "rekening"        -> daftar rekening/kas (mis. Kas Toko, BCA, dst)
//   - "kategori_masuk"  -> kategori pemasukan (dipakai saat tipe = Pemasukan)
//   - "kategori_keluar" -> kategori pengeluaran (dipakai saat tipe = Pengeluaran)
const TAB_KEUANGAN = [
  { key: "rekening", label: "Rekening", placeholderKode: "BCA", placeholderLabel: "Bank BCA - 12345" },
  { key: "kategori_masuk", label: "Kategori Pemasukan", placeholderKode: "JUAL", placeholderLabel: "Penjualan Produk" },
  { key: "kategori_keluar", label: "Kategori Pengeluaran", placeholderKode: "GAJI", placeholderLabel: "Gaji Karyawan" },
  // Tab khusus (bukan daftar kode/nama biasa) — lihat PengelompokanKategori.
  { key: "pengelompokan", label: "Kategori & Sub Kategori" },
];

function RekeningKategori({ master, reload, showToast }) {
  const [activeTab, setActiveTab] = useState("rekening");
  // Isian tab "Kategori & Sub Kategori" yang belum disimpan (lihat PengelompokanKategori).
  const [draftKelompok, setDraftKelompok] = useState({});
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [kodeTouched, setKodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit inline: id baris yang sedang diedit + nilai kode/nama sementara.
  // null = tidak ada baris yang sedang diedit.
  const [editingId, setEditingId] = useState(null);
  const [editKode, setEditKode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const tabInfo = TAB_KEUANGAN.find((t) => t.key === activeTab) || TAB_KEUANGAN[0];
  const list = master[activeTab] || [];

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditKode(m.kode);
    setEditLabel(m.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditKode("");
    setEditLabel("");
  };

  const saveEdit = async (m) => {
    const kodeBaru = editKode.trim().toUpperCase();
    const labelBaru = editLabel.trim();
    if (!kodeBaru || !labelBaru) return;
    if (kodeBaru === m.kode && labelBaru === m.label) {
      cancelEdit();
      return;
    }
    if (kodeBaru !== m.kode && list.some((x) => x.id !== m.id && x.kode === kodeBaru)) {
      showToast(`Kode "${kodeBaru}" sudah dipakai`, "err");
      return;
    }
    setEditSaving(true);
    try {
      await sb(`master_data?id=eq.${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kode: kodeBaru, label: labelBaru }),
      });
      await reload();
      cancelEdit();
      showToast("Perubahan disimpan");
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setEditSaving(false);
    }
  };

  const addEntry = async () => {
    if (!kode.trim() || !label.trim()) return;
    setSaving(true);
    try {
      await sb("master_data", {
        method: "POST",
        body: JSON.stringify({ tipe: activeTab, kode: kode.trim().toUpperCase(), label: label.trim() }),
      });
      setKode("");
      setLabel("");
      setKodeTouched(false);
      await reload();
      showToast("Ditambahkan");
    } catch (e) {
      showToast(e.message || "Gagal menambah", "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    try {
      await sb(`master_data?id=eq.${id}`, { method: "DELETE" });
      await reload();
      showToast("Dihapus");
    } catch (e) {
      showToast(e.message || "Gagal menghapus", "err");
    }
  };

  const tabBar = (
    <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {TAB_KEUANGAN.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              cancelEdit();
              setKode("");
              setLabel("");
              setKodeTouched(false);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
  );

  if (activeTab === "pengelompokan") {
    return (
      <div>
        <PageHeader
          title="Rekening & Kategori"
          description="Susun kategori bertingkat untuk laporan: Kategori → Sub Kategori → Rincian."
        />
        {tabBar}
        <PengelompokanKategori master={master} reload={reload} showToast={showToast} draft={draftKelompok} setDraft={setDraftKelompok} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rekening & Kategori"
        description="Daftar rekening (sumber dana) dan kategori pemasukan/pengeluaran yang muncul di form Transaksi Keuangan. Kelola sendiri sesuai kebutuhan bisnis Anda."
      />

      {tabBar}

      <div className="flex items-end gap-2 mb-4 max-w-lg">
        <div className="flex-1">
          <div className="text-xs text-slate-400 mb-1">Kode</div>
          <input
            value={kode}
            onChange={(e) => {
              setKode(e.target.value);
              setKodeTouched(true);
            }}
            placeholder={`Cth: ${tabInfo.placeholderKode}`}
            className={inputClass}
          />
        </div>
        <div className="flex-[2]">
          <div className="text-xs text-slate-400 mb-1">Nama</div>
          <input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!kodeTouched) setKode(suggestKode(e.target.value));
            }}
            placeholder={`Cth: ${tabInfo.placeholderLabel}`}
            className={inputClass}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
        </div>
        <button
          disabled={!kode.trim() || !label.trim() || saving}
          onClick={addEntry}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg h-[38px]"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden max-w-lg">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            Belum ada data untuk {tabInfo.label}.
          </div>
        ) : (
          list.map((m, i) => {
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={`px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                {isEditing ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        value={editKode}
                        onChange={(e) => setEditKode(e.target.value)}
                        className="w-20 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-xs font-mono uppercase outline-none focus:border-amber-500"
                      />
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-amber-500"
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(m)}
                        autoFocus
                      />
                      <button
                        onClick={() => saveEdit(m)}
                        disabled={!editKode.trim() || !editLabel.trim() || editSaving}
                        className="p-1.5 rounded-lg text-emerald-400 hover:bg-slate-800 disabled:opacity-40 flex-shrink-0"
                        title="Simpan"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 flex-shrink-0"
                        title="Batal"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {editKode.trim().toUpperCase() !== m.kode && (
                      <div className="text-[10px] text-amber-500/80 mt-1">
                        Kode diganti — transaksi lama yang masih pakai kode "{m.kode}" tidak otomatis ikut berubah.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-amber-400 w-14">{m.kode}</span>
                      <span className="text-sm text-slate-200">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteEntry(m.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                        title="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// =========================================================
// RIWAYAT PERUBAHAN TRANSAKSI — khusus role "superappa".
// Membaca tabel keuangan_audit_log yang diisi otomatis oleh trigger database
// (supabase/migrations/20261001_keuangan_audit_log.sql): siapa, kapan, dan
// apa yang ditambah / diubah (nilai lama -> baru) / dihapus di transaksi
// keuangan. Perubahan yang terjadi DI LUAR aplikasi (Supabase Dashboard,
// SQL Editor, atau panggilan API langsung) ditandai terpisah.
// =========================================================
const LABEL_KOLOM = {
  tanggal: "Tanggal",
  tipe: "Jenis",
  rekening: "Rekening",
  rekening_tujuan: "Rekening Tujuan",
  kategori: "Kategori",
  jumlah: "Jumlah",
  keterangan: "Keterangan",
};
const KOLOM_ABAIKAN = new Set(["id", "created_at", "updated_at"]);

function waktuWib(iso) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function nilaiTampil(kolom, v, master) {
  if (v === null || v === undefined || v === "") return "(kosong)";
  if (kolom === "jumlah") return fmtRp(v);
  if (kolom === "tanggal") return formatTanggalID(v);
  if (kolom === "tipe") return { masuk: "Pemasukan", keluar: "Pengeluaran", transfer: "Transfer" }[v] || String(v);
  if (kolom === "rekening" || kolom === "rekening_tujuan") return labelDari(master.rekening, v);
  if (kolom === "kategori") return labelDari([...(master.kategori_masuk || []), ...(master.kategori_keluar || [])], v);
  return String(v);
}

function namaPelaku(r) {
  if (r.sumber === "luar-aplikasi") return null;
  return r.nama || r.username || "User tidak dikenal";
}

// Perlu dicek lebih teliti: transaksi dihapus, jumlah diubah, atau perubahan
// yang terjadi di luar aplikasi.
function perluDicek(r) {
  return (
    r.aksi === "DELETE" ||
    r.sumber === "luar-aplikasi" ||
    (r.aksi === "UPDATE" && (r.kolom_berubah || []).includes("jumlah"))
  );
}

function RiwayatPerubahan({ master = {}, session }) {
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniIso());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aksi, setAksi] = useState("");
  const [pengguna, setPengguna] = useState("");
  const [q, setQ] = useState("");
  const [hanyaDicek, setHanyaDicek] = useState(false);

  const bolehLihat = session?.role === "superappa";

  const muat = async () => {
    if (!bolehLihat) return;
    setLoading(true);
    setError("");
    try {
      const dariTs = encodeURIComponent(`${dari}T00:00:00+07:00`);
      const sampaiTs = encodeURIComponent(`${sampai}T23:59:59.999+07:00`);
      const data = await sb(
        `keuangan_audit_log?select=*&waktu=gte.${dariTs}&waktu=lte.${sampaiTs}&order=waktu.desc&limit=1000`
      );
      setRows(data || []);
    } catch (e) {
      const pesan = String(e?.message || e);
      setError(
        /keuangan_audit_log|PGRST205|does not exist|404/i.test(pesan)
          ? "Tabel riwayat belum dibuat di database. Jalankan file supabase/migrations/20261001_keuangan_audit_log.sql di Supabase > SQL Editor, lalu klik Muat ulang."
          : pesan
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const daftarPengguna = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => set.add(namaPelaku(r) || "__luar__"));
    return [...set];
  }, [rows]);

  const filtered = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (aksi && r.aksi !== aksi) return false;
      if (pengguna && (namaPelaku(r) || "__luar__") !== pengguna) return false;
      if (hanyaDicek && !perluDicek(r)) return false;
      if (kata) {
        const d = r.data_baru || r.data_lama || {};
        const hay = [r.transaksi_id, r.username, r.nama, d.keterangan, d.kategori, d.rekening]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        if (!hay.includes(kata)) return false;
      }
      return true;
    });
  }, [rows, aksi, pengguna, hanyaDicek, q]);

  if (!bolehLihat) {
    return <EmptyState label="Halaman ini khusus untuk role superappa." />;
  }

  const jmlDicek = rows.filter(perluDicek).length;
  const aksiMeta = {
    INSERT: { label: "Ditambah", color: "emerald" },
    UPDATE: { label: "Diubah", color: "amber" },
    DELETE: { label: "Dihapus", color: "red" },
  };

  return (
    <div>
      <PageHeader
        title="Riwayat Perubahan Transaksi"
        description="Jejak siapa yang menambah, mengubah, dan menghapus transaksi keuangan. Dicatat otomatis oleh database, tidak bisa diedit dari aplikasi."
        action={
          <button
            onClick={muat}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Muat ulang
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={aksi} onChange={(e) => setAksi(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Aksi</option>
          <option value="INSERT">Ditambah</option>
          <option value="UPDATE">Diubah</option>
          <option value="DELETE">Dihapus</option>
        </select>
        <select value={pengguna} onChange={(e) => setPengguna(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Pengguna</option>
          {daftarPengguna.map((p) => (
            <option key={p} value={p}>
              {p === "__luar__" ? "Di luar aplikasi" : p}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari keterangan, kategori, atau ID transaksi…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-slate-300 mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={hanyaDicek} onChange={(e) => setHanyaDicek(e.target.checked)} />
        <ShieldAlert size={14} className="text-amber-400" />
        Hanya yang perlu dicek (dihapus, jumlah diubah, atau di luar aplikasi) — {jmlDicek} dari {rows.length}
      </label>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {!error && rows.length >= 1000 && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-4 py-2.5 rounded-lg">
          Menampilkan 1.000 catatan terbaru di rentang ini. Persempit rentang tanggal untuk melihat yang lebih lama.
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-sm text-slate-500 py-10 text-center">Memuat riwayat…</div>
      ) : filtered.length === 0 ? (
        <EmptyState label={rows.length ? "Tidak ada catatan yang cocok dengan filter." : "Belum ada perubahan tercatat di rentang ini."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((r, i) => {
            const meta = aksiMeta[r.aksi] || { label: r.aksi, color: "slate" };
            const d = r.data_baru || r.data_lama || {};
            const pelaku = namaPelaku(r);
            const dicek = perluDicek(r);
            const kolom = (r.kolom_berubah || []).filter((k) => !KOLOM_ABAIKAN.has(k));
            return (
              <div
                key={r.id}
                className={`px-4 py-3 ${i % 2 ? "bg-slate-950" : "bg-slate-900"} ${dicek ? "border-l-2 border-amber-500/60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Badge color={meta.color}>{meta.label}</Badge>
                    {pelaku ? (
                      <span className="text-sm text-slate-200 font-medium">
                        {pelaku}
                        {r.role ? <span className="text-[11px] text-slate-500 font-normal"> · {roleLabel(r.role)}</span> : null}
                      </span>
                    ) : (
                      <Badge color="amber">Di luar aplikasi ({r.db_role || "database"})</Badge>
                    )}
                    {r.aksi === "UPDATE" && kolom.includes("jumlah") && <Badge color="pink">Jumlah diubah</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 flex-shrink-0">{waktuWib(r.waktu)} WIB</div>
                </div>

                <div className="text-[11px] text-slate-500 mt-1.5">
                  Transaksi #{r.transaksi_id} · {nilaiTampil("tipe", d.tipe, master)} · {nilaiTampil("kategori", d.kategori, master)} ·{" "}
                  {nilaiTampil("rekening", d.rekening, master)}
                  {d.rekening_tujuan ? ` → ${nilaiTampil("rekening_tujuan", d.rekening_tujuan, master)}` : ""} ·{" "}
                  {nilaiTampil("tanggal", d.tanggal, master)}
                  {d.keterangan ? ` · ${d.keterangan}` : ""}
                </div>

                {r.aksi === "UPDATE" && kolom.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {kolom.map((k) => (
                      <div key={k} className="text-xs flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500 min-w-[110px]">{LABEL_KOLOM[k] || k}</span>
                        <span className="text-red-300/90 line-through">{nilaiTampil(k, r.data_lama?.[k], master)}</span>
                        <span className="text-slate-600">→</span>
                        <span className="text-emerald-300 font-medium">{nilaiTampil(k, r.data_baru?.[k], master)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {r.aksi !== "UPDATE" && (
                  <div className={`mt-1.5 text-sm font-semibold ${r.aksi === "DELETE" ? "text-red-300" : "text-emerald-300"}`}>
                    {r.aksi === "DELETE" ? "Dihapus: " : "Nilai: "}
                    {fmtRp(d.jumlah)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}