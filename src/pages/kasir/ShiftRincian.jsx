import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, Loader2 } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { SKEMA, HARI_WIB } from "./kasirApi";
import { tglJamId, keAsciiBaris } from "./kasirStruk";

// =========================================================
// RINCIAN PENJUALAN SHIFT — dipakai di layar Tutup Kasir.
//  - olahRincian()      : ubah data mentah (transaksi, item, pembayaran) jadi ringkasan + daftar
//  - RincianShiftPanel  : bagian yang bisa dibuka/tutup di layar Tutup Kasir
//  - cetakRincianShift(): cetak ke printer struk 80mm — tampilan & jalur cetaknya SAMA dengan struk penjualan
//                         (StrukKasir.jsx): kop nama + alamat, garis putus-putus, kolom kiri/kanan;
//                         aplikasi desktop: ESC/POS teks -> HTML; browser: dialog cetak dengan tinggi kertas diukur.
// Transaksi void tidak dihitung; retur mengurangi nilai penjualan.
// =========================================================

const T = SKEMA.trx;
const I = SKEMA.item;
const B = SKEMA.bayar;
const num = (v) => Number(v) || 0;
const status = (r) => r[T.status] || "selesai";
const esc = (t) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const jam = (v) => new Date(v).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: HARI_WIB });
const tglPanjang = (iso) => new Date(`${iso}T12:00:00+07:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: HARI_WIB });

export function olahRincian({ transaksi, items, pembayaran }) {
  const metodePerTrx = new Map();
  for (const p of pembayaran) {
    const id = p[B.trxId];
    const m = metodePerTrx.get(id) || [];
    m.push({ metode: p[B.metode], jumlah: num(p[B.jumlah]) });
    metodePerTrx.set(id, m);
  }

  // Jenis penjualan per transaksi: "grosir" (mode Master Barang) / "ecer" (mode Barang Toko) / null (tidak diketahui).
  // Dipakai kolom `sumber` di transaksi kalau ada; kalau tidak, dari asal barangnya (it.asal, diisi kasirApi).
  const asalPerTrx = new Map();
  for (const it of items) if (it.asal && !asalPerTrx.has(it[I.trxId])) asalPerTrx.set(it[I.trxId], it.asal);
  const jenisDari = (r) => {
    const sb = String(r.sumber || "").toLowerCase();
    const a = sb === "master" || sb === "toko" ? sb : asalPerTrx.get(r[T.id]);
    return a === "master" ? "grosir" : a === "toko" ? "ecer" : null;
  };

  const daftar = transaksi.map((r) => {
    const id = r[T.id];
    const st = status(r);
    const bayar = metodePerTrx.get(id) || [];
    return {
      id,
      jenis: jenisDari(r),
      nomor: r[T.nomor],
      waktu: r[T.waktu],
      status: st,
      total: num(r[T.total]),
      retur: num(r[T.totalRetur]),
      bersih: st === "void" ? 0 : num(r[T.total]) - num(r[T.totalRetur]),
      metode: [...new Set(bayar.map((b) => b.metode))].join(" + "),
    };
  });

  const adaVoid = new Set(transaksi.filter((r) => status(r) === "void").map((r) => r[T.id]));
  const jenisPerTrx = new Map(daftar.map((d) => [d.id, d.jenis]));
  const adaJenisDiShift = daftar.some((d) => d.status !== "void" && d.jenis);
  const peta = new Map(); // sku -> { sku, nama, qty, nilai }  (gabungan semua jenis)
  const petaJenis = { ecer: new Map(), grosir: new Map(), lain: new Map() }; // lampiran: barang terjual per jenis penjualan
  for (const it of items) {
    if (adaVoid.has(it[I.trxId])) continue;
    const qty = num(it[I.qty]) - num(it.qty_retur);
    if (qty <= 0) continue;
    const nilai = num(it.subtotal) - num(it.nilai_retur);
    const kunci = it[I.sku] || it[I.nama];
    const tambah = (m) => {
      const a = m.get(kunci) || { sku: it[I.sku], nama: it[I.nama], qty: 0, nilai: 0 };
      a.qty += qty;
      a.nilai += nilai;
      m.set(kunci, a);
    };
    tambah(peta);
    tambah(petaJenis[jenisPerTrx.get(it[I.trxId]) || "lain"]);
  }
  const urut = (m) => [...m.values()].sort((a, b) => b.nilai - a.nilai);
  const barang = urut(peta);
  const barangPerJenis = adaJenisDiShift ? { ecer: urut(petaJenis.ecer), grosir: urut(petaJenis.grosir), lain: urut(petaJenis.lain) } : null;

  // Rincian per metode bayar (transaksi void dibuang; retur tidak dipecah per metode di sini).
  const perMetode = {};
  for (const r of transaksi) {
    if (status(r) === "void") continue;
    for (const p of metodePerTrx.get(r[T.id]) || []) perMetode[p.metode] = (perMetode[p.metode] || 0) + p.jumlah;
  }

  const aktif = daftar.filter((d) => d.status !== "void");
  const perJenis = {};
  for (const j of ["ecer", "grosir"]) {
    const l = aktif.filter((d) => d.jenis === j);
    perJenis[j] = { jumlah: l.length, omzet: l.reduce((a, d) => a + d.total, 0), retur: l.reduce((a, d) => a + d.retur, 0), bersih: l.reduce((a, d) => a + d.bersih, 0) };
  }
  const adaJenis = aktif.some((d) => d.jenis);
  const jenisTakDikenal = aktif.filter((d) => !d.jenis);
  if (adaJenis && jenisTakDikenal.length) {
    perJenis.lain = { jumlah: jenisTakDikenal.length, omzet: jenisTakDikenal.reduce((a, d) => a + d.total, 0), retur: 0, bersih: jenisTakDikenal.reduce((a, d) => a + d.bersih, 0) };
  }
  return {
    perJenis: adaJenis ? perJenis : null,
    daftar,
    barang,
    barangPerJenis,
    perMetode,
    jumlahTransaksi: aktif.length,
    jumlahVoid: daftar.length - aktif.length,
    jumlahRetur: daftar.filter((d) => d.retur > 0).length,
    omzet: aktif.reduce((a, d) => a + d.total, 0),
    totalRetur: aktif.reduce((a, d) => a + d.retur, 0),
    bersih: aktif.reduce((a, d) => a + d.bersih, 0),
    totalQty: barang.reduce((a, b) => a + b.qty, 0),
  };
}

// ---------------------------------------------------------
export function RincianShiftPanel({ rincian, memuat, error, onCetak, mencetak, bukaAwal = false }) {
  const [buka, setBuka] = useState(bukaAwal);
  const [tab, setTab] = useState("transaksi");
  const r = useMemo(() => (rincian ? olahRincian(rincian) : null), [rincian]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setBuka((v) => !v)} className="flex-1 flex items-center gap-2 text-left text-sm font-semibold text-slate-200">
          {buka ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Rincian penjualan shift
          {r && <span className="text-xs font-normal text-slate-500">· {r.jumlahTransaksi} transaksi · {r.totalQty} barang</span>}
        </button>
        <button
          type="button"
          onClick={onCetak}
          disabled={!r || mencetak}
          className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 disabled:opacity-40 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg"
        >
          {mencetak ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Cetak
        </button>
      </div>

      {memuat && !r && (
        <div className="px-4 pb-3 text-xs text-slate-500 flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Memuat rincian…
        </div>
      )}
      {error && <div className="px-4 pb-3 text-xs text-red-300">{error}</div>}

      {buka && r && (
        <div className="px-4 pb-4 space-y-3">
          {r.perJenis && (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["ecer", "Ecer", "text-sky-300 border-sky-500/30"],
                ["grosir", "Grosir", "text-violet-300 border-violet-500/30"],
              ].map(([k, label, kls]) => (
                <div key={k} className={`rounded-xl border bg-slate-900/60 px-3 py-2 ${kls}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
                  <div className="text-sm font-bold tabular-nums text-slate-100 mt-0.5">{fmtRp(r.perJenis[k].bersih)}</div>
                  <div className="text-[10px] text-slate-500">{r.perJenis[k].jumlah} transaksi{r.perJenis[k].retur > 0 ? ` · retur ${fmtRp(r.perJenis[k].retur)}` : ""}</div>
                </div>
              ))}
              {r.perJenis.lain && (
                <div className="col-span-2 text-[10px] text-slate-500">Belum terklasifikasi: {r.perJenis.lain.jumlah} transaksi · {fmtRp(r.perJenis.lain.bersih)}</div>
              )}
            </div>
          )}
          <div className="flex gap-1.5">
            {[
              ["transaksi", `Transaksi (${r.daftar.length})`],
              ["barang", `Barang (${r.barang.length})`],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`text-xs px-3 py-1.5 rounded-full border ${tab === k ? "bg-amber-500 text-slate-950 border-amber-500 font-semibold" : "border-slate-700 text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800">
            {tab === "transaksi" ? (
              r.daftar.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">Belum ada transaksi di shift ini.</div>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {r.daftar.map((d) => (
                      <tr key={d.id} className="border-t first:border-t-0 border-slate-800">
                        <td className="px-3 py-1.5">
                          <div className="font-mono text-slate-300">{d.nomor}</div>
                          <div className="text-[10px] text-slate-500">
                            {jam(d.waktu)} · {d.metode || "–"}
                            {d.jenis && <span className={d.jenis === "grosir" ? "text-violet-300" : "text-sky-300"}> · {d.jenis === "grosir" ? "Grosir" : "Ecer"}</span>}
                            {d.status === "void" && <span className="text-red-300"> · VOID</span>}
                            {d.retur > 0 && <span className="text-orange-300"> · retur {fmtRp(d.retur)}</span>}
                          </div>
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${d.status === "void" ? "line-through text-slate-600" : "text-slate-200"}`}>{fmtRp(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : r.barang.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">Belum ada barang terjual.</div>
            ) : r.barangPerJenis ? (
              [
                ["ecer", "Penjualan Ecer", "text-sky-300"],
                ["grosir", "Penjualan Grosir", "text-violet-300"],
                ["lain", "Belum terklasifikasi", "text-slate-400"],
              ].map(([k, judul, kls]) =>
                r.barangPerJenis[k].length === 0 ? null : (
                  <div key={k}>
                    <div className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide bg-slate-900/80 border-t first:border-t-0 border-slate-800 ${kls}`}>
                      {judul} · {r.barangPerJenis[k].length} barang · {r.barangPerJenis[k].reduce((a, b) => a + b.qty, 0)} pcs
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {r.barangPerJenis[k].map((b) => (
                          <tr key={b.sku || b.nama} className="border-t border-slate-800">
                            <td className="px-3 py-1.5">
                              <div className="text-slate-200">{b.nama}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{b.sku}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">× {b.qty}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmtRp(b.nilai)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {r.barang.map((b) => (
                    <tr key={b.sku || b.nama} className="border-t first:border-t-0 border-slate-800">
                      <td className="px-3 py-1.5">
                        <div className="text-slate-200">{b.nama}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{b.sku}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">× {b.qty}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmtRp(b.nilai)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// CETAK RINCIAN SHIFT (80mm) — dibuat semirip mungkin dengan cetak struk (StrukKasir.jsx):
//  - isi disusun sekali sebagai baris semantik { tipe: "tengah" | "kiri" | "kolom" | "garis" }
//    (bentuk yang sama dengan barisPrinter() di StrukKasir, jadi printer desktop memperlakukannya sama)
//  - jalur cetak, urut seperti struk: 1) teks ESC/POS (aplikasi desktop)  2) HTML di jendela tersembunyi
//    (aplikasi desktop)  3) dialog cetak browser. Tinggi kertas diukur dari isi, bukan "auto".
//  `info` = { identitas, shift, nomorHarian, tanggal, kasir, ringkas, hasil }
//    ringkas : hasil kasir_hitung_shift;  hasil : hasil kasir_tutup_shift (kalau sudah ditutup)

function susunBarisRincian({ rincian, info }) {
  const r = olahRincian(rincian);
  const { identitas, shift, nomorHarian, tanggal, ringkas, hasil } = info;
  const b = [];
  const garis = () => b.push({ tipe: "garis" });
  const tengah = (teks, tebal) => b.push({ tipe: "tengah", teks, ...(tebal ? { tebal: true } : {}) });
  const kiri = (teks, indent) => b.push({ tipe: "kiri", teks, ...(indent ? { indent } : {}) });
  const kolom = (k, v, tebal) => b.push({ tipe: "kolom", kiri: k, kanan: v, ...(tebal ? { tebal: true } : {}) });
  const rp = (n) => fmtRp(n);

  // Kop: nama + alamat usaha, sama seperti struk.
  if (identitas?.nama) tengah(identitas.nama, true);
  for (const a of identitas?.alamat || []) tengah(a);
  tengah(`RINCIAN PENJUALAN SHIFT ${nomorHarian ?? ""}`.trim(), true);
  tengah(tglPanjang(tanggal));
  garis();
  kiri(`Kasir: ${shift.kasir_nama || info.kasir || ""}`);
  kiri(`Buka: ${tglJamId(shift.buka_at)}`);
  if (shift.tutup_at || hasil) kiri(`Tutup: ${tglJamId(shift.tutup_at || new Date().toISOString())}`);
  else kiri(`Dicetak: ${tglJamId(new Date().toISOString())} (shift belum ditutup)`);
  garis();

  tengah("TRANSAKSI", true);
  if (!r.daftar.length) kiri("(tidak ada transaksi)");
  for (const d of r.daftar) {
    const tag = d.status === "void" ? " VOID" : d.retur > 0 ? " (retur)" : "";
    kolom(`${jam(d.waktu)} ${d.nomor}${tag}`, d.status === "void" ? "-" : rp(d.total));
    const jenisTeks = d.jenis === "grosir" ? "Grosir" : d.jenis === "ecer" ? "Ecer" : "";
    const sub = [jenisTeks, d.metode || "", d.retur > 0 ? `retur ${rp(d.retur)}` : ""].filter(Boolean).join(" - ");
    if (sub) kiri(`   ${sub}`);
  }
  garis();

  // Daftar barang: satu bagian, atau (kalau shift punya penjualan ecer/grosir) dipisah jadi lampiran per jenis.
  const tulisBarang = (daftarBarang) => {
    const digit = String(daftarBarang.length).length;
    const indent = digit + 2;
    daftarBarang.forEach((x, i) => {
      kiri(`${String(i + 1).padStart(digit, " ")}. ${x.nama}`, indent);
      kolom(`${" ".repeat(indent)}${x.sku ? `${x.sku} x ` : ""}${x.qty}`, rp(x.nilai));
    });
  };
  if (r.barangPerJenis) {
    for (const [k, judul] of [["ecer", "BARANG TERJUAL - ECER"], ["grosir", "BARANG TERJUAL - GROSIR"], ["lain", "BARANG TERJUAL - LAINNYA"]]) {
      const l = r.barangPerJenis[k];
      if (!l.length) continue;
      tengah(judul, true);
      tulisBarang(l);
      kolom(`Total ${k === "lain" ? "lainnya" : k}`, `${l.reduce((a, x) => a + x.qty, 0)} pcs`);
      garis();
    }
    kolom("Total semua barang", `${r.totalQty} pcs`);
    garis();
  } else {
    tengah("BARANG TERJUAL", true);
    if (!r.barang.length) kiri("(belum ada)");
    tulisBarang(r.barang);
    kolom("Total barang", `${r.totalQty} pcs`);
    garis();
  }

  tengah("RINGKASAN", true);
  kolom(`Transaksi (${r.jumlahTransaksi})`, rp(r.omzet));
  if (r.totalRetur > 0) kolom(`Retur (${r.jumlahRetur})`, `-${rp(r.totalRetur)}`);
  if (r.jumlahVoid > 0) kolom("Transaksi void", `${r.jumlahVoid}`);
  kolom("Penjualan bersih", rp(r.bersih), true);
  if (r.perJenis) {
    kolom(`  Ecer (${r.perJenis.ecer.jumlah})`, rp(r.perJenis.ecer.bersih));
    kolom(`  Grosir (${r.perJenis.grosir.jumlah})`, rp(r.perJenis.grosir.bersih));
    if (r.perJenis.lain) kolom(`  Lainnya (${r.perJenis.lain.jumlah})`, rp(r.perJenis.lain.bersih));
  }
  for (const [m, v] of Object.entries(r.perMetode)) kolom(`  ${m}`, rp(v));
  garis();

  const k = hasil || ringkas;
  if (k) {
    tengah("KAS LACI", true);
    kolom("Kas awal", rp(k.kas_awal));
    if (k.penjualan_cash != null) kolom("+ Penjualan cash", rp(k.penjualan_cash));
    if (k.retur_cash != null) kolom("- Retur cash", rp(k.retur_cash));
    kolom("Kas seharusnya", rp(k.kas_sistem), true);
    if (hasil) {
      kolom("Uang dihitung", rp(hasil.kas_akhir));
      const sel = Number(hasil.selisih) || 0;
      kolom("Selisih", sel === 0 ? "Pas" : sel > 0 ? `Lebih ${rp(sel)}` : `Kurang ${rp(-sel)}`, true);
      if (hasil.catatan) kiri(`Catatan: ${hasil.catatan}`);
    }
    garis();
  }
  tengah("- selesai -");
  return b;
}

// HTML mandiri bergaya struk (font mono 11px, lebar 72mm, garis putus-putus hitam, kop nama 14px tebal).
function htmlRincian(baris, adaNama, mm) {
  const isi = baris
    .map((x, i) => {
      if (x.tipe === "garis") return '<div class="g"></div>';
      if (x.tipe === "tengah") return `<div class="c${x.tebal ? " t" : ""}${adaNama && i === 0 ? " h" : ""}">${esc(x.teks)}</div>`;
      if (x.tipe === "kolom") return `<div class="k${x.tebal ? " t" : ""}"><span>${esc(x.kiri)}</span><span>${esc(x.kanan)}</span></div>`;
      const gantung = x.indent ? ` style="padding-left:${x.indent}ch;text-indent:-${x.indent}ch"` : "";
      return `<div class="l"${gantung}>${esc(x.teks)}</div>`;
    })
    .join("");
  const css = `${mm ? `@page{size:80mm ${mm}mm;margin:0}` : "@page{margin:0}"}
    html,body{margin:0;padding:0;background:#fff;color:#000}
    .w{width:72mm;font:11px/1.375 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;white-space:pre-wrap}
    .c{text-align:center;margin:2px 0}.c.t{font-weight:bold}.c.h{font-size:14px;margin:4px 0;letter-spacing:.025em}
    .l{margin:2px 0}.k{display:flex;justify-content:space-between;gap:1ch}.k span:first-child{min-width:0;overflow-wrap:anywhere}.k span:last-child{white-space:nowrap}.k.t{font-weight:bold}
    .g{border-top:1px dashed #000;margin:6px 0}
    .w div{break-inside:avoid;page-break-inside:avoid}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="w">${isi}</div></body></html>`;
}

// Iframe tersembunyi (di luar layar, bukan display:none supaya tinggi bisa diukur).
function iframeCetak(html) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-99999px;top:0;width:90mm;height:300mm;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  return iframe;
}

// Tinggi kertas (mm) dari tinggi isi sebenarnya + 8mm, sama seperti StrukKasir.
async function ukurTinggiMm(baris, adaNama) {
  const iframe = iframeCetak(htmlRincian(baris, adaNama, 0));
  try {
    await new Promise((res) => setTimeout(res, 150));
    const el = iframe.contentWindow.document.querySelector(".w");
    const px = el ? el.getBoundingClientRect().height : baris.length * 17;
    return Math.ceil((px / 96) * 25.4 + 8);
  } finally {
    iframe.remove();
  }
}

export async function cetakRincianShift({ rincian, info }) {
  const baris = susunBarisRincian({ rincian, info });
  const adaNama = !!info.identitas?.nama;
  const desktop = typeof window !== "undefined" ? window.selmaDesktop : null;

  // Aplikasi desktop, urutan seperti struk: 1) teks ESC/POS (hemat kertas)  2) HTML di jendela tersembunyi.
  if (desktop?.cetakStruk) {
    const r = await desktop.cetakStruk(keAsciiBaris(baris)).catch(() => ({ ok: false, error: "mode-html" }));
    if (!r || r.ok !== false) return;
  }
  const mm = await ukurTinggiMm(baris, adaNama);
  const html = htmlRincian(baris, adaNama, mm);
  if (desktop?.cetakHtml) {
    const r = await desktop.cetakHtml(html, mm).catch((e) => ({ ok: false, error: e?.message || String(e) }));
    if (!r || r.ok !== false) return;
  }

  // Browser biasa (atau desktop gagal): iframe + dialog cetak.
  await new Promise((resolve) => {
    const iframe = iframeCetak(html);
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
        /* abaikan */
      }
      setTimeout(selesai, 3000);
    }, 150);
  });
}