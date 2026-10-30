// =========================================================
// KONEKSI SUPABASE (REST / PostgREST — anon key)
// =========================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://sewzimjibwehvnosgqss.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3ppbWppYndlaHZub3NncXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMjU1MjMsImV4cCI6MjEwNjkwMTUyM30.BNkpdEzDbjxEY_VFnGh8yCmoJTfxZ_Bw4SY9HfqWim0";
export { SUPABASE_URL, SUPABASE_ANON_KEY };

// Terjemahan kode error Postgres (lewat PostgREST) jadi pesan yang bisa dibaca
// orang biasa, bukan JSON mentah. code 23503 = foreign key violation (data
// masih dipakai/direferensikan di tabel lain), 23505 = unique violation (data
// sudah ada), 23502 = not-null violation (kolom wajib kosong), dst.
function friendlyDbError(parsed, status) {
  const code = parsed?.code;
  if (code === "23503") {
    return "Data ini masih dipakai di bagian lain sistem (mis. sudah ada di transaksi/pesanan), jadi tidak bisa dihapus. Nonaktifkan saja kalau memang tidak mau dipakai lagi.";
  }
  if (code === "23505") {
    return "Data dengan kode/SKU yang sama sudah ada sebelumnya.";
  }
  if (code === "23502") {
    return "Ada isian wajib yang belum diisi. Cek lagi formnya ya.";
  }
  if (code === "22P02") {
    return "Ada isian yang formatnya tidak sesuai (mis. angka diisi huruf).";
  }
  if (status === 401 || status === 403) {
    return "Tidak punya akses untuk melakukan ini. Coba login ulang.";
  }
  if (status >= 500) {
    return "Server sedang bermasalah. Coba lagi sebentar lagi.";
  }
  return null;
}

// =========================================================
// GERBANG READ-ONLY UNTUK ROLE OWNER
// Owner boleh MELIHAT semua data (semua query GET tetap jalan seperti biasa)
// tapi tidak boleh mengubah/menambah/menghapus apapun — KECUALI menyetujui
// atau menolak pengajuan restock (menu sidebar "Persetujuan Restok"), karena
// itu memang tugas owner (lihat modal "respon-pengajuan-restock" di
// ModalRouter, satu-satunya tempat yang PATCH ke tabel "pengajuan_restock").
// Session disimpan di sessionStorage oleh lib/auth.js (key "selma_session")
// — dibaca langsung di sini (bukan import getSession dari auth.js) supaya
// tidak bikin circular import (auth.js sendiri import sb dari file ini).
// CATATAN: ini pembatasan di sisi tampilan (mencegah klik tidak sengaja),
// bukan pengaman keamanan — anon key Supabase yang dipakai di sini sama
// untuk semua role, jadi enforcement yang benar-benar tidak bisa ditembus
// tetap harus lewat RLS/policy di database kalau suatu saat dibutuhkan.
const SESSION_KEY_LOKAL = "selma_session";
const ROLE_READONLY = ["owner", "pemegang_saham"];

// Identitas user yang sedang login, dikirim sebagai header di SETIAP request
// tulis (POST/PATCH/DELETE) supaya trigger audit di database
// (supabase/migrations/20261001_keuangan_audit_log.sql) tahu siapa yang
// menambah/mengubah/menghapus transaksi keuangan. Header ini hanya label
// pencatat — bukan autentikasi.
function headerAktor() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_LOKAL);
    if (!raw) return {};
    const s = JSON.parse(raw);
    return {
      "x-selma-uid": String(s.id ?? ""),
      "x-selma-username": encodeURIComponent(s.username ?? ""),
      "x-selma-role": String(s.role ?? ""),
    };
  } catch {
    return {};
  }
}

// JWT hasil login (diterbitkan Edge Function verify-login). Dipakai HANYA untuk
// request tulis (POST/PATCH/DELETE) supaya RLS di database bisa memeriksa role.
// Request baca tetap pakai anon key, jadi JWT kedaluwarsa tidak merusak tampilan data.
function jwtSesi() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_LOKAL);
    return raw ? JSON.parse(raw).jwt || null : null;
  } catch {
    return null;
  }
}

function roleSaatIni() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_LOKAL);
    return raw ? JSON.parse(raw).role : null;
  } catch {
    return null;
  }
}

// =========================================================
// DATA GUDANG PER PT (entitas)
// Tabel di bawah punya kolom `entitas` (lihat gudang_per_pt.sql). Semua akses
// lewat sb()/sbAll() otomatis dipisah per PT sesuai entitas akun yang login:
//   GET / PATCH / DELETE : ditambah filter `entitas=eq.<PT akun>`
//   POST                 : kolom `entitas` diisi otomatis dengan PT akun
// Jadi halaman-halaman gudang tidak perlu diubah satu per satu. Tabel grosir,
// keuangan, dan marketplace SENGAJA tidak masuk daftar ini (belum dipisah).
// =========================================================
export const TABEL_PER_PT = new Set([
  "items", "sku_master", "penempatan", "rak", "stock_history", "rak_events",
  "barang_rusak", "pesanan_masuk", "pesanan_penerimaan", "suppliers",
  "pengajuan_restock", "belanja_habis_pakai", "belanja_habis_pakai_item",
  "perlengkapan", "perlengkapan_mutasi",
  // Konfirmasi notifikasi "Cek Marketplace" (stok tipis / rak berubah) per PT.
  "marketplace_notif_ack",
  // View "terbaru per SKU/rak" (hemat egress) — HARUS punya kolom entitas
  // (lihat view_latest_per_pt.sql) dan dikelompokkan per (entitas, sku/rak).
  "stock_history_latest", "rak_events_latest_sku", "rak_events_latest_rak_dari",
  // View stok barang habis pakai (perlengkapan + mutasi) — wajib punya kolom entitas.
  "perlengkapan_stok",
  // Kelengkapan (barang pendamping yang ikut dijual) — lihat kelengkapan_tahap1.sql.
  "kelengkapan", "kelengkapan_mutasi", "kelengkapan_stok", "kelengkapan_harga_riwayat",
  // Penjualan (menu PENJUALAN: Store/Grosir, Toko Offline, Marketplace, Reseller, Master Data
  // Grosir). Kolom entitas ditambah lewat penjualan_per_pt.sql — JALANKAN SQL ITU DULU sebelum
  // deploy versi ini, kalau tidak semua halaman penjualan Selma error "column entitas does not exist".
  // grosir_detail_pesanan sengaja tidak ada: baris anak, selalu diakses lewat pesanan_id milik PT-nya.
  "grosir_pelanggan", "grosir_toko", "grosir_produk_manual", "grosir_pesanan",
  "grosir_pembayaran", "grosir_deposit",
  "marketplace_transaksi", "marketplace_iklan", "marketplace_penjualan",
  "marketplace_produk_map", "marketplace_sku_alias",
  // Scan Resi (pages/ScanResi.jsx) — kolom entitas dibuat di scan_resi.sql;
  // resi_barang (orderan resi -> barang) di scan_resi_barang.sql.
  "resi_scan", "resi_cancel", "resi_barang",
]);

// Pemilik/Super Appa (akun Holding) boleh MELIHAT data gudang PT lain di Dashboard.
// Override ini hanya dipakai untuk request GET (baca); POST/PATCH/DELETE tetap
// memakai PT akun sendiri, jadi tidak ada tulisan yang mendarat di PT yang sedang dilihat.
let entitasBacaOverride = null;
export function aturEntitasBaca(kode) {
  entitasBacaOverride = kode || null;
}
export function entitasBacaSaatIni() {
  return entitasBacaOverride || entitasSesi();
}

export function entitasSesi() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_LOKAL);
    return (raw && JSON.parse(raw).entitas) || ENTITAS_DEFAULT;
  } catch {
    return ENTITAS_DEFAULT;
  }
}

// Nama tampilan entitas akun yang login (master_data tipe "entitas", kolom label);
// kalau belum ada di master, pakai kodenya.
export function namaEntitasSesi(master) {
  const k = entitasSesi();
  return String((master?.entitas || []).find((e) => e.kode === k)?.label || k);
}

// Nama untuk judul grup "Store <nama>" di sidebar. Awalan badan usaha (PT/CV) dibuang
// supaya "PT Alivia" jadi "Store Alivia".
export function namaTokoEntitas(master) {
  return namaEntitasSesi(master).replace(/^\s*(pt|cv)\.?\s+/i, "").trim();
}

// Kop nota/label grosir per perusahaan, dari profil (nama_usaha + alamat) yang diisi di Kelola
// Perusahaan; belum diisi -> nama perusahaan saja tanpa alamat.
export function identitasNotaEntitas(master) {
  const kode = entitasSesi();
  const s = pengaturanEntitas(master, kode);
  // Selma tanpa profil terisi memakai kop bawaan di NotaGrosir.jsx.
  if (kode === ENTITAS_DEFAULT && !s.nama_usaha && !s.alamat) return undefined;
  return { nama: namaUsahaEntitas(master, kode).toUpperCase(), alamat: alamatEntitas(master, kode) };
}

// Master Data kode SKU (bahan, peruntukan, kategori, subkategori, warna, ukuran) dipisah per PT lewat
// kolom master_data.entitas (lihat master_data_per_pt.sql). Tipe lain di master_data (rekening,
// entitas, entitas_set, toko_entitas, kas_grup, dst) SENGAJA tetap global — Holding membacanya
// lintas PT. Baris tanpa entitas (data lama / SQL belum dijalankan) dianggap bersama untuk semua PT.
export const TIPE_MASTER_SKU = ["bahan", "peruntukan", "kategori", "subkategori", "warna", "ukuran"];
export function masterDataUntukPT(rows, ent) {
  return (rows || []).filter((m) => !TIPE_MASTER_SKU.includes(m.tipe) || m.entitas == null || m.entitas === ent);
}

export function terapkanEntitasPT(path, method, body) {
  const tabel = String(path).split("?")[0];
  // Tulisan baru ke master_data bertipe kode-SKU diberi entitas PT akun yang login.
  if (tabel === "master_data" && method === "POST" && typeof body === "string") {
    try {
      const d = JSON.parse(body);
      const isi = (o) =>
        o && typeof o === "object" && TIPE_MASTER_SKU.includes(o.tipe) && o.entitas === undefined
          ? { ...o, entitas: entitasSesi() }
          : o;
      return { path, body: JSON.stringify(Array.isArray(d) ? d.map(isi) : isi(d)) };
    } catch {
      return { path, body };
    }
  }
  if (!TABEL_PER_PT.has(tabel)) return { path, body };
  const e = entitasSesi();
  if (method === "POST") {
    if (typeof body !== "string") return { path, body };
    try {
      const isi = (o) => (o && typeof o === "object" && o.entitas === undefined ? { ...o, entitas: e } : o);
      const d = JSON.parse(body);
      return { path, body: JSON.stringify(Array.isArray(d) ? d.map(isi) : isi(d)) };
    } catch {
      return { path, body };
    }
  }
  const eFilter = String(method).toUpperCase() === "GET" ? entitasBacaSaatIni() : e;
  return { path: `${path}${path.includes("?") ? "&" : "?"}entitas=eq.${encodeURIComponent(eFilter)}`, body };
}

// Satu-satunya pengecualian untuk role read-only: PATCH ke pengajuan_restock
// (approve/tolak). Path-nya selalu diawali "pengajuan_restock" (mis.
// "pengajuan_restock?id=eq.123"), tidak pernah dipakai untuk tabel lain.
//
// Pengecualian tambahan: role "owner" boleh menulis penuh ke keuangan_transaksi dan
// master_data (rekening, jenis kas, pemetaan entitas) SELAMA entitas yang sedang
// dibuka di menu Holding adalah entitas Holding (sessionStorage "selma-entitas",
// diisi pages/Keuangan.jsx). Saat melihat SELMA, Pemilik tetap read-only.
// CATATAN: ini hanya pagar di browser; pagar sebenarnya harus di RLS database.
//
// Pengecualian ke-2: role "owner" (BUKAN pemegang_saham) boleh menulis ke
// keuangan_transaksi, tapi HANYA untuk transfer Antar Entitas (menu Holding →
// Antar Entitas, arah Holding → perusahaan). Di sini hanya dicek bentuknya:
// POST harus tipe "transfer" ber-penanda; PATCH/DELETE harus menunjuk satu id.
// Arah (Holding → perusahaan vs sebaliknya) dicek di UI (pages/Holding.jsx,
// pakai bolehTransferAntarEntitas di lib/constants.js) karena di sini tidak
// ada data rekening/entitas.
function entitasAktif() {
  try {
    return sessionStorage.getItem("selma-entitas") || "";
  } catch {
    return "";
  }
}

function bolehWalauReadOnly(path, method, opts = {}) {
  if (method === "PATCH" && /^pengajuan_restock(\?|$)/.test(path)) return true;
  // Pemilik membukukan entitas Holding sendiri (akun kas, transaksi, dst).
  if (roleSaatIni() === "owner" && entitasAktif() && entitasAktif() === kodeHoldingSaatIni() && /^(keuangan_transaksi|master_data)(\?|$)/.test(path)) return true;
  if (roleSaatIni() === "owner" && /^keuangan_transaksi(\?|$)/.test(path)) {
    if (method === "POST") {
      try {
        const b = JSON.parse(opts.body || "{}");
        return b.tipe === "transfer" && !!b.penanda;
      } catch {
        return false;
      }
    }
    if (method === "PATCH" || method === "DELETE") return /[?&]id=eq\.[^&]+/.test(path);
  }
  return false;
}

// Semua request ke Supabase dibatasi waktu. Tanpa batas ini, koneksi yang
// "menggantung" (sinyal HP naik-turun, server lambat bangun) bikin fetch()
// tidak pernah selesai atau gagal -> tombol Simpan / indikator loading
// muter terus walau datanya sebenarnya sudah masuk ke database.
const TIMEOUT_BACA_MS = 25000;
const TIMEOUT_TULIS_MS = 40000;
const TIMEOUT_UPLOAD_MS = 90000;

