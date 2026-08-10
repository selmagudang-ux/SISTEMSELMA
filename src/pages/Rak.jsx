import { useMemo, useState } from "react";
import { Plus, MapPin, PackagePlus, AlertTriangle, ArrowDownUp, CheckCircle2 } from "lucide-react";
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

// SKU dengan stok > 0 tapi rak yang seharusnya ditempatinya sudah ditimpa SKU lain
// (aturan: 1 rak = 1 SKU, penempatan terbaru di rak yang sama menang) — perlu ditempatkan ulang.
function cariPerluDitempatkanUlang(skuMaster, penempatan) {
  const out = [];
  (skuMaster || []).forEach((s) => {
    if (!s.stok || s.stok <= 0) return;
    const rakSeharusnya = rakForSku(s.sku, penempatan);
    if (!rakSeharusnya) return; // belum pernah ditempatkan di rak sama sekali
    const skuSekarang = skuForRak(rakSeharusnya, penempatan);
    if (skuSekarang && skuSekarang !== s.sku) {
      out.push({ sku: s.sku, stok: s.stok, rakLama: rakSeharusnya, ditimpaOleh: skuSekarang });
    }
  });
  return out;
}

export default function Rak({ sub, items, rak, penempatan, skuMaster, setModal }) {
  if (sub === "peta") return <PetaRak rak={rak} />;
  if (sub === "penempatan") return <PenempatanBarang penempatan={penempatan} rak={rak} skuMaster={skuMaster} />;
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

const SORT_OPTIONS = [
  { key: "waktu", label: "Waktu Terbaru" },
  { key: "sku", label: "SKU (A–Z)" },
  { key: "rak", label: "Rak (A–Z)" },
];

function PenempatanBarang({ penempatan, rak, skuMaster }) {
  const [sortBy, setSortBy] = useState("waktu");

  const sorted = useMemo(() => {
    const arr = [...(penempatan || [])];
    if (sortBy === "sku") arr.sort((a, b) => (a.sku || "").localeCompare(b.sku || ""));
    else if (sortBy === "rak") arr.sort((a, b) => (a.rak_code || "").localeCompare(b.rak_code || ""));
    else arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
  }, [penempatan, sortBy]);

  // Rak dianggap kosong kalau tidak ada penempatan terbaru di situ, atau SKU yang
  // terakhir menempatinya sudah habis stoknya (sudah dipindah/keluar semua).
  const rakKosong = useMemo(() => {
    return (rak || []).filter((r) => {
      const skuDiRak = skuForRak(r.code, penempatan);
      if (!skuDiRak) return true;
      const skuData = (skuMaster || []).find((s) => s.sku === skuDiRak);
      return !skuData || !skuData.stok || skuData.stok <= 0;
    });
  }, [rak, penempatan, skuMaster]);

  return (
    <div>
      <PageHeader title="Penempatan Barang" description="Riwayat penempatan barang ke rak, per SKU." />

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-2">
          <CheckCircle2 size={14} /> Rak Kosong ({rakKosong.length})
        </div>
        {rakKosong.length === 0 ? (
          <div className="text-[11px] text-slate-500">Semua rak sedang terisi.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rakKosong.map((r) => (
              <span
                key={r.id}
                className="font-mono text-[11px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              >
                {r.code}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-500">
        <ArrowDownUp size={13} />
        <span>Urutkan:</span>
        <div className="flex gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                sortBy === opt.key
                  ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                  : "border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
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
              {sorted.map((p) => (
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