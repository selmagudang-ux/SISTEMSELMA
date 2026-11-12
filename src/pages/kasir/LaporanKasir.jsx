import { useMemo, useState } from "react";
import { Wallet, Landmark, TrendingUp, Receipt, Package, Undo2, Ban, Download, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Search, PiggyBank, Percent, Boxes } from "lucide-react";
import { StatCard, EmptyState, Badge, InputTanggal, formatTanggalID } from "../../components/ui";
import { fmtRp } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { bisa } from "../../lib/constants";
import { useKeuanganRentang } from "../../lib/useKeuanganRentang";
import { downloadXlsx } from "../../lib/exportData";
import { useRekapKasir, useTanggalMulaiKasir, hariIniWib, tambahHari, awalBulanWib, akhirBulanWib, barangTerlaris, hitungSinkronKeuangan } from "./kasirLaporan";

// =========================================================
// REKAP KASIR (Fase 6) — halaman utama Penjualan > Toko Offline > Transaksi Offline.
// Menggantikan input harian manual: angkanya otomatis dari transaksi kasir (/kasir).
//   Tab: Harian · Per Kasir · Per Produk · Barang Terlaris
// Barang hanya ditarik untuk rentang <= BATAS_HARI_BARANG hari (hemat egress).
// =========================================================

const BATAS_HARI_BARANG = 62;
const BATAS_BARIS = 300;

const fmtPersen = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
const warnaLaba = (v) => (v < 0 ? "text-red-400" : "text-emerald-400");

const selisihHari = (a, b) => Math.round((new Date(`${b}T12:00:00+07:00`) - new Date(`${a}T12:00:00+07:00`)) / 86400000) + 1;

function presetRentang() {
  const hari = hariIniWib();
  const awal = awalBulanWib(hari);
  const bulanLalu = awalBulanWib(tambahHari(awal, -1));
  return [
    ["hari", "Hari ini", hari, hari],
    ["kemarin", "Kemarin", tambahHari(hari, -1), tambahHari(hari, -1)],
    ["7hari", "7 hari", tambahHari(hari, -6), hari],
    ["bulan", "Bulan ini", awal, hari],
    ["bulanlalu", "Bulan lalu", bulanLalu, akhirBulanWib(bulanLalu)],
  ];
}

const TAB = [
  ["harian", "Harian"],
  ["kasir", "Per Kasir"],
  ["produk", "Per Produk"],
  ["terlaris", "Barang Terlaris"],
];

const thClass = "px-4 py-2.5 font-medium";
const kartu = "rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto";

