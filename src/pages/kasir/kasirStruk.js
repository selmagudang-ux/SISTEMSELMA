import { fmtRp, normalisasiWa, entitasSesi, namaUsahaEntitas, alamatEntitas } from "../../lib/api";

// =========================================================
// KASIR — STRUK (fase 4)
// Satu bentuk data struk ("struk") dipakai untuk semuanya: preview/cetak thermal,
// PDF, dan teks WhatsApp. Struk dibuat dari dua sumber yang hasilnya SAMA:
//   1. langsung setelah bayar  -> susunStruk() dari keranjang yang baru dibayar
//   2. cetak ulang dari riwayat -> susunStruk() dari data yang dibaca dari database
// Semua angka sudah final (dihitung kasirHitung.js & diperiksa database), file ini
// TIDAK menghitung ulang total — hanya menata tampilan.
// =========================================================

// Cadangan kop kalau Pengaturan > Entitas belum mengisi alamat (sama dengan NotaGrosir).
const ALAMAT_SELMA = [
  "Jl. Leuwipanjang No.138 RT 9 RW 4",
  "Situsaeur, Bojongloa Kidul",
  "Kota Bandung, Jawa Barat 40234",
];

// Nama & alamat usaha untuk kop struk, mengikuti PT akun yang login.
export function identitasStruk(master) {
  const kode = entitasSesi();
  const nama = namaUsahaEntitas(master, kode);
  const alamat = alamatEntitas(master, kode);
  return { nama, alamat: alamat.length ? alamat : /selma/i.test(nama) ? ALAMAT_SELMA : [] };
}

export const tglJamId = (v) =>
  (v ? new Date(v) : new Date()).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// d: { nomor, waktu, kasir, items:[{sku,nama,qty,harga,diskon}], diskonTransaksi,
//      pembayaran:[{metode,jumlah}], bayar, kembalian, catatan, identitas, salinan }
// "diskon" per item = diskon rupiah baris itu (bukan persen).
export function susunStruk(d) {
  const items = (d.items || []).map((it) => {
    const qty = Number(it.qty) || 0;
    const harga = Number(it.harga) || 0;
    const diskon = Number(it.diskon) || 0;
    return { sku: it.sku, nama: it.nama || it.sku, qty, harga, diskon, subtotal: Math.round(qty * harga) - diskon };
  });
  const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
  const diskonTransaksi = Number(d.diskonTransaksi) || 0;
  const total = subtotal - diskonTransaksi;
  const pembayaran = (d.pembayaran || []).map((p) => ({ metode: p.metode, jumlah: Number(p.jumlah) || 0 }));
  const kembalian = Number(d.kembalian) || 0;
  const bayar = Number(d.bayar) || pembayaran.reduce((a, p) => a + p.jumlah, 0) + kembalian;
  return {
    nomor: d.nomor || "",
    waktu: d.waktu || new Date().toISOString(),
    kasir: d.kasir || "",
    pelanggan: d.pelanggan || "",
    catatan: d.catatan || "",
    identitas: d.identitas || { nama: "", alamat: [] },
    salinan: !!d.salinan,
    items,
    subtotal,
    diskonTransaksi,
    total,
    pembayaran,
    bayar,
    kembalian,
  };
}

// ---------- WhatsApp ----------
// Tanpa API berbayar, sama seperti InvoiceWa.jsx: pesan teks dibuka lewat wa.me.
// Ditulis ulang di sini (bukan import InvoiceWa) supaya jsPDF tidak ikut terbawa
// ke paket kasir yang harus ringan di HP.
export function linkWaStruk(wa, pesan) {
  const n = normalisasiWa(wa);
  return `https://wa.me/${n ? `62${n}` : ""}?text=${encodeURIComponent(pesan)}`;
}

