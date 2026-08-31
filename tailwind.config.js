/** @type {import('tailwindcss').Config} */
// Token warna & bentuk mengikuti sistem Material Design 3 (dark theme) —
// dipetakan ke palet gelap + aksen amber yang sudah jadi identitas Sistem
// Selma, bukan biru default Material, supaya tetap terasa "brand sendiri"
// tapi strukturnya asli Android (surface bertingkat/tonal elevation, shape
// scale, elevation shadow).
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Roboto = font sistem Android/Material bawaan.
        sans: ["Roboto", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        md: {
          "surface-dim": "#0d0e12",
          surface: "#131419",
          "surface-bright": "#37383f",
          "container-lowest": "#08090c",
          "container-low": "#1a1c22",
          container: "#1e2027",
          "container-high": "#292a32",
          "container-highest": "#33343d",
          outline: "#46464f",
          "outline-variant": "#2a2c34",
          "on-surface": "#e6e2e6",
          "on-surface-variant": "#a6a4ab",
          primary: "#ffbb44",
          "on-primary": "#452b00",
          "primary-container": "#633f00",
          "on-primary-container": "#ffddab",
          error: "#ffb4ab",
          "on-error": "#690005",
          "error-container": "#93000a",
          "on-error-container": "#ffdad6",
        },
      },
      borderRadius: {
        "md-xs": "4px",
        "md-sm": "8px",
        "md-md": "12px",
        "md-lg": "16px",
        "md-xl": "28px",
      },
      boxShadow: {
        "elevation-1": "0 1px 2px 0 rgba(0,0,0,.45), 0 1px 3px 1px rgba(0,0,0,.25)",
        "elevation-2": "0 1px 2px 0 rgba(0,0,0,.45), 0 2px 6px 2px rgba(0,0,0,.25)",
        "elevation-3": "0 4px 8px 3px rgba(0,0,0,.25), 0 1px 3px 0 rgba(0,0,0,.45)",
      },
    },
  },
  plugins: [],
};