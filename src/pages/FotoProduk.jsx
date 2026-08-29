import { useState } from "react";
import { ImageOff, RotateCcw, Camera, Search, CheckCircle2, Circle, X } from "lucide-react";
import { PageHeader, EmptyState } from "../components/ui";
import { calcHarga, fmtRp } from "../lib/api";

// Dua tab: "Foto Baru" (barang yang belum pernah difoto sama sekali) dan
// "Foto Ulang" (barang yang sudah pernah difoto tapi ditarik balik ke sini
// karena ada perubahan — harga SKU baru diganti, atau alasan lain — lihat
// resolveHargaSku di lib/api.js untuk pemicu "harga berubah"). Sebelum
// ini dua-duanya dicampur dalam satu grid dengan badge "Harga berubah";
// sekarang dipisah jadi dua tab supaya admin bisa fokus kerjakan satu per
// satu dan langsung kelihatan berapa banyak yang perlu difoto ulang.
const TABS = [
  { key: "baru", label: "Foto Baru", icon: Camera },
  { key: "ulang", label: "Foto Ulang", icon: RotateCcw },
];

export default function FotoProduk({ items, setModal, skuMaster, settings }) {
  const list = items.filter((i) => i.stage === "verifikasi");
  // Barang yang ditarik balik ke sini gara-gara ada perubahan (mis. harga
  // SKU-nya baru saja diganti — lihat resolveHargaSku di lib/api.js)
  // — fotonya masih foto lama dan wajib difoto ulang karena sudah tidak
  // akurat lagi (harga, atau perubahan lain).
  const fotoBaru = list.filter((i) => !i.perlu_foto_ulang);
  const fotoUlang = list.filter((i) => i.perlu_foto_ulang);

  const [tab, setTab] = useState("baru");
  const [q, setQ] = useState("");
  // SKU-SKU yang dicentang untuk dipotret sekaligus dalam SATU foto (lihat
  // "advance-verifikasi-banyak" di ModalRouter) — direset tiap pindah tab
  // supaya tidak kebawa nyasar milih SKU dari tab lain yang beda konteks.
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelect = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Reset pencarian tiap pindah tab supaya tidak kebawa nyasar nyari SKU
  // yang cuma relevan di tab satunya.
  const gantiTab = (key) => {
    setTab(key);
    setQ("");
    setSelected(new Set());
  };
  const activeListMentah = tab === "ulang" ? fotoUlang : fotoBaru;
  const activeList = activeListMentah.filter((i) => i.sku.toLowerCase().includes(q.toLowerCase()));
  const itemsTerpilih = activeList.filter((i) => selected.has(i.id));

  return (
    <div>
      <PageHeader
        title="Pemotretan"
        description={
          tab === "ulang"
            ? "Barang yang sudah pernah difoto tapi perlu difoto ulang karena ada perubahan (mis. harga)."
            : "Barang yang belum pernah difoto dan siap difoto pertama kali."
        }
      />

      <div className="flex items-center gap-2 mb-5 bg-slate-900 border border-slate-800 rounded-lg p-1 max-w-sm">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          const count = t.key === "ulang" ? fotoUlang.length : fotoBaru.length;
          return (
            <button
              key={t.key}
              onClick={() => gantiTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition ${
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} /> {t.label}
              {count > 0 && (
                <span
                  className={`text-[10px] font-semibold px-1.5 rounded-full ${
                    active ? "bg-slate-950/20" : "bg-slate-800"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>
      <p className="text-[11px] text-slate-500 mb-3 -mt-1">
        Centang beberapa SKU sekaligus kalau mau motret satu foto untuk beberapa SKU (mis. beda
        varian tapi tampilannya sama).
      </p>

      {activeList.length === 0 ? (
        <EmptyState
          label={
            q
              ? "Tidak ada SKU yang cocok dengan pencarian."
              : tab === "ulang"
              ? "Tidak ada barang yang perlu difoto ulang."
              : "Tidak ada barang baru yang menunggu pemotretan."
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeList.map((item) => {
            // Perbandingan harga dibaca langsung dari SNAPSHOT di barangnya
            // sendiri (harga_lama_foto/harga_baru_foto, diisi waktu keputusan
            // harga dibuat — lihat resolveHargaSku di lib/api.js). TIDAK lagi
            // mengandalkan sku_master.harga_asli_baru, karena kolom itu sudah
            // di-null-kan begitu keputusan dibuat — begitu halaman ini reload,
            // datanya sudah hilang duluan kalau masih pakai cara lama.
            const adaPerbandingan =
              item.perlu_foto_ulang && item.harga_lama_foto != null && item.harga_baru_foto != null && settings;
            const previewLama = adaPerbandingan ? calcHarga(item.harga_lama_foto, settings) : null;
            const previewBaru = adaPerbandingan ? calcHarga(item.harga_baru_foto, settings) : null;

            // Kartu ini cuma mewakili SATU baris item (biasanya batch restock
            // paling baru — lihat resolveHargaSku di lib/api.js yang menarik
            // hanya baris terbaru ke Verifikasi Foto). Tapi qty yang wajar
            // ditampilkan ke admin adalah TOTAL stok SKU ini di gudang, bukan
            // cuma qty batch itu sendiri — makanya diambil dari sku_master.stok
            // (sumber kebenaran stok per SKU), dengan fallback ke item.jumlah
            // kalau SKU-nya entah kenapa tidak ketemu di skuMaster.
            const skuRow = (skuMaster || []).find((s) => s.sku === item.sku);
            const totalStok = skuRow?.stok != null ? skuRow.stok : item.jumlah;

            // Barang di tab "Foto Ulang" biasanya BELUM punya foto_url sendiri
            // (ditarik dari batch baru yang memang belum pernah difoto — lihat
            // resolveHargaSku di lib/api.js). Supaya admin tetap ada acuan foto
            // lama waktu motret ulang, cari foto TERAKHIR dari barang lain yang
            // SKU-nya sama (pola yang sama dipakai di modal "detail-sku" —
            // ModalRouter.jsx). Ini murni referensi, bukan foto barang ini
            // sendiri, jadi ditandai beda (label "Foto terakhir" + agak transparan).
            const fotoTerakhir = !item.foto_url
              ? (items || [])
                  .filter((i) => i.sku === item.sku && i.foto_url && i.id !== item.id)
                  .sort(
                    (a, b) =>
                      new Date(b.created_at || b.tanggal || 0) - new Date(a.created_at || a.tanggal || 0)
                  )[0]
              : null;

            return (
            <div
              key={item.id}
              className={`bg-slate-900 border rounded-lg p-3 relative ${
                selected.has(item.id)
                  ? "border-amber-500 ring-1 ring-amber-500/50"
                  : item.perlu_foto_ulang
                  ? "border-amber-500/40"
                  : "border-slate-800"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSelect(item.id)}
                className={`absolute top-2 right-2 z-10 rounded-full ${
                  selected.has(item.id) ? "text-amber-400 bg-slate-950" : "text-slate-500 bg-slate-950/80 hover:text-slate-300"
                }`}
                title={selected.has(item.id) ? "Batalkan pilih SKU ini" : "Pilih SKU ini untuk difoto sekaligus"}
              >
                {selected.has(item.id) ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </button>
              {item.perlu_foto_ulang && (
                <div className="absolute -top-2 left-2 flex items-center gap-1 bg-amber-500 text-slate-950 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  <RotateCcw size={10} />
                  Harga berubah
                </div>
              )}
              {adaPerbandingan && (
                <div className="mt-1 mb-2 rounded-md border border-amber-500/30 overflow-hidden text-[10px]">
                  <div className="grid grid-cols-3 uppercase text-slate-500 px-2 pt-1.5">
                    <span></span>
                    <span>Lama</span>
                    <span>Baru</span>
                  </div>
                  {[
                    ["Asli", previewLama.hargaDasar, previewBaru.hargaDasar],
                    ["HPP", previewLama.hpp, previewBaru.hpp],
                    ["Grosir", previewLama.grosir, previewBaru.grosir],
                    ["Tengah", previewLama.tengah, previewBaru.tengah],
                    ["Ecer", previewLama.ecer, previewBaru.ecer],
                  ].map(([label, lama, baru], i) => (
                    <div key={label} className={`grid grid-cols-3 px-2 py-1 ${i % 2 ? "bg-slate-950" : "bg-slate-900/60"}`}>
                      <span className="text-slate-500">{label}</span>
                      <span className="text-slate-400">{fmtRp(lama)}</span>
                      <span className="text-amber-300 font-medium">{fmtRp(baru)}</span>
                    </div>
                  ))}
                </div>
              )}
              {item.foto_url ? (
                <img
                  src={item.foto_url}
                  alt={item.sku}
                  loading="lazy"
                  decoding="async"
                  onClick={() => setModal({ type: "lihat-foto", item })}
                  className="w-full h-24 object-cover rounded-md mb-2 border border-slate-800 cursor-pointer hover:opacity-80"
                />
              ) : fotoTerakhir ? (
                <div className="relative mb-2">
                  <img
                    src={fotoTerakhir.foto_url}
                    alt={item.sku}
                    loading="lazy"
                    decoding="async"
                    onClick={() => setModal({ type: "lihat-foto", item: fotoTerakhir })}
                    className="w-full h-24 object-cover rounded-md border border-slate-800 cursor-pointer opacity-70 hover:opacity-90"
                  />
                  <span className="absolute bottom-1 right-1 bg-slate-950/80 text-slate-400 text-[9px] px-1.5 py-0.5 rounded">
                    Foto terakhir
                  </span>
                </div>
              ) : (
                <div className="w-full h-24 rounded-md mb-2 border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                  <ImageOff size={18} />
                </div>
              )}
              <div className="text-xs font-mono text-slate-300 truncate">{item.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {totalStok}x {item.rak_code ? `· ${item.rak_code}` : ""}
              </div>
              <button
                onClick={() => setModal({ type: "advance-verifikasi", item })}
                className="mt-2 w-full text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
              >
                {item.perlu_foto_ulang
                  ? "Foto ulang →"
                  : item.foto_url
                  ? "Ganti foto verifikasi →"
                  : "Upload foto verifikasi →"}
              </button>
            </div>
            );
          })}
        </div>
      )}

      {itemsTerpilih.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900 border border-amber-500/40 rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-xs text-slate-300">
            <span className="text-amber-400 font-semibold">{itemsTerpilih.length}</span> SKU dipilih
          </span>
          <button
            onClick={() => setModal({ type: "advance-verifikasi-banyak", items: itemsTerpilih })}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            <Camera size={13} /> Upload 1 Foto untuk Semua
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-500 hover:text-red-400"
            title="Batal pilih"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}