import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, ChevronLeft, ChevronRight, ChevronDown, Loader2, Truck, Pencil, Trash2, PackageCheck,
  AlertTriangle, Receipt, X, Clock, RefreshCw, Landmark, Phone,
} from "lucide-react";
import ModalRouter from "../../components/ModalRouter";
import { Badge, formatTanggalID } from "../../components/ui";
import {
  sb, sbAll, fmtRp, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  detailModelPesanan, statusPesananMasuk, tahapPesanan, statusBongkar, statusKonfirmasiDatang, rincianBongkarBox,
} from "../../lib/api";
import { TAHAP_PESANAN_META, BONGKAR_META, KONFIRMASI_DATANG_META } from "../../lib/constants";

// =========================================================
// VERSI HP — PENGADAAN BARANG (OPERASIONAL > ADMIN GUDANG > Pengadaan Barang) — file PengadaanHp.jsx
// Satu layar untuk 4 sub-menu (key NAV: datang / habis-pakai / aset / supplier). `sub` dikirim dari MobileApp.
//   - Barang Dagang   : daftar pesanan barang versi KARTU (tabel desktop lebarnya 980px, tidak muat di HP).
//                       Pesan Barang, Tandai Datang, Konfirmasi Datang, Edit, Hapus memakai ModalRouter YANG SAMA
//                       dengan versi komputer, jadi aturan stok / keuangan / bon tambahan identik.
//   - Barang Habis Pakai : memakai ulang halaman desktop (pages/BelanjaHabisPakai.jsx) — sudah berbentuk kartu,
//                          memuat datanya sendiri.
//   - Barang Aset     : sama seperti desktop, masih "segera hadir".
//   - Data Supplier   : daftar kartu + tambah/edit/hapus lewat modal yang sama dengan desktop.
// Data dimuat sendiri di layar ini (pesanan_masuk, suppliers, master_data), bukan dari App.jsx.
// =========================================================

const BelanjaHabisPakai = lazy(() => import("../BelanjaHabisPakai"));

const KOLOM_SUPPLIERS = "id,kode,nama,alamat,telepon,catatan,models";
const PER_TAMPIL = 15;

// Modal yang membaca data tambahan (items / sku_master / keuangan_transaksi). Di desktop data itu sudah ada di
// App.jsx; di HP ditarik per-kebutuhan, SEGAR tiap modal dibuka (stok SKU dipakai untuk membalik stok saat hapus).
const MODAL_BUTUH_DATA = new Set(["hapus-pesanan-masuk", "edit-barang-datang"]);

// ---------- Helper tampilan (salinan logika BarangDatang.jsx) ----------
const qtyDatangModel = (m) => (Number(m.jumlah) || 0) + (Number(m.rusak) || 0);
const nilaiModel = (m) => qtyDatangModel(m) * (Number(m.harga) || 0);
const totalQty = (detail) => detail.reduce((s, m) => s + qtyDatangModel(m), 0);
const totalNilai = (detail) => detail.reduce((s, m) => s + nilaiModel(m), 0);
const totalRusak = (detail) => detail.reduce((s, m) => s + (Number(m.rusak) || 0), 0);
const fmtPersen = (n) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const hitungDiskon = (hargaBarang, pembayaran) => {
  const hb = Number(hargaBarang) || 0;
  const bayar = Number(pembayaran) || 0;
  if (hb <= 0 || bayar <= 0 || bayar >= hb) return null;
  return { rp: hb - bayar, persen: ((hb - bayar) / hb) * 100 };
};
const fotoBonUrlsOf = (p) => (p?.foto_bon_urls?.length > 0 ? p.foto_bon_urls : p?.foto_bon_url ? [p.foto_bon_url] : []);
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };

