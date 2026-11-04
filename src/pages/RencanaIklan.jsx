import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, TrendingUp, Wallet, Receipt, Save, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { StatCard, EmptyState, Badge, InputRupiah, inputClass, btnFilled, btnTonal, btnText, formatTanggalID } from "../components/ui";
import { sbAll, fmtRp } from "../lib/api";
import { sbTulis } from "../lib/marketplaceImport";
import { SKENARIO, STATUS, profilEtalase, proyeksi, bagiAnggaran, ringkasRencana, roasRataToko, bandingkanRealisasi } from "../lib/rencanaIklan";

// =========================================================
// RENCANA IKLAN SHOPEE — tab di Rincian Penjualan. Memakai hasil evaluasi (Per Etalase) dari rentang
// tanggal yang sedang dipilih di halaman sebagai RIWAYAT. Dua cara pakai:
//   1) Per Etalase   : isi anggaran tiap etalase sendiri, sistem menghitung batas aman & proyeksi.
//   2) Anggaran Total: untuk momen (mis. 11.11) — isi anggaran total, sistem membagi ke etalase yang layak.
// Rencana disimpan di tabel marketplace_rencana_iklan (marketplace_rencana_iklan.sql) lalu dibandingkan
// dengan laporan iklan yang diimport sesudah periodenya selesai. TIDAK menyentuh saldo toko maupun Keuangan.
// =========================================================

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tambahHari = (isoStr, n) => { const d = new Date(`${isoStr}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const hariIni = () => iso(new Date());
const hariAntara = (a, b) => Math.max(1, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000) + 1);
const pct = (v, d = 1) => (v == null ? "—" : `${v.toFixed(d)}%`);
const kali = (v) => (v == null ? "—" : `${v.toFixed(1)}x`);
const warnaLaba = (v) => (v == null ? "text-md-on-surface-variant" : v >= 0 ? "text-emerald-400" : "text-red-400");

export default function RencanaIklan({ etalase, dari, sampai, platform, tokoKode, filterToko, batasIklan, iklanTabelAda, iklanAda, showToast }) {
  const [mode, setMode] = useState("etalase"); // etalase | total
  const [targetAcos, setTargetAcos] = useState(batasIklan);
  const [skenario, setSkenario] = useState("dasar");
  const [mulai, setMulai] = useState(hariIni());
  const [hari, setHari] = useState(7);
  const [totalAnggaran, setTotalAnggaran] = useState("");
  const [sertakanUji, setSertakanUji] = useState(false);
  const [alokasi, setAlokasi] = useState({});
  const [sisaAuto, setSisaAuto] = useState(null);
  const [cari, setCari] = useState("");
  const [namaRencana, setNamaRencana] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [tabelAda, setTabelAda] = useState(true);
  const [tersimpan, setTersimpan] = useState([]);
  const [terbuka, setTerbuka] = useState({});
  const [realisasi, setRealisasi] = useState({}); // id rencana -> baris marketplace_iklan di periodenya

  const selesai = tambahHari(mulai, Math.max(1, Number(hari) || 1) - 1);
  const hariRencana = Math.max(1, Number(hari) || 1);
  const hariRiwayat = hariAntara(dari, sampai);
  const faktor = SKENARIO[skenario].faktor;

  const roasToko = useMemo(() => roasRataToko(etalase), [etalase]);
  const profil = useMemo(
    () => etalase.map((e) => profilEtalase(e, { targetAcos: Number(targetAcos) > 0 ? Number(targetAcos) : batasIklan, hariRiwayat, roasToko }))
      .sort((a, b) => STATUS[a.status].urut - STATUS[b.status].urut || (b.roasHist ?? 0) - (a.roasHist ?? 0) || b.penjualan - a.penjualan),
    [etalase, targetAcos, batasIklan, hariRiwayat, roasToko]
  );
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? profil.filter((p) => `${p.nama || ""} ${p.kode || ""}`.toLowerCase().includes(q)) : profil;
  }, [profil, cari]);

  const ringkas = useMemo(() => ringkasRencana(profil, alokasi, faktor), [profil, alokasi, faktor]);
  const semuaSkenario = useMemo(
    () => Object.entries(SKENARIO).map(([k, s]) => ({ k, label: s.label, ...ringkasRencana(profil, alokasi, s.faktor) })),
    [profil, alokasi]
  );
  const jumlahLayak = profil.filter((p) => p.status === "layak").length;

  const muatTersimpan = useCallback(async () => {
    try {
      setTersimpan((await sbAll(`marketplace_rencana_iklan?select=*&${filterToko}&order=dibuat.desc`)) || []);
      setTabelAda(true);
    } catch {
      setTersimpan([]);
      setTabelAda(false);
    }
  }, [filterToko]);
  useEffect(() => { muatTersimpan(); }, [muatTersimpan]);

  const ubahAlokasi = (kunci, v) => { setAlokasi((m) => ({ ...m, [kunci]: v === "" ? 0 : Number(v) })); setSisaAuto(null); };

  const isiSesuaiRiwayat = () => {
    const m = {};
    for (const p of profil) if (p.status === "layak" && p.biayaHarian) m[p.kunci] = Math.round((p.biayaHarian * hariRencana) / 1000) * 1000;
    setAlokasi(m);
    setSisaAuto(null);
  };
  const bagiOtomatis = () => {
    const { alokasi: a, sisa, kandidat } = bagiAnggaran(profil, totalAnggaran, hariRencana, { sertakanUji });
    setAlokasi(a);
    setSisaAuto({ sisa, kandidat });
    if (!kandidat) showToast?.("Belum ada etalase yang layak diiklankan di riwayat ini", "error");
  };

  const simpan = async () => {
    const isi = profil.filter((p) => alokasi[p.kunci] > 0).map((p) => {
      const pr = proyeksi(p, alokasi[p.kunci], faktor);
      return { kunci: p.kunci, kode: p.kode || null, nama: p.nama, anggaran: Math.round(alokasi[p.kunci]), margin: p.margin, status: p.status, roas: pr ? Math.round(pr.roas * 100) / 100 : null, omzet: pr ? Math.round(pr.omzet) : null, laba: pr ? Math.round(pr.laba) : null };
    });
    if (!isi.length) { showToast?.("Isi anggaran minimal satu etalase dulu", "error"); return; }
    setMenyimpan(true);
    try {
      await sbTulis("marketplace_rencana_iklan", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({
          platform, toko: tokoKode, nama: namaRencana.trim() || (mode === "total" ? "Rencana anggaran total" : "Rencana iklan"),
          jenis: mode === "total" ? "anggaran_total" : "etalase", periode_dari: mulai, periode_sampai: selesai, hari: hariRencana,
          anggaran_total: isi.reduce((a, x) => a + x.anggaran, 0), target_acos: Number(targetAcos) || batasIklan, skenario, isi,
        }),
      });
      showToast?.("Rencana iklan disimpan");
      setNamaRencana("");
      await muatTersimpan();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan rencana", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (r) => {
    if (!window.confirm(`Hapus rencana "${r.nama}"?`)) return;
    try {
      await sbTulis(`marketplace_rencana_iklan?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });
      showToast?.("Rencana dihapus");
      await muatTersimpan();
    } catch (e) { showToast?.(e.message || "Gagal menghapus", "error"); }
  };

  const bukaRencana = async (r) => {
    const buka = !terbuka[r.id];
    setTerbuka((m) => ({ ...m, [r.id]: buka }));
    if (buka && !realisasi[r.id]) {
      try {
        const rows = await sbAll(`marketplace_iklan?select=periode_dari,periode_sampai,kode_produk,biaya,omzet&${filterToko}&periode_dari=lte.${r.periode_sampai}&periode_sampai=gte.${r.periode_dari}`);
        setRealisasi((m) => ({ ...m, [r.id]: rows || [] }));
      } catch { setRealisasi((m) => ({ ...m, [r.id]: [] })); }
    }
  };

  if (!etalase.length) return <EmptyState label="Belum ada data etalase di rentang tanggal ini untuk dijadikan riwayat. Pilih rentang yang sudah diimport (mis. Bulan lalu) atau import Laporan Shopee dulu." />;

  const kelasTab = (aktif) => `px-4 py-2 ${aktif ? "bg-md-primary-container text-md-on-primary-container font-medium" : "text-md-on-surface-variant"}`;

  return (
    <div>
      <div className="mb-3 text-[11px] text-md-on-surface-variant max-w-3xl">
        Riwayat yang dipakai: <b className="text-md-on-surface">{formatTanggalID(dari)} – {formatTanggalID(sampai)}</b> ({hariRiwayat} hari) sesuai rentang tanggal di atas. Ganti rentang itu kalau mau memakai periode lain sebagai acuan.
        {!iklanTabelAda && <span className="text-amber-400"> Tabel marketplace_iklan belum ada, jadi tidak ada riwayat iklan.</span>}
        {iklanTabelAda && !iklanAda && <span className="text-amber-400"> Belum ada laporan iklan di rentang ini, jadi semua etalase dihitung tanpa riwayat (perkiraan kasar).</span>}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex rounded-full border border-md-outline-variant overflow-hidden text-xs">
          <button onClick={() => setMode("etalase")} className={kelasTab(mode === "etalase")}>Per Etalase</button>
          <button onClick={() => setMode("total")} className={kelasTab(mode === "total")}>Anggaran Total (momen)</button>
        </div>
        <div>
          <div className="text-[11px] text-md-on-surface-variant mb-1">Mulai iklan</div>
          <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className={`${inputClass} !w-40`} />
        </div>
        <div>
          <div className="text-[11px] text-md-on-surface-variant mb-1">Durasi (hari)</div>
          <input type="number" min="1" max="365" value={hari} onChange={(e) => setHari(e.target.value)} className={`${inputClass} !w-24 text-center`} />
        </div>
        <div>
          <div className="text-[11px] text-md-on-surface-variant mb-1">Target ACOS (% omzet iklan)</div>
          <input type="number" min="1" max="100" step="0.5" value={targetAcos} onChange={(e) => { setTargetAcos(e.target.value); setSisaAuto(null); }} className={`${inputClass} !w-28 text-center`} />
        </div>
        <div className="flex rounded-full border border-md-outline-variant overflow-hidden text-xs" title="Skenario mengalikan ROAS riwayat: 70% / 100% / 120%">
          {Object.entries(SKENARIO).map(([k, s]) => <button key={k} onClick={() => setSkenario(k)} className={kelasTab(skenario === k)}>{s.label}</button>)}
        </div>
        <div className="text-[11px] text-md-on-surface-variant pb-2">Periode rencana: {formatTanggalID(mulai)} – {formatTanggalID(selesai)}</div>
      </div>

      {mode === "total" && (
        <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[11px] text-md-on-surface-variant mb-1">Anggaran total (Rp)</div>
              <InputRupiah value={totalAnggaran} onChange={(v) => { setTotalAnggaran(v); setSisaAuto(null); }} className={`${inputClass} !w-52`} placeholder="mis. 5.000.000" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-md-on-surface-variant cursor-pointer select-none pb-2.5">
              <input type="checkbox" checked={sertakanUji} onChange={(e) => { setSertakanUji(e.target.checked); setSisaAuto(null); }} />
              Sertakan etalase tanpa riwayat (uji kecil, maks 10% per etalase)
            </label>
            <button onClick={bagiOtomatis} className={btnFilled} disabled={!(Number(totalAnggaran) > 0)}><Wallet size={14} /> Bagi otomatis</button>
          </div>
          <div className="text-[11px] text-md-on-surface-variant mt-2 max-w-3xl">
            Pembagian memprioritaskan etalase dengan laba bersih per rupiah iklan terbesar, dan tiap etalase dibatasi maksimal 3x biaya iklan riwayatnya (supaya tidak menyuntik jauh melebihi kapasitas yang pernah terbukti). Angka hasil bagi boleh diubah manual di tabel.
          </div>
          {sisaAuto && (
            <div className={`mt-2 text-xs ${sisaAuto.sisa > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {sisaAuto.kandidat === 0
                ? "Tidak ada etalase yang layak, jadi tidak ada yang dialokasikan."
                : sisaAuto.sisa > 0
                  ? `${fmtRp(sisaAuto.sisa)} tidak teralokasi: kapasitas riwayat ${sisaAuto.kandidat} etalase layak sudah penuh. Pertimbangkan menyimpan sisanya, menaikkan target ACOS, atau menyertakan etalase uji kecil.`
                  : `Seluruh anggaran terbagi ke ${sisaAuto.kandidat} etalase.`}
            </div>
          )}
        </div>
      )}

      {mode === "etalase" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={isiSesuaiRiwayat} className={btnTonal} disabled={!jumlahLayak}>Isi sesuai biaya riwayat ({jumlahLayak} etalase layak)</button>
          <button onClick={() => { setAlokasi({}); setSisaAuto(null); }} className={btnText}>Kosongkan</button>
          <div className="text-[11px] text-md-on-surface-variant">Isi kolom Anggaran (total selama {hariRencana} hari) di tabel; angka per hari tampil di bawahnya.</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard label={`Anggaran rencana (${hariRencana} hari)`} value={fmtRp(ringkas.anggaran)} icon={Megaphone} iconColor="text-amber-400" />
        <StatCard label={`Proyeksi omzet dari iklan (${SKENARIO[skenario].label.toLowerCase()})`} value={fmtRp(Math.round(ringkas.omzet))} icon={Receipt} iconColor="text-sky-400" />
        <StatCard label="Proyeksi laba setelah iklan" value={ringkas.anggaran > ringkas.tanpaProyeksi ? fmtRp(Math.round(ringkas.laba)) : "—"} accent={warnaLaba(ringkas.anggaran > ringkas.tanpaProyeksi ? ringkas.laba : null)} icon={TrendingUp} iconColor="text-emerald-400" />
        <StatCard label="ROAS gabungan" value={kali(ringkas.roas)} icon={Wallet} iconColor="text-md-on-surface-variant" />
      </div>
      {ringkas.anggaran > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-md-on-surface-variant mb-3">
          {semuaSkenario.map((s) => (
            <span key={s.k} className={s.k === skenario ? "text-md-on-surface" : ""}>{s.label}: laba <b className={warnaLaba(s.anggaran > s.tanpaProyeksi ? s.laba : null)}>{s.anggaran > s.tanpaProyeksi ? fmtRp(Math.round(s.laba)) : "—"}</b></span>
          ))}
          {ringkas.tanpaProyeksi > 0 && <span className="text-amber-400">{fmtRp(ringkas.tanpaProyeksi)} anggaran tidak bisa diproyeksikan (HPP belum lengkap / tanpa dasar ROAS)</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari etalase / kode produk" className={`${inputClass} !w-64`} />
        <div className="text-xs text-md-on-surface-variant">{tampil.length} etalase · urut dari yang paling layak</div>
      </div>

      <div className="rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-auto max-h-[60vh] mb-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-md-container-low">
            <tr className="text-left text-xs text-md-on-surface-variant border-b border-md-outline-variant">
              <th className="px-3 py-2.5 font-medium">Etalase</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Laba sebelum iklan ÷ harga jual = ACOS impas">Margin<br />sebelum iklan</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Di bawah ROAS ini iklan rugi">ROAS impas</th>
              <th className="px-3 py-2.5 font-medium text-right" title="ROAS yang dibutuhkan agar ACOS sesuai target">ROAS target</th>
              <th className="px-3 py-2.5 font-medium text-right">ROAS riwayat</th>
              <th className="px-3 py-2.5 font-medium text-right">Biaya riwayat<br />per hari</th>
              <th className="px-3 py-2.5 font-medium text-right">Anggaran (Rp)</th>
              <th className="px-3 py-2.5 font-medium text-right">Proyeksi omzet</th>
              <th className="px-3 py-2.5 font-medium text-right">Proyeksi laba</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((p) => {
              const a = alokasi[p.kunci] || 0;
              const pr = proyeksi(p, a, faktor);
              const st = STATUS[p.status];
              return (
                <tr key={p.kunci} className="border-b border-md-outline-variant align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium whitespace-normal break-words max-w-[320px]">{p.nama || "(tanpa nama)"}</div>
                    <div className="text-[11px] text-md-on-surface-variant">{p.kode ? `Kode ${p.kode}` : "belum terpetakan"}</div>
                    <div className="mt-1 flex items-start gap-2">
                      <Badge color={st.warna}>{st.label}</Badge>
                      <span className="text-[10px] text-md-on-surface-variant max-w-[260px]">{p.alasan}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{pct(p.margin)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{kali(p.roasImpas)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{kali(p.roasTarget)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {p.adaRiwayat ? kali(p.roasHist) : p.perkiraanKasar ? <span className="text-md-on-surface-variant" title="Belum ada riwayat iklan etalase ini; dipakai ROAS rata-rata toko">~{kali(p.roasPakai)} (toko)</span> : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{p.biayaHarian ? fmtRp(Math.round(p.biayaHarian)) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <InputRupiah value={a || ""} onChange={(v) => ubahAlokasi(p.kunci, v)} className={`${inputClass} !w-32 !py-1.5 text-right`} placeholder="0" />
                    {a > 0 && <div className="text-[10px] text-md-on-surface-variant mt-0.5">≈ {fmtRp(Math.round(a / hariRencana))}/hari</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {pr ? fmtRp(Math.round(pr.omzet)) : "—"}
                    {pr?.produkTerjual != null && <div className="text-[10px] text-md-on-surface-variant">≈ {Math.round(pr.produkTerjual)} pcs</div>}
                  </td>
                  <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${warnaLaba(pr ? pr.laba : null)}`}>
                    {pr ? fmtRp(Math.round(pr.laba)) : "—"}
                    {a > 0 && !pr && <div className="text-[10px] font-normal text-amber-400">tidak bisa diproyeksikan</div>}
                    {pr && p.perkiraanKasar && <div className="text-[10px] font-normal text-amber-400">perkiraan kasar</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-md-on-surface-variant max-w-3xl mb-5">
        Proyeksi = anggaran x ROAS riwayat etalase (dikali faktor skenario); laba = omzet iklan x margin sebelum iklan − anggaran. Anggapannya margin penjualan dari iklan sama dengan margin etalase, dan ROAS bisa turun kalau anggaran dinaikkan jauh di atas riwayat, jadi lihat juga skenario Konservatif. Ini perkiraan, bukan jaminan.
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1 min-w-[220px] max-w-sm">
          <div className="text-[11px] text-md-on-surface-variant mb-1">Nama rencana (opsional)</div>
          <input value={namaRencana} onChange={(e) => setNamaRencana(e.target.value)} placeholder={mode === "total" ? "mis. Iklan 11.11" : "mis. Iklan minggu ke-2 November"} className={inputClass} />
        </div>
        <button onClick={simpan} className={btnFilled} disabled={menyimpan || ringkas.anggaran <= 0 || !tabelAda}><Save size={14} /> Simpan rencana</button>
        {!tabelAda && <div className="text-[11px] text-amber-400 max-w-md">Tabel marketplace_rencana_iklan belum ada — jalankan file SQL <b>marketplace_rencana_iklan.sql</b>, lalu muat ulang halaman.</div>}
      </div>

      {tabelAda && (
        <div>
          <div className="text-sm font-medium mb-2">Rencana tersimpan &amp; realisasinya</div>
          {!tersimpan.length ? (
            <div className="text-xs text-md-on-surface-variant">Belum ada rencana tersimpan untuk toko ini.</div>
          ) : (
            <div className="space-y-2">
              {tersimpan.map((r) => {
                const buka = !!terbuka[r.id];
                const isi = Array.isArray(r.isi) ? r.isi : [];
                const bd = buka && realisasi[r.id] ? bandingkanRealisasi(isi, realisasi[r.id], r.periode_dari, r.periode_sampai) : null;
                return (
                  <div key={r.id} className="rounded-md-lg bg-md-container-low shadow-elevation-1">
                    <div className="flex items-center gap-2 px-4 py-3 cursor-pointer" onClick={() => bukaRencana(r)}>
                      {buka ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.nama}</div>
                        <div className="text-[11px] text-md-on-surface-variant">
                          {formatTanggalID(r.periode_dari)} – {formatTanggalID(r.periode_sampai)} · {isi.length} etalase · anggaran {fmtRp(Number(r.anggaran_total) || 0)} · {r.jenis === "anggaran_total" ? "anggaran total" : "per etalase"}
                        </div>
                      </div>
                      <button className={btnText} onClick={(ev) => { ev.stopPropagation(); hapus(r); }} title="Hapus rencana"><Trash2 size={14} /></button>
                    </div>
                    {buka && (
                      <div className="px-4 pb-3 overflow-x-auto">
                        {!bd ? <div className="text-xs text-md-on-surface-variant py-2">Memuat realisasi…</div> : (
                          <>
                            {!bd.adaRealisasi && (
                              <div className="flex gap-2 text-[11px] text-amber-400 mb-2"><AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />Belum ada laporan iklan yang periodenya masuk penuh di tanggal rencana ini. Import Laporan Shopee (file iklan) setelah periode selesai, lalu buka lagi.</div>
                            )}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-md-on-surface-variant">
                                  <th className="py-1 pr-3 font-medium">Etalase</th>
                                  <th className="py-1 pr-3 font-medium text-right">Anggaran rencana</th>
                                  <th className="py-1 pr-3 font-medium text-right">Biaya realisasi</th>
                                  <th className="py-1 pr-3 font-medium text-right">Omzet rencana</th>
                                  <th className="py-1 pr-3 font-medium text-right">Omzet realisasi</th>
                                  <th className="py-1 pr-3 font-medium text-right">ROAS rencana / real</th>
                                  <th className="py-1 pr-3 font-medium text-right">Laba rencana</th>
                                  <th className="py-1 font-medium text-right">Laba realisasi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bd.baris.map((b) => (
                                  <tr key={b.kunci} className="border-t border-md-outline-variant/60">
                                    <td className="py-1.5 pr-3 max-w-[240px] whitespace-normal break-words">{b.nama}</td>
                                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(b.anggaran)}</td>
                                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{b.real ? fmtRp(Math.round(b.real.biaya)) : "—"}</td>
                                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{b.omzet != null ? fmtRp(b.omzet) : "—"}</td>
                                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{b.real ? fmtRp(Math.round(b.real.omzet)) : "—"}</td>
                                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">{b.roas != null ? `${b.roas.toFixed(1)}x` : "—"} / <b className={b.real && b.roas != null ? (b.real.roas >= b.roas ? "text-emerald-400" : "text-red-400") : ""}>{b.real ? kali(b.real.roas) : "—"}</b></td>
                                    <td className={`py-1.5 pr-3 text-right whitespace-nowrap ${warnaLaba(b.laba)}`}>{b.laba != null ? fmtRp(b.laba) : "—"}</td>
                                    <td className={`py-1.5 text-right whitespace-nowrap font-medium ${warnaLaba(b.real?.laba)}`}>{b.real?.laba != null ? fmtRp(Math.round(b.real.laba)) : "—"}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-md-outline-variant font-medium">
                                  <td className="py-1.5 pr-3">Total</td>
                                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(bd.rencanaA)}</td>
                                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{bd.adaRealisasi ? fmtRp(Math.round(bd.realA)) : "—"}</td>
                                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtRp(bd.rencanaOmzet)}</td>
                                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{bd.adaRealisasi ? fmtRp(Math.round(bd.realOmzet)) : "—"}</td>
                                  <td />
                                  <td className={`py-1.5 pr-3 text-right whitespace-nowrap ${warnaLaba(bd.rencanaLaba)}`}>{fmtRp(bd.rencanaLaba)}</td>
                                  <td className={`py-1.5 text-right whitespace-nowrap ${warnaLaba(bd.adaRealisasi ? bd.realLaba : null)}`}>{bd.adaRealisasi ? fmtRp(Math.round(bd.realLaba)) : "—"}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div className="text-[10px] text-md-on-surface-variant mt-1.5 max-w-3xl">Realisasi dihitung dari laporan iklan yang periodenya masuk penuh di tanggal rencana; laba realisasi = omzet iklan x margin saat rencana dibuat − biaya iklan.</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
