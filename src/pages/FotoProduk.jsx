import { useState } from "react";
import { ImageOff, RotateCcw, Camera } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";

// Dua tab: "Foto Baru" (barang yang belum pernah difoto sama sekali) dan
// "Foto Ulang" (barang yang sudah pernah difoto tapi ditarik balik ke sini
// karena ada perubahan — harga SKU baru diganti, atau alasan lain — lihat
// tandaiPerluFotoUlang di lib/api.js untuk pemicu "harga berubah"). Sebelum
// ini dua-duanya dicampur dalam satu grid dengan badge "Harga berubah";
// sekarang dipisah jadi dua tab supaya admin bisa fokus kerjakan satu per
// satu dan langsung kelihatan berapa banyak yang perlu difoto ulang.
const TABS = [
  { key: "baru", label: "Foto Baru", icon: Camera },
  { key: "ulang", label: "Foto Ulang", icon: RotateCcw },
];

export default function FotoProduk({ items, setModal }) {
  const list = items.filter((i) => i.stage === "verifikasi");
  // Barang yang ditarik balik ke sini gara-gara ada perubahan (mis. harga
  // SKU-nya baru saja diganti — lihat tandaiPerluFotoUlang di lib/api.js)
  // — fotonya masih foto lama dan wajib difoto ulang karena sudah tidak
  // akurat lagi (harga, atau perubahan lain).
  const fotoBaru = list.filter((i) => !i.perlu_foto_ulang);
  const fotoUlang = list.filter((i) => i.perlu_foto_ulang);

  const [tab, setTab] = useState("baru");
  const activeList = tab === "ulang" ? fotoUlang : fotoBaru;

  return (
    <div>
      <PageHeader
        title="Pemotretan"
        description={
          tab === "ulang"
            ? "Barang yang sudah pernah difoto tapi perlu difoto ulang karena ada perubahan (mis. harga)."
            : "Barang yang belum pernah difoto dan siap difoto pertama kali."
        }
      />

      <div className="flex items-center gap-2 mb-5 bg-slate-900 border border-slate-800 rounded-lg p-1 max-w-sm">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          const count = t.key === "ulang" ? fotoUlang.length : fotoBaru.length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition ${
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} /> {t.label}
              {count > 0 && (
                <span
                  className={`text-[10px] font-semibold px-1.5 rounded-full ${
                    active ? "bg-slate-950/20" : "bg-slate-800"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeList.length === 0 ? (
        <EmptyState
          label={
            tab === "ulang"
              ? "Tidak ada barang yang perlu difoto ulang."
              : "Tidak ada barang baru yang menunggu pemotretan."
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeList.map((item) => (
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