import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, KeyRound, Ban, CheckCircle2, Download, Save, Loader2, ChevronLeft, ChevronRight, Pencil, Stethoscope } from "lucide-react";
import { PageHeader, EmptyState, StatCard, Field, inputClass, Badge, InputTanggal, formatTanggalID } from "../components/ui";
import { downloadCsv } from "../lib/api";
import {
  listKaryawan,
  tambahKaryawan,
  resetPasswordKaryawan,
  setAktifKaryawan,
  hapusKaryawan,
  updateNamaKaryawan,
  listAbsensi,
  hapusAbsensiHarian,
  simpanAbsensiManual,
  rekapHarianAbsensi,
  rekapBulananAbsensi,
  rekapMingguanAbsensi,
  geserTanggal,
  NAMA_HARI,
  getAbsensiSettings,
  updateAbsensiSettings,
  daftarShift,
} from "../lib/absensi";

// Hanya superadmin & owner yang boleh: (1) mengedit/menandai absensi manual
// (Sakit/Izin/Libur) untuk karyawan yang tidak absen, dan (2) mengubah nama data
// karyawan. Role lain yang mungkin nanti dibuka aksesnya ke menu Absensi
// tetap hanya bisa LIHAT, tidak bisa mengedit kedua hal ini.
const ROLE_BOLEH_EDIT = ["superadmin", "owner"];

// Warna badge untuk tiap status absensi manual.
function warnaManual(tipe) {
  if (tipe === "Sakit") return "pink";
  if (tipe === "Izin") return "amber";
  if (tipe === "Libur") return "sky";
  return "slate";
}

export default function Absensi({ sub, showToast, session }) {
  const s = sub || "rekap";
  const role = session?.role;
  return (
    <div>
      <PageHeader
        title="Absensi"
        description="Kelola absen karyawan — rekap kehadiran, data akun karyawan, dan pengaturan lokasi kantor."
      />
      {s === "rekap" && <RekapAbsensi showToast={showToast} role={role} />}
      {s === "karyawan" && <DataKaryawan showToast={showToast} role={role} />}
      {s === "pengaturan" && <PengaturanAbsensi showToast={showToast} />}
    </div>
  );
}

