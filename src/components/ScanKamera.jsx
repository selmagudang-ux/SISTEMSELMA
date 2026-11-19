import { useEffect, useRef, useState } from "react";
import { ScanLine, X, Loader2 } from "lucide-react";

// Scan barcode Code 128 (default) atau QR (format="qr") lewat kamera HP/laptop.
// Library pembaca (@zxing)
// baru di-load saat kamera dibuka, jadi tidak menambah beban awal aplikasi.
//
// continuous = false -> tutup otomatis begitu satu barcode terbaca.
// continuous = true  -> kamera tetap terbuka, tiap barcode yang terbaca
//                       dikirim ke onDetect (cocok untuk hitung +1 tiap scan).
//
// hasil + renderHasil (opsional) -> tampilkan hasil tiap scan (berhasil/gagal/duplikat/cancel) langsung
// di atas kamera sebagai kilatan warna + kartu hasil, supaya operator tidak hanya mengandalkan suara.
// hasil = objek { tipe: "ok"|"cancel"|"dup"|"asing"|"err", tercatat?: bool, baruSaja?: bool, ... }; renderHasil(hasil) -> elemen React.
//   tercatat = true  -> scan ini MENAMBAH hitungan; false -> tidak menambah (double / terbaca ulang / gagal).
//   baruSaja = true  -> resi yang sama baru saja tercatat dari perangkat ini (terbaca ulang, bukan paket double).
// ringkasan (opsional) = { total, label } -> angka besar "label: total" di atas kamera (mis. "Sesi 1: 42 resi").
// Selain itu modal menghitung sendiri: tercatat / double / cancel / gagal selama kamera ini terbuka,
// menampilkan strip status terakhir yang TIDAK hilang sampai scan berikutnya, dan 5 scan terakhir.
const WARNA_KILAT = {
  ok: { bg: "bg-emerald-500/55", strip: "bg-emerald-600", teks: "BERHASIL", ikon: "✓" },
  cancel: { bg: "bg-red-600/70", strip: "bg-red-700", teks: "CANCEL", ikon: "✕" },
  dup: { bg: "bg-orange-500/75", strip: "bg-orange-600", teks: "RESI DOUBLE", ikon: "!" },
  ulang: { bg: "bg-sky-500/60", strip: "bg-sky-600", teks: "TERBACA ULANG", ikon: "✓" },
  asing: { bg: "bg-amber-500/65", strip: "bg-amber-600", teks: "TIDAK ADA DI ORDERAN", ikon: "!" },
  err: { bg: "bg-red-600/70", strip: "bg-red-700", teks: "GAGAL", ikon: "✕" },
};

