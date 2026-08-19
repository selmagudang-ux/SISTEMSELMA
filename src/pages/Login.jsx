import { useState } from "react";
import { Warehouse, Loader2, AlertCircle } from "lucide-react";
import { unifiedLogin } from "../lib/unifiedLogin";

// Satu halaman login untuk semua orang — admin/role SELMA maupun karyawan
// absen. Sistem otomatis mendeteksi jenis akunnya dari username/ID yang
// dimasukkan (lihat lib/unifiedLogin.js), jadi link yang dibagikan sama
// persis untuk siapa saja.
export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await unifiedLogin(username, password);
      onLogin(result);
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

          <button
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg mt-1"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Memproses…" : "Masuk"}
          </button>
        </form>

        <div className="text-center text-[11px] text-slate-600 mt-4">Sistem Selma — Manajemen Inventori</div>
      </div>
    </div>
  );
}