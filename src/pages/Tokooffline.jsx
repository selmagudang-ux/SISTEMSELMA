import { useState } from "react";
import { Home, Plus, Trash2, Wallet, Landmark, TrendingUp, AlertTriangle } from "lucide-react";
import {
  PageHeader, EmptyState, StatCard, Field, InputTanggal, InputRupiah,
  SearchableSelect, Badge, formatTanggalID,
} from "../components/ui";
import { sb, fmtRp } from "../lib/api";

// =========================================================
// TOKO OFFLINE — Input harian penjualan toko offline.
// SENGAJA TIDAK bikin tabel baru — tiap input langsung dicatat sebagai 1-2
// baris transaksi "masuk" di keuangan_transaksi yang sudah ada (satu baris
// untuk Cash, satu lagi untuk Transfer, masing-masing ke rekening penampung
// yang dipilih dari master data "rekening" yang SAMA dengan yang dipakai
// Keuangan > Rekening & Kategori — jadi otomatis sinkron, tidak perlu
// disamakan manual). Supaya baris-baris ini bisa dikenali balik sebagai
// "input Toko Offline" (buat Riwayat & StatCard di halaman ini), keterangan-nya
// diawali penanda tetap "Toko Offline ·" — lihat isEntriTokoOffline().
// =========================================================

const PENANDA = "Toko Offline ·";

// Kategori pemasukan untuk Cash & Transfer di halaman ini FIXED (tidak bisa
// dipilih manual) — supaya tidak pernah salah kategori:
//   Cash     -> kategori berlabel "OFFLINE"
//   Transfer -> kategori berlabel "OFFLINE TF"
// Nama kategori harus persis dibuat di Keuangan > Rekening & Kategori
// (whitespace & besar/kecil huruf diabaikan saat mencocokkan).
const LABEL_KATEGORI_CASH = "OFFLINE CASH";
const LABEL_KATEGORI_TRANSFER = "OFFLINE TRANSFER";

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

// Pisahkan lagi jenis (Cash/Transfer) & catatan dari keterangan yang sudah
// dibentuk buatKeterangan() di atas, buat ditampilkan di tabel Riwayat.
function uraiKeterangan(keterangan) {
  const sisa = (keterangan || "").slice(PENANDA.length).trim(); // "Cash — catatan" / "Transfer"
  const [jenisPart, ...catatanPart] = sisa.split(" — ");
  return { jenis: jenisPart.trim(), catatan: catatanPart.join(" — ").trim() };
}

