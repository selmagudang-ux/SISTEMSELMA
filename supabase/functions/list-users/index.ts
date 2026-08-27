// Edge Function: list-users
// Dipakai menu Pengaturan (UserManager) untuk menampilkan daftar user.
// Tabel app_users dikunci total dari anon key (termasuk SELECT kolom biasa
// seperti username/nama/role) — jadi pengambilan datanya dipindah ke sini,
// pakai SERVICE_ROLE_KEY di server. Endpoint ini SENGAJA tidak pernah
// mengembalikan kolom password_hash.
//
// Deploy: supabase functions deploy list-users

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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, nama, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: "Gagal memuat daftar user" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data ?? []), {
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
