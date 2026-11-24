import { useCallback, useEffect, useState } from "react";
import { Link2, Unlink, RefreshCw, Loader2, AlertTriangle, Save } from "lucide-react";
import { panggilTiktok } from "../lib/tiktokApi";

// Panel Pengaturan: hubungkan / perbarui / putuskan toko marketplace tanpa menyentuh kode.
// Sekarang untuk TikTok Shop. Token TIDAK pernah sampai ke browser — server hanya mengirim
// status. Hak akses diperiksa di server (peran + PT), tombol di sini hanya kemudahan.

const fmtTanggal = (iso) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

function statusToko(t) {
  if (t.aktif === false) return { label: "Diputus", warna: "text-slate-400 bg-slate-500/10 border-slate-500/30" };
  const rt = t.refresh_token_expire_at ? new Date(t.refresh_token_expire_at).getTime() : 0;
  if (rt && rt < Date.now()) return { label: "Perlu hubungkan ulang", warna: "text-red-300 bg-red-500/10 border-red-500/30" };
  if (rt && rt - Date.now() < 7 * 86400 * 1000) return { label: "Segera hubungkan ulang", warna: "text-amber-300 bg-amber-500/10 border-amber-500/30" };
  return { label: "Terhubung", warna: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" };
}

export default function KoneksiMarketplace({ showToast }) {
  const [toko, setToko] = useState(null);
  const [app, setApp] = useState([]); // app yang linknya sudah terisi (untuk tombol Hubungkan)
  const [appSemua, setAppSemua] = useState([]); // semua app (untuk editor link)
  const [bolehEditLink, setBolehEditLink] = useState(false);
  const [linkInput, setLinkInput] = useState({});
  const [appDipilih, setAppDipilih] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState("");

  const muat = useCallback(async () => {
    setGalat("");
    try {
      const [a, b] = await Promise.all([panggilTiktok("daftar-koneksi", {}, 30000), panggilTiktok("daftar-app-koneksi", {}, 30000)]);
      setToko(a.toko || []);
      const semua = b.app || [];
      const bisa = semua.filter((x) => x.punya_link);
      setAppSemua(semua);
      setBolehEditLink(!!b.boleh_edit_link);
      setLinkInput(Object.fromEntries(semua.filter((x) => x.id != null).map((x) => [String(x.id), x.link ?? ""])));
      setApp(bisa);
      setAppDipilih((cur) => (cur !== "" || bisa.length === 0 ? cur : String(bisa[0].id ?? "bawaan")));
    } catch (e) {
      setGalat(e?.message || "Gagal memuat daftar toko.");
      setToko([]);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const hubungkan = async () => {
    setSibuk("hubungkan");
    try {
      const idApp = appDipilih === "bawaan" ? null : appDipilih === "" ? null : Number(appDipilih);
      const { url } = await panggilTiktok("buat-link", { app_id: idApp }, 30000);
      if (!/^https:\/\//i.test(url)) throw new Error("Link otorisasi tidak valid.");
      window.location.assign(url);
    } catch (e) {
      showToast?.(e?.message || "Gagal membuat link otorisasi.", "err");
      setSibuk("");
    }
  };

  const simpanLink = async (a) => {
    setSibuk(`link-${a.id}`);
    try {
      const r = await panggilTiktok("simpan-link", { app_id: a.id, link: linkInput[String(a.id)] ?? "" }, 30000);
      showToast?.(r.kosong ? `Link "${a.nama}" dikosongkan.` : `Link "${a.nama}" disimpan.`);
      await muat();
    } catch (e) {
      showToast?.(e?.message || "Gagal menyimpan link.", "err");
    } finally {
      setSibuk("");
    }
  };

  const perbarui = async (t) => {
    setSibuk(`refresh-${t.shop_id}`);
    try {
      await panggilTiktok("refresh", { shop_id: String(t.shop_id) }, 60000);
      showToast?.(`Token "${t.shop_name || t.shop_id}" diperbarui.`);
      await muat();
    } catch (e) {
      showToast?.(e?.message || "Gagal memperbarui token.", "err");
    } finally {
      setSibuk("");
    }
  };

  const putuskan = async (t) => {
    const nama = t.shop_name || t.shop_id;
    if (
      !window.confirm(
        `Putuskan toko "${nama}"?\n\nToken toko ini dihapus dari SISTEMSELMA, jadi sistem tidak bisa lagi menarik pesanan atau mengatur pengiriman untuk toko ini. Izin di sisi TikTok tidak ikut dicabut. Kamu bisa menghubungkan lagi kapan saja.`
      )
    )
      return;
    setSibuk(`putus-${t.shop_id}`);
    try {
      await panggilTiktok("putuskan", { shop_id: String(t.shop_id), konfirmasi: true }, 30000);
      showToast?.(`Toko "${nama}" diputus.`);
      await muat();
    } catch (e) {
      showToast?.(e?.message || "Gagal memutus toko.", "err");
    } finally {
      setSibuk("");
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Koneksi Marketplace — TikTok Shop</div>
      <p className="text-xs text-slate-500 mb-3 max-w-xl">
        Hubungkan toko TikTok ke SISTEMSELMA lewat tombol di bawah. Kamu akan diarahkan ke halaman izin TikTok, lalu kembali
        otomatis. Token disimpan aman di server dan tidak pernah tampil di sini.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {app.length > 1 && (
          <select
            value={appDipilih}
            onChange={(e) => setAppDipilih(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs"
          >
            {app.map((a) => (
              <option key={a.id ?? "bawaan"} value={String(a.id ?? "bawaan")}>
                {a.nama}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={hubungkan}
          disabled={!!sibuk || app.length === 0}
          className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
        >
          {sibuk === "hubungkan" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Hubungkan toko TikTok
        </button>
        <button
          onClick={muat}
          disabled={!!sibuk}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700"
        >
          <RefreshCw size={14} /> Muat ulang daftar
        </button>
      </div>

      {app.length === 0 && toko !== null && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            Tombol Hubungkan belum aktif: link otorisasi aplikasi TikTok belum diisi.{" "}
            {bolehEditLink
              ? "Isi di bagian \"Link otorisasi aplikasi\" di bawah (salin dari Partner Center)."
              : "Minta Super Admin utama untuk mengisinya di panel ini."}
          </div>
        </div>
      )}

      {galat && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3 break-words">{galat}</div>}

      {toko === null ? (
        <div className="text-xs text-slate-500">Memuat…</div>
      ) : toko.length === 0 && !galat ? (
        <div className="text-xs text-slate-500">Belum ada toko TikTok yang terhubung.</div>
      ) : (
        <div className="border border-slate-800 rounded-lg divide-y divide-slate-800">
          {toko.map((t) => {
            const st = statusToko(t);
            const aktif = t.aktif !== false;
            return (
              <div key={t.shop_id} className="px-3 py-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.shop_name || "(tanpa nama)"}</div>
                  <div className="text-[11px] text-slate-500">
                    ID {t.shop_id}
                    {t.region ? ` · ${t.region}` : ""}
                    {t.entitas ? ` · PT ${t.entitas}` : ""} · mode {t.mode || "percobaan"}
                  </div>
                  {aktif && (
                    <div className="text-[11px] text-slate-500">Izin berlaku sampai {fmtTanggal(t.refresh_token_expire_at)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] border rounded-full px-2 py-0.5 ${st.warna}`}>{st.label}</span>
                  {aktif && (
                    <button
                      onClick={() => perbarui(t)}
                      disabled={!!sibuk}
                      className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] px-2 py-1.5 rounded-lg border border-slate-700"
                    >
                      {sibuk === `refresh-${t.shop_id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Perbarui token
                    </button>
                  )}
                  {aktif && (
                    <button
                      onClick={() => putuskan(t)}
                      disabled={!!sibuk}
                      className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-300 text-[11px] px-2 py-1.5 rounded-lg border border-red-500/30"
                    >
                      {sibuk === `putus-${t.shop_id}` ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Putuskan
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bolehEditLink && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="text-xs font-semibold mb-1">Link otorisasi aplikasi</div>
          <p className="text-[11px] text-slate-500 mb-3 max-w-xl">
            Satu aplikasi TikTok = satu link. Salin dari Partner Center, bagian Authorization aplikasinya, lalu tempel di sini.
            Link ini bukan rahasia; App Secret tidak pernah diisi lewat panel.
          </p>
          <div className="space-y-2">
            {appSemua
              .filter((a) => a.id != null)
              .map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-slate-300 w-40 truncate" title={a.nama}>
                    {a.nama}
                  </div>
                  <input
                    value={linkInput[String(a.id)] ?? ""}
                    onChange={(e) => setLinkInput((m) => ({ ...m, [String(a.id)]: e.target.value }))}
                    placeholder="https://services.tiktokshop.com/open/authorize?service_id=..."
                    className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={() => simpanLink(a)}
                    disabled={!!sibuk || (linkInput[String(a.id)] ?? "") === (a.link ?? "")}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[11px] px-2 py-2 rounded-lg border border-slate-700"
                  >
                    {sibuk === `link-${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Simpan
                  </button>
                </div>
              ))}
            {appSemua.some((a) => a.id == null) && (
              <div className="text-[11px] text-slate-500">
                "App bawaan" memakai secret <span className="font-mono">TIKTOK_LINK_OTORISASI</span> di server, tidak bisa diubah dari sini.
              </div>
            )}
            {appSemua.filter((a) => a.id != null).length === 0 && (
              <div className="text-[11px] text-slate-500">Belum ada aplikasi di tabel tiktok_app.</div>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 mt-3 max-w-xl">
        "Putuskan" menghapus token di SISTEMSELMA. Izin aplikasi di sisi TikTok tetap tercatat sampai dicabut di Seller Center.
      </p>
    </div>
  );
}