function isEntriTokoOffline(t) {
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
  const [rekeningCash, setRekeningCash] = useState("");
  const [transfer, setTransfer] = useState("");
  const [rekeningTransfer, setRekeningTransfer] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);

  const daftarRekening = master?.rekening || [];
  const daftarKategori = master?.kategori_masuk || [];
  const rekeningOptions = daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` }));

  // Kategori pemasukan FIXED, dicocokkan persis by nama — lihat catatan di
  // atas file (cariKategoriByLabel). Tidak ada lagi pilihan manual di sini.
  const kategoriCashObj = cariKategoriByLabel(daftarKategori, LABEL_KATEGORI_CASH);
  const kategoriTransferObj = cariKategoriByLabel(daftarKategori, LABEL_KATEGORI_TRANSFER);
  const kategoriCash = kategoriCashObj?.kode || "";
  const kategoriTransfer = kategoriTransferObj?.kode || "";

  const cashNum = Number(cash) || 0;
  const transferNum = Number(transfer) || 0;
  const totalPenjualan = cashNum + transferNum;
  const rekeningBentrok = cashNum > 0 && transferNum > 0 && rekeningCash && rekeningCash === rekeningTransfer;

  const canSubmit =
    !saving &&
    tanggal &&
    totalPenjualan > 0 &&
    (cashNum <= 0 || (rekeningCash && kategoriCash)) &&
    (transferNum <= 0 || (rekeningTransfer && kategoriTransfer)) &&
    !rekeningBentrok;

  const resetSetelahSimpan = () => {
    setCash("");
    setTransfer("");
    setCatatan("");
    // Tanggal & rekening sengaja TIDAK direset — input harian sering diisi
    // berkali-kali di hari & pola yang sama (per shift/kasir), jadi biar bisa
    // langsung isi nominal berikutnya tanpa pilih ulang dari awal.
  };

  const simpan = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const rows = [];
      if (cashNum > 0) {
        rows.push({
          tanggal, tipe: "masuk", rekening: rekeningCash, kategori: kategoriCash,
          jumlah: cashNum, keterangan: buatKeterangan("Cash", catatan),
        });
      }
      if (transferNum > 0) {
        rows.push({
          tanggal, tipe: "masuk", rekening: rekeningTransfer, kategori: kategoriTransfer,
          jumlah: transferNum, keterangan: buatKeterangan("Transfer", catatan),
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
  const jumlahByJenis = (list, jenis) =>
    list.reduce((a, t) => a + (uraiKeterangan(t.keterangan).jenis === jenis ? Number(t.jumlah) || 0 : 0), 0);

  const riwayat = [...semuaEntri].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (b.id || 0) - (a.id || 0)));

  return (
    <div>
      <PageHeader
        title="Toko Offline"
        description="Input harian penjualan toko offline — tersimpan langsung sebagai transaksi pemasukan di Keuangan."
      />

      {daftarRekening.length === 0 || daftarKategori.length === 0 ? (
        <EmptyState label='Rekening atau Kategori Pemasukan belum ada — daftarkan dulu lewat menu Keuangan > Rekening & Kategori.' />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Cash Hari Ini" value={fmtRp(jumlahByJenis(entriHariIni, "Cash"))} icon={Wallet} />
            <StatCard label="Transfer Hari Ini" value={fmtRp(jumlahByJenis(entriHariIni, "Transfer"))} icon={Landmark} />
            <StatCard
              label="Total Hari Ini"
              value={fmtRp(jumlahByJenis(entriHariIni, "Cash") + jumlahByJenis(entriHariIni, "Transfer"))}
              icon={TrendingUp}
              accent="text-md-primary"
            />
            <StatCard
              label="Total Bulan Ini"
              value={fmtRp(jumlahByJenis(entriBulanIni, "Cash") + jumlahByJenis(entriBulanIni, "Transfer"))}
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
                  <SearchableSelect
                    value={rekeningCash}
                    onChange={setRekeningCash}
                    options={rekeningOptions}
                    placeholder="Pilih rekening kas…"
                    disabled={cashNum <= 0}
                  />
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
                  <Landmark size={13} /> Transfer
                </div>
                <Field label="Jumlah">
                  <InputRupiah value={transfer} onChange={setTransfer} placeholder="0" />
                </Field>
                <Field label="Rekening Penampung">
                  <SearchableSelect
                    value={rekeningTransfer}
                    onChange={setRekeningTransfer}
                    options={rekeningOptions}
                    placeholder="Pilih rekening transfer/bank…"
                    disabled={transferNum <= 0}
                  />
                  {rekeningBentrok && (
                    <div className="text-[11px] text-red-400 mt-1">
                      Rekening Cash & Transfer tidak boleh sama.
                    </div>
                  )}
                </Field>
                <Field label="Kategori Pemasukan">
                  {kategoriTransferObj ? (
                    <div className="h-[38px] flex items-center px-3 rounded-md-md bg-md-container-highest text-sm text-md-on-surface-variant">
                      {kategoriTransferObj.label} <span className="ml-1.5 text-[11px] opacity-70">(otomatis)</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-400 flex items-start gap-1.5 px-1 py-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Kategori "{LABEL_KATEGORI_TRANSFER}" belum ada. Buat dulu di Keuangan {'>'} Rekening & Kategori dengan nama persis ini.
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