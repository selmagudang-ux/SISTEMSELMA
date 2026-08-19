import { useState } from "react";
import {
  Search, Plus, Minus, Pencil, Trash2, X, ShoppingCart,
  TrendingUp, Wallet, Download, CalendarRange, BarChart3, Receipt,
} from "lucide-react";
import { PageHeader, EmptyState, Field, SearchableSelect, inputClass, Badge, ModalShell, StatCard, InputTanggal } from "../components/ui";
import {
  sb, fmtRp, nextKode, todayDDMMYYYY, sisaHutangPesanan, totalHutangPerPelanggan, pelangganDenganWa,
  ringkasanGrosir, omsetGrosirPerPeriode, laporanBulananGrosir, rekapTahunanGrosir, downloadCsv,
} from "../lib/api";

export default function Grosir({
  sub, pelangganGrosir, tokoGrosir, produkManualGrosir, skuMaster, pesananGrosir, detailPesananGrosir, pembayaranGrosir, depositGrosir, reload, showToast, setModal,
}) {
  if (sub === "toko") return <TokoList tokoGrosir={tokoGrosir} setModal={setModal} />;
  if (sub === "produk-manual")
    return <ProdukManualList produkManualGrosir={produkManualGrosir} setModal={setModal} />;
  if (sub === "pelanggan")
    return (
      <PelangganList
        pelangganGrosir={pelangganGrosir}
        pesananGrosir={pesananGrosir}
        pembayaranGrosir={pembayaranGrosir}
        depositGrosir={depositGrosir}
        setModal={setModal}
      />
    );
  if (sub === "semua-pesanan")
    return (
      <SemuaPesanan
        pesananGrosir={pesananGrosir}
        pelangganGrosir={pelangganGrosir}
        pembayaranGrosir={pembayaranGrosir}
        setModal={setModal}
      />
    );
  if (sub === "laporan")
    return (
      <LaporanGrosir
        pesananGrosir={pesananGrosir}
        pelangganGrosir={pelangganGrosir}
        pembayaranGrosir={pembayaranGrosir}
      />
    );
  return (
    <BuatPesanan
      pelangganGrosir={pelangganGrosir}
      tokoGrosir={tokoGrosir}
      produkManualGrosir={produkManualGrosir}
      skuMaster={skuMaster}
      reload={reload}
      showToast={showToast}
    />
  );
}

