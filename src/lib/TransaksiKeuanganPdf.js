// =========================================================
// PDF "DAFTAR TRANSAKSI KEUANGAN" — mencetak daftar yang sedang tampil di
// halaman Transaksi (sesuai filter aktif). Landscape A4, header kolom
// diulang tiap halaman, ringkasan total di akhir. Proses di browser.
// Teks Keterangan yang sangat panjang (mis. daftar nomor pesanan) dipotong
// di PDF supaya baris tidak memenuhi halaman — versi lengkapnya ada di Excel.
// =========================================================
import { jsPDF } from "jspdf";

const NAVY = [31, 56, 100];
const BLUE_HEADER = [46, 83, 149];
const ZEBRA = [243, 246, 251];
const GREY_LINE = [210, 216, 224];
const GREEN = [22, 130, 80];
const RED = [200, 30, 30];
const SKY = [30, 110, 170];
const BLACK = [20, 20, 20];
const WHITE = [255, 255, 255];

const MAX_BARIS_KETERANGAN = 4;

// Font bawaan PDF (Helvetica) tidak punya tanda panah & beberapa simbol.
const bersih = (v) =>
  String(v ?? "")
    .replace(/[→⇒]/g, "->")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const angka = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");

function tanggalID(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(d)} ${bln[Number(m) - 1] || ""} ${y}`;
}

// rows: [{ tanggal, tipe: "masuk"|"keluar"|"transfer", rekening, rekeningTujuan, kategori, keterangan, jumlah }]
export function generateTransaksiKeuanganPdf({ rows, dari, sampai, filterTeks = "", namaUsaha = "SELMA" }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const PAGE_W = 297;
  const PAGE_H = 210;
  const M = 10;
  const TITLE_H = 14;
  const LINE_H = 3.4;
  const PAD = 1.6;
  const FONT = 7;
  const BOTTOM = PAGE_H - 12;

  const W = { tgl: 22, jenis: 20, rek: 48, kat: 32, jml: 28 };
  W.ket = PAGE_W - M * 2 - W.tgl - W.jenis - W.rek - W.kat - W.jml;
  const X = {};
  X.tgl = M;
  X.jenis = X.tgl + W.tgl;
  X.rek = X.jenis + W.jenis;
  X.kat = X.rek + W.rek;
  X.ket = X.kat + W.kat;
  X.jml = X.ket + W.ket;

  let y = 0;

  function judul() {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, TITLE_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text("DAFTAR TRANSAKSI KEUANGAN", M, 9.3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 226, 235);
    doc.text(bersih(namaUsaha), PAGE_W - M, 9.3, { align: "right" });
    y = TITLE_H + 5;
  }

  function subjudul() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BLACK);
    const periode = `Periode: ${dari ? tanggalID(dari) : "awal"} s/d ${sampai ? tanggalID(sampai) : "sekarang"}`;
    doc.text(periode, M, y);
    y += 4.2;
    if (filterTeks) {
      doc.setFontSize(7.5);
      doc.setTextColor(90, 100, 115);
      doc.text(bersih(filterTeks), M, y);
      y += 4.2;
    }
    y += 1;
  }

  function headerKolom() {
    const h = 6.5;
    doc.setFillColor(...BLUE_HEADER);
    doc.rect(M, y, PAGE_W - M * 2, h, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    const ty = y + 4.4;
    doc.text("Tanggal", X.tgl + PAD, ty);
    doc.text("Jenis", X.jenis + PAD, ty);
    doc.text("Rekening", X.rek + PAD, ty);
    doc.text("Kategori", X.kat + PAD, ty);
    doc.text("Keterangan", X.ket + PAD, ty);
    doc.text("Jumlah (Rp)", X.jml + W.jml - PAD, ty, { align: "right" });
    y += h;
  }

  function halamanBaru() {
    doc.addPage();
    judul();
    headerKolom();
  }

  function bungkusTeks(teks, lebar, maksBaris) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT);
    let baris = doc.splitTextToSize(bersih(teks), lebar - PAD * 2);
    if (maksBaris && baris.length > maksBaris) {
      baris = baris.slice(0, maksBaris);
      baris[maksBaris - 1] = baris[maksBaris - 1].replace(/.{0,3}$/, "") + "...";
    }
    return baris.length ? baris : [""];
  }

  judul();
  subjudul();
  headerKolom();

  let totMasuk = 0;
  let totKeluar = 0;
  let nTransfer = 0;

  rows.forEach((r, i) => {
    const isTransfer = r.tipe === "transfer";
    const rekTeks = isTransfer ? `${r.rekening} -> ${r.rekeningTujuan}` : r.rekening;
    const jenisTeks = r.tipe === "masuk" ? "Pemasukan" : r.tipe === "keluar" ? "Pengeluaran" : "Transfer";
    const cRek = bungkusTeks(rekTeks, W.rek, 3);
    const cKat = bungkusTeks(r.kategori || "", W.kat, 3);
    const cKet = bungkusTeks(r.keterangan || "", W.ket, MAX_BARIS_KETERANGAN);
    const nBaris = Math.max(1, cRek.length, cKat.length, cKet.length);
    const rowH = nBaris * LINE_H + PAD * 2 - 0.6;

    if (y + rowH > BOTTOM) halamanBaru();

    if (i % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(M, y, PAGE_W - M * 2, rowH, "F");
    }
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.1);
    doc.line(M, y + rowH, PAGE_W - M, y + rowH);

    const ty = y + PAD + 2.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT);
    doc.setTextColor(...BLACK);
    doc.text(tanggalID(r.tanggal), X.tgl + PAD, ty);
    doc.text(jenisTeks, X.jenis + PAD, ty);
    doc.text(cRek, X.rek + PAD, ty, { lineHeightFactor: 1.15 });
    doc.text(cKat, X.kat + PAD, ty, { lineHeightFactor: 1.15 });
    doc.text(cKet, X.ket + PAD, ty, { lineHeightFactor: 1.15 });

    const jml = Number(r.jumlah) || 0;
    const warna = isTransfer ? SKY : r.tipe === "masuk" ? GREEN : RED;
    const tanda = isTransfer ? "" : r.tipe === "masuk" ? "+" : "-";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...warna);
    doc.text(`${tanda}${angka(jml)}`, X.jml + W.jml - PAD, ty, { align: "right" });

    if (r.tipe === "masuk") totMasuk += jml;
    else if (r.tipe === "keluar") totKeluar += jml;
    else nTransfer += 1;

    y += rowH;
  });

  // ----- Ringkasan -----
  const blokH = 3 * 5.2 + 6;
  if (y + blokH > BOTTOM) halamanBaru();
  y += 4;
  const xLabel = X.kat;
  const xNilai = X.jml + W.jml - PAD;
  const baris = [
    ["Total Pemasukan", `+${angka(totMasuk)}`, GREEN],
    ["Total Pengeluaran", `-${angka(totKeluar)}`, RED],
    ["Selisih (Pemasukan - Pengeluaran)", angka(totMasuk - totKeluar), totMasuk - totKeluar >= 0 ? GREEN : RED],
  ];
  baris.forEach(([label, nilai, warna]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BLACK);
    doc.text(label, xLabel, y);
    doc.setTextColor(...warna);
    doc.text(nilai, xNilai, y, { align: "right" });
    y += 5.2;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 100, 115);
  doc.text(`${rows.length} transaksi${nTransfer ? ` (termasuk ${nTransfer} transfer antar rekening, tidak dihitung di total)` : ""}`, xLabel, y);

  // ----- Footer tiap halaman -----
  const total = doc.getNumberOfPages();
  const dicetak = new Date().toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 128, 140);
    doc.text(`Dicetak ${bersih(dicetak)}`, M, PAGE_H - 6);
    doc.text(`Halaman ${p} dari ${total}`, PAGE_W - M, PAGE_H - 6, { align: "right" });
  }

  doc.save(`transaksi-keuangan_${dari || "awal"}_sd_${sampai || "sekarang"}.pdf`);
}