// =========================================================
// REKAP (Harian & Bulanan) — dihitung dinamis dari data mentah.
// =========================================================
function RekapAbsensi({ showToast, role }) {
  const bolehEdit = ROLE_BOLEH_EDIT.includes(role);
  const [mode, setMode] = useState("harian"); // harian | mingguan | bulanan
  const [rows, setRows] = useState(null);
  const [karyawanList, setKaryawanList] = useState(null);
  const [q, setQ] = useState("");
  const [tglAcuan, setTglAcuan] = useState(new Date().toISOString().slice(0, 10)); // dipakai mode mingguan
  const [manualFor, setManualFor] = useState(null); // {idKaryawan, karyawanId, nama, tanggal, tipe, keterangan}
  const [savingManual, setSavingManual] = useState(false);

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

  // Buka modal Sakit/Izin/Libur — dari baris rekap yang sudah ada (tombol pensil)
  // atau dari sel "Tidak Absen" di rekap mingguan, atau dari tombol "+"
  // untuk karyawan yang belum punya baris sama sekali di tanggal itu.
  const bukaManual = ({ idKaryawan, nama, tanggal, tipeAwal, keteranganAwal, existing }) => {
    const k = (karyawanList || []).find((x) => x.id_karyawan === idKaryawan);
    setManualFor({
      idKaryawan,
      karyawanId: k?.id || null,
      nama,
      tanggal: tanggal || new Date().toISOString().slice(0, 10),
      tipe: tipeAwal || "Sakit",
      keterangan: keteranganAwal || "",
      existing: !!existing,
    });
  };

  const simpanManual = async () => {
    if (!manualFor?.idKaryawan || !manualFor?.tanggal) {
      showToast?.("Pilih karyawan dan tanggal dulu", "err");
      return;
    }
    setSavingManual(true);
    try {
      await simpanAbsensiManual({
        karyawanId: manualFor.karyawanId,
        idKaryawan: manualFor.idKaryawan,
        nama: manualFor.nama,
        tanggal: manualFor.tanggal,
        tipe: manualFor.tipe,
        keterangan: manualFor.keterangan,
      });
      showToast?.(`Absensi ${manualFor.nama} tanggal ${manualFor.tanggal} ditandai ${manualFor.tipe}.`);
      setManualFor(null);
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan absensi manual", "err");
    } finally {
      setSavingManual(false);
    }
  };

  const hapusManual = async () => {
    if (!manualFor?.idKaryawan || !manualFor?.tanggal) return;
    if (
      !confirm(
        `Hapus data absen "${manualFor.nama}" tanggal ${manualFor.tanggal}? Ini menghapus baris absen (baik itu tanda Sakit/Izin/Libur, maupun absen Masuk/Pulang asli) pada tanggal tsb.`
      )
    )
      return;
    setSavingManual(true);
    try {
      await hapusAbsensiHarian(manualFor.idKaryawan, manualFor.tanggal);
      showToast?.("Tanda dihapus.");
      setManualFor(null);
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
    } finally {
      setSavingManual(false);
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
          { key: "hariSakit", label: "Total Hari Sakit" },
          { key: "hariIzin", label: "Total Hari Izin" },
          { key: "hariLibur", label: "Total Hari Libur" },
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
        {bolehEdit && (
          <button
            onClick={() => bukaManual({ idKaryawan: "", nama: "", tanggal: new Date().toISOString().slice(0, 10) })}
            className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg"
          >
            <Stethoscope size={14} /> Tandai Sakit/Izin/Libur
          </button>
        )}
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
                    const bukaDariSel = (tipeAwal) =>
                      bukaManual({
                        idKaryawan: p.idKaryawan,
                        nama: p.nama,
                        tanggal: tgl,
                        tipeAwal: r?.manual || tipeAwal,
                        keteranganAwal: r?.keteranganManual || "",
                        existing: !!r,
                      });
                    return (
                      <td key={tgl} className="px-2 py-2.5 text-center">
                        {!r ? (
                          bolehEdit ? (
                            <button
                              title="Tandai Sakit/Izin/Libur"
                              onClick={() => bukaDariSel("Sakit")}
                              className="text-slate-600 hover:text-amber-400 text-xs"
                            >
                              —
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )
                        ) : r.manual ? (
                          bolehEdit ? (
                            <button onClick={() => bukaDariSel(r.manual)}>
                              <Badge color={warnaManual(r.manual)}>{r.manual}</Badge>
                            </button>
                          ) : (
                            <Badge color={warnaManual(r.manual)}>{r.manual}</Badge>
                          )
                        ) : !r.masuk ? (
                          bolehEdit ? (
                            <button onClick={() => bukaDariSel("Sakit")}>
                              <Badge color="slate">Tidak Absen</Badge>
                            </button>
                          ) : (
                            <Badge color="slate">Tidak Absen</Badge>
                          )
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
                    <Badge
                      color={
                        r.manual ? warnaManual(r.manual) :
                        r.status === "Normal" ? "emerald" : r.status.includes("Tidak Absen") ? "slate" : "amber"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {bolehEdit && (
                        <button
                          title="Tandai/ubah Sakit, Izin, atau Libur"
                          onClick={() =>
                            bukaManual({
                              idKaryawan: r.idKaryawan,
                              nama: r.nama,
                              tanggal: r.tanggal,
                              tipeAwal: r.manual || "Sakit",
                              keteranganAwal: r.keteranganManual || "",
                              existing: true,
                            })
                          }
                          className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        title="Hapus data absen hari ini"
                        onClick={() => hapusHarian(r)}
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
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Bulan</th>
                <th className="text-left px-3 py-2.5 font-medium">Nama</th>
                <th className="text-left px-3 py-2.5 font-medium">Hari Masuk</th>
                <th className="text-left px-3 py-2.5 font-medium">Sakit</th>
                <th className="text-left px-3 py-2.5 font-medium">Izin</th>
                <th className="text-left px-3 py-2.5 font-medium">Libur</th>
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
                  <td className="px-3 py-2.5">{r.hariSakit}</td>
                  <td className="px-3 py-2.5">{r.hariIzin}</td>
                  <td className="px-3 py-2.5">{r.hariLibur}</td>
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

      {manualFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5">
            <div className="text-sm font-semibold mb-3">Tandai Sakit / Izin / Libur</div>
            <div className="space-y-3">
              {manualFor.idKaryawan ? (
                <Field label="Karyawan">
                  <div className={`${inputClass} bg-slate-800/60 text-slate-300`}>{manualFor.nama}</div>
                </Field>
              ) : (
                <Field label="Karyawan">
                  <select
                    className={inputClass}
                    value={manualFor.idKaryawan}
                    onChange={(e) => {
                      const k = (karyawanList || []).find((x) => x.id_karyawan === e.target.value);
                      setManualFor((f) => ({ ...f, idKaryawan: e.target.value, karyawanId: k?.id || null, nama: k?.nama || "" }));
                    }}
                  >
                    <option value="">— Pilih karyawan —</option>
                    {(karyawanList || []).filter((k) => k.aktif).map((k) => (
                      <option key={k.id} value={k.id_karyawan}>{k.nama}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Tanggal">
                <InputTanggal
                  value={manualFor.tanggal}
                  onChange={(v) => setManualFor((f) => ({ ...f, tanggal: v }))}
                />
              </Field>
              <Field label="Status">
                <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
                  {["Sakit", "Izin", "Libur"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setManualFor((f) => ({ ...f, tipe: t }))}
                      className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md ${manualFor.tipe === t ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Catatan (opsional)">
                <input
                  className={inputClass}
                  placeholder="mis. Surat dokter, keperluan keluarga, dll."
                  value={manualFor.keterangan}
                  onChange={(e) => setManualFor((f) => ({ ...f, keterangan: e.target.value }))}
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                disabled={savingManual}
                onClick={simpanManual}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-semibold py-2 rounded-lg"
              >
                {savingManual ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
              </button>
              <button onClick={() => setManualFor(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg">
                Batal
              </button>
            </div>
            {manualFor.existing && (
              <button
                disabled={savingManual}
                onClick={hapusManual}
                className="w-full mt-2 text-xs font-semibold text-red-400 hover:text-red-300 py-1.5"
              >
                Hapus tanda ini
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// DATA KARYAWAN — kelola akun absen (terpisah dari akun login SELMA).
// =========================================================
function DataKaryawan({ showToast, role }) {
  const bolehEditNama = ROLE_BOLEH_EDIT.includes(role);
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ id_karyawan: "", nama: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null); // {id, nama, value}
  const [editNamaFor, setEditNamaFor] = useState(null); // {id, nama, value}
  const [savingNama, setSavingNama] = useState(false);

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

  const simpanEditNama = async () => {
    if (!editNamaFor?.value?.trim()) {
      showToast?.("Nama tidak boleh kosong", "err");
      return;
    }
    setSavingNama(true);
    try {
      await updateNamaKaryawan(editNamaFor.id, editNamaFor.value.trim());
      showToast?.(`Nama berhasil diubah menjadi "${editNamaFor.value.trim()}".`);
      setEditNamaFor(null);
      load();
    } catch (e) {
      showToast?.(e.message || "Gagal mengubah nama", "err");
    } finally {
      setSavingNama(false);
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
                      {bolehEditNama && (
                        <button
                          title="Edit Nama"
                          onClick={() => setEditNamaFor({ id: k.id, nama: k.nama, value: k.nama })}
                          className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
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

      {editNamaFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5">
            <div className="text-sm font-semibold mb-3">Edit Nama Karyawan</div>
            <input
              autoFocus
              placeholder="Nama karyawan"
              className={inputClass}
              value={editNamaFor.value}
              onChange={(e) => setEditNamaFor((f) => ({ ...f, value: e.target.value }))}
            />
            <div className="flex gap-2 mt-3.5">
              <button
                disabled={savingNama}
                onClick={simpanEditNama}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-semibold py-2 rounded-lg"
              >
                {savingNama ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
              </button>
              <button onClick={() => setEditNamaFor(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg">
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
    getAbsensiSettings()
      .then((s) => setForm({ ...s, shift_list: daftarShift(s) }))
      .catch((e) => showToast?.(e.message || "Gagal memuat pengaturan", "err"));
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

  // Kelola daftar shift — tiap shift punya jam masuk & jam pulang sendiri.
  // Karyawan tinggal pilih salah satu shift ini pas absen (lihat
  // AbsenKaryawan.jsx), telat/lembur dihitung terhadap jam shift yang
  // dipilih, bukan lagi 1 jam standar untuk semua orang.
  const updateShift = (idx, patch) =>
    setForm((f) => ({
      ...f,
      shift_list: f.shift_list.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  const tambahShift = () =>
    setForm((f) => ({ ...f, shift_list: [...f.shift_list, { nama: "", jam_masuk: "08:00", jam_pulang: "16:00" }] }));
  const hapusShift = (idx) =>
    setForm((f) => ({ ...f, shift_list: f.shift_list.filter((_, i) => i !== idx) }));

  const shiftValid =
    form?.shift_list?.length > 0 && form.shift_list.every((s) => s.nama.trim() && s.jam_masuk && s.jam_pulang);

  const simpan = async () => {
    if (!shiftValid) {
      showToast?.("Tiap shift wajib punya nama, jam masuk, dan jam pulang.", "err");
      return;
    }
    setSaving(true);
    try {
      await updateAbsensiSettings({
        office_lat: Number(form.office_lat),
        office_lng: Number(form.office_lng),
        radius_meter: Number(form.radius_meter),
        shift_list: form.shift_list,
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

      <div>
        <div className="text-xs text-slate-400 mb-1.5 font-medium">
          Daftar Shift — karyawan pilih salah satu ini sendiri pas absen
        </div>
        <div className="space-y-2">
          {form.shift_list.map((s, idx) => (
            <div
              key={idx}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-0 rounded-lg border border-slate-800 sm:border-0 bg-slate-950/40 sm:bg-transparent"
            >
              <input
                className={`${inputClass} w-full sm:flex-1 sm:min-w-[140px]`}
                placeholder="Nama shift (mis. Pagi)"
                value={s.nama}
                onChange={(e) => updateShift(idx, { nama: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  className={`${inputClass} flex-1 sm:flex-none sm:w-28`}
                  value={s.jam_masuk}
                  onChange={(e) => updateShift(idx, { jam_masuk: e.target.value })}
                />
                <span className="text-slate-600 text-xs">–</span>
                <input
                  type="time"
                  className={`${inputClass} flex-1 sm:flex-none sm:w-28`}
                  value={s.jam_pulang}
                  onChange={(e) => updateShift(idx, { jam_pulang: e.target.value })}
                />
                {form.shift_list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => hapusShift(idx)}
                    className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800 shrink-0"
                    title="Hapus shift ini"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={tambahShift}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300"
        >
          <Plus size={13} /> Tambah Shift
        </button>
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