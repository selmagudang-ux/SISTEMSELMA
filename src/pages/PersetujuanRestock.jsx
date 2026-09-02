import { useState } from "react";
import {
  ClipboardList, PackageCheck, Trash2, LayoutGrid, Boxes, ShoppingBag,
  Truck, ImageOff, CheckCircle2, Circle, Download,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState, Badge } from "../components/ui";
import { generatePemesananSupplierPdf } from "../lib/PdfPemesananSupplier";
import { labelFor } from "../lib/api";

function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}

const TABS = [
  { key: "tinjau", label: "Tinjau Pengajuan", icon: ClipboardList },
  { key: "pesan-supplier", label: "Pemesanan ke Supplier", icon: Truck },
];

// Halaman "Persetujuan Restok" — dua tab:
// 1. "Tinjau Pengajuan" — pengajuan restock dari gudang (perilaku lama,
//    tidak berubah — lihat komentar di TinjauPengajuan di bawah).
// 2. "Pemesanan ke Supplier" — alur fisiknya: gudang mengajukan beberapa
//    barang ("menunggu persetujuan") -> owner PILIH sebagian dari situ buat
//    ditawarkan ke satu supplier -> download PDF-nya, dikasih ke supplier ->
//    supplier balas mana yang ready / kosong -> yang ready, ownernya
//    kembali ke tab "Tinjau Pengajuan" dan Setujui seperti biasa (perilaku
//    lama, tidak berubah); yang kosong dibiarkan tetap "menunggu" dulu.
//    Jadi box di tab ini DIAMBIL LANGSUNG dari pengajuan yang masih
//    "menunggu" (bukan diketik manual) — checklist di sini cuma untuk
//    memilih mana yang mau masuk PDF kali ini, tidak mengubah status
//    pengajuannya sama sekali.
export default function PersetujuanRestock({
  pengajuanRestock, session, setModal, filterJenis, onNavigate, skuMaster, items, suppliers, pesananMasuk, master,
}) {
  const [tab, setTab] = useState("tinjau");

  return (
    <div>
      <PageHeader
        title="Persetujuan Restok"
        description={
          tab === "pesan-supplier"
            ? "Kumpulkan barang yang mau dipesan ke supplier, lalu download sebagai PDF."
            : "Pengajuan restock dari gudang — tinjau, dan lihat riwayat yang sudah direspon."
        }
      />

      <div className="flex items-center gap-2 mb-5 bg-slate-900 border border-slate-800 rounded-lg p-1 max-w-md">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition ${
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "tinjau" ? (
        <TinjauPengajuan
          pengajuanRestock={pengajuanRestock}
          session={session}
          setModal={setModal}
          filterJenis={filterJenis}
          onNavigate={onNavigate}
        />
      ) : (
        <PemesananSupplier
          pengajuanRestock={pengajuanRestock}
          skuMaster={skuMaster}
          items={items}
          suppliers={suppliers}
          pesananMasuk={pesananMasuk}
          master={master}
        />
      )}
    </div>
  );
}

