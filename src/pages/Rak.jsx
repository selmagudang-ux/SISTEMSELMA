import { useMemo } from "react";
import { Plus, MapPin, PackagePlus, AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { fmtTgl } from "../lib/api";

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

export default function Rak({ sub, items, rak, penempatan, skuMaster, setModal }) {
  if (sub === "peta") return <PetaRak rak={rak} />;
  if (sub === "penempatan") return <PenempatanBarang penempatan={penempatan} />;
  if (sub === "master") return <MasterRak rak={rak} setModal={setModal} />;
  if (sub === "konflik") return <RakTertimpa skuMaster={skuMaster} penempatan={penempatan} />;
  return <TempatkanRak items={items} setModal={setModal} />;
}

function TempatkanRak({ items, setModal }) {
  const menungguRak = items.filter((i) => i.stage === "rak");
  return (
    <div>
      <PageHeader
        title="Tempatkan Barang"
        description="Barang yang sudah punya SKU tapi belum ditempatkan di rak. Klik untuk pilih rak dan jumlahnya."
      />
      {menungguRak.length === 0 ? (
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

function PetaRak({ rak }) {
  const groups = {};
  rak.forEach((r) => {
    const key = r.meja || "Tanpa Meja";
    groups[key] = groups[key] || [];
    groups[key].push(r);
  });
  const groupKeys = Object.keys(groups).sort();

  return (
    <div>
      <PageHeader title="Peta Rak" description="Tampilan visual rak, dikelompokkan per meja, agar mudah dilacak lokasinya." />
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
                  .map((r) => (
                    <div
                      key={r.id}
                      className="w-20 h-20 rounded-lg border border-sky-500/30 bg-sky-500/10 flex flex-col items-center justify-center gap-1"
                      title={r.code}
                    >
                      <MapPin size={14} className="text-sky-400" />
                      <span className="font-mono text-[11px] text-sky-300 text-center px-1 truncate w-full">
                        {r.code}
                      </span>
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

function RakTertimpa({ skuMaster, penempatan }) {
  // SKU dengan stok > 0 tapi rak yang seharusnya ditempatinya sudah ditimpa SKU lain
  // (aturan: 1 rak = 1 SKU, penempatan terbaru di rak yang sama menang).
  const list = useMemo(() => {
    const out = [];
    (skuMaster || []).forEach((s) => {
      if (!s.stok || s.stok <= 0) return;
      const rakSeharusnya = rakForSku(s.sku, penempatan);
      if (!rakSeharusnya) return; // belum pernah ditempatkan di rak sama sekali
      const skuSekarang = skuForRak(rakSeharusnya, penempatan);
      if (skuSekarang && skuSekarang !== s.sku) {
        out.push({ sku: s.sku, stok: s.stok, rak: rakSeharusnya, ditimpaOleh: skuSekarang });
      }
    });
    return out;
  }, [skuMaster, penempatan]);

  return (
    <div>
      <PageHeader
        title="Rak Tertimpa"
        description="SKU yang masih ada stoknya, tapi rak yang tercatat untuknya sudah ditempati SKU lain (butuh ditempatkan ulang)."
      />
      {list.length === 0 ? (
        <EmptyState label="Tidak ada SKU dengan rak tertimpa saat ini." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Stok</th>
                <th className="px-4 py-2.5">Rak Tercatat</th>
                <th className="px-4 py-2.5">Ditimpa Oleh SKU</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.sku} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{r.sku}</td>
                  <td className="px-4 py-2.5">{r.stok}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.rak}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1 text-amber-400 text-xs font-mono">
                      <AlertTriangle size={13} /> {r.ditimpaOleh}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PenempatanBarang({ penempatan }) {
  return (
    <div>
      <PageHeader title="Penempatan Barang" description="Riwayat penempatan barang ke rak, per SKU." />
      {penempatan.length === 0 ? (
        <EmptyState label="Belum ada penempatan barang." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">Waktu</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Rak</th>
                <th className="px-4 py-2.5">Qty</th>
              </tr>
            </thead>
            <tbody>
              {penempatan.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 text-xs">{fmtTgl(p.created_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-2.5 text-sky-400 font-mono text-xs">{p.rak_code}</td>
                  <td className="px-4 py-2.5">{p.qty}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}