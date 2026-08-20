import { ImageOff, RotateCcw } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";

export default function FotoProduk({ items, setModal }) {
  const list = items.filter((i) => i.stage === "verifikasi");
  // Barang yang ditarik balik ke sini gara-gara harga SKU-nya baru saja
  // diganti (lihat tandaiPerluFotoUlang di lib/api.js) — fotonya masih foto
  // lama dan wajib difoto ulang karena harga di foto sudah tidak akurat.
  const perluFotoUlang = list.filter((i) => i.perlu_foto_ulang);

  return (
    <div>
      <PageHeader
        title="Pemotretan"
        description="Barang yang siap difoto dan diverifikasi kecocokannya dengan SKU."
      />
      {perluFotoUlang.length > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-xs text-amber-300">
          <RotateCcw size={15} className="shrink-0" />
          <span>
            <span className="font-semibold">{perluFotoUlang.length} barang</span> harganya baru saja diganti dan
            wajib difoto ulang (ditandai <span className="font-semibold">"Harga berubah"</span> di bawah).
          </span>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu pemotretan." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((item) => (
            <div
              key={item.id}
              className={`bg-slate-900 border rounded-lg p-3 relative ${
                item.perlu_foto_ulang ? "border-amber-500/40" : "border-slate-800"
              }`}
            >
              {item.perlu_foto_ulang && (
                <div className="absolute -top-2 left-2 flex items-center gap-1 bg-amber-500 text-slate-950 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  <RotateCcw size={10} />
                  Harga berubah
                </div>
              )}
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
                {item.perlu_foto_ulang
                  ? "Foto ulang →"
                  : item.foto_url
                  ? "Ganti foto verifikasi →"
                  : "Upload foto verifikasi →"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}