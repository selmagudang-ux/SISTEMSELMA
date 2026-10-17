import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Search, AlertTriangle, PackageCheck, ClipboardCheck, ShoppingCart } from "lucide-react";
import {
  ModalShell,
  Field,
  PageHeader,
  EmptyState,
  Badge,
  StatCard,
  InputRupiah,
  InputTanggal,
  inputClass,
  formatTanggalID,
} from "../components/ui";
import { sb, sbAll, fmtRp, nextKode } from "../lib/api";
import { isSuperadminLike } from "../lib/constants";

// =========================================================
// KELENGKAPAN (sub-menu Pengadaan Barang)
// Barang kelengkapan yang ikut dijual (box, kantong, kartu, dst). SKU sendiri
// (KLG-0001), BUKAN dari sku_master; harga beli/grosir/ecer diisi manual.
//
// Tabel (lihat kelengkapan_tahap1.sql):
//   kelengkapan / kelengkapan_stok (view) -> master + stok saat ini
//   kelengkapan_mutasi                    -> riwayat stok:
//     beli(+) retur_beli(-) jual(-) retur_jual(+) koreksi(+/-)
// Stok dihitung dari mutasi (bukan angka tunggal), sama seperti perlengkapan.
//
// Tahap 2: master, pembelian (stok masuk), koreksi, riwayat.
// Belum ada: pencatatan pembelian ke Keuangan (tahap 3) dan pemakaian di
// pesanan Grosir/Reseller/Marketplace (tahap berikutnya) — mutasi "jual"
// sementara hanya bisa muncul dari tahap itu.
// =========================================================

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtJumlah = (n) => (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

const LABEL_TIPE = {
  beli: { label: "Beli", color: "emerald" },
  retur_beli: { label: "Retur Beli", color: "amber" },
  jual: { label: "Jual", color: "sky" },
  retur_jual: { label: "Retur Jual", color: "amber" },
  koreksi: { label: "Koreksi", color: "slate" },
};

export default function Kelengkapan({ showToast, session }) {
  const [tab, setTab] = useState("stok");
  const [stok, setStok] = useState([]);
  const [mutasi, setMutasi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const bisaUbahRiwayat = isSuperadminLike(session?.role);

  // showToast dari App dibuat ulang tiap render — simpan di ref supaya muat() stabil.
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const muat = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        sbAll("kelengkapan_stok?select=*&order=nama"),
        sb("kelengkapan_mutasi?select=*&order=tanggal.desc,id.desc&limit=200"),
      ]);
      setStok(s || []);
      setMutasi(m || []);
    } catch (e) {
      toastRef.current?.(e.message || "Gagal memuat data kelengkapan", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const tutupDanMuat = async (pesan) => {
    setModal(null);
    await muat();
    if (pesan) showToast?.(pesan);
  };

  const aktif = stok.filter((p) => p.aktif !== false);

  return (
    <div>
      <PageHeader
        title="Kelengkapan"
        description="Barang kelengkapan yang ikut dijual (box, kantong, kartu, dll) — SKU dan harga sendiri, terpisah dari Master Barang. Catat pembelian di sini; stok bertambah otomatis."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setModal({ type: "beli", item: null })}
              disabled={aktif.length === 0}
              className="flex items-center gap-1.5 border border-slate-700 text-slate-200 hover:border-amber-500/50 disabled:opacity-40 font-semibold text-xs px-3 py-2 rounded-lg"
            >
              <ShoppingCart size={14} /> Catat Pembelian
            </button>
            <button
              onClick={() => setModal({ type: "barang", item: null })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Tambah Kelengkapan
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {[
          { key: "stok", label: "Stok & Harga" },
          { key: "pembelian", label: "Pembelian" },
          { key: "riwayat", label: "Riwayat Stok" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              tab === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Memuat…</div>
      ) : tab === "stok" ? (
        <TabStok stok={stok} setModal={setModal} />
      ) : tab === "pembelian" ? (
        <TabRiwayat
          mutasi={mutasi.filter((m) => m.tipe === "beli" || m.tipe === "retur_beli")}
          stok={stok}
          bisaUbah={bisaUbahRiwayat}
          setModal={setModal}
          kosong="Belum ada pembelian kelengkapan."
        />
      ) : (
        <TabRiwayat mutasi={mutasi} stok={stok} bisaUbah={bisaUbahRiwayat} setModal={setModal} kosong="Belum ada riwayat stok." />
      )}

      {modal?.type === "barang" && (
        <FormBarang barang={modal.item} stok={stok} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "beli" && (
        <FormBeli barang={modal.item} stok={aktif} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "koreksi" && (
        <FormKoreksi barang={modal.item} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "hapus-mutasi" && bisaUbahRiwayat && (
        <KonfirmasiHapusMutasi
          mutasi={modal.item}
          barang={stok.find((p) => p.id === modal.item.kelengkapan_id)}
          onClose={() => setModal(null)}
          onSaved={tutupDanMuat}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// TAB: STOK & HARGA
// ---------------------------------------------------------
function TabStok({ stok, setModal }) {
  const [q, setQ] = useState("");
  const [tampilNonaktif, setTampilNonaktif] = useState(false);
  const filtered = stok.filter((p) => {
    if (!tampilNonaktif && p.aktif === false) return false;
    const s = q.trim().toLowerCase();
    return !s || p.nama.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
  });
  const habis = stok.filter((p) => p.aktif !== false && Number(p.stok) <= 0).length;
  const nilai = stok.reduce((a, p) => a + Math.max(Number(p.stok) || 0, 0) * (Number(p.harga_beli) || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-2xl">
        <StatCard label="Jenis Kelengkapan" value={String(stok.filter((p) => p.aktif !== false).length)} accent="text-slate-100" icon={PackageCheck} iconColor="text-emerald-500" />
        <StatCard label="Stok Habis" value={String(habis)} accent={habis ? "text-red-400" : "text-slate-100"} icon={AlertTriangle} iconColor="text-red-500" />
        <StatCard label="Nilai Stok (harga beli)" value={fmtRp(nilai)} accent="text-amber-400" icon={PackageCheck} iconColor="text-amber-500" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau SKU…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={tampilNonaktif} onChange={(e) => setTampilNonaktif(e.target.checked)} />
          Tampilkan nonaktif
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={stok.length === 0 ? "Belum ada kelengkapan. Klik Tambah Kelengkapan." : "Tidak ada yang cocok."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => {
            const habisP = Number(p.stok) <= 0;
            return (
              <div key={p.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-200">{p.nama}</span>
                    {p.aktif === false && <Badge color="slate">Nonaktif</Badge>}
                    {habisP && p.aktif !== false && <Badge color="red">Habis</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.sku} · beli {fmtRp(p.harga_beli)} · grosir {fmtRp(p.harga_grosir)} · ecer {fmtRp(p.harga_ecer)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`text-sm font-semibold mr-1 ${habisP ? "text-red-400" : "text-slate-100"}`}>
                    {fmtJumlah(p.stok)} {p.satuan}
                  </div>
                  <button
                    onClick={() => setModal({ type: "beli", item: p })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-slate-800"
                    title="Catat pembelian"
                  >
                    <ShoppingCart size={14} />
                  </button>
                  <button
                    onClick={() => setModal({ type: "koreksi", item: p })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-slate-800"
                    title="Koreksi stok (hitung fisik)"
                  >
                    <ClipboardCheck size={14} />
                  </button>
                  <button
                    onClick={() => setModal({ type: "barang", item: p })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// TAB: RIWAYAT (dipakai juga untuk tab Pembelian dengan data tersaring)
// ---------------------------------------------------------
function TabRiwayat({ mutasi, stok, bisaUbah, setModal, kosong }) {
  const nama = useMemo(() => Object.fromEntries(stok.map((p) => [p.id, p])), [stok]);
  if (mutasi.length === 0) return <EmptyState label={kosong} />;
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      {mutasi.map((m, i) => {
        const p = nama[m.kelengkapan_id];
        const t = LABEL_TIPE[m.tipe] || { label: m.tipe, color: "slate" };
        const jml = Number(m.jumlah) || 0;
        return (
          <div key={m.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-200">{p?.nama || `#${m.kelengkapan_id}`}</span>
                <Badge color={t.color}>{t.label}</Badge>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {formatTanggalID(m.tanggal)}
                {m.harga_satuan != null && ` · ${fmtRp(m.harga_satuan)}/${p?.satuan || "pcs"}`}
                {m.referensi && ` · ${m.referensi}`}
                {m.keterangan && ` · ${m.keterangan}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={`text-sm font-semibold ${jml < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {jml > 0 ? "+" : ""}
                {fmtJumlah(jml)} {p?.satuan}
              </div>
              {bisaUbah && (
                <button
                  onClick={() => setModal({ type: "hapus-mutasi", item: m })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// FORM: TAMBAH / EDIT KELENGKAPAN
// ---------------------------------------------------------
function FormBarang({ barang, stok, onClose, onSaved, showToast }) {
  const [nama, setNama] = useState(barang?.nama || "");
  const [satuan, setSatuan] = useState(barang?.satuan || "pcs");
  const [hargaBeli, setHargaBeli] = useState(barang?.harga_beli ?? "");
  const [hargaGrosir, setHargaGrosir] = useState(barang?.harga_grosir ?? "");
  const [hargaEcer, setHargaEcer] = useState(barang?.harga_ecer ?? "");
  const [aktif, setAktif] = useState(barang ? barang.aktif !== false : true);
  const [stokAwal, setStokAwal] = useState("");
  const [saving, setSaving] = useState(false);

  const simpan = async () => {
    const namaTrim = nama.trim();
    if (!namaTrim) return;
    if (stok.some((p) => p.id !== barang?.id && p.nama.trim().toLowerCase() === namaTrim.toLowerCase())) {
      showToast?.(`Kelengkapan "${namaTrim}" sudah ada`, "err");
      return;
    }
    setSaving(true);
    try {
      const data = {
        nama: namaTrim,
        satuan: satuan.trim() || "pcs",
        harga_beli: Number(hargaBeli) || 0,
        harga_grosir: Number(hargaGrosir) || 0,
        harga_ecer: Number(hargaEcer) || 0,
        aktif,
      };
      if (barang) {
        await sb(`kelengkapan?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
        await onSaved("Kelengkapan diperbarui");
      } else {
        const res = await sb("kelengkapan", { method: "POST", body: JSON.stringify({ ...data, sku: nextKode(stok, "sku", "KLG-") }) });
        const baru = Array.isArray(res) ? res[0] : res;
        if (Number(stokAwal) > 0 && baru?.id) {
          await sb("kelengkapan_mutasi", {
            method: "POST",
            body: JSON.stringify({ kelengkapan_id: baru.id, tipe: "koreksi", jumlah: Number(stokAwal), tanggal: todayIso(), keterangan: "Stok awal" }),
          });
        }
        await onSaved("Kelengkapan ditambahkan");
      }
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  const hapus = async () => {
    setSaving(true);
    try {
      await sb(`kelengkapan?id=eq.${barang.id}`, { method: "DELETE" });
      await onSaved("Kelengkapan dihapus");
    } catch (e) {
      showToast?.("Tidak bisa dihapus. Kalau sudah punya riwayat, nonaktifkan saja.", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={barang ? `Edit ${barang.sku}` : "Tambah Kelengkapan"} onClose={onClose}>
      <Field label="Nama">
        <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Box Perhiasan Kecil" className={inputClass} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Satuan">
          <input value={satuan} onChange={(e) => setSatuan(e.target.value)} placeholder="pcs" className={inputClass} />
        </Field>
        {!barang && (
          <Field label="Stok awal (opsional)">
            <input type="number" min="0" value={stokAwal} onChange={(e) => setStokAwal(e.target.value)} className={inputClass} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Field label="Harga beli">
          <InputRupiah value={hargaBeli} onChange={setHargaBeli} />
        </Field>
        <Field label="Harga grosir">
          <InputRupiah value={hargaGrosir} onChange={setHargaGrosir} />
        </Field>
        <Field label="Harga ecer">
          <InputRupiah value={hargaEcer} onChange={setHargaEcer} />
        </Field>
      </div>
      {barang && (
        <label className="flex items-center gap-2 text-xs text-slate-300 mt-3 cursor-pointer">
          <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} />
          Aktif (bisa dipilih saat pembelian/penjualan)
        </label>
      )}
      <div className="flex gap-2 mt-5">
        {barang && (
          <button onClick={hapus} disabled={saving} className="px-3 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-40">
            Hapus
          </button>
        )}
        <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-300 text-sm py-2.5 rounded-lg hover:bg-slate-800">
          Batal
        </button>
        <button
          onClick={simpan}
          disabled={saving || !nama.trim()}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: CATAT PEMBELIAN (stok masuk)
// ---------------------------------------------------------
function FormBeli({ barang, stok, onClose, onSaved, showToast }) {
  const [id, setId] = useState(barang ? String(barang.id) : "");
  const [tanggal, setTanggal] = useState(todayIso());
  const [jumlah, setJumlah] = useState("");
  const [harga, setHarga] = useState(barang?.harga_beli ?? "");
  const [ref, setRef] = useState("");
  const [ket, setKet] = useState("");
  const [perbaruiHarga, setPerbaruiHarga] = useState(true);
  const [saving, setSaving] = useState(false);

  const pilih = stok.find((p) => String(p.id) === id);
  const bisaSimpan = pilih && Number(jumlah) > 0 && !saving;

  const pilihBarang = (v) => {
    setId(v);
    const p = stok.find((x) => String(x.id) === v);
    if (p) setHarga(p.harga_beli ?? "");
  };

  const simpan = async () => {
    setSaving(true);
    try {
      await sb("kelengkapan_mutasi", {
        method: "POST",
        body: JSON.stringify({
          kelengkapan_id: pilih.id,
          tipe: "beli",
          jumlah: Number(jumlah),
          harga_satuan: Number(harga) || 0,
          tanggal,
          referensi: ref.trim() || null,
          keterangan: ket.trim() || null,
        }),
      });
      if (perbaruiHarga && Number(harga) > 0 && Number(harga) !== Number(pilih.harga_beli)) {
        await sb(`kelengkapan?id=eq.${pilih.id}`, { method: "PATCH", body: JSON.stringify({ harga_beli: Number(harga) }) });
      }
      await onSaved(`Pembelian ${pilih.nama} dicatat`);
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Catat Pembelian Kelengkapan" onClose={onClose}>
      <Field label="Kelengkapan">
        <select value={id} onChange={(e) => pilihBarang(e.target.value)} className={inputClass}>
          <option value="">— pilih —</option>
          {stok.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.nama}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Tanggal">
          <InputTanggal value={tanggal} onChange={setTanggal} />
        </Field>
        <Field label={`Jumlah${pilih ? ` (${pilih.satuan})` : ""}`}>
          <input type="number" min="0" value={jumlah} onChange={(e) => setJumlah(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Harga beli / satuan">
          <InputRupiah value={harga} onChange={setHarga} />
        </Field>
        <Field label="Supplier / No. nota">
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Catatan (opsional)">
        <input value={ket} onChange={(e) => setKet(e.target.value)} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-slate-300 mt-3 cursor-pointer">
        <input type="checkbox" checked={perbaruiHarga} onChange={(e) => setPerbaruiHarga(e.target.checked)} />
        Jadikan harga beli terbaru barang ini
      </label>
      <div className="text-xs text-slate-400 mt-3">
        Total: <span className="text-slate-100 font-semibold">{fmtRp((Number(jumlah) || 0) * (Number(harga) || 0))}</span>
        <span className="text-slate-600"> · belum tercatat ke Keuangan</span>
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-300 text-sm py-2.5 rounded-lg hover:bg-slate-800">
          Batal
        </button>
        <button
          onClick={simpan}
          disabled={!bisaSimpan}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: KOREKSI STOK (hitung fisik)
// ---------------------------------------------------------
function FormKoreksi({ barang, onClose, onSaved, showToast }) {
  const [fisik, setFisik] = useState("");
  const [ket, setKet] = useState("");
  const [saving, setSaving] = useState(false);
  const stokSekarang = Number(barang.stok) || 0;
  const selisih = fisik === "" ? 0 : Number(fisik) - stokSekarang;

  const simpan = async () => {
    setSaving(true);
    try {
      await sb("kelengkapan_mutasi", {
        method: "POST",
        body: JSON.stringify({
          kelengkapan_id: barang.id,
          tipe: "koreksi",
          jumlah: selisih,
          tanggal: todayIso(),
          keterangan: ket.trim() || "Koreksi stok (hitung fisik)",
        }),
      });
      await onSaved("Stok dikoreksi");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Koreksi Stok — ${barang.nama}`} onClose={onClose}>
      <div className="text-xs text-slate-400 mb-3">
        Stok di sistem: {fmtJumlah(stokSekarang)} {barang.satuan}
      </div>
      <Field label={`Stok fisik sebenarnya (${barang.satuan})`}>
        <input type="number" min="0" value={fisik} onChange={(e) => setFisik(e.target.value)} className={inputClass} autoFocus />
      </Field>
      <Field label="Catatan (opsional)">
        <input value={ket} onChange={(e) => setKet(e.target.value)} className={inputClass} />
      </Field>
      {fisik !== "" && (
        <div className="text-xs text-slate-400 mt-3">
          Selisih: <span className={selisih < 0 ? "text-red-400" : "text-emerald-400"}>{selisih > 0 ? "+" : ""}{fmtJumlah(selisih)}</span>
        </div>
      )}
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-300 text-sm py-2.5 rounded-lg hover:bg-slate-800">
          Batal
        </button>
        <button
          onClick={simpan}
          disabled={saving || fisik === "" || Number(fisik) < 0 || selisih === 0}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// KONFIRMASI HAPUS RIWAYAT (superadmin)
// ---------------------------------------------------------
function KonfirmasiHapusMutasi({ mutasi, barang, onClose, onSaved, showToast }) {
  const [saving, setSaving] = useState(false);
  const stokSekarang = Number(barang?.stok) || 0;
  const stokSesudah = stokSekarang - (Number(mutasi.jumlah) || 0);
  const negatif = stokSesudah < 0;

  const hapus = async () => {
    setSaving(true);
    try {
      await sb(`kelengkapan_mutasi?id=eq.${mutasi.id}`, { method: "DELETE" });
      await onSaved("Riwayat dihapus");
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Hapus riwayat stok?" onClose={onClose}>
      <div className="text-sm text-slate-300 mb-3">
        {LABEL_TIPE[mutasi.tipe]?.label || mutasi.tipe} {fmtJumlah(mutasi.jumlah)} {barang?.satuan} · {barang?.nama}
      </div>
      {barang && (
        <div className={`text-xs mb-4 ${negatif ? "text-red-400" : "text-slate-400"}`}>
          {negatif
            ? `Tidak bisa dihapus: stok ${barang.nama} akan menjadi ${fmtJumlah(stokSesudah)} ${barang.satuan}.`
            : `Stok ${barang.nama}: ${fmtJumlah(stokSekarang)} → ${fmtJumlah(stokSesudah)} ${barang.satuan}`}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 border border-slate-700 text-slate-300 text-sm py-2.5 rounded-lg hover:bg-slate-800">
          Batal
        </button>
        <button
          onClick={hapus}
          disabled={saving || negatif}
          className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-lg"
        >
          {saving ? "Menghapus…" : "Hapus"}
        </button>
      </div>
    </ModalShell>
  );
}
