import { useState, useMemo } from "react";
import { Plus, Paperclip, AlertTriangle, Trash2, Landmark, HandCoins, Wallet, Undo2 } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge, InputTanggal, formatTanggalID, ModalShell, Field, InputRupiah } from "../components/ui";
import { sb, fmtRp, LABEL_KAS, kodeEntitasHolding, PENARIKAN_PEMILIK, TIPE_PENARIKAN } from "../lib/api";
import { bisaPenarikanPemilik } from "../lib/constants";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";
import { useDataKas, hariIniLokal, awalBulanIni, unggahBukti, fileCls } from "./AlurKas";

// =========================================================
// PENARIKAN PEMILIK (menu Holding)
// Uang Holding yang dipakai pemilik secara pribadi. Disimpan sebagai transaksi
// keuangan biasa (keluar/masuk) di rekening Holding, ditandai kolom `penanda`.
//   Prive / Dividen   : TIDAK mengurangi laba (hanya mengurangi kas)
//   Pinjaman ke pemilik + pelunasannya : piutang, bukan laba rugi
//   Gaji pemilik      : beban biasa, mengurangi laba
// Sebelum "Tanggal PT berdiri" jenis pertama bernama Prive (usaha perorangan),
// sesudahnya bernama Dividen. Tanggal itu disimpan di master_data
// (tipe "pengaturan_holding", kode "tanggal_pt").
// =========================================================

const WARNA = { setoran_modal: "teal", prive_dividen: "sky", pinjaman_pemilik: "amber", gaji_pemilik: "violet", pelunasan_pemilik: "emerald" };
const nilai = (t) => Number(t.jumlah) || 0;
const JENIS = Object.keys(PENARIKAN_PEMILIK);

function useTanggalPt(master) {
  const baris = (master.pengaturan_holding || []).find((m) => m.kode === "tanggal_pt");
  const tanggalPt = baris?.label || "";
  // Nama jenis "Prive / Dividen" mengikuti tanggal transaksi.
  const namaJenis = (penanda, tanggal) => {
    if (penanda !== "prive_dividen") return PENARIKAN_PEMILIK[penanda] || penanda;
    if (!tanggalPt) return "Prive";
    return (tanggal || "") >= tanggalPt ? "Dividen" : "Prive";
  };
  return { baris, tanggalPt, namaJenis };
}

