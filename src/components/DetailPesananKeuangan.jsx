import { Receipt } from "lucide-react";
import { Badge, ModalShell, formatTanggalID } from "./ui";
import { detailModelPesanan, fmtRp, tahapPesanan } from "../lib/api";
import { TAHAP_PESANAN_META } from "../lib/constants";

// Detail Pesanan Barang untuk satu transaksi Keuangan.
//
// Sambungannya lewat kolom pesanan_masuk.keuangan_transaksi_id (diisi waktu
// "Pesan Barang" disimpan) — BUKAN lewat teks keterangan, karena keterangan
// ditimpa No. Resi begitu resi diisi, dan bisa diedit manual.
//
// Transaksi Keuangan yang tidak punya pesanan tertaut (mis. Ongkir, atau
// pembayaran yang dicatat manual) tidak dapat tombol detail.

// Sama dengan rumus di pages/BarangDatang.jsx supaya angkanya konsisten:
// qty datang = barang bagus + rusak, nilai = qty datang x harga/pcs.
const qtyDatang = (m) => (Number(m.jumlah) || 0) + (Number(m.rusak) || 0);
const nilaiModel = (m) => qtyDatang(m) * (Number(m.harga) || 0);
const nilaiInvoice = (inv) => detailModelPesanan(inv).reduce((sum, m) => sum + nilaiModel(m), 0);

// Peta { id transaksi keuangan -> baris pesanan_masuk } — dibuat sekali per
// render daftar supaya tidak mencari ulang di tiap baris.
export function petaPesananKeuangan(pesananMasuk) {
  const peta = new Map();
  (pesananMasuk || []).forEach((p) => {
    if (p.keuangan_transaksi_id) peta.set(p.keuangan_transaksi_id, p);
  });
  return peta;
}

// Pesanan induk + semua invoice tambahannya (baris anak yang induk_id-nya
// menunjuk ke pesanan itu, termasuk anak dari anak) — invoice induk selalu
// pertama, sisanya urut waktu dibuat.
function semuaInvoiceDari(induk, pesananMasuk) {
  const ids = new Set([induk.id]);
  const anak = [];
  let bertambah = true;
  while (bertambah) {
    bertambah = false;
    (pesananMasuk || []).forEach((p) => {
      if (p.induk_id && ids.has(p.induk_id) && !ids.has(p.id)) {
        ids.add(p.id);
        anak.push(p);
        bertambah = true;
      }
    });
  }
  anak.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return [induk, ...anak];
}

