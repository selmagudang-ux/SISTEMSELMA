// =========================================================
// PDF TRANSFER ANTAR ENTITAS — surat jalan (A5) dan label paket (10 x 15 cm).
// Dibuat di browser dengan jsPDF dari data transfer_barang yang SUDAH tersimpan,
// tidak ada tabel baru. Barcode kode transfer memakai Code 128 (lib/code128.js),
// jadi bisa dipindai lagi dengan scanner yang sama dengan barcode SKU.
//
// pengirim / penerima: { nama, alamat: [baris, ...], telepon } — dari profil perusahaan
// (namaUsahaEntitas, alamatEntitas & teleponEntitas di lib/api.js).
// =========================================================
import { jsPDF } from "jspdf";
import { encodeCode128B } from "./code128";
import { kodeTerima } from "./kodeTransfer";

const tglWaktu = (v) =>
  (v ? new Date(v) : new Date()).toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Gambar barcode Code 128 sebagai deretan kotak hitam. Lebar otomatis menyesuaikan maxW.
function gambarBarcode(doc, teks, x, y, maxW, tinggi) {
  const pola = encodeCode128B(teks);
  if (!pola) return 0;
  const modul = Math.min(0.5, maxW / pola.length);
  doc.setFillColor(0, 0, 0);
  let i = 0;
  while (i < pola.length) {
    if (pola[i] === "1") {
      let j = i;
      while (j < pola.length && pola[j] === "1") j++;
      doc.rect(x + i * modul, y, (j - i) * modul, tinggi, "F");
      i = j;
    } else {
      i++;
    }
  }
  return pola.length * modul;
}

const rapikanNama = (s) => String(s || "transfer").replace(/[^\w-]+/g, "_");

