import { ShoppingCart, Wallet, TrendingUp, Package } from "lucide-react";
import { fmtRp, sisaHutangPesanan } from "../lib/api";
import { StatCard, PageHeader, EmptyState, Badge } from "../components/ui";

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function DashboardGrosir({
  pesananGrosir = [],
  pembayaranGrosir = [],
  depositGrosir = [],
  pelangganGrosir = [],
  onNavigate,
}) {
  const pesananAktif = pesananGrosir.filter((p) => p.status !== "Batal");
  const pesananHariIni = pesananAktif.filter((p) => isToday(p.created_at));
  const omsetHariIni = pesananHariIni.reduce((a, p) => a + (Number(p.total) || 0), 0);

  const totalPiutang = pesananAktif.reduce((a, p) => a + sisaHutangPesanan(p, pembayaranGrosir), 0);
  const totalDeposit = depositGrosir.reduce((a, d) => a + (Number(d.jumlah) || 0), 0);

  const belumLunas = pesananAktif
    .filter((p) => p.status_bayar !== "Lunas")
    .sort((a, b) => sisaHutangPesanan(b, pembayaranGrosir) - sisaHutangPesanan(a, pembayaranGrosir));

  const recentHariIni = [...pesananHariIni].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const namaPelanggan = (id) => pelangganGrosir.find((c) => c.id === id)?.nama || "—";

  return (
    <div>
      <PageHeader
        title="Dashboard Grosir"
        description="Ringkasan penjualan, piutang, dan deposit pelanggan grosir."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Omset Hari Ini" value={fmtRp(omsetHariIni)} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Pesanan Hari Ini" value={pesananHariIni.length} icon={ShoppingCart} />
        <StatCard label="Piutang Belum Lunas" value={fmtRp(totalPiutang)} accent="text-amber-400" icon={Wallet} iconColor="text-amber-500" />
        <StatCard label="Total Saldo Deposit" value={fmtRp(totalDeposit)} icon={Package} />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Pesanan Belum Lunas</div>
          <button
            onClick={() => onNavigate && onNavigate("grosir", "semua-pesanan")}
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
          >
            Lihat Semua Pesanan →
          </button>
        </div>
        {belumLunas.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Semua pesanan sudah lunas." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {belumLunas.slice(0, 8).map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.nomor_pesanan}</td>
                  <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.pelanggan_id)}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-right">{fmtRp(sisaHutangPesanan(p, pembayaranGrosir))}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={p.status_bayar === "Sebagian" ? "sky" : "amber"}>{p.status_bayar}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm font-semibold">Pesanan Hari Ini</div>
        {recentHariIni.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Belum ada pesanan hari ini." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recentHariIni.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.nomor_pesanan}</td>
                  <td className="px-4 py-2.5 text-slate-300">{namaPelanggan(p.pelanggan_id)}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-right">{fmtRp(p.total)}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={p.status_bayar === "Lunas" ? "emerald" : p.status_bayar === "Sebagian" ? "sky" : "amber"}>
                      {p.status_bayar}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}