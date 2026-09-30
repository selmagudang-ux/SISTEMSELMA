import { useEffect, useRef, useState } from "react";
import { ScanLine, X, Loader2 } from "lucide-react";

// Scan barcode Code 128 lewat kamera (HP/laptop). Library pembaca (@zxing)
// baru di-load saat kamera dibuka, jadi tidak menambah beban awal aplikasi.
//
// continuous = false -> tutup otomatis begitu satu barcode terbaca.
// continuous = true  -> kamera tetap terbuka, tiap barcode yang terbaca
//                       dikirim ke onDetect (cocok untuk hitung +1 tiap scan).
export function ScanKameraModal({ onDetect, onClose, continuous = false, judul = "Scan Barcode" }) {
  const videoRef = useRef(null);
  const onDetectRef = useRef(onDetect);
  const onCloseRef = useRef(onClose);
  onDetectRef.current = onDetect;
  onCloseRef.current = onClose;

  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [pesanError, setPesanError] = useState("");
  const [terakhir, setTerakhir] = useState("");

  useEffect(() => {
    let batal = false;
    let controls = null;
    // Kode yang sama tetap terlihat di kamera tidak dihitung berulang — baru
    // dihitung lagi setelah hilang dari kamera minimal ~1,2 detik.
    const terlihat = new Map();

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Kamera tidak didukung. Pakai browser terbaru lewat HTTPS, atau aplikasi Android.");
        }
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (batal) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });

        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result || batal) return;
            const teks = result.getText();
            const sekarang = Date.now();
            const terakhirLihat = terlihat.get(teks) || 0;
            terlihat.set(teks, sekarang);
            if (sekarang - terakhirLihat < 1200) return;
            setTerakhir(teks);
            try {
              navigator.vibrate?.(60);
            } catch {
              // abaikan kalau perangkat tidak mendukung getar
            }
            onDetectRef.current?.(teks);
            if (!continuous) onCloseRef.current?.();
          }
        );
        if (batal) controls.stop();
        else setStatus("ready");
      } catch (e) {
        if (batal) return;
        const nama = e?.name || "";
        setPesanError(
          nama === "NotAllowedError" || nama === "SecurityError"
            ? "Izin kamera ditolak. Aktifkan izin kamera untuk browser/aplikasi ini lalu coba lagi."
            : nama === "NotFoundError"
            ? "Kamera tidak ditemukan di perangkat ini."
            : e?.message || "Kamera gagal dibuka."
        );
        setStatus("error");
      }
    })();

    return () => {
      batal = true;
      try {
        controls?.stop();
      } catch {
        // sudah berhenti
      }
    };
  }, [continuous]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-slate-100">{judul}</div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          {status === "ready" && (
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          )}
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs gap-2">
              <Loader2 size={16} className="animate-spin" /> Membuka kamera…
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-red-300">
              {pesanError}
            </div>
          )}
        </div>
        <div className="px-4 py-3 text-[11px] text-slate-400">
          {terakhir ? (
            <span>
              Terbaca: <span className="font-mono text-amber-300">{terakhir}</span>
            </span>
          ) : (
            "Arahkan garis merah ke barcode di stiker."
          )}
          {continuous && <span className="block mt-1 text-slate-500">Kamera tetap terbuka — tutup kalau sudah selesai.</span>}
        </div>
      </div>
    </div>
  );
}

export function TombolScanKamera({ onDetect, continuous = false, label = "Scan", judul }) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap"
      >
        <ScanLine size={14} /> {label}
      </button>
      {buka && (
        <ScanKameraModal
          continuous={continuous}
          judul={judul}
          onDetect={onDetect}
          onClose={() => setBuka(false)}
        />
      )}
    </>
  );
}
