import { useEffect, useMemo } from "react";
import { X, FileText } from "lucide-react";
import { fileAdalahPdf } from "../lib/bukti";

// Pratinjau berkas yang BARU DIPILIH (belum diunggah): foto tampil sebagai gambar kecil, PDF sebagai kotak "PDF".
// Klik untuk membuka ukuran penuh di tab baru. onHapus(index) opsional: menampilkan tombol X untuk membuang berkas.
export default function PratinjauBerkas({ files = [], onHapus }) {
  const items = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f), pdf: fileAdalahPdf(f) })), [files]);
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 w-full">
      {items.map((i, idx) => (
        <div key={`${i.f.name}-${i.f.size}-${idx}`} className="relative">
          <a
            href={i.url}
            target="_blank"
            rel="noreferrer"
            title={`${i.f.name} — klik untuk memperbesar`}
            className="block w-16 h-16 rounded-md border border-slate-500/40 overflow-hidden bg-slate-500/10"
          >
            {i.pdf ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[9px] opacity-80">
                <FileText size={18} />
                PDF
              </div>
            ) : (
              <img src={i.url} alt={i.f.name} className="w-full h-full object-cover" />
            )}
          </a>
          {onHapus && (
            <button
              type="button"
              onClick={() => onHapus(idx)}
              title="Buang berkas ini"
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