export function pesanWaStruk(s) {
  const baris = s.items.map((it, i) => {
    const disk = it.diskon > 0 ? ` (diskon ${fmtRp(it.diskon)})` : "";
    return `${i + 1}. ${it.nama}\n   ${it.qty} x ${fmtRp(it.harga)} = ${fmtRp(it.subtotal)}${disk}`;
  });
  const bayarBaris = s.pembayaran.map((p) => `${p.metode}: ${fmtRp(p.jumlah)}`);
  return [
    `*${s.identitas.nama || "STRUK PEMBELIAN"}*`,
    ...(s.identitas.nama ? [`Struk pembelian`] : []),
    ``,
    `No: ${s.nomor}`,
    `Tanggal: ${tglJamId(s.waktu)}`,
    ...(s.pelanggan ? [`Pelanggan: ${s.pelanggan}`] : []),
    ``,
    ...baris,
    ``,
    ...(s.diskonTransaksi > 0 ? [`Subtotal: ${fmtRp(s.subtotal)}`, `Diskon: -${fmtRp(s.diskonTransaksi)}`] : []),
    `*TOTAL: ${fmtRp(s.total)}*`,
    ...bayarBaris,
    ...(s.kembalian > 0 ? [`Kembalian: ${fmtRp(s.kembalian)}`] : []),
    ``,
    `Terima kasih sudah berbelanja 🙏`,
  ].join("\n");
}

// ---------- PDF struk 80mm ----------
// Kertas selebar 80mm, tinggi mengikuti isi (dua putaran: ukur dulu, baru gambar).
// jsPDF dimuat saat dibutuhkan saja.
const LEBAR = 80;
const MARGIN = 4;

function gambarStruk(doc, s) {
  let y = MARGIN + 3;
  const kanan = LEBAR - MARGIN;
  const isiLebar = LEBAR - MARGIN * 2;
  const tengah = (t, ukuran = 8.5, tebal = false) => {
    doc.setFont("helvetica", tebal ? "bold" : "normal").setFontSize(ukuran);
    doc.text(String(t), LEBAR / 2, y, { align: "center" });
    y += ukuran * 0.45;
  };
  const kiriKanan = (a, b, tebal = false) => {
    doc.setFont("helvetica", tebal ? "bold" : "normal").setFontSize(8.5);
    doc.text(String(a), MARGIN, y);
    doc.text(String(b), kanan, y, { align: "right" });
    y += 4;
  };
  const garis = () => {
    doc.setLineDashPattern([0.8, 0.8], 0).setLineWidth(0.2);
    doc.line(MARGIN, y - 1.5, kanan, y - 1.5);
    doc.setLineDashPattern([], 0);
    y += 1.5;
  };

  if (s.identitas.nama) {
    tengah(s.identitas.nama, 11, true);
    y += 1.5;
  }
  s.identitas.alamat.forEach((a) => tengah(a, 7.5));
  y += 1.5;
  if (s.salinan) {
    tengah("*** CETAK ULANG ***", 8.5, true);
    y += 1;
  }
  garis();
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  [`No: ${s.nomor}`, `Tanggal: ${tglJamId(s.waktu)}`, ...(s.kasir ? [`Kasir: ${s.kasir}`] : []), ...(s.pelanggan ? [`Pelanggan: ${s.pelanggan}`] : [])].forEach((t) => {
    doc.text(t, MARGIN, y);
    y += 4;
  });
  garis();

  s.items.forEach((it, i) => {
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    const nama = doc.splitTextToSize(`${i + 1}. ${it.nama}`, isiLebar);
    doc.text(nama, MARGIN, y);
    y += nama.length * 3.8;
    kiriKanan(`   ${it.qty} x ${fmtRp(it.harga)}`, fmtRp(it.qty * it.harga));
    if (it.diskon > 0) kiriKanan("   Diskon", `-${fmtRp(it.diskon)}`);
  });
  garis();

  if (s.diskonTransaksi > 0) {
    kiriKanan("Subtotal", fmtRp(s.subtotal));
    kiriKanan("Diskon", `-${fmtRp(s.diskonTransaksi)}`);
  }
  kiriKanan("TOTAL", fmtRp(s.total), true);
  s.pembayaran.forEach((p) => kiriKanan(p.metode, fmtRp(p.jumlah)));
  if (s.kembalian > 0) {
    kiriKanan("Uang diterima", fmtRp(s.bayar));
    kiriKanan("Kembalian", fmtRp(s.kembalian), true);
  }
  if (s.catatan) {
    garis();
    const c = doc.splitTextToSize(`Catatan: ${s.catatan}`, isiLebar);
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(c, MARGIN, y);
    y += c.length * 3.6;
  }
  garis();
  y += 1;
  tengah("Terima kasih sudah berbelanja!", 8.5);
  return y + MARGIN;
}

