// =========================================================
// KONEKSI SUPABASE (REST / PostgREST — anon key)
// =========================================================
const SUPABASE_URL = "https://mctzwsfnidxvckadqlhq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdHp3c2ZuaWR4dmNrYWRxbGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNTAwNDQsImV4cCI6MjEwMTcyNjA0NH0.0RN1_Kbk4MS_FBR2b9ahZtKIzEaDNR0IzgoeSSdp8eQ";

export async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
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
  const hargaDasar = Number(hargaAsli) + Number(settings.dasar_tambahan);
  const hpp = hargaDasar * (settings.hpp_percent / 100);
  const grosir = round(hpp * (settings.grosir_percent / 100));
  const tengah = round(hpp * settings.tengah_multiplier);
  const ecer = round(tengah * settings.ecer_multiplier);
  return { hargaDasar, hpp, grosir, tengah, ecer };
}

export const fmtRp = (n) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

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
