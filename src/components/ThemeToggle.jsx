import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../lib/theme";

// Pilihan tema 3 tombol: Terang / Gelap / Otomatis (ikut perangkat).
const OPSI = [
  { key: "light", label: "Terang", Icon: Sun },
  { key: "dark", label: "Gelap", Icon: Moon },
  { key: "auto", label: "Otomatis (ikut perangkat)", Icon: Monitor },
];

export default function ThemeToggle({ className = "" }) {
  const { pref, setPref } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className={`inline-flex items-center gap-0.5 rounded-full bg-md-container-high p-1 ${className}`}
    >
      {OPSI.map(({ key, label, Icon }) => {
        const aktif = pref === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={aktif}
            title={label}
            onClick={() => setPref(key)}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition ${
              aktif
                ? "bg-md-primary-container text-md-on-primary-container shadow-elevation-1"
                : "text-md-on-surface-variant hover:text-md-on-surface"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