async function fetchBatas(url, opts = {}, ms = TIMEOUT_BACA_MS, method = "GET") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        method === "GET"
          ? "Koneksi terlalu lambat saat memuat data. Coba klik Muat ulang."
          : "Koneksi terlalu lambat, respons dari server tidak diterima. Datanya kemungkinan SUDAH tersimpan — klik Muat ulang untuk mengecek sebelum menyimpan ulang."
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function sb(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const tPT = terapkanEntitasPT(path, method, opts.body);
  path = tPT.path;
  if (tPT.body !== opts.body) opts = { ...opts, body: tPT.body };
  if (method !== "GET" && ROLE_READONLY.includes(roleSaatIni()) && !bolehWalauReadOnly(path, method, opts)) {
    throw new Error("Role Owner hanya bisa melihat data (read-only) — tidak bisa menambah, mengubah, atau menghapus data.");
  }
  const res = await fetchBatas(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${method !== "GET" && jwtSesi() ? jwtSesi() : SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(method === "GET" ? {} : headerAktor()),
      ...(opts.headers || {}),
    },
  }, method === "GET" ? TIMEOUT_BACA_MS : TIMEOUT_TULIS_MS, method);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    // JWT sesi kedaluwarsa / tidak ada -> database menolak penulisan (RLS).
    if (method !== "GET" && (res.status === 401 || res.status === 403) && (parsed?.message || "").match(/JWT|row-level security/i)) {
      throw new Error("Sesi login berakhir atau tidak punya izin untuk perubahan ini. Silakan logout lalu login ulang.");
    }
    const friendly = friendlyDbError(parsed, res.status);
    // Untuk bentrok data unik (23505): tambahkan tabel, nama aturan, dan baris yang bentrok,
    // supaya kelihatan tabel mana yang menolak (pesan ramah saja tidak cukup untuk melacak).
    let rincian = "";
    if (parsed?.code === "23505") {
      const aturan = String(parsed.message || "").match(/constraint "([^"]+)"/)?.[1] || "";
      rincian = ` [${String(path).split("?")[0]}${aturan ? ` · ${aturan}` : ""}${parsed.details ? ` · ${parsed.details}` : ""}]`;
    }
    const err = new Error(friendly ? friendly + rincian : parsed?.message || text || `${res.status} ${res.statusText}`);
    // pgCode dipakai di beberapa tempat (mis. hapus SKU) untuk tahu kapan harus
    // fallback ke "nonaktifkan" alih-alih gagal total waktu kena foreign key.
    if (parsed?.code) err.pgCode = parsed.code;
    throw err;
  }
  if (res.status === 204) return null;
  const hasil = await res.json();
  // RLS yang menolak PATCH/DELETE TIDAK melempar error: baris disaring diam-diam
  // dan hasilnya [] . Untuk keuangan_transaksi anggap itu penolakan, bukan sukses.
  if ((method === "PATCH" || method === "DELETE") && /^keuangan_transaksi\?id=eq\./.test(path) && Array.isArray(hasil) && hasil.length === 0) {
    throw new Error("Perubahan tidak tersimpan: transaksi tidak ditemukan atau Anda tidak punya izin untuk mengubahnya.");
  }
  return hasil;
}

// PostgREST (API Supabase) cuma balikin maksimal 1000 baris per request
// secara default. sbAll() otomatis "nyicil" pakai header Range sampai semua
// baris kebawa, jadi aman dipakai untuk tabel yang datanya bisa > 1000 baris
// (mis. items, sku_master, stock_history, dst). Query builder (select=,
// order=, filter=, dst) tetap ditulis sama seperti biasa lewat sb().
const SB_PAGE_SIZE = 1000;

// Ambil satu halaman + (opsional) total jumlah baris dari header
// "Content-Range" (butuh "Prefer: count=exact" supaya PostgREST menghitung
// totalnya). Dipisah dari sb() karena perlu baca response header, bukan
// cuma body JSON-nya.
async function sbPage(path, opts, from, to, withCount) {
  const prefer = [opts.prefer || "return=representation", withCount ? "count=exact" : null]
    .filter(Boolean)
    .join(",");
  const res = await fetchBatas(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
      Range: `${from}-${to}`,
      ...(opts.headers || {}),
    },
  }, TIMEOUT_BACA_MS, "GET");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const friendly = friendlyDbError(parsed, res.status);
    const err = new Error(friendly || parsed?.message || text || `${res.status} ${res.statusText}`);
    if (parsed?.code) err.pgCode = parsed.code;
    throw err;
  }
  const rows = res.status === 204 ? [] : (await res.json()) || [];
  // Content-Range formatnya "from-to/total" (mis. "0-999/4820"), atau
  // "*/4820" kalau baris hasilnya kosong. Kalau total-nya "*" (tidak
  // dihitung PostgREST) atau header tidak ada, total dianggap tidak
  // diketahui -> sbAll fallback ke cara lama (nyicil satu-satu).
  const range = res.headers.get("content-range") || "";
  const totalPart = range.split("/")[1];
  const total = totalPart && totalPart !== "*" ? Number(totalPart) : null;
  return { rows, total: Number.isFinite(total) ? total : null };
}

export async function sbAll(path, opts = {}) {
  path = terapkanEntitasPT(path, "GET").path;
  // Halaman pertama sekalian minta total jumlah baris (lewat
  // "Prefer: count=exact"), supaya begitu ketahuan ada berapa halaman lagi,
  // SISANYA bisa diambil SEKALIGUS secara paralel — bukan satu-satu
  // bergantian seperti sebelumnya (jauh lebih cepat untuk tabel besar).
  const first = await sbPage(path, opts, 0, SB_PAGE_SIZE - 1, true);
  if (first.total == null) {
    // Total tidak diketahui (mis. server tidak mendukung count=exact) ->
    // fallback ke cara lama, nyicil satu-satu sampai habis.
    let all = [...first.rows];
    let offset = SB_PAGE_SIZE;
    let last = first.rows;
    while (last.length === SB_PAGE_SIZE) {
      const page = await sbPage(path, opts, offset, offset + SB_PAGE_SIZE - 1, false);
      all = all.concat(page.rows);
      last = page.rows;
      offset += SB_PAGE_SIZE;
    }
    return all;
  }

  const totalPages = Math.max(1, Math.ceil(first.total / SB_PAGE_SIZE));
  if (totalPages <= 1) return first.rows;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => {
      const page = i + 1;
      const from = page * SB_PAGE_SIZE;
      const to = from + SB_PAGE_SIZE - 1;
      return sbPage(path, opts, from, to, false).then((r) => r.rows);
    })
  );
  return first.rows.concat(...rest);
}

// Nama bucket Storage di Supabase untuk menyimpan foto verifikasi.
// Pastikan bucket ini sudah dibuat (public, dengan policy insert untuk anon).
export const STORAGE_BUCKET = "verifikasi-foto";

