// =========================================================
// LAPORAN KEUANGAN — VERSI NARASI (BAHASA AWAM)
// Mengubah angka-angka transaksi jadi ringkasan kalimat yang mudah
// dibaca orang non-akuntan — seolah dijelaskan langsung oleh akuntan,
// bukan sekadar tabel angka. Dipakai di halaman Keuangan (tombol
// "Laporan Sederhana"), bisa disalin teksnya atau dikirim ke WhatsApp.
// =========================================================
import { fmtRp } from "./api";
import { formatTanggalID } from "../components/ui";

function labelDari(list, kode) {
  if (!kode) return "";
  const found = (list || []).find((m) => m.kode === kode);
  return found ? found.label : kode;
}

function periodeLabel(dari, sampai) {
  if (dari && sampai) return `${formatTanggalID(dari)} sampai ${formatTanggalID(sampai)}`;
  if (dari) return `sejak ${formatTanggalID(dari)}`;
  if (sampai) return `sampai ${formatTanggalID(sampai)}`;
  return "seluruh waktu (belum ada batas tanggal)";
}

// list = transaksi yang sudah difilter rentang tanggal (dari ringkasanKeuangan()),
// TIDAK dipengaruhi oleh kotak pencarian/filter jenis di layar — supaya angka di
// laporan selalu konsisten dengan kartu ringkasan (Kas Masuk/Keluar/Saldo) di atas.
export function buatLaporanNarasi({
  dari,
  sampai,
  list,
  saldoRekening,
  kategoriKeluarList,
  namaUsaha,
}) {
  const transaksiNonTransfer = (list || []).filter((t) => t.tipe !== "transfer");
  const masuk = transaksiNonTransfer
    .filter((t) => t.tipe === "masuk")
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  const keluar = transaksiNonTransfer
    .filter((t) => t.tipe === "keluar")
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  const saldo = masuk - keluar;

  // Breakdown pengeluaran per kategori, diurutkan dari yang terbesar.
  const petaKeluar = {};
  transaksiNonTransfer
    .filter((t) => t.tipe === "keluar")
    .forEach((t) => {
      const label = labelDari(kategoriKeluarList, t.kategori) || "Lainnya";
      petaKeluar[label] = (petaKeluar[label] || 0) + (Number(t.jumlah) || 0);
    });
  const topKeluar = Object.entries(petaKeluar).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const rekeningMinus = (saldoRekening || []).filter((r) => r.saldo < 0);

  const baris = [];
  baris.push(`Laporan Keuangan${namaUsaha ? ` — ${namaUsaha}` : ""}`);
  baris.push(`Periode: ${periodeLabel(dari, sampai)}`);
  baris.push("");
  baris.push(
    `Halo, berikut ringkasan kondisi keuangan untuk periode ini supaya mudah dipahami.`
  );
  baris.push("");
  baris.push(
    `Selama periode ini, total uang yang masuk sekitar ${fmtRp(masuk)}, sedangkan uang yang keluar sekitar ${fmtRp(keluar)}.`
  );

  if (saldo >= 0) {
    baris.push(
      `Setelah dikurangi semua pengeluaran, masih ada sisa sebesar ${fmtRp(saldo)}. Artinya kas bertambah pada periode ini.`
    );
  } else {
    baris.push(
      `Pengeluaran lebih besar daripada pemasukan, sehingga terjadi kekurangan (minus) sebesar ${fmtRp(Math.abs(saldo))} pada periode ini.`
    );
  }

  if (masuk > 0) {
    const persenKeluar = Math.round((keluar / masuk) * 100);
    baris.push(`Sebagai gambaran, sekitar ${persenKeluar}% dari uang yang masuk terpakai untuk pengeluaran.`);
  }

  if (topKeluar.length > 0) {
    baris.push("");
    baris.push("Pengeluaran terbesar ada pada kategori berikut:");
    topKeluar.forEach(([label, jumlah], i) => {
      baris.push(`${i + 1}. ${label} — ${fmtRp(jumlah)}`);
    });
  }

  if ((saldoRekening || []).length > 0) {
    baris.push("");
    baris.push("Posisi saldo di masing-masing rekening/kas saat ini:");
    saldoRekening.forEach((r) => {
      baris.push(`- ${r.label}: ${fmtRp(r.saldo)}${r.saldo < 0 ? "  (perlu perhatian, minus)" : ""}`);
    });
  }

  if (rekeningMinus.length > 0) {
    baris.push("");
    baris.push(
      `Catatan: ada ${rekeningMinus.length} rekening dengan saldo minus (${rekeningMinus
        .map((r) => r.label)
        .join(", ")}). Sebaiknya segera dicek supaya tidak menumpuk.`
    );
  }

  baris.push("");
  baris.push(
    `Total ada ${transaksiNonTransfer.length} transaksi (di luar transfer antar rekening) yang tercatat pada periode ini.`
  );
  baris.push("");
  baris.push(
    saldo >= 0
      ? "Kesimpulannya, kondisi kas secara umum masih sehat. Tetap jaga pencatatan supaya mudah dipantau ke depannya."
      : "Kesimpulannya, perlu perhatian karena pengeluaran melebihi pemasukan pada periode ini. Ada baiknya ditinjau ulang pos pengeluaran yang paling besar di atas."
  );

  return baris.join("\n");
}