import { useState, useEffect, useMemo, useCallback } from "react";
import { bisa } from "../lib/constants";
import QRCode from "qrcode";
import { Lock, Save, Loader2, QrCode, Ban, Trash2, CheckCircle2, RefreshCw, Download, Calculator } from "lucide-react";
import {
  PageHeader, EmptyState, Badge, Field, ModalShell, InputRupiah,
  inputClass, btnFilled, btnTonal, btnOutlined, btnText,
} from "../components/ui";
import {
  fmtRp, cekPasswordAdmin, daftarGaji, simpanDraftGaji, serahkanGaji,
  batalkanGaji, hapusGaji, tandaiGajiDiterimaAdmin, lingkupEntitas, kodeHoldingPasti,
} from "../lib/api";
import { listKaryawan, entitasAbsensi, pilihEntitasAbsensi } from "../lib/absensi";
import { hitungGajiOtomatis, daftarPengaturanGaji } from "../lib/gajiOtomatis";
import PengaturanGaji from "../components/PengaturanGaji";
import { EVENT_PILIH_PERIODE_GAJI } from "../components/PengingatGaji";

const STATUS_WARNA = { draft: "slate", diserahkan: "amber", diterima: "emerald", batal: "red" };
const STATUS_LABEL = { draft: "Draft", diserahkan: "Diserahkan", diterima: "Diterima", batal: "Batal" };
const BERLAKU = [
  { v: 30, l: "30 menit" },
  { v: 120, l: "2 jam" },
  { v: 1440, l: "24 jam" },
  { v: 4320, l: "3 hari" },
];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Periode gaji punya tiga bentuk (disimpan sebagai teks di kolom periode):
//   bulan   "2026-10"                 -> "Oktober 2026"
//   tanggal "2026-10-10"              -> "10 Okt 2026"
//   rentang "2026-10-01_2026-10-15"   -> "1 Okt 2026 – 15 Okt 2026"
const ISO_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_TGL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function fmtTglPendek(iso) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${NAMA_BULAN[Number(m) - 1].slice(0, 3)} ${y}`;
}
function labelPeriode(p) {
  const s = String(p || "");
  if (ISO_BULAN.test(s)) {
    const [y, m] = s.split("-");
    return `${NAMA_BULAN[Number(m) - 1]} ${y}`;
  }
  if (ISO_TGL.test(s)) return fmtTglPendek(s);
  const r = s.split("_");
  if (r.length === 2 && ISO_TGL.test(r[0]) && ISO_TGL.test(r[1])) return `${fmtTglPendek(r[0])} – ${fmtTglPendek(r[1])}`;
  return s || "—";
}
function hariIni() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB
}
// Siklus gaji bergeser, mis. "gaji November" = 24 Okt s/d 23 Nov (gajian tanggal 23 ikut periode ini).
// Hasilnya tetap berupa periode
// rentang ("2026-10-24_2026-11-23"), jadi server, QR, dan Keuangan tidak perlu tahu soal siklus.
// Tanggal mulai dibatasi 2-28 supaya selalu ada di setiap bulan.
function periodeSiklus(bulanAkhir, hariMulai) {
  const h = Number(hariMulai);
  if (!ISO_BULAN.test(bulanAkhir) || !Number.isInteger(h) || h < 2 || h > 28) return "";
  const [y, m] = bulanAkhir.split("-").map(Number);
  const dua = (n) => String(n).padStart(2, "0");
  const yAwal = m === 1 ? y - 1 : y;
  const mAwal = m === 1 ? 12 : m - 1;
  return `${yAwal}-${dua(mAwal)}-${dua(h)}_${y}-${dua(m)}-${dua(h - 1)}`;
}
// Pilihan layar yang diingat di browser ini (kenyamanan saja; aman kalau penyimpanan gagal).
const bacaLokal = (kunci, bawaan) => {
  try { return localStorage.getItem(kunci) || bawaan; } catch { return bawaan; }
};
const tulisLokal = (kunci, nilai) => {
  try { localStorage.setItem(kunci, String(nilai)); } catch { /* abaikan */ }
};
// Kunci baru (v2) supaya nilai lama "23" yang sempat tersimpan di browser tidak terbawa.
const KUNCI_HARI_MULAI = "selma-gaji-hari-mulai-v2";
const HARI_MULAI_BAWAAN = "24";
const TIPE_PERIODE_VALID = ["bulan", "tanggal", "rentang", "siklus", "mingguan"];
const bacaTipePeriode = () => {
  const t = bacaLokal("selma-gaji-tipe-periode", "bulan");
  return TIPE_PERIODE_VALID.includes(t) ? t : "bulan";
};
// Jadwal bayar: karyawan harian dibayar MINGGUAN (gaji pokok + lembur); karyawan bulanan dibayar tiap
// tanggal 23. Premi jabatan & kehadiran dibayar sebulan sekali (tgl 23) untuk KEDUA tipe — jadi di
// gajian bulanan karyawan harian ikut dihitung (server hanya mengisi premi mereka, bukan gaji pokok).
// Gajian mingguan hanya mengisi karyawan harian.
const bawaanHitungUntuk = (tipe) => (tipe === "mingguan" ? "harian" : "semua");
const tambahHari = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const selisihHari = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
function fmtWaktu(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}
const sudahKedaluwarsa = (iso) => !!iso && new Date(iso).getTime() < Date.now();

// Komponen gaji. nominal (total) = jumlah semua komponen, jadi menu Keuangan,
// QR, dan konfirmasi karyawan tetap memakai satu angka total seperti sebelumnya.
const KOMPONEN = [
  { k: "gaji_pokok", l: "Gaji Pokok" },
  { k: "premi_jabatan", l: "Premi Jabatan" },
  { k: "premi_kehadiran", l: "Premi Kehadiran" },
  { k: "bonus", l: "Bonus" },
];
const angka = (v) => Number(v) || 0;
const totalKomponen = (v) => KOMPONEN.reduce((s, c) => s + angka(v?.[c.k]), 0);
// Dari baris gaji server -> nilai komponen. Server lama belum punya kolom rincian:
// seluruh nominal dianggap gaji pokok supaya total tetap sama.
const komponenDariGaji = (g) => {
  const adaRincian = g && g.gaji_pokok !== undefined && g.gaji_pokok !== null;
  return {
    gaji_pokok: adaRincian ? g.gaji_pokok : g?.nominal ?? "",
    premi_jabatan: g?.premi_jabatan ?? "",
    premi_kehadiran: g?.premi_kehadiran ?? "",
    bonus: g?.bonus ?? "",
  };
};

// Gambar QR siap unduh: nama, periode, nominal, dan masa berlaku ikut tercetak.
async function buatGambarQr(data) {
  const qrUrl = await QRCode.toDataURL(data.token, { width: 520, margin: 2, errorCorrectionLevel: "M" });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = qrUrl;
  });
  const W = 640, H = 820;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.fillStyle = "#111827";
  x.font = "bold 30px sans-serif"; x.fillText("QR GAJI", W / 2, 56);
  x.font = "bold 28px sans-serif"; x.fillText(data.nama, W / 2, 104);
  x.fillStyle = "#4b5563"; x.font = "22px sans-serif";
  x.fillText(`${labelPeriode(data.periode)} · ${fmtRp(data.nominal)}`, W / 2, 142);
  x.drawImage(img, (W - 520) / 2, 170, 520, 520);
  x.fillStyle = "#4b5563"; x.font = "20px sans-serif";
  x.fillText(`Berlaku sampai ${fmtWaktu(data.kedaluwarsa)}`, W / 2, 740);
  x.fillStyle = "#9ca3af"; x.font = "16px sans-serif";
  x.fillText("Jangan bagikan QR ini ke orang lain", W / 2, 780);
  return new Promise((res) => c.toBlob(res, "image/png"));
}
async function unduhGambarQr(data) {
  const blob = await buatGambarQr(data);
  const aman = (t) => String(t).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `QR-Gaji-${aman(data.nama)}-${aman(data.periode)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Penggajian({ session, master, showToast }) {
  const readOnly = !bisa(session?.role, "penggajian.ubah"); // bawaan: owner hanya melihat
  // Penggajian dipisah per perusahaan. Akun biasa memakai perusahaannya sendiri; Super Appa
  // memilih perusahaan lewat dropdown (pilihan yang sama dengan menu Absensi). Gaji hanya boleh
  // keluar dari rekening milik perusahaan itu — server menolak rekening perusahaan lain.
  const [ent, setEnt] = useState(() => entitasAbsensi());
  const kodeHolding = kodeHoldingPasti(master?.entitas, master?.entitas_set);
  const daftarPT = (master?.entitas || []).filter((e) => e.kode !== kodeHolding);
  const bolehPilihPT = session?.role === "superappa" && daftarPT.length > 1;
  const namaPT = (master?.entitas || []).find((e) => e.kode === ent)?.label || ent;
  const rekeningList = useMemo(
    () => lingkupEntitas([], master || {}, ent).master.rekening || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [master?.rekening, master?.rekening_entitas, master?.entitas, ent]
  );

  // Password admin hanya disimpan di memori halaman ini (hilang saat pindah menu / refresh).
  const [pw, setPw] = useState(null);
  const [pwInput, setPwInput] = useState("");
  const [membuka, setMembuka] = useState(false);

  const [tab, setTab] = useState("siapkan");
  const [karyawan, setKaryawan] = useState([]);
  const [gaji, setGaji] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [sibuk, setSibuk] = useState(null); // id gaji / "simpan" yang sedang diproses

  const [tipePeriode, setTipePeriodeState] = useState(bacaTipePeriode); // bulan | tanggal | rentang | siklus | mingguan
  const [hitungUntuk, setHitungUntuk] = useState(() => bawaanHitungUntuk(bacaTipePeriode())); // semua | bulanan | harian
  const setTipePeriode = (t) => {
    setTipePeriodeState(t);
    setHitungUntuk(bawaanHitungUntuk(t));
    tulisLokal("selma-gaji-tipe-periode", t);
  };
  // Opsi lanjutan (periode per bulan/tanggal/rentang, tanggal mulai, masa berlaku QR) disembunyikan
  // kecuali sedang memakai periode selain dua gajian utama (mingguan & bulanan tgl 23).
  const [lanjutan, setLanjutan] = useState(() => !["mingguan", "siklus"].includes(bacaTipePeriode()));
  const [tipeKaryawan, setTipeKaryawan] = useState(() => new Map()); // karyawan_id -> "harian" | "bulanan"
  const [tglGajian, setTglGajian] = useState(hariIni()); // akhir periode mingguan (hari gajian)
  const [mulaiManual, setMulaiManual] = useState(null); // null = mulai otomatis
  const [bulanSiklus, setBulanSiklus] = useState(hariIni().slice(0, 7)); // bulan tempat siklus BERAKHIR
  const [hariMulai, setHariMulaiState] = useState(() => bacaLokal(KUNCI_HARI_MULAI, HARI_MULAI_BAWAAN));
  const setHariMulai = (v) => { setHariMulaiState(v); tulisLokal(KUNCI_HARI_MULAI, v); };
  const [bulan, setBulan] = useState(hariIni().slice(0, 7));
  const [tanggal, setTanggal] = useState(hariIni());
  const [dari, setDari] = useState(hariIni().slice(0, 8) + "01");
  const [sampai, setSampai] = useState(hariIni());
  const rentangValid = ISO_TGL.test(dari) && ISO_TGL.test(sampai) && dari <= sampai;
  // Periode mingguan (karyawan harian): berakhir di hari gajian, mulai sehari setelah gajian mingguan
  // sebelumnya. "Gajian sebelumnya" dibaca dari periode gaji pendek (< 28 hari) yang sudah ada dan
  // berakhir sebelum tanggal gajian ini; periode bulanan/siklus (28 hari ke atas) tidak ikut dihitung.
  const akhirMingguanSebelumnya = useMemo(() => {
    if (!ISO_TGL.test(tglGajian)) return null;
    let akhir = null;
    gaji.forEach((g) => {
      if (g.status === "batal") return;
      const r = String(g.periode || "").split("_");
      if (r.length !== 2 || !ISO_TGL.test(r[0]) || !ISO_TGL.test(r[1])) return;
      if (selisihHari(r[0], r[1]) + 1 >= 28) return;
      if (r[1] < tglGajian && (!akhir || r[1] > akhir)) akhir = r[1];
    });
    return akhir;
  }, [gaji, tglGajian]);
  const mulaiOtomatis = !ISO_TGL.test(tglGajian) ? "" : akhirMingguanSebelumnya ? tambahHari(akhirMingguanSebelumnya, 1) : tambahHari(tglGajian, -6);
  const mulaiMingguan = mulaiManual ?? mulaiOtomatis;
  const mingguanValid = ISO_TGL.test(tglGajian) && ISO_TGL.test(mulaiMingguan) && mulaiMingguan <= tglGajian;
  const hariMingguan = mingguanValid ? selisihHari(mulaiMingguan, tglGajian) + 1 : 0;
  // String periode yang dikirim ke server; "" = isian belum valid.
  const periode =
    tipePeriode === "bulan" ? (ISO_BULAN.test(bulan) ? bulan : "")
    : tipePeriode === "tanggal" ? (ISO_TGL.test(tanggal) ? tanggal : "")
    : tipePeriode === "siklus" ? periodeSiklus(bulanSiklus, hariMulai)
    : tipePeriode === "mingguan" ? (mingguanValid ? `${mulaiMingguan}_${tglGajian}` : "")
    : rentangValid ? `${dari}_${sampai}` : "";
  const [edit, setEdit] = useState({}); // { [karyawan_id]: { nominal, catatan } } — hanya baris yang diubah user
  const [rekening, setRekening] = useState("");
  const [berlaku, setBerlaku] = useState(1440);
  const [filterKaryawan, setFilterKaryawan] = useState("");
  const [qr, setQr] = useState(null); // { nama, periode, nominal, token, kedaluwarsa }

  const peta = useMemo(() => new Map(karyawan.map((k) => [k.id, k])), [karyawan]);
  const karyawanAktif = useMemo(() => karyawan.filter((k) => k.aktif), [karyawan]);
  // Gajian mingguan hanya untuk karyawan harian (yang belum diatur tetap tampil supaya bisa diisi manual);
  // gajian bulanan menampilkan semua karyawan (harian ikut untuk premi).
  const daftarTampil = useMemo(
    () => (tipePeriode === "mingguan"
      ? karyawanAktif.filter((k) => { const t = tipeKaryawan.get(k.id); return !t || t === "harian"; })
      : karyawanAktif),
    [karyawanAktif, tipeKaryawan, tipePeriode]
  );
  // Premi dibayar bulanan, jadi kolomnya tidak perlu di gajian mingguan.
  const komponenTampil = tipePeriode === "mingguan" ? KOMPONEN.filter((c) => c.k === "gaji_pokok" || c.k === "bonus") : KOMPONEN;

  // Kalau password ditolak server, kembali ke layar kunci.
  const tanganiError = useCallback((e, fallback) => {
    const pesan = e?.message || fallback;
    if (/^Username atau password/i.test(pesan)) setPw(null);
    showToast?.(pesan, "err");
  }, [showToast]);

  const muat = useCallback(async (kata = pw) => {
    if (!kata) return;
    setMemuat(true);
    try {
      const [g, k, pg] = await Promise.all([
        daftarGaji(kata, { entitas: ent }),
        listKaryawan(true, ent),
        daftarPengaturanGaji(kata, ent).catch(() => []), // gagal = daftar tidak difilter per tipe
      ]);
      setGaji(g || []);
      setKaryawan(k || []);
      setTipeKaryawan(new Map((pg || []).map((r) => [r.karyawan_id, r.tipe_gaji])));
    } catch (e) {
      tanganiError(e, "Gagal memuat data gaji.");
    } finally {
      setMemuat(false);
    }
  }, [pw, tanganiError, ent]);

  const gantiPT = (kode) => {
    pilihEntitasAbsensi(kode);
    setEnt(kode);
    setRekening("");
    setEdit({});
    setGaji([]);
    setKaryawan([]);
  };
  // Muat ulang data setiap perusahaan berganti (setelah password terbuka).
  useEffect(() => {
    if (pw) muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent]);

  const buka = async (e) => {
    e.preventDefault();
    if (!pwInput) return;
    setMembuka(true);
    try {
      await cekPasswordAdmin(pwInput);
      setPw(pwInput);
      setPwInput("");
      await muat(pwInput);
    } catch (err) {
      showToast?.(err.message || "Password salah.", "err");
    } finally {
      setMembuka(false);
    }
  };

  useEffect(() => { setEdit({}); }, [periode]);

  // Tombol "Siapkan gaji" / "Pakai periode ini" di pengingat gajian (PengingatGaji.jsx) memilihkan
  // periodenya: Sabtu/Minggu -> mingguan berakhir hari ini; tanggal 23 -> siklus 24 s/d 23.
  useEffect(() => {
    const dengar = (e) => {
      const p = e.detail || {};
      if (p.tipe === "mingguan") {
        setTipePeriode("mingguan");
        if (p.tglGajian) { setTglGajian(p.tglGajian); setMulaiManual(null); }
      } else if (p.tipe === "bulanan") {
        setTipePeriode("siklus");
        if (p.bulan) setBulanSiklus(p.bulan);
        setHariMulai(HARI_MULAI_BAWAAN);
      } else {
        return;
      }
      setTab("siapkan");
    };
    window.addEventListener(EVENT_PILIH_PERIODE_GAJI, dengar);
    return () => window.removeEventListener(EVENT_PILIH_PERIODE_GAJI, dengar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gaji aktif (bukan batal) per karyawan untuk periode terpilih.
  const gajiPeriode = useMemo(() => {
    const m = new Map();
    gaji.filter((g) => g.periode === periode && g.status !== "batal").forEach((g) => m.set(g.karyawan_id, g));
    return m;
  }, [gaji, periode]);

  // Rekening default: ikut draft yang sudah ada, kalau belum ada pilih rekening pertama.
  useEffect(() => {
    if (rekening) return;
    const draft = [...gajiPeriode.values()].find((g) => g.status === "draft" && g.rekening_sumber);
    if (draft) setRekening(draft.rekening_sumber);
  }, [gajiPeriode, rekening]);

  const nilaiBaris = (kid) => {
    if (edit[kid]) return edit[kid];
    const g = gajiPeriode.get(kid);
    return g?.status === "draft"
      ? { ...komponenDariGaji(g), catatan: g.catatan || "" }
      : { gaji_pokok: "", premi_jabatan: "", premi_kehadiran: "", bonus: "", catatan: "" };
  };
  const ubahBaris = (kid, patch) => setEdit((p) => ({ ...p, [kid]: { ...nilaiBaris(kid), ...patch } }));

  const barisTersimpan = !periode ? [] : karyawanAktif.filter((k) => {
    const g = gajiPeriode.get(k.id);
    return edit[k.id] && (!g || g.status === "draft") && totalKomponen(edit[k.id]) > 0;
  });

  const simpan = async () => {
    if (barisTersimpan.length === 0) {
      showToast?.("Belum ada komponen gaji yang diisi/diubah.", "err");
      return;
    }
    setSibuk("simpan");
    try {
      const baris = barisTersimpan.map((k) => ({
        karyawan_id: k.id,
        periode,
        gaji_pokok: angka(edit[k.id].gaji_pokok),
        premi_jabatan: angka(edit[k.id].premi_jabatan),
        premi_kehadiran: angka(edit[k.id].premi_kehadiran),
        bonus: angka(edit[k.id].bonus),
        nominal: totalKomponen(edit[k.id]),
        catatan: edit[k.id].catatan || null,
        rekening_sumber: rekening || null,
      }));
      const hasil = await simpanDraftGaji(pw, baris, ent);
      const ok = hasil.filter((h) => h.ok);
      const gagal = hasil.filter((h) => !h.ok);
      // Baris yang berhasil dibersihkan dari "perubahan lokal" (datanya kini dari server).
      setEdit((p) => {
        const n = { ...p };
        ok.forEach((h) => delete n[baris[h.index].karyawan_id]);
        return n;
      });
      if (ok.length) showToast?.(`${ok.length} draft gaji tersimpan.`);
      gagal.forEach((h) => showToast?.(`${peta.get(baris[h.index].karyawan_id)?.nama || "Baris"}: ${h.error}`, "err"));
      await muat();
    } catch (e) {
      tanganiError(e, "Gagal menyimpan draft.");
    } finally {
      setSibuk(null);
    }
  };

  const jalankan = async (g, fn, pesanOk) => {
    setSibuk(g.id);
    try {
      const hasil = await fn();
      if (pesanOk) showToast?.(pesanOk);
      await muat();
      return hasil;
    } catch (e) {
      tanganiError(e, "Aksi gagal.");
      return null;
    } finally {
      setSibuk(null);
    }
  };

  const dataQr = (g, token, kedaluwarsa) =>
    ({ nama: peta.get(g.karyawan_id)?.nama || "—", periode: g.periode, nominal: g.nominal, token, kedaluwarsa });
  const bukaQr = (g, token, kedaluwarsa) => setQr(dataQr(g, token, kedaluwarsa));
  const unduhQr = async (g) => {
    try {
      await unduhGambarQr(dataQr(g, g.token_qr, g.token_kedaluwarsa));
    } catch {
      showToast?.("Gagal mengunduh QR.", "err");
    }
  };

  const serahkan = async (g) => {
    const hasil = await jalankan(g, () => serahkanGaji(pw, g.id, berlaku));
    if (hasil?.token) bukaQr(g, hasil.token, hasil.kedaluwarsa);
  };

  const batal = (g) => {
    if (!window.confirm("Batalkan gaji ini? QR yang sudah dibuat tidak akan berlaku lagi.")) return;
    jalankan(g, () => batalkanGaji(pw, g.id), "Gaji dibatalkan.");
  };

  const hapus = (g) => {
    const peringatan = g.status === "diterima"
      ? "Gaji ini SUDAH DITERIMA. Menghapusnya juga menghapus transaksi pengeluaran di menu Keuangan. Lanjutkan?"
      : "Hapus gaji ini?";
    if (!window.confirm(peringatan)) return;
    jalankan(g, () => hapusGaji(pw, g.id), "Gaji dihapus.");
  };

  const tandaiDiterima = (g) => {
    if (!window.confirm("Tandai gaji ini sudah diterima? Transaksi pengeluaran akan dicatat di Keuangan.")) return;
    jalankan(g, () => tandaiGajiDiterimaAdmin(pw, g.id), "Gaji ditandai diterima dan dicatat di Keuangan.");
  };

  // Isi komponen gaji semua karyawan untuk periode terpilih dari data Absensi + tarif di tab
  // Pengaturan Gaji. Hasilnya masuk ke baris draft di layar (belum disimpan), jadi masih bisa
  // diperiksa dan diubah dulu. Gaji yang sudah diserahkan/diterima tidak disentuh.
  const hitungOtomatis = async () => {
    if (!periode) {
      showToast?.("Isi periode dengan benar dulu.", "err");
      return;
    }
    setSibuk("hitung");
    try {
      const { data, dilewati, lainTipe } = await hitungGajiOtomatis(pw, periode, ent, hitungUntuk === "semua" ? null : hitungUntuk);
      const bisa = data.filter((h) => {
        const g = gajiPeriode.get(h.karyawan_id);
        return !g || g.status === "draft";
      });
      const terkunci = data.length - bisa.length;
      const adaIsian = bisa.some((h) => gajiPeriode.get(h.karyawan_id)?.status === "draft" || totalKomponen(edit[h.karyawan_id]) > 0);
      if (adaIsian && !window.confirm("Hitung otomatis akan menimpa isian gaji yang sudah ada di layar (termasuk bonus dan catatan) untuk karyawan yang tarifnya sudah diatur. Lanjutkan?")) {
        return;
      }
      setEdit((p) => {
        const n = { ...p };
        bisa.forEach((h) => {
          n[h.karyawan_id] = {
            gaji_pokok: h.gaji_pokok,
            premi_jabatan: h.premi_jabatan,
            premi_kehadiran: h.premi_kehadiran,
            bonus: h.bonus,
            catatan: h.catatan || "",
          };
        });
        return n;
      });
      const terisi = bisa.filter((h) => totalKomponen(h) > 0).length;
      const pesan = [`${terisi} karyawan terisi otomatis dari absensi. Periksa lalu klik Simpan draft.`];
      if (terisi < bisa.length) pesan.push(`${bisa.length - terisi} tanpa nominal di periode ini (tidak masuk, atau karyawan harian tanpa premi di gajian bulanan).`);
      if (terkunci > 0) pesan.push(`${terkunci} dilewati karena gajinya sudah diserahkan/diterima.`);
      if (lainTipe > 0) pesan.push(`${lainTipe} karyawan ${hitungUntuk === "bulanan" ? "harian" : "bulanan"} tidak ikut dihitung.`);
      if (dilewati.length > 0) {
        const nama = dilewati.slice(0, 3).map((d) => peta.get(d.karyawan_id)?.nama || "—").join(", ");
        pesan.push(`${dilewati.length} belum punya tarif (${nama}${dilewati.length > 3 ? ", ..." : ""}) — atur di tab Pengaturan Gaji.`);
      }
      showToast?.(pesan.join(" "));
    } catch (e) {
      tanganiError(e, "Gagal menghitung gaji otomatis.");
    } finally {
      setSibuk(null);
    }
  };

  const AksiGaji = ({ g }) => {
    if (readOnly) return null;
    const proses = sibuk === g.id;
    const kedaluwarsa = g.status === "diserahkan" && sudahKedaluwarsa(g.token_kedaluwarsa);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {proses && <Loader2 size={16} className="animate-spin text-md-primary" />}
        {(g.status === "draft" || g.status === "diserahkan") && (
          <button disabled={proses} className={btnTonal + " !px-3 !py-1.5"} onClick={() => serahkan(g)}>
            <QrCode size={14} /> {g.status === "draft" ? "Serahkan" : "QR baru"}
          </button>
        )}
        {g.status === "diserahkan" && !kedaluwarsa && g.token_qr && (
          <button disabled={proses} className={btnText} onClick={() => bukaQr(g, g.token_qr, g.token_kedaluwarsa)}>
            Lihat QR
          </button>
        )}
        {g.status === "diserahkan" && !kedaluwarsa && g.token_qr && (
          <button disabled={proses} className={btnText} onClick={() => unduhQr(g)}>
            <Download size={14} /> Unduh QR
          </button>
        )}
        {g.status === "diserahkan" && (
          <button disabled={proses} className={btnText} onClick={() => tandaiDiterima(g)}>
            <CheckCircle2 size={14} /> Tandai diterima
          </button>
        )}
        {(g.status === "draft" || g.status === "diserahkan") && (
          <button disabled={proses} className={btnText} onClick={() => batal(g)}>
            <Ban size={14} /> Batal
          </button>
        )}
        <button disabled={proses} className={btnText} onClick={() => hapus(g)}>
          <Trash2 size={14} /> Hapus
        </button>
      </div>
    );
  };

  // ---------- Layar kunci (butuh password admin) ----------
  if (!pw) {
    return (
      <div>
        <PageHeader title="Penggajian" description="Data gaji hanya bisa dibuka dengan password akun Anda." />
        <form onSubmit={buka} className="max-w-sm bg-md-container-high rounded-md-xl p-5">
          <div className="flex items-center gap-2 mb-3 text-md-on-surface">
            <Lock size={18} /> <span className="font-medium text-sm">Masukkan password</span>
          </div>
          <Field label={`Password ${session?.username || "admin"}`}>
            <input
              type="password"
              autoFocus
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </Field>
          <button type="submit" disabled={membuka || !pwInput} className={btnFilled + " w-full"}>
            {membuka ? <Loader2 size={16} className="animate-spin" /> : "Buka Penggajian"}
          </button>
        </form>
      </div>
    );
  }

  const totalDraft = daftarTampil.reduce((s, k) => s + (totalKomponen(nilaiBaris(k.id))), 0);
  const riwayat = gaji.filter((g) => !filterKaryawan || g.karyawan_id === filterKaryawan);

  return (
    <div>
      <PageHeader
        title="Penggajian"
        description={readOnly ? `Mode lihat saja (Owner) — ${namaPT}.` : `Gaji karyawan ${namaPT}: siapkan, serahkan lewat QR, karyawan memindai dari HP.`}
        action={
          <div className="flex items-center gap-2">
            {bolehPilihPT && (
              <select value={ent} onChange={(e) => gantiPT(e.target.value)} className={`${inputClass} w-auto`} aria-label="Perusahaan">
                {daftarPT.map((e) => (
                  <option key={e.kode} value={e.kode}>{e.label}</option>
                ))}
              </select>
            )}
            <button className={btnOutlined} onClick={() => muat()} disabled={memuat}>
              <RefreshCw size={14} className={memuat ? "animate-spin" : ""} /> Muat ulang
            </button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        <button className={tab === "siapkan" ? btnFilled : btnOutlined} onClick={() => setTab("siapkan")}>Siapkan Gaji</button>
        <button className={tab === "riwayat" ? btnFilled : btnOutlined} onClick={() => setTab("riwayat")}>Riwayat</button>
        <button className={tab === "pengaturan" ? btnFilled : btnOutlined} onClick={() => setTab("pengaturan")}>Pengaturan Gaji</button>
      </div>

      {tab === "siapkan" && (
        <>
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button className={tipePeriode === "mingguan" ? btnFilled : btnOutlined} onClick={() => setTipePeriode("mingguan")}>Gajian mingguan</button>
              <button className={tipePeriode === "siklus" ? btnFilled : btnOutlined} onClick={() => setTipePeriode("siklus")}>Gajian bulanan (tgl 23)</button>
              <button className={btnText} onClick={() => setLanjutan((v) => !v)}>{lanjutan ? "Sembunyikan opsi lanjutan" : "Opsi lanjutan"}</button>
            </div>
            {lanjutan && (
              <div className="flex flex-wrap gap-2 mb-2">
                {[["bulan", "Per bulan kalender"], ["tanggal", "Per tanggal"], ["rentang", "Per rentang tanggal"]].map(([k, l]) => (
                  <button key={k} className={tipePeriode === k ? btnTonal : btnOutlined} onClick={() => setTipePeriode(k)}>{l}</button>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {tipePeriode === "bulan" && (
                <Field label="Bulan">
                  <input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} className={inputClass} />
                </Field>
              )}
              {tipePeriode === "siklus" && (
                <>
                  <Field label="Gaji untuk bulan">
                    <input type="month" value={bulanSiklus} onChange={(e) => setBulanSiklus(e.target.value)} className={inputClass} />
                  </Field>
                  {lanjutan && (
                    <Field label="Siklus mulai tanggal (2-28)">
                      <input type="number" min={2} max={28} value={hariMulai} onChange={(e) => setHariMulai(e.target.value)} className={inputClass} />
                    </Field>
                  )}
                </>
              )}
              {tipePeriode === "mingguan" && (
                <>
                  <Field label="Tanggal gajian (akhir periode)">
                    <input type="date" value={tglGajian} onChange={(e) => { setTglGajian(e.target.value); setMulaiManual(null); }} className={inputClass} />
                  </Field>
                  {(lanjutan || mulaiManual != null) && (
                    <Field label="Mulai dari tanggal">
                      <input type="date" value={mulaiMingguan} onChange={(e) => setMulaiManual(e.target.value)} className={inputClass} />
                    </Field>
                  )}
                </>
              )}
              {tipePeriode === "tanggal" && (
                <Field label="Tanggal">
                  <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputClass} />
                </Field>
              )}
              {tipePeriode === "rentang" && (
                <>
                  <Field label="Dari tanggal">
                    <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Sampai tanggal">
                    <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={inputClass} />
                  </Field>
                </>
              )}
            </div>
            {tipePeriode === "rentang" && !rentangValid && (
              <p className="text-xs text-red-400">Tanggal "dari" harus sebelum atau sama dengan tanggal "sampai".</p>
            )}
            {tipePeriode === "mingguan" && (lanjutan || mulaiManual != null) && (
              <p className="text-xs text-md-on-surface-variant">
                {mulaiManual != null
                  ? "Tanggal mulai diatur manual. "
                  : akhirMingguanSebelumnya
                    ? `Mulai otomatis: sehari setelah gajian mingguan terakhir (${fmtTglPendek(akhirMingguanSebelumnya)}). `
                    : "Belum ada gaji mingguan sebelumnya, jadi mulai diisi 7 hari sampai tanggal gajian — ubah kalau perlu. "}
                {mulaiManual != null && <button type="button" className="underline" onClick={() => setMulaiManual(null)}>Pakai otomatis</button>}
              </p>
            )}
            {tipePeriode === "mingguan" && !mingguanValid && (
              <p className="text-xs text-red-400">Tanggal mulai harus sebelum atau sama dengan tanggal gajian.</p>
            )}
            {tipePeriode === "mingguan" && hariMingguan > 14 && (
              <p className="text-xs text-amber-400">Periode ini {hariMingguan} hari — pastikan tanggal mulai sudah benar.</p>
            )}
            {tipePeriode === "siklus" && !periode && (
              <p className="text-xs text-red-400">Isi bulan dan tanggal mulai siklus (2 sampai 28) dengan benar.</p>
            )}
            {periode && <p className="text-xs text-md-on-surface-variant">Periode terpilih: {labelPeriode(periode)}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <Field label="Rekening sumber">
              <select value={rekening} onChange={(e) => setRekening(e.target.value)} className={inputClass} disabled={readOnly}>
                <option value="">— pilih rekening —</option>
                {rekeningList.map((r) => <option key={r.kode} value={r.kode}>{r.label}</option>)}
              </select>
            </Field>
            {lanjutan && (
              <Field label="Masa berlaku QR">
                <select value={berlaku} onChange={(e) => setBerlaku(Number(e.target.value))} className={inputClass} disabled={readOnly}>
                  {BERLAKU.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                </select>
              </Field>
            )}
          </div>

          {!readOnly && daftarTampil.length > 0 && periode && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-xs text-md-on-surface-variant">
                {tipePeriode === "mingguan"
                  ? "Isi gaji pokok karyawan harian dari absensi. Premi dibayar bulanan; lembur dibayar langsung."
                  : "Isi gaji dan premi dari absensi. Karyawan harian hanya dapat premi (gaji pokok sudah dibayar mingguan)."}
              </p>
              <div className="flex items-center gap-2">
                <button className={btnTonal} onClick={hitungOtomatis} disabled={sibuk === "hitung"}>
                  {sibuk === "hitung" ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                  Hitung otomatis
                </button>
              </div>
            </div>
          )}

          {karyawanAktif.length === 0 ? (
            <EmptyState label="Belum ada karyawan aktif." />
          ) : daftarTampil.length === 0 ? (
            <EmptyState label="Belum ada karyawan harian. Atur jenis karyawan di tab Pengaturan Gaji." />
          ) : !periode ? (
            <EmptyState label="Isi periode dengan benar untuk menyiapkan gaji." />
          ) : (
            <div className="overflow-x-auto bg-md-container-high rounded-md-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-md-on-surface-variant">
                    <th className="px-4 py-3">Karyawan</th>
                    {komponenTampil.map((c) => <th key={c.k} className="px-2 py-3 min-w-[9rem]">{c.l}</th>)}
                    <th className="px-2 py-3 min-w-[8rem]">Total</th>
                    <th className="px-2 py-3 min-w-[10rem]">Catatan</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarTampil.map((k) => {
                    const g = gajiPeriode.get(k.id);
                    const terkunci = readOnly || (g && g.status !== "draft");
                    const v = nilaiBaris(k.id);
                    return (
                      <tr key={k.id} className="border-t border-md-outline-variant align-middle">
                        <td className="px-4 py-2">
                          <div className="text-md-on-surface">{k.nama}</div>
                          <div className="text-[11px] text-md-on-surface-variant">{k.id_karyawan}</div>
                        </td>
                        {komponenTampil.map((c) => (
                          <td key={c.k} className="px-2 py-2">
                            {terkunci ? (
                              <span>{g ? fmtRp(angka(komponenDariGaji(g)[c.k])) : "—"}</span>
                            ) : (
                              <InputRupiah value={v[c.k]} onChange={(n) => ubahBaris(k.id, { [c.k]: n })} placeholder="0" />
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2 font-medium text-md-on-surface">
                          {terkunci ? (g ? fmtRp(g.nominal) : "—") : fmtRp(totalKomponen(v))}
                        </td>
                        <td className="px-2 py-2">
                          {terkunci ? (
                            <span className="text-md-on-surface-variant">{g?.catatan || "—"}</span>
                          ) : (
                            <input
                              value={v.catatan}
                              maxLength={500}
                              onChange={(e) => ubahBaris(k.id, { catatan: e.target.value })}
                              className={inputClass}
                              placeholder="Opsional"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {g ? <Badge color={STATUS_WARNA[g.status]}>{STATUS_LABEL[g.status]}</Badge> : <span className="text-md-on-surface-variant">Belum disiapkan</span>}
                        </td>
                        <td className="px-4 py-2">{g ? <AksiGaji g={g} /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-sm text-md-on-surface-variant">
              Total {periode ? labelPeriode(periode) : "—"}: <span className="text-md-on-surface font-medium">{fmtRp(totalDraft)}</span>
            </div>
            {!readOnly && (
              <button className={btnFilled} onClick={simpan} disabled={sibuk === "simpan" || barisTersimpan.length === 0}>
                {sibuk === "simpan" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan draft ({barisTersimpan.length})
              </button>
            )}
          </div>
          {!readOnly && !rekening && (
            <p className="text-xs text-md-on-surface-variant mt-2">
              Pilih rekening sumber sebelum menyerahkan gaji — tanpa rekening, gaji tidak bisa diserahkan.
            </p>
          )}
        </>
      )}

      {tab === "pengaturan" && (
        <PengaturanGaji
          key={ent}
          pw={pw}
          ent={ent}
          karyawan={karyawanAktif}
          readOnly={readOnly}
          showToast={showToast}
          onError={tanganiError}
        />
      )}

      {tab === "riwayat" && (
        <>
          <div className="max-w-xs">
            <Field label="Karyawan">
              <select value={filterKaryawan} onChange={(e) => setFilterKaryawan(e.target.value)} className={inputClass}>
                <option value="">Semua karyawan</option>
                {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama}{k.aktif ? "" : " (nonaktif)"}</option>)}
              </select>
            </Field>
          </div>
          {riwayat.length === 0 ? (
            <EmptyState label="Belum ada riwayat gaji." />
          ) : (
            <div className="overflow-x-auto bg-md-container-high rounded-md-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-md-on-surface-variant">
                    <th className="px-4 py-3">Periode</th>
                    <th className="px-2 py-3">Karyawan</th>
                    <th className="px-2 py-3">Nominal</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Diterima</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((g) => (
                    <tr key={g.id} className="border-t border-md-outline-variant align-middle">
                      <td className="px-4 py-2">{labelPeriode(g.periode)}</td>
                      <td className="px-2 py-2">
                        {peta.get(g.karyawan_id)?.nama || "—"}
                        {g.catatan && <div className="text-[11px] text-md-on-surface-variant">{g.catatan}</div>}
                      </td>
                      <td className="px-2 py-2">
                        {fmtRp(g.nominal)}
                        {g.gaji_pokok !== undefined && g.gaji_pokok !== null && (
                          <div className="text-[11px] text-md-on-surface-variant leading-snug">
                            {KOMPONEN.filter((c) => angka(g[c.k]) > 0).map((c) => `${c.l} ${fmtRp(g[c.k])}`).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2"><Badge color={STATUS_WARNA[g.status]}>{STATUS_LABEL[g.status]}</Badge></td>
                      <td className="px-2 py-2 text-md-on-surface-variant">
                        {g.diterima_pada ? `${fmtWaktu(g.diterima_pada)} (${g.cara_diterima === "admin" ? "oleh admin" : "scan QR"})` : "—"}
                      </td>
                      <td className="px-4 py-2"><AksiGaji g={g} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {qr && <ModalQr data={qr} onClose={() => setQr(null)} />}
    </div>
  );
}

function ModalQr({ data, onClose }) {
  const [gambar, setGambar] = useState(null);
  const [mengunduh, setMengunduh] = useState(false);
  const unduh = async () => {
    setMengunduh(true);
    try { await unduhGambarQr(data); } finally { setMengunduh(false); }
  };
  useEffect(() => {
    QRCode.toDataURL(data.token, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then(setGambar)
      .catch(() => setGambar(null));
  }, [data.token]);
  const kedaluwarsa = sudahKedaluwarsa(data.kedaluwarsa);

  return (
    <ModalShell title="QR Gaji" onClose={onClose}>
      <div className="text-center">
        <div className="text-md-on-surface font-medium">{data.nama}</div>
        <div className="text-xs text-md-on-surface-variant mb-3">
          {labelPeriode(data.periode)} · {fmtRp(data.nominal)}
        </div>
        {gambar ? (
          <img src={gambar} alt="QR gaji" className="mx-auto rounded-md-lg bg-white p-1 w-64 h-64" />
        ) : (
          <div className="mx-auto w-64 h-64 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
        )}
        <div className={`text-xs mt-3 ${kedaluwarsa ? "text-red-400" : "text-md-on-surface-variant"}`}>
          {kedaluwarsa ? "QR sudah kedaluwarsa — buat QR baru." : `Berlaku sampai ${fmtWaktu(data.kedaluwarsa)}`}
        </div>
        <p className="text-[11px] text-md-on-surface-variant mt-2">
          Minta karyawan memindai QR ini dari halaman absen di HP-nya. Jangan kirim QR ke orang lain.
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <button className={btnFilled} onClick={unduh} disabled={!gambar || mengunduh}>
            {mengunduh ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Unduh QR
          </button>
          <button className={btnOutlined} onClick={onClose}>Tutup</button>
        </div>
      </div>
    </ModalShell>
  );
}