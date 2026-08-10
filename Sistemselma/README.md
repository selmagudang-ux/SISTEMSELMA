# Sistem Selma

Aplikasi manajemen inventori/warehouse (Gudangku) untuk bisnis perhiasan — melacak SKU, harga, penempatan rak, dan alur barang dari masuk sampai selesai. Dibangun dengan React + Vite + Tailwind, terhubung ke Supabase (PostgreSQL) via REST API.

## Menjalankan di lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Build untuk production

```bash
npm run build
npm run preview   # opsional, untuk cek hasil build
```

## Struktur project

```
src/
  components/   # ModalRouter, Sidebar, forms, ui primitives
  lib/          # api.js (koneksi Supabase), constants.js
  pages/        # satu file per menu (Dashboard, Rak, Stok, dst)
  App.jsx       # routing menu + state utama
  main.jsx      # entry point React
```

## Catatan Supabase

URL & anon key Supabase saat ini ditulis langsung di `src/lib/api.js`. Anon key memang didesain untuk dipakai di sisi client (aman selama Row Level Security di Supabase sudah diatur), tapi kalau mau lebih rapi, bisa dipindah ke environment variable:

1. Buat file `.env` (sudah di-gitignore, tidak akan ke-commit):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxx
   ```
2. Di `src/lib/api.js`, ganti jadi:
   ```js
   const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
   const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
   ```
3. Di Vercel, tambahkan kedua variabel itu di Project Settings → Environment Variables.

## Deploy ke Vercel

Lihat langkah lengkap di percakapan/README internal — ringkasnya: push ke GitHub, import repo di Vercel, Framework Preset otomatis terdeteksi "Vite", klik Deploy.
