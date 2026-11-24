import { sb } from "../../lib/api";
import { normSku, sbTulis } from "../../lib/marketplaceImport";
import { PLATFORM_TIKTOK } from "../../lib/tiktokImport";

// =========================================================
// Kode live di Barang TikTok  <->  daftar Kode Live TikTok (marketplace_sku_alias, platform "tiktok").
// Rincian Penjualan TikTok mencari SKU & HPP lewat daftar itu, jadi kode live yang diisi di Barang TikTok
// ikut dicatat di sana — tidak perlu mengetik dua kali.
// Aturan: TIDAK pernah menimpa pemetaan yang sudah ada dengan SKU lain (supaya penjualan lama tidak berubah diam-diam).
// Hasil: { status: "baru" | "sama" | "beda" | "lewat", skuLama? }
// =========================================================

export const rapikanKodeLive = (v) => normSku(v);

export async function sinkronAliasKodeLive(kodeLive, sku) {
  const kode = rapikanKodeLive(kodeLive);
  const skuBaru = String(sku || "").trim();
  if (!kode || !skuBaru) return { status: "lewat" };
  const ada = await sb(`marketplace_sku_alias?select=sku&platform=eq.${PLATFORM_TIKTOK}&referensi=eq.${encodeURIComponent(kode)}`);
  if (ada?.length) {
    return normSku(ada[0].sku) === normSku(skuBaru) ? { status: "sama" } : { status: "beda", skuLama: ada[0].sku };
  }
  await sbTulis("marketplace_sku_alias?on_conflict=entitas,platform,referensi", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify([{ platform: PLATFORM_TIKTOK, referensi: kode, sku: skuBaru }]),
  });
  return { status: "baru" };
}
