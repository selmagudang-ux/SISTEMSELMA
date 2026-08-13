import { Fragment, useRef, useState } from "react";
import { X, Printer } from "lucide-react";
import { fmtRp } from "../lib/api";

// Samakan dengan identitas toko di versi lama (Google Apps Script / Code.gs)
// supaya nota yang dicetak tetap konsisten dengan yang biasa dipakai.
const NAMA_TOKO = "SELMA ACC BANDUNG";
const ALAMAT_TOKO = [
  "Jl. Leuwipanjang No.138 RT 9 RW 4",
  "Situsaeur, Bojongloa Kidul",
  "Kota Bandung, Jawa Barat 40234",
];

// =========================================================
// CETAK NOTA PESANAN GROSIR
// Aturan format nota DISAMAKAN dengan versi lama (Code.gs + Index.html):
//  - Struk thermal 80mm (POS80), lebar konten dibatasi 72mm.
//  - Font monospace + garis putus-putus, BUKAN tabel berbingkai.
//  - Nama produk di baris sendiri; baris berikutnya "qty x harga" (kiri)
//    dan subtotal (kanan) — supaya nama produk panjang tidak terpotong
//    di kertas sempit.
//  - Nota TIDAK menampilkan Toko Pengirim, alamat pelanggan, atau
//    catatan — itu bagian dari fitur Label Pengiriman (terpisah dari Nota).
//  - Tinggi kertas @page DIHITUNG dari tinggi konten asli yang sudah
//    dirender (bukan size:auto). "auto" sering fallback ke ukuran kertas
//    default (A4/Letter) di printer thermal Android/RawBT, sehingga struk
//    kepotong jadi 2 halaman. Makanya di sini tinggi diukur eksplisit
//    lewat getBoundingClientRect, dikonversi px -> mm, + buffer 8mm.
//  - Area cetak selalu dirender DI LUAR LAYAR (position:absolute,
//    left:-99999px) — bukan display:none — supaya tetap bisa diukur
//    tingginya oleh JS, baru "dipindah" ke posisi normal khusus saat print
//    lewat CSS media print (bukan lewat re-render React).
// =========================================================
export function NotaPesananModal({ pesanan, pelanggan, detailItems, totalDibayar, sisaHutang, onClose }) {
  const p = pesanan;
  const printRef = useRef(null);
  const [printing, setPrinting] = useState(false);

  const cetak = () => {
    setPrinting(true);
    // Tunggu 2 animation frame supaya layout sudah settle sebelum diukur
    // (sama seperti versi lama) — memastikan konten sudah ter-render penuh.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = printRef.current;
        if (el) {
          const heightPx = el.getBoundingClientRect().height;
          const heightMm = Math.ceil((heightPx / 96) * 25.4 + 8); // +8mm buffer aman
          let styleTag = document.getElementById("ss-nota-page-style");
          if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = "ss-nota-page-style";
            document.head.appendChild(styleTag);
          }
          styleTag.textContent = `@media print { @page { size: 80mm ${heightMm}mm; margin: 0; } }`;
        }
        window.print();
        setTimeout(() => setPrinting(false), 500);
      });
    });
  };

  return (
    <Fragment>
      {/* ====== Modal preview — disembunyikan total saat print ====== */}
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4 print:hidden">
        <div className="bg-white text-slate-900 rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-sm">Preview Nota</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex justify-center bg-slate-100">
            <NotaIsi pesanan={p} pelanggan={pelanggan} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} />
          </div>
          <div className="px-5 pb-5 pt-3">
            <button
              onClick={cetak}
              disabled={printing}
              className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              <Printer size={15} /> {printing ? "Menyiapkan…" : "Cetak Nota"}
            </button>
          </div>
        </div>
      </div>

      {/* ====== Area cetak sesungguhnya (bukan child dari overlay di atas,
          supaya tidak ikut ke-print:hidden). Selalu ada di DOM (posisi di
          luar layar) supaya tingginya bisa diukur JS kapan saja. ====== */}
      <div style={{ position: "absolute", top: 0, left: "-99999px" }}>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .ss-nota-print, .ss-nota-print * { visibility: visible; }
            .ss-nota-print { position: fixed; top: 0; left: 0; }
            .ss-nota-print table, .ss-nota-print tr, .ss-nota-print .ss-nota-line, .ss-nota-print p {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}</style>
        <div ref={printRef} className="ss-nota-print">
          <NotaIsi pesanan={p} pelanggan={pelanggan} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} />
        </div>
      </div>
    </Fragment>
  );
}

