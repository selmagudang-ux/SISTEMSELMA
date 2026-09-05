import { useMemo, useState } from "react";
import { Plus, MapPin, PackagePlus, AlertTriangle, ArrowRightLeft, Pencil, Trash2, Warehouse, Search, LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { sameProdukKecualiUkuran, labelFor, sb, nextKode } from "../lib/api";

// Cari kode rak terbaru untuk sebuah SKU (penempatan sudah diurutkan created_at desc).
// Diekspor supaya halaman lain (Data Barang, Cetak Label) bisa pakai sumber yang sama
// dan tidak ketinggalan sinkron dengan Peta Rak saat SKU ditempatkan ulang.
export function rakForSku(sku, penempatan) {
  const found = (penempatan || []).find((p) => p.sku === sku);
  return found ? found.rak_code : "";
}

// Cari SKU yang SAAT INI menempati sebuah rak (aturan: 1 rak = 1 SKU, ambil penempatan terbaru).
export function skuForRak(rakCode, penempatan) {
  const found = (penempatan || []).find((p) => p.rak_code === rakCode);
  return found ? found.sku : "";
}

// Daftar kode rak yang BENAR-BENAR sedang terisi (masih ada SKU dengan stok > 0),
// dipakai bareng Peta Rak supaya angka "Rak Terpakai" di Dashboard selalu sinkron.
export function rakTerpakai(rak, penempatan, skuMaster) {
  return (rak || []).filter((r) => {
    const pemenang = skuForRak(r.code, penempatan);
    if (!pemenang) return false;
    const s = (skuMaster || []).find((x) => x.sku === pemenang);
    return !!s && s.stok > 0;
  });
}

// SKU dengan stok > 0 tapi rak yang seharusnya ditempatinya sudah ditimpa SKU lain
// (aturan: 1 rak = 1 SKU, penempatan terbaru di rak yang sama menang) — perlu ditempatkan ulang.
export function cariPerluDitempatkanUlang(skuMaster, penempatan) {
  const out = [];
  (skuMaster || []).forEach((s) => {
    if (!s.stok || s.stok <= 0) return;
    const rakSeharusnya = rakForSku(s.sku, penempatan);
    if (!rakSeharusnya) return; // belum pernah ditempatkan di rak sama sekali
    const skuSekarang = skuForRak(rakSeharusnya, penempatan);
    if (!skuSekarang || skuSekarang === s.sku) return;
    if (sameProdukKecualiUkuran(skuSekarang, s.sku, skuMaster)) return; // cuma beda ukuran, boleh gabung
    out.push({ sku: s.sku, stok: s.stok, rakLama: rakSeharusnya, ditimpaOleh: skuSekarang });
  });
  return out;
}

// SKU (dengan stok > 0) yang saat ini jadi "pemenang" di LEBIH DARI SATU rak
// sekaligus — seharusnya tidak terjadi (aturan: 1 rak = 1 SKU aktif), tapi bisa
// muncul kalau SKU sempat ditempatkan ulang ke rak baru sementara penempatan
// lamanya di rak lain belum sempat dipindahkan/dibersihkan. Dipakai Peta Rak
// untuk kasih warning + tombol "Pindahkan" supaya bisa langsung dibereskan.
export function skuDenganRakGanda(rak, penempatan, skuMaster) {
  const byOwner = new Map(); // sku -> [{ rak_code, penempatanId }]
  (rak || []).forEach((r) => {
    const winner = (penempatan || []).find((p) => p.rak_code === r.code);
    if (!winner) return;
    const s = (skuMaster || []).find((x) => x.sku === winner.sku);
    if (!s || !(s.stok > 0)) return;
    if (!byOwner.has(winner.sku)) byOwner.set(winner.sku, []);
    byOwner.get(winner.sku).push({ rak_code: r.code, penempatanId: winner.id });
  });
  const out = [];
  byOwner.forEach((raks, sku) => {
    if (raks.length > 1) out.push({ sku, raks });
  });
  return out;
}

// Total qty SKU tertentu yang BENAR-BENAR aktif tertempatkan di rak (dijumlah
// dari semua rak, bukan cuma satu). Pakai aturan yang sama dengan skuDiRak di
// Peta Rak (winner per rak + varian ukuran yang boleh nebeng), supaya angka
// "sudah di rak" selalu sinkron dengan apa yang ditampilkan di Peta Rak.
export function totalTertempatkan(sku, rak, penempatan, skuMaster) {
  let total = 0;
  (rak || []).forEach((r) => {
    const pemenang = skuForRak(r.code, penempatan);
    if (!pemenang) return;
    const cocok =
      pemenang === sku ||
      (rakForSku(sku, penempatan) === r.code && sameProdukKecualiUkuran(pemenang, sku, skuMaster));
    if (!cocok) return;
    const baris = (penempatan || []).find((p) => p.sku === sku && p.rak_code === r.code);
    if (baris) total += Number(baris.qty) || 0;
  });
  return total;
}

// SKU dengan stok > 0 tapi qty yang tertempatkan di rak (across semua rak)
// lebih kecil dari stoknya — sisanya berarti masih menumpuk di gudang, entah
// karena belum sempat ditempatkan sama sekali (ditempatkan = 0) atau karena
// rak yang dipakai sudah penuh sehingga cuma sebagian qty yang muat ditempatkan.
export function barangSisaDiGudang(skuMaster, rak, penempatan) {
  const out = [];
  (skuMaster || []).forEach((s) => {
    if (!s.stok || s.stok <= 0) return;
    const ditempatkan = totalTertempatkan(s.sku, rak, penempatan, skuMaster);
    const sisa = s.stok - ditempatkan;
    if (sisa > 0) out.push({ sku: s.sku, stok: s.stok, ditempatkan, sisa });
  });
  return out;
}

// Susun daftar perubahan ke baris-baris `penempatan` sebuah SKU supaya total
// qty yang tertempatkan di rak ikut berkurang saat stoknya berkurang (lewat
// Barang Keluar atau Stok Opname turun) — supaya Peta Rak tetap sinkron
// dengan Stok Barang. Aturan FIFO: rak yang PALING LAMA ditempatkan
// dikurangi/dihabiskan duluan, baru lanjut ke rak berikutnya kalau masih
// kurang. Tidak menyentuh baris SKU lain atau rak yang tidak diisi SKU ini.
// Return: array of { id, qtyBaru } (qtyBaru <= 0 berarti baris itu harus
// DIHAPUS, bukan di-PATCH ke 0) — pemanggil yang eksekusi ke Supabase.
export function rencanaKurangiRak(sku, jumlahKurang, penempatan) {
  let sisaKurang = Math.max(Number(jumlahKurang) || 0, 0);
  if (sisaKurang <= 0) return [];

  const baris = (penempatan || [])
    .filter((p) => p.sku === sku)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // oldest first (FIFO)

  const out = [];
  for (const b of baris) {
    if (sisaKurang <= 0) break;
    const qtyLama = Number(b.qty) || 0;
    if (qtyLama <= 0) continue;
    const potong = Math.min(qtyLama, sisaKurang);
    out.push({ id: b.id, qtyBaru: qtyLama - potong });
    sisaKurang -= potong;
  }
  return out;
}

// =========================================================
// SIMPAN ITEM PESANAN GROSIR/RESELLER — VERSI CEPAT (BATCH)
// =========================================================
// Dipakai bareng oleh BuatPesanan (Grosir), BuatPesananReseller,
// BuatPesananResellerCekout — sebelumnya tiap fungsi ini nyalin-tempel loop
// yang sama persis dan nyimpen tiap baris item SATU-SATU (POST detail, PATCH
// stok, POST riwayat stok, PATCH tiap baris rak — semua nunggu gantian).
// Untuk pesanan isi banyak item ini jadi puluhan request berurutan, jadi
// lambat/berat. Versi ini:
//   1. Produk manual baru TETAP dibuat satu-satu berurutan (supaya kode
//      PRM-xxxx antar baris dalam satu pesanan tidak tabrakan).
//   2. Semua baris detail pesanan disimpan SEKALIGUS lewat satu request
//      (PostgREST otomatis insert banyak baris kalau body-nya array).
//   3. Potongan stok dikelompokkan per SKU dulu (kalau SKU yang sama
//      kepakai di lebih dari satu baris, jumlahnya digabung dulu sebelum
//      dipotong — sekalian membenahi bug lama: versi sebelumnya bisa
//      salah kurangi rak dobel kalau ada 2 baris SKU yang sama dalam satu
//      pesanan). Riwayat stok & event rak juga digabung jadi satu request.
//   4. PATCH yang memang harus per-baris (beda SKU/id target = tidak bisa
//      digabung satu request) dijalankan PARALEL lewat Promise.all, bukan
//      gantian satu-satu.
// rows: [{ sumber_produk, sku, produk_manual_id, nama_produk, qty, harga }]
export async function simpanItemPesananGrosir({ pesananId, rows, skuMaster, penempatan, catatanStok }) {
  // 1. Resolusi produk manual baru — berurutan (lihat catatan di atas).
  let produkManualList = null;
  const resolvedRows = [];
  for (const r of rows || []) {
    let produkManualId = r.produk_manual_id || null;
    if (r.sumber_produk === "manual" && !produkManualId) {
      if (!produkManualList) produkManualList = await sb("grosir_produk_manual?select=id,kode");
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
    resolvedRows.push({ ...r, produkManualId });
  }

  // 2. Simpan semua baris detail pesanan dalam SATU request.
  const detailPayload = resolvedRows.map((r) => ({
    pesanan_id: pesananId,
    sumber_produk: r.sumber_produk,
    sku: r.sumber_produk === "sku" ? r.sku : null,
    produk_manual_id: r.sumber_produk === "manual" ? r.produkManualId : null,
    nama_produk: r.nama_produk,
    qty: Number(r.qty),
    harga: Number(r.harga),
    subtotal: Number(r.qty) * Number(r.harga),
  }));
  if (detailPayload.length > 0) {
    await sb("grosir_detail_pesanan", { method: "POST", body: JSON.stringify(detailPayload) });
  }

  // 3. Potong stok — kelompokkan per SKU dulu.
  const qtyPerSku = new Map();
  for (const r of resolvedRows) {
    if (r.sumber_produk === "sku" && r.sku) {
      qtyPerSku.set(r.sku, (qtyPerSku.get(r.sku) || 0) + Number(r.qty));
    }
  }

  const stockHistoryPayload = [];
  const rakEventsPayload = [];
  const tugasParalel = [];

  for (const [sku, qtyKurang] of qtyPerSku) {
    const skuRow = (skuMaster || []).find((s) => s.sku === sku);
    const stokSaatIni = skuRow ? skuRow.stok : 0;
    const stokBaru = Math.max(stokSaatIni - qtyKurang, 0);

    tugasParalel.push(
      sb(`sku_master?sku=eq.${encodeURIComponent(sku)}`, {
        method: "PATCH",
        body: JSON.stringify({ stok: stokBaru }),
      })
    );
    stockHistoryPayload.push({
      sku,
      type: "keluar",
      qty_before: stokSaatIni,
      qty_change: -qtyKurang,
      qty_after: stokBaru,
      note: catatanStok,
    });

    const rencanaRak = rencanaKurangiRak(sku, qtyKurang, penempatan);
    for (const rk of rencanaRak) {
      tugasParalel.push(
        sb(`penempatan?id=eq.${rk.id}`, {
          method: "PATCH",
          body: JSON.stringify({ qty: Math.max(rk.qtyBaru, 0) }),
        })
      );
      if (rk.qtyBaru <= 0) {
        const baris = (penempatan || []).find((p) => p.id === rk.id);
        if (baris) rakEventsPayload.push({ sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null });
      }
    }
  }

  if (stockHistoryPayload.length > 0) {
    tugasParalel.push(sb("stock_history", { method: "POST", body: JSON.stringify(stockHistoryPayload) }));
  }
  if (rakEventsPayload.length > 0) {
    tugasParalel.push(sb("rak_events", { method: "POST", body: JSON.stringify(rakEventsPayload) }));
  }

  await Promise.all(tugasParalel);
}

export default function Rak({ sub, items, rak, penempatan, skuMaster, master, pengajuanRestock, session, setModal }) {
  if (sub === "peta")
    return (
      <PetaRak
        rak={rak}
        penempatan={penempatan}
        skuMaster={skuMaster}
        master={master}
        pengajuanRestock={pengajuanRestock}
        session={session}
        setModal={setModal}
      />
    );
  if (sub === "gudang")
    return <SisaGudang rak={rak} penempatan={penempatan} skuMaster={skuMaster} setModal={setModal} />;
  if (sub === "master") return <MasterRak rak={rak} setModal={setModal} />;
  return <TempatkanRak items={items} skuMaster={skuMaster} penempatan={penempatan} setModal={setModal} />;
}

// Daftar SKU yang stoknya belum sepenuhnya masuk rak: belum ditempatkan sama
// sekali, atau sisa qty-nya tidak muat lagi karena rak yang biasa dipakai
// sudah penuh. Tombol "Tempatkan sisa" pakai alur yang sama dengan penempatan
// ulang (menambah baris penempatan baru), jadi tidak menyentuh data lama.
function SisaGudang({ rak, penempatan, skuMaster, setModal }) {
  const daftar = useMemo(
    () => barangSisaDiGudang(skuMaster, rak, penempatan),
    [skuMaster, rak, penempatan]
  );

  return (
    <div>
      <PageHeader
        title="Sisa di Gudang"
        description="SKU yang stoknya belum sepenuhnya masuk rak — belum pernah ditempatkan, atau rak yang dipakai sudah penuh sehingga sisanya masih menumpuk di gudang."
      />
      {daftar.length === 0 ? (
        <EmptyState label="Semua stok sudah tertempatkan penuh di rak." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {daftar.map((d) => (
            <button
              key={d.sku}
              onClick={() =>
                setModal({
                  type: "advance-rak-ulang",
                  item: { sku: d.sku, jumlah: d.sisa },
                })
              }
              className="text-left bg-slate-900 border border-orange-500/40 hover:border-orange-500/70 rounded-lg p-3 transition"
            >
              <Warehouse size={16} className="text-orange-400 mb-2" />
              <div className="text-xs font-mono text-slate-300">{d.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Stok {d.stok}x · di rak {d.ditempatkan}x
              </div>
              <div className="text-[11px] font-semibold text-orange-400 mt-0.5">Sisa {d.sisa}x di gudang</div>
              <div className="mt-2 text-[11px] font-medium text-orange-400">Tempatkan sisa →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TempatkanRak({ items, skuMaster, penempatan, setModal }) {
  const menungguRak = items.filter((i) => i.stage === "rak");
  const perluUlang = useMemo(
    () => cariPerluDitempatkanUlang(skuMaster, penempatan),
    [skuMaster, penempatan]
  );

  const totalKosong = menungguRak.length === 0 && perluUlang.length === 0;

  return (
    <div>
      <PageHeader
        title="Tempatkan Barang"
        description="Barang yang sudah punya SKU tapi belum ditempatkan di rak, termasuk SKU yang rak lamanya sudah ditimpa SKU lain dan perlu rak baru."
      />
      {totalKosong ? (
        <EmptyState label="Tidak ada barang yang menunggu penempatan rak." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {menungguRak.map((item) => (
            <button
              key={item.id}
              onClick={() => setModal({ type: "advance-rak", item })}
              className="text-left bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-lg p-3 transition"
            >
              <PackagePlus size={16} className="text-sky-400 mb-2" />
              <div className="text-xs font-mono text-slate-300">{item.sku || `#${item.id.slice(0, 8)}`}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.jumlah}x</div>
              <div className="mt-2 text-[11px] font-medium text-sky-400">Tempatkan di rak →</div>
            </button>
          ))}
          {perluUlang.map((r) => (
            <button
              key={`ulang-${r.sku}`}
              onClick={() =>
                setModal({
                  type: "advance-rak-ulang",
                  item: { sku: r.sku, jumlah: r.stok },
                })
              }
              className="text-left bg-slate-900 border border-amber-500/40 hover:border-amber-500/70 rounded-lg p-3 transition"
            >
              <AlertTriangle size={16} className="text-amber-400 mb-2" />
              <div className="text-xs font-mono text-slate-300">{r.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{r.stok}x</div>
              <div className="text-[10px] text-amber-400/80 mt-1">
                Rak {r.rakLama} ditimpa {r.ditimpaOleh}
              </div>
              <div className="mt-2 text-[11px] font-medium text-amber-400">Tempatkan rak baru →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MasterRak({ rak, setModal }) {
  // Urutkan kode rak secara alami (1, 2, ..., 9, 10, 11, ...), bukan urutan
  // teks apa adanya dari database (yang bikin "10" nongol sebelum "2").
  const sortedRak = [...rak].sort((a, b) =>
    (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: "base" })
  );

  return (
    <div>
      <PageHeader
        title="Master Rak"
        description="Daftar semua rak penyimpanan di gudang."
        action={
          <button
            onClick={() => setModal({ type: "tambah-rak" })}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700"
          >
            <Plus size={14} /> Tambah Rak
          </button>
        }
      />
      {rak.length === 0 ? (
        <EmptyState label="Belum ada rak." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sortedRak.map((r) => (
            <div key={r.id} className="group relative rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-1.5 text-sky-400">
                <MapPin size={14} />
                <span className="font-mono font-semibold text-sm">{r.code}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {r.meja ? `Meja ${r.meja}` : ""} {r.baris ? `· Baris ${r.baris}` : ""}
              </div>
              {r.zona && (
                <div className="text-[10px] text-amber-400 font-medium mt-1 flex items-center gap-1">
                  <LayoutGrid size={10} /> {r.zona}
                </div>
              )}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                <button
                  onClick={() => setModal({ type: "edit-rak", item: r })}
                  title="Edit rak"
                  className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-amber-400 border border-slate-800"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-rak", item: r })}
                  title="Hapus rak"
                  className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-red-400 border border-slate-800"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Urutkan nama meja sesuai pola gudang: nomor 1-8 dulu di dalam huruf yang
// sama (G1A, G2A, ..., G8A), baru pindah ke huruf berikutnya (G1B, G2B, ...).
// Format nama meja yang dikenali: <prefix huruf><nomor><huruf akhir>, mis.
// "G1A" -> prefix "G", nomor 1, huruf akhir "A". Meja yang tidak cocok pola
// ini (mis. "Tanpa Meja") selalu ditaruh paling belakang.
function parseMejaKey(mejaKey) {
  const m = /^([A-Za-z]+?)(\d+)([A-Za-z]+)$/.exec(mejaKey || "");
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10), suffix: m[3] };
}

function compareMeja(a, b) {
  const ka = parseMejaKey(a);
  const kb = parseMejaKey(b);
  if (ka && kb) {
    if (ka.suffix !== kb.suffix) return ka.suffix.localeCompare(kb.suffix, undefined, { sensitivity: "base" });
    if (ka.prefix !== kb.prefix) return ka.prefix.localeCompare(kb.prefix, undefined, { sensitivity: "base" });
    return ka.number - kb.number;
  }
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function PetaRak({ rak, penempatan, skuMaster, master, pengajuanRestock, session, setModal }) {
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  // Zona yang sedang disembunyikan (di-collapse) di tampilan Peta Rak — klik
  // header zona untuk sembunyikan/tampilkan isinya. Cuma state tampilan lokal
  // (tidak disimpan ke database), reset tiap kali halaman dibuka ulang.
  const [zonaTersembunyi, setZonaTersembunyi] = useState(new Set());
  const toggleZona = (z) => {
    setZonaTersembunyi((prev) => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z);
      else next.add(z);
      return next;
    });
  };
  const groups = {};
  rak.forEach((r) => {
    const key = r.meja || "Tanpa Meja";
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });
  const groupKeys = Object.keys(groups).sort(compareMeja);

  // Zona (opsional) mengelompokkan beberapa Meja jadi satu label kategori,
  // mis. "Meja A" s/d "Meja Z" -> zona "Cincin" — diatur lewat tombol "Atur
  // Zona" (bulk update kolom rak.zona per Meja terpilih). Satu Meja dianggap
  // satu zona (ambil zona dari rak pertama di meja itu yang punya nilai
  // zona); Meja yang belum diberi zona dikelompokkan ke "Tanpa Zona" di
  // paling bawah. Kalau belum ada satu pun rak yang diberi zona, tampilan
  // tetap flat per-Meja seperti semula (tidak menambah header zona kosong).
  const TANPA_ZONA = "__tanpa_zona__";
  const zonaPerMeja = {};
  groupKeys.forEach((meja) => {
    const withZona = groups[meja].find((r) => r.zona);
    if (withZona) zonaPerMeja[meja] = withZona.zona;
  });
  const adaZona = Object.keys(zonaPerMeja).length > 0;
  const mejaByZona = {};
  const zonaOrder = [];
  groupKeys.forEach((meja) => {
    const z = zonaPerMeja[meja] || TANPA_ZONA;
    if (!mejaByZona[z]) {
      mejaByZona[z] = [];
      zonaOrder.push(z);
    }
    mejaByZona[z].push(meja);
  });
  zonaOrder.sort((a, b) => {
    if (a === TANPA_ZONA) return 1;
    if (b === TANPA_ZONA) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  // SKU yang kepasang di lebih dari satu rak sekaligus — perlu diberi tahu
  // ke user dan dikasih jalan pintas untuk membereskannya (pindahkan salah
  // satu penempatan ke rak lain, tanpa harus bongkar-pasang manual).
  const rakGanda = useMemo(
    () => skuDenganRakGanda(rak, penempatan, skuMaster),
    [rak, penempatan, skuMaster]
  );
  // Lookup cepat: "SKU|kode_rak" -> penempatanId, untuk dipakai kartu rak
  // menandai baris SKU mana yang lagi bentrok + tombol pindahkan-nya.
  const gandaLookup = new Map();
  rakGanda.forEach(({ sku, raks }) => {
    raks.forEach(({ rak_code, penempatanId }) => {
      gandaLookup.set(`${sku}|${rak_code}`, penempatanId);
    });
  });

  const bukaPindah = (sku, rakLama, penempatanId, qty) =>
    setModal?.({ type: "pindah-rak", item: { sku, rakLama, penempatanId, qty } });

  // SKU yang saat ini benar-benar mengisi rak ini (stok masih > 0), pakai
  // aturan yang sama dengan cariPerluDitempatkanUlang: 1 rak = 1 SKU,
  // penempatan TERBARU di rak itu yang menang (skuForRak). SKU lama yang
  // sudah ditimpa SKU lain tidak ditampilkan lagi di sini, kecuali dia
  // varian ukuran dari SKU pemenang (boleh nebeng rak yang sama) DAN
  // penempatan terbarunya sendiri masih memang rak ini.
  const skuDiRak = (kodeRak) => {
    const pemenang = skuForRak(kodeRak, penempatan);
    if (!pemenang) return [];

    const kandidat = new Set(
      (penempatan || []).filter((p) => p.rak_code === kodeRak).map((p) => p.sku)
    );

    return [...kandidat]
      .filter((sku) => {
        const s = (skuMaster || []).find((x) => x.sku === sku);
        // Dulu SKU yang stoknya sudah 0 di sini disembunyikan sepenuhnya
        // (dianggap rak-nya otomatis "Kosong"). Sekarang TETAP ditampilkan
        // (lihat flag `habis` di bawah) supaya rak yang barangnya habis
        // tetap ada catatannya, bukan langsung hilang seolah rak bebas.
        // Cuma SKU yang sudah tidak ada sama sekali di Master Barang (dihapus)
        // yang disembunyikan.
        if (!s) return false;
        if (sku === pemenang) return true;
        return (
          rakForSku(sku, penempatan) === kodeRak &&
          sameProdukKecualiUkuran(pemenang, sku, skuMaster)
        );
      })
      .map((sku) => {
        // Qty yang ditampilkan HARUS qty milik rak ini saja (dari baris penempatan
        // sku+rak ini), BUKAN total stok SKU di sku_master. Kalau SKU yang sama
        // dipecah ke beberapa rak (mis. rak 1 qty 1, rak 2 qty 3), masing² rak
        // wajib tetap tampil angka qty-nya sendiri², tidak boleh digabung/diduplikasi
        // jadi angka total yang sama di semua rak.
        const penempatanRak = (penempatan || []).find(
          (p) => p.sku === sku && p.rak_code === kodeRak
        );
        const qtyRak = penempatanRak?.qty;
        const stok = qtyRak != null ? qtyRak : (skuMaster || []).find((x) => x.sku === sku)?.stok ?? 0;
        return {
          sku,
          stok,
          penempatanId: penempatanRak?.id ?? null,
          // "Habis" = qty KHUSUS di rak ini sudah 0 (rak ini kosong), beda
          // dengan stok SKU secara keseluruhan (SKU yang sama bisa masih ada
          // stok di rak lain, cuma rak yang ini yang habis duluan karena FIFO).
          habis: !(stok > 0),
        };
      });
  };

  // Jumlah rak KOSONG per zona (independen dari kolom cari/kategori — supaya
  // angkanya tetap mewakili kondisi zona secara utuh, bukan cuma yang sedang
  // difilter tampil). Dipakai tombol "Ajukan ke Owner": jumlah rak kosong di
  // satu zona = perkiraan jumlah model baru yang bisa dibeli untuk mengisinya.
  const rakKosongPerZona = {};
  zonaOrder.forEach((z) => {
    let n = 0;
    mejaByZona[z].forEach((meja) => {
      groups[meja].forEach((r) => {
        if (skuDiRak(r.code).length === 0) n += 1;
      });
    });
    rakKosongPerZona[z] = n;
  });

  // Pengajuan restock ZONA yang masih "menunggu" per nama zona, supaya
  // tombolnya bisa dinonaktifkan/berubah label kalau sudah pernah diajukan
  // dan belum direspon owner (sama polanya dengan Stok Menipis per-SKU).
  const pengajuanZonaMenunggu = new Map();
  (pengajuanRestock || [])
    .filter((p) => p.jenis === "zona" && p.status === "menunggu")
    .forEach((p) => pengajuanZonaMenunggu.set(p.zona, p));
  const bisaAjukan = ["gudang", "owner", "superadmin", "superappa"].includes(session?.role);

  const ajukanZona = (zona) =>
    setModal?.({ type: "ajukan-restock-zona", item: { zona, jumlahKosong: rakKosongPerZona[zona] || 0 } });


  // rak tersebut — jadi user bisa cari "G1A-10A" ataupun cari SKU langsung
  // buat tahu dia disimpan di rak mana.
  const qLower = q.trim().toLowerCase();
  const rakCocok = (r) => {
    if (!qLower) return true;
    if ((r.code || "").toLowerCase().includes(qLower)) return true;
    return skuDiRak(r.code).some(({ sku }) => (sku || "").toLowerCase().includes(qLower));
  };

  // Filter kategori (opsional) — mempersempit ke rak yang memuat minimal
  // satu SKU dari kategori terpilih. Dropdown-nya independen dari kolom cari
  // di atas: kalau tidak dipilih ("Semua Kategori"), tidak mempengaruhi apa-apa.
  const kategoriOptions = Array.from(
    new Set((skuMaster || []).map((s) => s.kategori).filter(Boolean))
  ).sort();
  const kategoriLabel = (kode) => labelFor(master || {}, "kategori", kode);
  const rakSesuaiKategori = (r) => {
    if (!kategori) return true;
    return skuDiRak(r.code).some(({ sku }) => {
      const s = (skuMaster || []).find((x) => x.sku === sku);
      return s && s.kategori === kategori;
    });
  };

  const tampilRak = (r) => rakCocok(r) && rakSesuaiKategori(r);

  return (
    <div>
      <PageHeader
        title="Peta Rak"
        description="Tampilan visual rak, dikelompokkan per meja (dan per zona kalau sudah diatur), lengkap dengan SKU yang mengisi tiap rak."
        action={
          <button
            onClick={() => setModal({ type: "atur-zona-meja" })}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700"
          >
            <LayoutGrid size={14} /> Atur Zona
          </button>
        }
      />

      <div className="sticky top-[53px] z-10 bg-slate-950 py-3 -mt-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
            <Search size={14} className="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode rak atau SKU…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
            />
          </div>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            disabled={kategoriOptions.length === 0}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none disabled:opacity-40"
          >
            <option value="">Semua Kategori</option>
            {kategoriOptions.map((k) => (
              <option key={k} value={k}>{kategoriLabel(k)}</option>
            ))}
          </select>
        </div>
      </div>

      {rakGanda.length > 0 && (
        <div className="mb-5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5">
          <div className="flex items-start gap-2 text-amber-300 text-xs font-medium mb-2.5">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              {rakGanda.length} SKU tercatat menempati lebih dari satu rak sekaligus. Pindahkan salah satu
              penempatannya supaya tiap SKU hanya di satu rak.
            </div>
          </div>
          <div className="space-y-1.5">
            {rakGanda.map(({ sku, raks }) => (
              <div
                key={sku}
                className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 rounded-lg px-3 py-2"
              >
                <div className="text-xs">
                  <span className="font-mono text-amber-300">{sku}</span>{" "}
                  <span className="text-slate-500">
                    ada di rak {raks.map((r) => r.rak_code).join(", ")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {raks.map((r) => {
                    const qtyBaris = (penempatan || []).find((p) => p.id === r.penempatanId)?.qty;
                    return (
                      <button
                        key={r.rak_code}
                        onClick={() => bukaPindah(sku, r.rak_code, r.penempatanId, qtyBaris)}
                        className="flex items-center gap-1 text-[11px] font-medium text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-500/70 rounded-md px-2 py-1"
                      >
                        <ArrowRightLeft size={11} /> Pindahkan dari {r.rak_code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rak.length === 0 ? (
        <EmptyState label="Belum ada rak untuk dipetakan." />
      ) : groupKeys.every((meja) => !groups[meja].some(tampilRak)) ? (
        <EmptyState
          label={
            kategori
              ? "Tidak ada rak yang berisi SKU dari kategori ini (atau tidak cocok dengan pencarian)."
              : "Tidak ada rak atau SKU yang cocok dengan pencarian."
          }
        />
      ) : (
        <div className="space-y-8">
          {(adaZona
            ? zonaOrder.map((z) => ({ zona: z, mejaList: mejaByZona[z] }))
            : [{ zona: null, mejaList: groupKeys }]
          )
            .filter(({ mejaList }) => mejaList.some((meja) => groups[meja].some(tampilRak)))
            .map(({ zona, mejaList }) => {
              const tersembunyi = zona && zonaTersembunyi.has(zona);
              const mejaCocok = mejaList.filter((meja) => groups[meja].some(tampilRak));
              return (
            <div key={zona || "flat"}>
              {zona && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleZona(zona)}
                    className="flex items-center gap-2 text-left group"
                  >
                    {tersembunyi ? (
                      <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300" />
                    ) : (
                      <ChevronDown size={14} className="text-slate-500 group-hover:text-slate-300" />
                    )}
                    <LayoutGrid size={14} className="text-amber-400" />
                    <div className="text-sm font-bold text-slate-200">
                      {zona === TANPA_ZONA ? "Tanpa Zona" : `Zona: ${zona}`}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      ({mejaCocok.length} meja{tersembunyi ? " — disembunyikan" : ""})
                    </div>
                  </button>
                  {zona !== TANPA_ZONA && rakKosongPerZona[zona] > 0 && (
                    <>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                        {rakKosongPerZona[zona]} rak kosong
                      </span>
                      {bisaAjukan && (
                        <button
                          type="button"
                          disabled={pengajuanZonaMenunggu.has(zona)}
                          onClick={() => ajukanZona(zona)}
                          title="Ajukan pembelian model baru ke owner berdasarkan jumlah rak kosong di zona ini"
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <PackagePlus size={11} />
                          {pengajuanZonaMenunggu.has(zona) ? "Sudah diajukan" : "Ajukan ke Owner"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {!tersembunyi && (
              <div className="space-y-6">
              {mejaCocok
                .map((meja) => (
            <div key={meja}>
              <div className="text-xs font-semibold text-slate-400 mb-2">Meja {meja}</div>
              <div className="flex flex-wrap gap-2">
                {groups[meja]
                  .filter(tampilRak)
                  .sort((a, b) =>
                    (a.code || "").localeCompare(b.code || "", undefined, {
                      numeric: true,
                      sensitivity: "base",
                    })
                  )
                  .map((r) => {
                    const skus = skuDiRak(r.code);
                    const kosong = skus.length === 0;
                    const adaBentrok = skus.some(({ sku }) => gandaLookup.has(`${sku}|${r.code}`));
                    // Rak yang punya SKU tercatat tapi qty di rak itu SEMUANYA
                    // sudah 0 — beda dari "Kosong" (rak yang memang belum
                    // pernah diisi apa-apa). Ditampilkan sebagai "Habis" biar
                    // ada catatan barang apa yang biasa ada di situ, bukan
                    // langsung dianggap rak bebas.
                    const semuaHabis = !kosong && skus.every((s) => s.habis);
                    return (
                      <div
                        key={r.id}
                        className={`w-44 rounded-lg border p-2.5 flex flex-col gap-1.5 ${
                          adaBentrok
                            ? "border-amber-500/40 bg-amber-500/5"
                            : kosong
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : semuaHabis
                            ? "border-rose-500/40 bg-rose-500/5"
                            : "border-sky-500/30 bg-sky-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <MapPin
                            size={13}
                            className={
                              adaBentrok
                                ? "text-amber-400"
                                : kosong
                                ? "text-emerald-400"
                                : semuaHabis
                                ? "text-rose-400"
                                : "text-sky-400"
                            }
                          />
                          <span
                            className={`font-mono text-xs font-semibold ${
                              adaBentrok
                                ? "text-amber-300"
                                : kosong
                                ? "text-emerald-300"
                                : semuaHabis
                                ? "text-rose-300"
                                : "text-sky-300"
                            }`}
                          >
                            {r.code}
                          </span>
                          {semuaHabis && (
                            <span className="text-[9px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-1 py-0.5 ml-auto">
                              HABIS
                            </span>
                          )}
                        </div>
                        {kosong ? (
                          <div className="text-[10px] text-emerald-400/70 italic">Kosong</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {skus.map(({ sku, stok, penempatanId, habis }) => {
                              const bentrokId = gandaLookup.get(`${sku}|${r.code}`);
                              const bentrok = !!bentrokId;
                              const idUntukPindah = bentrokId || penempatanId;
                              const skuObj = (skuMaster || []).find((x) => x.sku === sku);
                              return (
                                <div key={sku} className="group/item flex flex-col gap-0.5">
                                  <div className="flex items-start justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => skuObj && setModal({ type: "detail-sku", item: skuObj })}
                                      title="Lihat detail SKU"
                                      className={`font-mono text-[10px] break-all flex items-center gap-1 text-left hover:underline ${
                                        bentrok ? "text-amber-300" : habis ? "text-slate-500" : "text-slate-300"
                                      }`}
                                    >
                                      {bentrok && <AlertTriangle size={10} className="flex-shrink-0" />}
                                      {sku}
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {habis ? (
                                        <span className="text-[10px] text-rose-400 font-semibold">Habis</span>
                                      ) : (
                                        <span className="text-[10px] text-slate-500 font-medium">{stok}x</span>
                                      )}
                                      {idUntukPindah && !habis && (
                                        <button
                                          onClick={() => bukaPindah(sku, r.code, idUntukPindah, stok)}
                                          title="Pindahkan SKU ini ke rak lain"
                                          className="p-0.5 rounded text-slate-500 hover:text-amber-300 opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition"
                                        >
                                          <ArrowRightLeft size={10} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {bentrok && (
                                    <div className="text-[9px] text-amber-400/80">
                                      juga tercatat di rak lain — pindahkan salah satu
                                    </div>
                                  )}
                                  {habis && !bentrok && (
                                    <div className="text-[9px] text-rose-400/80">
                                      stoknya habis — belum diisi ulang
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
              </div>
              )}
            </div>
              );
            })}
        </div>
      )}
    </div>
  );
}