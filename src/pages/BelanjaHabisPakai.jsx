import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Search, AlertTriangle, PackageCheck, Wallet, Minus, ClipboardCheck, X } from "lucide-react";
import {
  ModalShell,
  Field,
  PageHeader,
  EmptyState,
  Badge,
  StatCard,
  InputRupiah,
  InputTanggal,
  SearchableSelectOrNew,
  inputClass,
  formatTanggalID,
  suggestKode,
} from "../components/ui";
import { sb, sbAll, fmtRp, nextKode, petaKasRekening, kasDariRekening, LABEL_KAS, KAS_BESAR, KAS_KECIL } from "../lib/api";

// =========================================================
// BELANJA BARANG HABIS PAKAI (sub-menu Pengadaan Barang)
// Pembelian keperluan usaha yang BUKAN barang dagangan: bubble wrap, lakban,
// ATK, kertas thermal, dst. Tidak masuk SKU / Alur Barang.
//
// Tabel (lihat sql/belanja_habis_pakai.sql):
//   perlengkapan / perlengkapan_stok (view)  -> master barang + stok saat ini
//   belanja_habis_pakai (+ _item)            -> pembelian
//   perlengkapan_mutasi                      -> riwayat stok: masuk(+) pakai(-) koreksi(+/-)
// Stok dihitung dari mutasi (bukan angka tunggal) supaya aman dipakai banyak staff.
// Saat pembelian DIBAYAR, otomatis tercatat sebagai pengeluaran di Keuangan
// (kategori "Barang Habis Pakai"); rekening default-nya Kas Kecil.
// Data dimuat sendiri oleh halaman ini tiap dibuka / setelah tiap aksi.
// =========================================================

const KATEGORI_KEUANGAN = "Barang Habis Pakai";

const todayIso = () => new Date().toISOString().slice(0, 10);

function statusStok(p) {
  const stok = Number(p.stok) || 0;
  const min = Number(p.stok_minimum) || 0;
  if (stok <= 0) return { key: "habis", label: "Habis", color: "red" };
  if (min > 0 && stok <= min) return { key: "menipis", label: "Menipis", color: "amber" };
  return { key: "aman", label: "Aman", color: "emerald" };
}

