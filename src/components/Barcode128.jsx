import { useMemo } from "react";
import { encodeCode128B } from "../lib/code128";

// Barcode Code 128 sebagai SVG (vektor, tajam saat dicetak). Lebar mengikuti
// wadahnya (width 100%), tinggi diatur dalam mm (tinggiMm kosong = isi penuh tinggi wadah). Garis dirapatkan per "run"
// supaya path-nya kecil walau SKU panjang.
export default function Barcode128({ value, tinggiMm = 10, className = "" }) {
  const bits = useMemo(() => encodeCode128B(value), [value]);
  const path = useMemo(() => {
    if (!bits) return "";
    const quiet = 10; // zona tenang kiri/kanan (dalam modul) supaya scanner mudah membaca
    let d = "";
    let i = 0;
    while (i < bits.length) {
      if (bits[i] === "1") {
        let j = i;
        while (j < bits.length && bits[j] === "1") j++;
        d += `M${i + quiet} 0h${j - i}v1h-${j - i}z`;
        i = j;
      } else {
        i++;
      }
    }
    return d;
  }, [bits]);

  if (!bits) return null;
  const total = bits.length + 20;
  return (
    <svg
      viewBox={`0 0 ${total} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
      className={className}
      style={{ width: "100%", height: tinggiMm ? `${tinggiMm}mm` : "100%", display: "block" }}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}