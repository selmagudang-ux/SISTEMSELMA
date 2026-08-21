import { useState } from "react";
import { Trash2, AlertTriangle, Download, RotateCcw, Printer, ArrowRight } from "lucide-react";
import { ModalShell, Badge, suggestKode, Field, inputClass } from "./ui";
import { STAGE_META, COLOR, STAGE_ROLE, canAdvanceStage, roleLabel } from "../lib/constants";
import {
  sb, sbUploadFoto, calcHarga, fmtRp, labelFor, downloadFotos, nextKode, tandaiPerluFotoUlang,
  totalDibayarPesanan, sisaHutangPesanan, hitungStatusBayar, saldoDepositPelanggan, todayDDMMYYYY,
} from "../lib/api";
import {
  BarangMasukForm, SkuEntryForm, TempatkanRakForm, PindahRakForm, VerifikasiForm, TambahRakForm, EditRakForm, BarangKeluarForm,
  GantiPasswordForm, PelangganForm, TokoForm, BayarHutangForm, CairkanDepositForm, KeuanganTransaksiForm,
} from "./forms";
import { changeOwnPassword } from "../lib/auth";
import { skuForRak, rakForSku, rencanaKurangiRak } from "../pages/Rak";
import { EditPesananForm } from "../pages/Grosir";
import { NotaPesananModal, LabelPengirimanModal } from "../pages/NotaGrosir";

