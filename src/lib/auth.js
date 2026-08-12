import { sb } from "./api";

const SESSION_KEY = "selma_session";

// Sengaja pakai sessionStorage (bukan localStorage): sesi otomatis hilang saat
// tab/browser ditutup, jadi user harus login lagi. Masih tetap login selama
// tab dibiarkan terbuka / di-refresh.

// Hash SHA-256 (hex) — dipakai untuk cocokkan password dengan yang di Supabase
// (kolom app_users.password_hash dibuat dengan encode(digest(pw,'sha256'),'hex')).
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

  const rows = await sb(
    `app_users?username=eq.${encodeURIComponent(uname)}&select=id,username,password_hash,nama,role`
  );
  const user = (rows || [])[0];
  if (!user) throw new Error("Username tidak ditemukan");

  const hash = await sha256Hex(password);
  if (hash !== user.password_hash) throw new Error("Password salah");

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

export async function listUsers() {
  return sb("app_users?select=id,username,nama,role,created_at&order=created_at.desc");
}

export async function createUser({ username, password, nama, role }) {
  const password_hash = await sha256Hex(password);
  return sb("app_users", {
    method: "POST",
    body: JSON.stringify({ username: (username || "").trim(), password_hash, nama, role }),
  });
}

export async function updateUserPassword(id, newPassword) {
  const password_hash = await sha256Hex(newPassword);
  return sb(`app_users?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash }),
  });
}

export async function deleteUser(id) {
  return sb(`app_users?id=eq.${id}`, { method: "DELETE" });
}

// ---- Ganti password sendiri (dipakai semua role lewat menu di Sidebar) ----
// Beda dengan updateUserPassword (khusus superadmin ubah password user lain
// tanpa perlu tahu password lama): fungsi ini WAJIB verifikasi password lama
// dulu sebelum boleh mengganti, supaya orang lain yang kebetulan lihat sesi
// masih terbuka tidak bisa asal ganti password akun orang.
export async function changeOwnPassword(userId, oldPassword, newPassword) {
  const rows = await sb(`app_users?id=eq.${userId}&select=password_hash`);
  const user = (rows || [])[0];
  if (!user) throw new Error("User tidak ditemukan");

  const oldHash = await sha256Hex(oldPassword);
  if (oldHash !== user.password_hash) throw new Error("Password lama salah");

  const password_hash = await sha256Hex(newPassword);
  return sb(`app_users?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash }),
  });
}