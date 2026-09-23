import { useState } from "react";
import { Home, Plus, Trash2, Wallet, Landmark, TrendingUp, AlertTriangle } from "lucide-react";
import {
  PageHeader, EmptyState, StatCard, Field, InputTanggal, InputRupiah,
  Badge, formatTanggalID, suggestKode,
} from "../components/ui";
import { sb, fmtRp } from "../lib/api";
import {
  REKENING_TOKO_OFFLINE_CASH,
  REKENING_TOKO_OFFLINE_CASHLESS,
  KODE_REKENING_TOKO_OFFLINE_CASHLESS,
} from "../lib/constants";

// =========================================================
// TOKO OFFLINE — Input harian penjualan toko offline.
// SENGAJA TIDAK bikin tabel baru — tiap input langsung dicatat sebagai 1-2
// baris transaksi "masuk" di keuangan_transaksi yang sudah ada (satu baris
// untuk Cash, satu lagi untuk Cashless).
//
// Rekening penampung SELALU tetap (tidak bisa dipilih manual) — sama pola
// dengan REKENING_PEMBAYARAN_SUPPLIER / REKENING_ONGKIR_BARANG_DATANG di
// lib/constants.js:
//   Cash     -> Petty Cash               (REKENING_TOKO_OFFLINE_CASH)
//   Cashless -> BCA a/n Teh Oca, "BCA2"  (REKENING_TOKO_OFFLINE_CASHLESS)
// Dicocokkan by label (case-insensitive) ke master data "rekening" yang SAMA
// dengan yang dipakai Keuangan > Rekening & Kategori — jadi otomatis sinkron.
// Kalau rekeningnya belum ada di master, dibuatkan otomatis sekali saat
// Simpan — lihat resolveRekeningTetap() di bawah. Supaya baris-baris ini bisa
// dikenali balik sebagai "input Toko Offline" (buat Riwayat & StatCard di
// halaman ini), keterangan-nya diawali penanda tetap "Toko Offline ·" —
// lihat isEntriTokoOffline().
// =========================================================

const PENANDA = "Toko Offline ·";

// Kategori pemasukan untuk Cash di halaman ini FIXED (tidak bisa dipilih
// manual) — supaya tidak pernah salah kategori. Untuk Cashless, kategorinya
// dipilih user dari 2 metode tetap (Transfer / QRIS) — dua-duanya sama-sama
// masuk ke rekening penampung Cashless yang sama (BCA2), cuma beda kategori
// pencatatan di Keuangan. Sama seperti kategori Cash, kategori-kategori ini
// TIDAK dibuat otomatis — harus didaftarkan dulu lewat Keuangan > Rekening &
// Kategori dengan nama persis di bawah ini:
//   Cash              -> kategori berlabel "OFFLINE CASH"
//   Cashless (Transfer) -> kategori berlabel "OFFLINE TRANSFER"
//   Cashless (QRIS)      -> kategori berlabel "OFFLINE QRIS"
const LABEL_KATEGORI_CASH = "OFFLINE CASH";
const METODE_CASHLESS = [
  { value: "Transfer", labelKategori: "OFFLINE TRANSFER" },
  { value: "QRIS", labelKategori: "Offline Qris by BCA" },
];

function normalisasiLabel(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "").trim();
}

function cariKategoriByLabel(daftarKategori, label) {
  const target = normalisasiLabel(label);
  return daftarKategori.find((k) => normalisasiLabel(k.label) === target) || null;
}

function buatKeterangan(jenis, catatan) {
  const inti = `${PENANDA} ${jenis}`;
  return catatan?.trim() ? `${inti} — ${catatan.trim()}` : inti;
}

// Pisahkan lagi jenis (Cash/Cashless) & catatan dari keterangan yang sudah
// dibentuk buatKeterangan() di atas, buat ditampilkan di tabel Riwayat.
// Entri lama yang masih berlabel "Transfer" (sebelum di-rename ke
// "Cashless") tetap kebaca apa adanya di sini — teksnya saja, data lama
// TIDAK diubah — dan tetap terhitung di StatCard lewat jumlahByJenis() di
// bawah (dianggap "bukan Cash", sama seperti "Cashless").
function uraiKeterangan(keterangan) {
  const sisa = (keterangan || "").slice(PENANDA.length).trim(); // "Cash — catatan" / "Cashless"
  const [jenisPart, ...catatanPart] = sisa.split(" — ");
  return { jenis: jenisPart.trim(), catatan: catatanPart.join(" — ").trim() };
}

