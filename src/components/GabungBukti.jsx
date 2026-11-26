import { useState } from "react";
import { Files, Download, Loader2 } from "lucide-react";
import { sb } from "../lib/api";
import { gabungUrlBuktiJadiPdf } from "../pages/AlurKas";
import { daftarBukti, urlAdalahPdf, BUKTI_MAKS_TANPA_GABUNG } from "../lib/bukti";

// Tombol "Gabung jadi PDF" di baris transaksi Keuangan yang buktinya lebih dari 1 (data lama yang diunggah satu per satu).
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
      const urlBaru = await gabungUrlBuktiJadiPdf(urls, t.id);

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

// Tombol unduh bukti di samping ikon paperclip: satu klik menyimpan file dengan nama rapi
// "Bukti-<tanggal>-<jumlah>.pdf" (bukti lebih dari satu diberi nomor -1, -2, ...).
// Hanya untuk transaksi dengan 1 bukti; kalau lebih, pakai "Gabung jadi PDF" dulu.
export function TombolUnduhBukti({ t, showToast }) {
  const [proses, setProses] = useState(false);
  const urls = daftarBukti(t);
  if (!urls.length || urls.length > BUKTI_MAKS_TANPA_GABUNG) return null;

  const unduh = async () => {
    if (proses) return;
    setProses(true);
    try {
      const tgl = String(t.tanggal || "").slice(0, 10) || "tanpa-tanggal";
      const jml = Math.round(Number(t.jumlah) || 0);
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        const resp = await fetch(u);
        if (!resp.ok) throw new Error(`kode ${resp.status}`);
        const blob = await resp.blob();
        const ext = urlAdalahPdf(u) || blob.type === "application/pdf" ? "pdf" : /png/i.test(blob.type) ? "png" : /webp/i.test(blob.type) ? "webp" : "jpg";
        const nama = `Bukti-${tgl}-${jml}${urls.length > 1 ? `-${i + 1}` : ""}.${ext}`;
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = nama;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
        if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 400)); // jeda supaya browser tidak memblokir unduhan beruntun
      }
    } catch (err) {
      showToast?.(`Gagal mengunduh bukti (${err?.message || "koneksi"}). Buka lewat ikon paperclip lalu simpan manual.`, "err");
    } finally {
      setProses(false);
    }
  };

  return (
    <button
      type="button"
      onClick={unduh}
      disabled={proses}
      className="p-1.5 rounded-lg text-sky-400/80 hover:text-sky-300 hover:bg-slate-800 disabled:opacity-50"
      title={urls.length > 1 ? `Unduh ${urls.length} bukti` : "Unduh bukti"}
    >
      {proses ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
    </button>
  );
}
