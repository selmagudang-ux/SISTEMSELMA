import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, RefreshCw, AlertTriangle, Plus, Pencil, Trash2, Check, X, ShieldAlert } from "lucide-react";
import { Badge, formatTanggalID, suggestKode } from "../../components/ui";
import {
  sb, sbAll, fmtRp, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  lingkupEntitas, resetKeuanganLama, awalRentangKeuanganDefault, petaKasRekening, kasDariRekening, kodeEntitasHolding,
  tujuanKategori, saranPendapatanLabaRugi, renameRekeningKode, renameKategoriKode,
  LABEL_KAS, URUTAN_KAS, KAS_BANK, ENTITAS_DEFAULT,
} from "../../lib/api";
import { roleHanyaLihat, roleLabel, bisa, PERAN_REKENING } from "../../lib/constants";
import { hariIniLokal, awalBulanIni } from "../AlurKas";

// =========================================================
// VERSI HP — KEUANGAN > Pengaturan (file PengaturanKeuanganHp.jsx)
// Empat tab, tampilan KARTU (bukan tabel):
//   1. Rekening & Kategori : Rekening (+ jenis Bank/Uang Cash), Lokasi, Kategori Pemasukan, Kategori Pengeluaran,
//                            Kategori & Sub Kategori (pengelompokan laporan), Masuk ke Laporan (Laba Rugi / Neraca).
//   2. Penggunaan Rekening : rekening otomatis tiap fitur (supplier, ongkir, Toko Offline, antar perusahaan).
//   3. Log Keterangan      : keterangan yang pernah dipakai di Transaksi (sembunyikan dari rekomendasi).
//   4. Riwayat Perubahan   : jejak tambah/ubah/hapus transaksi (hanya role yang punya hak keuangan.riwayat_perubahan).
// Sumber data & aturan SAMA dengan versi komputer (Keuangan.jsx): tabel master_data, keuangan_transaksi,
// keuangan_audit_log. Dikunci ke PT akun yang login (lingkupEntitas). Akun read-only tidak bisa mengubah apa pun.
// =========================================================

const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// Transaksi bulan berjalan — hanya dibutuhkan tab Log Keterangan (dimuat saat tab itu dibuka).
async function muatTransaksi() {
  const awal = awalRentangKeuanganDefault();
  resetKeuanganLama();
  return (await sbAll(`keuangan_transaksi?select=id,tanggal,tipe,kategori,jumlah,keterangan&tanggal=gte.${awal}&order=tanggal.desc`)) || [];
}

function Memuat({ teks = "Memuat…" }) {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> {teks}
    </div>
  );
}

