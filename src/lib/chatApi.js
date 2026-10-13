// Klien untuk Edge Function "chat" (supabase/functions/chat). Identitas dibuktikan
// lewat token bertanda tangan yang disimpan di sesi saat login (lihat lib/auth.js) —
// bukan lewat kunci anon, jadi chat tidak bisa dibaca oleh user lain.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api";
import { getSession } from "./auth";
import { kompresFotoProduk } from "./api";

export const HARI_SIMPAN_CHAT = 3;
export const MAKS_FOTO_BYTE = 700 * 1024;

async function kirimMentah(aksi, body = {}) {
  const s = getSession();
  if (!s?.token) {
    const e = new Error("Fitur chat butuh login ulang. Silakan keluar lalu masuk lagi.");
    e.sesi = true;
    throw e;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ aksi, token: s.token, ...body }),
  });
  if (res.status === 401) {
    const e = new Error("Sesi chat habis. Silakan keluar lalu masuk lagi.");
    e.sesi = true;
    throw e;
  }
  return res;
}

async function panggil(aksi, body) {
  const res = await kirimMentah(aksi, body);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

export const chatKontak = () => panggil("kontak");
export const chatRiwayat = (lawan, sejak = 0) => panggil("riwayat", { lawan, sejak });
export const chatBelumDibaca = async () => (await panggil("belum_dibaca")).total || 0;
export const chatPengawasDaftar = () => panggil("pengawas_daftar");
export const chatPengawasRiwayat = (a, b, sejak = 0) => panggil("pengawas_riwayat", { a, b, sejak });

// foto: File gambar (opsional). Dikecilkan dulu ke maks 1024px JPEG supaya ringan.
export async function chatKirim(ke, isi, fotoFile) {
  let foto = null;
  if (fotoFile) {
    const kecil = await kompresFotoProduk(fotoFile, { maxDim: 1024, quality: 0.7 });
    if (kecil.size > MAKS_FOTO_BYTE) throw new Error("Foto terlalu besar, coba foto lain.");
    if (kecil.type !== "image/jpeg") throw new Error("Foto harus berformat JPG/PNG/HEIC biasa dari kamera atau galeri.");
    foto = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("Gagal membaca foto"));
      r.readAsDataURL(kecil);
    });
  }
  return panggil("kirim", { ke, isi, foto });
}

// Foto diambil lewat fungsi (bukan URL publik) lalu dijadikan blob lokal. Di-cache per id pesan.
const cacheFoto = new Map();
export async function chatAmbilFoto(id) {
  if (cacheFoto.has(id)) return cacheFoto.get(id);
  const res = await kirimMentah("foto", { id });
  if (!res.ok) throw new Error("Foto sudah dihapus");
  const url = URL.createObjectURL(await res.blob());
  cacheFoto.set(id, url);
  return url;
}
