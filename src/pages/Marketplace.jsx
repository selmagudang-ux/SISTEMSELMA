import { useState } from "react";
import { ShoppingBag, CheckCircle2, AlertTriangle, PackagePlus, ArrowRightLeft, Search } from "lucide-react";
import { PageHeader, EmptyState, Badge } from "../components/ui";
import { fmtTgl } from "../lib/api";

export default function Marketplace({
  sub,
  items,
  quickAdvance,
  setModal,
  navigate,
  notifTipis,
  notifTambah,
  notifRak,
  ackNotif,
}) {
  if (sub === "sudah") return <SudahUpload items={items} />;
  if (sub === "riwayat") return <RiwayatUpload items={items} />;
  if (sub === "cek")
    return (
      <CekMarketplace
        notifTipis={notifTipis}
        notifTambah={notifTambah}
        notifRak={notifRak}
        ackNotif={ackNotif}
        navigate={navigate}
      />
    );
  return <BelumUpload items={items} quickAdvance={quickAdvance} setModal={setModal} />;
}

// Tiga notifikasi yang perlu dikonfirmasi admin marketplace: (1) stok tipis/
// habis — konfirmasi kalau listing sudah disesuaikan, (2) stok baru saja
// bertambah (restock) — konfirmasi kalau listing sudah diperbarui, (3) SKU
// keluar dari rak lamanya atau tercatat di rak ganda — konfirmasi kalau
// sudah ditindaklanjuti. Setiap notifikasi cuma hilang dari daftar ini
// setelah diklik "Sudah" / "Sudah diperbarui" — dan otomatis muncul lagi
// kalau kondisinya berubah lagi setelah itu (mis. stok berubah lagi).
function CekMarketplace({ notifTipis, notifTambah, notifRak, ackNotif, navigate }) {
  const [q, setQ] = useState("");
  const lower = q.toLowerCase();

  const tipis = (notifTipis || []).filter((n) => n.sku.toLowerCase().includes(lower));
  const tambah = (notifTambah || []).filter((n) => n.sku.toLowerCase().includes(lower));
  const rakList = (notifRak || []).filter((n) => n.sku.toLowerCase().includes(lower));

  const totalNotif = tipis.length + tambah.length + rakList.length;

  return (
    <div>
      <PageHeader
        title="Cek Marketplace"
        description="Notifikasi yang perlu ditindaklanjuti admin marketplace: stok tipis/habis, stok baru bertambah, atau rak SKU berubah — supaya listing selalu sesuai kondisi gudang. Klik tombol konfirmasi setelah listing disesuaikan."
      />

      <div className="flex items-center gap-2 mb-5 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari SKU…"
          className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600"
        />
      </div>

      {totalNotif === 0 ? (
        <EmptyState label="Tidak ada notifikasi — semua sudah dikonfirmasi." />
      ) : (
        <div className="space-y-6">
          <CekSection
            title="Stok Tipis / Habis"
            description="Qty di bawah 5 (termasuk habis) — sesuaikan dulu listing di marketplace, lalu konfirmasi."
            icon={AlertTriangle}
            color="amber"
            count={tipis.length}
          >
            {tipis.map((n) => (
              <div
                key={n.key}
                className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border border-amber-500/30 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-300">{n.sku}</span>
                  {n.stok <= 0 ? (
                    <Badge color="red">Habis</Badge>
                  ) : (
                    <Badge color="amber">Sisa {n.stok}</Badge>
                  )}
                </div>
                <button
                  onClick={() => ackNotif(n.key)}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                >
                  <CheckCircle2 size={12} /> Sudah
                </button>
              </div>
            ))}
          </CekSection>

          <CekSection
            title="Stok Bertambah"
            description="SKU yang baru saja restock — perbarui qty/listing di marketplace, lalu konfirmasi."
            icon={PackagePlus}
            color="sky"
            count={tambah.length}
          >
            {tambah.map((n) => (
              <div
                key={n.key}
                className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border border-sky-500/30 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-300">{n.sku}</div>
                  <div className="text-[11px] text-sky-400/80 mt-0.5">
                    {n.qtyBefore} → {n.qtyAfter} (+{n.qtyChange})
                  </div>
                </div>
                <button
                  onClick={() => ackNotif(n.key)}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                >
                  <CheckCircle2 size={12} /> Sudah diperbarui
                </button>
              </div>
            ))}
          </CekSection>

          <CekSection
            title="Rak Berubah"
            description="SKU keluar dari rak lamanya (ditimpa SKU lain) atau tercatat di lebih dari satu rak — cek lokasi barangnya, lalu konfirmasi."
            icon={ArrowRightLeft}
            color="orange"
            count={rakList.length}
          >
            {rakList.map((n) => (
              <div
                key={n.key}
                className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border border-orange-500/30 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-300">{n.sku}</div>
                  <div className="text-[11px] text-orange-400/80 mt-0.5">{n.detail}</div>
                </div>
                <button
                  onClick={() => ackNotif(n.key)}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                >
                  <CheckCircle2 size={12} /> Sudah
                </button>
              </div>
            ))}
          </CekSection>

          {navigate && (
            <button
              onClick={() => navigate("rak", "peta")}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              Buka Peta Rak →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CekSection({ title, description, icon: Icon, color, count, children }) {
  if (count === 0) return null;
  const colorText = {
    amber: "text-amber-400",
    red: "text-red-400",
    orange: "text-orange-400",
    sky: "text-sky-400",
  }[color];
  return (
    <div>
      <div className="flex items-start gap-2 mb-2.5">
        <Icon size={15} className={`${colorText} flex-shrink-0 mt-0.5`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <Badge color={color}>{count}</Badge>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function BelumUpload({ items, quickAdvance, setModal }) {
  const list = items.filter((i) => i.stage === "marketplace");
  return (
    <div>
      <PageHeader
        title="Belum Upload"
        description="Barang yang sudah lolos verifikasi foto dan siap diupload ke marketplace. Klik foto untuk memperbesar, atau tombol Detail untuk lihat info lengkap, download foto, atau kembalikan ke Pemotretan kalau ada yang salah."
      />
      {list.length === 0 ? (
        <EmptyState label="Semua barang sudah diupload." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              {item.foto_url ? (
                <img
                  src={item.foto_url}
                  alt={item.sku}
                  onClick={() => setModal({ type: "lihat-foto", item })}
                  className="w-full h-24 object-cover rounded-md mb-2 border border-slate-800 cursor-zoom-in hover:opacity-90"
                />
              ) : (
                <div className="w-full h-24 rounded-md mb-2 border border-dashed border-slate-700" />
              )}
              <ShoppingBag size={14} className="text-teal-400 mb-1" />
              <div className="text-xs font-mono text-slate-300 truncate">{item.sku}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.jumlah}x</div>
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={() => setModal({ type: "detail-item", item })}
                  className="flex-1 text-[11px] font-medium border border-slate-700 hover:border-slate-600 text-slate-300 rounded-md py-1.5"
                >
                  Detail
                </button>
                <button
                  onClick={() => quickAdvance(item, "marketplace")}
                  className="flex-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md py-1.5"
                >
                  Sudah upload →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SudahUpload({ items }) {
  const list = items.filter((i) => i.marketplace_status === "sudah");
  return (
    <div>
      <PageHeader title="Sudah Upload" description="Barang yang sudah berhasil diupload ke marketplace." />
      {list.length === 0 ? (
        <EmptyState label="Belum ada barang yang diupload." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Jumlah</th>
                <th className="px-4 py-2.5">Waktu Upload</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-2.5">{i.jumlah}x</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtTgl(i.marketplace_uploaded_at)}</td>
                  <td className="px-4 py-2.5">
                    <Badge color="emerald">Selesai</Badge>
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

function RiwayatUpload({ items }) {
  const list = items
    .filter((i) => i.marketplace_uploaded_at)
    .sort((a, b) => new Date(b.marketplace_uploaded_at) - new Date(a.marketplace_uploaded_at));
  return (
    <div>
      <PageHeader title="Riwayat Upload" description="Semua histori upload ke marketplace, terbaru di atas." />
      {list.length === 0 ? (
        <EmptyState label="Belum ada riwayat upload." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {list.map((i, idx) => (
            <div
              key={i.id}
              className={`flex items-center justify-between px-4 py-2.5 ${idx % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="font-mono text-xs text-slate-300">{i.sku}</span>
                <span className="text-[11px] text-slate-500">{i.jumlah}x</span>
              </div>
              <span className="text-[11px] text-slate-500">{fmtTgl(i.marketplace_uploaded_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}