function ChipTab({ aktif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
        aktif ? "bg-md-primary text-md-on-primary border-transparent" : "bg-md-container border-md-outline-variant text-md-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5 text-sm text-md-on-surface outline-none focus:border-md-primary disabled:opacity-40";

const Kartu = ({ children, className = "" }) => (
  <div className={`rounded-2xl bg-md-container border border-md-outline-variant p-3 ${className}`}>{children}</div>
);
const Info = ({ children }) => <div className="text-[11px] text-md-on-surface-variant leading-relaxed">{children}</div>;
const Kosong = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">{children}</div>
);

// Batang simpan melayang untuk tab yang menyimpan banyak perubahan sekaligus (Kelompok / Masuk ke Laporan).
function BatangSimpan({ jumlah, menyimpan, onBatal, onSimpan }) {
  if (!jumlah) return null;
  return (
    <div
      className="fixed left-4 right-4 z-40 flex items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-md-container px-4 py-3 shadow-lg"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <span className="text-xs text-amber-400 min-w-0">{jumlah} perubahan belum disimpan</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onBatal} disabled={menyimpan} className="text-xs text-md-on-surface-variant px-3 py-2 rounded-lg disabled:opacity-40">Batal</button>
        <button onClick={onSimpan} disabled={menyimpan} className="bg-md-primary text-md-on-primary font-semibold text-xs px-4 py-2 rounded-xl disabled:opacity-40">
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// 1a. DAFTAR KODE/NAMA (Rekening, Lokasi, Kategori Pemasukan, Kategori Pengeluaran)
// ---------------------------------------------------------
const DAFTAR = [
  { key: "rekening", label: "Rekening", placeholderKode: "BCA", placeholderLabel: "Bank BCA - 12345" },
  { key: "lokasi", label: "Lokasi", placeholderKode: "BDG", placeholderLabel: "Pusat Bandung" },
  { key: "kategori_masuk", label: "Pemasukan", placeholderKode: "JUAL", placeholderLabel: "Penjualan Produk" },
  { key: "kategori_keluar", label: "Pengeluaran", placeholderKode: "GAJI", placeholderLabel: "Gaji Karyawan" },
];

function DaftarKode({ jenis, master, reload, tampilToast, bacaSaja, entitasKode }) {
  const info = DAFTAR.find((d) => d.key === jenis);
  const list = master[jenis] || [];
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [kodeSentuh, setKodeSentuh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editKode, setEditKode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [kasSaving, setKasSaving] = useState(null);
  const [q, setQ] = useState("");

  const kasGrupList = master.kas_grup || [];
  const petaKas = petaKasRekening(kasGrupList);

  useEffect(() => {
    setKode("");
    setLabel("");
    setKodeSentuh(false);
    setEditId(null);
    setQ("");
  }, [jenis]);

  const tolak = () => {
    tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
  };

  const setKas = async (m, kas) => {
    if (bacaSaja) return tolak();
    const ada = kasGrupList.find((x) => x.kode === m.kode);
    setKasSaving(m.id);
    try {
      if (kas === KAS_BANK) {
        if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: kas }) });
        else await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "kas_grup", kode: m.kode, label: kas }) });
      } else if (ada) {
        await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      }
      await reload();
      tampilToast(`${m.label} → ${LABEL_KAS[kas]}`);
    } catch (e) {
      tampilToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setKasSaving(null);
    }
  };

  const mulaiEdit = (m) => {
    if (bacaSaja) return tolak();
    setEditId(m.id);
    setEditKode(m.kode);
    setEditLabel(m.label);
  };
  const batalEdit = () => setEditId(null);

  const simpanEdit = async (m) => {
    const kodeBaru = editKode.trim().toUpperCase();
    const labelBaru = editLabel.trim();
    if (!kodeBaru || !labelBaru) return;
    if (kodeBaru === m.kode && labelBaru === m.label) return batalEdit();
    if (kodeBaru !== m.kode && list.some((x) => x.id !== m.id && x.kode === kodeBaru)) {
      tampilToast(`Kode "${kodeBaru}" sudah dipakai`, "err");
      return;
    }
    const kodeBerubah = kodeBaru !== m.kode;
    const rambat = kodeBerubah && (jenis === "rekening" || jenis === "kategori_masuk" || jenis === "kategori_keluar");
    if (
      rambat &&
      !confirm(`Kode "${m.kode}" akan diganti ke "${kodeBaru}". Semua transaksi, rekonsiliasi, saldo awal, dan pengaturan yang memakai kode lama ikut diganti ke kode baru. Lanjutkan?`)
    )
      return;
    setEditSaving(true);
    try {
      let jumlahTransaksi = 0;
      if (rambat) {
        const hasil =
          jenis === "rekening"
            ? await renameRekeningKode({ masterDataId: m.id, oldKode: m.kode, newKode: kodeBaru, newLabel: labelBaru })
            : await renameKategoriKode({ masterDataId: m.id, tipe: jenis, oldKode: m.kode, newKode: kodeBaru, newLabel: labelBaru });
        jumlahTransaksi = hasil.jumlahTransaksi;
      } else {
        await sb(`master_data?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ kode: kodeBaru, label: labelBaru }) });
      }
      if (jenis === "lokasi" && kodeBerubah) {
        for (const lk of (master.rekening_lokasi || []).filter((x) => x.label === m.kode)) {
          await sb(`master_data?id=eq.${lk.id}`, { method: "PATCH", body: JSON.stringify({ label: kodeBaru }) });
        }
      }
      await reload();
      batalEdit();
      tampilToast(rambat && jumlahTransaksi > 0 ? `Kode diganti — ${jumlahTransaksi} transaksi ikut diperbarui` : "Perubahan disimpan");
    } catch (e) {
      tampilToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setEditSaving(false);
    }
  };

  const tambah = async () => {
    if (bacaSaja) return tolak();
    if (!kode.trim() || !label.trim()) return;
    const kodeFix = kode.trim().toUpperCase();
    if (list.some((x) => x.kode === kodeFix)) {
      tampilToast(`Kode "${kodeFix}" sudah dipakai`, "err");
      return;
    }
    setSaving(true);
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: jenis, kode: kodeFix, label: label.trim() }) });
      // Rekening baru ikut entitas akun ini (OPS = tanpa penanda), sama seperti versi komputer.
      if (jenis === "rekening" && entitasKode && entitasKode !== ENTITAS_DEFAULT) {
        await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening_entitas", kode: kodeFix, label: entitasKode }) });
      }
      setKode("");
      setLabel("");
      setKodeSentuh(false);
      await reload();
      tampilToast("Ditambahkan");
    } catch (e) {
      tampilToast(e.message || "Gagal menambah", "err");
    } finally {
      setSaving(false);
    }
  };

  const hapus = async (m) => {
    if (bacaSaja) return tolak();
    if (!confirm(`Hapus "${m.label}" (${m.kode})?`)) return;
    try {
      await sb(`master_data?id=eq.${m.id}`, { method: "DELETE" });
      if (jenis === "rekening") {
        const g = kasGrupList.find((x) => x.kode === m.kode);
        if (g) await sb(`master_data?id=eq.${g.id}`, { method: "DELETE" });
        const lk = (master.rekening_lokasi || []).find((x) => x.kode === m.kode);
        if (lk) await sb(`master_data?id=eq.${lk.id}`, { method: "DELETE" });
        const en = (master.rekening_entitas || []).find((x) => x.kode === m.kode);
        if (en) await sb(`master_data?id=eq.${en.id}`, { method: "DELETE" });
        for (const pr of (master.rekening_peran || []).filter((x) => x.label === m.kode)) {
          await sb(`master_data?id=eq.${pr.id}`, { method: "DELETE" });
        }
      }
      if (jenis === "lokasi") {
        for (const lk of (master.rekening_lokasi || []).filter((x) => x.label === m.kode)) {
          await sb(`master_data?id=eq.${lk.id}`, { method: "DELETE" });
        }
      }
      await reload();
      tampilToast("Dihapus");
    } catch (e) {
      tampilToast(e.message || "Gagal menghapus", "err");
    }
  };

  const tampil = list.filter((m) => {
    const s = q.trim().toLowerCase();
    return !s || `${m.kode} ${m.label}`.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      {jenis === "rekening" && (
        <Info>Tandai tiap rekening sebagai Saldo Bank atau Uang Cash. Rekening yang belum ditandai otomatis masuk Uang Cash.</Info>
      )}
      {jenis === "lokasi" && <Info>Daftar lokasi (mis. Pusat, Cabang). Lokasi tiap rekening dipilih di Kas › Akun Kas.</Info>}

      {!bacaSaja && (
        <Kartu className="space-y-2">
          <div className="text-xs font-semibold text-md-on-surface">Tambah {info.label.toLowerCase()}</div>
          <input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!kodeSentuh) setKode(suggestKode(e.target.value));
            }}
            placeholder={`Nama, cth: ${info.placeholderLabel}`}
            className={inputCls}
            onKeyDown={(e) => e.key === "Enter" && tambah()}
          />
          <div className="flex gap-2">
            <input
              value={kode}
              onChange={(e) => {
                setKode(e.target.value);
                setKodeSentuh(true);
              }}
              placeholder={`Kode, cth: ${info.placeholderKode}`}
              className={`${inputCls} font-mono uppercase`}
            />
            <button
              disabled={!kode.trim() || !label.trim() || saving}
              onClick={tambah}
              className="flex items-center gap-1.5 bg-md-primary text-md-on-primary disabled:opacity-40 font-semibold text-xs px-4 rounded-xl flex-shrink-0"
            >
              <Plus size={14} /> Tambah
            </button>
          </div>
        </Kartu>
      )}

      {list.length > 8 && (
        <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
          <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kode atau nama"
            className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant"
          />
        </div>
      )}

      <div className="text-[11px] text-md-on-surface-variant">{tampil.length} {info.label.toLowerCase()}</div>
      {tampil.length === 0 ? (
        <Kosong>{q ? "Tidak ada yang cocok." : `Belum ada data untuk ${info.label}.`}</Kosong>
      ) : (
        <div className="space-y-2">
          {tampil.map((m) => {
            const sedangEdit = editId === m.id;
            const kasIni = kasDariRekening(petaKas, m.kode);
            return (
              <Kartu key={m.id}>
                {sedangEdit ? (
                  <div className="space-y-2">
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={inputCls} placeholder="Nama" autoFocus />
                    <input value={editKode} onChange={(e) => setEditKode(e.target.value)} className={`${inputCls} font-mono uppercase`} placeholder="Kode" />
                    {editKode.trim().toUpperCase() !== m.kode && (
                      <div className="text-[10px] text-amber-500">
                        {jenis === "lokasi"
                          ? `Kode diganti — semua rekening di lokasi "${m.kode}" ikut menunjuk ke kode baru.`
                          : `Kode diganti — semua transaksi & pengaturan yang memakai kode "${m.kode}" ikut diganti.`}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={batalEdit} disabled={editSaving} className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl border border-md-outline-variant text-md-on-surface-variant">
                        <X size={14} /> Batal
                      </button>
                      <button
                        onClick={() => simpanEdit(m)}
                        disabled={!editKode.trim() || !editLabel.trim() || editSaving}
                        className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl bg-md-primary text-md-on-primary font-semibold disabled:opacity-40"
                      >
                        <Check size={14} /> {editSaving ? "Menyimpan…" : "Simpan"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-md-on-surface break-words">{m.label}</div>
                        <div className="font-mono text-[11px] text-amber-400">{m.kode}</div>
                      </div>
                      {!bacaSaja && (
                        <div className="flex items-center flex-shrink-0">
                          <button onClick={() => mulaiEdit(m)} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high" title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => hapus(m)} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high" title="Hapus">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                    {jenis === "rekening" && (
                      <div className="flex rounded-xl border border-md-outline-variant overflow-hidden mt-2">
                        {URUTAN_KAS.map((k) => (
                          <button
                            key={k}
                            disabled={kasSaving === m.id || bacaSaja}
                            onClick={() => kasIni !== k && setKas(m, k)}
                            className={`flex-1 py-2 text-xs font-semibold disabled:opacity-60 ${
                              kasIni === k ? "bg-md-primary text-md-on-primary" : "text-md-on-surface-variant"
                            }`}
                          >
                            {LABEL_KAS[k]}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Kartu>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 1b. KATEGORI & SUB KATEGORI (pengelompokan laporan)
// ---------------------------------------------------------
function pecahJalur(label) {
  const bagian = String(label || "").split(">").map((x) => x.trim()).filter(Boolean);
  return { kat: bagian[0] || "", sub: bagian.slice(1).join(" > ") };
}

function KelompokKategori({ master, reload, tampilToast, bacaSaja, draft, setDraft }) {
  const [tipe, setTipe] = useState("keluar");
  const [menyimpan, setMenyimpan] = useState(false);
  const info = {
    masuk: { kategori: "kategori_masuk", kelompok: "kelompok_masuk" },
    keluar: { kategori: "kategori_keluar", kelompok: "kelompok_keluar" },
  };
  const kategoriList = master[info[tipe].kategori] || [];
  const pemetaan = master[info[tipe].kelompok] || [];

  const jalurTersimpan = (t, kode) => pecahJalur((master[info[t].kelompok] || []).find((x) => x.kode === kode)?.label);
  const nilaiSekarang = (t, kode) => draft[t]?.[kode] || jalurTersimpan(t, kode);
  const susunLabel = (v) => (v.kat.trim() ? (v.sub.trim() ? `${v.kat.trim()} > ${v.sub.trim()}` : v.kat.trim()) : "");
  const ubah = (t, kode, bagian, nilai) =>
    setDraft((d) => {
      const cur = d[t]?.[kode] || jalurTersimpan(t, kode);
      return { ...d, [t]: { ...(d[t] || {}), [kode]: { ...cur, [bagian]: nilai } } };
    });

  const perubahan = [];
  ["masuk", "keluar"].forEach((t) => {
    Object.entries(draft[t] || {}).forEach(([kode, v]) => {
      const ada = (master[info[t].kelompok] || []).find((x) => x.kode === kode);
      const labelBaru = susunLabel(v);
      if ((ada?.label || "") !== labelBaru) perubahan.push({ t, kode, ada, labelBaru, v });
    });
  });
  const berubahIni = new Set(perubahan.filter((x) => x.t === tipe).map((x) => x.kode));

  const saranSemua = [...pemetaan.map((x) => pecahJalur(x.label)), ...Object.values(draft[tipe] || {})];
  const saranKategori = [...new Set(saranSemua.map((j) => j.kat.trim()).filter(Boolean))];
  const saranSub = [...new Set(saranSemua.map((j) => j.sub.trim()).filter(Boolean))];

  // Urutan dari data TERSIMPAN saja supaya kartu tidak loncat saat mengetik.
  const urut = [...kategoriList].sort((a, b) => {
    const ja = jalurTersimpan(tipe, a.kode);
    const jb = jalurTersimpan(tipe, b.kode);
    const ka = ja.kat ? `0|${ja.kat}|${ja.sub}|${a.label}` : `1|${a.label}`;
    const kb = jb.kat ? `0|${jb.kat}|${jb.sub}|${b.label}` : `1|${b.label}`;
    return ka.localeCompare(kb);
  });

  const simpanSemua = async () => {
    if (bacaSaja) return tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
    const salah = perubahan.find((x) => !x.v.kat.trim() && x.v.sub.trim());
    if (salah) return tampilToast("Ada baris yang Sub Kategori-nya terisi tapi Kategori-nya kosong", "err");
    setMenyimpan(true);
    let gagal = 0;
    for (const x of perubahan) {
      try {
        if (!x.labelBaru) {
          if (x.ada) await sb(`master_data?id=eq.${x.ada.id}`, { method: "DELETE" });
        } else if (x.ada) {
          await sb(`master_data?id=eq.${x.ada.id}`, { method: "PATCH", body: JSON.stringify({ label: x.labelBaru }) });
        } else {
          await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: info[x.t].kelompok, kode: x.kode, label: x.labelBaru }) });
        }
      } catch {
        gagal += 1;
      }
    }
    try {
      await reload();
    } catch {
      /* abaikan — data ikut termuat saat refresh berikutnya */
    }
    setMenyimpan(false);
    if (gagal > 0) tampilToast(`${gagal} perubahan gagal disimpan — coba simpan lagi`, "err");
    else {
      setDraft({});
      tampilToast(`${perubahan.length} perubahan disimpan`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <ChipTab aktif={tipe === "keluar"} onClick={() => setTipe("keluar")}>Pengeluaran</ChipTab>
        <ChipTab aktif={tipe === "masuk"} onClick={() => setTipe("masuk")}>Pemasukan</ChipTab>
      </div>
      <Info>
        Isi <b>Kategori</b> dan (opsional) <b>Sub Kategori</b> untuk tiap rincian, supaya Laporan Keuangan tampil bertingkat, mis. Biaya Operasional → Biaya
        Tetap → Gaji Karyawan. Nama yang sama otomatis digabung. Kosongkan kalau tidak ingin dikelompokkan. Ubah sebanyak yang Anda mau, lalu tekan Simpan sekali.
      </Info>
      <datalist id="saran-kat-hp">{saranKategori.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="saran-sub-hp">{saranSub.map((n) => <option key={n} value={n} />)}</datalist>

      {urut.length === 0 ? (
        <Kosong>Belum ada kategori.</Kosong>
      ) : (
        <div className="space-y-2 pb-16">
          {urut.map((m) => {
            const v = nilaiSekarang(tipe, m.kode);
            const kelas = `${inputCls} ${berubahIni.has(m.kode) ? "!border-amber-500/60" : ""}`;
            return (
              <Kartu key={`${tipe}-${m.id}`} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-md-on-surface break-words min-w-0">{m.label}</div>
                  <div className="font-mono text-[11px] text-amber-400 flex-shrink-0">{m.kode}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input list="saran-kat-hp" value={v.kat} disabled={bacaSaja} onChange={(e) => ubah(tipe, m.kode, "kat", e.target.value)} placeholder="Kategori…" className={kelas} />
                  <input list="saran-sub-hp" value={v.sub} disabled={bacaSaja} onChange={(e) => ubah(tipe, m.kode, "sub", e.target.value)} placeholder="Sub kategori…" className={kelas} />
                </div>
              </Kartu>
            );
          })}
        </div>
      )}
      <BatangSimpan jumlah={perubahan.length} menyimpan={menyimpan} onBatal={() => setDraft({})} onSimpan={simpanSemua} />
    </div>
  );
}

// ---------------------------------------------------------
// 1c. MASUK KE LAPORAN (Laba Rugi / Neraca)
// ---------------------------------------------------------
function TujuanLaporan({ master, reload, tampilToast, bacaSaja, draft, setDraft }) {
  const [tipe, setTipe] = useState("masuk");
  const [menyimpan, setMenyimpan] = useState(false);
  const info = {
    masuk: { kategori: "kategori_masuk", tujuan: "laporan_masuk", labelLR: "pendapatan" },
    keluar: { kategori: "kategori_keluar", tujuan: "laporan_keluar", labelLR: "beban" },
  };
  const kategoriList = master[info[tipe].kategori] || [];
  const sekarang = (t, kode) => draft[t]?.[kode] ?? tujuanKategori(master, t, kode);
  const pilih = (t, kode, nilai) => {
    if (bacaSaja) return tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
    setDraft((d) => ({ ...d, [t]: { ...(d[t] || {}), [kode]: nilai } }));
  };

  const perubahan = [];
  ["masuk", "keluar"].forEach((t) => {
    Object.entries(draft[t] || {}).forEach(([kode, nilai]) => {
      if (nilai !== tujuanKategori(master, t, kode)) perubahan.push({ t, kode, nilai });
    });
  });
  const berubahIni = new Set(perubahan.filter((x) => x.t === tipe).map((x) => x.kode));
  const jumlahNeraca = kategoriList.filter((m) => sekarang(tipe, m.kode) === "neraca").length;

  const isiSaran = () =>
    setDraft((d) => ({
      ...d,
      masuk: {
        ...(d.masuk || {}),
        ...Object.fromEntries((master.kategori_masuk || []).map((m) => [m.kode, saranPendapatanLabaRugi(m.kode) ? "laba_rugi" : "neraca"])),
      },
    }));

  const simpanSemua = async () => {
    if (bacaSaja) return tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
    setMenyimpan(true);
    let gagal = 0;
    for (const x of perubahan) {
      try {
        const ada = (master[info[x.t].tujuan] || []).find((m) => m.kode === x.kode);
        if (x.nilai === "neraca") {
          if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: "neraca" }) });
          else await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: info[x.t].tujuan, kode: x.kode, label: "neraca" }) });
        } else if (ada) {
          await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
        }
      } catch {
        gagal += 1;
      }
    }
    try {
      await reload();
    } catch {
      /* abaikan */
    }
    setMenyimpan(false);
    if (gagal > 0) tampilToast(`${gagal} perubahan gagal disimpan — coba simpan lagi`, "err");
    else {
      setDraft({});
      tampilToast(`${perubahan.length} perubahan disimpan`);
    }
  };

  const tombol = (aktif, warna) =>
    `flex-1 py-2 text-xs font-semibold border rounded-lg transition ${aktif ? warna : "border-transparent text-md-on-surface-variant"}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <ChipTab aktif={tipe === "masuk"} onClick={() => setTipe("masuk")}>Pemasukan</ChipTab>
        <ChipTab aktif={tipe === "keluar"} onClick={() => setTipe("keluar")}>Pengeluaran</ChipTab>
      </div>
      <Info>
        Pilih tiap kategori masuk ke <b>Laba Rugi</b> ({info[tipe].labelLR} usaha) atau <b>Neraca</b> (modal, utang/titipan, piutang — bukan omzet atau biaya).
        Kategori Neraca tidak dihitung di Laporan Laba Rugi; saldo kas dan Laporan Arus Kas tidak berubah. Ubah sebanyak yang Anda mau, lalu tekan Simpan sekali.
      </Info>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-md-on-surface-variant">
          {kategoriList.length - jumlahNeraca} ke Laba Rugi · {jumlahNeraca} ke Neraca
        </div>
        {tipe === "masuk" && !bacaSaja && (
          <button onClick={isiSaran} className="text-[11px] font-semibold text-md-primary border border-md-outline-variant rounded-xl px-3 py-1.5">
            Isi otomatis
          </button>
        )}
      </div>

      {kategoriList.length === 0 ? (
        <Kosong>Belum ada kategori.</Kosong>
      ) : (
        <div className="space-y-2 pb-16">
          {kategoriList.map((m) => {
            const v = sekarang(tipe, m.kode);
            return (
              <Kartu key={`${tipe}-${m.id}`} className={berubahIni.has(m.kode) ? "!border-amber-500/60" : ""}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold text-md-on-surface break-words min-w-0">{m.label}</div>
                  <div className="font-mono text-[11px] text-amber-400 flex-shrink-0">{m.kode}</div>
                </div>
                <div className="flex gap-1 rounded-xl border border-md-outline-variant p-0.5">
                  <button onClick={() => pilih(tipe, m.kode, "laba_rugi")} className={tombol(v === "laba_rugi", "bg-emerald-500/15 border-emerald-500/40 text-emerald-400")}>Laba Rugi</button>
                  <button onClick={() => pilih(tipe, m.kode, "neraca")} className={tombol(v === "neraca", "bg-sky-500/15 border-sky-500/40 text-sky-400")}>Neraca</button>
                </div>
              </Kartu>
            );
          })}
        </div>
      )}
      <BatangSimpan jumlah={perubahan.length} menyimpan={menyimpan} onBatal={() => setDraft({})} onSimpan={simpanSemua} />
    </div>
  );
}

// ---------------------------------------------------------
// 1. TAB REKENING & KATEGORI
// ---------------------------------------------------------
const SUB_REKKAT = [
  ...DAFTAR.map((d) => ({ key: d.key, label: d.label })),
  { key: "pengelompokan", label: "Kategori & Sub" },
  { key: "tujuan", label: "Masuk ke Laporan" },
];

function RekeningKategoriHp({ master, reload, tampilToast, bacaSaja, entitasKode }) {
  const [sub, setSub] = useState("rekening");
  // Isian yang belum disimpan dijaga di sini supaya tidak hilang saat pindah chip.
  const [draftKelompok, setDraftKelompok] = useState({});
  const [draftTujuan, setDraftTujuan] = useState({});
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
        {SUB_REKKAT.map((s) => (
          <ChipTab key={s.key} aktif={sub === s.key} onClick={() => setSub(s.key)}>{s.label}</ChipTab>
        ))}
      </div>
      {sub === "pengelompokan" ? (
        <KelompokKategori master={master} reload={reload} tampilToast={tampilToast} bacaSaja={bacaSaja} draft={draftKelompok} setDraft={setDraftKelompok} />
      ) : sub === "tujuan" ? (
        <TujuanLaporan master={master} reload={reload} tampilToast={tampilToast} bacaSaja={bacaSaja} draft={draftTujuan} setDraft={setDraftTujuan} />
      ) : (
        <DaftarKode jenis={sub} master={master} reload={reload} tampilToast={tampilToast} bacaSaja={bacaSaja} entitasKode={entitasKode} />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 2. PENGGUNAAN REKENING
// ---------------------------------------------------------
function PenggunaanRekeningHp({ master, entitasKode, kodeHolding, reload, tampilToast, bacaSaja }) {
  const [saving, setSaving] = useState(null);
  const kodeEnt = entitasKode || ENTITAS_DEFAULT;
  const rekening = master.rekening || [];
  const barisPeran = master.rekening_peran || [];
  const petaKas = petaKasRekening(master.kas_grup);

  const simpan = async (peran, kodeRek) => {
    if (bacaSaja) return tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
    const kunci = `${kodeEnt}:${peran.key}`;
    const ada = barisPeran.find((x) => x.kode === kunci);
    setSaving(peran.key);
    try {
      if (!kodeRek) {
        if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      } else if (ada) {
        await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: kodeRek }) });
      } else {
        await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening_peran", kode: kunci, label: kodeRek }) });
      }
      await reload();
      tampilToast(kodeRek ? `${peran.label} → ${kodeRek}` : `${peran.label}: kembali otomatis`);
    } catch (e) {
      tampilToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(null);
    }
  };

  const laHolding = !!kodeHolding && kodeEnt === kodeHolding;
  return (
    <div className="space-y-3">
      <Info>
        Pilih rekening yang dipakai otomatis oleh tiap fitur. Kalau dikosongkan, sistem mencari rekening milik perusahaan ini yang namanya sama dengan nama
        bawaan (dan membuat baru bila tidak ada).
      </Info>
      {PERAN_REKENING.filter((p) => !p.untuk || (p.untuk === "pusat") === laHolding).map((p) => {
        const baris = barisPeran.find((x) => x.kode === `${kodeEnt}:${p.key}`);
        const nilai = baris?.label || "";
        const hilang = nilai && !rekening.some((r) => r.kode === nilai);
        return (
          <Kartu key={p.key} className="space-y-2">
            <div>
              <div className="text-sm font-semibold text-md-on-surface">{p.label}</div>
              <div className="text-[11px] text-md-on-surface-variant">{p.desc}</div>
            </div>
            <select value={hilang ? "" : nilai} disabled={saving === p.key || bacaSaja} onChange={(e) => simpan(p, e.target.value)} className={inputCls}>
              <option value="">{p.labelDefault ? `Otomatis (cari nama "${p.labelDefault}")` : "Belum diatur (dipilih manual saat transfer)"}</option>
              {rekening
                .filter((r) => !p.hanyaBank || kasDariRekening(petaKas, r.kode) === KAS_BANK)
                // Peran sekelompok (rekening penerima 1 & 2) tidak boleh memakai rekening yang sama.
                .filter((r) => !p.grup || !PERAN_REKENING.some((o) => o.grup === p.grup && o.key !== p.key && barisPeran.find((x) => x.kode === `${kodeEnt}:${o.key}`)?.label === r.kode))
                .map((r) => (
                  <option key={r.kode} value={r.kode}>{r.label} ({r.kode})</option>
                ))}
            </select>
            {hilang && <div className="text-[11px] text-amber-500">Rekening "{nilai}" yang dipilih sebelumnya sudah tidak ada. Pilih ulang, atau biarkan Otomatis.</div>}
          </Kartu>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// 3. LOG KETERANGAN
// ---------------------------------------------------------
function LogKeteranganHp({ entitasKode, master, reload, tampilToast, bacaSaja }) {
  const [trx, setTrx] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tipeFilter, setTipeFilter] = useState("");
  const [hidingKey, setHidingKey] = useState(null);
  const kodeAktif = entitasKode || ENTITAS_DEFAULT;

  useEffect(() => {
    let batal = false;
    muatTransaksi()
      .then((t) => !batal && setTrx(t))
      .catch((e) => !batal && (setErr(e.message || "Gagal memuat transaksi"), setTrx([])));
    return () => {
      batal = true;
    };
  }, []);

  // Dikunci ke PT akun ini (rekening milik PT lain tidak ikut), sama seperti desktop.
  const transaksi = useMemo(() => (trx ? lingkupEntitas(trx, master, kodeAktif).transaksi : []), [trx, master, kodeAktif]);
  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];
  const hiddenSet = new Set((master.keterangan_hidden || []).map((m) => m.label.toLowerCase()));

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of transaksi) {
      const ket = (t.keterangan || "").trim();
      if (!ket || hiddenSet.has(ket.toLowerCase())) continue;
      const key = `${t.tipe}::${ket.toLowerCase()}`;
      const ada = map.get(key);
      if (ada) {
        ada.count += 1;
        ada.total += Number(t.jumlah) || 0;
        if (t.tanggal > ada.terakhir) ada.terakhir = t.tanggal;
      } else {
        map.set(key, { keterangan: ket, tipe: t.tipe, kategori: t.kategori, count: 1, total: Number(t.jumlah) || 0, terakhir: t.tanggal });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.terakhir.localeCompare(a.terakhir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaksi, master.keterangan_hidden]);

  const filtered = grouped
    .filter((g) => !tipeFilter || g.tipe === tipeFilter)
    .filter((g) => !q.trim() || g.keterangan.toLowerCase().includes(q.trim().toLowerCase()));
  const [banyak, setBanyak] = useState(40);
  useEffect(() => setBanyak(40), [q, tipeFilter]);

  const meta = { masuk: { label: "Pemasukan", color: "emerald" }, keluar: { label: "Pengeluaran", color: "red" }, transfer: { label: "Transfer", color: "sky" } };

  const sembunyikan = async (g) => {
    if (bacaSaja) return tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
    const key = `${g.tipe}::${g.keterangan.toLowerCase()}`;
    setHidingKey(key);
    try {
      await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "keterangan_hidden", kode: `KH${Date.now()}`, label: g.keterangan }) });
      await reload();
      tampilToast("Keterangan dihapus dari log & rekomendasi");
    } catch (e) {
      tampilToast(e.message || "Gagal menghapus", "err");
    } finally {
      setHidingKey(null);
    }
  };

  if (trx === null) return <Memuat />;
  return (
    <div className="space-y-3">
      <Info>
        Keterangan yang pernah dicatat di Transaksi (bulan berjalan), diurutkan dari yang paling sering dipakai. Teks ini juga jadi rekomendasi otomatis saat
        mengisi keterangan transaksi baru. Hapus di sini hanya menyembunyikan dari log & rekomendasi — transaksi aslinya tidak ikut terhapus.
      </Info>
      {err && <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2">{err}</div>}
      <select value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)} className={inputCls}>
        <option value="">Semua Jenis</option>
        <option value="masuk">Pemasukan</option>
        <option value="keluar">Pengeluaran</option>
        <option value="transfer">Transfer Antar Rekening</option>
      </select>
      <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
        <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan…" className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant" />
      </div>
      <div className="text-[11px] text-md-on-surface-variant">{filtered.length} keterangan</div>
      {filtered.length === 0 ? (
        <Kosong>{q || tipeFilter ? "Tidak ada keterangan yang cocok." : "Belum ada transaksi dengan keterangan."}</Kosong>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, banyak).map((g) => {
            const key = `${g.tipe}::${g.keterangan.toLowerCase()}`;
            const m = meta[g.tipe] || { label: g.tipe, color: "slate" };
            const kat = g.tipe === "masuk" ? labelDari(kategoriMasuk, g.kategori) : g.tipe === "keluar" ? labelDari(kategoriKeluar, g.kategori) : "";
            return (
              <Kartu key={key}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge color={m.color}>{m.label}</Badge>
                      {kat && <span className="text-[11px] text-md-on-surface-variant">{kat}</span>}
                    </div>
                    <div className="text-sm text-md-on-surface mt-1 break-words">{g.keterangan}</div>
                    <div className="text-[11px] text-md-on-surface-variant mt-0.5">
                      Dipakai {g.count}x · Terakhir {formatTanggalID(g.terakhir)} · Total {fmtRp(g.total)}
                    </div>
                  </div>
                  {!bacaSaja && (
                    <button
                      onClick={() => sembunyikan(g)}
                      disabled={hidingKey === key}
                      className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high disabled:opacity-40 flex-shrink-0"
                      title="Hapus dari log & rekomendasi"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </Kartu>
            );
          })}
          {filtered.length > banyak && (
            <button onClick={() => setBanyak((n) => n + 40)} className="w-full py-3 rounded-xl border border-md-outline-variant text-xs font-semibold text-md-primary">
              Tampilkan lebih banyak ({filtered.length - banyak} lagi)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 4. RIWAYAT PERUBAHAN
// ---------------------------------------------------------
const LABEL_KOLOM = { tanggal: "Tanggal", tipe: "Jenis", rekening: "Rekening", rekening_tujuan: "Rekening Tujuan", kategori: "Kategori", jumlah: "Jumlah", keterangan: "Keterangan" };
const KOLOM_ABAIKAN = new Set(["id", "created_at", "updated_at"]);

function waktuWib(iso) {
  try {
    return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function nilaiTampil(kolom, v, master) {
  if (v === null || v === undefined || v === "") return "(kosong)";
  if (kolom === "jumlah") return fmtRp(v);
  if (kolom === "tanggal") return formatTanggalID(v);
  if (kolom === "tipe") return { masuk: "Pemasukan", keluar: "Pengeluaran", transfer: "Transfer" }[v] || String(v);
  if (kolom === "rekening" || kolom === "rekening_tujuan") return labelDari(master.rekening, v);
  if (kolom === "kategori") return labelDari([...(master.kategori_masuk || []), ...(master.kategori_keluar || [])], v);
  return String(v);
}
const namaPelaku = (r) => (r.sumber === "luar-aplikasi" ? null : r.nama || r.username || "User tidak dikenal");
const perluDicek = (r) => r.aksi === "DELETE" || r.sumber === "luar-aplikasi" || (r.aksi === "UPDATE" && (r.kolom_berubah || []).includes("jumlah"));

function RiwayatHp({ session, master }) {
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aksi, setAksi] = useState("");
  const [pengguna, setPengguna] = useState("");
  const [q, setQ] = useState("");
  const [hanyaDicek, setHanyaDicek] = useState(false);
  const [banyak, setBanyak] = useState(30);
  const bolehLihat = bisa(session?.role, "keuangan.riwayat_perubahan");

  const muat = useCallback(async () => {
    if (!bolehLihat) return;
    setLoading(true);
    setError("");
    try {
      const dariTs = encodeURIComponent(`${dari}T00:00:00+07:00`);
      const sampaiTs = encodeURIComponent(`${sampai}T23:59:59.999+07:00`);
      setRows((await sb(`keuangan_audit_log?select=*&waktu=gte.${dariTs}&waktu=lte.${sampaiTs}&order=waktu.desc&limit=1000`)) || []);
    } catch (e) {
      const pesan = String(e?.message || e);
      setError(
        /keuangan_audit_log|PGRST205|does not exist|404/i.test(pesan)
          ? "Tabel riwayat belum dibuat di database. Jalankan supabase/migrations/20261001_keuangan_audit_log.sql di Supabase > SQL Editor, lalu muat ulang."
          : pesan
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai, bolehLihat]);
  useEffect(() => {
    muat();
  }, [muat]);
  useEffect(() => setBanyak(30), [aksi, pengguna, q, hanyaDicek, dari, sampai]);

  const daftarPengguna = useMemo(() => [...new Set(rows.map((r) => namaPelaku(r) || "__luar__"))], [rows]);
  const filtered = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (aksi && r.aksi !== aksi) return false;
      if (pengguna && (namaPelaku(r) || "__luar__") !== pengguna) return false;
      if (hanyaDicek && !perluDicek(r)) return false;
      if (kata) {
        const d = r.data_baru || r.data_lama || {};
        const hay = [r.transaksi_id, r.username, r.nama, d.keterangan, d.kategori, d.rekening].map((x) => String(x ?? "").toLowerCase()).join(" ");
        if (!hay.includes(kata)) return false;
      }
      return true;
    });
  }, [rows, aksi, pengguna, hanyaDicek, q]);

  if (!bolehLihat) return <Kosong>Tab ini khusus untuk role superappa.</Kosong>;

  const jmlDicek = rows.filter(perluDicek).length;
  const aksiMeta = { INSERT: { label: "Ditambah", color: "emerald" }, UPDATE: { label: "Diubah", color: "amber" }, DELETE: { label: "Dihapus", color: "red" } };

  return (
    <div className="space-y-3">
      <Info>Jejak siapa yang menambah, mengubah, dan menghapus transaksi keuangan. Dicatat otomatis oleh database, tidak bisa diedit dari aplikasi.</Info>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-md-on-surface-variant">Dari<input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputCls} mt-1`} /></label>
        <label className="text-[11px] text-md-on-surface-variant">Sampai<input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputCls} mt-1`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={aksi} onChange={(e) => setAksi(e.target.value)} className={inputCls}>
          <option value="">Semua Aksi</option>
          <option value="INSERT">Ditambah</option>
          <option value="UPDATE">Diubah</option>
          <option value="DELETE">Dihapus</option>
        </select>
        <select value={pengguna} onChange={(e) => setPengguna(e.target.value)} className={inputCls}>
          <option value="">Semua Pengguna</option>
          {daftarPengguna.map((p) => (
            <option key={p} value={p}>{p === "__luar__" ? "Di luar aplikasi" : p}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
        <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan, kategori, ID transaksi…" className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-md-on-surface select-none">
          <input type="checkbox" checked={hanyaDicek} onChange={(e) => setHanyaDicek(e.target.checked)} />
          <ShieldAlert size={14} className="text-amber-500" /> Perlu dicek ({jmlDicek}/{rows.length})
        </label>
        <button onClick={muat} disabled={loading} className="inline-flex items-center gap-1 text-xs font-semibold text-md-primary disabled:opacity-50">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Muat ulang
        </button>
      </div>
      {error && <div className="rounded-xl bg-md-error-container text-md-on-error-container text-xs px-3 py-2 break-words">{error}</div>}
      {!error && rows.length >= 1000 && <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2">Menampilkan 1.000 catatan terbaru. Persempit rentang tanggal untuk melihat yang lebih lama.</div>}

      {loading && rows.length === 0 ? (
        <Memuat teks="Memuat riwayat…" />
      ) : filtered.length === 0 ? (
        <Kosong>{rows.length ? "Tidak ada catatan yang cocok dengan filter." : "Belum ada perubahan tercatat di rentang ini."}</Kosong>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, banyak).map((r) => {
            const m = aksiMeta[r.aksi] || { label: r.aksi, color: "slate" };
            const d = r.data_baru || r.data_lama || {};
            const pelaku = namaPelaku(r);
            const kolom = (r.kolom_berubah || []).filter((k) => !KOLOM_ABAIKAN.has(k));
            return (
              <Kartu key={r.id} className={perluDicek(r) ? "!border-l-2 !border-l-amber-500/70" : ""}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge color={m.color}>{m.label}</Badge>
                  {r.aksi === "UPDATE" && kolom.includes("jumlah") && <Badge color="pink">Jumlah diubah</Badge>}
                  {!pelaku && <Badge color="amber">Di luar aplikasi ({r.db_role || "database"})</Badge>}
                </div>
                <div className="flex items-start justify-between gap-2 mt-1.5">
                  <div className="text-sm font-medium text-md-on-surface min-w-0 break-words">
                    {pelaku}
                    {pelaku && r.role ? <span className="text-[11px] text-md-on-surface-variant font-normal"> · {roleLabel(r.role)}</span> : null}
                  </div>
                  <div className="text-[11px] text-md-on-surface-variant flex-shrink-0">{waktuWib(r.waktu)}</div>
                </div>
                <div className="text-[11px] text-md-on-surface-variant mt-1 break-words">
                  #{r.transaksi_id} · {nilaiTampil("tipe", d.tipe, master)} · {nilaiTampil("kategori", d.kategori, master)} · {nilaiTampil("rekening", d.rekening, master)}
                  {d.rekening_tujuan ? ` → ${nilaiTampil("rekening_tujuan", d.rekening_tujuan, master)}` : ""} · {nilaiTampil("tanggal", d.tanggal, master)}
                  {d.keterangan ? ` · ${d.keterangan}` : ""}
                </div>
                {r.aksi === "UPDATE" && kolom.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {kolom.map((k) => (
                      <div key={k} className="text-xs">
                        <span className="text-md-on-surface-variant">{LABEL_KOLOM[k] || k}: </span>
                        <span className="text-red-400 line-through">{nilaiTampil(k, r.data_lama?.[k], master)}</span>
                        <span className="text-md-on-surface-variant"> → </span>
                        <span className="text-emerald-400 font-medium">{nilaiTampil(k, r.data_baru?.[k], master)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {r.aksi !== "UPDATE" && (
                  <div className={`mt-1.5 text-sm font-semibold ${r.aksi === "DELETE" ? "text-red-400" : "text-emerald-400"}`}>
                    {r.aksi === "DELETE" ? "Dihapus: " : "Nilai: "}
                    {fmtRp(d.jumlah)}
                  </div>
                )}
              </Kartu>
            );
          })}
          {filtered.length > banyak && (
            <button onClick={() => setBanyak((n) => n + 30)} className="w-full py-3 rounded-xl border border-md-outline-variant text-xs font-semibold text-md-primary">
              Tampilkan lebih banyak ({filtered.length - banyak} lagi)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// LAYAR UTAMA
// ---------------------------------------------------------
export default function PengaturanKeuanganHp({ session, entitas, bacaSajaPaksa }) {
  // Menu Keuangan Pusat / Keuangan Perusahaan (GrupHp.jsx) mengunci layar ini ke PT lain lewat `entitas` dan mengatur read-only lewat `bacaSajaPaksa`.
  const kodeAktif = entitas || session?.entitas || ENTITAS_DEFAULT;
  const bacaSaja = bacaSajaPaksa ?? roleHanyaLihat(session?.role);
  const bolehRiwayat = bisa(session?.role, "keuangan.riwayat_perubahan");

  const [master, setMaster] = useState({});
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);
  const [tab, setTab] = useState("rekening"); // rekening | penggunaan | log | riwayat

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  useEffect(() => {
    try {
      sessionStorage.setItem("selma-entitas", kodeAktif);
    } catch {
      /* abaikan */
    }
  }, [kodeAktif]);

  const muat = useCallback(async () => {
    setErr("");
    try {
      setMaster(await muatMaster());
    } catch (e) {
      setErr(e.message || "Gagal memuat pengaturan keuangan");
    } finally {
      setSiap(true);
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  // Master yang sudah dibatasi ke PT akun ini (rekening PT lain tidak tampil) — sama seperti desktop.
  const lingkupMaster = useMemo(
    () => lingkupEntitas([], master, kodeAktif).master,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [master, kodeAktif]
  );
  const kodeHolding = kodeEntitasHolding(master.entitas || []);

  if (!siap) return <Memuat />;
  if (err && !Object.keys(master).length) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="min-w-0 break-words">{err}</div>
          </div>
          <button onClick={() => { setSiap(false); muat(); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-28">
      <div className="p-4 space-y-4">
        {err && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2 flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{err}</span>
            <button onClick={muat} className="underline font-semibold flex-shrink-0">Muat ulang</button>
          </div>
        )}
        {bacaSaja && (
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs px-3 py-2">
            Mode lihat saja — akun ini tidak bisa menambah atau mengubah data.
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          <ChipTab aktif={tab === "rekening"} onClick={() => setTab("rekening")}>Rekening & Kategori</ChipTab>
          <ChipTab aktif={tab === "penggunaan"} onClick={() => setTab("penggunaan")}>Penggunaan Rekening</ChipTab>
          <ChipTab aktif={tab === "log"} onClick={() => setTab("log")}>Log Keterangan</ChipTab>
          {bolehRiwayat && <ChipTab aktif={tab === "riwayat"} onClick={() => setTab("riwayat")}>Riwayat Perubahan</ChipTab>}
        </div>

        {tab === "rekening" && <RekeningKategoriHp master={lingkupMaster} reload={muat} tampilToast={tampilToast} bacaSaja={bacaSaja} entitasKode={kodeAktif} />}
        {tab === "penggunaan" && (
          <PenggunaanRekeningHp master={lingkupMaster} entitasKode={kodeAktif} kodeHolding={kodeHolding} reload={muat} tampilToast={tampilToast} bacaSaja={bacaSaja} />
        )}
        {tab === "log" && <LogKeteranganHp entitasKode={kodeAktif} master={lingkupMaster} reload={muat} tampilToast={tampilToast} bacaSaja={bacaSaja} />}
        {tab === "riwayat" && bolehRiwayat && <RiwayatHp session={session} master={lingkupMaster} />}
      </div>

      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
