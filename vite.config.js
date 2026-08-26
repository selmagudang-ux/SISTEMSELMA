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
          return "vendor";
        },
      },
    },
  },
});