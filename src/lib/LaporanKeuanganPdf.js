// =========================================================
// GENERATE PDF "LAPORAN BULANAN" & "REKAP TAHUNAN"
// Mengikuti gaya visual workbook SELMA_FINANCE.xlsx (pita judul navy,
// header kolom biru, baris section & subtotal biru muda, baris
// Laba/Rugi Bersih navy dengan teks putih). Semua proses di browser,
// tidak ada data yang dikirim ke server manapun.
// =========================================================
import { jsPDF } from "jspdf";

// ----- Palet warna (disamakan dengan tema Excel) -----
const NAVY = [31, 56, 100]; // #1F3864 — pita judul & baris Laba/Rugi Bersih
const BLUE_HEADER = [46, 83, 149]; // #2E5395 — header kolom
const BLUE_SECTION = [220, 230, 241]; // #DCE6F1 — baris section (PENDAPATAN/PENGELUARAN)
const BLUE_SUBTOTAL = [237, 242, 250]; // #EDF2FA — baris subtotal
const RED_MINUS = [200, 30, 30];
const GREY_LINE = [210, 216, 224];
const WHITE = [255, 255, 255];
const BLACK = [20, 20, 20];

const BULAN_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Format angka ala Excel (#,##0;[RED](#,##0);-): 0 -> "-", negatif -> "(1.234)"
// warna merah, positif -> "1.234" (titik sebagai pemisah ribuan, gaya Indonesia).
function fmtAngka(n) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return { text: "-", negative: false };
  if (v < 0) return { text: `(${Math.abs(v).toLocaleString("id-ID")})`, negative: true };
  return { text: v.toLocaleString("id-ID"), negative: false };
}

function drawCellNumber(doc, text, x, w, y, { bold = false, negative = false, size = 7, color = null } = {}) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  if (color) doc.setTextColor(...color);
  else if (negative) doc.setTextColor(...RED_MINUS);
  else doc.setTextColor(...BLACK);
  doc.text(text, x + w - 2, y, { align: "right" });
}

