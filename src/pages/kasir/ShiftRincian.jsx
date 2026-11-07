import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, Loader2 } from "lucide-react";
import { fmtRp } from "../../lib/api";
import { SKEMA, HARI_WIB } from "./kasirApi";
import { tglJamId } from "./kasirStruk";

// =========================================================
// RINCIAN PENJUALAN SHIFT — dipakai di layar Tutup Kasir.
//  - olahRincian()      : ubah data mentah (transaksi, item, pembayaran) jadi ringkasan + daftar
//  - RincianShiftPanel  : bagian yang bisa dibuka/tutup di layar Tutup Kasir
//  - cetakRincianShift(): cetak ke printer struk 80mm (aplikasi desktop: langsung; browser: dialog cetak)
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

  const daftar = transaksi.map((r) => {
    const id = r[T.id];
    const st = status(r);
    const bayar = metodePerTrx.get(id) || [];
    return {
      id,
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
  const peta = new Map(); // sku -> { sku, nama, qty, nilai }
  for (const it of items) {
    if (adaVoid.has(it[I.trxId])) continue;
    const qty = num(it[I.qty]) - num(it.qty_retur);
    if (qty <= 0) continue;
    const nilai = num(it.subtotal) - num(it.nilai_retur);
    const kunci = it[I.sku] || it[I.nama];
    const a = peta.get(kunci) || { sku: it[I.sku], nama: it[I.nama], qty: 0, nilai: 0 };
    a.qty += qty;
    a.nilai += nilai;
    peta.set(kunci, a);
  }
  const barang = [...peta.values()].sort((a, b) => b.nilai - a.nilai);

  // Rincian per metode bayar (transaksi void dibuang; retur tidak dipecah per metode di sini).
  const perMetode = {};
  for (const r of transaksi) {
    if (status(r) === "void") continue;
    for (const p of metodePerTrx.get(r[T.id]) || []) perMetode[p.metode] = (perMetode[p.metode] || 0) + p.jumlah;
  }

  const aktif = daftar.filter((d) => d.status !== "void");
  return {
    daftar,
    barang,
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
// Cetak rincian shift (80mm). `info` = { identitas, shift, nomorHarian, tanggal, kasir, ringkas, hasil }
//   ringkas : hasil kasir_hitung_shift;  hasil : hasil kasir_tutup_shift (kalau sudah ditutup)
export async function cetakRincianShift({ rincian, info }) {
  const r = olahRincian(rincian);
  const { identitas, shift, nomorHarian, tanggal, ringkas, hasil } = info;
  const baris = (k, v, tebal) => `<div class="b${tebal ? " t" : ""}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  const rata = (a, b) => `<div class="b"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;

  const bagian = [];
  bagian.push(`<h2>${esc(identitas?.nama || "KASIR")}</h2>`);
  bagian.push(`<div class="c"><b>RINCIAN PENJUALAN SHIFT ${nomorHarian}</b></div>`);
  bagian.push(`<div class="c">${esc(tglPanjang(tanggal))}</div><hr>`);
  bagian.push(`<div>Kasir : ${esc(shift.kasir_nama || info.kasir || "")}</div>`);
  bagian.push(`<div>Buka  : ${esc(tglJamId(shift.buka_at))}</div>`);
  if (shift.tutup_at || hasil) bagian.push(`<div>Tutup : ${esc(tglJamId(shift.tutup_at || new Date().toISOString()))}</div>`);
  else bagian.push(`<div>Dicetak: ${esc(tglJamId(new Date().toISOString()))} (shift belum ditutup)</div>`);
  bagian.push("<hr>");

  bagian.push("<b>TRANSAKSI</b>");
  if (!r.daftar.length) bagian.push("<div>(tidak ada transaksi)</div>");
  for (const d of r.daftar) {
    const tag = d.status === "void" ? " VOID" : d.retur > 0 ? " (retur)" : "";
    bagian.push(`<div class="b"><span>${esc(jam(d.waktu))} ${esc(String(d.nomor))}${tag}</span><span>${d.status === "void" ? "-" : esc(fmtRp(d.total))}</span></div>`);
    if (d.metode) bagian.push(`<div class="k">${esc(d.metode)}${d.retur > 0 ? ` · retur ${esc(fmtRp(d.retur))}` : ""}</div>`);
  }
  bagian.push("<hr>");

  bagian.push("<b>BARANG TERJUAL</b>");
  if (!r.barang.length) bagian.push("<div>(belum ada)</div>");
  for (const b of r.barang) {
    bagian.push(`<div>${esc(b.nama)}</div>`);
    bagian.push(`<div class="b k"><span>${esc(b.sku || "")} × ${b.qty}</span><span>${esc(fmtRp(b.nilai))}</span></div>`);
  }
  bagian.push(rata("Total barang", `${r.totalQty} pcs`));
  bagian.push("<hr>");

  bagian.push("<b>RINGKASAN</b>");
  bagian.push(baris(`Transaksi (${r.jumlahTransaksi})`, fmtRp(r.omzet)));
  if (r.totalRetur > 0) bagian.push(baris(`Retur (${r.jumlahRetur})`, `- ${fmtRp(r.totalRetur)}`));
  if (r.jumlahVoid > 0) bagian.push(baris("Transaksi void", `${r.jumlahVoid}`));
  bagian.push(baris("Penjualan bersih", fmtRp(r.bersih), true));
  for (const [m, v] of Object.entries(r.perMetode)) bagian.push(baris(`  ${m}`, fmtRp(v)));
  bagian.push("<hr>");

  const k = hasil || ringkas;
  if (k) {
    bagian.push("<b>KAS LACI</b>");
    bagian.push(baris("Kas awal", fmtRp(k.kas_awal)));
    if (k.penjualan_cash != null) bagian.push(baris("+ Penjualan cash", fmtRp(k.penjualan_cash)));
    if (k.retur_cash != null) bagian.push(baris("- Retur cash", fmtRp(k.retur_cash)));
    bagian.push(baris("Kas seharusnya", fmtRp(k.kas_sistem), true));
    if (hasil) {
      bagian.push(baris("Uang dihitung", fmtRp(hasil.kas_akhir)));
      const sel = Number(hasil.selisih) || 0;
      bagian.push(baris("Selisih", sel === 0 ? "Pas" : sel > 0 ? `Lebih ${fmtRp(sel)}` : `Kurang ${fmtRp(-sel)}`, true));
      if (hasil.catatan) bagian.push(`<div class="k">Catatan: ${esc(hasil.catatan)}</div>`);
    }
    bagian.push("<hr>");
  }
  bagian.push('<div class="c k">— selesai —</div>');

  const css = `@page{size:80mm auto;margin:0}html,body{background:#fff;color:#000}
    body{margin:0;padding:2mm 4mm 8mm;width:72mm;font:12px/1.4 monospace}
    h2{text-align:center;font-size:14px;margin:2mm 0}.c{text-align:center}hr{border:0;border-top:1px dashed #000;margin:2mm 0}
    .b{display:flex;justify-content:space-between;gap:6px}.b span:first-child{min-width:0;overflow-wrap:anywhere}.t{font-weight:bold}.k{font-size:10.5px}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bagian.join("")}</body></html>`;

  // Perkiraan tinggi kertas untuk printer desktop (mm); ± 4,6 mm per baris.
  const mm = Math.ceil((bagian.length + r.daftar.length) * 4.6 + 30);
  const desktop = typeof window !== "undefined" ? window.selmaDesktop : null;
  if (desktop?.cetakHtml) {
    const res = await desktop.cetakHtml(html, mm).catch((e) => ({ ok: false, error: e?.message || String(e) }));
    if (!res || res.ok !== false) return;
  }
  // Browser biasa (atau desktop gagal): iframe + dialog cetak.
  await new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
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
        /* abaikan */
      }
      setTimeout(selesai, 3000);
    }, 150);
  });
}
