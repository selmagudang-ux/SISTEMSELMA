import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary, { bersihkanFlagReload } from "./components/ErrorBoundary.jsx";
import "./index.css";

// Cegah nilai input angka (type="number") berubah kalau kursor lagi di
// atasnya terus di-scroll pakai mouse — ini perilaku bawaan browser yang
// sering bikin angka kesenggol tanpa sadar. Dipasang sekali di sini (global,
// document-level) supaya berlaku untuk SEMUA input angka di seluruh
// aplikasi tanpa perlu ubah tiap form satu-satu. Scroll halaman tetap
// jalan seperti biasa; angka di input cuma bisa diubah dengan mengetik
// langsung atau klik tanda panah naik/turun di input-nya.
document.addEventListener(
  "wheel",
  () => {
    const el = document.activeElement;
    if (el && el.tagName === "INPUT" && el.type === "number") {
      el.blur();
    }
  },
  { passive: true }
);

// Vite memicu event ini kalau file JS hasil build gagal diunduh (mis. setelah
// deploy baru, nama file lama sudah hilang). Muat ulang SEKALI otomatis.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem("selma-chunk-reload-sekali")) return;
    sessionStorage.setItem("selma-chunk-reload-sekali", "1");
  } catch {
    return;
  }
  window.location.reload();
});

// Halaman callback otorisasi TikTok Shop berdiri sendiri (tanpa login SELMA).
// Dimuat malas supaya tidak menambah bundle utama aplikasi.
const TiktokCallback = React.lazy(() => import("./pages/TiktokCallback.jsx"));
const adalahCallbackTiktok = window.location.pathname.replace(/\/+$/, "") === "/tiktok-callback";
// Aplikasi kasir (POS) — satu kode & satu database dengan SELMA, tapi dibuka lewat
// alamat sendiri (/kasir) dan TANPA sidebar/menu SELMA. Dimuat malas supaya tidak
// menambah bundle utama.
const KasirApp = React.lazy(() => import("./pages/kasir/KasirApp.jsx"));
const adalahKasir = /^\/kasir(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {adalahKasir ? (
        <React.Suspense fallback={null}>
          <KasirApp />
        </React.Suspense>
      ) : adalahCallbackTiktok ? (
        <React.Suspense fallback={null}>
          <TiktokCallback />
        </React.Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);

// Kasir bisa dipasang di HP (PWA): tautan manifest hanya dipasang di halaman /kasir, bukan di SELMA.
if (adalahKasir) {
  const m = document.createElement("link");
  m.rel = "manifest";
  m.href = "/kasir.webmanifest";
  document.head.appendChild(m);
  const a = document.createElement("link");
  a.rel = "apple-touch-icon";
  a.href = "/kasir-icon-192.png";
  document.head.appendChild(a);
  const t = document.createElement("meta");
  t.name = "theme-color";
  t.content = "#004aad";
  document.head.appendChild(t);
}

// Mode offline kasir: service worker membuat halaman /kasir bisa dibuka tanpa internet
// (lihat public/sw.js). Hanya didaftarkan dari halaman kasir & hanya di build produksi.
if (adalahKasir && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Aplikasi berhasil tampil -> izinkan reload otomatis lagi untuk update berikutnya.
setTimeout(bersihkanFlagReload, 10000);