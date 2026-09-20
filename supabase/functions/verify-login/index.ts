// Edge Function: verify-login
// Verifikasi login untuk akun admin/role SELMA (tabel `app_users`).
// Jalan di server Supabase (bukan di browser). Pakai SERVICE_ROLE_KEY yang
// TIDAK PERNAH dikirim ke frontend — jadi tabel app_users bisa dikunci total
// dari anon key, dan password_hash tidak pernah keluar dari server ini.
//
// Deploy: supabase functions deploy verify-login
// (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY otomatis tersedia sebagai env
// bawaan tiap Edge Function, tidak perlu di-set manual.)

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
  // WAJIB di paling atas: browser selalu kirim preflight OPTIONS dulu
  // sebelum POST sungguhan. Kalau OPTIONS tidak dibalas 200 OK duluan di
  // sini, browser akan blokir request POST-nya dengan error CORS
  // ("preflight ... does not have HTTP ok status"), walau fungsi/servernya
  // sendiri sebenarnya hidup normal.
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Username dan password wajib diisi" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // service_role bypass RLS — inilah SATU-SATUNYA tempat yang boleh baca
    // password_hash langsung dari tabel app_users.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, nama, role, password_hash")
      .eq("username", String(username).trim())
      .maybeSingle();

    if (error || !user) {
      // Pesan ini HARUS persis "Username tidak ditemukan" — lib/unifiedLogin.js
      // mencocokkan string ini untuk tahu kapan harus lanjut coba login
      // sebagai karyawan (tabel `karyawan`) alih-alih langsung gagal total.
      return new Response(JSON.stringify({ error: "Username tidak ditemukan" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const hash = await sha256Hex(password);
    if (hash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Password salah." }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Cuma balikin data yang aman ditaruh di sessionStorage browser.
    // password_hash TIDAK PERNAH ikut dikirim balik.
    return new Response(
      JSON.stringify({ id: user.id, username: user.username, nama: user.nama, role: user.role }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Terjadi kesalahan server" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
