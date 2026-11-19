import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Paperclip, RefreshCw, AlertTriangle, Landmark, Wallet, Download, Check } from "lucide-react";
import { Badge, formatTanggalID } from "../../components/ui";
import {
  sb, sbAll, fmtRp, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  lingkupEntitas, setSaldoDasarRekening, resetKeuanganLama, awalRentangKeuanganDefault,
  lokasiDariRekening, saldoSebelumTanggal, LOKASI_TANPA,
  LABEL_KAS, URUTAN_KAS, KAS_BANK, ENTITAS_DEFAULT,
} from "../../lib/api";
import { roleHanyaLihat } from "../../lib/constants";
import { daftarBukti } from "../../lib/bukti";
import { useKeuanganRentang } from "../../lib/useKeuanganRentang";
// Hook & helper tanggal yang sama dengan versi komputer (pages/AlurKas.jsx), supaya hitungan saldo identik.
import { useDataKas, hariIniLokal, awalBulanIni } from "../AlurKas";

// =========================================================
// VERSI HP — KEUANGAN > Kas (file KasHp.jsx)
// Tiga tab, tampilan KARTU (bukan tabel):
//   1. Akun Kas     : daftar rekening + saldo terkini, ubah Jenis (Saldo Bank / Uang Cash) dan Lokasi.
//   2. Buku Kas     : buku besar per jenis kas / per akun, saldo awal, masuk, keluar, saldo berjalan (+ unduh CSV).
//   3. Rekonsiliasi : cocokkan saldo sistem dengan saldo fisik / bank, simpan, catat penyesuaian, lihat riwayat.
// Aturan & hitungan SAMA dengan versi komputer (Keuangan.jsx + AlurKas.jsx): sumber data keuangan_transaksi,
// master_data, rekonsiliasi_kas. Dikunci ke PT akun yang login (lingkupEntitas), sama seperti Keuangan mode "ops".
// Akun read-only tidak bisa mengubah apa pun (pagar sebenarnya ada di sb()).
// =========================================================

const PER_TAMPIL = 40;

const labelDari = (list, kode) => {
  if (!kode) return "";
  const f = (list || []).find((m) => m.kode === kode);
  return f ? f.label : kode;
};

// Master data dengan aturan yang sama seperti KeuanganHp.jsx (kode SKU per PT, profil entitas, toko marketplace).
async function muatMaster() {
  const rows = await sbAll("master_data?select=id,tipe,kode,label,entitas&order=label").catch(() =>
    sbAll("master_data?select=id,tipe,kode,label&order=label")
  );
  const grouped = {};
  masterDataUntukPT(rows || [], entitasBacaSaatIni()).forEach((m) => {
    (grouped[m.tipe] = grouped[m.tipe] || []).push(m);
  });
  daftarkanProfilEntitas(grouped);
  return lingkupTokoMarketplace(grouped, entitasBacaSaatIni());
}

// Transaksi bulan berjalan + saldo dasar (akumulasi semua transaksi SEBELUM bulan ini) — sama dengan App.jsx loadKeuangan().
async function muatTransaksi() {
  const awal = awalRentangKeuanganDefault();
  resetKeuanganLama();
  const rows = await sbAll(`keuangan_transaksi?select=*&tanggal=gte.${awal}&order=tanggal.desc`);
  try {
    const dasar = await sb(`rpc/saldo_rekening_sebelum?p_tanggal=${awal}`);
    const peta = {};
    (dasar || []).forEach((r) => {
      if (r.rekening) peta[r.rekening] = Number(r.saldo) || 0;
    });
    setSaldoDasarRekening(awal, peta);
  } catch (e) {
    console.warn("saldo_rekening_sebelum belum tersedia:", e?.message || e);
  }
  return rows || [];
}

function Memuat({ teks = "Memuat…" }) {
  return (
    <div className="h-48 flex items-center justify-center gap-2 text-sm text-md-on-surface-variant">
      <Loader2 size={18} className="animate-spin" /> {teks}
    </div>
  );
}

