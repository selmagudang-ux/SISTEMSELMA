import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);