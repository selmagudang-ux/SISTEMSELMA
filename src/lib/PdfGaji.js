// =========================================================
// PDF SLIP GAJI & LAPORAN GAJI — dibuat langsung dengan jsPDF di browser (tidak ada data dikirim ke server).
//   buatPdfSlipGaji   : satu slip per karyawan per periode, satu halaman A5 per slip (banyak slip = banyak halaman).
//   buatPdfLaporanGaji: tabel rekap gaji (A4 landscape) dengan subtotal per periode dan total keseluruhan.
// Baris gaji = baris tabel penggajian: { periode, nominal, gaji_pokok, premi_jabatan, premi_kehadiran, bonus,
// status, catatan, diterima_pada, karyawan_id, ... }. Gaji lama tanpa rincian dianggap semuanya gaji pokok.
// =========================================================
import { jsPDF } from "jspdf";

const NAVY = [31, 56, 100];
const BLUE_HEADER = [46, 83, 149];
const BLUE_LIGHT = [237, 242, 250];
const GREY_LINE = [210, 216, 224];
const GREY_TEXT = [90, 98, 110];
const BLACK = [20, 20, 20];
const WHITE = [255, 255, 255];

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const KOMPONEN = [
  { k: "gaji_pokok", l: "Gaji Pokok" },
  { k: "premi_jabatan", l: "Premi Jabatan" },
  { k: "premi_kehadiran", l: "Premi Kehadiran" },
  { k: "bonus", l: "Bonus" },
];
const STATUS_LABEL = { draft: "Draft (belum dibayar)", diserahkan: "Diserahkan (menunggu diterima)", diterima: "Sudah diterima", batal: "Batal" };

const ISO_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_TGL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// jsPDF font standar tidak punya semua karakter.
const bersih = (v) =>
  String(v ?? "")
    .replace(/[—–]/g, "-")
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

const angka = (v) => Number(v) || 0;
const rp = (n) => "Rp " + Math.round(angka(n)).toLocaleString("id-ID");
const num = (n) => (Math.round(angka(n)) === 0 ? "-" : Math.round(angka(n)).toLocaleString("id-ID"));