const pad2 = (n) => String(n).padStart(2, "0");
function rentangBulan(tahun, bulan0) {
  const hariTerakhir = new Date(tahun, bulan0 + 1, 0).getDate();
  return { dari: `${tahun}-${pad2(bulan0 + 1)}-01`, sampai: `${tahun}-${pad2(bulan0 + 1)}-${pad2(hariTerakhir)}` };
}
const labelBulan = (tahun, bulan0) => new Date(tahun, bulan0, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

// ---------- Pemuatan data ----------
async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// Data tambahan untuk modal tertentu — hanya baris yang benar-benar dibaca modal itu.
async function muatDataModal(modal, pesananMasuk) {
  const p = modal.item;
  const semua = [p, ...(pesananMasuk || []).filter((r) => r.induk_id === p.id)];
  const idKeuangan = [...new Set(semua.flatMap((r) => [r.keuangan_transaksi_id, r.keuangan_ongkir_id]).filter(Boolean))];
  const keuanganTransaksi = idKeuangan.length ? (await sb(`keuangan_transaksi?select=*&id=in.(${idKeuangan.join(",")})`)) || [] : [];
  if (modal.type !== "hapus-pesanan-masuk") return { items: [], skuMaster: [], keuanganTransaksi };

  const idPesanan = semua.map((r) => r.id).join(",");
  const penerimaan = (await sb(`pesanan_penerimaan?select=item_id&pesanan_id=in.(${idPesanan})`)) || [];
  const itemIds = [...new Set(penerimaan.map((r) => r.item_id).filter(Boolean))];
  const items = itemIds.length ? (await sb(`items?select=*&id=in.(${itemIds.join(",")})`)) || [] : [];
  const daftarSku = [...new Set(items.map((i) => i.sku).filter(Boolean))];
  const skuMaster = daftarSku.length
    ? (await sbAll(`sku_master?select=id,sku&sku=in.(${daftarSku.map((s) => `"${String(s).replace(/"/g, '\\"')}"`).join(",")})`)) || []
    : [];
  return { items, skuMaster, keuanganTransaksi };
}

// ---------- Potongan layar ----------
function Memuat({ teks = "Memuat…" }) {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> {teks}
    </div>
  );
}

function Galat({ pesan, ulang }) {
  return (
    <div className="p-4">
      <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">{pesan}</div>
        </div>
        <button onClick={ulang} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
          <RefreshCw size={12} /> Coba lagi
        </button>
      </div>
    </div>
  );
}

function Kosong({ teks }) {
  return <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">{teks}</div>;
}