// ---------------------------------------------------------
// SURAT JALAN (A5 portrait, otomatis lanjut halaman kalau SKU banyak)
// t: baris transfer_barang { kode, created_at, catatan, items:[{sku, qty}] }
// ---------------------------------------------------------
export function buatSuratJalan({ t, pengirim, penerima }) {
  const W = 148;
  const H = 210;
  const M = 10;
  const BOTTOM = H - 40; // sisakan ruang untuk tanda tangan di halaman terakhir
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  let y = M;
  const teks = (s, x, opt) => doc.text(String(s ?? ""), x, y, opt);

  // Kop pengirim
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.splitTextToSize(String(pengirim?.nama || ""), W - M * 2).forEach((b) => {
    teks(b, M);
    y += 5;
  });
  doc.setFont("helvetica", "normal").setFontSize(8);
  (pengirim?.alamat || []).forEach((a) => {
    doc.splitTextToSize(String(a), W - M * 2).forEach((b) => {
      teks(b, M);
      y += 3.6;
    });
  });
  if (pengirim?.telepon) {
    teks(`Telp: ${pengirim.telepon}`, M);
    y += 3.6;
  }
  y += 1;
  doc.setDrawColor(150).line(M, y, W - M, y);
  y += 6;

  doc.setFont("helvetica", "bold").setFontSize(13);
  teks("SURAT JALAN", M);
  doc.setFontSize(9);
  teks(t.kode, W - M, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  teks(`Tanggal kirim: ${tglWaktu(t.created_at)}`, M);
  y += 5;

  // Barcode KODE TERIMA — dipindai penerima di aplikasi untuk membuka form penerimaan.
  const kt = kodeTerima(t);
  const lebar = gambarBarcode(doc, kt, M, y, W - M * 2, 10);
  if (lebar) y += 12;
  doc.setFont("helvetica", "bold").setFontSize(9);
  teks(`KODE TERIMA: ${kt}`, M);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  teks("Scan / ketik kode ini di aplikasi saat menerima barang", W - M, { align: "right" });
  y += 6;

  // Kepada
  doc.setFont("helvetica", "bold").setFontSize(8.5);
  teks("KEPADA", M);
  y += 4.5;
  doc.setFontSize(10);
  teks(penerima?.nama || "", M);
  y += 4.5;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  (penerima?.alamat || []).forEach((a) => {
    doc.splitTextToSize(String(a), W - M * 2).forEach((b) => {
      teks(b, M);
      y += 3.8;
    });
  });
  if (penerima?.telepon) {
    teks(`Telp: ${penerima.telepon}`, M);
    y += 3.8;
  }
  y += 3;

  // Tabel barang
  const kol = { no: M, sku: M + 8, qty: W - M - 22, cek: W - M };
  const kepalaTabel = () => {
    doc.setFillColor(238, 241, 245).rect(M, y - 4, W - M * 2, 6, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5);
    teks("No", kol.no + 1);
    teks("SKU", kol.sku);
    teks("Qty", kol.qty, { align: "right" });
    teks("Diterima", kol.cek - 1, { align: "right" });
    y += 6;
    doc.setFont("helvetica", "normal").setFontSize(8.5);
  };
  kepalaTabel();

  const items = t.items || [];
  let totalQty = 0;
  items.forEach((it, i) => {
    if (y + 6 > BOTTOM) {
      doc.addPage();
      y = M;
      kepalaTabel();
    }
    totalQty += Number(it.qty) || 0;
    teks(i + 1, kol.no + 1);
    teks(it.sku, kol.sku);
    teks(`${it.qty} pcs`, kol.qty, { align: "right" });
    // kotak kosong untuk dicentang / diisi penerima saat mengecek barang
    doc.setDrawColor(120).rect(kol.cek - 14, y - 3.3, 14, 4.6);
    doc.setDrawColor(225).line(M, y + 2, W - M, y + 2);
    y += 6;
  });

  y += 1;
  doc.setFont("helvetica", "bold").setFontSize(9);
  teks(`Total: ${items.length} SKU · ${totalQty} pcs`, M);
  y += 5;
  if (t.catatan) {
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    doc.splitTextToSize(`Catatan: ${t.catatan}`, W - M * 2).forEach((b) => {
      teks(b, M);
      y += 3.8;
    });
  }

  // Tanda tangan di halaman terakhir (posisi tetap di bawah halaman)
  const yTtd = H - 32;
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  const lebarKol = (W - M * 2) / 3;
  ["Pengirim", "Kurir", "Penerima"].forEach((label, i) => {
    const cx = M + lebarKol * i + lebarKol / 2;
    doc.text(label, cx, yTtd, { align: "center" });
    doc.setDrawColor(120).line(cx - lebarKol / 2 + 4, yTtd + 20, cx + lebarKol / 2 - 4, yTtd + 20);
    doc.text("Nama / tanggal", cx, yTtd + 24, { align: "center" });
  });

  return { blob: doc.output("blob"), nama: `SuratJalan-${rapikanNama(t.kode)}.pdf` };
}

// ---------------------------------------------------------
// LABEL PAKET (10 x 15 cm), satu halaman: hanya penerima (KEPADA) dan pengirim.
// ---------------------------------------------------------
export function buatLabelPaket({ pengirim, penerima }) {
  const W = 100;
  const H = 150;
  const M = 6;
  const doc = new jsPDF({ unit: "mm", format: [W, H] });

  {
    let y = M + 4;
    const teks = (s, x, opt) => doc.text(String(s ?? ""), x, y, opt);

    doc.setDrawColor(0).setLineWidth(0.6).rect(3, 3, W - 6, H - 6);

    doc.setFont("helvetica", "bold").setFontSize(9);
    teks("KEPADA", M + 1);
    y += 7;

    doc.setFontSize(17);
    doc.splitTextToSize(String(penerima?.nama || ""), W - M * 2 - 2).slice(0, 2).forEach((b) => {
      teks(b, M + 1);
      y += 7;
    });
    doc.setFont("helvetica", "normal").setFontSize(10);
    (penerima?.alamat || []).slice(0, 5).forEach((a) => {
      doc.splitTextToSize(String(a), W - M * 2 - 2).forEach((b) => {
        teks(b, M + 1);
        y += 4.6;
      });
    });

    if (penerima?.telepon) {
      doc.setFont("helvetica", "bold").setFontSize(11);
      teks(`Telp: ${penerima.telepon}`, M + 1);
      y += 5;
      doc.setFont("helvetica", "normal");
    }

    // Pengirim
    y = Math.max(y + 3, 70);
    doc.setLineWidth(0.3).setDrawColor(120).line(M, y, W - M, y);
    y += 5;
    doc.setFont("helvetica", "bold").setFontSize(8);
    teks("PENGIRIM", M + 1);
    y += 4.5;
    doc.setFontSize(10);
    teks(pengirim?.nama || "", M + 1);
    y += 4.2;
    doc.setFont("helvetica", "normal").setFontSize(8);
    (pengirim?.alamat || []).slice(0, 3).forEach((a) => {
      doc.splitTextToSize(String(a), W - M * 2 - 2).forEach((b) => {
        teks(b, M + 1);
        y += 3.8;
      });
    });
    if (pengirim?.telepon) {
      teks(`Telp: ${pengirim.telepon}`, M + 1);
      y += 3.8;
    }
  }

  return { blob: doc.output("blob"), nama: `Label-${rapikanNama(penerima?.nama)}.pdf` };
}