export async function buatPdfStruk(s) {
  const { jsPDF } = await import("jspdf");
  const ukur = new jsPDF({ unit: "mm", format: [LEBAR, 600] });
  const tinggi = Math.ceil(gambarStruk(ukur, s));
  const doc = new jsPDF({ unit: "mm", format: [LEBAR, tinggi] });
  gambarStruk(doc, s);
  const nama = `Struk-${(s.nomor || "kasir").replace(/[^\w-]+/g, "_")}.pdf`;
  return { blob: doc.output("blob"), nama };
}

// Bagikan lewat menu share HP (bisa melampirkan PDF ke WhatsApp); di komputer
// atau browser tanpa dukungan share, PDF diunduh biasa.
export async function bagikanAtauUnduhPdf({ blob, nama }, pesan) {
  const file = new File([blob], nama, { type: "application/pdf" });
  const sentuh = typeof window !== "undefined" && window.matchMedia?.("(pointer:coarse)").matches;
  if (sentuh && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: pesan });
      return "dibagikan";
    } catch (e) {
      if (e?.name === "AbortError") return "batal";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "diunduh";
}

// ---------------------------------------------------------
// Printer struk (ESC/POS) hanya bisa mencetak karakter ASCII biasa; karakter lain (mis. tanda hubung panjang
// "–" / "—", garis miring khusus "⁄" "∕", tanda kutip melengkung, spasi khusus, simbol) dicetak sebagai "?".
// Fungsi ini mengganti karakter itu dengan padanan ASCII sebelum dikirim ke printer. Hanya untuk jalur cetak teks
// printer — tampilan di layar, PDF, dan cetak lewat HTML tidak berubah.
const PETA_ASCII = {
  "–": "-", "—": "-", "‐": "-", "‑": "-", "‒": "-", "−": "-", "﹣": "-", "－": "-",
  "⁄": "/", "∕": "/", "／": "/", "⧸": "/", "\\": "/",
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
  "×": "x", "✕": "x", "·": ".", "•": "-", "…": "...", "°": "o",
  "½": "1/2", "¼": "1/4", "¾": "3/4", "™": "TM", "©": "(c)", "®": "(R)",
};
export function keAsciiPrinter(teks) {
  if (typeof teks !== "string") return teks;
  let h = "";
  for (const ch of teks) {
    if (ch >= " " && ch <= "~") {
      h += ch;
      continue;
    }
    if (PETA_ASCII[ch]) {
      h += PETA_ASCII[ch];
      continue;
    }
    if (/\s/.test(ch)) {
      h += " "; // spasi khusus (nbsp, tab, dll.)
      continue;
    }
    const dasar = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // é -> e
    h += dasar && /^[\x20-\x7e]+$/.test(dasar) ? dasar : "-";
  }
  return h;
}
export const keAsciiBaris = (baris) =>
  (baris || []).map((b) => ({
    ...b,
    ...(b.teks != null ? { teks: keAsciiPrinter(b.teks) } : {}),
    ...(b.kiri != null ? { kiri: keAsciiPrinter(b.kiri) } : {}),
    ...(b.kanan != null ? { kanan: keAsciiPrinter(b.kanan) } : {}),
  }));