function LightboxFoto({ foto, tutup, geser }) {
  if (!foto) return null;
  const { urls, index } = foto;
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={tutup}>
      <div className="flex items-center justify-between px-4 py-3 text-white text-sm" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <span>Foto invoice {urls.length > 1 ? `${index + 1}/${urls.length}` : ""}</span>
        <button onClick={tutup} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
        <img src={urls[index]} alt="Foto invoice" className="max-w-full max-h-full object-contain" />
      </div>
      {urls.length > 1 && (
        <div className="flex items-center justify-center gap-6 py-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => geser(-1)} className="w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => geser(1)} className="w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center">
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Barang Dagang ----------
function BarisModel({ m, idx }) {
  if (m.datang === false) {
    return (
      <div className="px-3 py-2 border-t border-md-outline-variant first:border-t-0">
        <p className="text-[12px] text-amber-500 italic">Belum datang — model &amp; qty diisi lewat "Konfirmasi Datang"</p>
        {m.harga_total_pesan ? <p className="text-[11px] text-md-on-surface-variant mt-0.5">Total pembayaran {fmtRp(m.harga_total_pesan)}</p> : null}
      </div>
    );
  }
  const adaHarga = Number(m.harga) > 0;
  return (
    <div className="px-3 py-2 border-t border-md-outline-variant first:border-t-0">
      <div className="text-sm font-medium text-md-on-surface break-words">{m.nama || `Model ${idx + 1}`}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-md-on-surface-variant">
        <span>
          Datang <b className="text-emerald-500">{qtyDatangModel(m)}x</b>
        </span>
        {Number(m.rusak) > 0 && (
          <span className="text-red-400">
            Rusak <b>{m.rusak}x</b>
            {m.alasan_rusak ? ` — ${m.alasan_rusak}` : ""}
          </span>
        )}
        <span>
          @ <b className="text-md-on-surface">{adaHarga ? fmtRp(m.harga) : "—"}</b>
        </span>
        <span>
          = <b className="text-md-on-surface">{adaHarga ? fmtRp(nilaiModel(m)) : "—"}</b>
        </span>
      </div>
    </div>
  );
}

function RincianInvoice({ daftarInvoice, hargaKesepakatan, keteranganSelisih, lihatFoto, aksi }) {
  const nilaiGabungan = daftarInvoice.reduce((s, inv) => s + totalNilai(detailModelPesanan(inv)), 0);
  const totalOngkir = daftarInvoice.reduce((s, inv) => s + (Number(inv.ongkir_jumlah) || 0), 0);
  const adaKesepakatan = Number(hargaKesepakatan) > 0;
  const selisih = adaKesepakatan ? nilaiGabungan - Number(hargaKesepakatan) : 0;
  const diskonTotal = adaKesepakatan ? hitungDiskon(nilaiGabungan, hargaKesepakatan) : null;

  return (
    <div className="space-y-2.5 pt-2">
      {daftarInvoice.map((inv, idx) => {
        const detail = detailModelPesanan(inv);
        const foto = fotoBonUrlsOf(inv);
        const label = inv.no_invoice || inv.kode_pesanan || `Invoice ${idx + 1}`;
        const nilaiInv = totalNilai(detail);
        const diskonInv = hitungDiskon(nilaiInv, inv.harga_pembayaran);
        return (
          <div key={inv.id} className="rounded-xl border border-md-outline-variant bg-md-surface overflow-hidden border-l-2 border-l-amber-500/70">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-md-container-low">
              <div className="min-w-0 flex items-center gap-1.5 text-[12px]">
                <Receipt size={13} className="text-amber-500 flex-shrink-0" />
                <span className="font-mono font-semibold text-amber-500 truncate">{label}</span>
                {Number(inv.no_box) > 0 && <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">Box {inv.no_box}</span>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {foto.length > 0 && (
                  <button onClick={() => lihatFoto(foto, 0)} className="relative w-8 h-8 rounded overflow-hidden border border-md-outline-variant" title="Lihat foto invoice">
                    <img src={foto[0]} alt="Foto invoice" className="w-full h-full object-cover" />
                    {foto.length > 1 && <span className="absolute bottom-0 right-0 bg-black/80 text-amber-400 text-[8px] font-semibold leading-none px-1 py-0.5 rounded-tl">+{foto.length - 1}</span>}
                  </button>
                )}
                <button onClick={() => aksi({ type: "edit-barang-datang", item: inv })} className="w-8 h-8 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-on-surface/10" title="Edit invoice/box ini">
                  <Pencil size={13} />
                </button>
              </div>
            </div>
            {(inv.resi || nilaiInv > 0 || Number(inv.harga_pembayaran) > 0) && (
              <div className="px-3 py-1.5 text-[11px] text-md-on-surface-variant flex flex-wrap gap-x-3 gap-y-0.5 border-t border-md-outline-variant">
                {inv.resi && <span>Resi {inv.resi}</span>}
                {nilaiInv > 0 && <span>Nilai {fmtRp(nilaiInv)}</span>}
                {Number(inv.harga_pembayaran) > 0 && <span className="text-emerald-500">Bayar {fmtRp(inv.harga_pembayaran)}</span>}
                {diskonInv && <span className="text-emerald-400 font-semibold">Diskon {fmtPersen(diskonInv.persen)}</span>}
              </div>
            )}
            {detail.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-md-on-surface-variant italic border-t border-md-outline-variant">Belum ada rincian model.</div>
            ) : (
              detail.map((m, i) => <BarisModel key={i} m={m} idx={i} />)
            )}
          </div>
        );
      })}

      {adaKesepakatan ? (
        <div className={`rounded-xl border px-3 py-2.5 text-[11px] space-y-1 ${selisih !== 0 && selisih < 0 ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <div className="text-[10px] uppercase tracking-wide text-md-on-surface-variant font-semibold">Ringkasan Harga</div>
          <div className="flex justify-between gap-3 text-md-on-surface-variant">
            <span>Total harga barang datang{daftarInvoice.length > 1 ? " (semua invoice)" : ""}</span>
            <span className="text-md-on-surface font-medium whitespace-nowrap">{fmtRp(nilaiGabungan)}</span>
          </div>
          <div className="flex justify-between gap-3 text-md-on-surface-variant">
            <span>Total pembayaran</span>
            <span className="text-md-on-surface font-medium whitespace-nowrap">{fmtRp(hargaKesepakatan)}</span>
          </div>
          {selisih !== 0 ? (
            <>
              {diskonTotal ? (
                <div className="flex justify-between gap-3 font-semibold pt-1 border-t border-md-outline-variant text-emerald-500">
                  <span>Diskon dari harga barang</span>
                  <span className="whitespace-nowrap">{fmtRp(diskonTotal.rp)} ({fmtPersen(diskonTotal.persen)})</span>
                </div>
              ) : (
                <div className="flex justify-between gap-3 font-semibold pt-1 border-t border-md-outline-variant text-amber-500">
                  <span>Kurang dari pembayaran</span>
                  <span className="whitespace-nowrap">{fmtRp(Math.abs(selisih))}</span>
                </div>
              )}
              {keteranganSelisih && <div className="text-md-on-surface-variant">Keterangan: <span className="text-md-on-surface">{keteranganSelisih}</span></div>}
            </>
          ) : (
            <div className="text-emerald-500 font-semibold pt-1 border-t border-md-outline-variant">Sesuai pembayaran</div>
          )}
          {totalOngkir > 0 && (
            <div className="flex justify-between gap-3 pt-1 border-t border-md-outline-variant text-md-on-surface-variant">
              <span>Ongkir</span>
              <span className="text-md-on-surface font-medium whitespace-nowrap">{fmtRp(totalOngkir)}</span>
            </div>
          )}
        </div>
      ) : (
        totalOngkir > 0 && (
          <div className="rounded-xl border border-md-outline-variant px-3 py-2.5 text-[11px] flex justify-between text-md-on-surface-variant">
            <span>Ongkir</span>
            <span className="text-md-on-surface font-medium">{fmtRp(totalOngkir)}</span>
          </div>
        )
      )}
    </div>
  );
}

function KartuPesanan({ p, anak, semua, terbuka, toggle, aksi, lihatFoto }) {
  const daftarInvoice = [p, ...anak];
  const detail = daftarInvoice.flatMap((inv) => detailModelPesanan(inv));
  const nilai = totalNilai(detail);
  const rusak = totalRusak(detail);
  const status = statusPesananMasuk(p);
  const tahap = tahapPesanan(p);
  const meta = TAHAP_PESANAN_META[tahap] || TAHAP_PESANAN_META.menunggu;
  const isDraft = status === "draft";
  const belumSelesai = status === "menunggu" || status === "sebagian";
  const konfirmasi = statusKonfirmasiDatang(p);
  const bongkar = statusBongkar(p);
  const rincianBox = rincianBongkarBox(p, semua);
  const tglPesan = formatTanggalID(p.tanggal_pesan);
  const tglDatang = konfirmasi === "sudah" ? formatTanggalID(p.tanggal_datang) : "";
  const ongkir = daftarInvoice.reduce((s, inv) => s + (Number(inv.ongkir_jumlah) || 0), 0);
  const berbedaKesepakatan = Number(p.harga_kesepakatan) > 0 && nilai !== Number(p.harga_kesepakatan);
  const bisaKonfirmasi = konfirmasi === "sudah";

  return (
    <div className="rounded-2xl bg-md-container border border-md-outline-variant overflow-hidden">
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[12px] font-semibold text-amber-500 break-all">{p.kode_pesanan || p.resi || "—"}</div>
            {p.resi && p.kode_pesanan && <div className="text-[10px] text-md-on-surface-variant">Resi {p.resi}</div>}
          </div>
          <Badge color={meta.color}>{meta.label}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-md-on-surface">{p.supplier || "Tanpa supplier"}</span>
          {p.jenis && <Badge color={JENIS_COLOR[p.jenis] || "slate"}>{p.jenis}</Badge>}
          {Number(p.no_box) > 0 && <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full">Box {p.no_box}</span>}
        </div>

        <div className="text-[11px] text-md-on-surface-variant">
          Pesan {tglPesan || "—"}
          {tglDatang ? ` · Datang ${tglDatang}` : ""}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {konfirmasi ? (
            <button
              onClick={() => aksi({ type: "toggle-konfirmasi-datang", item: p })}
              className="active:scale-95 transition"
              title={konfirmasi === "sudah" ? "Ketuk untuk tandai belum datang" : "Ketuk untuk tandai sudah datang"}
            >
              <Badge color={KONFIRMASI_DATANG_META[konfirmasi].color}>{KONFIRMASI_DATANG_META[konfirmasi].label} ✎</Badge>
            </button>
          ) : null}
          {rincianBox ? (
            <span className={`text-[11px] font-semibold ${rincianBox.selesai >= rincianBox.total ? "text-emerald-500" : rincianBox.selesai > 0 ? "text-amber-500" : "text-md-on-surface-variant"}`}>
              Bongkar {rincianBox.selesai}/{rincianBox.total} box
            </span>
          ) : bongkar ? (
            <Badge color={BONGKAR_META[bongkar].color}>{BONGKAR_META[bongkar].label}</Badge>
          ) : null}
        </div>

        <button onClick={() => toggle(p.id)} className="w-full text-left flex items-center justify-between gap-2 rounded-xl bg-md-surface px-3 py-2">
          <div className="min-w-0 text-[12px]">
            {status === "menunggu" ? (
              <span className="text-amber-500 italic">Belum ada rincian</span>
            ) : detail.length === 0 || detail.every((m) => !m.nama && !m.jumlah) ? (
              <span className="text-violet-400 italic">Draf — belum diisi</span>
            ) : (
              <>
                <span className="text-md-on-surface font-medium">{detail.length} model</span>
                <span className="text-emerald-500 font-semibold ml-2">{totalQty(detail)}x</span>
                {rusak > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-red-400 ml-2">
                    <AlertTriangle size={11} /> {rusak}x
                  </span>
                )}
                {nilai > 0 && <span className="block text-md-on-surface-variant mt-0.5">{fmtRp(nilai)}</span>}
              </>
            )}
            {berbedaKesepakatan && (
              <span className="flex items-center gap-1 text-amber-500 text-[11px] mt-0.5">
                <AlertTriangle size={11} /> Beda dari pembayaran ({fmtRp(p.harga_kesepakatan)})
              </span>
            )}
            {ongkir > 0 && <span className="block text-[11px] text-md-on-surface-variant mt-0.5">Ongkir {fmtRp(ongkir)}</span>}
          </div>
          <ChevronDown size={16} className={`flex-shrink-0 text-md-on-surface-variant transition ${terbuka ? "rotate-180" : ""}`} />
        </button>

        <div className="flex items-stretch gap-2">
          {isDraft && (
            <button onClick={() => aksi({ type: "konfirmasi-datang", item: p })} className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-violet-500/15 text-violet-400 text-xs font-semibold py-2.5 active:scale-[0.98]">
              <PackageCheck size={14} /> Lanjutkan Draf
            </button>
          )}
          {!isDraft && belumSelesai && (
            <button
              onClick={() => bisaKonfirmasi && aksi({ type: "konfirmasi-datang", item: p })}
              disabled={!bisaKonfirmasi}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold py-2.5 ${bisaKonfirmasi ? "bg-amber-500/15 text-amber-500 active:scale-[0.98]" : "bg-md-surface text-md-on-surface-variant opacity-60"}`}
            >
              <PackageCheck size={14} /> {bisaKonfirmasi ? "Konfirmasi Datang" : "Tandai Sudah Datang dulu"}
            </button>
          )}
          {!isDraft && status !== "menunggu" && (
            <button onClick={() => aksi({ type: "edit-barang-datang", item: p })} className="w-11 flex items-center justify-center rounded-full bg-md-surface text-md-on-surface-variant active:bg-md-on-surface/10" title="Edit">
              <Pencil size={15} />
            </button>
          )}
          <button onClick={() => aksi({ type: "hapus-pesanan-masuk", item: p })} className="w-11 flex items-center justify-center rounded-full bg-md-surface text-red-400 active:bg-red-500/10" title="Hapus">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {terbuka && (
        <div className="px-3 pb-3 border-t border-md-outline-variant bg-md-container-low">
          <RincianInvoice daftarInvoice={daftarInvoice} hargaKesepakatan={p.harga_kesepakatan} keteranganSelisih={p.keterangan_selisih} lihatFoto={lihatFoto} aksi={aksi} />
        </div>
      )}
    </div>
  );
}

