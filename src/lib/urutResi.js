// =========================================================
// URUT RESI — baca PDF resi (Shopee / TikTok Shop / Tokopedia; J&T, GTL, SPX),
// kelompokkan per produk, lalu susun ulang halamannya supaya resi dengan produk
// yang sama berdekatan (memudahkan packing). Semua diproses di browser.
// Dipakai pages/UrutResi.jsx. Logika baca-PDF dipindah apa adanya dari
// "mengurutkan_resi_tt.html" (1 halaman = 1 resi; resi >1 halaman digabung
// lewat Order ID / nomor resi yang sama).
// =========================================================

// Urutan kategori produk (kata pertama nama produk). Kategori lain → urut setelahnya.
export const KATEGORI_URUT = ["Cincin", "Gelang", "Anting", "Liontin", "Kalung"];

export const MODE_URUT = [
  { key: "produk", label: "Per produk (kategori, lalu kode produk)" },
  { key: "kurir", label: "Per kurir, lalu per produk" },
  { key: "rak", label: "Per kode rak gudang" },
];

let _libCache = null;
async function muatPdfJs() {
  if (_libCache) return _libCache;
  const [lib, worker] = await Promise.all([
    import("pdfjs-dist/build/pdf"),
    import("pdfjs-dist/build/pdf.worker.min.js?url"),
  ]);
  const pdfjsLib = lib.getDocument ? lib : lib.default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
  _libCache = pdfjsLib;
  return pdfjsLib;
}

// Baca satu PDF → daftar resi (tiap resi bisa punya >1 halaman).
export async function bacaPdfResi(arrayBuffer) {
  const pdfjsLib = await muatPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const it = tc.items
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
      .filter((i) => i.s.trim());
    const resi = ((it.find((i) => /^(SPXID|JY|GTL)\w+$/.test(i.s.trim())) || { s: "?" }).s).trim();
    const cur = resi.indexOf("SPXID") === 0 ? "SPX" : resi.indexOf("JY") === 0 ? "J&T" : resi.indexOf("GTL") === 0 ? "GTL" : "Lain";
    const hd = it.find((i) => i.s.trim() === "Nama Produk");
    const ps = it.find((i) => /^Pesan/.test(i.s.trim()));
    let rows = [];
    const th = it.find((i) => i.s.trim() === "Product Name");
    let tt = false;
    const gabung = (a, sep) =>
      a.sort((m, n) => n.y - m.y || m.x - n.x).map((i) => i.s.trim()).join(sep);

    if (!hd && th) {
      // Format TikTok Shop
      tt = true;
      const qt = it.find((i) => /^Qty Total/.test(i.s.trim()));
      const bd = it.filter((i) => i.y < th.y - 2 && (!qt || i.y > qt.y + 3) && i.x < 290);
      const an = bd
        .filter((i) => i.x > 255 && /^\d+$/.test(i.s.trim()))
        .sort((a, b) => b.y - a.y);
      an.forEach(() => rows.push({ n: [], k: [], q: [] }));
      bd.forEach((i) => {
        let r = -1;
        for (let j = 0; j < an.length; j++) if (an[j].y + 3 >= i.y) r = j;
        if (r < 0) return;
        const c = i.x < 125 ? "n" : i.x < 170 ? "k" : i.x < 255 ? "s" : "q";
        if (c !== "s") rows[r][c].push(i);
      });
      rows = rows.map((r) => ({
        name: gabung(r.n, " "), sku: gabung(r.k, " "), v: "", qty: parseInt(gabung(r.q, "")) || 1,
      }));
    }
    if (hd) {
      // Format Shopee / Tokopedia
      const body = it.filter((i) => i.x > 5 && i.x < 290 && i.y < hd.y - 2 && (!ps || i.y > ps.y + 3));
      const st = body.filter((i) => i.x < 20 && /^\d+$/.test(i.s.trim())).sort((a, b) => b.y - a.y);
      st.forEach(() => rows.push({ n: [], k: [], v: [], q: [] }));
      body.forEach((i) => {
        if (i.x < 20) return;
        let r = -1;
        for (let j = 0; j < st.length; j++) if (st[j].y + 3 >= i.y) r = j;
        if (r < 0) return;
        const c = i.x < 158 ? "n" : i.x < 210 ? "k" : i.x < 250 ? "v" : "q";
        rows[r][c].push(i);
      });
      rows = rows.map((r) => ({
        name: gabung(r.n, " "), sku: gabung(r.k, ""), v: gabung(r.v, " ").replace(/-\s+/g, "-"),
        qty: parseInt(gabung(r.q, "")) || 1,
      }));
    }

    // Halaman lanjutan: Order ID sama = satu resi; kalau salah satu tak punya
    // Order ID, pakai nomor resi (halaman tanpa nomor resi dianggap lanjutan).
    const pv = out[out.length - 1];
    const alltxt = it.map((i) => i.s.trim()).join(" ");
    const om = alltxt.match(/(?:No\.?\s*Pesanan|Order\s*ID|Order\s*No\.?)\s*:?\s*([A-Z0-9]{8,})/i);
    const oid = om ? om[1].toUpperCase() : "";
    let cont = false;
    if (pv) {
      if (oid && pv.oid) cont = oid === pv.oid;
      else cont = resi === pv.resi || resi === "?";
    }
    if (cont) {
      pv.pages.push(p - 1);
      pv.rows = pv.rows.concat(rows);
      pv.tt = pv.tt || tt;
      if (!pv.oid) pv.oid = oid;
      if (pv.resi === "?" && resi !== "?") { pv.resi = resi; pv.cur = cur; }
    } else {
      out.push({ page: p - 1, pages: [p - 1], resi, oid, cur, tt, rows });
    }
  }
  return out.map(perkaya);
}

