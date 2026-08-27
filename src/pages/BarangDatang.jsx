import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Trash2, AlertTriangle, Receipt, X, PackageCheck, Clock, Pencil } from "lucide-react";
import { PageHeader, EmptyState, Badge, formatTanggalID } from "../components/ui";
import { detailModelPesanan, fmtRp, statusPesananMasuk } from "../lib/api";
import { PO_STATUS_META } from "../lib/constants";

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

// Warna badge jenis barang datang — sama seperti jenis di Barang Masuk
// (Pembelian/Retur/Lainnya) supaya konsisten secara visual di seluruh sistem.
const JENIS_COLOR = { Pembelian: "emerald", Retur: "amber" };
const jenisColor = (j) => JENIS_COLOR[j] || "slate";

// Ringkasan singkat daftar nama model, dipakai di kolom "Model" supaya tabel
// tidak perlu diperlebar — nama lengkap per model tetap bisa dilihat dengan
// membuka baris (lihat DetailModelPanel).
function ringkasNamaModel(detail) {
  const nama = detail.map((m, i) => m.nama || `Model ${i + 1}`);
  const joined = nama.join(", ");
  return joined.length > 42 ? joined.slice(0, 42) + "…" : joined;
}

function DetailModelPanel({ detail, colSpan, kodeBon, fotoBonUrl, onLihatFoto, hargaKesepakatan, keteranganSelisih }) {
  const nilaiDatang = totalNilaiTransaksi(detail);
  const adaKesepakatan = Number(hargaKesepakatan) > 0;
  const selisih = adaKesepakatan ? nilaiDatang - Number(hargaKesepakatan) : 0;
  const adaSelisih = adaKesepakatan && selisih !== 0;
  return (
    <tr>
      <td colSpan={colSpan} className="bg-slate-900/50 px-4 py-3">
        <div className="flex gap-4 items-start">
          <div className="flex-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-slate-500">
                <th className="pb-1.5 pr-4">Model</th>
                <th className="pb-1.5 pr-4">Qty Datang</th>
                <th className="pb-1.5 pr-4">Qty Rusak</th>
                <th className="pb-1.5 pr-4">Harga/pcs</th>
                <th className="pb-1.5">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {detail.map((m, idx) =>
                m.datang === false ? (
                  // Baris pesanan yang belum dikonfirmasi datang — model/qty
                  // memang belum ketahuan, cuma harga kesepakatan awal yang
                  // sudah dicatat waktu pesan (lihat PesanBarangForm).
                  <tr key={idx} className="border-t border-slate-800/60">
                    <td colSpan={4} className="py-1.5 pr-4 text-amber-400/80 italic">
                      Belum datang — model &amp; qty diisi lewat "Konfirmasi Datang"
                    </td>
                    <td className="py-1.5 text-slate-400">
                      {m.harga_total_pesan ? `Total kesepakatan ${fmtRp(m.harga_total_pesan)}` : "—"}
                    </td>
                  </tr>
                ) : (
                  <tr key={idx} className="border-t border-slate-800/60">
                    <td className="py-1.5 pr-4 text-slate-300">{m.nama || `Model ${idx + 1}`}</td>
                    <td className="py-1.5 pr-4 text-emerald-400">{qtyDatangModel(m)}x</td>
                    <td className="py-1.5 pr-4">
                      {Number(m.rusak) > 0 ? (
                        <span className="text-red-400" title={m.alasan_rusak || ""}>
                          {m.rusak}x{m.alasan_rusak ? ` — ${m.alasan_rusak}` : ""}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 text-slate-400">{m.harga ? fmtRp(m.harga) : "—"}</td>
                    <td className="py-1.5 text-slate-300">{m.harga ? fmtRp(nilaiModel(m)) : "—"}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {adaKesepakatan && (
            <div
              className={`mt-2.5 rounded-lg border px-3 py-2 text-[11px] space-y-1 max-w-sm ${
                adaSelisih ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"
              }`}
            >
              <div className="flex justify-between text-slate-400">
                <span>Total harga kesepakatan</span>
                <span className="text-slate-300 font-medium">{fmtRp(hargaKesepakatan)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total harga barang datang</span>
                <span className="text-slate-300 font-medium">{fmtRp(nilaiDatang)}</span>
              </div>
              {adaSelisih ? (
                <>
                  <div className={`flex justify-between font-semibold ${selisih < 0 ? "text-amber-400" : "text-sky-400"}`}>
                    <span>{selisih < 0 ? "Kurang dari kesepakatan" : "Lebih dari kesepakatan"}</span>
                    <span>{fmtRp(Math.abs(selisih))}</span>
                  </div>
                  {keteranganSelisih && (
                    <div className="text-slate-400 pt-0.5 border-t border-slate-800/60">
                      Keterangan: <span className="text-slate-300">{keteranganSelisih}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-emerald-400 font-semibold">Sesuai kesepakatan</div>
              )}
            </div>
          )}
          </div>

          <div className="shrink-0 w-32">
            <div className="text-[10px] uppercase text-slate-500 mb-1.5">
              Foto Bon <span className="normal-case text-amber-400 font-mono">{kodeBon || ""}</span>
            </div>
            {fotoBonUrl ? (
              <button
                onClick={() => onLihatFoto(fotoBonUrl)}
                className="block w-32 h-32 rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500"
                title="Lihat foto bon ukuran penuh"
              >
                <img src={fotoBonUrl} alt="Foto bon barang datang" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-32 h-32 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-slate-700">
                <Receipt size={20} />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function FotoBonLightbox({ url, onClose }) {
  if (!url) return null;
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
      <img
        src={url}
        alt="Foto bon barang datang"
        className="max-w-full max-h-full rounded-lg border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function BarangDatang({ pesananMasuk, setModal }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [fotoLightbox, setFotoLightbox] = useState(null);
  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const list = [...pesananMasuk]
    .filter((p) => !p.dibatalkan)
    .sort((a, b) => (a.tanggal_pesan < b.tanggal_pesan ? 1 : -1));

  return (
    <div>
      <PageHeader
        title="Barang Datang"
        description={`Baru tahu toko & harga saat pesan? Pakai "Pesan Barang" dulu, lalu "Konfirmasi Datang" di baris itu begitu barangnya sampai — riwayatnya tetap satu, nyambung dari pesan sampai datang. Kalau barang sudah langsung di tangan (tanpa pesan dulu), pakai "Input Barang Datang" langsung.`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ type: "pesan-barang" })}
              className="flex items-center gap-1.5 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-amber-400 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Clock size={14} /> Pesan Barang
            </button>
            <button
              onClick={() => setModal({ type: "barang-datang" })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Input Barang Datang
            </button>
          </div>
        }
      />

      {list.length === 0 ? (
        <EmptyState label="Belum ada barang datang yang dicatat." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[1280px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5"></th>
                <th className="px-4 py-2.5">Kode Bon</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Bon</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Qty Datang</th>
                <th className="px-4 py-2.5">Qty Rusak</th>
                <th className="px-4 py-2.5">Nilai</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const detail = detailModelPesanan(p);
                const nilai = totalNilaiTransaksi(detail);
                const rusak = totalRusakTransaksi(detail);
                const isOpen = expanded.has(p.id);
                const status = statusPesananMasuk(p);
                const statusMeta = PO_STATUS_META[status] || PO_STATUS_META.menunggu;
                const belumSelesai = status === "menunggu" || status === "sebagian";
                return (
                  <>
                    <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="pl-3">
                        <button
                          onClick={() => toggle(p.id)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Lihat rincian per model"
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-[11px] text-amber-400">{p.kode_bon || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-300">{formatTanggalID(p.tanggal_pesan)}</td>
                      <td className="px-4 py-2.5 text-slate-300">{p.supplier || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={jenisColor(p.jenis)}>{p.jenis || "—"}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge color={statusMeta.color}>{statusMeta.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {p.foto_bon_url ? (
                          <button
                            onClick={() => setFotoLightbox(p.foto_bon_url)}
                            className="block w-9 h-9 rounded-md overflow-hidden border border-slate-800 hover:border-amber-500"
                            title="Lihat foto bon"
                          >
                            <img src={p.foto_bon_url} alt="Foto bon" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-slate-700" title="Tidak ada foto bon">
                            <Receipt size={16} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        <button onClick={() => toggle(p.id)} className="text-left hover:text-slate-200">
                          {status === "menunggu" ? (
                            <span className="text-amber-400/80 italic">Belum ada rincian</span>
                          ) : (
                            <>
                              {detail.length} model
                              <span className="block text-slate-600 text-[11px]">{ringkasNamaModel(detail)}</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-emerald-400">{totalQtyDatangTransaksi(detail)}x</td>
                      <td className="px-4 py-2.5">
                        {rusak > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <AlertTriangle size={12} /> {rusak}x
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">
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
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-3">
                          {belumSelesai && (
                            <button
                              onClick={() => setModal({ type: "konfirmasi-datang", item: p })}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                              title="Isi rincian model & qty yang datang"
                            >
                              <PackageCheck size={13} /> Konfirmasi Datang
                            </button>
                          )}
                          {status !== "menunggu" && (
                            <button
                              onClick={() => setModal({ type: "edit-barang-datang", item: p })}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-amber-400"
                              title="Edit tanggal, supplier, jenis, foto bon, nama/harga model"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          )}
                          <button
                            onClick={() => setModal({ type: "hapus-pesanan-masuk", item: p })}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-400"
                            title="Hapus riwayat ini"
                          >
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <DetailModelPanel
                        key={`${p.id}-detail`}
                        detail={detail}
                        colSpan={12}
                        kodeBon={p.kode_bon}
                        fotoBonUrl={p.foto_bon_url}
                        onLihatFoto={setFotoLightbox}
                        hargaKesepakatan={p.harga_kesepakatan}
                        keteranganSelisih={p.keterangan_selisih}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <FotoBonLightbox url={fotoLightbox} onClose={() => setFotoLightbox(null)} />
    </div>
  );
}