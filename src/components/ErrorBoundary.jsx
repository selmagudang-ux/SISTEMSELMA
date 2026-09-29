import { Component } from "react";

// Pengaman layar putih: kalau ada error saat render (atau file halaman gagal
// diunduh karena koneksi putus / aplikasi baru saja di-update), tampilkan
// pesan + tombol "Muat ulang" alih-alih membiarkan seluruh layar kosong.
// Error "gagal mengunduh modul" (biasanya karena versi baru sudah rilis dan
// nama file lama sudah tidak ada) ditangani dengan memuat ulang halaman
// otomatis SATU kali saja, supaya tidak masuk lingkaran reload tanpa akhir.
const FLAG_RELOAD = "selma-chunk-reload-sekali";

export function adalahErrorChunk(err) {
  const pesan = String(err?.message || err || "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|Loading chunk|ChunkLoadError/i.test(pesan);
}

export function reloadSekaliKalauChunkGagal(err) {
  if (!adalahErrorChunk(err)) return false;
  try {
    if (sessionStorage.getItem(FLAG_RELOAD)) return false;
    sessionStorage.setItem(FLAG_RELOAD, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Setelah app berhasil tampil, flag dibersihkan supaya update berikutnya
// juga boleh memicu satu kali reload otomatis.
export function bersihkanFlagReload() {
  try {
    sessionStorage.removeItem(FLAG_RELOAD);
  } catch {
    /* abaikan */
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Halaman error:", error);
    reloadSekaliKalauChunkGagal(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = adalahErrorChunk(this.state.error);
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-24 px-6 text-sm text-slate-300">
        <div className="text-base font-semibold text-slate-100">
          {chunk ? "Halaman gagal dimuat" : "Terjadi kesalahan pada halaman ini"}
        </div>
        <p className="text-xs text-slate-500 max-w-sm">
          {chunk
            ? "Kemungkinan koneksi terputus atau aplikasi baru saja diperbarui. Muat ulang untuk mengambil versi terbaru."
            : "Data Anda aman. Coba muat ulang halaman. Kalau masih terjadi, kabari admin."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-4 py-2 rounded-lg"
          >
            Muat ulang
          </button>
          {!chunk && (
            <button
              onClick={() => this.setState({ error: null })}
              className="border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs px-4 py-2 rounded-lg"
            >
              Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }
}