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
// GROSIR — helper umum
// =========================================================
// Bikin kode urut berikutnya dari sebuah daftar, mis. "PLG-0001", "PLG-0002".
// list: array of object, field: nama kolom kode, prefix: mis. "PLG-".
export function nextKode(list, field, prefix) {
  let max = 0;
  (list || []).forEach((item) => {
    const kode = item[field];
    if (typeof kode === "string" && kode.startsWith(prefix)) {
      const num = parseInt(kode.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(4, "0");
}

// Tanggal hari ini format ddMMyyyy (dipakai untuk prefix nomor pesanan grosir harian).
export function todayDDMMYYYY() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}`;
}

// =========================================================
// GROSIR — CICILAN HUTANG & DEPOSIT PELANGGAN
// (helper hitung dinamis, sama pola dengan sistem grosir lama:
//  sisa hutang & saldo deposit TIDAK disimpan sebagai angka statis,
//  selalu dihitung ulang dari riwayat grosir_pembayaran / grosir_deposit
//  supaya tidak pernah "basi" / tidak sinkron.)
// =========================================================

// Total yang sudah dibayar untuk satu pesanan (dari grosir_pembayaran).
export function totalDibayarPesanan(pesananId, pembayaranList) {
  return (pembayaranList || [])
    .filter((b) => b.pesanan_id === pesananId)
    .reduce((a, b) => a + (Number(b.jumlah) || 0), 0);
}

// Sisa hutang satu pesanan = Total - TotalDibayar (minimal 0).
export function sisaHutangPesanan(pesanan, pembayaranList) {
  const dibayar = totalDibayarPesanan(pesanan.id, pembayaranList);
  return Math.max(0, (Number(pesanan.total) || 0) - dibayar);
}

// Status bayar otomatis (dipakai lagi setelah tiap pembayaran dicatat):
//  Belum Bayar -> belum ada pembayaran sama sekali
//  Sebagian    -> sudah dibayar sebagian, masih ada sisa
//  Lunas       -> sisa <= 0
export function hitungStatusBayar(total, totalDibayar) {
  if (totalDibayar <= 0.0001) return "Belum Bayar";
  if (totalDibayar >= total - 0.0001) return "Lunas";
  return "Sebagian";
}

// Saldo deposit satu pelanggan = akumulasi seluruh baris grosir_deposit miliknya.
export function saldoDepositPelanggan(pelangganId, depositList) {
  return (depositList || [])
    .filter((d) => d.pelanggan_id === pelangganId)
    .reduce((a, d) => a + (Number(d.jumlah) || 0), 0);
}

// Peta {pelangganId: totalSisaHutang} lintas semua pesanan aktif (bukan Batal) milik tiap pelanggan.
export function totalHutangPerPelanggan(pesananList, pembayaranList) {
  const map = {};
  (pesananList || []).forEach((p) => {
    if (p.status === "Batal") return;
    const sisa = sisaHutangPesanan(p, pembayaranList);
    if (sisa <= 0.0001) return;
    map[p.pelanggan_id] = (map[p.pelanggan_id] || 0) + sisa;
  });
  return map;
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