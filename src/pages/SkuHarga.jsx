import { useEffect, useMemo, useState } from "react";
import { Search, Boxes, Download, FileDown, ImageDown, Loader2, Check, Trash2, Pencil, Store, Plus, X } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtRp, downloadCsv, downloadFotos, groupByKategori, labelFor, sb, sbAll, pengaturanEntitas, entitasSesi } from "../lib/api";
import { isSuperadminLike } from "../lib/constants";
import { generateKatalogPdf, fotoUntukSku } from "../lib/PdfKatalog";
import { rakForSku } from "./Rak";
import MasterData from "./MasterData";
import Rusak from "./Rusak";
import BarangToko from "./kasir/BarangToko";
import PindahKeToko from "./kasir/PindahKeToko";

export default function SkuHarga({
  sub, items, skuMaster, master, penempatan, setModal, reload, showToast, session,
  barangRusak, pesananMasuk,
}) {
  if (sub === "buat") return <BuatSkuList items={items} setModal={setModal} session={session} />;
  if (sub === "kategori") return <MasterData master={master} skuMaster={skuMaster} reload={reload} showToast={showToast} />;
  // Sub-menu "Barang Reject" — dulu menu top-level terpisah bernama "Rusak",
  // sekarang dipindahkan ke sini karena datanya sama-sama seputar SKU.
  // Barang Toko (kasir) — dijaga di sini juga (bukan cuma disembunyikan di sidebar),
  // supaya role lain tidak bisa membukanya lewat URL/state navigasi.
  if (sub === "master-toko") {
    if (session?.role !== "superappa") {
      return <EmptyState label="Halaman ini khusus untuk role superappa." />;
    }
    return (
      <div>
        <PageHeader
          title="Barang Toko (Kasir)"
          description="Barang yang dijual di aplikasi kasir: harga jual, HPP, dan stok toko. Stok berubah lewat mutasi dari gudang, penjualan kasir, atau opname."
        />
        <BarangToko inline onBerubah={() => reload?.()} />
      </div>
    );
  }
  if (sub === "reject") return <Rusak barangRusak={barangRusak} pesananMasuk={pesananMasuk} setModal={setModal} />;
  return (
    <MasterBarang
      skuMaster={skuMaster}
      items={items}
      master={master}
      penempatan={penempatan}
      setModal={setModal}
      session={session}
      reload={reload}
      showToast={showToast}
    />
  );
}