function tglPendek(iso) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${NAMA_BULAN[Number(m) - 1].slice(0, 3)} ${y}`;
}
export function labelPeriodePdf(p) {
  const s = String(p || "");
  if (ISO_BULAN.test(s)) {
    const [y, m] = s.split("-");
    return `${NAMA_BULAN[Number(m) - 1]} ${y}`;
  }
  if (ISO_TGL.test(s)) return tglPendek(s);
  const r = s.split("_");
  if (r.length === 2 && ISO_TGL.test(r[0]) && ISO_TGL.test(r[1])) return `${tglPendek(r[0])} s/d ${tglPendek(r[1])}`;
  return s || "-";
}
function tglWaktuWib(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" });
}
function hariIniWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Komponen gaji satu baris (gaji lama tanpa rincian: seluruh nominal = gaji pokok).
export function komponenGaji(g) {
  const adaRincian = g && g.gaji_pokok !== undefined && g.gaji_pokok !== null;
  const isi = {
    gaji_pokok: adaRincian ? angka(g.gaji_pokok) : angka(g?.nominal),
    premi_jabatan: angka(g?.premi_jabatan),
    premi_kehadiran: angka(g?.premi_kehadiran),
    bonus: angka(g?.bonus),
  };
  return isi;
}

const aman = (t) => String(t || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

// =========================================================
// SLIP GAJI
// =========================================================
// daftar: [{ gaji, karyawan: { nama, id_karyawan, jabatan? } }]
// identitas: { nama, alamat: [] }
export function buatPdfSlipGaji({ daftar, identitas }) {
  const W = 148, H = 210; // A5 portrait
  const M = 12;
  const doc = new jsPDF({ unit: "mm", format: [W, H] });

  daftar.forEach(({ gaji: g, karyawan: k }, idx) => {
    if (idx > 0) doc.addPage([W, H], "portrait");
    const kom = komponenGaji(g);
    const total = KOMPONEN.reduce((s, c) => s + kom[c.k], 0) || angka(g.nominal);

    // Kop
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 24, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(bersih(identitas?.nama || ""), M, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    let ya = 14.5;
    (identitas?.alamat || []).slice(0, 3).forEach((l) => { doc.text(bersih(l), M, ya); ya += 3.6; });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("SLIP GAJI", W - M, 10, { align: "right" });

    // Identitas karyawan
    let y = 33;
    const baris = (label, nilai) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GREY_TEXT);
      doc.text(label, M, y);
      doc.setTextColor(...BLACK);
      doc.setFont("helvetica", "bold");
      doc.text(": " + bersih(nilai), M + 30, y);
      y += 5.2;
    };
    baris("Nama", k?.nama || "-");
    baris("ID Karyawan", k?.id_karyawan || "-");
    if (k?.jabatan) baris("Jabatan", k.jabatan);
    baris("Periode", labelPeriodePdf(g.periode));
    baris("Status", STATUS_LABEL[g.status] || g.status || "-");
    if (g.diterima_pada) baris("Diterima", tglWaktuWib(g.diterima_pada));

    // Tabel rincian
    y += 3;
    doc.setFillColor(...BLUE_HEADER);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Komponen", M + 3, y + 4.8);
    doc.text("Jumlah", W - M - 3, y + 4.8, { align: "right" });
    y += 7;

    const tampil = KOMPONEN.filter((c) => kom[c.k] > 0);
    if (tampil.length === 0) tampil.push(KOMPONEN[0]);
    tampil.forEach((c, i) => {
      if (i % 2 === 1) {
        doc.setFillColor(...BLUE_LIGHT);
        doc.rect(M, y, W - 2 * M, 7, "F");
      }
      doc.setTextColor(...BLACK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(c.l, M + 3, y + 4.8);
      doc.text(rp(kom[c.k]), W - M - 3, y + 4.8, { align: "right" });
      y += 7;
    });
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);

    // Total
    doc.setFillColor(...NAVY);
    doc.rect(M, y + 1.5, W - 2 * M, 9, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("TOTAL DITERIMA", M + 3, y + 7.6);
    doc.text(rp(total), W - M - 3, y + 7.6, { align: "right" });
    y += 14;

    // Catatan
    if (g.catatan) {
      doc.setTextColor(...GREY_TEXT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Catatan", M, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.splitTextToSize(bersih(g.catatan), W - 2 * M).slice(0, 6).forEach((l) => { doc.text(l, M, y); y += 3.8; });
    }

    // Tanda tangan
    const yTtd = H - 42;
    doc.setTextColor(...BLACK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Karyawan,", M + 12, yTtd, { align: "center" });
    doc.text("Pemberi gaji,", W - M - 12, yTtd, { align: "center" });
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.2);
    doc.line(M, yTtd + 22, M + 28, yTtd + 22);
    doc.line(W - M - 28, yTtd + 22, W - M, yTtd + 22);
    doc.setFontSize(7.5);
    doc.text(bersih(k?.nama || ""), M + 14, yTtd + 26, { align: "center" });
    doc.text(bersih(identitas?.nama || ""), W - M - 14, yTtd + 26, { align: "center" });

    // Footer
    doc.setTextColor(...GREY_TEXT);
    doc.setFontSize(7);
    doc.text(`Dicetak ${tglPendek(hariIniWib())} - dokumen ini dibuat otomatis oleh sistem.`, W / 2, H - 6, { align: "center" });
  });

  return doc;
}

export function namaFileSlip(daftar) {
  if (daftar.length === 1) {
    const { gaji, karyawan } = daftar[0];
    return `Slip-Gaji-${aman(karyawan?.nama) || "karyawan"}-${aman(gaji.periode)}.pdf`;
  }
  return `Slip-Gaji-${aman(daftar[0]?.gaji?.periode) || "periode"}-${daftar.length}-karyawan.pdf`;
}

export function simpanPdfSlipGaji(data) {
  buatPdfSlipGaji(data).save(namaFileSlip(data.daftar));
}

// =========================================================
// LAPORAN GAJI
// =========================================================
// baris: [{ gaji, nama, id_karyawan }] sudah terfilter & terurut (periode lalu nama).
// ringkasan teks filter dikirim lewat `keterangan` (mis. "Periode: Semua | Status: Diterima").
export function buatPdfLaporanGaji({ baris, identitas, keterangan = "" }) {
  const PW = 297, PH = 210, M = 10;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const ROW = 6;
  const kolom = [
    { t: "No", w: 10, a: "center" },
    { t: "Karyawan", w: 56, a: "left" },
    { t: "Periode", w: 46, a: "left" },
    ...KOMPONEN.map((c) => ({ t: c.l, w: 29, a: "right", k: c.k })),
    { t: "Total", w: 32, a: "right", k: "total" },
    { t: "Status", w: PW - 2 * M - 10 - 56 - 46 - 29 * 4 - 32, a: "left" },
  ];
  const BOTTOM = PH - 14;
  let y = 0;
  let halaman = 0;

  const kopHalaman = () => {
    halaman++;
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PW, 16, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN GAJI KARYAWAN", M, 10.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(bersih(identitas?.nama || ""), PW - M, 10.5, { align: "right" });
    doc.setTextColor(...GREY_TEXT);
    doc.setFontSize(8);
    doc.text(bersih(keterangan), M, 21);
    y = 24;
    // header kolom
    doc.setFillColor(...BLUE_HEADER);
    doc.rect(M, y, PW - 2 * M, 7, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = M;
    kolom.forEach((c) => {
      const tx = c.a === "right" ? x + c.w - 2 : c.a === "center" ? x + c.w / 2 : x + 2;
      doc.text(c.t, tx, y + 4.7, { align: c.a });
      x += c.w;
    });
    y += 7;
  };

  const cell = (teks, c, x, yy, tebal = false, warna = BLACK) => {
    doc.setFont("helvetica", tebal ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(...warna);
    const tx = c.a === "right" ? x + c.w - 2 : c.a === "center" ? x + c.w / 2 : x + 2;
    const potong = doc.splitTextToSize(bersih(teks), c.w - 4)[0] || "";
    doc.text(potong, tx, yy + 4.2, { align: c.a });
  };

  const barisTotal = (label, jml, warnaIsi, terang) => {
    if (y + ROW > BOTTOM) { doc.addPage(); kopHalaman(); }
    doc.setFillColor(...warnaIsi);
    doc.rect(M, y, PW - 2 * M, ROW, "F");
    let x = M;
    kolom.forEach((c, i) => {
      if (i === 1) cell(label, c, x, y, true, terang ? WHITE : BLACK);
      if (c.k) cell(num(jml[c.k]), c, x, y, true, terang ? WHITE : BLACK);
      x += c.w;
    });
    y += ROW;
  };

  const kosong = () => ({ gaji_pokok: 0, premi_jabatan: 0, premi_kehadiran: 0, bonus: 0, total: 0 });
  const tambah = (a, b) => { Object.keys(a).forEach((k) => { a[k] += b[k]; }); };

  kopHalaman();
  if (baris.length === 0) {
    doc.setTextColor(...GREY_TEXT);
    doc.setFontSize(10);
    doc.text("Tidak ada data gaji untuk filter ini.", M, y + 10);
    return doc;
  }

  const semua = kosong();
  let sub = kosong();
  let periodeSaatIni = null;
  let no = 0;

  const tutupSub = () => {
    if (periodeSaatIni === null) return;
    barisTotal(`Subtotal ${labelPeriodePdf(periodeSaatIni)}`, sub, BLUE_LIGHT, false);
  };

  baris.forEach(({ gaji: g, nama }) => {
    if (periodeSaatIni !== null && g.periode !== periodeSaatIni) { tutupSub(); sub = kosong(); no = 0; }
    periodeSaatIni = g.periode;
    if (y + ROW > BOTTOM) { doc.addPage(); kopHalaman(); }
    const kom = komponenGaji(g);
    const total = angka(g.nominal) || KOMPONEN.reduce((s, c) => s + kom[c.k], 0);
    const nilai = { ...kom, total };
    tambah(sub, nilai);
    tambah(semua, nilai);
    no++;
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.15);
    doc.line(M, y + ROW, PW - M, y + ROW);
    let x = M;
    kolom.forEach((c, i) => {
      if (i === 0) cell(String(no), c, x, y);
      else if (i === 1) cell(nama || "-", c, x, y);
      else if (i === 2) cell(labelPeriodePdf(g.periode), c, x, y);
      else if (c.k) cell(num(nilai[c.k]), c, x, y, c.k === "total");
      else cell(STATUS_LABEL[g.status]?.split(" (")[0] || g.status || "-", c, x, y);
      x += c.w;
    });
    y += ROW;
  });
  tutupSub();
  y += 1.5;
  barisTotal(`TOTAL (${baris.length} gaji)`, semua, NAVY, true);

  // nomor halaman
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setTextColor(...GREY_TEXT);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Dicetak ${tglPendek(hariIniWib())}`, M, PH - 6);
    doc.text(`Halaman ${i} / ${n}`, PW - M, PH - 6, { align: "right" });
  }
  return doc;
}

export function simpanPdfLaporanGaji(data) {
  buatPdfLaporanGaji(data).save(`Laporan-Gaji-${hariIniWib()}.pdf`);
}