// Hitung kategori, kode produk, qty & kode rak per resi.
function perkaya(l) {
  const codes = {};
  let cat = "Lainnya", q = 0, rack = "~";
  l.rows.forEach((r, i) => {
    const m = r.name.match(/\b([A-Z]{3,}\d+)\s*$/);
    const sk = l.tt ? r.sku.split(",") : null;
    const code = l.tt ? sk[0].trim() : (m ? m[1] : r.name.split(" ").slice(1, 4).join(" "));
    r.var = l.tt ? (sk[1] || "").trim() : "";
    r.key = code + (r.var ? " uk " + r.var : "");
    r.code = code;
    codes[code] = 1;
    q += r.qty;
    if (i === 0) {
      const w = l.tt ? code.split("-")[0] : r.name.split(" ")[0];
      cat = KATEGORI_URUT.indexOf(w) >= 0 ? w : (w || "Lainnya");
    }
    // Kode rak di kolom variasi, mis. "A1B-12" → kunci urut "A1B12"
    const rm = r.v.match(/([A-Z]\d[A-Z])-(\d+)([A-Z]?)/);
    if (rm) {
      const k = rm[1] + ("0" + rm[2]).slice(-2) + rm[3];
      if (rack === "~" || k < rack) rack = k;
    }
  });
  const cl = Object.keys(codes);
  l.mixed = cl.length > 1;
  l.cat = l.mixed ? "Campur" : cat;
  l.code = l.mixed ? "" : (cl[0] || "?");
  l.qty = q;
  l.rack = rack;
  l.var = (l.rows[0] || {}).var || "";
  return l;
}

const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

export function urutkanResi(labels, mode) {
  const ci = (c) => { const i = KATEGORI_URUT.indexOf(c); return i < 0 ? 50 : i; };
  return labels.slice().sort((a, b) => {
    if (mode === "rak") return nat(a.rack, b.rack) || a.src - b.src || a.page - b.page;
    const k = mode === "kurir" ? nat(a.cur, b.cur) : 0;
    return (
      k || (a.tt ? 1 : 0) - (b.tt ? 1 : 0) || (a.mixed ? 1 : 0) - (b.mixed ? 1 : 0) ||
      ci(a.cat) - ci(b.cat) || nat(a.code, b.code) || nat(a.var, b.var) ||
      nat(a.rack, b.rack) || a.src - b.src || a.page - b.page
    );
  });
}

// Total pcs per produk+ukuran untuk "Ringkasan packing".
export function ringkasPacking(labels) {
  const tot = {};
  labels.forEach((l) => l.rows.forEach((r) => { tot[r.key] = (tot[r.key] || 0) + r.qty; }));
  return Object.keys(tot).sort().map((k) => ({ key: k, qty: tot[k] }));
}

// Susun PDF baru dari halaman-halaman asli menurut urutan terpilih.
export async function buatPdfTerurut(files, urut) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const docs = {};
  for (const l of urut) {
    if (!docs[l.src]) docs[l.src] = await PDFDocument.load(files[l.src].buf);
    const pg = await out.copyPages(docs[l.src], l.pages);
    pg.forEach((p) => out.addPage(p));
  }
  return out.save();
}
