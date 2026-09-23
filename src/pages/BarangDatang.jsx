import { useState, Fragment } from "react";
import { Plus, ChevronDown, ChevronRight, ChevronLeft, Trash2, AlertTriangle, Receipt, X, PackageCheck, PackageOpen, Clock, Pencil, Search, Truck } from "lucide-react";
import { PageHeader, EmptyState, StatCard, Badge, formatTanggalID } from "../components/ui";
import { detailModelPesanan, fmtRp, statusPesananMasuk, statusBongkar, statusKonfirmasiDatang, rincianBongkarBox } from "../lib/api";
import { PO_STATUS_META, BONGKAR_META, KONFIRMASI_DATANG_META } from "../lib/constants";

// "Qty Datang" = TOTAL fisik yang datang dari supplier (barang bagus +
// barang rusak dijumlah jadi satu angka) — bukan cuma yang baik saja.
// Qty rusak tetap ditampilkan terpisah di kolom sendiri sebagai rincian.
const qtyDatangModel = (m) => (Number(m.jumlah) || 0) + (Number(m.rusak) || 0);
const totalQtyDatangTransaksi = (detail) => detail.reduce((sum, m) => sum + qtyDatangModel(m), 0);
// Nilai (Rp) satu baris model = TOTAL qty datang (baik + rusak) x
// harga/pcs-nya — HARUS sama persis dengan angka "Total harga barang
// datang" yang sudah dihitung & dikonfirmasi user di form Konfirmasi
// Datang (lihat totalNilai di KonfirmasiDatangForm, forms.jsx), supaya
// tidak selisih sendiri dari yang diinput. Barang rusak tetap ikut
// dihitung di sini karena secara fisik barang itu tetap "datang" dan
// dibayar ke supplier — bukan berarti otomatis masuk stok.
const nilaiModel = (m) => qtyDatangModel(m) * (Number(m.harga) || 0);
const totalNilaiTransaksi = (detail) => detail.reduce((sum, m) => sum + nilaiModel(m), 0);
const totalRusakTransaksi = (detail) => detail.reduce((sum, m) => sum + (Number(m.rusak) || 0), 0);

// Foto bon transaksi ini sebagai array — data baru punya `foto_bon_urls`
// (bisa lebih dari satu), data lama cuma punya `foto_bon_url` tunggal jadi
// dibungkus jadi array 1 elemen supaya kode tampilan bisa seragam.
function fotoBonUrlsOf(p) {
  if (p?.foto_bon_urls?.length > 0) return p.foto_bon_urls;
  return p?.foto_bon_url ? [p.foto_bon_url] : [];
}

// Warna badge jenis barang datang — sama seperti jenis di Barang Masuk
// (Pembelian/Retur/Lainnya) supaya konsisten secara visual di seluruh sistem.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

// Jumlah baris per halaman di tabel "Pesanan Barang" — biar tabel tidak
// memanjang tanpa batas begitu riwayatnya sudah ratusan baris. Pola &
// angka sama seperti BARIS_PER_HALAMAN_BARANG_DATANG di Dashboard.jsx
// supaya perilakunya konsisten di seluruh sistem.
const BARIS_PER_HALAMAN = 10;

// Ringkasan singkat daftar nama model, dipakai di kolom "Model" supaya tabel
// tidak perlu diperlebar — nama lengkap per model tetap bisa dilihat dengan
// membuka baris (lihat SemuaInvoicePanel).
function ringkasNamaModel(detail) {
  const nama = detail.map((m, i) => m.nama || `Model ${i + 1}`);
  const joined = nama.join(", ");
  return joined.length > 42 ? joined.slice(0, 42) + "…" : joined;
}

