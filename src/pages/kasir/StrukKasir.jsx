import { Fragment, useRef, useState } from "react";
import { X, Printer, FileDown, MessageCircle, Loader2 } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { tglJamId, pesanWaStruk, linkWaStruk, buatPdfStruk, bagikanAtauUnduhPdf } from "./kasirStruk";

// =========================================================
// KASIR — PREVIEW, CETAK, PDF & WHATSAPP STRUK (fase 4)
// Cetak memakai teknik yang sama dengan NotaGrosir.jsx (sudah terbukti di printer
// thermal 80mm / RawBT): konten lebar 72mm, tinggi kertas @page DIHITUNG dari tinggi
// konten asli (bukan "auto"), area cetak dirender di luar layar supaya tetap bisa
// diukur. Tidak ada perpustakaan printer tambahan.
// =========================================================

function StrukIsi({ s }) {
  const garis = <div className="ss-struk-line border-t border-dashed border-black my-1.5" />;
  const digit = String(s.items.length).length;
  return (
    <div className="font-mono text-[12px] leading-snug text-black bg-white" style={{ width: "72mm" }}>
      {s.identitas.nama && <h2 className="text-center text-[15px] font-bold my-1 tracking-wide">{s.identitas.nama}</h2>}
      {s.identitas.alamat.length > 0 && (
        <p className="text-center my-0.5">
          {s.identitas.alamat.map((line, i) => (
            <span key={i}>
              {line}
              {i < s.identitas.alamat.length - 1 && <br />}
            </span>
          ))}
        </p>
      )}
      {s.salinan && <p className="text-center font-bold my-1">*** CETAK ULANG ***</p>}
      {garis}
      <p className="my-0.5">
        No: {s.nomor}
        <br />
        Tanggal: {tglJamId(s.waktu)}
        {s.kasir && (
          <>
            <br />
            Kasir: {s.kasir}
          </>
        )}
      </p>
      {garis}
      <table className="w-full border-collapse">
        <tbody>
          {s.items.map((it, i) => (
            <Fragment key={`${it.sku}-${i}`}>
              <tr>
                <td colSpan={2} className="p-0">
                  {String(i + 1).padStart(digit, "\u00A0")}. {it.nama}
                </td>
              </tr>
              <tr>
                <td className="p-0" style={{ paddingLeft: `${digit + 2}ch` }}>
                  {it.qty} x {fmtRp(it.harga)}
                </td>
                <td className="p-0 text-right">{fmtRp(it.qty * it.harga)}</td>
              </tr>
              {it.diskon > 0 && (
                <tr>
                  <td className="p-0" style={{ paddingLeft: `${digit + 2}ch` }}>
                    Diskon
                  </td>
                  <td className="p-0 text-right">-{fmtRp(it.diskon)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {garis}
      <table className="w-full border-collapse">
        <tbody>
          {s.diskonTransaksi > 0 && (
            <>
              <tr>
                <td className="p-0">Subtotal</td>
                <td className="p-0 text-right">{fmtRp(s.subtotal)}</td>
              </tr>
              <tr>
                <td className="p-0">Diskon</td>
                <td className="p-0 text-right">-{fmtRp(s.diskonTransaksi)}</td>
              </tr>
            </>
          )}
          <tr>
            <td className="p-0 font-bold">TOTAL</td>
            <td className="p-0 text-right font-bold">{fmtRp(s.total)}</td>
          </tr>
          {s.pembayaran.map((p) => (
            <tr key={p.metode}>
              <td className="p-0">{p.metode}</td>
              <td className="p-0 text-right">{fmtRp(p.jumlah)}</td>
            </tr>
          ))}
          {s.kembalian > 0 && (
            <>
              <tr>
                <td className="p-0">Uang diterima</td>
                <td className="p-0 text-right">{fmtRp(s.bayar)}</td>
              </tr>
              <tr>
                <td className="p-0 font-bold">Kembalian</td>
                <td className="p-0 text-right font-bold">{fmtRp(s.kembalian)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {s.catatan && (
        <>
          {garis}
          <p className="my-0.5">Catatan: {s.catatan}</p>
        </>
      )}
      {garis}
      <p className="text-center my-0.5">Terima kasih sudah berbelanja!</p>
    </div>
  );
}

export default function ModalStruk({ struk, onClose }) {
  const printRef = useRef(null);
  const [mencetak, setMencetak] = useState(false);
  const [bikinPdf, setBikinPdf] = useState(false);
  const [wa, setWa] = useState("");
  const [info, setInfo] = useState("");

  const cetak = () => {
    setMencetak(true);
    // Dua frame supaya layout settle sebelum tinggi diukur (sama seperti NotaGrosir).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = printRef.current;
        if (el) {
          const mm = Math.ceil((el.getBoundingClientRect().height / 96) * 25.4 + 8);
          let tag = document.getElementById("ss-struk-page-style");
          if (!tag) {
            tag = document.createElement("style");
            tag.id = "ss-struk-page-style";
            document.head.appendChild(tag);
          }
          tag.textContent = `@media print { @page { size: 80mm ${mm}mm; margin: 0; } }`;
        }
        window.print();
        setTimeout(() => setMencetak(false), 500);
      })
    );
  };

  const simpanPdf = async () => {
    setBikinPdf(true);
    setInfo("");
    try {
      const hasil = await bagikanAtauUnduhPdf(await buatPdfStruk(struk), pesanWaStruk(struk));
      if (hasil === "diunduh") setInfo("PDF diunduh.");
    } catch (e) {
      setInfo(`Gagal membuat PDF: ${e.message || e}`);
    } finally {
      setBikinPdf(false);
    }
  };

  const kirimWa = () => window.open(linkWaStruk(wa, pesanWaStruk(struk)), "_blank", "noopener");

  return (
    <Fragment>
      <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 print:hidden" onClick={onClose}>
        <div
          className="theme-paper bg-white text-slate-900 rounded-xl w-full max-w-sm max-h-[92vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white z-10">
            <h3 className="font-semibold text-sm">{struk.salinan ? "Cetak Ulang Struk" : "Struk"}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex justify-center bg-slate-100 overflow-x-auto">
            <StrukIsi s={struk} />
          </div>
          <div className="px-5 pt-3 pb-5 space-y-2">
            <button
              onClick={cetak}
              disabled={mencetak}
              className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              <Printer size={15} /> {mencetak ? "Menyiapkan…" : "Cetak Struk"}
            </button>
            <div className="flex gap-2">
              <input
                value={wa}
                onChange={(e) => setWa(e.target.value)}
                inputMode="tel"
                placeholder="No. WA pembeli (opsional)"
                className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500"
              />
              <button
                onClick={kirimWa}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-3 rounded-lg"
              >
                <MessageCircle size={15} /> Kirim
              </button>
            </div>
            <button
              onClick={simpanPdf}
              disabled={bikinPdf}
              className="w-full flex items-center justify-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium text-sm py-2.5 rounded-lg"
            >
              {bikinPdf ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF Struk
            </button>
            {info && <div className="text-xs text-slate-500 text-center">{info}</div>}
            <p className="text-[11px] text-slate-400 text-center">
              Kosongkan nomor WA untuk memilih kontak sendiri di WhatsApp.
            </p>
          </div>
        </div>
      </div>

      {/* Area cetak sesungguhnya: di luar layar (bukan display:none) supaya tinggi bisa diukur. */}
      <div style={{ position: "absolute", top: 0, left: "-99999px" }}>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .ss-struk-print, .ss-struk-print * { visibility: visible; }
            .ss-struk-print { position: fixed; top: 0; left: 0; }
            .ss-struk-print table, .ss-struk-print tr, .ss-struk-print .ss-struk-line, .ss-struk-print p {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}</style>
        <div ref={printRef} className="ss-struk-print">
          <StrukIsi s={struk} />
        </div>
      </div>
    </Fragment>
  );
}