// =========================================================
// LAPORAN BULANAN — landscape A4, 1 tahun: kategori x 12 bulan + Total
// =========================================================
export function generateLaporanBulananPdf({ tahun, data, namaUsaha = "SELMA ACC BANDUNG" }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const PAGE_W = 297;
  const PAGE_H = 210;
  const MARGIN = 10;

  const colKategoriW = 50;
  const colTotalW = 24;
  const bulanAreaW = PAGE_W - MARGIN * 2 - colKategoriW - colTotalW;
  const colBulanW = bulanAreaW / 12;

  const xKategori = MARGIN;
  const xBulan = (i) => xKategori + colKategoriW + i * colBulanW;
  const xTotal = xKategori + colKategoriW + bulanAreaW;

  const ROW_H = 5.6;
  const HEADER_ROW_H = 7;
  const TITLE_H = 14;
  const CONTENT_BOTTOM = PAGE_H - 12;

  let page = 1;

  function drawTitleBand() {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, TITLE_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(`LAPORAN BULANAN — ${tahun}`, MARGIN, 9.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 226, 235);
    doc.text(namaUsaha, PAGE_W - MARGIN, 9.5, { align: "right" });
  }

  function drawColumnHeader(y) {
    doc.setFillColor(...BLUE_HEADER);
    doc.rect(xKategori, y, colKategoriW + bulanAreaW + colTotalW, HEADER_ROW_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text("Kategori", xKategori + 2, y + HEADER_ROW_H / 2 + 1.1);
    BULAN_LABEL.forEach((lbl, i) => {
      doc.text(lbl, xBulan(i) + colBulanW / 2, y + HEADER_ROW_H / 2 + 1.1, { align: "center" });
    });
    doc.text("Total", xTotal + colTotalW / 2, y + HEADER_ROW_H / 2 + 1.1, { align: "center" });
    return y + HEADER_ROW_H;
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 160);
    doc.text(`Dicetak ${new Date().toLocaleDateString("id-ID")} · Halaman ${page}`, PAGE_W / 2, PAGE_H - 5, { align: "center" });
  }

  function newPage() {
    drawFooter();
    doc.addPage();
    page += 1;
    drawTitleBand();
    return drawColumnHeader(TITLE_H + 2);
  }

  drawTitleBand();
  let y = drawColumnHeader(TITLE_H + 2);

  function ensureSpace(rowsNeeded = 1) {
    if (y + rowsNeeded * ROW_H > CONTENT_BOTTOM) {
      y = newPage();
    }
  }

  function drawSectionRow(label) {
    ensureSpace(1);
    doc.setFillColor(...BLUE_SECTION);
    doc.rect(xKategori, y, colKategoriW + bulanAreaW + colTotalW, ROW_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(label, xKategori + 2, y + ROW_H - 1.6);
    y += ROW_H;
  }

  function drawDataRow(label, bulan, total, { bold = false, subtotal = false } = {}) {
    ensureSpace(1);
    if (subtotal) {
      doc.setFillColor(...BLUE_SUBTOTAL);
      doc.rect(xKategori, y, colKategoriW + bulanAreaW + colTotalW, ROW_H, "F");
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BLACK);
    doc.text(label, xKategori + 2, y + ROW_H - 1.6, { maxWidth: colKategoriW - 3 });
    bulan.forEach((v, i) => {
      const f = fmtAngka(v);
      drawCellNumber(doc, f.text, xBulan(i), colBulanW, y + ROW_H - 1.6, { bold, negative: f.negative });
    });
    const ft = fmtAngka(total);
    drawCellNumber(doc, ft.text, xTotal, colTotalW, y + ROW_H - 1.6, { bold: true, negative: ft.negative });
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.1);
    doc.line(xKategori, y + ROW_H, xKategori + colKategoriW + bulanAreaW + colTotalW, y + ROW_H);
    y += ROW_H;
  }

  function drawLabaRugiRow(label, bulan, total) {
    ensureSpace(1);
    doc.setFillColor(...NAVY);
    doc.rect(xKategori, y, colKategoriW + bulanAreaW + colTotalW, ROW_H + 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text(label, xKategori + 2, y + ROW_H - 1);
    bulan.forEach((v, i) => {
      const f = fmtAngka(v);
      drawCellNumber(doc, f.text, xBulan(i), colBulanW, y + ROW_H - 1, {
        bold: true,
        size: 7.5,
        color: f.negative ? [255, 140, 140] : WHITE,
      });
    });
    const ft = fmtAngka(total);
    drawCellNumber(doc, ft.text, xTotal, colTotalW, y + ROW_H - 1, {
      bold: true,
      size: 8,
      color: ft.negative ? [255, 140, 140] : WHITE,
    });
    y += ROW_H + 1;
  }

  drawSectionRow("PENDAPATAN");
  data.pendapatan.forEach((r) => drawDataRow(r.label, r.bulan, r.total));
  drawDataRow("Total Pendapatan", data.totalPendapatan.bulan, data.totalPendapatan.total, { bold: true, subtotal: true });

  y += 2;
  drawSectionRow("PENGELUARAN");
  data.pengeluaran.forEach((r) => drawDataRow(r.label, r.bulan, r.total));
  drawDataRow("Total Pengeluaran", data.totalPengeluaran.bulan, data.totalPengeluaran.total, { bold: true, subtotal: true });

  y += 2;
  drawLabaRugiRow("LABA (RUGI) BERSIH", data.labaRugi.bulan, data.labaRugi.total);

  drawFooter();
  doc.save(`laporan-bulanan_${tahun}.pdf`);
}

// =========================================================
// REKAP TAHUNAN — portrait A4, beberapa tahun berurutan
// =========================================================
export function generateLaporanTahunanPdf({ tahunList, perTahun, namaUsaha = "SELMA ACC BANDUNG" }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const PAGE_W = 210;
  const MARGIN = 14;

  const colKategoriW = 55;
  const tahunAreaW = PAGE_W - MARGIN * 2 - colKategoriW;
  const colTahunW = tahunAreaW / tahunList.length;

  const xKategori = MARGIN;
  const xTahun = (i) => xKategori + colKategoriW + i * colTahunW;
  const fullW = colKategoriW + tahunAreaW;

  const ROW_H = 9;
  const HEADER_ROW_H = 9;
  const TITLE_H = 16;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, TITLE_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text("REKAP TAHUNAN", MARGIN, 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 226, 235);
  doc.text(namaUsaha, PAGE_W - MARGIN, 10.5, { align: "right" });

  let y = TITLE_H + 6;

  doc.setFillColor(...BLUE_HEADER);
  doc.rect(xKategori, y, fullW, HEADER_ROW_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...WHITE);
  doc.text("Kategori", xKategori + 3, y + HEADER_ROW_H / 2 + 1.3);
  tahunList.forEach((th, i) => {
    doc.text(String(th), xTahun(i) + colTahunW / 2, y + HEADER_ROW_H / 2 + 1.3, { align: "center" });
  });
  y += HEADER_ROW_H;

  function drawRow(label, values, fmt, { bold = false, subtotal = false } = {}) {
    if (subtotal) {
      doc.setFillColor(...BLUE_SUBTOTAL);
      doc.rect(xKategori, y, fullW, ROW_H, "F");
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(label, xKategori + 3, y + ROW_H - 3);
    values.forEach((v, i) => {
      const f = fmt(v);
      drawCellNumber(doc, f.text, xTahun(i), colTahunW - 3, y + ROW_H - 3, { bold, negative: f.negative, size: 9 });
    });
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.15);
    doc.line(xKategori, y + ROW_H, xKategori + fullW, y + ROW_H);
    y += ROW_H;
  }

  function drawLabaRugiRow(label, values) {
    doc.setFillColor(...NAVY);
    doc.rect(xKategori, y, fullW, ROW_H + 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(label, xKategori + 3, y + ROW_H - 2);
    values.forEach((v, i) => {
      const f = fmtAngka(v);
      drawCellNumber(doc, f.text, xTahun(i), colTahunW - 3, y + ROW_H - 2, {
        bold: true,
        size: 9.5,
        color: f.negative ? [255, 140, 140] : WHITE,
      });
    });
    y += ROW_H + 1;
  }

  drawRow("Total Pendapatan", perTahun.map((t) => t.pendapatan), fmtAngka);
  drawRow("Total Pengeluaran", perTahun.map((t) => t.pengeluaran), fmtAngka);
  y += 1.5;
  drawLabaRugiRow("LABA (RUGI) BERSIH", perTahun.map((t) => t.laba));
  y += 1.5;
  drawRow(
    "Margin Laba Bersih (%)",
    perTahun.map((t) => t.marginPersen),
    (v) => ({ text: `${(Math.round(v * 10) / 10).toLocaleString("id-ID")}%`, negative: v < 0 }),
    { subtotal: true, bold: true }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 148, 160);
  doc.text(`Dicetak ${new Date().toLocaleDateString("id-ID")}`, PAGE_W / 2, 290, { align: "center" });

  doc.save(`rekap-tahunan_${tahunList[0]}-${tahunList[tahunList.length - 1]}.pdf`);
}