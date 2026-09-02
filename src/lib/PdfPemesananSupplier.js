// =========================================================
// GENERATE PDF PEMESANAN BARANG KE SUPPLIER (foto + kode
// barang/model supplier + nama toko) — dipakai di halaman
// Persetujuan Restok, tab "Pemesanan ke Supplier". Semua
// proses terjadi di browser (client-side).
// =========================================================
import { jsPDF } from "jspdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const HEADER_H = 16;
const COLS = 3;
const GUTTER = 6;

const CARD_W = (PAGE_W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS;
const CARD_H = CARD_W + 22;
const IMG_PAD = 2;
const IMG_W = CARD_W - IMG_PAD * 2;
const IMG_H = IMG_W; // foto persegi 1:1
const IMG_ASPECT = IMG_W / IMG_H;

const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_BOTTOM = PAGE_H - MARGIN;

// Muat foto UTUH ke area target (mirip object-fit: contain), sama pola
// dengan lib/PdfKatalog.js.
function fitToAspect(img, aspect, targetWidthPx = 600) {
  const w = targetWidthPx;
  const h = Math.round(targetWidthPx / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / img.width, h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(fitToAspect(img, IMG_ASPECT));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawHeader(doc, judul, subjudul) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setTextColor(245, 245, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(judul, MARGIN, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(subjudul, PAGE_W - MARGIN, 10, { align: "right" });
}

function drawFooter(doc, pageNum, totalPages) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Halaman ${pageNum} / ${totalPages}`, PAGE_W / 2, PAGE_H - 6, { align: "center" });
}

function drawCard(doc, box, fotoDataUrl, x, y) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, CARD_W, CARD_H, 2, 2, "S");

  const imgX = x + IMG_PAD;
  const imgY = y + IMG_PAD;

  if (fotoDataUrl) {
    doc.addImage(fotoDataUrl, "JPEG", imgX, imgY, IMG_W, IMG_H, undefined, "FAST");
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(imgX, imgY, IMG_W, IMG_H, "F");
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text("Tidak ada foto", x + CARD_W / 2, imgY + IMG_H / 2, { align: "center" });
  }

  let ty = imgY + IMG_H + 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(String(box.kodeBarang || "—"), x + 3, ty, { maxWidth: CARD_W - 6 });

  ty += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(box.kodeSupplier ? `Model: ${box.kodeSupplier}` : "Model: —", x + 3, ty, { maxWidth: CARD_W - 6 });

  ty += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(box.namaToko || "Toko/supplier belum diisi", x + 3, ty, { maxWidth: CARD_W - 6 });
}

// -----------------------------------------------------------------
// generatePemesananSupplierPdf(boxes, opsi)
// - boxes: array { kodeBarang, kodeSupplier, namaToko, fotoUrl }
// -----------------------------------------------------------------
export async function generatePemesananSupplierPdf(boxes, opts = {}) {
  const { judul = "Pemesanan Barang", onProgress } = opts;
  const total = boxes.length;
  if (total === 0) return;

  const fotoList = [];
  let done = 0;
  await Promise.all(
    boxes.map(async (b, idx) => {
      fotoList[idx] = await loadImageAsDataUrl(b.fotoUrl);
      done += 1;
      onProgress?.(done, total);
    })
  );

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const tanggalCetak = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  let page = 1;
  let cursorY = CONTENT_TOP;
  drawHeader(doc, judul, `Dicetak ${tanggalCetak}`);

  const newPage = () => {
    doc.addPage();
    page += 1;
    cursorY = CONTENT_TOP;
    drawHeader(doc, judul, `Dicetak ${tanggalCetak}`);
  };

  const ensureSpace = (h) => {
    if (cursorY + h > CONTENT_BOTTOM) newPage();
  };

  boxes.forEach((b, idx) => {
    const col = idx % COLS;
    if (col === 0) ensureSpace(CARD_H + GUTTER);
    const x = MARGIN + col * (CARD_W + GUTTER);
    const y = cursorY;
    drawCard(doc, b, fotoList[idx], x, y);
    if (col === COLS - 1 || idx === boxes.length - 1) {
      cursorY += CARD_H + GUTTER;
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, p, pageCount);
  }

  doc.save(`pemesanan-supplier-${new Date().toISOString().slice(0, 10)}.pdf`);
}