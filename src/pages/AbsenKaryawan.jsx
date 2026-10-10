import { useState, useEffect } from "react";
import { Clock, Loader2, AlertCircle, MapPin, LogOut, KeyRound, CheckCircle2, QrCode, Wallet, History } from "lucide-react";
import { gantiPasswordKaryawan, getAbsensiSettings, hitungJarakMeter, submitAbsen, daftarShift } from "../lib/absensi";
import { fmtRp, lihatGajiDariQr, konfirmasiGajiDiterima, riwayatGajiKaryawan, labelPeriodeGaji } from "../lib/api";
import { ScanKameraModal } from "../components/ScanKamera";

// Form absen Masuk/Pulang untuk karyawan, dipakai setelah login lewat
// halaman Login gabungan (lib/unifiedLogin.js) — karyawan absen pakai akun
// sendiri (tabel `karyawan`, dikelola admin lewat menu Absensi > Data
// Karyawan), bukan akun admin SELMA (app_users). Perutean sesi dan logout
// ditangani terpusat di App.jsx.
export function FormAbsen({ session, onLogout }) {
  const [clock, setClock] = useState("");
  const [settings, setSettings] = useState(null);
  const [tipe, setTipe] = useState("Masuk");
  const [shiftNama, setShiftNama] = useState(null);
  const [coords, setCoords] = useState(null);
  const [locState, setLocState] = useState({ status: "warn", text: "Mengambil lokasi…" });
  const [submitting, setSubmitting] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [error, setError] = useState("");
  const [showGanti, setShowGanti] = useState(false);

  // Daftar shift yang bisa dipilih karyawan (mis. Pagi 08:00, Siang 10:00,
  // Malam 13:00 — jam pulangnya ikut mengikuti shift yang sama). Begitu
  // pengaturan sudah termuat, shift pertama otomatis terpilih supaya user
  // tetap bisa langsung absen tanpa wajib klik dulu.
  const shiftList = settings ? daftarShift(settings) : [];
  useEffect(() => {
    if (shiftList.length > 0 && !shiftNama) setShiftNama(shiftList[0].nama);
  }, [settings]);
  const shiftDipilih = shiftList.find((s) => s.nama === shiftNama) || shiftList[0] || null;

  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getAbsensiSettings()
      .then(setSettings)
      .catch(() => setError("Gagal memuat pengaturan absensi."));
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (!navigator.geolocation) {
      setLocState({ status: "err", text: "Perangkat tidak mendukung GPS." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        const jarak = Math.round(hitungJarakMeter(settings.office_lat, settings.office_lng, lat, lng));
        if (jarak <= settings.radius_meter) {
          setLocState({ status: "ok", text: `📍 Lokasi terdeteksi. Jarak dari kantor: ${jarak} m (Dalam radius, boleh absen)` });
        } else {
          setLocState({ status: "err", text: `📍 Lokasi terdeteksi. Jarak dari kantor: ${jarak} m — DI LUAR radius ${settings.radius_meter} m.` });
        }
      },
      (err) => setLocState({ status: "err", text: "Gagal mengambil lokasi: " + err.message + " (izinkan akses lokasi lalu refresh)" }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [settings]);

  const kirim = async () => {
    if (!coords || !settings) return;
    setSubmitting(true);
    setError("");
    setHasil(null);
    try {
      const res = await submitAbsen({ karyawan: session, tipe, lat: coords.lat, lng: coords.lng, settings, shift: shiftDipilih });
      setHasil(res);
    } catch (err) {
      setError(err.message || "Gagal mengirim absen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mb-3">
            <Clock size={24} className="text-slate-950" />
          </div>
          <div className="font-bold text-lg">Absensi Online</div>
          <div className="text-xs text-slate-500 mt-0.5 text-center">{clock}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5">
            <span className="text-sm font-medium">👤 {session.nama}</span>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setShowGanti((v) => !v)} className="text-amber-400 flex items-center gap-1 hover:text-amber-300">
                <KeyRound size={12} /> Ganti Password
              </button>
              <button onClick={onLogout} className="text-slate-400 flex items-center gap-1 hover:text-slate-200">
                <LogOut size={12} /> Keluar
              </button>
            </div>
          </div>

          {showGanti && <GantiPasswordBox karyawanId={session.id} onDone={() => setShowGanti(false)} />}

          <div>
            <div className="text-xs text-slate-400 mb-1.5 font-medium">Jenis Absen</div>
            <div className="flex gap-2">
              <button
                onClick={() => setTipe("Masuk")}
                className={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold ${
                  tipe === "Masuk" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400"
                }`}
              >
                🟢 Masuk
              </button>
              <button
                onClick={() => setTipe("Pulang")}
                className={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold ${
                  tipe === "Pulang" ? "border-red-500 bg-red-500/10 text-red-400" : "border-slate-800 text-slate-400"
                }`}
              >
                🔴 Pulang
              </button>
            </div>
          </div>

          {shiftList.length > 1 && (
            <div>
              <div className="text-xs text-slate-400 mb-1.5 font-medium">Shift Anda Hari Ini</div>
              <div className="grid grid-cols-1 gap-1.5">
                {shiftList.map((s) => (
                  <button
                    key={s.nama}
                    onClick={() => setShiftNama(s.nama)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border-2 text-xs font-medium ${
                      shiftNama === s.nama
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-slate-800 text-slate-400"
                    }`}
                  >
                    <span>{s.nama}</span>
                    <span className="font-mono">{s.jam_masuk}–{s.jam_pulang}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className={`text-xs px-3 py-2.5 rounded-lg flex items-start gap-2 ${
              locState.status === "ok"
                ? "bg-emerald-500/10 text-emerald-300"
                : locState.status === "err"
                ? "bg-red-500/10 text-red-300"
                : "bg-amber-500/10 text-amber-300"
            }`}
          >
            <MapPin size={14} className="flex-shrink-0 mt-0.5" /> {locState.text}
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {hasil && (
            <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              Absen {tipe} berhasil! Jam {hasil.jam}{hasil.shift ? ` (Shift ${hasil.shift})` : ""} — {hasil.keterangan} (jarak {hasil.jarak} m).
            </div>
          )}

          <button
            onClick={kirim}
            disabled={submitting || !coords}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-3 rounded-lg"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Mengirim…" : "Kirim Absen"}
          </button>
        </div>

        <KartuGaji session={session} />
      </div>
    </div>
  );
}

function GantiPasswordBox({ karyawanId, onDone }) {
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // {kind, text}

  const simpan = async () => {
    if (!lama || !baru || !ulang) return setMsg({ kind: "err", text: "Semua kolom wajib diisi." });
    if (baru !== ulang) return setMsg({ kind: "err", text: "Password baru dan ulangi password tidak sama." });
    setSaving(true);
    setMsg(null);
    try {
      await gantiPasswordKaryawan(karyawanId, lama, baru);
      setMsg({ kind: "ok", text: "Password berhasil diganti." });
      setLama("");
      setBaru("");
      setUlang("");
      setTimeout(onDone, 1200);
    } catch (err) {
      setMsg({ kind: "err", text: err.message || "Gagal mengganti password." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2.5">
      <input
        type="password"
        placeholder="Password lama"
        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
        value={lama}
        onChange={(e) => setLama(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password baru (min. 4 karakter)"
        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
        value={baru}
        onChange={(e) => setBaru(e.target.value)}
      />
      <input
        type="password"
        placeholder="Ulangi password baru"
        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
        value={ulang}
        onChange={(e) => setUlang(e.target.value)}
      />
      {msg && (
        <div className={`text-xs px-2.5 py-1.5 rounded-lg ${msg.kind === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {msg.text}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={simpan}
          disabled={saving}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button onClick={onDone} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold py-2 rounded-lg">
          Batal
        </button>
      </div>
    </div>
  );
}

// =========================================================
// GAJI — scan QR dari admin, lihat rincian, konfirmasi terima, dan riwayat.
// Server meminta ID + password karyawan di setiap aksi, jadi password diketik
// di sini dan hanya ditahan di memori selama alur berlangsung.
// =========================================================
const TOKEN_GAJI_RE = /^[0-9a-f]{48}$/;
const inputGaji =
  "w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";

function waktuWib(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}

function KartuGaji({ session }) {
  const [scan, setScan] = useState(false);
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [rincian, setRincian] = useState(null);
  const [sukses, setSukses] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [bukaRiwayat, setBukaRiwayat] = useState(false);
  const [pwRiwayat, setPwRiwayat] = useState("");
  const [riwayat, setRiwayat] = useState(null);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);
  const [errorRiwayat, setErrorRiwayat] = useState("");

  const reset = () => {
    setToken("");
    setPw("");
    setRincian(null);
    setError("");
  };

  const onDetect = (teks) => {
    if (!TOKEN_GAJI_RE.test(String(teks || "").trim())) {
      setError("QR ini bukan QR gaji. Pastikan memindai QR yang diberikan admin.");
      return;
    }
    setSukses(null);
    setRincian(null);
    setPw("");
    setError("");
    setToken(String(teks).trim());
  };

  const lihat = async () => {
    if (!pw) return setError("Password wajib diisi.");
    setLoading(true);
    setError("");
    try {
      setRincian(await lihatGajiDariQr(session.id_karyawan, pw, token));
    } catch (e) {
      setError(e.message || "Gagal membuka rincian gaji.");
    } finally {
      setLoading(false);
    }
  };

  const konfirmasi = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await konfirmasiGajiDiterima(session.id_karyawan, pw, token);
      setSukses(r);
      reset();
      setRiwayat(null); // riwayat dimuat ulang saat dibuka lagi
    } catch (e) {
      setError(e.message || "Gagal mengonfirmasi gaji.");
    } finally {
      setLoading(false);
    }
  };

  const muatRiwayat = async () => {
    if (!pwRiwayat) return setErrorRiwayat("Password wajib diisi.");
    setLoadingRiwayat(true);
    setErrorRiwayat("");
    try {
      setRiwayat(await riwayatGajiKaryawan(session.id_karyawan, pwRiwayat));
      setPwRiwayat("");
    } catch (e) {
      setErrorRiwayat(e.message || "Gagal memuat riwayat gaji.");
    } finally {
      setLoadingRiwayat(false);
    }
  };

  return (
    <div className="mt-4 bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wallet size={16} className="text-amber-400" /> Gaji
      </div>

      {sukses && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          Terima kasih! Gaji periode {labelPeriodeGaji(sukses.periode)} sebesar {fmtRp(sukses.nominal)} sudah tercatat diterima.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {!token && (
        <button
          onClick={() => {
            setError("");
            setScan(true);
          }}
          className="w-full flex items-center justify-center gap-2 border border-amber-500/60 text-amber-400 hover:bg-amber-500/10 font-semibold text-sm py-3 rounded-lg"
        >
          <QrCode size={16} /> Scan QR Gaji
        </button>
      )}

      {token && !rincian && (
        <div className="space-y-2.5">
          <div className="text-xs text-slate-400">QR terbaca. Masukkan password Anda untuk melihat rincian gaji.</div>
          <input
            type="password"
            autoFocus
            placeholder="Password Anda"
            className={inputGaji}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lihat()}
          />
          <div className="flex gap-2">
            <button
              onClick={lihat}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
            >
              {loading && <Loader2 size={14} className="animate-spin" />} Lihat Gaji
            </button>
            <button onClick={reset} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold py-2.5 rounded-lg">
              Batal
            </button>
          </div>
        </div>
      )}

      {token && rincian && (
        <div className="space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-center">
            <div className="text-xs text-slate-400">Gaji periode {labelPeriodeGaji(rincian.periode)}</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{fmtRp(rincian.nominal)}</div>
            {[["gaji_pokok", "Gaji Pokok"], ["premi_jabatan", "Premi Jabatan"], ["premi_kehadiran", "Premi Kehadiran"], ["bonus", "Bonus"]].some(([k]) => Number(rincian[k]) > 0) && (
              <div className="mt-2 space-y-0.5 text-left">
                {[["gaji_pokok", "Gaji Pokok"], ["premi_jabatan", "Premi Jabatan"], ["premi_kehadiran", "Premi Kehadiran"], ["bonus", "Bonus"]]
                  .filter(([k]) => Number(rincian[k]) > 0)
                  .map(([k, l]) => (
                    <div key={k} className="flex justify-between text-xs text-slate-300">
                      <span>{l}</span><span>{fmtRp(rincian[k])}</span>
                    </div>
                  ))}
              </div>
            )}
            {rincian.catatan && <div className="text-xs text-slate-400 mt-1.5">Catatan: {rincian.catatan}</div>}
            <div className="text-[11px] text-slate-500 mt-2">QR berlaku sampai {waktuWib(rincian.kedaluwarsa)}</div>
          </div>
          <div className="text-[11px] text-slate-400">
            Tekan konfirmasi hanya jika uang gaji sudah Anda terima. Konfirmasi tidak bisa dibatalkan.
          </div>
          <div className="flex gap-2">
            <button
              onClick={konfirmasi}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Saya sudah terima
            </button>
            <button onClick={reset} disabled={loading} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold py-2.5 rounded-lg">
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-3">
        <button
          onClick={() => {
            setBukaRiwayat((v) => !v);
            setErrorRiwayat("");
          }}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
        >
          <History size={12} /> {bukaRiwayat ? "Tutup riwayat gaji" : "Riwayat gaji saya"}
        </button>

        {bukaRiwayat && riwayat === null && (
          <div className="mt-2.5 space-y-2">
            <input
              type="password"
              placeholder="Password Anda"
              className={inputGaji}
              value={pwRiwayat}
              onChange={(e) => setPwRiwayat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && muatRiwayat()}
            />
            {errorRiwayat && <div className="text-xs text-red-300">{errorRiwayat}</div>}
            <button
              onClick={muatRiwayat}
              disabled={loadingRiwayat}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold py-2 rounded-lg"
            >
              {loadingRiwayat && <Loader2 size={12} className="animate-spin" />} Tampilkan
            </button>
          </div>
        )}

        {bukaRiwayat && riwayat !== null && (
          <div className="mt-2.5 space-y-1.5">
            {riwayat.length === 0 ? (
              <div className="text-xs text-slate-500">Belum ada gaji yang tercatat diterima.</div>
            ) : (
              riwayat.map((g) => (
                <div key={g.id} className="flex items-start justify-between gap-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-xs text-slate-200">{labelPeriodeGaji(g.periode)}</div>
                    <div className="text-[11px] text-slate-500">
                      Diterima {waktuWib(g.diterima_pada)}
                      {g.cara_diterima === "admin" ? " (dikonfirmasi admin)" : ""}
                    </div>
                    {g.catatan && <div className="text-[11px] text-slate-500">{g.catatan}</div>}
                  </div>
                  <div className="text-sm font-semibold text-emerald-300 whitespace-nowrap">{fmtRp(g.nominal)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {scan && (
        <ScanKameraModal
          format="qr"
          judul="Scan QR Gaji"
          onDetect={onDetect}
          onClose={() => setScan(false)}
        />
      )}
    </div>
  );
}