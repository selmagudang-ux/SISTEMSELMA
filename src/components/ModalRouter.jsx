import { useState } from "react";
import { Trash2, AlertTriangle, Download, RotateCcw } from "lucide-react";
import { ModalShell } from "./ui";
import { STAGE_META, COLOR } from "../lib/constants";
import { sb, sbUploadFoto, calcHarga, fmtRp, labelFor, downloadFotos } from "../lib/api";
import {
  BarangMasukForm, SkuEntryForm, TempatkanRakForm, PindahRakForm, VerifikasiForm, TambahRakForm, BarangKeluarForm,
} from "./forms";

// Modal Detail Barang — dipisah jadi komponen sendiri karena butuh state lokal
// (status unduh foto) yang harus aman dari Rules of Hooks saat modal.type berpindah.
function DetailItemModal({ item, setModal, saving, run, showToast, close }) {
  const [unduh, setUnduh] = useState(false);
  const meta = STAGE_META[item.stage];
  const c = COLOR[meta.color];
  const rows = [
    ["Tanggal masuk", item.tanggal],
    ["Gudang", item.gudang || "—"],
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
          onClick={() => setModal({ type: "lihat-foto", item })}
          className="w-full max-h-56 object-contain rounded-lg border border-slate-800 bg-slate-950 mb-3 cursor-zoom-in hover:opacity-90"
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
      <div className="mt-3 space-y-2">
        {item.foto_url && (
          <button
            disabled={unduh}
            onClick={async () => {
              setUnduh(true);
              try {
                await downloadFotos([{ sku: item.sku || item.id, url: item.foto_url }]);
              } catch (e) {
                showToast(e.message || "Gagal mengunduh foto", "err");
              } finally {
                setUnduh(false);
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 text-xs font-semibold py-2.5 rounded-lg"
          >
            <Download size={14} /> {unduh ? "Mengunduh…" : "Download Foto"}
          </button>
        )}
        {item.stage === "marketplace" && (
          <button
            disabled={saving}
            onClick={() =>
              run(async () => {
                await sb(`items?id=eq.${item.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ stage: "verifikasi" }),
                });
              }, "Barang dikembalikan ke Pemotretan")
            }
            className="w-full flex items-center justify-center gap-1.5 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 text-xs font-semibold py-2.5 rounded-lg"
          >
            <RotateCcw size={14} /> Kembalikan ke Pemotretan
          </button>
        )}
        <button
          onClick={() => setModal({ type: "hapus-item", item })}
          className="w-full flex items-center justify-center gap-1.5 border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-semibold py-2.5 rounded-lg"
        >
          <Trash2 size={14} /> Hapus Barang
        </button>
      </div>
    </ModalShell>
  );
} 

// Modal pilih Harga Lama / Harga Baru. Dibuka dari kartu Master Barang lewat
// tanda merah "Harga Baru" — pemilihan lama/baru dilakukan DI DALAM modal ini
// (bukan langsung di kartu), supaya tampilan awal daftar tetap ringkas.
function PilihHargaModal({ item, settings, saving, onClose, onConfirm }) {
  const [pilih, setPilih] = useState(null); // null | "lama" | "baru"
  const hargaTerpilih = pilih === "baru" ? item.harga_asli_baru : pilih === "lama" ? item.harga_asli : null;
  const preview = pilih && settings ? calcHarga(hargaTerpilih, settings) : null;

  return (
    <ModalShell title="Pilih Harga Asli" onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">SKU</div>
        <div className="font-mono text-sm text-amber-400">{item.sku}</div>
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Barang ini masuk lagi dengan harga asli yang berbeda. Pilih dulu mau pakai harga yang mana:
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <button
          type="button"
          onClick={() => setPilih("lama")}
          className={`text-left rounded-lg border px-3 py-2 transition ${
            pilih === "lama" ? "border-amber-500/60 bg-amber-500/10" : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-slate-500">Harga Lama</div>
          <div className="text-slate-200 font-semibold mt-0.5">{fmtRp(item.harga_asli)}</div>
        </button>
        <button
          type="button"
          onClick={() => setPilih("baru")}
          className={`text-left rounded-lg border px-3 py-2 transition ${
            pilih === "baru" ? "border-amber-500/60 bg-amber-500/10" : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-slate-500">Harga Baru</div>
          <div className="text-slate-200 font-semibold mt-0.5">{fmtRp(item.harga_asli_baru)}</div>
        </button>
      </div>
      {pilih ? (
        <>
          <p className="text-xs text-slate-400 mb-3">
            Kamu memilih pakai{" "}
            <span className="text-amber-400 font-medium">{pilih === "baru" ? "Harga Baru" : "Harga Lama"}</span> (
            {fmtRp(hargaTerpilih)}) sebagai Harga Asli SKU ini. Harga jual (HPP, Grosir, Tengah, Ecer) akan dihitung
            ulang otomatis dari harga ini.
          </p>
          {preview && (
            <div className="rounded-lg border border-slate-800 overflow-hidden mb-4 text-xs">
              {[
                ["HPP", fmtRp(preview.hpp)],
                ["Grosir", fmtRp(preview.grosir)],
                ["Tengah", fmtRp(preview.tengah)],
                ["Ecer", fmtRp(preview.ecer)],
              ].map(([label, val], i) => (
                <div
                  key={label}
                  className={`flex items-center justify-between px-3 py-2 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
                >
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-200">{val}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-500 mb-4">Pilih salah satu kartu harga di atas dulu.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          disabled={saving || !settings || !pilih}
          onClick={() => onConfirm(hargaTerpilih)}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Pakai Harga Ini"}
        </button>
      </div>
    </ModalShell>
  );
}

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
    return (
      <DetailItemModal
        item={modal.item}
        setModal={setModal}
        saving={saving}
        run={run}
        showToast={showToast}
        close={close}
      />
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
                Stok SKU ini sudah tercatat — stok akan otomatis dikurangi {item.jumlah}x dan dicatat di riwayat
                stok. Kalau ini barang terakhir untuk SKU <span className="font-mono">{item.sku}</span>, SKU-nya
                (di Master Barang), penempatan raknya, dan riwayat stoknya akan ikut dihapus otomatis supaya tidak
                ada data nyangkut.
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
                    // Hapus dulu baris barangnya SEBELUM cek/hapus sku_master — selama baris
                    // barang ini masih ada, kolom items.sku masih mereferensikan sku_master.sku
                    // (foreign key), jadi sku_master tidak bisa dihapus lebih dulu.
                    await sb(`items?id=eq.${item.id}`, { method: "DELETE" });

                    // Cek apakah masih ada barang lain yang memakai SKU yang sama — kalau
                    // tidak ada, SKU ini "yatim" dan dibersihkan sekalian (SKU + penempatan
                    // rak + riwayat stok) supaya tidak ada data nyangkut di Master Barang / Stok /
                    // Rak walau barangnya sudah dihapus.
                    const barangLain = await sb(`items?select=id&sku=eq.${encodeURIComponent(item.sku)}`);
                    const skuMasihDipakai = (barangLain || []).length > 0;

                    if (skuMasihDipakai) {
                      // SKU masih dipakai barang lain — cukup catat pengurangan stoknya.
                      const stokBaru = Math.max(existing.stok - (item.jumlah || 0), 0);
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
                      await sb(`sku_master?id=eq.${existing.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ stok: stokBaru }),
                      });
                    } else {
                      // Barang terakhir untuk SKU ini — SKU akan dihapus total, jadi tidak
                      // perlu dicatat ke riwayat stok (SKU-nya sendiri tidak akan tersisa).
                      // Barang sudah terhapus (langkah utama sudah sukses) — sisanya cuma
                      // beres-beres. Dibungkus try/catch supaya kalau ada kendala tak terduga
                      // di sini, tidak dilaporkan sebagai "gagal hapus barang" ke user.
                      try {
                        // stock_history & penempatan juga punya foreign key ke sku_master.sku,
                        // jadi keduanya harus dihapus dulu sebelum sku_master.
                        await sb(`stock_history?sku=eq.${encodeURIComponent(item.sku)}`, { method: "DELETE" });
                        await sb(`penempatan?sku=eq.${encodeURIComponent(item.sku)}`, { method: "DELETE" });
                        await sb(`sku_master?id=eq.${existing.id}`, { method: "DELETE" });
                      } catch (e) {
                        console.error("Gagal membersihkan SKU/penempatan yatim:", e);
                      }
                    }
                  } else {
                    await sb(`items?id=eq.${item.id}`, { method: "DELETE" });
                  }
                } else {
                  await sb(`items?id=eq.${item.id}`, { method: "DELETE" });
                }
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
        onSubmit={(vals) =>
          run(async () => {
            await sb("items", { method: "POST", body: JSON.stringify(vals) });
          }, "Barang masuk dicatat")
        }
      />
    );
  }

  // Alur pembuatan SKU digabung jadi satu: user cari dulu apakah SKU-nya sudah
  // ada (onSubmitExisting → tambah stok ke SKU itu), kalau tidak ketemu baru
  // dibuat SKU baru (onSubmitNew).
  if (modal.type === "buat-sku") {
    return (
      <SkuEntryForm
        item={modal.item}
        master={master}
        settings={settings}
        skuMaster={skuMaster}
        onClose={close}
        saving={saving}
        onSubmitExisting={(selectedSku, hargaAsliBaru) =>
          run(async () => {
            const jumlah = modal.item.jumlah || 1;
            const stokBaru = selectedSku.stok + jumlah;
            const patchBody = { stok: stokBaru };
            // Kalau barang lama ini masuk dengan harga asli yang beda dari harga
            // yang tercatat sekarang, jangan langsung timpa harga_asli — simpan dulu
            // sebagai "harga baru" yang menunggu keputusan di Master Barang (pilih
            // mau pakai harga lama atau harga baru). Harga jual yang berlaku
            // sekarang tidak berubah sampai keputusan itu dibuat.
            if (hargaAsliBaru != null) patchBody.harga_asli_baru = hargaAsliBaru;
            await sb(`sku_master?id=eq.${selectedSku.id}`, {
              method: "PATCH",
              body: JSON.stringify(patchBody),
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
                note: "Ditambahkan ke SKU yang sudah ada",
              }),
            });
          }, "Stok ditambahkan ke SKU")
        }
        onSubmitNew={(skuFields, hargaAsli) =>
          run(async () => {
            if (!settings) throw new Error("Pengaturan harga belum termuat");

            // Kode dari kolom combobox yang belum ada di Master Data (diketik manual)
            // dibuat otomatis di sini, sebelum SKU dibuat.
            const tipeFields = ["bahan", "peruntukan", "kategori", "subkategori", "warna", "ukuran"];
            for (const tipe of tipeFields) {
              const kode = skuFields[tipe];
              const sudahAda = (master[tipe] || []).some((m) => m.kode === kode);
              if (kode && !sudahAda) {
                await sb("master_data", {
                  method: "POST",
                  body: JSON.stringify({ tipe, kode, label: kode }),
                });
              }
            }

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
        skuMaster={skuMaster}
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
              body: JSON.stringify({ rak_code: rakCode, stage: "verifikasi" }),
            });
          }, "Barang ditempatkan di rak")
        }
      />
    );
  }

  if (modal.type === "advance-rak-ulang") {
    return (
      <TempatkanRakForm
        item={modal.item}
        rakList={rakList}
        penempatan={penempatan}
        skuMaster={skuMaster}
        onClose={close}
        saving={saving}
        onSubmit={(rakCode, qty) =>
          run(async () => {
            // SKU ini sudah pernah melewati tahap "rak" sebelumnya — rak lamanya
            // sudah ditimpa SKU lain. Cukup catat penempatan baru; stage item
            // tidak diubah karena barangnya sendiri sudah lanjut ke tahap berikutnya.
            await sb("penempatan", {
              method: "POST",
              body: JSON.stringify({ sku: modal.item.sku, rak_code: rakCode, qty }),
            });
          }, "Barang ditempatkan ulang di rak baru")
        }
      />
    );
  }

  if (modal.type === "pindah-rak") {
    return (
      <PindahRakForm
        item={modal.item}
        rakList={rakList}
        penempatan={penempatan}
        skuMaster={skuMaster}
        onClose={close}
        saving={saving}
        onSubmit={(rakBaru) =>
          run(async () => {
            // Ubah rak_code baris penempatan yang sudah ada (bukan bikin baris
            // baru) supaya rak lamanya langsung kosong, bukan malah ganda.
            await sb(`penempatan?id=eq.${modal.item.penempatanId}`, {
              method: "PATCH",
              body: JSON.stringify({ rak_code: rakBaru }),
            });
          }, "SKU dipindahkan ke rak baru")
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
            // Nama file foto dibuat dari SKU barang (bukan id internal) supaya langsung
            // gampang dikenali di Storage. Kalau SKU-nya sama diupload ulang, filenya
            // akan menimpa foto lama (x-upsert sudah aktif di sbUploadFoto) — sengaja
            // dibolehkan supaya user bisa memperbaiki sendiri kalau salah upload foto.
            const skuSafe = (modal.item.sku || modal.item.id).replace(/[^a-zA-Z0-9-_]/g, "-");
            const path = `${skuSafe}.${ext}`;
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

  if (modal.type === "barang-keluar") {
    return (
      <BarangKeluarForm
        item={modal.item}
        onClose={close}
        saving={saving}
        onSubmit={(qty, note) =>
          run(async () => {
            const existing = skuMaster.find((s) => s.sku === modal.item.sku);
            const stokSaatIni = existing ? existing.stok : modal.item.stok;
            const stokBaru = Math.max(stokSaatIni - qty, 0);
            await sb(`sku_master?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ stok: stokBaru }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku: modal.item.sku,
                type: "keluar",
                qty_before: stokSaatIni,
                qty_change: -qty,
                qty_after: stokBaru,
                note,
              }),
            });
          }, "Barang keluar dicatat, stok diperbarui")
        }
      />
    );
  }

  if (modal.type === "pilih-harga") {
    const s = modal.item;
    return (
      <PilihHargaModal
        item={s}
        settings={settings}
        saving={saving}
        onClose={close}
        onConfirm={(hargaTerpilih) =>
          run(async () => {
            if (!settings) throw new Error("Pengaturan harga belum termuat");
            const harga = calcHarga(hargaTerpilih, settings);
            await sb(`sku_master?id=eq.${s.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                harga_asli: hargaTerpilih,
                harga_dasar: harga.hargaDasar,
                hpp: harga.hpp,
                grosir: harga.grosir,
                tengah: harga.tengah,
                ecer: harga.ecer,
                harga_asli_baru: null,
              }),
            });
          }, "Harga SKU diperbarui")
        }
      />
    );
  }

  if (modal.type === "stok-opname") {
    const s = modal.item;
    const qtyFisik = modal.qtyFisik;
    const stokSistem = s.stok || 0;
    const selisih = qtyFisik - stokSistem;
    return (
      <ModalShell title="Sesuaikan Stok — Stok Opname" onClose={close}>
        <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <div className="text-[11px] text-slate-500">SKU</div>
          <div className="font-mono text-sm text-amber-400">{s.sku}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs mb-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Stok Sistem</div>
            <div className="text-slate-200 font-semibold mt-0.5">{stokSistem}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Qty Fisik</div>
            <div className="text-slate-200 font-semibold mt-0.5">{qtyFisik}</div>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 ${
              selisih === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
            }`}
          >
            <div className="text-slate-500">Selisih</div>
            <div className={`font-semibold mt-0.5 ${selisih === 0 ? "text-emerald-400" : "text-amber-400"}`}>
              {selisih > 0 ? `+${selisih}` : selisih}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Stok sistem SKU ini akan diubah jadi <span className="text-amber-400 font-medium">{qtyFisik}</span> sesuai
          hasil hitung fisik (stok opname), dan perubahannya dicatat otomatis di Riwayat Stok.
        </p>
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
                await sb("stock_history", {
                  method: "POST",
                  body: JSON.stringify({
                    sku: s.sku,
                    type: "penyesuaian",
                    qty_before: stokSistem,
                    qty_change: selisih,
                    qty_after: qtyFisik,
                    note: "Stok opname",
                  }),
                });
                await sb(`sku_master?id=eq.${s.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ stok: qtyFisik }),
                });
              }, "Stok disesuaikan sesuai hasil opname")
            }
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Sesuaikan Stok"}
          </button>
        </div>
      </ModalShell>
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