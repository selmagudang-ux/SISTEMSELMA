import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, Receipt, Package, XCircle, Printer, Truck } from "lucide-react";
import { StatCard, EmptyState, Badge, inputClass, btnFilled, btnOutlined } from "../components/ui";
import { fmtRp } from "../lib/api";
import { panggilTiktok, normNamaToko } from "../lib/tiktokApi";

// =========================================================
// PESANAN TIKTOK (dari API TikTok Shop) — satu toko SELMA = satu toko TikTok yang
// namanya SAMA (shop_name). Data disimpan di tabel tiktok_pesanan, terpisah dari
// marketplace_penjualan / marketplace_transaksi, jadi TIDAK menyentuh saldo toko,
// Keuangan, maupun laporan Shopee. Tahap ini hanya menampilkan data mentah untuk
// diperiksa; penghitungan HPP & laba menyusul setelah datanya terbukti benar.
// =========================================================

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hariIni = () => iso(new Date());
const nHariLalu = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const waktuID = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_WARNA = {
  UNPAID: "slate", ON_HOLD: "amber", AWAITING_SHIPMENT: "amber", PARTIALLY_SHIPPING: "sky",
  AWAITING_COLLECTION: "sky", IN_TRANSIT: "sky", DELIVERED: "emerald", COMPLETED: "emerald", CANCELLED: "red",
};

// Status pesanan yang labelnya bisa diminta (kurir diatur TikTok).
const STATUS_BISA_CETAK = new Set(["AWAITING_SHIPMENT", "AWAITING_COLLECTION", "PARTIALLY_SHIPPING", "IN_TRANSIT"]);

