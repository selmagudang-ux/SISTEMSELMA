import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";
import { getSession } from "./auth";

// =========================================================
// NOTIFIKASI PUSH (Web Push) — versi HP /m
// Alur: HP berlangganan lewat PushManager (kunci publik VAPID) -> langganan disimpan di tabel
// push_subscriptions lewat Edge Function push-subscribe -> Edge Function push-kirim mengirim notifikasi ->
// public/sw.js menampilkannya, dan ketukan notifikasi membuka halaman tujuan.
// Kunci publik VAPID: variabel VITE_VAPID_PUBLIC_KEY (lihat PUSH_SETUP.md).
// =========================================================
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const PREF_KEY = "selma_push_pref"; // "1" = pengguna memang menyalakan notifikasi di HP ini

function kunciKeBytes(base64Url) {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const b64 = (base64Url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function dukungPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iPhone/iPad: Web Push hanya jalan kalau SISTEMSELMA sudah ditambahkan ke Layar Utama (iOS 16.4+).
export function perluTambahKeLayarUtama() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone;
}

async function swSiap() {
  const siap = navigator.serviceWorker.ready;
  const batas = new Promise((_, tolak) => setTimeout(() => tolak(new Error("timeout")), 6000));
  try {
    return await Promise.race([siap, batas]);
  } catch {
    throw new Error("Service worker belum aktif. Notifikasi hanya jalan di versi yang sudah di-deploy (bukan mode dev).");
  }
}

async function panggilServer(aksi, subscription) {
  const jwt = getSession()?.jwtUser;
  if (aksi === "simpan" && !jwt) throw new Error("Sesi tidak punya token. Keluar lalu login ulang.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push-subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(jwt ? { "x-selma-jwt": jwt } : {}),
    },
    body: JSON.stringify({ aksi, subscription, userAgent: navigator.userAgent.slice(0, 200) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Gagal menghubungi server notifikasi");
}

// { didukung, izin: "default"|"granted"|"denied", aktif }
export async function statusPush() {
  if (!dukungPush()) return { didukung: false, izin: "denied", aktif: false };
  let aktif = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    aktif = !!(reg && (await reg.pushManager.getSubscription()));
  } catch {
    /* abaikan */
  }
  return { didukung: true, izin: Notification.permission, aktif: aktif && localStorage.getItem(PREF_KEY) === "1" };
}

export async function aktifkanPush() {
  if (!dukungPush()) throw new Error("Browser ini belum mendukung notifikasi push.");
  if (!VAPID_PUBLIC) throw new Error("Kunci VAPID belum dipasang (VITE_VAPID_PUBLIC_KEY).");
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.");
  const reg = await swSiap();
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeBytes(VAPID_PUBLIC) }));
  await panggilServer("simpan", sub.toJSON());
  localStorage.setItem(PREF_KEY, "1");
}

// Dimatikan sendiri oleh pengguna: hapus di server DAN berhenti berlangganan di HP.
export async function matikanPush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  localStorage.removeItem(PREF_KEY);
  if (sub) {
    try {
      await panggilServer("hapus", { endpoint: sub.endpoint });
    } catch {
      /* tetap lanjut berhenti berlangganan di HP */
    }
    await sub.unsubscribe();
  }
}

// Dipanggil saat KELUAR: HP berhenti menerima notifikasi akun ini (hapus di server saja). Langganan di
// browser & pilihan pengguna dibiarkan, jadi login berikutnya otomatis menyala lagi (lihat sinkronkanPush).
export async function lepasPushServer() {
  try {
    if (!dukungPush() || localStorage.getItem(PREF_KEY) !== "1") return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await Promise.race([panggilServer("hapus", { endpoint: sub.endpoint }), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* abaikan */
  }
}

// Setelah login: kalau pengguna sebelumnya menyalakan notifikasi di HP ini, daftarkan lagi ke akun yang login.
export async function sinkronkanPush() {
  try {
    if (!dukungPush() || localStorage.getItem(PREF_KEY) !== "1" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await panggilServer("simpan", sub.toJSON());
  } catch {
    /* abaikan */
  }
}
