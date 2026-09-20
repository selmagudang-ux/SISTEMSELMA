// Helper bersama: base URL Shopee + fungsi signature HMAC-SHA256
// Dipakai oleh semua Edge Function di folder functions/

export const SHOPEE_HOST =
  Deno.env.get("SHOPEE_ENV") === "production"
    ? "https://partner.shopeemobile.com"
    : "https://partner.test-stable.shopeemobile.com";

export const PARTNER_ID = Number(Deno.env.get("SHOPEE_PARTNER_ID"));
export const PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY")!;
export const REDIRECT_URL = Deno.env.get("SHOPEE_REDIRECT_URL")!; // https://<project>.supabase.co/functions/v1/shopee-callback

/**
 * Generate signature HMAC-SHA256 (hex) sesuai aturan Shopee Open Platform v2.
 *
 * - Public API (auth_partner, get_access_token, refresh_access_token):
 *     baseString = partner_id + path + timestamp
 * - Shop API (butuh access_token, misal item/order):
 *     baseString = partner_id + path + timestamp + access_token + shop_id
 */
export async function sign(
  path: string,
  timestamp: number,
  accessToken?: string,
  shopId?: number
): Promise<string> {
  let baseString = `${PARTNER_ID}${path}${timestamp}`;
  if (accessToken) baseString += accessToken;
  if (shopId) baseString += shopId;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PARTNER_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(baseString)
  );
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
