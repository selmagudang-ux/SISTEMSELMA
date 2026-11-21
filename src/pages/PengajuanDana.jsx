import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, HandCoins, XCircle, Ban, ArrowRight, Paperclip, Send, X, Trash2, Loader2 } from "lucide-react";
import { Badge, EmptyState, ModalShell, Field, inputClass, InputRupiah, InputTanggal, formatTanggalID } from "../components/ui";
import { sb, fmtRp, PENANDA_ANTAR_ENTITAS, penandaUntukArah, daftarGaji, tandaiGajiDiterimaAdmin, labelPeriodeGaji } from "../lib/api";
import { listKaryawan } from "../lib/absensi";
import { bisa } from "../lib/constants";
import { BUKTI_ACCEPT, fileAdalahPdf, daftarBukti } from "../lib/bukti";
import { unggahBuktiBanyak, fileCls } from "./AlurKas";

// =========================================================
// PENGAJUAN DANA ANTAR ENTITAS (tab di Keuangan > Perusahaan Grup > Antar Entitas, lihat Holding.jsx)
// Alur: Peminta (perusahaan) mengajukan dana ke Holding / perusahaan lain  -> status "menunggu"
//   -> Pemberi: "Setujui & Transfer" (Holding.jsx membuka form Transfer Antar Entitas yang sudah terisi;
//      setelah transfer tersimpan, pengajuan ditandai "disetujui" + transaksi_id) atau "Tolak" (wajib alasan)
//   -> Peminta boleh "Batalkan" selama masih menunggu.
// JENIS "GAJI" (jenis = "gaji", rincian_gaji = [{id, nama, nominal, periode, rekening, selesai}]): cabang mengajukan
//   gaji karyawan yang sudah disiapkan (draft) di Penggajian. Saat Pusat "Setujui & Bayar Gaji", setiap gaji dicatat
//   "Dibayar Pusat" lewat edge function gaji-admin (Pemberian Modal Pusat -> cabang + beban gaji di cabang).
//   Migrasi: supabase/migrations/20261121_pengajuan_dana_gaji.sql
// Tabel ini tidak menggerakkan uang — uang hanya bergerak lewat keuangan_transaksi (transfer biasa).
// Tabel: pengajuan_dana (supabase/migrations/20261119_pengajuan_dana.sql).
// =========================================================

const fmtWaktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "");

