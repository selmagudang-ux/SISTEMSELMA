import { useMemo } from "react";
import { Plus, MapPin, PackagePlus, AlertTriangle, ArrowRightLeft, Pencil, Trash2, Warehouse } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { sameProdukKecualiUkuran } from "../lib/api";

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

export default function Rak({ sub, items, rak, penempatan, skuMaster, setModal }) {
  if (sub === "peta")
    return <PetaRak rak={rak} penempatan={penempatan} skuMaster={skuMaster} setModal={setModal} />;
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

function PetaRak({ rak, penempatan, skuMaster, setModal }) {
  const groups = {};
  rak.forEach((r) => {
    const key = r.meja || "Tanpa Meja";
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });
  const groupKeys = Object.keys(groups).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

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
        if (!s || !(s.stok > 0)) return false;
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
        return {
          sku,
          stok: qtyRak != null ? qtyRak : (skuMaster || []).find((x) => x.sku === sku)?.stok ?? 0,
          penempatanId: penempatanRak?.id ?? null,
        };
      });
  };

  return (
    <div>
      <PageHeader
        title="Peta Rak"
        description="Tampilan visual rak, dikelompokkan per meja, lengkap dengan SKU yang mengisi tiap rak."
      />

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
      ) : (
        <div className="space-y-6">
          {groupKeys.map((meja) => (
            <div key={meja}>
              <div className="text-xs font-semibold text-slate-400 mb-2">Meja {meja}</div>
              <div className="flex flex-wrap gap-2">
                {groups[meja]
                  .sort((a, b) =>
                    (a.baris || "").localeCompare(b.baris || "", undefined, {
                      numeric: true,
                      sensitivity: "base",
                    })
                  )
                  .map((r) => {
                    const skus = skuDiRak(r.code);
                    const kosong = skus.length === 0;
                    const adaBentrok = skus.some(({ sku }) => gandaLookup.has(`${sku}|${r.code}`));
                    return (
                      <div
                        key={r.id}
                        className={`w-44 rounded-lg border p-2.5 flex flex-col gap-1.5 ${
                          adaBentrok
                            ? "border-amber-500/40 bg-amber-500/5"
                            : kosong
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-sky-500/30 bg-sky-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <MapPin
                            size={13}
                            className={adaBentrok ? "text-amber-400" : kosong ? "text-emerald-400" : "text-sky-400"}
                          />
                          <span
                            className={`font-mono text-xs font-semibold ${
                              adaBentrok ? "text-amber-300" : kosong ? "text-emerald-300" : "text-sky-300"
                            }`}
                          >
                            {r.code}
                          </span>
                        </div>
                        {kosong ? (
                          <div className="text-[10px] text-emerald-400/70 italic">Kosong</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {skus.map(({ sku, stok, penempatanId }) => {
                              const bentrokId = gandaLookup.get(`${sku}|${r.code}`);
                              const bentrok = !!bentrokId;
                              const idUntukPindah = bentrokId || penempatanId;
                              return (
                                <div key={sku} className="group/item flex flex-col gap-0.5">
                                  <div className="flex items-start justify-between gap-1.5">
                                    <span
                                      className={`font-mono text-[10px] break-all flex items-center gap-1 ${
                                        bentrok ? "text-amber-300" : "text-slate-300"
                                      }`}
                                    >
                                      {bentrok && <AlertTriangle size={10} className="flex-shrink-0" />}
                                      {sku}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[10px] text-slate-500 font-medium">{stok}x</span>
                                      {idUntukPindah && (
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
}