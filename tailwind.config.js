/** @type {import('tailwindcss').Config} */
// TEMA "SOFT MODERN" — terang & gelap.
// Semua warna sekarang membaca CSS variable (didefinisikan di src/index.css
// per tema: :root = gelap, [data-theme="light"] = terang), jadi ganti tema
// cukup ganti atribut data-theme di <html> — tidak ada halaman yang perlu
// diubah satu-satu. Skala `slate` ikut dipetakan ulang (di tema terang
// urutannya dibalik), jadi ribuan class bg-slate-* / text-slate-* yang sudah
// ada otomatis ikut berganti tema.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const slateSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const slate = Object.fromEntries(slateSteps.map((s) => [s, v(`slate-${s}`)]));

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Ganti ke "Roboto" lagi kalau mau tampilan font yang lama.
        sans: ['"Plus Jakarta Sans"', "Roboto", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        slate,
        md: {
          "surface-dim": v("md-surface-dim"),
          surface: v("md-surface"),
          "surface-bright": v("md-surface-bright"),
          "container-lowest": v("md-container-lowest"),
          "container-low": v("md-container-low"),
          container: v("md-container"),
          "container-high": v("md-container-high"),
          "container-highest": v("md-container-highest"),
          outline: v("md-outline"),
          "outline-variant": v("md-outline-variant"),
          "on-surface": v("md-on-surface"),
          "on-surface-variant": v("md-on-surface-variant"),
          primary: v("md-primary"),
          "on-primary": v("md-on-primary"),
          "primary-container": v("md-primary-container"),
          "on-primary-container": v("md-on-primary-container"),
          error: v("md-error"),
          "on-error": v("md-on-error"),
          "error-container": v("md-error-container"),
          "on-error-container": v("md-on-error-container"),
        },
      },
      // Sudut lebih membulat = kesan lebih lembut (berlaku ke seluruh app).
      borderRadius: {
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "md-xs": "6px",
        "md-sm": "10px",
        "md-md": "14px",
        "md-lg": "18px",
        "md-xl": "28px",
      },
      // Bayangan tipis & menyebar (bukan bayangan keras).
      boxShadow: {
        "elevation-1": "0 1px 2px 0 rgb(var(--shadow) / .06), 0 2px 8px -2px rgb(var(--shadow) / .10)",
        "elevation-2": "0 2px 4px 0 rgb(var(--shadow) / .06), 0 6px 16px -4px rgb(var(--shadow) / .14)",
        "elevation-3": "0 4px 8px 0 rgb(var(--shadow) / .06), 0 16px 36px -8px rgb(var(--shadow) / .22)",
      },
    },
  },
  plugins: [],
};