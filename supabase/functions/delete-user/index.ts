// Edge Function: delete-user
// Dipakai menu Pengaturan (superadmin) untuk hapus user. Tabel app_users
// dikunci total dari anon key (termasuk DELETE), jadi dipindah ke sini
// pakai SERVICE_ROLE_KEY.
//
// Deploy: supabase functions deploy delete-user

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "ID wajib diisi." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await supabase.from("app_users").delete().eq("id", id);

    if (error) {
      return new Response(JSON.stringify({ error: "Gagal menghapus user." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Terjadi kesalahan server" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});