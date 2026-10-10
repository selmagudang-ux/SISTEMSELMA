import { useState, useEffect, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { Lock, Save, Loader2, QrCode, Ban, Trash2, CheckCircle2, RefreshCw } from "lucide-react";
import {
  PageHeader, EmptyState, Badge, Field, ModalShell, InputRupiah,
  inputClass, btnFilled, btnTonal, btnOutlined, btnText,
} from "../components/ui";
import {
  fmtRp, cekPasswordAdmin, daftarGaji, simpanDraftGaji, serahkanGaji,
  batalkanGaji, hapusGaji, tandaiGajiDiterimaAdmin,
} from "../lib/api";
import { listKaryawan } from "../lib/absensi";

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
function fmtWaktu(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}
const sudahKedaluwarsa = (iso) => !!iso && new Date(iso).getTime() < Date.now();

export default function Penggajian({ session, master, showToast }) {
  const readOnly = session?.role === "owner"; // owner hanya melihat
  const rekeningList = master?.rekening || [];

  // Password admin hanya disimpan di memori halaman ini (hilang saat pindah menu / refresh).
  const [pw, setPw] = useState(null);
  const [pwInput, setPwInput] = useState("");
  const [membuka, setMembuka] = useState(false);

  const [tab, setTab] = useState("siapkan");
  const [karyawan, setKaryawan] = useState([]);
  const [gaji, setGaji] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [sibuk, setSibuk] = useState(null); // id gaji / "simpan" yang sedang diproses

  const [tipePeriode, setTipePeriode] = useState("bulan"); // bulan | tanggal | rentang
  const [bulan, setBulan] = useState(hariIni().slice(0, 7));
  const [tanggal, setTanggal] = useState(hariIni());
  const [dari, setDari] = useState(hariIni().slice(0, 8) + "01");
  const [sampai, setSampai] = useState(hariIni());
  const rentangValid = ISO_TGL.test(dari) && ISO_TGL.test(sampai) && dari <= sampai;
  // String periode yang dikirim ke server; "" = isian belum valid.
  const periode =
    tipePeriode === "bulan" ? (ISO_BULAN.test(bulan) ? bulan : "")
    : tipePeriode === "tanggal" ? (ISO_TGL.test(tanggal) ? tanggal : "")
    : rentangValid ? `${dari}_${sampai}` : "";
  const [edit, setEdit] = useState({}); // { [karyawan_id]: { nominal, catatan } } — hanya baris yang diubah user
  const [rekening, setRekening] = useState("");
  const [berlaku, setBerlaku] = useState(1440);
  const [filterKaryawan, setFilterKaryawan] = useState("");
  const [qr, setQr] = useState(null); // { nama, periode, nominal, token, kedaluwarsa }

  const peta = useMemo(() => new Map(karyawan.map((k) => [k.id, k])), [karyawan]);
  const karyawanAktif = useMemo(() => karyawan.filter((k) => k.aktif), [karyawan]);

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
      const [g, k] = await Promise.all([daftarGaji(kata), listKaryawan(true)]);
      setGaji(g || []);
      setKaryawan(k || []);
    } catch (e) {
      tanganiError(e, "Gagal memuat data gaji.");
    } finally {
      setMemuat(false);
    }
  }, [pw, tanganiError]);

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
    return g?.status === "draft" ? { nominal: g.nominal, catatan: g.catatan || "" } : { nominal: "", catatan: "" };
  };
  const ubahBaris = (kid, patch) => setEdit((p) => ({ ...p, [kid]: { ...nilaiBaris(kid), ...patch } }));

  const barisTersimpan = !periode ? [] : karyawanAktif.filter((k) => {
    const g = gajiPeriode.get(k.id);
    return edit[k.id] && (!g || g.status === "draft") && Number(edit[k.id].nominal) > 0;
  });

  const simpan = async () => {
    if (barisTersimpan.length === 0) {
      showToast?.("Belum ada nominal yang diisi/diubah.", "err");
      return;
    }
    setSibuk("simpan");
    try {
      const baris = barisTersimpan.map((k) => ({
        karyawan_id: k.id,
        periode,
        nominal: Number(edit[k.id].nominal),
        catatan: edit[k.id].catatan || null,
        rekening_sumber: rekening || null,
      }));
      const hasil = await simpanDraftGaji(pw, baris);
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

  const bukaQr = (g, token, kedaluwarsa) =>
    setQr({ nama: peta.get(g.karyawan_id)?.nama || "—", periode: g.periode, nominal: g.nominal, token, kedaluwarsa });

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

  const totalDraft = karyawanAktif.reduce((s, k) => s + (Number(nilaiBaris(k.id).nominal) || 0), 0);
  const riwayat = gaji.filter((g) => !filterKaryawan || g.karyawan_id === filterKaryawan);

  return (
    <div>
      <PageHeader
        title="Penggajian"
        description={readOnly ? "Mode lihat saja (Owner)." : "Siapkan gaji, serahkan lewat QR, karyawan memindai dari HP."}
        action={
          <button className={btnOutlined} onClick={() => muat()} disabled={memuat}>
            <RefreshCw size={14} className={memuat ? "animate-spin" : ""} /> Muat ulang
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        <button className={tab === "siapkan" ? btnFilled : btnOutlined} onClick={() => setTab("siapkan")}>Siapkan Gaji</button>
        <button className={tab === "riwayat" ? btnFilled : btnOutlined} onClick={() => setTab("riwayat")}>Riwayat</button>
      </div>

      {tab === "siapkan" && (
        <>
          <div className="mb-3">
            <div className="text-xs text-md-on-surface-variant mb-1">Periode gaji</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {[["bulan", "Per bulan"], ["tanggal", "Per tanggal"], ["rentang", "Per rentang tanggal"]].map(([k, l]) => (
                <button key={k} className={tipePeriode === k ? btnFilled : btnOutlined} onClick={() => setTipePeriode(k)}>{l}</button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {tipePeriode === "bulan" && (
                <Field label="Bulan">
                  <input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} className={inputClass} />
                </Field>
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
            {periode && <p className="text-xs text-md-on-surface-variant">Periode terpilih: {labelPeriode(periode)}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <Field label="Rekening sumber (dipakai untuk semua baris yang disimpan)">
              <select value={rekening} onChange={(e) => setRekening(e.target.value)} className={inputClass} disabled={readOnly}>
                <option value="">— pilih rekening —</option>
                {rekeningList.map((r) => <option key={r.kode} value={r.kode}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Masa berlaku QR">
              <select value={berlaku} onChange={(e) => setBerlaku(Number(e.target.value))} className={inputClass} disabled={readOnly}>
                {BERLAKU.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </Field>
          </div>

          {karyawanAktif.length === 0 ? (
            <EmptyState label="Belum ada karyawan aktif." />
          ) : !periode ? (
            <EmptyState label="Isi periode dengan benar untuk menyiapkan gaji." />
          ) : (
            <div className="overflow-x-auto bg-md-container-high rounded-md-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-md-on-surface-variant">
                    <th className="px-4 py-3">Karyawan</th>
                    <th className="px-2 py-3 w-44">Nominal</th>
                    <th className="px-2 py-3">Catatan</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {karyawanAktif.map((k) => {
                    const g = gajiPeriode.get(k.id);
                    const terkunci = readOnly || (g && g.status !== "draft");
                    const v = nilaiBaris(k.id);
                    return (
                      <tr key={k.id} className="border-t border-md-outline-variant align-middle">
                        <td className="px-4 py-2">
                          <div className="text-md-on-surface">{k.nama}</div>
                          <div className="text-[11px] text-md-on-surface-variant">{k.id_karyawan}</div>
                        </td>
                        <td className="px-2 py-2">
                          {terkunci ? (
                            <span>{g ? fmtRp(g.nominal) : "—"}</span>
                          ) : (
                            <InputRupiah value={v.nominal} onChange={(n) => ubahBaris(k.id, { nominal: n })} placeholder="0" />
                          )}
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
                      <td className="px-2 py-2">{fmtRp(g.nominal)}</td>
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
        <button className={btnFilled + " mt-4"} onClick={onClose}>Tutup</button>
      </div>
    </ModalShell>
  );
}