const fmtJumlah = (n) => (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

export default function BelanjaHabisPakai({ suppliers = [], master = {}, reload, showToast }) {
  const [tab, setTab] = useState("stok");
  const [stok, setStok] = useState([]);
  const [belanja, setBelanja] = useState([]);
  const [item, setItem] = useState([]);
  const [mutasi, setMutasi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  // showToast dari App dibuat ulang tiap render — disimpan di ref supaya muat()
  // stabil dan halaman tidak memuat ulang data terus-menerus.
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  const muat = useCallback(async () => {
    try {
      const [s, b, i, m] = await Promise.all([
        sbAll("perlengkapan_stok?select=*&order=nama"),
        sbAll("belanja_habis_pakai?select=*&order=tanggal.desc,id.desc"),
        sbAll("belanja_habis_pakai_item?select=*"),
        sb("perlengkapan_mutasi?select=*&order=tanggal.desc,id.desc&limit=100"),
      ]);
      setStok(s || []);
      setBelanja(b || []);
      setItem(i || []);
      setMutasi(m || []);
    } catch (e) {
      toastRef.current?.(e.message || "Gagal memuat data", "err");
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

  const perluPerhatian = stok.filter((p) => statusStok(p).key !== "aman");

  return (
    <div>
      <PageHeader
        title="Belanja Barang Habis Pakai"
        description="Pembelian keperluan usaha (bubble wrap, lakban, ATK, dll) dan pemantauan sisa stoknya. Pembelian yang dibayar otomatis tercatat sebagai pengeluaran di Keuangan."
        action={
          tab === "stok" ? (
            <button
              onClick={() => setModal({ type: "barang", item: null })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Tambah Barang
            </button>
          ) : (
            <button
              onClick={() => setModal({ type: "belanja", item: null })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Belanja Baru
            </button>
          )
        }
      />

      {perluPerhatian.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2.5 rounded-lg mb-4">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            {perluPerhatian.length} barang perlu dibeli:{" "}
            {perluPerhatian
              .slice(0, 6)
              .map((p) => `${p.nama} (${fmtJumlah(p.stok)} ${p.satuan})`)
              .join(", ")}
            {perluPerhatian.length > 6 ? ", …" : ""}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {[
          { key: "stok", label: "Stok Perlengkapan" },
          { key: "belanja", label: "Pembelian" },
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
      ) : tab === "belanja" ? (
        <TabBelanja belanja={belanja} item={item} stok={stok} setModal={setModal} />
      ) : (
        <TabRiwayat mutasi={mutasi} stok={stok} />
      )}

      {modal?.type === "barang" && (
        <FormBarang barang={modal.item} stok={stok} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "pakai" && (
        <FormPakai barang={modal.item} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "koreksi" && (
        <FormKoreksi barang={modal.item} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "belanja" && (
        <FormBelanja
          belanja={modal.item}
          itemBelanja={modal.item ? item.filter((x) => x.belanja_id === modal.item.id) : []}
          belanjaList={belanja}
          stok={stok}
          suppliers={suppliers}
          reload={reload}
          onClose={() => setModal(null)}
          onSaved={tutupDanMuat}
          showToast={showToast}
        />
      )}
      {modal?.type === "bayar" && (
        <FormBayar belanja={modal.item} master={master} reload={reload} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
      {modal?.type === "terima" && (
        <KonfirmasiTerima
          belanja={modal.item}
          itemBelanja={item.filter((x) => x.belanja_id === modal.item.id)}
          stok={stok}
          onClose={() => setModal(null)}
          onSaved={tutupDanMuat}
          showToast={showToast}
        />
      )}
      {modal?.type === "hapus-belanja" && (
        <KonfirmasiHapusBelanja belanja={modal.item} reload={reload} onClose={() => setModal(null)} onSaved={tutupDanMuat} showToast={showToast} />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// TAB: STOK PERLENGKAPAN
// ---------------------------------------------------------
function TabStok({ stok, setModal }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("semua");
  const filtered = stok.filter((p) => {
    if (filter !== "semua" && statusStok(p).key !== filter) return false;
    const s = q.trim().toLowerCase();
    return !s || p.nama.toLowerCase().includes(s) || p.kode.toLowerCase().includes(s);
  });
  const jml = (k) => stok.filter((p) => statusStok(p).key === k).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
        <StatCard label="Aman" value={String(jml("aman"))} accent="text-emerald-400" icon={PackageCheck} iconColor="text-emerald-500" />
        <StatCard label="Menipis" value={String(jml("menipis"))} accent="text-amber-400" icon={AlertTriangle} iconColor="text-amber-500" />
        <StatCard label="Habis" value={String(jml("habis"))} accent="text-red-400" icon={AlertTriangle} iconColor="text-red-500" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau kode barang…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="semua">Semua Status</option>
          <option value="menipis">Menipis</option>
          <option value="habis">Habis</option>
          <option value="aman">Aman</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={stok.length === 0 ? "Belum ada barang. Klik Tambah Barang, atau langsung buat Belanja Baru." : "Tidak ada barang yang cocok."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => {
            const st = statusStok(p);
            return (
              <div key={p.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-200">{p.nama}</span>
                    <Badge color={st.color}>{st.label}</Badge>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.kode} · minimum {fmtJumlah(p.stok_minimum)} {p.satuan}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`text-sm font-semibold mr-1 ${st.key === "habis" ? "text-red-400" : st.key === "menipis" ? "text-amber-400" : "text-slate-100"}`}>
                    {fmtJumlah(p.stok)} {p.satuan}
                  </div>
                  <button
                    onClick={() => setModal({ type: "pakai", item: p })}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-amber-300"
                    title="Catat pemakaian"
                  >
                    <Minus size={12} /> Pakai
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
                    title="Edit barang"
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
// TAB: PEMBELIAN
// ---------------------------------------------------------
function TabBelanja({ belanja, item, stok, setModal }) {
  const [q, setQ] = useState("");
  const nama = useMemo(() => Object.fromEntries(stok.map((p) => [p.id, p])), [stok]);
  const filtered = belanja.filter((b) => {
    const s = q.trim().toLowerCase();
    return !s || b.kode.toLowerCase().includes(s) || (b.supplier || "").toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode atau supplier…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={belanja.length === 0 ? "Belum ada pembelian." : "Tidak ada pembelian yang cocok."} />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const rincian = item.filter((x) => x.belanja_id === b.id);
            const bolehEdit = b.status === "dipesan" && !b.dibayar;
            return (
              <div key={b.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-100">{b.kode}</span>
                      <Badge color={b.status === "diterima" ? "emerald" : "sky"}>{b.status === "diterima" ? "Diterima" : "Dipesan"}</Badge>
                      <Badge color={b.dibayar ? "emerald" : "amber"}>{b.dibayar ? "Sudah dibayar" : "Belum dibayar"}</Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {formatTanggalID(b.tanggal)}
                      {b.supplier ? ` · ${b.supplier}` : ""}
                      {b.tanggal_terima ? ` · diterima ${formatTanggalID(b.tanggal_terima)}` : ""}
                    </div>
                  </div>
                  <div className="text-base font-semibold text-slate-100">{fmtRp(b.total)}</div>
                </div>

                <div className="mt-2 text-xs text-slate-400 space-y-0.5">
                  {rincian.map((r) => {
                    const p = nama[r.perlengkapan_id];
                    return (
                      <div key={r.id} className="flex justify-between gap-3">
                        <span>
                          {p?.nama || "Barang dihapus"} — {fmtJumlah(r.jumlah)} {p?.satuan || ""} × {fmtRp(r.harga_satuan)}
                        </span>
                        <span>{fmtRp(r.jumlah * r.harga_satuan)}</span>
                      </div>
                    );
                  })}
                </div>
                {b.catatan && <div className="text-[11px] text-slate-500 mt-2">Catatan: {b.catatan}</div>}

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {b.status === "dipesan" && (
                    <button
                      onClick={() => setModal({ type: "terima", item: b })}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                    >
                      <PackageCheck size={12} /> Terima Barang
                    </button>
                  )}
                  {!b.dibayar && (
                    <button
                      onClick={() => setModal({ type: "bayar", item: b })}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
                    >
                      <Wallet size={12} /> Catat Pembayaran
                    </button>
                  )}
                  {bolehEdit && (
                    <button
                      onClick={() => setModal({ type: "belanja", item: b })}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setModal({ type: "hapus-belanja", item: b })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                    title="Hapus"
                  >
                    <Trash2 size={13} />
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
// TAB: RIWAYAT STOK (100 mutasi terakhir)
// ---------------------------------------------------------
function TabRiwayat({ mutasi, stok }) {
  const nama = useMemo(() => Object.fromEntries(stok.map((p) => [p.id, p])), [stok]);
  const META = { masuk: { label: "Masuk", color: "emerald" }, pakai: { label: "Dipakai", color: "red" }, koreksi: { label: "Koreksi", color: "sky" } };
  if (mutasi.length === 0) return <EmptyState label="Belum ada pergerakan stok." />;
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      {mutasi.map((m, i) => {
        const p = nama[m.perlengkapan_id];
        const meta = META[m.tipe] || META.koreksi;
        const j = Number(m.jumlah) || 0;
        return (
          <div key={m.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color={meta.color}>{meta.label}</Badge>
                <span className="text-sm text-slate-200">{p?.nama || "Barang dihapus"}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                {formatTanggalID(m.tanggal)}
                {m.keterangan ? ` · ${m.keterangan}` : ""}
              </div>
            </div>
            <div className={`text-sm font-semibold flex-shrink-0 ${j >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {j >= 0 ? "+" : ""}
              {fmtJumlah(j)} {p?.satuan || ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// FORM: TAMBAH / EDIT BARANG
// ---------------------------------------------------------
function FormBarang({ barang, stok, onClose, onSaved, showToast }) {
  const [nama, setNama] = useState(barang?.nama || "");
  const [satuan, setSatuan] = useState(barang?.satuan || "pcs");
  const [minimum, setMinimum] = useState(barang?.stok_minimum ?? "");
  const [stokAwal, setStokAwal] = useState("");
  const [saving, setSaving] = useState(false);

  const simpan = async () => {
    const namaTrim = nama.trim();
    if (!namaTrim) return;
    if (stok.some((p) => p.id !== barang?.id && p.nama.trim().toLowerCase() === namaTrim.toLowerCase())) {
      showToast?.(`Barang "${namaTrim}" sudah ada`, "err");
      return;
    }
    setSaving(true);
    try {
      const data = { nama: namaTrim, satuan: satuan.trim() || "pcs", stok_minimum: Number(minimum) || 0 };
      if (barang) {
        await sb(`perlengkapan?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
        await onSaved("Barang diperbarui");
      } else {
        const res = await sb("perlengkapan", { method: "POST", body: JSON.stringify({ ...data, kode: nextKode(stok, "kode", "PLK-") }) });
        const baru = Array.isArray(res) ? res[0] : res;
        if (Number(stokAwal) > 0 && baru?.id) {
          await sb("perlengkapan_mutasi", {
            method: "POST",
            body: JSON.stringify({ perlengkapan_id: baru.id, tipe: "koreksi", jumlah: Number(stokAwal), tanggal: todayIso(), keterangan: "Stok awal" }),
          });
        }
        await onSaved("Barang ditambahkan");
      }
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  const hapus = async () => {
    setSaving(true);
    try {
      await sb(`perlengkapan?id=eq.${barang.id}`, { method: "DELETE" });
      await onSaved("Barang dihapus");
    } catch (e) {
      showToast?.("Barang tidak bisa dihapus karena sudah punya riwayat pembelian/stok.", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={barang ? "Edit Barang" : "Tambah Barang Habis Pakai"} onClose={onClose}>
      <Field label="Nama Barang">
        <input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Cth: Bubble wrap 50cm" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Satuan">
          <input className={inputClass} value={satuan} onChange={(e) => setSatuan(e.target.value)} placeholder="roll / pak / pcs / rim" />
        </Field>
        <Field label="Stok Minimum">
          <input
            className={inputClass}
            inputMode="decimal"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Peringatan jika ≤ ini"
          />
        </Field>
      </div>
      {!barang && (
        <Field label="Stok Awal (opsional)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={stokAwal}
            onChange={(e) => setStokAwal(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Sisa yang ada sekarang"
          />
        </Field>
      )}
      <button
        disabled={!nama.trim() || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
      {barang && (
        <button disabled={saving} onClick={hapus} className="w-full mt-2 text-xs text-slate-500 hover:text-red-400 py-2">
          Hapus barang ini
        </button>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: CATAT PEMAKAIAN
// ---------------------------------------------------------
function FormPakai({ barang, onClose, onSaved, showToast }) {
  const [jumlah, setJumlah] = useState("");
  const [tanggal, setTanggal] = useState(todayIso());
  const [ket, setKet] = useState("");
  const [saving, setSaving] = useState(false);
  const j = Number(jumlah) || 0;
  const melebihi = j > Number(barang.stok);

  const simpan = async () => {
    setSaving(true);
    try {
      await sb("perlengkapan_mutasi", {
        method: "POST",
        body: JSON.stringify({ perlengkapan_id: barang.id, tipe: "pakai", jumlah: -j, tanggal, keterangan: ket.trim() || null }),
      });
      await onSaved(`${barang.nama} dipakai ${fmtJumlah(j)} ${barang.satuan}`);
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Pakai: ${barang.nama}`} onClose={onClose}>
      <div className="text-xs text-slate-500 -mt-1 mb-3">
        Stok saat ini {fmtJumlah(barang.stok)} {barang.satuan}
      </div>
      <Field label={`Jumlah dipakai (${barang.satuan})`}>
        <input
          className={inputClass}
          inputMode="decimal"
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value.replace(/[^\d.]/g, ""))}
          autoFocus
        />
        {melebihi && <div className="text-[11px] text-red-400 mt-1">Melebihi stok yang tercatat. Kalau stok fisik lebih banyak, koreksi stoknya dulu.</div>}
      </Field>
      <Field label="Tanggal">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Cth: packing pesanan grosir" />
      </Field>
      <button
        disabled={j <= 0 || melebihi || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: KOREKSI STOK (hasil hitung fisik)
// ---------------------------------------------------------
function FormKoreksi({ barang, onClose, onSaved, showToast }) {
  const [fisik, setFisik] = useState("");
  const [ket, setKet] = useState("");
  const [saving, setSaving] = useState(false);
  const selisih = fisik === "" ? 0 : Number(fisik) - Number(barang.stok);

  const simpan = async () => {
    setSaving(true);
    try {
      await sb("perlengkapan_mutasi", {
        method: "POST",
        body: JSON.stringify({ perlengkapan_id: barang.id, tipe: "koreksi", jumlah: selisih, tanggal: todayIso(), keterangan: ket.trim() || "Koreksi stok (hitung fisik)" }),
      });
      await onSaved("Stok dikoreksi");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Koreksi Stok: ${barang.nama}`} onClose={onClose}>
      <div className="text-xs text-slate-500 -mt-1 mb-3">
        Stok di sistem {fmtJumlah(barang.stok)} {barang.satuan}
      </div>
      <Field label={`Hasil hitung fisik (${barang.satuan})`}>
        <input
          className={inputClass}
          inputMode="decimal"
          value={fisik}
          onChange={(e) => setFisik(e.target.value.replace(/[^\d.]/g, ""))}
          autoFocus
        />
        {fisik !== "" && (
          <div className={`text-[11px] mt-1 ${selisih === 0 ? "text-slate-500" : selisih > 0 ? "text-emerald-400" : "text-red-400"}`}>
            Selisih {selisih > 0 ? "+" : ""}
            {fmtJumlah(selisih)} {barang.satuan}
          </div>
        )}
      </Field>
      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Cth: hitung ulang akhir bulan" />
      </Field>
      <button
        disabled={fisik === "" || selisih === 0 || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan Koreksi"}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: BELANJA BARU / EDIT (selama masih Dipesan & belum dibayar)
// ---------------------------------------------------------
const barisKosong = () => ({ key: Math.random().toString(36).slice(2), perlengkapan_id: "", kodeBaru: "", namaBaru: "", satuanBaru: "pcs", jumlah: "", harga: "" });

function FormBelanja({ belanja, itemBelanja, belanjaList, stok, suppliers, reload, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(belanja?.tanggal || todayIso());
  const [supplier, setSupplier] = useState(belanja?.supplier || "");
  const [supplierBaruKode, setSupplierBaruKode] = useState("");
  const [supplierBaru, setSupplierBaru] = useState("");
  const [catatan, setCatatan] = useState(belanja?.catatan || "");
  const [baris, setBaris] = useState(
    itemBelanja.length
      ? itemBelanja.map((r) => ({ key: `r${r.id}`, perlengkapan_id: String(r.perlengkapan_id), kodeBaru: "", namaBaru: "", satuanBaru: "pcs", jumlah: r.jumlah, harga: r.harga_satuan }))
      : [barisKosong()]
  );
  const [saving, setSaving] = useState(false);

  const barangOptions = stok.map((p) => ({ value: String(p.id), label: `${p.nama} (${p.satuan})` }));
  const supplierOptions = (suppliers || []).map((s) => ({ value: s.nama, label: s.nama }));

  const ubah = (key, patch) => setBaris((b) => b.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const barisValid = (r) => (r.perlengkapan_id || r.namaBaru.trim()) && Number(r.jumlah) > 0;
  const total = baris.reduce((a, r) => a + (Number(r.jumlah) || 0) * (Number(r.harga) || 0), 0);
  const bisaSimpan = baris.some(barisValid) && baris.filter((r) => r.perlengkapan_id || r.namaBaru.trim()).every(barisValid) && !saving;

  const simpan = async () => {
    setSaving(true);
    try {
      // 1. Supplier: kalau nama baru, daftarkan ke Data Supplier (best-effort, senyap).
      const namaSupplier = (supplier || supplierBaru).trim();
      if (supplierBaru.trim() && !supplier) {
        const ada = (suppliers || []).some((s) => (s.nama || "").trim().toLowerCase() === namaSupplier.toLowerCase());
        if (!ada) {
          try {
            await sb("suppliers", {
              method: "POST",
              body: JSON.stringify({ kode: nextKode(suppliers, "kode", "SUP-"), nama: namaSupplier, models: [] }),
            });
            reload?.();
          } catch (e) {
            console.error("Gagal mendaftarkan supplier baru:", e);
          }
        }
      }

      // 2. Barang baru -> buat di master perlengkapan dulu.
      let daftarStok = stok;
      const rincian = [];
      for (const r of baris.filter(barisValid)) {
        let pid = r.perlengkapan_id;
        if (!pid) {
          const nama = r.namaBaru.trim();
          const sudah = daftarStok.find((p) => p.nama.trim().toLowerCase() === nama.toLowerCase());
          if (sudah) {
            pid = String(sudah.id);
          } else {
            const res = await sb("perlengkapan", {
              method: "POST",
              body: JSON.stringify({ kode: nextKode(daftarStok, "kode", "PLK-"), nama, satuan: r.satuanBaru.trim() || "pcs", stok_minimum: 0 }),
            });
            const baru = Array.isArray(res) ? res[0] : res;
            pid = String(baru.id);
            daftarStok = [...daftarStok, { ...baru, stok: 0 }];
          }
        }
        rincian.push({ perlengkapan_id: Number(pid), jumlah: Number(r.jumlah), harga_satuan: Number(r.harga) || 0 });
      }
      const totalFinal = rincian.reduce((a, r) => a + r.jumlah * r.harga_satuan, 0);

      // 3. Header + rincian.
      const header = { tanggal, supplier: namaSupplier || null, catatan: catatan.trim() || null, total: totalFinal };
      let belanjaId = belanja?.id;
      if (belanja) {
        await sb(`belanja_habis_pakai?id=eq.${belanja.id}`, { method: "PATCH", body: JSON.stringify(header) });
        await sb(`belanja_habis_pakai_item?belanja_id=eq.${belanja.id}`, { method: "DELETE" });
      } else {
        const res = await sb("belanja_habis_pakai", {
          method: "POST",
          body: JSON.stringify({ ...header, kode: nextKode(belanjaList, "kode", "BHP-"), status: "dipesan" }),
        });
        belanjaId = (Array.isArray(res) ? res[0] : res).id;
      }
      await sb("belanja_habis_pakai_item", { method: "POST", body: JSON.stringify(rincian.map((r) => ({ ...r, belanja_id: belanjaId }))) });
      await onSaved(belanja ? "Belanja diperbarui" : "Belanja dicatat");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={belanja ? `Edit ${belanja.kode}` : "Belanja Barang Habis Pakai"} onClose={onClose} maxWidth="max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal">
          <InputTanggal value={tanggal} onChange={setTanggal} />
        </Field>
        <Field label="Supplier / Toko">
          <SearchableSelectOrNew
            value={supplier}
            onChange={setSupplier}
            newKode={supplierBaruKode}
            onNewKodeChange={setSupplierBaruKode}
            newLabel={supplierBaru}
            onNewLabelChange={setSupplierBaru}
            options={supplierOptions}
            placeholder="Cari supplier…"
            newPlaceholder="Nama supplier baru"
          />
        </Field>
      </div>

      <div className="text-xs text-slate-400 mb-1.5">Barang yang dibeli</div>
      <div className="space-y-2.5 mb-2">
        {baris.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-800 p-2.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <SearchableSelectOrNew
                  value={r.perlengkapan_id}
                  onChange={(v) => ubah(r.key, { perlengkapan_id: v })}
                  newKode={r.kodeBaru}
                  onNewKodeChange={(v) => ubah(r.key, { kodeBaru: v })}
                  newLabel={r.namaBaru}
                  onNewLabelChange={(v) => ubah(r.key, { namaBaru: v })}
                  options={barangOptions}
                  placeholder="Cari barang…"
                  newPlaceholder="Nama barang baru"
                />
              </div>
              {baris.length > 1 && (
                <button
                  type="button"
                  onClick={() => setBaris((b) => b.filter((x) => x.key !== r.key))}
                  className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 flex-shrink-0"
                  title="Hapus baris"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Jumlah</div>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={r.jumlah}
                  onChange={(e) => ubah(r.key, { jumlah: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </div>
              <div className="col-span-2">
                <div className="text-[10px] text-slate-500 mb-1">Harga satuan (Rp)</div>
                <InputRupiah value={r.harga} onChange={(v) => ubah(r.key, { harga: v })} />
              </div>
            </div>
            {!r.perlengkapan_id && r.namaBaru.trim() && (
              <div className="mt-2">
                <div className="text-[10px] text-slate-500 mb-1">Barang baru — satuannya</div>
                <input
                  className={inputClass}
                  value={r.satuanBaru}
                  onChange={(e) => ubah(r.key, { satuanBaru: e.target.value })}
                  placeholder="roll / pak / pcs / rim"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setBaris((b) => [...b, barisKosong()])}
        className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 hover:text-amber-300 mb-3"
      >
        <Plus size={12} /> Tambah Barang
      </button>

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-slate-400">Total</span>
        <span className="font-semibold text-slate-100">{fmtRp(total)}</span>
      </div>
      <button
        disabled={!bisaSimpan}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// KONFIRMASI: TERIMA BARANG -> stok bertambah
// ---------------------------------------------------------
function KonfirmasiTerima({ belanja, itemBelanja, stok, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const nama = useMemo(() => Object.fromEntries(stok.map((p) => [p.id, p])), [stok]);

  const terima = async () => {
    setSaving(true);
    try {
      await sb("perlengkapan_mutasi", {
        method: "POST",
        body: JSON.stringify(
          itemBelanja.map((r) => ({
            perlengkapan_id: r.perlengkapan_id,
            tipe: "masuk",
            jumlah: Number(r.jumlah),
            tanggal,
            keterangan: `Belanja ${belanja.kode}`,
            belanja_id: belanja.id,
          }))
        ),
      });
      await sb(`belanja_habis_pakai?id=eq.${belanja.id}`, { method: "PATCH", body: JSON.stringify({ status: "diterima", tanggal_terima: tanggal }) });
      await onSaved("Barang diterima, stok bertambah");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Terima Barang ${belanja.kode}`} onClose={onClose}>
      <div className="text-xs text-slate-400 mb-3 space-y-0.5">
        {itemBelanja.map((r) => (
          <div key={r.id}>
            + {fmtJumlah(r.jumlah)} {nama[r.perlengkapan_id]?.satuan} {nama[r.perlengkapan_id]?.nama}
          </div>
        ))}
      </div>
      <Field label="Tanggal diterima">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <button
        disabled={saving || itemBelanja.length === 0}
        onClick={terima}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Ya, Barang Sudah Diterima"}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// FORM: CATAT PEMBAYARAN -> pengeluaran di Keuangan
// ---------------------------------------------------------
function FormBayar({ belanja, master, reload, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(todayIso());
  const rekeningList = master.rekening || [];
  const petaKas = petaKasRekening(master.kas_grup);
  const [rekening, setRekening] = useState("");
  const [saving, setSaving] = useState(false);

  const grup = (k) => rekeningList.filter((r) => kasDariRekening(petaKas, r.kode) === k);

  // Kategori Keuangan "Barang Habis Pakai": pakai yang sudah ada, kalau belum ada dibuat otomatis.
  const cariAtauBuatKategori = async () => {
    const daftar = master.kategori_keluar || [];
    const cocok = daftar.find((m) => (m.label || "").trim().toLowerCase() === KATEGORI_KEUANGAN.toLowerCase());
    if (cocok) return cocok.kode;
    let kode = suggestKode(KATEGORI_KEUANGAN);
    if (daftar.some((m) => m.kode === kode)) kode = `${kode}${daftar.length + 1}`;
    await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "kategori_keluar", kode, label: KATEGORI_KEUANGAN }) });
    return kode;
  };

  const bayar = async () => {
    setSaving(true);
    try {
      const kategori = await cariAtauBuatKategori();
      const res = await sb("keuangan_transaksi", {
        method: "POST",
        body: JSON.stringify({
          tanggal,
          tipe: "keluar",
          rekening,
          kategori,
          jumlah: Number(belanja.total),
          keterangan: `Belanja ${belanja.kode}${belanja.supplier ? ` - ${belanja.supplier}` : ""}`,
        }),
      });
      const trx = Array.isArray(res) ? res[0] : res;
      await sb(`belanja_habis_pakai?id=eq.${belanja.id}`, {
        method: "PATCH",
        body: JSON.stringify({ dibayar: true, rekening, tanggal_bayar: tanggal, keuangan_transaksi_id: trx?.id ?? null }),
      });
      reload?.();
      await onSaved("Pembayaran dicatat di Keuangan");
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Bayar ${belanja.kode}`} onClose={onClose}>
      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-slate-400">Total</span>
        <span className="font-semibold text-slate-100">{fmtRp(belanja.total)}</span>
      </div>
      <Field label="Dibayar dari rekening">
        <select className={inputClass} value={rekening} onChange={(e) => setRekening(e.target.value)}>
          <option value="">Pilih rekening…</option>
          {[KAS_KECIL, KAS_BESAR].map(
            (k) =>
              grup(k).length > 0 && (
                <optgroup key={k} label={LABEL_KAS[k]}>
                  {grup(k).map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.label} ({r.kode})
                    </option>
                  ))}
                </optgroup>
              )
          )}
        </select>
        {rekeningList.length === 0 && (
          <div className="text-[11px] text-amber-400 mt-1">Belum ada rekening. Buat dulu di Keuangan → Rekening & Kategori.</div>
        )}
      </Field>
      <Field label="Tanggal bayar">
        <InputTanggal value={tanggal} onChange={setTanggal} />
      </Field>
      <div className="text-[11px] text-slate-500 mb-3">
        Tercatat sebagai pengeluaran kategori "{KATEGORI_KEUANGAN}" di Keuangan.
      </div>
      <button
        disabled={!rekening || Number(belanja.total) <= 0 || saving}
        onClick={bayar}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Catat Pembayaran"}
      </button>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// KONFIRMASI: HAPUS BELANJA (ikut menghapus pengeluaran di Keuangan & stok masuknya)
// ---------------------------------------------------------
function KonfirmasiHapusBelanja({ belanja, reload, onClose, onSaved, showToast }) {
  const [saving, setSaving] = useState(false);
  const hapus = async () => {
    setSaving(true);
    try {
      if (belanja.keuangan_transaksi_id) {
        await sb(`keuangan_transaksi?id=eq.${belanja.keuangan_transaksi_id}`, { method: "DELETE" });
        reload?.();
      }
      // rincian & mutasi stok masuk ikut terhapus (on delete cascade)
      await sb(`belanja_habis_pakai?id=eq.${belanja.id}`, { method: "DELETE" });
      await onSaved("Belanja dihapus");
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "err");
      setSaving(false);
    }
  };
  return (
    <ModalShell title="Hapus Belanja" onClose={onClose}>
      <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">{belanja.kode}</span> ({fmtRp(belanja.total)}) akan dihapus permanen.
          {belanja.status === "diterima" && " Stok yang sudah masuk dari belanja ini ikut dikurangi."}
          {belanja.dibayar && " Pengeluarannya di Keuangan juga ikut dihapus."}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50">
          Batal
        </button>
        <button
          onClick={hapus}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
        >
          <Trash2 size={14} /> Ya, Hapus
        </button>
      </div>
    </ModalShell>
  );
}
