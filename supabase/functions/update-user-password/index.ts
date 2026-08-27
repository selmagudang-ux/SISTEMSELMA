// Edge Function: update-user-password
// Dipakai menu Pengaturan (superadmin) untuk RESET password user lain,
// tanpa perlu tahu password lama. Tabel app_users dikunci total dari anon
// key (termasuk UPDATE), jadi penulisannya dipindah ke sini pakai
// SERVICE_ROLE_KEY.
//
// PENTING: kalau ini masih dijalankan lewat sb() langsung dari browser dan
// RLS memblokir UPDATE untuk anon, PostgREST TIDAK melempar error — dia
// balas "sukses" padahal 0 baris ke-update. Makanya harus lewat sini.
//
// Deploy: supabase functions deploy update-user-password

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
    const { id, newPassword } = await req.json();
    if (!id || !newPassword) {
      return new Response(JSON.stringify({ error: "Data tidak lengkap." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const password_hash = await sha256Hex(newPassword);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("app_users")
      .update({ password_hash })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: "Gagal mengganti password." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!data) {
      return new Response(JSON.stringify({ error: "User tidak ditemukan." }), {
        status: 404,
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