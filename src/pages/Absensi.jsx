import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, KeyRound, Ban, CheckCircle2, Download, Save, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState, StatCard, Field, inputClass, Badge, InputTanggal, formatTanggalID } from "../components/ui";
import { downloadCsv } from "../lib/api";
import {
  listKaryawan,
  tambahKaryawan,
  resetPasswordKaryawan,
  setAktifKaryawan,
  hapusKaryawan,
  listAbsensi,
  hapusAbsensiHarian,
  rekapHarianAbsensi,
  rekapBulananAbsensi,
  rekapMingguanAbsensi,
  geserTanggal,
  NAMA_HARI,
  getAbsensiSettings,
  updateAbsensiSettings,
} from "../lib/absensi";

export default function Absensi({ sub, showToast }) {
  const s = sub || "rekap";
  return (
    <div>
      <PageHeader
        title="Absensi"
        description="Kelola absen karyawan — rekap kehadiran, data akun karyawan, dan pengaturan lokasi kantor."
      />
      {s === "rekap" && <RekapAbsensi showToast={showToast} />}
      {s === "karyawan" && <DataKaryawan showToast={showToast} />}
      {s === "pengaturan" && <PengaturanAbsensi showToast={showToast} />}
    </div>
  );
}

// =========================================================
// REKAP (Harian & Bulanan) — dihitung dinamis dari data mentah.
// =========================================================
function RekapAbsensi({ showToast }) {
  const [mode, setMode] = useState("harian"); // harian | mingguan | bulanan
  const [rows, setRows] = useState(null);
  const [karyawanList, setKaryawanList] = useState(null);
  const [q, setQ] = useState("");
  const [tglAcuan, setTglAcuan] = useState(new Date().toISOString().slice(0, 10)); // dipakai mode mingguan

  const load = async () => {
    try {
      const [raw, kar] = await Promise.all([listAbsensi(), listKaryawan()]);
      setRows(raw);
      setKaryawanList(kar);
    } catch (e) {
      showToast?.(e.message || "Gagal memuat data absensi", "err");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rekapHarian = useMemo(() => rekapHarianAbsensi(rows || []), [rows]);
  const rekapBulanan = useMemo(() => rekapBulananAbsensi(rekapHarian), [rekapHarian]);
  const rekapMingguan = useMemo(
    () => rekapMingguanAbsensi(rekapHarian, tglAcuan, karyawanList || []),
    [rekapHarian, tglAcuan, karyawanList]
  );

  const data = mode === "harian" ? rekapHarian : mode === "bulanan" ? rekapBulanan : rekapMingguan.data;
  const filtered = q
    ? data.filter((r) => r.nama.toLowerCase().includes(q.toLowerCase()))
    : data;

  const hariIniStr = new Date().toISOString().slice(0, 10);
  const hadirHariIni = rekapHarian.filter((r) => r.tanggal === hariIniStr && r.masuk).length;
  const telatHariIni = rekapHarian.filter((r) => r.tanggal === hariIniStr && r.telatMenit > 0).length;

  const geserMinggu = (arah) => setTglAcuan((t) => geserTanggal(t, arah * 7));

  const hapusHarian = async (r) => {
    if (
      !confirm(
        `Hapus absen "${r.nama}" tanggal ${r.tanggal}? Ini akan menghapus data Masuk & Pulang hari itu, dan otomatis mengurangi rekap mingguan/bulanan yang terkait.`
      )
    )
      return;
    try {
      await hapusAbsensiHarian(r.idKaryawan, r.tanggal);
      showToast?.("Data absen dihapus.");
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus data absen", "err");
    }
  };

  const unduh = () => {
    if (mode === "harian") {
      downloadCsv(
        `rekap-absensi-harian-${hariIniStr}.csv`,
        [
          { key: "tanggal", label: "Tanggal" },
          { key: "nama", label: "Nama" },
          { key: "masuk", label: "Jam Masuk" },
          { key: "telatMenit", label: "Telat (menit)" },
          { key: "pulang", label: "Jam Pulang" },
          { key: "lemburJam", label: "Lembur (jam)" },
          { key: "jamKerja", label: "Jam Kerja" },
          { key: "status", label: "Status" },
        ],
        filtered
      );
    } else if (mode === "bulanan") {
      downloadCsv(
        `rekap-absensi-bulanan-${hariIniStr}.csv`,
        [
          { key: "bulan", label: "Bulan" },
          { key: "nama", label: "Nama" },
          { key: "hariMasuk", label: "Total Hari Masuk" },
          { key: "hariTelat", label: "Total Hari Telat" },
          { key: "totalTelatMenit", label: "Total Telat (menit)" },
          { key: "totalLemburJam", label: "Total Lembur (jam)" },
          { key: "totalJamKerja", label: "Total Jam Kerja" },
        ],
        filtered
      );
    } else {
      const kolomHari = rekapMingguan.tanggalMinggu.map((tgl, i) => ({
        key: tgl,
        label: `${NAMA_HARI[i]} (${tgl.slice(8, 10)}/${tgl.slice(5, 7)})`,
      }));
      const baris = filtered.map((p) => {
        const row = { nama: p.nama };
        rekapMingguan.tanggalMinggu.forEach((tgl) => {
          const r = p.hari[tgl];
          if (!r) row[tgl] = "";
          else if (!r.masuk) row[tgl] = "Tidak Absen";
          else {
            let s = r.masuk;
            if (r.telatMenit > 0) s += ` (Telat ${r.telatMenit}m)`;
            if (r.lemburJam > 0) s += ` (Lembur ${r.lemburJam}j)`;
            row[tgl] = s;
          }
        });
        return row;
      });
      downloadCsv(
        `rekap-absensi-mingguan-${rekapMingguan.senin}.csv`,
        [{ key: "nama", label: "Nama" }, ...kolomHari],
        baris
      );
    }
  };

  if (rows === null) {
    return <div className="py-16 text-center text-slate-500 text-sm">Memuat data…</div>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Karyawan Hadir Hari Ini" value={hadirHariIni} accent="text-emerald-400" />
        <StatCard label="Telat Hari Ini" value={telatHariIni} accent="text-amber-400" />
        <StatCard label="Total Baris Absen" value={(rows || []).length} accent="text-slate-200" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setMode("harian")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${mode === "harian" ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}
          >
            Rekap Harian
          </button>
          <button
            onClick={() => setMode("mingguan")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${mode === "mingguan" ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}
          >
            Rekap Mingguan
          </button>
          <button
            onClick={() => setMode("bulanan")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md ${mode === "bulanan" ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}
          >
            Rekap Bulanan
          </button>
        </div>
        <input
          placeholder="Cari nama karyawan…"
          className={`${inputClass} max-w-xs`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={unduh}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg"
        >
          <Download size={14} /> Unduh CSV
        </button>
      </div>

      {mode === "mingguan" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => geserMinggu(-1)}
            title="Minggu sebelumnya"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="w-40">
            <InputTanggal value={tglAcuan} onChange={setTglAcuan} />
          </div>
          <button
            onClick={() => geserMinggu(1)}
            title="Minggu berikutnya"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700"
          >
            <ChevronRight size={15} />
          </button>
          <span className="text-xs text-slate-400">
            Minggu {formatTanggalID(rekapMingguan.tanggalMinggu[0])} – {formatTanggalID(rekapMingguan.tanggalMinggu[6])}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState label={mode === "mingguan" ? "Belum ada karyawan aktif." : "Belum ada data absensi."} />
      ) : mode === "mingguan" ? (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium sticky left-0 bg-slate-900/70">Nama</th>
                {rekapMingguan.tanggalMinggu.map((tgl, i) => (
                  <th key={tgl} className="text-center px-2 py-2.5 font-medium whitespace-nowrap">
                    <div>{NAMA_HARI[i]}</div>
                    <div className="text-slate-500 font-normal">{tgl.slice(8, 10)}/{tgl.slice(5, 7)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.idKaryawan} className="border-t border-slate-800/70">
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap sticky left-0 bg-slate-950">{p.nama}</td>
                  {rekapMingguan.tanggalMinggu.map((tgl) => {
                    const r = p.hari[tgl];
                    return (
                      <td key={tgl} className="px-2 py-2.5 text-center">
                        {!r ? (
                          <span className="text-slate-600">—</span>
                        ) : !r.masuk ? (
                          <Badge color="slate">Tidak Absen</Badge>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={r.telatMenit > 0 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                              {r.masuk}
                            </span>
                            {r.telatMenit > 0 && <span className="text-[10px] text-amber-500">Telat {r.telatMenit}m</span>}
                            {r.lemburJam > 0 && <span className="text-[10px] text-sky-400">Lembur {r.lemburJam}j</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : mode === "harian" ? (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Tanggal</th>
                <th className="text-left px-3 py-2.5 font-medium">Nama</th>
                <th className="text-left px-3 py-2.5 font-medium">Masuk</th>
                <th className="text-left px-3 py-2.5 font-medium">Pulang</th>
                <th className="text-left px-3 py-2.5 font-medium">Jam Kerja</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-3 py-2.5 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-slate-800/70">
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.tanggal}</td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="px-3 py-2.5">{r.masuk || "—"}</td>
                  <td className="px-3 py-2.5">{r.pulang || "—"}</td>
                  <td className="px-3 py-2.5">{r.jamKerja || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={r.status === "Normal" ? "emerald" : r.status.includes("Tidak Absen") ? "slate" : "amber"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      title="Hapus data absen hari ini"
                      onClick={() => hapusHarian(r)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Bulan</th>
                <th className="text-left px-3 py-2.5 font-medium">Nama</th>
                <th className="text-left px-3 py-2.5 font-medium">Hari Masuk</th>
                <th className="text-left px-3 py-2.5 font-medium">Hari Telat</th>
                <th className="text-left px-3 py-2.5 font-medium">Total Telat</th>
                <th className="text-left px-3 py-2.5 font-medium">Total Lembur</th>
                <th className="text-left px-3 py-2.5 font-medium">Total Jam Kerja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-slate-800/70">
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.bulan}</td>
                  <td className="px-3 py-2.5">{r.nama}</td>
                  <td className="px-3 py-2.5">{r.hariMasuk}</td>
                  <td className="px-3 py-2.5">{r.hariTelat}</td>
                  <td className="px-3 py-2.5">{r.totalTelatMenit} menit</td>
                  <td className="px-3 py-2.5">{r.totalLemburJam} jam</td>
                  <td className="px-3 py-2.5">{r.totalJamKerja} jam</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =========================================================
// DATA KARYAWAN — kelola akun absen (terpisah dari akun login SELMA).
// =========================================================
function DataKaryawan({ showToast }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ id_karyawan: "", nama: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null); // {id, nama, value}

  const load = async () => {
    try {
      setList(await listKaryawan());
    } catch (e) {
      showToast?.(e.message || "Gagal memuat data karyawan", "err");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const tambah = async (e) => {
    e.preventDefault();
    if (!form.id_karyawan.trim() || !form.nama.trim() || !form.password) {
      showToast?.("ID Karyawan, nama, dan password wajib diisi", "err");
      return;
    }
    setSaving(true);
    try {
      await tambahKaryawan(form);
      setForm({ id_karyawan: "", nama: "", password: "" });
      showToast?.("Karyawan berhasil ditambahkan.");
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal menambah karyawan", "err");
    } finally {
      setSaving(false);
    }
  };

  const toggleAktif = async (k) => {
    try {
      await setAktifKaryawan(k.id, !k.aktif);
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal mengubah status", "err");
    }
  };

  const hapus = async (k) => {
    if (!confirm(`Hapus akun karyawan "${k.nama}"? Seluruh riwayat absennya juga akan ikut terhapus permanen.`)) return;
    try {
      await hapusKaryawan(k.id);
      showToast?.("Karyawan dihapus.");
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
    }
  };

  const simpanReset = async () => {
    if (!resetFor?.value || resetFor.value.trim().length < 4) {
      showToast?.("Password baru minimal 4 karakter", "err");
      return;
    }
    try {
      await resetPasswordKaryawan(resetFor.id, resetFor.value.trim());
      showToast?.(`Password ${resetFor.nama} berhasil direset.`);
      setResetFor(null);
    } catch (e) {
      showToast?.(e.message || "Gagal reset password", "err");
    }
  };

  return (
    <div>
      <form onSubmit={tambah} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-5">
        <div className="text-sm font-semibold mb-3">Tambah Karyawan</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="ID Karyawan">
            <input className={inputClass} value={form.id_karyawan} onChange={(e) => setForm((f) => ({ ...f, id_karyawan: e.target.value }))} />
          </Field>
          <Field label="Nama">
            <input className={inputClass} value={form.nama} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} />
          </Field>
          <Field label="Password Awal">
            <input className={inputClass} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>
        </div>
        <button
          disabled={saving}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 px-3.5 py-2 rounded-lg"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Tambah
        </button>
      </form>

      {list === null ? (
        <div className="py-10 text-center text-slate-500 text-sm">Memuat…</div>
      ) : list.length === 0 ? (
        <EmptyState label="Belum ada karyawan terdaftar." />
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">ID Karyawan</th>
                <th className="text-left px-3 py-2.5 font-medium">Nama</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-right px-3 py-2.5 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map((k) => (
                <tr key={k.id} className="border-t border-slate-800/70">
                  <td className="px-3 py-2.5 font-mono text-xs">{k.id_karyawan}</td>
                  <td className="px-3 py-2.5">{k.nama}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={k.aktif ? "emerald" : "slate"}>{k.aktif ? "Aktif" : "Nonaktif"}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        title="Reset Password"
                        onClick={() => setResetFor({ id: k.id, nama: k.nama, value: "" })}
                        className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        title={k.aktif ? "Nonaktifkan" : "Aktifkan"}
                        onClick={() => toggleAktif(k)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                      >
                        {k.aktif ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                      </button>
                      <button
                        title="Hapus"
                        onClick={() => hapus(k)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5">
            <div className="text-sm font-semibold mb-3">Reset Password — {resetFor.nama}</div>
            <input
              autoFocus
              placeholder="Password baru (min. 4 karakter)"
              className={inputClass}
              value={resetFor.value}
              onChange={(e) => setResetFor((r) => ({ ...r, value: e.target.value }))}
            />
            <div className="flex gap-2 mt-3.5">
              <button onClick={simpanReset} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold py-2 rounded-lg">
                Simpan
              </button>
              <button onClick={() => setResetFor(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// PENGATURAN — lokasi kantor, radius, jam standar (dulu hardcode di GAS).
// =========================================================
function PengaturanAbsensi({ showToast }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAbsensiSettings().then(setForm).catch((e) => showToast?.(e.message || "Gagal memuat pengaturan", "err"));
  }, []);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const ambilLokasiSaatIni = () => {
    if (!navigator.geolocation) return showToast?.("Perangkat tidak mendukung GPS.", "err");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("office_lat", pos.coords.latitude);
        set("office_lng", pos.coords.longitude);
        showToast?.("Koordinat diisi dari lokasi Anda saat ini.");
      },
      (err) => showToast?.("Gagal mengambil lokasi: " + err.message, "err")
    );
  };

  const simpan = async () => {
    setSaving(true);
    try {
      await updateAbsensiSettings({
        office_lat: Number(form.office_lat),
        office_lng: Number(form.office_lng),
        radius_meter: Number(form.radius_meter),
        jam_masuk_standar: form.jam_masuk_standar,
        jam_pulang_standar: form.jam_pulang_standar,
        toleransi_telat_menit: Number(form.toleransi_telat_menit),
        min_lembur_menit: Number(form.min_lembur_menit),
      });
      showToast?.("Pengaturan absensi disimpan.");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan pengaturan", "err");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="py-10 text-center text-slate-500 text-sm">Memuat…</div>;

  return (
    <div className="max-w-xl bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude Kantor">
          <input className={inputClass} value={form.office_lat} onChange={(e) => set("office_lat", e.target.value)} />
        </Field>
        <Field label="Longitude Kantor">
          <input className={inputClass} value={form.office_lng} onChange={(e) => set("office_lng", e.target.value)} />
        </Field>
      </div>
      <button
        onClick={ambilLokasiSaatIni}
        className="text-xs font-semibold text-amber-400 hover:text-amber-300"
      >
        Pakai lokasi HP saya sekarang
      </button>

      <Field label="Radius Toleransi (meter)">
        <input className={inputClass} value={form.radius_meter} onChange={(e) => set("radius_meter", e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Jam Masuk Standar">
          <input className={inputClass} value={form.jam_masuk_standar} onChange={(e) => set("jam_masuk_standar", e.target.value)} />
        </Field>
        <Field label="Jam Pulang Standar">
          <input className={inputClass} value={form.jam_pulang_standar} onChange={(e) => set("jam_pulang_standar", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Toleransi Telat (menit)">
          <input className={inputClass} value={form.toleransi_telat_menit} onChange={(e) => set("toleransi_telat_menit", e.target.value)} />
        </Field>
        <Field label="Minimal Lembur (menit)">
          <input className={inputClass} value={form.min_lembur_menit} onChange={(e) => set("min_lembur_menit", e.target.value)} />
        </Field>
      </div>

      <button
        onClick={simpan}
        disabled={saving}
        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm px-4 py-2.5 rounded-lg"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan Pengaturan
      </button>
    </div>
  );
}