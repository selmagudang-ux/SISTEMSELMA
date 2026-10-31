import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/api";

// Halaman tujuan redirect setelah penjual mengotorisasi aplikasi di TikTok Shop
// (https://<domain>/tiktok-callback?code=...). Berdiri sendiri: tidak memakai
// sesi login SELMA, karena sessionStorage hilang kalau otorisasi dibuka di tab lain.
// Kode otorisasi dikirim ke Edge Function "tiktok-auth" yang menukarnya jadi token
// di server (butuh App secret). Token tidak pernah lewat browser.

export default function TiktokCallback() {
  const [status, setStatus] = useState("memproses"); // memproses | sukses | gagal
  const [pesan, setPesan] = useState("");
  const [toko, setToko] = useState([]);
  const sudahJalan = useRef(false);

  useEffect(() => {
    // StrictMode menjalankan efek dua kali di dev; kode otorisasi hanya boleh dipakai sekali.
    if (sudahJalan.current) return;
    sudahJalan.current = true;

    const params = new URLSearchParams(window.location.search);
    const kode = params.get("code");
    // TikTok biasanya ikut mengirim app_key; dipakai server untuk memilih app yang tepat.
    const appKey = params.get("app_key") || "";
    const galat = params.get("error") || params.get("error_description");

    // Buang kode dari address bar supaya tidak tertinggal di riwayat browser.
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* abaikan */
    }

    if (!kode) {
      setStatus("gagal");
      setPesan(galat ? `TikTok menolak otorisasi: ${galat}` : "Alamat ini tidak membawa kode otorisasi dari TikTok.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-auth`, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ aksi: "tukar-kode", kode, app_key: appKey }),
        });
        const hasil = await res.json().catch(() => null);
        if (!res.ok || !hasil || hasil.error) {
          throw new Error(hasil?.error || `Permintaan gagal (HTTP ${res.status}).`);
        }
        setToko(hasil.toko || []);
        setStatus("sukses");
      } catch (e) {
        setStatus("gagal");
        setPesan(e?.message || "Terjadi kesalahan.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === "memproses" && (
          <>
            <Loader2 size={32} className="animate-spin mx-auto mb-4 text-slate-400" />
            <div className="font-bold text-lg mb-1">Menghubungkan toko TikTok…</div>
            <p className="text-sm text-slate-400">Jangan tutup halaman ini.</p>
          </>
        )}

        {status === "sukses" && (
          <>
            <CheckCircle2 size={36} className="mx-auto mb-4 text-emerald-400" />
            <div className="font-bold text-lg mb-2">Toko terhubung</div>
            <ul className="text-sm text-slate-300 mb-6 space-y-1">
              {toko.map((t) => (
                <li key={t.shop_id}>
                  {t.shop_name || "(tanpa nama)"} <span className="text-slate-500">· ID {t.shop_id}</span>
                  {t.region ? <span className="text-slate-500"> · {t.region}</span> : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mb-6">
              Toko baru otomatis ditandai sebagai <b>percobaan</b> di database.
            </p>
            <a href="/" className="text-xs font-medium bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg border border-slate-700">
              Kembali ke SISTEMSELMA
            </a>
          </>
        )}

        {status === "gagal" && (
          <>
            <AlertCircle size={36} className="mx-auto mb-4 text-red-400" />
            <div className="font-bold text-lg mb-2">Gagal menghubungkan toko</div>
            <p className="text-sm text-slate-300 mb-2 break-words">{pesan}</p>
            <p className="text-xs text-slate-500 mb-6">
              Kode otorisasi hanya berlaku sekali dan singkat. Kalau sudah terpakai, ulangi otorisasi dari Partner Center.
            </p>
            <a href="/" className="text-xs font-medium bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg border border-slate-700">
              Kembali ke SISTEMSELMA
            </a>
          </>
        )}
      </div>
    </div>
  );
}