function BuatSkuList({ items, setModal, session }) {
  const belumSku = items.filter((i) => i.stage === "sku");
  // Input banyak sekaligus khusus superadmin — role lain tetap pakai alur
  // Buat SKU satu-satu seperti biasa dari daftar barang di bawah.
  const isSuperadmin = isSuperadminLike(session?.role);
  return (
    <div>
      <PageHeader
        title="Buat SKU"
        description="Cari dulu apakah SKU-nya sudah ada. Kalau ketemu, stok tinggal ditambahkan. Kalau belum ada, buat SKU baru."
        action={
          isSuperadmin ? (
            <button
              onClick={() => setModal({ type: "buat-sku-banyak" })}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Boxes size={14} /> SKU Baru — Banyak Sekaligus
            </button>
          ) : null
        }
      />
      {belumSku.length === 0 ? (
        <EmptyState label="Tidak ada barang yang menunggu pembuatan SKU." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {belumSku.map((item) => (
            <button
              key={item.id}
              onClick={() => setModal({ type: "buat-sku", item })}
              className="text-left bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-lg p-3 transition"
            >
              <Boxes size={16} className="text-amber-400 mb-2" />
              <div className="text-xs font-mono text-slate-300">
                {item.barcode_supplier || `#${item.id.slice(0, 8)}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {item.jumlah}x · {item.tanggal}
              </div>
              <div className="mt-2 text-[11px] font-medium text-amber-400">
                Cari / Buat SKU →
              </div>
            </button>
          ))}
          {sisa > 0 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setBatas((b) => b + 60)}
                className="border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-medium px-4 py-2 rounded-lg"
              >
                Tampilkan 60 lagi (sisa {sisa})
              </button>
              <button
                onClick={() => setBatas(filtered.length)}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
              >
                Tampilkan semua
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Satu SKU dianggap "ada perubahan harga" kalau harga_asli_baru sudah
// diisi (lewat Barang Masuk/Barang Datang dengan harga beda) dan belum
// diputuskan (masih beda dari harga_asli yang berlaku sekarang) — lihat
// resolveHargaSku di lib/api.js untuk alur keputusannya.
// ---------------------------------------------------------
// KELAYAKAN JUAL DI MARKETPLACE (MP)
// Aturan: harga jual MP (= harga TENGAH) dikurangi semua biaya marketplace tidak boleh
// di bawah HPP, artinya tidak minus.
//   Bersih di MP = Tengah - (biaya % x Tengah) - (biaya Rp)
//   Layak        = Bersih di MP >= HPP
// Daftar biaya ditulis admin (Aktif / Jenis % atau Rp / Nilai) dan disimpan per PT
// di master_data tipe "entitas_set", satu baris per biaya (kunci mp_biaya_<id>, isi JSON kecil).
// "Nilai" berisi angka bawaan / rekomendasi sistem (tombol "Ambil rekomendasi") dan bisa langsung diketik ulang admin.
// ---------------------------------------------------------
const AWAL_KUNCI_MP = "mp_biaya_";
const BIAYA_BAWAAN = [
  { id: "admin", nama: "Biaya Administrasi", j: "%", v: 11.7 },
  { id: "proses", nama: "Biaya Proses Pesanan", j: "Rp", v: 1250 },
  { id: "xtra", nama: "Biaya Gratis Ongkir Extra", j: "%", v: 6 },
  { id: "promoextra", nama: "Biaya Promo Extra", j: "%", v: 4.5 },
  { id: "promosi", nama: "Biaya Promosi", j: "%", v: 1.11 },
  { id: "pph", nama: "Pajak PPh 22", j: "%", v: 0.5 },
];
const bawaanDraft = () => BIAYA_BAWAAN.map((b) => ({ ...b, a: true, bawaan: true }));
const angkaMp = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const nilaiBiaya = (r) => angkaMp(r.v) ?? 0;
const biayaRp = (r, harga) => (!r.a ? 0 : r.j === "%" ? (harga * nilaiBiaya(r)) / 100 : nilaiBiaya(r));
function bacaBarisMp(setPT) {
  const hasil = [];
  Object.entries(setPT || {}).forEach(([k, v]) => {
    if (!k.startsWith(AWAL_KUNCI_MP)) return;
    try {
      const d = JSON.parse(v);
      const id = k.slice(AWAL_KUNCI_MP.length);
      hasil.push({
        // data versi awal punya "ganti nilai" (d.o): kalau ada, itulah angka yang dulu dipakai -> jadi Nilai.
        id, nama: d.n || "Biaya", j: d.j === "Rp" ? "Rp" : "%", v: d.o != null ? Number(d.o) || 0 : Number(d.v) || 0,
        a: !(d.a === 0 || d.a === false),
        bawaan: BIAYA_BAWAAN.some((b) => b.id === id),
      });
    } catch {
      /* baris rusak diabaikan */
    }
  });
  const urut = (r) => {
    const i = BIAYA_BAWAAN.findIndex((b) => b.id === r.id);
    return i < 0 ? 100 : i;
  };
  return hasil.sort((a, b) => urut(a) - urut(b) || a.id.localeCompare(b.id));
}
function hitungMp(s, rows) {
  if (!rows) return null;
  const jual = Number(s.tengah) || 0;
  const hpp = Number(s.hpp) || 0;
  if (!jual || !hpp) return { status: "kosong" };
  const biaya = rows.reduce((t, r) => t + biayaRp(r, jual), 0);
  const bersih = jual - biaya;
  const laba = bersih - hpp;
  const persen = rows.filter((r) => r.a && r.j === "%").reduce((t, r) => t + nilaiBiaya(r), 0);
  const tetap = rows.filter((r) => r.a && r.j === "Rp").reduce((t, r) => t + nilaiBiaya(r), 0);
  const minHarga = persen < 100 ? Math.ceil((hpp + tetap) / (1 - persen / 100) / 100) * 100 : null;
  return { status: laba >= 0 ? "layak" : "rugi", bersih, laba, minHarga, biaya };
}
const LABEL_STATUS_MP = { layak: "Layak MP", rugi: "Tidak layak MP", kosong: "HPP/Tengah kosong" };

const adaHargaBaruCheck = (s) => s.harga_asli_baru != null && s.harga_asli_baru !== s.harga_asli;

// SKU dibentuk sebagai {bahan}{peruntukan}{kategori}-{subkategori}-{model}-{warna}-{ukuran}
// (lihat pembuatan SKU baru di ModalRouter.jsx) — jadi segmen "model" adalah
// bagian ke-3 kalau SKU dipecah per tanda "-".
const modelFromSku = (sku) => (sku || "").split("-")[2] || "";

// Panel editor aturan biaya MP. State ketikan (draft) sengaja ada di komponen ini, bukan di MasterBarang,
// supaya tiap ketukan tombol hanya merender ulang panel — bukan ribuan kartu SKU.
function AturanMpPanel({ isSuperadmin, master, kodePT, barisTersimpan, sigTersimpan, mpAktif, hitunganMp, reload, showToast }) {
  const [bukaMp, setBukaMp] = useState(false);
  const [draft, setDraft] = useState(() => (barisTersimpan.length ? barisTersimpan : bawaanDraft()));
  const [contohHarga, setContohHarga] = useState("18000");
  const [contohHpp, setContohHpp] = useState("");
  const [simpanMp, setSimpanMp] = useState(false);
  const [hitungMpBusy, setHitungMpBusy] = useState(false);
  useEffect(() => {
    setDraft(barisTersimpan.length ? barisTersimpan : bawaanDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigTersimpan]);

  const ubahDraft = (id, patch) => setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const tambahBiaya = () =>
    setDraft((d) => [...d, { id: `x${Date.now().toString(36)}`, nama: "", j: "%", v: "", a: true, bawaan: false }]);
  const hapusBiaya = (id) => setDraft((d) => d.filter((r) => r.id !== id));

  const tulisSet = async (kunci, isi) => {
    const ada = (master?.entitas_set || []).find((m) => m.kode === `${kodePT}:${kunci}`);
    if (ada && isi) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: isi }) });
    else if (ada && !isi) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
    else if (!ada && isi) await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "entitas_set", kode: `${kodePT}:${kunci}`, label: isi }) });
  };

  const simpanAturanMp = async () => {
    if (simpanMp) return;
    for (const r of draft) {
      if (!String(r.nama).trim()) return showToast?.("Nama biaya tidak boleh kosong.", "err");
      const v = angkaMp(r.v);
      if (v == null || v < 0) return showToast?.(`${r.nama}: nilai harus angka 0 atau lebih.`, "err");
    }
    const totalPersen = draft.filter((r) => r.a && r.j === "%").reduce((t, r) => t + nilaiBiaya(r), 0);
    if (totalPersen >= 100) return showToast?.("Total biaya persen tidak boleh 100% atau lebih.", "err");
    setSimpanMp(true);
    try {
      for (const r of draft) {
        await tulisSet(
          `${AWAL_KUNCI_MP}${r.id}`,
          JSON.stringify({ n: String(r.nama).trim(), j: r.j, v: angkaMp(r.v) ?? 0, a: r.a ? 1 : 0 })
        );
      }
      // biaya yang dihapus admin + sisa kunci lama (versi awal fitur ini)
      const idDraft = new Set(draft.map((r) => r.id));
      for (const r of barisTersimpan) if (!idDraft.has(r.id)) await tulisSet(`${AWAL_KUNCI_MP}${r.id}`, "");
      await tulisSet("mp_potongan_persen", "");
      await tulisSet("mp_biaya_tetap", "");
      await reload?.();
      showToast?.("Aturan layak jual MP disimpan.");
    } catch (e) {
      showToast?.(e?.message || "Gagal menyimpan aturan MP", "err");
    } finally {
      setSimpanMp(false);
    }
  };

  // Rekomendasi sistem dari data penjualan MP yang sudah diimpor (90 hari terakhir). Tarif % dihitung
  // hanya dari baris yang memang kena biaya itu (total biaya / total harga produk), jadi bukan
  // rata-rata yang diencerkan oleh pesanan yang tidak ikut program. Biaya proses = rata-rata per pesanan.
  // Hanya mengisi kolom "Nilai"; belum menyimpan.
  const rekomendasiDariPenjualan = async () => {
    if (hitungMpBusy) return;
    setHitungMpBusy(true);
    try {
      const d = new Date(Date.now() - 90 * 864e5);
      const dari = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const rows = await sbAll(
        `marketplace_penjualan?select=no_pesanan,harga_produk,biaya_admin,biaya_proses,biaya_ongkir_xtra,biaya_layanan,biaya_ams,biaya_kampanye,biaya_promosi,pajak&tanggal_dilepas=gte.${dari}&dana_dilepas=not.is.null`
      );
      const A = (x) => Math.abs(Number(x) || 0);
      const tarif = (ambil) => {
        let b = 0;
        let h = 0;
        (rows || []).forEach((r) => {
          const hp = Number(r.harga_produk) || 0;
          const f = ambil(r);
          if (hp > 0 && f > 0) {
            b += f;
            h += hp;
          }
        });
        return h > 0 ? Math.round((b / h) * 10000) / 100 : null;
      };
      const perOrder = new Map();
      (rows || []).forEach((r) => perOrder.set(r.no_pesanan, (perOrder.get(r.no_pesanan) || 0) + A(r.biaya_proses)));
      const proses = [...perOrder.values()].filter((v) => v > 0);
      const rek = {
        admin: tarif((r) => A(r.biaya_admin)),
        proses: proses.length ? Math.round(proses.reduce((a, b) => a + b, 0) / proses.length) : null,
        xtra: tarif((r) => A(r.biaya_ongkir_xtra)),
        promoextra: tarif((r) => A(r.biaya_layanan)),
        promosi: tarif((r) => A(r.biaya_ams) + A(r.biaya_kampanye) + A(r.biaya_promosi)),
        pph: tarif((r) => A(r.pajak)),
      };
      const terisi = Object.entries(rek).filter(([, v]) => v != null);
      if (!(rows || []).length || !terisi.length) {
        showToast?.("Belum ada data penjualan MP 90 hari terakhir untuk dihitung. Angka bawaan tetap dipakai.", "err");
        return;
      }
      setDraft((dr) => dr.map((r) => (rek[r.id] != null ? { ...r, v: rek[r.id] } : r)));
      const kosong = Object.entries(rek).filter(([, v]) => v == null).length;
      showToast?.(
        `Rekomendasi dihitung dari ${rows.length} baris penjualan (90 hari).${kosong ? ` ${kosong} biaya tidak ditemukan di data, angkanya tidak diubah.` : ""} Klik Simpan untuk memakai.`
      );
    } catch (e) {
      showToast?.(e?.message || "Gagal menghitung rekomendasi", "err");
    } finally {
      setHitungMpBusy(false);
    }
  };

  return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 mb-4">
        <button
          type="button"
          onClick={() => setBukaMp((v) => !v)}
          className="w-full flex flex-wrap items-center gap-2 px-3 py-2 text-left text-sm text-slate-300"
        >
          <Store size={14} className="text-amber-400" />
          <span className="font-medium">Aturan layak jual di Marketplace</span>
          {mpAktif ? (
            <span className="text-xs text-slate-500">
              harga Tengah ·{" "}
              <span className="text-emerald-400">{hitunganMp.layak} layak</span> ·{" "}
              <span className="text-red-400">{hitunganMp.rugi} tidak layak</span>
              {hitunganMp.kosong ? <> · <span className="text-slate-400">{hitunganMp.kosong} HPP/Tengah kosong</span></> : null}
            </span>
          ) : (
            <span className="text-xs text-slate-500">belum aktif — buka, cek daftar biaya, lalu Simpan</span>
          )}
          <span className="ml-auto text-xs text-slate-500">{bukaMp ? "Tutup" : "Atur"}</span>
        </button>
        {bukaMp && (
          <div className="border-t border-slate-800 p-3 space-y-3">
            <p className="text-xs text-slate-500">
              Barang <b className="text-slate-300">layak dijual di MP</b> kalau harga <b className="text-slate-300">Tengah</b> setelah dipotong semua biaya di bawah
              masih sama dengan atau di atas <b className="text-slate-300">HPP</b> (tidak minus). Kolom <b className="text-slate-300">Nilai</b> berisi angka
              bawaan / rekomendasi sistem; admin bisa langsung mengetik angka lain di situ.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <label className="flex items-center gap-2">
                Contoh harga Tengah (Rp)
                <input
                  value={contohHarga}
                  onChange={(e) => setContohHarga(e.target.value)}
                  inputMode="numeric"
                  className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none"
                />
              </label>
              <label className="flex items-center gap-2">
                Contoh HPP (Rp)
                <input
                  value={contohHpp}
                  onChange={(e) => setContohHpp(e.target.value)}
                  inputMode="numeric"
                  placeholder="opsional"
                  className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none"
                />
              </label>
              {isSuperadmin && (
                <button
                  type="button"
                  onClick={rekomendasiDariPenjualan}
                  disabled={hitungMpBusy}
                  className="border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg"
                >
                  {hitungMpBusy ? "Menghitung…" : "Ambil rekomendasi dari data penjualan MP"}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-1.5 w-12">Aktif</th>
                    <th className="px-2 py-1.5">Nama biaya</th>
                    <th className="px-2 py-1.5 w-16">Jenis</th>
                    <th className="px-2 py-1.5 w-28 text-right">Nilai</th>
                    <th className="px-2 py-1.5 w-28 text-right">Biaya (Rp)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((r) => {
                    const harga = angkaMp(contohHarga) || 0;
                    const kecil = "w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-sm text-right text-slate-200 outline-none disabled:opacity-60";
                    return (
                      <tr key={r.id} className={`border-t border-slate-800 ${r.a ? "" : "opacity-50"}`}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={r.a} disabled={!isSuperadmin} onChange={(e) => ubahDraft(r.id, { a: e.target.checked })} className="accent-amber-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          {r.bawaan ? (
                            <span className="text-slate-200">{r.nama}</span>
                          ) : (
                            <input
                              value={r.nama}
                              disabled={!isSuperadmin}
                              onChange={(e) => ubahDraft(r.id, { nama: e.target.value })}
                              placeholder="Nama biaya"
                              className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-sm text-slate-200 outline-none disabled:opacity-60"
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.bawaan ? (
                            <span className="text-slate-400">{r.j}</span>
                          ) : (
                            <select
                              value={r.j}
                              disabled={!isSuperadmin}
                              onChange={(e) => ubahDraft(r.id, { j: e.target.value })}
                              className="bg-slate-900 border border-slate-800 rounded-md px-1 py-1 text-sm text-slate-200 outline-none"
                            >
                              <option value="%">%</option>
                              <option value="Rp">Rp</option>
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input value={r.v} disabled={!isSuperadmin} inputMode="decimal" onChange={(e) => ubahDraft(r.id, { v: e.target.value })} className={kecil} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-200">{fmtRp(Math.round(biayaRp(r, harga)))}</td>
                        <td className="px-1 py-1.5 text-right">
                          {isSuperadmin && !r.bawaan && (
                            <button type="button" onClick={() => hapusBiaya(r.id)} title="Hapus biaya ini" className="text-slate-500 hover:text-red-400">
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const harga = angkaMp(contohHarga) || 0;
                    const total = draft.reduce((t, r) => t + biayaRp(r, harga), 0);
                    return (
                      <>
                        <tr className="border-t border-slate-700 text-slate-300">
                          <td colSpan={4} className="px-2 py-1.5 text-right text-xs">Total biaya marketplace</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{fmtRp(Math.round(total))}</td>
                          <td />
                        </tr>
                        <tr className="text-slate-300">
                          <td colSpan={4} className="px-2 py-1 text-right text-xs">Bersih diterima dari harga contoh</td>
                          <td className="px-2 py-1 text-right font-semibold text-emerald-400">{fmtRp(Math.round(harga - total))}</td>
                          <td />
                        </tr>
                        {angkaMp(contohHpp) > 0 && (
                          <tr className="text-slate-300">
                            <td colSpan={4} className="px-2 py-1 text-right text-xs">
                              Setelah dikurangi HPP {fmtRp(angkaMp(contohHpp))} →{" "}
                              <b className={harga - total - angkaMp(contohHpp) >= 0 ? "text-emerald-400" : "text-red-400"}>
                                {harga - total - angkaMp(contohHpp) >= 0 ? "Layak jual" : "Tidak layak jual"}
                              </b>
                            </td>
                            <td className={`px-2 py-1 text-right font-semibold ${harga - total - angkaMp(contohHpp) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {fmtRp(Math.round(harga - total - angkaMp(contohHpp)))}
                            </td>
                            <td />
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
            {isSuperadmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={tambahBiaya} className="flex items-center gap-1 border border-slate-800 hover:border-amber-500/50 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg">
                  <Plus size={13} /> Tambah biaya
                </button>
                <button type="button" onClick={() => setDraft(bawaanDraft())} className="text-xs text-slate-500 hover:text-slate-300 underline">
                  Kembalikan ke bawaan
                </button>
                <button
                  type="button"
                  onClick={simpanAturanMp}
                  disabled={simpanMp}
                  className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-semibold px-4 py-2 rounded-lg"
                >
                  {simpanMp ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Hanya superadmin yang bisa mengubah aturan ini.</p>
            )}
            <p className="text-[11px] text-slate-600">
              Rekomendasi sistem memakai data penjualan MP yang sudah diimpor (90 hari terakhir). Tarif % dihitung dari pesanan yang memang kena biaya itu,
              jadi matikan "Aktif" untuk program yang toko Anda tidak ikuti. Biaya proses pesanan dihitung per pcs (kondisi terburuk, karena aslinya per pesanan).
              Biaya iklan belum termasuk.
            </p>
          </div>
        )}
      </div>
  );
}

function MasterBarang({ skuMaster, items, master, penempatan, setModal, session, reload, showToast }) {
  const isSuperadmin = isSuperadminLike(session?.role);

  // ---- aturan layak jual di Marketplace (panel editornya ada di AturanMpPanel supaya mengetik tidak merender ulang ribuan kartu) ----
  const kodePT = entitasSesi();
  const setPT = useMemo(() => pengaturanEntitas(master, kodePT), [master, kodePT]);
  const barisTersimpan = useMemo(() => bacaBarisMp(setPT), [setPT]);
  const sigTersimpan = JSON.stringify(barisTersimpan);
  const mpAktif = barisTersimpan.length ? barisTersimpan : null; // aturan baru berlaku setelah disimpan
  const [filterMp, setFilterMp] = useState(""); // "" | "layak" | "rugi" | "kosong"
  const infoMp = (s) => hitungMp(s, mpAktif);

  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState("");
  const [subkategori, setSubkategori] = useState("");
  const [cetak, setCetak] = useState(null); // { done, total } selagi PDF dibuat
  const [unduhFoto, setUnduhFoto] = useState(null); // { done, total } selagi foto diunduh
  const [selected, setSelected] = useState(() => new Set()); // sku yang dipilih untuk download foto
  const [tampilkanNonaktif, setTampilkanNonaktif] = useState(false); // SKU nonaktif (bekas dihapus) disembunyikan secara default
  const [hanyaPerubahan, setHanyaPerubahan] = useState(false); // filter cepat: cuma SKU dengan badge "Harga Baru"
  const [sortBy, setSortBy] = useState("model"); // "model" | "az" | "za"
  // PERFORMA: dulu tiap kartu memanggil fotoUntukSku() (filter+sort SELURUH items) dan
  // rakForSku() (find di seluruh penempatan) — dengan ribuan SKU itu jutaan operasi setiap
  // kali halaman dibuka/di-render ulang. Sekarang dihitung SEKALI jadi peta lookup.
  const fotoPerSku = useMemo(() => {
    const terbaru = new Map(); // sku -> { t, url }
    for (const i of items || []) {
      if (!i.sku || !i.foto_url) continue;
      const t = new Date(i.created_at || i.tanggal || 0).getTime() || 0;
      const cur = terbaru.get(i.sku);
      if (!cur || t > cur.t) terbaru.set(i.sku, { t, url: i.foto_url });
    }
    const out = new Map();
    terbaru.forEach((v, k) => out.set(k, v.url));
    return out;
  }, [items]);
  const rakPerSku = useMemo(() => {
    const out = new Map();
    for (const p of penempatan || []) if (!out.has(p.sku)) out.set(p.sku, p.rak_code);
    return out;
  }, [penempatan]);
  // Render kartu bertahap (ribuan kartu sekaligus yang bikin klik menu terasa tersendat).
  const [batas, setBatas] = useState(60);
  const bolehKeToko = session?.role === "superappa"; // pindah SKU ke Barang Toko (kasir)
  const [pindah, setPindah] = useState(null); // array SKU yang akan dipindah ke Barang Toko

  // Nama lengkap kategori/subkategori dari Master Data, bukan kode-nya.
  // Kalau kode belum terdaftar di Master Data, tampilkan kode itu sendiri (fallback labelFor).
  const kategoriLabel = (kode) => labelFor(master || {}, "kategori", kode);
  const subkategoriLabel = (kode) => labelFor(master || {}, "subkategori", kode);

  const toggleSelect = (sku) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  // Daftar kategori unik dari semua SKU yang ada, buat isi dropdown.
  const kategoriOptions = Array.from(
    new Set(skuMaster.map((s) => s.kategori).filter(Boolean))
  ).sort();

  // Daftar subkategori unik — kalau kategori sudah dipilih, subkategori
  // dipersempit hanya yang muncul di kategori itu saja.
  const subkategoriOptions = Array.from(
    new Set(
      skuMaster
        .filter((s) => !kategori || s.kategori === kategori)
        .map((s) => s.subkategori)
        .filter(Boolean)
    )
  ).sort();

  const filtered = useMemo(() => skuMaster
    .filter((s) => {
      if (!tampilkanNonaktif && s.nonaktif) return false;
      if (hanyaPerubahan && !adaHargaBaruCheck(s)) return false;
      const qLower = q.toLowerCase();
      const cocokQ =
        s.sku.toLowerCase().includes(qLower) ||
        (s.nama || "").toLowerCase().includes(qLower) ||
        (s.barcode_supplier || "").toLowerCase().includes(qLower);
      if (!cocokQ) return false;
      if (kategori && s.kategori !== kategori) return false;
      if (subkategori && s.subkategori !== subkategori) return false;
      if (filterMp && mpAktif && infoMp(s)?.status !== filterMp) return false;
      return true;
    })
    // Urutan: per Model (segmen ke-3 di dalam SKU, numerik natural — 1, 2, 3,
    // ..., 10, 11, bukan 1, 10, 11, 2, 3, ...) atau SKU A-Z / Z-A, sesuai
    // pilihan sortBy. SKU tanpa model selalu ditaruh di akhir grupnya.
    .sort((a, b) => {
      if (sortBy === "az") return a.sku.localeCompare(b.sku, "id", { numeric: true, sensitivity: "base" });
      if (sortBy === "za") return b.sku.localeCompare(a.sku, "id", { numeric: true, sensitivity: "base" });
      // SKU pelengkap diketik manual (bukan format bahan-kategori-model-...),
      // jadi tidak punya "model" — ditaruh di akhir grupnya.
      const ma = a.pelengkap ? "" : modelFromSku(a.sku);
      const mb = b.pelengkap ? "" : modelFromSku(b.sku);
      if (!ma && !mb) return 0;
      if (!ma) return 1;
      if (!mb) return -1;
      return ma.localeCompare(mb, "id", { numeric: true, sensitivity: "base" });
    }), [skuMaster, tampilkanNonaktif, hanyaPerubahan, q, kategori, subkategori, filterMp, mpAktif, sortBy]);

  // Jumlah SKU yang ada perubahan harga, dihitung dari cakupan yang sama
  // dengan toggle nonaktif (biar angkanya konsisten sama apa yang bisa
  // muncul kalau filter ini diaktifkan), tapi lepas dari filter q/kategori
  // supaya badge di checkbox selalu nunjukin total sebenarnya.
  const jumlahPerubahan = skuMaster.filter(
    (s) => (tampilkanNonaktif || !s.nonaktif) && adaHargaBaruCheck(s)
  ).length;

  const grouped = useMemo(() => groupByKategori(filtered), [filtered]);
  const { tampilGrup, sisa } = useMemo(() => {
    let kuota = batas;
    const out = [];
    for (const { kategori: kat, groups } of grouped) {
      if (kuota <= 0) break;
      const gs = [];
      for (const g of groups) {
        if (kuota <= 0) break;
        const its = g.items.slice(0, kuota);
        kuota -= its.length;
        gs.push({ ...g, items: its });
      }
      out.push({ kategori: kat, groups: gs, total: groups.reduce((n, g) => n + g.items.length, 0) });
    }
    return { tampilGrup: out, sisa: filtered.length - (batas - kuota) };
  }, [grouped, filtered, batas]);
  // Ganti filter/pencarian -> mulai lagi dari 60 kartu pertama.
  useEffect(() => {
    setBatas(60);
  }, [q, kategori, subkategori, tampilkanNonaktif, hanyaPerubahan, filterMp, sortBy]);

  // Hitungan kelayakan MP untuk SKU aktif (lepas dari filter, supaya angkanya selalu total sebenarnya).
  const hitunganMp = useMemo(() => {
    const h = { layak: 0, rugi: 0, kosong: 0 };
    if (!mpAktif) return h;
    skuMaster.forEach((s) => {
      if (s.nonaktif) return;
      const st = hitungMp(s, mpAktif)?.status;
      if (st) h[st] += 1;
    });
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuMaster, sigTersimpan]);

  // Kalau kategori diganti dan subkategori yang sedang dipilih ternyata
  // tidak ada di kategori baru itu, reset supaya tidak nyangkut jadi
  // filter kosong yang membingungkan.
  const handleKategoriChange = (val) => {
    setKategori(val);
    setSubkategori("");
  };

  const handleDownloadCsv = () => {
    downloadCsv(
      `master-barang-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "sku", label: "SKU" },
        { key: "barcode_supplier", label: "Barcode Supplier" },
        { key: "stok", label: "Stok" },
        { key: "rak", label: "Rak" },
        { key: "harga_asli", label: "Harga Asli" },
        { key: "hpp", label: "HPP" },
        { key: "grosir", label: "Grosir" },
        { key: "tengah", label: "Tengah" },
        { key: "ecer", label: "Ecer" },
        ...(mpAktif ? [{ key: "bersih_mp", label: "Bersih di MP" }, { key: "status_mp", label: "Status MP" }] : []),
      ],
      filtered.map((s) => {
        const mp = mpAktif ? infoMp(s) : null;
        return {
          ...s,
          rak: rakPerSku.get(s.sku) || "",
          ...(mp ? { bersih_mp: mp.bersih != null ? Math.round(mp.bersih) : "", status_mp: LABEL_STATUS_MP[mp.status] } : {}),
        };
      })
    );
  };

  const handleDownloadPdf = async () => {
    if (filtered.length === 0 || cetak) return;
    setCetak({ done: 0, total: filtered.length });
    try {
      const judulParts = ["Katalog Produk"];
      if (kategori) judulParts.push(kategoriLabel(kategori));
      if (subkategori) judulParts.push(subkategoriLabel(subkategori));
      await generateKatalogPdf(filtered, items, {
        judul: judulParts.join(" — "),
        onProgress: (done, total) => setCetak({ done, total }),
      });
    } finally {
      setCetak(null);
    }
  };

  // Download foto tiap SKU (nama file = kode SKU). Kalau ada barang yang dicentang,
  // hanya foto barang yang dipilih itu yang diunduh — kalau tidak ada yang dicentang,
  // pakai semua SKU yang sedang tampil di daftar (sesuai filter).
  // Kalau cuma 1 foto -> langsung download. Kalau lebih -> dibungkus ZIP.
  const handleDownloadFoto = async () => {
    const sumber = selected.size > 0 ? skuMaster.filter((s) => selected.has(s.sku)) : filtered;
    if (sumber.length === 0 || unduhFoto) return;
    const fotos = sumber.map((s) => ({ sku: s.sku, url: fotoPerSku.get(s.sku) || null }));
    if (fotos.every((f) => !f.url)) {
      alert("Tidak ada foto untuk SKU pada daftar ini.");
      return;
    }
    setUnduhFoto({ done: 0, total: fotos.filter((f) => f.url).length });
    try {
      await downloadFotos(fotos, { onProgress: (done, total) => setUnduhFoto({ done, total }) });
    } finally {
      setUnduhFoto(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Master Barang"
        description="Data lengkap tiap SKU — foto, harga asli, HPP, dan harga jual (Grosir / Tengah / Ecer). Untuk ubah persentase markup, buka menu Pengaturan."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              <Download size={14} /> Download CSV
            </button>
            <button
              onClick={handleDownloadFoto}
              disabled={(selected.size === 0 && filtered.length === 0) || !!unduhFoto}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              {unduhFoto ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Mengunduh foto {unduhFoto.done}/{unduhFoto.total}…
                </>
              ) : (
                <>
                  <ImageDown size={14} />
                  {selected.size > 0 ? `Download Foto Terpilih (${selected.size})` : "Download Foto"}
                </>
              )}
            </button>
            {bolehKeToko && selected.size > 0 && (
              <button
                onClick={() => setPindah(skuMaster.filter((s) => selected.has(s.sku)))}
                className="flex items-center gap-1.5 border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 text-xs font-medium px-3 py-2 rounded-lg"
              >
                <Store size={14} /> Pindahkan ke Toko ({selected.size})
              </button>
            )}
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
              >
                Batal pilih
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={filtered.length === 0 || !!cetak}
              className="flex items-center gap-1.5 border border-slate-800 hover:border-amber-500/50 disabled:opacity-40 text-slate-300 text-xs font-medium px-3 py-2 rounded-lg"
            >
              {cetak ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Memuat foto {cetak.done}/{cetak.total}…
                </>
              ) : (
                <>
                  <FileDown size={14} /> Download PDF Katalog
                </>
              )}
            </button>
          </div>
        }
      />
      {pindah && bolehKeToko && (
        <PindahKeToko
          daftar={pindah}
          labelKategori={kategoriLabel}
          onClose={() => setPindah(null)}
          onSelesai={(h) => {
            setPindah(null);
            if (h?.dibuat > 0 || h?.dipindah > 0) {
              setSelected(new Set());
              showToast?.(`${h.dibuat} barang masuk ke Barang Toko${h.dipindah ? `, ${h.dipindah} stok dipindah` : ""}`);
              reload?.();
            }
          }}
        />
      )}
      <AturanMpPanel
        isSuperadmin={isSuperadmin}
        master={master}
        kodePT={kodePT}
        barisTersimpan={barisTersimpan}
        sigTersimpan={sigTersimpan}
        mpAktif={mpAktif}
        hitunganMp={hitunganMp}
        reload={reload}
        showToast={showToast}
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKU atau barcode supplier…"
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
          />
        </div>
        <select
          value={kategori}
          onChange={(e) => handleKategoriChange(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
        >
          <option value="">Semua Kategori</option>
          {kategoriOptions.map((k) => (
            <option key={k} value={k}>{kategoriLabel(k)}</option>
          ))}
        </select>
        <select
          value={subkategori}
          onChange={(e) => setSubkategori(e.target.value)}
          disabled={subkategoriOptions.length === 0}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none disabled:opacity-40"
        >
          <option value="">Semua Subkategori</option>
          {subkategoriOptions.map((sk) => (
            <option key={sk} value={sk}>{subkategoriLabel(sk)}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
        >
          <option value="model">Urutkan: Model</option>
          <option value="az">Urutkan: SKU A-Z</option>
          <option value="za">Urutkan: SKU Z-A</option>
        </select>
        {mpAktif && (
          <select
            value={filterMp}
            onChange={(e) => setFilterMp(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
          >
            <option value="">Semua (layak MP)</option>
            <option value="layak">Layak dijual di MP</option>
            <option value="rugi">Tidak layak jual di MP</option>
            <option value="kosong">HPP/Tengah kosong</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={tampilkanNonaktif}
            onChange={(e) => setTampilkanNonaktif(e.target.checked)}
            className="accent-amber-500"
          />
          Tampilkan yang nonaktif
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hanyaPerubahan}
            onChange={(e) => setHanyaPerubahan(e.target.checked)}
            className="accent-red-500"
          />
          Ada perubahan harga
          {jumlahPerubahan > 0 && (
            <span className="text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5">
              {jumlahPerubahan}
            </span>
          )}
        </label>
        {mpAktif && (
          <label className="flex items-center gap-1.5 text-xs text-slate-400 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterMp === "rugi"}
              onChange={(e) => setFilterMp(e.target.checked ? "rugi" : "")}
              className="accent-red-500"
            />
            Tidak layak jual di MP
            {hitunganMp.rugi > 0 && (
              <span className="text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5">
                {hitunganMp.rugi}
              </span>
            )}
          </label>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          label={hanyaPerubahan ? "Tidak ada SKU dengan perubahan harga." : "Belum ada barang."}
        />
      ) : (
        <div className="space-y-6">
          {tampilGrup.map(({ kategori, groups, total }) => (
            <div key={kategori}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-amber-400">{kategoriLabel(kategori)}</h3>
                <span className="text-[11px] text-slate-500">
                  ({total} SKU)
                </span>
              </div>
              <div className="space-y-4">
                {groups.map(({ subkategori, items: subItems }) => (
                  <div key={subkategori}>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 pl-1">
                      {subkategoriLabel(subkategori)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {subItems.map((s) => {
                        const adaHargaBaru = adaHargaBaruCheck(s);
                        const foto = fotoPerSku.get(s.sku) || null;
                        const dipilih = selected.has(s.sku);
                        const kodeRak = rakPerSku.get(s.sku) || "";
                        return (
                          <div
                            key={s.id}
                            onClick={() => setModal({ type: "detail-sku", item: s })}
                            className={`relative rounded-xl border bg-slate-900/50 p-4 cursor-pointer transition ${
                              s.nonaktif ? "opacity-60" : ""
                            } ${
                              dipilih ? "border-amber-500/60 ring-1 ring-amber-500/30" : "border-slate-800 hover:border-amber-500/40"
                            }`}
                          >
                            {s.nonaktif && (
                              <span className="absolute top-2.5 left-2.5 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full px-2 py-0.5 z-10">
                                Nonaktif
                              </span>
                            )}
                            {adaHargaBaru && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModal({ type: "pilih-harga", item: s });
                                }}
                                title="Ada perubahan harga asli — klik untuk pilih harga yang dipakai"
                                className="absolute top-2.5 right-9 flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/40 rounded-full pl-1.5 pr-2 py-0.5 hover:bg-red-500/25"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                Harga Baru
                              </button>
                            )}
                            {isSuperadmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModal({ type: "edit-harga", item: s });
                                }}
                                title="Edit harga (khusus superadmin)"
                                className="absolute top-11 right-2.5 p-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 hover:text-amber-400 hover:border-amber-500/40"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            {bolehKeToko && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPindah([s]);
                                }}
                                title="Pindahkan ke Barang Toko (kasir)"
                                className="absolute top-[4.5rem] right-2.5 p-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 hover:text-amber-400 hover:border-amber-500/40"
                              >
                                <Store size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModal({ type: "hapus-sku", item: s });
                              }}
                              title="Hapus SKU ini"
                              className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/40"
                            >
                              <Trash2 size={12} />
                            </button>
                            <div className="flex items-center gap-3 mb-3 pr-4">
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md border border-slate-700 bg-slate-950 cursor-pointer"
                                title="Pilih untuk download foto"
                              >
                                <input
                                  type="checkbox"
                                  checked={dipilih}
                                  onChange={() => toggleSelect(s.sku)}
                                  className="sr-only"
                                />
                                {dipilih && <Check size={13} className="text-amber-400" />}
                              </label>
                              {foto ? (
                                <img
                                  src={foto}
                                  alt={s.sku}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-800 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg border border-dashed border-slate-800 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-mono text-xs text-slate-300 truncate">{s.sku}</div>
                                {s.pelengkap && (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Badge color="violet">Pelengkap</Badge>
                                    {s.nama && <span className="text-[11px] text-slate-400 truncate">{s.nama}</span>}
                                  </div>
                                )}
                                {s.barcode_supplier && (
                                  <div
                                    className="font-mono text-[10px] text-slate-500 truncate"
                                    title={`Barcode Supplier: ${s.barcode_supplier}`}
                                  >
                                    {s.barcode_supplier}
                                  </div>
                                )}
                                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  {s.stok <= 0 ? <Badge color="red">Habis</Badge> : (
                                    <span className="text-[11px] text-slate-500">Stok {s.stok}</span>
                                  )}
                                  {kodeRak && (
                                    <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded px-1.5 py-0.5">
                                      {kodeRak}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-slate-500 text-xs">Harga Asli</span>
                              <span className="text-slate-400">{fmtRp(s.harga_asli)}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-slate-500 text-xs">HPP</span>
                              <span className="text-slate-400">{fmtRp(s.hpp)}</span>
                            </div>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-500 text-xs">Grosir</span>
                                <span className="text-slate-200">{fmtRp(s.grosir)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500 text-xs">Tengah</span>
                                <span className="text-slate-200">{fmtRp(s.tengah)}</span>
                              </div>
                              <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1.5">
                                <span className="text-slate-500 text-xs">Ecer</span>
                                <span className="text-amber-400 font-semibold">{fmtRp(s.ecer)}</span>
                              </div>
                            </div>
                            {(() => {
                              const mp = mpAktif ? infoMp(s) : null;
                              if (!mp) return null;
                              if (mp.status === "kosong") {
                                return (
                                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                                    <span className="text-slate-500">Marketplace</span>
                                    <Badge color="slate">HPP/Tengah kosong</Badge>
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-2 pt-2 border-t border-slate-800 text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Bersih di MP (dari Tengah)</span>
                                    <span className={mp.status === "layak" ? "text-emerald-400" : "text-red-400"}>{fmtRp(Math.round(mp.bersih))}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <Badge color={mp.status === "layak" ? "emerald" : "red"}>{LABEL_STATUS_MP[mp.status]}</Badge>
                                    <span className={mp.status === "layak" ? "text-slate-500" : "text-red-400"}>
                                      {mp.status === "layak" ? "laba " : "selisih "}{fmtRp(Math.round(mp.laba))}
                                    </span>
                                  </div>
                                  {mp.status === "rugi" && mp.minHarga != null && (
                                    <div className="text-slate-500">Tengah minimal agar tidak minus: <span className="text-slate-300">{fmtRp(mp.minHarga)}</span></div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}