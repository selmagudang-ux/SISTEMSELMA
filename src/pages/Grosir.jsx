import { useState } from "react";
import { Search, Plus, Pencil, Trash2, X, ShoppingCart } from "lucide-react";
import { PageHeader, EmptyState, Field, SearchableSelect, inputClass, Badge, ModalShell } from "../components/ui";
import { sb, fmtRp, nextKode, todayDDMMYYYY, sisaHutangPesanan, totalHutangPerPelanggan } from "../lib/api";

export default function Grosir({
  sub, pelangganGrosir, tokoGrosir, produkManualGrosir, skuMaster, pesananGrosir, detailPesananGrosir, pembayaranGrosir, depositGrosir, reload, showToast, setModal,
}) {
  if (sub === "toko") return <TokoList tokoGrosir={tokoGrosir} setModal={setModal} />;
  if (sub === "pelanggan")
    return (
      <PelangganList
        pelangganGrosir={pelangganGrosir}
        pesananGrosir={pesananGrosir}
        pembayaranGrosir={pembayaranGrosir}
        depositGrosir={depositGrosir}
        setModal={setModal}
      />
    );
  if (sub === "semua-pesanan")
    return (
      <SemuaPesanan
        pesananGrosir={pesananGrosir}
        pelangganGrosir={pelangganGrosir}
        pembayaranGrosir={pembayaranGrosir}
        setModal={setModal}
      />
    );
  return (
    <BuatPesanan
      pelangganGrosir={pelangganGrosir}
      tokoGrosir={tokoGrosir}
      produkManualGrosir={produkManualGrosir}
      skuMaster={skuMaster}
      reload={reload}
      showToast={showToast}
    />
  );
}

