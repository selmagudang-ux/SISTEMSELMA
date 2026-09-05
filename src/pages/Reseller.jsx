import { useState } from "react";
import {
  Search, Plus, ShoppingCart, AlertTriangle, CalendarClock, Wallet,
} from "lucide-react";
import { PageHeader, EmptyState, Field, SearchableSelect, inputClass, Badge, ModalShell, InputTanggal, InputRupiah } from "../components/ui";
import {
  sb, fmtRp, nextKode, sisaHutangPesanan, totalHutangPerPelanggan, totalDepositPerPelanggan, pelangganDenganWa, hitungStatusBayar, todayDDMMYYYY,
  tokoShopeeGudang,
} from "../lib/api";
import { rencanaKurangiRak } from "./Rak";
import { newItemRow, ItemRow } from "./Grosir";

// =========================================================
// RESELLER TOKO — varian pesanan Grosir yang SELALU hutang (tidak pernah ada
// pilihan "Langsung Bayar" seperti di Grosir) & nomor pesanannya diisi
// MANUAL oleh admin (bukan digenerate otomatis format GSRddMMyyyy### seperti
// Grosir). Nebeng tabel & helper yang SAMA PERSIS dengan Grosir
// (grosir_pesanan / grosir_detail_pesanan / grosir_pembayaran /
// grosir_pelanggan / grosir_deposit) — dibedakan lewat kolom
// jenis_transaksi ('grosir' default | 'reseller', migration terpisah).
// Efeknya: semua modal yang sudah ada di ModalRouter untuk satu pesanan
// (grosir-detail-pesanan, grosir-bayar-hutang, grosir-cetak-nota,
// grosir-cetak-label, grosir-edit-pesanan, grosir-batalkan-pesanan,
// grosir-hapus-pesanan) otomatis ikut jalan tanpa perlu diduplikasi sama
// sekali — semuanya generik, kerja dari objek pesanan `p` itu sendiri, tidak
// peduli jenis_transaksi-nya apa.
//
// Yang BENAR-BENAR baru cuma 3:
//  1. BuatPesananReseller (di bawah)      — form buat pesanan versi hutang-
//     saja + nomor manual, dipakai lewat modal "reseller-buat-pesanan".
//  2. Halaman "Penagihan Hutang"          — rekap hutang aktif pelanggan
//     reseller, ditagih rutin tiap hari Kamis (lihat PenagihanHutangReseller
//     di bawah), dibuka lewat modal "reseller-bayar-hutang-pelanggan" (varian
//     grosir-bayar-hutang-pelanggan yang dibatasi cuma ke pesanan reseller).
//  3. Kolom grosir_pesanan.jenis_transaksi itu sendiri (migration SQL).
// =========================================================
//
// RESELLER CEKOUT — kebalikan dari Reseller Toko: kalau Toko SELALU hutang
// dulu baru ditagih belakangan, Cekout dibayar lewat pencairan marketplace
// (jumlahnya diinput manual oleh admin waktu pesanan dibuat, sesuai nominal
// yang benar-benar cair). Nomor pesanan tetap manual (sama seperti Toko).
// Tiga aturan intinya:
//  1. Nominal yang cair dipakai melunasi pesanan ini dulu (sampai maksimal
//     sebesar total pesanan) — dicatat sebagai grosir_pembayaran biasa,
//     metode_bayar "Marketplace", supaya sisa piutang & status_bayar
//     (Belum Bayar/Sebagian/Lunas) selalu konsisten dengan pesanan lain.
//  2. Kalau yang cair LEBIH BESAR dari total pesanan, kelebihannya otomatis
//     jadi saldo deposit pelanggan (grosir_deposit) — pola sama persis
//     dengan "kelebihan bayar" di Grosir/BayarHutangForm, jadi otomatis
//     kelihatan & bisa dipakai lagi di PelangganList, CairkanDepositForm,
//     dan opsi metode bayar "Deposit" di pesanan manapun (grosir, reseller
//     toko, atau cekout lain).
//  3. Kalau yang cair KURANG dari total (termasuk 0 — belum cair sama
//     sekali), sisanya tetap tercatat sebagai piutang biasa, dilunasi
//     belakangan lewat "Catat Pembayaran" di detail pesanan (modal
//     grosir-bayar-hutang, generik, sudah otomatis jalan tanpa perlu
//     diduplikasi — sama seperti Reseller Toko).
// BEDA dengan Reseller Toko (yang begitu dibayar langsung tercatat masuk
// Keuangan lewat modal "Catat Pembayaran" generik): uang Reseller Cekout
// TIDAK langsung masuk Keuangan sama sekali. Baik nominal yang cair waktu
// pesanan dibuat (di sini) MAUPUN pelunasan sisa piutang belakangan (modal
// grosir-bayar-hutang, metode "Pencairan Marketplace" — lihat ModalRouter)
// sama-sama ditampung dulu sebagai "pemasukan" di saldo toko Shopee
// "Gudang" (tabel marketplace_transaksi, lewat tokoShopeeGudang() di
// lib/api.js) — pola yang SAMA PERSIS dengan pemasukan/pencairan toko
// marketplace lain (lihat Penjualanmarketplace.jsx). Baru pindah ke
// Keuangan belakangan saat admin klik "Cairkan" di toko Gudang itu.
// =========================================================

const HARI_LABEL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const KAMIS = 4;

function infoKamis() {
  const now = new Date();
  const hariIni = now.getDay();
  const isKamis = hariIni === KAMIS;
  const selisih = (KAMIS - hariIni + 7) % 7;
  const nextKamis = new Date(now);
  nextKamis.setDate(now.getDate() + (isKamis ? 0 : selisih));
  return { isKamis, nextKamis, hariIniLabel: HARI_LABEL[hariIni] };
}

