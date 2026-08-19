import { useState, useEffect, useRef } from "react";
import { Clock, Loader2, AlertCircle, MapPin, LogOut, KeyRound, CheckCircle2 } from "lucide-react";
import {
  getAbsenSession,
  loginKaryawan,
  logoutKaryawan,
  gantiPasswordKaryawan,
  getAbsensiSettings,
  hitungJarakMeter,
  submitAbsen,
} from "../lib/absensi";

// Halaman berdiri sendiri untuk karyawan absen Masuk/Pulang lewat HP.
// SENGAJA TIDAK butuh login SELMA (app_users) — karyawan pakai akun sendiri
// (tabel `karyawan`, dikelola admin lewat menu Absensi > Data Karyawan).
// Diakses lewat path terpisah (?absen di URL) supaya tidak ketutup layar
// login SELMA — lihat pengecekan di App.jsx.
export default function AbsenKaryawan() {
  const [session, setSession] = useState(() => getAbsenSession());

  if (!session) {
    return <LoginKaryawan onLogin={setSession} />;
  }
  return <FormAbsen session={session} onLogout={() => { logoutKaryawan(); setSession(null); }} />;
}

function LoginKaryawan({ onLogin }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const s = await loginKaryawan(id, password);
      onLogin(s);
    } catch (err) {
      setError(err.message || "Gagal login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mb-3">
            <Clock size={24} className="text-slate-950" />
          </div>
          <div className="font-bold text-lg">Absensi Online</div>
          <div className="text-xs text-slate-500 mt-0.5">Login pakai ID Karyawan</div>
        </div>

        <form onSubmit={submit} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3.5">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <label className="block">
            <div className="text-xs text-slate-400 mb-1">ID Karyawan</div>
            <input
              autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Password</div>
            <input
              type="password"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <button
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg mt-1"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Memproses…" : "Login"}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-600 mt-4">Lupa password? Hubungi HRD/Admin.</div>
      </div>
    </div>
  );
}

function FormAbsen({ session, onLogout }) {
  const [clock, setClock] = useState("");
  const [settings, setSettings] = useState(null);
  const [tipe, setTipe] = useState("Masuk");
  const [coords, setCoords] = useState(null);
  const [locState, setLocState] = useState({ status: "warn", text: "Mengambil lokasi…" });
  const [submitting, setSubmitting] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [error, setError] = useState("");
  const [showGanti, setShowGanti] = useState(false);

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
      const res = await submitAbsen({ karyawan: session, tipe, lat: coords.lat, lng: coords.lng, settings });
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
              Absen {tipe} berhasil! Jam {hasil.jam} — {hasil.keterangan} (jarak {hasil.jarak} m).
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