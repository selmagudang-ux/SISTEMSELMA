import { useCallback, useEffect, useRef, useState } from "react";
import { getSession } from "./auth";

// =========================================================
// DRAF OTOMATIS FORM
// Menyimpan isian form ke penyimpanan browser (localStorage) tiap kali berubah, supaya kalau form
// tertutup tidak sengaja (salah ketuk X, tab ke-refresh, HP ke-reload), isiannya bisa dilanjutkan.
// Draf dipisah per akun & per PT, kedaluwarsa 7 hari, dan DIHAPUS setelah form berhasil disimpan.
//
// Banner "Draf dipulihkan" ada di components/BannerDraf.jsx.
//
// Cara pakai di sebuah form:
//   const draf = useDraftForm("pesan-barang", { supplier, harga, catatan }, !!(supplier || harga || catatan),
//     (d) => { setSupplier(d.supplier || ""); ... });
//   - nilai   : objek isian yang mau diingat (isi yang bisa di-JSON, tanpa File/foto).
//   - adaIsi  : true kalau user sudah mengisi sesuatu (nilai bawaan seperti tanggal hari ini tidak dihitung).
//   - pulihkan: dipanggil SEKALI saat form dibuka kalau ada draf tersimpan.
//   draf.dipulihkan -> true kalau form ini dibuka dari draf (untuk menampilkan banner)
//   draf.hapus()    -> hapus draf (panggil setelah simpan berhasil / saat user memilih "Buang draf")
// =========================================================

const KEDALUWARSA_MS = 7 * 24 * 60 * 60 * 1000;

function kunciPenyimpanan(kunci) {
  let user = "anon";
  let pt = "";
  try {
    user = getSession()?.id || getSession()?.username || "anon";
    pt = sessionStorage.getItem("selma-entitas") || "";
  } catch {
    /* abaikan */
  }
  return `selma-draf:${pt}:${user}:${kunci}`;
}

function bacaDraf(kunci) {
  try {
    const mentah = localStorage.getItem(kunciPenyimpanan(kunci));
    if (!mentah) return null;
    const obj = JSON.parse(mentah);
    if (!obj || typeof obj !== "object" || !obj.nilai) return null;
    if (Date.now() - (obj.waktu || 0) > KEDALUWARSA_MS) {
      localStorage.removeItem(kunciPenyimpanan(kunci));
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export function hapusDraf(kunci) {
  try {
    localStorage.removeItem(kunciPenyimpanan(kunci));
  } catch {
    /* abaikan */
  }
}

export function useDraftForm(kunci, nilai, adaIsi, pulihkan) {
  const [dipulihkan, setDipulihkan] = useState(false);
  const [waktuDraf, setWaktuDraf] = useState(null);
  const lewati = useRef(false);
  const pulihRef = useRef(pulihkan);
  pulihRef.current = pulihkan;

  // 1) Buka form -> pulihkan draf (kalau ada).
  useEffect(() => {
    const d = bacaDraf(kunci);
    if (!d) return;
    lewati.current = true; // render yang sama masih memegang nilai lama (kosong); jangan disimpan.
    pulihRef.current?.(d.nilai);
    setDipulihkan(true);
    setWaktuDraf(d.waktu || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);

  // 2) Isian berubah -> simpan (ditunda 500 ms supaya tidak menulis tiap ketikan).
  const teks = JSON.stringify(nilai);
  useEffect(() => {
    if (lewati.current) {
      lewati.current = false;
      return undefined;
    }
    if (!adaIsi) return undefined;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(kunciPenyimpanan(kunci), JSON.stringify({ waktu: Date.now(), nilai: JSON.parse(teks) }));
      } catch {
        /* penyimpanan penuh / diblokir: abaikan, form tetap jalan tanpa draf */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [kunci, teks, adaIsi]);

  const hapus = useCallback(() => {
    hapusDraf(kunci);
    setDipulihkan(false);
  }, [kunci]);

  return { dipulihkan, waktuDraf, hapus };
}
