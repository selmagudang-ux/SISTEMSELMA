import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, Trash2, PackageCheck, PackageX, Undo2, Truck, ArrowRight, RefreshCw } from "lucide-react";
import { PageHeader, EmptyState, Badge, ModalShell, Field, inputClass } from "../components/ui";
import { sb, entitasSesi, kodeHoldingPasti } from "../lib/api";
import { bisa, fiturMatiEntitas } from "../lib/constants";
import { rencanaKurangiRak } from "./Rak";

// =========================================================
// TRANSFER BARANG ANTAR ENTITAS (stok gudang / sku_master)
// Alur: Pengirim buat transfer -> stok pengirim langsung berkurang (status "dikirim")
//       -> Penerima konfirmasi (boleh qty lebih sedikit) -> stok penerima bertambah.
// Penulisan stok SELALU ke PT akun yang sedang login (sb() mengisi/menyaring kolom
// entitas otomatis), jadi stok yang tidak jadi pindah (batal / ditolak / selisih)
// dikembalikan oleh PENGIRIM sendiri lewat tombol "Kembalikan ke stok".
// Tabel: transfer_barang (supabase/migrations/20261110_transfer_antar_entitas.sql).
// =========================================================

const STATUS = {
  dikirim: { label: "Dalam perjalanan", color: "amber" },
  diterima: { label: "Diterima", color: "emerald" },
  ditolak: { label: "Ditolak penerima", color: "red" },
  dibatalkan: { label: "Dibatalkan", color: "slate" },
};

// Kolom sku_master yang disalin ke PT penerima kalau SKU-nya belum ada di sana.
const KOLOM_SALIN = [
  "bahan", "peruntukan", "kategori", "subkategori", "model", "warna", "ukuran",
  "harga_asli", "harga_dasar", "hpp", "grosir", "tengah", "ecer",
  "barcode_supplier", "nama", "pelengkap",
];
const TIPE_KODE_SKU = ["bahan", "peruntukan", "kategori", "subkategori", "warna", "ukuran"];

const fmtWaktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "");