export function kodePengajuanDana() {
  const d = new Date();
  const tgl = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `DANA-${tgl}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export const STATUS_DANA = {
  menunggu: { label: "Menunggu persetujuan", color: "amber" },
  disetujui: { label: "Disetujui — dana ditransfer", color: "emerald" },
  ditolak: { label: "Ditolak", color: "red" },
  dibatalkan: { label: "Dibatalkan", color: "slate" },
};

// Memuat pengajuan. kodeTerikat = akun terikat satu PT: hanya pengajuan yang melibatkan PT-nya.
export function usePengajuanDana(kodeTerikat) {
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [tabelAda, setTabelAda] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const saring = kodeTerikat ? `or=(entitas_peminta.eq.${encodeURIComponent(kodeTerikat)},entitas_pemberi.eq.${encodeURIComponent(kodeTerikat)})&` : "";
      setRows((await sb(`pengajuan_dana?${saring}order=created_at.desc&limit=300`)) || []);
      setTabelAda(true);
    } catch (e) {
      // Tabel belum dibuat: tampilkan petunjuk, bukan error merah.
      if (/pengajuan_dana|schema cache|does not exist|42P01|PGRST205/i.test(`${e.message} ${e.pgCode || ""}`)) setTabelAda(false);
    } finally {
      setMemuat(false);
      // Beri tahu App.jsx supaya badge sidebar langsung ikut berubah (setelah setuju / tolak / batal / ajukan).
      try { window.dispatchEvent(new Event("selma:dana-berubah")); } catch { /* abaikan */ }
    }
  }, [kodeTerikat]);

  useEffect(() => {
    muat();
  }, [muat]);

  return { rows, setRows, memuat, tabelAda, muat };
}

export default function PengajuanDana({
  rows, memuat, tabelAda, muat, namaEnt, entitasList, kodeHolding,
  entPemintaBoleh, bisaAjukan, bolehTanggapi, bolehBatalkan, onSetujui, opsiRekeningPenerima, session, showToast, reloadKeuangan,
}) {
  const [filter, setFilter] = useState("perlu");
  const [modal, setModal] = useState(null); // {jenis:"ajukan"} | {jenis:"tolak", p}
  const [proses, setProses] = useState(false);

  const perluTindakan = (p) => p.status === "menunggu" && bolehTanggapi(p);
  const jumlahPerlu = rows.filter(perluTindakan).length;
  const tampil = rows.filter((p) => (filter === "perlu" ? perluTindakan(p) : filter === "menunggu" ? p.status === "menunggu" : true));

  const jalankan = async (fn, pesanSukses) => {
    setProses(true);
    try {
      await fn();
      showToast?.(pesanSukses);
      await muat();
      return true;
    } catch (e) {
      showToast?.(e.message || "Gagal memproses", "err");
      return false;
    } finally {
      setProses(false);
    }
  };

  const ajukan = (d) =>
    jalankan(async () => {
      await sb("pengajuan_dana", {
        method: "POST",
        body: JSON.stringify({
          kode: kodePengajuanDana(),
          entitas_peminta: d.peminta,
          entitas_pemberi: d.pemberi,
          jenis_usulan: d.jenis,
          ...(d.rincianGaji ? { jenis: "gaji", rincian_gaji: d.rincianGaji } : {}),
          jumlah: d.jumlah,
          keperluan: d.keperluan,
          tanggal_dibutuhkan: d.tanggalDibutuhkan || null,
          rekening_tujuan: d.rekening || null,
          catatan: d.catatan || null,
          bukti_url: d.bukti[0] || null,
          bukti_urls: d.bukti,
          dibuat_oleh: session?.username || null,
          dibuat_oleh_nama: session?.nama || session?.username || null,
        }),
      });
    }, `Pengajuan terkirim — menunggu persetujuan ${namaEnt(d.pemberi)}`);

  const batalkan = (p) =>
    jalankan(async () => {
      const klaim = await sb(`pengajuan_dana?id=eq.${p.id}&status=eq.menunggu`, { method: "PATCH", body: JSON.stringify({ status: "dibatalkan" }) });
      if (!klaim?.length) throw new Error("Pengajuan ini sudah diproses pihak lain, tidak bisa dibatalkan. Muat ulang.");
    }, "Pengajuan dibatalkan");

  // Hapus pengajuan yang sudah selesai. Kalau sudah disetujui, TRANSFER-nya ikut dihapus (saldo kembali ke semula).
  // Transfer dicari lewat transaksi_id; untuk data lama tanpa transaksi_id dicari lewat keterangan "Pengajuan dana <kode>".
  const hapus = (p) =>
    jalankan(async () => {
      if (p.status === "disetujui") {
        let idTrx = p.transaksi_id;
        if (!idTrx) {
          const cari = await sb(`keuangan_transaksi?tipe=eq.transfer&keterangan=like.${encodeURIComponent(`Pengajuan dana ${p.kode}*`)}&select=id`);
          if (cari?.length > 1) throw new Error("Ditemukan lebih dari satu transfer untuk pengajuan ini. Hapus transfernya manual di tab Transfer.");
          idTrx = cari?.[0]?.id;
        }
        if (idTrx) {
          const ada = await sb(`keuangan_transaksi?id=eq.${encodeURIComponent(idTrx)}&select=id`);
          if (ada?.length) await sb(`keuangan_transaksi?id=eq.${encodeURIComponent(idTrx)}`, { method: "DELETE" });
        }
      }
      const hasil = await sb(`pengajuan_dana?id=eq.${p.id}&status=neq.menunggu`, { method: "DELETE" });
      if (!hasil?.length) throw new Error("Pengajuan tidak terhapus: sudah terhapus di perangkat lain atau database menolak. Muat ulang.");
      await reloadKeuangan?.();
    }, p.status === "disetujui" ? "Pengajuan dan transfernya dihapus" : "Riwayat pengajuan dihapus");

  const tolak = (p, alasan) =>
    jalankan(async () => {
      if (!alasan.trim()) throw new Error("Isi alasan penolakan.");
      const klaim = await sb(`pengajuan_dana?id=eq.${p.id}&status=eq.menunggu`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "ditolak",
          alasan_tolak: alasan.trim(),
          diproses_oleh_nama: session?.nama || session?.username || null,
          diproses_at: new Date().toISOString(),
        }),
      });
      if (!klaim?.length) throw new Error("Pengajuan ini sudah dibatalkan peminta atau sudah diproses. Muat ulang.");
    }, "Pengajuan ditolak");

  // Setujui pengajuan jenis gaji: periksa dulu masih "menunggu", lalu buka form (password admin + rekening Pusat).
  const mulaiSetujuiGaji = async (p) => {
    await muat();
    try {
      const ada = await sb(`pengajuan_dana?id=eq.${p.id}&select=status,rincian_gaji`);
      if (ada?.[0]?.status !== "menunggu") {
        showToast?.("Pengajuan ini sudah diproses atau dibatalkan. Daftar dimuat ulang.", "err");
        return;
      }
      setModal({ jenis: "setujuiGaji", p: { ...p, rincian_gaji: ada[0].rincian_gaji ?? p.rincian_gaji } });
    } catch (e) {
      showToast?.(e.message || "Gagal memeriksa pengajuan", "err");
    }
  };

  // Jalankan "Dibayar Pusat" untuk tiap gaji. Gaji yang sudah berhasil ditandai (selesai) dan dilewati saat dicoba lagi,
  // jadi aman diulang kalau ada yang gagal di tengah (mis. password salah / gaji sudah diubah).
  const setujuiGaji = async (p, pw, rekPusat) => {
    setProses(true);
    try {
      const daftar = (Array.isArray(p.rincian_gaji) ? p.rincian_gaji : []).map((x) => ({ ...x }));
      const gagal = [];
      for (const it of daftar) {
        if (it.selesai) continue;
        try {
          await tandaiGajiDiterimaAdmin(pw, it.id, { dibayarPusat: true, rekeningPusat: rekPusat, rekeningCabang: it.rekening });
          it.selesai = true;
        } catch (e) {
          gagal.push(`${it.nama || "gaji"}: ${e.message}`);
        }
      }
      if (daftar.length && daftar.every((x) => x.selesai)) {
        const klaim = await sb(`pengajuan_dana?id=eq.${p.id}&status=eq.menunggu`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "disetujui",
            rincian_gaji: daftar,
            jumlah_disetujui: Number(p.jumlah) || null,
            diproses_oleh_nama: session?.nama || session?.username || null,
            diproses_at: new Date().toISOString(),
          }),
        });
        if (!klaim?.length) throw new Error("Gaji sudah tercatat dibayar Pusat, tetapi status pengajuan tidak berubah. Muat ulang.");
        showToast?.(`Gaji ${daftar.length} karyawan dicatat dibayar Pusat`);
        setModal(null);
      } else {
        try { await sb(`pengajuan_dana?id=eq.${p.id}&status=eq.menunggu`, { method: "PATCH", body: JSON.stringify({ rincian_gaji: daftar }) }); } catch { /* abaikan */ }
        setModal({ jenis: "setujuiGaji", p: { ...p, rincian_gaji: daftar } });
        showToast?.(`Sebagian belum berhasil — ${gagal.join("; ")}`, "err");
      }
      await muat();
      await reloadKeuangan?.();
    } catch (e) {
      showToast?.(e.message || "Gagal memproses", "err");
    } finally {
      setProses(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          ["perlu", `Perlu tindakan${jumlahPerlu ? ` (${jumlahPerlu})` : ""}`],
          ["menunggu", "Menunggu"],
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
        {bisaAjukan && (
          <button
            onClick={() => setModal({ jenis: "ajukan" })}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            <Plus size={14} /> Ajukan Dana
          </button>
        )}
      </div>

      {!tabelAda ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm p-4">
          Tabel pengajuan_dana belum dibuat — jalankan SQL migrasi <span className="font-mono">20261119_pengajuan_dana.sql</span> di Supabase dulu.
        </div>
      ) : memuat && !rows.length ? (
        <div className="text-sm text-slate-500 py-10 text-center">Memuat…</div>
      ) : tampil.length === 0 ? (
        <EmptyState label={filter === "perlu" ? "Tidak ada pengajuan dana yang perlu Anda tanggapi." : "Belum ada pengajuan dana."} />
      ) : (
        <div className="space-y-3">
          {tampil.map((p) => {
            const st = STATUS_DANA[p.status] || STATUS_DANA.menunggu;
            const lampiran = daftarBukti(p);
            return (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800">
                  <span className="font-mono text-xs text-slate-300">{p.kode}</span>
                  <Badge color={st.color}>{st.label}</Badge>
                  <span className="flex items-center gap-1.5 text-sm text-slate-200 ml-1">
                    {namaEnt(p.entitas_peminta)} <span className="text-[11px] text-slate-500">meminta dana dari</span> <ArrowRight size={13} className="text-slate-500" /> {namaEnt(p.entitas_pemberi)}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    {fmtWaktu(p.created_at)}
                    {p.dibuat_oleh_nama ? ` · ${p.dibuat_oleh_nama}` : ""}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div className="text-lg font-semibold text-sky-400">{fmtRp(p.jumlah)}</div>
                    {p.jenis === "gaji" ? (
                      <Badge color="violet">Gaji karyawan — dibayar langsung oleh Pusat</Badge>
                    ) : (
                      <Badge color={p.jenis_usulan === "pinjaman" ? "amber" : "sky"}>Usulan: {PENANDA_ANTAR_ENTITAS[p.jenis_usulan] || p.jenis_usulan}</Badge>
                    )}
                    {p.status === "disetujui" && p.jumlah_disetujui != null && Number(p.jumlah_disetujui) !== Number(p.jumlah) && (
                      <span className="text-xs text-emerald-400">disetujui {fmtRp(p.jumlah_disetujui)}</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-200 mt-1.5">{p.keperluan}</div>
                  {p.jenis === "gaji" && Array.isArray(p.rincian_gaji) && (
                    <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 divide-y divide-slate-800">
                      {p.rincian_gaji.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <span className="text-slate-200">{it.nama}{it.periode ? <span className="text-slate-500"> · {labelPeriodeGaji(it.periode)}</span> : null}</span>
                          <span className="text-slate-300">{fmtRp(it.nominal)}{it.selesai ? " ✓" : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1">
                    {p.tanggal_dibutuhkan ? `Dibutuhkan ${formatTanggalID(p.tanggal_dibutuhkan)}` : "Tanggal dibutuhkan tidak ditentukan"}
                    {p.rekening_tujuan ? ` · ke rekening ${p.rekening_tujuan}` : ""}
                    {p.catatan ? ` · Catatan: ${p.catatan}` : ""}
                  </div>
                  {lampiran.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {lampiran.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-emerald-400/90 hover:text-emerald-300">
                          <Paperclip size={12} /> Lampiran {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                  {p.status === "ditolak" && (
                    <div className="text-[11px] text-red-300 mt-1.5">
                      Ditolak{p.diproses_oleh_nama ? ` oleh ${p.diproses_oleh_nama}` : ""}: {p.alasan_tolak}
                    </div>
                  )}
                  {p.status === "disetujui" && (
                    <div className="text-[11px] text-slate-500 mt-1.5">
                      Disetujui{p.diproses_oleh_nama ? ` oleh ${p.diproses_oleh_nama}` : ""} {fmtWaktu(p.diproses_at)} · {p.jenis === "gaji" ? "gaji dicatat dibayar Pusat (lihat Penggajian & tab Transfer)" : "transfer tercatat di tab Transfer"}
                    </div>
                  )}
                </div>
                {p.status !== "menunggu" && (p.status === "disetujui" ? bolehTanggapi(p) : bolehTanggapi(p) || bolehBatalkan(p)) && (
                  <div className="flex px-4 py-3 border-t border-slate-800">
                    <button
                      disabled={proses}
                      onClick={() =>
                        window.confirm(
                          p.status === "disetujui" && p.jenis === "gaji"
                            ? `Hapus riwayat pengajuan ${p.kode}?\n\nGajinya TIDAK ikut terhapus — kelola di menu Penggajian.`
                            : p.status === "disetujui"
                            ? `Hapus pengajuan ${p.kode} BESERTA transfer ${fmtRp(p.jumlah_disetujui ?? p.jumlah)} yang sudah tercatat?\n\nSaldo rekening kembali seperti sebelum transfer. Tidak bisa dibatalkan.`
                            : `Hapus riwayat pengajuan ${p.kode}?`
                        ) && hapus(p)
                      }
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 ml-auto"
                    >
                      <Trash2 size={13} /> {p.status === "disetujui" && p.jenis !== "gaji" ? "Hapus + transfernya" : "Hapus riwayat"}
                    </button>
                  </div>
                )}
                {p.status === "menunggu" && (bolehTanggapi(p) || bolehBatalkan(p)) && (
                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-800">
                    {bolehTanggapi(p) && (
                      <>
                        <button
                          disabled={proses}
                          onClick={() => (p.jenis === "gaji" ? mulaiSetujuiGaji(p) : onSetujui(p))}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                        >
                          <Send size={13} /> {p.jenis === "gaji" ? "Setujui & Bayar Gaji" : "Setujui & Transfer"}
                        </button>
                        <button
                          disabled={proses}
                          onClick={() => setModal({ jenis: "tolak", p })}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          <XCircle size={13} /> Tolak
                        </button>
                      </>
                    )}
                    {bolehBatalkan(p) && (
                      <button
                        disabled={proses}
                        onClick={() => window.confirm(`Batalkan pengajuan ${p.kode}?`) && batalkan(p)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40 ml-auto"
                      >
                        <Ban size={13} /> Batalkan
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal?.jenis === "ajukan" && (
        <FormAjukan
          entitasList={entitasList}
          kodeHolding={kodeHolding}
          entPemintaBoleh={entPemintaBoleh}
          opsiRekeningPenerima={opsiRekeningPenerima}
          saving={proses}
          onClose={() => setModal(null)}
          onSubmit={(d) => ajukan(d).then((ok) => ok && setModal(null))}
        />
      )}
      {modal?.jenis === "setujuiGaji" && (
        <FormSetujuiGaji
          p={modal.p}
          namaEnt={namaEnt}
          rekeningList={opsiRekeningPenerima(kodeHolding)}
          bolehBayar={bisa(session?.role, "holding.bayar_gaji_pusat")}
          saving={proses}
          onClose={() => setModal(null)}
          onSubmit={(pw, rek) => setujuiGaji(modal.p, pw, rek)}
        />
      )}
      {modal?.jenis === "tolak" && (
        <FormTolak p={modal.p} namaEnt={namaEnt} saving={proses} onClose={() => setModal(null)} onSubmit={(p, alasan) => tolak(p, alasan).then((ok) => ok && setModal(null))} />
      )}
    </div>
  );
}

function FormAjukan({ entitasList, kodeHolding, entPemintaBoleh: entPemintaSemua, opsiRekeningPenerima, saving, onClose, onSubmit }) {
  // Holding tidak pernah jadi PEMINTA: pengajuan dana = perusahaan yang butuh dana meminta ke Holding / perusahaan lain.
  // (Holding sebagai peminta berarti arah perusahaan -> Holding, yang tidak punya jenis Pemberian Modal / Pinjaman.)
  // Holding yang memberi dana mencatatnya lewat tab Transfer, atau menyetujui pengajuan dari perusahaan.
  const entPemintaBoleh = entPemintaSemua.filter((k) => !kodeHolding || k !== kodeHolding);
  const [peminta, setPeminta] = useState(entPemintaBoleh.length === 1 ? entPemintaBoleh[0] : "");
  const [pemberi, setPemberi] = useState("");
  const [jenis, setJenis] = useState("modal");
  const [jumlah, setJumlah] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [tanggalDibutuhkan, setTanggalDibutuhkan] = useState("");
  const [rekening, setRekening] = useState("");
  const [catatan, setCatatan] = useState("");
  const [fileList, setFileList] = useState([]);
  const [mengunggah, setMengunggah] = useState(false);
  // Mode "gaji": pilih gaji berstatus draft dari Penggajian (butuh password admin untuk membacanya).
  const [mode, setMode] = useState("dana");
  const [pwGaji, setPwGaji] = useState("");
  const [draftGaji, setDraftGaji] = useState(null); // null = belum dimuat
  const [muatGaji, setMuatGaji] = useState(false);
  const [pilihGaji, setPilihGaji] = useState({}); // id -> true
  const [galatGaji, setGalatGaji] = useState("");

  const labelEnt = (kode) => entitasList.find((e) => e.kode === kode)?.label || kode;
  const pilihanPemberi = entitasList.filter((e) => e.kode !== peminta);

  // Pemberi default = Holding (kalau ada & bukan peminta sendiri).
  useEffect(() => {
    if (peminta && !pemberi && kodeHolding && kodeHolding !== peminta) setPemberi(kodeHolding);
    if (pemberi && pemberi === peminta) setPemberi("");
  }, [peminta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jenis yang masuk akal menurut arah: Holding -> perusahaan = modal / pinjaman; antar perusahaan = pinjaman saja.
  const jenisBoleh = useMemo(
    () => (pemberi && peminta ? penandaUntukArah(pemberi, peminta, kodeHolding).filter((v) => v === "modal" || v === "pinjaman") : ["modal", "pinjaman"]),
    [pemberi, peminta, kodeHolding]
  );
  useEffect(() => {
    if (!jenisBoleh.includes(jenis)) setJenis(jenisBoleh[0] || "pinjaman");
  }, [jenisBoleh]); // eslint-disable-line react-hooks/exhaustive-deps

  const rekeningPilihan = peminta ? opsiRekeningPenerima(peminta) : [];
  useEffect(() => {
    setRekening("");
  }, [peminta]);

  const pratinjau = useMemo(() => fileList.map((f) => URL.createObjectURL(f)), [fileList]);
  useEffect(() => () => pratinjau.forEach((u) => URL.revokeObjectURL(u)), [pratinjau]);

  const muatDraftGaji = async () => {
    if (!peminta || !pwGaji) return;
    setMuatGaji(true);
    setGalatGaji("");
    try {
      const [baris, kar] = await Promise.all([daftarGaji(pwGaji, { status: "draft", entitas: peminta }), listKaryawan(false, peminta)]);
      const nama = new Map((kar || []).map((k) => [k.id, k.nama]));
      setDraftGaji((baris || []).map((g) => ({ ...g, nama: nama.get(g.karyawan_id) || "—" })));
      setPilihGaji({});
    } catch (e) {
      setGalatGaji(e.message || "Gagal membaca gaji.");
      setDraftGaji(null);
    } finally {
      setMuatGaji(false);
    }
  };
  useEffect(() => {
    setDraftGaji(null);
    setPilihGaji({});
  }, [peminta, mode]);
  const gajiTerpilih = (draftGaji || []).filter((g) => pilihGaji[g.id]);
  const totalGaji = gajiTerpilih.reduce((a, g) => a + (Number(g.nominal) || 0), 0);

  const jumlahNum = mode === "gaji" ? totalGaji : Number(jumlah) || 0;
  const valid = mode === "gaji"
    ? !!(peminta && pemberi && peminta !== pemberi && gajiTerpilih.length > 0 && gajiTerpilih.every((g) => g.rekening_sumber || rekening))
    : peminta && pemberi && peminta !== pemberi && jumlahNum > 0 && keperluan.trim().length >= 3;

  const kirim = async () => {
    if (!valid || saving || mengunggah) return;
    let bukti = [];
    if (fileList.length) {
      setMengunggah(true);
      try {
        bukti = await unggahBuktiBanyak(fileList, `dana-${peminta}`);
      } catch (e) {
        setMengunggah(false);
        window.alert(e.message || "Gagal mengunggah lampiran");
        return;
      }
      setMengunggah(false);
    }
    if (mode === "gaji") {
      const rincianGaji = gajiTerpilih.map((g) => ({ id: g.id, nama: g.nama, nominal: Number(g.nominal) || 0, periode: g.periode, rekening: g.rekening_sumber || rekening }));
      const ringkas = rincianGaji.slice(0, 3).map((x) => x.nama).join(", ") + (rincianGaji.length > 3 ? ` +${rincianGaji.length - 3} lainnya` : "");
      onSubmit({ peminta, pemberi, jenis: "modal", jumlah: jumlahNum, keperluan: `Gaji karyawan: ${ringkas}`, tanggalDibutuhkan, rekening: "", catatan: catatan.trim(), bukti, rincianGaji });
      return;
    }
    onSubmit({ peminta, pemberi, jenis, jumlah: jumlahNum, keperluan: keperluan.trim(), tanggalDibutuhkan, rekening, catatan: catatan.trim(), bukti });
  };

  return (
    <ModalShell title="Ajukan Dana" onClose={onClose} maxWidth="max-w-xl">
      {entPemintaBoleh.length > 1 ? (
        <Field label="Atas nama perusahaan">
          <select className={inputClass} value={peminta} onChange={(e) => setPeminta(e.target.value)}>
            <option value="">Pilih perusahaan yang butuh dana…</option>
            {entitasList.filter((e) => entPemintaBoleh.includes(e.kode)).map((e) => (
              <option key={e.kode} value={e.kode}>{e.label || e.kode}</option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="text-xs text-slate-400 mb-3">Diajukan atas nama <span className="text-slate-100 font-medium">{labelEnt(peminta)}</span></div>
      )}

      <div className="flex gap-2 mb-3">
        {[["dana", "Dana biasa"], ["gaji", "Gaji karyawan (dibayar Pusat)"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`text-xs px-3 py-1.5 rounded-full border ${mode === k ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <Field label="Minta ke">
        <select className={inputClass} value={pemberi} onChange={(e) => setPemberi(e.target.value)} disabled={!peminta}>
          <option value="">{peminta ? "Pilih pihak yang dimintai dana…" : "Pilih perusahaan dulu…"}</option>
          {pilihanPemberi.map((e) => (
            <option key={e.kode} value={e.kode}>{e.label || e.kode}{e.kode === kodeHolding ? " (Holding)" : ""}</option>
          ))}
        </select>
      </Field>

      {mode === "gaji" ? (
        <div className="mb-3">
          <div className="text-[11px] text-slate-500 mb-2">
            Pusat membayar gaji langsung ke karyawan. Pembukuan: Pemberian Modal Pusat → cabang dan beban gaji tercatat di cabang (tidak ganda).
            Siapkan dulu gajinya sebagai <b>draft</b> di menu Penggajian. Rekening sumber boleh dikosongkan, dipilih di bawah.
          </div>
          <Field label="Password akun Anda (untuk membaca data gaji)">
            <div className="flex gap-2">
              <input type="password" className={inputClass} value={pwGaji} onChange={(e) => setPwGaji(e.target.value)} autoComplete="current-password" />
              <button type="button" disabled={!peminta || !pwGaji || muatGaji} onClick={muatDraftGaji} className="text-xs px-3 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap">
                {muatGaji ? "Memuat…" : "Muat gaji draft"}
              </button>
            </div>
          </Field>
          {galatGaji && <div className="text-xs text-red-300 mb-2">{galatGaji}</div>}
          {draftGaji && draftGaji.length === 0 && <div className="text-xs text-slate-400 mb-2">Tidak ada gaji berstatus draft untuk {labelEnt(peminta)}. Siapkan dulu di menu Penggajian.</div>}
          {draftGaji && draftGaji.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 divide-y divide-slate-800">
              {draftGaji.map((g) => (
                <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={!!pilihGaji[g.id]} onChange={(e) => setPilihGaji((m) => ({ ...m, [g.id]: e.target.checked }))} />
                  <span className="text-slate-200 flex-1">{g.nama} <span className="text-slate-500">· {labelPeriodeGaji(g.periode)}{g.rekening_sumber ? ` · rek. ${g.rekening_sumber}` : ""}</span></span>
                  <span className="text-slate-300">{fmtRp(g.nominal)}</span>
                </label>
              ))}
            </div>
          )}
          {gajiTerpilih.some((g) => !g.rekening_sumber) && (
            <Field label={`Rekening ${labelEnt(peminta)} untuk pencatatan gaji (untuk gaji yang belum punya rekening)`}>
              <select className={inputClass} value={rekening} onChange={(e) => setRekening(e.target.value)}>
                <option value="">— pilih rekening cabang —</option>
                {rekeningPilihan.map((r) => <option key={r.kode} value={r.kode}>{r.label}</option>)}
              </select>
            </Field>
          )}
          <div className="text-sm text-slate-200 mt-2">Total diajukan: <b className="text-sky-400">{fmtRp(totalGaji)}</b> ({gajiTerpilih.length} gaji)</div>
        </div>
      ) : (<>
      <Field label="Jenis dana yang diusulkan">
        <select className={inputClass} value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {jenisBoleh.map((v) => (
            <option key={v} value={v}>{PENANDA_ANTAR_ENTITAS[v]}</option>
          ))}
        </select>
        <div className="text-[11px] text-slate-500 mt-1">
          {jenis === "modal" ? "Pemberian modal: bukan pemasukan bagi perusahaan Anda dan tidak perlu dikembalikan." : "Pinjaman: tercatat sebagai utang perusahaan Anda dan harus dibayar kembali."} Pihak pemberi boleh mengubah jenis & jumlah saat menyetujui.
        </div>
      </Field>

      <Field label="Jumlah yang dibutuhkan (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
      </Field>

      <Field label="Untuk keperluan apa">
        <textarea className={inputClass} rows={3} value={keperluan} onChange={(e) => setKeperluan(e.target.value)} placeholder="mis. bayar supplier kain bulan ini / gaji karyawan / beli stok" />
      </Field>

      </>)}

      <Field label="Dibutuhkan tanggal (opsional)">
        <InputTanggal className={inputClass} value={tanggalDibutuhkan} onChange={setTanggalDibutuhkan} />
      </Field>

      {mode === "dana" && (
      <Field label="Dikirim ke rekening (opsional)">
        <select className={inputClass} value={rekening} onChange={(e) => setRekening(e.target.value)} disabled={!peminta}>
          <option value="">Belum ditentukan — pemberi yang memilih</option>
          {rekeningPilihan.map((r) => (
            <option key={r.kode} value={r.kode}>{r.label}</option>
          ))}
        </select>
      </Field>
      )}

      <Field label="Catatan (opsional)">
        <input className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <Field label="Lampiran pendukung (opsional — tagihan, invoice, foto/PDF)">
        <input type="file" accept={BUKTI_ACCEPT} multiple onChange={(e) => { setFileList((l) => [...l, ...Array.from(e.target.files || [])]); e.target.value = ""; }} className={fileCls} />
        {fileList.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
            <a href={pratinjau[i]} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 truncate">
              {fileAdalahPdf(f) ? "📄 " : "🖼 "}{f.name}
            </a>
            <button type="button" onClick={() => setFileList((l) => l.filter((_, k) => k !== i))} aria-label="Hapus file" className="text-slate-500 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        ))}
      </Field>

      <button
        disabled={!valid || saving || mengunggah}
        onClick={kirim}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40"
      >
        <HandCoins size={15} /> {mengunggah ? "Mengunggah lampiran…" : saving ? "Mengirim…" : "Kirim Pengajuan"}
      </button>
    </ModalShell>
  );
}

