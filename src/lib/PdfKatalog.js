// =========================================================
// GENERATE PDF KATALOG PRODUK (foto + SKU + harga)
// Dipakai di halaman Master SKU (SKU & Harga). Semua proses
// terjadi di browser (client-side), tidak ada data yang
// dikirim ke server manapun.
//
// Katalog dikelompokkan per Kategori -> Subkategori: tiap
// grup diberi pita judul sendiri sebelum baris kartu produknya.
// =========================================================
import { jsPDF } from "jspdf";
import { fmtRp, groupByKategori } from "./api";

// ----- Layout katalog (satuan: mm, kertas A4) -----
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const HEADER_H = 16; // tinggi pita judul di tiap halaman
const COLS = 2;
const GUTTER = 6;

const CARD_W = (PAGE_W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS;
// Tinggi kartu ditentukan dari lebar (foto persegi + area teks harga),
// dipakai juga untuk menghitung berapa baris kartu muat per halaman.
const CARD_H = CARD_W + 24;
const IMG_PAD = 2;
const IMG_W = CARD_W - IMG_PAD * 2;
const IMG_H = IMG_W; // foto persegi 1:1
const IMG_ASPECT = IMG_W / IMG_H; // = 1 (persegi)

const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_BOTTOM = PAGE_H - MARGIN;

// Tinggi pita judul kategori & sub-kategori di dalam konten halaman.
const KATEGORI_BAND_H = 8;
const SUBKATEGORI_BAND_H = 6;

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

// Muat foto UTUH ke area target (mirip object-fit: contain di CSS) —
// tidak ada bagian foto yang dipotong. Kalau rasio foto beda dari rasio
// area (mis. foto portrait dimuat ke area landscape), sisa ruang di
// kiri-kanan/atas-bawah diisi putih supaya kartu tetap rapi.
function fitToAspect(img, aspect, targetWidthPx = 700) {
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

// Pita judul KATEGORI — band solid, menonjol, dipakai tiap ganti kategori.
function drawKategoriBand(doc, label, y) {
  doc.setFillColor(180, 83, 9); // amber-700
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, KATEGORI_BAND_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(label.toUpperCase(), MARGIN + 3, y + KATEGORI_BAND_H / 2 + 1.2);
}

// Label SUBKATEGORI — lebih ringan, di bawah pita kategori.
function drawSubkategoriBand(doc, label, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(label, MARGIN + 1, y + SUBKATEGORI_BAND_H - 1.5);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(
    MARGIN + doc.getTextWidth(label) + 4,
    y + SUBKATEGORI_BAND_H - 2.3,
    PAGE_W - MARGIN,
    y + SUBKATEGORI_BAND_H - 2.3
  );
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
  const tanggalCetak = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const kategoriList = groupByKategori(skuList);

  let page = 1;
  let cursorY = CONTENT_TOP; // posisi vertikal berjalan di halaman aktif
  drawHeader(doc, judul, `Dicetak ${tanggalCetak}`);

  const newPage = () => {
    doc.addPage();
    page += 1;
    cursorY = CONTENT_TOP;
    drawHeader(doc, judul, `Dicetak ${tanggalCetak}`);
  };

  // Pastikan tersisa minimal `h` mm di halaman aktif; kalau tidak, pindah halaman baru.
  const ensureSpace = (h) => {
    if (cursorY + h > CONTENT_BOTTOM) newPage();
  };

  kategoriList.forEach(({ kategori, groups }) => {
    // Pita kategori butuh ruang untuk dirinya + minimal 1 baris kartu di bawahnya,
    // supaya judul kategori tidak "menggantung sendirian" di ujung halaman.
    ensureSpace(KATEGORI_BAND_H + 2 + SUBKATEGORI_BAND_H + CARD_H);
    drawKategoriBand(doc, kategori, cursorY);
    cursorY += KATEGORI_BAND_H + 3;

    groups.forEach(({ subkategori, items: subItems }) => {
      ensureSpace(SUBKATEGORI_BAND_H + CARD_H);
      drawSubkategoriBand(doc, subkategori, cursorY);
      cursorY += SUBKATEGORI_BAND_H;

      subItems.forEach((s, idx) => {
        const col = idx % COLS;
        if (col === 0) ensureSpace(CARD_H + GUTTER);
        const x = MARGIN + col * (CARD_W + GUTTER);
        const y = cursorY;
        drawCard(doc, s, fotoMap[s.sku], x, y);
        if (col === COLS - 1 || idx === subItems.length - 1) {
          cursorY += CARD_H + GUTTER;
        }
      });

      cursorY += 4; // jarak antar subkategori
    });

    cursorY += 4; // jarak antar kategori
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, p, pageCount);
  }

  doc.save(`katalog-produk-${new Date().toISOString().slice(0, 10)}.pdf`);
}