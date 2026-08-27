// Edge Function: verify-login-karyawan
// Sama seperti verify-login, tapi untuk tabel `karyawan` (login absensi).
// Jalan di server Supabase (bukan di browser). Pakai SERVICE_ROLE_KEY yang
// TIDAK PERNAH dikirim ke frontend — jadi tabel karyawan bisa dikunci total
// dari anon key, dan password_hash tidak pernah keluar dari server ini.
//
// Deploy: supabase functions deploy verify-login-karyawan
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { id_karyawan, password } = await req.json();
    if (!id_karyawan || !password) {
      return new Response(JSON.stringify({ error: "ID dan Password wajib diisi." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // service_role bypass RLS — inilah SATU-SATUNYA tempat yang boleh baca
    // password_hash langsung dari tabel karyawan.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: user, error } = await supabase
      .from("karyawan")
      .select("id, id_karyawan, nama, password_hash, aktif")
      .eq("id_karyawan", String(id_karyawan).trim())
      .maybeSingle();

    if (error || !user) {
      return new Response(JSON.stringify({ error: "ID Karyawan tidak ditemukan." }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!user.aktif) {
      return new Response(
        JSON.stringify({ error: "Akun ini sudah dinonaktifkan. Hubungi HRD." }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
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
      JSON.stringify({ id: user.id, id_karyawan: user.id_karyawan, nama: user.nama }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Terjadi kesalahan server" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