function FormTolak({ p, namaEnt, saving, onClose, onSubmit }) {
  const [alasan, setAlasan] = useState("");
  return (
    <ModalShell title={`Tolak ${p.kode}`} onClose={onClose}>
      <Field label="Alasan penolakan">
        <input className={inputClass} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. kas Holding belum cukup / ajukan ulang bulan depan" />
      </Field>
      <div className="text-[11px] text-slate-500 mb-3">{namaEnt(p.entitas_peminta)} akan melihat alasan ini di daftar pengajuannya.</div>
      <button
        disabled={saving || !alasan.trim()}
        onClick={() => onSubmit(p, alasan)}
        className="w-full text-sm font-medium py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-40"
      >
        {saving ? "Memproses…" : "Tolak Pengajuan"}
      </button>
    </ModalShell>
  );
}

// Persetujuan pengajuan jenis gaji: Pusat membayar gaji langsung ke karyawan, sistem mencatat pembukuannya.
function FormSetujuiGaji({ p, namaEnt, rekeningList, bolehBayar, saving, onClose, onSubmit }) {
  const [pw, setPw] = useState("");
  const [rek, setRek] = useState("");
  const daftar = Array.isArray(p.rincian_gaji) ? p.rincian_gaji : [];
  const sisa = daftar.filter((x) => !x.selesai);
  const total = sisa.reduce((a, x) => a + (Number(x.nominal) || 0), 0);
  return (
    <ModalShell title={`Bayar gaji ${p.kode}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="text-xs text-slate-400 mb-2">
        Gaji karyawan {namaEnt(p.entitas_peminta)} yang dibayar langsung oleh Pusat. Pastikan pembayaran ke karyawan sudah dilakukan.
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 divide-y divide-slate-800 mb-3">
        {daftar.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
            <span className="text-slate-200">{it.nama}{it.periode ? <span className="text-slate-500"> · {labelPeriodeGaji(it.periode)}</span> : null}</span>
            <span className="text-slate-300">{fmtRp(it.nominal)}{it.selesai ? " ✓ sudah dicatat" : ""}</span>
          </div>
        ))}
      </div>
      <div className="text-sm text-slate-200 mb-3">Dicatat sekarang: <b className="text-sky-400">{fmtRp(total)}</b> ({sisa.length} gaji). Nominal mengikuti data gaji di Penggajian saat ini.</div>
      <Field label="Rekening Pusat yang dipakai membayar">
        <select className={inputClass} value={rek} onChange={(e) => setRek(e.target.value)}>
          <option value="">— pilih rekening Pusat —</option>
          {rekeningList.map((r) => <option key={r.kode} value={r.kode}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="Password akun Anda">
        <input type="password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      </Field>
      <div className="text-[11px] text-slate-500 mb-3">
        Pusat: Pemberian Modal ke {namaEnt(p.entitas_peminta)} (kas Pusat berkurang, bukan beban Pusat). {namaEnt(p.entitas_peminta)}: beban Gaji. Saldo kas cabang tidak berubah.
      </div>
      <button
        disabled={!bolehBayar || !rek || !pw || saving || sisa.length === 0}
        onClick={() => onSubmit(pw, rek)}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? "Memproses…" : "Setujui & catat dibayar Pusat"}
      </button>
    </ModalShell>
  );
}
