import { Package, ImageOff } from "lucide-react";
import { PageHeader, EmptyState, ComingSoon } from "../components/ui";

export default function FotoProduk({ sub, items, quickAdvance, setModal }) {
  if (sub === "pemotretan") return <Pemotretan items={items} setModal={setModal} />;
  if (sub === "editing") return <Editing />;
  return <SampleFoto items={items} quickAdvance={quickAdvance} />;
}

function SampleFoto({ items, quickAdvance }) {
  const list = items.filter((i) => i.stage === "sample");
  return (
    <div>
      <PageHeader
        title="Sample Foto"
        description="Barang yang sudah punya rak dan siap diambil sample fisiknya sebelum difoto."
      />
      {list.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu sample." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <Package size={16} className="text-violet-400 mb-2" />
              <div className="text-xs font-mono text-slate-300 truncate">{item.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {item.jumlah}x {item.rak_code ? `· ${item.rak_code}` : ""}
              </div>
              <button
                onClick={() => quickAdvance(item, "sample")}
                className="mt-2 w-full text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
              >
                Sample diambil →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pemotretan({ items, setModal }) {
  const list = items.filter((i) => i.stage === "verifikasi");
  return (
    <div>
      <PageHeader
        title="Pemotretan"
        description="Barang yang siap difoto dan diverifikasi kecocokannya dengan SKU."
      />
      {list.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu pemotretan." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              {item.foto_url ? (
                <img
                  src={item.foto_url}
                  alt={item.sku}
                  onClick={() => setModal({ type: "lihat-foto", item })}
                  className="w-full h-24 object-cover rounded-md mb-2 border border-slate-800 cursor-pointer hover:opacity-80"
                />
              ) : (
                <div className="w-full h-24 rounded-md mb-2 border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                  <ImageOff size={18} />
                </div>
              )}
              <div className="text-xs font-mono text-slate-300 truncate">{item.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {item.jumlah}x {item.rak_code ? `· ${item.rak_code}` : ""}
              </div>
              <button
                onClick={() => setModal({ type: "advance-verifikasi", item })}
                className="mt-2 w-full text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
              >
                Upload foto verifikasi →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Editing() {
  return (
    <div>
      <PageHeader title="Editing" description="Edit foto produk sebelum diupload ke marketplace." />
      <ComingSoon
        title="Fitur Editing Foto segera hadir"
        description="Nanti di sini bisa crop, kasih background, dan watermark foto produk langsung dari sistem, tanpa perlu aplikasi lain."
      />
    </div>
  );
}
