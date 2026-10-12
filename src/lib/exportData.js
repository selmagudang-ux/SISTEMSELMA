// =========================================================
// EXPORT DATA KE EXCEL (.xlsx). Untuk CSV pakai downloadCsv di lib/api.js
// (format kolom sama: [{ key, label }]) — jadi satu daftar kolom bisa dipakai
// untuk dua-duanya.
//
// sheets: [{ name, columns: [{ key, label }], rows: [ {...} ] }]
// Angka tetap angka (bukan teks) supaya bisa dijumlah/difilter di Excel;
// nilai null/undefined jadi sel kosong.
// "xlsx" dimuat lazy (dynamic import) — tidak menambah ukuran bundle awal.
// =========================================================
export async function downloadXlsx(filename, sheets) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const dipakai = new Set();
  for (const sh of sheets) {
    const aoa = [
      sh.columns.map((c) => c.label),
      ...(sh.rows || []).map((row) => sh.columns.map((c) => (row[c.key] === undefined ? null : row[c.key]))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // lebar kolom mengikuti isi terpanjang (maks 50 karakter)
    ws["!cols"] = sh.columns.map((_, i) => ({
      wch: Math.min(50, Math.max(8, ...aoa.slice(0, 500).map((r) => String(r[i] ?? "").length)) + 2),
    }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    // nama sheet: maks 31 karakter, tanpa : \ / ? * [ ], dan unik
    let nama = String(sh.name || "Data").replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Data";
    let n = 2;
    while (dipakai.has(nama.toLowerCase())) nama = `${nama.slice(0, 28)} ${n++}`;
    dipakai.add(nama.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, nama);
  }
  XLSX.writeFile(wb, filename);
}
