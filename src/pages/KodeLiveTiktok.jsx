import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, Search, Trash2, AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { EmptyState, inputClass, btnFilled, btnTonal, btnOutlined, btnText } from "../components/ui";
import { sbAll, fmtRp } from "../lib/api";
import { normSku, sbTulis } from "../lib/marketplaceImport";
import { PLATFORM_TIKTOK, bacaKodeLiveDariFilePesanan, saranSkuDariSellerSku, parseTempelan } from "../lib/tiktokImport";

// =========================================================
// KODE LIVE TIKTOK -> SKU MASTER BARANG.
// Satu kode live = satu SKU di Master Barang (contoh: A-11 = TDGL-GSR-10-PUT-ALLSIZE).
// Daftar disimpan SEKALI di marketplace_sku_alias (platform = "tiktok"), per entitas (PT) —
// bukan per toko — lalu dipakai terus oleh Rincian Penjualan TikTok untuk mencari SKU & HPP.
// Tiga cara mengisi: (1) ketik langsung, (2) baca file pesanan TikTok lalu isi yang belum terdaftar,
// (3) tempel banyak sekaligus dari Excel.
// =========================================================

const AWAL_TAMPIL = 50;
const POTONG_SIMPAN = 200;

export default function KodeLiveTiktok({ skuMaster, showToast }) {
  const [alias, setAlias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [cari, setCari] = useState("");
  const [edit, setEdit] = useState({}); // kode -> SKU yang sedang diketik
  const [sibuk, setSibuk] = useState("");

  const [fPesanan, setFPesanan] = useState([]);
  const [hasil, setHasil] = useState(null); // hasil baca file pesanan
  const [membaca, setMembaca] = useState(false);
  const [statusBaca, setStatusBaca] = useState("");
  const [isi, setIsi] = useState({}); // kode (belum terdaftar) -> SKU yang diketik
  const [batas, setBatas] = useState(AWAL_TAMPIL);
  const [cariBaru, setCariBaru] = useState("");

  const [tempel, setTempel] = useState("");
  const [tempelPeriksa, setTempelPeriksa] = useState(null);

  const skuMap = useMemo(() => {
    const m = new Map();
    for (const s of skuMaster || []) if (s.sku) m.set(normSku(s.sku), s);
    return m;
  }, [skuMaster]);
  const aliasMap = useMemo(() => new Map(alias.map((a) => [normSku(a.referensi), a.sku])), [alias]);

  const muat = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const rows = await sbAll(`marketplace_sku_alias?select=referensi,sku&platform=eq.${PLATFORM_TIKTOK}&order=referensi.asc`);
      setAlias(rows || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat daftar kode live");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  // Simpan (tambah / ubah) banyak pemetaan sekaligus. Mengembalikan true kalau semuanya masuk.
  const simpanBanyak = async (pasangan) => {
    const baris = [];
    const ditolak = [];
    const lihat = new Set();
    for (const p of pasangan) {
      const kode = normSku(p.kode);
      const master = skuMap.get(normSku(p.sku));
      if (!kode) continue;
      if (!master) { ditolak.push(`${kode} → ${p.sku || "(kosong)"}`); continue; }
      if (lihat.has(kode)) continue;
      lihat.add(kode);
      baris.push({ platform: PLATFORM_TIKTOK, referensi: kode, sku: master.sku });
    }
    if (ditolak.length) {
      showToast?.(`${ditolak.length} baris ditolak: SKU tidak ada di Master Barang (${ditolak.slice(0, 3).join("; ")}${ditolak.length > 3 ? "…" : ""})`, "error");
    }
    if (!baris.length) return false;
    try {
      for (let i = 0; i < baris.length; i += POTONG_SIMPAN) {
        await sbTulis("marketplace_sku_alias?on_conflict=entitas,platform,referensi", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(baris.slice(i, i + POTONG_SIMPAN)),
        });
      }
      showToast?.(`${baris.length} kode live tersimpan`);
      await muat();
      return ditolak.length === 0;
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "error");
      return false;
    }
  };

  const simpanSatu = async (kode, sku) => {
    setSibuk(kode);
    const ok = await simpanBanyak([{ kode, sku }]);
    setSibuk("");
    return ok;
  };

  const hapus = async (kode) => {
    if (!window.confirm(`Hapus pemetaan kode live ${kode}?`)) return;
    setSibuk(kode);
    try {
      await sbTulis(`marketplace_sku_alias?platform=eq.${PLATFORM_TIKTOK}&referensi=eq.${encodeURIComponent(kode)}`, { method: "DELETE", prefer: "return=minimal" });
      showToast?.(`${kode} dihapus dari daftar`);
      await muat();
    } catch (e) {
      showToast?.(e.message || "Gagal menghapus", "error");
    } finally {
      setSibuk("");
    }
  };

  // ---- baca file pesanan ----
  const pilihFile = (e) => {
    const baru = [...(e.target.files || [])];
    const kunci = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    setFPesanan((lama) => { const ada = new Set(lama.map(kunci)); return [...lama, ...baru.filter((f) => !ada.has(kunci(f)))]; });
    e.target.value = "";
    setHasil(null); setStatusBaca("");
  };
  const baca = async () => {
    setMembaca(true); setStatusBaca("Membaca file… (file besar bisa beberapa detik)"); setHasil(null);
    try {
      const r = await bacaKodeLiveDariFilePesanan(fPesanan);
      setHasil(r); setBatas(AWAL_TAMPIL); setStatusBaca("");
    } catch (e) {
      setStatusBaca(e.message || "Gagal membaca file");
    } finally {
      setMembaca(false);
    }
  };

  // Kode live di file yang belum ada di daftar, lengkap dengan saran SKU dari Seller SKU
  const belumTerdaftar = useMemo(() => {
    if (!hasil) return [];
    return hasil.daftar
      .filter((x) => !aliasMap.has(normSku(x.kode)))
      .map((x) => ({ ...x, saran: saranSkuDariSellerSku(x.sellerSku, aliasMap, skuMap) }));
  }, [hasil, aliasMap, skuMap]);
  const sudahTerdaftar = hasil ? hasil.daftar.length - belumTerdaftar.length : 0;
  const bisaSaran = belumTerdaftar.filter((x) => x.saran?.sku);
  const beragam = belumTerdaftar.filter((x) => x.saran?.beragam);
  const tampilBaru = belumTerdaftar.filter((x) => !cariBaru.trim() || `${x.kode} ${x.nama}`.toUpperCase().includes(cariBaru.trim().toUpperCase()));

  const pakaiSemuaSaran = async () => {
    if (!window.confirm(`Simpan ${bisaSaran.length} kode live dengan SKU saran dari Seller SKU? Kode yang saranannya beragam tidak ikut disimpan.`)) return;
    setSibuk("*saran");
    await simpanBanyak(bisaSaran.map((x) => ({ kode: x.kode, sku: x.saran.sku })));
    setSibuk("");
  };

  // ---- tempel massal ----
  const periksaTempel = () => {
    const p = parseTempelan(tempel).map((x) => ({ ...x, ada: !!x.sku && skuMap.has(x.sku), baru: !aliasMap.has(x.kode) }));
    setTempelPeriksa(p);
  };
  const simpanTempel = async () => {
    const valid = (tempelPeriksa || []).filter((x) => x.ada);
    setSibuk("*tempel");
    const ok = await simpanBanyak(valid.map((x) => ({ kode: x.kode, sku: x.sku })));
    setSibuk("");
    if (ok) { setTempel(""); setTempelPeriksa(null); }
  };

  const terdaftar = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return alias.filter((a) => !q || `${a.referensi} ${a.sku}`.toUpperCase().includes(q));
  }, [alias, cari]);

  return (
    <div>
      <p className="text-xs text-md-on-surface-variant mb-4 max-w-3xl">
        Satu kode live = satu SKU di Master Barang. Daftar ini disimpan sekali per PT (berlaku untuk semua toko TikTok PT ini) dan dipakai terus saat Rincian Penjualan TikTok menghitung HPP.
        Untuk cincin, ukuran (mis. <b>CI-72, 7</b>) tidak ikut: kode live-nya cukup <b>CI-72</b>.
      </p>
      <datalist id="dl-sku-tiktok">{(skuMaster || []).slice(0, 8000).map((s) => <option key={s.id ?? s.sku} value={s.sku} />)}</datalist>

      {err && <div className="mb-3 flex gap-2 text-xs text-red-400 bg-red-500/10 rounded-md-lg px-3 py-2"><AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><div>{err}</div></div>}

      {/* ---- 1. Isi dari file pesanan ---- */}
      <div className="mb-6 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
        <div className="text-sm font-medium mb-1 flex items-center gap-2"><Upload size={14} /> Isi dari file pesanan TikTok</div>
        <p className="text-xs text-md-on-surface-variant mb-3 max-w-3xl">
          Pilih export pesanan TikTok Shop (.xlsx, mis. "Semua pesanan"). Sistem membaca semua kode live di kolom Variation, lalu menampilkan yang belum terdaftar — diurutkan dari yang paling banyak terjual.
          Kalau baris itu punya Seller SKU yang cocok dengan Master Barang, SKU-nya disarankan otomatis. Tidak ada yang tersimpan sebelum Anda menekan Simpan.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btnOutlined} cursor-pointer`}>
            <input type="file" accept=".xlsx" multiple className="hidden" onChange={pilihFile} disabled={membaca} />
            Pilih file pesanan
          </label>
          <button className={btnTonal} disabled={!fPesanan.length || membaca} onClick={baca}>Baca file</button>
          {fPesanan.length > 0 && <button className={btnText} disabled={membaca} onClick={() => { setFPesanan([]); setHasil(null); setStatusBaca(""); }}>Kosongkan</button>}
          {statusBaca && <span className="text-xs text-md-on-surface-variant">{statusBaca}</span>}
        </div>
        {fPesanan.length > 0 && <div className="mt-2 text-[11px] text-md-on-surface-variant">{fPesanan.map((f) => f.name).join(" · ")}</div>}

        {hasil && (
          <div className="mt-4">
            <div className="text-xs text-md-on-surface-variant space-y-0.5 mb-3">
              <div>{hasil.totalBaris.toLocaleString("id-ID")} baris · {hasil.totalPesanan.toLocaleString("id-ID")} pesanan aktif · <b className="text-md-on-surface">{hasil.daftar.length.toLocaleString("id-ID")} kode live berbeda</b>, sudah terdaftar {sudahTerdaftar}, <b className={belumTerdaftar.length ? "text-amber-400" : "text-emerald-400"}>belum terdaftar {belumTerdaftar.length}</b></div>
              {hasil.barisTanpaKode > 0 && <div>{hasil.barisTanpaKode} baris tidak berbentuk kode live (mis. dari Product cards/Videos atau kode berformat lain) — tidak ditampilkan di sini; barisnya dicocokkan lewat Seller SKU saat import penjualan.</div>}
              {bisaSaran.length > 0 && <div className="text-sky-400">{bisaSaran.length} kode punya saran SKU dari Seller SKU{beragam.length ? ` · ${beragam.length} kode punya Seller SKU beragam (tidak disarankan otomatis)` : ""}.</div>}
            </div>
            {belumTerdaftar.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
                    <input value={cariBaru} onChange={(e) => setCariBaru(e.target.value)} placeholder="Cari kode / nama produk" className={`${inputClass} !w-60 !pl-9`} />
                  </div>
                  {bisaSaran.length > 0 && <button className={btnFilled} disabled={sibuk === "*saran"} onClick={pakaiSemuaSaran}>Pakai semua saran ({bisaSaran.length})</button>}
                </div>
                <div className="rounded-md-lg bg-md-container divide-y divide-md-outline-variant max-h-[460px] overflow-y-auto">
                  {tampilBaru.slice(0, batas).map((x) => (
                    <div key={x.kode} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="text-sm font-medium">{x.kode}</div>
                        <div className="text-[11px] text-md-on-surface-variant truncate">{x.pesanan} pesanan · {x.nama}</div>
                        {x.saran?.sku && (
                          <div className="text-[11px] text-sky-400 flex flex-wrap items-center gap-2">
                            Saran dari Seller SKU: {x.saran.sku}
                            <button className="underline" disabled={sibuk === x.kode} onClick={() => simpanSatu(x.kode, x.saran.sku)}>Pakai ini</button>
                          </div>
                        )}
                        {x.saran?.beragam && <div className="text-[11px] text-amber-400">Seller SKU beragam di Master: {x.saran.beragam.slice(0, 3).join(", ")}{x.saran.beragam.length > 3 ? "…" : ""} — pilih manual.</div>}
                      </div>
                      <input list="dl-sku-tiktok" value={isi[x.kode] || ""} onChange={(e) => setIsi((m) => ({ ...m, [x.kode]: e.target.value }))} placeholder="SKU di Master Barang" className={`${inputClass} !w-64`} />
                      <button className={btnTonal} disabled={!isi[x.kode] || sibuk === x.kode} onClick={async () => { const ok = await simpanSatu(x.kode, isi[x.kode]); if (ok) setIsi((m) => ({ ...m, [x.kode]: "" })); }}>Simpan</button>
                    </div>
                  ))}
                </div>
                {tampilBaru.length > batas && (
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-md-on-surface-variant">
                    Menampilkan {batas} dari {tampilBaru.length}
                    <button className="underline" onClick={() => setBatas((b) => b + 100)}>Tampilkan 100 lagi</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- 2. Tempel massal ---- */}
      <div className="mb-6 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
        <div className="text-sm font-medium mb-1 flex items-center gap-2"><Link2 size={14} /> Tempel banyak sekaligus</div>
        <p className="text-xs text-md-on-surface-variant mb-3 max-w-3xl">
          Satu baris satu pemetaan: <b>kode live</b> lalu <b>SKU</b>, dipisah tab (salin dari Excel 2 kolom), koma, atau spasi. Contoh: <span className="font-mono">A-11 TDGL-GSR-10-PUT-ALLSIZE</span>. SKU harus sudah ada di Master Barang. Kode yang sudah terdaftar akan diperbarui.
        </p>
        <textarea value={tempel} onChange={(e) => { setTempel(e.target.value); setTempelPeriksa(null); }} rows={5} placeholder={"A-11\tTDGL-GSR-10-PUT-ALLSIZE"} className={`${inputClass} font-mono !h-auto`} />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button className={btnTonal} disabled={!tempel.trim()} onClick={periksaTempel}>Periksa</button>
          {tempelPeriksa && (
            <>
              <span className="text-xs text-md-on-surface-variant">
                {tempelPeriksa.filter((x) => x.ada).length} siap disimpan · <span className={tempelPeriksa.some((x) => !x.ada) ? "text-amber-400" : ""}>{tempelPeriksa.filter((x) => !x.ada).length} bermasalah</span>
              </span>
              <button className={btnFilled} disabled={!tempelPeriksa.some((x) => x.ada) || sibuk === "*tempel"} onClick={simpanTempel}>Simpan yang siap</button>
            </>
          )}
        </div>
        {tempelPeriksa && tempelPeriksa.some((x) => !x.ada) && (
          <div className="mt-2 text-[11px] text-amber-400 space-y-0.5 max-h-32 overflow-y-auto">
            {tempelPeriksa.filter((x) => !x.ada).slice(0, 30).map((x) => <div key={x.baris}>Baris {x.baris}: {x.kode || "?"} → {x.sku ? `${x.sku} (tidak ada di Master Barang)` : "SKU kosong"}</div>)}
          </div>
        )}
      </div>

      {/* ---- 3. Daftar terdaftar ---- */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="text-sm font-medium">Kode live terdaftar ({alias.length})</div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari kode / SKU" className={`${inputClass} !w-56 !pl-9`} />
        </div>
        <button className={btnOutlined} onClick={muat} disabled={loading}><RefreshCw size={14} /> Muat ulang</button>
      </div>
      {alias.length === 0 && !loading ? (
        <EmptyState label="Belum ada kode live yang terdaftar. Baca file pesanan atau tempel daftar di atas." />
      ) : (
        <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
                <th className="px-4 py-2.5 font-medium">Kode live</th>
                <th className="px-4 py-2.5 font-medium">SKU Master Barang</th>
                <th className="px-4 py-2.5 font-medium text-right">HPP</th>
                <th className="px-4 py-2.5 font-medium w-48" />
              </tr>
            </thead>
            <tbody>
              {terdaftar.slice(0, 300).map((a) => {
                const m = skuMap.get(normSku(a.sku));
                const nilai = edit[a.referensi];
                return (
                  <tr key={a.referensi} className="border-b border-md-outline-variant last:border-0">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{a.referensi}</td>
                    <td className="px-4 py-2">
                      <input list="dl-sku-tiktok" value={nilai ?? a.sku} onChange={(e) => setEdit((s) => ({ ...s, [a.referensi]: e.target.value }))} className={`${inputClass} !w-72`} />
                      {!m && <div className="text-[11px] text-amber-400 mt-0.5">SKU ini tidak ada di Master Barang</div>}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-md-on-surface-variant">{m && m.hpp != null ? fmtRp(Number(m.hpp)) : "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {nilai !== undefined && nilai !== a.sku && (
                        <button className={btnTonal} disabled={sibuk === a.referensi} onClick={async () => { const ok = await simpanSatu(a.referensi, nilai); if (ok) setEdit((s) => { const n = { ...s }; delete n[a.referensi]; return n; }); }}>Ubah</button>
                      )}
                      <button className="p-1.5 ml-1 text-md-on-surface-variant hover:text-red-400" title="Hapus" disabled={sibuk === a.referensi} onClick={() => hapus(a.referensi)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {terdaftar.length > 300 && <div className="px-4 py-2 text-[11px] text-md-on-surface-variant">Menampilkan 300 dari {terdaftar.length} — pakai pencarian untuk menyempitkan.</div>}
        </div>
      )}
    </div>
  );
}
