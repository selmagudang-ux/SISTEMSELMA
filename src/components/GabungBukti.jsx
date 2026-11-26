import { useState } from "react";
import { Files, Loader2 } from "lucide-react";
import { sb, kompresFotoProduk, sbUploadFoto } from "../lib/api";
import { daftarBukti, urlAdalahPdf, gabungBuktiJadiPdf, BUKTI_MAKS_TANPA_GABUNG } from "../lib/bukti";

// Tombol "Gabung jadi PDF" di baris transaksi Keuangan yang buktinya LEBIH dari 3 (data lama yang diunggah satu per satu).
// Semua bukti diunduh, digabung jadi SATU PDF (satu foto per halaman A4), diunggah, lalu daftar bukti transaksi diganti
// dengan PDF itu. Baris lain yang memakai daftar bukti yang sama persis (mis. satu transfer dipecah beberapa baris)
// ikut diperbarui. File lama di storage dibiarkan (tidak dihapus).
export default function TombolGabungBukti({ t, reload, showToast }) {
  const [proses, setProses] = useState(false);
  const urls = daftarBukti(t);
  if (urls.length <= BUKTI_MAKS_TANPA_GABUNG) return null;

  const gabung = async () => {
    if (proses) return;
    if (!window.confirm(`Gabungkan ${urls.length} bukti transaksi ini menjadi 1 file PDF?\n\nIkon bukti akan diganti dengan 1 PDF. Foto aslinya tidak dihapus dari penyimpanan.`)) return;
    setProses(true);
    try {
      const bagian = [];
      for (let i = 0; i < urls.length; i++) {
        let resp;
        try {
          resp = await fetch(urls[i]);
        } catch {
          throw new Error(`Bukti ke-${i + 1} tidak bisa diunduh. Periksa koneksi lalu coba lagi.`);
        }
        if (!resp.ok) throw new Error(`Bukti ke-${i + 1} tidak bisa diunduh (kode ${resp.status}).`);
        const blob = await resp.blob();
        if (urlAdalahPdf(urls[i]) || blob.type === "application/pdf") {
          bagian.push({ jenis: "pdf", buf: await blob.arrayBuffer() });
        } else {
          const kecil = await kompresFotoProduk(new File([blob], `bukti-${i + 1}`, { type: blob.type || "image/jpeg" }), { maxDim: 1600, quality: 0.88 });
          bagian.push({ jenis: "gambar", buf: await kecil.arrayBuffer(), tipe: kecil.type });
        }
      }
      const bytes = await gabungBuktiJadiPdf(bagian);
      const pdf = new File([bytes], `bukti-gabungan-${urls.length}-berkas.pdf`, { type: "application/pdf" });
      const urlBaru = await sbUploadFoto(pdf, `bukti-kas-${Date.now()}-${t.id}-gabungan.pdf`);

      // Baris lain dengan daftar bukti yang sama persis ikut diganti (bukan hanya baris ini).
      let ids = [t.id];
      try {
        const kembar = await sb(`keuangan_transaksi?bukti_url=eq.${encodeURIComponent(urls[0])}&select=id,bukti_url,bukti_urls`);
        const kunci = JSON.stringify(urls);
        ids = [...new Set([t.id, ...(kembar || []).filter((r) => JSON.stringify(daftarBukti(r)) === kunci).map((r) => r.id)])];
      } catch {
        /* cukup baris ini saja */
      }
      await sb(`keuangan_transaksi?id=in.(${ids.join(",")})`, {
        method: "PATCH",
        body: JSON.stringify({ bukti_urls: [urlBaru], bukti_url: urlBaru }),
      });
      showToast?.(`${urls.length} bukti digabung jadi 1 PDF`);
      await reload?.();
    } catch (err) {
      showToast?.(err?.message || "Gagal menggabungkan bukti", "err");
    } finally {
      setProses(false);
    }
  };

  return (
    <button
      type="button"
      onClick={gabung}
      disabled={proses}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50"
      title={`Gabungkan ${urls.length} bukti jadi 1 PDF`}
    >
      {proses ? <Loader2 size={12} className="animate-spin" /> : <Files size={12} />}
      {proses ? "Menggabung…" : "Gabung jadi PDF"}
    </button>
  );
}