// Diexport supaya Dashboard (tab "Dashboard Penjualan") bisa ikut menghitung
// omset Toko Offline dari keuangan_transaksi dengan kriteria yang SAMA persis
// (satu sumber kebenaran, tidak dobel logic).
export function isEntriTokoOffline(t) {
  return t.tipe === "masuk" && typeof t.keterangan === "string" && t.keterangan.startsWith(PENANDA);
}

function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}
function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function TokoOffline({ master = {}, keuanganTransaksi = [], reload, showToast }) {
  const todayIso = hariIniIso();
  const [tanggal, setTanggal] = useState(todayIso);
  const [cash, setCash] = useState("");
  const [cashless, setCashless] = useState("");
  const [metodeCashless, setMetodeCashless] = useState(METODE_CASHLESS[0].value);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);

  const daftarRekening = master?.rekening || [];
  const daftarKategori = master?.kategori_masuk || [];

  // Kategori pemasukan FIXED, dicocokkan persis by nama — lihat catatan di
  // atas file (cariKategoriByLabel). Cash tidak ada pilihan; Cashless
  // kategorinya mengikuti metode (Transfer/QRIS) yang dipilih di bawah.
  const kategoriCashObj = cariKategoriByLabel(daftarKategori, LABEL_KATEGORI_CASH);
  const labelKategoriCashless = METODE_CASHLESS.find((m) => m.value === metodeCashless)?.labelKategori || "";
  const kategoriCashlessObj = cariKategoriByLabel(daftarKategori, labelKategoriCashless);
  const kategoriCash = kategoriCashObj?.kode || "";
  const kategoriCashless = kategoriCashlessObj?.kode || "";

  // Rekening penampung FIXED juga — dicocokkan by label sama seperti
  // kategori di atas. Beda dengan kategori, kalau belum ada di master, TIDAK
  // perlu warning "belum ada" — akan dibuatkan otomatis saat Simpan (lihat
  // resolveRekeningTetap di bawah), sama pola dengan
  // REKENING_PEMBAYARAN_SUPPLIER / REKENING_ONGKIR_BARANG_DATANG.
  const rekeningCashObj = daftarRekening.find(
    (r) => normalisasiLabel(r.label) === normalisasiLabel(REKENING_TOKO_OFFLINE_CASH)
  );
  const rekeningCashlessObj = daftarRekening.find(
    (r) => normalisasiLabel(r.label) === normalisasiLabel(REKENING_TOKO_OFFLINE_CASHLESS)
  );

  const cashNum = Number(cash) || 0;
  const cashlessNum = Number(cashless) || 0;
  const totalPenjualan = cashNum + cashlessNum;

  const canSubmit =
    !saving &&
    tanggal &&
    totalPenjualan > 0 &&
    (cashNum <= 0 || kategoriCash) &&
    (cashlessNum <= 0 || kategoriCashless);

  const resetSetelahSimpan = () => {
    setCash("");
    setCashless("");
    setCatatan("");
    // Tanggal sengaja TIDAK direset — input harian sering diisi berkali-kali
    // di hari & pola yang sama (per shift/kasir), jadi biar bisa langsung
    // isi nominal berikutnya tanpa pilih ulang dari awal.
  };

  // Cari rekening di master by label (case-insensitive); kalau belum ada,
  // buatkan sekali di master_data (tipe "rekening") dengan kode yang
  // ditentukan (kodeTetap, kalau ada) — pola sama seperti
  // cariAtauBuatMasterTetap di ModalRouter.jsx.
  const resolveRekeningTetap = async (labelTetap, kodeTetap) => {
    const ada = daftarRekening.find((r) => normalisasiLabel(r.label) === normalisasiLabel(labelTetap));
    if (ada) return ada.kode;
    let kode = kodeTetap || suggestKode(labelTetap);
    if (daftarRekening.some((r) => r.kode === kode)) kode = `${kode}-2`;
    await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening", kode, label: labelTetap }) });
    return kode;
  };

  const simpan = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const rows = [];
      if (cashNum > 0) {
        const rekeningCash = await resolveRekeningTetap(REKENING_TOKO_OFFLINE_CASH);
        rows.push({
          tanggal, tipe: "masuk", rekening: rekeningCash, kategori: kategoriCash,
          jumlah: cashNum, keterangan: buatKeterangan("Cash", catatan),
        });
      }
      if (cashlessNum > 0) {
        const rekeningCashless = await resolveRekeningTetap(REKENING_TOKO_OFFLINE_CASHLESS, KODE_REKENING_TOKO_OFFLINE_CASHLESS);
        rows.push({
          tanggal, tipe: "masuk", rekening: rekeningCashless, kategori: kategoriCashless,
          jumlah: cashlessNum, keterangan: buatKeterangan(`Cashless (${metodeCashless})`, catatan),
        });
      }
      // Satu-satu (bukan bulk insert), pola sama seperti form Transaksi Keuangan —
      // kalau salah satu gagal, yang lain yang sudah berhasil tidak ikut batal.
      for (const row of rows) {
        await sb("keuangan_transaksi", { method: "POST", body: JSON.stringify(row) });
      }
      await reload?.();
      showToast?.("Input harian toko offline disimpan");
      resetSetelahSimpan();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(false);
    }
  };

  const hapus = async (t) => {
    if (!window.confirm("Hapus baris ini dari Keuangan? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await sb(`keuangan_transaksi?id=eq.${t.id}`, { method: "DELETE" });
      await reload?.();
      showToast?.("Baris dihapus");
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
    }
  };

  const semuaEntri = (keuanganTransaksi || []).filter(isEntriTokoOffline);
  const entriBulanIni = semuaEntri.filter((t) => t.tanggal >= awalBulanIni());
  const entriHariIni = semuaEntri.filter((t) => t.tanggal === todayIso);
  // "Cashless" mencakup entri lama yang masih berlabel "Transfer" (sebelum
  // rename) — dihitung sebagai "bukan Cash", bukan dicocokkan literal ke satu
  // nama saja, supaya data lama & baru tetap terjumlah sejajar di StatCard.
  const jumlahByJenis = (list, jenis) =>
    list.reduce((a, t) => {
      const j = uraiKeterangan(t.keterangan).jenis;
      const cocok = jenis === "Cash" ? j === "Cash" : j !== "Cash";
      return a + (cocok ? Number(t.jumlah) || 0 : 0);
    }, 0);

  const riwayat = [...semuaEntri].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (b.id || 0) - (a.id || 0)));

  return (
    <div>
      <PageHeader
        title="Toko Offline"
        description="Input harian penjualan toko offline — tersimpan langsung sebagai transaksi pemasukan di Keuangan."
      />

      {daftarKategori.length === 0 ? (
        <EmptyState label='Kategori Pemasukan belum ada — daftarkan dulu lewat menu Keuangan > Rekening & Kategori.' />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Cash Hari Ini" value={fmtRp(jumlahByJenis(entriHariIni, "Cash"))} icon={Wallet} />
            <StatCard label="Cashless Hari Ini" value={fmtRp(jumlahByJenis(entriHariIni, "Cashless"))} icon={Landmark} />
            <StatCard
              label="Total Hari Ini"
              value={fmtRp(jumlahByJenis(entriHariIni, "Cash") + jumlahByJenis(entriHariIni, "Cashless"))}
              icon={TrendingUp}
              accent="text-md-primary"
            />
            <StatCard
              label="Total Bulan Ini"
              value={fmtRp(jumlahByJenis(entriBulanIni, "Cash") + jumlahByJenis(entriBulanIni, "Cashless"))}
              icon={Home}
            />
          </div>

          <div className="rounded-md-lg bg-md-container-low p-4 shadow-elevation-1 mb-6">
            <div className="text-sm font-medium text-md-on-surface mb-3">Tambah Input Harian</div>

            <Field label="Tanggal">
              <InputTanggal value={tanggal} onChange={setTanggal} />
            </Field>

            <div className="grid sm:grid-cols-2 gap-x-4">
              <div className="rounded-md-md border border-md-outline-variant p-3">
                <div className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Wallet size={13} /> Cash
                </div>
                <Field label="Jumlah">
                  <InputRupiah value={cash} onChange={setCash} placeholder="0" />
                </Field>
                <Field label="Rekening Penampung">
                  <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm text-md-on-surface-variant">
                    {rekeningCashObj?.label || REKENING_TOKO_OFFLINE_CASH}
                    <span className="ml-1.5 text-[11px] opacity-70">(otomatis)</span>
                  </div>
                </Field>
                <Field label="Kategori Pemasukan">
                  {kategoriCashObj ? (
                    <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm text-md-on-surface-variant">
                      {kategoriCashObj.label} <span className="ml-1.5 text-[11px] opacity-70">(otomatis)</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-400 flex items-start gap-1.5 px-1 py-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Kategori "{LABEL_KATEGORI_CASH}" belum ada. Buat dulu di Keuangan {'>'} Rekening & Kategori dengan nama persis ini.
                    </div>
                  )}
                </Field>
              </div>

              <div className="rounded-md-md border border-md-outline-variant p-3">
                <div className="text-xs font-medium text-sky-400 mb-2 flex items-center gap-1.5">
                  <Landmark size={13} /> Cashless
                </div>
                <Field label="Jumlah">
                  <InputRupiah value={cashless} onChange={setCashless} placeholder="0" />
                </Field>
                <Field label="Rekening Penampung">
                  <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm text-md-on-surface-variant">
                    {rekeningCashlessObj?.label || REKENING_TOKO_OFFLINE_CASHLESS}
                    <span className="ml-1.5 text-[11px] opacity-70">
                      ({rekeningCashlessObj?.kode || KODE_REKENING_TOKO_OFFLINE_CASHLESS}, otomatis)
                    </span>
                  </div>
                </Field>
                <Field label="Metode Cashless">
                  <div className="flex gap-1.5">
                    {METODE_CASHLESS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMetodeCashless(m.value)}
                        className={`flex-1 px-3 py-2 rounded-md-md text-sm font-medium border transition-colors ${
                          metodeCashless === m.value
                            ? "bg-md-primary text-md-on-primary border-md-primary"
                            : "bg-md-container-highest text-md-on-surface-variant border-md-outline-variant hover:border-md-primary"
                        }`}
                      >
                        {m.value}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Kategori Pemasukan">
                  {kategoriCashlessObj ? (
                    <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm text-md-on-surface-variant">
                      {kategoriCashlessObj.label} <span className="ml-1.5 text-[11px] opacity-70">(otomatis)</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-400 flex items-start gap-1.5 px-1 py-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Kategori "{labelKategoriCashless}" belum ada. Buat dulu di Keuangan {'>'} Rekening & Kategori dengan nama persis ini.
                    </div>
                  )}
                </Field>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-4 mt-1">
              <Field label="Catatan (opsional — mis. shift/kasir)">
                <input
                  className="w-full bg-md-container-highest border border-md-outline-variant rounded-md-md outline-none focus:border-md-primary px-3 py-2 text-sm"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="mis. Shift Pagi / Kasir Suci"
                />
              </Field>
              <div className="flex flex-col justify-end">
                <div className="text-xs text-md-on-surface-variant mb-1">Total Penjualan (otomatis)</div>
                <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm font-medium text-md-on-surface">
                  {fmtRp(totalPenjualan)}
                </div>
              </div>
            </div>

            <button
              onClick={simpan}
              disabled={!canSubmit}
              className="mt-2 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium bg-md-primary text-md-on-primary disabled:opacity-40"
            >
              <Plus size={15} /> {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>

          <div className="text-sm font-medium text-md-on-surface mb-2">Riwayat Input Harian</div>
          {riwayat.length === 0 ? (
            <EmptyState label="Belum ada input harian toko offline." />
          ) : (
            <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
                    <th className="px-4 py-2.5 font-medium">Tanggal</th>
                    <th className="px-4 py-2.5 font-medium">Jenis</th>
                    <th className="px-4 py-2.5 font-medium">Rekening</th>
                    <th className="px-4 py-2.5 font-medium">Catatan</th>
                    <th className="px-4 py-2.5 font-medium text-right">Jumlah</th>
                    <th className="px-4 py-2.5 font-medium w-10" />
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((t) => {
                    const { jenis, catatan: catatanRow } = uraiKeterangan(t.keterangan);
                    const rekeningLabel = daftarRekening.find((r) => r.kode === t.rekening)?.label || t.rekening;
                    return (
                      <tr key={t.id} className="border-b border-md-outline-variant last:border-0">
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(t.tanggal)}</td>
                        <td className="px-4 py-2.5">
                          <Badge color={jenis === "Cash" ? "emerald" : "sky"}>{jenis}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-md-on-surface-variant">{rekeningLabel}</td>
                        <td className="px-4 py-2.5 text-md-on-surface-variant">{catatanRow || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmtRp(t.jumlah)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => hapus(t)}
                            className="text-md-on-surface-variant hover:text-red-400"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}