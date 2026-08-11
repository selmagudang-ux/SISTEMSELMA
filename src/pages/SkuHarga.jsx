import { useState } from "react";
import { Search, Boxes, Download, FileDown, ImageDown, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtRp, downloadCsv, downloadFotos, groupByKategori } from "../lib/api";
import { generateKatalogPdf, fotoUntukSku } from "../lib/PdfKatalog";

export default function SkuHarga({ sub, items, skuMaster, setModal }) {
  if (sub === "buat") return <BuatSkuList items={items} setModal={setModal} />;
  return <MasterBarang skuMaster={skuMaster} items={items} setModal={setModal} />;
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

function MasterBarang({ skuMaster, items, setModal }) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [cetak, setCetak] = useState(null); // { done, total } selagi PDF dibuat
  const [unduhFoto, setUnduhFoto] = useState(null); // { done, total } selagi foto diunduh

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
        { key: "harga_asli", label: "Harga Asli" },
        { key: "hpp", label: "HPP" },
        { key: "grosir", label: "Grosir" },
        { key: "tengah", label: "Tengah" },
        { key: "ecer", label: "Ecer" },
      ],
      filtered
    );
  };

  const handleDownloadPdf = async () => {
    if (filtered.length === 0 || cetak) return;
    setCetak({ done: 0, total: filtered.length });
    try {
      const judulParts = ["Katalog Produk"];
      if (kategori) judulParts.push(kategori);
      if (subkategori) judulParts.push(subkategori);
      await generateKatalogPdf(filtered, items, {
        judul: judulParts.join(" — "),
        onProgress: (done, total) => setCetak({ done, total }),
      });
    } finally {
      setCetak(null);
    }
  };

  // Download foto tiap SKU yang tampil di daftar (nama file = kode SKU).
  // Kalau cuma 1 foto -> langsung download. Kalau lebih -> dibungkus ZIP.
  const handleDownloadFoto = async () => {
    if (filtered.length === 0 || unduhFoto) return;
    const fotos = filtered.map((s) => ({ sku: s.sku, url: fotoUntukSku(s.sku, items) }));
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
              disabled={filtered.length === 0 || !!unduhFoto}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              {unduhFoto ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Mengunduh foto {unduhFoto.done}/{unduhFoto.total}…
                </>
              ) : (
                <>
                  <ImageDown size={14} /> Download Foto
                </>
              )}
            </button>
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
            <option key={k} value={k}>{k}</option>
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
            <option key={sk} value={sk}>{sk}</option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState label="Belum ada barang." />
      ) : (
        <div className="space-y-6">
          {groupByKategori(filtered).map(({ kategori, groups }) => (
            <div key={kategori}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-amber-400">{kategori}</h3>
                <span className="text-[11px] text-slate-500">
                  ({groups.reduce((n, g) => n + g.items.length, 0)} SKU)
                </span>
              </div>
              <div className="space-y-4">
                {groups.map(({ subkategori, items: subItems }) => (
                  <div key={subkategori}>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 pl-1">
                      {subkategori}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {subItems.map((s) => {
                        const adaHargaBaru =
                          s.harga_asli_baru != null && s.harga_asli_baru !== s.harga_asli;
                        const foto = fotoUntukSku(s.sku, items);
                        return (
                          <div
                            key={s.id}
                            onClick={() => setModal({ type: "detail-sku", item: s })}
                            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 cursor-pointer hover:border-amber-500/40"
                          >
                            <div className="flex items-center gap-3 mb-3">
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
                                <div className="mt-0.5">
                                  {s.stok <= 0 ? <Badge color="red">Habis</Badge> : (
                                    <span className="text-[11px] text-slate-500">Stok {s.stok}</span>
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
                            {adaHargaBaru && (
                              <div className="mt-3 pt-3 border-t border-amber-500/30">
                                <div className="text-[11px] text-amber-400 mb-2">
                                  Barang lama masuk dengan harga baru: {fmtRp(s.harga_asli_baru)}. Pilih mau
                                  pakai harga yang mana:
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setModal({ type: "pilih-harga", item: s, pilih: "lama" });
                                    }}
                                    className="flex-1 text-[11px] font-medium border border-slate-700 hover:border-slate-600 text-slate-300 rounded-md py-1.5"
                                  >
                                    Pakai Lama
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setModal({ type: "pilih-harga", item: s, pilih: "baru" });
                                    }}
                                    className="flex-1 text-[11px] font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md py-1.5"
                                  >
                                    Pakai Baru
                                  </button>
                                </div>
                              </div>
                            )}
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