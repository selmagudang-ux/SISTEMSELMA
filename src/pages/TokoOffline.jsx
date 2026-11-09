import { useState } from "react";
import PosToko from "./kasir/PosToko";
import LaporanKasir from "./kasir/LaporanKasir";
import { useTanggalMulaiKasir } from "./kasir/kasirLaporan";
import { Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState, Badge, formatTanggalID } from "../components/ui";
import { sb, fmtRp, entitasSesi, lingkupEntitas } from "../lib/api";

// =========================================================
// TOKO OFFLINE — sejak Fase 6, halaman "Transaksi Offline" TIDAK lagi berisi input harian manual.
// Penjualan toko offline dicatat lewat kasir (/kasir): tiap transaksi otomatis masuk ke
// Keuangan (lihat kasirApi.simpanTransaksiKasir) dan ke rekap di halaman ini
// (pages/kasir/LaporanKasir.jsx) serta Dashboard.
//
// Input harian manual yang LAMA (baris keuangan_transaksi berketerangan "Toko Offline · …")
// tetap ada di Keuangan dan tetap dihitung Dashboard untuk tanggal SEBELUM kasir pertama dipakai.
// Di sini ia hanya ditampilkan sebagai riwayat (bisa dihapus kalau salah input), tidak ada form baru.
// =========================================================

const PENANDA = "Toko Offline ·";

// Pisahkan lagi jenis (Cash/Cashless) & catatan dari keterangan input manual lama.
function uraiKeterangan(keterangan) {
  const sisa = (keterangan || "").slice(PENANDA.length).trim(); // "Cash — catatan" / "Cashless (QRIS)"
  const [jenisPart, ...catatanPart] = sisa.split(" — ");
  return { jenis: jenisPart.trim(), catatan: catatanPart.join(" — ").trim() };
}

// Diexport supaya Dashboard menghitung input manual lama dengan kriteria yang SAMA persis.
export function isEntriTokoOffline(t) {
  return t.tipe === "masuk" && typeof t.keterangan === "string" && t.keterangan.startsWith(PENANDA);
}

function RiwayatInputLama({ entri, master, reload, showToast, mulaiKasir }) {
  const [buka, setBuka] = useState(false);
  const daftarRekening = master?.rekening || [];

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

  if (entri.length === 0) return null;
  const riwayat = [...entri].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (b.id || 0) - (a.id || 0)));

  return (
    <div className="mt-8">
      <button type="button" onClick={() => setBuka((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-md-on-surface mb-2">
        {buka ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Input harian manual lama ({entri.length})
        <span className="text-xs font-normal text-md-on-surface-variant">
          {mulaiKasir ? `· sebelum ${formatTanggalID(mulaiKasir)}, saat kasir mulai dipakai` : "· belum ada transaksi kasir"}
        </span>
      </button>
      {buka && (
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
                const { jenis, catatan } = uraiKeterangan(t.keterangan);
                const rekeningLabel = daftarRekening.find((r) => r.kode === t.rekening)?.label || t.rekening;
                return (
                  <tr key={t.id} className="border-b border-md-outline-variant last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatTanggalID(t.tanggal)}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={jenis === "Cash" ? "emerald" : "sky"}>{jenis}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-md-on-surface-variant">{rekeningLabel}</td>
                    <td className="px-4 py-2.5 text-md-on-surface-variant">{catatan || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmtRp(t.jumlah)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => hapus(t)} className="text-md-on-surface-variant hover:text-red-400" title="Hapus">
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

function TransaksiOffline({ master = {}, keuanganTransaksi = [], reload, showToast }) {
  const mulai = useTanggalMulaiKasir(true);
  const entitasAkun = entitasSesi();

  // keuanganTransaksi yang dioper App.jsx berisi transaksi SEMUA PT — saring ke PT akun ini
  // (lewat rekeningnya). Hasilnya juga membawa penanda __saring untuk useKeuanganRentang.
  const lingkup = lingkupEntitas(keuanganTransaksi || [], master, entitasAkun);
  const transaksiPT = lingkup.transaksi;

  // Riwayat input manual: hanya yang SEBELUM kasir dipakai. Baris pada/sesudah tanggal itu ditulis
  // oleh kasir sendiri dan dilihat lewat rekap di atas, bukan sebagai "input manual".
  const entriLama = (transaksiPT || []).filter((t) => isEntriTokoOffline(t) && (!mulai.tanggal || t.tanggal < mulai.tanggal));

  return (
    <div>
      <PageHeader
        title="Toko Offline"
        description="Rekap penjualan toko offline dari kasir — per hari, per kasir, per barang, dan barang terlaris. Tiap transaksi kasir otomatis tercatat di Keuangan, tidak perlu input harian manual lagi."
        action={
          <a href="/kasir" target="_blank" rel="noreferrer" className="text-xs font-semibold text-md-primary border border-md-outline-variant rounded-full px-3.5 py-2 hover:bg-md-surface-variant whitespace-nowrap">
            Buka Kasir
          </a>
        }
      />
      <LaporanKasir master={lingkup.master} keuanganTransaksi={transaksiPT} />
      <RiwayatInputLama entri={entriLama} master={master} reload={reload} showToast={showToast} mulaiKasir={mulai.tanggal} />
    </div>
  );
}

// Pintu masuk menu Toko Offline. Sub-menu "pos" (Barang Toko + Promo) dipisah ke komponen sendiri
// supaya hook milik Transaksi Offline tidak ikut berpindah-pindah saat sub-menu berganti.
export default function TokoOffline({ sub, ...props }) {
  if (sub === "pos") return <PosToko reload={props.reload} />;
  return <TransaksiOffline {...props} />;
}
