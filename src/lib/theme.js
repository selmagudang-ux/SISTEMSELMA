import { useCallback, useEffect, useState } from "react";

// Preferensi tema disimpan di localStorage: "light" | "dark" | "auto" (ikut HP/PC).
// Default "auto". Atribut data-theme di <html> dipasang lebih awal oleh script
// kecil di index.html (supaya tidak ada kedipan), file ini yang mengelolanya
// setelah aplikasi jalan.
const KEY = "selma-theme";
const EVENT = "selma-theme-change";

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(pref) {
  const t = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", t);
  // Warna bar browser di HP ikut tema.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = t === "light" ? "#e4e8ef" : "#181a21";
  return t;
}

export function setThemePref(pref) {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* localStorage tidak tersedia — tema tetap berlaku untuk sesi ini */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme() {
  const [pref, setPref] = useState(getThemePref);

  useEffect(() => {
    const sync = () => setPref(getThemePref());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Mode "auto": ikuti perubahan tema sistem secara langsung.
  useEffect(() => {
    if (pref !== "auto" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("auto");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [pref]);

  const set = useCallback((p) => setThemePref(p), []);
  return { pref, theme: resolveTheme(pref), setPref: set };
}