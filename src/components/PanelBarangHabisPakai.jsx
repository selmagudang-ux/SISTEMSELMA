import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Boxes, AlertTriangle, Wallet, ShoppingCart } from "lucide-react";
import { sbAll, fmtRp } from "../lib/api";
import { StatCard, Badge, EmptyState, formatTanggalID } from "./ui";

// Panel ringkasan "Barang Habis Pakai" di Dashboard Gudang. Data dimuat sendiri
// begitu panel dibuka (bukan ikut loadCore), supaya tidak menambah beban muat
// untuk menu lain. Sumber: perlengkapan_stok & belanja_habis_pakai — sama dengan
// halaman Pengadaan Barang → Belanja Barang Habis Pakai.

const fmtJumlah = (n) => (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

function statusStok(p) {
  const stok = Number(p.stok) || 0;
  const min = Number(p.stok_minimum) || 0;
  if (stok <= 0) return { key: "habis", label: "Habis", color: "red" };
  if (min > 0 && stok <= min) return { key: "menipis", label: "Menipis", color: "amber" };
  return { key: "aman", label: "Aman", color: "emerald" };
}

export default function PanelBarangHabisPakai({ onNavigate, periodeDari, periodeSampai, periodeLabel }) {
  const [stok, setStok] = useState([]);
  const [belanja, setBelanja] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Belanja: yang belum dibayar (berapa pun umurnya) + semua dalam periode terpilih.
        const filterBelanja = periodeDari ? `&or=(dibayar.eq.false,tanggal.gte.${periodeDari})` : "";
        const [s, b] = await Promise.all([
          sbAll("perlengkapan_stok?select=*&order=nama"),
          sbAll(`belanja_habis_pakai?select=id,kode,tanggal,supplier,total,status,dibayar&order=tanggal.desc,id.desc${filterBelanja}`),
        ]);
        if (batal) return;
        setStok(s || []);
        setBelanja(b || []);
      } catch (e) {
        if (!batal) setError(e.message || "Gagal memuat data barang habis pakai");
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [periodeDari]);

  const { perluDibeli, belumDibayar, totalPeriode, terakhir } = useMemo(() => {
    const perluDibeli = stok
      .map((p) => ({ ...p, _status: statusStok(p) }))
      .filter((p) => p._status.key !== "aman")
      .sort((a, b) => (a._status.key === b._status.key ? 0 : a._status.key === "habis" ? -1 : 1));
    const belumDibayar = belanja.filter((b) => !b.dibayar);
    const dalamPeriode = belanja.filter((b) => {
      if (!periodeDari || !periodeSampai || !b.tanggal) return true;
      const t = String(b.tanggal).slice(0, 10);
      return t >= periodeDari && t <= periodeSampai;
    });
    const totalPeriode = dalamPeriode.reduce((a, b) => a + (Number(b.total) || 0), 0);
    return { perluDibeli, belumDibayar, totalPeriode, terakhir: belanja.slice(0, 5) };
  }, [stok, belanja, periodeDari, periodeSampai]);

  const buka = () => onNavigate && onNavigate("barang-datang", "habis-pakai");

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">Barang Habis Pakai</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Stok perlengkapan usaha (bubble wrap, lakban, ATK, dll) dan pembeliannya.
          </div>
        </div>
        <button onClick={buka} className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1">
          Buka Halaman Lengkap <ArrowRight size={12} />
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 m-4 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2.5 rounded-lg">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      ) : loading ? (
        <div className="p-6 text-center text-xs text-slate-500">Memuat…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-800">
            <StatCard label="Jenis Barang" value={stok.length} icon={Boxes} accent="text-amber-400" iconColor="text-amber-500" />
            <StatCard
              label="Perlu Dibeli"
              value={perluDibeli.length}
              icon={AlertTriangle}
              accent={perluDibeli.length > 0 ? "text-red-400" : "text-emerald-400"}
              iconColor={perluDibeli.length > 0 ? "text-red-500" : "text-emerald-500"}
            />
            <StatCard
              label="Belanja Belum Dibayar"
              value={belumDibayar.length}
              icon={Wallet}
              accent={belumDibayar.length > 0 ? "text-amber-400" : "text-slate-100"}
              iconColor="text-amber-500"
            />
            <StatCard label={`Belanja (${periodeLabel || "semua"})`} value={fmtRp(totalPeriode)} icon={ShoppingCart} accent="text-sky-400" iconColor="text-sky-500" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 p-4">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">Perlu Dibeli</div>
              {perluDibeli.length === 0 ? (
                <EmptyState label="Semua stok perlengkapan aman." />
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  {perluDibeli.slice(0, 8).map((p, i) => (
                    <div key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">{p.nama}</div>
                        <div className="text-[11px] text-slate-500">
                          Sisa {fmtJumlah(p.stok)} {p.satuan}
                          {Number(p.stok_minimum) > 0 ? ` · minimum ${fmtJumlah(p.stok_minimum)}` : ""}
                        </div>
                      </div>
                      <Badge color={p._status.color}>{p._status.label}</Badge>
                    </div>
                  ))}
                  {perluDibeli.length > 8 && (
                    <button onClick={buka} className="w-full text-[11px] text-sky-400 hover:text-sky-300 py-2 bg-slate-950">
                      +{perluDibeli.length - 8} barang lainnya
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">Pembelian Terakhir</div>
              {terakhir.length === 0 ? (
                <EmptyState label="Belum ada pembelian." />
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  {terakhir.map((b, i) => (
                    <div key={b.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">
                          {b.kode}
                          {b.supplier ? ` · ${b.supplier}` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                          {formatTanggalID(b.tanggal)}
                          <Badge color={b.status === "diterima" ? "emerald" : "sky"}>{b.status === "diterima" ? "Diterima" : "Dipesan"}</Badge>
                          <Badge color={b.dibayar ? "emerald" : "amber"}>{b.dibayar ? "Dibayar" : "Belum dibayar"}</Badge>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-100 flex-shrink-0">{fmtRp(b.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
