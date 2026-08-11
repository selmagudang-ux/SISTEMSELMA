// =========================================================
// KONEKSI SUPABASE (REST / PostgREST — anon key)
// =========================================================
const SUPABASE_URL = "https://mctzwsfnidxvckadqlhq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdHp3c2ZuaWR4dmNrYWRxbGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNTAwNDQsImV4cCI6MjEwMTcyNjA0NH0.0RN1_Kbk4MS_FBR2b9ahZtKIzEaDNR0IzgoeSSdp8eQ";

export async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Nama bucket Storage di Supabase untuk menyimpan foto verifikasi.
// Pastikan bucket ini sudah dibuat (public, dengan policy insert untuk anon).
export const STORAGE_BUCKET = "verifikasi-foto";

export async function sbUploadFoto(file, path) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Gagal unggah foto (${res.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

export function calcHarga(hargaAsli, settings) {
  const round = (n) => Math.round(n / settings.round_to) * settings.round_to;

  // Harga asli minimal Rp 7.000.
  const hargaAsliDipakai = Math.max(Number(hargaAsli) || 0, 7000);

  // HPP = Harga Asli + 10%.
  const hpp = hargaAsliDipakai * 1.1;

  // Pengali Harga Tengah tergantung besar HPP.
  let tengahMultiplier;
  if (hpp < 10000) tengahMultiplier = 3;
  else if (hpp < 20000) tengahMultiplier = 2.5;
  else tengahMultiplier = 2;

  const tengah = round(hpp * tengahMultiplier);
  const ecer = round(tengah * 2);
  const grosir = round(hpp * 1.5);

  return { hargaDasar: hargaAsliDipakai, hpp, grosir, tengah, ecer };
}

export const fmtRp = (n) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

// Kode harga untuk label: ambil ribuan tiap harga (000 dibuang), gabung jadi satu string.
// Contoh: grosir 5.000, tengah 10.000, ecer 20.000 -> "5" + "10" + "20" = "51020"
export function priceCode(grosir, tengah, ecer) {
  const part = (n) => String(Math.round((Number(n) || 0) / 1000));
  return `${part(grosir)}${part(tengah)}${part(ecer)}`;
}

export const fmtTgl = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

// Cari label dari master_data berdasarkan tipe + kode. Fallback ke kode itu sendiri.
export function labelFor(master, tipe, kode) {
  const found = (master[tipe] || []).find((m) => m.kode === kode);
  return found ? found.label : kode || "—";
}

// Dua SKU dianggap "produk yang sama" (boleh berbagi rak) kalau semua atribut
// pembentuknya sama PERSIS kecuali ukuran. Butuh data sku_master untuk
// membandingkan field-nya (kode SKU sendiri sudah menyertakan ukuran di dalamnya).
const FIELD_PEMBANDING = ["bahan", "peruntukan", "kategori", "subkategori", "model", "warna"];

export function sameProdukKecualiUkuran(skuA, skuB, skuMaster) {
  if (!skuA || !skuB) return false;
  if (skuA === skuB) return true;
  const a = (skuMaster || []).find((s) => s.sku === skuA);
  const b = (skuMaster || []).find((s) => s.sku === skuB);
  if (!a || !b) return false;
  return FIELD_PEMBANDING.every((f) => (a[f] || "") === (b[f] || ""));
}

// =========================================================
// EXPORT / DOWNLOAD DATA (CSV)
// =========================================================
// columns: [{ key, label }] — key dipakai untuk ambil nilai dari tiap baris (row[key]),
// label dipakai sebagai judul kolom. rows: array of object (mis. items, sku_master, dll).
export function downloadCsv(filename, columns, rows) {
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = (rows || []).map((row) => columns.map((c) => escape(row[c.key])).join(","));
  // Tambah BOM (\uFEFF) supaya Excel langsung baca sebagai UTF-8, bukan cuma teks polos.
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================================================
// PENGELOMPOKAN PER KATEGORI -> SUBKATEGORI
// Dipakai di Master Barang dan PDF Katalog supaya
// urutan & label grup selalu konsisten di ketiga tempat.
// Struktur hasil: [{ kategori, groups: [{ subkategori, items }] }]
// - Item tanpa kategori/subkategori masuk grup "Tanpa Kategori" /
//   "Tanpa Subkategori", selalu ditaruh paling akhir.
// =========================================================
export const TANPA_KATEGORI = "Tanpa Kategori";
export const TANPA_SUBKATEGORI = "Tanpa Subkategori";

export function groupByKategori(list) {
  const byKategori = new Map();
  for (const item of list) {
    const kategori = item.kategori?.trim() || TANPA_KATEGORI;
    const subkategori = item.subkategori?.trim() || TANPA_SUBKATEGORI;
    if (!byKategori.has(kategori)) byKategori.set(kategori, new Map());
    const bySub = byKategori.get(kategori);
    if (!bySub.has(subkategori)) bySub.set(subkategori, []);
    bySub.get(subkategori).push(item);
  }

  const sortKeys = (keys) =>
    keys.sort((a, b) => {
      if (a === TANPA_KATEGORI || a === TANPA_SUBKATEGORI) return 1;
      if (b === TANPA_KATEGORI || b === TANPA_SUBKATEGORI) return -1;
      return a.localeCompare(b, "id");
    });

  return sortKeys(Array.from(byKategori.keys())).map((kategori) => {
    const bySub = byKategori.get(kategori);
    const groups = sortKeys(Array.from(bySub.keys())).map((subkategori) => ({
      subkategori,
      items: bySub.get(subkategori),
    }));
    return { kategori, groups };
  });
}

// =========================================================
// DOWNLOAD FOTO PRODUK
// Nama file = kode SKU. Kalau cuma 1 foto -> download langsung.
// Kalau lebih dari 1 -> semuanya dibungkus jadi satu file ZIP
// (pakai JSZip, dimuat lazy lewat dynamic import).
// =========================================================
function extFromUrl(url) {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url || "");
  return match ? match[1].toLowerCase() : "jpg";
}

function safeFileName(name) {
  return (name || "foto").replace(/[^a-zA-Z0-9-_]/g, "-");
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// fotos: [{ sku, url }] — url yang kosong/null otomatis dilewati.
// opts.onProgress(done, total): dipanggil selagi tiap foto diunduh.
export async function downloadFotos(fotos, opts = {}) {
  const { onProgress } = opts;
  const list = (fotos || []).filter((f) => f.url);
  if (list.length === 0) return;

  if (list.length === 1) {
    const { sku, url } = list[0];
    const res = await fetch(url);
    const blob = await res.blob();
    onProgress?.(1, 1);
    triggerBlobDownload(blob, `${safeFileName(sku)}.${extFromUrl(url)}`);
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const namaDipakai = new Map(); // hindari nama file bentrok kalau ada SKU yang sama

  let done = 0;
  for (const { sku, url } of list) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const base = safeFileName(sku);
      const ext = extFromUrl(url);
      const n = (namaDipakai.get(base) || 0) + 1;
      namaDipakai.set(base, n);
      zip.file(n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}`, blob);
    } catch (e) {
      console.error("Gagal ambil foto untuk", sku, e);
    }
    done += 1;
    onProgress?.(done, list.length);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(zipBlob, `foto-produk-${new Date().toISOString().slice(0, 10)}.zip`);
}