import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Landmark, Pencil, Trash2, Search, ImageIcon, Wallet, TrendingDown, Coins, Boxes } from "lucide-react";
import { PageHeader, EmptyState, StatCard, Badge, ModalShell, Field, inputClass, InputRupiah, InputTanggal, SearchableSelect, formatTanggalID } from "../components/ui";
import { sb, fmtRp, sbUploadFoto, kompresFotoProduk } from "../lib/api";
import { bisa } from "../lib/constants";
import { KATEGORI_ASET, STATUS_ASET, asetMasihDimiliki, hitungPenyusutan, ringkasAset, kodeAsetBerikut } from "../lib/aset";

// =========================================================
// BARANG ASET (sub-menu Pengadaan Barang di ADMIN GUDANG)
// Catatan aset tetap perusahaan (komputer, rak, printer, kendaraan, dst) + penyusutan otomatis (garis lurus).
// Penyusutan dihitung dari harga beli, umur pakai, nilai sisa & tanggal beli (lib/aset.js) — tidak diinput per bulan.
// Tabel: aset (supabase/migrations/20261121_aset.sql), dipisah per PT otomatis lewat sb().
// =========================================================

const hariIni = () => new Date().toISOString().slice(0, 10);

const OPSI_KATEGORI = Object.entries(KATEGORI_ASET).map(([value, m]) => ({ value, label: m.label }));
const OPSI_STATUS = Object.entries(STATUS_ASET).map(([value, m]) => ({ value, label: m.label }));

const formKosong = (kode) => ({
  kode,
  nama: "",
  kategori: "peralatan",
  tanggal_beli: hariIni(),
  harga_beli: "",
  umur_tahun: KATEGORI_ASET.peralatan.umurBawaan,
  nilai_sisa: 0,
  lokasi: "",
  pemegang: "",
  status: "aktif",
  tanggal_lepas: "",
  catatan: "",
  foto_url: "",
});