export async function sbUploadFoto(file, path) {
  // Akun PT selain Selma menyimpan file di sub-folder PT-nya (mis. "alv/ABC-1.jpg"),
  // supaya SKU yang sama di dua PT tidak saling menimpa foto di Storage.
  const ptFoto = entitasSesi();
  if (ptFoto !== ENTITAS_DEFAULT) path = `${String(ptFoto).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}/${path}`;
  const res = await fetchBatas(
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
    },
    TIMEOUT_UPLOAD_MS,
    "POST"
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Gagal unggah foto (${res.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

// Foto produk dari kamera HP biasanya 3000-4000px lebar (bisa beberapa MB),
// padahal cuma ditampilkan sebagai thumbnail kecil (36-96px) di daftar SKU,
// Marketplace, dashboard, dll. Ini yang bikin halaman-halaman itu berat
// dibuka di HP — bukan cuma ukuran filenya, tapi juga waktu decode gambar
// beresolusi tinggi itu di browser. Fungsi ini mengecilkan foto ke maksimal
// 1280px sisi terpanjang (masih lebih dari cukup tajam untuk katalog/label)
// dan kompres ke JPEG kualitas 0.82 sebelum diupload.
//
// SENGAJA dipisah dari sbUploadFoto biasa (bukan dipasang otomatis di semua
// upload) — foto bon/nota (BarangDatang, Rusak) tidak lewat sini, karena
// mengecilkan foto teks berisiko bikin nominal/tulisan di bon jadi buram.
// Foto yang dipakai buat OCR SKU juga aman: OCR jalan di foto asli dulu
// (lihat lib/ocrSku.js), baru setelah itu hasil kompresnya yang diupload.
export async function kompresFotoProduk(file, { maxDim = 1280, quality = 0.82 } = {}) {
  // Kalau bukan gambar (mis. HEIC yang gagal dibaca <img>) atau file sudah
  // kecil, upload apa adanya saja — tidak usah dipaksa lewat canvas.
  if (!file || !file.type?.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal membaca gambar"));
      el.src = objectUrl;
    });

    const skala = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    // Foto sudah lebih kecil dari batas DAN sudah berformat JPEG -> tidak
    // perlu diproses ulang, upload aslinya saja supaya tidak ada kualitas
    // yang hilang percuma.
    // TAPI kalau formatnya BUKAN JPEG (mis. PNG/WebP dari screenshot atau
    // render), tetap harus dikonversi ke JPEG walau dimensinya sudah kecil —
    // PNG itu lossless, jadi untuk foto produk biasa ukurannya bisa 5-10x
    // lebih besar dari JPEG kualitas setara di dimensi yang SAMA PERSIS.
    // Ini yang sebelumnya bikin banyak foto SKU ".png" ikut lolos tanpa
    // dikompres (dimensi sudah kecil, jadi skip) padahal ukurannya tetap
    // 1-2MB per file dan jadi salah satu penyumbang terbesar pemakaian
    // Storage egress bulanan.
    const sudahJpeg = /^image\/jpe?g$/i.test(file.type || "");
    if (skala >= 1 && sudahJpeg) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * skala);
    canvas.height = Math.round(img.naturalHeight * skala);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Kalau browser gagal bikin blob (jarang terjadi), fallback ke file asli
    // daripada gagal total upload-nya.
    if (!blob) return file;

    const namaBaru = (file.name || "foto").replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg";
    return new File([blob], namaBaru, { type: "image/jpeg" });
  } catch {
    // Apapun yang gagal di proses kompres (foto rusak, browser lama, dst)
    // — jangan sampai bikin upload gagal total. Upload file aslinya saja.
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Rumus harga bawaan (dipakai kalau PT belum punya pengaturan sendiri). Bisa ditimpa per PT lewat
// master_data tipe "entitas_set" (kunci: round_to, harga_min, hpp_persen, grosir_x, tengah_x1/x2/x3, ecer_x)
// — diatur di Pengaturan > Pengaturan per Perusahaan. round_to bawaan tetap dari tabel settings.
export const RUMUS_HARGA_BAWAAN = {
  harga_min: 7000, // harga asli minimal
  hpp_persen: 10, // HPP = harga asli + x%
  tengah_x1: 3, // pengali harga tengah kalau HPP < 10.000
  tengah_x2: 2.5, // HPP 10.000 - <20.000
  tengah_x3: 2, // HPP >= 20.000
  grosir_x: 1.5, // grosir = HPP x ini
  ecer_x: 2, // ecer = tengah x ini
};
export function rumusHargaEntitas(setList, kode, settings) {
  const hasil = { ...RUMUS_HARGA_BAWAAN, round_to: Number(settings?.round_to) || 1000 };
  (setList || []).forEach((m) => {
    const k = String(m.kode || "");
    const i = k.indexOf(":");
    if (i <= 0 || k.slice(0, i) !== kode) return;
    const kunci = k.slice(i + 1);
    const n = Number(String(m.label).replace(",", "."));
    if ((kunci in hasil || kunci === "round_to") && Number.isFinite(n) && n > 0) hasil[kunci] = n;
  });
  return hasil;
}

export function calcHarga(hargaAsli, settings) {
  const r = rumusHargaEntitas(profilTerdaftar.set, entitasSesi(), settings);
  const round = (n) => Math.round(n / r.round_to) * r.round_to;

  const hargaAsliDipakai = Math.max(Number(hargaAsli) || 0, r.harga_min);

  const hpp = hargaAsliDipakai * (1 + r.hpp_persen / 100);

  // Pengali Harga Tengah tergantung besar HPP.
  let tengahMultiplier;
  if (hpp < 10000) tengahMultiplier = r.tengah_x1;
  else if (hpp < 20000) tengahMultiplier = r.tengah_x2;
  else tengahMultiplier = r.tengah_x3;

  const tengah = round(hpp * tengahMultiplier);
  const ecer = round(tengah * r.ecer_x);
  const grosir = round(hpp * r.grosir_x);

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

// Susun ulang string SKU dari field-field pembentuknya — pola ini HARUS
// selalu sama persis dengan yang dipakai waktu SKU pertama kali dibuat
// (lihat SkuEntryForm/ModalRouter "buat-sku").
export function buildSkuCode(f) {
  return `${f.bahan}${f.peruntukan}${f.kategori}-${f.subkategori}-${f.model}-${f.warna}-${f.ukuran}`;
}

// Tabel-tabel lain (selain sku_master) yang menyimpan kode SKU sebagai teks
// bebas (bukan foreign key ber-id) — semuanya perlu ikut di-update kalau ada
// SKU yang berubah kodenya, termasuk data histori (stock_history, rak_events,
// grosir_detail_pesanan) supaya laporan lama tetap nyambung ke SKU yang benar.
const SKU_TEXT_TABLES = ["items", "stock_history", "penempatan", "rak_events", "grosir_detail_pesanan", "barang_rusak"];

async function renameSkuEverywhere(oldSku, newSku) {
  for (const table of SKU_TEXT_TABLES) {
    // grosir_detail_pesanan BUKAN tabel per-PT (tidak punya kolom entitas), jadi PATCH ?sku=eq.
    // biasa akan ikut mengubah detail pesanan PT lain yang kebetulan memakai kode SKU yang sama
    // (kode SKU dibentuk dari Master Data yang dipakai bersama). Batasi ke detail milik pesanan
    // PT ini saja: grosir_pesanan sudah otomatis difilter per PT oleh sb().
    if (table === "grosir_detail_pesanan") {
      const detail = (await sbAll(`grosir_detail_pesanan?select=id,pesanan_id&sku=eq.${encodeURIComponent(oldSku)}`)) || [];
      if (detail.length === 0) continue;
      const pesananIds = [...new Set(detail.map((d) => d.pesanan_id).filter((x) => x != null))];
      const milikPT = new Set();
      for (let i = 0; i < pesananIds.length; i += 100) {
        const potong = pesananIds.slice(i, i + 100);
        const rows = (await sb(`grosir_pesanan?select=id&id=in.(${potong.join(",")})`)) || [];
        rows.forEach((r) => milikPT.add(r.id));
      }
      const idDetailMilikPT = detail.filter((d) => milikPT.has(d.pesanan_id)).map((d) => d.id);
      for (let i = 0; i < idDetailMilikPT.length; i += 100) {
        await sb(`grosir_detail_pesanan?id=in.(${idDetailMilikPT.slice(i, i + 100).join(",")})`, {
          method: "PATCH",
          body: JSON.stringify({ sku: newSku }),
        });
      }
      continue;
    }
    await sb(`${table}?sku=eq.${encodeURIComponent(oldSku)}`, {
      method: "PATCH",
      body: JSON.stringify({ sku: newSku }),
    });
  }
}

// Dipanggil begitu keputusan harga sebuah SKU dibuat (modal "pilih-harga"
// atau "edit-harga" di Master Barang). Digabung jadi SATU fungsi (dulu ada 2
// terpisah: tandaiPerluFotoUlang + resolveMenungguHarga) supaya barang yang
// muncul di Pemotretan tab "Foto Ulang" untuk SKU ini SELALU cuma 1 — yang
// paling baru ditambahkan (created_at terbesar) — bukan dobel dari 2 sumber
// berbeda (barang yang lagi ditahan nunggu keputusan DAN barang lama yang
// sudah pernah selesai/dipasarkan ditarik balik bersamaan).
//
// hargaLama/hargaBaru = harga_asli SKU sebelum & sesudah keputusan ini —
// disimpan sebagai SNAPSHOT langsung di baris barang yang ditandai
// perlu_foto_ulang (kolom harga_lama_foto/harga_baru_foto), BUKAN dibaca
// belakangan dari sku_master.harga_asli_baru — soalnya kolom itu langsung
// di-null-kan begitu keputusan ini selesai (lihat pemanggil di
// ModalRouter.jsx), jadi begitu halaman Pemotretan reload, datanya sudah
// hilang duluan kalau tidak di-snapshot di sini. Dengan snapshot di
// barangnya sendiri, perbandingan "Lama vs Baru" di FotoProduk.jsx selalu
// akurat walau SKU-nya sudah lanjut berubah-ubah lagi setelahnya.
//
// Cakupannya semua barang SKU ini yang statusnya:
// - "menunggu-harga" (barang baru yang harganya beda, lagi ditahan nunggu
//   keputusan ini) — bisa lebih dari satu kalau sempat restock beberapa kali
//   sebelum diputuskan.
// - "marketplace" / "selesai" (barang lama yang sudah pernah lewat
//   Pemotretan, fotonya ikut usang begitu harga berubah).
//
// - harga yang ditetapkan BERUBAH dari harga lama -> dari SEMUA barang di
//   atas, cuma yang PALING BARU yang ditarik ke Verifikasi Foto (ditandai
//   perlu_foto_ulang, dengan snapshot harga lama/baru) — sisanya langsung
//   Selesai (dianggap cukup terwakili oleh foto barang paling baru itu,
//   tidak usah semuanya difoto ulang).
// - harga yang ditetapkan TETAP (tidak berubah) -> semuanya langsung
//   Selesai, tidak ada yang perlu difoto ulang sama sekali.
export async function resolveHargaSku(sku, hargaBerubah, hargaLama, hargaBaru) {
  const semua =
    (await sb(
      `items?select=id,created_at&sku=eq.${encodeURIComponent(sku)}&stage=in.(menunggu-harga,marketplace,selesai)&order=created_at.desc`
    )) || [];
  if (semua.length === 0) return;

  if (!hargaBerubah) {
    await sb(`items?sku=eq.${encodeURIComponent(sku)}&stage=eq.menunggu-harga`, {
      method: "PATCH",
      body: JSON.stringify({ stage: "selesai" }),
    });
    return;
  }

  const [terbaru, ...sisanya] = semua;
  await sb(`items?id=eq.${terbaru.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      stage: "verifikasi",
      perlu_foto_ulang: true,
      harga_lama_foto: hargaLama,
      harga_baru_foto: hargaBaru,
    }),
  });
  const idSisanya = sisanya.map((i) => i.id);
  if (idSisanya.length > 0) {
    await sb(`items?id=in.(${idSisanya.join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ stage: "selesai", perlu_foto_ulang: false }),
    });
  }
}

// Ganti kode Master Data (mis. kategori "ANJ" -> "ANJB") dan rambatkan
// perubahannya ke semua SKU yang sudah jadi yang masih memakai kode lama itu
// — termasuk string SKU-nya sendiri (karena SKU dibentuk dari gabungan
// kode-kode ini) dan semua tabel lain yang menyimpan SKU sebagai teks
// (Stok, Rak, Riwayat Stok, histori Pesanan Grosir).
//
// Kalau hasil penggantian bikin ada SKU yang jadi kembar (baik sesama SKU
// yang lagi diganti, maupun bentrok dengan SKU lain yang sudah ada), seluruh
// operasi DIBATALKAN dari awal (tidak ada satupun PATCH yang dikirim) dan
// melempar Error — supaya tidak ada data yang kepalang berubah separuh.
export async function renameMasterKode({ masterDataId, tipe, oldKode, newKode, newLabel, skuMaster }) {
  const affected = (skuMaster || []).filter((s) => s[tipe] === oldKode);

  // Peta SKU lama -> SKU baru untuk baris yang kepengaruh oleh perubahan ini.
  const rencana = affected.map((s) => ({
    row: s,
    skuLama: s.sku,
    skuBaru: buildSkuCode({ ...s, [tipe]: newKode }),
  }));

  // Cek tabrakan: (a) dua SKU lama yang berbeda menghasilkan SKU baru yang
  // sama persis, atau (b) SKU baru itu sudah dipakai SKU lain yang TIDAK ikut
  // berubah di rencana ini.
  const skuBaruSet = new Set();
  const skuLamaYangBerubah = new Set(rencana.map((r) => r.skuLama));
  for (const r of rencana) {
    if (skuBaruSet.has(r.skuBaru)) {
      throw new Error(`Gagal ubah kode: dua SKU akan jadi sama persis ("${r.skuBaru}"). Batal, tidak ada yang disimpan.`);
    }
    skuBaruSet.add(r.skuBaru);
  }
  const bentrokDenganLain = (skuMaster || []).find(
    (s) => !skuLamaYangBerubah.has(s.sku) && skuBaruSet.has(s.sku)
  );
  if (bentrokDenganLain) {
    throw new Error(
      `Gagal ubah kode: SKU baru "${bentrokDenganLain.sku}" sudah dipakai SKU lain. Batal, tidak ada yang disimpan.`
    );
  }

  // Aman, lanjut eksekusi — SKU dulu (di semua tabel), master_data terakhir,
  // supaya kalau ada yang gagal di tengah jalan, kode di Master Data belum
  // sempat berubah (masih konsisten dengan SKU yang belum sempat di-rename).
  for (const r of rencana) {
    await renameSkuEverywhere(r.skuLama, r.skuBaru);
    await sb(`sku_master?id=eq.${r.row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [tipe]: newKode, sku: r.skuBaru }),
    });
  }
  await sb(`master_data?id=eq.${masterDataId}`, {
    method: "PATCH",
    body: JSON.stringify({ kode: newKode, label: newLabel }),
  });

  return { jumlahSkuBerubah: rencana.length };
}


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

// Samakan format no. WA supaya "0812...", "62812...", "+62812...", atau yang
// pakai spasi/strip/kurung semuanya dianggap nomor yang sama saat dibandingkan.
// Contoh: "0812-3456-7890" dan "+62 812 3456 7890" -> sama-sama "8123456789...".
export function normalisasiWa(wa) {
  const digit = (wa || "").replace(/\D/g, "");
  if (digit.startsWith("62")) return digit.slice(2);
  if (digit.startsWith("0")) return digit.slice(1);
  return digit;
}

// Cari pelanggan grosir lain yang sudah pakai no. WA yang sama (dibandingkan
// dalam bentuk yang sudah dinormalisasi). exceptId dipakai saat edit supaya
// pelanggan itu sendiri tidak dianggap "bentrok" dengan WA-nya sendiri.
export function pelangganDenganWa(wa, pelangganList, exceptId) {
  const target = normalisasiWa(wa);
  if (!target) return null;
  return (pelangganList || []).find(
    (p) => p.id !== exceptId && p.wa && normalisasiWa(p.wa) === target
  ) || null;
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
// Status "Pesanan Masuk" (Barang Datang) diturunkan dari jumlah_diterima vs
// jumlah_pesan — bukan disimpan manual oleh user, supaya selalu konsisten.
// dibatalkan (kolom terpisah) menang atas hitungan angka. "draft" (kolom
// terpisah juga) menang atas SEMUANYA kecuali dibatalkan — dipakai untuk
// baris "Input Barang Datang" yang disimpan sementara lewat tombol "Simpan
// sebagai Draf" dan belum dikirim ke Alur Barang/stok.
// versi_struktur = 2 (satu baris per pesanan, banyak invoice di
// rincian_invoice) punya hitungan sendiri — lihat statusPesananMasukV2 di
// bawah — supaya baris lama (versi_struktur = 1, default) tidak kena
// pengaruh apa-apa dari perubahan ini.
export function statusPesananMasuk(p) {
  if (p.versi_struktur === 2) return statusPesananMasukV2(p);
  if (p.dibatalkan) return "batal";
  if (p.draft) return "draft";
  if ((p.jumlah_diterima || 0) <= 0) return "menunggu";
  if (p.jumlah_diterima < p.jumlah_pesan) return "sebagian";
  return "selesai";
}

// Status untuk pesanan versi_struktur = 2 — dihitung dari rincian_invoice
// (array invoice, tiap elemen punya status sendiri "draft"|"final") DAN
// jumlah_box (total box fisik pesanan ini, diisi waktu "Tandai Status
// Kedatangan", sama seperti versi lama):
//  - dibatalkan menang atas semuanya (sama seperti v1).
//  - selesai_manual (tombol "Tandai Pesanan Selesai") memaksa "selesai"
//    biar bisa dipakai walau box-nya belum genap semua, sama kegunaannya
//    dengan "Tandai Pesanan Selesai" versi lama.
//  - kalau jumlah_box belum diisi (pesanan lama/pendek, cuma 1 box tidak
//    pernah diisi jumlah_box-nya secara eksplisit): "selesai" begitu ADA
//    minimal satu invoice final, "draft" kalau ada invoice tapi belum ada
//    yang final, "menunggu" kalau rincian_invoice masih kosong sama sekali.
//  - kalau jumlah_box > 0: dihitung dari BANYAKNYA no_box unik yang punya
//    invoice final dibanding jumlah_box (sama logika dengan
//    rincianBongkarBox versi lama) — menunggu/sebagian/selesai.
function statusPesananMasukV2(p) {
  if (p.dibatalkan) return "batal";
  if (p.selesai_manual) return "selesai";
  const rincian = Array.isArray(p.rincian_invoice) ? p.rincian_invoice : [];
  if (rincian.length === 0) return "menunggu";
  const boxFinal = new Set(
    rincian.filter((inv) => inv.status === "final" && Number(inv.no_box) > 0).map((inv) => Number(inv.no_box))
  );
  const totalBox = Number(p.jumlah_box) || 0;
  if (totalBox <= 0) {
    return boxFinal.size > 0 || rincian.some((inv) => inv.status === "final") ? "selesai" : "draft";
  }
  if (boxFinal.size === 0) return "draft";
  if (boxFinal.size < totalBox) return "sebagian";
  return "selesai";
}

// Status "konfirmasi datang" — toggle CEPAT satu klik ("Ya"/"Tidak") yang
// menjawab pertanyaan sederhana "barang yang dipesan sudah sampai secara
// fisik atau belum?", TERPISAH dari form "Konfirmasi Datang" (KonfirmasiDatangForm)
// yang detail (isi rincian model/qty/harga per pcs & set jumlah_diterima).
// Sengaja dipisah supaya gudang bisa langsung menandai "sudah datang" begitu
// barang tiba di depan mata, tanpa harus buka-buka & mengisi form detail
// dulu — detailnya boleh menyusul kapan saja lewat "Konfirmasi Datang".
// Kolom `konfirmasi_datang` disimpan sebagai boolean di tabel pesanan_masuk;
// default belum ada (undefined/null) dianggap "belum". Baris "batal" balikin
// null (tidak akan ditagih lagi, jadi toggle-nya tidak relevan).
// Baris "draft" JUGA balikin null — TAPI dikecualikan untuk pesanan yang
// dibuat lewat "Pesan Barang" (kode_pesanan berprefix "PSN-"): untuk PSN-,
// `draft` cuma dipakai KonfirmasiDatangForm buat menyimpan progres rincian
// model (tombol "Simpan sebagai Draf") — pesanannya sendiri sudah pasti ada
// sejak dibuat, jadi toggle "sudah datang secara fisik" tetap harus bisa
// dipakai kapan saja, lepas dari progres pengisian rinciannya. Baris "draft"
// murni (dari "Input Barang Datang"/BON-, yang memang belum tentu jadi
// transaksi nyata) tetap disembunyikan seperti semula.
export function statusKonfirmasiDatang(p) {
  const status = statusPesananMasuk(p);
  if (status === "batal") return null;
  if (status === "draft" && !p.kode_pesanan?.startsWith("PSN-")) return null;
  return p.konfirmasi_datang ? "sudah" : "belum";
}

// Status "bongkar" satu pesanan masuk — digembok di belakang toggle cepat
// "Konfirmasi Datang" di atas (BUKAN lagi di belakang jumlah_diterima/
// statusPesananMasuk saja), supaya urutannya jelas: pesan -> (barang tiba
// fisik) -> tandai "Sudah Datang" (cepat, tanpa rincian) -> baru boleh
// dianggap bongkar. Balikin null kalau belum ditandai "Sudah Datang" (atau
// baris batal) supaya UI bisa sembunyikan badge bongkar.
// SEKARANG OTOMATIS — bukan toggle manual lagi. Begitu barangnya ditandai
// "Sudah Datang", status bongkar langsung mengikuti progres rincian model di
// "Konfirmasi Datang":
// - status pesanan "draft" (rincian masih disimpan sebagai Draf, belum
//   difinalkan) -> "sebagian" dibongkar.
// - status pesanan "selesai" (rincian sudah difinalkan lewat "Konfirmasi &
//   Lanjut ke Alur Barang") -> "sudah" dibongkar.
// - selain itu (menunggu/sebagian qty, belum ada rincian sama sekali) ->
//   "belum" dibongkar.
// Kolom `dibongkar` (manual, lama) sudah tidak dipakai lagi di sini.
export function statusBongkar(p) {
  if (statusKonfirmasiDatang(p) !== "sudah") return null;
  const status = statusPesananMasuk(p);
  if (status === "draft" || status === "sebagian") return "sebagian";
  if (status === "selesai") return "sudah";
  return "belum";
}

// Tahapan pesanan barang untuk kolom "Status" di tabel Pesanan Barang —
// GABUNGAN dari kolom "Datang?" dan "Bongkar" jadi satu alur linear:
//  - "menunggu" : barang dipesan, belum datang.
//  - "datang"   : barang sudah datang, belum dibongkar sama sekali.
//  - "sebagian" : barang sudah datang, baru sebagian yang dibongkar.
//  - "selesai"  : barang sudah datang dan semuanya sudah dibongkar.
// Tambahan (di luar 4 tahap): "draft" (baris Input Barang Datang yang
// belum dikirim) dan "batal". Pesanan yang rinciannya sudah final
// ("selesai" di statusPesananMasuk) selalu dianggap "selesai", walau
// toggle Datang?-nya belum pernah diklik (data lama).
export function tahapPesanan(p) {
  const status = statusPesananMasuk(p);
  if (status === "batal") return "batal";
  if (status === "selesai") return "selesai";
  const datang = statusKonfirmasiDatang(p);
  if (datang === null) return "draft";
  if (datang === "belum") return status === "sebagian" ? "sebagian" : "menunggu";
  const bongkar = statusBongkar(p);
  if (bongkar === "sudah") return "selesai";
  if (bongkar === "sebagian") return "sebagian";
  return "datang";
}

// Rincian jumlah box yang sudah dibongkar (dicek/dikonfirmasi) dari total box
// fisik pesanan ini — dipakai kalau pesanannya sudah punya `jumlah_box`
// (diisi waktu "Tandai Status Kedatangan"), supaya progres bongkarnya
// kelihatan konkret per box (mis. "2/5"), bukan cuma label belum/sebagian/
// sudah dari statusBongkar di atas. Balikin null kalau jumlah_box belum
// pernah diisi — UI fallback ke badge statusBongkar biasa.
//
// Satu box dihitung "sudah dibongkar" begitu ADA bon (bon utama pesanan ini
// SENDIRI, atau bon tambahan "BON-xxxx" yang `induk_id`-nya nunjuk balik ke
// pesanan ini — lihat KonfirmasiDatangForm/ModalRouter "konfirmasi-datang")
// yang no_box-nya cocok DAN sudah final (bukan draft, jumlah_diterima > 0).
// Box yang sama dihitung sekali walau ada >1 bon final dengan no_box yang
// sama (mis. box itu sengaja dipecah beberapa bon tapi tetap 1 box fisik).
export function rincianBongkarBox(p, semuaPesanan) {
  const total = Number(p?.jumlah_box) || 0;
  if (total <= 0) return null;
  if (p?.versi_struktur === 2) {
    const rincian = Array.isArray(p.rincian_invoice) ? p.rincian_invoice : [];
    const boxSelesai = new Set(
      rincian.filter((inv) => inv.status === "final" && Number(inv.no_box) > 0).map((inv) => Number(inv.no_box))
    );
    return { selesai: boxSelesai.size, total };
  }
  // Bon dianggap FINAL kalau tidak batal, bukan draf, dan sudah ada qty diterima.
  const bonFinal = (row) =>
    !row.dibatalkan && !row.draft && (Number(row.jumlah_diterima) || 0) > 0;
  const boxSelesai = new Set();
  // Bon final yang no_box-nya KOSONG (mis. dikonfirmasi waktu jumlah_box belum
  // diisi, atau kolom "Pilih box…" dibiarkan kosong). Dulu bon seperti ini tidak
  // dihitung sama sekali, jadi barang yang sudah dibongkar & final tetap tampil
  // 0/N. Sekarang tiap bon final tanpa nomor box dihitung sebagai 1 box
  // (dibatasi total box supaya tidak melebihi).
  let finalTanpaNomorBox = 0;
  const proses = (row) => {
    if (!bonFinal(row)) return;
    if (Number(row.no_box) > 0) boxSelesai.add(Number(row.no_box));
    else finalTanpaNomorBox += 1;
  };
  proses(p);
  for (const row of semuaPesanan || []) {
    if (row.induk_id === p.id) proses(row);
  }
  return { selesai: Math.min(total, boxSelesai.size + finalTanpaNomorBox), total };
}

// Rincian per-model sebuah pesanan masuk — [{ nama, jumlah, harga, datang }].
// Satu model cuma punya SATU angka qty (bukan qty-dipesan & qty-diterima
// terpisah) — statusnya cukup boolean "datang" (sudah/belum), karena tiap
// model dikonfirmasi datang sekaligus penuh sesuai qty pesanannya, satu-satu
// per model (lihat KonfirmasiDatangForm), bukan dicicil per angka.
// Pesanan lama (sebelum fitur rincian per-model, atau dari format lama yang
// masih pakai angka "diterima") tetap didukung — "datang" diturunkan dari
// diterima >= jumlah kalau field "datang"-nya sendiri belum ada.
// versi_struktur = 2: gabungan (flatten) model dari SEMUA invoice di
// rincian_invoice — dipakai tempat-tempat yang cuma butuh total qty/nilai
// pesanan ini tanpa peduli invoice mana asalnya (mis. baris ringkas di
// tabel). Tempat yang perlu tampilan PER-invoice (SemuaInvoicePanel) baca
// rincian_invoice langsung, bukan lewat fungsi ini.
export function detailModelPesanan(p) {
  if (p?.versi_struktur === 2) {
    const rincian = Array.isArray(p.rincian_invoice) ? p.rincian_invoice : [];
    return rincian.flatMap((inv) =>
      (Array.isArray(inv.models) ? inv.models : []).map((m) => ({
        ...m,
        datang: inv.status === "final",
      }))
    );
  }
  const raw =
    Array.isArray(p.detail_model) && p.detail_model.length > 0
      ? p.detail_model
      : [{ nama: null, jumlah: p.jumlah_pesan || 0, harga: 0, diterima: p.jumlah_diterima || 0 }];
  return raw.map((m) => ({
    ...m,
    datang:
      typeof m.datang === "boolean"
        ? m.datang
        : (Number(m.jumlah) || 0) > 0 && (Number(m.diterima) || 0) >= (Number(m.jumlah) || 0),
  }));
}

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

// Rincian saldo deposit satu pelanggan per sumber pesanan — dipakai di form
// Pencairan (daftar "Rincian Pesanan", pasangan dari daftar rincian hutang di
// Penagihan Hutang). Tiap baris grosir_deposit POSITIF (kelebihan bayar/cair)
// adalah satu sumber; baris NEGATIF (sudah dicairkan / dipakai bayar pesanan)
// memotong sumber yang paling lama dulu (FIFO), jadi total sisa semua baris =
// saldoDepositPelanggan(). Hasil: [{id, nomor_pesanan, keterangan, created_at,
// sisa}] urut dari yang paling lama, hanya yang sisanya > 0.
export function rincianDepositPelanggan(pelangganId, depositList, pesananList) {
  const rows = (depositList || [])
    .filter((d) => d.pelanggan_id === pelangganId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let terpakai = rows.reduce((a, d) => a + (Number(d.jumlah) < 0 ? -Number(d.jumlah) : 0), 0);
  const hasil = [];
  rows.forEach((d) => {
    const jml = Number(d.jumlah) || 0;
    if (jml <= 0) return;
    const potong = Math.min(jml, terpakai);
    terpakai -= potong;
    const sisa = jml - potong;
    if (sisa <= 0.0001) return;
    // Kelebihan hasil edit pesanan Cekout sengaja tidak punya pesanan_id_terkait
    // (lihat ModalRouter) — nomor pesanannya diambil dari teks keterangan.
    const dariKet = (d.keterangan || "").match(/pesanan\s+(\S+)/i)?.[1];
    const ps = d.pesanan_id_terkait
      ? (pesananList || []).find((x) => x.id === d.pesanan_id_terkait)
      : dariKet
        ? (pesananList || []).find((x) => x.nomor_pesanan === dariKet)
        : null;
    const totalPesanan = ps && ps.total != null ? Number(ps.total) || 0 : null;
    hasil.push({
      id: d.id,
      nomor_pesanan: ps?.nomor_pesanan || dariKet || d.nomor_deposit || "Deposit",
      // Kelebihan asli baris ini (sebelum dipotong pencairan) & total pesanannya,
      // supaya kelihatan: cair = total pesanan + kelebihan.
      kelebihan: jml,
      total_pesanan: totalPesanan,
      // Pesanan asalnya sudah tidak ada di data (mis. sudah dihapus) tapi
      // catatan kelebihannya masih tersisa.
      yatim: !ps && Boolean(d.pesanan_id_terkait || dariKet),
      // Belum pernah terpotong pencairan/pemakaian sama sekali — hanya baris
      // utuh yang boleh dihapus satuan dari form Pencairan (supaya saldo tidak
      // meleset kalau sebagian sudah dicairkan).
      utuh: potong <= 0.0001,
      keterangan: d.keterangan || "",
      created_at: d.created_at,
      sisa,
    });
  });
  return hasil;
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

// Peta {pelangganId: saldoDeposit} untuk semua pelanggan yang punya saldo deposit
// positif — artinya TOKO yang berhutang ke pelanggan itu (kelebihan bayar/titipan
// yang belum dipakai), kebalikan dari totalHutangPerPelanggan di atas.
export function totalDepositPerPelanggan(depositList) {
  const map = {};
  (depositList || []).forEach((d) => {
    map[d.pelanggan_id] = (map[d.pelanggan_id] || 0) + (Number(d.jumlah) || 0);
  });
  Object.keys(map).forEach((id) => {
    if (map[id] <= 0.0001) delete map[id];
  });
  return map;
}

// =========================================================
// GROSIR — LAPORAN HARIAN / BULANAN / TAHUNAN
// Pola sama seperti helper Laporan Keuangan di bawah: dihitung dinamis dari
// grosir_pesanan (bukan disimpan sbg angka statis) supaya selalu akurat.
// Pesanan berstatus "Batal" TIDAK pernah dihitung ke omset manapun.
// =========================================================

// Ringkasan omset & jumlah pesanan grosir, opsional difilter ke rentang
// tanggal [dari, sampai] (format "YYYY-MM-DD", inklusif di kedua ujung).
// dari/sampai kosong ("" atau null/undefined) = tidak dibatasi ke arah itu.
export function ringkasanGrosir(pesananGrosir, dari, sampai) {
  const list = (pesananGrosir || []).filter((p) => {
    if (p.status === "Batal") return false;
    if (dari && p.tanggal < dari) return false;
    if (sampai && p.tanggal > sampai) return false;
    return true;
  });
  const omset = list.reduce((a, p) => a + (Number(p.total) || 0), 0);
  const jumlahPesanan = list.length;
  return { omset, jumlahPesanan, rataRata: jumlahPesanan > 0 ? omset / jumlahPesanan : 0, list };
}

// Kelompokkan omset & jumlah pesanan grosir per hari, atau per minggu kalau
// rentang datanya cukup panjang (>31 hari) — pola & fungsi bantu (awalMingguIso
// dkk) sama persis dengan arusKasPerPeriode() di bawah supaya grafiknya konsisten.
export function omsetGrosirPerPeriode(pesananList) {
  const list = (pesananList || []).filter((p) => p.status !== "Batal" && p.tanggal);
  if (list.length === 0) return { mode: "harian", data: [] };

  const tanggalUrut = list.map((p) => p.tanggal).sort();
  const rentangHari =
    Math.round(
      (new Date(`${tanggalUrut[tanggalUrut.length - 1]}T00:00:00`) - new Date(`${tanggalUrut[0]}T00:00:00`)) /
        86400000
    ) + 1;
  const mode = rentangHari > 31 ? "mingguan" : "harian";

  const map = new Map();
  list.forEach((p) => {
    const key = mode === "harian" ? p.tanggal : awalMingguIso(p.tanggal);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: mode === "harian" ? labelHarianIso(key) : labelMingguanIso(key),
        omset: 0,
        jumlahPesanan: 0,
      });
    }
    const g = map.get(key);
    g.omset += Number(p.total) || 0;
    g.jumlahPesanan += 1;
  });

  const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { mode, data };
}

// Rekap omset & jumlah pesanan per bulan untuk satu tahun (analog dengan
// laporanBulananData di Keuangan, tapi grosir tidak dikelompokkan per
// kategori — cuma dua baris: Omset & Jumlah Pesanan per bulan + Total).
export function laporanBulananGrosir(pesananGrosir, tahun) {
  const tahunStr = String(tahun);
  const list = (pesananGrosir || []).filter(
    (p) => p.status !== "Batal" && (p.tanggal || "").slice(0, 4) === tahunStr
  );
  const omsetBulan = Array(12).fill(0);
  const jumlahBulan = Array(12).fill(0);
  list.forEach((p) => {
    const idx = Number((p.tanggal || "").slice(5, 7)) - 1;
    if (idx >= 0 && idx < 12) {
      omsetBulan[idx] += Number(p.total) || 0;
      jumlahBulan[idx] += 1;
    }
  });
  return {
    tahun: Number(tahun),
    omset: { bulan: omsetBulan, total: omsetBulan.reduce((a, v) => a + v, 0) },
    jumlahPesanan: { bulan: jumlahBulan, total: jumlahBulan.reduce((a, v) => a + v, 0) },
  };
}

// Rekap omset & jumlah pesanan per tahun, untuk `jumlahTahun` tahun berurutan
// mulai dari tahunMulai (analog rekapTahunanData di Keuangan).
export function rekapTahunanGrosir(pesananGrosir, tahunMulai, jumlahTahun = 6) {
  const tahunList = Array.from({ length: jumlahTahun }, (_, i) => Number(tahunMulai) + i);
  const perTahun = tahunList.map((tahun) => {
    const { omset, jumlahPesanan } = ringkasanGrosir(pesananGrosir, `${tahun}-01-01`, `${tahun}-12-31`);
    return { tahun, omset, jumlahPesanan, rataRata: jumlahPesanan > 0 ? omset / jumlahPesanan : 0 };
  });
  return { tahunList, perTahun };
}

// =========================================================
// KEUANGAN — pencatatan kas masuk/keluar/transfer antar rekening
// =========================================================
// Kategori pemasukan & pengeluaran TIDAK lagi hardcode di sini — sekarang
// didaftarkan sendiri oleh user lewat halaman Keuangan > Rekening & Kategori,
// disimpan di tabel master_data dengan tipe "kategori_masuk" / "kategori_keluar"
// (pola yang sama seperti master_data tipe "bahan"/"warna"/dst untuk SKU).
// Begitu juga daftar rekening, disimpan dengan tipe "rekening".
// Lihat src/pages/Keuangan.jsx (RekeningKategori) untuk halaman kelolanya.

// Ringkasan total masuk/keluar/saldo dari daftar transaksi keuangan, opsional
// difilter ke rentang tanggal [dari, sampai] (format "YYYY-MM-DD", inklusif
// di kedua ujung). dari/sampai kosong ("" atau null/undefined) = tidak
// dibatasi ke arah itu. Dipakai bareng oleh halaman Keuangan & Laporan supaya
// angkanya selalu konsisten.
//
// Transaksi tipe "transfer" (pindah dana antar rekening milik sendiri)
// SENGAJA tidak dihitung ke masuk/keluar/saldo di sini — itu bukan
// pemasukan/pengeluaran riil, cuma mutasi antar rekening. Dampaknya ke saldo
// per rekening dihitung terpisah lewat saldoPerRekening() di bawah.
export function ringkasanKeuangan(transaksi, dari, sampai) {
  const list = (transaksi || []).filter((t) => {
    if (dari && t.tanggal < dari) return false;
    if (sampai && t.tanggal > sampai) return false;
    return true;
  });
  // Prive/dividen, pinjaman ke pemilik, dan pelunasannya tidak dihitung (lihat bukanLabaRugi),
  // tapi tetap ada di `list` supaya terlihat di daftar transaksi.
  const masuk = list
    .filter((t) => t.tipe === "masuk" && !bukanLabaRugi(t))
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  const keluar = list
    .filter((t) => t.tipe === "keluar" && !bukanLabaRugi(t))
    .reduce((a, t) => a + (Number(t.jumlah) || 0), 0);
  return { masuk, keluar, saldo: masuk - keluar, list };
}

// =========================================================
// SALDO MARKETPLACE (Shopee/TikTok/Lazada) — lihat pages/Penjualanmarketplace.jsx
// & constants.js NAV "penjualan-marketplace". Data disimpan TERPISAH dari
// keuangan_transaksi, di tabel sendiri "marketplace_transaksi" (kolom:
// platform, tanggal, tipe ["pemasukan"|"iklan"|"pencairan"], jumlah,
// keterangan, rekening, toko, keuangan_transaksi_id) — SENGAJA begitu supaya
// saldo marketplace TIDAK ikut nongol sebagai "rekening" di Keuangan
// (beda pola dari Toko Offline yang catat langsung ke keuangan_transaksi).
// Cuma saat PENCAIRAN yang bikin baris baru di keuangan_transaksi (tipe
// "masuk", ke rekening bank yang dipilih) — itulah satu-satunya titik
// sambung ke Keuangan, dicatat linknya lewat keuangan_transaksi_id supaya
// waktu baris pencairan dihapus, baris keuangan_transaksi yang nyambung
// bisa ikut dihapus juga (lihat ModalRouter "hapus-marketplace-transaksi").
// Saldo = akumulasi pemasukan - iklan - pencairan, DARI AWAL (bukan per
// bulan) — pola sama seperti saldoPerRekening() di bawah.
//
// Per-toko: satu platform (mis. Shopee) bisa punya beberapa toko sendiri
// (kode disimpan di kolom "toko", master datanya di master_data tipe
// "toko_<platform>" — lihat daftarTokoMarketplace() di bawah & ModalRouter
// "marketplace-toko-form"). Saldo TIDAK lagi digabung satu platform, tapi
// dihitung terpisah per toko — param `toko` di bawah opsional: kalau
// diisi (termasuk `null` eksplisit untuk kelompok "tanpa toko"/transaksi
// lama), saldo cuma dihitung dari baris yang toko-nya cocok; kalau
// argumennya sama sekali tidak dikirim (undefined), tetap menghitung
// SEMUA toko digabung (dipakai untuk total keseluruhan platform, bukan
// tampilan utama lagi).
export function saldoMarketplace(marketplaceTransaksi, platform, toko) {
  return (marketplaceTransaksi || [])
    .filter((t) => t.platform === platform && (toko === undefined || (t.toko || null) === (toko || null)))
    .reduce((saldo, t) => {
      const jumlah = Number(t.jumlah) || 0;
      if (t.tipe === "pemasukan") return saldo + jumlah;
      if (t.tipe === "iklan" || t.tipe === "pencairan") return saldo - jumlah;
      return saldo;
    }, 0);
}

// Entri Iklan yang belum "diselesaikan" ke Keuangan (kolom keuangan_transaksi_id
// masih kosong) untuk satu toko/platform — dipakai saat Pencairan (lihat modal
// "marketplace-pencairan" di ModalRouter.jsx): tiap Pencairan otomatis menyelesaikan
// SEMUA Iklan yang masih menumpuk, dicatat sebagai Biaya Iklan Marketplace terpisah
// di Keuangan, lalu Iklan itu ditandai (keuangan_transaksi_id diisi) supaya
// Pencairan berikutnya tidak menghitungnya lagi.
export function iklanBelumTercatat(marketplaceTransaksi, platform, toko) {
  return (marketplaceTransaksi || []).filter(
    (t) => t.platform === platform && (t.toko || null) === (toko || null) && t.tipe === "iklan" && !t.keuangan_transaksi_id
  );
}

// Toko Shopee "Gudang" — toko marketplace khusus yang dipakai sebagai
// penampung sementara uang Reseller Cekout (baik nominal yang cair waktu
// pesanan dibuat, maupun pelunasan piutang belakangan lewat "Catat
// Pembayaran") SEBELUM benar-benar dicairkan ke rekening Keuangan. Dicatat
// sebagai baris "pemasukan" biasa di marketplace_transaksi (platform
// "shopee", toko = kode toko ini) — persis pola pemasukan/pencairan toko
// marketplace lain (lihat Penjualanmarketplace.jsx), jadi otomatis kelihatan
// saldonya di menu Marketplace > Shopee > Gudang, dan baru masuk Keuangan
// saat admin klik "Cairkan" di toko itu. Dicari dari master_data tipe
// "toko_shopee" (lihat daftarTokoMarketplace di atas) berdasarkan nama
// PERSIS "Gudang" (tidak case-sensitive) — kalau belum ada, harus dibuat
// dulu manual lewat menu Marketplace > Shopee > "Tambah Toko".
export function tokoShopeeGudang(master) {
  const daftar = master?.toko_shopee || [];
  return daftar.find((t) => (t.label || "").trim().toLowerCase() === "gudang") || null;
}

// Toko marketplace per PT. master_data tidak punya kolom entitas, jadi pemilik toko dicatat
// lewat baris pemetaan master_data tipe "toko_entitas" (kode = "<platform>:<kode toko>",
// label = kode entitas) — pola yang sama dengan "rekening_entitas". Toko tanpa pemetaan
// = milik entitas default (OPS/Selma), jadi toko lama tidak perlu dimigrasi.
export const PLATFORM_MARKETPLACE = ["shopee", "tiktok", "lazada"];
export function lingkupTokoMarketplace(master, kodeEntitas) {
  if (!master) return master;
  const peta = {};
  (master.toko_entitas || []).forEach((m) => {
    peta[m.kode] = m.label;
  });
  const hasil = { ...master };
  PLATFORM_MARKETPLACE.forEach((pf) => {
    const daftar = master[`toko_${pf}`];
    if (!daftar) return;
    hasil[`toko_${pf}`] = daftar.filter((t) => (peta[`${pf}:${t.kode}`] || ENTITAS_DEFAULT) === (kodeEntitas || ENTITAS_DEFAULT));
  });
  return hasil;
}

// Tujuan pencairan Reseller Cekout — platform + toko marketplace mana yang menampung uang
// yang cair. Daftarnya diambil dari `master` yang SUDAH difilter per PT (lihat
// lingkupTokoMarketplace di atas), jadi akun Selma hanya melihat toko Selma dan akun Alivia
// hanya toko Alivia. Nilai opsi = "<platform>:<kode toko>".
// Default: pilihan terakhir yang dipakai akun/PT ini (disimpan di localStorage, hanya
// kemudahan per perangkat) -> toko Shopee "Gudang" kalau ada -> toko pertama.
const NAMA_PLATFORM_MARKETPLACE = { shopee: "Shopee", tiktok: "TikTok Shop", lazada: "Lazada" };
export function daftarTujuanPencairan(master) {
  const hasil = [];
  PLATFORM_MARKETPLACE.forEach((pf) => {
    (master?.[`toko_${pf}`] || []).forEach((t) => {
      hasil.push({
        value: `${pf}:${t.kode}`,
        platform: pf,
        toko: t.kode,
        label: `${NAMA_PLATFORM_MARKETPLACE[pf] || pf} — ${t.label}`,
      });
    });
  });
  return hasil;
}
export function cariTujuanPencairan(master, value) {
  return daftarTujuanPencairan(master).find((d) => d.value === value) || null;
}
const kunciTujuanPencairan = () => `selma-tujuan-cair-${entitasSesi()}`;
export function tujuanPencairanDefault(master) {
  const daftar = daftarTujuanPencairan(master);
  if (daftar.length === 0) return "";
  try {
    const terakhir = localStorage.getItem(kunciTujuanPencairan());
    if (terakhir && daftar.some((d) => d.value === terakhir)) return terakhir;
  } catch {
    /* storage tidak tersedia — abaikan */
  }
  const gudang = tokoShopeeGudang(master);
  if (gudang && daftar.some((d) => d.value === `shopee:${gudang.kode}`)) return `shopee:${gudang.kode}`;
  return daftar[0].value;
}
export function ingatTujuanPencairan(value) {
  try {
    if (value) localStorage.setItem(kunciTujuanPencairan(), value);
  } catch {
    /* abaikan */
  }
}

// Daftar toko untuk satu platform (dari master_data tipe "toko_<platform>"),
// masing-masing dilengkapi saldonya sendiri (lihat saldoMarketplace di
// atas). Toko yang belum pernah punya transaksi tetap muncul dengan saldo
// 0. Kalau ada transaksi lama yang belum diberi toko (kolom "toko" kosong
// — dari sebelum fitur per-toko ada), dikelompokkan jadi satu entri
// terpisah "Tanpa Nama Toko (transaksi lama)" (kode: null) supaya saldonya
// tetap kelihatan, bukan hilang begitu saja.
export function daftarTokoMarketplace(marketplaceTransaksi, tokoMasterList, platform) {
  const daftar = (tokoMasterList || []).map((tk) => ({
    kode: tk.kode,
    label: tk.label,
    saldo: saldoMarketplace(marketplaceTransaksi, platform, tk.kode),
  }));
  const adaTanpaToko = (marketplaceTransaksi || []).some((t) => t.platform === platform && !t.toko);
  if (adaTanpaToko) {
    daftar.push({
      kode: null,
      label: "Tanpa Nama Toko (transaksi lama)",
      saldo: saldoMarketplace(marketplaceTransaksi, platform, null),
    });
  }
  return daftar;
}

// Saldo per rekening, dihitung dari SELURUH transaksi (tidak dibatasi rentang
// tanggal — saldo itu akumulasi dari awal, bukan angka per periode):
//   - masuk   -> saldo rekening (sumber dana) bertambah
//   - keluar  -> saldo rekening (sumber dana) berkurang
//   - transfer -> saldo rekening asal berkurang, saldo rekening tujuan bertambah
// rekeningList = daftar master_data tipe "rekening" ({ kode, label }[]), dipakai
// supaya rekening yang belum pernah ada transaksinya tetap muncul dengan saldo 0.
// Batas bawah data keuangan yang dimuat App.jsx = awal BULAN INI. Data bulan
// sebelumnya / tahun lalu baru ditarik saat user memilih periode itu (lihat
// lib/useKeuanganRentang.js). Dipakai App.jsx juga, supaya satu sumber rumus.
export function awalRentangKeuanganDefault() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Transaksi keuangan LEBIH LAMA dari rentang yang dimuat App.jsx — dipakai
// Laporan Bulanan/Tahunan supaya bulan-bulan sebelumnya tidak tampil kosong.
// Ditarik sekali lalu disimpan di memori (data lama jarang berubah), jadi
// tidak menambah egress tiap buka halaman.
let cacheKeuanganLama = null;
export function resetKeuanganLama() {
  cacheKeuanganLama = null;
}
export async function muatKeuanganLama(force = false) {
  const awal = awalRentangKeuanganDefault();
  if (!force && cacheKeuanganLama && cacheKeuanganLama.awal === awal) return cacheKeuanganLama.rows;
  const rows = await sbAll(`keuangan_transaksi?select=*&tanggal=lt.${awal}&order=tanggal.desc`);
  cacheKeuanganLama = { awal, rows: rows || [] };
  return cacheKeuanganLama.rows;
}

// Saldo DASAR = akumulasi semua transaksi SEBELUM batas bawah data yang dimuat
// di memori (App.jsx hanya memuat bulan berjalan + 1 bulan sebelumnya demi
// hemat egress, jadi transaksi yang lebih lama tidak ada di `transaksi`).
// Diisi dari fungsi database saldo_rekening_sebelum(); tanpa ini, saldo per
// rekening cuma menghitung transaksi yang dimuat dan jadi salah tiap ganti bulan.
let saldoDasar = { sebelum: null, saldo: {} };
export function setSaldoDasarRekening(sebelum, saldo) {
  saldoDasar = { sebelum: sebelum || null, saldo: saldo || {} };
}

export function saldoPerRekening(transaksi, rekeningList, pakaiDasar = false) {
  const map = {};
  (rekeningList || []).forEach((r) => {
    map[r.kode] = { kode: r.kode, label: r.label, saldo: 0 };
  });
  const ensure = (kode) => {
    if (!kode) return null;
    if (!map[kode]) map[kode] = { kode, label: kode, saldo: 0 };
    return map[kode];
  };
  (transaksi || []).forEach((t) => {
    const jumlah = Number(t.jumlah) || 0;
    if (t.tipe === "masuk") {
      const r = ensure(t.rekening);
      if (r) r.saldo += jumlah;
    } else if (t.tipe === "keluar") {
      const r = ensure(t.rekening);
      if (r) r.saldo -= jumlah;
    } else if (t.tipe === "transfer") {
      const asal = ensure(t.rekening);
      const tujuan = ensure(t.rekening_tujuan);
      if (asal) asal.saldo -= jumlah;
      if (tujuan) tujuan.saldo += jumlah;
    }
  });
  if (pakaiDasar) {
    Object.entries(saldoDasar.saldo).forEach(([kode, nilai]) => {
      const r = ensure(kode);
      if (r) r.saldo += Number(nilai) || 0;
    });
  }
  // Daftar rekening hasil lingkupEntitas() ditandai __batasi: hanya rekening di
  // daftar itu yang dikembalikan (rekening entitas lain, termasuk dari saldo
  // dasar, tidak ikut). Daftar biasa tetap berperilaku seperti dulu.
  if (rekeningList && rekeningList.__batasi) {
    const boleh = new Set(rekeningList.map((r) => r.kode));
    return Object.values(map).filter((r) => boleh.has(r.kode));
  }
  return Object.values(map);
}

// =========================================================
// SALDO AWAL PER BULAN — override manual per rekening per bulan.
// Disimpan di master_data dengan tipe "saldo_awal" (pola sama seperti
// rekening/kategori_masuk/kategori_keluar): kode = "YYYY-MM-<KODE_REKENING>",
// label = jumlah (disimpan sebagai teks angka polos, bukan format rupiah).
// Kalau tidak ada baris override untuk kombinasi bulan+rekening itu, saldo
// awal dihitung OTOMATIS = akumulasi seluruh transaksi SEBELUM tanggal 1
// bulan tsb, jadi otomatis nyambung dari saldo akhir bulan sebelumnya tanpa
// perlu disalin manual tiap ganti bulan.
// =========================================================

export function kodeSaldoAwal(tahun, bulan, rekeningKode) {
  return `${tahun}-${String(bulan).padStart(2, "0")}-${rekeningKode}`;
}

// Saldo awal SATU rekening di bulan tertentu.
// -> { jumlah, manual, id }
//    manual=true  : nilainya override tersimpan (id = id baris master_data,
//                    dipakai buat PATCH waktu edit / DELETE waktu reset).
//    manual=false : otomatis, dihitung dari akumulasi transaksi.
export function saldoAwalRekening(transaksi, saldoAwalList, tahun, bulan, rekeningKode) {
  const kode = kodeSaldoAwal(tahun, bulan, rekeningKode);
  const override = (saldoAwalList || []).find((m) => m.kode === kode);
  if (override) return { jumlah: Number(override.label) || 0, manual: true, id: override.id };
  const batasAwal = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const sebelum = (transaksi || []).filter((t) => t.tanggal < batasAwal);
  // saldo dasar hanya berlaku kalau bulan ini jatuh di/setelah batas data yang dimuat
  const pakaiDasar = !!saldoDasar.sebelum && batasAwal >= saldoDasar.sebelum;
  const [hasil] = saldoPerRekening(sebelum, [{ kode: rekeningKode, label: rekeningKode }], pakaiDasar);
  return { jumlah: hasil?.saldo || 0, manual: false, id: null };
}

// Saldo awal SEMUA rekening buat satu bulan sekaligus — dipakai halaman
// Laporan Keuangan. rekeningList = master.rekening (daftar { kode, label }).
export function saldoAwalBulan(transaksi, rekeningList, saldoAwalList, tahun, bulan) {
  return (rekeningList || []).map((r) => ({
    kode: r.kode,
    label: r.label,
    ...saldoAwalRekening(transaksi, saldoAwalList, tahun, bulan, r.kode),
  }));
}

// Saldo akhir SATU rekening di bulan tertentu = saldo awal bulan itu +
// mutasi bersih (masuk - keluar +/- transfer) SELAMA bulan itu saja. Berguna
// buat preview "kalau saldo awal diubah jadi segini, saldo akhirnya jadi
// segini" — saldo bulan berikutnya otomatis ikut nyambung lewat hitungan
// akumulasi di saldoAwalRekening() di atas, tidak perlu disimpan terpisah.
export function saldoAkhirRekening(transaksi, saldoAwalList, tahun, bulan, rekeningKode) {
  const { jumlah: awal } = saldoAwalRekening(transaksi, saldoAwalList, tahun, bulan, rekeningKode);
  const bulanStr = String(bulan).padStart(2, "0");
  const awalIso = `${tahun}-${bulanStr}-01`;
  const hariTerakhir = new Date(tahun, bulan, 0).getDate();
  const akhirIso = `${tahun}-${bulanStr}-${String(hariTerakhir).padStart(2, "0")}`;
  const bulanIni = (transaksi || []).filter((t) => t.tanggal >= awalIso && t.tanggal <= akhirIso);
  const [hasil] = saldoPerRekening(bulanIni, [{ kode: rekeningKode, label: rekeningKode }]);
  return awal + (hasil?.saldo || 0);
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Awal minggu (Senin) dari sebuah tanggal ISO "YYYY-MM-DD", dikembalikan sebagai
// string ISO juga — dipakai sebagai kunci pengelompokan mode mingguan.
function awalMingguIso(tanggalIso) {
  const d = new Date(`${tanggalIso}T00:00:00`);
  const offsetKeSenin = (d.getDay() + 6) % 7; // Minggu(0) -> 6, Senin(1) -> 0, dst.
  d.setDate(d.getDate() - offsetKeSenin);
  return d.toISOString().slice(0, 10);
}

function labelHarianIso(tanggalIso) {
  const d = new Date(`${tanggalIso}T00:00:00`);
  return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}`;
}

function labelMingguanIso(seninIso) {
  const senin = new Date(`${seninIso}T00:00:00`);
  const minggu = new Date(senin);
  minggu.setDate(senin.getDate() + 6);
  const fmt = (x) => `${x.getDate()} ${BULAN_PENDEK[x.getMonth()]}`;
  return `${fmt(senin)}–${fmt(minggu)}`;
}

// Kelompokkan transaksi (kas masuk vs kas keluar) per hari, atau per minggu kalau
// rentang tanggalnya cukup panjang (>31 hari) supaya grafiknya tidak terlalu padat.
// Transfer antar rekening tidak dihitung (sama seperti ringkasanKeuangan()).
// Mengembalikan { mode: "harian"|"mingguan", data: [{ key, label, masuk, keluar }] }
// terurut dari tanggal paling lama ke paling baru.
export function arusKasPerPeriode(transaksi) {
  const list = (transaksi || []).filter((t) => t.tipe === "masuk" || t.tipe === "keluar");
  if (list.length === 0) return { mode: "harian", data: [] };

  const tanggalUrut = list.map((t) => t.tanggal).sort();
  const rentangHari =
    Math.round(
      (new Date(`${tanggalUrut[tanggalUrut.length - 1]}T00:00:00`) - new Date(`${tanggalUrut[0]}T00:00:00`)) /
        86400000
    ) + 1;
  const mode = rentangHari > 31 ? "mingguan" : "harian";

  const map = new Map();
  list.forEach((t) => {
    const key = mode === "harian" ? t.tanggal : awalMingguIso(t.tanggal);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: mode === "harian" ? labelHarianIso(key) : labelMingguanIso(key),
        masuk: 0,
        keluar: 0,
      });
    }
    const g = map.get(key);
    const jumlah = Number(t.jumlah) || 0;
    if (t.tipe === "masuk") g.masuk += jumlah;
    else g.keluar += jumlah;
  });

  const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { mode, data };
}