// Ringkas item: "SKU-A ×2, SKU-B" (tiap line item TikTok = 1 unit)
function ringkasItem(items) {
  const per = new Map();
  (items || []).forEach((it) => {
    const k = it.seller_sku || it.product_name || "(tanpa SKU)";
    per.set(k, (per.get(k) || 0) + 1);
  });
  return [...per.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(", ") || "—";
}

export default function TiktokPesanan({ toko, showToast }) {
  const [dari, setDari] = useState(nHariLalu(6));
  const [sampai, setSampai] = useState(hariIni());
  const [pesanan, setPesanan] = useState([]);
  const [infoToko, setInfoToko] = useState(null); // { shop_name, mode } kalau terhubung
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [sinkron, setSinkron] = useState(false);
  const [dipilih, setDipilih] = useState(new Set());
  const [mencetak, setMencetak] = useState(false);
  const [hasilResi, setHasilResi] = useState([]);
  const [aturOrder, setAturOrder] = useState(null); // order_id yang sedang dikonfirmasi atur pengirimannya
  const [metode, setMetode] = useState("PICKUP");
  const [mengatur, setMengatur] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const r = await panggilTiktok("daftar-pesanan", { shop_name: toko.label, dari, sampai });
      setInfoToko(r.toko);
      setPesanan(r.pesanan || []);
    } catch (e) {
      setInfoToko(null);
      setPesanan([]);
      setGalat(e.message || "Gagal memuat pesanan.");
    } finally {
      setMemuat(false);
    }
  }, [toko.label, dari, sampai]);

  useEffect(() => { muat(); }, [muat]);

  const jalankanSinkron = async () => {
    setSinkron(true);
    try {
      const r = await panggilTiktok("sinkron-pesanan", { shop_name: toko.label, hari: 7 });
      showToast?.(`Sinkron selesai: ${r.jumlah} pesanan (7 hari terakhir).`);
      await muat();
    } catch (e) {
      showToast?.(e.message || "Sinkron gagal.", "error");
      setGalat(e.message || "Sinkron gagal.");
    } finally {
      setSinkron(false);
    }
  };

  // Cetak resi: URL label diambil dari TikTok saat diklik dan tidak disimpan di database.
  const cetakResi = async (orderIds) => {
    if (orderIds.length === 0) return;
    // Satu pesanan: buka tab kosong SEKARANG (masih di dalam klik) supaya tidak diblokir browser.
    const tab = orderIds.length === 1 ? window.open("", "_blank") : null;
    setMencetak(true);
    setHasilResi([]);
    try {
      const r = await panggilTiktok("cetak-resi", { shop_name: toko.label, order_ids: orderIds });
      const hasil = r.hasil || [];
      const berhasil = hasil.filter((h) => h.url);
      if (tab && berhasil.length === 1) {
        tab.location.href = berhasil[0].url;
      } else {
        tab?.close();
      }
      if (hasil.length > 1 || hasil.some((h) => h.error)) setHasilResi(hasil);
    } catch (e) {
      tab?.close();
      showToast?.(e.message || "Gagal mengambil resi.", "error");
    } finally {
      setMencetak(false);
    }
  };

  // Atur pengiriman ke TikTok: MENGUBAH status pesanan di Seller Center (tidak bisa dibatalkan dari sini).
  const jalankanAtur = async () => {
    if (!aturOrder) return;
    setMengatur(true);
    try {
      const r = await panggilTiktok("atur-pengiriman", { shop_name: toko.label, order_id: aturOrder, metode, konfirmasi: true });
      const gagal = (r.hasil || []).filter((h) => !h.ok);
      if (gagal.length > 0) {
        showToast?.(`Sebagian paket gagal diatur: ${gagal.map((g) => g.error).join(" | ")}`, "error");
      } else {
        showToast?.(`Pengiriman pesanan ${aturOrder} diatur (${metode === "PICKUP" ? "dijemput" : "drop-off"}).`);
      }
      setAturOrder(null);
      try { await panggilTiktok("sinkron-pesanan", { shop_name: toko.label, hari: 7 }); } catch { /* status akan menyusul di sinkron berikutnya */ }
      await muat();
    } catch (e) {
      showToast?.(e.message || "Gagal mengatur pengiriman.", "error");
    } finally {
      setMengatur(false);
    }
  };

  const bisaCetak = pesanan.filter((p) => STATUS_BISA_CETAK.has(p.status));
  const semuaTerpilih = bisaCetak.length > 0 && bisaCetak.every((p) => dipilih.has(p.order_id));
  const togglePilih = (id) =>
    setDipilih((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const togglePilihSemua = () => setDipilih(semuaTerpilih ? new Set() : new Set(bisaCetak.map((p) => p.order_id)));

  const ringkas = useMemo(() => {
    const batal = pesanan.filter((p) => p.status === "CANCELLED").length;
    const total = pesanan.filter((p) => p.status !== "CANCELLED").reduce((a, p) => a + (Number(p.total) || 0), 0);
    return { jumlah: pesanan.length, batal, total };
  }, [pesanan]);

  const belumTerhubung = !infoToko && /tidak ada toko tiktok/i.test(galat);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {infoToko ? (
          <>
            <Badge color="emerald">Terhubung ke TikTok</Badge>
            {infoToko.mode === "percobaan" && <Badge color="amber">Toko percobaan</Badge>}
          </>
        ) : (
          <Badge color="slate">Belum terhubung</Badge>
        )}
        <div className="flex-1" />
        <input type="date" className={inputClass} value={dari} max={sampai} onChange={(e) => setDari(e.target.value)} />
        <span className="text-xs text-md-on-surface-variant">s/d</span>
        <input type="date" className={inputClass} value={sampai} min={dari} onChange={(e) => setSampai(e.target.value)} />
        <button onClick={muat} className={btnOutlined} disabled={memuat}>
          <RefreshCw size={14} /> Muat ulang
        </button>
        {dipilih.size > 0 && (
          <button onClick={() => cetakResi([...dipilih].slice(0, 20))} className={btnOutlined} disabled={mencetak}>
            <Printer size={14} /> {mencetak ? "Mengambil…" : `Cetak Resi (${Math.min(dipilih.size, 20)})`}
          </button>
        )}
        <button onClick={jalankanSinkron} className={btnFilled} disabled={sinkron || belumTerhubung}>
          <RefreshCw size={14} className={sinkron ? "animate-spin" : ""} /> {sinkron ? "Menyinkron…" : "Sinkron dari TikTok"}
        </button>
      </div>

      {belumTerhubung && (
        <div className="mb-4 rounded-md-lg bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300 flex gap-3">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            Belum ada toko TikTok yang terhubung dengan nama <b>{toko.label}</b>. Nama toko di SELMA harus sama persis
            dengan nama toko di TikTok Shop (huruf besar/kecil tidak berpengaruh). Ganti nama toko ini lewat
            “Ganti Nama Toko”, atau otorisasi toko dari Partner Center.
          </div>
        </div>
      )}

      {galat && !belumTerhubung && (
        <div className="mb-4 rounded-md-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300 break-words">{galat}</div>
      )}

      {aturOrder && (
        <div className="mb-4 rounded-md-lg bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300">
          <div className="font-medium mb-2">
            Atur pengiriman ke TikTok — pesanan <span className="font-mono">{aturOrder}</span>
          </div>
          <p className="mb-3">
            Ini mengubah status pesanan di Seller Center TikTok dan tidak bisa dibatalkan dari sini. Pastikan barang sudah selesai dipacking.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-2">
              <input type="radio" name="metode-kirim" checked={metode === "PICKUP"} onChange={() => setMetode("PICKUP")} />
              Dijemput kurir (PICKUP)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="metode-kirim" checked={metode === "DROP_OFF"} onChange={() => setMetode("DROP_OFF")} />
              Diantar sendiri ke titik drop-off (DROP_OFF)
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={jalankanAtur} className={btnFilled} disabled={mengatur}>
              {mengatur ? "Memproses…" : "Ya, atur pengiriman"}
            </button>
            <button onClick={() => setAturOrder(null)} className={btnOutlined} disabled={mengatur}>Batal</button>
          </div>
        </div>
      )}

      {hasilResi.length > 0 && (
        <div className="mb-4 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4 text-sm">
          <div className="font-medium mb-2">Hasil ambil resi</div>
          <ul className="space-y-1">
            {hasilResi.map((h, i) => (
              <li key={`${h.order_id}-${h.package_id || i}`} className="flex flex-wrap gap-2">
                <span className="font-mono text-xs">{h.order_id}</span>
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noreferrer" className="text-md-primary underline">Buka resi (PDF)</a>
                ) : (
                  <span className="text-red-300 break-words">{h.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="Pesanan di periode ini" value={String(ringkas.jumlah)} icon={Receipt} accent="text-md-primary" />
        <StatCard label="Nilai pesanan (tanpa batal)" value={fmtRp(ringkas.total)} icon={Package} iconColor="text-emerald-400" />
        <StatCard label="Dibatalkan" value={String(ringkas.batal)} icon={XCircle} iconColor="text-red-400" />
      </div>

      {pesanan.length === 0 ? (
        <EmptyState label={memuat ? "Memuat…" : "Belum ada pesanan di periode ini. Klik “Sinkron dari TikTok” untuk menarik pesanan 7 hari terakhir."} />
      ) : (
        <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
                <th className="px-4 py-2.5 font-medium w-8">
                  <input type="checkbox" checked={semuaTerpilih} onChange={togglePilihSemua} disabled={bisaCetak.length === 0} />
                </th>
                <th className="px-4 py-2.5 font-medium">Dibuat</th>
                <th className="px-4 py-2.5 font-medium">No. Pesanan</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Resi</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
                <th className="px-4 py-2.5 font-medium text-right">Cetak</th>
              </tr>
            </thead>
            <tbody>
              {pesanan.map((p) => (
                <tr key={p.order_id} className="border-b border-md-outline-variant last:border-0 align-top">
                  <td className="px-4 py-2.5">
                    {STATUS_BISA_CETAK.has(p.status) && (
                      <input type="checkbox" checked={dipilih.has(p.order_id)} onChange={() => togglePilih(p.order_id)} />
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{waktuID(p.create_time)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.order_id}</td>
                  <td className="px-4 py-2.5"><Badge color={STATUS_WARNA[p.status] || "slate"}>{p.status || "—"}</Badge></td>
                  <td className="px-4 py-2.5 text-md-on-surface-variant max-w-xs">{ringkasItem(p.items)}</td>
                  <td className="px-4 py-2.5 text-md-on-surface-variant whitespace-nowrap">{p.resi || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmtRp(p.total || 0)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {STATUS_BISA_CETAK.has(p.status) ? (
                      <div className="flex justify-end gap-1">
                        {p.status === "AWAITING_SHIPMENT" && (
                          <button onClick={() => setAturOrder(p.order_id)} className={btnOutlined} disabled={mengatur} title="Atur pengiriman ke TikTok">
                            <Truck size={14} />
                          </button>
                        )}
                        <button onClick={() => cetakResi([p.order_id])} className={btnOutlined} disabled={mencetak} title="Cetak resi">
                          <Printer size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-md-on-surface-variant">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Pemberitahuan di Daftar Toko TikTok: toko TikTok yang sudah otorisasi tapi belum ada
// padanannya (nama sama) di daftar toko SELMA.
export function TiktokBelumTerhubung({ daftarToko }) {
  const [tokoTiktok, setTokoTiktok] = useState([]);

  useEffect(() => {
    let batal = false;
    panggilTiktok("daftar", {}, 20000)
      .then((r) => { if (!batal) setTokoTiktok(r.toko || []); })
      .catch(() => { if (!batal) setTokoTiktok([]); });
    return () => { batal = true; };
  }, []);

  const namaSelma = new Set((daftarToko || []).map((t) => normNamaToko(t.label)));
  const belum = tokoTiktok.filter((t) => t.aktif !== false && !namaSelma.has(normNamaToko(t.shop_name)));
  if (belum.length === 0) return null;

  return (
    <div className="mb-4 rounded-md-lg bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300 flex gap-3">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        Toko TikTok berikut sudah otorisasi tetapi belum ada di daftar toko SELMA. Klik “Tambah Toko” dan isi nama{" "}
        <b>persis sama</b>:
        <ul className="mt-1 list-disc pl-5">
          {belum.map((t) => (
            <li key={t.shop_id}>
              {t.shop_name} {t.mode === "percobaan" ? <span className="opacity-70">(percobaan)</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}