function kodeTransfer() {
  const d = new Date();
  const tgl = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `TRF-${tgl}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// Selisih yang belum kembali ke stok pengirim.
function qtyKembali(t) {
  if (t.stok_dikembalikan) return [];
  return (t.items || [])
    .map((it) => ({ ...it, kembali: Number(it.qty) - (t.status === "diterima" ? Number(it.qty_diterima) || 0 : 0) }))
    .filter((it) => it.kembali > 0);
}

// Tambah stok (SKU lama: +stok, SKU baru: salin dari snapshot) ke PT akun sendiri.
// Mengembalikan { riwayat, undo } — undo() membatalkan semua perubahan stok kalau
// langkah berikutnya gagal.
async function tambahStokBanyak(daftar, master) {
  const undoList = [];
  const riwayat = [];
  const undo = async () => {
    for (const u of undoList.reverse()) {
      try {
        if (u.baru) await sb(`sku_master?id=eq.${u.id}`, { method: "DELETE" });
        else await sb(`sku_master?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ stok: u.stokSebelum }) });
      } catch {
        /* best effort */
      }
    }
  };
  try {
    // Kode Master Data (bahan, kategori, dst) yang belum ada di PT ini dibuat otomatis,
    // sama seperti saat Buat SKU.
    const sudahDibuat = new Set();
    for (const it of daftar) {
      for (const tipe of TIPE_KODE_SKU) {
        const kode = it[tipe];
        if (kode && !sudahDibuat.has(`${tipe}:${kode}`) && !(master?.[tipe] || []).some((m) => m.kode === kode)) {
          sudahDibuat.add(`${tipe}:${kode}`);
          try {
            await sb("master_data", { method: "POST", body: JSON.stringify({ tipe, kode, label: kode }) });
          } catch {
            /* kode bisa sudah ada; tidak fatal */
          }
        }
      }
    }
    const ada = await sb(`sku_master?sku=in.(${daftar.map((d) => `"${String(d.sku_tujuan || d.sku).replace(/"/g, '\\"')}"`).join(",")})&select=id,sku,stok`);
    const petaAda = new Map((ada || []).map((r) => [r.sku, r]));
    for (const it of daftar) {
      const q = Number(it.jumlah);
      const skuIni = it.sku_tujuan || it.sku;
      const lama = petaAda.get(skuIni);
      if (lama) {
        const stokSebelum = Number(lama.stok) || 0;
        const hasil = await sb(`sku_master?id=eq.${lama.id}&stok=eq.${stokSebelum}`, {
          method: "PATCH",
          body: JSON.stringify({ stok: stokSebelum + q }),
        });
        if (!hasil?.length) throw new Error(`Stok ${skuIni} berubah saat diproses. Muat ulang lalu coba lagi.`);
        undoList.push({ id: lama.id, stokSebelum });
        riwayat.push({ sku: skuIni, type: "masuk", qty_before: stokSebelum, qty_change: q, qty_after: stokSebelum + q, note: it.catatan });
      } else {
        const badan = { sku: skuIni, stok: q };
        KOLOM_SALIN.forEach((k) => {
          if (it[k] !== undefined) badan[k] = it[k];
        });
        let baru;
        try {
          baru = await sb("sku_master", { method: "POST", body: JSON.stringify(badan) });
        } catch (e) {
          // Kode SKU unik di seluruh database (bukan per PT): kode ini sudah dipakai PT lain.
          if (e.pgCode === "23505") throw new Error(`Kode SKU ${skuIni} sudah dipakai perusahaan lain. Isi kolom "Masuk ke SKU" dengan SKU milik Anda (pilih yang sudah ada, atau ketik kode baru).`);
          throw e;
        }
        undoList.push({ id: baru?.[0]?.id, baru: true });
        riwayat.push({ sku: skuIni, type: "masuk", qty_before: 0, qty_change: q, qty_after: q, note: `${it.catatan} (SKU baru dibuat)` });
      }
    }
  } catch (e) {
    await undo();
    throw e;
  }
  return { riwayat, undo };
}

