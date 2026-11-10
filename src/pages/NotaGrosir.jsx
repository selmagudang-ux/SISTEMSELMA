import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Download } from "lucide-react";
import { fmtRp } from "../lib/api";

// Samakan dengan identitas toko di versi lama (Google Apps Script / Code.gs)
// supaya nota yang dicetak tetap konsisten dengan yang biasa dipakai.
const NAMA_TOKO = "SELMA ACC BANDUNG";
const ALAMAT_TOKO = [
  "Jl. Leuwipanjang No.138 RT 9 RW 4",
  "Situsaeur, Bojongloa Kidul",
  "Kota Bandung, Jawa Barat 40234",
];
// Kop nota/label bawaan = Selma. PT lain (mis. Alivia) mengirim `identitas`
// ({ nama, alamat: [] }) dari ModalRouter supaya tidak ikut mencetak nama & alamat Selma.
const IDENTITAS_SELMA = { nama: NAMA_TOKO, alamat: ALAMAT_TOKO };

// Area cetak sesungguhnya (nota / label). Dirender lewat portal LANGSUNG di <body>, di luar
// #root, lalu saat print semua elemen lain di <body> di-display:none. Dulu pakai
// `body * { visibility: hidden }` — visibility:hidden TIDAK melepas ruang layout, jadi isi halaman
// Grosir di belakang modal ikut dihitung sebagai halaman cetak tak kasat mata, dan area nota
// (position: fixed) diulang di SETIAP halaman itu -> struk tercetak beberapa lembar.
// Saat di layar, area ini tetap di luar layar (left:-99999px) supaya tingginya bisa diukur;
// `aktif` baru bernilai true setelah tombol Cetak ditekan.
function AreaCetak({ kelas, aktif, innerRef, children }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ss-print-root" data-aktif={aktif ? "1" : "0"} style={{ position: "absolute", top: 0, left: "-99999px" }}>
      <style>{`
        @media print {
          body > *:not(.ss-print-root[data-aktif="1"]) { display: none !important; }
          .ss-print-root { position: static !important; left: auto !important; top: auto !important; }
          .${kelas} table, .${kelas} tr, .${kelas} p, .${kelas} .ss-nota-line, .${kelas} .ss-label-line {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
      <div ref={innerRef} className={kelas}>
        {children}
      </div>
    </div>,
    document.body
  );
}

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
export function NotaPesananModal({ pesanan, pelanggan, detailItems, totalDibayar, sisaHutang, pembayaran, identitas = IDENTITAS_SELMA, bolehSimpanPdf = true, onClose }) {
  const p = pesanan;
  const printRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  const [menyimpanPdf, setMenyimpanPdf] = useState(false);

  // Simpan nota sebagai file PDF (struk 80mm, satu halaman) — dibuat langsung dengan jsPDF,
  // modulnya baru dimuat saat tombol ditekan supaya tidak menambah ukuran bundle awal.
  const simpanPdf = async () => {
    if (menyimpanPdf) return;
    setMenyimpanPdf(true);
    try {
      const { simpanPdfNotaGrosir } = await import("../lib/PdfNotaGrosir");
      simpanPdfNotaGrosir({ pesanan: p, pelanggan, detailItems, totalDibayar, sisaHutang, pembayaran, identitas });
    } catch (err) {
      window.alert(`Gagal membuat PDF nota: ${err?.message || err}`);
    } finally {
      setMenyimpanPdf(false);
    }
  };

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
        <div className="theme-paper bg-white text-slate-900 rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-sm">Preview Nota</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex justify-center bg-slate-100">
            <NotaIsi pesanan={p} pelanggan={pelanggan} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} pembayaran={pembayaran} identitas={identitas} />
          </div>
          <div className="px-5 pb-5 pt-3 flex gap-2">
            <button
              onClick={cetak}
              disabled={printing}
              className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              <Printer size={15} /> {printing ? "Menyiapkan…" : "Cetak Nota"}
            </button>
            {bolehSimpanPdf && (
              <button
                onClick={simpanPdf}
                disabled={menyimpanPdf}
                className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-semibold text-sm py-2.5 rounded-lg"
              >
                <Download size={15} /> {menyimpanPdf ? "Membuat PDF…" : "Simpan PDF"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ====== Area cetak sesungguhnya — portal ke <body> (lihat AreaCetak). Selalu ada
          (di luar layar) supaya tingginya bisa diukur JS kapan saja. ====== */}
      <AreaCetak kelas="ss-nota-print" aktif={printing} innerRef={printRef}>
        <NotaIsi pesanan={p} pelanggan={pelanggan} detailItems={detailItems} totalDibayar={totalDibayar} sisaHutang={sisaHutang} pembayaran={pembayaran} identitas={identitas} />
      </AreaCetak>
    </Fragment>
  );
}

// Isi nota — dipakai baik untuk preview di layar maupun untuk area cetak
// sesungguhnya, supaya keduanya selalu identik.
function NotaIsi({ pesanan: p, pelanggan, detailItems, totalDibayar, sisaHutang, pembayaran, identitas = IDENTITAS_SELMA }) {
  // Field metode_bayar di header pesanan cuma keisi kalau pesanan lunas
  // LANGSUNG saat dibuat. Kalau lunasnya belakangan lewat "Catat Pembayaran"
  // (cicil/nyusul), header itu tetap kosong walau status_bayar sudah
  // "Lunas" — makanya di struk kelihatan "Metode: -" padahal sudah lunas.
  // Di sini diambil dari riwayat grosir_pembayaran pesanan ini sebagai
  // cadangan; kalau metodenya campur (mis. sebagian Cash, sebagian
  // Transfer), semua metode unik digabung dengan koma.
  const metodeDariRiwayat = [...new Set((pembayaran || []).map((b) => b.metode_bayar).filter(Boolean))].join(", ");
  const metodeTampil = p.metode_bayar || metodeDariRiwayat || "—";

  return (
    <div className="font-mono text-[12px] leading-snug text-black bg-white" style={{ width: "72mm" }}>
      <h2 className="text-center text-[15px] font-bold my-1 tracking-wide">{identitas.nama}</h2>
      <p className="text-center my-0.5">
        {identitas.alamat.map((line, i) => (
          <span key={i}>
            {line}
            {i < identitas.alamat.length - 1 && <br />}
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
          {(() => {
            // Lebar nomor urut mengikuti jumlah digit terbanyak (mis. kalau ada
            // 10+ item, nomor 1-9 diberi padding spasi di depan supaya "1." dan
            // "10." sama lebar — baris qty di bawahnya jadi selalu sejajar
            // persis, tidak cuma pas waktu itemnya masih 1 digit semua).
            const totalDigits = String((detailItems || []).length).length;
            const indentCh = totalDigits + 2; // + ". " setelah nomor
            return (detailItems || []).map((d, i) => (
              <Fragment key={d.id}>
                <tr>
                  <td colSpan={2} className="p-0">
                    {String(i + 1).padStart(totalDigits, "\u00A0")}. {d.nama_produk}
                  </td>
                </tr>
                <tr>
                  <td className="p-0" style={{ paddingLeft: `${indentCh}ch` }}>
                    {d.qty} x {fmtRp(d.harga)}
                  </td>
                  <td className="p-0 text-right">{fmtRp(d.subtotal)}</td>
                </tr>
              </Fragment>
            ));
          })()}
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
        Status: {p.status_bayar} | Metode: {metodeTampil}
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
// pesanan, atau alamat toko utama kalau tidak ada toko dipilih) dan identitas
// penerima (data Pelanggan: nama, alamat, kota, WA). Daftar isi barang
// sengaja tidak ditampilkan di label ini.
// =========================================================
export function LabelPengirimanModal({ pesanan, pelanggan, toko, tokoOptions, onGantiToko, detailItems, identitas = IDENTITAS_SELMA, onClose }) {
  const p = pesanan;
  const printRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  // Toko pengirim bisa diganti langsung dari sini (dulu cuma ikut apa yang
  // tersimpan di pesanan). Pilihan baru langsung disimpan ke pesanan lewat
  // onGantiToko supaya konsisten dipakai lagi kalau label dicetak ulang.
  const [tokoIdTerpilih, setTokoIdTerpilih] = useState(toko?.id ?? "");
  const [menyimpanToko, setMenyimpanToko] = useState(false);
  const tokoAktif = (tokoOptions || []).find((t) => t.id === tokoIdTerpilih) || null;

  const gantiToko = async (e) => {
    const val = e.target.value;
    setTokoIdTerpilih(val);
    if (!onGantiToko) return;
    setMenyimpanToko(true);
    try {
      await onGantiToko(val || null);
    } finally {
      setMenyimpanToko(false);
    }
  };

  const cetak = () => {
    setPrinting(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Label pengiriman pakai ukuran kertas TETAP 100mm x 150mm
        // (bukan dihitung dari tinggi konten seperti nota thermal).
        let styleTag = document.getElementById("ss-label-page-style");
        if (!styleTag) {
          styleTag = document.createElement("style");
          styleTag.id = "ss-label-page-style";
          document.head.appendChild(styleTag);
        }
        styleTag.textContent = `@media print { @page { size: 100mm 150mm; margin: 0; } }`;
        window.print();
        setTimeout(() => setPrinting(false), 500);
      });
    });
  };

  return (
    <Fragment>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4 print:hidden">
        <div className="theme-paper bg-white text-slate-900 rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-sm">Preview Label Pengiriman</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 pt-4 pb-1">
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">
                Toko Pengirim {menyimpanToko && <span className="text-amber-500">(menyimpan…)</span>}
              </div>
              <select
                value={tokoIdTerpilih}
                onChange={gantiToko}
                disabled={menyimpanToko}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
              >
                <option value="">— Alamat Toko Utama —</option>
                {(tokoOptions || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama_toko} ({t.kode})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="p-5 flex justify-center bg-slate-100">
            <LabelIsi pesanan={p} pelanggan={pelanggan} toko={tokoAktif} detailItems={detailItems} identitas={identitas} />
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

      <AreaCetak kelas="ss-label-print" aktif={printing} innerRef={printRef}>
        <LabelIsi pesanan={p} pelanggan={pelanggan} toko={tokoAktif} detailItems={detailItems} identitas={identitas} />
      </AreaCetak>
    </Fragment>
  );
}

// Isi label — dipakai baik untuk preview di layar maupun area cetak sesungguhnya.
// Format ringkas: cuma PENGIRIM dan PENERIMA — muat di kertas 100x150mm.
function LabelIsi({ pesanan: p, pelanggan, toko, detailItems, identitas = IDENTITAS_SELMA }) {
  // Kalau pesanan tidak punya Toko Pengirim (opsional saat buat pesanan),
  // pakai identitas toko utama sebagai pengirim default.
  const namaPengirim = toko ? toko.nama_toko : identitas.nama;
  const alamatPengirim = toko
    ? [toko.alamat, toko.telepon ? `Telp: ${toko.telepon}` : null].filter(Boolean)
    : [...identitas.alamat];

  return (
    <div
      className="font-mono leading-snug text-black bg-white"
      style={{ width: "100mm", height: "150mm", padding: "6mm", boxSizing: "border-box", fontSize: "13px" }}
    >
      <h2 className="text-center text-[18px] font-bold mb-2 tracking-wide">LABEL PENGIRIMAN</h2>

      <div className="ss-label-line border-t-2 border-dashed border-black my-2" />

      <p className="mb-0.5 font-bold text-[13px]">PENGIRIM</p>
      <p className="mb-2">
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

      <div className="ss-label-line border-t-2 border-dashed border-black my-2" />

      <p className="mb-0.5 font-bold text-[14px]">PENERIMA</p>
      <p className="mb-2 text-[15px]">
        <span className="font-bold">{pelanggan ? pelanggan.nama : "—"}</span>
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
    </div>
  );
}