export default function Reseller({
  sub,
  pelangganGrosir, produkManualGrosir, skuMaster, penempatan,
  pesananGrosir, detailPesananGrosir, pembayaranGrosir, depositGrosir,
  reload, showToast, setModal,
}) {
  const pesananReseller = (pesananGrosir || []).filter((p) => p.jenis_transaksi === "reseller");
  const pesananCekout = (pesananGrosir || []).filter((p) => p.jenis_transaksi === "reseller_cekout");

  if (sub === "penagihan")
    return (
      <PencairanDanPenagihanReseller
        pesananReseller={pesananReseller}
        pesananCekout={pesananCekout}
        pelangganGrosir={pelangganGrosir}
        pembayaranGrosir={pembayaranGrosir}
        depositGrosir={depositGrosir}
        setModal={setModal}
      />
    );

  if (sub === "cekout")
    return (
      <SemuaPesananResellerCekout
        pesananCekout={pesananCekout}
        pelangganGrosir={pelangganGrosir}
        pembayaranGrosir={pembayaranGrosir}
        setModal={setModal}
      />
    );

  // "toko" (default/fallback)
  return (
    <SemuaPesananReseller
      pesananReseller={pesananReseller}
      pelangganGrosir={pelangganGrosir}
      pembayaranGrosir={pembayaranGrosir}
      setModal={setModal}
    />
  );
}