function DaftarBarangDagang({ pesananMasuk, aksi }) {
  const sekarang = new Date();
  const [bulan, setBulan] = useState({ tahun: sekarang.getFullYear(), bulan0: sekarang.getMonth() }); // null = semua periode
  const [q, setQ] = useState("");
  const [tampil, setTampil] = useState(PER_TAMPIL);
  const [terbuka, setTerbuka] = useState(() => new Set());
  const [foto, setFoto] = useState(null);

  const toggle = (id) =>
    setTerbuka((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Urut: tanggal pesan terbaru di atas; sama-sama sehari -> yang paling baru diinput. Tanpa tanggal di paling bawah.
  const semua = useMemo(
    () =>
      [...(pesananMasuk || [])]
        .filter((p) => !p.dibatalkan)
        .sort((a, b) => {
          const ta = a.tanggal_pesan || "";
          const tb = b.tanggal_pesan || "";
          if (ta !== tb) {
            if (!ta) return 1;
            if (!tb) return -1;
            return ta < tb ? 1 : -1;
          }
          return (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0);
        }),
    [pesananMasuk]
  );

  // Bon tambahan (induk_id) menempel di pesanan induknya; kalau induknya tidak ada di daftar aktif, tampil sebagai baris biasa.
  const { top, anakDari } = useMemo(() => {
    const ids = new Set(semua.map((p) => p.id));
    const peta = new Map();
    semua.forEach((p) => {
      if (p.induk_id) peta.set(p.induk_id, [...(peta.get(p.induk_id) || []), p]);
    });
    return { top: semua.filter((p) => !p.induk_id || !ids.has(p.induk_id)), anakDari: (id) => peta.get(id) || [] };
  }, [semua]);

  const periode = useMemo(() => {
    if (!bulan) return top;
    const r = rentangBulan(bulan.tahun, bulan.bulan0);
    return top.filter((p) => {
      const tgl = p.tanggal_pesan || "";
      return tgl >= r.dari && tgl <= r.sampai;
    });
  }, [top, bulan]);

  const ringkas = useMemo(() => {
    const sudah = periode.filter((p) => statusKonfirmasiDatang(p) === "sudah");
    let totalBox = 0;
    let boxSelesai = 0;
    sudah.forEach((p) => {
      const r = rincianBongkarBox(p, semua);
      totalBox += r ? r.total : 1;
      boxSelesai += r ? r.selesai : statusBongkar(p) === "sudah" ? 1 : 0;
    });
    return {
      total: periode.length,
      sudah: sudah.length,
      belum: periode.filter((p) => statusKonfirmasiDatang(p) === "belum").length,
      totalBox,
      boxSelesai,
    };
  }, [periode, semua]);

  const daftar = useMemo(() => {
    const kata = q.trim().toLowerCase();
    if (!kata) return periode;
    return periode.filter((p) => {
      const gabung = [p, ...anakDari(p.id)];
      const teks = gabung
        .flatMap((inv) => [inv.kode_pesanan, inv.supplier, inv.resi, inv.no_invoice, ...detailModelPesanan(inv).map((m) => m.nama)])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return teks.includes(kata);
    });
  }, [periode, q, anakDari]);

  const sekarangBulan = { tahun: sekarang.getFullYear(), bulan0: sekarang.getMonth() };
  const acuan = bulan || sekarangBulan;
  const geser = (d) => {
    const t = new Date(acuan.tahun, acuan.bulan0 + d, 1);
    setBulan({ tahun: t.getFullYear(), bulan0: t.getMonth() });
    setTampil(PER_TAMPIL);
  };
  const tidakBisaMaju = !!bulan && bulan.tahun * 12 + bulan.bulan0 >= sekarangBulan.tahun * 12 + sekarangBulan.bulan0;

  const geserFoto = (d) => setFoto((f) => (f ? { ...f, index: (f.index + d + f.urls.length) % f.urls.length } : f));

  return (
    <div className="p-4 space-y-3">
      <button onClick={() => aksi({ type: "pesan-barang" })} className="w-full flex items-center justify-center gap-2 rounded-full bg-amber-500 text-slate-950 font-semibold text-sm py-3 active:scale-[0.99]">
        <Clock size={16} /> Pesan Barang
      </button>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total Pesanan", nilai: ringkas.total, warna: "text-md-on-surface" },
          { label: "Sudah Datang", nilai: ringkas.sudah, warna: "text-sky-400" },
          { label: "Belum Datang", nilai: ringkas.belum, warna: "text-amber-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-md-container border border-md-outline-variant px-2 py-3 text-center">
            <div className={`text-xl font-semibold ${s.warna}`}>{s.nilai}</div>
            <div className="text-[10px] text-md-on-surface-variant leading-tight mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {ringkas.totalBox > 0 && (
        <div className="text-[11px] text-md-on-surface-variant text-center">
          Box: total {ringkas.totalBox} · sudah dibongkar <b className="text-emerald-500">{ringkas.boxSelesai}</b> · belum <b className="text-amber-500">{ringkas.totalBox - ringkas.boxSelesai}</b>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => geser(-1)} className="w-10 h-10 flex items-center justify-center rounded-full border border-md-outline-variant active:bg-md-on-surface/10" title="Bulan sebelumnya">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold capitalize">{bulan ? labelBulan(bulan.tahun, bulan.bulan0) : "Semua periode"}</div>
          <div className="flex items-center justify-center gap-3 text-[11px] mt-0.5">
            {(!bulan || bulan.tahun !== sekarangBulan.tahun || bulan.bulan0 !== sekarangBulan.bulan0) && (
              <button onClick={() => { setBulan(sekarangBulan); setTampil(PER_TAMPIL); }} className="text-amber-500 underline">Bulan ini</button>
            )}
            {bulan && (
              <button onClick={() => { setBulan(null); setTampil(PER_TAMPIL); }} className="text-md-on-surface-variant underline">Semua periode</button>
            )}
          </div>
        </div>
        <button onClick={() => geser(1)} disabled={tidakBisaMaju} className="w-10 h-10 flex items-center justify-center rounded-full border border-md-outline-variant active:bg-md-on-surface/10 disabled:opacity-40" title="Bulan berikutnya">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-md-container border border-md-outline-variant px-4 py-2.5">
        <Search size={15} className="text-md-on-surface-variant flex-shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setTampil(PER_TAMPIL); }}
          placeholder="Cari kode, supplier, resi, model…"
          className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-md-on-surface-variant"
        />
        {q && (
          <button onClick={() => setQ("")} className="text-md-on-surface-variant">
            <X size={15} />
          </button>
        )}
      </div>

      {daftar.length === 0 ? (
        <Kosong teks={q ? "Tidak ada pesanan yang cocok." : bulan ? "Tidak ada pesanan di bulan ini." : "Belum ada barang datang yang dicatat."} />
      ) : (
        <div className="space-y-3">
          {daftar.slice(0, tampil).map((p) => (
            <KartuPesanan key={p.id} p={p} anak={anakDari(p.id)} semua={semua} terbuka={terbuka.has(p.id)} toggle={toggle} aksi={aksi} lihatFoto={(urls, index) => setFoto({ urls, index })} />
          ))}
          {daftar.length > tampil && (
            <button onClick={() => setTampil((t) => t + PER_TAMPIL)} className="w-full rounded-full border border-md-outline-variant py-2.5 text-xs font-semibold text-md-on-surface-variant active:bg-md-on-surface/10">
              Tampilkan lagi ({daftar.length - tampil} sisa)
            </button>
          )}
        </div>
      )}

      <LightboxFoto foto={foto} tutup={() => setFoto(null)} geser={geserFoto} />
    </div>
  );
}

// ---------- Data Supplier ----------
function DaftarSupplier({ suppliers, aksi }) {
  const [q, setQ] = useState("");
  const kata = q.trim().toLowerCase();
  const filtered = (suppliers || []).filter(
    (s) => !kata || s.nama?.toLowerCase().includes(kata) || s.kode?.toLowerCase().includes(kata) || s.telepon?.toLowerCase().includes(kata)
  );
  return (
    <div className="p-4 space-y-3">
      <button onClick={() => aksi({ type: "supplier-form", item: null })} className="w-full flex items-center justify-center gap-2 rounded-full bg-amber-500 text-slate-950 font-semibold text-sm py-3 active:scale-[0.99]">
        <Plus size={16} /> Tambah Supplier
      </button>
      <div className="flex items-center gap-2 rounded-full bg-md-container border border-md-outline-variant px-4 py-2.5">
        <Search size={15} className="text-md-on-surface-variant flex-shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kode, atau telepon…" className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-md-on-surface-variant" />
      </div>
      {filtered.length === 0 ? (
        <Kosong teks={q ? "Tidak ada supplier yang cocok." : "Belum ada supplier."} />
      ) : (
        filtered.map((s) => (
          <div key={s.id} className="rounded-2xl bg-md-container border border-md-outline-variant p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-md-surface flex items-center justify-center flex-shrink-0 text-md-on-surface-variant">
                  <Truck size={16} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-amber-500">{s.kode}</div>
                  <div className="text-sm font-semibold text-md-on-surface break-words">{s.nama}</div>
                  {s.telepon && (
                    <a href={`tel:${s.telepon}`} className="inline-flex items-center gap-1 text-[12px] text-sky-400 mt-0.5">
                      <Phone size={11} /> {s.telepon}
                    </a>
                  )}
                  {s.alamat && <div className="text-[11px] text-md-on-surface-variant mt-0.5 break-words">{s.alamat}</div>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => aksi({ type: "supplier-form", item: s })} className="w-9 h-9 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-on-surface/10" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => aksi({ type: "hapus-supplier", item: s })} className="w-9 h-9 flex items-center justify-center rounded-full text-red-400 active:bg-red-500/10" title="Hapus">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {Array.isArray(s.models) && s.models.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400">{s.models.length} model</span>
                {s.models.slice(0, 12).map((m, i) => (
                  <span key={`${m}-${i}`} className="text-[10px] bg-md-surface text-md-on-surface-variant px-1.5 py-0.5 rounded-full">{m}</span>
                ))}
                {s.models.length > 12 && <span className="text-[10px] text-md-on-surface-variant px-1">+{s.models.length - 12}</span>}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Layar utama ----------
export default function PengadaanHp({ session, sub }) {
  const tab = sub || "datang";
  const perluPesanan = tab === "datang";
  const perluSupplier = tab === "datang" || tab === "supplier" || tab === "habis-pakai";
  const perluMaster = tab === "datang" || tab === "habis-pakai";

  const [pesananMasuk, setPesananMasuk] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [master, setMaster] = useState({});
  const [siap, setSiap] = useState(tab === "aset");
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null);
  const [dataModal, setDataModal] = useState({ items: [], skuMaster: [], keuanganTransaksi: [] });
  const [saving, setSaving] = useState(false);
  const [menyiapkan, setMenyiapkan] = useState(false);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  const muat = useCallback(async () => {
    setErr("");
    try {
      const [pm, sup, mst] = await Promise.all([
        perluPesanan ? sbAll("pesanan_masuk?select=*&order=created_at.desc") : null,
        perluSupplier ? sbAll(`suppliers?select=${KOLOM_SUPPLIERS}&order=nama`) : null,
        perluMaster ? muatMaster() : null,
      ]);
      if (pm) setPesananMasuk(pm);
      if (sup) setSuppliers(sup);
      if (mst) setMaster(mst);
      setSiap(true);
    } catch (e) {
      setErr(e.message || "Gagal memuat data pengadaan");
      setSiap(true);
    }
  }, [perluPesanan, perluSupplier, perluMaster]);

  useEffect(() => {
    setSiap(tab === "aset");
    muat();
  }, [muat, tab]);

  // Buka modal: yang butuh data tambahan ditarik dulu (segar), baru dibuka.
  const bukaModal = useCallback(
    async (m) => {
      if (!m) {
        setModal(null);
        return;
      }
      if (!MODAL_BUTUH_DATA.has(m.type)) {
        setModal(m);
        return;
      }
      setMenyiapkan(true);
      try {
        setDataModal(await muatDataModal(m, pesananMasuk));
        setModal(m);
      } catch (e) {
        tampilToast(e.message || "Gagal menyiapkan data", "err");
      } finally {
        setMenyiapkan(false);
      }
    },
    [pesananMasuk, tampilToast]
  );

  if (tab === "aset") {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div className="max-w-xs">
          <div className="w-14 h-14 rounded-2xl bg-md-container mx-auto mb-3 flex items-center justify-center text-md-primary">
            <Landmark size={24} />
          </div>
          <div className="font-bold text-md-on-surface mb-1">Barang Aset</div>
          <p className="text-sm text-md-on-surface-variant">Pencatatan aset perusahaan (komputer, rak, printer, kendaraan) masih disiapkan — di versi komputer pun belum bisa dipakai.</p>
        </div>
      </div>
    );
  }

  if (!siap) return <Memuat />;
  if (err && !suppliers.length && !pesananMasuk.length) return <Galat pesan={err} ulang={() => { setSiap(false); muat(); }} />;

  return (
    <div className="relative">
      {err && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2 flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">{err}</span>
          <button onClick={muat} className="underline font-semibold flex-shrink-0">Muat ulang</button>
        </div>
      )}

      {tab === "supplier" ? (
        <DaftarSupplier suppliers={suppliers} aksi={bukaModal} />
      ) : tab === "habis-pakai" ? (
        <div className="p-4">
          <Suspense fallback={<Memuat />}>
            <BelanjaHabisPakai suppliers={suppliers} master={master} reload={muat} showToast={tampilToast} session={session} />
          </Suspense>
        </div>
      ) : (
        <DaftarBarangDagang pesananMasuk={pesananMasuk} aksi={bukaModal} />
      )}

      {menyiapkan && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center">
          <div className="rounded-2xl bg-md-container-high px-5 py-4 flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> Menyiapkan…
          </div>
        </div>
      )}

      {modal && (
        <ModalRouter
          modal={modal}
          setModal={bukaModal}
          master={master}
          settings={null}
          rakList={[]}
          skuMaster={dataModal.skuMaster}
          penempatan={[]}
          items={dataModal.items}
          pesananMasuk={pesananMasuk}
          suppliers={suppliers}
          keuanganTransaksi={dataModal.keuanganTransaksi}
          marketplaceTransaksi={[]}
          saving={saving}
          setSaving={setSaving}
          reload={muat}
          showToast={tampilToast}
          session={session}
          pelangganGrosir={[]}
          tokoGrosir={[]}
          produkManualGrosir={[]}
          pesananGrosir={[]}
          pembayaranGrosir={[]}
          depositGrosir={[]}
        />
      )}

      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
