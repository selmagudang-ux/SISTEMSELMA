import {
  ClipboardList, PackageCheck, Trash2, LayoutGrid, Boxes, ShoppingBag,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState, Badge } from "../components/ui";

function hariIniIso() {
  return new Date().toISOString().slice(0, 10);
}

// Halaman "Persetujuan Restok" — sebelumnya tab "Menunggu Persetujuan" di
// dalam Dashboard, dipindah jadi menu sidebar sendiri (top-level, di luar
// grup Gudang) supaya tidak nyampur dengan menu operasional role "gudang"
// (yang tidak punya akses ke halaman ini sama sekali). Dibatasi hanya untuk
// owner & superadmin lewat ROLE_MENUS di lib/constants.js — badge jumlah
// pengajuan yang masih "menunggu" ditempel langsung di menu ini (lihat
// sidebarBadges di App.jsx), bukan lagi di menu Dashboard.
//
// Daftar pengajuan restock dari gudang, owner meninjau (Setujui/Tolak)
// langsung dari sini, plus riwayat yang sudah direspon. Menyetujui TIDAK
// otomatis membuat Pesan Barang (PO) — cuma menandai status "disetujui"
// (arahan user: mirip badge "Habis" di Katalog, sekadar penanda, bukan alur
// otomatis) — gudang yang nanti bikin PO manual lewat Pesan Barang kalau mau
// ditindaklanjuti.
export default function PersetujuanRestock({ pengajuanRestock, session, setModal, filterJenis, onNavigate }) {
  const bisaSetujui = ["owner", "superadmin"].includes(session?.role);

  const semua = pengajuanRestock || [];
  // filterJenis datang dari klik popover "Barang Diajukan" di Dashboard
  // Gudang ("sku" atau "zona") — hanya menyaring daftar "Menunggu
  // Persetujuan" di bawah, riwayat tetap menampilkan semuanya.
  const menunggu = [...semua]
    .filter((p) => p.status === "menunggu")
    .filter((p) => !filterJenis || (filterJenis === "zona" ? p.jenis === "zona" : p.jenis !== "zona"))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const riwayat = [...semua]
    .filter((p) => p.status !== "menunggu")
    .sort((a, b) => new Date(b.direspon_pada || b.created_at) - new Date(a.direspon_pada || a.created_at))
    .slice(0, 10);

  const bulanIni = hariIniIso().slice(0, 7);
  const disetujuiBulanIni = semua.filter(
    (p) => p.status === "disetujui" && (p.direspon_pada || "").slice(0, 7) === bulanIni
  ).length;
  const ditolakBulanIni = semua.filter(
    (p) => p.status === "ditolak" && (p.direspon_pada || "").slice(0, 7) === bulanIni
  ).length;

  return (
    <div>
      <PageHeader
        title="Persetujuan Restok"
        description="Pengajuan restock dari gudang — tinjau, dan lihat riwayat yang sudah direspon."
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Menunggu Ditinjau" value={menunggu.length} accent="text-amber-400" icon={ClipboardList} iconColor="text-amber-500" />
        <StatCard label="Disetujui Bulan Ini" value={disetujuiBulanIni} accent="text-emerald-400" icon={PackageCheck} iconColor="text-emerald-500" />
        <StatCard label="Ditolak Bulan Ini" value={ditolakBulanIni} accent="text-red-400" icon={Trash2} iconColor="text-red-500" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
            Menunggu Persetujuan{!bisaSetujui && " (diajukan tim gudang)"}
            {filterJenis && (
              <>
                <Badge color="amber">{filterJenis === "zona" ? "Rak Kosong" : "Restok"}</Badge>
                <button
                  onClick={() => onNavigate && onNavigate("persetujuan-restock")}
                  className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
                >
                  Lihat Semua
                </button>
              </>
            )}
          </div>
          {menunggu.length === 0 ? (
            <EmptyState label="Tidak ada pengajuan yang menunggu persetujuan." />
          ) : (
            <div className="space-y-2">
              {menunggu.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <div className="mt-0.5 w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        {p.jenis === "zona" ? (
                          <LayoutGrid size={14} className="text-amber-500" />
                        ) : (
                          <Boxes size={14} className="text-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        {p.jenis === "zona" ? (
                          <>
                            <div className="text-xs font-semibold text-slate-100 truncate">Zona: {p.zona}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.dibuat_oleh_nama || "—"} · {p.jumlah_rak_kosong} rak kosong
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono text-xs font-semibold text-slate-100 truncate">{p.sku}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.dibuat_oleh_nama || "—"} · stok saat itu {p.stok_saat_ajuan}
                            </div>
                          </>
                        )}
                        {p.catatan && (
                          <div className="text-[11px] text-slate-400 mt-1 italic">"{p.catatan}"</div>
                        )}
                      </div>
                    </div>
                    {bisaSetujui ? (
                      <button
                        onClick={() => setModal({ type: "respon-pengajuan-restock", item: p })}
                        className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950"
                      >
                        Tinjau
                      </button>
                    ) : (
                      <Badge color="amber">Menunggu</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2">Riwayat Pengajuan Terakhir</div>
          {riwayat.length === 0 ? (
            <EmptyState label="Belum ada riwayat pengajuan yang direspon." />
          ) : (
            <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 overflow-hidden">
              {riwayat.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {p.jenis === "zona" ? (
                          <span className="text-xs font-semibold text-slate-200 truncate">Zona: {p.zona}</span>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-slate-200 truncate">{p.sku}</span>
                        )}
                        <Badge color={p.status === "disetujui" ? "emerald" : "red"}>
                          {p.status === "disetujui" ? "Disetujui" : "Ditolak"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Diajukan oleh {p.dibuat_oleh_nama || "—"}
                        {p.jenis === "zona" ? ` · ${p.jumlah_rak_kosong} rak kosong` : ""}
                        {p.catatan_owner ? ` · "${p.catatan_owner}"` : ""}
                      </div>
                    </div>
                    {bisaSetujui && (
                      <button
                        onClick={() => setModal({ type: "hapus-pengajuan-restock", item: p })}
                        title="Hapus riwayat ini"
                        className="text-slate-600 hover:text-red-400 p-1 shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {bisaSetujui && p.status === "disetujui" && p.jenis !== "zona" && (
                    <button
                      onClick={() =>
                        setModal({
                          type: "pesan-barang",
                          item: { dariRestock: true, sku: p.sku, catatanRestock: p.catatan },
                        })
                      }
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <ShoppingBag size={12} /> Buat Pesan Barang
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}