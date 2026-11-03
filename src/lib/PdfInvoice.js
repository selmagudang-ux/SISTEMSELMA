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

// =========================================================
// PDF DARI RIWAYAT — satu dokumen per baris riwayat:
//  - jenis "lunas"     : bukti penagihan hutang yang sudah dibayar. Judul
//                        "INVOICE LUNAS" kalau pesanan sudah tidak ada sisa,
//                        selain itu "BUKTI PEMBAYARAN" (cicilan).
//  - jenis "pencairan" : "BUKTI PENCAIRAN" dana ke pelanggan, lengkap dengan
//                        foto bukti transfer kalau ada.
// Dibuat di browser dari data yang SUDAH tersimpan (grosir_pembayaran /
// grosir_deposit), tidak ada tabel baru.
// =========================================================
const muatGambar = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("gagal memuat gambar");
  const blob = await res.blob();
  const dataUrl = await new Promise((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = gagal;
    r.readAsDataURL(blob);
  });
  const dim = await new Promise((ok, gagal) => {
    const im = new Image();
    im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = gagal;
    im.src = dataUrl;
  });
  const fmt = /image\/png/i.test(blob.type) ? "PNG" : "JPEG";
  return { dataUrl, fmt, ...dim };
};

// entri: {tanggal, jumlah, metode, catatan}; pesanan: {nomor_pesanan, total, dibayarTotal, sisa, items} | null
export async function buatPdfRiwayat({ jenis, namaUsaha, alamat = [], pelanggan, entri, pesanan, buktiUrl }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = M;
  const baru = (butuh) => {
    if (y + butuh > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const teks = (s, x, opt) => doc.text(String(s ?? ""), x, y, opt);

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

  const lunas = jenis === "lunas" && pesanan && Number(pesanan.sisa) <= 0.0001;
  const judul = jenis === "pencairan" ? "BUKTI PENCAIRAN" : lunas ? "INVOICE LUNAS" : "BUKTI PEMBAYARAN";
  doc.setFont("helvetica", "bold").setFontSize(14);
  teks(judul, M);
  if (jenis === "pencairan" || lunas) {
    const cap = jenis === "pencairan" ? "DIBAYAR" : "LUNAS";
    doc.setFontSize(16).setTextColor(22, 140, 80).setDrawColor(22, 140, 80).setLineWidth(0.6);
    doc.roundedRect(W - M - 38, y - 8, 38, 12, 2, 2);
    teks(cap, W - M - 19, { align: "center" });
    doc.setTextColor(0).setDrawColor(150).setLineWidth(0.2);
  }
  y += 7;
  doc.setFont("helvetica", "normal").setFontSize(10);
  teks(`${jenis === "pencairan" ? "Dibayarkan kepada" : "Diterima dari"} : ${pelanggan.nama}${pelanggan.kode ? ` (${pelanggan.kode})` : ""}`, M);
  y += 5;
  teks(`Tanggal ${jenis === "pencairan" ? "pencairan" : "pembayaran"} : ${tgl(entri.tanggal)}`, M);
  y += 5;
  if (entri.metode) {
    teks(`Metode : ${entri.metode}`, M);
    y += 5;
  }
  if (entri.catatan) {
    const baris = doc.splitTextToSize(`Keterangan : ${entri.catatan}`, W - M * 2);
    doc.text(baris, M, y);
    y += baris.length * 5;
  }
  y += 5;

  if (pesanan) {
    const kolom = { no: M, nama: M + 9, qty: 128, harga: 160, sub: W - M };
    doc.setFillColor(238, 241, 245).rect(M, y - 4.5, W - M * 2, 7, "F");
    doc.setFont("helvetica", "bold").setFontSize(10);
    teks(`No. Pesanan: ${pesanan.nomor_pesanan}`, M + 2);
    y += 7;
    if ((pesanan.items || []).length) {
      doc.setFontSize(8.5).setTextColor(100);
      teks("No", kolom.no);
      teks("Barang", kolom.nama);
      teks("Qty", kolom.qty, { align: "right" });
      teks("Harga", kolom.harga, { align: "right" });
      teks("Subtotal", kolom.sub, { align: "right" });
      doc.setTextColor(0);
      y += 4.5;
      doc.setFont("helvetica", "normal").setFontSize(9);
      pesanan.items.forEach((d, i) => {
        const baris = doc.splitTextToSize(String(d.nama_produk || "-"), kolom.qty - kolom.nama - 14);
        baru(baris.length * 4 + 2);
        teks(i + 1, kolom.no);
        doc.text(baris, kolom.nama, y);
        teks(d.qty, kolom.qty, { align: "right" });
        teks(fmtRp(d.harga), kolom.harga, { align: "right" });
        teks(fmtRp(d.subtotal), kolom.sub, { align: "right" });
        y += baris.length * 4 + 1.5;
      });
    }
    baru(24);
    doc.setDrawColor(200).line(M, y - 1, W - M, y - 1);
    y += 3.5;
    const ringkas = (label, nilai, tebal) => {
      doc.setFont("helvetica", tebal ? "bold" : "normal").setFontSize(9.5);
      teks(label, kolom.harga, { align: "right" });
      teks(nilai, kolom.sub, { align: "right" });
      y += 4.8;
    };
    if (jenis === "lunas") {
      if (pesanan.total != null) ringkas("Total pesanan", fmtRp(pesanan.total));
      ringkas("Total sudah dibayar", fmtRp(pesanan.dibayarTotal));
      ringkas("Sisa tagihan", fmtRp(pesanan.sisa), true);
    } else if (pesanan.total != null) {
      ringkas("Total pesanan", fmtRp(pesanan.total));
    }
    y += 4;
  }

  baru(20);
  doc.setDrawColor(60).setLineWidth(0.4).line(M, y, W - M, y);
  doc.setLineWidth(0.2);
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(12);
  teks(jenis === "pencairan" ? "JUMLAH DICAIRKAN" : "JUMLAH DIBAYAR", M);
  teks(fmtRp(entri.jumlah), W - M, { align: "right" });
  y += 10;

  if (jenis === "pencairan") {
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    if (buktiUrl) {
      try {
        const g = await muatGambar(buktiUrl);
        const maxW = 90;
        const maxH = BOTTOM - y - 8;
        const lebar = Math.min(maxW, (g.w / g.h) * Math.min(maxH, 120));
        const tinggi = (g.h / g.w) * lebar;
        baru(tinggi + 10);
        teks("Bukti transfer:", M);
        y += 3;
        doc.addImage(g.dataUrl, g.fmt, M, y, lebar, tinggi);
        y += tinggi + 4;
      } catch {
        teks("Bukti transfer: ada (foto tidak dapat disematkan, lihat di menu Riwayat).", M);
        y += 5;
      }
    } else {
      doc.setTextColor(120);
      teks("Bukti transfer: belum diunggah.", M);
      doc.setTextColor(0);
      y += 5;
    }
  }

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
  teks("Terima kasih.", M);
  doc.setTextColor(0);

  const nama = `${jenis === "pencairan" ? "Bukti-Pencairan" : lunas ? "Invoice-Lunas" : "Bukti-Pembayaran"}-${String(pelanggan.nama).replace(/[^\w-]+/g, "_")}-${new Date(entri.tanggal || Date.now()).toISOString().slice(0, 10)}.pdf`;
  return { blob: doc.output("blob"), nama };
}