// Breakdown pengeluaran per kategori dari daftar transaksi (biasanya hasil
// ringkasanKeuangan(), sudah difilter rentang tanggal): total tiap kategori
// beserta persentasenya terhadap total pengeluaran, terurut dari yang terbesar.
// kategoriList = master_data tipe "kategori_keluar" ({ kode, label }[]), dipakai
// untuk menerjemahkan kode kategori ke nama yang enak dibaca.
export function breakdownPengeluaranKategori(transaksi, kategoriList) {
  const pengeluaran = (transaksi || []).filter((t) => t.tipe === "keluar" && !bukanLabaRugi(t));
  const total = pengeluaran.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  const map = new Map();
  pengeluaran.forEach((t) => {
    const kode = t.kategori || "";
    const found = (kategoriList || []).find((k) => k.kode === kode);
    const label = found ? found.label : kode || "Tanpa Kategori";
    if (!map.has(kode || "__tanpa__")) {
      map.set(kode || "__tanpa__", { kode, label, jumlah: 0 });
    }
    map.get(kode || "__tanpa__").jumlah += Number(t.jumlah) || 0;
  });

  const data = Array.from(map.values())
    .map((d) => ({ ...d, persen: total > 0 ? (d.jumlah / total) * 100 : 0 }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return { total, data };
}

// Kelompokkan hasil breakdown kategori (breakdownPengeluaranKategori /
// breakdownPemasukanKategori) jadi POHON BERTINGKAT buatan user, mis.
//   Biaya Operasional (Kategori)
//     └ Biaya Tetap (Sub Kategori)
//         └ Gaji Karyawan, Biaya Gedung, Listrik (Rincian = kategori master)
// pemetaan = master_data tipe "kelompok_masuk" / "kelompok_keluar", tiap baris
// { kode: <kode kategori master>, label: <jalur> } dengan jalur ditulis
// "Kategori > Sub Kategori" (boleh lebih dalam lagi; cuma satu nama = langsung
// di bawah Kategori). Kategori master yang belum dipetakan tetap tampil sendiri
// di level paling atas. Hasil: array setipe `data` breakdown — elemen kelompok
// punya isGrup = true + `anak` (kelompok lain atau kategori master), kode-nya
// "__grup__:<jalur>". Elemen non-kelompok = kategori master (daun) apa adanya.
export function kelompokkanBreakdown(data, pemetaan, total) {
  const peta = new Map();
  (pemetaan || []).forEach((m) => {
    if (!m?.kode || !m?.label) return;
    const jalur = String(m.label).split(">").map((x) => x.trim()).filter(Boolean);
    if (jalur.length) peta.set(m.kode, jalur);
  });
  if (peta.size === 0) return data;

  const akar = [];
  const lepas = [];
  (data || []).forEach((d) => {
    const jalur = peta.get(d.kode);
    if (!jalur) {
      lepas.push(d);
      return;
    }
    let daftar = akar;
    let kodeJalur = "";
    jalur.forEach((nama) => {
      kodeJalur = kodeJalur ? `${kodeJalur}>${nama}` : nama;
      let g = daftar.find((x) => x.isGrup && x.label.toLowerCase() === nama.toLowerCase());
      if (!g) {
        g = { kode: `__grup__:${kodeJalur}`, label: nama, jumlah: 0, isGrup: true, anak: [] };
        daftar.push(g);
      }
      g.jumlah += d.jumlah;
      daftar = g.anak;
    });
    daftar.push(d);
  });

  const rapikan = (arr, tot) =>
    arr
      .map((n) => ({
        ...n,
        persen: tot > 0 ? (n.jumlah / tot) * 100 : 0,
        ...(n.isGrup ? { anak: rapikan(n.anak, n.jumlah) } : {}),
      }))
      .sort((a, b) => b.jumlah - a.jumlah);

  return rapikan([...akar, ...lepas], total);
}

// Breakdown pemasukan per kategori — pasangan dari breakdownPengeluaranKategori
// di atas, tapi untuk transaksi tipe "masuk". kategoriList = master_data tipe
// "kategori_masuk". Dipakai oleh Laporan Laba Rugi di bawah.
export function breakdownPemasukanKategori(transaksi, kategoriList) {
  const pemasukan = (transaksi || []).filter((t) => t.tipe === "masuk" && !bukanLabaRugi(t));
  const total = pemasukan.reduce((a, t) => a + (Number(t.jumlah) || 0), 0);

  const map = new Map();
  pemasukan.forEach((t) => {
    const kode = t.kategori || "";
    const found = (kategoriList || []).find((k) => k.kode === kode);
    const label = found ? found.label : kode || "Tanpa Kategori";
    if (!map.has(kode || "__tanpa__")) {
      map.set(kode || "__tanpa__", { kode, label, jumlah: 0 });
    }
    map.get(kode || "__tanpa__").jumlah += Number(t.jumlah) || 0;
  });

  const data = Array.from(map.values())
    .map((d) => ({ ...d, persen: total > 0 ? (d.jumlah / total) * 100 : 0 }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return { total, data };
}

// Laporan Laba Rugi (Income Statement) untuk satu rentang tanggal: rincian
// tiap kategori Pendapatan & Beban (pakai breakdown di atas) + total masing-
// masing, Laba (Rugi) Bersih, dan margin laba bersih (%). dari/sampai kosong
// = tidak dibatasi ke arah itu (sama pola dengan ringkasanKeuangan()).
// Dipakai bareng oleh Laporan Keuangan & Dashboard Keuangan.
// pemetaanMasuk / pemetaanKeluar (opsional) = master.kelompok_masuk /
// master.kelompok_keluar — kalau diisi, `data` pendapatan/beban dikelompokkan
// bertingkat (Kategori > Sub Kategori > Rincian), lihat kelompokkanBreakdown.
export function laporanLabaRugi(transaksi, kategoriMasukList, kategoriKeluarList, dari, sampai, pemetaanMasuk, pemetaanKeluar) {
  const { list } = ringkasanKeuangan(transaksi, dari, sampai);
  const pendapatan = breakdownPemasukanKategori(list, kategoriMasukList);
  const beban = breakdownPengeluaranKategori(list, kategoriKeluarList);
  pendapatan.data = kelompokkanBreakdown(pendapatan.data, pemetaanMasuk, pendapatan.total);
  beban.data = kelompokkanBreakdown(beban.data, pemetaanKeluar, beban.total);
  const labaRugi = pendapatan.total - beban.total;
  const marginPersen = pendapatan.total > 0 ? (labaRugi / pendapatan.total) * 100 : 0;
  return { pendapatan, beban, labaRugi, marginPersen };
}

// Susun data "Laporan Bulanan" untuk satu tahun: tiap kategori pemasukan &
// pengeluaran jadi satu baris dengan 12 kolom bulan + Total, mirip format
// Laporan Bulanan di Excel (SELMA_FINANCE.xlsx). Kategori yang tidak pernah
// dipakai tahun itu tetap muncul (nilai 0) supaya strukturnya konsisten;
// kategori yang dipakai tapi belum terdaftar di master ikut ditambahkan di
// akhir daftar (fallback label = kode transaksinya).
// Dipakai bareng oleh preview di halaman Laporan Keuangan & PDF-nya.
//
// pemetaanMasuk / pemetaanKeluar (opsional) = master.kelompok_masuk /
// master.kelompok_keluar — kalau diisi, hasil juga memuat `pendapatanGrup` /
// `pengeluaranGrup`: pohon bertingkat (Kategori > Sub Kategori > Rincian)
// yang sama dengan Laporan Laba Rugi, tiap kelompok berisi jumlah per bulan
// + total gabungan anak-anaknya. `pendapatan` / `pengeluaran` tetap daftar
// datar (dipakai pemanggil lama).
function kelompokkanBarisBulanan(baris, pemetaan) {
  const peta = new Map();
  (pemetaan || []).forEach((m) => {
    if (!m?.kode || !m?.label) return;
    const jalur = String(m.label).split(">").map((x) => x.trim()).filter(Boolean);
    if (jalur.length) peta.set(m.kode, jalur);
  });
  if (peta.size === 0) return baris;

  const akar = [];
  baris.forEach((r) => {
    const jalur = peta.get(r.kode);
    if (!jalur) {
      akar.push(r);
      return;
    }
    let daftar = akar;
    let kodeJalur = "";
    jalur.forEach((nama) => {
      kodeJalur = kodeJalur ? `${kodeJalur}>${nama}` : nama;
      let g = daftar.find((x) => x.isGrup && x.label.toLowerCase() === nama.toLowerCase());
      if (!g) {
        g = { kode: `__grup__:${kodeJalur}`, label: nama, isGrup: true, bulan: Array(12).fill(0), total: 0, anak: [] };
        daftar.push(g);
      }
      r.bulan.forEach((v, i) => (g.bulan[i] += v));
      g.total += r.total;
      daftar = g.anak;
    });
    daftar.push(r);
  });
  return akar;
}

export function laporanBulananData(transaksi, kategoriMasukList, kategoriKeluarList, tahun, pemetaanMasuk, pemetaanKeluar) {
  const tahunStr = String(tahun);
  const list = (transaksi || []).filter((t) => (t.tanggal || "").slice(0, 4) === tahunStr);

  const susunBaris = (tipe, kategoriList) => {
    const map = new Map();
    (kategoriList || []).forEach((k) => map.set(k.kode, { kode: k.kode, label: k.label, bulan: Array(12).fill(0) }));
    list
      .filter((t) => t.tipe === tipe && !bukanLabaRugi(t))
      .forEach((t) => {
        const kode = t.kategori || "";
        if (!map.has(kode)) {
          const found = (kategoriList || []).find((k) => k.kode === kode);
          map.set(kode, { kode, label: found ? found.label : kode || "Tanpa Kategori", bulan: Array(12).fill(0) });
        }
        const bulanIdx = Number((t.tanggal || "").slice(5, 7)) - 1;
        if (bulanIdx >= 0 && bulanIdx < 12) {
          map.get(kode).bulan[bulanIdx] += Number(t.jumlah) || 0;
        }
      });
    return Array.from(map.values()).map((r) => ({ ...r, total: r.bulan.reduce((a, v) => a + v, 0) }));
  };

  const jumlahPerBulan = (baris) => {
    const bulan = Array(12).fill(0);
    baris.forEach((r) => r.bulan.forEach((v, i) => (bulan[i] += v)));
    return { bulan, total: bulan.reduce((a, v) => a + v, 0) };
  };

  const pendapatan = susunBaris("masuk", kategoriMasukList);
  const pengeluaran = susunBaris("keluar", kategoriKeluarList);
  const totalPendapatan = jumlahPerBulan(pendapatan);
  const totalPengeluaran = jumlahPerBulan(pengeluaran);
  const labaRugi = {
    bulan: totalPendapatan.bulan.map((v, i) => v - totalPengeluaran.bulan[i]),
    total: totalPendapatan.total - totalPengeluaran.total,
  };

  return {
    tahun: Number(tahun),
    pendapatan,
    pengeluaran,
    pendapatanGrup: kelompokkanBarisBulanan(pendapatan, pemetaanMasuk),
    pengeluaranGrup: kelompokkanBarisBulanan(pengeluaran, pemetaanKeluar),
    totalPendapatan,
    totalPengeluaran,
    labaRugi,
  };
}

// Susun data "Rekap Tahunan": total pendapatan/pengeluaran/laba-rugi per
// tahun, untuk `jumlahTahun` tahun berurutan mulai dari tahunMulai. Mirip
// sheet REKAP TAHUNAN di Excel (SELMA_FINANCE.xlsx).
export function rekapTahunanData(transaksi, tahunMulai, jumlahTahun = 6) {
  const tahunList = Array.from({ length: jumlahTahun }, (_, i) => Number(tahunMulai) + i);
  const perTahun = tahunList.map((tahun) => {
    const { masuk, keluar } = ringkasanKeuangan(transaksi, `${tahun}-01-01`, `${tahun}-12-31`);
    const laba = masuk - keluar;
    return { tahun, pendapatan: masuk, pengeluaran: keluar, laba, marginPersen: masuk > 0 ? (laba / masuk) * 100 : 0 };
  });
  return { tahunList, perTahun };
}

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


// =========================================================
// BANK / KAS KECIL
// Kas Besar sudah dihapus: pembukuan Holding sekarang lewat entitas Holding
// (lihat ENTITAS di bawah), bukan jenis kas. Kas Kecil = kas operasional (semua
// rekening lama otomatis masuk sini). Penandaan disimpan di master_data dengan
// tipe "kas_grup": kode = kode rekening, label = "bank". Rekening yang TIDAK
// punya baris penanda = Kas Kecil (jadi tidak perlu migrasi data lama).
// Transfer antar rekening DALAM kas yang sama tidak mengubah saldo kas itu;
// transfer ANTAR kas (mis. isi ulang kas kecil dari bank) tampil
// sebagai "transfer masuk/keluar", bukan pemasukan/pengeluaran.
// =========================================================
export const KAS_KECIL = "kecil";
export const KAS_BANK = "bank";
export const LABEL_KAS = { kecil: "Kas Kecil", bank: "Bank" };
// Urutan tampil: Bank, Kas Kecil
export const URUTAN_KAS = [KAS_BANK, KAS_KECIL];

export function petaKasRekening(kasGrupList) {
  const peta = {};
  (kasGrupList || []).forEach((m) => {
    // Tanpa penanda = Kas Kecil (rekening lama otomatis Kas Kecil). Label "bank" = Bank.
    // (Penanda "besar" peninggalan versi lama diperlakukan sebagai Kas Kecil.)
    peta[m.kode] = m.label === KAS_BANK ? KAS_BANK : KAS_KECIL;
  });
  return peta;
}

export function kasDariRekening(peta, kodeRekening) {
  const k = peta ? peta[kodeRekening] : null;
  return k === KAS_BANK ? k : KAS_KECIL;
}

// Kas mana saja yang tersentuh satu transaksi (transfer antar kas = dua kas).
export function kasTerkait(t, peta) {
  const asal = kasDariRekening(peta, t.rekening);
  if (t.tipe !== "transfer") return [asal];
  const tujuan = kasDariRekening(peta, t.rekening_tujuan);
  return asal === tujuan ? [asal] : [asal, tujuan];
}

// Ringkasan satu kas dari daftar transaksi (sudah difilter rentang tanggal).
export function ringkasanPerKas(list, peta, kas) {
  let masuk = 0;
  let keluar = 0;
  let transferMasuk = 0;
  let transferKeluar = 0;
  (list || []).forEach((t) => {
    const j = Number(t.jumlah) || 0;
    if (t.tipe === "masuk" && kasDariRekening(peta, t.rekening) === kas) masuk += j;
    else if (t.tipe === "keluar" && kasDariRekening(peta, t.rekening) === kas) keluar += j;
    else if (t.tipe === "transfer") {
      const asal = kasDariRekening(peta, t.rekening);
      const tujuan = kasDariRekening(peta, t.rekening_tujuan);
      if (asal !== tujuan) {
        if (asal === kas) transferKeluar += j;
        if (tujuan === kas) transferMasuk += j;
      }
    }
  });
  return { masuk, keluar, transferMasuk, transferKeluar };
}

// Saldo per kas = jumlah saldo rekening-rekening di dalamnya.
// saldoRekening = hasil saldoPerRekening().
export function saldoPerKas(saldoRekening, peta) {
  const hasil = { kecil: 0, bank: 0 };
  (saldoRekening || []).forEach((r) => {
    hasil[kasDariRekening(peta, r.kode)] += Number(r.saldo) || 0;
  });
  return hasil;
}
// ---- Lokasi ----
// master_data tipe "lokasi": kode + nama lokasi (mis. Pusat Bandung). master_data tipe "rekening_lokasi":
// kode = kode rekening, label = kode lokasi. Satu rekening satu lokasi; tanpa penanda = "Tanpa lokasi".
export const LOKASI_TANPA = "__tanpa_lokasi__";
export function petaLokasiRekening(list) {
  const peta = {};
  (list || []).forEach((m) => {
    peta[m.kode] = m.label;
  });
  return peta;
}
export function lokasiDariRekening(petaLok, lokasiList, kodeRekening) {
  const k = petaLok ? petaLok[kodeRekening] : null;
  return k && (lokasiList || []).some((l) => l.kode === k) ? k : LOKASI_TANPA;
}
// Saldo per lokasi, dipecah per jenis kas (Bank / Kecil). saldoRekening = hasil saldoPerRekening().
export function saldoPerLokasi(saldoRekening, petaKas, petaLok, lokasiList) {
  const kosong = () => ({ bank: 0, kecil: 0, total: 0, jumlahRekening: 0 });
  const baris = new Map();
  (lokasiList || []).forEach((l) => baris.set(l.kode, { kode: l.kode, label: l.label, ...kosong() }));
  const tanpa = { kode: LOKASI_TANPA, label: "Tanpa lokasi", ...kosong() };
  (saldoRekening || []).forEach((r) => {
    const lk = lokasiDariRekening(petaLok, lokasiList, r.kode);
    const b = lk === LOKASI_TANPA ? tanpa : baris.get(lk);
    const saldo = Number(r.saldo) || 0;
    b[kasDariRekening(petaKas, r.kode)] += saldo;
    b.total += saldo;
    b.jumlahRekening += 1;
  });
  const hasil = [...baris.values()];
  if (tanpa.jumlahRekening > 0) hasil.push(tanpa);
  return hasil;
}

// Saldo SEBELUM tanggal tertentu (tanggal itu sendiri belum dihitung) untuk
// sekumpulan rekening sekaligus — dipakai Buku Kas sebagai saldo awal periode.
// Beda dari saldoAwalRekening(): ini TIDAK memakai override saldo awal manual,
// murni akumulasi transaksi (+ saldo dasar kalau tanggalnya di/setelah batas
// data yang dimuat). Kalau tanggalIso lebih lama dari batas itu, `transaksi`
// harus sudah memuat data lama (lihat useKeuanganRentang).
export function saldoSebelumTanggal(transaksi, kodeList, tanggalIso) {
  const kodeSet = new Set(kodeList || []);
  const sebelum = (transaksi || []).filter((t) => t.tanggal < tanggalIso);
  const pakaiDasar = !!saldoDasar.sebelum && tanggalIso >= saldoDasar.sebelum;
  return saldoPerRekening(sebelum, (kodeList || []).map((k) => ({ kode: k, label: k })), pakaiDasar)
    .filter((r) => kodeSet.has(r.kode))
    .reduce((a, r) => a + (Number(r.saldo) || 0), 0);
}

// =========================================================
// ENTITAS (Fase 4 — Holding)
// master_data tipe "entitas": kode + nama (mis. OPS = SELMA Operasional,
// HOLD = Holding). master_data tipe "rekening_entitas": kode = kode rekening,
// label = kode entitas. Rekening tanpa penanda = entitas default (OPS), jadi
// data lama tidak perlu dimigrasi. Transaksi tidak punya kolom entitas — milik
// entitas mana ditentukan dari rekeningnya. Transfer antar rekening beda
// entitas = transaksi antar-entitas (kolom penanda: modal/dividen/pinjaman/biaya_antar).
// =========================================================
export const ENTITAS_DEFAULT = "OPS";
export const ENTITAS_HOLDING = "HOLD";

// Kode entitas Holding: "HOLD" kalau ada, kalau tidak entitas pertama selain default.
// Kosong = entitas belum diatur (SQL fase 4 belum dijalankan).
export function kodeEntitasHolding(entitasList, setList) {
  const l = entitasList || [];
  return kodeHoldingPasti(l, setList) || l.find((e) => e.kode !== ENTITAS_DEFAULT)?.kode || "";
}

// =========================================================
// PROFIL / PENGATURAN PERUSAHAAN (entitas) — diatur Super Appa di Perusahaan Grup > Kelola
// Perusahaan, JANGAN di-hardcode per perusahaan. Disimpan di master_data tipe "entitas_set":
//   kode = "<ENTITAS>:<kunci>", label = isinya (pola sama dengan rekening_peran).
// Kunci yang dipakai:
//   nama_usaha : nama di kop nota/label & laporan PDF   (kosong -> nama perusahaan; OPS -> kop Selma)
//   alamat     : baris alamat kop nota, dipisah "|"
//   nama_store : judul grup/kartu toko                   (kosong -> "Store <nama tanpa PT/CV>")
//   jenis      : "holding" menandai entitas Holding      (kosong -> kode "HOLD" seperti dulu)
// Perusahaan baru cukup diisi di layar itu, tanpa ubah kode.
// =========================================================
let profilTerdaftar = { entitas: [], set: [] };
// Dipanggil App tiap master dimuat, supaya fungsi di luar React (mis. penjaga request di sb())
// tahu entitas mana yang Holding.
export function daftarkanProfilEntitas(master) {
  profilTerdaftar = { entitas: master?.entitas || [], set: master?.entitas_set || [] };
}
export function pengaturanEntitas(master, kode) {
  const hasil = {};
  (master?.entitas_set || []).forEach((m) => {
    const k = String(m.kode || "");
    const i = k.indexOf(":");
    if (i > 0 && k.slice(0, i) === kode) hasil[k.slice(i + 1)] = m.label;
  });
  return hasil;
}
// Kode entitas Holding TANPA tebakan: yang bertanda jenis=holding, lalu kode "HOLD"; kosong
// kalau tidak ada. (kodeEntitasHolding di atas menambah tebakan "entitas pertama selain default".)
export function kodeHoldingPasti(entitasList, setList) {
  const l = entitasList ?? profilTerdaftar.entitas;
  const st = setList ?? profilTerdaftar.set;
  const bertanda = (st || [])
    .filter((m) => m.label === "holding" && String(m.kode).endsWith(":jenis"))
    .map((m) => String(m.kode).slice(0, -":jenis".length))
    .find((k) => (l || []).some((e) => e.kode === k));
  if (bertanda) return bertanda;
  return (l || []).find((e) => e.kode === ENTITAS_HOLDING)?.kode || "";
}
export function kodeHoldingSaatIni() {
  return kodeHoldingPasti(profilTerdaftar.entitas, profilTerdaftar.set);
}
const NAMA_USAHA_OPS = "SELMA ACC BANDUNG";
export function namaUsahaEntitas(master, kode) {
  const k = kode || ENTITAS_DEFAULT;
  const dipilih = pengaturanEntitas(master, k).nama_usaha;
  if (dipilih) return dipilih;
  if (k === ENTITAS_DEFAULT) return NAMA_USAHA_OPS;
  return String((master?.entitas || []).find((e) => e.kode === k)?.label || k);
}
export function alamatEntitas(master, kode) {
  const a = pengaturanEntitas(master, kode || ENTITAS_DEFAULT).alamat;
  return a ? String(a).split("|").map((x) => x.trim()).filter(Boolean) : [];
}
export function namaStoreEntitas(master, kode) {
  const k = kode || ENTITAS_DEFAULT;
  const dipilih = pengaturanEntitas(master, k).nama_store;
  if (dipilih) return dipilih;
  if (k === ENTITAS_DEFAULT) return "Store Selma";
  return `Store ${namaUsahaEntitas(master, k).replace(/^\s*(pt|cv)\.?\s+/i, "").trim()}`;
}
export const PENANDA_ANTAR_ENTITAS = {
  modal: "Modal",
  dividen: "Dividen",
  pinjaman: "Pinjaman",
  pelunasan_pinjaman: "Pelunasan Pinjaman",
  biaya_antar: "Biaya Antar Perusahaan",
};

// =========================================================
// PENARIKAN PEMILIK (menu Holding > Penarikan Pemilik)
// Uang Holding yang dipakai pemilik secara pribadi. Disimpan di keuangan_transaksi
// (tipe keluar/masuk) dengan kolom penanda di bawah ini. Yang BUKAN laba rugi:
//   prive_dividen     (keluar) : prive (usaha perorangan) / dividen (setelah PT berdiri)
//   pinjaman_pemilik  (keluar) : pinjaman ke pemilik = piutang, harus kembali
//   pelunasan_pemilik (masuk)  : pemilik mengembalikan pinjaman
//   setoran_modal     (masuk)  : pemilik menyetor modal/dana awal ke Holding
// gaji_pemilik (keluar) tetap beban biasa, jadi ikut laba rugi.
// =========================================================
export const PENARIKAN_PEMILIK = {
  setoran_modal: "Setoran Modal Pemilik",
  prive_dividen: "Prive / Dividen",
  pinjaman_pemilik: "Pinjaman ke Pemilik",
  gaji_pemilik: "Gaji Pemilik",
  pelunasan_pemilik: "Pelunasan Pinjaman Pemilik",
};
export const TIPE_PENARIKAN = {
  setoran_modal: "masuk",
  prive_dividen: "keluar",
  pinjaman_pemilik: "keluar",
  gaji_pemilik: "keluar",
  pelunasan_pemilik: "masuk",
};
// Transaksi yang tidak boleh dihitung ke pendapatan/beban (laba rugi), tapi tetap
// menggerakkan saldo kas.
export function bukanLabaRugi(t) {
  if (!t || !t.penanda) return false;
  if (t.tipe === "keluar") return t.penanda === "prive_dividen" || t.penanda === "pinjaman_pemilik";
  if (t.tipe === "masuk") return t.penanda === "pelunasan_pemilik" || t.penanda === "setoran_modal";
  return false;
}

export function petaEntitasRekening(list) {
  const peta = {};
  (list || []).forEach((m) => {
    peta[m.kode] = m.label;
  });
  return peta;
}

// Kode entitas pemilik rekening; rekening tanpa penanda (atau menunjuk entitas
// yang sudah tidak ada) = entitas default.
export function entitasDariRekening(peta, entitasList, kodeRekening) {
  const e = peta ? peta[kodeRekening] : null;
  if (e && (entitasList || []).some((x) => x.kode === e)) return e;
  return ENTITAS_DEFAULT;
}

// Batasi data Keuangan ke SATU entitas: rekening milik entitas itu, dan semua
// transaksi yang menyentuh rekeningnya (termasuk transfer antar-entitas, yang
// netral untuk laporan pemasukan/pengeluaran). Tanpa entitas (atau cuma ada
// satu) data dikembalikan apa adanya.
export function lingkupEntitas(transaksi, master, kodeEntitas) {
  const entitasList = master?.entitas || [];
  if (!kodeEntitas || entitasList.length < 2) return { transaksi, master };
  const peta = petaEntitasRekening(master.rekening_entitas);
  const entDari = (kode) => entitasDariRekening(peta, entitasList, kode);
  const rekening = (master.rekening || []).filter((r) => entDari(r.kode) === kodeEntitas);
  rekening.__batasi = true;
  const sentuh = (t) => entDari(t.rekening) === kodeEntitas || (t.tipe === "transfer" && entDari(t.rekening_tujuan) === kodeEntitas);
  const trx = (transaksi || []).filter(sentuh);
  // useKeuanganRentang menggabungkan data bulan lama (semua entitas) ke daftar ini;
  // __saring dipakai di sana supaya data lama ikut tersaring ke entitas yang sama.
  trx.__saring = sentuh;
  return { transaksi: trx, master: { ...master, rekening } };
}

// Daftar rekening yang boleh dipilih di form penjualan (pembayaran grosir/reseller, deposit,
// pencairan marketplace): hanya rekening milik PT akun yang login. master.rekening berisi
// rekening SEMUA PT, jadi tanpa ini Alivia melihat rekening Selma di dropdown (dan sebaliknya).
export function rekeningEntitasSesi(master) {
  return lingkupEntitas([], master || {}, entitasSesi()).master.rekening || [];
}

// Rekening TETAP (mis. "BCA a/n Sandi Purwoto" untuk Pesan Barang, "Petty Cash" untuk
// ongkir) harus milik ENTITAS akun yang sedang login. Transaksi tidak punya kolom
// entitas — ia ikut entitas rekeningnya — jadi kalau akun PT lain (mis. Alivia)
// memakai rekening bernama sama milik SELMA, uangnya tercatat di keuangan SELMA.
// Di sini: cari rekening berlabel itu yang MILIK entitas akun; kalau belum ada,
// buat rekening baru khusus entitas itu + pemetaan rekening_entitas-nya.
// Rekening yang dipilih entitas untuk satu peran (Keuangan > Pengaturan > Penggunaan Rekening).
// master_data tipe "rekening_peran": kode = "<ENTITAS>:<peran>", label = kode rekening.
// Mengembalikan kode rekening, atau null kalau belum diatur / rekeningnya sudah tidak ada.
export function kodeRekeningPeran(master, kodeEntitas, peran) {
  if (!peran) return null;
  const baris = (master?.rekening_peran || []).find((x) => x.kode === `${kodeEntitas}:${peran}`);
  if (!baris) return null;
  return (master?.rekening || []).some((r) => r.kode === baris.label) ? baris.label : null;
}

export async function cariAtauBuatRekeningTetap(master, labelTetap, suggestKodeFn, peran) {
  const e = entitasSesi();
  const daftar = master?.rekening || [];
  const entList = master?.entitas || [];
  // Pengaturan eksplisit per entitas menang atas pencarian nama.
  const dipilih = kodeRekeningPeran(master, e, peran);
  if (dipilih) return dipilih;
  const peta = petaEntitasRekening(master?.rekening_entitas);
  const norm = (x) => String(x || "").trim().toLowerCase();
  const ada = daftar.find(
    (r) => norm(r.label) === norm(labelTetap) && entitasDariRekening(peta, entList, r.kode) === e
  );
  if (ada) return ada.kode;
  const dasar = suggestKodeFn(labelTetap);
  const basis = e === ENTITAS_DEFAULT ? dasar : `${dasar}-${String(e).toLowerCase()}`;
  // Cek kode ke database langsung (bukan cuma master di memori): rekening yang sudah dihapus
  // bisa meninggalkan baris pemetaan rekening_entitas dengan kode yang sama -> bentrok unique.
  const terpakai = new Set(
    ((await sbAll("master_data?select=tipe,kode&tipe=in.(rekening,rekening_entitas)").catch(() => [])) || []).map((m) => m.kode)
  );
  daftar.forEach((r) => terpakai.add(r.kode));
  (master?.rekening_entitas || []).forEach((m) => terpakai.add(m.kode));
  let kode = basis;
  for (let n = 2; terpakai.has(kode); n++) kode = `${basis}-${n}`;
  await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening", kode, label: labelTetap }) });
  if (e !== ENTITAS_DEFAULT) {
    await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening_entitas", kode, label: e }) });
  }
  return kode;
}

// Gabungan semua perusahaan OPERASIONAL (tanpa rekening Holding): dipakai Dashboard
// akun Holding. Transfer antar-PT saling meniadakan karena kedua rekeningnya ikut;
// transfer ke Holding tetap dihitung sebagai uang keluar dari gabungan PT.
export function lingkupGabunganPT(transaksi, master) {
  const entitasList = master?.entitas || [];
  const kodeH = kodeHoldingPasti(entitasList, master?.entitas_set);
  if (entitasList.length < 2 || !kodeH) return { transaksi, master };
  const peta = petaEntitasRekening(master.rekening_entitas);
  const entDari = (kode) => entitasDariRekening(peta, entitasList, kode);
  const rekening = (master.rekening || []).filter((r) => entDari(r.kode) !== kodeH);
  rekening.__batasi = true;
  const sentuh = (t) => entDari(t.rekening) !== kodeH || (t.tipe === "transfer" && entDari(t.rekening_tujuan) !== kodeH);
  const trx = (transaksi || []).filter(sentuh);
  trx.__saring = sentuh;
  return { transaksi: trx, master: { ...master, rekening } };
}

// =========================================================
// PENGGAJIAN — pemanggil Edge Function gaji-admin & gaji-karyawan
// Tabel penggajian dikunci total dari anon key (RLS), jadi SEMUA baca/tulis
// lewat dua Edge Function ini (service_role di server). Jangan pakai sb()
// untuk tabel ini. Logika gaji (verifikasi password, token QR, transaksi
// Keuangan) semuanya di server; di sini hanya mengirim permintaan.
// =========================================================
async function panggilGaji(fn, body) {
  const res = await fetchBatas(
    `${SUPABASE_URL}/functions/v1/${fn}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_TULIS_MS,
    "POST"
  );
  const hasil = await res.json().catch(() => null);
  if (!res.ok || !hasil || hasil.error) {
    throw new Error(hasil?.error || friendlyDbError(null, res.status) || "Permintaan gaji gagal diproses.");
  }
  return hasil;
}

// ---- Sisi admin (gaji-admin) ----
// Bentuk request sesuai server: { username, password, aksi, data: {...} }.
// Server memverifikasi ulang username+password di setiap aksi (password tidak
// disimpan di browser). Role owner read-only: hanya boleh aksi baca.
const AKSI_GAJI_BACA = ["cek", "daftar"];
async function gajiAdmin(aksi, passwordAdmin, data = {}) {
  if (ROLE_READONLY.includes(roleSaatIni()) && !AKSI_GAJI_BACA.includes(aksi)) {
    throw new Error("Role Owner hanya bisa melihat data (read-only) — tidak bisa menyiapkan, menyerahkan, atau mengubah gaji.");
  }
  if (!passwordAdmin) throw new Error("Password admin wajib diisi.");
  let username = "";
  try {
    username = JSON.parse(sessionStorage.getItem(SESSION_KEY_LOKAL) || "{}").username || "";
  } catch {
    username = "";
  }
  return panggilGaji("gaji-admin", { aksi, username, password: passwordAdmin, data });
}

// Cek password admin saja (tanpa mengubah data) -> { ok, nama, role }
export const cekPasswordAdmin = (passwordAdmin) => gajiAdmin("cek", passwordAdmin);

// Daftar gaji (opsional filter: { periode: "2026-10", karyawan_id, status }).
// Butuh aksi "daftar" di gaji-admin (lihat petunjuk penambahan).
export const daftarGaji = (passwordAdmin, filter = {}) =>
  gajiAdmin("daftar", passwordAdmin, filter).then((r) => r.data || []);

// Simpan draft banyak karyawan sekaligus (maks 200 baris).
// baris: [{ karyawan_id (uuid), periode ("YYYY-MM"), nominal (angka), catatan?, rekening_sumber? }]
// Hasil: [{ index, ok, id?, tindakan?: "dibuat"|"diperbarui", error? }] — per baris,
// jadi sebagian bisa berhasil dan sebagian gagal.
// entitas (opsional): hanya dipakai Super Appa untuk memilih perusahaan; akun lain selalu
// memakai perusahaan akunnya sendiri di server.
export const simpanDraftGaji = (passwordAdmin, baris, entitas) =>
  gajiAdmin("simpan_draft", passwordAdmin, { baris, entitas }).then((r) => r.hasil || []);

// Ubah nominal/catatan/rekening satu draft = simpan draft untuk karyawan+periode
// yang sama (server memperbarui draft yang sudah ada). Gaji yang sudah
// diserahkan/diterima tidak bisa diubah; batalkan dulu bila perlu.
export async function ubahDraftGaji(passwordAdmin, baris, entitas) {
  const hasil = await simpanDraftGaji(passwordAdmin, [baris], entitas);
  if (!hasil[0]?.ok) throw new Error(hasil[0]?.error || "Gagal menyimpan draft gaji.");
  return hasil[0];
}

// "Serahkan gaji": server membuat token QR. berlaku_menit opsional
// (5 menit – 7 hari, default 1440 = 24 jam). Hasil: { id, token, kedaluwarsa }.
// Memanggil ulang pada gaji berstatus "diserahkan" membuat token BARU (QR lama mati).
export const serahkanGaji = (passwordAdmin, id, berlakuMenit) =>
  gajiAdmin("serahkan", passwordAdmin, berlakuMenit == null ? { id } : { id, berlaku_menit: berlakuMenit });

export const batalkanGaji = (passwordAdmin, id) => gajiAdmin("batal", passwordAdmin, { id });

// Gaji yang sudah diterima ikut menghapus transaksi Keuangan terkait (di server).
export const hapusGaji = (passwordAdmin, id) => gajiAdmin("hapus", passwordAdmin, { id });

// Cadangan bila karyawan tidak bisa memindai: admin menandai diterima
// (server mencatat transaksi Keuangan, kategori GAJI).
export const tandaiGajiDiterimaAdmin = (passwordAdmin, id) =>
  gajiAdmin("tandai_diterima", passwordAdmin, { id });

// ---- Sisi karyawan (gaji-karyawan) ----
// Bentuk request sesuai server: { id_karyawan, password, aksi, data }.
// Server memverifikasi ID + password karyawan di SETIAP aksi, jadi QR milik
// orang lain ditolak walau ikut terpindai. Password tidak disimpan di sini:
// halaman yang memanggil hanya memegangnya selama alur scan berlangsung.
async function gajiKaryawan(aksi, idKaryawan, password, data = {}) {
  const id = String(idKaryawan || "").trim();
  if (!id || !password) throw new Error("ID Karyawan dan password wajib diisi.");
  return panggilGaji("gaji-karyawan", { aksi, id_karyawan: id, password, data });
}

// Tampilkan rincian gaji dari QR (tidak mengubah apa pun).
// Hasil: { periode, nominal, catatan, kedaluwarsa }
export const lihatGajiDariQr = (idKaryawan, password, token) =>
  gajiKaryawan("lihat", idKaryawan, password, { token });

// Konfirmasi terima: server mencatat transaksi Keuangan + status "diterima".
// Hasil: { periode, nominal }. QR hanya bisa dipakai satu kali.
export const konfirmasiGajiDiterima = (idKaryawan, password, token) =>
  gajiKaryawan("konfirmasi", idKaryawan, password, { token });

// Riwayat gaji yang sudah DITERIMA karyawan itu sendiri (terbaru dulu).
// Butuh aksi "riwayat" di gaji-karyawan.
// Tiap baris: { id, periode, nominal, catatan, diterima_pada, cara_diterima }
export const riwayatGajiKaryawan = (idKaryawan, password) =>
  gajiKaryawan("riwayat", idKaryawan, password).then((r) => r.data || []);

// Label periode gaji yang enak dibaca (dipakai halaman karyawan):
//   "2026-10" -> "Oktober 2026" | "2026-10-10" -> "10 Okt 2026"
//   "2026-10-01_2026-10-15" -> "1 Okt 2026 – 15 Okt 2026"
export function labelPeriodeGaji(p) {
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const tgl = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const pendek = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${Number(d)} ${BULAN[Number(m) - 1].slice(0, 3)} ${y}`;
  };
  const v = String(p || "");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    const [y, m] = v.split("-");
    return `${BULAN[Number(m) - 1]} ${y}`;
  }
  if (tgl.test(v)) return pendek(v);
  const r = v.split("_");
  if (r.length === 2 && tgl.test(r[0]) && tgl.test(r[1])) return `${pendek(r[0])} – ${pendek(r[1])}`;
  return v || "—";
}