function BarisModel({ m, idx }) {
  if (m.datang === false) {
    return (
      <div className="px-3.5 py-2.5 border-t border-slate-800/60 first:border-t-0">
        <p className="text-[12px] text-amber-400/80 italic">Belum datang — model dan qty diisi lewat Konfirmasi Datang</p>
        {m.harga_total_pesan ? (
          <p className="text-[11px] text-slate-500 mt-0.5">Total kesepakatan {fmtRp(m.harga_total_pesan)}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="px-3.5 py-2.5 border-t border-slate-800/60 first:border-t-0">
      <div className="text-sm text-slate-200 font-medium mb-1.5 truncate">{m.nama || `Model ${idx + 1}`}</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Qty datang <span className="text-emerald-400 font-semibold">{qtyDatang(m)}x</span>
        </span>
        <span>
          Qty rusak{" "}
          {Number(m.rusak) > 0 ? (
            <span className="text-red-400 font-semibold" title={m.alasan_rusak || ""}>
              {m.rusak}x{m.alasan_rusak ? ` — ${m.alasan_rusak}` : ""}
            </span>
          ) : (
            <span className="text-slate-600 font-semibold">0</span>
          )}
        </span>
        {Number(m.harga) > 0 && (
          <>
            <span>
              Harga/pcs <span className="text-slate-300 font-semibold">{fmtRp(m.harga)}</span>
            </span>
            <span>
              Subtotal <span className="text-slate-200 font-semibold">{fmtRp(nilaiModel(m))}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function BarisRingkasan({ label, nilai, tebal }) {
  return (
    <div className={`flex justify-between ${tebal ? "text-slate-200 font-semibold" : "text-slate-400"}`}>
      <span>{label}</span>
      <span className={tebal ? "" : "text-slate-300 font-medium"}>{nilai}</span>
    </div>
  );
}

// transaksi = baris keuangan_transaksi, pesanan = baris pesanan_masuk yang
// tertaut ke transaksi itu. onBack (opsional) dipakai kalau modal ini dibuka
// dari modal lain dan mau balik ke sana.
export function DetailPesananKeuanganModal({ transaksi, pesanan, pesananMasuk, onClose, onBack, labelKembali }) {
  const daftarInvoice = semuaInvoiceDari(pesanan, pesananMasuk);
  const tahap = tahapPesanan(pesanan);
  const tahapMeta = TAHAP_PESANAN_META[tahap] || TAHAP_PESANAN_META.menunggu;
  const resi = pesanan.resi || daftarInvoice.find((x) => x.resi)?.resi || "";

  const dibayar = Number(transaksi.jumlah) || 0;
  const kesepakatan = Number(pesanan.harga_kesepakatan) || 0;
  const nilaiDatang = daftarInvoice.reduce((sum, inv) => sum + nilaiInvoice(inv), 0);
  const adaBarangDatang = nilaiDatang > 0;

  const selisihBayar = kesepakatan > 0 ? dibayar - kesepakatan : 0;
  const selisihDatang = kesepakatan > 0 && adaBarangDatang ? nilaiDatang - kesepakatan : 0;

  return (
    <ModalShell title={`Pesanan ${pesanan.kode_pesanan || ""}`.trim()} onClose={onClose} maxWidth="max-w-2xl">
      {onBack && (
        <button onClick={onBack} className="text-xs text-amber-400 hover:text-amber-300 mb-2">
          ← Kembali{labelKembali ? ` ke ${labelKembali}` : ""}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Badge color={tahapMeta.color}>{tahapMeta.label}</Badge>
        {pesanan.jenis && <Badge color="slate">{pesanan.jenis}</Badge>}
      </div>
      <div className="text-[11px] text-slate-500 mb-3">
        {pesanan.supplier || "Supplier tidak dicatat"}
        {pesanan.tanggal_pesan ? ` · dipesan ${formatTanggalID(pesanan.tanggal_pesan)}` : ""}
        {resi ? ` · Resi ${resi}` : ""}
      </div>

      {tahap === "batal" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300 mb-3">
          Pesanan ini dibatalkan, tetapi pembayarannya masih tercatat sebagai pengeluaran di Keuangan.
        </div>
      )}

      <div
        className={`rounded-xl border px-3.5 py-3 text-[11px] space-y-1.5 mb-3 ${
          selisihBayar !== 0 || selisihDatang !== 0
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-slate-800 bg-slate-900/60"
        }`}
      >
        <BarisRingkasan label="Dibayar (tercatat di Keuangan)" nilai={fmtRp(dibayar)} tebal />
        {kesepakatan > 0 && <BarisRingkasan label="Harga kesepakatan" nilai={fmtRp(kesepakatan)} />}
        {adaBarangDatang && (
          <BarisRingkasan
            label={`Total harga barang datang${daftarInvoice.length > 1 ? " (semua invoice)" : ""}`}
            nilai={fmtRp(nilaiDatang)}
          />
        )}
        {selisihBayar !== 0 && (
          <div className="text-amber-400 font-semibold pt-1 border-t border-slate-800/60">
            Nominal di Keuangan {selisihBayar > 0 ? "lebih besar" : "lebih kecil"} {fmtRp(Math.abs(selisihBayar))} dari
            harga kesepakatan
          </div>
        )}
        {selisihDatang !== 0 && (
          <div className="text-amber-400 font-semibold">
            Barang datang {selisihDatang > 0 ? "lebih" : "kurang"} {fmtRp(Math.abs(selisihDatang))} dari harga
            kesepakatan{pesanan.keterangan_selisih ? ` — ${pesanan.keterangan_selisih}` : ""}
          </div>
        )}
        {selisihBayar === 0 && selisihDatang === 0 && kesepakatan > 0 && (
          <div className="text-emerald-400 font-semibold pt-1 border-t border-slate-800/60">Sesuai kesepakatan</div>
        )}
      </div>

      <div className="space-y-3">
        {daftarInvoice.map((inv, idx) => {
          const detail = detailModelPesanan(inv);
          const nilai = nilaiInvoice(inv);
          const label = inv.no_invoice || inv.kode_pesanan || `Invoice ${idx + 1}`;
          return (
            <div
              key={inv.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden border-l-2 border-l-amber-500/60"
            >
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-slate-900 border-b border-slate-800/80">
                <div className="flex items-center gap-2 text-[12px] min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-400 flex-shrink-0">
                    <Receipt size={12} />
                  </span>
                  <span className="font-mono font-semibold text-amber-400 truncate">{label}</span>
                  {Number(inv.no_box) > 0 && (
                    <span className="text-sky-400 flex-shrink-0 bg-sky-500/10 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                      Box {inv.no_box}
                    </span>
                  )}
                </div>
                {nilai > 0 && <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">{fmtRp(nilai)}</span>}
              </div>
              {detail.length === 0 ? (
                <div className="px-3.5 py-3 text-xs text-slate-600 italic">Belum ada rincian model.</div>
              ) : (
                detail.map((m, i) => <BarisModel key={i} m={m} idx={i} />)
              )}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
