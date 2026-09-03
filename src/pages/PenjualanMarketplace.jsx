import { useEffect, useState } from "react";
import { TrendingUp, Megaphone, Wallet, Plus, Banknote, Trash2, Store, ArrowLeft, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState, StatCard, Badge, formatTanggalID } from "../components/ui";
import { fmtRp, saldoMarketplace, daftarTokoMarketplace } from "../lib/api";

// =========================================================
// MARKETPLACE (Shopee/TikTok/Lazada) — lihat catatan lengkap soal desain
// datanya di saldoMarketplace() (lib/api.js). Ringkas:
//   - Pemasukan Bulanan & Pengeluaran Iklan dicatat di tabel sendiri
//     "marketplace_transaksi", TIDAK ikut ke keuangan_transaksi — supaya
//     saldo yang masih "ngendon" di marketplace (belum dicairkan) TIDAK
//     nongol sebagai rekening di Keuangan.
//   - Iklan otomatis DIPOTONG dari saldo marketplace (bukan dibayar dari
//     rekening Keuangan) — pola paling umum: Shopee/TikTok Ads auto-debit
//     dari saldo/pemasukan marketplace itu sendiri.
//   - Baru saat PENCAIRAN (uang beneran ditarik ke rekening bank), itu yang
//     dicatat sebagai transaksi masuk di Keuangan (lihat modal
//     "marketplace-pencairan" di ModalRouter) — satu-satunya titik sambung
//     ke Keuangan.
//   - Per-toko: satu platform bisa punya beberapa toko sendiri-sendiri
//     (mis. 2 toko Shopee yang beda), masing-masing saldonya dihitung
//     TERPISAH, tidak digabung jadi satu angka per platform lagi. Daftar
//     toko + kode-nya disimpan di master_data tipe "toko_<platform>" (lihat
//     daftarTokoMarketplace() di lib/api.js & modal "marketplace-toko-form"
//     di ModalRouter). Buka halaman ini dulu menampilkan daftar toko;
//     pilih satu toko baru masuk ke tampilan saldo & riwayat toko itu.
// =========================================================

const PLATFORM_LABEL = { shopee: "Shopee", tiktok: "TikTok", lazada: "Lazada" };
const PLATFORM_COLOR = { shopee: "text-orange-400", tiktok: "text-slate-200", lazada: "text-indigo-400" };

const TIPE_LABEL = { pemasukan: "Pemasukan", iklan: "Iklan", pencairan: "Pencairan" };
const TIPE_BADGE = { pemasukan: "emerald", iklan: "amber", pencairan: "sky" };

function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function PenjualanMarketplace({ sub, marketplaceTransaksi, master, reload, showToast, setModal }) {
  const platform = PLATFORM_LABEL[sub] ? sub : "shopee";
  const label = PLATFORM_LABEL[platform];

  const [tokoAktif, setTokoAktif] = useState(null); // null = lagi di daftar toko

  // Balik ke daftar toko tiap kali pindah platform (klik Shopee/TikTok/Lazada
  // di sidebar) — supaya tidak "nyangkut" nampilin toko dari platform lain.
  useEffect(() => {
    setTokoAktif(null);
  }, [platform]);

  const tokoMasterList = master?.[`toko_${platform}`] || [];
  const daftarToko = daftarTokoMarketplace(marketplaceTransaksi, tokoMasterList, platform);

  if (!tokoAktif) {
    return (
      <DaftarToko
        platform={platform}
        label={label}
        daftarToko={daftarToko}
        onPilih={setTokoAktif}
        setModal={setModal}
      />
    );
  }

  // Toko yang lagi dibuka bisa jadi sudah dihapus/berubah — cari ulang dari
  // daftar terbaru (fallback ke state lama kalau untuk sesaat belum ke-reload).
  const tokoTerbaru = daftarToko.find((t) => t.kode === tokoAktif.kode) || tokoAktif;

  return (
    <DetailToko
      platform={platform}
      label={label}
      toko={tokoTerbaru}
      marketplaceTransaksi={marketplaceTransaksi}
      master={master}
      setModal={setModal}
      onKembali={() => setTokoAktif(null)}
    />
  );
}

