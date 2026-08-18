import { useState } from "react";
import { Plus, Search, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, Landmark, Download, MessageCircleMore, Copy, FileText, CalendarRange, BarChart3, Check, X } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge, InputTanggal, formatTanggalID, ModalShell } from "../components/ui";
import {
  fmtRp,
  ringkasanKeuangan,
  saldoPerRekening,
  arusKasPerPeriode,
  breakdownPengeluaranKategori,
  laporanBulananData,
  rekapTahunanData,
  sb,
} from "../lib/api";
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

export default function Keuangan({ sub, keuanganTransaksi = [], master = {}, reload, showToast, setModal }) {
  if (sub === "rekening") {
    return <RekeningKategori master={master} reload={reload} showToast={showToast} />;
  }
  if (sub === "laporan") {
    return <LaporanKeuangan keuanganTransaksi={keuanganTransaksi} master={master} showToast={showToast} />;
  }
  return (
    <Transaksi keuanganTransaksi={keuanganTransaksi} master={master} setModal={setModal} showToast={showToast} />
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

// Breakdown pengeluaran per kategori: donat + daftar persentase. Kategori di
// luar 6 besar digabung jadi "Lainnya" di donat (biar potongannya tidak terlalu
// tipis/rapat), tapi daftar di sisi kanan tetap menampilkan semua kategori.
export function BreakdownPengeluaran({ total, data }) {
  const [hover, setHover] = useState(null);

  if (total === 0 || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 p-6 text-center text-slate-500 text-sm mb-5">
        Belum ada pengeluaran pada rentang ini untuk ditampilkan.
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
      <div className="text-xs text-slate-400 mb-3">Pengeluaran per Kategori — mana yang paling boros</div>
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
                style={{ cursor: "pointer" }}
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
                className="cursor-pointer"
                onMouseEnter={() => setHover(idxSlice)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="flex items-center gap-1.5 text-slate-300 truncate">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: warna }} />
                    <span className="truncate">{d.label}</span>
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

function Transaksi({ keuanganTransaksi, master, setModal, showToast }) {
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
    </div>
  );
}

// Halaman "Laporan Keuangan" — ringkasan, grafik arus kas, breakdown
// pengeluaran per kategori, saldo per rekening, dan unduh laporan (CSV /
// narasi WhatsApp). Dipisah dari halaman Transaksi supaya Transaksi tetap
// ringkas (cuma daftar catatan), sementara semua "angka besar" ada di sini.
function LaporanKeuangan({ keuanganTransaksi, master, showToast }) {
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniIso());
  const [showLaporanNarasi, setShowLaporanNarasi] = useState(false);

  const rekeningList = master.rekening || [];
  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];

  const { masuk, keluar, saldo, list } = ringkasanKeuangan(keuanganTransaksi, dari || null, sampai || null);
  const saldoRekening = saldoPerRekening(keuanganTransaksi, rekeningList);
  const arusKas = arusKasPerPeriode(list);
  const breakdownKeluar = breakdownPengeluaranKategori(list, kategoriKeluarList);

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

      <GrafikArusKas mode={arusKas.mode} data={arusKas.data} />

      <BreakdownPengeluaran total={breakdownKeluar.total} data={breakdownKeluar.data} />

      <LaporanBulananTahunan keuanganTransaksi={keuanganTransaksi} master={master} />

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
];

function RekeningKategori({ master, reload, showToast }) {
  const [activeTab, setActiveTab] = useState("rekening");
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit inline: id baris yang sedang diedit + nilai kode/nama sementara.
  const [editingId, setEditingId] = useState(null);
  const [editKode, setEditKode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const tabInfo = TAB_KEUANGAN.find((t) => t.key === activeTab);
  const list = master[activeTab] || [];

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

  return (
    <div>
      <PageHeader
        title="Rekening & Kategori"
        description="Daftar rekening (sumber dana) dan kategori pemasukan/pengeluaran yang muncul di form Transaksi Keuangan. Kelola sendiri sesuai kebutuhan bisnis Anda."
      />

      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {TAB_KEUANGAN.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              cancelEdit();
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 mb-4 max-w-lg">
        <div className="flex-1">
          <div className="text-xs text-slate-400 mb-1">Kode</div>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            placeholder={`Cth: ${tabInfo.placeholderKode}`}
            className={inputClass}
          />
        </div>
        <div className="flex-[2]">
          <div className="text-xs text-slate-400 mb-1">Nama</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
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