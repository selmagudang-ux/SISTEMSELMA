// Edge Function: change-password
// Dipakai untuk "Ganti password sendiri" (menu di Sidebar, semua role) pada
// tabel app_users. Verifikasi password LAMA dan penyimpanan password BARU
// dua-duanya dilakukan di sini pakai SERVICE_ROLE_KEY, supaya password_hash
// tidak pernah perlu dibaca lewat anon key dari browser.
//
// Deploy: supabase functions deploy change-password

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
    const { userId, oldPassword, newPassword } = await req.json();
    if (!userId || !oldPassword || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Data tidak lengkap." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: user, error: fetchErr } = await supabase
      .from("app_users")
      .select("id, password_hash")
      .eq("id", userId)
      .maybeSingle();

    if (fetchErr || !user) {
      return new Response(JSON.stringify({ error: "User tidak ditemukan" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const oldHash = await sha256Hex(oldPassword);
    if (oldHash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Password lama salah" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const newHash = await sha256Hex(newPassword);
    const { error: updateErr } = await supabase
      .from("app_users")
      .update({ password_hash: newHash })
      .eq("id", userId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Gagal menyimpan password baru" }), {
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
