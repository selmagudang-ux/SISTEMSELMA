import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";

const SESSION_KEY = "selma_session";

// Sengaja pakai sessionStorage (bukan localStorage): sesi otomatis hilang saat
// tab/browser ditutup, jadi user harus login lagi. Masih tetap login selama
// tab dibiarkan terbuka / di-refresh.

// Hash SHA-256 (hex) — masih dipakai di halaman Pengaturan buat bikin/ganti
// password (createUser, updateUserPassword, changeOwnPassword di bawah).
// KHUSUS login, verifikasi password TIDAK lagi dilakukan di sini — sudah
// dipindah ke Edge Function verify-login supaya password_hash tidak pernah
// terkirim ke browser (lihat supabase/functions/verify-login).
export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function login(username, password) {
  const uname = (username || "").trim();
  if (!uname || !password) throw new Error("Username dan password wajib diisi");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ username: uname, password }),
  });
  const user = await res.json().catch(() => null);
  if (!res.ok || !user) throw new Error(user?.error || "Gagal login");

  const session = {
    id: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role,
    loginAt: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ---- Kelola user (dipakai di halaman Pengaturan, khusus superadmin) ----

// Tabel app_users dikunci total dari anon key, jadi ambil daftar user lewat
// Edge Function list-users (service_role) — bukan sb() langsung (lihat
// supabase/functions/list-users).
export async function listUsers() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/list-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Gagal memuat daftar user");
  return data;
}

// Tabel app_users dikunci total dari anon key, jadi tambah user lewat Edge
// Function create-user (service_role) — bukan sb() langsung (lihat
// supabase/functions/create-user).
export async function createUser({ username, password, nama, role }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ username: (username || "").trim(), password, nama, role }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Gagal menambah user");
  return data;
}

// PENTING: dulu fungsi ini PATCH langsung ke app_users pakai anon key. Kalau
// RLS memblokir UPDATE untuk anon, PostgREST tidak melempar error — dia
// balas "sukses" padahal 0 baris ke-update (password_hash lama tidak
// berubah), jadi kelihatan berhasil di UI tapi login pakai password baru
// tetap gagal. Sekarang lewat Edge Function update-user-password
// (service_role) supaya beneran ke-update atau melempar error yang jelas.
export async function updateUserPassword(id, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/update-user-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ id, newPassword }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Gagal mengganti password");
  return data;
}

// Tabel app_users dikunci total dari anon key, jadi hapus user lewat Edge
// Function delete-user (service_role) — bukan sb() langsung (lihat
// supabase/functions/delete-user).
export async function deleteUser(id) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Gagal menghapus user");
  return data;
}

// ---- Ganti password sendiri (dipakai semua role lewat menu di Sidebar) ----
// Beda dengan updateUserPassword (khusus superadmin ubah password user lain
// tanpa perlu tahu password lama): fungsi ini WAJIB verifikasi password lama
// dulu sebelum boleh mengganti, supaya orang lain yang kebetulan lihat sesi
// masih terbuka tidak bisa asal ganti password akun orang.
export async function changeOwnPassword(userId, oldPassword, newPassword) {
  // Verifikasi password lama + simpan password baru dilakukan di Edge
  // Function change-password (service_role), password_hash tidak pernah
  // dibaca lewat anon key dari browser (lihat supabase/functions/change-password).
  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ userId, oldPassword, newPassword }),
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.ok) throw new Error(result?.error || "Gagal mengganti password");
}