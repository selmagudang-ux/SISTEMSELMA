import { useState } from "react";
import { Search, Boxes, Download, FileDown, ImageDown, Loader2, Check, Trash2, Pencil } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtRp, downloadCsv, downloadFotos, groupByKategori, labelFor } from "../lib/api";
import { generateKatalogPdf, fotoUntukSku } from "../lib/PdfKatalog";
import { rakForSku } from "./Rak";
import MasterData from "./MasterData";
import ImportSku from "./ImportSku";

export default function SkuHarga({ sub, items, skuMaster, master, penempatan, setModal, reload, showToast, session }) {
  if (sub === "buat") return <BuatSkuList items={items} setModal={setModal} />;
  if (sub === "kategori") return <MasterData master={master} skuMaster={skuMaster} reload={reload} showToast={showToast} />;
  if (sub === "import") return <ImportSku master={master} skuMaster={skuMaster} reload={reload} showToast={showToast} />;
  return (
    <MasterBarang
      skuMaster={skuMaster}
      items={items}
      master={master}
      penempatan={penempatan}
      setModal={setModal}
      session={session}
    />
  );
}

function BuatSkuList({ items, setModal }) {
  const belumSku = items.filter((i) => i.stage === "sku");
  return (
    <div>
      <PageHeader
        title="Buat SKU"
        description="Cari dulu apakah SKU-nya sudah ada. Kalau ketemu, stok tinggal ditambahkan. Kalau belum ada, buat SKU baru."
      />
      {belumSku.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu pembuatan SKU." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {belumSku.map((item) => (
            <button
              key={item.id}
              onClick={() => setModal({ type: "buat-sku", item })}
              className="text-left bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-lg p-3 transition"
            >
              <Boxes size={16} className="text-amber-400 mb-2" />
              <div className="text-xs font-mono text-slate-300">#{item.id.slice(0, 8)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {item.jumlah}x · {item.tanggal}
              </div>
              <div className="mt-2 text-[11px] font-medium text-amber-400">
                Cari / Buat SKU →
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MasterBarang({ skuMaster, items, master, penempatan, setModal, session }) {
  const isSuperadmin = session?.role === "superadmin";
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [cetak, setCetak] = useState(null); // { done, total } selagi PDF dibuat
  const [unduhFoto, setUnduhFoto] = useState(null); // { done, total } selagi foto diunduh
  const [selected, setSelected] = useState(() => new Set()); // sku yang dipilih untuk download foto
  const [tampilkanNonaktif, setTampilkanNonaktif] = useState(false); // SKU nonaktif (bekas dihapus) disembunyikan secara default

  // Nama lengkap kategori/subkategori dari Master Data, bukan kode-nya.
  // Kalau kode belum terdaftar di Master Data, tampilkan kode itu sendiri (fallback labelFor).
  const kategoriLabel = (kode) => labelFor(master || {}, "kategori", kode);
  const subkategoriLabel = (kode) => labelFor(master || {}, "subkategori", kode);

  const toggleSelect = (sku) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  // Daftar kategori unik dari semua SKU yang ada, buat isi dropdown.
  const kategoriOptions = Array.from(
    new Set(skuMaster.map((s) => s.kategori).filter(Boolean))
  ).sort();

  // Daftar subkategori unik — kalau kategori sudah dipilih, subkategori
  // dipersempit hanya yang muncul di kategori itu saja.
  const subkategoriOptions = Array.from(
    new Set(
      skuMaster
        .filter((s) => !kategori || s.kategori === kategori)
        .map((s) => s.subkategori)
        .filter(Boolean)
    )
  ).sort();

  const filtered = skuMaster.filter((s) => {
    if (!tampilkanNonaktif && s.nonaktif) return false;
    if (!s.sku.toLowerCase().includes(q.toLowerCase())) return false;
    if (kategori && s.kategori !== kategori) return false;
    if (subkategori && s.subkategori !== subkategori) return false;
    return true;
  });

  // Kalau kategori diganti dan subkategori yang sedang dipilih ternyata
  // tidak ada di kategori baru itu, reset supaya tidak nyangkut jadi
  // filter kosong yang membingungkan.
  const handleKategoriChange = (val) => {
    setKategori(val);
    setSubkategori("");
  };

  const handleDownloadCsv = () => {
    downloadCsv(
      `master-barang-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "sku", label: "SKU" },
        { key: "stok", label: "Stok" },
        { key: "rak", label: "Rak" },
        { key: "harga_asli", label: "Harga Asli" },
        { key: "hpp", label: "HPP" },
        { key: "grosir", label: "Grosir" },
        { key: "tengah", label: "Tengah" },
        { key: "ecer", label: "Ecer" },
      ],
      filtered.map((s) => ({ ...s, rak: rakForSku(s.sku, penempatan) || "" }))
    );
  };

  const handleDownloadPdf = async () => {
    if (filtered.length === 0 || cetak) return;
    setCetak({ done: 0, total: filtered.length });
    try {
      const judulParts = ["Katalog Produk"];
      if (kategori) judulParts.push(kategoriLabel(kategori));
      if (subkategori) judulParts.push(subkategoriLabel(subkategori));
      await generateKatalogPdf(filtered, items, {
        judul: judulParts.join(" — "),
        onProgress: (done, total) => setCetak({ done, total }),
      });
    } finally {
      setCetak(null);
    }
  };

  // Download foto tiap SKU (nama file = kode SKU). Kalau ada barang yang dicentang,
  // hanya foto barang yang dipilih itu yang diunduh — kalau tidak ada yang dicentang,
  // pakai semua SKU yang sedang tampil di daftar (sesuai filter).
  // Kalau cuma 1 foto -> langsung download. Kalau lebih -> dibungkus ZIP.
  const handleDownloadFoto = async () => {
    const sumber = selected.size > 0 ? skuMaster.filter((s) => selected.has(s.sku)) : filtered;
    if (sumber.length === 0 || unduhFoto) return;
    const fotos = sumber.map((s) => ({ sku: s.sku, url: fotoUntukSku(s.sku, items) }));
    if (fotos.every((f) => !f.url)) {
      alert("Tidak ada foto untuk SKU pada daftar ini.");
      return;
    }
    setUnduhFoto({ done: 0, total: fotos.filter((f) => f.url).length });
    try {
      await downloadFotos(fotos, { onProgress: (done, total) => setUnduhFoto({ done, total }) });
    } finally {
      setUnduhFoto(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Master Barang"
        description="Data lengkap tiap SKU — foto, harga asli, HPP, dan harga jual (Grosir / Tengah / Ecer). Untuk ubah persentase markup, buka menu Pengaturan."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              <Download size={14} /> Download CSV
            </button>
            <button
              onClick={handleDownloadFoto}
              disabled={(selected.size === 0 && filtered.length === 0) || !!unduhFoto}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              {unduhFoto ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Mengunduh foto {unduhFoto.done}/{unduhFoto.total}…
                </>
              ) : (
                <>
                  <ImageDown size={14} />
                  {selected.size > 0 ? `Download Foto Terpilih (${selected.size})` : "Download Foto"}
                </>
              )}
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
              >
                Batal pilih
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={filtered.length === 0 || !!cetak}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              {cetak ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Memuat foto {cetak.done}/{cetak.total}…
                </>
              ) : (
                <>
                  <FileDown size={14} /> Download PDF Katalog
                </>
              )}
            </button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKU…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select
          value={kategori}
          onChange={(e) => handleKategoriChange(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
        >
          <option value="">Semua Kategori</option>
          {kategoriOptions.map((k) => (
            <option key={k} value={k}>{kategoriLabel(k)}</option>
          ))}
        </select>
        <select
          value={subkategori}
          onChange={(e) => setSubkategori(e.target.value)}
          disabled={subkategoriOptions.length === 0}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none disabled:opacity-40"
        >
          <option value="">Semua Subkategori</option>
          {subkategoriOptions.map((sk) => (
            <option key={sk} value={sk}>{subkategoriLabel(sk)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={tampilkanNonaktif}
            onChange={(e) => setTampilkanNonaktif(e.target.checked)}
            className="accent-amber-500"
          />
          Tampilkan yang nonaktif
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState label="Belum ada barang." />
      ) : (
        <div className="space-y-6">
          {groupByKategori(filtered).map(({ kategori, groups }) => (
            <div key={kategori}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-amber-400">{kategoriLabel(kategori)}</h3>
                <span className="text-[11px] text-slate-500">
                  ({groups.reduce((n, g) => n + g.items.length, 0)} SKU)
                </span>
              </div>
              <div className="space-y-4">
                {groups.map(({ subkategori, items: subItems }) => (
                  <div key={subkategori}>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 pl-1">
                      {subkategoriLabel(subkategori)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {subItems.map((s) => {
                        const adaHargaBaru =
                          s.harga_asli_baru != null && s.harga_asli_baru !== s.harga_asli;
                        const foto = fotoUntukSku(s.sku, items);
                        const dipilih = selected.has(s.sku);
                        const kodeRak = rakForSku(s.sku, penempatan);
                        return (
                          <div
                            key={s.id}
                            onClick={() => setModal({ type: "detail-sku", item: s })}
                            className={`relative rounded-xl border bg-slate-900/50 p-4 cursor-pointer transition ${
                              s.nonaktif ? "opacity-60" : ""
                            } ${
                              dipilih ? "border-amber-500/60 ring-1 ring-amber-500/30" : "border-slate-800 hover:border-amber-500/40"
                            }`}
                          >
                            {s.nonaktif && (
                              <span className="absolute top-2.5 left-2.5 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full px-2 py-0.5 z-10">
                                Nonaktif
                              </span>
                            )}
                            {adaHargaBaru && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModal({ type: "pilih-harga", item: s });
                                }}
                                title="Ada perubahan harga asli — klik untuk pilih harga yang dipakai"
                                className="absolute top-2.5 right-9 flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full pl-1.5 pr-2 py-0.5 hover:bg-red-500/25"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                Harga Baru
                              </button>
                            )}
                            {isSuperadmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModal({ type: "edit-harga", item: s });
                                }}
                                title="Edit harga (khusus superadmin)"
                                className="absolute top-11 right-2.5 p-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 hover:text-amber-400 hover:border-amber-500/40"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModal({ type: "hapus-sku", item: s });
                              }}
                              title="Hapus SKU ini"
                              className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/40"
                            >
                              <Trash2 size={12} />
                            </button>
                            <div className="flex items-center gap-3 mb-3 pr-4">
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md border border-slate-700 bg-slate-950 cursor-pointer"
                                title="Pilih untuk download foto"
                              >
                                <input
                                  type="checkbox"
                                  checked={dipilih}
                                  onChange={() => toggleSelect(s.sku)}
                                  className="sr-only"
                                />
                                {dipilih && <Check size={13} className="text-amber-400" />}
                              </label>
                              {foto ? (
                                <img
                                  src={foto}
                                  alt={s.sku}
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-800 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg border border-dashed border-slate-800 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-mono text-xs text-slate-300 truncate">{s.sku}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  {s.stok <= 0 ? <Badge color="red">Habis</Badge> : (
                                    <span className="text-[11px] text-slate-500">Stok {s.stok}</span>
                                  )}
                                  {kodeRak && (
                                    <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded px-1.5 py-0.5">
                                      {kodeRak}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-slate-500 text-xs">Harga Asli</span>
                              <span className="text-slate-400">{fmtRp(s.harga_asli)}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-slate-500 text-xs">HPP</span>
                              <span className="text-slate-400">{fmtRp(s.hpp)}</span>
                            </div>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500 text-xs">Grosir</span>
                                <span className="text-slate-200">{fmtRp(s.grosir)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500 text-xs">Tengah</span>
                                <span className="text-slate-200">{fmtRp(s.tengah)}</span>
                              </div>
                              <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1.5">
                                <span className="text-slate-500 text-xs">Ecer</span>
                                <span className="text-amber-400 font-semibold">{fmtRp(s.ecer)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}