function Pil({ aktif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3.5 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
        aktif ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-md-outline-variant text-md-on-surface-variant hover:border-amber-500/60"
      }`}
    >
      {children}
    </button>
  );
}

function Tabel({ kolom, baris, kosong, batas = BATAS_BARIS }) {
  if (baris.length === 0) return <EmptyState label={kosong} />;
  const tampil = baris.slice(0, batas);
  return (
    <div className={kartu}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
            {kolom.map((k) => (
              <th key={k.label} className={`${thClass} ${k.kanan ? "text-right" : ""}`}>
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tampil.map((r, i) => (
            <tr key={r._kunci ?? i} className="border-b border-md-outline-variant last:border-0">
              {kolom.map((k) => (
                <td key={k.label} className={`px-4 py-2.5 ${k.kanan ? "text-right" : ""} ${k.tebal ? "font-medium" : ""} ${k.redup ? "text-md-on-surface-variant" : ""} ${k.nowrap ? "whitespace-nowrap" : ""}`}>
                  {k.sel(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {baris.length > batas && (
        <div className="px-4 py-2 text-[11px] text-md-on-surface-variant border-t border-md-outline-variant">
          Menampilkan {batas} dari {baris.length} baris — persempit rentang tanggal atau unduh Excel untuk data lengkap.
        </div>
      )}
    </div>
  );
}

export default function LaporanKasir({ master = {}, keuanganTransaksi = [] }) {
  const session = getSession();
  const presets = useMemo(presetRentang, []);
  const [preset, setPreset] = useState("hari");
  const [dari, setDari] = useState(presets[0][2]);
  const [sampai, setSampai] = useState(presets[0][3]);
  const [tab, setTab] = useState("harian");
  const [kelompokKasir, setKelompokKasir] = useState("total"); // total | harian
  const [kelompokProduk, setKelompokProduk] = useState("total");
  const [cari, setCari] = useState("");
  const [urutTerlaris, setUrutTerlaris] = useState("qty");
  const [versi, setVersi] = useState(0);

  const rentangValid = dari && sampai && dari <= sampai;
  const jumlahHari = rentangValid ? selisihHari(dari, sampai) : 0;
  const barangBoleh = jumlahHari <= BATAS_HARI_BARANG;
  // Profit & HPP hanya untuk role yang boleh melihat semua kasir (kasir biasa tidak melihat modal), dan hanya kalau barang ikut ditarik.
  const bolehLaba = bisa(session?.role, "kasir.lihat_semua") && barangBoleh;

  const { memuat, error, data } = useRekapKasir({ session, dari: rentangValid ? dari : "", sampai, denganItem: barangBoleh, denganShift: true, versi });
  const mulai = useTanggalMulaiKasir(true);
  const { data: keuangan } = useKeuanganRentang(keuanganTransaksi, dari);

  const pilihPreset = (kunci, d, s) => {
    setPreset(kunci);
    setDari(d);
    setSampai(s);
  };

  const sinkron = useMemo(() => {
    if (!data || !mulai.tanggal || !rentangValid) return null;
    const dariCek = dari < mulai.tanggal ? mulai.tanggal : dari;
    if (dariCek > sampai) return null;
    // bandingkan hanya bagian rentang yang sama; kalau rentang dipotong, hitung ulang bersih kasir untuk bagian itu
    const bersihKasir = data.harian.filter((h) => h.tanggal >= dariCek && h.tanggal <= sampai).reduce((a, h) => a + h.bersih, 0);
    return { ...hitungSinkronKeuangan({ keuangan, master, dari: dariCek, sampai, bersihKasir }), dariCek };
  }, [data, keuangan, master, mulai.tanggal, dari, sampai, rentangValid]);

  const r = data?.ringkas;
  const produkTampil = useMemo(() => {
    if (!data) return [];
    const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
    const sumber = kelompokProduk === "harian" ? data.perProdukHarian : data.perProduk;
    const hasil = kata.length ? sumber.filter((p) => kata.every((k) => `${p.sku} ${p.kode || ""} ${p.nama}`.toLowerCase().includes(k))) : sumber;
    return hasil.map((p, i) => ({ ...p, _kunci: `${p.tanggal || ""}|${p.sku || p.nama}|${i}` }));
  }, [data, cari, kelompokProduk]);
  const urutAman = urutTerlaris === "laba" && !bolehLaba ? "qty" : urutTerlaris;
  const terlaris = useMemo(() => barangTerlaris(data?.perProduk, { urut: urutAman, batas: 10 }), [data, urutAman]);
  const nilaiUrut = (p) => (urutAman === "laba" ? Math.max(p.laba, 0) : urutAman === "nilai" ? p.nilai : p.qty);
  const maksTerlaris = terlaris.length ? Math.max(...terlaris.map(nilaiUrut), 1) : 1;

  const unduh = () => {
    if (!data) return;
    const kolomUmum = [
      { key: "jumlah", label: "Transaksi" },
      { key: "qty", label: "Barang" },
      { key: "kotor", label: "Omzet" },
      { key: "retur", label: "Retur" },
      { key: "bersih", label: "Omzet Bersih" },
      { key: "cash", label: "Cash" },
      { key: "cashless", label: "Cashless" },
      { key: "voidCount", label: "Void" },
    ];
    const kolomProduk = [
      { key: "sku", label: "SKU" },
      { key: "nama", label: "Nama" },
      { key: "qty", label: "Qty" },
      { key: "nilai", label: "Nilai" },
      { key: "diskon", label: "Diskon Item" },
      { key: "jumlahTrx", label: "Jumlah Transaksi" },
    ];
    if (bolehLaba) {
      kolomUmum.push({ key: "hpp", label: "HPP Terjual" }, { key: "laba", label: "Profit" }, { key: "margin", label: "Margin %" });
      kolomProduk.push({ key: "hpp", label: "HPP" }, { key: "laba", label: "Profit" }, { key: "margin", label: "Margin %" });
    }
    const bulatkan = (rows) => rows.map((x) => ({ ...x, margin: typeof x.margin === "number" ? Math.round(x.margin * 10) / 10 : "" }));
    const sheets = [
      { name: "Harian", columns: [{ key: "tanggal", label: "Tanggal" }, ...kolomUmum], rows: bulatkan(data.harian) },
      { name: "Per Kasir", columns: [{ key: "nama", label: "Kasir" }, ...kolomUmum, { key: "jumlahShift", label: "Shift" }, { key: "selisihKas", label: "Selisih Kas" }], rows: bulatkan(data.perKasir) },
      { name: "Per Kasir Harian", columns: [{ key: "tanggal", label: "Tanggal" }, { key: "nama", label: "Kasir" }, ...kolomUmum], rows: bulatkan(data.perKasirHarian) },
    ];
    if (barangBoleh) {
      sheets.push({ name: "Per Produk", columns: kolomProduk, rows: bulatkan(data.perProduk) });
      sheets.push({ name: "Per Produk Harian", columns: [{ key: "tanggal", label: "Tanggal" }, ...kolomProduk], rows: bulatkan(data.perProdukHarian) });
    }
    downloadXlsx(`rekap-kasir_${dari}_${sampai}.xlsx`, sheets);
  };

  const kolomUmum = (judulPertama, selPertama, lebar) => [
    { label: judulPertama, sel: selPertama, nowrap: true, tebal: lebar },
    { label: "Transaksi", sel: (x) => x.jumlah, kanan: true },
    { label: "Barang", sel: (x) => x.qty, kanan: true },
    { label: "Cash", sel: (x) => fmtRp(x.cash), kanan: true, redup: true },
    { label: "Cashless", sel: (x) => fmtRp(x.cashless), kanan: true, redup: true },
    { label: "Retur", sel: (x) => (x.retur ? fmtRp(x.retur) : "—"), kanan: true, redup: true },
    { label: "Omzet Bersih", sel: (x) => fmtRp(x.bersih), kanan: true, tebal: true },
    ...(bolehLaba
      ? [
          { label: "Profit", sel: (x) => <span className={warnaLaba(x.laba)}>{fmtRp(x.laba)}</span>, kanan: true, tebal: true },
          { label: "Margin", sel: (x) => fmtPersen(x.margin), kanan: true, redup: true },
        ]
      : []),
  ];

  return (
    <div>
      {/* filter */}
      <div className="rounded-md-lg bg-md-container-low p-4 shadow-elevation-1 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {presets.map(([k, label, d, s]) => (
            <Pil key={k} aktif={preset === k} onClick={() => pilihPreset(k, d, s)}>
              {label}
            </Pil>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <div className="text-xs text-md-on-surface-variant mb-1">Dari</div>
            <InputTanggal
              value={dari}
              onChange={(v) => {
                setPreset("");
                setDari(v);
              }}
            />
          </div>
          <div className="w-44">
            <div className="text-xs text-md-on-surface-variant mb-1">Sampai</div>
            <InputTanggal
              value={sampai}
              onChange={(v) => {
                setPreset("");
                setSampai(v);
              }}
            />
          </div>
          <button type="button" onClick={() => setVersi((v) => v + 1)} className="flex items-center gap-1.5 text-xs font-medium border border-md-outline-variant rounded-full px-3.5 py-2.5 hover:bg-md-surface-variant">
            <RefreshCw size={13} className={memuat ? "animate-spin" : ""} /> Muat ulang
          </button>
          <button type="button" onClick={unduh} disabled={!data} className="flex items-center gap-1.5 text-xs font-medium border border-md-outline-variant rounded-full px-3.5 py-2.5 hover:bg-md-surface-variant disabled:opacity-40">
            <Download size={13} /> Unduh Excel
          </button>
        </div>
        {!rentangValid && <div className="text-xs text-amber-400 mt-2">Tanggal "Dari" tidak boleh lebih besar dari "Sampai".</div>}
      </div>

      {error && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md-lg px-4 py-3">{error}</div>}
      {memuat && !data && (
        <div className="flex items-center gap-2 text-sm text-md-on-surface-variant py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Memuat data kasir…
        </div>
      )}

      {data && r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <StatCard label="Omzet Bersih" value={fmtRp(r.bersih)} icon={TrendingUp} accent="text-md-primary" />
            <StatCard label="Transaksi" value={r.jumlah} icon={Receipt} />
            <StatCard label="Barang Terjual" value={r.qty} icon={Package} />
            <StatCard label="Rata-rata / Transaksi" value={fmtRp(r.rata2)} icon={Wallet} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Cash" value={fmtRp(r.cash)} icon={Wallet} iconColor="text-emerald-400" />
            <StatCard label="Cashless (Transfer / QRIS)" value={fmtRp(r.cashless)} icon={Landmark} iconColor="text-sky-400" />
            <StatCard label={`Retur (${r.returCount} transaksi)`} value={fmtRp(r.retur)} icon={Undo2} iconColor="text-amber-400" />
            <StatCard label="Void" value={r.voidCount} icon={Ban} iconColor="text-red-400" />
          </div>
          {bolehLaba && r.laba !== null && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <StatCard label="Profit (Laba Kotor)" value={fmtRp(r.laba)} icon={PiggyBank} accent={warnaLaba(r.laba)} />
                <StatCard label="Margin" value={fmtPersen(r.margin)} icon={Percent} iconColor="text-emerald-400" />
                <StatCard label="HPP Barang Terjual" value={fmtRp(r.hpp)} icon={Boxes} iconColor="text-sky-400" />
                <StatCard label="Barang Tanpa HPP" value={r.tanpaHpp} icon={AlertTriangle} iconColor={r.tanpaHpp ? "text-amber-400" : "text-md-on-surface-variant"} />
              </div>
              {r.tanpaHpp > 0 && (
                <div className="rounded-md-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-5 text-xs text-md-on-surface-variant flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {r.tanpaHpp} barang terjual belum punya HPP (kosong / 0) di Barang Toko, jadi profitnya dihitung terlalu besar. Isi HPP-nya dulu supaya angka profit akurat — cek di tab Per Produk (baris bertanda "HPP kosong").
                  </span>
                </div>
              )}
              {r.tanpaHpp === 0 && <div className="mb-2" />}
            </>
          )}

          {sinkron && (
            <div
              className={`rounded-md-lg border px-4 py-3 mb-5 text-sm flex items-start gap-3 ${
                sinkron.selisih === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              {sinkron.selisih === 0 ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <div className="font-medium text-md-on-surface">
                  {sinkron.selisih === 0 ? "Keuangan sinkron dengan kasir" : `Selisih ${fmtRp(Math.abs(sinkron.selisih))} antara kasir dan Keuangan`}
                </div>
                <div className="text-xs text-md-on-surface-variant mt-0.5">
                  Kasir (bersih) {fmtRp(sinkron.bersihKasir)} · Keuangan {fmtRp(sinkron.masuk)} masuk − {fmtRp(sinkron.keluar)} retur/void = {fmtRp(sinkron.bersihKeuangan)}
                  {sinkron.dariCek !== dari && ` · dibandingkan mulai ${formatTanggalID(sinkron.dariCek)} (hari pertama kasir dipakai)`}
                </div>
                {!sinkron.kategoriMasukAda && (
                  <div className="text-xs text-amber-400 mt-1">Kategori pemasukan OFFLINE CASH / OFFLINE TRANSFER / Offline Qris by BCA tidak ditemukan di Keuangan &gt; Rekening &amp; Kategori.</div>
                )}
                {sinkron.selisih !== 0 && (
                  <div className="text-xs text-md-on-surface-variant mt-1">
                    Penyebab umum: retur/void dicatat di Keuangan pada tanggal berbeda dari transaksi aslinya, ada input harian manual Toko Offline di rentang yang sama (ikut terhitung di Keuangan, tidak di kasir), atau baris Keuangan diedit/dihapus manual. Coba perlebar rentang ke akhir bulan.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {TAB.map(([k, label]) => (
              <Pil key={k} aktif={tab === k} onClick={() => setTab(k)}>
                {label}
              </Pil>
            ))}
          </div>

          {tab === "harian" && (
            <Tabel
              kosong="Belum ada transaksi kasir di rentang ini."
              baris={data.harian.map((h) => ({ ...h, _kunci: h.tanggal }))}
              kolom={[
                ...kolomUmum("Tanggal", (x) => formatTanggalID(x.tanggal)),
                { label: "Void", sel: (x) => (x.voidCount ? <Badge color="red">{x.voidCount}</Badge> : "—"), kanan: true },
              ]}
            />
          )}

          {tab === "kasir" && (
            <>
              <div className="flex gap-2 mb-3">
                <Pil aktif={kelompokKasir === "total"} onClick={() => setKelompokKasir("total")}>
                  Total periode
                </Pil>
                <Pil aktif={kelompokKasir === "harian"} onClick={() => setKelompokKasir("harian")}>
                  Per hari
                </Pil>
              </div>
              {kelompokKasir === "total" ? (
                <Tabel
                  kosong="Belum ada transaksi kasir di rentang ini."
                  baris={data.perKasir.map((k) => ({ ...k, _kunci: k.kasirId }))}
                  kolom={[
                    ...kolomUmum("Kasir", (x) => x.nama, true),
                    { label: "Shift", sel: (x) => x.jumlahShift, kanan: true, redup: true },
                    {
                      label: "Selisih Kas",
                      sel: (x) => (x.jumlahShift ? <span className={x.selisihKas === 0 ? "" : x.selisihKas < 0 ? "text-red-400" : "text-amber-400"}>{fmtRp(x.selisihKas)}</span> : "—"),
                      kanan: true,
                    },
                  ]}
                />
              ) : (
                <Tabel
                  kosong="Belum ada transaksi kasir di rentang ini."
                  baris={data.perKasirHarian.map((k) => ({ ...k, _kunci: `${k.tanggal}|${k.kasirId}` }))}
                  kolom={[{ label: "Tanggal", sel: (x) => formatTanggalID(x.tanggal), nowrap: true }, ...kolomUmum("Kasir", (x) => x.nama, true)]}
                />
              )}
            </>
          )}

          {(tab === "produk" || tab === "terlaris") && !barangBoleh && (
            <EmptyState label={`Rekap barang hanya tersedia untuk rentang maksimal ${BATAS_HARI_BARANG} hari (sekarang ${jumlahHari} hari). Persempit tanggalnya.`} />
          )}

          {tab === "produk" && barangBoleh && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Pil aktif={kelompokProduk === "total"} onClick={() => setKelompokProduk("total")}>
                  Total periode
                </Pil>
                <Pil aktif={kelompokProduk === "harian"} onClick={() => setKelompokProduk("harian")}>
                  Per hari
                </Pil>
                <div className="relative ml-auto w-full sm:w-64">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
                  <input
                    value={cari}
                    onChange={(e) => setCari(e.target.value)}
                    placeholder="Cari SKU / nama barang"
                    className="w-full bg-md-container-highest border border-md-outline-variant rounded-full outline-none focus:border-md-primary pl-8 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
              <Tabel
                kosong={cari ? "Tidak ada barang yang cocok." : "Belum ada barang terjual di rentang ini."}
                baris={produkTampil}
                kolom={[
                  ...(kelompokProduk === "harian" ? [{ label: "Tanggal", sel: (x) => formatTanggalID(x.tanggal), nowrap: true }] : []),
                  { label: "SKU", sel: (x) => x.sku || "—", nowrap: true, tebal: true },
                  { label: "Nama", sel: (x) => x.nama, redup: true },
                  { label: "Qty", sel: (x) => x.qty, kanan: true },
                  { label: "Diskon Item", sel: (x) => (x.diskon ? fmtRp(x.diskon) : "—"), kanan: true, redup: true },
                  { label: "Nilai", sel: (x) => fmtRp(x.nilai), kanan: true, tebal: true },
                  ...(bolehLaba
                    ? [
                        { label: "HPP", sel: (x) => (x.tanpaHpp ? <Badge color="amber">HPP kosong</Badge> : fmtRp(x.hpp)), kanan: true, redup: true },
                        { label: "Profit", sel: (x) => <span className={warnaLaba(x.laba)}>{fmtRp(x.laba)}</span>, kanan: true, tebal: true },
                        { label: "Margin", sel: (x) => fmtPersen(x.margin), kanan: true, redup: true },
                      ]
                    : []),
                ]}
              />
            </>
          )}

          {tab === "terlaris" && barangBoleh && (
            <>
              <div className="flex gap-2 mb-3">
                <Pil aktif={urutTerlaris === "qty"} onClick={() => setUrutTerlaris("qty")}>
                  Terbanyak terjual
                </Pil>
                <Pil aktif={urutTerlaris === "nilai"} onClick={() => setUrutTerlaris("nilai")}>
                  Nilai penjualan tertinggi
                </Pil>
                {bolehLaba && (
                  <Pil aktif={urutTerlaris === "laba"} onClick={() => setUrutTerlaris("laba")}>
                    Profit tertinggi
                  </Pil>
                )}
              </div>
              {terlaris.length === 0 ? (
                <EmptyState label="Belum ada barang terjual di rentang ini." />
              ) : (
                <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 divide-y divide-md-outline-variant">
                  {terlaris.map((p, i) => {
                    const nilaiBar = nilaiUrut(p);
                    return (
                      <div key={`${p.sku}|${p.nama}`} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-xs text-md-on-surface-variant mr-2">#{i + 1}</span>
                            <span className="text-sm font-medium">{p.sku || p.nama}</span>
                            {p.sku && <span className="text-xs text-md-on-surface-variant ml-2">{p.nama}</span>}
                          </div>
                          <div className="text-sm text-right shrink-0">
                            <span className="font-medium">{p.qty} pcs</span>
                            <span className="text-md-on-surface-variant"> · {fmtRp(p.nilai)}</span>
                            {bolehLaba && <span className={`ml-1 ${warnaLaba(p.laba)}`}> · profit {fmtRp(p.laba)}</span>}
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-md-container-highest overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(3, (nilaiBar / maksTerlaris) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="text-[11px] text-md-on-surface-variant mt-4 leading-relaxed">
            Transaksi void tidak dihitung. Retur dikurangkan di tanggal transaksi aslinya, dan tidak dipecah per metode bayar (kolom Cash/Cashless = uang masuk sebelum retur). Nilai barang dihitung sebelum diskon level transaksi, jadi total
            kolom Nilai bisa sedikit di atas Omzet Bersih. Tanggal mengikuti hari kalender WIB.
            {bolehLaba &&
              " Profit = omzet bersih − HPP barang terjual (setelah retur). HPP diambil dari Barang Toko saat laporan dibuka, jadi kalau HPP diubah, profit transaksi lama ikut berubah. Profit per produk dihitung dari Nilai − HPP (sebelum diskon level transaksi)."}
          </div>
        </>
      )}
    </div>
  );
}