// Isi nota — dipakai baik untuk preview di layar maupun untuk area cetak
// sesungguhnya, supaya keduanya selalu identik.
function NotaIsi({ pesanan: p, pelanggan, detailItems, totalDibayar, sisaHutang }) {
  return (
    <div className="font-mono text-[12px] leading-snug text-black bg-white" style={{ width: "72mm" }}>
      <h2 className="text-center text-[15px] font-bold my-1 tracking-wide">{NAMA_TOKO}</h2>
      <p className="text-center my-0.5">
        {ALAMAT_TOKO.map((line, i) => (
          <span key={i}>
            {line}
            {i < ALAMAT_TOKO.length - 1 && <br />}
          </span>
        ))}
      </p>

      <div className="ss-nota-line border-t border-dashed border-black my-1.5" />

      <p className="my-0.5">
        Tanggal: {p.tanggal}
        <br />
        No. Pesanan: {p.nomor_pesanan}
        <br />
        Pelanggan: {pelanggan ? pelanggan.nama : "—"}
        <br />
        WA: {pelanggan?.wa || "—"}
      </p>

      <div className="ss-nota-line border-t border-dashed border-black my-1.5" />

      <table className="w-full border-collapse">
        <tbody>
          {(detailItems || []).map((d) => (
            <Fragment key={d.id}>
              <tr>
                <td colSpan={2} className="p-0">
                  {d.nama_produk}
                </td>
              </tr>
              <tr>
                <td className="p-0">
                  {d.qty} x {fmtRp(d.harga)}
                </td>
                <td className="p-0 text-right">{fmtRp(d.subtotal)}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="ss-nota-line border-t border-dashed border-black my-1.5" />

      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className="p-0 font-bold">TOTAL</td>
            <td className="p-0 text-right font-bold">{fmtRp(p.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="ss-nota-line border-t border-dashed border-black my-1.5" />

      <p className="my-0.5">
        Status: {p.status_bayar} | Metode: {p.metode_bayar || "—"}
      </p>
      {sisaHutang > 0 && (
        <p className="my-0.5">
          Sudah Dibayar: {fmtRp(totalDibayar)}
          <br />
          Sisa Hutang: {fmtRp(sisaHutang)}
        </p>
      )}

      <div className="ss-nota-line border-t border-dashed border-black my-1.5" />

      <p className="text-center my-0.5">Terima kasih atas pesanan Anda!</p>
    </div>
  );
}

// =========================================================
// CETAK LABEL PENGIRIMAN (PENGIRIM -> PENERIMA)
// Beda dari Nota: label ini fokus buat kurir/ekspedisi, bukan bukti transaksi.
// Yang ditampilkan cuma identitas pengirim (Toko Pengirim yang dipilih di
// pesanan, atau alamat toko utama kalau tidak ada toko dipilih), identitas
// penerima (data Pelanggan: nama, alamat, kota, WA), nomor pesanan, dan
// ringkasan isi paket (nama barang + qty saja, TANPA harga — supaya kalau
// labelnya kelihatan kurir, harga barang tidak ikut terekspos).
// =========================================================
export function LabelPengirimanModal({ pesanan, pelanggan, toko, detailItems, onClose }) {
  const p = pesanan;
  const printRef = useRef(null);
  const [printing, setPrinting] = useState(false);

  const cetak = () => {
    setPrinting(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = printRef.current;
        if (el) {
          const heightPx = el.getBoundingClientRect().height;
          const heightMm = Math.ceil((heightPx / 96) * 25.4 + 8);
          let styleTag = document.getElementById("ss-label-page-style");
          if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = "ss-label-page-style";
            document.head.appendChild(styleTag);
          }
          styleTag.textContent = `@media print { @page { size: 80mm ${heightMm}mm; margin: 0; } }`;
        }
        window.print();
        setTimeout(() => setPrinting(false), 500);
      });
    });
  };

  return (
    <Fragment>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4 print:hidden">
        <div className="bg-white text-slate-900 rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-sm">Preview Label Pengiriman</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex justify-center bg-slate-100">
            <LabelIsi pesanan={p} pelanggan={pelanggan} toko={toko} detailItems={detailItems} />
          </div>
          <div className="px-5 pb-5 pt-3">
            <button
              onClick={cetak}
              disabled={printing}
              className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              <Printer size={15} /> {printing ? "Menyiapkan…" : "Cetak Label"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", top: 0, left: "-99999px" }}>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .ss-label-print, .ss-label-print * { visibility: visible; }
            .ss-label-print { position: fixed; top: 0; left: 0; }
            .ss-label-print table, .ss-label-print tr, .ss-label-print .ss-label-line, .ss-label-print p {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}</style>
        <div ref={printRef} className="ss-label-print">
          <LabelIsi pesanan={p} pelanggan={pelanggan} toko={toko} detailItems={detailItems} />
        </div>
      </div>
    </Fragment>
  );
}

// Isi label — dipakai baik untuk preview di layar maupun area cetak sesungguhnya.
function LabelIsi({ pesanan: p, pelanggan, toko, detailItems }) {
  // Kalau pesanan tidak punya Toko Pengirim (opsional saat buat pesanan),
  // pakai identitas toko utama sebagai pengirim default.
  const namaPengirim = toko ? toko.nama_toko : NAMA_TOKO;
  const alamatPengirim = toko
    ? [toko.alamat, toko.telepon ? `Telp: ${toko.telepon}` : null].filter(Boolean)
    : [...ALAMAT_TOKO];

  return (
    <div className="font-mono text-[12px] leading-snug text-black bg-white" style={{ width: "72mm" }}>
      <h2 className="text-center text-[14px] font-bold my-1 tracking-wide">LABEL PENGIRIMAN</h2>
      <p className="text-center my-0.5">
        No. Pesanan: {p.nomor_pesanan}
        <br />
        Tanggal: {p.tanggal}
      </p>

      <div className="ss-label-line border-t border-dashed border-black my-1.5" />

      <p className="my-0.5 font-bold">PENGIRIM</p>
      <p className="my-0.5">
        {namaPengirim}
        {alamatPengirim.length > 0 && (
          <>
            <br />
            {alamatPengirim.map((line, i) => (
              <span key={i}>
                {line}
                {i < alamatPengirim.length - 1 && <br />}
              </span>
            ))}
          </>
        )}
      </p>

      <div className="ss-label-line border-t border-dashed border-black my-1.5" />

      <p className="my-0.5 font-bold">PENERIMA</p>
      <p className="my-0.5">
        {pelanggan ? pelanggan.nama : "—"}
        {pelanggan?.alamat && (
          <>
            <br />
            {pelanggan.alamat}
          </>
        )}
        {pelanggan?.kota && (
          <>
            <br />
            {pelanggan.kota}
          </>
        )}
        {pelanggan?.wa && (
          <>
            <br />
            WA: {pelanggan.wa}
          </>
        )}
      </p>

      <div className="ss-label-line border-t border-dashed border-black my-1.5" />

      <p className="my-0.5 font-bold">ISI PAKET</p>
      <table className="w-full border-collapse">
        <tbody>
          {(detailItems || []).map((d) => (
            <tr key={d.id}>
              <td className="p-0">{d.nama_produk}</td>
              <td className="p-0 text-right">{d.qty}x</td>
            </tr>
          ))}
        </tbody>
      </table>

      {p.catatan && (
        <>
          <div className="ss-label-line border-t border-dashed border-black my-1.5" />
          <p className="my-0.5">
            Catatan: {p.catatan}
          </p>
        </>
      )}
    </div>
  );
}