import { useEffect, useMemo, useState } from "react";
import { FileText, MessageCircle, Copy, RefreshCw } from "lucide-react";
import { PageHeader, EmptyState, inputClass, btnFilled, btnOutlined, formatTanggalID } from "../components/ui";
import { fmtRp, entitasSesi, namaUsahaEntitas } from "../lib/api";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";
import { ambilPerpindahanBarang, susunRekap, adaIsi, rekapKeTeksWa } from "../lib/rekapHarian";

// =========================================================
// REKAP PERPINDAHAN HARIAN — barang & uang yang PINDAH ANTAR TEMPAT
// pada satu hari: Gudang <-> Toko, Antar Entitas, dan transfer antar kas.
// Keluaran: tampilan layar, PDF (unduh), dan teks WhatsApp (wa.me, tanpa API
// berbayar — admin tinggal tekan Kirim). Logika: lib/rekapHarian.js,
// PDF: lib/RekapHarianPdf.js.
// =========================================================

const hariIniWib = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

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

export default function RekapHarian({ keuanganTransaksi, master, showToast }) {
  const [tgl, setTgl] = useState(hariIniWib());
  const [barang, setBarang] = useState({ mutasi: [], transfer: [], tokoMaster: [] });
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [muatUlang, setMuatUlang] = useState(0);

  // App.jsx hanya memuat transaksi keuangan bulan ini; hook ini menarik bulan lama bila perlu.
  const { data: transaksi, status } = useKeuanganRentang(keuanganTransaksi, tgl);

  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");
    ambilPerpindahanBarang(tgl, entitasSesi())
      .then((d) => { if (!batal) setBarang(d); })
      .catch((e) => { if (!batal) setGalat(e?.message || "Gagal memuat data perpindahan barang"); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [tgl, muatUlang]);

  const rekap = useMemo(
    () =>
      susunRekap({
        tgl,
        tglLabel: formatTanggalID(tgl),
        transaksi,
        mutasi: barang.mutasi,
        transfer: barang.transfer,
        tokoMaster: barang.tokoMaster,
        master,
        namaUsaha: namaUsahaEntitas(master, entitasSesi()),
      }),
    [tgl, transaksi, barang, master]
  );

  const teksWa = useMemo(() => rekapKeTeksWa(rekap), [rekap]);

  const unduhPdf = async () => {
    try {
      const { buatPdfRekapHarian } = await import("../lib/RekapHarianPdf");
      buatPdfRekapHarian(rekap);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rekap Perpindahan"
        description="Barang dan uang yang pindah antar tempat pada satu hari: Gudang ↔ Toko, Antar Entitas, dan transfer antar kas. Unduh PDF atau kirim ringkasannya lewat WhatsApp."
      />

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={tgl} onChange={(e) => e.target.value && setTgl(e.target.value)} className={inputClass} style={{ maxWidth: 180 }} />
        <button type="button" className={btnOutlined} onClick={() => setMuatUlang((n) => n + 1)} disabled={memuat}>
          <RefreshCw size={14} className={memuat ? "animate-spin" : ""} /> Muat ulang
        </button>
        <div className="flex-1" />
        <button type="button" className={btnOutlined} onClick={salin}><Copy size={14} /> Salin teks</button>
        <button type="button" className={btnOutlined} onClick={kirimWa}><MessageCircle size={14} /> Kirim WhatsApp</button>
        <button type="button" className={btnFilled} onClick={unduhPdf}><FileText size={14} /> Unduh PDF</button>
      </div>

      {status && <p className="text-xs text-amber-600">{status}</p>}
      {galat && <p className="text-xs text-red-600">{galat}</p>}

      {!memuat && !adaIsi(rekap) ? (
        <EmptyState label="Tidak ada perpindahan barang atau uang pada tanggal ini." />
      ) : (
        <>
          <Seksi judul={`Barang: Gudang ↔ Toko (${b.gudangToko.length})`} ringkas={`Ke Toko ${b.keToko} pcs · Ke Gudang ${b.keGudang} pcs`}>
            {b.gudangToko.length === 0 ? <Kosong teks="Tidak ada." /> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
                {b.gudangToko.map((x, i) => (
                  <Tr key={i}>
                    <Td className="text-slate-400 whitespace-nowrap">{x.jam}</Td>
                    <Td className="whitespace-nowrap font-medium">{x.arahLabel.replace("->", "→")}</Td>
                    <Td>{x.sku}</Td>
                    <Td className="text-slate-500">{[x.kodeToko, x.namaToko].filter(Boolean).join(" · ")}</Td>
                    <Td className="text-right font-medium">{x.qty} pcs</Td>
                    <Td className="text-slate-500">{x.catatan}</Td>
                  </Tr>
                ))}
              </tbody></table></div>
            )}
          </Seksi>

          <Seksi judul={`Barang: Antar Entitas (${b.antarEntitas.length})`} ringkas={`Dikirim ${b.dikirimQty} pcs · Diterima ${b.diterimaQty} pcs`}>
            {b.antarEntitas.length === 0 ? <Kosong teks="Tidak ada kejadian pada hari ini." /> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
                {b.antarEntitas.map((x, i) => (
                  <Tr key={i}>
                    <Td className="text-slate-400 whitespace-nowrap">{x.jam}</Td>
                    <Td className="whitespace-nowrap font-medium">{x.jenis}</Td>
                    <Td className="whitespace-nowrap">{x.kode}</Td>
                    <Td className="whitespace-nowrap">{x.asal} → {x.tujuan}</Td>
                    <Td className="text-right font-medium">{x.qty} pcs{x.selisih > 0 ? ` (selisih ${x.selisih})` : ""}</Td>
                    <Td className="text-slate-500">{[x.daftar, x.catatan].filter(Boolean).join(" · ")}</Td>
                  </Tr>
                ))}
              </tbody></table></div>
            )}
            {b.menggantung.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">
                <div className="mb-1 font-semibold text-amber-700">Masih di jalan (belum diterima)</div>
                {b.menggantung.map((x, i) => (
                  <div key={i}>{x.kode} · {x.asal} → {x.tujuan} · {x.qty} pcs · sejak {x.sejak}</div>
                ))}
              </div>
            )}
          </Seksi>

          <Seksi judul={`Uang: Antar Entitas (${u.antarEntitas.length})`} ringkas={`Total ${fmtRp(u.totalAntarEntitas)}`}>
            {u.antarEntitas.length === 0 ? <Kosong teks="Tidak ada." /> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
                {u.antarEntitas.map((x, i) => (
                  <Tr key={i}>
                    <Td className="text-slate-400 whitespace-nowrap">{x.jam}</Td>
                    <Td className="whitespace-nowrap font-medium">{x.jenis}</Td>
                    <Td>{x.dari} → {x.ke}</Td>
                    <Td className="text-slate-500">{x.rincian ? `${x.rincian} transaksi` : x.keterangan}</Td>
                    <Td className="text-right whitespace-nowrap font-medium">{fmtRp(x.jumlah)}</Td>
                  </Tr>
                ))}
              </tbody></table></div>
            )}
          </Seksi>

          <Seksi judul={`Uang: Antar Kas / Rekening (${u.antarKas.length})`} ringkas={`Total ${fmtRp(u.totalAntarKas)}`}>
            {u.antarKas.length === 0 ? <Kosong teks="Tidak ada." /> : (
              <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
                {u.antarKas.map((x, i) => (
                  <Tr key={i}>
                    <Td className="text-slate-400 whitespace-nowrap">{x.jam}</Td>
                    <Td>{x.dari} → {x.ke}</Td>
                    <Td className="text-slate-500">{x.keterangan}</Td>
                    <Td className="text-right whitespace-nowrap font-medium">{fmtRp(x.jumlah)}</Td>
                  </Tr>
                ))}
              </tbody></table></div>
            )}
          </Seksi>
        </>
      )}
    </div>
  );
}