function PelangganList({ pelangganGrosir, pesananGrosir, pembayaranGrosir, depositGrosir, setModal }) {
  const [q, setQ] = useState("");
  const hutangMap = totalHutangPerPelanggan(pesananGrosir, pembayaranGrosir);
  const filtered = (pelangganGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.nama?.toLowerCase().includes(s) ||
      p.kode?.toLowerCase().includes(s) ||
      p.kota?.toLowerCase().includes(s) ||
      p.wa?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Pelanggan Grosir"
        description="Daftar pelanggan/toko langganan untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-pelanggan-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Pelanggan
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, kode, kota, atau WA…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan grosir."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setModal({ type: "grosir-riwayat-pelanggan", item: p })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{p.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{p.nama}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[p.wa, p.kota].filter(Boolean).join(" · ") || "—"}
                </div>
                {hutangMap[p.id] > 0 && (
                  <div className="mt-1">
                    <Badge color="red">Hutang {fmtRp(hutangMap[p.id])}</Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setModal({ type: "grosir-pelanggan-form", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-pelanggan", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SemuaPesanan({ pesananGrosir, pelangganGrosir, pembayaranGrosir, setModal }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const namaPelanggan = (id) => pelangganGrosir.find((p) => p.id === id)?.nama || "—";

  const filtered = (pesananGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    const matchQ =
      !s ||
      p.nomor_pesanan?.toLowerCase().includes(s) ||
      namaPelanggan(p.pelanggan_id).toLowerCase().includes(s);
    const matchStatus = !statusFilter || p.status_bayar === statusFilter;
    return matchQ && matchStatus;
  });

  return (
    <div>
      <PageHeader
        title="Semua Pesanan"
        description="Riwayat pesanan grosir. Klik salah satu untuk lihat detail item."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor pesanan atau nama pelanggan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">Semua Status</option>
          <option value="Belum Bayar">Belum Bayar</option>
          <option value="Sebagian">Sebagian</option>
          <option value="Lunas">Lunas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || statusFilter ? "Tidak ada pesanan yang cocok." : "Belum ada pesanan grosir."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setModal({ type: "grosir-detail-pesanan", item: p })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-amber-400">{p.nomor_pesanan}</span>
                  {p.status === "Batal" && <Badge color="red">Batal</Badge>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {namaPelanggan(p.pelanggan_id)} · {p.tanggal}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
                  {p.status_bayar}
                </Badge>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-200">{fmtRp(p.total)}</div>
                  {p.status_bayar !== "Lunas" && p.status !== "Batal" && (
                    <div className="text-[10px] text-red-400">
                      Sisa {fmtRp(sisaHutangPesanan(p, pembayaranGrosir))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// LAPORAN GROSIR — Harian (rentang tanggal bebas), Bulanan (12 bulan
// dalam satu tahun), dan Tahunan (6 tahun berurutan). Pola & gaya sama
// dengan "Laporan Keuangan" di halaman Keuangan supaya konsisten, tapi
// dihitung dari grosir_pesanan (bukan grosir_pembayaran) — jadi "omset" di
// sini artinya nilai pesanan, bukan uang yang sudah masuk secara kas.
// =========================================================
function awalBulanIniGrosir() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hariIniIsoGrosir() {
  return new Date().toISOString().slice(0, 10);
}

// Tahun-tahun yang ada pesanannya (dari data), dipakai isi dropdown tahun di
// Laporan Bulanan/Tahunan. Tahun berjalan selalu disertakan supaya dropdown
// tidak pernah kosong walau belum ada pesanan tahun ini.
function daftarTahunGrosirTersedia(pesananGrosir) {
  const set = new Set((pesananGrosir || []).map((p) => Number((p.tanggal || "").slice(0, 4))).filter(Boolean));
  set.add(new Date().getFullYear());
  return Array.from(set).sort((a, b) => b - a);
}

// Grafik batang omset per hari/minggu — versi satu-seri dari GrafikArusKas
// di halaman Keuangan (di sana dua seri: masuk vs keluar).
function GrafikOmsetGrosir({ mode, data }) {
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 p-6 text-center text-slate-500 text-sm mb-5">
        Belum ada pesanan pada rentang ini untuk ditampilkan sebagai grafik.
      </div>
    );
  }

  const H = 220;
  const marginLeft = 46;
  const marginBottom = 30;
  const marginTop = 16;
  const marginRight = 12;
  const minGroupW = 40;
  const chartW = Math.max(560, data.length * minGroupW) - marginLeft - marginRight;
  const W = chartW + marginLeft + marginRight;
  const chartH = H - marginTop - marginBottom;

  const nilaiMax = Math.max(1, ...data.map((d) => d.omset));
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(nilaiMax)));
    const norm = nilaiMax / pow;
    const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return niceNorm * pow;
  })();

  const groupW = chartW / data.length;
  const barW = Math.min(26, groupW * 0.5);
  const y = (v) => marginTop + chartH - (v / niceMax) * chartH;
  const skalaLabel = (v) =>
    v >= 1000000 ? `${v / 1000000}jt` : v >= 1000 ? `${Math.round(v / 1000)}rb` : `${Math.round(v)}`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);
  const labelStep = Math.max(1, Math.ceil(data.length / 14));

  return (
    <div className="rounded-xl border border-slate-800 p-4 mb-5 bg-slate-900/30">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs text-slate-400">
          Omset {mode === "harian" ? "per Hari" : "per Minggu"}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Omset
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
            const isHover = hover === i;
            return (
              <g
                key={d.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={cx - barW / 2}
                  width={barW}
                  y={y(d.omset)}
                  height={Math.max(0, y(0) - y(d.omset))}
                  rx="3"
                  fill="#f59e0b"
                  opacity={hover === null || isHover ? 1 : 0.35}
                />
                <text x={cx} y={H - marginBottom + 14} textAnchor="middle" fontSize="9" fill="#64748b">
                  {i % labelStep === 0 ? d.label : ""}
                </text>
                {isHover && (
                  <g>
                    <rect x={Math.min(Math.max(cx - 58, marginLeft), W - marginRight - 116)} y={marginTop} width="116" height="34" rx="4" fill="#0f172a" stroke="#334155" />
                    <text x={Math.min(Math.max(cx, marginLeft + 58), W - marginRight - 58)} y={marginTop + 13} textAnchor="middle" fontSize="9" fill="#fbbf24">
                      Omset: {fmtRp(d.omset)}
                    </text>
                    <text x={Math.min(Math.max(cx, marginLeft + 58), W - marginRight - 58)} y={marginTop + 25} textAnchor="middle" fontSize="9" fill="#94a3b8">
                      {d.jumlahPesanan} pesanan
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

// Satu baris angka pada tabel Laporan Bulanan/Tahunan — pola sama seperti
// BarisAngka di halaman Laporan Keuangan.
function BarisAngkaGrosir({ label, nilai, bold, tinted, tint = "text-slate-100", isRupiah = true }) {
  const f = (v) => {
    if (Math.round(v) === 0) return "-";
    return isRupiah ? fmtRp(v) : v.toLocaleString("id-ID");
  };
  return (
    <tr className={tinted ? "bg-slate-900/60" : ""}>
      <td className={`px-3 py-1.5 min-w-[150px] sticky left-0 ${tinted ? "bg-slate-900/60" : "bg-slate-950"} ${bold ? "font-semibold text-slate-100" : "text-slate-400"}`}>
        {label}
      </td>
      {nilai.map((v, i) => (
        <td key={i} className={`px-3 py-1.5 text-right whitespace-nowrap ${bold ? `font-semibold ${tint}` : "text-slate-300"}`}>
          {f(v)}
        </td>
      ))}
    </tr>
  );
}

const BULAN_LABEL_ID_GROSIR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function LaporanBulananTahunanGrosir({ pesananGrosir }) {
  const [mode, setMode] = useState("bulanan"); // "bulanan" | "tahunan"
  const tahunTersedia = daftarTahunGrosirTersedia(pesananGrosir);
  const [tahun, setTahun] = useState(tahunTersedia[0]);
  const [tahunMulai, setTahunMulai] = useState(tahunTersedia[tahunTersedia.length - 1]);

  const dataBulanan = laporanBulananGrosir(pesananGrosir, tahun);
  const dataTahunan = rekapTahunanGrosir(pesananGrosir, tahunMulai, 6);

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
                <option key={th} value={th}>Tahun {th}</option>
              ))}
            </select>
          ) : (
            <select value={tahunMulai} onChange={(e) => setTahunMulai(Number(e.target.value))} className={`${inputClass} w-auto`}>
              {tahunTersedia.map((th) => (
                <option key={th} value={th}>Mulai {th}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="p-3 text-[11px] text-slate-500">
        {mode === "bulanan"
          ? "Omset & jumlah pesanan grosir per bulan untuk satu tahun (pesanan berstatus Batal tidak dihitung)."
          : "Perbandingan omset & jumlah pesanan grosir selama 6 tahun berurutan."}
      </div>

      {mode === "bulanan" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/70 text-slate-300">
                <th className="px-3 py-2 text-left min-w-[150px] sticky left-0 bg-slate-800/70">Bulan {tahun}</th>
                {BULAN_LABEL_ID_GROSIR.map((b) => (
                  <th key={b} className="px-3 py-2 text-right whitespace-nowrap">{b}</th>
                ))}
                <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <BarisAngkaGrosir label="Omset" nilai={[...dataBulanan.omset.bulan, dataBulanan.omset.total]} bold tint="text-amber-400" />
              <BarisAngkaGrosir label="Jumlah Pesanan" nilai={[...dataBulanan.jumlahPesanan.bulan, dataBulanan.jumlahPesanan.total]} isRupiah={false} />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/70 text-slate-300">
                <th className="px-3 py-2 text-left min-w-[150px] sticky left-0 bg-slate-800/70">Tahun</th>
                {dataTahunan.tahunList.map((th) => (
                  <th key={th} className="px-3 py-2 text-right whitespace-nowrap">{th}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <BarisAngkaGrosir label="Omset" nilai={dataTahunan.perTahun.map((t) => t.omset)} bold tint="text-amber-400" />
              <BarisAngkaGrosir label="Jumlah Pesanan" nilai={dataTahunan.perTahun.map((t) => t.jumlahPesanan)} isRupiah={false} />
              <BarisAngkaGrosir label="Rata-rata / Pesanan" nilai={dataTahunan.perTahun.map((t) => t.rataRata)} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LaporanGrosir({ pesananGrosir, pelangganGrosir, pembayaranGrosir }) {
  const [dari, setDari] = useState(awalBulanIniGrosir());
  const [sampai, setSampai] = useState(hariIniIsoGrosir());

  const { omset, jumlahPesanan, rataRata, list } = ringkasanGrosir(pesananGrosir, dari || null, sampai || null);
  const totalPiutangRange = list.reduce((a, p) => a + sisaHutangPesanan(p, pembayaranGrosir), 0);
  const { mode, data } = omsetGrosirPerPeriode(list);

  const namaPelanggan = (id) => pelangganGrosir.find((p) => p.id === id)?.nama || "—";
  const terbaru = [...list].sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));

  const unduhCsv = () => {
    downloadCsv(
      `laporan-grosir-${dari || "awal"}_${sampai || "sekarang"}.csv`,
      [
        { key: "nomor_pesanan", label: "Nomor Pesanan" },
        { key: "tanggal", label: "Tanggal" },
        { key: "namaPelanggan", label: "Pelanggan" },
        { key: "total", label: "Total" },
        { key: "status_bayar", label: "Status Bayar" },
      ],
      terbaru.map((p) => ({ ...p, namaPelanggan: namaPelanggan(p.pelanggan_id) }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Laporan Grosir"
        description="Ringkasan omset & jumlah pesanan grosir — harian (rentang tanggal bebas), bulanan, dan tahunan. Pesanan berstatus Batal tidak dihitung."
        action={
          <button
            onClick={unduhCsv}
            disabled={terbaru.length === 0}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Unduh CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Omset" value={fmtRp(omset)} accent="text-amber-400" icon={TrendingUp} iconColor="text-amber-500" />
        <StatCard label="Jumlah Pesanan" value={jumlahPesanan} icon={ShoppingCart} />
        <StatCard label="Rata-rata / Pesanan" value={fmtRp(rataRata)} icon={Receipt} />
        <StatCard label="Piutang (rentang ini)" value={fmtRp(totalPiutangRange)} accent="text-red-400" icon={Wallet} iconColor="text-red-500" />
      </div>

      <GrafikOmsetGrosir mode={mode} data={data} />

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">
          Pesanan pada Rentang Ini ({terbaru.length})
        </div>
        {terbaru.length === 0 ? (
          <div className="p-6"><EmptyState label="Belum ada pesanan pada rentang tanggal ini." /></div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {terbaru.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{p.tanggal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-400 whitespace-nowrap">{p.nomor_pesanan}</td>
                    <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.pelanggan_id)}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
                        {p.status_bayar}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-200">{fmtRp(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LaporanBulananTahunanGrosir pesananGrosir={pesananGrosir} />
    </div>
  );
}

function TokoList({ tokoGrosir, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (tokoGrosir || []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      t.nama_toko?.toLowerCase().includes(s) ||
      t.kode?.toLowerCase().includes(s) ||
      t.jenis_toko?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Toko Pengirim"
        description="Daftar toko/reseller pengirim untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-toko-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Toko
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama toko, kode, atau jenis…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada toko yang cocok." : "Belum ada toko pengirim."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{t.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{t.nama_toko}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[t.jenis_toko, t.telepon].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "grosir-toko-form", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-toko", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// PRODUK MANUAL GROSIR (nama+harga yang diketik langsung saat Buat Pesanan,
// tersimpan di grosir_produk_manual biar bisa dipakai lagi tanpa ketik ulang)
// =========================================================
function ProdukManualList({ produkManualGrosir, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (produkManualGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.nama_produk?.toLowerCase().includes(s) || p.kode?.toLowerCase().includes(s);
  });

  return (
    <div>
      <PageHeader
        title="Produk Manual"
        description="Produk yang diketik langsung (bukan dari Data Barang) saat Buat Pesanan Grosir. Hapus di sini kalau sudah tidak dipakai."
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama produk atau kode…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada produk yang cocok." : "Belum ada produk manual."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{p.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{p.nama_produk}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{fmtRp(p.harga)}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "hapus-grosir-produk-manual", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


let _itemRowSeq = 0;
export const newItemRow = (sumberProduk) => ({
  _key: `row-${++_itemRowSeq}`,
  sumber_produk: sumberProduk, // 'sku' | 'manual'
  sku: "",
  produk_manual_id: "",
  nama_produk: "",
  qty: 1,
  harga: 0,
  stokTersedia: null, // null = tidak relevan (item manual)
});

function BuatPesanan({ pelangganGrosir, tokoGrosir, produkManualGrosir, skuMaster, reload, showToast }) {
  const [pelangganId, setPelangganId] = useState("");
  const [pelangganNamaBaru, setPelangganNamaBaru] = useState(""); // dipakai kalau pelanggan belum ada di daftar
  const [pelangganWaBaru, setPelangganWaBaru] = useState("");
  const [pelangganAlamatBaru, setPelangganAlamatBaru] = useState("");
  const [pelangganKotaBaru, setPelangganKotaBaru] = useState("");
  const [tokoId, setTokoId] = useState("");
  const [statusBayar, setStatusBayar] = useState("Belum Bayar"); // 'Belum Bayar' | 'Lunas'
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const pelangganOptions = pelangganGrosir.map((p) => ({ value: p.id, label: `${p.nama} (${p.kode})` }));
  const tokoOptions = tokoGrosir.map((t) => ({ value: t.id, label: `${t.nama_toko} (${t.kode})` }));

  // Kalau user ketik nama pelanggan baru + WA yang ternyata sudah dipakai
  // pelanggan lain, tampilkan peringatan dan cegah simpan pesanan supaya
  // tidak kebentuk data pelanggan dobel untuk WA yang sama.
  const pelangganBaruBentrok = pelangganNamaBaru.trim() && pelangganWaBaru.trim()
    ? pelangganDenganWa(pelangganWaBaru, pelangganGrosir)
    : null;

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  // Tambah cepat: cari SKU sekali, langsung masuk daftar dengan qty 1 (harga
  // grosir otomatis terisi dari Master Barang) — kalau SKU itu sudah ada di
  // daftar, qty-nya tinggal ditambah 1, tidak bikin baris baru dobel. Jauh
  // lebih cepat daripada klik "+ Dari Data Barang" lalu cari SKU tiap kali.
  const quickAddSku = (sku) => {
    if (!sku) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.sumber_produk === "sku" && r.sku === sku);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: (Number(next[idx].qty) || 0) + 1 };
        return next;
      }
      const s = skuMaster.find((x) => x.sku === sku);
      return [
        ...prev,
        { ...newItemRow("sku"), sku, nama_produk: sku, harga: s?.grosir || 0, stokTersedia: s?.stok || 0, qty: 1 },
      ];
    });
  };
  // Hanya SKU yang alur barangnya sudah tahap "Selesai" (= sudah diupload ke
  // marketplace) yang boleh dipilih untuk pesanan grosir baru.
  const quickAddSkuOptions = skuMaster
    .filter((s) => !s.nonaktif && s.siapGrosir)
    .map((s) => ({ value: s.sku, label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}` }));

  // Total qty per SKU yang sudah dipakai di baris lain — supaya validasi stok
  // benar walau SKU yang sama dipilih di lebih dari satu baris.
  const qtyTerpakaiPerSku = (skuKey, kecualiKey) =>
    rows
      .filter((r) => r.sumber_produk === "sku" && r.sku === skuKey && r._key !== kecualiKey)
      .reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);

  const rowError = (r) => {
    if (r.sumber_produk === "sku") {
      if (!r.sku) return "Pilih SKU dulu";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
      const stokSaatIni = skuMaster.find((s) => s.sku === r.sku)?.stok || 0;
      const sudahDipakai = qtyTerpakaiPerSku(r.sku, r._key);
      if (r.qty + sudahDipakai > stokSaatIni) return `Stok tidak cukup (sisa ${stokSaatIni - sudahDipakai})`;
    } else {
      if (!r.nama_produk.trim()) return "Nama produk wajib diisi";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
    }
    return null;
  };

  const errors = rows.map(rowError);
  const canSubmit =
    (pelangganId || pelangganNamaBaru.trim()) &&
    !pelangganBaruBentrok &&
    rows.length > 0 &&
    errors.every((e) => !e) &&
    !saving;

  const resetForm = () => {
    setPelangganId("");
    setPelangganNamaBaru("");
    setPelangganWaBaru("");
    setPelangganAlamatBaru("");
    setPelangganKotaBaru("");
    setTokoId("");
    setStatusBayar("Belum Bayar");
    setMetodeBayar("Cash");
    setCatatan("");
    setRows([]);
  };

  const submit = async () => {
    if (pelangganBaruBentrok) {
      showToast(`No. WA ini sudah terdaftar atas nama ${pelangganBaruBentrok.nama}`, "err");
      return;
    }
    setSaving(true);
    try {
      // 0. Kalau pelanggan dipilih dari daftar, pakai id-nya. Kalau tidak (user
      //    ketik nama baru), buat dulu pelanggan baru di grosir_pelanggan —
      //    sekali dibuat, langsung bisa dipilih dari daftar juga di pesanan berikutnya.
      let pelangganIdFinal = pelangganId;
      if (!pelangganIdFinal && pelangganNamaBaru.trim()) {
        const kodeBaru = nextKode(pelangganGrosir, "kode", "PLG-");
        const [pelangganBaru] = await sb("grosir_pelanggan", {
          method: "POST",
          body: JSON.stringify({
            kode: kodeBaru,
            nama: pelangganNamaBaru.trim(),
            wa: pelangganWaBaru.trim() || null,
            alamat: pelangganAlamatBaru.trim() || null,
            kota: pelangganKotaBaru.trim() || null,
          }),
        });
        pelangganIdFinal = pelangganBaru.id;
      }

      // 1. Nomor pesanan harian: GSR + ddMMyyyy + urut 3 digit, reset tiap hari.
      const prefix = `GSR${todayDDMMYYYY()}`;
      const existing = await sb(
        `grosir_pesanan?nomor_pesanan=like.${encodeURIComponent(prefix)}*&select=nomor_pesanan`
      );
      let maxSeq = 0;
      (existing || []).forEach((p) => {
        const num = parseInt(p.nomor_pesanan.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      });
      const nomorPesanan = prefix + String(maxSeq + 1).padStart(3, "0");

      // 2. Simpan header pesanan.
      const [pesanan] = await sb("grosir_pesanan", {
        method: "POST",
        body: JSON.stringify({
          nomor_pesanan: nomorPesanan,
          pelanggan_id: pelangganIdFinal,
          toko_id: tokoId || null,
          status_bayar: statusBayar,
          metode_bayar: metodeBayar,
          total,
          status: "Aktif",
          catatan: catatan.trim() || null,
        }),
      });

      // 3. Simpan tiap item + potong stok.
      // Salinan lokal daftar produk manual, di-update tiap kali ada produk
      // manual BARU dibuat di bawah — supaya kalau dalam satu pesanan ada
      // lebih dari satu produk manual baru, kode barunya (PRM-xxxx) tidak
      // dobel/tabrakan (sebelumnya nextKode() selalu ngitung dari daftar awal
      // yang sama, jadi baris ke-2 dst dapat kode yang sama persis dengan
      // baris pertama -> ditolak database karena kode harus unik).
      let produkManualList = [...produkManualGrosir];
      for (const r of rows) {
        let produkManualId = r.produk_manual_id || null;

        if (r.sumber_produk === "manual" && !produkManualId) {
          // Produk manual baru — dibuat sekali di grosir_produk_manual (TIDAK
          // pernah masuk ke sku_master/Data Barang), supaya bisa dipakai lagi
          // di pesanan berikutnya tanpa ketik ulang.
          const kodeBaru = nextKode(produkManualList, "kode", "PRM-");
          const [produkBaru] = await sb("grosir_produk_manual", {
            method: "POST",
            body: JSON.stringify({
              kode: kodeBaru,
              nama_produk: r.nama_produk.trim(),
              harga: Number(r.harga) || 0,
              stok: 0,
            }),
          });
          produkManualId = produkBaru.id;
          produkManualList = [...produkManualList, produkBaru];
        }

        await sb("grosir_detail_pesanan", {

          method: "POST",
          body: JSON.stringify({
            pesanan_id: pesanan.id,
            sumber_produk: r.sumber_produk,
            sku: r.sumber_produk === "sku" ? r.sku : null,
            produk_manual_id: r.sumber_produk === "manual" ? produkManualId : null,
            nama_produk: r.nama_produk,
            qty: Number(r.qty),
            harga: Number(r.harga),
            subtotal: Number(r.qty) * Number(r.harga),
          }),
        });

        // Potong stok — hanya untuk item dari SKU Master Barang. Item manual
        // sengaja tidak menyentuh stok manapun (di luar sistem stok terlacak).
        if (r.sumber_produk === "sku") {
          const skuRow = skuMaster.find((s) => s.sku === r.sku);
          const stokSaatIni = skuRow ? skuRow.stok : 0;
          const stokBaru = Math.max(stokSaatIni - Number(r.qty), 0);
          await sb(`sku_master?sku=eq.${encodeURIComponent(r.sku)}`, {
            method: "PATCH",
            body: JSON.stringify({ stok: stokBaru }),
          });
          await sb("stock_history", {
            method: "POST",
            body: JSON.stringify({
              sku: r.sku,
              type: "keluar",
              qty_before: stokSaatIni,
              qty_change: -Number(r.qty),
              qty_after: stokBaru,
              note: `Pesanan grosir ${nomorPesanan}`,
            }),
          });
        }
      }

      await reload();
      showToast(`Pesanan ${nomorPesanan} tersimpan, stok diperbarui`);
      resetForm();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan pesanan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Buat Pesanan Grosir"
        description="Pilih pelanggan yang sudah ada atau ketik nama baru langsung, tambahkan barang dari Data Barang atau input manual, lalu simpan. Stok Data Barang otomatis berkurang saat pesanan disimpan."
      />

      <div className="grid sm:grid-cols-2 gap-3 mb-4 max-w-2xl">
        <Field label="Pelanggan *">
          <SearchableSelect
            value={pelangganId}
            onChange={(id) => {
              setPelangganId(id);
              setPelangganNamaBaru("");
            }}
            options={pelangganOptions}
            placeholder="Cari pelanggan…"
          />
          <input
            className={`${inputClass} mt-1.5`}
            value={pelangganNamaBaru}
            onChange={(e) => {
              setPelangganNamaBaru(e.target.value);
              setPelangganId("");
            }}
            placeholder="Atau ketik nama pelanggan baru"
          />
          {pelangganNamaBaru.trim() && (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <input
                className={`${inputClass} ${pelangganBaruBentrok ? "border-red-500/60 focus:border-red-500" : ""}`}
                value={pelangganWaBaru}
                onChange={(e) => setPelangganWaBaru(e.target.value)}
                placeholder="No. WA (opsional)"
              />
              <input
                className={inputClass}
                value={pelangganKotaBaru}
                onChange={(e) => setPelangganKotaBaru(e.target.value)}
                placeholder="Kota (opsional)"
              />
              <input
                className={`${inputClass} col-span-2`}
                value={pelangganAlamatBaru}
                onChange={(e) => setPelangganAlamatBaru(e.target.value)}
                placeholder="Alamat (opsional)"
              />
              {pelangganBaruBentrok && (
                <div className="col-span-2 text-[11px] text-red-400">
                  No. WA ini sudah terdaftar atas nama {pelangganBaruBentrok.nama} ({pelangganBaruBentrok.kode}).
                  Pilih pelanggan itu dari daftar di atas, bukan buat yang baru.
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="Toko Pengirim (opsional)">
          <SearchableSelect
            value={tokoId}
            onChange={setTokoId}
            options={tokoOptions}
            placeholder="Cari toko…"
          />
        </Field>
      </div>

      <div className="mb-3 max-w-md">
        <Field label="Tambah Cepat dari Data Barang">
          <SearchableSelect
            value=""
            onChange={quickAddSku}
            options={quickAddSkuOptions}
            placeholder="Ketik SKU, langsung masuk ke daftar…"
          />
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada item. Tambahkan dari Data Barang atau input manual." />
      ) : (
        <div className="space-y-2 mb-3">
          {rows.map((r, i) => (
            <ItemRow
              key={r._key}
              row={r}
              error={errors[i]}
              skuMaster={skuMaster}
              produkManualGrosir={produkManualGrosir}
              onChange={(patch) => updateRow(r._key, patch)}
              onRemove={() => removeRow(r._key)}
            />
          ))}
        </div>
      )}

      {/* Tombol tambah baris ditaruh di bawah daftar (bukan cuma di atas) supaya
          kalau lagi ngisi item paling bawah, tidak perlu scroll ke atas lagi
          buat nambah baris berikutnya. */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => addRow("sku")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Baris Kosong dari Data Barang
        </button>
        <button
          onClick={() => addRow("manual")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Item Manual
        </button>
      </div>

      {rows.length > 0 && (
        <div className="max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Field label="Status Bayar">
              <select
                value={statusBayar}
                onChange={(e) => setStatusBayar(e.target.value)}
                className={inputClass}
              >
                <option value="Belum Bayar">Belum Bayar (Hutang)</option>
                <option value="Lunas">Lunas</option>
              </select>
            </Field>
            <Field label="Metode Bayar">
              <select
                value={metodeBayar}
                onChange={(e) => setMetodeBayar(e.target.value)}
                className={inputClass}
              >
                <option value="Cash">Cash</option>
                <option value="Transfer">Transfer</option>
              </select>
            </Field>
          </div>
          <Field label="Catatan (opsional)">
            <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Field>

          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
            <span className="text-sm text-slate-400">Total Pesanan</span>
            <span className="text-lg font-bold text-amber-400">{fmtRp(total)}</span>
          </div>

          <button
            disabled={!canSubmit}
            onClick={submit}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-3 rounded-lg"
          >
            <ShoppingCart size={16} /> {saving ? "Menyimpan…" : "Simpan Pesanan"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ItemRow({ row, error, skuMaster, produkManualGrosir, onChange, onRemove }) {
  // SKU nonaktif (bekas "dihapus") atau yang alur barangnya belum "Selesai"
  // (belum diupload ke marketplace) tidak boleh dipilih buat pesanan baru,
  // tapi baris pesanan lama yang sudah pakai SKU itu tetap tampil apa adanya.
  const skuOptions = skuMaster
    .filter((s) => s.sku === row.sku || (!s.nonaktif && s.siapGrosir))
    .map((s) => ({
      value: s.sku,
      label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}${s.nonaktif ? " · (nonaktif)" : ""}`,
    }));
  const manualOptions = produkManualGrosir.map((p) => ({
    value: p.id,
    label: `${p.nama_produk} · ${fmtRp(p.harga || 0)}`,
  }));

  const pickSku = (sku) => {
    const s = skuMaster.find((x) => x.sku === sku);
    onChange({
      sku,
      nama_produk: sku,
      harga: s?.grosir || 0,
      stokTersedia: s?.stok || 0,
    });
  };

  const pickManual = (id) => {
    const p = produkManualGrosir.find((x) => x.id === id);
    if (p) {
      onChange({ produk_manual_id: id, nama_produk: p.nama_produk, harga: p.harga });
    } else {
      // id kosong berarti user mengetik nama baru (bukan pilih dari daftar).
      onChange({ produk_manual_id: "" });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid sm:grid-cols-[2fr_1fr_1fr] gap-2">
          {row.sumber_produk === "sku" ? (
            <SearchableSelect value={row.sku} onChange={pickSku} options={skuOptions} placeholder="Cari SKU…" compact />
          ) : (
            <div>
              <SearchableSelect
                value={row.produk_manual_id}
                onChange={pickManual}
                options={manualOptions}
                placeholder="Cari produk manual tersimpan…"
                compact
              />
              <input
                className={`${inputClass} mt-1.5`}
                value={row.nama_produk}
                onChange={(e) => onChange({ nama_produk: e.target.value, produk_manual_id: "" })}
                placeholder="Atau ketik nama produk baru"
              />
            </div>
          )}
          <div className="flex items-center border border-slate-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => onChange({ qty: Math.max(1, (Number(row.qty) || 0) - 1) })}
              className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-800 flex-shrink-0"
              tabIndex={-1}
            >
              <Minus size={12} />
            </button>
            <input
              type="number"
              min="1"
              className="w-full bg-slate-950 text-center text-sm outline-none py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={row.qty}
              onChange={(e) => onChange({ qty: e.target.value === "" ? "" : Number(e.target.value) })}
              onWheel={(e) => e.target.blur()}
              placeholder="Qty"
            />
            <button
              type="button"
              onClick={() => onChange({ qty: (Number(row.qty) || 0) + 1 })}
              className="px-2.5 py-2 text-slate-400 hover:text-white hover:bg-slate-800 flex-shrink-0"
              tabIndex={-1}
            >
              <Plus size={12} />
            </button>
          </div>
          <input
            type="number"
            min="0"
            className={inputClass}
            value={row.harga}
            onChange={(e) => onChange({ harga: e.target.value === "" ? "" : Number(e.target.value) })}
            onWheel={(e) => e.target.blur()}
            placeholder="Harga"
          />
        </div>
        <button
          onClick={onRemove}
          className="p-2 text-slate-600 hover:text-red-400 flex-shrink-0"
          title="Hapus item"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-slate-500">
          {row.sumber_produk === "sku" ? "Dari Data Barang" : "Item manual"}
          {row.qty && row.harga ? ` · Subtotal ${fmtRp(Number(row.qty) * Number(row.harga))}` : ""}
        </span>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

// =========================================================
// EDIT ITEM PESANAN
// Form terkontrol (presentational) — semua penyimpanan/penyesuaian stok
// dilakukan di ModalRouter lewat prop onSubmit, supaya konsisten dengan
// pola form lain (mis. BayarHutangForm di forms.jsx).
// =========================================================
export function EditPesananForm({
  pesanan, detailItems, tokoGrosir, skuMaster, produkManualGrosir, onClose, saving, onSubmit,
}) {
  const [tokoId, setTokoId] = useState(pesanan.toko_id || "");
  const [metodeBayar, setMetodeBayar] = useState(pesanan.metode_bayar || "Cash");
  const [catatan, setCatatan] = useState(pesanan.catatan || "");
  const [rows, setRows] = useState(() =>
    (detailItems || []).map((d) => ({
      _key: `row-${++_itemRowSeq}`,
      sumber_produk: d.sumber_produk,
      sku: d.sumber_produk === "sku" ? d.sku : "",
      produk_manual_id: d.sumber_produk === "manual" ? d.produk_manual_id || "" : "",
      nama_produk: d.nama_produk,
      qty: d.qty,
      harga: d.harga,
      stokTersedia: null,
    }))
  );

  // Stok "seolah pesanan ini belum ada" — qty asli pesanan ini dikembalikan
  // dulu secara virtual ke stok saat ini, supaya validasi qty di form edit
  // tidak salah anggap stok kurang gara-gara qty lama sudah kepotong.
  const originalQtyPerSku = {};
  (detailItems || []).forEach((d) => {
    if (d.sumber_produk === "sku" && d.sku) {
      originalQtyPerSku[d.sku] = (originalQtyPerSku[d.sku] || 0) + Number(d.qty || 0);
    }
  });
  const editableSkuMaster = (skuMaster || []).map((s) =>
    originalQtyPerSku[s.sku] ? { ...s, stok: (Number(s.stok) || 0) + originalQtyPerSku[s.sku] } : s
  );

  const tokoOptions = (tokoGrosir || []).map((t) => ({ value: t.id, label: `${t.nama_toko} (${t.kode})` }));

  // Tambah cepat: sama seperti di Buat Pesanan — cari SKU sekali langsung
  // masuk daftar, kalau sudah ada tinggal qty-nya ditambah.
  const quickAddSku = (sku) => {
    if (!sku) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.sumber_produk === "sku" && r.sku === sku);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: (Number(next[idx].qty) || 0) + 1 };
        return next;
      }
      const s = editableSkuMaster.find((x) => x.sku === sku);
      return [
        ...prev,
        { ...newItemRow("sku"), sku, nama_produk: sku, harga: s?.grosir || 0, stokTersedia: s?.stok || 0, qty: 1 },
      ];
    });
  };
  const quickAddSkuOptions = editableSkuMaster
    .filter((s) => !s.nonaktif && s.siapGrosir)
    .map((s) => ({ value: s.sku, label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}` }));

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const qtyTerpakaiPerSku = (skuKey, kecualiKey) =>
    rows
      .filter((r) => r.sumber_produk === "sku" && r.sku === skuKey && r._key !== kecualiKey)
      .reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);

  const rowError = (r) => {
    if (r.sumber_produk === "sku") {
      if (!r.sku) return "Pilih SKU dulu";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
      const stokSaatIni = editableSkuMaster.find((s) => s.sku === r.sku)?.stok || 0;
      const sudahDipakai = qtyTerpakaiPerSku(r.sku, r._key);
      if (r.qty + sudahDipakai > stokSaatIni) return `Stok tidak cukup (sisa ${stokSaatIni - sudahDipakai})`;
    } else {
      if (!r.nama_produk.trim()) return "Nama produk wajib diisi";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
    }
    return null;
  };

  const errors = rows.map(rowError);
  const canSubmit = rows.length > 0 && errors.every((e) => !e) && !saving;

  const toko = tokoGrosir.find((t) => t.id === tokoId);

  const submit = () => {
    onSubmit({
      tokoId: tokoId || null,
      namaToko: toko ? toko.nama_toko : null,
      metodeBayar,
      catatan: catatan.trim() || null,
      total,
      items: rows.map((r) => ({
        sumber_produk: r.sumber_produk,
        sku: r.sumber_produk === "sku" ? r.sku : null,
        produk_manual_id: r.sumber_produk === "manual" ? r.produk_manual_id || null : null,
        nama_produk: r.nama_produk,
        qty: Number(r.qty),
        harga: Number(r.harga),
      })),
    });
  };

  return (
    <ModalShell title={`Edit Pesanan ${pesanan.nomor_pesanan}`} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Field label="Toko Pengirim (opsional)">
          <SearchableSelect value={tokoId} onChange={setTokoId} options={tokoOptions} placeholder="Cari toko…" />
        </Field>
        <Field label="Metode Bayar">
          <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className={inputClass}>
            <option value="Cash">Cash</option>
            <option value="Transfer">Transfer</option>
          </select>
        </Field>
      </div>
      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <div className="my-3">
        <Field label="Tambah Cepat dari Data Barang">
          <SearchableSelect
            value=""
            onChange={quickAddSku}
            options={quickAddSkuOptions}
            placeholder="Ketik SKU, langsung masuk ke daftar…"
          />
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada item. Tambahkan dari Data Barang atau input manual." />
      ) : (
        <div className="space-y-2 mb-3">
          {rows.map((r, i) => (
            <ItemRow
              key={r._key}
              row={r}
              error={errors[i]}
              skuMaster={editableSkuMaster}
              produkManualGrosir={produkManualGrosir}
              onChange={(patch) => updateRow(r._key, patch)}
              onRemove={() => removeRow(r._key)}
            />
          ))}
        </div>
      )}

      {/* Tombol tambah baris ditaruh di bawah daftar supaya tidak perlu
          scroll ke atas lagi saat lagi ngisi item paling bawah. */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => addRow("sku")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Baris Kosong dari Data Barang
        </button>
        <button
          onClick={() => addRow("manual")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Item Manual
        </button>
      </div>

      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
        <span className="text-sm text-slate-400">Total Pesanan</span>
        <span className="text-lg font-bold text-amber-400">{fmtRp(total)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
        >
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </button>
      </div>
    </ModalShell>
  );
}