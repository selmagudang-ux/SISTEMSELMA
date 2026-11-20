import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb, kodeHoldingPasti, entitasSesi } from "../../lib/api";
import { NAV, bisa, bolehTransferAntarEntitas, withParentBadges } from "../../lib/constants";

// =========================================================
// NOTIFIKASI DI DALAM APLIKASI — versi HP (/m)
// Sama dengan versi web (App.jsx), untuk dua hal yang perlu tindakan:
//   1. Pengajuan Dana yang menunggu persetujuan (Perusahaan Grup > Antar Entitas)
//      -> hanya untuk akun yang berhak menanggapinya (aturan sama: bolehTransferAntarEntitas)
//   2. Permintaan Stok dari PT lain yang menunggu persetujuan kita (Stok > Transfer Barang > Permintaan Stok)
//      -> hanya untuk akun yang boleh mengirim transfer, dan permintaannya ditujukan ke PT akun ini
// Hasilnya: badge angka di menu (Beranda, daftar menu, bar bawah), kartu "Perlu tindakan" di Beranda, dan
// banner sementara saat ada yang baru. Dicek tiap 30 detik (hanya saat layar terlihat) dan tiap pindah menu.
// Ini BUKAN push notification: hanya jalan saat aplikasi sedang dibuka.
// =========================================================

const JEDA_MS = 30000;
const LAMA_BANNER_MS = 7000;

export default function useNotifHp(session, bolehMenu) {
  const role = session?.role;
  const entAkun = session?.entitas;
  const adaDana = !!bolehMenu?.includes("perusahaan");
  const adaStok = !!bolehMenu?.includes("transfer-entitas") && bisa(role, "stok.transfer_entitas");

  const [kodeHolding, setKodeHolding] = useState("");
  const [jumlah, setJumlah] = useState({ dana: 0, stok: 0 });
  const [banner, setBanner] = useState([]);
  const sebelumnya = useRef({ dana: -1, stok: -1 });
  const timerBanner = useRef(null);

  // Kode entitas Holding (dibutuhkan untuk menentukan siapa yang berhak menanggapi pengajuan dana).
  useEffect(() => {
    if (!session?.id || !adaDana) {
      setKodeHolding("");
      return undefined;
    }
    let batal = false;
    sb("master_data?tipe=in.(entitas,entitas_set)&select=tipe,kode,label", { timeoutMs: 10000 })
      .then((rows) => {
        if (batal) return;
        const daftar = Array.isArray(rows) ? rows : [];
        setKodeHolding(kodeHoldingPasti(daftar.filter((r) => r.tipe === "entitas"), daftar.filter((r) => r.tipe === "entitas_set")));
      })
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [session?.id, adaDana]);

  const tampilBanner = useCallback((daftar) => {
    setBanner(daftar);
    clearTimeout(timerBanner.current);
    timerBanner.current = setTimeout(() => setBanner([]), LAMA_BANNER_MS);
  }, []);
  useEffect(() => () => clearTimeout(timerBanner.current), []);

  const segarkan = useCallback(async () => {
    if (!session?.id || document.visibilityState !== "visible") return;
    const baru = [];

    if (adaDana && kodeHolding) {
      try {
        const rows = (await sb("pengajuan_dana?status=eq.menunggu&select=id,kode,entitas_peminta,entitas_pemberi,jumlah&limit=200")) || [];
        const n = rows.filter((p) => bolehTransferAntarEntitas(role, p.entitas_pemberi, p.entitas_peminta, kodeHolding, entAkun)).length;
        const lalu = sebelumnya.current.dana;
        sebelumnya.current.dana = n;
        setJumlah((j) => (j.dana === n ? j : { ...j, dana: n }));
        if (n > 0 && (lalu === -1 || n > lalu)) {
          baru.push({ kunci: "dana", teks: `${n} pengajuan dana menunggu persetujuan Anda`, menuKey: "perusahaan", subKey: "antar-entitas" });
        }
      } catch {
        /* diam: tabel belum ada / jaringan — notifikasi tidak kritis */
      }
    }

    if (adaStok) {
      try {
        const ent = encodeURIComponent(entitasSesi());
        const rows = (await sb(`permintaan_stok?status=eq.menunggu&entitas_pemberi=eq.${ent}&select=id,kode&limit=200`)) || [];
        const n = rows.length;
        const lalu = sebelumnya.current.stok;
        sebelumnya.current.stok = n;
        setJumlah((j) => (j.stok === n ? j : { ...j, stok: n }));
        if (n > 0 && (lalu === -1 || n > lalu)) {
          baru.push({ kunci: "stok", teks: `${n} permintaan stok menunggu persetujuan Anda`, menuKey: "transfer-entitas", subKey: null });
        }
      } catch {
        /* diam */
      }
    }

    if (baru.length) tampilBanner(baru);
  }, [session?.id, role, entAkun, adaDana, adaStok, kodeHolding, tampilBanner]);

  useEffect(() => {
    segarkan();
    const t = setInterval(segarkan, JEDA_MS);
    const saatKembali = () => segarkan();
    window.addEventListener("selma:dana-berubah", saatKembali);
    window.addEventListener("hashchange", saatKembali); // tiap pindah menu
    document.addEventListener("visibilitychange", saatKembali);
    return () => {
      clearInterval(t);
      window.removeEventListener("selma:dana-berubah", saatKembali);
      window.removeEventListener("hashchange", saatKembali);
      document.removeEventListener("visibilitychange", saatKembali);
    };
  }, [segarkan]);

  // Badge per key menu (format sama dengan sidebar web) + total ke group induknya.
  const badges = useMemo(
    () => withParentBadges(NAV, { "perusahaan.antar-entitas": jumlah.dana, "transfer-entitas": jumlah.stok }),
    [jumlah]
  );

  // Daftar tetap "Perlu tindakan" (kartu di Beranda) — berbeda dengan banner yang hilang sendiri.
  const perlu = useMemo(() => {
    const l = [];
    if (jumlah.dana > 0) l.push({ kunci: "dana", teks: `${jumlah.dana} pengajuan dana menunggu persetujuan`, menuKey: "perusahaan", subKey: "antar-entitas" });
    if (jumlah.stok > 0) l.push({ kunci: "stok", teks: `${jumlah.stok} permintaan stok menunggu persetujuan`, menuKey: "transfer-entitas", subKey: null });
    return l;
  }, [jumlah]);

  return { badges, perlu, banner, tutupBanner: () => setBanner([]) };
}
