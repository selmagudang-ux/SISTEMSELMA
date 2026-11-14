import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { adalahAppDesktop } from "./kasirLaci";

// =========================================================
// KASIR — PASANG DI HP (PWA). Android/Chrome: tombol memunculkan dialog pasang bawaan browser.
// iPhone/Safari: tidak ada dialog otomatis, jadi tombol menampilkan petunjuk "Tambah ke Layar Utama".
// Tombol hilang kalau aplikasi sudah dibuka dari layar utama, atau di aplikasi desktop.
// =========================================================

export const adalahHp = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const adalahIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const sudahTerpasang = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
};

export function PasangAplikasi() {
  const [prompt, setPrompt] = useState(null);
  const [terpasang, setTerpasang] = useState(sudahTerpasang());
  useEffect(() => {
    const saatPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const saatTerpasang = () => {
      setTerpasang(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", saatPrompt);
    window.addEventListener("appinstalled", saatTerpasang);
    return () => {
      window.removeEventListener("beforeinstallprompt", saatPrompt);
      window.removeEventListener("appinstalled", saatTerpasang);
    };
  }, []);

  if (terpasang || adalahAppDesktop() || !adalahHp()) return null;
  if (!prompt && !adalahIos()) return null; // Android tanpa dialog pasang (belum memenuhi syarat / sudah ditolak): sembunyikan

  const pasang = async () => {
    if (prompt) {
      prompt.prompt();
      try {
        await prompt.userChoice;
      } catch {
        /* abaikan */
      }
      setPrompt(null);
    } else {
      window.alert("Cara memasang di iPhone:\n1. Buka halaman ini di Safari.\n2. Ketuk tombol Bagikan (kotak dengan panah ke atas).\n3. Pilih \"Tambah ke Layar Utama\".");
    }
  };
  return (
    <button
      onClick={pasang}
      className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-800 transition-colors"
    >
      <Smartphone size={13} /> Pasang di HP
    </button>
  );
}
