import { useEffect, useMemo, useState } from "react";
import { FileText, MessageCircle, Copy, RefreshCw, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader, EmptyState, inputClass, btnFilled, btnOutlined, formatTanggalID } from "../components/ui";
import { sb, fmtRp, entitasSesi, namaUsahaEntitas } from "../lib/api";
import { bisa } from "../lib/constants";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";
import { ambilPerpindahanBarang, susunRekap, adaIsi, rekapKeTeksWa } from "../lib/rekapPerpindahan";

// =========================================================
// REKAP PERPINDAHAN — barang & uang yang PINDAH ANTAR TEMPAT dalam satu
// rentang: Harian, Mingguan (Senin–Minggu), atau Bulanan. Meliputi Gudang <-> Toko,
// Antar Entitas, dan semua transaksi keuangan pada rentang terpilih.
// Keluaran: tampilan layar, PDF (unduh), teks WhatsApp (wa.me, tanpa API berbayar).
// Logika: lib/rekapPerpindahan.js, PDF: lib/RekapPerpindahanPdf.js.
// =========================================================

const MODE = [
  { key: "harian", label: "Harian" },
  { key: "mingguan", label: "Mingguan" },
  { key: "bulanan", label: "Bulanan" },
];
const TAMPIL_MAKS = 200; // baris maksimal per tabel di layar; PDF selalu memuat semuanya

const hariIniWib = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const pad = (n) => String(n).padStart(2, "0");

const geserHari = (tgl, n) => {
  const d = new Date(`${tgl}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const geserBulan = (tgl, n) => {
  const [y, m] = tgl.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};

function rentangDari(mode, tgl) {
  if (mode === "harian") return { dari: tgl, sampai: tgl };
  if (mode === "mingguan") {
    const sel = (new Date(`${tgl}T12:00:00Z`).getUTCDay() + 6) % 7; // Senin = 0
    const dari = geserHari(tgl, -sel);
    return { dari, sampai: geserHari(dari, 6) };
  }
  const [y, m] = tgl.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dari: `${y}-${pad(m)}-01`, sampai: `${y}-${pad(m)}-${pad(akhir)}` };
}

function labelRentang(mode, dari, sampai) {
  if (mode === "harian") return formatTanggalID(dari);
  if (mode === "mingguan") return `${formatTanggalID(dari)} s/d ${formatTanggalID(sampai)}`;
  return new Date(`${dari}T12:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}

function Seksi({ judul, ringkas, children }) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{judul}</h3>
        {ringkas && <span className="text-xs text-slate-500">{ringkas}</span>}
      </div>
      {children}
    </section>
  );
}

const Kosong = ({ teks }) => <p className="text-xs text-slate-500">{teks}</p>;
const Td = ({ children, className = "" }) => <td className={`py-1.5 pr-2 align-top ${className}`}>{children}</td>;
const Tr = ({ children }) => <tr className="border-t border-slate-100 dark:border-slate-800">{children}</tr>;
const Tabel = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs"><tbody>{children}</tbody></table>
  </div>
);
const CatatanPotong = ({ total }) =>
  total > TAMPIL_MAKS ? (
    <p className="mt-2 text-xs text-slate-500">Menampilkan {TAMPIL_MAKS} dari {total} baris. PDF memuat semuanya.</p>
  ) : null;

