import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, Trash2, PackageCheck, PackageX, Undo2, Truck, ArrowRight, RefreshCw, FileText, Tag } from "lucide-react";
import { PageHeader, EmptyState, Badge, ModalShell, Field, inputClass } from "../components/ui";
import { sb, entitasSesi, namaUsahaEntitas, alamatEntitas, teleponEntitas } from "../lib/api";
import { bisa, fiturMatiEntitas } from "../lib/constants";
import { rencanaKurangiRak } from "./Rak";
import { TombolScanKamera } from "../components/ScanKamera";
import { kodeTerima } from "../lib/kodeTransfer";

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

// Atribut kode SKU yang disimpan di transfer (untuk membuat kode Master Data di PT penerima).
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

// Tambah stok SKU ke PT akun sendiri lewat sku_stok (katalog sku_master bersama, kode SKU sama di
// semua PT). Baris stok PT dibuat kalau belum ada. Mengembalikan { riwayat, undo } — undo()
// membatalkan semua perubahan stok kalau langkah berikutnya gagal.
async function tambahStokBanyak(daftar, master) {
  const ent = entitasSesi();
  const e = encodeURIComponent(ent);
  const undoList = [];
  const riwayat = [];
  const undo = async () => {
    for (const u of undoList.reverse()) {
      try {
        const f = `sku_stok?sku=eq.${encodeURIComponent(u.sku)}&entitas=eq.${e}`;
        if (u.baru) await sb(f, { method: "DELETE" });
        else await sb(f, { method: "PATCH", body: JSON.stringify({ stok: u.stokSebelum }) });
      } catch {
        /* best effort */
      }
    }
  };
  try {
    // Kode Master Data (bahan, kategori, dst) yang belum ada di PT ini dibuat otomatis,
    // supaya labelnya tampil di Master Data PT ini.
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
    const kutip = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
    const ada = await sb(`sku_stok?entitas=eq.${e}&sku=in.(${daftar.map((d) => kutip(d.sku)).join(",")})&select=sku,stok`);
    const petaAda = new Map((ada || []).map((r) => [r.sku, Number(r.stok) || 0]));
    for (const it of daftar) {
      const q = Number(it.jumlah);
      const f = `sku_stok?sku=eq.${encodeURIComponent(it.sku)}&entitas=eq.${e}`;
      if (petaAda.has(it.sku)) {
        const stokSebelum = petaAda.get(it.sku);
        const hasil = await sb(`${f}&stok=eq.${stokSebelum}`, { method: "PATCH", body: JSON.stringify({ stok: stokSebelum + q, updated_at: new Date().toISOString() }) });
        if (!hasil?.length) throw new Error(`Stok ${it.sku} berubah saat diproses. Muat ulang lalu coba lagi.`);
        undoList.push({ sku: it.sku, stokSebelum });
        riwayat.push({ sku: it.sku, type: "masuk", qty_before: stokSebelum, qty_change: q, qty_after: stokSebelum + q, note: it.catatan });
      } else {
        await sb("sku_stok", { method: "POST", body: JSON.stringify({ sku: it.sku, entitas: ent, stok: q }) });
        undoList.push({ sku: it.sku, baru: true });
        riwayat.push({ sku: it.sku, type: "masuk", qty_before: 0, qty_change: q, qty_after: q, note: `${it.catatan} (SKU baru di gudang ini)` });
      }
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { riwayat, undo };
}

// Ubah stok SKU di entitas MANA PUN (ent diisi eksplisit, bukan dari sesi). delta > 0 = tambah,
// delta < 0 = kurangi. Dipakai khusus untuk menghapus transfer (membalikkan ke kondisi semula).
// Pakai kunci optimis (stok=eq.<sebelum>) seperti fungsi lain; kalau ada langkah gagal, semua
// perubahan yang sudah masuk dibatalkan sendiri. Mengembalikan { riwayat, undo }.
async function terapkanDeltaStok(ent, daftar) {
  const e = encodeURIComponent(ent);
  const undoList = [];
  const riwayat = [];
  const undo = async () => {
    for (const u of [...undoList].reverse()) {
      try {
        const f = `sku_stok?sku=eq.${encodeURIComponent(u.sku)}&entitas=eq.${e}`;
        if (u.baru) await sb(f, { method: "DELETE" });
        else await sb(f, { method: "PATCH", body: JSON.stringify({ stok: u.stokSebelum }) });
      } catch {
        /* best effort */
      }
    }
  };
  try {
    const kutip = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
    const ada = await sb(`sku_stok?entitas=eq.${e}&sku=in.(${daftar.map((d) => kutip(d.sku)).join(",")})&select=sku,stok`);
    const petaAda = new Map((ada || []).map((r) => [r.sku, Number(r.stok) || 0]));
    for (const it of daftar) {
      const delta = Number(it.delta);
      const f = `sku_stok?sku=eq.${encodeURIComponent(it.sku)}&entitas=eq.${e}`;
      if (petaAda.has(it.sku)) {
        const sebelum = petaAda.get(it.sku);
        if (sebelum + delta < 0) throw new Error(`Stok ${it.sku} tidak cukup untuk ditarik kembali (tersisa ${sebelum}, perlu ${-delta}).`);
        const hasil = await sb(`${f}&stok=eq.${sebelum}`, { method: "PATCH", body: JSON.stringify({ stok: sebelum + delta, updated_at: new Date().toISOString() }) });
        if (!hasil?.length) throw new Error(`Stok ${it.sku} berubah saat diproses. Muat ulang lalu coba lagi.`);
        undoList.push({ sku: it.sku, stokSebelum: sebelum });
        riwayat.push({ sku: it.sku, entitas: ent, type: delta > 0 ? "masuk" : "keluar", qty_before: sebelum, qty_change: delta, qty_after: sebelum + delta, note: it.catatan });
      } else {
        if (delta < 0) throw new Error(`Stok ${it.sku} tidak ditemukan di gudang tujuan.`);
        await sb("sku_stok", { method: "POST", body: JSON.stringify({ sku: it.sku, entitas: ent, stok: delta }) });
        undoList.push({ sku: it.sku, baru: true });
        riwayat.push({ sku: it.sku, entitas: ent, type: "masuk", qty_before: 0, qty_change: delta, qty_after: delta, note: it.catatan });
      }
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { riwayat, undo };
}

// Rencana membalikkan satu transfer ke kondisi semula (untuk tombol Hapus):
//   ambil   = stok yang harus DITARIK dari penerima (hanya kalau sudah diterima)
//   kembali = stok yang harus DIKEMBALIKAN ke pengirim (yang belum pernah dikembalikan)
function rencanaHapus(t) {
  const ambil = [];
  const kembali = [];
  for (const it of t.items || []) {
    const qty = Number(it.qty) || 0;
    const diterima = t.status === "diterima" ? Math.min(Number(it.qty_diterima) || 0, qty) : 0;
    const balik = t.stok_dikembalikan ? diterima : qty;
    if (diterima > 0) ambil.push({ sku: it.sku, jumlah: diterima });
    if (balik > 0) kembali.push({ sku: it.sku, jumlah: balik });
  }
  return { ambil, kembali };
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
      const e = encodeURIComponent(entSaya);
      const kutip = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
      const segar = await sb(`sku_stok?entitas=eq.${e}&sku=in.(${daftar.map((d) => kutip(d.sku)).join(",")})&select=sku,stok`);
      const petaStok = new Map((segar || []).map((r) => [r.sku, Number(r.stok) || 0]));
      daftar.forEach((d) => {
        if ((petaStok.get(d.sku) ?? 0) < d.jumlah) throw new Error(`Stok ${d.sku} tidak cukup (tersisa ${petaStok.get(d.sku) ?? 0}).`);
      });
      const items = daftar.map((d) => {
        const o = { sku: d.sku, qty: d.jumlah, qty_diterima: 0 };
        TIPE_KODE_SKU.forEach((k) => {
          if (d.src[k]) o[k] = d.src[k];
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
          const sebelum = petaStok.get(d.sku);
          const hasil = await sb(`sku_stok?sku=eq.${encodeURIComponent(d.sku)}&entitas=eq.${e}&stok=eq.${sebelum}`, {
            method: "PATCH",
            body: JSON.stringify({ stok: sebelum - d.jumlah, updated_at: new Date().toISOString() }),
          });
          if (!hasil?.length) throw new Error(`Stok ${d.sku} berubah saat diproses. Muat ulang lalu coba lagi.`);
          dikurangi.push({ sku: d.sku, sebelum });
          riwayat.push({
            sku: d.sku, type: "keluar", qty_before: sebelum, qty_change: -d.jumlah, qty_after: sebelum - d.jumlah,
            note: `Transfer ke ${namaEnt(tujuan)} (${t.kode})`,
          });
        }
      } catch (err) {
        for (const u of dikurangi) {
          try {
            await sb(`sku_stok?sku=eq.${encodeURIComponent(u.sku)}&entitas=eq.${e}`, { method: "PATCH", body: JSON.stringify({ stok: u.sebelum }) });
          } catch {
            /* best effort */
          }
        }
        await sb(`transfer_barang?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ status: "dibatalkan", stok_dikembalikan: true }) }).catch(() => {});
        throw err;
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
  const terima = (t, qtyMap, catatan, kodeInput) =>
    jalankan(async () => {
      // Penerimaan DITOLAK kalau kode terima (dari surat jalan) tidak ada / salah — dicek di sini,
      // bukan hanya di form, jadi tidak bisa dilewati.
      if (!samaKode(kodeInput, kodeTerima(t))) throw new Error("Kode terima dari surat jalan belum dimasukkan atau salah. Barang tidak bisa diterima.");
      // Qty diterima WAJIB diisi untuk setiap SKU (hasil hitung fisik penerima, tidak terisi otomatis).
      if (t.items.some((it) => qtyMap[it.sku] === "" || qtyMap[it.sku] === undefined)) throw new Error("Isi qty diterima untuk semua SKU (isi 0 kalau tidak ada yang datang).");
      const items = t.items.map((it) => ({ ...it, qty_diterima: Math.min(Math.max(Number(qtyMap[it.sku]) || 0, 0), Number(it.qty)) }));
      if (items.every((it) => !it.qty_diterima)) throw new Error("Isi qty diterima minimal satu barang, atau pakai Tolak.");
      const selisih = items.some((it) => it.qty_diterima < Number(it.qty));
      if (selisih && !String(catatan || "").trim()) throw new Error("Ada selisih qty — isi catatan alasan selisihnya.");
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
        daftar.map((it) => ({ ...it, jumlah: it.kembali, catatan: `Pengembalian transfer ${t.kode} ke ${namaEnt(t.entitas_tujuan)} (${STATUS[t.status]?.label})` })),
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

  // ---------- Pengirim: HAPUS transfer (stok dibalikkan ke kondisi semula) ----------
  // dikirim            -> stok pengirim dikembalikan penuh
  // ditolak/dibatalkan -> sisa stok yang belum dikembalikan dikembalikan
  // diterima           -> stok penerima ditarik lagi (qty_diterima) + stok pengirim dikembalikan
  // Baris transfer dihapus DULU (hanya satu perangkat yang bisa mendapat baris itu = kunci anti ganda);
  // kalau pembalikan stok gagal, stok dibatalkan dan baris transfer dimasukkan lagi.
  const hapus = (t) =>
    jalankan(async () => {
      if (t.entitas_asal !== entSaya) throw new Error("Transfer hanya bisa dihapus oleh pengirim.");
      const { ambil, kembali } = rencanaHapus(t);
      if (ambil.length) {
        const kutip = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
        const ada = await sb(`sku_stok?entitas=eq.${encodeURIComponent(t.entitas_tujuan)}&sku=in.(${ambil.map((d) => kutip(d.sku)).join(",")})&select=sku,stok`);
        const peta = new Map((ada || []).map((r) => [r.sku, Number(r.stok) || 0]));
        const kurang = ambil.filter((d) => (peta.get(d.sku) ?? 0) < d.jumlah);
        if (kurang.length) {
          throw new Error(
            `Tidak bisa dihapus: stok di ${namaEnt(t.entitas_tujuan)} sudah tidak cukup untuk ditarik kembali (${kurang
              .map((d) => `${d.sku}: perlu ${d.jumlah}, tersisa ${peta.get(d.sku) ?? 0}`)
              .join("; ")}). Minta penerima mengembalikan barangnya dulu.`
          );
        }
      }
      const dihapus = await sb(`transfer_barang?id=eq.${t.id}`, { method: "DELETE" });
      if (!dihapus?.length) throw new Error("Transfer sudah terhapus di perangkat lain, atau database menolak DELETE pada tabel transfer_barang (cek kebijakan RLS). Muat ulang.");
      const baris = dihapus[0];
      let penerima = null;
      let pengirim = null;
      try {
        if (ambil.length) {
          penerima = await terapkanDeltaStok(
            t.entitas_tujuan,
            ambil.map((d) => ({ sku: d.sku, delta: -d.jumlah, catatan: `Transfer ${t.kode} dari ${namaEnt(t.entitas_asal)} dihapus — barang ditarik kembali` }))
          );
        }
        if (kembali.length) {
          pengirim = await terapkanDeltaStok(
            entSaya,
            kembali.map((d) => ({ sku: d.sku, delta: d.jumlah, catatan: `Transfer ${t.kode} ke ${namaEnt(t.entitas_tujuan)} dihapus — stok dikembalikan` }))
          );
        }
      } catch (e) {
        await penerima?.undo();
        try {
          await sb("transfer_barang", { method: "POST", body: JSON.stringify(baris) });
        } catch {
          showToast?.(`Pembalikan stok gagal dan transfer ${t.kode} tidak bisa dipulihkan otomatis. Hubungi admin sebelum mencoba lagi.`, "err", 8000);
        }
        throw e;
      }
      await catatRiwayat([...(penerima?.riwayat || []), ...(pengirim?.riwayat || [])]);
    }, "Transfer dihapus, stok dikembalikan ke semula");

  const konfirmasiHapus = (t) => {
    const { ambil, kembali } = rencanaHapus(t);
    const tot = (l) => l.reduce((a, d) => a + d.jumlah, 0);
    const baris = [`Hapus transfer ${t.kode}?`];
    if (ambil.length) baris.push(`• Stok di ${namaEnt(t.entitas_tujuan)} DITARIK kembali ${tot(ambil)} pcs.`);
    if (kembali.length) baris.push(`• Stok gudang Anda dikembalikan ${tot(kembali)} pcs.`);
    if (!ambil.length && !kembali.length) baris.push("• Tidak ada stok yang perlu diubah (sudah dikembalikan sebelumnya).");
    baris.push("Qty di Peta Rak tidak diubah otomatis. Riwayat transfer ini hilang dari daftar.");
    if (window.confirm(baris.join("\n"))) hapus(t);
  };

  // ---------- Cetak surat jalan / label paket (PDF, lib/PdfTransfer.js) ----------
  const [cetakId, setCetakId] = useState(null);
  const cetak = async (jenis, t) => {
    if (cetakId) return;
    setCetakId(`${jenis}-${t.id}`);
    try {
      const { buatSuratJalan, buatLabelPaket } = await import("../lib/PdfTransfer");
      const pengirim = { nama: namaUsahaEntitas(master, t.entitas_asal), alamat: alamatEntitas(master, t.entitas_asal), telepon: teleponEntitas(master, t.entitas_asal) };
      const penerima = { nama: namaUsahaEntitas(master, t.entitas_tujuan), alamat: alamatEntitas(master, t.entitas_tujuan), telepon: teleponEntitas(master, t.entitas_tujuan) };
      const { blob, nama } = jenis === "surat" ? buatSuratJalan({ t, pengirim, penerima }) : buatLabelPaket({ t, pengirim, penerima });
      const file = new File([blob], nama, { type: "application/pdf" });
      const sentuh = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
      if (sentuh && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (e) {
          if (e?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      showToast?.(e?.message || "Gagal membuat PDF", "err");
    } finally {
      setCetakId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Transfer Antar Entitas"
        description="Kirim stok gudang ke Holding atau perusahaan lain di grup. Kode SKU sama di semua perusahaan. Stok pengirim berkurang saat dikirim; stok penerima bertambah setelah penerima mengonfirmasi."
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
                {keluar && (
                <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800">
                  <button
                    disabled={!!cetakId}
                    onClick={() => cetak("surat", t)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <FileText size={13} /> {cetakId === `surat-${t.id}` ? "Membuat…" : "Surat Jalan"}
                  </button>
                  <button
                    disabled={!!cetakId}
                    onClick={() => cetak("label", t)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <Tag size={13} /> {cetakId === `label-${t.id}` ? "Membuat…" : "Label Paket"}
                  </button>
                </div>
                )}
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
                    {keluar && (
                      <button
                        disabled={proses}
                        onClick={() => konfirmasiHapus(t)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 ml-auto"
                      >
                        <Trash2 size={13} /> Hapus dan kembalikan
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
      {modal?.jenis === "terima" && <FormTerima t={modal.t} namaEnt={namaEnt} saving={proses} onClose={() => setModal(null)} onSubmit={terima} />}
      {modal?.jenis === "tolak" && <FormTolak t={modal.t} saving={proses} onClose={() => setModal(null)} onSubmit={tolak} />}
    </div>
  );
}

function FormBuat({ skuMaster, master, entSaya, saving, onClose, onSubmit }) {
  // Holding memegang stok (Master Barang), jadi Holding juga bisa jadi tujuan/pengirim transfer.
  const pilihanTujuan = (master?.entitas || []).filter(
    (e) => e.kode !== entSaya && !fiturMatiEntitas(master, e.kode).includes("stok")
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
        Stok gudang Anda langsung berkurang. Kode SKU sama di semua perusahaan; stok di perusahaan tujuan bertambah setelah barang diterima.
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

// Terima barang: (1) penerima wajib memindai/mengetik KODE TERIMA yang hanya tercetak di surat jalan
// (tidak tampil di aplikasi) — bukti kertas dan barangnya sudah di tangan; (2) qty diterima TIDAK terisi otomatis, penerima
// mengisi hasil hitungannya sendiri per SKU; kalau ada selisih, catatan wajib diisi.
const samaKode = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

function FormTerima({ t, namaEnt, saving, onClose, onSubmit }) {
  const [terverifikasi, setTerverifikasi] = useState(false);
  const [kodeOk, setKodeOk] = useState("");
  const [kode, setKode] = useState("");
  const [salah, setSalah] = useState("");
  const [qty, setQty] = useState(() => Object.fromEntries((t.items || []).map((it) => [it.sku, ""])));
  const [catatan, setCatatan] = useState("");

  const cekKode = (v) => {
    if (samaKode(v, kodeTerima(t))) {
      setKodeOk(String(v).trim());
      setTerverifikasi(true);
      setSalah("");
    } else {
      setSalah("Kode terima tidak cocok. Pastikan surat jalan yang dipindai adalah milik transfer ini.");
    }
  };

  const semuaTerisi = (t.items || []).every((it) => qty[it.sku] !== "" && qty[it.sku] !== undefined);
  const adaSelisih = (t.items || []).some((it) => qty[it.sku] !== "" && Number(qty[it.sku]) !== Number(it.qty));
  const catatanKurang = adaSelisih && !catatan.trim();
  const bisaKonfirmasi = terverifikasi && semuaTerisi && !catatanKurang;

  if (!terverifikasi) {
    return (
      <ModalShell title={`Terima ${t.kode}`} onClose={onClose} maxWidth="max-w-lg">
        <div className="text-xs text-slate-400 mb-3">
          Dari {namaEnt(t.entitas_asal)}. Scan barcode KODE TERIMA di surat jalan, atau ketik 6 karakter kodenya, untuk membuka form penerimaan. Kode ini hanya ada di surat jalan yang dibawa bersama barang.
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            value={kode}
            onChange={(e) => {
              setKode(e.target.value);
              setSalah("");
            }}
            onKeyDown={(e) => e.key === "Enter" && kode.trim() && cekKode(kode)}
            placeholder="KODE TERIMA (6 karakter)"
            className={`${inputClass} font-mono`}
            autoFocus
          />
          <TombolScanKamera label="Scan" judul="Scan Surat Jalan" onDetect={cekKode} />
        </div>
        {salah && <div className="text-[11px] text-red-400 mb-2">{salah}</div>}
        <button
          disabled={!kode.trim()}
          onClick={() => cekKode(kode)}
          className="w-full text-sm font-medium py-2.5 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-40"
        >
          Verifikasi Surat Jalan
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Terima ${t.kode}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-[11px] text-emerald-400 mb-2">✓ Surat jalan terverifikasi</div>
      <div className="text-xs text-slate-400 mb-3">
        Dari {namaEnt(t.entitas_asal)}. Hitung barangnya dan isi qty yang benar-benar diterima untuk setiap SKU; selisihnya dikembalikan ke stok pengirim.
      </div>
      <div className="rounded-lg border border-slate-700 mb-3">
        {(t.items || []).map((it) => {
          const sel = qty[it.sku] !== "" && Number(qty[it.sku]) !== Number(it.qty);
          return (
            <div key={it.sku} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-slate-200 truncate">{it.sku}</div>
                <div className={`text-[11px] ${sel ? "text-amber-400" : "text-slate-500"}`}>
                  dikirim {it.qty}
                  {sel ? ` · selisih ${Number(qty[it.sku]) - Number(it.qty)}` : ""}
                </div>
              </div>
              <input
                type="number" min={0} max={it.qty} value={qty[it.sku] ?? ""} placeholder="qty"
                onChange={(e) => setQty((m) => ({ ...m, [it.sku]: e.target.value === "" ? "" : Math.min(Math.max(Math.floor(Number(e.target.value)), 0), Number(it.qty)) }))}
                className={`${inputClass} !w-20 text-center`}
              />
            </div>
          );
        })}
      </div>
      <Field label={adaSelisih ? "Catatan selisih (wajib)" : "Catatan (opsional)"}>
        <input value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass} placeholder={adaSelisih ? "mis. 2 pcs rusak di jalan" : ""} />
      </Field>
      {!semuaTerisi && <div className="text-[11px] text-slate-500 mb-2">Isi qty semua SKU dulu (isi 0 kalau tidak ada yang datang).</div>}
      {catatanKurang && <div className="text-[11px] text-amber-400 mb-2">Ada selisih qty — isi catatan alasannya.</div>}
      <button
        disabled={saving || !bisaKonfirmasi}
        onClick={() => onSubmit(t, qty, catatan.trim(), kodeOk)}
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