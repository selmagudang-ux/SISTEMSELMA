import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

// =========================================================
// Zoom foto untuk layar kasir (tema gelap kasir).
//  - FotoZoom   : lightbox layar penuh. Zoom 1x–8x lewat scroll mouse, tombol +/-,
//                 klik 2x, atau cubit 2 jari di layar sentuh. Geser gambar saat sudah di-zoom.
//                 Tutup: tombol X, klik area gelap, atau tombol Esc.
//  - FotoThumb  : gambar kecil yang bisa diklik → membuka FotoZoom.
// =========================================================
const MIN = 1;
const MAX = 8;
const klem = (v) => Math.min(MAX, Math.max(MIN, v));

export function FotoZoom({ src, judul, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const area = useRef(null);
  const ptrs = useRef(new Map()); // pointerId -> {x,y}
  const awal = useRef(null); // snapshot saat gestur mulai
  const moved = useRef(false);

  const zoomKe = (v) => {
    const s = klem(v);
    setScale(s);
    if (s === MIN) setPos({ x: 0, y: 0 });
  };

  // Esc untuk menutup
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Scroll mouse (listener native supaya bisa preventDefault)
  const state = useRef({ scale: 1 });
  state.current.scale = scale;
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const h = (e) => {
      e.preventDefault();
      const s = state.current.scale;
      zoomKe(s - e.deltaY * 0.0025 * s);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jarak = () => {
    const [a, b] = [...ptrs.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (ptrs.current.size === 2) {
      awal.current = { mode: "pinch", d: jarak(), scale };
    } else if (ptrs.current.size === 1) {
      awal.current = { mode: "drag", x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
      if (scale > MIN) setDragging(true);
    }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = awal.current;
    if (!a) return;
    if (a.mode === "pinch" && ptrs.current.size >= 2) {
      moved.current = true;
      zoomKe(a.scale * (jarak() / a.d));
    } else if (a.mode === "drag" && scale > MIN) {
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setPos({ x: a.ox + dx, y: a.oy + dy });
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    setDragging(false);
    if (ptrs.current.size === 1) {
      const [p] = [...ptrs.current.values()];
      awal.current = { mode: "drag", x: p.x, y: p.y, ox: pos.x, oy: pos.y };
    } else {
      awal.current = null;
    }
  };

  const tombol = "w-9 h-9 flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10";

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/90 flex flex-col"
      onClick={(e) => {
        // klik area gelap (bukan gambar / tombol) menutup
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0">
        <div className="text-sm text-slate-300 truncate min-w-0">{judul}</div>
        <button onClick={onClose} title="Tutup (Esc)" className={tombol}>
          <X size={20} />
        </button>
      </div>

      <div
        ref={area}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => zoomKe(scale === MIN ? 2.5 : MIN)}
        onClick={(e) => {
          if (e.target === e.currentTarget && !moved.current) onClose();
        }}
        style={{ touchAction: "none" }}
        className={`flex-1 min-h-0 overflow-hidden flex items-center justify-center ${
          scale > MIN ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
      >
        <img
          src={src}
          alt={judul || ""}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging || ptrs.current.size > 1 ? "none" : "transform 100ms ease-out",
          }}
        />
      </div>

      <div className="flex items-center justify-center gap-1 py-3 flex-shrink-0">
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded-xl p-1">
          <button onClick={() => zoomKe(scale - 0.75)} title="Perkecil" className={tombol}>
            <ZoomOut size={18} />
          </button>
          <span className="text-xs text-slate-300 w-12 text-center font-mono tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => zoomKe(scale + 0.75)} title="Perbesar" className={tombol}>
            <ZoomIn size={18} />
          </button>
          <button onClick={() => zoomKe(MIN)} title="Reset zoom" className={`${tombol} ${scale > MIN ? "text-amber-400" : "opacity-40"}`}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="pb-3 text-center text-[11px] text-slate-500 flex-shrink-0">
        Scroll / cubit untuk zoom · klik 2× untuk perbesar · geser untuk lihat bagian lain
      </div>
    </div>,
    document.body
  );
}

// Gambar kecil yang bisa diklik untuk dizoom. `className` mengatur ukuran/bentuk gambar.
export function FotoThumb({ src, judul, className = "" }) {
  const [buka, setBuka] = useState(false);
  if (!src) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setBuka(true);
        }}
        title="Klik untuk perbesar"
        className="flex-shrink-0 cursor-zoom-in rounded-lg hover:ring-2 hover:ring-amber-500/60 transition"
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          className={className}
          onError={(e) => {
            e.currentTarget.parentElement.style.display = "none";
          }}
        />
      </button>
      {buka && <FotoZoom src={src} judul={judul} onClose={() => setBuka(false)} />}
    </>
  );
}
