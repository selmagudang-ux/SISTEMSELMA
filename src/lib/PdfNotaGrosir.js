// =========================================================
// PDF NOTA GROSIR (struk 80mm) — dibuat langsung dengan jsPDF, BUKAN dari screenshot halaman,
// jadi teksnya tajam, bisa dicari/disalin, dan selalu SATU halaman (tinggi kertas dihitung dari
// isi nota). Isi & urutannya disamakan dengan NotaIsi di pages/NotaGrosir.jsx.
// =========================================================
import { jsPDF } from "jspdf";
import { fmtRp } from "./api";

const LEBAR = 80; // mm, kertas thermal 80mm
const M = 4; // margin kiri/kanan/atas/bawah -> lebar isi 72mm (sama dengan nota cetak)
const ISI = LEBAR - 2 * M;
const FONT = "courier"; // monospace, seperti font struk di layar
const UKURAN = 9; // pt
const UKURAN_JUDUL = 11.5; // pt
const TINGGI_BARIS = 4.1; // mm per baris teks 9pt
const TINGGI_BARIS_JUDUL = 5.2;
const TINGGI_GARIS = 3.2; // mm ruang untuk satu garis putus-putus

// jsPDF font standar tidak punya semua karakter — samakan yang umum dipakai.
const bersih = (v) =>
  String(v ?? "")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

// Susun nota jadi daftar blok, lalu hitung tinggi -> buat dokumen -> gambar.
function susunBlok({ pesanan: p, pelanggan, detailItems, totalDibayar, sisaHutang, pembayaran, identitas }) {
  const metodeDariRiwayat = [...new Set((pembayaran || []).map((b) => b.metode_bayar).filter(Boolean))].join(", ");
  const metodeTampil = p.metode_bayar || metodeDariRiwayat || "-";
  const items = detailItems || [];
  const digit = String(items.length).length;

  const blok = [];
  blok.push({ t: "judul", teks: identitas.nama });
  (identitas.alamat || []).forEach((l) => blok.push({ t: "tengah", teks: l }));
  blok.push({ t: "garis" });
  blok.push({ t: "kiri", teks: `Tanggal: ${p.tanggal ?? ""}` });
  blok.push({ t: "kiri", teks: `No. Pesanan: ${p.nomor_pesanan ?? ""}` });
  blok.push({ t: "kiri", teks: `Pelanggan: ${pelanggan ? pelanggan.nama : "-"}` });
  blok.push({ t: "kiri", teks: `WA: ${pelanggan?.wa || "-"}` });
  blok.push({ t: "garis" });
  items.forEach((d, i) => {
    blok.push({ t: "kiri", teks: `${String(i + 1).padStart(digit, " ")}. ${d.nama_produk}` });
    blok.push({ t: "baris", kiri: `${d.qty} x ${fmtRp(d.harga)}`, kanan: fmtRp(d.subtotal), indent: digit + 2 });
  });
  blok.push({ t: "garis" });
  blok.push({ t: "baris", kiri: "TOTAL", kanan: fmtRp(p.total), tebal: true });
  blok.push({ t: "garis" });
  blok.push({ t: "kiri", teks: `Status: ${p.status_bayar ?? ""} | Metode: ${metodeTampil}` });
  if (Number(sisaHutang) > 0) {
    blok.push({ t: "kiri", teks: `Sudah Dibayar: ${fmtRp(totalDibayar)}` });
    blok.push({ t: "kiri", teks: `Sisa Hutang: ${fmtRp(sisaHutang)}` });
  }
  blok.push({ t: "garis" });
  blok.push({ t: "tengah", teks: "Terima kasih atas pesanan Anda!" });
  return blok;
}

export function buatPdfNotaGrosir(data) {
  const blok = susunBlok(data);

  // Pass 1: ukur (butuh dokumen sementara untuk menghitung pembungkusan baris).
  const ukur = new jsPDF({ unit: "mm", format: [LEBAR, 500] });
  const atur = (tebal, ukuranPt) => {
    ukur.setFont(FONT, tebal ? "bold" : "normal");
    ukur.setFontSize(ukuranPt);
  };
  const bungkus = (doc, teks, lebar) => doc.splitTextToSize(bersih(teks), lebar);

  const rencana = blok.map((b) => {
    if (b.t === "garis") return { ...b, tinggi: TINGGI_GARIS };
    if (b.t === "judul") {
      atur(true, UKURAN_JUDUL);
      const baris = bungkus(ukur, b.teks, ISI);
      return { ...b, baris, tinggi: baris.length * TINGGI_BARIS_JUDUL + 1 };
    }
    atur(!!b.tebal, UKURAN);
    if (b.t === "baris") {
      const geser = (b.indent || 0) * ukur.getTextWidth("0");
      return { ...b, geser, kiri: bersih(b.kiri), kanan: bersih(b.kanan), tinggi: TINGGI_BARIS };
    }
    const baris = bungkus(ukur, b.teks, ISI);
    return { ...b, baris, tinggi: baris.length * TINGGI_BARIS };
  });

  const tinggiTotal = Math.ceil(M * 2 + rencana.reduce((a, r) => a + r.tinggi, 0));

  // Pass 2: gambar di dokumen dengan tinggi pas -> pasti satu halaman.
  const doc = new jsPDF({ unit: "mm", format: [LEBAR, tinggiTotal] });
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  let y = M;
  const set = (tebal, ukuranPt) => {
    doc.setFont(FONT, tebal ? "bold" : "normal");
    doc.setFontSize(ukuranPt);
  };

  rencana.forEach((r) => {
    if (r.t === "garis") {
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(M, y + TINGGI_GARIS / 2, LEBAR - M, y + TINGGI_GARIS / 2);
      doc.setLineDashPattern([], 0);
    } else if (r.t === "judul") {
      set(true, UKURAN_JUDUL);
      r.baris.forEach((l, i) => doc.text(l, LEBAR / 2, y + i * TINGGI_BARIS_JUDUL, { align: "center", baseline: "top" }));
    } else if (r.t === "tengah") {
      set(false, UKURAN);
      r.baris.forEach((l, i) => doc.text(l, LEBAR / 2, y + i * TINGGI_BARIS, { align: "center", baseline: "top" }));
    } else if (r.t === "kiri") {
      set(false, UKURAN);
      r.baris.forEach((l, i) => doc.text(l, M, y + i * TINGGI_BARIS, { baseline: "top" }));
    } else if (r.t === "baris") {
      set(!!r.tebal, UKURAN);
      doc.text(r.kiri, M + (r.geser || 0), y, { baseline: "top" });
      doc.text(r.kanan, LEBAR - M, y, { align: "right", baseline: "top" });
    }
    y += r.tinggi;
  });

  return doc;
}

export function namaFilePdfNota(pesanan) {
  const dasar = String(pesanan?.nomor_pesanan || "nota").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "nota";
  return `Nota-${dasar}.pdf`;
}

export function simpanPdfNotaGrosir(data) {
  const doc = buatPdfNotaGrosir(data);
  doc.save(namaFilePdfNota(data.pesanan));
}