// Konten tab "Tinjau Pengajuan" — SAMA PERSIS dengan isi PersetujuanRestock
// sebelum tab ini ada, cuma dipindah jadi sub-komponen (bukan komponen
// halaman utama lagi) supaya bisa hidup berdampingan dengan tab baru.
function TinjauPengajuan({ pengajuanRestock, session, setModal, filterJenis, onNavigate }) {
  const bisaSetujui = ["owner", "superadmin"].includes(session?.role);

  const semua = pengajuanRestock || [];
  const menunggu = [...semua]
    .filter((p) => p.status === "menunggu")
    .filter((p) => !filterJenis || (filterJenis === "zona" ? p.jenis === "zona" : p.jenis !== "zona"))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const riwayat = [...semua]
    .filter((p) => p.status !== "menunggu")
    .sort((a, b) => new Date(b.direspon_pada || b.created_at) - new Date(a.direspon_pada || a.created_at))
    .slice(0, 10);

  const bulanIni = hariIniIso().slice(0, 7);
  const disetujuiBulanIni = semua.filter(
    (p) => p.status === "disetujui" && (p.direspon_pada || "").slice(0, 7) === bulanIni
  ).length;
  const ditolakBulanIni = semua.filter(
    (p) => p.status === "ditolak" && (p.direspon_pada || "").slice(0, 7) === bulanIni
  ).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Menunggu Ditinjau" value={menunggu.length} accent="text-amber-400" icon={ClipboardList} iconColor="text-amber-500" />
        <StatCard label="Disetujui Bulan Ini" value={disetujuiBulanIni} accent="text-emerald-400" icon={PackageCheck} iconColor="text-emerald-500" />
        <StatCard label="Ditolak Bulan Ini" value={ditolakBulanIni} accent="text-red-400" icon={Trash2} iconColor="text-red-500" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
            Menunggu Persetujuan{!bisaSetujui && " (diajukan tim gudang)"}
            {filterJenis && (
              <>
                <Badge color="amber">{filterJenis === "zona" ? "Rak Kosong" : "Restok"}</Badge>
                <button
                  onClick={() => onNavigate && onNavigate("persetujuan-restock")}
                  className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
                >
                  Lihat Semua
                </button>
              </>
            )}
          </div>
          {menunggu.length === 0 ? (
            <EmptyState label="Tidak ada pengajuan yang menunggu persetujuan." />
          ) : (
            <div className="space-y-2">
              {menunggu.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <div className="mt-0.5 w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        {p.jenis === "zona" ? (
                          <LayoutGrid size={14} className="text-amber-500" />
                        ) : (
                          <Boxes size={14} className="text-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        {p.jenis === "zona" ? (
                          <>
                            <div className="text-xs font-semibold text-slate-100 truncate">Zona: {p.zona}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.dibuat_oleh_nama || "—"} · {p.jumlah_rak_kosong} rak kosong
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono text-xs font-semibold text-slate-100 truncate">{p.sku}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.dibuat_oleh_nama || "—"} · stok saat itu {p.stok_saat_ajuan}
                            </div>
                          </>
                        )}
                        {p.catatan && (
                          <div className="text-[11px] text-slate-400 mt-1 italic">"{p.catatan}"</div>
                        )}
                      </div>
                    </div>
                    {bisaSetujui ? (
                      <button
                        onClick={() => setModal({ type: "respon-pengajuan-restock", item: p })}
                        className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950"
                      >
                        Tinjau
                      </button>
                    ) : (
                      <Badge color="amber">Menunggu</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2">Riwayat Pengajuan Terakhir</div>
          {riwayat.length === 0 ? (
            <EmptyState label="Belum ada riwayat pengajuan yang direspon." />
          ) : (
            <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 overflow-hidden">
              {riwayat.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {p.jenis === "zona" ? (
                          <span className="text-xs font-semibold text-slate-200 truncate">Zona: {p.zona}</span>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-slate-200 truncate">{p.sku}</span>
                        )}
                        <Badge color={p.status === "disetujui" ? "emerald" : "red"}>
                          {p.status === "disetujui" ? "Disetujui" : "Ditolak"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Diajukan oleh {p.dibuat_oleh_nama || "—"}
                        {p.jenis === "zona" ? ` · ${p.jumlah_rak_kosong} rak kosong` : ""}
                        {p.catatan_owner ? ` · "${p.catatan_owner}"` : ""}
                      </div>
                    </div>
                    {bisaSetujui && (
                      <button
                        onClick={() => setModal({ type: "hapus-pengajuan-restock", item: p })}
                        title="Hapus riwayat ini"
                        className="text-slate-600 hover:text-red-400 p-1 shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {bisaSetujui && p.status === "disetujui" && p.jenis !== "zona" && (
                    <button
                      onClick={() =>
                        setModal({
                          type: "pesan-barang",
                          item: { dariRestock: true, sku: p.sku, catatanRestock: p.catatan },
                        })
                      }
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <ShoppingBag size={12} /> Buat Pesan Barang
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Konten tab "Pemesanan ke Supplier" — box-nya diambil LANGSUNG dari
// pengajuan_restock yang masih "menunggu" (jenis "sku" — pengajuan "zona"/
// rak kosong tidak relevan di sini, tidak ada barang/foto/suppliernya).
// Tiap box otomatis diisi foto (dari barang dengan SKU sama yang sudah
// pernah difoto — sama pola dengan modal "Tinjau" di tab sebelah) dan
// dugaan awal Model/Kode Supplier (sku_master.barcode_supplier) & Nama
// Toko (ditelusuri dari barang masuk terakhir untuk SKU itu) — keduanya
// tetap bisa diedit manual per box (mis. mau ditawarkan ke toko lain).
// Centang mana yang mau masuk PDF kali ini, lalu download — TIDAK
// mengubah status pengajuan sama sekali (Setujui/Tolak tetap lewat tab
// "Tinjau Pengajuan" seperti biasa, setelah dapat balasan dari supplier).
function PemesananSupplier({ pengajuanRestock, skuMaster, items, suppliers, pesananMasuk, master }) {
  const [checked, setChecked] = useState(() => new Set());
  const [overrides, setOverrides] = useState({}); // { [pengajuanId]: { kodeSupplier?, namaToko? } }
  const [downloading, setDownloading] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState(""); // "" = semua supplier

  const menungguSemua = (pengajuanRestock || [])
    .filter((p) => p.status === "menunggu" && p.jenis !== "zona")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const dataUntuk = (p) => {
    const skuRow = (skuMaster || []).find((s) => s.sku === p.sku) || null;
    const fotoItem = (items || [])
      .filter((i) => i.sku === p.sku && i.foto_url)
      .sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0))[0];
    const itemTerbaru = (items || [])
      .filter((i) => i.sku === p.sku && i.kode_bon)
      .sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0))[0];
    const pesananTerkait = itemTerbaru
      ? (pesananMasuk || []).find((pm) => pm.kode_bon === itemTerbaru.kode_bon)
      : null;
    const ov = overrides[p.id] || {};
    // Label subkategori dari Master Data (skuRow.subkategori masih berupa
    // kode, mis. "JR" -> perlu labelFor supaya jadi "Jurai" dsb). Kalau
    // kodenya belum terdaftar di Master Data, labelFor otomatis fallback
    // menampilkan kodenya sendiri.
    const subKategori = skuRow?.subkategori ? labelFor(master || {}, "subkategori", skuRow.subkategori) : "";
    return {
      id: p.id,
      kodeBarang: p.sku,
      fotoUrl: fotoItem?.foto_url || null,
      kodeSupplier: ov.kodeSupplier != null ? ov.kodeSupplier : skuRow?.barcode_supplier || "",
      namaToko: ov.namaToko != null ? ov.namaToko : pesananTerkait?.supplier || "",
      subKategori,
    };
  };

  // Daftar nama toko/supplier yang dipakai buat opsi filter — gabungan dari
  // master data Supplier DAN nama toko yang ketebak otomatis di pengajuan
  // yang sedang menunggu (supaya toko yang belum terdaftar di master data
  // tapi sudah ketahuan dari riwayat barang masuk tetap muncul sebagai
  // opsi filter).
  const opsiSupplier = Array.from(
    new Set([
      ...(suppliers || []).map((s) => s.nama),
      ...menungguSemua.map((p) => dataUntuk(p).namaToko).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const menunggu = filterSupplier
    ? menungguSemua.filter((p) => dataUntuk(p).namaToko === filterSupplier)
    : menungguSemua;

  const setOverride = (id, field, value) =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const toggleCheck = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const boxTerpilih = menunggu.filter((p) => checked.has(p.id)).map(dataUntuk);

  const downloadPdf = async () => {
    if (boxTerpilih.length === 0 || downloading) return;
    setDownloading(true);
    try {
      await generatePemesananSupplierPdf(boxTerpilih);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <label className="text-[11px] text-slate-500">Filter Supplier:</label>
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-amber-500 max-w-[220px]"
        >
          <option value="">Semua Supplier ({menungguSemua.length})</option>
          {opsiSupplier.map((nama) => (
            <option key={nama} value={nama}>
              {nama}
            </option>
          ))}
        </select>
      </div>

      {menunggu.length === 0 ? (
        <EmptyState
          label={
            filterSupplier
              ? `Tidak ada pengajuan menunggu untuk supplier "${filterSupplier}".`
              : "Tidak ada pengajuan yang menunggu persetujuan — belum ada barang untuk ditawarkan ke supplier."
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-24">
          {menunggu.map((p) => {
            const b = dataUntuk(p);
            return (
              <div
                key={p.id}
                className={`bg-slate-900 border rounded-lg p-3 relative ${
                  checked.has(p.id) ? "border-amber-500 ring-1 ring-amber-500/50" : "border-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCheck(p.id)}
                  className={`absolute top-2 right-2 z-10 rounded-full ${
                    checked.has(p.id) ? "text-amber-400 bg-slate-950" : "text-slate-500 bg-slate-950/80 hover:text-slate-300"
                  }`}
                  title={checked.has(p.id) ? "Batalkan pilih" : "Pilih box ini untuk PDF"}
                >
                  {checked.has(p.id) ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                {b.fotoUrl ? (
                  <img
                    src={b.fotoUrl}
                    alt={b.kodeBarang}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-24 object-cover rounded-md mb-2 border border-slate-800"
                  />
                ) : (
                  <div className="w-full h-24 rounded-md mb-2 border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                    <ImageOff size={18} />
                  </div>
                )}
                <div className="text-xs font-mono text-slate-200 truncate mb-1">{b.kodeBarang}</div>
                {b.subKategori && (
                  <div className="mb-1.5">
                    <Badge color="slate">{b.subKategori}</Badge>
                  </div>
                )}
                <input
                  value={b.kodeSupplier}
                  onChange={(e) => setOverride(p.id, "kodeSupplier", e.target.value)}
                  placeholder="Model/kode supplier…"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] mb-1 outline-none focus:border-amber-500"
                />
                <input
                  value={b.namaToko}
                  onChange={(e) => setOverride(p.id, "namaToko", e.target.value)}
                  list="ps-supplier-list"
                  placeholder="Nama toko/supplier…"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-[11px] outline-none focus:border-amber-500"
                />
              </div>
            );
          })}
        </div>
      )}
      <datalist id="ps-supplier-list">
        {(suppliers || []).map((s) => (
          <option key={s.id} value={s.nama} />
        ))}
      </datalist>

      {boxTerpilih.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900 border border-amber-500/40 rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-xs text-slate-300">
            <span className="text-amber-400 font-semibold">{boxTerpilih.length}</span> box dipilih
          </span>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            <Download size={13} /> {downloading ? "Membuat PDF…" : "Download PDF"}
          </button>
        </div>
      )}
    </div>
  );
}