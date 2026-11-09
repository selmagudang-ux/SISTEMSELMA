import { useState, useEffect, useMemo, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import { EmptyState, InputRupiah, inputClass, btnFilled } from "./ui";
import { daftarPengaturanGaji, simpanPengaturanGaji } from "../lib/gajiOtomatis";

// Tab "Pengaturan Gaji" di menu Penggajian: tarif per karyawan yang dipakai tombol
// "Hitung otomatis". Datanya hanya lewat Edge Function gaji-admin (tabel gaji_pengaturan
// terkunci dari anon key), jadi tarif tidak pernah ikut terbaca lewat tabel karyawan.

const KOSONG = { tipe_gaji: "bulanan", tarif: "", pembagi_hari: 30, premi_jabatan: "", premi_kehadiran: "", tarif_lembur: "" };
const angka = (v) => Number(v) || 0;
const rp = (n) => `Rp ${angka(n).toLocaleString("id-ID")}`;

const dariServer = (p) =>
  p
    ? {
        tipe_gaji: p.tipe_gaji === "harian" ? "harian" : "bulanan",
        tarif: angka(p.tarif),
        pembagi_hari: angka(p.pembagi_hari) || 30,
        premi_jabatan: angka(p.premi_jabatan),
        premi_kehadiran: angka(p.premi_kehadiran),
        tarif_lembur: angka(p.tarif_lembur),
      }
    : KOSONG;

export default function PengaturanGaji({ pw, ent, karyawan, readOnly, showToast, onError }) {
  const [tersimpan, setTersimpan] = useState(() => new Map()); // karyawan_id -> baris dari server
  const [edit, setEdit] = useState({}); // karyawan_id -> nilai yang diubah user
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const rows = await daftarPengaturanGaji(pw, ent);
      setTersimpan(new Map(rows.map((r) => [r.karyawan_id, r])));
    } catch (e) {
      onError?.(e, "Gagal memuat pengaturan gaji.");
    } finally {
      setMemuat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw, ent]);

  useEffect(() => {
    setEdit({});
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw, ent]);

  const nilai = (kid) => edit[kid] || dariServer(tersimpan.get(kid));
  const ubah = (kid, patch) => setEdit((p) => ({ ...p, [kid]: { ...nilai(kid), ...patch } }));
  const jumlahUbah = useMemo(() => karyawan.filter((k) => edit[k.id]).length, [karyawan, edit]);

  const simpan = async () => {
    const baris = [];
    for (const k of karyawan) {
      const v = edit[k.id];
      if (!v) continue;
      const pembagi = Number(v.pembagi_hari);
      if (!Number.isInteger(pembagi) || pembagi < 1 || pembagi > 31) {
        showToast?.(`${k.nama}: pembagi hari harus bilangan bulat 1 sampai 31.`, "err");
        return;
      }
      baris.push({
        karyawan_id: k.id,
        tipe_gaji: v.tipe_gaji,
        tarif: angka(v.tarif),
        pembagi_hari: pembagi,
        premi_jabatan: angka(v.premi_jabatan),
        premi_kehadiran: angka(v.premi_kehadiran),
        tarif_lembur: angka(v.tarif_lembur),
      });
    }
    if (baris.length === 0) return;

    setMenyimpan(true);
    try {
      const hasil = await simpanPengaturanGaji(pw, baris, ent);
      const ok = hasil.filter((h) => h.ok);
      const gagal = hasil.filter((h) => !h.ok);
      setEdit((p) => {
        const n = { ...p };
        ok.forEach((h) => delete n[baris[h.index].karyawan_id]);
        return n;
      });
      if (ok.length) showToast?.(`${ok.length} pengaturan gaji tersimpan.`);
      gagal.forEach((h) => {
        const nama = karyawan.find((k) => k.id === baris[h.index].karyawan_id)?.nama || "Baris";
        showToast?.(`${nama}: ${h.error}`, "err");
      });
      await muat();
    } catch (e) {
      onError?.(e, "Gagal menyimpan pengaturan gaji.");
    } finally {
      setMenyimpan(false);
    }
  };

  if (memuat && tersimpan.size === 0 && karyawan.length > 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-md-on-surface-variant py-6">
        <Loader2 size={16} className="animate-spin" /> Memuat pengaturan gaji...
      </div>
    );
  }
  if (karyawan.length === 0) return <EmptyState label="Belum ada karyawan aktif." />;

  return (
    <div>
      <div className="overflow-x-auto bg-md-container-high rounded-md-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-md-on-surface-variant">
              <th className="px-4 py-3">Karyawan</th>
              <th className="px-2 py-3 min-w-[8rem]">Tipe gaji</th>
              <th className="px-2 py-3 min-w-[9rem]">Tarif (per hari / per bulan)</th>
              <th className="px-2 py-3 min-w-[9rem]">Premi jabatan (per bulan)</th>
              <th className="px-2 py-3 min-w-[9rem]">Premi kehadiran (per bulan)</th>
              <th className="px-2 py-3 min-w-[9rem]">Tarif lembur (per jam)</th>
              <th className="px-2 py-3 min-w-[6rem]">Pembagi hari</th>
            </tr>
          </thead>
          <tbody>
            {karyawan.map((k) => {
              const v = nilai(k.id);
              const belumAtur = !tersimpan.get(k.id) && !edit[k.id];
              return (
                <tr key={k.id} className="border-t border-md-outline-variant align-middle">
                  <td className="px-4 py-2">
                    <div className="text-md-on-surface">{k.nama}</div>
                    <div className="text-[11px] text-md-on-surface-variant">
                      {k.id_karyawan}
                      {belumAtur ? " · belum diatur" : ""}
                    </div>
                  </td>
                  {readOnly ? (
                    <>
                      <td className="px-2 py-2">{v.tipe_gaji === "harian" ? "Harian" : "Bulanan"}</td>
                      <td className="px-2 py-2">{rp(v.tarif)}</td>
                      <td className="px-2 py-2">{rp(v.premi_jabatan)}</td>
                      <td className="px-2 py-2">{rp(v.premi_kehadiran)}</td>
                      <td className="px-2 py-2">{rp(v.tarif_lembur)}</td>
                      <td className="px-2 py-2">{v.pembagi_hari}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2">
                        <select value={v.tipe_gaji} onChange={(e) => ubah(k.id, { tipe_gaji: e.target.value })} className={inputClass}>
                          <option value="bulanan">Bulanan</option>
                          <option value="harian">Harian</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <InputRupiah value={v.tarif} onChange={(n) => ubah(k.id, { tarif: n })} placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <InputRupiah value={v.premi_jabatan} onChange={(n) => ubah(k.id, { premi_jabatan: n })} placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <InputRupiah value={v.premi_kehadiran} onChange={(n) => ubah(k.id, { premi_kehadiran: n })} placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <InputRupiah value={v.tarif_lembur} onChange={(n) => ubah(k.id, { tarif_lembur: n })} placeholder="0" />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={v.pembagi_hari}
                          onChange={(e) => ubah(k.id, { pembagi_hari: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex justify-end mt-4">
          <button className={btnFilled} onClick={simpan} disabled={menyimpan || jumlahUbah === 0}>
            {menyimpan ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Simpan pengaturan ({jumlahUbah})
          </button>
        </div>
      )}

      <div className="text-xs text-md-on-surface-variant mt-4 space-y-1">
        <p>Cara hitung otomatis (dari data Absensi):</p>
        <p>• Harian: gaji pokok = tarif × jumlah hari masuk.</p>
        <p>• Bulanan: gaji pokok = tarif − (tarif ÷ pembagi hari × jumlah hari Tanpa Keterangan). Sakit dan izin tidak dipotong.</p>
        <p>• Premi kehadiran penuh jika ada hari masuk, tidak pernah telat, dan tidak ada hari Sakit, Izin, atau Tanpa Keterangan.</p>
        <p>• Bonus = total jam lembur × tarif lembur per jam (isi 0 jika lembur tidak dihitung).</p>
        <p>• Periode yang bukan satu bulan penuh: tarif bulanan dan premi dihitung sebanding jumlah hari ÷ pembagi hari.</p>
        <p>• Karyawan yang tarifnya belum diisi dilewati dan tetap bisa diisi manual.</p>
      </div>
    </div>
  );
}