function PelangganList({ pelangganGrosir, pesananGrosir, pembayaranGrosir, depositGrosir, setModal }) {
  const [q, setQ] = useState("");
  const hutangMap = totalHutangPerPelanggan(pesananGrosir, pembayaranGrosir);
  const filtered = (pelangganGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.nama?.toLowerCase().includes(s) ||
      p.kode?.toLowerCase().includes(s) ||
      p.kota?.toLowerCase().includes(s) ||
      p.wa?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Pelanggan Grosir"
        description="Daftar pelanggan/toko langganan untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-pelanggan-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Pelanggan
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, kode, kota, atau WA…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan grosir."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setModal({ type: "grosir-riwayat-pelanggan", item: p })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{p.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{p.nama}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[p.wa, p.kota].filter(Boolean).join(" · ") || "—"}
                </div>
                {hutangMap[p.id] > 0 && (
                  <div className="mt-1">
                    <Badge color="red">Hutang {fmtRp(hutangMap[p.id])}</Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setModal({ type: "grosir-pelanggan-form", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-pelanggan", item: p })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SemuaPesanan({ pesananGrosir, pelangganGrosir, pembayaranGrosir, setModal }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const namaPelanggan = (id) => pelangganGrosir.find((p) => p.id === id)?.nama || "—";

  const filtered = (pesananGrosir || []).filter((p) => {
    const s = q.trim().toLowerCase();
    const matchQ =
      !s ||
      p.nomor_pesanan?.toLowerCase().includes(s) ||
      namaPelanggan(p.pelanggan_id).toLowerCase().includes(s);
    const matchStatus = !statusFilter || p.status_bayar === statusFilter;
    return matchQ && matchStatus;
  });

  return (
    <div>
      <PageHeader
        title="Semua Pesanan"
        description="Riwayat pesanan grosir. Klik salah satu untuk lihat detail item."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor pesanan atau nama pelanggan…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">Semua Status</option>
          <option value="Belum Bayar">Belum Bayar</option>
          <option value="Sebagian">Sebagian</option>
          <option value="Lunas">Lunas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q || statusFilter ? "Tidak ada pesanan yang cocok." : "Belum ada pesanan grosir."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setModal({ type: "grosir-detail-pesanan", item: p })}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${
                i % 2 ? "bg-slate-950" : "bg-slate-900"
              } hover:bg-slate-800/60`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-amber-400">{p.nomor_pesanan}</span>
                  {p.status === "Batal" && <Badge color="red">Batal</Badge>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {namaPelanggan(p.pelanggan_id)} · {p.tanggal}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
                  {p.status_bayar}
                </Badge>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-200">{fmtRp(p.total)}</div>
                  {p.status_bayar !== "Lunas" && p.status !== "Batal" && (
                    <div className="text-[10px] text-red-400">
                      Sisa {fmtRp(sisaHutangPesanan(p, pembayaranGrosir))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TokoList({ tokoGrosir, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (tokoGrosir || []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      t.nama_toko?.toLowerCase().includes(s) ||
      t.kode?.toLowerCase().includes(s) ||
      t.jenis_toko?.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <PageHeader
        title="Toko Pengirim"
        description="Daftar toko/reseller pengirim untuk transaksi grosir."
        action={
          <button
            onClick={() => setModal({ type: "grosir-toko-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Toko
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama toko, kode, atau jenis…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada toko yang cocok." : "Belum ada toko pengirim."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-amber-400">{t.kode}</span>
                  <span className="text-sm text-slate-200 truncate">{t.nama_toko}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {[t.jenis_toko, t.telepon].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "grosir-toko-form", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-grosir-toko", item: t })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// BUAT PESANAN GROSIR
// =========================================================
let _itemRowSeq = 0;
export const newItemRow = (sumberProduk) => ({
  _key: `row-${++_itemRowSeq}`,
  sumber_produk: sumberProduk, // 'sku' | 'manual'
  sku: "",
  produk_manual_id: "",
  nama_produk: "",
  qty: 1,
  harga: 0,
  stokTersedia: null, // null = tidak relevan (item manual)
});

function BuatPesanan({ pelangganGrosir, tokoGrosir, produkManualGrosir, skuMaster, reload, showToast }) {
  const [pelangganId, setPelangganId] = useState("");
  const [pelangganNamaBaru, setPelangganNamaBaru] = useState(""); // dipakai kalau pelanggan belum ada di daftar
  const [pelangganWaBaru, setPelangganWaBaru] = useState("");
  const [pelangganAlamatBaru, setPelangganAlamatBaru] = useState("");
  const [pelangganKotaBaru, setPelangganKotaBaru] = useState("");
  const [tokoId, setTokoId] = useState("");
  const [statusBayar, setStatusBayar] = useState("Belum Bayar"); // 'Belum Bayar' | 'Lunas'
  const [metodeBayar, setMetodeBayar] = useState("Cash");
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const pelangganOptions = pelangganGrosir.map((p) => ({ value: p.id, label: `${p.nama} (${p.kode})` }));
  const tokoOptions = tokoGrosir.map((t) => ({ value: t.id, label: `${t.nama_toko} (${t.kode})` }));

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  // Total qty per SKU yang sudah dipakai di baris lain — supaya validasi stok
  // benar walau SKU yang sama dipilih di lebih dari satu baris.
  const qtyTerpakaiPerSku = (skuKey, kecualiKey) =>
    rows
      .filter((r) => r.sumber_produk === "sku" && r.sku === skuKey && r._key !== kecualiKey)
      .reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);

  const rowError = (r) => {
    if (r.sumber_produk === "sku") {
      if (!r.sku) return "Pilih SKU dulu";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
      const stokSaatIni = skuMaster.find((s) => s.sku === r.sku)?.stok || 0;
      const sudahDipakai = qtyTerpakaiPerSku(r.sku, r._key);
      if (r.qty + sudahDipakai > stokSaatIni) return `Stok tidak cukup (sisa ${stokSaatIni - sudahDipakai})`;
    } else {
      if (!r.nama_produk.trim()) return "Nama produk wajib diisi";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
    }
    return null;
  };

  const errors = rows.map(rowError);
  const canSubmit =
    (pelangganId || pelangganNamaBaru.trim()) && rows.length > 0 && errors.every((e) => !e) && !saving;

  const resetForm = () => {
    setPelangganId("");
    setPelangganNamaBaru("");
    setPelangganWaBaru("");
    setPelangganAlamatBaru("");
    setPelangganKotaBaru("");
    setTokoId("");
    setStatusBayar("Belum Bayar");
    setMetodeBayar("Cash");
    setCatatan("");
    setRows([]);
  };

  const submit = async () => {
    setSaving(true);
    try {
      // 0. Kalau pelanggan dipilih dari daftar, pakai id-nya. Kalau tidak (user
      //    ketik nama baru), buat dulu pelanggan baru di grosir_pelanggan —
      //    sekali dibuat, langsung bisa dipilih dari daftar juga di pesanan berikutnya.
      let pelangganIdFinal = pelangganId;
      if (!pelangganIdFinal && pelangganNamaBaru.trim()) {
        const kodeBaru = nextKode(pelangganGrosir, "kode", "PLG-");
        const [pelangganBaru] = await sb("grosir_pelanggan", {
          method: "POST",
          body: JSON.stringify({
            kode: kodeBaru,
            nama: pelangganNamaBaru.trim(),
            wa: pelangganWaBaru.trim() || null,
            alamat: pelangganAlamatBaru.trim() || null,
            kota: pelangganKotaBaru.trim() || null,
          }),
        });
        pelangganIdFinal = pelangganBaru.id;
      }

      // 1. Nomor pesanan harian: GSR + ddMMyyyy + urut 3 digit, reset tiap hari.
      const prefix = `GSR${todayDDMMYYYY()}`;
      const existing = await sb(
        `grosir_pesanan?nomor_pesanan=like.${encodeURIComponent(prefix)}*&select=nomor_pesanan`
      );
      let maxSeq = 0;
      (existing || []).forEach((p) => {
        const num = parseInt(p.nomor_pesanan.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      });
      const nomorPesanan = prefix + String(maxSeq + 1).padStart(3, "0");

      // 2. Simpan header pesanan.
      const [pesanan] = await sb("grosir_pesanan", {
        method: "POST",
        body: JSON.stringify({
          nomor_pesanan: nomorPesanan,
          pelanggan_id: pelangganIdFinal,
          toko_id: tokoId || null,
          status_bayar: statusBayar,
          metode_bayar: metodeBayar,
          total,
          status: "Aktif",
          catatan: catatan.trim() || null,
        }),
      });

      // 3. Simpan tiap item + potong stok.
      // Salinan lokal daftar produk manual, di-update tiap kali ada produk
      // manual BARU dibuat di bawah — supaya kalau dalam satu pesanan ada
      // lebih dari satu produk manual baru, kode barunya (PRM-xxxx) tidak
      // dobel/tabrakan (sebelumnya nextKode() selalu ngitung dari daftar awal
      // yang sama, jadi baris ke-2 dst dapat kode yang sama persis dengan
      // baris pertama -> ditolak database karena kode harus unik).
      let produkManualList = [...produkManualGrosir];
      for (const r of rows) {
        let produkManualId = r.produk_manual_id || null;

        if (r.sumber_produk === "manual" && !produkManualId) {
          // Produk manual baru — dibuat sekali di grosir_produk_manual (TIDAK
          // pernah masuk ke sku_master/Data Barang), supaya bisa dipakai lagi
          // di pesanan berikutnya tanpa ketik ulang.
          const kodeBaru = nextKode(produkManualList, "kode", "PRM-");
          const [produkBaru] = await sb("grosir_produk_manual", {
            method: "POST",
            body: JSON.stringify({
              kode: kodeBaru,
              nama_produk: r.nama_produk.trim(),
              harga: Number(r.harga) || 0,
              stok: 0,
            }),
          });
          produkManualId = produkBaru.id;
          produkManualList = [...produkManualList, produkBaru];
        }

        await sb("grosir_detail_pesanan", {

          method: "POST",
          body: JSON.stringify({
            pesanan_id: pesanan.id,
            sumber_produk: r.sumber_produk,
            sku: r.sumber_produk === "sku" ? r.sku : null,
            produk_manual_id: r.sumber_produk === "manual" ? produkManualId : null,
            nama_produk: r.nama_produk,
            qty: Number(r.qty),
            harga: Number(r.harga),
            subtotal: Number(r.qty) * Number(r.harga),
          }),
        });

        // Potong stok — hanya untuk item dari SKU Master Barang. Item manual
        // sengaja tidak menyentuh stok manapun (di luar sistem stok terlacak).
        if (r.sumber_produk === "sku") {
          const skuRow = skuMaster.find((s) => s.sku === r.sku);
          const stokSaatIni = skuRow ? skuRow.stok : 0;
          const stokBaru = Math.max(stokSaatIni - Number(r.qty), 0);
          await sb(`sku_master?sku=eq.${encodeURIComponent(r.sku)}`, {
            method: "PATCH",
            body: JSON.stringify({ stok: stokBaru }),
          });
          await sb("stock_history", {
            method: "POST",
            body: JSON.stringify({
              sku: r.sku,
              type: "keluar",
              qty_before: stokSaatIni,
              qty_change: -Number(r.qty),
              qty_after: stokBaru,
              note: `Pesanan grosir ${nomorPesanan}`,
            }),
          });
        }
      }

      await reload();
      showToast(`Pesanan ${nomorPesanan} tersimpan, stok diperbarui`);
      resetForm();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan pesanan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Buat Pesanan Grosir"
        description="Pilih pelanggan yang sudah ada atau ketik nama baru langsung, tambahkan barang dari Data Barang atau input manual, lalu simpan. Stok Data Barang otomatis berkurang saat pesanan disimpan."
      />

      <div className="grid sm:grid-cols-2 gap-3 mb-4 max-w-2xl">
        <Field label="Pelanggan *">
          <SearchableSelect
            value={pelangganId}
            onChange={(id) => {
              setPelangganId(id);
              setPelangganNamaBaru("");
            }}
            options={pelangganOptions}
            placeholder="Cari pelanggan…"
          />
          <input
            className={`${inputClass} mt-1.5`}
            value={pelangganNamaBaru}
            onChange={(e) => {
              setPelangganNamaBaru(e.target.value);
              setPelangganId("");
            }}
            placeholder="Atau ketik nama pelanggan baru"
          />
          {pelangganNamaBaru.trim() && (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <input
                className={inputClass}
                value={pelangganWaBaru}
                onChange={(e) => setPelangganWaBaru(e.target.value)}
                placeholder="No. WA (opsional)"
              />
              <input
                className={inputClass}
                value={pelangganKotaBaru}
                onChange={(e) => setPelangganKotaBaru(e.target.value)}
                placeholder="Kota (opsional)"
              />
              <input
                className={`${inputClass} col-span-2`}
                value={pelangganAlamatBaru}
                onChange={(e) => setPelangganAlamatBaru(e.target.value)}
                placeholder="Alamat (opsional)"
              />
            </div>
          )}
        </Field>
        <Field label="Toko Pengirim (opsional)">
          <SearchableSelect
            value={tokoId}
            onChange={setTokoId}
            options={tokoOptions}
            placeholder="Cari toko…"
          />
        </Field>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => addRow("sku")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Dari Data Barang
        </button>
        <button
          onClick={() => addRow("manual")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Item Manual
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada item. Tambahkan dari Data Barang atau input manual." />
      ) : (
        <div className="space-y-2 mb-4">
          {rows.map((r, i) => (
            <ItemRow
              key={r._key}
              row={r}
              error={errors[i]}
              skuMaster={skuMaster}
              produkManualGrosir={produkManualGrosir}
              onChange={(patch) => updateRow(r._key, patch)}
              onRemove={() => removeRow(r._key)}
            />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Field label="Status Bayar">
              <select
                value={statusBayar}
                onChange={(e) => setStatusBayar(e.target.value)}
                className={inputClass}
              >
                <option value="Belum Bayar">Belum Bayar (Hutang)</option>
                <option value="Lunas">Lunas</option>
              </select>
            </Field>
            <Field label="Metode Bayar">
              <select
                value={metodeBayar}
                onChange={(e) => setMetodeBayar(e.target.value)}
                className={inputClass}
              >
                <option value="Cash">Cash</option>
                <option value="Transfer">Transfer</option>
              </select>
            </Field>
          </div>
          <Field label="Catatan (opsional)">
            <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Field>

          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
            <span className="text-sm text-slate-400">Total Pesanan</span>
            <span className="text-lg font-bold text-amber-400">{fmtRp(total)}</span>
          </div>

          <button
            disabled={!canSubmit}
            onClick={submit}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-3 rounded-lg"
          >
            <ShoppingCart size={16} /> {saving ? "Menyimpan…" : "Simpan Pesanan"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ItemRow({ row, error, skuMaster, produkManualGrosir, onChange, onRemove }) {
  // SKU nonaktif (bekas "dihapus") tidak boleh dipilih buat pesanan baru,
  // tapi baris pesanan lama yang sudah pakai SKU itu tetap tampil apa adanya.
  const skuOptions = skuMaster
    .filter((s) => !s.nonaktif || s.sku === row.sku)
    .map((s) => ({
      value: s.sku,
      label: `${s.sku} · stok ${s.stok || 0} · ${fmtRp(s.grosir || 0)}${s.nonaktif ? " · (nonaktif)" : ""}`,
    }));
  const manualOptions = produkManualGrosir.map((p) => ({
    value: p.id,
    label: `${p.nama_produk} · ${fmtRp(p.harga || 0)}`,
  }));

  const pickSku = (sku) => {
    const s = skuMaster.find((x) => x.sku === sku);
    onChange({
      sku,
      nama_produk: sku,
      harga: s?.grosir || 0,
      stokTersedia: s?.stok || 0,
    });
  };

  const pickManual = (id) => {
    const p = produkManualGrosir.find((x) => x.id === id);
    if (p) {
      onChange({ produk_manual_id: id, nama_produk: p.nama_produk, harga: p.harga });
    } else {
      // id kosong berarti user mengetik nama baru (bukan pilih dari daftar).
      onChange({ produk_manual_id: "" });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid sm:grid-cols-[2fr_1fr_1fr] gap-2">
          {row.sumber_produk === "sku" ? (
            <SearchableSelect value={row.sku} onChange={pickSku} options={skuOptions} placeholder="Cari SKU…" compact />
          ) : (
            <div>
              <SearchableSelect
                value={row.produk_manual_id}
                onChange={pickManual}
                options={manualOptions}
                placeholder="Cari produk manual tersimpan…"
                compact
              />
              <input
                className={`${inputClass} mt-1.5`}
                value={row.nama_produk}
                onChange={(e) => onChange({ nama_produk: e.target.value, produk_manual_id: "" })}
                placeholder="Atau ketik nama produk baru"
              />
            </div>
          )}
          <input
            type="number"
            min="1"
            className={inputClass}
            value={row.qty}
            onChange={(e) => onChange({ qty: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="Qty"
          />
          <input
            type="number"
            min="0"
            className={inputClass}
            value={row.harga}
            onChange={(e) => onChange({ harga: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="Harga"
          />
        </div>
        <button
          onClick={onRemove}
          className="p-2 text-slate-600 hover:text-red-400 flex-shrink-0"
          title="Hapus item"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-slate-500">
          {row.sumber_produk === "sku" ? "Dari Data Barang" : "Item manual"}
          {row.qty && row.harga ? ` · Subtotal ${fmtRp(Number(row.qty) * Number(row.harga))}` : ""}
        </span>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

// =========================================================
// EDIT ITEM PESANAN
// Form terkontrol (presentational) — semua penyimpanan/penyesuaian stok
// dilakukan di ModalRouter lewat prop onSubmit, supaya konsisten dengan
// pola form lain (mis. BayarHutangForm di forms.jsx).
// =========================================================
export function EditPesananForm({
  pesanan, detailItems, tokoGrosir, skuMaster, produkManualGrosir, onClose, saving, onSubmit,
}) {
  const [tokoId, setTokoId] = useState(pesanan.toko_id || "");
  const [metodeBayar, setMetodeBayar] = useState(pesanan.metode_bayar || "Cash");
  const [catatan, setCatatan] = useState(pesanan.catatan || "");
  const [rows, setRows] = useState(() =>
    (detailItems || []).map((d) => ({
      _key: `row-${++_itemRowSeq}`,
      sumber_produk: d.sumber_produk,
      sku: d.sumber_produk === "sku" ? d.sku : "",
      produk_manual_id: d.sumber_produk === "manual" ? d.produk_manual_id || "" : "",
      nama_produk: d.nama_produk,
      qty: d.qty,
      harga: d.harga,
      stokTersedia: null,
    }))
  );

  // Stok "seolah pesanan ini belum ada" — qty asli pesanan ini dikembalikan
  // dulu secara virtual ke stok saat ini, supaya validasi qty di form edit
  // tidak salah anggap stok kurang gara-gara qty lama sudah kepotong.
  const originalQtyPerSku = {};
  (detailItems || []).forEach((d) => {
    if (d.sumber_produk === "sku" && d.sku) {
      originalQtyPerSku[d.sku] = (originalQtyPerSku[d.sku] || 0) + Number(d.qty || 0);
    }
  });
  const editableSkuMaster = (skuMaster || []).map((s) =>
    originalQtyPerSku[s.sku] ? { ...s, stok: (Number(s.stok) || 0) + originalQtyPerSku[s.sku] } : s
  );

  const tokoOptions = (tokoGrosir || []).map((t) => ({ value: t.id, label: `${t.nama_toko} (${t.kode})` }));

  const addRow = (sumberProduk) => setRows((prev) => [...prev, newItemRow(sumberProduk)]);
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r._key !== key));
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const qtyTerpakaiPerSku = (skuKey, kecualiKey) =>
    rows
      .filter((r) => r.sumber_produk === "sku" && r.sku === skuKey && r._key !== kecualiKey)
      .reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0);

  const rowError = (r) => {
    if (r.sumber_produk === "sku") {
      if (!r.sku) return "Pilih SKU dulu";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
      const stokSaatIni = editableSkuMaster.find((s) => s.sku === r.sku)?.stok || 0;
      const sudahDipakai = qtyTerpakaiPerSku(r.sku, r._key);
      if (r.qty + sudahDipakai > stokSaatIni) return `Stok tidak cukup (sisa ${stokSaatIni - sudahDipakai})`;
    } else {
      if (!r.nama_produk.trim()) return "Nama produk wajib diisi";
      if (!r.qty || r.qty <= 0) return "Qty harus > 0";
    }
    return null;
  };

  const errors = rows.map(rowError);
  const canSubmit = rows.length > 0 && errors.every((e) => !e) && !saving;

  const toko = tokoGrosir.find((t) => t.id === tokoId);

  const submit = () => {
    onSubmit({
      tokoId: tokoId || null,
      namaToko: toko ? toko.nama_toko : null,
      metodeBayar,
      catatan: catatan.trim() || null,
      total,
      items: rows.map((r) => ({
        sumber_produk: r.sumber_produk,
        sku: r.sumber_produk === "sku" ? r.sku : null,
        produk_manual_id: r.sumber_produk === "manual" ? r.produk_manual_id || null : null,
        nama_produk: r.nama_produk,
        qty: Number(r.qty),
        harga: Number(r.harga),
      })),
    });
  };

  return (
    <ModalShell title={`Edit Pesanan ${pesanan.nomor_pesanan}`} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Field label="Toko Pengirim (opsional)">
          <SearchableSelect value={tokoId} onChange={setTokoId} options={tokoOptions} placeholder="Cari toko…" />
        </Field>
        <Field label="Metode Bayar">
          <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className={inputClass}>
            <option value="Cash">Cash</option>
            <option value="Transfer">Transfer</option>
          </select>
        </Field>
      </div>
      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <div className="my-3 flex items-center gap-2">
        <button
          onClick={() => addRow("sku")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Dari Data Barang
        </button>
        <button
          onClick={() => addRow("manual")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/50 hover:text-amber-400"
        >
          <Plus size={14} /> Item Manual
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada item. Tambahkan dari Data Barang atau input manual." />
      ) : (
        <div className="space-y-2 mb-4">
          {rows.map((r, i) => (
            <ItemRow
              key={r._key}
              row={r}
              error={errors[i]}
              skuMaster={editableSkuMaster}
              produkManualGrosir={produkManualGrosir}
              onChange={(patch) => updateRow(r._key, patch)}
              onRemove={() => removeRow(r._key)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 mb-4">
        <span className="text-sm text-slate-400">Total Pesanan</span>
        <span className="text-lg font-bold text-amber-400">{fmtRp(total)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
        >
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </button>
      </div>
    </ModalShell>
  );
}