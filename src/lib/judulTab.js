import { useEffect } from "react";

// Judul tab browser = nama akun yang sedang login (mis. "Budi · SELMA"), supaya beberapa tab dengan akun berbeda
// mudah dibedakan. Belum login / sudah keluar = kembali ke judul bawaan.
export const JUDUL_BAWAAN = "SELMA ERP";

export function aturJudulTab(session, akhiran = "SELMA") {
  if (typeof document === "undefined") return;
  const nama = (session?.nama || session?.username || "").trim();
  document.title = nama ? `${nama} · ${akhiran}` : JUDUL_BAWAAN;
}

export function useJudulTab(session, akhiran = "SELMA") {
  const nama = session?.nama;
  const user = session?.username;
  useEffect(() => {
    aturJudulTab({ nama, username: user }, akhiran);
    return () => {
      document.title = JUDUL_BAWAAN;
    };
  }, [nama, user, akhiran]);
}
