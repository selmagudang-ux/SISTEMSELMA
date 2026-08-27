// Edge Function: create-user
// Dipakai menu Pengaturan (superadmin) untuk menambah user baru.
// Tabel app_users dikunci total dari anon key (termasuk INSERT), jadi
// penulisannya dipindah ke sini pakai SERVICE_ROLE_KEY.
//
// Deploy: supabase functions deploy create-user

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(text: string) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { username, password, nama, role } = await req.json();
    if (!username || !password || !nama || !role) {
      return new Response(JSON.stringify({ error: "Semua field wajib diisi." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const password_hash = await sha256Hex(password);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("app_users")
      .insert({ username: String(username).trim(), password_hash, nama, role })
      .select("id, username, nama, role, created_at")
      .maybeSingle();

    if (error) {
      // 23505 = unique violation (username sudah dipakai)
      const msg =
        error.code === "23505"
          ? "Username sudah dipakai."
          : "Gagal menambah user.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
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