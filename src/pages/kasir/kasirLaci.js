// =========================================================
// KASIR — BUKA LACI (cash drawer) lewat printer thermal
// Browser tidak bisa mengirim perintah ESC/POS mentah ke printer biasa. Jalur yang
// andal: cetak slip kecil lewat driver printer, lalu driver membuka laci (RJ11) —
// setting "Cash Drawer: Open before/after printing" di Printer Preferences driver.
// Agar tanpa dialog Print, jalankan Chrome/Edge dengan flag --kiosk-printing.
// Di aplikasi desktop "Kasir Selma" (window.selmaDesktop ada) laci dibuka langsung tanpa cetak;
// slip cetak hanya jadi cadangan di browser biasa.
// =========================================================
import { fmtRp } from "../../lib/api";
import { tglJamId } from "./kasirStruk";

const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function cetakSlipLaci(baris) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: 80mm auto; margin: 0; }
      body { margin: 0; padding: 2mm 4mm 6mm; width: 72mm; font: 12px/1.4 monospace; color: #000; }
      h2 { text-align: center; font-size: 14px; margin: 2mm 0; }
      .c { text-align: center; } hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
    </style></head><body>${baris.map((b) => b).join("")}</body></html>`);
    doc.close();
    const selesai = () => {
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };
    iframe.contentWindow.onafterprint = selesai;
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        /* abaikan: laci gagal terbuka tidak boleh menghalangi buka kasir */
      }
      setTimeout(selesai, 3000);
    }, 150);
  });
}

const desktop = () => (typeof window !== "undefined" && window.selmaDesktop?.bukaLaci ? window.selmaDesktop : null);
export const adalahAppDesktop = () => !!desktop();

// Buka laci langsung (hanya di aplikasi desktop). Mengembalikan { ok, error }.
export async function bukaLaciLangsung() {
  const d = desktop();
  if (!d) return { ok: false, error: "Bukan aplikasi desktop" };
  try {
    return await d.bukaLaci();
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Saat Buka Kasir. Tidak boleh melempar error ke pemanggil.
export async function bukaLaciSaatBukaKasir({ kasir, kasAwal }) {
  if (desktop()) {
    const r = await bukaLaciLangsung();
    if (!r.ok) window.alert(`Kasir sudah dibuka, tapi laci gagal dibuka: ${r.error}`);
    return;
  }
  return cetakSlipLaci([
    "<h2>BUKA KASIR</h2><hr>",
    `<div>Waktu : ${esc(tglJamId(new Date().toISOString()))}</div>`,
    kasir ? `<div>Kasir : ${esc(kasir)}</div>` : "",
    `<div>Kas awal : ${esc(fmtRp(Number(kasAwal) || 0))}</div><hr>`,
    '<div class="c">Laci kas dibuka</div>',
  ]).catch(() => {});
}

// Pembayaran tunai: di aplikasi desktop buka laci langsung; di browser biasa
// laci terbuka lewat cetak struk (setting driver), jadi tidak perlu apa-apa.
export async function bukaLaciKalauDesktop() {
  if (desktop()) await bukaLaciLangsung();
}

// Tombol manual "Buka Laci" (tanpa transaksi).
export async function bukaLaciManual({ kasir, alasan }) {
  if (desktop()) {
    const r = await bukaLaciLangsung();
    if (!r.ok) window.alert(`Laci gagal dibuka: ${r.error}`);
    return;
  }
  return cetakSlipLaci([
    "<h2>BUKA LACI</h2><hr>",
    `<div>Waktu : ${esc(tglJamId(new Date().toISOString()))}</div>`,
    kasir ? `<div>Kasir : ${esc(kasir)}</div>` : "",
    alasan ? `<div>Ket : ${esc(alasan)}</div>` : "",
  ]).catch(() => {});
}