// Modal Detail Barang — dipisah jadi komponen sendiri karena butuh state lokal
// (status unduh foto) yang harus aman dari Rules of Hooks saat modal.type berpindah.
function DetailItemModal({ item, setModal, saving, run, showToast, close, session, quickAdvance }) {
  const [unduh, setUnduh] = useState(false);
  const meta = STAGE_META[item.stage];
  const c = COLOR[meta.color];
  const rows = [
    ["Tanggal masuk", item.tanggal],
    ["Jenis", item.gudang || "—"],
    ["Jumlah", `${item.jumlah}x`],
    ["SKU", item.sku || "Belum ada"],
    ["Rak", item.rak_code || "Belum ditempatkan"],
  ];

  // Tahap yang masih punya aksi lanjutan (selesai = tidak ada lagi). Untuk
  // setiap tahap ini, klik tombol "Lanjut" akan membuka form/aksi yang sama
  // seperti yang dipakai di halaman kerja masing-masing role (Buat SKU,
  // Tempatkan Rak, Verifikasi Foto, Upload Marketplace) — TAPI hanya kalau
  // role yang login memang "pemilik" tahap itu (lihat STAGE_ROLE), atau
  // owner/superadmin yang selalu boleh lewat semua tahap.
  const stageAksi = { sku: "buat-sku", rak: "advance-rak", verifikasi: "advance-verifikasi" };
  const bisaLanjut = item.stage in stageAksi || item.stage === "marketplace";

  const handleLanjut = () => {
    if (!canAdvanceStage(session?.role, item.stage)) {
      const pemilik = roleLabel(STAGE_ROLE[item.stage]);
      showToast(
        `Anda tidak bisa melanjutkan ke tahap selanjutnya. Hanya role ${pemilik} (atau Owner/Superadmin) yang bisa melanjutkan.`,
        "err"
      );
      return;
    }
    if (item.stage === "marketplace") {
      quickAdvance(item, "marketplace");
      close();
      return;
    }
    setModal({ type: stageAksi[item.stage], item });
  };

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
        {bisaLanjut && (
          <button
            disabled={saving}
            onClick={handleLanjut}
            className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold py-2.5 rounded-lg"
          >
            Lanjut ke Tahap Berikutnya <ArrowRight size={14} />
          </button>
        )}
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

// Modal edit harga langsung dari Master Barang — khusus superadmin (tombol
// pensil di SkuHarga.jsx hanya muncul untuk role itu, tapi modal ini juga
// dijaga sendiri lewat pengecekan session di ModalRouter sebelum dirender).
function EditHargaModal({ item, settings, saving, onClose, onConfirm }) {
  const [hargaAsli, setHargaAsli] = useState(String(item.harga_asli ?? ""));
  const [otomatis, setOtomatis] = useState(true);
  const [grosir, setGrosir] = useState(String(item.grosir ?? ""));
  const [tengah, setTengah] = useState(String(item.tengah ?? ""));
  const [ecer, setEcer] = useState(String(item.ecer ?? ""));

  const preview = otomatis && settings && hargaAsli !== "" ? calcHarga(hargaAsli, settings) : null;
  const ready =
    hargaAsli !== "" && (otomatis ? !!settings : grosir !== "" && tengah !== "" && ecer !== "");

  const handleConfirm = () => {
    if (otomatis) {
      const harga = calcHarga(hargaAsli, settings);
      onConfirm({
        harga_asli: Number(hargaAsli),
        harga_dasar: harga.hargaDasar,
        hpp: harga.hpp,
        grosir: harga.grosir,
        tengah: harga.tengah,
        ecer: harga.ecer,
      });
    } else {
      // Manual: harga jual dipakai apa adanya, HPP & harga dasar tetap
      // dihitung dari harga asli supaya laporan lain tetap konsisten.
      const otomatisHpp = settings ? calcHarga(hargaAsli, settings) : null;
      onConfirm({
        harga_asli: Number(hargaAsli),
        harga_dasar: otomatisHpp ? otomatisHpp.hargaDasar : Number(hargaAsli),
        hpp: otomatisHpp ? otomatisHpp.hpp : Number(hargaAsli) * 1.1,
        grosir: Number(grosir),
        tengah: Number(tengah),
        ecer: Number(ecer),
      });
    }
  };

  return (
    <ModalShell title="Edit Harga (Superadmin)" onClose={onClose}>
      <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <div className="text-[11px] text-slate-500">SKU</div>
        <div className="font-mono text-sm text-amber-400">{item.sku}</div>
      </div>

      <Field label="Harga Asli (Rp)">
        <input
          type="number"
          className={inputClass}
          value={hargaAsli}
          onChange={(e) => setHargaAsli(e.target.value)}
          placeholder="0"
        />
      </Field>

      <div className="mb-3">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!otomatis}
            onChange={(e) => setOtomatis(!e.target.checked)}
            className="accent-amber-500"
          />
          Isi harga Grosir/Tengah/Ecer manual
        </label>
      </div>

      {otomatis ? (
        preview && (
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
        )
      ) : (
        <div className="grid grid-cols-3 gap-x-2 mb-3">
          <Field label="Grosir">
            <input type="number" className={inputClass} value={grosir} onChange={(e) => setGrosir(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Tengah">
            <input type="number" className={inputClass} value={tengah} onChange={(e) => setTengah(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Ecer">
            <input type="number" className={inputClass} value={ecer} onChange={(e) => setEcer(e.target.value)} placeholder="0" />
          </Field>
        </div>
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
          disabled={saving || !ready}
          onClick={handleConfirm}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan Harga"}
        </button>
      </div>
    </ModalShell>
  );
}

export default function ModalRouter({
  modal, setModal, master, settings, rakList, skuMaster, penempatan, items, keuanganTransaksi, saving, setSaving, reload, showToast, session,
  quickAdvance,
  pelangganGrosir, tokoGrosir, produkManualGrosir, pesananGrosir, detailPesananGrosir, pembayaranGrosir, depositGrosir,
}) {
  const close = () => setModal(null);

  const run = async (fn, successMsg) => {
    setSaving(true);
    try {
      // Kalau fn() mengembalikan string, dipakai sebagai pesan sukses
      // (buat kasus pesan yang beda-beda tergantung apa yang sebenarnya
      // terjadi, mis. dihapus vs dinonaktifkan). Kalau tidak, pakai successMsg.
      const result = await fn();
      await reload();
      showToast(typeof result === "string" ? result : successMsg);
      close();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(false);
    }
  };

  if (modal.type === "ganti-password") {
    return (
      <GantiPasswordForm
        onClose={close}
        saving={saving}
        onSubmit={(passwordLama, passwordBaru) =>
          run(async () => {
            await changeOwnPassword(session.id, passwordLama, passwordBaru);
          }, "Password berhasil diganti")
        }
      />
    );
  }

  if (modal.type === "grosir-pelanggan-form") {
    const p = modal.item; // null = tambah baru, ada isinya = edit
    return (
      <PelangganForm
        pelanggan={p}
        pelangganList={pelangganGrosir}
        kodeBaru={p ? null : nextKode(pelangganGrosir, "kode", "PLG-")}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            if (p) {
              await sb(`grosir_pelanggan?id=eq.${p.id}`, {
                method: "PATCH",
                body: JSON.stringify({ nama: data.nama, wa: data.wa, alamat: data.alamat, kota: data.kota, catatan: data.catatan }),
              });
            } else {
              await sb("grosir_pelanggan", { method: "POST", body: JSON.stringify(data) });
            }
          }, p ? "Pelanggan diperbarui" : "Pelanggan ditambahkan")
        }
      />
    );
  }

  if (modal.type === "grosir-riwayat-pelanggan") {
    const p = modal.item;
    const pesananPelanggan = (pesananGrosir || [])
      .filter((ps) => ps.pelanggan_id === p.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const pembayaranPelanggan = (pembayaranGrosir || [])
      .filter((b) => b.pelanggan_id === p.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const depositPelanggan = (depositGrosir || [])
      .filter((d) => d.pelanggan_id === p.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const totalHutang = pesananPelanggan
      .filter((ps) => ps.status !== "Batal")
      .reduce((a, ps) => a + sisaHutangPesanan(ps, pembayaranGrosir), 0);
    const saldoDeposit = saldoDepositPelanggan(p.id, depositGrosir);

    return (
      <ModalShell title={`Riwayat — ${p.nama}`} onClose={close}>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Total Hutang</div>
            <div className={`text-base font-bold ${totalHutang > 0 ? "text-red-400" : "text-slate-200"}`}>
              {fmtRp(totalHutang)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Saldo Deposit</div>
            <div className="text-base font-bold text-emerald-400">{fmtRp(saldoDeposit)}</div>
          </div>
        </div>

        {saldoDeposit > 0 && (
          <button
            onClick={() => setModal({ type: "grosir-cairkan-deposit", item: p })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 mb-4"
          >
            Cairkan Deposit ke Pelanggan
          </button>
        )}

        <div className="text-xs text-slate-500 mb-1.5">Pesanan ({pesananPelanggan.length})</div>
        {pesananPelanggan.length === 0 ? (
          <div className="text-xs text-slate-600 mb-4">Belum ada pesanan.</div>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-hidden mb-4">
            {pesananPelanggan.map((ps, i) => {
              const sisa = sisaHutangPesanan(ps, pembayaranGrosir);
              return (
                <button
                  key={ps.id}
                  onClick={() => setModal({ type: "grosir-detail-pesanan", item: ps })}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm ${
                    i % 2 ? "bg-slate-950" : "bg-slate-900"
                  } hover:bg-slate-800/60`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-amber-400">{ps.nomor_pesanan}</span>
                      {ps.status === "Batal" && <Badge color="red">Batal</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-500">{ps.tanggal}</div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <Badge color={ps.status_bayar === "Lunas" ? "emerald" : ps.status_bayar === "Sebagian" ? "sky" : "amber"}>
                      {ps.status_bayar}
                    </Badge>
                    <div className="text-slate-200 font-medium mt-0.5">{fmtRp(ps.total)}</div>
                    {sisa > 0 && ps.status !== "Batal" && (
                      <div className="text-[10px] text-red-400">Sisa {fmtRp(sisa)}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="text-xs text-slate-500 mb-1.5">Riwayat Pembayaran ({pembayaranPelanggan.length})</div>
        {pembayaranPelanggan.length === 0 ? (
          <div className="text-xs text-slate-600 mb-4">Belum ada pembayaran.</div>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-hidden mb-4">
            {pembayaranPelanggan.map((b, i) => {
              const pesananTerkait = pesananPelanggan.find((ps) => ps.id === b.pesanan_id);
              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
                >
                  <div className="min-w-0">
                    <div className="text-slate-200 text-xs">
                      {pesananTerkait?.nomor_pesanan || "—"} · {b.metode_bayar}
                    </div>
                    <div className="text-[11px] text-slate-500">{new Date(b.created_at).toLocaleString("id-ID")}</div>
                  </div>
                  <div className="text-emerald-400 font-medium flex-shrink-0 ml-2">{fmtRp(b.jumlah)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-slate-500 mb-1.5">Riwayat Deposit ({depositPelanggan.length})</div>
        {depositPelanggan.length === 0 ? (
          <div className="text-xs text-slate-600">Belum ada mutasi deposit.</div>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            {depositPelanggan.map((d, i) => (
              <div
                key={d.id}
                className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                <div className="min-w-0">
                  <div className="text-slate-200 text-xs">{d.keterangan || "—"}</div>
                  <div className="text-[11px] text-slate-500">{new Date(d.created_at).toLocaleString("id-ID")}</div>
                </div>
                <div className={`font-medium flex-shrink-0 ml-2 ${Number(d.jumlah) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {Number(d.jumlah) >= 0 ? "+" : ""}
                  {fmtRp(d.jumlah)}
                </div>
              </div>
            ))}
          </div>
        )}
      </ModalShell>
    );
  }

  if (modal.type === "hapus-grosir-pelanggan") {
    const p = modal.item;
    return (
      <ModalShell title="Hapus Pelanggan" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Pelanggan <span className="font-mono">{p.kode}</span> ({p.nama}) akan dihapus permanen. Tindakan ini
            tidak bisa dibatalkan.
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
                await sb(`grosir_pelanggan?id=eq.${p.id}`, { method: "DELETE" });
              }, "Pelanggan dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "grosir-toko-form") {
    const t = modal.item;
    return (
      <TokoForm
        toko={t}
        tokoList={tokoGrosir}
        kodeBaru={t ? null : nextKode(tokoGrosir, "kode", "TKO-")}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            if (t) {
              await sb(`grosir_toko?id=eq.${t.id}`, {
                method: "PATCH",
                body: JSON.stringify({ nama_toko: data.nama_toko, alamat: data.alamat, telepon: data.telepon, jenis_toko: data.jenis_toko }),
              });
            } else {
              await sb("grosir_toko", { method: "POST", body: JSON.stringify(data) });
            }
          }, t ? "Toko diperbarui" : "Toko ditambahkan")
        }
      />
    );
  }

  if (modal.type === "hapus-grosir-produk-manual") {
    const p = modal.item;
    return (
      <ModalShell title="Hapus Produk Manual" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Produk <span className="font-mono">{p.kode}</span> ({p.nama_produk}) akan dihapus permanen. Kalau
            produk ini sudah pernah dipakai di pesanan sebelumnya, penghapusan akan ditolak — pesanan lama tetap
            harus punya datanya.
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
                await sb(`grosir_produk_manual?id=eq.${p.id}`, { method: "DELETE" });
              }, "Produk manual dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "hapus-grosir-toko") {    const t = modal.item;
    return (
      <ModalShell title="Hapus Toko" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Toko <span className="font-mono">{t.kode}</span> ({t.nama_toko}) akan dihapus permanen. Tindakan ini
            tidak bisa dibatalkan.
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
                await sb(`grosir_toko?id=eq.${t.id}`, { method: "DELETE" });
              }, "Toko dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "keuangan-transaksi-form") {
    const t = modal.item; // null = tambah baru, ada isinya = edit
    return (
      <KeuanganTransaksiForm
        transaksi={t}
        master={master}
        keuanganTransaksi={keuanganTransaksi}
        reload={reload}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            // Field Rekening & Kategori sekarang pakai pola "pilih yang sudah
            // ada ATAU tambah baru dengan Kode + Nama sendiri" (kode disarankan
            // otomatis di form, tapi user bisa ubah manual — lihat
            // SearchableSelectOrNew di components/ui.jsx). Kalau user ketik
            // baru, entri master_data-nya belum ada sama sekali dan harus
            // dibuat dulu di sini sebelum transaksi disimpan, pakai persis
            // kode yang diisi user (bukan dibikin otomatis lagi di sini).
            const buatEntriBaru = async (tipe, kodeInput, label) => {
              const kode = kodeInput.trim().toUpperCase();
              const daftar = master[tipe] || [];
              if (daftar.some((m) => m.kode === kode)) {
                throw new Error(`Kode "${kode}" sudah dipakai — pilih dari daftar atau ganti kode.`);
              }
              await sb("master_data", {
                method: "POST",
                body: JSON.stringify({ tipe, kode, label: label.trim() }),
              });
              return kode;
            };

            let rekening = data.rekening;
            if (!rekening && data.rekeningBaru) {
              rekening = await buatEntriBaru("rekening", data.rekeningBaruKode || suggestKode(data.rekeningBaru), data.rekeningBaru);
            }

            let rekeningTujuan = data.rekening_tujuan;
            if (!rekeningTujuan && data.rekeningTujuanBaru) {
              rekeningTujuan = await buatEntriBaru(
                "rekening",
                data.rekeningTujuanBaruKode || suggestKode(data.rekeningTujuanBaru),
                data.rekeningTujuanBaru
              );
            }

            const tipeKategori = data.tipe === "masuk" ? "kategori_masuk" : "kategori_keluar";
            let kategori = data.kategori;
            if (!kategori && data.kategoriBaru) {
              kategori = await buatEntriBaru(tipeKategori, data.kategoriBaruKode || suggestKode(data.kategoriBaru), data.kategoriBaru);
            }

            const body = {
              tanggal: data.tanggal,
              tipe: data.tipe,
              rekening,
              rekening_tujuan: rekeningTujuan,
              kategori,
              jumlah: data.jumlah,
            };

            if (t) {
              await sb(`keuangan_transaksi?id=eq.${t.id}`, {
                method: "PATCH",
                body: JSON.stringify({ ...body, keterangan: data.keteranganList[0] }),
              });
            } else {
              // Satu baris keterangan = satu transaksi terpisah (tanggal, tipe,
              // rekening, kategori, dan jumlah sama persis) — dikirim satu-satu
              // (bukan bulk insert) supaya kalau salah satu gagal, transaksi lain
              // yang sudah berhasil tetap tersimpan (tidak semuanya batal).
              for (const keterangan of data.keteranganList) {
                await sb("keuangan_transaksi", { method: "POST", body: JSON.stringify({ ...body, keterangan }) });
              }
            }
          }, t ? "Transaksi diperbarui" : data.keteranganList.length > 1 ? `${data.keteranganList.length} transaksi ditambahkan` : "Transaksi ditambahkan")
        }
      />
    );
  }

  if (modal.type === "hapus-keuangan-transaksi") {
    const t = modal.item;
    return (
      <ModalShell title="Hapus Transaksi" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Transaksi{" "}
            <span className="font-semibold">
              {t.tipe === "transfer" ? "Transfer Antar Rekening" : t.kategori}
            </span>{" "}
            sebesar <span className="font-semibold">{fmtRp(t.jumlah)}</span> ({t.tanggal}) akan dihapus permanen.
            Tindakan ini tidak bisa dibatalkan.
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
                await sb(`keuangan_transaksi?id=eq.${t.id}`, { method: "DELETE" });
              }, "Transaksi dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "grosir-detail-pesanan") {
    const p = modal.item;
    const pelanggan = (pelangganGrosir || []).find((x) => x.id === p.pelanggan_id);
    const toko = (tokoGrosir || []).find((x) => x.id === p.toko_id);
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    const riwayatBayar = (pembayaranGrosir || [])
      .filter((b) => b.pesanan_id === p.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const totalDibayar = totalDibayarPesanan(p.id, pembayaranGrosir);
    const sisaHutang = sisaHutangPesanan(p, pembayaranGrosir);
    const dibatalkan = p.status === "Batal";
    return (
      <ModalShell title={`Pesanan ${p.nomor_pesanan}`} onClose={close}>
        <div className="flex items-center gap-2 mb-3">
          <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
            {p.status_bayar}
          </Badge>
          {dibatalkan && <Badge color="red">Dibatalkan</Badge>}
        </div>
        <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
          {[
            ["Pelanggan", pelanggan ? `${pelanggan.nama} (${pelanggan.kode})` : "—"],
            ["Toko Pengirim", toko ? `${toko.nama_toko} (${toko.kode})` : "—"],
            ["Tanggal", p.tanggal],
            ["Metode Bayar", p.metode_bayar || "—"],
            ["Catatan", p.catatan || "—"],
          ].map(([label, val], i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="text-slate-200 text-right">{val}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500 mb-1.5">Item</div>
        <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
          {detailItems.map((d, i) => (
            <div
              key={d.id}
              className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="min-w-0">
                <div className="text-slate-200 truncate">{d.nama_produk}</div>
                <div className="text-[11px] text-slate-500">
                  {d.qty} x {fmtRp(d.harga)} {d.sumber_produk === "manual" ? "· manual" : ""}
                </div>
              </div>
              <div className="text-slate-200 font-medium flex-shrink-0 ml-2">{fmtRp(d.subtotal)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
          {[
            ["Total", fmtRp(p.total)],
            ["Sudah Dibayar", fmtRp(totalDibayar)],
            ["Sisa Hutang", sisaHutang > 0 ? fmtRp(sisaHutang) : "Lunas"],
          ].map(([label, val], i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <span className="text-slate-500 text-xs">{label}</span>
              <span className={`text-right font-semibold ${label === "Sisa Hutang" && sisaHutang > 0 ? "text-red-400" : "text-slate-200"}`}>
                {val}
              </span>
            </div>
          ))}
        </div>

        {riwayatBayar.length > 0 && (
          <>
            <div className="text-xs text-slate-500 mb-1.5">Riwayat Pembayaran</div>
            <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
              {riwayatBayar.map((b, i) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
                >
                  <div className="min-w-0">
                    <div className="text-slate-200 text-xs">{new Date(b.created_at).toLocaleString("id-ID")}</div>
                    <div className="text-[11px] text-slate-500">{b.metode_bayar}{b.catatan ? ` · ${b.catatan}` : ""}</div>
                  </div>
                  <div className="text-emerald-400 font-medium flex-shrink-0 ml-2">{fmtRp(b.jumlah)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => setModal({ type: "grosir-cetak-nota", item: p })}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border border-slate-700 text-slate-200 hover:bg-slate-800 mb-2"
        >
          <Printer size={14} /> Cetak Nota
        </button>
        <button
          onClick={() => setModal({ type: "grosir-cetak-label", item: p })}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border border-slate-700 text-slate-200 hover:bg-slate-800 mb-2"
        >
          <Printer size={14} /> Cetak Label Pengiriman
        </button>
        {!dibatalkan && sisaHutang > 0 && (
          <button
            onClick={() => setModal({ type: "grosir-bayar-hutang", item: p })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 mb-2"
          >
            Catat Pembayaran
          </button>
        )}
        {!dibatalkan && (
          <button
            onClick={() => setModal({ type: "grosir-edit-pesanan", item: p })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 mb-2"
          >
            Edit Item Pesanan
          </button>
        )}
        {!dibatalkan && (
          <button
            onClick={() => setModal({ type: "grosir-batalkan-pesanan", item: p })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10"
          >
            <Trash2 size={14} /> Batalkan Pesanan
          </button>
        )}
        {dibatalkan && (
          <button
            onClick={() => setModal({ type: "grosir-hapus-pesanan", item: p })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white mt-2"
          >
            <Trash2 size={14} /> Hapus Permanen
          </button>
        )}
      </ModalShell>
    );
  }

  if (modal.type === "grosir-hapus-pesanan") {
    const p = modal.item;
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    const skuTerpakai = Array.from(
      new Set(detailItems.filter((d) => d.sumber_produk === "sku" && d.sku).map((d) => d.sku))
    );
    return (
      <ModalShell title={`Hapus Pesanan ${p.nomor_pesanan}`} onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Pesanan ini akan dihapus <span className="font-semibold">permanen</span> beserta seluruh riwayat
            pembayarannya. Tindakan ini tidak bisa dibatalkan.
            {skuTerpakai.length > 0 && (
              <div className="mt-1.5 text-red-200/90">
                SKU yang dipakai di pesanan ini ({skuTerpakai.join(", ")}) akan lepas dari riwayat pesanan, jadi
                nanti bisa dihapus permanen juga kalau memang mau (kalau tidak dipakai di pesanan lain lagi).
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
                // Urutan hapus mengikuti relasi foreign key ke grosir_pesanan.id:
                // deposit yang tercatat lewat pesanan ini cuma dilepas referensinya
                // (bukan dihapus) supaya saldo deposit pelanggan tetap utuh — itu
                // uang beneran, bukan sekadar catatan pesanan.
                await sb(`grosir_deposit?pesanan_id_terkait=eq.${p.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ pesanan_id_terkait: null }),
                });
                await sb(`grosir_pembayaran?pesanan_id=eq.${p.id}`, { method: "DELETE" });
                await sb(`grosir_detail_pesanan?pesanan_id=eq.${p.id}`, { method: "DELETE" });
                await sb(`grosir_pesanan?id=eq.${p.id}`, { method: "DELETE" });
              }, "Pesanan dihapus permanen")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus Permanen
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "grosir-cetak-nota") {
    const p = modal.item;
    const pelanggan = (pelangganGrosir || []).find((x) => x.id === p.pelanggan_id);
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    const totalDibayar = totalDibayarPesanan(p.id, pembayaranGrosir);
    const sisaHutang = sisaHutangPesanan(p, pembayaranGrosir);
    return (
      <NotaPesananModal
        pesanan={p}
        pelanggan={pelanggan}
        detailItems={detailItems}
        totalDibayar={totalDibayar}
        sisaHutang={sisaHutang}
        onClose={close}
      />
    );
  }

  if (modal.type === "grosir-cetak-label") {
    const p = modal.item;
    const pelanggan = (pelangganGrosir || []).find((x) => x.id === p.pelanggan_id);
    const toko = (tokoGrosir || []).find((x) => x.id === p.toko_id);
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    return (
      <LabelPengirimanModal
        pesanan={p}
        pelanggan={pelanggan}
        toko={toko}
        detailItems={detailItems}
        onClose={close}
      />
    );
  }

  if (modal.type === "grosir-edit-pesanan") {
    const p = modal.item;
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    const totalDibayar = totalDibayarPesanan(p.id, pembayaranGrosir);

    return (
      <EditPesananForm
        pesanan={p}
        detailItems={detailItems}
        tokoGrosir={tokoGrosir}
        skuMaster={skuMaster}
        produkManualGrosir={produkManualGrosir}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            // 1. Kembalikan dulu qty lama (dari item ber-sumber SKU) ke stok,
            //    supaya perhitungan qty baru di bawah selalu mulai dari basis
            //    yang benar — sama seperti alur "batalkan pesanan", tapi di
            //    sini pesanannya tidak dibatalkan, cuma item-nya diganti.
            const stokWorking = {}; // { sku: stokTerbaruSementara }
            const getStok = (sku) => {
              if (stokWorking[sku] === undefined) {
                stokWorking[sku] = Number(skuMaster.find((s) => s.sku === sku)?.stok) || 0;
              }
              return stokWorking[sku];
            };

            for (const d of detailItems) {
              if (d.sumber_produk !== "sku" || !d.sku) continue;
              const stokSebelum = getStok(d.sku);
              const stokBaru = stokSebelum + Number(d.qty);
              stokWorking[d.sku] = stokBaru;
              await sb(`sku_master?sku=eq.${encodeURIComponent(d.sku)}`, {
                method: "PATCH",
                body: JSON.stringify({ stok: stokBaru }),
              });
              await sb("stock_history", {
                method: "POST",
                body: JSON.stringify({
                  sku: d.sku,
                  type: "masuk",
                  qty_before: stokSebelum,
                  qty_change: Number(d.qty),
                  qty_after: stokBaru,
                  note: `Edit pesanan grosir ${p.nomor_pesanan} — qty lama dikembalikan`,
                }),
              });
            }

            // 2. Hapus semua detail item lama, lalu simpan ulang item baru +
            //    potong stok sesuai qty baru (mengikuti pola simpan di BuatPesanan).
            for (const d of detailItems) {
              await sb(`grosir_detail_pesanan?id=eq.${d.id}`, { method: "DELETE" });
            }

            for (const it of data.items) {
              let produkManualId = it.produk_manual_id || null;
              if (it.sumber_produk === "manual" && !produkManualId) {
                const kodeBaru = nextKode(produkManualGrosir, "kode", "PRM-");
                const [produkBaru] = await sb("grosir_produk_manual", {
                  method: "POST",
                  body: JSON.stringify({
                    kode: kodeBaru,
                    nama_produk: it.nama_produk.trim(),
                    harga: Number(it.harga) || 0,
                    stok: 0,
                  }),
                });
                produkManualId = produkBaru.id;
              }

              await sb("grosir_detail_pesanan", {
                method: "POST",
                body: JSON.stringify({
                  pesanan_id: p.id,
                  sumber_produk: it.sumber_produk,
                  sku: it.sumber_produk === "sku" ? it.sku : null,
                  produk_manual_id: it.sumber_produk === "manual" ? produkManualId : null,
                  nama_produk: it.nama_produk,
                  qty: it.qty,
                  harga: it.harga,
                  subtotal: it.qty * it.harga,
                }),
              });

              if (it.sumber_produk === "sku") {
                const stokSebelum = getStok(it.sku);
                const stokBaru = Math.max(stokSebelum - it.qty, 0);
                stokWorking[it.sku] = stokBaru;
                await sb(`sku_master?sku=eq.${encodeURIComponent(it.sku)}`, {
                  method: "PATCH",
                  body: JSON.stringify({ stok: stokBaru }),
                });
                await sb("stock_history", {
                  method: "POST",
                  body: JSON.stringify({
                    sku: it.sku,
                    type: "keluar",
                    qty_before: stokSebelum,
                    qty_change: -it.qty,
                    qty_after: stokBaru,
                    note: `Edit pesanan grosir ${p.nomor_pesanan}`,
                  }),
                });
              }
            }

            // 3. Update header pesanan: toko, metode bayar, catatan, total,
            //    dan status bayar dihitung ulang otomatis dari total baru vs
            //    total yang sudah dibayar (StatusBayar tidak pernah diisi manual).
            const statusBaru = hitungStatusBayar(data.total, totalDibayar);
            await sb(`grosir_pesanan?id=eq.${p.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                toko_id: data.tokoId,
                metode_bayar: data.metodeBayar,
                catatan: data.catatan,
                total: data.total,
                status_bayar: statusBaru,
              }),
            });
          }, "Pesanan diperbarui")
        }
      />
    );
  }

  if (modal.type === "grosir-bayar-hutang") {
    const p = modal.item;
    const pelanggan = (pelangganGrosir || []).find((x) => x.id === p.pelanggan_id);
    const sisaHutang = sisaHutangPesanan(p, pembayaranGrosir);
    const saldoDeposit = pelanggan ? saldoDepositPelanggan(pelanggan.id, depositGrosir) : 0;

    return (
      <BayarHutangForm
        pesanan={p}
        sisaHutang={sisaHutang}
        saldoDeposit={saldoDeposit}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            const jumlahDiterima = Number(data.jumlah) || 0;
            if (jumlahDiterima <= 0) throw new Error("Jumlah pembayaran harus lebih dari 0");
            const metode = data.metodeBayar || "Cash";

            // Uang yang benar-benar dipakai melunasi pesanan ini dibatasi maksimal sisa hutangnya.
            const bayarKeOrder = Math.min(jumlahDiterima, sisaHutang);
            let kelebihan = jumlahDiterima - bayarKeOrder;

            if (metode === "Deposit" && bayarKeOrder > saldoDeposit + 0.0001) {
              throw new Error(
                `Saldo deposit pelanggan (${fmtRp(saldoDeposit)}) tidak cukup untuk membayar ${fmtRp(bayarKeOrder)}`
              );
            }
            if (metode === "Deposit") kelebihan = 0; // bayar pakai deposit tidak menghasilkan deposit baru

            const nomorBayar = `BYR-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`;
            await sb("grosir_pembayaran", {
              method: "POST",
              body: JSON.stringify({
                nomor_bayar: nomorBayar,
                pesanan_id: p.id,
                pelanggan_id: p.pelanggan_id,
                jumlah: bayarKeOrder,
                metode_bayar: metode,
                catatan: data.catatan || null,
              }),
            });

            if (metode === "Deposit") {
              await sb("grosir_deposit", {
                method: "POST",
                body: JSON.stringify({
                  nomor_deposit: `DEP-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`,
                  pelanggan_id: p.pelanggan_id,
                  jumlah: -bayarKeOrder,
                  keterangan: `Dipakai bayar pesanan ${p.nomor_pesanan}`,
                  pesanan_id_terkait: p.id,
                }),
              });
            } else if (kelebihan > 0.0001) {
              await sb("grosir_deposit", {
                method: "POST",
                body: JSON.stringify({
                  nomor_deposit: `DEP-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`,
                  pelanggan_id: p.pelanggan_id,
                  jumlah: kelebihan,
                  keterangan: `Kelebihan bayar pesanan ${p.nomor_pesanan}`,
                  pesanan_id_terkait: p.id,
                }),
              });
            }

            const sisaSesudah = sisaHutang - bayarKeOrder;
            const statusBaru = hitungStatusBayar(Number(p.total) || 0, (Number(p.total) || 0) - sisaSesudah);
            await sb(`grosir_pesanan?id=eq.${p.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status_bayar: statusBaru }),
            });
          }, "Pembayaran tercatat")
        }
      />
    );
  }

  if (modal.type === "grosir-cairkan-deposit") {
    const p = modal.item; // p = pelanggan (dikirim dari tombol di modal riwayat pelanggan)
    const saldoDeposit = saldoDepositPelanggan(p.id, depositGrosir);

    return (
      <CairkanDepositForm
        pelanggan={p}
        saldoDeposit={saldoDeposit}
        onClose={close}
        saving={saving}
        onSubmit={(data) =>
          run(async () => {
            const jumlah = Number(data.jumlah) || 0;
            if (jumlah <= 0) throw new Error("Jumlah yang dicairkan harus lebih dari 0");
            if (jumlah > saldoDeposit + 0.0001) {
              throw new Error(`Saldo deposit pelanggan (${fmtRp(saldoDeposit)}) tidak cukup untuk dicairkan sebesar ${fmtRp(jumlah)}`);
            }
            await sb("grosir_deposit", {
              method: "POST",
              body: JSON.stringify({
                nomor_deposit: `DEP-${todayDDMMYYYY()}-${Date.now().toString().slice(-5)}`,
                pelanggan_id: p.id,
                jumlah: -jumlah,
                keterangan: `Dicairkan ke pelanggan (${data.metodeBayar})${data.catatan ? ` · ${data.catatan}` : ""}`,
              }),
            });
          }, "Deposit dicairkan ke pelanggan")
        }
      />
    );
  }

  if (modal.type === "grosir-batalkan-pesanan") {
    const p = modal.item;
    const detailItems = (detailPesananGrosir || []).filter((d) => d.pesanan_id === p.id);
    return (
      <ModalShell title={`Batalkan Pesanan ${p.nomor_pesanan}`} onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            Pesanan akan ditandai <span className="font-semibold">Batal</span>. Stok Data Barang yang terpotong
            dari pesanan ini akan dikembalikan otomatis. Item manual tidak terpengaruh (tidak ikut sistem stok).
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
                // Kembalikan stok untuk tiap item yang berasal dari Data Barang.
                for (const d of detailItems) {
                  if (d.sumber_produk !== "sku" || !d.sku) continue;
                  const s = skuMaster.find((x) => x.sku === d.sku);
                  const stokSaatIni = s ? s.stok : 0;
                  const stokBaru = stokSaatIni + Number(d.qty);
                  await sb(`sku_master?sku=eq.${encodeURIComponent(d.sku)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ stok: stokBaru }),
                  });
                  await sb("stock_history", {
                    method: "POST",
                    body: JSON.stringify({
                      sku: d.sku,
                      type: "masuk",
                      qty_before: stokSaatIni,
                      qty_change: Number(d.qty),
                      qty_after: stokBaru,
                      note: `Pesanan grosir ${p.nomor_pesanan} dibatalkan`,
                    }),
                  });
                }
                await sb(`grosir_pesanan?id=eq.${p.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "Batal" }),
                });
              }, "Pesanan dibatalkan, stok dikembalikan")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Batalkan
          </button>
        </div>
      </ModalShell>
    );
  }

  if (modal.type === "detail-sku") {
    const s = modal.item;
    const kodeRak = rakForSku(s.sku, penempatan);
    const rows = [
      ["Bahan", labelFor(master, "bahan", s.bahan)],
      ["Peruntukan", labelFor(master, "peruntukan", s.peruntukan)],
      ["Kategori", labelFor(master, "kategori", s.kategori)],
      ["Subkategori", labelFor(master, "subkategori", s.subkategori)],
      ["Model", s.model || "—"],
      ["Warna", labelFor(master, "warna", s.warna)],
      ["Ukuran", labelFor(master, "ukuran", s.ukuran)],
      ...(kodeRak ? [["Rak", kodeRak]] : []),
    ];
    return (
      <ModalShell title={`Detail SKU — ${s.sku}`} onClose={close}>
        <div className="mb-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500">SKU</div>
            <div className="font-mono text-sm text-amber-400">{s.sku}</div>
          </div>
          {s.nonaktif && (
            <span className="text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full px-2 py-0.5">
              Nonaktif
            </span>
          )}
        </div>
        {s.nonaktif && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs px-3 py-2.5 rounded-lg mb-3">
            <div className="flex-1">
              SKU ini nonaktif dan tidak muncul di katalog / tidak bisa dipilih di pesanan grosir baru. Nanti
              otomatis aktif lagi kalau stoknya ditambah, atau aktifkan manual sekarang.
            </div>
          </div>
        )}
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
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Stok</div>
            <div className="text-slate-200 font-semibold mt-0.5">{s.stok}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            <div className="text-slate-500">Harga Ecer</div>
            <div className="text-amber-400 font-semibold mt-0.5">{fmtRp(s.ecer)}</div>
          </div>
        </div>
        {s.nonaktif && (
          <button
            disabled={saving}
            onClick={() =>
              run(async () => {
                await sb(`sku_master?id=eq.${s.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ nonaktif: false }),
                });
              }, "SKU diaktifkan kembali")
            }
            className="w-full py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Aktifkan Kembali"}
          </button>
        )}
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
        session={session}
        quickAdvance={quickAdvance}
      />
    );
  }

  if (modal.type === "hapus-sku") {
    const s = modal.item;
    const jumlahBarang = (items || []).filter((i) => i.sku === s.sku).length;
    return (
      <ModalShell title="Hapus SKU" onClose={close}>
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            SKU <span className="font-mono">{s.sku}</span> akan dihapus permanen, beserta{" "}
            {jumlahBarang > 0 ? `${jumlahBarang} barang yang tercatat, ` : ""}
            penempatan raknya, dan riwayat stoknya. Tindakan ini tidak bisa dibatalkan.
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
                // Urutan hapus mengikuti relasi foreign key ke sku_master.sku:
                // items, stock_history, dan penempatan harus dibersihkan dulu
                // sebelum baris sku_master-nya sendiri bisa dihapus.
                await sb(`items?sku=eq.${encodeURIComponent(s.sku)}`, { method: "DELETE" });
                await sb(`stock_history?sku=eq.${encodeURIComponent(s.sku)}`, { method: "DELETE" });
                await sb(`penempatan?sku=eq.${encodeURIComponent(s.sku)}`, { method: "DELETE" });
                try {
                  await sb(`sku_master?id=eq.${s.id}`, { method: "DELETE" });
                } catch (e) {
                  // SKU-nya masih dipakai di tempat lain (mis. sudah pernah masuk
                  // pesanan grosir) — tidak bisa dihapus permanen tanpa merusak
                  // riwayat transaksi itu. Nonaktifkan saja supaya tidak muncul
                  // lagi di katalog, tapi datanya tetap ada buat riwayat.
                  if (e.pgCode === "23503") {
                    await sb(`sku_master?id=eq.${s.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ nonaktif: true }),
                    });
                    return "SKU masih dipakai di riwayat transaksi, jadi dinonaktifkan (bukan dihapus permanen)";
                  }
                  throw e;
                }
              }, "SKU dihapus")
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
          >
            <Trash2 size={14} /> Ya, Hapus
          </button>
        </div>
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
                        // Kalau gagalnya karena SKU masih dipakai di tempat lain (mis.
                        // riwayat pesanan grosir), nonaktifkan saja SKU-nya supaya tidak
                        // nyangkut sebagai SKU aktif tanpa barang.
                        if (e.pgCode === "23503") {
                          try {
                            await sb(`sku_master?id=eq.${existing.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ nonaktif: true }),
                            });
                          } catch (e2) {
                            console.error("Gagal menonaktifkan SKU yatim:", e2);
                          }
                        } else {
                          console.error("Gagal membersihkan SKU/penempatan yatim:", e);
                        }
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
        reload={reload}
        onClose={close}
        saving={saving}
        session={session}
        onSubmitExisting={(selectedSku, hargaAsliBaru) =>
          run(async () => {
            const jumlah = modal.item.jumlah || 1;
            const stokBaru = selectedSku.stok + jumlah;
            // Stok ditambah = SKU dianggap dipakai lagi, jadi otomatis aktifkan
            // kembali kalau sebelumnya sempat dinonaktifkan (mis. bekas dihapus).
            const patchBody = { stok: stokBaru, nonaktif: false };
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
        onSubmitNew={(skuFields, hargaAsli, hargaManual) =>
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

            // hargaManual hanya bisa terisi kalau role-nya superadmin (dijaga di
            // SkuEntryForm) — kalau ada, pakai itu apa adanya dan lewati rumus
            // calcHarga untuk grosir/tengah/ecer. hpp & harga_dasar tetap dihitung
            // dari harga asli seperti biasa supaya laporan lain tetap konsisten.
            const hargaOtomatis = calcHarga(hargaAsli, settings);
            const harga = hargaManual
              ? { ...hargaOtomatis, grosir: hargaManual.grosir, tengah: hargaManual.tengah, ecer: hargaManual.ecer }
              : hargaOtomatis;
            const sku = `${skuFields.bahan}${skuFields.peruntukan}${skuFields.kategori}-${skuFields.subkategori}-${skuFields.model}-${skuFields.warna}-${skuFields.ukuran}`;
            const jumlah = modal.item.jumlah || 1;
            const existing = skuMaster.find((s) => s.sku === sku);
            // Pembuatan SKU baru ditolak kalau SKU-nya ternyata sudah ada di daftar
            // (harusnya sudah dicegah di form, ini jaga-jaga terakhir). Untuk
            // menambah stok ke SKU yang sudah ada, pakai jalur "SKU yang sudah ada"
            // (onSubmitExisting), bukan "buat SKU baru".
            if (existing) {
              throw new Error(`SKU ${sku} sudah ada di daftar — pilih SKU ini di kolom "SKU yang sudah ada" untuk menambah stok.`);
            }
            const stokBaru = jumlah;
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
            await sb(`items?id=eq.${modal.item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ sku, stage: "rak" }),
            });
            await sb("stock_history", {
              method: "POST",
              body: JSON.stringify({
                sku,
                type: "masuk",
                qty_before: 0,
                qty_change: jumlah,
                qty_after: stokBaru,
                note: "SKU baru dibuat",
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
        onSubmit={(rakBaru, qtyPindahRaw, aksi) =>
          run(async () => {
            // Boleh pindah/keluarkan SEBAGIAN qty saja (sisanya tetap di rak asal) —
            // dipakai saat rak asal masih dipakai barang lain atau memang cuma
            // sebagian yang mau diproses. Kalau qty yang diproses = seluruh qty
            // baris asal, perilakunya sama seperti sebelumnya (rak asal jadi kosong).
            const baris = (penempatan || []).find((p) => p.id === modal.item.penempatanId);
            const totalQty = Number(baris?.qty) || 0;
            const qtyPindah = Math.min(Math.max(Number(qtyPindahRaw) || 0, 1), totalQty);
            const sisaDiAsal = totalQty - qtyPindah;

            if (aksi === "keluar") {
              // Dikeluarkan dari rak — TIDAK dipindah ke rak lain manapun. Cukup
              // kurangi/hapus baris penempatan asal; tidak ada baris baru dibuat.
              // Stok SKU di sku_master tidak berubah, jadi selisihnya otomatis
              // muncul lagi sebagai "sisa di gudang" (lihat barangSisaDiGudang).
              if (sisaDiAsal <= 0) {
                await sb(`penempatan?id=eq.${modal.item.penempatanId}`, { method: "DELETE" });
                // Rak asalnya beneran kosong sekarang (bukan cuma dikurangi) —
                // catat biar Cek Marketplace bisa notif "Rak Jadi Kosong".
                await sb("rak_events", {
                  method: "POST",
                  body: JSON.stringify({ sku: modal.item.sku, jenis: "keluar", rak_dari: modal.item.rakLama, rak_baru: null }),
                });
              } else {
                await sb(`penempatan?id=eq.${modal.item.penempatanId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ qty: sisaDiAsal }),
                });
              }
              return;
            }

            // Kalau rak tujuan sudah punya baris penempatan utk SKU yang SAMA PERSIS,
            // gabungkan qty yang dipindah ke baris itu (tambahkan), bukan bikin baris baru.
            const tujuanSama = (penempatan || []).find(
              (p) => p.rak_code === rakBaru && p.sku === modal.item.sku && p.id !== modal.item.penempatanId
            );

            if (sisaDiAsal <= 0) {
              // Pindah semua qty — rak asal jadi kosong.
              if (tujuanSama) {
                const qtyGabung = (Number(tujuanSama.qty) || 0) + qtyPindah;
                await sb(`penempatan?id=eq.${tujuanSama.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ qty: qtyGabung }),
                });
                await sb(`penempatan?id=eq.${modal.item.penempatanId}`, { method: "DELETE" });
              } else {
                await sb(`penempatan?id=eq.${modal.item.penempatanId}`, {
                  method: "PATCH",
                  body: JSON.stringify({ rak_code: rakBaru }),
                });
              }
              // Catat perpindahan (rak asal beneran kosong sekarang) biar Cek
              // Marketplace bisa notif "SKU Pindah Rak" & "Rak Jadi Kosong".
              await sb("rak_events", {
                method: "POST",
                body: JSON.stringify({ sku: modal.item.sku, jenis: "pindah", rak_dari: modal.item.rakLama, rak_baru: rakBaru }),
              });
            } else {
              // Pindah sebagian — kurangi qty di rak asal, tambahkan/buat baris di rak tujuan.
              await sb(`penempatan?id=eq.${modal.item.penempatanId}`, {
                method: "PATCH",
                body: JSON.stringify({ qty: sisaDiAsal }),
              });
              if (tujuanSama) {
                const qtyGabung = (Number(tujuanSama.qty) || 0) + qtyPindah;
                await sb(`penempatan?id=eq.${tujuanSama.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ qty: qtyGabung }),
                });
              } else {
                await sb("penempatan", {
                  method: "POST",
                  body: JSON.stringify({ sku: modal.item.sku, rak_code: rakBaru, qty: qtyPindah }),
                });
              }
            }
          }, aksi === "keluar" ? "SKU dikeluarkan dari rak, tercatat sebagai sisa di gudang" : "SKU dipindahkan ke rak baru")
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
              body: JSON.stringify({ foto_url: url, stage: "marketplace", perlu_foto_ulang: false }),
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
            // Samakan qty di rak (FIFO: rak paling lama ditempatkan duluan
            // yang dikurangi) supaya Peta Rak tetap sinkron dengan stok baru.
            const rencana = rencanaKurangiRak(modal.item.sku, qty, penempatan);
            for (const r of rencana) {
              if (r.qtyBaru <= 0) {
                const baris = (penempatan || []).find((p) => p.id === r.id);
                await sb(`penempatan?id=eq.${r.id}`, { method: "DELETE" });
                // Habis terjual/keluar sampai rak itu kosong — catat biar Cek
                // Marketplace bisa notif "Rak Jadi Kosong".
                if (baris) {
                  await sb("rak_events", {
                    method: "POST",
                    body: JSON.stringify({ sku: modal.item.sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null }),
                  });
                }
              } else {
                await sb(`penempatan?id=eq.${r.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ qty: r.qtyBaru }),
                });
              }
            }
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
            await tandaiPerluFotoUlang(s.sku);
          }, "Harga SKU diperbarui, barang yang sudah difoto ditarik balik ke Pemotretan")
        }
      />
    );
  }

  if (modal.type === "edit-harga") {
    const s = modal.item;
    // Lapis keamanan kedua di sisi UI — tombol pemicu di SkuHarga.jsx sudah
    // disembunyikan untuk role selain superadmin, tapi modal ini juga dijaga
    // sendiri kalau-kalau modal.type ini terpanggil dari jalur lain.
    if (session?.role !== "superadmin") {
      return (
        <ModalShell title="Tidak Diizinkan" onClose={close}>
          <p className="text-xs text-slate-400">Edit harga langsung hanya bisa dilakukan oleh Super Admin.</p>
        </ModalShell>
      );
    }
    return (
      <EditHargaModal
        item={s}
        settings={settings}
        saving={saving}
        onClose={close}
        onConfirm={(patch) =>
          run(async () => {
            if (!settings) throw new Error("Pengaturan harga belum termuat");
            await sb(`sku_master?id=eq.${s.id}`, {
              method: "PATCH",
              body: JSON.stringify({ ...patch, harga_asli_baru: null }),
            });
            await tandaiPerluFotoUlang(s.sku);
          }, "Harga SKU diperbarui, barang yang sudah difoto ditarik balik ke Pemotretan")
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
                  // Kalau hasil hitung fisik ternyata masih ada stoknya, aktifkan
                  // lagi SKU-nya (jaga-jaga kalau sebelumnya sempat dinonaktifkan).
                  body: JSON.stringify({ stok: qtyFisik, ...(qtyFisik > 0 ? { nonaktif: false } : {}) }),
                });
                // Kalau hasil opname LEBIH KECIL dari stok sistem, samakan juga
                // qty di rak (FIFO) supaya Peta Rak tidak nunjukkin lebih banyak
                // dari stok yang sebenarnya. Kalau lebih besar (stok nambah),
                // kita TIDAK menebak-nebak taruh selisihnya di rak mana — biarkan
                // muncul di "Sisa di Gudang" supaya ditempatkan manual.
                if (selisih < 0) {
                  const rencana = rencanaKurangiRak(s.sku, -selisih, penempatan);
                  for (const r of rencana) {
                    if (r.qtyBaru <= 0) {
                      const baris = (penempatan || []).find((p) => p.id === r.id);
                      await sb(`penempatan?id=eq.${r.id}`, { method: "DELETE" });
                      // Rak itu jadi kosong akibat penyesuaian stok opname —
                      // catat biar Cek Marketplace bisa notif "Rak Jadi Kosong".
                      if (baris) {
                        await sb("rak_events", {
                          method: "POST",
                          body: JSON.stringify({ sku: s.sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null }),
                        });
                      }
                    } else {
                      await sb(`penempatan?id=eq.${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ qty: r.qtyBaru }),
                      });
                    }
                  }
                }
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

  if (modal.type === "edit-rak") {
    const r = modal.item;
    return (
      <EditRakForm
        rak={r}
        onClose={close}
        saving={saving}
        onSubmit={(vals) =>
          run(async () => {
            await sb(`rak?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(vals) });
            // Kode rak diganti -> samakan rak_code di penempatan & items yang masih
            // menunjuk ke kode lama, supaya tidak ada data yang jadi "anak hilang".
            if (vals.code && vals.code !== r.code) {
              await sb(`penempatan?rak_code=eq.${encodeURIComponent(r.code)}`, {
                method: "PATCH",
                body: JSON.stringify({ rak_code: vals.code }),
              });
              await sb(`items?rak_code=eq.${encodeURIComponent(r.code)}`, {
                method: "PATCH",
                body: JSON.stringify({ rak_code: vals.code }),
              });
            }
          }, "Rak diperbarui")
        }
      />
    );
  }

  if (modal.type === "hapus-rak") {
    const r = modal.item;
    const pemenang = skuForRak(r.code, penempatan);
    const s = pemenang ? (skuMaster || []).find((x) => x.sku === pemenang) : null;
    const terisi = !!s && s.stok > 0;
    return (
      <ModalShell title={`Hapus Rak — ${r.code}`} onClose={close}>
        {terisi ? (
          <>
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                Rak ini masih berisi SKU <span className="font-mono">{pemenang}</span> ({s.stok}x). Pindahkan atau
                kosongkan dulu isinya sebelum rak ini bisa dihapus.
              </div>
            </div>
            <button
              onClick={close}
              className="w-full py-2.5 rounded-lg text-xs font-medium border border-slate-800 text-slate-300 hover:border-slate-700"
            >
              Tutup
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-4">
              Rak <span className="font-mono text-slate-200">{r.code}</span> akan dihapus permanen. Tindakan ini
              tidak bisa dibatalkan.
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
                    // Bersihkan sisa riwayat penempatan (kalau ada, mis. rak pernah
                    // dipakai lalu dikosongkan) sebelum menghapus master rak-nya.
                    await sb(`penempatan?rak_code=eq.${encodeURIComponent(r.code)}`, { method: "DELETE" });
                    await sb(`rak?id=eq.${r.id}`, { method: "DELETE" });
                  }, "Rak dihapus")
                }
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50"
              >
                {saving ? "Menghapus…" : "Ya, Hapus Rak"}
              </button>
            </div>
          </>
        )}
      </ModalShell>
    );
  }

  return null;
}