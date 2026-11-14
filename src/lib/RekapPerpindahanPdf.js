// =========================================================
// PDF REKAP PERPINDAHAN (harian / mingguan / bulanan) — A4 portrait, semua
// diproses di browser. Dipanggil lewat dynamic import dari
// pages/RekapPerpindahan.jsx supaya jsPDF tidak ikut di bundle awal.
// =========================================================
import { jsPDF } from "jspdf";

const NAVY = [31, 56, 100];
const BLUE = [46, 83, 149];
const SOFT = [237, 242, 250];
const GREY = [210, 216, 224];
const BLACK = [20, 20, 20];
const AMBER = [180, 100, 0];

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString("id-ID")}`;

export function buatPdfRekapPerpindahan(r) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 12;
  const LEBAR = W - M * 2; // 186
  let y = M;

  const butuh = (tinggi) => {
    if (y + tinggi > H - M) {
      doc.addPage();
      y = M;
      return true;
    }
    return false;
  };

  // ----- Judul -----
  doc.setFillColor(...NAVY);
  doc.rect(M, y, LEBAR, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(`REKAP PERPINDAHAN ${r.modeLabel.toUpperCase()} - ${String(r.namaUsaha).toUpperCase()}`, M + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(r.labelRentang, M + 3, y + 11.2);
  y += 19;

  const seksi = (teks) => {
    butuh(14);
    doc.setFillColor(...BLUE);
    doc.rect(M, y, LEBAR, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(teks, M + 2, y + 4.2);
    y += 8;
  };

  const subJudul = (teks, warna = NAVY) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...warna);
    butuh(6);
    doc.text(teks, M + 2, y + 3);
    y += 5;
  };

  const ringkas = (pasang) => {
    doc.setFontSize(9);
    pasang.forEach(([label, nilai]) => {
      butuh(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);
      doc.text(label, M + 2, y + 3.5);
      doc.setFont("helvetica", "bold");
      doc.text(String(nilai), M + 62, y + 3.5);
      y += 5;
    });
    y += 2;
  };

  // kolom: [{ h, w, key, align?, fmt? }] — total w harus = LEBAR (186)
  const tabel = (kolom, baris, kosong) => {
    if (!baris.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 120, 120);
      butuh(6);
      doc.text(kosong, M + 2, y + 3.5);
      y += 8;
      return;
    }
    const kepala = () => {
      butuh(7);
      doc.setFillColor(...SOFT);
      doc.rect(M, y, LEBAR, 5.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);
      let x = M;
      kolom.forEach((k) => {
        if (k.align === "right") doc.text(k.h, x + k.w - 1.5, y + 3.8, { align: "right" });
        else doc.text(k.h, x + 1.5, y + 3.8);
        x += k.w;
      });
      y += 5.5;
    };
    kepala();
    baris.forEach((b) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const sel = kolom.map((k) => {
        const v = k.fmt ? k.fmt(b[k.key], b) : b[k.key];
        return doc.splitTextToSize(String(v ?? ""), k.w - 3);
      });
      const n = Math.max(...sel.map((s) => s.length));
      const tinggi = n * 3.4 + 1.8;
      if (butuh(tinggi + 1)) kepala();
      let x = M;
      kolom.forEach((k, i) => {
        doc.setTextColor(...BLACK);
        sel[i].forEach((teks, j) => {
          const ty = y + 3.2 + j * 3.4;
          if (k.align === "right") doc.text(teks, x + k.w - 1.5, ty, { align: "right" });
          else doc.text(teks, x + 1.5, ty);
        });
        x += k.w;
      });
      y += tinggi;
      doc.setDrawColor(...GREY);
      doc.line(M, y, M + LEBAR, y);
    });
    y += 4;
  };

  // ----- 1. Barang: Gudang <-> Toko -----
  seksi("1. BARANG: GUDANG <-> TOKO");
  ringkas([
    ["Gudang -> Toko", `${r.barang.keToko} pcs`],
    ["Toko -> Gudang", `${r.barang.keGudang} pcs`],
  ]);
  if (r.multiHari && r.barang.perSku.length > 0) {
    subJudul("Ringkasan per SKU");
    tabel(
      [
        { h: "SKU gudang", w: 90, key: "sku" },
        { h: "Ke Toko (pcs)", w: 48, key: "keToko", align: "right" },
        { h: "Ke Gudang (pcs)", w: 48, key: "keGudang", align: "right" },
      ],
      r.barang.perSku,
      ""
    );
    subJudul("Rincian per kejadian");
  }
  tabel(
    [
      { h: "Waktu", w: 22, key: "waktu" },
      { h: "Arah", w: 26, key: "arahLabel" },
      { h: "SKU gudang", w: 46, key: "sku" },
      { h: "Barang toko", w: 46, key: "kodeToko", fmt: (v, b) => [v, b.namaToko].filter(Boolean).join(" - ") },
      { h: "Qty", w: 12, key: "qty", align: "right" },
      { h: "Catatan", w: 34, key: "catatan" },
    ],
    r.barang.gudangToko,
    "Tidak ada perpindahan gudang <-> toko pada rentang ini."
  );

  // ----- 2. Barang: Antar Entitas -----
  seksi("2. BARANG: ANTAR ENTITAS");
  ringkas([
    ["Dikirim", `${r.barang.dikirimQty} pcs`],
    ["Diterima", `${r.barang.diterimaQty} pcs`],
  ]);
  tabel(
    [
      { h: "Waktu", w: 22, key: "waktu" },
      { h: "Kejadian", w: 18, key: "jenis" },
      { h: "Kode", w: 28, key: "kode" },
      { h: "Dari -> Ke", w: 36, key: "asal", fmt: (v, b) => `${v} -> ${b.tujuan}` },
      { h: "Qty", w: 12, key: "qty", align: "right" },
      { h: "Isi / catatan", w: 70, key: "daftar", fmt: (v, b) => [v, b.selisih > 0 ? `(selisih ${b.selisih})` : "", b.catatan ? `[${b.catatan}]` : ""].filter(Boolean).join(" ") },
    ],
    r.barang.antarEntitas,
    "Tidak ada kejadian transfer antar entitas pada rentang ini."
  );

  if (r.barang.menggantung.length) {
    subJudul("Masih di jalan saat ini (belum dikonfirmasi penerima)", AMBER);
    tabel(
      [
        { h: "Kode", w: 40, key: "kode" },
        { h: "Dari -> Ke", w: 80, key: "asal", fmt: (v, b) => `${v} -> ${b.tujuan}` },
        { h: "Qty", w: 26, key: "qty", align: "right" },
        { h: "Dikirim sejak", w: 40, key: "sejak" },
      ],
      r.barang.menggantung,
      ""
    );
  }

  // ----- 3. Uang: Antar Entitas -----
  seksi("3. UANG: ANTAR ENTITAS");
  ringkas([["Total", rp(r.uang.totalAntarEntitas)]]);
  tabel(
    [
      { h: "Waktu", w: 22, key: "waktu" },
      { h: "Jenis", w: 32, key: "jenis" },
      { h: "Dari rekening", w: 40, key: "dari" },
      { h: "Ke rekening", w: 40, key: "ke" },
      { h: "Jumlah", w: 28, key: "jumlah", align: "right", fmt: (v) => rp(v) },
      { h: "Rincian", w: 24, key: "rincian", fmt: (v) => (v ? `${v} transaksi` : "") },
    ],
    r.uang.antarEntitas,
    "Tidak ada transfer uang antar entitas pada rentang ini."
  );

  // ----- 4. Uang: semua transaksi keuangan pada rentang terpilih -----
  seksi("4. TRANSAKSI SELAMA PERIODE TERPILIH");
  ringkas([
    ["Pemasukan", `${rp(r.uang.totalMasuk)} (${r.uang.jumlahMasuk} transaksi)`],
    ["Pengeluaran", `${rp(r.uang.totalKeluar)} (${r.uang.jumlahKeluar} transaksi)`],
    ["Transfer", `${rp(r.uang.totalTransfer)} (${r.uang.jumlahTransfer} transaksi)`],
  ]);
  tabel(
    [
      { h: "Waktu", w: 20, key: "waktu" },
      { h: "Jenis", w: 26, key: "jenis" },
      { h: "Rekening", w: 44, key: "rekening" },
      { h: "Kategori", w: 32, key: "kategori" },
      { h: "Keterangan", w: 36, key: "keterangan" },
      {
        h: "Jumlah",
        w: 28,
        key: "jumlah",
        align: "right",
        fmt: (v, b) => `${b.tipe === "masuk" ? "+" : b.tipe === "keluar" ? "-" : ""}${rp(v)}`,
      },
    ],
    r.uang.transaksi,
    "Tidak ada transaksi keuangan pada rentang ini."
  );

  // ----- Footer nomor halaman -----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Rekap Perpindahan ${r.dari}${r.multiHari ? ` s/d ${r.sampai}` : ""} - halaman ${i}/${total}`, W / 2, H - 6, { align: "center" });
  }

  doc.save(`rekap-perpindahan_${r.dari}${r.multiHari ? `_${r.sampai}` : ""}.pdf`);
}
