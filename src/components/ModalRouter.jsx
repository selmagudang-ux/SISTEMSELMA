import { Trash2, AlertTriangle } from "lucide-react";
import { ModalShell } from "./ui";
import { STAGE_META, COLOR } from "../lib/constants";
import { sb, sbUploadFoto, calcHarga, fmtRp, labelFor } from "../lib/api";
import {
  BarangMasukForm, BuatSkuForm, TambahSkuLamaForm, TempatkanRakForm, VerifikasiForm, TambahRakForm,
} from "./forms";

export default function ModalRouter({
  modal, setModal, master, settings, rakList, skuMaster, penempatan, saving, setSaving, reload, showToast,
}) {
  const close = () => setModal(null);

  const run = async (fn, successMsg) => {
    setSaving(true);
    try {
      await fn();
      await reload();
      showToast(successMsg);
      close();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(false);
    }
  };

  if (modal.type === "detail-sku") {
    const s = modal.item;
    const rows = [
      ["Bahan", labelFor(master, "bahan", s.bahan)],
      ["Peruntukan", labelFor(master, "peruntukan", s.peruntukan)],
      ["Kategori", labelFor(master, "kategori", s.kategori)],
      ["Subkategori", labelFor(master, "subkategori", s.subkategori)],
      ["Model", s.model || "—"],
      ["Warna", labelFor(master, "warna", s.warna)],
      ["Ukuran", labelFor(master, "ukuran", s.ukuran)],
    ];
    return (
      <ModalShell title={`Detail SKU — ${s.sku}`} onClose={close}>
        <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <div className="text-[11px] text-slate-500">SKU</div>
          <div className="font-mono text-sm text-amber-400">{s.sku}</div>
        </div>
        <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
          {rows.map(([label, val], i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="text-slate-200">{val}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Stok</div>
            <div className="text-slate-200 font-semibold mt-0.5">{s.stok}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Harga Ecer</div>
            <div className="text-amber-400 font-semibold mt-0.5">{fmtRp(s.ecer)}</div>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "lihat-foto") {
    const item = modal.item;
    return (
      <ModalShell title={`Foto — ${item.sku || "SKU belum ada"}`} onClose={close}>
        <img
          src={item.foto_url}
          alt={item.sku || "foto barang"}
          className="w-full max-h-[70vh] object-contain rounded-lg border border-slate-800 bg-slate-950 mb-3"
        />
        <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 space-y-1">
          <div>SKU: <span className="font-mono text-amber-400">{item.sku || "—"}</span></div>
          <div>Jumlah: {item.jumlah}x</div>
          {item.rak_code && <div>Rak: {item.rak_code}</div>}
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "detail-item") {
    const item = modal.item;
    const meta = STAGE_META[item.stage];
    const c = COLOR[meta.color];
    const rows = [
      ["Tanggal masuk", item.tanggal],
      ["Gudang", item.gudang || "—"],
      ["Status", item.status],
      ["Jumlah", `${item.jumlah}x`],
      ["SKU", item.sku || "Belum ada"],
      ["Rak", item.rak_code || "Belum ditempatkan"],
    ];
    return (
      <ModalShell title={`Detail Barang — ${item.sku || `#${item.id.slice(0, 8)}`}`} onClose={close}>
        {item.foto_url && (
          <img
            src={item.foto_url}
            alt={item.sku || "foto barang"}
            className="w-full max-h-56 object-contain rounded-lg border border-slate-800 bg-slate-950 mb-3"
          />
        )}
        <div className="mb-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{meta.label}</span>
        </div>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          {rows.map(([label, val], i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="text-slate-200 font-mono text-xs">{val}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setModal({ type: "hapus-item", item })}
          className="w-full mt-3 flex items-center justify-center gap-1.5 border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-semibold py-2.5 rounded-lg"
        >
          <Trash2 size={14} /> Hapus Barang
        </button>
      </ModalShell>
    );
  }

  if (modal.type === "hapus-item") {
    const item = modal.item;
    const meta = STAGE_META[item.stage];
    // Stok baru masuk ke sku_master begitu tahap "sku" selesai (stage sudah lewat "sku").
    const stokSudahMasuk = !!item.sku && item.stage !== "sku";
    return (
      <ModalShell title="Hapus Barang" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Barang <span className="font-mono">{item.sku || `#${item.id.slice(0, 8)}`}</span> ({item.jumlah}x,
            tahap {meta?.label || item.stage}) akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            {stokSudahMasuk && (
              <div className="mt-1.5 text-red-200/90">
                Stok SKU ini sudah tercatat — stok akan otomatis dikurangi {item.jumlah}x dan dicatat di riwayat stok.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={close}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            disabled={saving}
            onClick={() =>
              run(async () => {
                if (stokSudahMasuk) {
                  const existing = skuMaster.find((s) => s.sku === item.sku);
                  if (existing) {
                    const stokBaru = Math.max(existing.stok - (item.jumlah || 0), 0);
                    await sb(`sku_master?id=eq.${existing.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ stok: stokBaru }),
                    });
                    await sb("stock_history", {
                      method: "POST",
                      body: JSON.stringify({
                        sku: item.sku,
                        type: "keluar",
                        qty_before: existing.stok,
                        qty_change: -(item.jumlah || 0),
                        qty_after: stokBaru,
                        note: "Barang dihapus dari sistem",
                      }),
                    });
                  }
                }
                await sb(`items?id=eq.${item.id}`, { method: "DELETE" });
              }, "Barang dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "barang-masuk") {
    return (
      <BarangMasukForm
        onClose={close}
        saving={saving}
        presetStatus={modal.presetStatus}
        onSubmit={(vals) =>
          run(async () => {
            await sb("items", { method: "POST", body: JSON.stringify(vals) });
          }, "Barang masuk dicatat")
        }
      />
    );
  }

  if (modal.type === "tambah-sku-lama") {
    return (
      <TambahSkuLamaForm
        item={modal.item}
        skuMaster={skuMaster}
        onClose={close}
        saving={saving}
        onSubmit={(selectedSku) =>
          run(async () => {
            const jumlah = modal.item.jumlah || 1;
            const stokBaru = selectedSku.stok + jumlah;
            await sb(`sku_master?id=eq.${selectedSku.id}`, {
              method: "PATCH",
              body: JSON.stringify({ stok: stokBaru }),
            });
            await sb(`items?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ sku: selectedSku.sku, stage: "rak" }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku: selectedSku.sku,
                type: "masuk",
                qty_before: selectedSku.stok,
                qty_change: jumlah,
                qty_after: stokBaru,
                note: "Barang lama ditambahkan ke SKU yang sudah ada",
              }),
            });
          }, "Stok ditambahkan ke SKU")
        }
      />
    );
  }

  if (modal.type === "advance-sku") {
    return (
      <BuatSkuForm
        item={modal.item}
        master={master}
        settings={settings}
        onClose={close}
        saving={saving}
        onSubmit={(skuFields, hargaAsli) =>
          run(async () => {
            if (!settings) throw new Error("Pengaturan harga belum termuat");
            const harga = calcHarga(hargaAsli, settings);
            const sku = `${skuFields.bahan}${skuFields.peruntukan}${skuFields.kategori}-${skuFields.subkategori}-${skuFields.model}-${skuFields.warna}-${skuFields.ukuran}`;
            const jumlah = modal.item.jumlah || 1;
            const existing = skuMaster.find((s) => s.sku === sku);
            let stokBaru;
            if (existing) {
              stokBaru = existing.stok + jumlah;
              await sb(`sku_master?id=eq.${existing.id}`, {
                method: "PATCH",
                body: JSON.stringify({ stok: stokBaru }),
              });
            } else {
              stokBaru = jumlah;
              await sb("sku_master", {
                method: "POST",
                body: JSON.stringify({
                  sku,
                  bahan: skuFields.bahan,
                  peruntukan: skuFields.peruntukan,
                  kategori: skuFields.kategori,
                  subkategori: skuFields.subkategori,
                  model: skuFields.model,
                  warna: skuFields.warna,
                  ukuran: skuFields.ukuran,
                  harga_asli: hargaAsli,
                  harga_dasar: harga.hargaDasar,
                  hpp: harga.hpp,
                  grosir: harga.grosir,
                  tengah: harga.tengah,
                  ecer: harga.ecer,
                  stok: jumlah,
                }),
              });
            }
            await sb(`items?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ sku, stage: "rak" }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku,
                type: "masuk",
                qty_before: stokBaru - jumlah,
                qty_change: jumlah,
                qty_after: stokBaru,
                note: existing ? "SKU lama ditambah stok" : "SKU baru dibuat",
              }),
            });
          }, "SKU dibuat & stok tercatat")
        }
      />
    );
  }

  if (modal.type === "advance-rak") {
    return (
      <TempatkanRakForm
        item={modal.item}
        rakList={rakList}
        penempatan={penempatan}
        onClose={close}
        saving={saving}
        onSubmit={(rakCode, qty) =>
          run(async () => {
            await sb("penempatan", {
              method: "POST",
              body: JSON.stringify({ sku: modal.item.sku, rak_code: rakCode, qty }),
            });
            await sb(`items?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ rak_code: rakCode, stage: "sample" }),
            });
          }, "Barang ditempatkan di rak")
        }
      />
    );
  }

  if (modal.type === "advance-verifikasi") {
    return (
      <VerifikasiForm
        item={modal.item}
        onClose={close}
        saving={saving}
        onSubmit={(file) =>
          run(async () => {
            const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${modal.item.id}-${Date.now()}.${ext}`;
            const url = await sbUploadFoto(file, path);
            await sb(`items?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ foto_url: url, stage: "marketplace" }),
            });
          }, "Foto verifikasi tersimpan")
        }
      />
    );
  }

  if (modal.type === "tambah-rak") {
    return (
      <TambahRakForm
        onClose={close}
        saving={saving}
        onSubmit={(vals) =>
          run(async () => {
            await sb("rak", { method: "POST", body: JSON.stringify(vals) });
          }, "Rak ditambahkan")
        }
      />
    );
  }

  return null;
}