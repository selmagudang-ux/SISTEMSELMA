// =========================================================
// PDF "PANDUAN PENGGUNAAN" — mencetak semua bagian panduan yang boleh dilihat
// role yang sedang login (sama persis dengan isi halaman Panduan, bukan hasil
// pencarian). A4 portrait, tiap menu: Fungsi menu ini + Cara menggunakan
// (langkah bernomor). Proses di browser, tanpa server.
// =========================================================
import { jsPDF } from "jspdf";

const NAVY = [31, 56, 100];
const AMBER = [180, 110, 10];
const SKY = [30, 110, 170];
const GREY = [110, 118, 130];
const GREY_LINE = [210, 216, 224];
const BLACK = [30, 30, 30];
const WHITE = [255, 255, 255];
const AMBER_BG = [253, 246, 232];

// Font bawaan PDF (Helvetica) tidak punya beberapa simbol — diganti yang aman.
const bersih = (v) =>
  String(v ?? "")
    .replace(/[→⇒]/g, "->")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "") // emoji & simbol di luar Latin-1
    .replace(/[ \t]+/g, " ")
    .trim();

function tanggalPanjang(d = new Date()) {
  const bln = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

// sections: [{ label, ringkasan, fungsi: [string], cara: [{ judul?, langkah: [string] }] }]
export function generatePanduanPdf({ sections, namaUsaha = "SELMA ACC BANDUNG", peran = "" }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16; // margin kiri/kanan
  const TOP = 18;
  const BOTTOM = H - 16;
  const LEBAR = W - M * 2;
  let y = TOP;

  const warna = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const butuh = (tinggi) => {
    if (y + tinggi > BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  // Paragraf berbungkus; per baris dicek supaya bisa pindah halaman di tengah paragraf panjang.
  const tulis = (teks, { x = M, lebar = LEBAR, size = 10, bold = false, color = BLACK, gap = 1.4, lh = 4.6 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    warna(color);
    const baris = doc.splitTextToSize(bersih(teks), lebar);
    for (const b of baris) {
      butuh(lh);
      doc.text(b, x, y);
      y += lh;
    }
    y += gap;
  };

  // ---------- Sampul / judul ----------
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, W, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  warna(WHITE);
  doc.text("PANDUAN PENGGUNAAN", M, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(bersih(namaUsaha), M, 22);
  doc.setFontSize(8.5);
  doc.text(bersih(`Dicetak ${tanggalPanjang()}${peran ? ` - ${peran}` : ""}`), M, 28.5);
  y = 44;

  // ---------- Daftar isi ----------
  if (sections.length > 1) {
    tulis("Daftar Isi", { size: 12, bold: true, color: NAVY, gap: 2 });
    sections.forEach((sec, i) => {
      tulis(`${i + 1}. ${sec.label}`, { size: 10, gap: 0.6 });
    });
    y += 4;
  }

  // ---------- Isi tiap menu ----------
  sections.forEach((sec, si) => {
    // Judul menu: mulai halaman baru kalau sisa ruang sempit
    butuh(40);
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.roundedRect(M, y, LEBAR, 9, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    warna(WHITE);
    doc.text(bersih(`${si + 1}. ${sec.label}`), M + 3, y + 6.2);
    y += 12.5;

    if (sec.ringkasan) tulis(sec.ringkasan, { size: 9.5, color: GREY, gap: 2.5 });

    // Fungsi menu ini
    const fungsi = sec.fungsi || [];
    if (fungsi.length) {
      butuh(18);
      tulis("FUNGSI MENU INI", { size: 9, bold: true, color: AMBER, gap: 1.2 });
      fungsi.forEach((f) => tulis(f, { gap: 1.8 }));
      y += 1.5;
    }

    // Cara menggunakan
    const cara = sec.cara || [];
    if (cara.length) {
      butuh(18);
      tulis("CARA MENGGUNAKAN", { size: 9, bold: true, color: SKY, gap: 1.6 });
      cara.forEach((g) => {
        if (g.judul) {
          butuh(14);
          tulis(g.judul, { size: 10.5, bold: true, gap: 1.2 });
        }
        (g.langkah || []).forEach((l, li) => {
          const nomor = `${li + 1}.`;
          butuh(6);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          warna(GREY);
          doc.text(nomor, M + 2, y);
          tulis(l, { x: M + 10, lebar: LEBAR - 10, gap: 1.2 });
        });
        y += 2.5;
      });
    }

    // Garis pemisah antar menu
    if (si < sections.length - 1) {
      butuh(10);
      doc.setDrawColor(GREY_LINE[0], GREY_LINE[1], GREY_LINE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      y += 8;
    }
  });

  // ---------- Footer nomor halaman ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    warna(GREY);
    doc.text(bersih(`${namaUsaha} - Panduan Penggunaan`), M, H - 8);
    doc.text(`Halaman ${p} / ${total}`, W - M, H - 8, { align: "right" });
  }

  const stempel = new Date().toISOString().slice(0, 10);
  doc.save(`Panduan-Penggunaan-${stempel}.pdf`);
}