const kunciTampil = (h) => (h?.tipe === "dup" && h.baruSaja ? "ulang" : h?.tipe);
const jamPendek = (d) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ScanKameraModal({ onDetect, onClose, continuous = false, judul = "Scan Barcode", format = "code128", hasil = null, renderHasil = null, ringkasan = null }) {
  const isQr = format === "qr";
  // format="resi": resi paket — baca barcode garis (Code 128/39/93, ITF, Codabar; QR & EAN tidak) dan minta kamera
  // resolusi tinggi + fokus otomatis, karena barcode di label resi kecil & rapat.
  const isResi = format === "resi";
  const videoRef = useRef(null);
  const onDetectRef = useRef(onDetect);
  const onCloseRef = useRef(onClose);
  onDetectRef.current = onDetect;
  onCloseRef.current = onClose;

  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [pesanError, setPesanError] = useState("");
  const [terakhir, setTerakhir] = useState("");
  // Hasil yang sudah ada sebelum kamera dibuka tidak ditampilkan (bukan dari sesi kamera ini).
  const hasilAwal = useRef(hasil);
  const [kilat, setKilat] = useState(null);
  // Hitungan selama kamera ini terbuka + 5 scan terakhir (supaya operator tahu sudah berapa yang terscan
  // dan scan mana yang tercatat / double, tanpa menutup kamera).
  const [hitung, setHitung] = useState({ tercatat: 0, double: 0, ulang: 0, cancel: 0, gagal: 0 });
  const [riwayat, setRiwayat] = useState([]);
  useEffect(() => {
    if (!hasil || hasil === hasilAwal.current) return;
    const kunci = kunciTampil(hasil);
    setKilat(kunci);
    const lama = kunci === "ok" ? 700 : 1600; // yang perlu perhatian tampil lebih lama
    const t = setTimeout(() => setKilat(null), lama);
    const tercatat = hasil.tercatat ?? (hasil.tipe === "ok" || hasil.tipe === "asing" || (hasil.tipe === "cancel" && !hasil.ulang));
    setHitung((h) => ({
      tercatat: h.tercatat + (tercatat ? 1 : 0),
      double: h.double + (kunci === "dup" ? 1 : 0),
      ulang: h.ulang + (kunci === "ulang" ? 1 : 0),
      cancel: h.cancel + (hasil.tipe === "cancel" ? 1 : 0),
      gagal: h.gagal + (hasil.tipe === "err" ? 1 : 0),
    }));
    setRiwayat((r) => [{ resi: hasil.resi, kunci, tercatat, cancel: hasil.tipe === "cancel", jam: jamPendek(Date.now()) }, ...r].slice(0, 5));
    return () => clearTimeout(t);
  }, [hasil]);
  const hasilBaru = hasil && hasil !== hasilAwal.current ? hasil : null;

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
        const tangani = (teks) => {
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
        };

        // JALUR CEPAT (Chrome/Edge Android): pembaca barcode bawaan browser (BarcodeDetector) jauh
        // lebih cepat & tahan barcode kecil dibanding zxing. Kalau tidak tersedia, pakai zxing.
        if (isResi && typeof window.BarcodeDetector === "function") {
          let detektor = null;
          try {
            const didukung = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
            const mau = ["code_128", "code_39", "code_93", "itf", "codabar"].filter((f) => didukung.includes(f));
            if (mau.length) detektor = new window.BarcodeDetector({ formats: mau });
          } catch {
            detektor = null;
          }
          if (detektor) {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 }, height: { ideal: 1080 },
                advanced: [{ focusMode: "continuous" }],
              },
            });
            if (batal) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            const v = videoRef.current;
            v.srcObject = stream;
            await v.play().catch(() => {});
            let berhenti = false;
            let gagalBeruntun = 0;
            let timer = null;
            const putar = async () => {
              if (berhenti || batal) return;
              try {
                if (v.readyState >= 2) {
                  const hasil = await detektor.detect(v);
                  gagalBeruntun = 0;
                  if (hasil.length) tangani(hasil[0].rawValue);
                }
              } catch {
                gagalBeruntun += 1;
              }
              timer = setTimeout(putar, 40);
            };
            controls = {
              stop: () => {
                berhenti = true;
                clearTimeout(timer);
                stream.getTracks().forEach((t) => t.stop());
                if (v) v.srcObject = null;
              },
            };
            putar();
            setStatus("ready");
            return;
          }
        }

        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (batal) return;

        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          isQr
            ? [BarcodeFormat.QR_CODE]
            : isResi
            ? [
                // Hanya barcode garis (resi). QR / DataMatrix / EAN (barcode produk) sengaja
                // tidak dibaca supaya tidak ikut tersimpan sebagai "resi".
                BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
                BarcodeFormat.CODABAR,
              ]
            : [BarcodeFormat.CODE_128]
        );
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 40 });

        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              ...(isResi ? { width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" }] } : {}),
            },
          },
          videoRef.current,
          (result) => {
            if (!result || batal) return;
            tangani(result.getText());
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
  }, [continuous, isQr, isResi]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 overflow-y-auto p-4">
      <div className="w-full max-w-md mx-auto my-auto rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-slate-100">{judul}</div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
          {status === "ready" && !isQr && (
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          )}
          {status === "ready" && isQr && (
            <div className="pointer-events-none absolute inset-0 m-auto w-48 h-48 border-2 border-red-500/80 rounded-lg" />
          )}
          {ringkasan && typeof ringkasan.total === "number" && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-black/70 px-3 py-1.5 text-white">
              <div className="text-[10px] uppercase tracking-wide text-slate-300">{ringkasan.label || "Tercatat"}</div>
              <div className="text-3xl font-black leading-none">{ringkasan.total}<span className="ml-1 text-xs font-medium text-slate-300">resi</span></div>
            </div>
          )}
          {continuous && (hitung.tercatat + hitung.double + hitung.ulang + hitung.cancel + hitung.gagal) > 0 && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] leading-snug text-white text-right">
              <div className="text-emerald-300">+{hitung.tercatat} di kamera ini</div>
              {hitung.double > 0 && <div className="text-orange-300">{hitung.double} double</div>}
              {hitung.cancel > 0 && <div className="text-red-300">{hitung.cancel} cancel</div>}
              {hitung.gagal > 0 && <div className="text-red-300">{hitung.gagal} gagal</div>}
            </div>
          )}
          {kilat && WARNA_KILAT[kilat] && (
            <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-white ${WARNA_KILAT[kilat].bg}`}>
              <div className="text-7xl font-black leading-none">{WARNA_KILAT[kilat].ikon}</div>
              <div className="mt-2 text-lg font-bold tracking-wide">{WARNA_KILAT[kilat].teks}</div>
            </div>
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
        {hasilBaru && WARNA_KILAT[kunciTampil(hasilBaru)] && (
          <div className={`flex items-center gap-3 px-4 py-2 text-white ${WARNA_KILAT[kunciTampil(hasilBaru)].strip}`}>
            <span className="text-2xl font-black leading-none">{WARNA_KILAT[kunciTampil(hasilBaru)].ikon}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold">
                {hasilBaru.tipe === "cancel"
                  ? `CANCEL — JANGAN DIKIRIM${hasilBaru.tercatat === false || hasilBaru.ulang ? " (scan ulang, tidak dihitung lagi)" : ""}`
                  : (hasilBaru.tercatat ?? (hasilBaru.tipe === "ok" || hasilBaru.tipe === "asing"))
                    ? "TERCATAT"
                    : WARNA_KILAT[kunciTampil(hasilBaru)].teks + " — hitungan tidak bertambah"}
              </div>
              <div className="font-mono text-[11px] opacity-90 break-all">{hasilBaru.resi}</div>
            </div>
          </div>
        )}
        {hasilBaru && renderHasil && <div className="p-3 border-b border-slate-800">{renderHasil(hasilBaru)}</div>}
        {riwayat.length > 1 && (
          <div className="px-4 py-2 border-b border-slate-800 text-[11px] text-slate-400">
            <div className="mb-1 text-slate-500">Scan terakhir</div>
            {riwayat.slice(1).map((x, i) => (
              <div key={`${x.resi}-${i}`} className="flex items-center gap-2 py-0.5">
                <span className={x.kunci === "ok" ? "text-emerald-400" : x.kunci === "ulang" ? "text-sky-400" : x.kunci === "dup" ? "text-orange-400" : "text-red-400"}>
                  {x.kunci === "ok" ? "✓" : x.kunci === "ulang" ? "✓" : x.kunci === "dup" ? "!" : "✕"}
                </span>
                <span className="font-mono text-slate-300 truncate flex-1">{x.resi}</span>
                <span className="whitespace-nowrap">
                  {x.kunci === "ok" ? "tercatat" : x.kunci === "ulang" ? "terbaca ulang" : x.kunci === "dup" ? "DOUBLE" : x.cancel ? "cancel" : "gagal"} · {x.jam}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 text-[11px] text-slate-400">
          {terakhir ? (
            // Isi QR gaji bersifat rahasia — tidak ditampilkan di layar.
            isQr ? (
              <span>QR terbaca.</span>
            ) : (
              <span>
                Terbaca: <span className="font-mono text-amber-300">{terakhir}</span>
              </span>
            )
          ) : isQr ? (
            "Arahkan kamera ke QR sampai terbaca."
          ) : isResi ? (
            "Dekatkan kamera 15–25 cm, barcode sejajar garis merah, cahaya cukup."
          ) : (
            "Arahkan garis merah ke barcode di stiker."
          )}
          {continuous && <span className="block mt-1 text-slate-500">Kamera tetap terbuka — tutup kalau sudah selesai.</span>}
        </div>
      </div>
    </div>
  );
}

export function TombolScanKamera({ onDetect, continuous = false, label = "Scan", judul, format, hasil, renderHasil, ringkasan }) {
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
          format={format}
          hasil={hasil}
          renderHasil={renderHasil}
          ringkasan={ringkasan}
          onDetect={onDetect}
          onClose={() => setBuka(false)}
        />
      )}
    </>
  );
}