function FormAset({ awal, onSimpan, onClose, menyimpan }) {
  const [f, setF] = useState(awal);
  const [file, setFile] = useState(null);
  const [pratinjau, setPratinjau] = useState(awal.foto_url || "");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const lepas = f.status === "dijual" || f.status === "hilang";
  const h = hitungPenyusutan({ ...f, harga_beli: Number(f.harga_beli) || 0, tanggal_lepas: lepas ? f.tanggal_lepas || hariIni() : null });

  const pilihFile = (e) => {
    const x = e.target.files?.[0];
    if (!x) return;
    setFile(x);
    setPratinjau(URL.createObjectURL(x));
  };

  const kirim = (e) => {
    e.preventDefault();
    onSimpan(f, file);
  };

  return (
    <ModalShell title={awal.id ? "Edit Aset" : "Tambah Aset"} onClose={onClose} maxWidth="max-w-lg" konfirmasiTutup>
      <form onSubmit={kirim} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kode">
            <input className={inputClass} value={f.kode} onChange={(e) => set("kode", e.target.value)} />
          </Field>
          <Field label="Kategori">
            <SearchableSelect
              value={f.kategori}
              onChange={(v) => {
                set("kategori", v);
                // Umur bawaan ikut kategori, tapi hanya saat aset baru (tidak menimpa angka aset yang sedang diedit).
                if (!awal.id) set("umur_tahun", KATEGORI_ASET[v]?.umurBawaan || 4);
              }}
              options={OPSI_KATEGORI}
            />
          </Field>
        </div>
        <Field label="Nama aset">
          <input className={inputClass} value={f.nama} onChange={(e) => set("nama", e.target.value)} placeholder="mis. Laptop kasir Acer, Rak besi 5 susun" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal beli">
            <InputTanggal value={f.tanggal_beli} onChange={(v) => set("tanggal_beli", v)} />
          </Field>
          <Field label="Harga beli (Rp)">
            <InputRupiah value={f.harga_beli} onChange={(v) => set("harga_beli", v)} />
          </Field>
          <Field label="Umur pakai (tahun)">
            <input type="number" min="0.5" step="0.5" className={inputClass} value={f.umur_tahun} onChange={(e) => set("umur_tahun", e.target.value)} />
          </Field>
          <Field label="Nilai sisa (Rp)">
            <InputRupiah value={f.nilai_sisa} onChange={(v) => set("nilai_sisa", v)} />
          </Field>
        </div>

        {Number(f.harga_beli) > 0 && Number(f.umur_tahun) > 0 && (
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-[11px] text-slate-400 space-y-0.5">
            <div>
              Susut per bulan: <span className="text-slate-200 font-semibold">{fmtRp(h.perBulan)}</span>
              {" · "}Sudah berjalan {h.bulanBerjalan} dari {h.umurBulan} bulan
            </div>
            <div>
              Akumulasi susut: <span className="text-amber-400 font-semibold">{fmtRp(h.akumulasi)}</span>
              {" · "}Nilai buku sekarang: <span className="text-emerald-400 font-semibold">{fmtRp(h.nilaiBuku)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lokasi">
            <input className={inputClass} value={f.lokasi} onChange={(e) => set("lokasi", e.target.value)} placeholder="mis. Gudang, Toko" />
          </Field>
          <Field label="Pemegang / penanggung jawab">
            <input className={inputClass} value={f.pemegang} onChange={(e) => set("pemegang", e.target.value)} />
          </Field>
          <Field label="Status">
            <SearchableSelect value={f.status} onChange={(v) => set("status", v)} options={OPSI_STATUS} />
          </Field>
          {lepas && (
            <Field label={f.status === "dijual" ? "Tanggal dijual" : "Tanggal hilang / dibuang"}>
              <InputTanggal value={f.tanggal_lepas || hariIni()} onChange={(v) => set("tanggal_lepas", v)} />
            </Field>
          )}
        </div>
        <Field label="Catatan">
          <textarea className={inputClass} rows={2} value={f.catatan} onChange={(e) => set("catatan", e.target.value)} />
        </Field>
        <Field label="Foto aset / nota (opsional)">
          <div className="flex items-center gap-3">
            {pratinjau ? (
              <img src={pratinjau} alt="Foto aset" className="w-14 h-14 rounded-lg object-cover border border-slate-800" />
            ) : (
              <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                <ImageIcon size={18} />
              </div>
            )}
            <input type="file" accept="image/*" onChange={pilihFile} className="text-xs text-slate-400" />
          </div>
        </Field>

        <button
          disabled={menyimpan}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {menyimpan ? "Menyimpan…" : awal.id ? "Simpan Perubahan" : "Simpan Aset"}
        </button>
      </form>
    </ModalShell>
  );
}

export default function Aset({ session, showToast }) {
  const bolehKelola = bisa(session?.role, "aset.kelola"); // izin Hak Akses (bawaan: semua role yang bisa membuka menu ini)
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [tabelAda, setTabelAda] = useState(true);
  const [q, setQ] = useState("");
  const [fKategori, setFKategori] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [modal, setModal] = useState(null); // {awal}
  const [menyimpan, setMenyimpan] = useState(false);
  const toast = (pesan, jenis) => showToast?.(pesan, jenis);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setRows((await sb("aset?order=tanggal_beli.desc,id.desc&limit=1000")) || []);
      setTabelAda(true);
    } catch (e) {
      if (/aset|schema cache|does not exist|42P01|PGRST205/i.test(`${e.message} ${e.pgCode || ""}`)) setTabelAda(false);
      else toast(e.message || "Gagal memuat aset", "err");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const ringkas = useMemo(() => ringkasAset(rows), [rows]);

  const tampil = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (fKategori && a.kategori !== fKategori) return false;
      if (fStatus && a.status !== fStatus) return false;
      if (!kata) return true;
      return [a.kode, a.nama, a.lokasi, a.pemegang].some((x) => String(x || "").toLowerCase().includes(kata));
    });
  }, [rows, q, fKategori, fStatus]);

  const simpan = async (f, file) => {
    const nama = f.nama.trim();
    if (!nama) return toast("Nama aset wajib diisi", "err");
    if (!f.tanggal_beli) return toast("Tanggal beli wajib diisi", "err");
    if (!(Number(f.harga_beli) > 0)) return toast("Harga beli wajib diisi", "err");
    if (!(Number(f.umur_tahun) > 0)) return toast("Umur pakai harus lebih dari 0", "err");
    if (Number(f.nilai_sisa) > Number(f.harga_beli)) return toast("Nilai sisa tidak boleh lebih besar dari harga beli", "err");

    setMenyimpan(true);
    try {
      let foto_url = f.foto_url || null;
      if (file) {
        const kecil = await kompresFotoProduk(file, { maxDim: 1600, quality: 0.88 });
        foto_url = await sbUploadFoto(kecil, `aset-${Date.now()}.jpg`);
      }
      const lepas = f.status === "dijual" || f.status === "hilang";
      const data = {
        kode: f.kode.trim() || null,
        nama,
        kategori: f.kategori,
        tanggal_beli: f.tanggal_beli,
        harga_beli: Number(f.harga_beli) || 0,
        umur_tahun: Number(f.umur_tahun) || 0,
        nilai_sisa: Number(f.nilai_sisa) || 0,
        lokasi: f.lokasi.trim() || null,
        pemegang: f.pemegang.trim() || null,
        status: f.status,
        tanggal_lepas: lepas ? f.tanggal_lepas || hariIni() : null,
        catatan: f.catatan.trim() || null,
        foto_url,
      };
      if (f.id) {
        const hasil = await sb(`aset?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify(data) });
        if (!hasil?.length) throw new Error("Perubahan tidak tersimpan (data sudah berubah / ditolak database). Muat ulang.");
      } else {
        await sb("aset", { method: "POST", body: JSON.stringify({ ...data, dibuat_oleh: session?.username || null }) });
      }
      setModal(null);
      await muat();
      toast(f.id ? "Aset diperbarui" : "Aset ditambahkan");
    } catch (e) {
      toast(e.message || "Gagal menyimpan aset", "err");
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (a) => {
    if (!window.confirm(`Hapus aset "${a.nama}"? Kalau asetnya dijual atau hilang, lebih baik ubah statusnya saja supaya riwayatnya tetap ada.`)) return;
    try {
      const hasil = await sb(`aset?id=eq.${a.id}`, { method: "DELETE" });
      if (!hasil?.length) throw new Error("Aset tidak terhapus (sudah terhapus / ditolak database). Muat ulang.");
      await muat();
      toast("Aset dihapus");
    } catch (e) {
      toast(e.message || "Gagal menghapus aset", "err");
    }
  };

  const bukaTambah = () => setModal({ awal: formKosong(kodeAsetBerikut(rows)) });
  const bukaEdit = (a) =>
    setModal({
      awal: {
        ...formKosong(""),
        ...a,
        harga_beli: Number(a.harga_beli) || 0,
        nilai_sisa: Number(a.nilai_sisa) || 0,
        kode: a.kode || "",
        lokasi: a.lokasi || "",
        pemegang: a.pemegang || "",
        catatan: a.catatan || "",
        foto_url: a.foto_url || "",
        tanggal_lepas: a.tanggal_lepas || "",
      },
    });

  return (
    <div>
      <PageHeader
        title="Barang Aset"
        description="Pencatatan aset perusahaan (komputer, rak, printer, kendaraan, dan sejenisnya). Penyusutan dihitung otomatis dengan metode garis lurus, tidak perlu diinput per bulan."
        action={
          bolehKelola ? (
            <button
              onClick={bukaTambah}
              disabled={!tabelAda}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Tambah Aset
            </button>
          ) : null
        }
      />

      {!tabelAda ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300 max-w-xl">
          Tabel <span className="font-mono">aset</span> belum dibuat di database. Jalankan file{" "}
          <span className="font-mono">supabase/migrations/20261121_aset.sql</span> di Supabase Studio (SQL Editor), lalu muat ulang halaman ini.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Jumlah Aset" value={ringkas.jumlah} icon={Boxes} accent="text-slate-200" iconColor="text-slate-400" sub="Aktif + rusak (tidak termasuk dijual/hilang)" />
            <StatCard label="Harga Perolehan" value={fmtRp(ringkas.harga)} icon={Wallet} accent="text-sky-400" iconColor="text-sky-500" sub="Total harga beli" />
            <StatCard
              label="Akumulasi Penyusutan"
              value={fmtRp(ringkas.akumulasi)}
              icon={TrendingDown}
              accent="text-amber-400"
              iconColor="text-amber-500"
              sub={`Susut ${fmtRp(ringkas.perBulan)} per bulan`}
            />
            <StatCard label="Nilai Buku" value={fmtRp(ringkas.nilaiBuku)} icon={Coins} accent="text-emerald-400" iconColor="text-emerald-500" sub="Harga beli dikurangi akumulasi susut" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className={`${inputClass} pl-9`} placeholder="Cari kode, nama, lokasi, pemegang…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={`${inputClass} w-auto`} value={fKategori} onChange={(e) => setFKategori(e.target.value)}>
              <option value="">Semua kategori</option>
              {OPSI_KATEGORI.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select className={`${inputClass} w-auto`} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Semua status</option>
              {OPSI_STATUS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {memuat ? (
            <div className="text-xs text-slate-500 py-8 text-center">Memuat aset…</div>
          ) : tampil.length === 0 ? (
            <EmptyState label={rows.length === 0 ? "Belum ada aset. Klik “Tambah Aset” untuk mencatat aset pertama." : "Tidak ada aset yang cocok dengan pencarian."} />
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2.5">Aset</th>
                    <th className="px-3 py-2.5">Tgl Beli</th>
                    <th className="px-3 py-2.5">Umur</th>
                    <th className="px-3 py-2.5 text-right">Harga Beli</th>
                    <th className="px-3 py-2.5 text-right">Susut / Bulan</th>
                    <th className="px-3 py-2.5 text-right">Akumulasi</th>
                    <th className="px-3 py-2.5 text-right">Nilai Buku</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((a) => {
                    const h = hitungPenyusutan(a);
                    const meta = STATUS_ASET[a.status] || STATUS_ASET.aktif;
                    const redup = !asetMasihDimiliki(a);
                    return (
                      <tr key={a.id} className={`border-b border-slate-800/60 last:border-0 ${redup ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {a.foto_url ? (
                              <a href={a.foto_url} target="_blank" rel="noreferrer" className="shrink-0" title="Buka foto">
                                <img src={a.foto_url} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-800" />
                              </a>
                            ) : (
                              <div className="w-9 h-9 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700 shrink-0">
                                <Landmark size={15} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-slate-200 font-medium truncate">{a.nama}</div>
                              <div className="text-[10px] text-slate-500 truncate">
                                <span className="font-mono text-amber-400/80">{a.kode || "—"}</span> · {KATEGORI_ASET[a.kategori]?.label || a.kategori}
                                {a.lokasi ? ` · ${a.lokasi}` : ""}
                                {a.pemegang ? ` · ${a.pemegang}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{formatTanggalID(a.tanggal_beli)}</td>
                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                          {Number(a.umur_tahun)} th
                          <div className="text-[10px] text-slate-500">
                            {h.habisDisusutkan ? "habis disusutkan" : `sisa ${h.sisaBulan} bln`}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300 text-right whitespace-nowrap">{fmtRp(h.harga)}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-right whitespace-nowrap">{h.habisDisusutkan ? "—" : fmtRp(h.perBulan)}</td>
                        <td className="px-3 py-2.5 text-amber-400 text-right whitespace-nowrap">{fmtRp(h.akumulasi)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="text-emerald-400 font-medium">{fmtRp(h.nilaiBuku)}</div>
                          <div className="h-1 rounded-full bg-slate-800 mt-1 overflow-hidden" title={`${Math.round(h.persen * 100)}% sudah disusutkan`}>
                            <div className="h-full bg-amber-500/70" style={{ width: `${Math.round(h.persen * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge color={meta.color}>{meta.label}</Badge>
                          {redup && a.tanggal_lepas && <div className="text-[10px] text-slate-500 mt-0.5">{formatTanggalID(a.tanggal_lepas)}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {bolehKelola && (
                            <>
                              <button onClick={() => bukaEdit(a)} title="Edit aset" className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => hapus(a)} title="Hapus aset" className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal && <FormAset awal={modal.awal} onSimpan={simpan} onClose={() => setModal(null)} menyimpan={menyimpan} />}
    </div>
  );
}
