// Bukti transfer gaji. Tabel penggajian dikunci dari anon key (hanya lewat Edge Function gaji-admin), jadi bukti
// disimpan di tabel sendiri `gaji_bukti` (gaji_id -> bukti_urls) lewat sb() biasa
// (dibuat oleh supabase/migrations/20261123_gaji_bukti.sql).
//
// Begitu gaji berstatus "diterima", Edge Function sudah mencatat transaksi pengeluarannya di Keuangan dan
// menyimpan id-nya di kolom penggajian.keuangan_transaksi_ids. Bukti ditempelkan juga ke baris-baris Keuangan itu
// (kolom bukti_urls / bukti_url, sama seperti bukti transaksi biasa) supaya terlihat di menu Keuangan.
import { sb } from "./api";
import { daftarBukti } from "./bukti";

const TABEL = "gaji_bukti";

// Semua id transaksi Keuangan milik sebuah gaji (satu per komponen: gaji pokok, premi, bonus).
export function idKeuanganGaji(g) {
  const dariArray = Array.isArray(g?.keuangan_transaksi_ids) ? g.keuangan_transaksi_ids : [];
  return [...new Set([...dariArray, g?.keuangan_transaksi_id].filter(Boolean).map(String))];
}

// { peta: Map gaji_id -> [url], belumSinkron: Set gaji_id }. Melempar error kalau tabel belum dibuat.
export async function muatBuktiGaji(idList = []) {
  const ids = [...new Set(idList.filter(Boolean).map(String))];
  const peta = new Map();
  const belumSinkron = new Set();
  for (let i = 0; i < ids.length; i += 40) {
    const potong = ids.slice(i, i + 40);
    const rows = await sb(`${TABEL}?select=gaji_id,bukti_urls,tersinkron_keuangan&gaji_id=in.(${potong.map(encodeURIComponent).join(",")})`);
    (rows || []).forEach((r) => {
      const urls = Array.isArray(r.bukti_urls) ? r.bukti_urls.filter(Boolean) : [];
      peta.set(String(r.gaji_id), urls);
      if (urls.length && !r.tersinkron_keuangan) belumSinkron.add(String(r.gaji_id));
    });
  }
  return { peta, belumSinkron };
}

// Simpan (timpa) daftar bukti sebuah gaji. Daftar kosong = semua bukti dilepas.
export async function simpanBuktiGaji(gajiId, urls = [], { tersinkron = false } = {}) {
  await sb(`${TABEL}?on_conflict=gaji_id`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({
      gaji_id: String(gajiId),
      bukti_urls: urls.filter(Boolean),
      tersinkron_keuangan: !!tersinkron,
      diperbarui_pada: new Date().toISOString(),
    }),
  });
}

// Bersihkan catatan bukti setelah gajinya dihapus (file di storage dibiarkan).
export async function hapusBuktiGaji(gajiId) {
  await sb(`${TABEL}?gaji_id=eq.${encodeURIComponent(String(gajiId))}`, { method: "DELETE" });
}

function samaIsi(a, b) {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

// Tempel (tambah) / lepas bukti di baris-baris Keuangan milik satu gaji. Bukti lain yang sudah ada di transaksi
// itu (mis. ditambah manual dari menu Keuangan) TIDAK disentuh. Melempar error kalau gagal menulis.
export async function sinkronBuktiKeKeuangan(g, { tambah = [], lepas = [] } = {}) {
  const ids = idKeuanganGaji(g);
  if (!ids.length || (!tambah.length && !lepas.length)) return 0;
  const rows = (await sb(`keuangan_transaksi?select=id,bukti_url,bukti_urls&id=in.(${ids.map(encodeURIComponent).join(",")})`)) || [];
  let n = 0;
  for (const r of rows) {
    const ada = daftarBukti(r);
    const baru = [...ada.filter((u) => !lepas.includes(u)), ...tambah.filter((u) => !ada.includes(u))];
    if (samaIsi(ada, baru)) continue;
    await sb(`keuangan_transaksi?id=eq.${encodeURIComponent(String(r.id))}`, {
      method: "PATCH",
      body: JSON.stringify({ bukti_urls: baru, bukti_url: baru[0] || null }),
    });
    n++;
  }
  return n;
}

// Dipanggil saat halaman Penggajian dimuat: gaji yang sudah "diterima" tetapi buktinya belum ditempelkan ke Keuangan
// (bukti diunggah saat masih "diserahkan", gaji diterima lewat scan QR, atau penempelan sebelumnya gagal).
// Sekali berhasil, ditandai tersinkron_keuangan = true supaya tidak diulang. Kegagalan per gaji diabaikan (dicoba lagi
// pada pemuatan berikutnya).
export async function sinkronBuktiTertunda(daftarGajiRows = [], peta = new Map(), belumSinkron = new Set()) {
  const target = daftarGajiRows.filter(
    (g) => g.status === "diterima" && belumSinkron.has(String(g.id)) && (peta.get(String(g.id)) || []).length && idKeuanganGaji(g).length
  );
  let n = 0;
  for (const g of target) {
    try {
      await sinkronBuktiKeKeuangan(g, { tambah: peta.get(String(g.id)) || [] });
      await simpanBuktiGaji(g.id, peta.get(String(g.id)) || [], { tersinkron: true });
      n++;
    } catch {
      /* dicoba lagi nanti */
    }
  }
  return n;
}
