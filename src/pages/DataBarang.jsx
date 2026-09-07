import { useState } from "react";
import { Search, Camera, Download, Plus } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { STAGE_META } from "../lib/constants";
import { downloadCsv } from "../lib/api";
import { rakForSku } from "./Rak";

// Warna badge untuk jenis barang masuk (field "gudang" di tabel items menyimpan
// nilai Pembelian/Retur/Lainnya, lihat BarangMasukForm) — dipetakan ke warna
// yang konsisten dengan dropdown pilihan jenisnya.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

// Jumlah baris per halaman di tabel Alur Barang — sama seperti pola
// pagination di Pesanan Barang (BarangDatang.jsx), supaya konsisten &
// tabel tidak memanjang tanpa batas begitu datanya ratusan baris.
const BARIS_PER_HALAMAN = 10;

export default function DataBarang({ items, penempatan, skuMaster, setModal }) {
  const [q, setQ] = useState("");
  // "" = semua tahap. Filter ini berdiri sendiri dari pencarian teks (q) —
  // keduanya digabung (AND) di `filtered` di bawah.
  const [tahapFilter, setTahapFilter] = useState("");
  const [halaman, setHalaman] = useState(1);

  // Kode rak diambil dari data penempatan terbaru (sumber yang sama dengan Peta Rak),
  // BUKAN dari field items.rak_code yang bisa basi kalau SKU-nya sudah dipindah rak.
  const rakSaatIni = (i) => rakForSku(i.sku, penempatan);

  // Untuk barang yang masih di tahap "Buat SKU" (belum resmi punya i.sku),
  // cari tahu dulu apakah Model/Barcode Supplier-nya cocok PERSIS SATU SKU
  // yang sudah pernah dibuat (sama seperti logika auto-hubung di form "Buat
  // SKU", lihat SkuEntryForm di components/forms.jsx) — kalau ketemu, tabel
  // ini langsung menampilkan SKU itu & tahapnya ditampilkan sebagai "Sudah
  // Ada SKU · Isi Harga" (bukan "Buat SKU" lagi), supaya kelihatan dari sini
  // saja kalau barang ini sebenarnya tinggal dikonfirmasi harga, tanpa perlu
  // buka modalnya dulu. Kalau modelnya cocok ke lebih dari satu SKU, tidak
  // ditebak sepihak — tetap tampil "Buat SKU" seperti biasa, biar dipilih
  // manual di modalnya.
  const skuCocokOtomatis = (i) => {
    if (i.stage !== "sku" || i.sku) return null;
    const kode = (i.barcode_supplier || "").trim().toLowerCase();
    if (!kode) return null;
    const cocok = (skuMaster || []).filter(
      (s) => (s.barcode_supplier || "").trim().toLowerCase() === kode
    );
    return cocok.length === 1 ? cocok[0] : null;
  };

  const filtered = items.filter((i) => {
    const s = q.toLowerCase();
    const cocokTeks =
      !s ||
      (i.sku || "").toLowerCase().includes(s) ||
      (i.barcode_supplier || "").toLowerCase().includes(s) ||
      (i.gudang || "").toLowerCase().includes(s) ||
      rakSaatIni(i).toLowerCase().includes(s);
    const cocokTahap = !tahapFilter || i.stage === tahapFilter;
    return cocokTeks && cocokTahap;
  });

  // Ganti pencarian/filter tahap -> balik ke halaman 1, biar tidak nyangkut
  // di halaman kosong kalau hasil filter barunya lebih sedikit halamannya.
  const ubahPencarian = (v) => {
    setQ(v);
    setHalaman(1);
  };
  const ubahTahapFilter = (v) => {
    setTahapFilter(v);
    setHalaman(1);
  };

  const totalHalaman = Math.max(1, Math.ceil(filtered.length / BARIS_PER_HALAMAN));
  const halamanAktif = Math.min(halaman, totalHalaman);
  const paged = filtered.slice(
    (halamanAktif - 1) * BARIS_PER_HALAMAN,
    halamanAktif * BARIS_PER_HALAMAN
  );

  const handleDownload = () => {
    downloadCsv(
      `data-barang-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "tanggal", label: "Tanggal" },
        { key: "sku", label: "SKU" },
        { key: "barcode_supplier", label: "Model/Barcode Supplier" },
        { key: "jumlah", label: "Jumlah" },
        { key: "jenis", label: "Jenis" },
        { key: "rak", label: "Rak" },
        { key: "tahap", label: "Tahap" },
      ],
      filtered.map((i) => ({
        tanggal: i.tanggal,
        sku: i.sku || "",
        barcode_supplier: i.barcode_supplier || "",
        jumlah: i.jumlah,
        jenis: i.gudang || "",
        rak: rakSaatIni(i) || "",
        tahap: STAGE_META[i.stage]?.label || i.stage,
      }))
    );
  };

  return (
    <div>
      {/* PageHeader + kolom cari/filter dibungkus satu wrapper sticky supaya
          keduanya "freeze" bareng di bawah header aplikasi (tinggi 64px)
          waktu daftar di bawahnya di-scroll — polanya sama seperti sticky
          search bar di Peta Rak (Rak.jsx), cuma di sini PageHeader-nya ikut
          nempel juga karena disatukan dalam satu wrapper, bukan lewat
          prop `sticky` bawaan PageHeader (yang cuma freeze headernya saja). */}
      <div className="sticky top-[64px] z-10 bg-md-surface py-3 -mt-3 mb-1">
        <PageHeader
          title="Alur Barang"
          description="Cari dan lihat detail semua barang yang tercatat di sistem."
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
                onClick={() => setModal({ type: "barang-masuk" })}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
              >
                <Plus size={14} /> Barang Masuk
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm w-full sm:w-auto">
            <Search size={14} className="text-slate-500" />
            <input
              value={q}
              onChange={(e) => ubahPencarian(e.target.value)}
              placeholder="Cari SKU, model/barcode supplier, jenis, atau rak…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
            />
          </div>
          <select
            value={tahapFilter}
            onChange={(e) => ubahTahapFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-amber-500/50"
          >
            <option value="">Semua Tahap</option>
            {Object.entries(STAGE_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || tahapFilter ? "Tidak ada barang yang cocok." : "Belum ada barang yang tercatat."} />
      ) : (
        <div className="rounded-xl border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Foto</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Model/Barcode Supplier</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Rak</th>
                <th className="px-4 py-2.5">Tahap</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((i) => {
                const meta = STAGE_META[i.stage];
                const skuCocok = skuCocokOtomatis(i);
                return (
                  <tr
                    key={i.id}
                    className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/50 cursor-pointer"
                    onClick={() => setModal({ type: "detail-item", item: i })}
                  >
                    <td className="px-4 py-2.5">
                      {i.foto_url ? (
                        <img src={i.foto_url} alt={i.sku} loading="lazy" decoding="async" className="w-9 h-9 object-cover rounded-md border border-slate-800" />
                      ) : (
                        <div className="w-9 h-9 rounded-md border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                          <Camera size={13} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{i.tanggal}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {i.sku || (
                        skuCocok ? (
                          <span className="text-amber-400" title="Cocok otomatis dari Model/Barcode Supplier — belum resmi, tinggal isi harga di Buat SKU">
                            {skuCocok.sku}
                          </span>
                        ) : (
                          "—"
                        )
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{i.barcode_supplier || "—"}</td>
                    <td className="px-4 py-2.5">
                      {i.jumlah}x
                      {i.jumlah_rusak > 0 && i.stage === "sku" && (
                        <span className="block text-[10px] text-red-400">termasuk {i.jumlah_rusak}x rusak</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {i.gudang ? <Badge color={jenisColor(i.gudang)}>{i.gudang}</Badge> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{rakSaatIni(i) || "—"}</td>
                    <td className="px-4 py-2.5">
                      {skuCocok ? (
                        <Badge color="sky">Sudah Ada SKU · Isi Harga</Badge>
                      ) : (
                        <Badge color={meta.color}>{meta.label}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalHalaman > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Halaman {halamanAktif} dari {totalHalaman}{" "}
              <span className="text-slate-600">({filtered.length} data)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHalaman((h) => Math.max(1, h - 1))}
                disabled={halamanAktif <= 1}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
                disabled={halamanAktif >= totalHalaman}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}