function ChipTab({ aktif, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
        aktif ? "bg-md-primary text-md-on-primary border-transparent" : "bg-md-container border-md-outline-variant text-md-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5 text-sm text-md-on-surface outline-none focus:border-md-primary disabled:opacity-40";

function Peringatan({ children }) {
  return <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2">{children}</div>;
}

function KotakAngka({ label, nilai, warna = "text-md-on-surface" }) {
  return (
    <div className="rounded-xl bg-md-container border border-md-outline-variant px-3 py-2">
      <div className="text-[11px] text-md-on-surface-variant">{label}</div>
      <div className={`text-sm font-bold ${warna}`}>{nilai}</div>
    </div>
  );
}

// ---------------------------------------------------------
// 1. AKUN KAS
// ---------------------------------------------------------
function AkunKasHp({ transaksi, master, reload, tampilToast, bacaSaja }) {
  const k = useDataKas(master, transaksi);
  const kasGrupList = master.kas_grup || [];
  const mapLokasiList = master.rekening_lokasi || [];
  const [jenisTab, setJenisTab] = useState("semua");
  const [lokasiFilter, setLokasiFilter] = useState("semua");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(null);

  const semuaBaris = k.rekeningList.map((r) => ({
    ...r,
    kas: k.kasDari(r.kode),
    lokasi: lokasiDariRekening(k.petaLok, k.lokasiList, r.kode),
    saldo: k.saldoMap.get(r.kode) || 0,
  }));
  const total = (kas) => semuaBaris.filter((r) => r.kas === kas).reduce((a, r) => a + r.saldo, 0);
  const baris = semuaBaris
    .filter((r) => jenisTab === "semua" || r.kas === jenisTab)
    .filter((r) => lokasiFilter === "semua" || r.lokasi === lokasiFilter)
    .filter((r) => {
      const s = q.trim().toLowerCase();
      return !s || `${r.kode} ${r.label}`.toLowerCase().includes(s);
    });

  const simpan = async (r, kerja) => {
    if (bacaSaja) {
      tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
      return;
    }
    setSaving(r.id);
    try {
      await kerja();
      await reload();
    } catch (e) {
      tampilToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setSaving(null);
    }
  };
  const ubahJenis = (r, kas) =>
    simpan(r, async () => {
      const ada = kasGrupList.find((x) => x.kode === r.kode);
      if (kas === KAS_BANK) {
        if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: kas }) });
        else await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "kas_grup", kode: r.kode, label: kas }) });
      } else if (ada) {
        await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      }
      tampilToast(`${r.label} → ${LABEL_KAS[kas]}`);
    });
  const ubahLokasi = (r, kodeLokasi) =>
    simpan(r, async () => {
      const ada = mapLokasiList.find((x) => x.kode === r.kode);
      if (kodeLokasi) {
        if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: kodeLokasi }) });
        else await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "rekening_lokasi", kode: r.kode, label: kodeLokasi }) });
      } else if (ada) {
        await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      }
      tampilToast(`${r.label} → ${kodeLokasi ? labelDari(k.lokasiList, kodeLokasi) : "Tanpa lokasi"}`);
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {URUTAN_KAS.map((kas) => (
          <div key={kas} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-md-on-surface-variant mb-1">
              {kas === KAS_BANK ? <Landmark size={12} /> : <Wallet size={12} />} Total {LABEL_KAS[kas]}
            </div>
            <div className={`text-base font-bold ${total(kas) >= 0 ? "text-md-on-surface" : "text-red-400"}`}>{fmtRp(total(kas))}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
        {[{ key: "semua", label: "Semua" }, ...URUTAN_KAS.map((kas) => ({ key: kas, label: LABEL_KAS[kas] }))].map((t) => (
          <ChipTab key={t.key} aktif={jenisTab === t.key} onClick={() => setJenisTab(t.key)}>{t.label}</ChipTab>
        ))}
      </div>

      {k.lokasiList.length > 0 && (
        <select className={inputCls} value={lokasiFilter} onChange={(e) => setLokasiFilter(e.target.value)} aria-label="Filter lokasi">
          <option value="semua">Semua lokasi</option>
          {k.lokasiList.map((l) => (
            <option key={l.kode} value={l.kode}>{l.label}</option>
          ))}
          <option value={LOKASI_TANPA}>Tanpa lokasi</option>
        </select>
      )}
      <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
        <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kode atau nama akun"
          className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant"
        />
      </div>

      {k.lokasiList.length === 0 && (
        <Peringatan>Belum ada lokasi. Tambahkan dulu di Keuangan &gt; Pengaturan &gt; Rekening &amp; Kategori &gt; tab Lokasi (versi komputer), lalu pilih lokasi tiap akun di sini.</Peringatan>
      )}

      <div className="text-[11px] text-md-on-surface-variant">{baris.length} akun</div>
      {baris.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">Tidak ada akun yang cocok.</div>
      ) : (
        <div className="space-y-2">
          {baris.map((r) => (
            <div key={r.id || r.kode} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-md-on-surface break-words">{r.label}</div>
                  <div className="font-mono text-[11px] text-amber-400">{r.kode}</div>
                </div>
                <div className={`text-sm font-bold flex-shrink-0 ${r.saldo < 0 ? "text-red-400" : "text-md-on-surface"}`}>{fmtRp(r.saldo)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <label className="text-[11px] text-md-on-surface-variant">
                  Jenis
                  <select
                    className={`${inputCls} mt-1`}
                    value={r.kas}
                    disabled={saving === r.id || bacaSaja}
                    onChange={(e) => ubahJenis(r, e.target.value)}
                    aria-label={`Jenis ${r.label}`}
                  >
                    {URUTAN_KAS.map((kas) => (
                      <option key={kas} value={kas}>{LABEL_KAS[kas]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-md-on-surface-variant">
                  Lokasi
                  <select
                    className={`${inputCls} mt-1`}
                    value={r.lokasi === LOKASI_TANPA ? "" : r.lokasi}
                    disabled={saving === r.id || bacaSaja || k.lokasiList.length === 0}
                    onChange={(e) => ubahLokasi(r, e.target.value)}
                    aria-label={`Lokasi ${r.label}`}
                  >
                    <option value="">Tanpa lokasi</option>
                    {k.lokasiList.map((l) => (
                      <option key={l.kode} value={l.kode}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 2. BUKU KAS
// ---------------------------------------------------------
function csvCell(val) {
  const s = String(val ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function BukuKasHp({ transaksi, master, tampilToast }) {
  const k = useDataKas(master, transaksi);
  const [pilih, setPilih] = useState(`kas:${KAS_BANK}`);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [q, setQ] = useState("");
  const [tampilBanyak, setTampilBanyak] = useState(PER_TAMPIL);

  const { data: dataRentang, status: statusLama } = useKeuanganRentang(transaksi, dari);
  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];
  const labelKat = (list, kode) => list.find((x) => x.kode === kode)?.label || kode || "";

  const kodeSet = useMemo(() => {
    if (pilih.startsWith("rek:")) return [pilih.slice(4)];
    const kas = pilih.slice(4);
    return k.rekeningList.filter((r) => k.kasDari(r.kode) === kas).map((r) => r.kode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilih, k.rekeningList, master.kas_grup]);
  const modeKas = pilih.startsWith("kas:");

  const { baris, saldoAwal, totalMasuk, totalKeluar, saldoAkhir } = useMemo(() => {
    const inSet = new Set(kodeSet);
    const awal = saldoSebelumTanggal(dataRentang, kodeSet, dari || "0000-01-01");
    const urut = [...dataRentang]
      .filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai))
      .sort(
        (a, b) =>
          ((a.tanggal || "") + (a.created_at || "")).localeCompare((b.tanggal || "") + (b.created_at || "")) ||
          String(a.id).localeCompare(String(b.id))
      );
    let saldo = awal;
    let tm = 0;
    let tk = 0;
    const out = [];
    urut.forEach((t) => {
      const j = Number(t.jumlah) || 0;
      let masuk = 0;
      let keluar = 0;
      let uraian = "";
      let rek = t.rekening;
      if (t.tipe === "masuk" && inSet.has(t.rekening)) {
        masuk = j;
        uraian = labelKat(kategoriMasuk, t.kategori);
      } else if (t.tipe === "keluar" && inSet.has(t.rekening)) {
        keluar = j;
        uraian = labelKat(kategoriKeluar, t.kategori);
      } else if (t.tipe === "transfer") {
        const a = inSet.has(t.rekening);
        const b = inSet.has(t.rekening_tujuan);
        if (a && !b) {
          keluar = j;
          uraian = `Transfer ke ${k.labelRek(t.rekening_tujuan)}`;
        } else if (!a && b) {
          masuk = j;
          rek = t.rekening_tujuan;
          uraian = `Transfer dari ${k.labelRek(t.rekening)}`;
        } else {
          return; // di luar set, atau transfer di dalam set yang sama (saldo set tidak berubah)
        }
      } else {
        return;
      }
      saldo += masuk - keluar;
      tm += masuk;
      tk += keluar;
      out.push({ id: t.id, tanggal: t.tanggal, rek, uraian, keterangan: t.keterangan || "", masuk, keluar, saldo, buktiList: daftarBukti(t) });
    });
    return { baris: out, saldoAwal: awal, totalMasuk: tm, totalKeluar: tk, saldoAkhir: saldo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRentang, kodeSet, dari, sampai, master.rekening, master.kategori_masuk, master.kategori_keluar]);

  const tampil = baris.filter((r) => {
    const s = q.trim().toLowerCase();
    return !s || `${r.uraian} ${r.keterangan} ${k.labelRek(r.rek)}`.toLowerCase().includes(s);
  });
  // Di HP mutasi terbaru ditampilkan paling atas; saldo berjalan tiap baris tetap dihitung urut dari yang terlama.
  const terbaruDulu = useMemo(() => [...tampil].reverse(), [tampil]);

  useEffect(() => setTampilBanyak(PER_TAMPIL), [pilih, dari, sampai, q]);

  const namaPilihan = modeKas ? `Semua ${LABEL_KAS[pilih.slice(4)]}` : k.labelRek(pilih.slice(4));

  const unduhCsv = () => {
    const lines = [["Tanggal", "Akun", "Uraian", "Keterangan", "Masuk", "Keluar", "Saldo"].map(csvCell).join(";")];
    lines.push(["", "", "Saldo awal", "", "", "", saldoAwal].map(csvCell).join(";"));
    tampil.forEach((r) =>
      lines.push([r.tanggal, k.labelRek(r.rek), r.uraian, r.keterangan, r.masuk || "", r.keluar || "", r.saldo].map(csvCell).join(";"))
    );
    lines.push("");
    lines.push([csvCell("Total Masuk"), csvCell(totalMasuk)].join(";"));
    lines.push([csvCell("Total Keluar"), csvCell(totalKeluar)].join(";"));
    lines.push([csvCell("Saldo Akhir"), csvCell(saldoAkhir)].join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-kas_${namaPilihan.replace(/\s+/g, "-")}_${dari || "awal"}_sd_${sampai || "sekarang"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    tampilToast("Buku kas diunduh");
  };

  const periodeCepat = (d, s) => {
    setDari(d);
    setSampai(s);
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const awalBlnLalu = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const akhirBlnLalu = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 0));

  return (
    <div className="space-y-3">
      <select value={pilih} onChange={(e) => setPilih(e.target.value)} className={inputCls} aria-label="Pilih kas atau akun">
        <optgroup label="Per jenis kas">
          {URUTAN_KAS.map((kk) => (
            <option key={kk} value={`kas:${kk}`}>Semua {LABEL_KAS[kk]}</option>
          ))}
        </optgroup>
        {URUTAN_KAS.map((kk) => {
          const items = k.rekeningList.filter((r) => k.kasDari(r.kode) === kk);
          if (!items.length) return null;
          return (
            <optgroup key={kk} label={`Akun ${LABEL_KAS[kk]}`}>
              {items.map((r) => (
                <option key={r.kode} value={`rek:${r.kode}`}>
                  {r.label}
                  {k.lokasiNama(r.kode) ? ` · ${k.lokasiNama(r.kode)}` : ""}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
        <ChipTab aktif={dari === awalBulanIni() && sampai === hariIniLokal()} onClick={() => periodeCepat(awalBulanIni(), hariIniLokal())}>Bulan ini</ChipTab>
        <ChipTab aktif={dari === awalBlnLalu && sampai === akhirBlnLalu} onClick={() => periodeCepat(awalBlnLalu, akhirBlnLalu)}>Bulan lalu</ChipTab>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-md-on-surface-variant">
          Dari
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-[11px] text-md-on-surface-variant">
          Sampai
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-md-container border border-md-outline-variant px-3 py-2.5">
        <Search size={14} className="text-md-on-surface-variant flex-shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari uraian atau keterangan…"
          className="bg-transparent outline-none text-sm flex-1 min-w-0 text-md-on-surface placeholder:text-md-on-surface-variant"
        />
      </div>

      {statusLama && <Peringatan>{statusLama}</Peringatan>}

      <div className="grid grid-cols-2 gap-2">
        <KotakAngka label="Saldo Awal" nilai={fmtRp(saldoAwal)} />
        <KotakAngka label="Saldo Akhir" nilai={fmtRp(saldoAkhir)} warna={saldoAkhir >= 0 ? "text-md-on-surface" : "text-red-400"} />
        <KotakAngka label="Total Masuk" nilai={fmtRp(totalMasuk)} warna="text-emerald-400" />
        <KotakAngka label="Total Keluar" nilai={fmtRp(totalKeluar)} warna="text-red-400" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-md-on-surface-variant">{tampil.length} mutasi · transfer di dalam satu kas tidak ditampilkan</div>
        <button
          onClick={unduhCsv}
          disabled={baris.length === 0}
          className="flex items-center gap-1.5 border border-md-outline-variant disabled:opacity-40 text-md-on-surface text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      {terbaruDulu.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">Tidak ada mutasi pada rentang ini.</div>
      ) : (
        <div className="space-y-2">
          {terbaruDulu.slice(0, tampilBanyak).map((r) => (
            <div key={r.id} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-md-on-surface break-words">{r.uraian}</div>
                  <div className="text-[11px] text-md-on-surface-variant mt-0.5">
                    {formatTanggalID(r.tanggal)}
                    {modeKas ? ` · ${k.labelRek(r.rek)}` : ""}
                  </div>
                  {r.keterangan && <div className="text-[11px] text-md-on-surface-variant mt-0.5 break-words">{r.keterangan}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-bold ${r.masuk ? "text-emerald-400" : "text-red-400"}`}>
                    {r.masuk ? `+${fmtRp(r.masuk)}` : `-${fmtRp(r.keluar)}`}
                  </div>
                  <div className={`text-[11px] ${r.saldo < 0 ? "text-red-400" : "text-md-on-surface-variant"}`}>Saldo {fmtRp(r.saldo)}</div>
                </div>
              </div>
              {r.buktiList.length > 0 && (
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  {r.buktiList.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center rounded-full text-emerald-400" title={`Bukti ${i + 1}`}>
                      <Paperclip size={15} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {terbaruDulu.length > tampilBanyak && (
            <button onClick={() => setTampilBanyak((n) => n + PER_TAMPIL)} className="w-full py-3 rounded-xl border border-md-outline-variant text-xs font-semibold text-md-primary">
              Tampilkan lebih banyak ({terbaruDulu.length - tampilBanyak} lagi)
            </button>
          )}
        </div>
      )}
      {q.trim() && baris.length !== tampil.length && (
        <div className="text-[11px] text-md-on-surface-variant">Menampilkan {tampil.length} dari {baris.length} mutasi. Saldo berjalan tetap dihitung dari seluruh mutasi.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 3. REKONSILIASI KAS
// ---------------------------------------------------------
function InputSaldoFisik({ value, onChange, disabled }) {
  const tampil = value === "" || value == null ? "" : Number(value).toLocaleString("id-ID");
  return (
    <input
      type="text"
      inputMode="numeric"
      value={tampil}
      disabled={disabled}
      placeholder="Isi saldo fisik / bank"
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "");
        onChange(d === "" ? "" : Number(d));
      }}
      className={`${inputCls} text-right`}
    />
  );
}

function RekonsiliasiHp({ transaksi, master, reload, tampilToast, session, bacaSaja }) {
  const k = useDataKas(master, transaksi);
  const [riwayat, setRiwayat] = useState(null);
  const [errRiwayat, setErrRiwayat] = useState("");
  const [jenisTab, setJenisTab] = useState("semua");
  const [fisik, setFisik] = useState({});
  const [catatan, setCatatan] = useState({});
  const [sesuaikan, setSesuaikan] = useState({});
  const [katMasuk, setKatMasuk] = useState("");
  const [katKeluar, setKatKeluar] = useState("");
  const [saving, setSaving] = useState(false);

  const kategoriMasuk = master.kategori_masuk || [];
  const kategoriKeluar = master.kategori_keluar || [];

  const muatRiwayat = useCallback(async () => {
    try {
      const rows = await sb("rekonsiliasi_kas?select=*&order=tanggal.desc,created_at.desc&limit=300");
      setRiwayat(rows || []);
      setErrRiwayat("");
    } catch (e) {
      setErrRiwayat(e?.message || "Gagal memuat riwayat rekonsiliasi");
      setRiwayat([]);
    }
  }, []);
  useEffect(() => {
    muatRiwayat();
  }, [muatRiwayat]);

  // Tebakan awal kategori penyesuaian: yang namanya mengandung "selisih"/"penyesuaian".
  useEffect(() => {
    const cari = (list) => list.find((x) => /selisih|penyesuaian/i.test(x.label || ""))?.kode || "";
    setKatMasuk((v) => v || cari(kategoriMasuk));
    setKatKeluar((v) => v || cari(kategoriKeluar));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.kategori_masuk, master.kategori_keluar]);

  const terakhir = useMemo(() => {
    const m = {};
    (riwayat || []).forEach((r) => {
      if (!m[r.rekening]) m[r.rekening] = r; // riwayat sudah terurut terbaru dulu
    });
    return m;
  }, [riwayat]);

  const baris = k.rekeningList
    .filter((r) => jenisTab === "semua" || k.kasDari(r.kode) === jenisTab)
    .sort(k.urutKas)
    .map((r) => {
      const sistem = Math.round((k.saldoMap.get(r.kode) || 0) * 100) / 100;
      const terisi = fisik[r.kode] !== undefined && fisik[r.kode] !== "";
      const selisih = terisi ? Math.round((Number(fisik[r.kode]) - sistem) * 100) / 100 : null;
      return { ...r, kas: k.kasDari(r.kode), sistem, terisi, selisih };
    });

  const terisiSemua = baris.filter((r) => r.terisi);
  const adaSelisih = terisiSemua.filter((r) => r.selisih !== 0);
  const jumlahPenyesuaian = adaSelisih.filter((r) => sesuaikan[r.kode]).length;

  const simpan = async () => {
    if (bacaSaja) {
      tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
      return;
    }
    if (!terisiSemua.length) {
      tampilToast("Isi saldo fisik minimal satu akun dulu", "err");
      return;
    }
    for (const r of adaSelisih) {
      if (sesuaikan[r.kode] && !(r.selisih > 0 ? katMasuk : katKeluar)) {
        tampilToast(`Pilih kategori ${r.selisih > 0 ? "pemasukan" : "pengeluaran"} untuk penyesuaian dulu`, "err");
        return;
      }
    }
    if (jumlahPenyesuaian > 0 && !window.confirm(`Akan mencatat ${jumlahPenyesuaian} transaksi penyesuaian ke Keuangan agar saldo sistem sama dengan saldo fisik. Lanjut?`)) {
      return;
    }
    setSaving(true);
    const tanggal = hariIniLokal();
    const selesai = [];
    try {
      for (const r of terisiSemua) {
        const cat = (catatan[r.kode] || "").trim();
        let penyesuaianId = null;
        if (r.selisih !== 0 && sesuaikan[r.kode]) {
          const res = await sb("keuangan_transaksi", {
            method: "POST",
            body: JSON.stringify({
              tanggal,
              tipe: r.selisih > 0 ? "masuk" : "keluar",
              rekening: r.kode,
              kategori: r.selisih > 0 ? katMasuk : katKeluar,
              jumlah: Math.abs(r.selisih),
              keterangan: `Penyesuaian rekonsiliasi kas${cat ? ` — ${cat}` : ""}`,
            }),
          });
          penyesuaianId = res?.[0]?.id ?? null;
        }
        await sb("rekonsiliasi_kas", {
          method: "POST",
          body: JSON.stringify({
            tanggal,
            rekening: r.kode,
            saldo_sistem: r.sistem,
            saldo_fisik: Number(fisik[r.kode]),
            selisih: r.selisih,
            status: r.selisih === 0 ? "sesuai" : penyesuaianId ? "disesuaikan" : "selisih",
            catatan: cat || null,
            penyesuaian_id: penyesuaianId,
            dicatat_oleh: session?.username || null,
          }),
        });
        selesai.push(r.kode);
      }
      tampilToast(`${selesai.length} akun direkonsiliasi${jumlahPenyesuaian ? `, ${jumlahPenyesuaian} penyesuaian dicatat` : ""}`);
    } catch (e) {
      tampilToast(`${e.message || "Gagal menyimpan"}${selesai.length ? ` (${selesai.length} akun sebelumnya sudah tersimpan)` : ""}`, "err");
    } finally {
      const bersih = (obj) => {
        const n = { ...obj };
        selesai.forEach((kode) => delete n[kode]);
        return n;
      };
      setFisik(bersih);
      setCatatan(bersih);
      setSesuaikan(bersih);
      await Promise.all([muatRiwayat(), reload?.()]);
      setSaving(false);
    }
  };

  const status = (r) => {
    if (!r.terisi) return null;
    if (r.selisih === 0) return <Badge color="emerald">Sesuai</Badge>;
    return <Badge color="amber">{r.selisih > 0 ? "Lebih" : "Kurang"} {fmtRp(Math.abs(r.selisih))}</Badge>;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-md-on-surface-variant">
        Cocokkan saldo di aplikasi dengan uang fisik (Uang Cash) atau mutasi rekening (Saldo Bank). Isi saldo fisik tiap akun yang dicek, lalu simpan sekaligus. Selisih bisa langsung dicatat sebagai transaksi penyesuaian.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 flex-1">
          {[{ key: "semua", label: "Semua" }, ...URUTAN_KAS.map((kk) => ({ key: kk, label: LABEL_KAS[kk] }))].map((tb) => (
            <ChipTab key={tb.key} aktif={jenisTab === tb.key} onClick={() => setJenisTab(tb.key)}>{tb.label}</ChipTab>
          ))}
        </div>
        <button
          onClick={() => {
            muatRiwayat();
            reload?.();
          }}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-md-on-surface-variant active:bg-md-container-high"
          title="Muat ulang saldo & riwayat"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {errRiwayat && <Peringatan>Riwayat rekonsiliasi belum bisa dimuat ({errRiwayat}). Pastikan fase3_alur_kas.sql sudah dijalankan di database.</Peringatan>}

      {baris.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">Belum ada akun kas.</div>
      ) : (
        <div className="space-y-2">
          {baris.map((r) => {
            const t = terakhir[r.kode];
            return (
              <div key={r.kode} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-md-on-surface break-words">{r.label}</div>
                    <div className="text-[11px] text-md-on-surface-variant">
                      <span className="font-mono text-amber-400">{r.kode}</span> · {LABEL_KAS[r.kas]}
                      {k.lokasiNama(r.kode) ? ` · ${k.lokasiNama(r.kode)}` : ""}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-md-on-surface-variant">Saldo sistem</div>
                    <div className={`text-sm font-bold ${r.sistem < 0 ? "text-red-400" : "text-md-on-surface"}`}>{fmtRp(r.sistem)}</div>
                  </div>
                </div>

                <div className="mt-2.5">
                  <InputSaldoFisik value={fisik[r.kode] ?? ""} disabled={bacaSaja} onChange={(v) => setFisik((p) => ({ ...p, [r.kode]: v }))} />
                </div>

                {r.terisi && (
                  <div className="mt-2 space-y-2">
                    <div>{status(r)}</div>
                    {r.selisih !== 0 && (
                      <>
                        <input
                          value={catatan[r.kode] || ""}
                          onChange={(e) => setCatatan((p) => ({ ...p, [r.kode]: e.target.value }))}
                          placeholder="Catatan penyebab (opsional)"
                          className={inputCls}
                        />
                        <label className="flex items-center gap-2 text-xs text-md-on-surface-variant">
                          <input
                            type="checkbox"
                            checked={!!sesuaikan[r.kode]}
                            onChange={(e) => setSesuaikan((p) => ({ ...p, [r.kode]: e.target.checked }))}
                          />
                          Catat penyesuaian {r.selisih > 0 ? "(+)" : "(−)"} {fmtRp(Math.abs(r.selisih))}
                        </label>
                      </>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-md-on-surface-variant mt-2">
                  {t ? (
                    <>
                      Terakhir dicek {formatTanggalID(t.tanggal)} ·{" "}
                      <span className={Number(t.selisih) === 0 ? "text-emerald-500" : "text-amber-500"}>
                        {Number(t.selisih) === 0 ? "Sesuai" : `Selisih ${fmtRp(t.selisih)}`}
                      </span>
                    </>
                  ) : (
                    "Belum pernah dicek"
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {jumlahPenyesuaian > 0 && (
        <div className="rounded-2xl border border-md-outline-variant bg-md-container p-3 space-y-3">
          <div className="text-xs text-md-on-surface">Kategori untuk transaksi penyesuaian (dipakai semua akun yang dicentang)</div>
          <label className="block text-[11px] text-md-on-surface-variant">
            Kalau uang fisik LEBIH banyak (pemasukan)
            <select className={`${inputCls} mt-1`} value={katMasuk} onChange={(e) => setKatMasuk(e.target.value)}>
              <option value="">Pilih kategori pemasukan…</option>
              {kategoriMasuk.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-md-on-surface-variant">
            Kalau uang fisik KURANG (pengeluaran)
            <select className={`${inputCls} mt-1`} value={katKeluar} onChange={(e) => setKatKeluar(e.target.value)}>
              <option value="">Pilih kategori pengeluaran…</option>
              {kategoriKeluar.map((x) => <option key={x.kode} value={x.kode}>{x.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {!bacaSaja && (
        <div className="sticky bottom-3 z-20">
          <button
            onClick={simpan}
            disabled={saving || terisiSemua.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-md-primary text-md-on-primary disabled:opacity-40 text-sm font-semibold px-4 py-3.5 rounded-2xl shadow-lg active:scale-[0.99] transition"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? "Menyimpan…" : `Simpan Rekonsiliasi${terisiSemua.length ? ` (${terisiSemua.length})` : ""}`}
          </button>
        </div>
      )}

      <div className="text-sm font-semibold text-md-on-surface pt-2">Riwayat Rekonsiliasi</div>
      {riwayat === null ? (
        <div className="text-xs text-md-on-surface-variant">Memuat…</div>
      ) : riwayat.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-md-outline-variant p-6 text-center text-sm text-md-on-surface-variant">Belum ada rekonsiliasi yang tersimpan.</div>
      ) : (
        <div className="space-y-2">
          {riwayat.slice(0, 60).map((r) => (
            <div key={r.id} className="rounded-2xl bg-md-container border border-md-outline-variant p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-md-on-surface break-words">{k.labelRek(r.rekening)}</div>
                  <div className="text-[11px] text-md-on-surface-variant">
                    {formatTanggalID(r.tanggal)}
                    {r.dicatat_oleh ? ` · ${r.dicatat_oleh}` : ""}
                  </div>
                </div>
                <Badge color={r.status === "sesuai" ? "emerald" : r.status === "disesuaikan" ? "sky" : "amber"}>
                  {r.status === "sesuai" ? "Sesuai" : r.status === "disesuaikan" ? "Disesuaikan" : "Selisih"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                <div>
                  <div className="text-md-on-surface-variant">Sistem</div>
                  <div className="font-semibold text-md-on-surface">{fmtRp(r.saldo_sistem)}</div>
                </div>
                <div>
                  <div className="text-md-on-surface-variant">Fisik</div>
                  <div className="font-semibold text-md-on-surface">{fmtRp(r.saldo_fisik)}</div>
                </div>
                <div>
                  <div className="text-md-on-surface-variant">Selisih</div>
                  <div className={`font-semibold ${Number(r.selisih) === 0 ? "text-emerald-400" : "text-amber-400"}`}>{fmtRp(r.selisih)}</div>
                </div>
              </div>
              {r.catatan && <div className="text-[11px] text-md-on-surface-variant mt-1.5 break-words">{r.catatan}</div>}
            </div>
          ))}
          {riwayat.length > 60 && <div className="text-[11px] text-md-on-surface-variant">Menampilkan 60 rekonsiliasi terbaru dari {riwayat.length}.</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// HALAMAN
// ---------------------------------------------------------
export default function KasHp({ session, entitas, bacaSajaPaksa }) {
  // Menu Keuangan Pusat / Keuangan Perusahaan (GrupHp.jsx) mengunci layar ini ke PT lain lewat `entitas` dan mengatur read-only lewat `bacaSajaPaksa`.
  const kodeAktif = entitas || session?.entitas || ENTITAS_DEFAULT;
  const bacaSaja = bacaSajaPaksa ?? roleHanyaLihat(session?.role);

  const [master, setMaster] = useState({});
  const [trx, setTrx] = useState([]);
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);
  const [tab, setTab] = useState("akun"); // akun | buku | rekonsiliasi

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  // Komponen keuangan membaca PT aktif dari sini — sama seperti Keuangan.jsx desktop.
  useEffect(() => {
    try {
      sessionStorage.setItem("selma-entitas", kodeAktif);
    } catch {
      /* abaikan */
    }
  }, [kodeAktif]);

  const muat = useCallback(async () => {
    setErr("");
    try {
      const [m, t] = await Promise.all([muatMaster(), muatTransaksi()]);
      setMaster(m);
      setTrx(t);
    } catch (e) {
      setErr(e.message || "Gagal memuat data keuangan");
    } finally {
      setSiap(true);
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  const lingkup = useMemo(
    () => lingkupEntitas(trx, master, kodeAktif),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trx, master.rekening, master.rekening_entitas, master.entitas, kodeAktif]
  );

  if (!siap) return <Memuat />;
  if (err && !trx.length && !Object.keys(master).length) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="min-w-0 break-words">{err}</div>
          </div>
          <button onClick={() => { setSiap(false); muat(); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-28">
      <div className="p-4 space-y-4">
        {err && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs px-3 py-2 flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{err}</span>
            <button onClick={muat} className="underline font-semibold flex-shrink-0">Muat ulang</button>
          </div>
        )}
        {bacaSaja && (
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs px-3 py-2">
            Mode lihat saja — akun ini tidak bisa menambah atau mengubah data.
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          <ChipTab aktif={tab === "akun"} onClick={() => setTab("akun")}>Akun Kas</ChipTab>
          <ChipTab aktif={tab === "buku"} onClick={() => setTab("buku")}>Buku Kas</ChipTab>
          <ChipTab aktif={tab === "rekonsiliasi"} onClick={() => setTab("rekonsiliasi")}>Rekonsiliasi</ChipTab>
        </div>

        {tab === "akun" && <AkunKasHp transaksi={lingkup.transaksi} master={lingkup.master} reload={muat} tampilToast={tampilToast} bacaSaja={bacaSaja} />}
        {tab === "buku" && <BukuKasHp transaksi={lingkup.transaksi} master={lingkup.master} tampilToast={tampilToast} />}
        {tab === "rekonsiliasi" && (
          <RekonsiliasiHp transaksi={lingkup.transaksi} master={lingkup.master} reload={muat} tampilToast={tampilToast} session={session} bacaSaja={bacaSaja} />
        )}
      </div>

      {toast && (
        <div
          className={`fixed left-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-200 text-emerald-950" : toast.kind === "warn" ? "bg-md-primary text-md-on-primary" : "bg-md-error-container text-md-on-error-container"
          }`}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
