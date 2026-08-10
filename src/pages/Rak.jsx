import { useMemo } from "react";
import { Plus, MapPin, PackagePlus, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { sameProdukKecualiUkuran } from "../lib/api";

// Cari kode rak terbaru untuk sebuah SKU (penempatan sudah diurutkan created_at desc).
function rakForSku(sku, penempatan) {
  const found = (penempatan || []).find((p) => p.sku === sku);
  return found ? found.rak_code : "";
}

// Cari SKU yang SAAT INI menempati sebuah rak (aturan: 1 rak = 1 SKU, ambil penempatan terbaru).
function skuForRak(rakCode, penempatan) {
  const found = (penempatan || []).find((p) => p.rak_code === rakCode);
  return found ? found.sku : "";
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

export default function Rak({ sub, items, rak, penempatan, skuMaster, setModal }) {
  if (sub === "peta") return <PetaRak rak={rak} penempatan={penempatan} skuMaster={skuMaster} />;
  if (sub === "master") return <MasterRak rak={rak} setModal={setModal} />;
  return <TempatkanRak items={items} skuMaster={skuMaster} penempatan={penempatan} setModal={setModal} />;
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
          {rak.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-1.5 text-sky-400">
                <MapPin size={14} />
                <span className="font-mono font-semibold text-sm">{r.code}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {r.meja ? `Meja ${r.meja}` : ""} {r.baris ? `· Baris ${r.baris}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PetaRak({ rak, penempatan, skuMaster }) {
  const groups = {};
  rak.forEach((r) => {
    const key = r.meja || "Tanpa Meja";
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });
  const groupKeys = Object.keys(groups).sort();

  // SKU yang saat ini benar-benar mengisi rak ini (stok masih > 0). Bisa lebih
  // dari satu kalau rak dipakai bareng beberapa ukuran dari produk yang sama.
  const skuDiRak = (kodeRak) => {
    const skuSet = new Set(
      (penempatan || []).filter((p) => p.rak_code === kodeRak).map((p) => p.sku)
    );
    return [...skuSet].filter((sku) => {
      const s = (skuMaster || []).find((x) => x.sku === sku);
      return s && s.stok > 0;
    });
  };

  return (
    <div>
      <PageHeader
        title="Peta Rak"
        description="Tampilan visual rak, dikelompokkan per meja, lengkap dengan SKU yang mengisi tiap rak."
      />
      {rak.length === 0 ? (
        <EmptyState label="Belum ada rak untuk dipetakan." />
      ) : (
        <div className="space-y-6">
          {groupKeys.map((meja) => (
            <div key={meja}>
              <div className="text-xs font-semibold text-slate-400 mb-2">Meja {meja}</div>
              <div className="flex flex-wrap gap-2">
                {groups[meja]
                  .sort((a, b) => (a.baris || "").localeCompare(b.baris || ""))
                  .map((r) => {
                    const skus = skuDiRak(r.code);
                    const kosong = skus.length === 0;
                    return (
                      <div
                        key={r.id}
                        className={`w-32 rounded-lg border p-2.5 flex flex-col gap-1.5 ${
                          kosong
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-sky-500/30 bg-sky-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className={kosong ? "text-emerald-400" : "text-sky-400"} />
                          <span
                            className={`font-mono text-xs font-semibold truncate ${
                              kosong ? "text-emerald-300" : "text-sky-300"
                            }`}
                          >
                            {r.code}
                          </span>
                        </div>
                        {kosong ? (
                          <div className="text-[10px] text-emerald-400/70 italic">Kosong</div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {skus.map((sku) => (
                              <span key={sku} className="font-mono text-[10px] text-slate-300 truncate" title={sku}>
                                {sku}
                              </span>
                            ))}
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