// =========================================================
// SEMUA PESANAN RESELLER — daftar pesanan jenis_transaksi='reseller' saja.
// Klik satu baris membuka modal "grosir-detail-pesanan" yang SAMA persis
// dengan yang dipakai Grosir (lihat catatan panjang di atas kenapa ini aman
// dipakai ulang).
// =========================================================
function SemuaPesananReseller({ pesananReseller, pelangganGrosir, pembayaranGrosir, setModal }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const namaPelanggan = (id) => pelangganGrosir.find((p) => p.id === id)?.nama || "—";

  const filtered = (pesananReseller || []).filter((p) => {
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
        title="Reseller Toko"
        description="Pesanan reseller — selalu tercatat sebagai hutang saat dibuat, nomor pesanan diisi manual. Ditagih rutin tiap hari Kamis (lihat menu Penagihan atau Pencairan)."
        action={
          <button
            onClick={() => setModal({ type: "reseller-buat-pesanan" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Buat Pesanan
          </button>
        }
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
        <EmptyState label={q || statusFilter ? "Tidak ada pesanan yang cocok." : "Belum ada pesanan reseller."} />
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
// =========================================================
// PENCAIRAN DAN PENAGIHAN RESELLER — menu gabungan (dulu "Penagihan Hutang"
// & "Reseller Cekout" dua submenu terpisah, lihat catatan di constants.js).
// Pembungkus tab internal — tab "Penagihan Hutang" (PenagihanHutangReseller)
// tidak berubah. Tab "Pencairan" TADINYA cuma nampilin ulang daftar pesanan
// Reseller Cekout (SemuaPesananResellerCekout, masih bisa diakses lewat menu
// "Reseller Cekout" sendiri) — sekarang diganti PencairanResellerCekout di
// bawah: rekap saldo yang harus dicairkan KE pelanggan, polanya sama persis
// dengan PenagihanHutangReseller (rekap per pelanggan + klik buat aksi),
// cuma kebalikannya — lihat catatan di PencairanResellerCekout.
// =========================================================
function PencairanDanPenagihanReseller({
  pesananReseller, pesananCekout, pelangganGrosir, pembayaranGrosir, depositGrosir, setModal,
}) {
  const [tab, setTab] = useState("penagihan");

  const TABS = [
    { key: "penagihan", label: "Penagihan Hutang" },
    { key: "cekout", label: "Pencairan" },
    { key: "riwayat", label: "Riwayat" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tab === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "cekout" ? (
        <PencairanResellerCekout
          pesananCekout={pesananCekout}
          pelangganGrosir={pelangganGrosir}
          depositGrosir={depositGrosir}
          setModal={setModal}
        />
      ) : tab === "riwayat" ? (
        <RiwayatPenagihanPencairan
          pesananReseller={pesananReseller}
          pesananCekout={pesananCekout}
          pelangganGrosir={pelangganGrosir}
          pembayaranGrosir={pembayaranGrosir}
          depositGrosir={depositGrosir}
        />
      ) : (
        <PenagihanHutangReseller
          pesananReseller={pesananReseller}
          pelangganGrosir={pelangganGrosir}
          pembayaranGrosir={pembayaranGrosir}
          setModal={setModal}
        />
      )}
    </div>
  );
}

// =========================================================
// RIWAYAT PENAGIHAN & PENCAIRAN — linimasa gabungan, terbaru di atas, dari
// data yang SUDAH ADA (tidak ada tabel baru) — cuma difilter & digabung
// ulang dari grosir_pembayaran & grosir_deposit:
//  - "Penagihan Hutang"       : grosir_pembayaran milik pesanan Reseller
//    Toko (jenis_transaksi='reseller') — uang MASUK ditagih dari pelanggan,
//    dicatat lewat modal "reseller-bayar-hutang-pelanggan".
//  - "Cair dari Marketplace"  : grosir_pembayaran milik pesanan Reseller
//    Cekout dengan metode_bayar "Marketplace" — nominal yang otomatis
//    dipakai melunasi pesanan itu waktu dibuat (lihat BuatPesananReseller
//    Cekout di bawah).
//  - "Kelebihan → Deposit"    : grosir_deposit (jumlah positif) yang
//    tertaut ke pesanan Reseller Cekout lewat pesanan_id_terkait.
//  - "Dicairkan ke Pelanggan" : grosir_deposit (jumlah negatif) milik
//    pelanggan Reseller Cekout — uang KELUAR waktu admin klik "Cairkan" di
//    tab Pencairan (modal "reseller-cekout-cairkan-deposit").
// Baris pelunasan piutang Reseller Cekout belakangan (modal
// grosir-bayar-hutang generik, metode "Pencairan Marketplace") juga otomatis
// ikut ke sini karena pesanan_id-nya tetap masuk cekoutIds — tidak perlu
// dibedakan lagi jenisnya, cukup ikut label "Cair dari Marketplace".
// =========================================================
function RiwayatPenagihanPencairan({
  pesananReseller, pesananCekout, pelangganGrosir, pembayaranGrosir, depositGrosir,
}) {
  const [q, setQ] = useState("");
  const [jenisFilter, setJenisFilter] = useState("");

  const namaPelanggan = (id) => (pelangganGrosir || []).find((p) => p.id === id)?.nama || "—";
  const nomorPesananReseller = (id) => (pesananReseller || []).find((p) => p.id === id)?.nomor_pesanan;
  const nomorPesananCekout = (id) => (pesananCekout || []).find((p) => p.id === id)?.nomor_pesanan;

  const resellerIds = new Set((pesananReseller || []).map((p) => p.id));
  const cekoutIds = new Set((pesananCekout || []).map((p) => p.id));
  const cekoutPelangganIds = new Set((pesananCekout || []).map((p) => p.pelanggan_id));

  const entriPenagihan = (pembayaranGrosir || [])
    .filter((b) => resellerIds.has(b.pesanan_id))
    .map((b) => ({
      id: `bayar-${b.id}`,
      tanggal: b.created_at,
      jenis: "Penagihan Hutang",
      warna: "emerald",
      arah: "masuk",
      pelangganId: b.pelanggan_id,
      nomor: nomorPesananReseller(b.pesanan_id),
      metode: b.metode_bayar,
      catatan: b.catatan,
      jumlah: Number(b.jumlah) || 0,
    }));

  const entriCair = (pembayaranGrosir || [])
    .filter((b) => cekoutIds.has(b.pesanan_id))
    .map((b) => ({
      id: `bayar-${b.id}`,
      tanggal: b.created_at,
      jenis: "Cair dari Marketplace",
      warna: "emerald",
      arah: "masuk",
      pelangganId: b.pelanggan_id,
      nomor: nomorPesananCekout(b.pesanan_id),
      metode: b.metode_bayar,
      catatan: b.catatan,
      jumlah: Number(b.jumlah) || 0,
    }));

  const entriDeposit = (depositGrosir || [])
    .filter((d) => cekoutPelangganIds.has(d.pelanggan_id))
    .filter(
      (d) =>
        (d.pesanan_id_terkait && cekoutIds.has(d.pesanan_id_terkait)) ||
        (d.keterangan || "").includes("Reseller Cekout")
    )
    .map((d) => {
      const jumlah = Number(d.jumlah) || 0;
      return {
        id: `dep-${d.id}`,
        tanggal: d.created_at,
        jenis: jumlah >= 0 ? "Kelebihan → Deposit" : "Dicairkan ke Pelanggan",
        warna: jumlah >= 0 ? "sky" : "red",
        arah: jumlah >= 0 ? "masuk" : "keluar",
        pelangganId: d.pelanggan_id,
        nomor: d.pesanan_id_terkait ? nomorPesananCekout(d.pesanan_id_terkait) : null,
        metode: null,
        catatan: d.keterangan,
        jumlah: Math.abs(jumlah),
      };
    });

  const semua = [...entriPenagihan, ...entriCair, ...entriDeposit].sort(
    (a, b) => new Date(b.tanggal) - new Date(a.tanggal)
  );

  const JENIS_OPTIONS = ["Penagihan Hutang", "Cair dari Marketplace", "Kelebihan → Deposit", "Dicairkan ke Pelanggan"];

  const filtered = semua.filter((x) => {
    const s = q.trim().toLowerCase();
    const matchQ =
      !s || namaPelanggan(x.pelangganId).toLowerCase().includes(s) || (x.nomor || "").toLowerCase().includes(s);
    const matchJenis = !jenisFilter || x.jenis === jenisFilter;
    return matchQ && matchJenis;
  });

  const totalMasuk = filtered.filter((x) => x.arah === "masuk").reduce((a, x) => a + x.jumlah, 0);
  const totalKeluar = filtered.filter((x) => x.arah === "keluar").reduce((a, x) => a + x.jumlah, 0);

  return (
    <div>
      <PageHeader
        title="Riwayat Penagihan & Pencairan"
        description="Linimasa pembayaran hutang Reseller Toko yang sudah diterima, dan pencairan Reseller Cekout (masuk dari marketplace maupun keluar ke pelanggan), terbaru di atas."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama pelanggan atau nomor pesanan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select value={jenisFilter} onChange={(e) => setJenisFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Jenis</option>
          {JENIS_OPTIONS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
          <div className="text-[11px] text-slate-500">Total Masuk</div>
          <div className="text-lg font-bold text-emerald-400">{fmtRp(totalMasuk)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
          <div className="text-[11px] text-slate-500">Total Keluar</div>
          <div className="text-lg font-bold text-red-400">{fmtRp(totalKeluar)}</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          label={q || jenisFilter ? "Tidak ada riwayat yang cocok." : "Belum ada riwayat penagihan atau pencairan."}
        />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((x, i) => (
            <div
              key={x.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge color={x.warna}>{x.jenis}</Badge>
                  {x.nomor && <span className="font-mono text-[11px] text-amber-400">{x.nomor}</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {namaPelanggan(x.pelangganId)}
                  {x.metode ? ` · ${x.metode}` : ""}
                  {x.catatan ? ` · ${x.catatan}` : ""}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {x.tanggal ? new Date(x.tanggal).toLocaleString("id-ID") : "—"}
                </div>
              </div>
              <div
                className={`text-sm font-semibold flex-shrink-0 ml-2 ${
                  x.arah === "masuk" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {x.arah === "masuk" ? "+" : "−"}
                {fmtRp(x.jumlah)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// PENAGIHAN HUTANG — rekap total hutang aktif per pelanggan, dihitung HANYA
// dari pesanan reseller (pesananReseller, sudah difilter jenis_transaksi di
// Reseller() di atas) — beda dari totalHutangPerPelanggan yang dipakai
// PelangganList di Grosir (itu menghitung SEMUA pesanan grosir+reseller
// pelanggan itu). Bukan jadwal/tabel tersendiri — cuma dihitung ulang tiap
// halaman ini dibuka, jadi selalu akurat & tidak bisa "basi".
// Klik satu pelanggan membuka modal "reseller-bayar-hutang-pelanggan" (lihat
// ModalRouter) yang melunasi pesanan reseller pelanggan itu dari yang
// paling lama dulu — sama pola dengan "Bayar Hutang" di Pelanggan Grosir.
// =========================================================
function PenagihanHutangReseller({ pesananReseller, pelangganGrosir, pembayaranGrosir, setModal }) {
  const [q, setQ] = useState("");
  const { isKamis, nextKamis, hariIniLabel } = infoKamis();
  const hutangMap = totalHutangPerPelanggan(pesananReseller, pembayaranGrosir);

  const daftar = Object.entries(hutangMap)
    .map(([pelangganId, sisa]) => ({
      pelanggan: (pelangganGrosir || []).find((p) => p.id === pelangganId),
      sisa,
    }))
    .filter((x) => x.pelanggan)
    .filter((x) => {
      const s = q.trim().toLowerCase();
      return !s || x.pelanggan.nama.toLowerCase().includes(s) || x.pelanggan.kode?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.sisa - a.sisa);

  const totalSemua = daftar.reduce((a, x) => a + x.sisa, 0);

  return (
    <div>
      <PageHeader
        title="Penagihan Hutang — Reseller Toko"
        description="Rekap hutang aktif pelanggan reseller (belum termasuk pesanan Grosir biasa), ditagih rutin tiap hari Kamis."
      />

      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-3 mb-4 text-sm ${
          isKamis
            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
            : "bg-slate-900 border-slate-800 text-slate-400"
        }`}
      >
        <CalendarClock size={16} className="flex-shrink-0" />
        {isKamis
          ? "Hari ini Kamis — waktunya menagih hutang reseller."
          : `Hari ini ${hariIniLabel}. Penagihan berikutnya hari Kamis, ${nextKamis.toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}.`}
      </div>

      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm mb-4">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau kode pelanggan…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
        <span className="text-sm text-slate-400">Total Hutang Reseller Aktif</span>
        <span className="text-lg font-bold text-red-400">{fmtRp(totalSemua)}</span>
      </div>

      {daftar.length === 0 ? (
        <EmptyState label={q ? "Tidak ada pelanggan yang cocok." : "Tidak ada pelanggan reseller yang berhutang saat ini."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map((x, i) => (
            <button
              key={x.pelanggan.id}
              onClick={() => setModal({ type: "reseller-bayar-hutang-pelanggan", item: x.pelanggan })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">{x.pelanggan.nama}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {x.pelanggan.kode}
                  {x.pelanggan.wa ? ` · ${x.pelanggan.wa}` : ""}
                </div>
              </div>
              <div className="text-sm font-semibold text-red-400 flex-shrink-0 ml-2">{fmtRp(x.sisa)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// PENCAIRAN RESELLER CEKOUT — rekap saldo yang harus DICAIRKAN (dibayar
// keluar) ke tiap pelanggan Reseller Cekout, kebalikan dari
// PenagihanHutangReseller di atas: kalau Penagihan Hutang menagih uang
// MASUK dari pelanggan yang masih berhutang, di sini yang direkap adalah
// saldo deposit pelanggan (dari kelebihan nominal cair marketplace waktu
// pesanan cekout dibuat/dilunasi — lihat totalDepositPerPelanggan di
// lib/api.js) yang harus dibayar KELUAR ke pelanggan itu. Daftarnya
// dibatasi hanya ke pelanggan yang punya pesanan Reseller Cekout (supaya
// tidak ikut menampilkan saldo deposit dari Grosir/Reseller Toko biasa —
// itu tetap dicairkan lewat modal "grosir-cairkan-deposit" generik di menu
// Riwayat Pelanggan). Klik satu pelanggan membuka modal
// "reseller-cekout-cairkan-deposit" (lihat ModalRouter) — begitu
// dicairkan, uangnya tercatat sebagai PENGELUARAN di Keuangan (kategori
// "Reseller Checkout Toko Gudang", sumber dana/rekening bebas dipilih),
// bukan pemasukan seperti Penagihan Hutang.
// =========================================================
function PencairanResellerCekout({ pesananCekout, pelangganGrosir, depositGrosir, setModal }) {
  const [q, setQ] = useState("");
  const depositMap = totalDepositPerPelanggan(depositGrosir);
  const pelangganCekoutIds = new Set((pesananCekout || []).map((p) => p.pelanggan_id));

  const daftar = Object.entries(depositMap)
    .filter(([pelangganId]) => pelangganCekoutIds.has(pelangganId))
    .map(([pelangganId, saldo]) => ({
      pelanggan: (pelangganGrosir || []).find((p) => p.id === pelangganId),
      saldo,
    }))
    .filter((x) => x.pelanggan)
    .filter((x) => {
      const s = q.trim().toLowerCase();
      return !s || x.pelanggan.nama.toLowerCase().includes(s) || x.pelanggan.kode?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.saldo - a.saldo);

  const totalSemua = daftar.reduce((a, x) => a + x.saldo, 0);

  return (
    <div>
      <PageHeader
        title="Pencairan — Reseller Cekout"
        description="Rekap saldo yang harus dicairkan (dibayar keluar) ke pelanggan Reseller Cekout. Begitu dicairkan, tercatat sebagai pengeluaran di Keuangan."
      />

      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm mb-4">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau kode pelanggan…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
        <span className="text-sm text-slate-400">Total Harus Dicairkan</span>
        <span className="text-lg font-bold text-emerald-400">{fmtRp(totalSemua)}</span>
      </div>

      {daftar.length === 0 ? (
        <EmptyState label={q ? "Tidak ada pelanggan yang cocok." : "Tidak ada saldo yang perlu dicairkan saat ini."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map((x, i) => (
            <button
              key={x.pelanggan.id}
              onClick={() => setModal({ type: "reseller-cekout-cairkan-deposit", item: x.pelanggan })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">{x.pelanggan.nama}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {x.pelanggan.kode}
                  {x.pelanggan.wa ? ` · ${x.pelanggan.wa}` : ""}
                </div>
              </div>
              <div className="text-sm font-semibold text-emerald-400 flex-shrink-0 ml-2">{fmtRp(x.saldo)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// BUAT PESANAN RESELLER — dipakai lewat modal "reseller-buat-pesanan"
// (ModalRouter). Sengaja dibuat komponen TERPISAH dari BuatPesanan (Grosir)
// walau isinya banyak yang mirip, karena bedanya justru di dua hal paling
// inti: nomor pesanan MANUAL (bukan digenerate) & TIDAK PERNAH ada opsi
// bayar langsung — selalu tersimpan sebagai hutang (status_bayar "Belum
// Bayar"), jadi lebih jelas & lebih aman dipisah daripada dipaksa jadi satu
// komponen dengan banyak flag kondisional.
// =========================================================
export function BuatPesananReseller({
  pelangganGrosir, produkManualGrosir, skuMaster, penempatan, pesananGrosir, reload, showToast, onClose,
}) {
  const [nomorPesanan, setNomorPesanan] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [pelangganId, setPelangganId] = useState("");
  const [pelangganNamaBaru, setPelangganNamaBaru] = useState("");
  const [pelangganWaBaru, setPelangganWaBaru] = useState("");
  const [pelangganAlamatBaru, setPelangganAlamatBaru] = useState("");
  const [pelangganKotaBaru, setPelangganKotaBaru] = useState("");
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const pelangganOptions = pelangganGrosir.map((p) => ({ value: p.id, label: `${p.nama} (${p.kode})` }));

  const pelangganBaruBentrok = pelangganNamaBaru.trim() && pelangganWaBaru.trim()
    ? pelangganDenganWa(pelangganWaBaru, pelangganGrosir)
    : null;

  const nomorPesananTrim = nomorPesanan.trim();
  const nomorBentrok = nomorPesananTrim
    ? (pesananGrosir || []).some((p) => (p.nomor_pesanan || "").trim().toLowerCase() === nomorPesananTrim.toLowerCase())
    : false;

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

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
  const quickAddSkuOptions = skuMaster
    .filter((s) => !s.nonaktif && s.siapGrosir)
    .map((s) => ({ value: s.sku, label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}` }));

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
    !!nomorPesananTrim &&
    !nomorBentrok &&
    (pelangganId || pelangganNamaBaru.trim()) &&
    !pelangganBaruBentrok &&
    rows.length > 0 &&
    errors.every((e) => !e) &&
    !saving;

  const resetForm = () => {
    setNomorPesanan("");
    setTanggal(new Date().toISOString().slice(0, 10));
    setPelangganId("");
    setPelangganNamaBaru("");
    setPelangganWaBaru("");
    setPelangganAlamatBaru("");
    setPelangganKotaBaru("");
    setCatatan("");
    setRows([]);
  };

  const submit = async () => {
    if (pelangganBaruBentrok) {
      showToast(`No. WA ini sudah terdaftar atas nama ${pelangganBaruBentrok.nama}`, "err");
      return;
    }
    if (!nomorPesananTrim) {
      showToast("Nomor pesanan wajib diisi", "err");
      return;
    }
    if (nomorBentrok) {
      showToast("Nomor pesanan ini sudah dipakai — pakai nomor lain", "err");
      return;
    }
    setSaving(true);
    try {
      // 0. Pelanggan baru (kalau ada) — pola sama persis dengan BuatPesanan
      //    (Grosir): sekali dibuat, langsung bisa dipakai lagi di pesanan
      //    berikutnya (grosir maupun reseller, satu daftar pelanggan yang
      //    sama).
      let pelangganIdFinal = pelangganId;
      if (!pelangganIdFinal && pelangganNamaBaru.trim()) {
        const pelangganTerbaru = await sb("grosir_pelanggan?select=kode");
        const kodeBaru = nextKode(pelangganTerbaru, "kode", "PLG-");
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

      // 1. Cek ulang bentrok nomor pesanan langsung ke database (bukan cuma
      //    state lokal yang bisa basi) — mencegah 2 pesanan (reseller vs
      //    reseller, atau reseller vs grosir) kebetulan dibuat dengan nomor
      //    yang sama persis dari 2 sesi berbeda hampir bersamaan.
      const cekBentrok = await sb(
        `grosir_pesanan?nomor_pesanan=eq.${encodeURIComponent(nomorPesananTrim)}&select=id`
      );
      if ((cekBentrok || []).length > 0) {
        throw new Error("Nomor pesanan ini sudah dipakai — pakai nomor lain");
      }

      // 2. Simpan header pesanan — SELALU sebagai hutang, tidak ada cabang
      //    "bayar sekarang" sama sekali (beda dari BuatPesanan/Grosir).
      const [pesanan] = await sb("grosir_pesanan", {
        method: "POST",
        body: JSON.stringify({
          nomor_pesanan: nomorPesananTrim,
          tanggal,
          pelanggan_id: pelangganIdFinal,
          toko_id: null,
          jenis_transaksi: "reseller",
          status_bayar: "Belum Bayar",
          metode_bayar: null,
          total,
          status: "Aktif",
          catatan: catatan.trim() || null,
        }),
      });

      // 3. Simpan tiap item + potong stok — logikanya sama persis dengan
      //    BuatPesanan (Grosir).
      let produkManualList = await sb("grosir_produk_manual?select=id,kode");
      for (const r of rows) {
        let produkManualId = r.produk_manual_id || null;

        if (r.sumber_produk === "manual" && !produkManualId) {
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
              note: `Pesanan reseller ${nomorPesananTrim}`,
            }),
          });

          const rencanaRak = rencanaKurangiRak(r.sku, Number(r.qty), penempatan);
          for (const rk of rencanaRak) {
            await sb(`penempatan?id=eq.${rk.id}`, {
              method: "PATCH",
              body: JSON.stringify({ qty: Math.max(rk.qtyBaru, 0) }),
            });
            if (rk.qtyBaru <= 0) {
              const baris = (penempatan || []).find((p) => p.id === rk.id);
              if (baris) {
                await sb("rak_events", {
                  method: "POST",
                  body: JSON.stringify({ sku: r.sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null }),
                });
              }
            }
          }
        }
      }

      await reload();
      showToast(`Pesanan reseller ${nomorPesananTrim} tersimpan sebagai hutang, stok diperbarui`);
      resetForm();
      onClose();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan pesanan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Buat Pesanan Reseller" onClose={onClose}>
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] px-3 py-2 rounded-lg mb-3">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Pesanan reseller selalu tersimpan sebagai <span className="font-semibold">hutang</span> (status "Belum
        Bayar") — tidak ada opsi bayar langsung di sini. Pembayarannya dicatat belakangan lewat "Catat Pembayaran"
        di detail pesanan, atau lewat menu Penagihan Hutang tiap Kamis.
      </div>

      <Field label="Nomor Pesanan *">
        <input
          className={`${inputClass} ${nomorBentrok ? "border-red-500/60 focus:border-red-500" : ""}`}
          value={nomorPesanan}
          onChange={(e) => setNomorPesanan(e.target.value)}
          placeholder="Isi manual, mis. RSL-0001"
        />
        {nomorBentrok && (
          <div className="text-[11px] text-red-400 mt-1">Nomor ini sudah dipakai pesanan lain — pakai nomor lain.</div>
        )}
      </Field>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <div className="mb-4">
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
        <div>
          <Field label="Catatan (opsional)">
            <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Field>

          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
            <span className="text-sm text-slate-400">Total Hutang</span>
            <span className="text-lg font-bold text-red-400">{fmtRp(total)}</span>
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
              <ShoppingCart size={16} />
              {saving ? "Menyimpan…" : "Simpan sebagai Hutang"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// =========================================================
// SEMUA PESANAN RESELLER CEKOUT — daftar pesanan jenis_transaksi=
// 'reseller_cekout' saja. Sama persis polanya dengan SemuaPesananReseller
// (Toko) di atas — klik satu baris juga membuka modal "grosir-detail-
// pesanan" yang generik. Bedanya cuma label "Sisa" di sini berarti sisa
// yang belum cair/dibayar (bukan hutang yang ditagih rutin tiap Kamis).
// =========================================================
function SemuaPesananResellerCekout({ pesananCekout, pelangganGrosir, pembayaranGrosir, setModal }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const namaPelanggan = (id) => pelangganGrosir.find((p) => p.id === id)?.nama || "—";

  const filtered = (pesananCekout || []).filter((p) => {
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
        title="Reseller Cekout"
        description="Pesanan reseller yang dibayar sesuai nominal yang cair dari marketplace. Kelebihan cair otomatis jadi saldo deposit pelanggan; kekurangan tetap tercatat sebagai piutang."
        action={
          <button
            onClick={() => setModal({ type: "reseller-cekout-buat-pesanan" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Buat Pesanan
          </button>
        }
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
        <EmptyState label={q || statusFilter ? "Tidak ada pesanan yang cocok." : "Belum ada pesanan reseller cekout."} />
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
// BUAT PESANAN RESELLER CEKOUT — dipakai lewat modal "reseller-cekout-
// buat-pesanan" (ModalRouter). Sama pola dasarnya dengan BuatPesananReseller
// (Toko) di atas — nomor pesanan manual, pelanggan dari data Pelanggan
// Grosir yang sama, item lewat ItemRow/newItemRow dari Grosir.jsx — tapi
// bedanya di bagian pembayaran: ada field "Jumlah Cair dari Marketplace"
// yang langsung dipakai melunasi pesanan ini (lihat catatan panjang di atas
// bagian "RESELLER CEKOUT" untuk aturan lengkapnya).
// =========================================================
export function BuatPesananResellerCekout({
  pelangganGrosir, produkManualGrosir, skuMaster, penempatan, pesananGrosir, master, reload, showToast, onClose,
}) {
  const tokoGudang = tokoShopeeGudang(master);
  const [nomorPesanan, setNomorPesanan] = useState("");
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [pelangganId, setPelangganId] = useState("");
  const [pelangganNamaBaru, setPelangganNamaBaru] = useState("");
  const [pelangganWaBaru, setPelangganWaBaru] = useState("");
  const [pelangganAlamatBaru, setPelangganAlamatBaru] = useState("");
  const [pelangganKotaBaru, setPelangganKotaBaru] = useState("");
  const [jumlahCair, setJumlahCair] = useState("");
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const pelangganOptions = pelangganGrosir.map((p) => ({ value: p.id, label: `${p.nama} (${p.kode})` }));

  const pelangganBaruBentrok = pelangganNamaBaru.trim() && pelangganWaBaru.trim()
    ? pelangganDenganWa(pelangganWaBaru, pelangganGrosir)
    : null;

  const nomorPesananTrim = nomorPesanan.trim();
  const nomorBentrok = nomorPesananTrim
    ? (pesananGrosir || []).some((p) => (p.nomor_pesanan || "").trim().toLowerCase() === nomorPesananTrim.toLowerCase())
    : false;

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

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
  const quickAddSkuOptions = skuMaster
    .filter((s) => !s.nonaktif && s.siapGrosir)
    .map((s) => ({ value: s.sku, label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}` }));

  const qtyTerpakaiPerSku = (skuKey, kecualiKey) =>
    rows
      .filter((r) => r.sumber_produk === "sku" && r.sku === skuKey && r._key !== kecualiKey)
      .reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);
  const jumlahCairNum = Number(jumlahCair) || 0;
  const bayarKePesanan = Math.min(jumlahCairNum, total);
  const kelebihan = Math.max(0, jumlahCairNum - total);
  const statusBayarPreview = hitungStatusBayar(total, bayarKePesanan);

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
  // Kalau ada nominal cair tapi toko Shopee "Gudang" belum ada di master
  // data, tahan submit dulu — daripada uangnya kesimpan sebagai "cair" di
  // grosir_pembayaran tapi tidak kelihatan saldonya di manapun.
  const butuhTokoGudang = jumlahCairNum > 0.0001 && !tokoGudang;
  const canSubmit =
    !!nomorPesananTrim &&
    !nomorBentrok &&
    (pelangganId || pelangganNamaBaru.trim()) &&
    !pelangganBaruBentrok &&
    rows.length > 0 &&
    errors.every((e) => !e) &&
    !butuhTokoGudang &&
    !saving;

  const resetForm = () => {
    setNomorPesanan("");
    setTanggal(new Date().toISOString().slice(0, 10));
    setPelangganId("");
    setPelangganNamaBaru("");
    setPelangganWaBaru("");
    setPelangganAlamatBaru("");
    setPelangganKotaBaru("");
    setJumlahCair("");
    setCatatan("");
    setRows([]);
  };

  const submit = async () => {
    if (pelangganBaruBentrok) {
      showToast(`No. WA ini sudah terdaftar atas nama ${pelangganBaruBentrok.nama}`, "err");
      return;
    }
    if (!nomorPesananTrim) {
      showToast("Nomor pesanan wajib diisi", "err");
      return;
    }
    if (nomorBentrok) {
      showToast("Nomor pesanan ini sudah dipakai — pakai nomor lain", "err");
      return;
    }
    setSaving(true);
    try {
      // 0. Pelanggan baru (kalau ada) — pola sama persis dengan BuatPesananReseller.
      let pelangganIdFinal = pelangganId;
      if (!pelangganIdFinal && pelangganNamaBaru.trim()) {
        const pelangganTerbaru = await sb("grosir_pelanggan?select=kode");
        const kodeBaru = nextKode(pelangganTerbaru, "kode", "PLG-");
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

      // 1. Cek ulang bentrok nomor pesanan langsung ke database.
      const cekBentrok = await sb(
        `grosir_pesanan?nomor_pesanan=eq.${encodeURIComponent(nomorPesananTrim)}&select=id`
      );
      if ((cekBentrok || []).length > 0) {
        throw new Error("Nomor pesanan ini sudah dipakai — pakai nomor lain");
      }

      // 2. Simpan header pesanan — status_bayar dihitung dari nominal yang
      //    cair vs total (BUKAN selalu "Belum Bayar" seperti Reseller Toko).
      const statusBayarAwal = hitungStatusBayar(total, bayarKePesanan);
      const [pesanan] = await sb("grosir_pesanan", {
        method: "POST",
        body: JSON.stringify({
          nomor_pesanan: nomorPesananTrim,
          tanggal,
          pelanggan_id: pelangganIdFinal,
          toko_id: null,
          jenis_transaksi: "reseller_cekout",
          status_bayar: statusBayarAwal,
          metode_bayar: bayarKePesanan > 0.0001 ? "Marketplace" : null,
          total,
          status: "Aktif",
          catatan: catatan.trim() || null,
        }),
      });

      // 2b. Nominal yang cair dicatat sebagai grosir_pembayaran (bukan cuma
      //     label status_bayar) supaya sisa piutang yang dihitung ulang di
      //     manapun (badge, Dashboard, Laporan) selalu konsisten.
      if (bayarKePesanan > 0.0001) {
        await sb("grosir_pembayaran", {
          method: "POST",
          body: JSON.stringify({
            nomor_bayar: `BYR-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`,
            pesanan_id: pesanan.id,
            pelanggan_id: pelangganIdFinal,
            jumlah: bayarKePesanan,
            metode_bayar: "Marketplace",
            catatan: "Dicairkan dari marketplace saat pesanan dibuat",
          }),
        });
      }

      // 2b-2. Uang yang BENERAN cair (jumlahCairNum — total dari
      //     marketplace, bukan cuma bagian yang dipakai melunasi pesanan
      //     ini) ditampung dulu sebagai "pemasukan" di saldo toko Shopee
      //     "Gudang" (marketplace_transaksi) — BUKAN langsung ke Keuangan.
      //     Baru pindah ke Keuangan belakangan saat admin "Cairkan" saldo
      //     toko itu (menu Marketplace → Shopee → Gudang). `canSubmit`
      //     sudah menahan submit kalau toko ini belum ada & jumlahCairNum >
      //     0, jadi `tokoGudang` di sini seharusnya selalu ada.
      if (jumlahCairNum > 0.0001 && tokoGudang) {
        await sb("marketplace_transaksi", {
          method: "POST",
          body: JSON.stringify({
            platform: "shopee",
            toko: tokoGudang.kode,
            tipe: "pemasukan",
            tanggal,
            jumlah: jumlahCairNum,
            keterangan: `Cair pesanan reseller cekout ${nomorPesananTrim}`,
          }),
        });
      }

      // 2c. Kelebihan cair (kalau ada) langsung jadi saldo deposit pelanggan.
      if (kelebihan > 0.0001) {
        await sb("grosir_deposit", {
          method: "POST",
          body: JSON.stringify({
            nomor_deposit: `DEP-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`,
            pelanggan_id: pelangganIdFinal,
            jumlah: kelebihan,
            keterangan: `Kelebihan pencairan marketplace pesanan ${nomorPesananTrim}`,
            pesanan_id_terkait: pesanan.id,
          }),
        });
      }

      // 3. Simpan tiap item + potong stok — logikanya sama persis dengan
      //    BuatPesananReseller/BuatPesanan (Grosir).
      let produkManualList = await sb("grosir_produk_manual?select=id,kode");
      for (const r of rows) {
        let produkManualId = r.produk_manual_id || null;

        if (r.sumber_produk === "manual" && !produkManualId) {
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
              note: `Pesanan reseller cekout ${nomorPesananTrim}`,
            }),
          });

          const rencanaRak = rencanaKurangiRak(r.sku, Number(r.qty), penempatan);
          for (const rk of rencanaRak) {
            await sb(`penempatan?id=eq.${rk.id}`, {
              method: "PATCH",
              body: JSON.stringify({ qty: Math.max(rk.qtyBaru, 0) }),
            });
            if (rk.qtyBaru <= 0) {
              const baris = (penempatan || []).find((p) => p.id === rk.id);
              if (baris) {
                await sb("rak_events", {
                  method: "POST",
                  body: JSON.stringify({ sku: r.sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null }),
                });
              }
            }
          }
        }
      }

      await reload();
      showToast(
        kelebihan > 0.0001
          ? `Pesanan cekout ${nomorPesananTrim} lunas, kelebihan ${fmtRp(kelebihan)} masuk deposit pelanggan`
          : `Pesanan cekout ${nomorPesananTrim} tersimpan (${statusBayarAwal})`
      );
      resetForm();
      onClose();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan pesanan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Buat Pesanan Reseller Cekout" onClose={onClose}>
      <div className="flex items-start gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] px-3 py-2 rounded-lg mb-3">
        <Wallet size={13} className="mt-0.5 shrink-0" />
        Isi nominal yang benar-benar <span className="font-semibold">cair dari marketplace</span> untuk pesanan
        ini — otomatis ditampung dulu sebagai saldo di toko Shopee <span className="font-semibold">"Gudang"</span>
        {" "}(Marketplace → Shopee), bukan langsung ke Keuangan. Kalau cair lebih besar dari total, kelebihannya
        otomatis jadi <span className="font-semibold">saldo deposit</span> pelanggan. Kalau kurang (atau belum
        cair sama sekali), sisanya tetap tercatat sebagai piutang, dilunasi belakangan lewat "Catat Pembayaran"
        di detail pesanan.
      </div>

      <Field label="Nomor Pesanan *">
        <input
          className={`${inputClass} ${nomorBentrok ? "border-red-500/60 focus:border-red-500" : ""}`}
          value={nomorPesanan}
          onChange={(e) => setNomorPesanan(e.target.value)}
          placeholder="Isi manual, mis. RCO-0001"
        />
        {nomorBentrok && (
          <div className="text-[11px] text-red-400 mt-1">Nomor ini sudah dipakai pesanan lain — pakai nomor lain.</div>
        )}
      </Field>

      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>

      <div className="mb-4">
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
        <div>
          <Field label="Jumlah Cair dari Marketplace">
            <InputRupiah value={jumlahCair} onChange={setJumlahCair} placeholder="0" />
          </Field>

          {butuhTokoGudang && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] px-3 py-2 rounded-lg mb-3">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Toko Shopee "Gudang" belum ada di master data — nominal cair ini tidak bisa ditampung ke saldo
              marketplace. Buat dulu lewat menu Marketplace → Shopee → Tambah Toko (nama persis "Gudang").
            </div>
          )}

          <Field label="Catatan (opsional)">
            <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Field>

          <div className="space-y-1.5 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Total Pesanan</span>
              <span className="text-sm font-semibold text-slate-200">{fmtRp(total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Dibayar dari Pencairan</span>
              <span className="text-sm font-semibold text-emerald-400">{fmtRp(bayarKePesanan)}</span>
            </div>
            {kelebihan > 0.0001 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Kelebihan → Deposit Pelanggan</span>
                <span className="text-sm font-semibold text-sky-400">{fmtRp(kelebihan)}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Sisa Piutang</span>
                <span className="text-sm font-semibold text-red-400">{fmtRp(Math.max(0, total - bayarKePesanan))}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="text-xs text-slate-500">Status Bayar</span>
              <Badge color={statusBayarPreview === "Lunas" ? "emerald" : statusBayarPreview === "Sebagian" ? "sky" : "amber"}>
                {statusBayarPreview}
              </Badge>
            </div>
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
              <ShoppingCart size={16} />
              {saving ? "Menyimpan…" : "Simpan Pesanan"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}