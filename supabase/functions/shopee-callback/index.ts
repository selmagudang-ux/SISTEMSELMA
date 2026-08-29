// Dipanggil terjadwal (Supabase Cron / pg_cron, misal tiap 3 jam)
// atau manual: POST https://<project>.supabase.co/functions/v1/shopee-refresh-token
// Cek semua toko dengan access_token yang mau expired, lalu refresh.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SHOPEE_HOST, PARTNER_ID, sign, nowSeconds } from "../_shared/shopee.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  // Refresh toko yang access_token-nya kedaluwarsa dalam 30 menit ke depan
  const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data: shops, error: fetchErr } = await supabase
    .from("shopee_shops")
    .select("shop_id, refresh_token, refresh_token_expire_at")
    .eq("status", "aktif")
    .lte("access_token_expire_at", soon);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr }), { status: 500 });
  }

  const results = [];

  for (const shop of shops ?? []) {
    if (new Date(shop.refresh_token_expire_at) < new Date()) {
      // refresh_token sudah/hampir expired (30 hari) → wajib re-authorize manual
      await supabase
        .from("shopee_shops")
        .update({ status: "terputus" })
        .eq("shop_id", shop.shop_id);
      results.push({ shop_id: shop.shop_id, status: "perlu_authorize_ulang" });
      continue;
    }

    const path = "/api/v2/auth/access_token/get";
    const timestamp = nowSeconds();
    const signature = await sign(path, timestamp);

    const resp = await fetch(
      `${SHOPEE_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${signature}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: shop.refresh_token,
          shop_id: shop.shop_id,
          partner_id: PARTNER_ID,
        }),
      }
    );
    const data = await resp.json();

    if (!resp.ok || data.error) {
      results.push({ shop_id: shop.shop_id, status: "gagal", detail: data });
      continue;
    }

    const now = Date.now();
    await supabase
      .from("shopee_shops")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        access_token_expire_at: new Date(now + data.expire_in * 1000).toISOString(),
        refresh_token_expire_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("shop_id", shop.shop_id);

    results.push({ shop_id: shop.shop_id, status: "diperbarui" });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
});
