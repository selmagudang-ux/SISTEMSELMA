// GET https://<project>.supabase.co/functions/v1/shopee-callback?code=...&shop_id=...
// Ini adalah Redirect URL yang didaftarkan di App settings Shopee Open Platform.
// Menukar `code` menjadi access_token + refresh_token, lalu menyimpannya ke tabel shopee_shops.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SHOPEE_HOST, PARTNER_ID, sign, nowSeconds } from "../_shared/shopee.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service_role, bukan anon key
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shopId = Number(url.searchParams.get("shop_id"));

  if (!code || !shopId) {
    return new Response("Parameter code / shop_id tidak ditemukan", { status: 400 });
  }

  const path = "/api/v2/auth/token/get";
  const timestamp = nowSeconds();
  const signature = await sign(path, timestamp);

  const resp = await fetch(
    `${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${signature}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, shop_id: shopId, partner_id: PARTNER_ID }),
    }
  );
  const data = await resp.json();

  if (!resp.ok || data.error) {
    return new Response(JSON.stringify(data), { status: 400 });
  }

  const now = Date.now();
  const { error } = await supabase.from("shopee_shops").upsert(
    {
      shop_id: shopId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_expire_at: new Date(now + data.expire_in * 1000).toISOString(),
      refresh_token_expire_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "aktif",
    },
    { onConflict: "shop_id" }
  );

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500 });
  }

  return new Response(
    `Toko Shopee (shop_id: ${shopId}) berhasil terhubung. Anda bisa menutup tab ini.`,
    { headers: { "Content-Type": "text/plain" } }
  );
});
