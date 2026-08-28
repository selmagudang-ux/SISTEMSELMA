import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Pisahkan library pihak-ketiga yang besar & jarang berubah ke chunk
        // sendiri-sendiri, supaya browser bisa nge-cache masing-masing
        // terpisah (tidak ke-invalidate cuma gara-gara ada perubahan kode
        // aplikasi sendiri), dan cuma didownload kalau halaman yang
        // memakainya benar-benar dibuka. Tidak mengubah perilaku aplikasi
        // sama sekali, cuma cara file JS-nya dikemas.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("jszip")) return "vendor-jszip";
          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("lucide-react")) return "vendor-icons";
          // jsPDF cuma dipakai dari halaman SkuHarga & Keuangan (sudah
          // lazy-loaded). Sengaja TIDAK dikasih nama chunk manual (beda
          // dari jszip/html2canvas/tesseract di atas) — kalau dipaksa jadi
          // chunk sendiri, Rollup menaruh helper dynamic-import bersama
          // di situ, dan itu malah bikin seluruh chunk jsPDF ikut
          // ke-preload eager. Dibiarkan `undefined` di sini supaya Rollup
          // split otomatis mengikuti batas lazy-load halaman yang benar.
          if (id.includes("jspdf")) return undefined;
          // tesseract.js sendirian ~700KB — kalau ikut digabung ke "vendor"
          // dia ikut ke-preload dari index.html walau importnya sudah
          // dynamic di ocrSku.js. Dipisah sendiri supaya cuma diambil saat
          // fitur scan-foto SKU benar-benar dipakai.
          if (id.includes("tesseract")) return "vendor-tesseract";
          return "vendor";
        },
      },
    },
  },
});