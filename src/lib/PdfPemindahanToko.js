// =========================================================
// PDF BARANG YANG DIAMBIL DARI MASTER BARANG KE BARANG TOKO — A4 portrait, diproses di browser dengan jsPDF.
// Dipanggil lewat dynamic import dari kasir/PindahKeToko.jsx (tombol "Unduh PDF" di layar hasil) supaya jsPDF
// tidak ikut di bundle awal.
// baris: [{ sku, kode, nama, qty }]  (qty = stok gudang yang dipindah ke toko; 0 = hanya didaftarkan)
// arah: "ke_toko" (default, Master Barang -> Barang Toko) | "ke_gudang" (Barang Toko -> gudang, dipanggil dari kasir/BarangToko.jsx)
//       | "campur" (kasir/RiwayatPemindahan.jsx: tiap baris membawa arah "ke_toko"/"ke_gudang" & waktu sendiri; PDF pakai kolom Waktu + Arah)
// periode: teks bebas (mis. "01 Nov 2026 s/d 16 Nov 2026"), dicetak kalau diisi.
// =========================================================
import { jsPDF } from "jspdf";

const NAVY = [31, 56, 100];
const SOFT = [237, 242, 250];
const GREY = [210, 216, 224];

// judul / labelKode (opsional): dipakai Barang TikTok supaya judul & kepala kolom sesuai (mis. "Kode TikTok").
export function buatPdfPemindahanToko({ namaUsaha = "", petugas = "", waktu = new Date(), catatan = "", baris = [], arah = "ke_toko", periode = "", judul = "", labelKode = "Kode Toko" }) {
  const campur = arah === "campur";
  const keGudang = arah === "ke_gudang";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 12;
  const LEBAR = W - M * 2;
  const K = campur
    ? { no: M + 2, waktu: M + 9, sku: M + 36, kode: M + 74, nama: M + 100, arah: W - M - 40, qty: W - M - 2 }
    : { no: M + 2, sku: M + 12, kode: M + 62, nama: M + 94, qty: W - M - 2 }; // qty rata kanan
  let y = M;

  const tglJam = new Date(waktu).toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const tglPendek = (w) =>
    w ? new Date(w).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
  const potong = (s, maks) => {
    let t = String(s ?? "");
    while (t.length > 1 && doc.getTextWidth(t) > maks) t = t.slice(0, -1);
    return t === String(s ?? "") ? t : `${t.slice(0, -1)}…`;
  };

  const kepala = () => {
    doc.setFillColor(...NAVY);
    doc.rect(M, y, LEBAR, 8, "F");
    doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9);
    doc.text("No", K.no, y + 5.3);
    if (campur) doc.text("Waktu", K.waktu, y + 5.3);
    doc.text("SKU Gudang", K.sku, y + 5.3);
    doc.text(labelKode, K.kode, y + 5.3);
    doc.text("Nama Barang", K.nama, y + 5.3);
    if (campur) doc.text("Arah", K.arah, y + 5.3);
    doc.text("Jumlah", K.qty, y + 5.3, { align: "right" });
    y += 8;
  };

  // Judul
  doc.setTextColor(20, 20, 20).setFont("helvetica", "bold").setFontSize(14);
  doc.text(judul || (campur ? "RIWAYAT PERPINDAHAN BARANG TOKO - GUDANG" : keGudang ? "BARANG DIKEMBALIKAN DARI BARANG TOKO KE GUDANG" : "BARANG DIAMBIL DARI MASTER BARANG KE BARANG TOKO"), M, y + 5);
  y += 9;
  doc.setFont("helvetica", "normal").setFontSize(10);
  if (namaUsaha) {
    doc.text(`Entitas : ${namaUsaha}`, M, y + 4);
    y += 5;
  }
  if (periode) {
    doc.text(`Periode : ${periode}`, M, y + 4);
    y += 5;
  }
  doc.text(`${campur ? "Dicetak" : "Tanggal"} : ${tglJam}`, M, y + 4);
  y += 5;
  if (petugas) {
    doc.text(`Petugas : ${petugas}`, M, y + 4);
    y += 5;
  }
  if (catatan) {
    doc.text(`Catatan : ${potong(catatan, LEBAR - 20)}`, M, y + 4);
    y += 5;
  }
  y += 4;

  kepala();
  doc.setFont("helvetica", "normal").setFontSize(9);
  let total = 0;
  let totalKeToko = 0;
  let totalKeGudang = 0;
  baris.forEach((b, i) => {
    if (y + 7 > H - M - 14) {
      doc.addPage();
      y = M;
      kepala();
      doc.setFont("helvetica", "normal").setFontSize(9);
    }
    if (i % 2 === 0) {
      doc.setFillColor(...SOFT);
      doc.rect(M, y, LEBAR, 7, "F");
    }
    doc.setTextColor(20, 20, 20);
    doc.text(String(i + 1), K.no, y + 4.8);
    const q = Number(b.qty) || 0;
    total += q;
    if (campur) {
      const kg = b.arah === "ke_gudang";
      if (kg) totalKeGudang += q;
      else totalKeToko += q;
      doc.text(tglPendek(b.waktu), K.waktu, y + 4.8);
      doc.text(potong(b.sku, K.kode - K.sku - 2), K.sku, y + 4.8);
      doc.text(potong(b.kode, K.nama - K.kode - 2), K.kode, y + 4.8);
      doc.text(potong(b.nama, K.arah - K.nama - 2), K.nama, y + 4.8);
      doc.text(kg ? "Ke Gudang" : "Ke Toko", K.arah, y + 4.8);
    } else {
      doc.text(potong(b.sku, 48), K.sku, y + 4.8);
      doc.text(potong(b.kode, 30), K.kode, y + 4.8);
      doc.text(potong(b.nama, K.qty - K.nama - 18), K.nama, y + 4.8);
    }
    doc.text(q > 0 ? String(q) : "-", K.qty, y + 4.8, { align: "right" });
    y += 7;
  });
  doc.setDrawColor(...GREY).line(M, y, W - M, y);
  y += 6;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(
    campur
      ? `Total ${baris.length} pemindahan  |  ke gudang ${totalKeGudang} pcs  |  ke toko ${totalKeToko} pcs`
      : `Total ${baris.length} barang  |  ${total} pcs ${keGudang ? "dikembalikan ke gudang" : "dipindah ke toko"}`,
    W - M,
    y,
    { align: "right" },
  );

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 120, 120);
    doc.text(`Halaman ${p} / ${n}`, W - M, H - 6, { align: "right" });
  }

  const d = new Date(waktu);
  const pad = (x) => String(x).padStart(2, "0");
  doc.save(`${campur ? "riwayat-perpindahan-toko-gudang" : keGudang ? "barang-dikembalikan-ke-gudang" : "barang-diambil-ke-toko"}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.pdf`);
}
