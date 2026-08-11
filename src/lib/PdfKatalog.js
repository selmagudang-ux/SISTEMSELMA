// =========================================================
// GENERATE PDF KATALOG PRODUK (foto + SKU + harga)
// Dipakai di halaman Master SKU (SKU & Harga). Semua proses
// terjadi di browser (client-side), tidak ada data yang
// dikirim ke server manapun.
// =========================================================
import { jsPDF } from "jspdf";
import { fmtRp } from "./api";

// ----- Layout katalog (satuan: mm, kertas A4) -----
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const HEADER_H = 16; // tinggi pita judul di tiap halaman
const COLS = 2;
const ROWS = 3;
const GUTTER = 6;

const CARD_W = (PAGE_W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS;
const CARD_H = (PAGE_H - MARGIN * 2 - HEADER_H - GUTTER * (ROWS - 1)) / ROWS;
const IMG_PAD = 2;
const IMG_W = CARD_W - IMG_PAD * 2;
const IMG_H = CARD_H * 0.56;
const IMG_ASPECT = IMG_W / IMG_H; // dipakai supaya foto tidak gepeng/melar

// Cari foto paling relevan untuk satu SKU: ambil dari barang (items)
// dengan SKU yang sama, yang paling baru dan sudah punya foto_url.
function fotoUntukSku(sku, items) {
  const kandidat = (items || [])
    .filter((i) => i.sku === sku && i.foto_url)
    .sort(
      (a, b) =>
        new Date(b.created_at || b.tanggal || 0) -
        new Date(a.created_at || a.tanggal || 0)
    );
  return kandidat[0]?.foto_url || null;
}

// Crop gambar mengikuti rasio target (mirip object-fit: cover di CSS)
// lalu hasilkan JPEG data-URL supaya ukuran file PDF tetap kecil.
function cropToAspect(img, aspect, targetWidthPx = 700) {
  const w = targetWidthPx;
  const h = Math.round(targetWidthPx / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(w / img.width, h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Muat satu foto dari URL Supabase Storage jadi data-URL siap pakai.
// Kalau gagal (foto rusak / CORS / offline) -> kembalikan null,
// nanti kartu produk itu ditampilkan dengan kotak "Tidak ada foto".
function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(cropToAspect(img, IMG_ASPECT));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawHeader(doc, judul, subjudul) {
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setTextColor(245, 245, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(judul, MARGIN, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(subjudul, PAGE_W - MARGIN, 10, { align: "right" });
}

function drawFooter(doc, pageNum, totalPages) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Halaman ${pageNum} / ${totalPages}`, PAGE_W / 2, PAGE_H - 6, {
    align: "center",
  });
}

function drawCard(doc, sku, fotoDataUrl, x, y) {
  // Bingkai kartu
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, CARD_W, CARD_H, 2, 2, "S");

  const imgX = x + IMG_PAD;
  const imgY = y + IMG_PAD;

  if (fotoDataUrl) {
    doc.addImage(fotoDataUrl, "JPEG", imgX, imgY, IMG_W, IMG_H, undefined, "FAST");
  } else {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(imgX, imgY, IMG_W, IMG_H, "F");
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text("Tidak ada foto", x + CARD_W / 2, imgY + IMG_H / 2, {
      align: "center",
    });
  }

  let ty = imgY + IMG_H + 5.5;

  // Baris SKU + status stok
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(String(sku.sku || "—"), x + 3, ty);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(sku.stok > 0 ? 100 : 220, sku.stok > 0 ? 116 : 38, sku.stok > 0 ? 139 : 38);
  doc.text(sku.stok > 0 ? `Stok: ${sku.stok}` : "Stok habis", x + CARD_W - 3, ty, {
    align: "right",
  });

  ty += 2.5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.15);
  doc.line(x + 3, ty, x + CARD_W - 3, ty);
  ty += 4.5;

  // Baris harga: Grosir, Tengah, lalu Ecer ditonjolkan
  const baris = [
    ["Grosir", sku.grosir],
    ["Tengah", sku.tengah],
  ];
  doc.setFontSize(7.5);
  baris.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(label, x + 3, ty);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text(fmtRp(val), x + CARD_W - 3, ty, { align: "right" });
    ty += 4;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 83, 9); // amber-700 (kontras baik di kertas putih)
  doc.text("Ecer", x + 3, ty);
  doc.text(fmtRp(sku.ecer), x + CARD_W - 3, ty, { align: "right" });
}

// -----------------------------------------------------------------
// generateKatalogPdf(skuList, items, opsi)
// - skuList: array baris dari sku_master (sudah difilter/dicari)
// - items:   array barang (dipakai untuk mengambil foto per SKU)
// - opsi.onProgress(done, total): dipanggil selagi foto dimuat
// -----------------------------------------------------------------
export async function generateKatalogPdf(skuList, items, opts = {}) {
  const { judul = "Katalog Produk", onProgress } = opts;
  const total = skuList.length;
  if (total === 0) return;

  // Muat semua foto lebih dulu secara paralel, supaya render PDF
  // di bawah tidak perlu menunggu satu-satu.
  const fotoMap = {};
  let done = 0;
  await Promise.all(
    skuList.map(async (s) => {
      const url = fotoUntukSku(s.sku, items);
      fotoMap[s.sku] = await loadImageAsDataUrl(url);
      done += 1;
      onProgress?.(done, total);
    })
  );

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const perPage = COLS * ROWS;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const tanggalCetak = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  skuList.forEach((s, idx) => {
    const posInPage = idx % perPage;
    if (idx > 0 && posInPage === 0) doc.addPage();
    if (posInPage === 0) drawHeader(doc, judul, `Dicetak ${tanggalCetak}`);

    const col = posInPage % COLS;
    const row = Math.floor(posInPage / COLS);
    const x = MARGIN + col * (CARD_W + GUTTER);
    const y = MARGIN + HEADER_H + row * (CARD_H + GUTTER);
    drawCard(doc, s, fotoMap[s.sku], x, y);
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, p, pageCount);
  }

  doc.save(`katalog-produk-${new Date().toISOString().slice(0, 10)}.pdf`);
}