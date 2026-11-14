import { useCallback, useEffect, useState } from "react";

// =========================================================
// KASIR — UKURAN TAMPILAN DI HP
// Sebagian HP Android melaporkan lebar layar yang besar (±700 px CSS), sehingga kasir memakai tata letak "tablet"
// dengan huruf kecil. Di sini ukuran tampilan bisa dibesarkan lewat <meta viewport width=…> (browser menskalakan
// seluruh halaman, dan lebar CSS yang dipakai tata letak ikut mengecil -> kolom barang jadi 1 dan huruf lebih besar).
// Pilihan disimpan di perangkat. "Otomatis" hanya aktif di HP layar sentuh berbentuk tinggi dengan lebar 520–900 px.
// Tidak berpengaruh di desktop. Meta viewport dikembalikan seperti semula saat keluar dari halaman kasir.
// =========================================================

const KUNCI = "kasir_skala_tampilan";
const LEBAR_TARGET = 420; // lebar CSS yang dituju untuk HP di mode Otomatis

export const PILIHAN_SKALA = [
  { k: "auto", label: "Otomatis" },
  { k: "1", label: "Normal" },
  { k: "1.25", label: "Besar" },
  { k: "1.5", label: "Lebih besar" },
  { k: "1.75", label: "Sangat besar" },
];

function bacaPilihan() {
  try {
    const v = localStorage.getItem(KUNCI);
    return PILIHAN_SKALA.some((p) => p.k === v) ? v : "auto";
  } catch {
    return "auto";
  }
}

// Skala otomatis dari ukuran fisik layar (tidak tergantung orientasi).
function skalaOtomatis() {
  try {
    const sentuh = window.matchMedia?.("(pointer: coarse)").matches;
    const w = window.screen?.width || 0;
    const h = window.screen?.height || 0;
    const pendek = Math.min(w, h);
    const panjang = Math.max(w, h);
    if (!sentuh || !pendek || panjang / pendek < 1.7) return 1; // bukan HP berbentuk tinggi (tablet / desktop)
    if (pendek < 520 || pendek > 900) return 1;
    return Math.min(Math.max(pendek / LEBAR_TARGET, 1), 2);
  } catch {
    return 1;
  }
}

export const skalaDari = (pilihan) => (pilihan === "auto" ? skalaOtomatis() : Number(pilihan) || 1);

export function useSkalaTampilan() {
  const [pilihan, setPilihanState] = useState(bacaPilihan);

  const setPilihan = useCallback((k) => {
    setPilihanState(k);
    try {
      localStorage.setItem(KUNCI, k);
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const asli = meta.getAttribute("content");
    const terapkan = () => {
      const s = skalaDari(pilihan);
      const lebarLayar = window.screen?.width || 0; // lebar layar saat ini (ikut orientasi), dalam px CSS
      if (s <= 1 || !lebarLayar) meta.setAttribute("content", asli);
      else meta.setAttribute("content", `width=${Math.round(lebarLayar / s)}, viewport-fit=cover`);
    };
    terapkan();
    // Setelah rotasi, ukuran layar baru terbaca sedikit terlambat.
    const tunda = () => setTimeout(terapkan, 250);
    window.addEventListener("orientationchange", tunda);
    window.addEventListener("resize", terapkan);
    return () => {
      window.removeEventListener("orientationchange", tunda);
      window.removeEventListener("resize", terapkan);
      meta.setAttribute("content", asli);
    };
  }, [pilihan]);

  return { pilihan, setPilihan, label: PILIHAN_SKALA.find((p) => p.k === pilihan)?.label || "Otomatis" };
}

// Pilihan berikutnya (berputar) — dipakai tombol di Menu.
export function skalaBerikutnya(pilihan) {
  const i = PILIHAN_SKALA.findIndex((p) => p.k === pilihan);
  return PILIHAN_SKALA[(i + 1) % PILIHAN_SKALA.length].k;
}