export default function TransferEntitas({ skuMaster = [], penempatan = [], master = {}, session, reload, showToast }) {
  const entSaya = entitasSesi();
  const bisaTransfer = bisa(session?.role, "stok.transfer_entitas");
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [filter, setFilter] = useState("perlu");
  const [modal, setModal] = useState(null); // {jenis: "buat"} | {jenis: "terima"|"tolak", t}
  const [proses, setProses] = useState(false);

  const namaEnt = useCallback(
    (kode) => (master?.entitas || []).find((e) => e.kode === kode)?.label || kode,
    [master]
  );

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const e = encodeURIComponent(entSaya);
      setRows((await sb(`transfer_barang?or=(entitas_asal.eq.${e},entitas_tujuan.eq.${e})&order=created_at.desc&limit=300`)) || []);
    } catch (err) {
      showToast?.(err.message?.includes("transfer_barang") ? "Tabel transfer_barang belum dibuat — jalankan SQL migrasi dulu." : err.message, "err");
    } finally {
      setMemuat(false);
    }
  }, [entSaya, showToast]);

  useEffect(() => {
    muat();
  }, [muat]);

  const perluTindakan = (t) =>
    (t.status === "dikirim" && t.entitas_tujuan === entSaya) ||
    (t.entitas_asal === entSaya && qtyKembali(t).length > 0 && t.status !== "dikirim");

  const tampil = rows.filter((t) =>
    filter === "perlu" ? perluTindakan(t) : filter === "masuk" ? t.entitas_tujuan === entSaya : filter === "keluar" ? t.entitas_asal === entSaya : true
  );
  const jumlahPerlu = rows.filter(perluTindakan).length;

  // Jalankan aksi dengan kunci "proses" + toast + muat ulang data stok & daftar.
  const jalankan = async (fn, pesanSukses) => {
    if (proses) return;
    setProses(true);
    try {
      await fn();
      showToast?.(pesanSukses);
      setModal(null);
      await Promise.all([muat(), reload?.()]);
    } catch (e) {
      showToast?.(e.message || "Gagal memproses transfer", "err", 6000);
    } finally {
      setProses(false);
    }
  };

  const catatRiwayat = async (riwayat) => {
    if (!riwayat.length) return;
    try {
      await sb("stock_history", { method: "POST", body: JSON.stringify(riwayat) });
    } catch {
      showToast?.("Stok sudah benar, tapi riwayat stok gagal dicatat.", "warn", 5000);
    }
  };

  // ---------- Pengirim: buat transfer ----------
  const buat = (tujuan, daftar, catatan) =>
    jalankan(async () => {
      const ids = daftar.map((d) => d.id).join(",");
      const segar = await sb(`sku_master?id=in.(${ids})&select=id,sku,stok`);
      const petaStok = new Map((segar || []).map((r) => [r.id, Number(r.stok) || 0]));
      daftar.forEach((d) => {
        if ((petaStok.get(d.id) ?? 0) < d.jumlah) throw new Error(`Stok ${d.sku} tidak cukup (tersisa ${petaStok.get(d.id) ?? 0}).`);
      });
      const items = daftar.map((d) => {
        const o = { sku: d.sku, qty: d.jumlah, qty_diterima: 0 };
        KOLOM_SALIN.forEach((k) => {
          if (d.src[k] !== undefined && d.src[k] !== null) o[k] = d.src[k];
        });
        return o;
      });
      // Catat transfernya dulu; kalau pengurangan stok gagal, dibatalkan lagi.
      const dibuat = await sb("transfer_barang", {
        method: "POST",
        body: JSON.stringify({
          kode: kodeTransfer(),
          entitas_asal: entSaya,
          entitas_tujuan: tujuan,
          items,
          catatan: catatan || null,
          dibuat_oleh: session?.username || null,
          dibuat_oleh_nama: session?.nama || session?.username || null,
        }),
      });
      const t = dibuat?.[0];
      const dikurangi = [];
      const riwayat = [];
      try {
        for (const d of daftar) {
          const sebelum = petaStok.get(d.id);
          const hasil = await sb(`sku_master?id=eq.${d.id}&stok=eq.${sebelum}`, {
            method: "PATCH",
            body: JSON.stringify({ stok: sebelum - d.jumlah }),
          });
          if (!hasil?.length) throw new Error(`Stok ${d.sku} berubah saat diproses. Muat ulang lalu coba lagi.`);
          dikurangi.push({ id: d.id, sebelum });
          riwayat.push({
            sku: d.sku, type: "keluar", qty_before: sebelum, qty_change: -d.jumlah, qty_after: sebelum - d.jumlah,
            note: `Transfer ke ${namaEnt(tujuan)} (${t.kode})`,
          });
        }
      } catch (e) {
        for (const u of dikurangi) {
          try {
            await sb(`sku_master?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ stok: u.sebelum }) });
          } catch {
            /* best effort */
          }
        }
        await sb(`transfer_barang?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ status: "dibatalkan", stok_dikembalikan: true }) }).catch(() => {});
        throw e;
      }
      await catatRiwayat(riwayat);
      // Samakan qty rak (FIFO) seperti Barang Keluar, supaya Peta Rak tidak menyimpang.
      try {
        for (const d of daftar) {
          for (const r of rencanaKurangiRak(d.sku, d.jumlah, penempatan)) {
            await sb(`penempatan?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ qty: Math.max(r.qtyBaru, 0) }) });
            if (r.qtyBaru <= 0) {
              const baris = penempatan.find((p) => p.id === r.id);
              if (baris) await sb("rak_events", { method: "POST", body: JSON.stringify({ sku: d.sku, jenis: "keluar", rak_dari: baris.rak_code, rak_baru: null }) });
            }
          }
        }
      } catch {
        showToast?.("Stok sudah berkurang, tapi qty rak gagal disamakan. Cek Peta Rak.", "warn", 6000);
      }
    }, "Transfer dibuat — menunggu konfirmasi penerima");

  // ---------- Penerima: terima ----------
  const terima = (t, qtyMap, catatan, padanan = {}) =>
    jalankan(async () => {
      const items = t.items.map((it) => ({ ...it, sku_tujuan: String(padanan[it.sku] || it.sku).trim(), qty_diterima: Math.min(Math.max(Number(qtyMap[it.sku]) || 0, 0), Number(it.qty)) }));
      if (items.every((it) => !it.qty_diterima)) throw new Error("Isi qty diterima minimal satu barang, atau pakai Tolak.");
      const selisih = items.some((it) => it.qty_diterima < Number(it.qty));
      // "Klaim" dulu supaya tidak bisa diterima dua kali (mis. klik ganda / dua perangkat).
      const klaim = await sb(`transfer_barang?id=eq.${t.id}&status=eq.dikirim`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "diterima", items, catatan_terima: catatan || null, stok_dikembalikan: !selisih,
          diterima_oleh_nama: session?.nama || session?.username || null, diterima_at: new Date().toISOString(),
        }),
      });
      if (!klaim?.length) throw new Error("Transfer ini sudah diproses atau dibatalkan pengirim. Muat ulang.");
      try {
        const { riwayat } = await tambahStokBanyak(
          items.filter((it) => it.qty_diterima > 0).map((it) => ({ ...it, jumlah: it.qty_diterima, catatan: `Transfer dari ${namaEnt(t.entitas_asal)} (${t.kode})` })),
          master
        );
        await catatRiwayat(riwayat);
      } catch (e) {
        await sb(`transfer_barang?id=eq.${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "dikirim", items: t.items, catatan_terima: null, stok_dikembalikan: false, diterima_oleh_nama: null, diterima_at: null }),
        }).catch(() => {});
        throw e;
      }
    }, "Barang diterima, stok bertambah");

  const tolak = (t, alasan) =>
    jalankan(async () => {
      if (!alasan.trim()) throw new Error("Isi alasan penolakan.");
      const klaim = await sb(`transfer_barang?id=eq.${t.id}&status=eq.dikirim`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "ditolak", catatan_terima: alasan.trim(),
          diterima_oleh_nama: session?.nama || session?.username || null, diterima_at: new Date().toISOString(),
        }),
      });
      if (!klaim?.length) throw new Error("Transfer ini sudah diproses atau dibatalkan pengirim. Muat ulang.");
    }, "Transfer ditolak — pengirim perlu mengembalikan stok");

  // ---------- Pengirim: kembalikan stok (batal / ditolak / selisih) ----------
  const kembalikan = async (t) => {
    const daftar = qtyKembali(t);
    if (!daftar.length) return;
    const klaim = await sb(`transfer_barang?id=eq.${t.id}&stok_dikembalikan=eq.false`, {
      method: "PATCH",
      body: JSON.stringify({ stok_dikembalikan: true }),
    });
    if (!klaim?.length) throw new Error("Stok transfer ini sudah dikembalikan.");
    try {
      const { riwayat } = await tambahStokBanyak(
        daftar.map((it) => ({ ...it, sku_tujuan: undefined, jumlah: it.kembali, catatan: `Pengembalian transfer ${t.kode} ke ${namaEnt(t.entitas_tujuan)} (${STATUS[t.status]?.label})` })),
        master
      );
      await catatRiwayat(riwayat);
    } catch (e) {
      await sb(`transfer_barang?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ stok_dikembalikan: false }) }).catch(() => {});
      throw e;
    }
  };

  const batalkan = (t) =>
    jalankan(async () => {
      const klaim = await sb(`transfer_barang?id=eq.${t.id}&status=eq.dikirim`, { method: "PATCH", body: JSON.stringify({ status: "dibatalkan" }) });
      if (!klaim?.length) throw new Error("Transfer ini sudah diterima/ditolak penerima, tidak bisa dibatalkan.");
      await kembalikan({ ...t, status: "dibatalkan" });
    }, "Transfer dibatalkan, stok dikembalikan");

  const kembalikanStok = (t) => jalankan(() => kembalikan(t), "Stok dikembalikan ke gudang");

  return (
    <div>
      <PageHeader
        title="Transfer Antar Entitas"
        description="Kirim stok gudang ke perusahaan lain di grup. Stok pengirim berkurang saat dikirim; stok penerima bertambah setelah penerima mengonfirmasi."
        action={
          <div className="flex items-center gap-2">
            <button onClick={muat} title="Muat ulang" className="p-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
              <RefreshCw size={14} className={memuat ? "animate-spin" : ""} />
            </button>
            {bisaTransfer && (
              <button
                onClick={() => setModal({ jenis: "buat" })}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-amber-500 text-slate-900 hover:bg-amber-400"
              >
                <Plus size={14} /> Buat Transfer
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ["perlu", `Perlu tindakan${jumlahPerlu ? ` (${jumlahPerlu})` : ""}`],
          ["masuk", "Masuk"],
          ["keluar", "Keluar"],
          ["semua", "Semua"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filter === k ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {memuat && !rows.length ? (
        <div className="text-sm text-slate-500 py-10 text-center">Memuat…</div>
      ) : tampil.length === 0 ? (
        <EmptyState label={filter === "perlu" ? "Tidak ada transfer yang perlu ditindaklanjuti." : "Belum ada transfer."} />
      ) : (
        <div className="space-y-3">
          {tampil.map((t) => {
            const keluar = t.entitas_asal === entSaya;
            const kembali = keluar ? qtyKembali(t) : [];
            const totalQty = (t.items || []).reduce((a, it) => a + (Number(it.qty) || 0), 0);
            return (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
                  <span className="font-mono text-xs text-slate-300">{t.kode}</span>
                  <Badge color={STATUS[t.status]?.color}>{STATUS[t.status]?.label}</Badge>
                  <span className="flex items-center gap-1.5 text-sm text-slate-200 ml-1">
                    {namaEnt(t.entitas_asal)} <ArrowRight size={13} className="text-slate-500" /> {namaEnt(t.entitas_tujuan)}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    {fmtWaktu(t.created_at)}
                    {t.dibuat_oleh_nama ? ` · ${t.dibuat_oleh_nama}` : ""}
                  </span>
                </div>
                <div className="px-4 py-2">
                  {(t.items || []).map((it) => (
                    <div key={it.sku} className="flex items-center justify-between py-1 text-xs">
                      <span className="font-mono text-slate-300 truncate">
                        {it.sku}
                        {t.status === "diterima" && it.sku_tujuan && it.sku_tujuan !== it.sku ? ` → ${it.sku_tujuan}` : ""}
                      </span>
                      <span className="text-slate-400 shrink-0 ml-3">
                        {t.status === "diterima" ? `${it.qty_diterima} dari ${it.qty}` : `${it.qty} pcs`}
                      </span>
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 mt-1">
                    {(t.items || []).length} SKU · {totalQty} pcs
                    {t.catatan ? ` · Catatan: ${t.catatan}` : ""}
                  </div>
                  {t.diterima_at && (
                    <div className="text-[11px] text-slate-500">
                      {STATUS[t.status]?.label} {fmtWaktu(t.diterima_at)}
                      {t.diterima_oleh_nama ? ` oleh ${t.diterima_oleh_nama}` : ""}
                      {t.catatan_terima ? ` · ${t.catatan_terima}` : ""}
                    </div>
                  )}
                </div>
                {bisaTransfer && (
                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800">
                    {t.status === "dikirim" && !keluar && (
                      <>
                        <button onClick={() => setModal({ jenis: "terima", t })} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25">
                          <PackageCheck size={13} /> Terima Barang
                        </button>
                        <button onClick={() => setModal({ jenis: "tolak", t })} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10">
                          <PackageX size={13} /> Tolak
                        </button>
                      </>
                    )}
                    {t.status === "dikirim" && keluar && (
                      <button
                        disabled={proses}
                        onClick={() => window.confirm(`Batalkan transfer ${t.kode}? Stok akan dikembalikan ke gudang Anda.`) && batalkan(t)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Trash2 size={13} /> Batalkan
                      </button>
                    )}
                    {keluar && t.status !== "dikirim" && kembali.length > 0 && (
                      <button
                        disabled={proses}
                        onClick={() => kembalikanStok(t)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                      >
                        <Undo2 size={13} /> Kembalikan {kembali.reduce((a, it) => a + it.kembali, 0)} pcs ke stok
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal?.jenis === "buat" && (
        <FormBuat skuMaster={skuMaster} master={master} entSaya={entSaya} saving={proses} onClose={() => setModal(null)} onSubmit={buat} />
      )}
      {modal?.jenis === "terima" && <FormTerima t={modal.t} namaEnt={namaEnt} skuMaster={skuMaster} saving={proses} onClose={() => setModal(null)} onSubmit={terima} />}
      {modal?.jenis === "tolak" && <FormTolak t={modal.t} saving={proses} onClose={() => setModal(null)} onSubmit={tolak} />}
    </div>
  );
}

function FormBuat({ skuMaster, master, entSaya, saving, onClose, onSubmit }) {
  const kodeHolding = kodeHoldingPasti(master?.entitas, master?.entitas_set);
  const pilihanTujuan = (master?.entitas || []).filter(
    (e) => e.kode !== entSaya && e.kode !== kodeHolding && !fiturMatiEntitas(master, e.kode).includes("stok")
  );
  const [tujuan, setTujuan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState([]); // [{src, jumlah}]

  const hasil = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    const terpilih = new Set(pilih.map((p) => p.src.id));
    return skuMaster
      .filter((s) => !s.nonaktif && Number(s.stok) > 0 && !terpilih.has(s.id) && s.sku.toLowerCase().includes(k))
      .slice(0, 8);
  }, [q, skuMaster, pilih]);

  const ubahJumlah = (id, v) =>
    setPilih((l) => l.map((p) => (p.src.id === id ? { ...p, jumlah: Math.min(Math.max(Math.floor(Number(v) || 0), 0), Number(p.src.stok)) } : p)));

  const valid = tujuan && pilih.length > 0 && pilih.every((p) => p.jumlah > 0);

  return (
    <ModalShell title="Buat Transfer Antar Entitas" onClose={onClose} maxWidth="max-w-xl">
      <Field label="Kirim ke">
        <select value={tujuan} onChange={(e) => setTujuan(e.target.value)} className={inputClass}>
          <option value="">Pilih perusahaan tujuan…</option>
          {pilihanTujuan.map((e) => (
            <option key={e.kode} value={e.kode}>
              {e.label || e.kode}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cari SKU (hanya yang stoknya ada)">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <Search size={14} className="text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik kode SKU…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600" />
        </div>
      </Field>
      {hasil.length > 0 && (
        <div className="rounded-lg border border-slate-700 mb-3 overflow-hidden">
          {hasil.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setPilih((l) => [...l, { src: s, jumlah: 1 }]);
                setQ("");
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0"
            >
              <span className="font-mono text-slate-200 truncate">{s.sku}</span>
              <span className="text-slate-500 shrink-0 ml-3">stok {s.stok}</span>
            </button>
          ))}
        </div>
      )}

      {pilih.length > 0 && (
        <div className="rounded-lg border border-slate-700 mb-3">
          {pilih.map((p) => (
            <div key={p.src.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-200 truncate">{p.src.sku}</div>
                <div className="text-[11px] text-slate-500">stok tersedia {p.src.stok}</div>
              </div>
              <input
                type="number" min={1} max={p.src.stok} value={p.jumlah || ""}
                onChange={(e) => ubahJumlah(p.src.id, e.target.value)}
                className={`${inputClass} !w-20 text-center`}
              />
              <button onClick={() => setPilih((l) => l.filter((x) => x.src.id !== p.src.id))} className="p-1.5 text-slate-500 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Field label="Catatan (opsional)">
        <input value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass} placeholder="mis. kirim via kurir internal" />
      </Field>

      <div className="text-[11px] text-slate-500 mb-3">
        Stok gudang Anda langsung berkurang. Kalau SKU belum ada di perusahaan tujuan, SKU dan harganya dibuat otomatis saat barang diterima.
      </div>
      <button
        disabled={!valid || saving}
        onClick={() => onSubmit(tujuan, pilih.map((p) => ({ id: p.src.id, sku: p.src.sku, jumlah: p.jumlah, src: p.src })), catatan.trim())}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-40"
      >
        <Truck size={15} /> {saving ? "Memproses…" : "Kirim Barang"}
      </button>
    </ModalShell>
  );
}

function FormTerima({ t, namaEnt, skuMaster, saving, onClose, onSubmit }) {
  const [padanan, setPadanan] = useState(() => Object.fromEntries((t.items || []).map((it) => [it.sku, it.sku])));
  const [qty, setQty] = useState(() => Object.fromEntries((t.items || []).map((it) => [it.sku, Number(it.qty)])));
  const [catatan, setCatatan] = useState("");
  return (
    <ModalShell title={`Terima ${t.kode}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-xs text-slate-400 mb-3">
        Dari {namaEnt(t.entitas_asal)}. Isi qty yang benar-benar diterima; selisihnya dikembalikan ke stok pengirim.
      </div>
      <div className="rounded-lg border border-slate-700 mb-3">
        {(t.items || []).map((it) => (
          <div key={it.sku} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-slate-200 truncate">{it.sku}</div>
              <div className="text-[11px] text-slate-500">dikirim {it.qty}</div>
              <input
                list="sku-penerima" value={padanan[it.sku] ?? ""}
                onChange={(e) => setPadanan((m) => ({ ...m, [it.sku]: e.target.value }))}
                title="Masuk ke SKU" placeholder="Masuk ke SKU"
                className={`${inputClass} !py-1 !text-xs font-mono mt-1`}
              />
            </div>
            <input
              type="number" min={0} max={it.qty} value={qty[it.sku] ?? ""}
              onChange={(e) => setQty((m) => ({ ...m, [it.sku]: e.target.value === "" ? "" : Math.min(Math.max(Math.floor(Number(e.target.value)), 0), Number(it.qty)) }))}
              className={`${inputClass} !w-20 text-center`}
            />
          </div>
        ))}
      </div>
      <datalist id="sku-penerima">
        {skuMaster.map((s) => (
          <option key={s.id} value={s.sku} />
        ))}
      </datalist>
      <div className="text-[11px] text-slate-500 mb-3">
        Kolom kode di bawah tiap barang = SKU tujuan di gudang Anda. Kode SKU unik di seluruh sistem, jadi kalau kode yang sama sudah dipakai perusahaan lain, pilih SKU milik Anda atau ketik kode baru.
      </div>
      <Field label="Catatan (opsional, mis. alasan selisih)">
        <input value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass} />
      </Field>
      <button
        disabled={saving}
        onClick={() => onSubmit(t, qty, catatan.trim(), padanan)}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-40"
      >
        <PackageCheck size={15} /> {saving ? "Memproses…" : "Konfirmasi Terima"}
      </button>
    </ModalShell>
  );
}

function FormTolak({ t, saving, onClose, onSubmit }) {
  const [alasan, setAlasan] = useState("");
  return (
    <ModalShell title={`Tolak ${t.kode}`} onClose={onClose}>
      <Field label="Alasan penolakan">
        <input value={alasan} onChange={(e) => setAlasan(e.target.value)} className={inputClass} placeholder="mis. barang tidak sesuai / tidak pernah tiba" />
      </Field>
      <div className="text-[11px] text-slate-500 mb-3">Stok belum masuk ke gudang Anda. Pengirim akan diminta mengembalikan stok ke gudangnya.</div>
      <button
        disabled={saving || !alasan.trim()}
        onClick={() => onSubmit(t, alasan)}
        className="w-full text-sm font-medium py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-40"
      >
        {saving ? "Memproses…" : "Tolak Transfer"}
      </button>
    </ModalShell>
  );
}