import { useState } from "react";
import { Search, Boxes, Download, FileDown, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtRp, downloadCsv, groupByKategori } from "../lib/api";
import { generateKatalogPdf } from "../lib/PdfKatalog";

export default function SkuHarga({ sub, items, skuMaster, setModal }) {
  if (sub === "buat") return <BuatSkuList items={items} setModal={setModal} />;
  if (sub === "master-harga") return <MasterHarga skuMaster={skuMaster} items={items} />;
  return <MasterSku skuMaster={skuMaster} items={items} setModal={setModal} />;
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

function MasterSku({ skuMaster, items, setModal }) {
  const [q, setQ] = useState("");
  const [cetak, setCetak] = useState(null); // { done, total } selagi PDF dibuat
  const filtered = skuMaster.filter((s) => s.sku.toLowerCase().includes(q.toLowerCase()));

  const handleDownload = () => {
    downloadCsv(
      `master-sku-${new Date().toISOString().slice(0, 10)}.csv`,
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
      await generateKatalogPdf(filtered, items, {
        judul: "Katalog Produk",
        onProgress: (done, total) => setCetak({ done, total }),
      });
    } finally {
      setCetak(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Master SKU"
        description="Semua kode SKU yang pernah dibuat, lengkap dengan stok dan harga."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              <Download size={14} /> Download CSV
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
      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState label="Belum ada SKU." />
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
                    <div className="rounded-xl border border-slate-800 overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead>
                          <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                            <th className="px-4 py-2.5">SKU</th>
                            <th className="px-4 py-2.5">Stok</th>
                            <th className="px-4 py-2.5">Harga Asli</th>
                            <th className="px-4 py-2.5">HPP</th>
                            <th className="px-4 py-2.5">Grosir</th>
                            <th className="px-4 py-2.5">Tengah</th>
                            <th className="px-4 py-2.5">Ecer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subItems.map((s) => (
                            <tr
                              key={s.id}
                              onClick={() => setModal({ type: "detail-sku", item: s })}
                              className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/50 cursor-pointer"
                            >
                              <td className="px-4 py-2.5 font-mono text-xs">{s.sku}</td>
                              <td className="px-4 py-2.5">
                                {s.stok <= 0 ? <Badge color="red">Habis</Badge> : s.stok}
                              </td>
                              <td className="px-4 py-2.5 text-slate-400">{fmtRp(s.harga_asli)}</td>
                              <td className="px-4 py-2.5 text-slate-400">{fmtRp(s.hpp)}</td>
                              <td className="px-4 py-2.5">{fmtRp(s.grosir)}</td>
                              <td className="px-4 py-2.5">{fmtRp(s.tengah)}</td>
                              <td className="px-4 py-2.5 font-semibold text-amber-400">{fmtRp(s.ecer)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

function MasterHarga({ skuMaster, items }) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [cetak, setCetak] = useState(null); // { done, total } selagi PDF dibuat

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
      `master-sku-${new Date().toISOString().slice(0, 10)}.csv`,
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

  return (
    <div>
      <PageHeader
        title="Master Harga"
        description="Daftar harga jual per SKU (Grosir / Tengah / Ecer). Untuk ubah persentase markup, buka menu Pengaturan."
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
        <EmptyState label="Belum ada data harga." />
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
                      {subItems.map((s) => (
                        <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                          <div className="font-mono text-xs text-slate-300 mb-3">{s.sku}</div>
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
                      ))}
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