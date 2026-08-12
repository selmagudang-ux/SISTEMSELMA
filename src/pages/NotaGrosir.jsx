import { X, Printer } from "lucide-react";
import { fmtRp } from "../lib/api";

// =========================================================
// CETAK NOTA PESANAN GROSIR
// Modal khusus (bukan pakai ModalShell) supaya area cetaknya bisa dikontrol
// sendiri lewat trik "visibility" — pas print, SEMUA elemen di <body>
// disembunyikan (visibility:hidden) kecuali .ss-nota-print & isinya, lalu
// area nota dilepas dari alur modal (position:absolute, top:0) supaya
// tercetak normal dari atas halaman, tidak kepotong batas tinggi modal.
// Pendekatan ini lebih aman lintas-browser dibanding cuma andalkan class
// print:hidden Tailwind, khususnya karena kontennya ada di dalam modal
// (fixed + overflow-y-auto) yang gampang kepotong saat print biasa.
// =========================================================
export function NotaPesananModal({ pesanan, pelanggan, toko, detailItems, totalDibayar, sisaHutang, onClose }) {
  const p = pesanan;
  const cetak = () => window.print();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4 print:hidden">
      <div className="bg-white text-slate-900 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto print:hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-sm">Preview Nota</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <NotaIsi pesanan={p} pelanggan={pelanggan} toko={toko} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} />
        </div>
        <div className="px-5 pb-5">
          <button
            onClick={cetak}
            className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
          >
            <Printer size={15} /> Cetak Nota
          </button>
        </div>
      </div>

      {/* ====== Area cetak sesungguhnya — hanya tampil saat print ====== */}
      <div className="hidden print:block ss-nota-print">
        <style>{`
          @media print {
            @page { size: A5 portrait; margin: 10mm; }
            body * { visibility: hidden; }
            .ss-nota-print, .ss-nota-print * { visibility: visible; }
            .ss-nota-print {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              color: #000;
            }
          }
        `}</style>
        <NotaIsi pesanan={p} pelanggan={pelanggan} toko={toko} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} cetak />
      </div>
    </div>
  );
}

function NotaIsi({ pesanan: p, pelanggan, toko, detailItems, totalDibayar, sisaHutang, cetak }) {
  return (
    <div className={cetak ? "font-sans text-[11px] leading-snug" : "font-sans text-xs leading-snug"}>
      <div className="text-center mb-3 pb-2 border-b-2 border-slate-800">
        <div className="font-bold text-base">SISTEM SELMA</div>
        <div className="text-[10px] text-slate-500">Nota Pesanan Grosir</div>
      </div>

      <div className="flex justify-between mb-1">
        <span className="text-slate-500">No. Pesanan</span>
        <span className="font-mono font-semibold">{p.nomor_pesanan}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span className="text-slate-500">Tanggal</span>
        <span>{p.tanggal}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span className="text-slate-500">Pelanggan</span>
        <span className="text-right">{pelanggan ? `${pelanggan.nama} (${pelanggan.kode})` : "—"}</span>
      </div>
      {pelanggan?.alamat || pelanggan?.kota ? (
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">Alamat</span>
          <span className="text-right">{[pelanggan.alamat, pelanggan.kota].filter(Boolean).join(", ")}</span>
        </div>
      ) : null}
      {pelanggan?.wa && (
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">WA</span>
          <span>{pelanggan.wa}</span>
        </div>
      )}
      {toko && (
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">Toko Pengirim</span>
          <span className="text-right">{toko.nama_toko}</span>
        </div>
      )}
      <div className="flex justify-between mb-2">
        <span className="text-slate-500">Metode Bayar</span>
        <span>{p.metode_bayar || "—"}</span>
      </div>

      <table className="w-full border-collapse mb-2">
        <thead>
          <tr className="border-y border-slate-800">
            <th className="text-left py-1 font-semibold">Item</th>
            <th className="text-center py-1 font-semibold w-10">Qty</th>
            <th className="text-right py-1 font-semibold w-16">Harga</th>
            <th className="text-right py-1 font-semibold w-16">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {(detailItems || []).map((d) => (
            <tr key={d.id} className="border-b border-dashed border-slate-300">
              <td className="py-1 pr-1">{d.nama_produk}</td>
              <td className="py-1 text-center">{d.qty}</td>
              <td className="py-1 text-right">{fmtRp(d.harga)}</td>
              <td className="py-1 text-right">{fmtRp(d.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between font-bold text-sm border-t-2 border-slate-800 pt-1.5 mb-0.5">
        <span>Total</span>
        <span>{fmtRp(p.total)}</span>
      </div>
      <div className="flex justify-between mb-0.5">
        <span className="text-slate-500">Sudah Dibayar</span>
        <span>{fmtRp(totalDibayar)}</span>
      </div>
      <div className="flex justify-between font-semibold mb-2">
        <span>{sisaHutang > 0 ? "Sisa Hutang" : "Status"}</span>
        <span>{sisaHutang > 0 ? fmtRp(sisaHutang) : "LUNAS"}</span>
      </div>

      {p.catatan && (
        <div className="mb-2 pt-2 border-t border-dashed border-slate-300">
          <span className="text-slate-500">Catatan: </span>
          {p.catatan}
        </div>
      )}

      <div className="text-center text-[10px] text-slate-500 pt-3 mt-2 border-t border-slate-800">
        Terima kasih atas pesanan Anda
      </div>
    </div>
  );
}