export default function RekapPerpindahan({ keuanganTransaksi, master, session, showToast }) {
  const [mode, setMode] = useState("harian");
  const [anchor, setAnchor] = useState(hariIniWib());
  const [barang, setBarang] = useState({ mutasi: [], transfer: [], tokoMaster: [] });
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);

  const { dari, sampai } = useMemo(() => rentangDari(mode, anchor), [mode, anchor]);
  const label = useMemo(() => labelRentang(mode, dari, sampai), [mode, dari, sampai]);

  // App.jsx hanya memuat transaksi keuangan bulan ini; hook ini menarik bulan lama bila perlu.
  const { data: transaksi, status } = useKeuanganRentang(keuanganTransaksi, dari);

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");
    ambilPerpindahanBarang(dari, sampai, entitasSesi())
      .then((d) => { if (!batal) setBarang(d); })
      .catch((e) => { if (!batal) setGalat(e?.message || "Gagal memuat data perpindahan barang"); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [dari, sampai, muatUlang]);

  const rekap = useMemo(
    () =>
      susunRekap({
        dari,
        sampai,
        modeLabel: MODE.find((m) => m.key === mode).label,
        labelRentang: label,
        transaksi,
        mutasi: barang.mutasi,
        transfer: barang.transfer,
        tokoMaster: barang.tokoMaster,
        master,
        namaUsaha: namaUsahaEntitas(master, entitasSesi()),
      }),
    [dari, sampai, mode, label, transaksi, barang, master]
  );

  const teksWa = useMemo(() => rekapKeTeksWa(rekap), [rekap]);

  // Hapus SATU catatan riwayat mutasi Gudang <-> Toko (toko_stok_mutasi). Hanya catatannya yang hilang;
  // stok toko & stok gudang TIDAK berubah. Dijalankan lewat fungsi database toko_hapus_mutasi
  // (supabase/migrations/20261114_toko_hapus_mutasi.sql) dan dijaga izin "stok.hapus_mutasi_toko".
  const bisaHapusMutasi = bisa(session?.role, "stok.hapus_mutasi_toko");
  const [menghapus, setMenghapus] = useState(false);
  const hapusMutasi = async (x) => {
    if (!bisaHapusMutasi || menghapus || !x?.id) return;
    const ok = window.confirm(
      [
        "Hapus catatan riwayat ini?",
        "",
        `${x.waktu} · ${x.arahLabel.replace("->", "→")}`,
        `${x.sku} · ${x.qty} pcs`,
        [x.kodeToko, x.namaToko].filter(Boolean).join(" · "),
        "",
        "Yang dihapus HANYA catatan riwayatnya. Stok toko dan stok gudang tidak berubah. Tidak bisa dibatalkan.",
      ].join("\n")
    );
    if (!ok) return;
    setMenghapus(true);
    try {
      await sb("rpc/toko_hapus_mutasi", {
        method: "POST",
        body: JSON.stringify({ p_id: String(x.id), p_entitas: entitasSesi() || null }),
      });
      showToast?.("Catatan riwayat mutasi dihapus");
      setMuatUlang((n) => n + 1);
    } catch (e) {
      const pesan = String(e?.message || e);
      showToast?.(
        /toko_hapus_mutasi|PGRST202|does not exist|404/i.test(pesan)
          ? "Fungsi database belum dibuat. Jalankan supabase/migrations/20261114_toko_hapus_mutasi.sql di Supabase > SQL Editor."
          : /MUTASI_TIDAK_DITEMUKAN/.test(pesan)
            ? "Catatan sudah tidak ada (mungkin sudah dihapus). Muat ulang."
            : `Gagal menghapus: ${pesan}`,
        "error"
      );
    } finally {
      setMenghapus(false);
    }
  };

  const geser = (arah) => setAnchor((a) => (mode === "harian" ? geserHari(a, arah) : mode === "mingguan" ? geserHari(a, 7 * arah) : geserBulan(a, arah)));

  const unduhPdf = async () => {
    try {
      const { buatPdfRekapPerpindahan } = await import("../lib/RekapPerpindahanPdf");
      buatPdfRekapPerpindahan(rekap);
    } catch (e) {
      showToast?.(`Gagal membuat PDF: ${e?.message || e}`, "error");
    }
  };
  const kirimWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(teksWa)}`, "_blank");
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teksWa);
      showToast?.("Teks rekap disalin");
    } catch {
      showToast?.("Gagal menyalin teks", "error");
    }
  };

  const b = rekap.barang;
  const u = rekap.uang;
  const multi = rekap.multiHari;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rekap Perpindahan"
        description="Barang dan uang yang pindah antar tempat: Gudang ↔ Toko, Antar Entitas, dan semua transaksi keuangan pada periode terpilih. Pilih Harian, Mingguan, atau Bulanan, lalu unduh PDF atau kirim ringkasannya lewat WhatsApp."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          {MODE.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`px-3 py-1.5 font-medium ${mode === m.key ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button type="button" className={btnOutlined} onClick={() => geser(-1)} aria-label="Sebelumnya"><ChevronLeft size={14} /></button>
        {mode === "bulanan" ? (
          <input
            type="month"
            value={anchor.slice(0, 7)}
            onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)}
            className={inputClass}
            style={{ maxWidth: 170 }}
          />
        ) : (
          <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={inputClass} style={{ maxWidth: 170 }} />
        )}
        <button type="button" className={btnOutlined} onClick={() => geser(1)} aria-label="Berikutnya"><ChevronRight size={14} /></button>
        <button type="button" className={btnOutlined} onClick={() => setAnchor(hariIniWib())}>Hari ini</button>
        <button type="button" className={btnOutlined} onClick={() => setMuatUlang((n) => n + 1)} disabled={memuat}>
          <RefreshCw size={14} className={memuat ? "animate-spin" : ""} /> Muat ulang
        </button>
        <div className="flex-1" />
        <button type="button" className={btnOutlined} onClick={salin}><Copy size={14} /> Salin teks</button>
        <button type="button" className={btnOutlined} onClick={kirimWa}><MessageCircle size={14} /> Kirim WhatsApp</button>
        <button type="button" className={btnFilled} onClick={unduhPdf}><FileText size={14} /> Unduh PDF</button>
      </div>

      <p className="text-sm font-medium">{label}</p>
      {status && <p className="text-xs text-amber-600">{status}</p>}
      {galat && <p className="text-xs text-red-600">{galat}</p>}

      {!memuat && !adaIsi(rekap) ? (
        <EmptyState label="Tidak ada perpindahan barang atau uang pada rentang ini." />
      ) : (
        <>
          <Seksi judul={`Barang: Gudang ↔ Toko (${b.gudangToko.length})`} ringkas={`Ke Toko ${b.keToko} pcs · Ke Gudang ${b.keGudang} pcs`}>
            {b.gudangToko.length === 0 ? <Kosong teks="Tidak ada." /> : (
              <>
                {multi && b.perSku.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 text-xs font-semibold text-slate-500">Ringkasan per SKU</div>
                    <Tabel>
                      {b.perSku.slice(0, TAMPIL_MAKS).map((s, i) => (
                        <Tr key={i}>
                          <Td className="font-medium">{s.sku}</Td>
                          <Td className="text-right">ke toko {s.keToko}</Td>
                          <Td className="text-right">ke gudang {s.keGudang}</Td>
                        </Tr>
                      ))}
                    </Tabel>
                    <CatatanPotong total={b.perSku.length} />
                    <div className="mt-3 text-xs font-semibold text-slate-500">Rincian per kejadian</div>
                  </div>
                )}
                <Tabel>
                  {b.gudangToko.slice(0, TAMPIL_MAKS).map((x, i) => (
                    <Tr key={i}>
                      <Td className="text-slate-400 whitespace-nowrap">{x.waktu}</Td>
                      <Td className="whitespace-nowrap font-medium">{x.arahLabel.replace("->", "→")}</Td>
                      <Td>{x.sku}</Td>
                      <Td className="text-slate-500">{[x.kodeToko, x.namaToko].filter(Boolean).join(" · ")}</Td>
                      <Td className="text-right font-medium whitespace-nowrap">{x.qty} pcs</Td>
                      <Td className="text-slate-500">{x.catatan}</Td>
                      {bisaHapusMutasi && (
                        <Td className="text-right">
                          <button
                            type="button"
                            title="Hapus catatan riwayat ini (stok tidak berubah)"
                            aria-label="Hapus catatan riwayat ini"
                            disabled={menghapus || !x.id}
                            onClick={() => hapusMutasi(x)}
                            className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tabel>
                <CatatanPotong total={b.gudangToko.length} />
              </>
            )}
          </Seksi>

          <Seksi judul={`Barang: Antar Entitas (${b.antarEntitas.length})`} ringkas={`Dikirim ${b.dikirimQty} pcs · Diterima ${b.diterimaQty} pcs`}>
            {b.antarEntitas.length === 0 ? <Kosong teks="Tidak ada kejadian pada rentang ini." /> : (
              <>
                <Tabel>
                  {b.antarEntitas.slice(0, TAMPIL_MAKS).map((x, i) => (
                    <Tr key={i}>
                      <Td className="text-slate-400 whitespace-nowrap">{x.waktu}</Td>
                      <Td className="whitespace-nowrap font-medium">{x.jenis}</Td>
                      <Td className="whitespace-nowrap">{x.kode}</Td>
                      <Td className="whitespace-nowrap">{x.asal} → {x.tujuan}</Td>
                      <Td className="text-right font-medium whitespace-nowrap">{x.qty} pcs{x.selisih > 0 ? ` (selisih ${x.selisih})` : ""}</Td>
                      <Td className="text-slate-500">{[x.daftar, x.catatan].filter(Boolean).join(" · ")}</Td>
                    </Tr>
                  ))}
                </Tabel>
                <CatatanPotong total={b.antarEntitas.length} />
              </>
            )}
            {b.menggantung.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">
                <div className="mb-1 font-semibold text-amber-700">Masih di jalan saat ini (belum diterima)</div>
                {b.menggantung.map((x, i) => (
                  <div key={i}>{x.kode} · {x.asal} → {x.tujuan} · {x.qty} pcs · sejak {x.sejak}</div>
                ))}
              </div>
            )}
          </Seksi>

          <Seksi judul={`Uang: Antar Entitas (${u.antarEntitas.length})`} ringkas={`Total ${fmtRp(u.totalAntarEntitas)}`}>
            {u.antarEntitas.length === 0 ? <Kosong teks="Tidak ada." /> : (
              <>
                <Tabel>
                  {u.antarEntitas.slice(0, TAMPIL_MAKS).map((x, i) => (
                    <Tr key={i}>
                      <Td className="text-slate-400 whitespace-nowrap">{x.waktu}</Td>
                      <Td className="whitespace-nowrap font-medium">{x.jenis}</Td>
                      <Td>{x.dari} → {x.ke}</Td>
                      <Td className="text-slate-500">{x.rincian ? `${x.rincian} transaksi` : x.keterangan}</Td>
                      <Td className="text-right whitespace-nowrap font-medium">{fmtRp(x.jumlah)}</Td>
                    </Tr>
                  ))}
                </Tabel>
                <CatatanPotong total={u.antarEntitas.length} />
              </>
            )}
          </Seksi>

          <Seksi
            judul={`Transaksi selama periode terpilih (${u.transaksi.length})`}
            ringkas={`Pemasukan ${fmtRp(u.totalMasuk)} · Pengeluaran ${fmtRp(u.totalKeluar)} · Transfer ${fmtRp(u.totalTransfer)}`}
          >
            {u.transaksi.length === 0 ? <Kosong teks="Tidak ada transaksi keuangan pada rentang ini." /> : (
              <>
                <Tabel>
                  {u.transaksi.slice(0, TAMPIL_MAKS).map((x, i) => (
                    <Tr key={i}>
                      <Td className="text-slate-400 whitespace-nowrap">{x.waktu}</Td>
                      <Td className="whitespace-nowrap font-medium">{x.jenis}</Td>
                      <Td>{x.rekening}{x.kategori ? ` · ${x.kategori}` : ""}</Td>
                      <Td className="text-slate-500">{x.keterangan}</Td>
                      <Td className={`text-right whitespace-nowrap font-medium ${x.tipe === "masuk" ? "text-emerald-500" : x.tipe === "keluar" ? "text-red-500" : "text-sky-500"}`}>
                        {x.tipe === "masuk" ? "+" : x.tipe === "keluar" ? "-" : ""}{fmtRp(x.jumlah)}
                      </Td>
                    </Tr>
                  ))}
                </Tabel>
                <CatatanPotong total={u.transaksi.length} />
              </>
            )}
          </Seksi>
        </>
      )}
    </div>
  );
}