export default function PenarikanPemilik({ keuanganTransaksi = [], master = {}, reload, showToast, setModal, role }) {
  const k = useDataKas(master, keuanganTransaksi);
  const kodeHolding = kodeEntitasHolding(k.entitasList);
  const bisaTambah = bisaPenarikanPemilik(role);
  const { baris: barisPt, tanggalPt, namaJenis } = useTanggalPt(master);

  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [filterJenis, setFilterJenis] = useState("semua");
  const [formBuka, setFormBuka] = useState(false);

  // Seluruh riwayat dimuat (sisa pinjaman pemilik = akumulasi dari awal).
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");

  const milikHolding = useMemo(
    () =>
      semua.filter(
        (t) => t.penanda && TIPE_PENARIKAN[t.penanda] === t.tipe && k.entDari(t.rekening) === kodeHolding
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semua, kodeHolding, master.rekening_entitas, master.entitas]
  );

  const daftar = useMemo(
    () =>
      milikHolding
        .filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai))
        .filter((t) => filterJenis === "semua" || t.penanda === filterJenis)
        .sort((a, b) => ((b.tanggal || "") + (b.created_at || "")).localeCompare((a.tanggal || "") + (a.created_at || ""))),
    [milikHolding, dari, sampai, filterJenis]
  );
  const total = (p) => daftar.filter((t) => t.penanda === p).reduce((a, t) => a + nilai(t), 0);
  const sisaPinjaman = milikHolding.reduce(
    (a, t) => a + (t.penanda === "pinjaman_pemilik" ? nilai(t) : t.penanda === "pelunasan_pemilik" ? -nilai(t) : 0),
    0
  );

  const labelPrive = tanggalPt && sampai >= tanggalPt ? "Dividen" : "Prive";

  if (!kodeHolding) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs px-4 py-3">
        Entitas Holding belum diatur. Jalankan <span className="font-mono">fase4_holding.sql</span> di database, lalu muat ulang halaman.
      </div>
    );
  }

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Modal & Penarikan Pemilik"
        description="Setoran modal / dana awal dari pemilik, dan uang Holding yang dipakai pemilik untuk keperluan pribadi. Semuanya hanya menggerakkan kas, tidak masuk pemasukan maupun laba (kecuali gaji pemilik)."
        sticky
        action={
          bisaTambah ? (
            <button
              onClick={() => setFormBuka(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Catat Modal / Penarikan
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Setoran modal (periode)" value={fmtRp(total("setoran_modal"))} accent="text-teal-300" icon={Landmark} iconColor="text-teal-400" />
        <StatCard label={`${labelPrive} (periode)`} value={fmtRp(total("prive_dividen"))} accent="text-sky-400" icon={Wallet} iconColor="text-sky-500" />
        <StatCard label="Gaji pemilik (periode)" value={fmtRp(total("gaji_pemilik"))} accent="text-violet-300" icon={HandCoins} iconColor="text-violet-400" />
        <StatCard label="Pinjaman diberikan (periode)" value={fmtRp(total("pinjaman_pemilik"))} accent="text-amber-400" icon={Landmark} iconColor="text-amber-500" />
        <StatCard label="Pelunasan (periode)" value={fmtRp(total("pelunasan_pemilik"))} accent="text-emerald-400" icon={Undo2} iconColor="text-emerald-500" />
      </div>

      <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/50 mb-4">
        <div className="text-xs text-slate-300 mb-1">Sisa pinjaman pemilik ke Holding (dari awal)</div>
        <div className={`text-sm font-semibold ${sisaPinjaman > 0 ? "text-amber-400" : "text-slate-100"}`}>
          {sisaPinjaman === 0 ? "Lunas / tidak ada" : sisaPinjaman > 0 ? `Pemilik masih berutang ${fmtRp(sisaPinjaman)}` : `Pemilik mengembalikan lebih ${fmtRp(-sisaPinjaman)} dari pinjaman`}
        </div>
      </div>

      <PengaturanPt master={master} barisPt={barisPt} tanggalPt={tanggalPt} bisaUbah={bisaTambah} reload={reload} showToast={showToast} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="semua">Semua Jenis</option>
          {JENIS.map((v) => (
            <option key={v} value={v}>{PENARIKAN_PEMILIK[v]}</option>
          ))}
        </select>
      </div>

      {daftar.length === 0 ? (
        <EmptyState label="Belum ada setoran modal atau penarikan pemilik di rentang ini." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map((t, i) => (
            <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color={WARNA[t.penanda]}>{namaJenis(t.penanda, t.tanggal)}</Badge>
                  <span className="text-[11px] text-slate-400">{k.labelRek(t.rekening)}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {formatTanggalID(t.tanggal)}
                  {t.keterangan ? ` · ${t.keterangan}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`text-sm font-semibold ${t.tipe === "masuk" ? "text-emerald-400" : "text-sky-400"}`}>
                  {t.tipe === "masuk" ? "+ " : "− "}
                  {fmtRp(t.jumlah)}
                </div>
                {t.bukti_url && (
                  <a href={t.bukti_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-emerald-400/80 hover:text-emerald-300 hover:bg-slate-800" title="Lihat bukti">
                    <Paperclip size={13} />
                  </a>
                )}
                {bisaTambah && (
                  <button onClick={() => setModal?.({ type: "hapus-keuangan-transaksi", item: t })} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800" title="Hapus">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-slate-500 mt-2">
        Salah catat? Hapus lalu catat ulang. Saldo kas tetap bertambah/berkurang sesuai catatan, tetapi angka laba rugi tidak ikut berubah kecuali untuk Gaji pemilik.
      </div>

      {formBuka && (
        <FormPenarikan
          k={k}
          kodeHolding={kodeHolding}
          master={master}
          tanggalPt={tanggalPt}
          namaJenis={namaJenis}
          onClose={() => setFormBuka(false)}
          showToast={showToast}
          onSaved={async () => {
            await reload?.();
            setFormBuka(false);
          }}
        />
      )}
    </div>
  );
}

// Tanggal PT berdiri: sebelum tanggal ini penarikan berlabel Prive, sesudahnya Dividen.
function PengaturanPt({ barisPt, tanggalPt, bisaUbah, reload, showToast }) {
  const [tgl, setTgl] = useState(tanggalPt || "");
  const [saving, setSaving] = useState(false);
  const berubah = tgl !== (tanggalPt || "");

  const simpan = async () => {
    if (saving || !berubah) return;
    setSaving(true);
    try {
      if (!tgl) {
        if (barisPt?.id) await sb(`master_data?id=eq.${barisPt.id}`, { method: "DELETE" });
      } else if (barisPt?.id) {
        await sb(`master_data?id=eq.${barisPt.id}`, { method: "PATCH", body: JSON.stringify({ label: tgl }) });
      } else {
        await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "pengaturan_holding", kode: "tanggal_pt", label: tgl }) });
      }
      showToast?.(tgl ? "Tanggal PT berdiri disimpan" : "Tanggal PT berdiri dikosongkan");
      await reload?.();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/50 mb-4">
      <div className="text-xs text-slate-300 mb-2">Tanggal PT berdiri (opsional)</div>
      <div className="flex flex-wrap items-center gap-2">
        {bisaUbah ? (
          <InputTanggal className={`${inputClass} w-auto`} value={tgl} onChange={setTgl} />
        ) : (
          <div className="text-sm text-slate-200">{tanggalPt ? formatTanggalID(tanggalPt) : "Belum diatur"}</div>
        )}
        {bisaUbah && (
          <button
            onClick={simpan}
            disabled={!berubah || saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        )}
        {bisaUbah && tgl && (
          <button onClick={() => setTgl("")} className="text-[11px] text-slate-500 hover:text-slate-300">
            kosongkan
          </button>
        )}
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5">
        Penarikan sebelum tanggal ini berlabel <b>Prive</b> (usaha perorangan), sesudahnya <b>Dividen</b> (PT). Kosongkan kalau PT belum berdiri.
        Perilakunya sama: tidak mengurangi laba.
      </div>
    </div>
  );
}

function FormPenarikan({ k, kodeHolding, master, tanggalPt, namaJenis, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(hariIniLokal());
  const [penanda, setPenanda] = useState("");
  const [rekening, setRekening] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [kategori, setKategori] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const tipe = penanda ? TIPE_PENARIKAN[penanda] : "";
  const jumlahNum = Number(jumlah) || 0;
  const rekeningHolding = k.rekeningList.filter((r) => k.entDari(r.kode) === kodeHolding).sort(k.urutKas);
  const saldoRek = rekening ? k.saldoMap.get(rekening) ?? 0 : null;
  const saldoKurang = tipe === "keluar" && rekening && jumlahNum > 0 && jumlahNum > (saldoRek ?? 0);
  const butuhKategori = penanda === "gaji_pemilik";
  const kategoriList = master.kategori_keluar || [];
  const valid = tanggal && penanda && rekening && jumlahNum > 0 && !saldoKurang && (!butuhKategori || kategori);

  const labelJenis = (v) => (v === "prive_dividen" ? (tanggalPt ? "Prive / Dividen (otomatis sesuai tanggal PT)" : "Prive") : PENARIKAN_PEMILIK[v]);
  const petunjuk = {
    setoran_modal: "Dana awal / tambahan modal dari pemilik ke Holding. Menambah kas, BUKAN pemasukan, tidak dihitung sebagai laba.",
    prive_dividen: "Bagi hasil / pengambilan pribadi. Tidak mengurangi laba, hanya mengurangi kas.",
    pinjaman_pemilik: "Pinjam sementara, harus dikembalikan. Dicatat sebagai piutang, bukan beban.",
    gaji_pemilik: "Imbalan kerja pemilik. Dihitung sebagai beban dan mengurangi laba.",
    pelunasan_pemilik: "Pemilik mengembalikan pinjaman ke rekening Holding. Bukan pemasukan usaha.",
  };

  const simpan = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const buktiUrl = foto ? await unggahBukti(foto, `pemilik-${rekening}`) : null;
      const nama = namaJenis(penanda, tanggal);
      await sb("keuangan_transaksi", {
        method: "POST",
        body: JSON.stringify({
          tanggal,
          tipe,
          rekening,
          // Gaji pemilik memakai kategori beban pilihan; jenis lain memakai nama jenisnya
          // (supaya terbaca di daftar Transaksi) dan dikecualikan dari laba rugi lewat `penanda`.
          kategori: butuhKategori ? kategori : nama,
          jumlah: jumlahNum,
          penanda,
          keterangan: keterangan.trim() || nama,
          ...(buktiUrl ? { bukti_url: buktiUrl } : {}),
        }),
      });
      showToast?.(`${nama} tercatat`);
      await onSaved();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Catat Modal / Penarikan Pemilik" onClose={onClose}>
      <Field label="Jenis">
        <select className={inputClass} value={penanda} onChange={(e) => setPenanda(e.target.value)}>
          <option value="">Pilih jenis…</option>
          {JENIS.map((v) => (
            <option key={v} value={v}>{labelJenis(v)}</option>
          ))}
        </select>
        {penanda && <div className="text-[11px] text-slate-500 mt-1">{petunjuk[penanda]}</div>}
      </Field>
      <Field label="Tanggal">
        <InputTanggal className={inputClass} value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label={tipe === "masuk" ? "Masuk ke rekening Holding" : "Dari rekening Holding"}>
        <select className={inputClass} value={rekening} onChange={(e) => setRekening(e.target.value)}>
          <option value="">Pilih rekening…</option>
          {rekeningHolding.map((r) => (
            <option key={r.kode} value={r.kode}>
              {r.label} ({LABEL_KAS[k.kasDari(r.kode)]}) — saldo {fmtRp(k.saldoMap.get(r.kode) || 0)}
            </option>
          ))}
        </select>
      </Field>
      {butuhKategori && (
        <Field label="Kategori beban">
          <select className={inputClass} value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">Pilih kategori…</option>
            {kategoriList.map((c) => (
              <option key={c.kode} value={c.kode}>{c.label}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Jumlah (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
      </Field>
      {saldoKurang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo {k.labelRek(rekening)} hanya {fmtRp(saldoRek ?? 0)}, kurang dari {fmtRp(jumlahNum)}.</div>
        </div>
      )}
      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </Field>
      <Field label="Bukti (opsional)">
        <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} className={fileCls} />
      </Field>
      <button
        disabled={!valid || saving}
        onClick={simpan}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
    </ModalShell>
  );
}