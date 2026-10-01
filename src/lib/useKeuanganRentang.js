import { useEffect, useMemo, useState } from "react";
import { awalRentangKeuanganDefault, muatKeuanganLama } from "./api";

// App.jsx hanya memuat transaksi keuangan BULAN INI (hemat egress). Kalau
// periode yang dilihat (`dari`) mulai lebih awal dari itu — bulan lalu,
// tahun lalu, atau filter kosong (= semua) — transaksi lamanya ditarik dari
// database lalu digabung ke data bulan ini. Datanya ditarik ulang tiap data
// bulan ini dimuat ulang (mis. setelah simpan transaksi), supaya transaksi
// lama yang diedit/dihapus atau dicatat mundur tidak ketinggalan.
//
// Mengembalikan { data, status }:
//   data   = transaksi untuk dihitung ringkasan/laporan periode
//   status = teks pemberitahuan ("Memuat…" / gagal), "" kalau tidak ada
//
// PENTING: untuk saldo per rekening JANGAN pakai `data` — pakai data bulan
// ini saja + saldoPerRekening(..., true), supaya tidak terhitung dua kali.
export function useKeuanganRentang(dimuat, dari) {
  const [lama, setLama] = useState(null);
  const [err, setErr] = useState("");
  const perluLama = !dari || dari < awalRentangKeuanganDefault();

  useEffect(() => {
    if (!perluLama) return undefined;
    let batal = false;
    muatKeuanganLama()
      .then((rows) => {
        if (!batal) {
          setLama(rows);
          setErr("");
        }
      })
      .catch((e) => {
        if (!batal) setErr(e?.message || "Gagal memuat data lama");
      });
    return () => {
      batal = true;
    };
  }, [perluLama, dimuat]);

  const data = useMemo(
    () => (perluLama && lama ? [...(dimuat || []), ...lama] : dimuat || []),
    [dimuat, lama, perluLama]
  );
  const status =
    perluLama && !lama
      ? err
        ? `Data bulan lama gagal dimuat (${err}). Muat ulang halaman.`
        : "Memuat data bulan sebelumnya…"
      : "";
  return { data, status };
}
