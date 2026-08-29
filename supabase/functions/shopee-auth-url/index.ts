// GET https://<project>.supabase.co/functions/v1/shopee-auth-url
// Menghasilkan URL otorisasi Shopee. Buka URL ini di browser,
// login sebagai seller, klik "Authorize" → Shopee akan redirect
// ke SHOPEE_REDIRECT_URL (function shopee-callback) dengan ?code=...&shop_id=...

import { SHOPEE_HOST, PARTNER_ID, REDIRECT_URL, sign, nowSeconds } from "../_shared/shopee.ts";

Deno.serve(async () => {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = nowSeconds();
  const signature = await sign(path, timestamp);

  const url =
    `${SHOPEE_HOST}${path}` +
    `?partner_id=${PARTNER_ID}` +
    `&timestamp=${timestamp}` +
    `&sign=${signature}` +
    `&redirect=${encodeURIComponent(REDIRECT_URL)}`;

  return new Response(JSON.stringify({ auth_url: url }), {
    headers: { "Content-Type": "application/json" },
  });
});
