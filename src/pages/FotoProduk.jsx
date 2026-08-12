import { ImageOff } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";

export default function FotoProduk({ items, setModal }) {
  const list = items.filter((i) => i.stage === "verifikasi");

  // SKU yang sudah punya foto (dari barang lain dengan SKU sama yang sudah
  // pernah diupload fotonya) — dipakai untuk mengunci tombol upload supaya
  // foto yang sudah ada tidak bisa ditimpa.
  const sudahAdaFoto = (sku, currentId) =>
    items.some((i) => i.sku === sku && i.id !== currentId && i.foto_url);

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
          {list.map((item) => {
            const terkunci = sudahAdaFoto(item.sku, item.id);
            return (
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
                {terkunci ? (
                  <div className="mt-2 w-full text-[11px] font-medium bg-slate-800/50 text-slate-500 rounded-md py-1.5 text-center">
                    SKU sudah punya foto
                  </div>
                ) : (
                  <button
                    onClick={() => setModal({ type: "advance-verifikasi", item })}
                    className="mt-2 w-full text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
                  >
                    Upload foto verifikasi →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}