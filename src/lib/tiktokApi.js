import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";
import { getSession } from "./auth";

// Pemanggil Edge Function "tiktok-auth". Aksi selain "tukar-kode" wajib membawa sesi
// login SELMA (header x-selma-jwt); server memeriksa tanda tangan & masa berlakunya.
// Token TikTok tidak pernah dikirim ke browser.
export async function panggilTiktok(aksi, data = {}, timeoutMs = 120000) {
  const jwt = getSession()?.jwtUser;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-auth`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(jwt ? { "x-selma-jwt": jwt } : {}),
    },
    body: JSON.stringify({ aksi, ...data }),
  });
  const hasil = await res.json().catch(() => null);
  if (!res.ok || !hasil || hasil.error) {
    throw new Error(hasil?.error || `Permintaan ke TikTok gagal (HTTP ${res.status}).`);
  }
  return hasil;
}

// Nama toko SELMA dan nama toko TikTok dicocokkan tanpa peduli huruf besar/kecil
// dan spasi berlebih (sama dengan aturan di edge function).
export const normNamaToko = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