// Satu baris model di dalam kartu invoice — dibikin menumpuk (bukan kolom
// tabel kaku) supaya di layar sempit/HP semua info (qty rusak, harga,
// subtotal) tetap kelihatan, tidak terpotong ke luar layar seperti tabel
// lama.
function ModelInvoiceRow({ m, idx }) {
  if (m.datang === false) {
    // Baris pesanan yang belum dikonfirmasi datang — model/qty memang belum
    // ketahuan, cuma harga kesepakatan awal yang sudah dicatat waktu pesan.
    return (
      <div className="px-3.5 py-2.5 border-t border-slate-800/60 first:border-t-0">
        <p className="text-[12px] text-amber-400/80 italic">
          Belum datang — model &amp; qty diisi lewat "Konfirmasi Datang"
        </p>
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
          Qty Datang <span className="text-emerald-400 font-semibold">{qtyDatangModel(m)}x</span>
        </span>
        <span>
          Qty Rusak{" "}
          {Number(m.rusak) > 0 ? (
            <span className="text-red-400 font-semibold" title={m.alasan_rusak || ""}>
              {m.rusak}x{m.alasan_rusak ? ` — ${m.alasan_rusak}` : ""}
            </span>
          ) : (
            <span className="text-slate-600 font-semibold">0</span>
          )}
        </span>
        {Number(m.harga) > 0 && (
          <span>
            Harga/pcs <span className="text-slate-300 font-semibold">{fmtRp(m.harga)}</span>
          </span>
        )}
        {Number(m.harga) > 0 && (
          <span>
            Subtotal <span className="text-slate-200 font-semibold">{fmtRp(nilaiModel(m))}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Daftar model untuk SATU invoice (dipakai berulang di SemuaInvoicePanel di
// bawah, satu blok per invoice).
function TabelModelInvoice({ detail }) {
  if (detail.length === 0) {
    return <div className="px-3.5 py-3 text-xs text-slate-600 italic">Belum ada rincian model.</div>;
  }
  return (
    <div>
      {detail.map((m, idx) => (
        <ModelInvoiceRow key={idx} m={m} idx={idx} />
      ))}
    </div>
  );
}

// Panel rincian SATU pesanan, begitu barisnya diklik expand — SEKARANG
// menampilkan SEMUA invoice pesanan ini sekaligus (invoice utama + setiap
// invoice tambahan dari "Tambah Invoice" di Konfirmasi Datang), masing-masing
// dengan tabel modelnya sendiri, persis format yang diminta:
//   INV1
//     Model1  qty datang / qty rusak / harga
//     Model2  ...
//   INV2
//     Model1  ...
// Tidak perlu expand box/expand per-invoice lagi — cukup satu klik di baris
// pesanan. Invoice tambahan TETAP data pesanan yang sama (lihat induk_id di
// ModalRouter "konfirmasi-datang"), cuma disatukan tampilannya di sini.
function SemuaInvoicePanel({ daftarInvoice, colSpan, onLihatFoto, hargaKesepakatan, keteranganSelisih, setModal }) {
  const nilaiGabungan = daftarInvoice.reduce(
    (sum, inv) => sum + totalNilaiTransaksi(detailModelPesanan(inv)),
    0
  );
  const adaKesepakatan = Number(hargaKesepakatan) > 0;
  const selisih = adaKesepakatan ? nilaiGabungan - Number(hargaKesepakatan) : 0;
  const adaSelisih = adaKesepakatan && selisih !== 0;

  return (
    <tr>
      <td colSpan={colSpan} className="bg-slate-950/60 px-3 py-4 sm:px-4">
        <div className="space-y-3">
          {daftarInvoice.map((inv, idx) => {
            const detail = detailModelPesanan(inv);
            const fotoUrls = fotoBonUrlsOf(inv);
            const labelInvoice = inv.no_invoice || inv.kode_pesanan || `Invoice ${idx + 1}`;
            const nilaiInvoice = totalNilaiTransaksi(detail);
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
                    <span className="font-mono font-semibold text-amber-400 truncate">{labelInvoice}</span>
                    {Number(inv.no_box) > 0 && (
                      <span className="text-sky-400 flex-shrink-0 bg-sky-500/10 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                        Box {inv.no_box}
                      </span>
                    )}
                    {inv.resi && (
                      <span className="text-slate-500 truncate hidden sm:inline" title="No. Resi">
                        · Resi {inv.resi}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {nilaiInvoice > 0 && (
                      <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">{fmtRp(nilaiInvoice)}</span>
                    )}
                    {fotoUrls.length > 0 && (
                      <button
                        onClick={() => onLihatFoto(fotoUrls, 0)}
                        className="relative w-7 h-7 rounded overflow-hidden border border-slate-700 hover:border-amber-500"
                        title={fotoUrls.length > 1 ? `Lihat ${fotoUrls.length} foto invoice` : "Lihat foto invoice"}
                      >
                        <img src={fotoUrls[0]} alt="Foto invoice" className="w-full h-full object-cover" />
                        {fotoUrls.length > 1 && (
                          <span className="absolute bottom-0 right-0 bg-slate-950/85 text-amber-400 text-[8px] font-semibold leading-none px-1 py-0.5 rounded-tl">
                            +{fotoUrls.length - 1}
                          </span>
                        )}
                      </button>
                    )}
                    {/* Edit KHUSUS invoice/box ini — kirim `inv` (baris data
                        box ini sendiri), BUKAN `p` (baris root/box 1) yang
                        dipakai tombol Edit di baris utama tabel. Sebelum ada
                        tombol ini, tidak ada cara membuka EditBarangDatangForm
                        untuk box 2/3/dst, jadi Edit selalu jatuh ke box 1. */}
                    <button
                      onClick={() => setModal({ type: "edit-barang-datang", item: inv })}
                      className="p-1 rounded text-slate-500 hover:bg-slate-800 hover:text-amber-400"
                      title="Edit invoice/box ini"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                </div>
                <TabelModelInvoice detail={detail} />
              </div>
            );
          })}

          {adaKesepakatan && (
            <div
              className={`rounded-xl border px-3.5 py-3 text-[11px] space-y-1.5 ${
                adaSelisih ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Ringkasan Harga</div>
              <div className="flex justify-between text-slate-400">
                <span>Total harga kesepakatan</span>
                <span className="text-slate-300 font-medium">{fmtRp(hargaKesepakatan)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total harga barang datang{daftarInvoice.length > 1 ? " (semua invoice)" : ""}</span>
                <span className="text-slate-300 font-medium">{fmtRp(nilaiGabungan)}</span>
              </div>
              {adaSelisih ? (
                <>
                  <div className={`flex justify-between font-semibold pt-1 border-t border-slate-800/60 ${selisih < 0 ? "text-amber-400" : "text-sky-400"}`}>
                    <span>{selisih < 0 ? "Kurang dari kesepakatan" : "Lebih dari kesepakatan"}</span>
                    <span>{fmtRp(Math.abs(selisih))}</span>
                  </div>
                  {keteranganSelisih && (
                    <div className="text-slate-400 pt-0.5">
                      Keterangan: <span className="text-slate-300">{keteranganSelisih}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-emerald-400 font-semibold pt-1 border-t border-slate-800/60">Sesuai kesepakatan</div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function FotoBonLightbox({ urls, index, onClose, onNavigate }) {
  if (!urls || urls.length === 0 || index == null) return null;
  const adaBanyak = urls.length > 1;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-300 hover:text-white bg-slate-900/80 rounded-full p-1.5"
        title="Tutup"
      >
        <X size={18} />
      </button>
      {adaBanyak && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(-1);
          }}
          className="absolute left-4 text-slate-300 hover:text-white bg-slate-900/80 rounded-full p-1.5"
          title="Foto sebelumnya"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <img
        src={urls[index]}
        alt={`Foto bon barang datang ${index + 1}`}
        className="max-w-full max-h-full rounded-lg border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      />
      {adaBanyak && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(1);
          }}
          className="absolute right-4 text-slate-300 hover:text-white bg-slate-900/80 rounded-full p-1.5"
          title="Foto berikutnya"
        >
          <ChevronRight size={20} />
        </button>
      )}
      {adaBanyak && (
        <div className="absolute bottom-4 text-xs text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-full">
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  );
}

// Router halaman "Barang Datang" — punya 2 sub-menu di sidebar sekarang:
// "Daftar Barang Datang" (riwayat pesan/konfirmasi, sudah ada dari dulu) dan
// "Supplier" (master data supplier, baru — disimpan ke tabel "suppliers" di
// database, bukan cuma teks bebas lagi). Pola sama seperti Grosir.jsx yang
// pisahkan "Semua Pesanan" vs "Toko Pengirim" lewat prop `sub`.
export default function BarangDatang({ sub, pesananMasuk, suppliers, setModal }) {
  if (sub === "supplier") return <SupplierList suppliers={suppliers} setModal={setModal} />;
  return <DaftarBarangDatang pesananMasuk={pesananMasuk} setModal={setModal} />;
}

// Satu baris invoice di tabel "Pesanan Barang" — dipakai baik untuk baris
// utama (resi-nya sendiri) maupun untuk tiap invoice tambahan yang
// ditampilkan di dalam grup Box, atau di daftar flat begitu semua box
// sudah final. `anak` = true kalau ini invoice tambahan (bukan baris utama
// resi), dipakai buat indent & label kecil "Invoice tambahan". `hideBoxLabel`
// = true kalau label "Box N" harus disembunyikan — karena semua box resinya
// sudah final (lihat aturan lengkap di DaftarBarangDatang), atau karena box
// itu sudah terwakili oleh header grup di atasnya jadi label per-baris jadi
// mubazir.
function BarisInvoice({ p, anak, hideBoxLabel, rincianBox, anakInvoice, expanded, toggle, setModal, lihatFoto }) {
  // daftarInvoice = invoice utama (p) + semua invoice tambahan ("Tambah
  // Invoice" di Konfirmasi Datang) yang masih satu pesanan yang sama —
  // dipakai untuk ringkasan gabungan di baris ini DAN untuk panel rincian
  // begitu di-expand (lihat SemuaInvoicePanel), supaya jumlah model/qty/nilai
  // yang tampil di tabel sudah termasuk semua invoice, tidak cuma yang utama.
  const daftarInvoice = [p, ...(anakInvoice || [])];
  const detail = daftarInvoice.flatMap((inv) => detailModelPesanan(inv));
  const nilai = totalNilaiTransaksi(detail);
  const rusak = totalRusakTransaksi(detail);
  const isOpen = expanded.has(p.id);
  const status = statusPesananMasuk(p);
  const statusMeta = PO_STATUS_META[status] || PO_STATUS_META.menunggu;
  const belumSelesai = status === "menunggu" || status === "sebagian";
  const isDraft = status === "draft";
  const konfirmasiDatang = statusKonfirmasiDatang(p);
  const bongkar = statusBongkar(p);
  return (
    <Fragment key={p.id}>
      <tr className={`border-b border-slate-800/60 last:border-0 ${anak ? "bg-slate-900/30" : ""}`}>
        <td className="pl-3">
          <div className={`flex items-center ${anak ? "pl-4" : ""}`}>
            {anak && (
              <span
                className="text-slate-700 mr-1 text-[11px] leading-none"
                title="Invoice tambahan di box yang sama"
              >
                ↳
              </span>
            )}
            <button
              onClick={() => toggle(p.id)}
              className="text-slate-500 hover:text-slate-300"
              title="Lihat rincian per model"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="font-mono text-[11px] text-amber-400">{p.kode_pesanan || p.resi || "—"}</span>
          {anak && (
            <div className="text-[9px] uppercase tracking-wide text-slate-600 mt-0.5">
              Invoice tambahan
            </div>
          )}
          {p.resi && p.kode_pesanan && (
            <div className="text-[10px] text-slate-500 mt-0.5" title="No. Resi">
              {p.resi}
            </div>
          )}
          {!hideBoxLabel && Number(p.no_box) > 0 && (
            <div className="text-[10px] text-sky-400 mt-0.5" title="Invoice ini ada di box nomor berapa">
              Box {p.no_box}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-slate-300 text-[12px] leading-tight">
          {(() => {
            const tgl = formatTanggalID(p.tanggal_pesan);
            if (!tgl) return "—";
            const [hari, bulan, tahun] = tgl.split(" ");
            return (
              <>
                <div className="whitespace-nowrap">{hari} {bulan}</div>
                <div className="text-slate-500">{tahun}</div>
              </>
            );
          })()}
        </td>
        <td className="px-3 py-2.5 text-slate-300">{p.supplier || "—"}</td>
        <td className="px-3 py-2.5">
          <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
        </td>
        <td className="px-3 py-2.5">
          <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
        </td>
        <td className="px-3 py-2.5">
          {konfirmasiDatang ? (
            <button
              onClick={() => setModal({ type: "toggle-konfirmasi-datang", item: p })}
              title={
                konfirmasiDatang === "sudah"
                  ? "Klik untuk tandai belum datang"
                  : "Klik untuk tandai sudah datang"
              }
            >
              <Badge color={KONFIRMASI_DATANG_META[konfirmasiDatang].color}>
                {KONFIRMASI_DATANG_META[konfirmasiDatang].label}
              </Badge>
            </button>
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {rincianBox ? (
            <span
              title="Jumlah box yang sudah dibongkar (dikonfirmasi lewat Konfirmasi Datang) dari total box fisik pesanan ini"
              className={
                rincianBox.selesai >= rincianBox.total
                  ? "text-emerald-400 font-semibold"
                  : rincianBox.selesai > 0
                  ? "text-amber-400 font-semibold"
                  : "text-slate-500 font-semibold"
              }
            >
              {rincianBox.selesai}/{rincianBox.total}
            </span>
          ) : bongkar ? (
            <span title="Status bongkar otomatis mengikuti progres rincian model di Konfirmasi Datang">
              <Badge color={BONGKAR_META[bongkar].color}>{BONGKAR_META[bongkar].label}</Badge>
            </span>
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {(() => {
            const fotoUrls = fotoBonUrlsOf(p);
            return fotoUrls.length > 0 ? (
              <button
                onClick={() => lihatFoto(fotoUrls, 0)}
                className="relative block w-9 h-9 rounded-md overflow-hidden border border-slate-800 hover:border-amber-500"
                title={fotoUrls.length > 1 ? `Lihat ${fotoUrls.length} foto invoice` : "Lihat foto invoice"}
              >
                <img src={fotoUrls[0]} alt="Foto invoice" className="w-full h-full object-cover" />
                {fotoUrls.length > 1 && (
                  <span className="absolute bottom-0 right-0 bg-slate-950/85 text-amber-400 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-tl">
                    +{fotoUrls.length - 1}
                  </span>
                )}
              </button>
            ) : (
              <span className="text-slate-700" title="Tidak ada foto invoice">
                <Receipt size={16} />
              </span>
            );
          })()}
        </td>
        <td className="px-3 py-2.5 text-slate-400">
          <button onClick={() => toggle(p.id)} className="text-left hover:text-slate-200">
            {status === "menunggu" ? (
              <span className="text-amber-400/80 italic">Belum ada rincian</span>
            ) : detail.length === 0 || detail.every((m) => !m.nama && !m.jumlah) ? (
              <span className="text-violet-400/80 italic">Draf — belum diisi</span>
            ) : (
              <>
                {detail.length} model
                <span className="block text-slate-600 text-[11px]">{ringkasNamaModel(detail)}</span>
              </>
            )}
          </button>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="text-emerald-400 font-medium">{totalQtyDatangTransaksi(detail)}x</span>
          {rusak > 0 ? (
            <span className="inline-flex items-center gap-1 text-red-400 text-[11px] ml-1.5" title="Qty rusak">
              <AlertTriangle size={11} /> {rusak}x
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
          {nilai ? fmtRp(nilai) : "—"}
          {Number(p.harga_kesepakatan) > 0 && nilai !== Number(p.harga_kesepakatan) && (
            <span
              className="inline-flex ml-1.5 text-amber-400 align-middle"
              title={`Beda dari kesepakatan (${fmtRp(p.harga_kesepakatan)})${
                p.keterangan_selisih ? ` — ${p.keterangan_selisih}` : ""
              }`}
            >
              <AlertTriangle size={12} />
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            {isDraft && (
              <button
                onClick={() =>
                  setModal({ type: "konfirmasi-datang", item: p })
                }
                className="p-1.5 rounded-lg text-violet-400 hover:bg-slate-800"
                title="Lanjutkan mengisi draf ini — bisa disimpan sebagai draf lagi atau difinalisasi"
              >
                <PackageCheck size={14} />
              </button>
            )}
            {!isDraft && belumSelesai && (
              <button
                onClick={() => konfirmasiDatang === "sudah" && setModal({ type: "konfirmasi-datang", item: p })}
                disabled={konfirmasiDatang !== "sudah"}
                className={`p-1.5 rounded-lg ${
                  konfirmasiDatang === "sudah"
                    ? "text-amber-400 hover:bg-slate-800"
                    : "text-slate-600 cursor-not-allowed"
                }`}
                title={
                  konfirmasiDatang === "sudah"
                    ? "Konfirmasi Datang — isi rincian model & qty yang datang"
                    : 'Tandai "Sudah Datang" dulu di kolom Datang? sebelum mengisi rincian'
                }
              >
                <PackageCheck size={14} />
              </button>
            )}
            {!isDraft && status !== "menunggu" && (
              <button
                onClick={() => setModal({ type: "edit-barang-datang", item: p })}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-amber-400"
                title="Edit tanggal, supplier, jenis, foto invoice, nama/harga model"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              onClick={() => setModal({ type: "hapus-pesanan-masuk", item: p })}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-red-400"
              title="Hapus riwayat ini"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <SemuaInvoicePanel
          key={`${p.id}-detail`}
          daftarInvoice={daftarInvoice}
          colSpan={13}
          onLihatFoto={lihatFoto}
          hargaKesepakatan={p.harga_kesepakatan}
          keteranganSelisih={p.keterangan_selisih}
          setModal={setModal}
        />
      )}
    </Fragment>
  );
}

function DaftarBarangDatang({ pesananMasuk, setModal }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [fotoLightbox, setFotoLightbox] = useState(null); // { urls, index } | null
  const lihatFoto = (urls, index) => setFotoLightbox({ urls, index });
  const navigasiFoto = (delta) =>
    setFotoLightbox((s) =>
      s ? { ...s, index: (s.index + delta + s.urls.length) % s.urls.length } : s
    );
  const [halaman, setHalaman] = useState(1);
  const [showRincianBongkar, setShowRincianBongkar] = useState(false);
  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Urutkan berdasarkan waktu SIMPAN sebenarnya (created_at) — bukan cuma
  // tanggal_pesan, karena tanggal_pesan bisa diisi manual mundur (mis. catat
  // belakangan untuk pesanan minggu lalu) sehingga entri yang baru saja
  // disimpan bisa "tenggelam" kalau cuma diurutkan dari tanggal itu. Dengan
  // created_at, pesanan yang paling baru DIINPUT selalu tampil paling atas.
  // Fallback ke tanggal_pesan untuk data lama yang mungkin belum punya
  // created_at.
  const semua = [...(pesananMasuk || [])]
    .filter((p) => !p.dibatalkan)
    .sort((a, b) => {
      const waktuA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const waktuB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (waktuA !== waktuB) return waktuB - waktuA;
      return a.tanggal_pesan < b.tanggal_pesan ? 1 : -1;
    });

  // Bon tambahan (invoice ke-2/3/dst di box yang sama, lihat "Tambah
  // Invoice" di Konfirmasi Datang) disimpan sebagai baris pesanan_masuk
  // TERPISAH di database (induk_id menunjuk balik ke pesanan induknya) —
  // tapi di tabel ini SENGAJA tidak ditampilkan sejajar sebagai baris
  // sendiri, supaya tidak menuh-menuhin & bikin bingung box mana punya
  // siapa. Sebagai gantinya, bon tambahan ditampilkan sebagai sub-baris
  // yang menempel tepat di bawah baris induknya (lihat pemakaian anakDari
  // di bawah). Kalau induknya kebetulan tidak ada di daftar aktif (mis.
  // sudah dibatalkan/terhapus), bon tambahan itu fallback tampil sebagai
  // baris biasa (top-level) supaya datanya tidak "hilang" dari tabel.
  const semuaId = new Set(semua.map((p) => p.id));
  const top = semua.filter((p) => !p.induk_id || !semuaId.has(p.induk_id));
  const anakDari = (id) => semua.filter((p) => p.induk_id === id);

  const jumlahBelumBongkar = semua.filter((p) => statusBongkar(p) === "belum").length;
  const jumlahSebagianBongkar = semua.filter((p) => statusBongkar(p) === "sebagian").length;
  const jumlahSudahBongkar = semua.filter((p) => statusBongkar(p) === "sudah").length;
  // Laporan kedatangan — dihitung dari SEMUA pesanan aktif (bukan cuma yang
  // sudah datang, beda dari 2 angka bongkar di atas), supaya kelihatan juga
  // berapa yang masih menunggu ditandai datang.
  const jumlahSudahDatang = semua.filter((p) => statusKonfirmasiDatang(p) === "sudah").length;
  const jumlahBelumDatang = semua.filter((p) => statusKonfirmasiDatang(p) === "belum").length;

  // Paginasi dihitung dari baris TOP-LEVEL saja (satu box = satu baris di
  // tabel) — bon tambahan ikut baris induknya, jadi tidak dihitung sebagai
  // baris sendiri di sini walau tetap kelihatan (sebagai sub-baris) di
  // halaman yang sama dengan induknya.
  const list = top;

  // Kalau halaman aktif jadi kelebihan (mis. sebelumnya di halaman 5 lalu
  // sebagian riwayat dihapus sehingga cuma tersisa 2 halaman), tarik balik
  // ke halaman terakhir yang masih valid supaya tidak nampak tabel kosong.
  const totalHalaman = Math.max(1, Math.ceil(list.length / BARIS_PER_HALAMAN));
  const halamanAktif = Math.min(halaman, totalHalaman);
  const paged = list.slice(
    (halamanAktif - 1) * BARIS_PER_HALAMAN,
    halamanAktif * BARIS_PER_HALAMAN
  );

  return (
    <div>
      <PageHeader
        title="Pesanan Barang"
        description={`Pesan dulu lewat "Pesan Barang" begitu tahu toko & harga kesepakatan, lalu buka baris itu lagi dan pakai "Konfirmasi Datang" begitu barangnya benar-benar sampai untuk isi rincian model & qty. Riwayatnya tetap satu, nyambung dari pesan sampai datang.`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ type: "pesan-barang" })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Clock size={14} /> Pesan Barang
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Pesanan" value={top.length} icon={Clock} accent="text-slate-200" iconColor="text-slate-400" />
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowRincianBongkar((s) => !s)}
          onKeyDown={(e) => e.key === "Enter" && setShowRincianBongkar((s) => !s)}
          className="w-full text-left rounded-md-lg bg-md-container-low p-4 shadow-elevation-1 hover:shadow-elevation-2 transition-shadow cursor-pointer"
          title={showRincianBongkar ? "Klik untuk sembunyikan rincian bongkar" : "Klik untuk lihat rincian bongkar"}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2 bg-md-on-surface/[0.06] text-sky-500">
            <Truck size={15} />
          </div>
          <div className="text-2xl font-medium text-sky-400">{jumlahSudahDatang}</div>
          <div className="text-xs text-md-on-surface-variant mt-1">Sudah Datang</div>
          {showRincianBongkar && (
            <div className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center gap-1.5">
              <PackageOpen size={11} className="text-emerald-500" />
              <span className="text-emerald-400">{jumlahSudahBongkar} dibongkar</span>
              <span className="text-slate-700">·</span>
              <span className="text-sky-400">{jumlahSebagianBongkar} sebagian</span>
              <span className="text-slate-700">·</span>
              <span className="text-amber-400">{jumlahBelumBongkar} belum dibongkar</span>
            </div>
          )}
        </div>
        <StatCard label="Belum Datang" value={jumlahBelumDatang} icon={Clock} accent="text-amber-400" iconColor="text-amber-500" />
      </div>

      {list.length === 0 ? (
        <EmptyState label="Belum ada barang datang yang dicatat." />
      ) : (
        <div className="rounded-xl border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2.5"></th>
                <th className="px-3 py-2.5">Kode Pesanan</th>
                <th className="px-3 py-2.5">Tanggal</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Jenis</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Datang?</th>
                <th className="px-3 py-2.5">Bongkar</th>
                <th className="px-3 py-2.5">Invoice</th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-3 py-2.5">Qty Datang/Rusak</th>
                <th className="px-3 py-2.5">Nilai</th>
                <th className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const rincianBox = rincianBongkarBox(p, semua);
                const anak = anakDari(p.id);
                // Semua box resi ini sudah final kalau progres bongkar per
                // box sudah penuh (selesai >= total) — sama seperti kolom
                // "Bongkar" yang sudah dipakai di baris utama. Kalau resinya
                // tidak pernah punya jumlah_box (rincianBox null), anggap
                // "final" langsung. Dipakai buat sembunyikan label "Box N"
                // begitu semua box sudah beres (sudah jelas dari status).
                const semuaBoxFinal = rincianBox ? rincianBox.selesai >= rincianBox.total : true;

                // Begitu baris ini di-expand, SemuaInvoicePanel (lihat
                // BarisInvoice) langsung menampilkan invoice utama + semua
                // invoice tambahan (anak) sekaligus dalam satu panel —
                // tidak perlu lagi expand per box/per invoice satu-satu.
                return (
                  <BarisInvoice
                    key={p.id}
                    p={p}
                    anak={false}
                    hideBoxLabel={semuaBoxFinal}
                    rincianBox={rincianBox}
                    anakInvoice={anak}
                    expanded={expanded}
                    toggle={toggle}
                    setModal={setModal}
                    lihatFoto={lihatFoto}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {totalHalaman > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Halaman {halamanAktif} dari {totalHalaman}{" "}
              <span className="text-slate-600">({list.length} data)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHalaman((h) => Math.max(1, h - 1))}
                disabled={halamanAktif <= 1}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
                disabled={halamanAktif >= totalHalaman}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      <FotoBonLightbox
        urls={fotoLightbox?.urls}
        index={fotoLightbox?.index}
        onClose={() => setFotoLightbox(null)}
        onNavigate={navigasiFoto}
      />
    </div>
  );
}

// =========================================================
// SUPPLIER — master data supplier/distributor barang datang, disimpan di
// tabel "suppliers" (lihat App.jsx loadCore & ModalRouter "supplier-form" /
// "hapus-supplier"). Dipakai sebagai daftar saran (datalist) di kolom
// Supplier/Toko pada form Input Barang Datang, Pesan Barang, dan Edit Riwayat
// — supaya nama supplier konsisten & tidak beda ejaan tiap dicatat ulang.
function SupplierList({ suppliers, setModal }) {
  const [q, setQ] = useState("");
  const filtered = (suppliers || []).filter((s) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      s.nama?.toLowerCase().includes(query) ||
      s.kode?.toLowerCase().includes(query) ||
      s.telepon?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <PageHeader
        title="Data Supplier"
        description="Daftar supplier/distributor untuk pemesanan & pencatatan barang datang."
        action={
          <button
            onClick={() => setModal({ type: "supplier-form", item: null })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg"
          >
            <Plus size={14} /> Tambah Supplier
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, kode, atau telepon…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label={q ? "Tidak ada supplier yang cocok." : "Belum ada supplier."} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {filtered.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-start justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-500">
                  <Truck size={14} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-amber-400">{s.kode}</span>
                    <span className="text-sm text-slate-200 truncate">{s.nama}</span>
                    {Array.isArray(s.models) && s.models.length > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 flex-shrink-0">
                        {s.models.length} model
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {[s.telepon, s.alamat].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {Array.isArray(s.models) && s.models.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {s.models.map((m, mi) => (
                        <span
                          key={`${m}-${mi}`}
                          className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setModal({ type: "supplier-form", item: s })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setModal({ type: "hapus-supplier", item: s })}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}