function DaftarToko({ platform, label, daftarToko, onPilih, setModal }) {
  const totalSaldo = daftarToko.reduce((a, t) => a + t.saldo, 0);

  return (
    <div>
      <PageHeader
        title={label}
        description="Tiap toko punya saldo sendiri-sendiri (pemasukan, iklan, pencairan dihitung terpisah per toko) — pilih toko untuk lihat detailnya."
        action={
          <button
            onClick={() => setModal({ type: "marketplace-toko-form", platform })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
          >
            <Plus size={14} /> Tambah Toko
          </button>
        }
      />

      {daftarToko.length > 0 && (
        <div className="mb-4">
          <StatCard label={`Total Saldo ${label} (semua toko)`} value={fmtRp(totalSaldo)} icon={Wallet} accent="text-md-primary" />
        </div>
      )}

      {daftarToko.length === 0 ? (
        <EmptyState label={`Belum ada toko ${label}. Tambah toko dulu lewat tombol di atas.`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {daftarToko.map((t) => (
            <button
              key={t.kode ?? "tanpa-toko"}
              onClick={() => onPilih(t)}
              className="flex items-center justify-between text-left rounded-md-lg bg-md-container-low p-4 shadow-elevation-1 hover:shadow-elevation-2 transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-md-on-surface/[0.06] ${PLATFORM_COLOR[platform]}`}>
                  <Store size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-md-on-surface truncate">{t.label}</div>
                  <div className="text-xs text-md-on-surface-variant mt-0.5">{fmtRp(t.saldo)}</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-md-on-surface-variant flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailToko({ platform, label, toko, marketplaceTransaksi, master, setModal, onKembali }) {
  const semuaEntri = (marketplaceTransaksi || []).filter(
    (t) => t.platform === platform && (t.toko || null) === (toko.kode || null)
  );
  const saldo = toko.saldo;

  const bulanIni = awalBulanIni();
  const entriBulanIni = semuaEntri.filter((t) => t.tanggal >= bulanIni);
  const jumlahByTipe = (list, tipe) =>
    list.reduce((a, t) => a + (t.tipe === tipe ? Number(t.jumlah) || 0 : 0), 0);

  const riwayat = [...semuaEntri].sort((a, b) =>
    a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (b.created_at || "").localeCompare(a.created_at || "")
  );

  const daftarRekening = master?.rekening || [];
  const modalDasar = { platform, toko: toko.kode, tokoLabel: toko.label };

  return (
    <div>
      <button
        onClick={onKembali}
        className="flex items-center gap-1.5 text-xs text-md-on-surface-variant hover:text-md-on-surface mb-3"
      >
        <ArrowLeft size={13} /> Daftar Toko {label}
      </button>

      <PageHeader
        title={`${label} — ${toko.label}`}
        description="Pemasukan & pengeluaran iklan dicatat di sini, saldonya dihitung sendiri (belum masuk Keuangan). Saat dicairkan, baru tercatat sebagai pemasukan di Keuangan."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setModal({ type: "marketplace-transaksi-form", tipe: "pemasukan", ...modalDasar })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
            >
              <Plus size={14} /> Pemasukan
            </button>
            <button
              onClick={() => setModal({ type: "marketplace-transaksi-form", tipe: "iklan", ...modalDasar })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
            >
              <Plus size={14} /> Iklan
            </button>
            <button
              onClick={() => setModal({ type: "marketplace-pencairan", ...modalDasar, saldo })}
              disabled={saldo <= 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 disabled:opacity-40"
            >
              <Banknote size={14} /> Cairkan
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label={`Saldo ${toko.label} Saat Ini`} value={fmtRp(saldo)} icon={Wallet} accent="text-md-primary" />
        <StatCard label="Pemasukan Bulan Ini" value={fmtRp(jumlahByTipe(entriBulanIni, "pemasukan"))} icon={TrendingUp} iconColor="text-emerald-400" />
        <StatCard label="Iklan Bulan Ini" value={fmtRp(jumlahByTipe(entriBulanIni, "iklan"))} icon={Megaphone} iconColor="text-amber-400" />
        <StatCard label="Dicairkan Bulan Ini" value={fmtRp(jumlahByTipe(entriBulanIni, "pencairan"))} icon={Banknote} iconColor="text-sky-400" />
      </div>

      <div className={`text-sm font-medium mb-2 ${PLATFORM_COLOR[platform]}`}>Riwayat {toko.label}</div>
      {riwayat.length === 0 ? (
        <EmptyState label={`Belum ada transaksi ${toko.label}. Tambah pemasukan dulu lewat tombol di atas.`} />
      ) : (
        <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
                <th className="px-4 py-2.5 font-medium">Tanggal</th>
                <th className="px-4 py-2.5 font-medium">Tipe</th>
                <th className="px-4 py-2.5 font-medium">Keterangan</th>
                <th className="px-4 py-2.5 font-medium">Rekening Tujuan</th>
                <th className="px-4 py-2.5 font-medium text-right">Jumlah</th>
                <th className="px-4 py-2.5 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {riwayat.map((t) => {
                const rekeningLabel = t.rekening
                  ? daftarRekening.find((r) => r.kode === t.rekening)?.label || t.rekening
                  : "—";
                return (
                  <tr key={t.id} className="border-b border-md-outline-variant last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(t.tanggal)}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={TIPE_BADGE[t.tipe] || "slate"}>{TIPE_LABEL[t.tipe] || t.tipe}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-md-on-surface-variant">{t.keterangan || "—"}</td>
                    <td className="px-4 py-2.5 text-md-on-surface-variant">{rekeningLabel}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${t.tipe === "pemasukan" ? "text-emerald-400" : "text-slate-300"}`}>
                      {t.tipe === "pemasukan" ? "+" : "-"}{fmtRp(t.jumlah)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setModal({ type: "hapus-marketplace-transaksi", item: t })}
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
    </div>
  );
}