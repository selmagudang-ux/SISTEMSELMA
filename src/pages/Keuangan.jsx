import { useState } from "react";
import { Plus, Search, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, Landmark } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge } from "../components/ui";
import { fmtRp, ringkasanKeuangan, saldoPerRekening, sb } from "../lib/api";

// Bulan berjalan (YYYY-MM-01 s/d hari ini) sebagai rentang default saat
// halaman pertama dibuka — cukup relevan buat cek arus kas "bulan ini"
// tanpa perlu atur filter dulu, tapi tetap bisa diubah bebas.
function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}

// Cari label rekening/kategori dari kode-nya di master data. Kalau kode tidak
// ketemu di daftar (mis. sudah dihapus), tampilkan kode-nya saja sebagai fallback.
function labelDari(list, kode) {
  if (!kode) return "";
  const found = (list || []).find((m) => m.kode === kode);
  return found ? found.label : kode;
}

export default function Keuangan({ sub, keuanganTransaksi = [], master = {}, reload, showToast, setModal }) {
  if (sub === "rekening") {
    return <RekeningKategori master={master} reload={reload} showToast={showToast} />;
  }
  return (
    <Transaksi keuanganTransaksi={keuanganTransaksi} master={master} setModal={setModal} />
  );
}

function Transaksi({ keuanganTransaksi, master, setModal }) {
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniIso());
  const [tipeFilter, setTipeFilter] = useState("");
  const [q, setQ] = useState("");

  const rekeningList = master.rekening || [];
  const kategoriMasukList = master.kategori_masuk || [];
  const kategoriKeluarList = master.kategori_keluar || [];

  const { masuk, keluar, saldo, list } = ringkasanKeuangan(keuanganTransaksi, dari || null, sampai || null);
  const saldoRekening = saldoPerRekening(keuanganTransaksi, rekeningList);

  const filtered = list
    .filter((t) => !tipeFilter || t.tipe === tipeFilter)
    .filter((t) => {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      const kategoriLabel = labelDari(t.tipe === "masuk" ? kategoriMasukList : kategoriKeluarList, t.kategori);
      const rekeningLabel = labelDari(rekeningList, t.rekening);
      return (
        kategoriLabel.toLowerCase().includes(s) ||
        rekeningLabel.toLowerCase().includes(s) ||
        (t.keterangan || "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));

  return (
    <div>
      <PageHeader
        title="Keuangan"
        description="Pencatatan kas masuk, kas keluar, dan transfer antar rekening. Ringkasan mengikuti rentang tanggal yang dipilih di bawah."
        action={
          <button
            onClick={() => setModal({ type: "keuangan-transaksi-form" })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Transaksi
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Kas Masuk" value={fmtRp(masuk)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Kas Keluar" value={fmtRp(keluar)} accent="text-red-400" icon={TrendingDown} iconColor="text-red-500" />
        <StatCard
          label="Saldo (Masuk - Keluar)"
          value={fmtRp(saldo)}
          accent={saldo >= 0 ? "text-emerald-400" : "text-red-400"}
          icon={Wallet}
          iconColor={saldo >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

      {rekeningList.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-slate-400 mb-2">Saldo per Rekening (akumulasi seluruh transaksi)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {saldoRekening.map((r) => (
              <div key={r.kode} className="rounded-xl border border-slate-800 p-3 bg-slate-900/50">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                  <Landmark size={12} /> {r.label}
                </div>
                <div className={`text-base font-semibold ${r.saldo >= 0 ? "text-slate-100" : "text-red-400"}`}>
                  {fmtRp(r.saldo)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <input type="date" className={`${inputClass} w-auto`} value={dari} onChange={(e) => setDari(e.target.value)} />
          <span className="text-slate-500 text-xs">s/d</span>
          <input type="date" className={`${inputClass} w-auto`} value={sampai} onChange={(e) => setSampai(e.target.value)} />
        </div>
        <select value={tipeFilter} onChange={(e) => setTipeFilter(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Semua Jenis</option>
          <option value="masuk">Pemasukan</option>
          <option value="keluar">Pengeluaran</option>
          <option value="transfer">Transfer Antar Rekening</option>
        </select>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kategori, rekening, atau keterangan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || tipeFilter ? "Tidak ada transaksi yang cocok." : "Belum ada transaksi di rentang ini."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((t, i) => {
            const isTransfer = t.tipe === "transfer";
            const kategoriLabel = labelDari(t.tipe === "masuk" ? kategoriMasukList : kategoriKeluarList, t.kategori);
            const rekeningLabel = labelDari(rekeningList, t.rekening);
            const rekeningTujuanLabel = labelDari(rekeningList, t.rekening_tujuan);
            return (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <button
                  onClick={() => setModal({ type: "keuangan-transaksi-form", item: t })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isTransfer ? (
                      <Badge color="sky">Transfer</Badge>
                    ) : (
                      <Badge color={t.tipe === "masuk" ? "emerald" : "red"}>{kategoriLabel}</Badge>
                    )}
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      {isTransfer ? (
                        <>
                          {rekeningLabel} <ArrowRightLeft size={10} /> {rekeningTujuanLabel}
                        </>
                      ) : (
                        rekeningLabel
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {t.tanggal}{t.keterangan ? ` · ${t.keterangan}` : ""}
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className={`text-sm font-semibold ${
                      isTransfer ? "text-sky-400" : t.tipe === "masuk" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isTransfer ? "" : t.tipe === "masuk" ? "+" : "-"}{fmtRp(t.jumlah)}
                  </div>
                  <button
                    onClick={() => setModal({ type: "keuangan-transaksi-form", item: t })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setModal({ type: "hapus-keuangan-transaksi", item: t })}
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

// Halaman kelola daftar Rekening & Kategori yang didaftarkan user sendiri.
// Disimpan di tabel master_data yang sama dipakai untuk kode SKU (bahan,
// warna, dst), tapi dengan tipe berbeda supaya tidak tercampur:
//   - "rekening"        -> daftar rekening/kas (mis. Kas Toko, BCA, dst)
//   - "kategori_masuk"  -> kategori pemasukan (dipakai saat tipe = Pemasukan)
//   - "kategori_keluar" -> kategori pengeluaran (dipakai saat tipe = Pengeluaran)
const TAB_KEUANGAN = [
  { key: "rekening", label: "Rekening", placeholderKode: "BCA", placeholderLabel: "Bank BCA - 12345" },
  { key: "kategori_masuk", label: "Kategori Pemasukan", placeholderKode: "JUAL", placeholderLabel: "Penjualan Produk" },
  { key: "kategori_keluar", label: "Kategori Pengeluaran", placeholderKode: "GAJI", placeholderLabel: "Gaji Karyawan" },
];

function RekeningKategori({ master, reload, showToast }) {
  const [activeTab, setActiveTab] = useState("rekening");
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const tabInfo = TAB_KEUANGAN.find((t) => t.key === activeTab);
  const list = master[activeTab] || [];

  const addEntry = async () => {
    if (!kode.trim() || !label.trim()) return;
    setSaving(true);
    try {
      await sb("master_data", {
        method: "POST",
        body: JSON.stringify({ tipe: activeTab, kode: kode.trim().toUpperCase(), label: label.trim() }),
      });
      setKode("");
      setLabel("");
      await reload();
      showToast("Ditambahkan");
    } catch (e) {
      showToast(e.message || "Gagal menambah", "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    try {
      await sb(`master_data?id=eq.${id}`, { method: "DELETE" });
      await reload();
      showToast("Dihapus");
    } catch (e) {
      showToast(e.message || "Gagal menghapus", "err");
    }
  };

  return (
    <div>
      <PageHeader
        title="Rekening & Kategori"
        description="Daftar rekening (sumber dana) dan kategori pemasukan/pengeluaran yang muncul di form Transaksi Keuangan. Kelola sendiri sesuai kebutuhan bisnis Anda."
      />

      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {TAB_KEUANGAN.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 mb-4 max-w-lg">
        <div className="flex-1">
          <div className="text-xs text-slate-400 mb-1">Kode</div>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            placeholder={`Cth: ${tabInfo.placeholderKode}`}
            className={inputClass}
          />
        </div>
        <div className="flex-[2]">
          <div className="text-xs text-slate-400 mb-1">Nama</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Cth: ${tabInfo.placeholderLabel}`}
            className={inputClass}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
        </div>
        <button
          disabled={!kode.trim() || !label.trim() || saving}
          onClick={addEntry}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg h-[38px]"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden max-w-lg">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            Belum ada data untuk {tabInfo.label}.
          </div>
        ) : (
          list.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-amber-400 w-14">{m.kode}</span>
                <span className="text-sm text-slate-200">{m.label}</span>
              </div>
              <button
                onClick={() => deleteEntry(m.id)}
                className="text-slate-600 hover:text-red-400"
                title="Hapus"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}