// =========================================================
// PDF INVOICE PENAGIHAN / PENCAIRAN (Reseller) — dibuat di browser dengan
// jsPDF (sudah dipakai PdfPemesananSupplier). Satu PDF per pelanggan, berisi
// tiap pesanan: nomor pesanan, tanggal, rincian barang (qty x harga =
// subtotal), lalu total/dibayar/sisa, dan ringkasan di akhir.
// =========================================================
import { jsPDF } from "jspdf";
import { fmtRp } from "./api";

const W = 210;
const H = 297;
const M = 14;
const BOTTOM = H - 16;

const tgl = (v) =>
  (v ? new Date(v) : new Date()).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

// pesanan: [{nomor_pesanan, tanggal, created_at, total, dibayar, sisa, items:[{nama_produk, qty, harga, subtotal}]}]
export function buatPdfInvoice({ jenis, namaUsaha, alamat = [], pelanggan, pesanan, rekeningLabel }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = M;

  const baru = (butuh) => {
    if (y + butuh > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const teks = (s, x, opt) => doc.text(String(s ?? ""), x, y, opt);

  // Kop
  doc.setFont("helvetica", "bold").setFontSize(15);
  teks(namaUsaha, M);
  y += 5.5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  alamat.forEach((a) => {
    teks(a, M);
    y += 4;
  });
  y += 2;
  doc.setDrawColor(150).line(M, y, W - M, y);
  y += 8;

  doc.setFont("helvetica", "bold").setFontSize(14);
  teks(jenis === "penagihan" ? "INVOICE PENAGIHAN" : "INVOICE PENCAIRAN", M);
  y += 7;
  doc.setFont("helvetica", "normal").setFontSize(10);
  teks(`Kepada : ${pelanggan.nama}${pelanggan.kode ? ` (${pelanggan.kode})` : ""}`, M);
  y += 5;
  if (pelanggan.wa) {
    teks(`WA     : ${pelanggan.wa}`, M);
    y += 5;
  }
  teks(`Tanggal: ${tgl()}`, M);
  y += 9;

  const kolom = { no: M, nama: M + 9, qty: 128, harga: 160, sub: W - M };

  pesanan.forEach((ps) => {
    baru(30);
    doc.setFillColor(238, 241, 245).rect(M, y - 4.5, W - M * 2, 7, "F");
    doc.setFont("helvetica", "bold").setFontSize(10);
    teks(`No. Pesanan: ${ps.nomor_pesanan}`, M + 2);
    teks(ps.tanggal || tgl(ps.created_at), W - M - 2, { align: "right" });
    y += 7;

    if ((ps.items || []).length) {
      doc.setFontSize(8.5).setTextColor(100);
      teks("No", kolom.no);
      teks("Barang", kolom.nama);
      teks("Qty", kolom.qty, { align: "right" });
      teks("Harga", kolom.harga, { align: "right" });
      teks("Subtotal", kolom.sub, { align: "right" });
      doc.setTextColor(0);
      y += 4.5;
      doc.setFont("helvetica", "normal").setFontSize(9);
      ps.items.forEach((d, i) => {
        const baris = doc.splitTextToSize(String(d.nama_produk || "-"), kolom.qty - kolom.nama - 14);
        baru(baris.length * 4 + 2);
        teks(i + 1, kolom.no);
        doc.text(baris, kolom.nama, y);
        teks(d.qty, kolom.qty, { align: "right" });
        teks(fmtRp(d.harga), kolom.harga, { align: "right" });
        teks(fmtRp(d.subtotal), kolom.sub, { align: "right" });
        y += baris.length * 4 + 1.5;
      });
    } else {
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(120);
      teks("(rincian barang tidak tersedia)", M + 2);
      doc.setTextColor(0);
      y += 5;
    }

    baru(18);
    doc.setDrawColor(200).line(M, y - 1, W - M, y - 1);
    y += 3.5;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    const ringkas = (label, nilai, tebal) => {
      doc.setFont("helvetica", tebal ? "bold" : "normal");
      teks(label, kolom.harga, { align: "right" });
      teks(nilai, kolom.sub, { align: "right" });
      y += 4.8;
    };
    if (jenis === "penagihan") {
      if (ps.total != null) ringkas("Total pesanan", fmtRp(ps.total));
      if (ps.dibayar) ringkas("Sudah dibayar", fmtRp(ps.dibayar));
      ringkas("Sisa tagihan", fmtRp(ps.sisa), true);
    } else {
      if (ps.total_pesanan != null) ringkas("Total pesanan", fmtRp(ps.total_pesanan));
      ringkas("Dana dicairkan", fmtRp(ps.sisa), true);
    }
    y += 5;
  });

  // Total akhir
  const total = pesanan.reduce((a, p) => a + (Number(p.sisa) || 0), 0);
  baru(28);
  doc.setDrawColor(60).setLineWidth(0.4).line(M, y, W - M, y);
  doc.setLineWidth(0.2);
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(12);
  teks(jenis === "penagihan" ? "TOTAL TAGIHAN" : "TOTAL PENCAIRAN", M);
  teks(fmtRp(total), W - M, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  if (rekeningLabel) {
    teks(jenis === "penagihan" ? `Pembayaran ke: ${rekeningLabel}` : `Dana dikirim dari: ${rekeningLabel}`, M);
    y += 5;
  }
  teks(
    jenis === "penagihan"
      ? "Mohon kirim bukti transfer setelah pembayaran. Terima kasih."
      : "Mohon dicek kembali. Terima kasih.",
    M
  );

  const nama = `Invoice-${jenis}-${String(pelanggan.nama).replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output("blob"), nama };
}
