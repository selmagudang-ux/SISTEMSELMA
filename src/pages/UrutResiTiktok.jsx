import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { inputClass, btnFilled } from "../components/ui";
import { panggilTiktok } from "../lib/tiktokApi";

// =========================================================
// Panel "Ambil resi dari TikTok" untuk halaman Urut Resi.
// Menarik label SEMUA pesanan berstatus menunggu dikirim (kurir diatur TikTok) dari
// toko yang dipilih, lalu menyerahkannya ke alur upload Urut Resi yang sudah ada
// (onFiles = fungsi muat milik UrutResi). Logika baca & urut TIDAK diubah.
// PDF diambil lewat Edge Function (browser tidak bisa mengambil langsung dari TikTok)
// dan tidak disimpan di database.
// =========================================================

function base64KeFile(b64, nama) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new File([bytes], nama, { type: "application/pdf" });
}

export default function UrutResiTiktok({ onFiles }) {
  const [tokoList, setTokoList] = useState([]);
  const [toko, setToko] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [info, setInfo] = useState(null); // {teks, ok}

  useEffect(() => {
    let batal = false;
    panggilTiktok("daftar", {}, 20000)
      .then((r) => {
        if (batal) return;
        const aktif = (r.toko || []).filter((t) => t.aktif !== false);
        setTokoList(aktif);
        if (aktif.length > 0) setToko(aktif[0].shop_name);
      })
      .catch(() => { if (!batal) setTokoList([]); });
    return () => { batal = true; };
  }, []);

  if (tokoList.length === 0) return null; // belum ada toko TikTok terhubung: panel disembunyikan

  const ambil = async () => {
    if (!toko) return;
    setSibuk(true);
    setInfo({ teks: "Menyinkron pesanan terbaru dari TikTok…", ok: true });
    try {
      await panggilTiktok("sinkron-pesanan", { shop_name: toko, hari: 7 });

      const files = [];
      const galat = [];
      let offset = 0;
      let total = 0;
      while (offset !== null) {
        setInfo({ teks: `Mengambil label resi${total ? ` (${files.length} dari ±${total})` : ""}…`, ok: true });
        const r = await panggilTiktok("pdf-resi", { shop_name: toko, hari: 14, offset });
        total = r.total || 0;
        (r.files || []).forEach((f) => files.push(base64KeFile(f.base64, f.nama)));
        (r.galat || []).forEach((g) => galat.push(`${g.order_id}: ${g.error}`));
        offset = r.berikutnya ?? null;
      }

      if (files.length === 0) {
        setInfo({
          ok: false,
          teks: total === 0
            ? "Tidak ada pesanan yang menunggu dikirim di toko ini."
            : `Tidak ada label yang berhasil diambil. ${galat.slice(0, 3).join(" | ")}`,
        });
        return;
      }
      await onFiles(files);
      if (galat.length > 0) {
        setInfo({
          ok: false,
          teks: `${files.length} label diambil, ${galat.length} gagal (biasanya karena pengiriman belum diatur di Seller Center): ${galat.slice(0, 3).join(" | ")}${galat.length > 3 ? " …" : ""}`,
        });
      } else {
        setInfo(null); // pesan hasil baca ditampilkan oleh UrutResi sendiri
      }
    } catch (e) {
      setInfo({ teks: e.message || "Gagal mengambil resi dari TikTok.", ok: false });
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-md-outline-variant p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium text-md-on-surface">Ambil resi dari TikTok</div>
        <select className={inputClass} value={toko} onChange={(e) => setToko(e.target.value)} disabled={sibuk}>
          {tokoList.map((t) => (
            <option key={t.shop_id} value={t.shop_name}>
              {t.shop_name}{t.mode === "percobaan" ? " (percobaan)" : ""}
            </option>
          ))}
        </select>
        <button onClick={ambil} className={btnFilled} disabled={sibuk || !toko}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {sibuk ? "Mengambil…" : "Ambil semua yang menunggu dikirim"}
        </button>
      </div>
      <div className="text-xs text-md-on-surface-variant mt-2">
        Mengambil label pesanan 14 hari terakhir yang kurirnya diatur TikTok, lalu langsung diurutkan di bawah.
        Berbeda dengan upload manual, file label ini lewat server SISTEMSELMA sebentar (tidak disimpan).
      </div>
      {info && <div className={`text-sm mt-2 break-words ${info.ok ? "text-emerald-600" : "text-red-600"}`}>{info.teks}</div>}
    </div>
  );
}
