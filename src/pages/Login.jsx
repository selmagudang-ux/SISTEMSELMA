import { useEffect, useRef, useState } from "react";
import { Warehouse, Loader2, AlertCircle, Download } from "lucide-react";
import { unifiedLogin } from "../lib/unifiedLogin";
import ThemeToggle from "../components/ThemeToggle";
import { URL_UNDUH_APP_ANDROID, perluTawarkanAppAndroid } from "../lib/unduhAndroid";

// Satu halaman login untuk semua orang — admin/role SELMA maupun karyawan
// absen. Sistem otomatis mendeteksi jenis akunnya dari username/ID yang
// dimasukkan (lihat lib/unifiedLogin.js), jadi link yang dibagikan sama
// persis untuk siapa saja.
// ingatJam: lama sesi "tetap masuk" (jam); kosong = 7 hari (versi HP /m). ingatAwal: kotaknya langsung tercentang.
export default function Login({ onLogin, tampilIngat = false, ingatJam = 0, ingatAwal = false }) {
  // Pengaman fokus: di aplikasi desktop (Electron) jendela kadang kehilangan fokus keyboard setelah logout /
  // dialog sistem, sehingga kolom tidak bisa diketik. Minta fokus jendela lagi lalu fokuskan kolom username.
  const refUsername = useRef(null);
  useEffect(() => {
    const fokus = () => {
      try {
        window.focus();
        refUsername.current?.focus();
      } catch {
        /* abaikan */
      }
    };
    const t1 = setTimeout(fokus, 50);
    const t2 = setTimeout(fokus, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ingat, setIngat] = useState(!!ingatAwal); // "Ingat saya / tetap masuk" — hanya tampil di versi HP (/m) dan aplikasi kasir (/kasir)

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await unifiedLogin(username, password, { ingat: tampilIngat && ingat, ingatMs: ingatJam ? ingatJam * 60 * 60 * 1000 : undefined });
      onLogin(result);
    } catch (err) {
      setError(err.message || "Gagal login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mb-3">
            <Warehouse size={24} className="text-slate-950" />
          </div>
          <div className="font-bold text-lg">Sistem Selma</div>
          <div className="text-xs text-slate-500 mt-0.5">Masuk untuk melanjutkan</div>
        </div>

        <form
          onSubmit={submit}
          className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3.5"
        >
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Username / ID Karyawan</div>
            <input
              autoFocus
              ref={refUsername}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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

          {tampilIngat && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ingat}
                onChange={(e) => setIngat(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
              />
              <span>
                <span className="block text-sm text-slate-200">{ingatJam ? `Tetap masuk ${ingatJam} jam` : "Ingat saya di HP ini"}</span>
                <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
                  {ingatJam
                    ? `Aplikasi ditutup lalu dibuka lagi tidak perlu login ulang, selama belum lewat ${ingatJam} jam atau belum menekan Keluar. Jangan dicentang di perangkat bersama.`
                    : "Sesi disimpan 7 hari, jadi notifikasi langsung membuka halaman tanpa login. Cocok untuk HP pribadi Pemilik."}
                </span>
              </span>
            </label>
          )}

          <button
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg mt-1"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Memproses…" : "Masuk"}
          </button>
        </form>

        {perluTawarkanAppAndroid() && (
          <a
            href={URL_UNDUH_APP_ANDROID}
            className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            <Download size={13} /> Unduh Aplikasi Android
          </a>
        )}
        <div className="text-center text-[11px] text-slate-600 mt-4">SISTEM ERP SELMA</div>
      </div>
    </div>
  );
}