import { useState, useMemo } from "react";
import { Plus, ArrowRightLeft, Landmark, Paperclip, AlertTriangle, Pencil, Trash2, TrendingUp, TrendingDown, Building2 } from "lucide-react";
import { PageHeader, StatCard, EmptyState, inputClass, Badge, InputTanggal, formatTanggalID, ModalShell, Field, InputRupiah } from "../components/ui";
import { sb, fmtRp, LABEL_KAS, KAS_KECIL, KAS_BANK, URUTAN_KAS, PENANDA_ANTAR_ENTITAS, kodeEntitasHolding } from "../lib/api";
import { bolehTransferAntarEntitas, bisaTransferAntarEntitas } from "../lib/constants";
import { useKeuanganRentang } from "../lib/useKeuanganRentang";
import { useDataKas, hariIniLokal, awalBulanIni, unggahBukti, fileCls } from "./AlurKas";

// =========================================================
// FASE 4 — HOLDING
//   Antar Entitas : transfer uang antar perusahaan (modal, dividen, pinjaman,
//                   pelunasan pinjaman), plus posisi pinjaman yang belum lunas.
//   Konsolidasi   : ringkasan tiap entitas + gabungan, HANYA BACA.
// Entitas & pemetaan rekening: lihat ENTITAS di lib/api.js. Transfer antar
// rekening beda entitas bukan pemasukan/pengeluaran — jadi otomatis "terhapus"
// (eliminasi) saat digabung di Konsolidasi.
// =========================================================

const WARNA_PENANDA = { modal: "sky", dividen: "emerald", pinjaman: "amber", pelunasan_pinjaman: "amber" };
const nilai = (t) => Number(t.jumlah) || 0;

// Transfer yang melintasi dua entitas -> { asal, tujuan } (kode entitas), selain itu null.
function lintasEntitas(t, k) {
  if (t.tipe !== "transfer") return null;
  const asal = k.entDari(t.rekening);
  const tujuan = k.entDari(t.rekening_tujuan);
  return asal === tujuan ? null : { asal, tujuan };
}

// Posisi pinjaman antar-entitas per entitas (+ piutang, - utang), dari SELURUH riwayat.
function posisiPinjaman(semua, k) {
  const hasil = {};
  k.entitasList.forEach((e) => {
    hasil[e.kode] = 0;
  });
  semua.forEach((t) => {
    const x = lintasEntitas(t, k);
    if (!x) return;
    const j = nilai(t);
    if (t.penanda === "pinjaman") {
      hasil[x.asal] = (hasil[x.asal] || 0) + j; // pemberi pinjaman: piutang naik
      hasil[x.tujuan] = (hasil[x.tujuan] || 0) - j; // penerima: utang naik
    } else if (t.penanda === "pelunasan_pinjaman") {
      hasil[x.asal] = (hasil[x.asal] || 0) + j; // yang melunasi: utang turun
      hasil[x.tujuan] = (hasil[x.tujuan] || 0) - j; // yang dilunasi: piutang turun
    }
  });
  return hasil;
}

const PesanSetup = () => (
  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs px-4 py-3">
    Entitas belum diatur. Jalankan <span className="font-mono">fase4_holding.sql</span> di database, lalu muat ulang halaman.
  </div>
);

// =========================================================
// RINGKASAN GRUP — halaman awal menu Holding.
// Kartu per perusahaan (saldo kas, pemasukan, pengeluaran, laba bulan ini),
// kartu gabungan, dan tren laba 6 bulan terakhir. HANYA BACA.
// Transfer antar rekening (termasuk antar entitas) tidak dihitung sebagai
// pemasukan/pengeluaran, jadi tidak ada hitung ganda di angka gabungan.
// =========================================================
const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const labelBulan = (ym) => {
  const [y, m] = ym.split("-");
  return `${NAMA_BULAN[Number(m) - 1]} ${y}`;
};

export function RingkasanGrup({ keuanganTransaksi = [], master = {}, onBuka }) {
  const k = useDataKas(master, keuanganTransaksi);
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");
  const ents = k.entitasList;
  const bulanIni = hariIniLokal().slice(0, 7);

  const data = useMemo(() => {
    const daftarBulan = [];
    let [y, m] = bulanIni.split("-").map(Number);
    for (let i = 0; i < 6; i++) {
      daftarBulan.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    const perEnt = {};
    ents.forEach((e) => {
      perEnt[e.kode] = { kas: 0, bulan: Object.fromEntries(daftarBulan.map((b) => [b, { masuk: 0, keluar: 0 }])) };
    });
    k.rekeningList.forEach((r) => {
      const e = perEnt[k.entDari(r.kode)];
      if (e) e.kas += k.saldoMap.get(r.kode) || 0;
    });
    semua.forEach((t) => {
      if (t.tipe !== "masuk" && t.tipe !== "keluar") return;
      const e = perEnt[k.entDari(t.rekening)];
      const b = e && e.bulan[(t.tanggal || "").slice(0, 7)];
      if (b) b[t.tipe] += nilai(t);
    });
    return { perEnt, daftarBulan };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semua, master.rekening, master.rekening_entitas, master.entitas, master.kas_grup, keuanganTransaksi]);

  if (ents.length < 2) return <PesanSetup />;

  const ringkas = (kode) => {
    const e = data.perEnt[kode];
    const b = e.bulan[bulanIni] || { masuk: 0, keluar: 0 };
    return { kas: e.kas, masuk: b.masuk, keluar: b.keluar, laba: b.masuk - b.keluar };
  };
  const semuaRingkas = ents.map((e) => ({ e, r: ringkas(e.kode) }));
  const gab = semuaRingkas.reduce(
    (a, { r }) => ({ kas: a.kas + r.kas, masuk: a.masuk + r.masuk, keluar: a.keluar + r.keluar, laba: a.laba + r.laba }),
    { kas: 0, masuk: 0, keluar: 0, laba: 0 }
  );
  const lababulan = (kode, b) => {
    const x = data.perEnt[kode].bulan[b];
    return x.masuk - x.keluar;
  };
  const warna = (v) => (v < 0 ? "text-red-400" : "text-slate-100");

  const Kartu = ({ judul, r, onClick, sorot }) => (
    <div className={`rounded-xl border p-4 ${sorot ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900"}`}>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={14} className={sorot ? "text-amber-400" : "text-slate-500"} />
        <div className="text-sm font-semibold text-slate-100 truncate">{judul}</div>
      </div>
      <div className="text-[11px] text-slate-500">Total kas saat ini</div>
      <div className={`text-xl font-semibold mb-3 ${warna(r.kas)}`}>{fmtRp(r.kas)}</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] text-slate-500">Pemasukan</div>
          <div className="text-emerald-400 font-medium">{fmtRp(r.masuk)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">Pengeluaran</div>
          <div className="text-red-400 font-medium">{fmtRp(r.keluar)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">Laba (rugi)</div>
          <div className={`font-medium ${warna(r.laba)}`}>{fmtRp(r.laba)}</div>
        </div>
      </div>
      {onClick && (
        <button onClick={onClick} className="mt-3 text-[11px] text-amber-400 hover:text-amber-300">
          Lihat keuangan {judul} →
        </button>
      )}
    </div>
  );

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Ringkasan Grup"
        description={`Keuangan seluruh perusahaan dalam grup — bulan ${labelBulan(bulanIni)}, hanya untuk dilihat.`}
        sticky
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        <Kartu judul="Gabungan grup" r={gab} sorot />
        {semuaRingkas.map(({ e, r }) => (
          <Kartu key={e.kode} judul={e.label} r={r} onClick={onBuka ? () => onBuka(e.kode) : null} />
        ))}
      </div>

      <div className="text-sm font-semibold text-slate-200 mb-2">Laba (rugi) 6 bulan terakhir</div>
      <div className="rounded-xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2.5 font-medium">Bulan</th>
              {ents.map((e) => (
                <th key={e.kode} className="px-2 py-2.5 font-medium text-right">{e.label}</th>
              ))}
              <th className="px-4 py-2.5 font-medium text-right text-amber-400">Gabungan</th>
            </tr>
          </thead>
          <tbody>
            {[...data.daftarBulan].reverse().map((b) => {
              const total = ents.reduce((a, e) => a + lababulan(e.kode, b), 0);
              return (
                <tr key={b} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2 text-slate-300">{labelBulan(b)}</td>
                  {ents.map((e) => {
                    const v = lababulan(e.kode, b);
                    return (
                      <td key={e.kode} className={`px-2 py-2 text-right whitespace-nowrap ${v < 0 ? "text-red-400" : ""}`}>{fmtRp(v)}</td>
                    );
                  })}
                  <td className={`px-4 py-2 text-right whitespace-nowrap font-semibold ${total < 0 ? "text-red-400" : ""}`}>{fmtRp(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        Laba di sini = pemasukan − pengeluaran tercatat di Keuangan tiap perusahaan. Perpindahan uang antar perusahaan (modal, dividen, pinjaman) tidak dihitung. Lihat tab Konsolidasi untuk rinciannya.
      </div>
    </div>
  );
}

// =========================================================
// ANTAR ENTITAS
// =========================================================
export function AntarEntitas({ keuanganTransaksi = [], master = {}, reload, showToast, setModal, role }) {
  const k = useDataKas(master, keuanganTransaksi);
  // Hak per arah transfer (lihat ARAH_ANTAR_ENTITAS di lib/constants.js):
  // Pemilik = Holding -> perusahaan, Super Admin = perusahaan -> Holding, Super Appa = keduanya.
  const kodeHolding = kodeEntitasHolding(k.entitasList);
  const bisaTambah = bisaTransferAntarEntitas(role);
  const bolehKelola = (t) => {
    const x = lintasEntitas(t, k);
    return !!x && bolehTransferAntarEntitas(role, x.asal, x.tujuan, kodeHolding);
  };
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const [filterPenanda, setFilterPenanda] = useState("semua");
  const [formBuka, setFormBuka] = useState(false);
  const [menyimpanId, setMenyimpanId] = useState(null);

  // Seluruh riwayat dimuat (posisi pinjaman = akumulasi dari awal).
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");

  const daftar = useMemo(
    () =>
      semua
        .filter((t) => lintasEntitas(t, k))
        .filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai))
        .filter((t) => filterPenanda === "semua" || (filterPenanda === "kosong" ? !t.penanda : t.penanda === filterPenanda))
        .sort((a, b) => ((b.tanggal || "") + (b.created_at || "")).localeCompare((a.tanggal || "") + (a.created_at || ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semua, dari, sampai, filterPenanda, master.rekening_entitas, master.entitas]
  );
  const total = (p) => daftar.filter((t) => t.penanda === p).reduce((a, t) => a + nilai(t), 0);
  const belumDitandai = daftar.filter((t) => !t.penanda).length;
  const posisi = useMemo(() => posisiPinjaman(semua, k), [semua, master.rekening_entitas, master.entitas]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPenanda = async (t, penanda) => {
    setMenyimpanId(t.id);
    try {
      await sb(`keuangan_transaksi?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ penanda: penanda || null }) });
      await reload?.();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan penanda", "err");
    } finally {
      setMenyimpanId(null);
    }
  };

  if (k.entitasList.length < 2) return <PesanSetup />;

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Antar Entitas"
        description="Uang yang pindah antar perusahaan (mis. SELMA ↔ Holding): modal, dividen, pinjaman, dan pelunasannya. Bukan pemasukan/pengeluaran, jadi tidak masuk laba rugi masing-masing."
        sticky
        action={
          bisaTambah ? (
            <button
              onClick={() => setFormBuka(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Plus size={14} /> Transfer Antar Entitas
            </button>
          ) : null
        }
      />
      {role === "owner" && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-sky-300 bg-sky-500/5 border border-sky-500/20">
          Anda hanya bisa mencatat transfer <b>dari Holding ke perusahaan</b> (mis. modal, pinjaman). Transfer dari perusahaan ke Holding dicatat oleh Admin.
        </div>
      )}
      {role === "superadmin" && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs text-sky-300 bg-sky-500/5 border border-sky-500/20">
          Anda hanya bisa mencatat transfer <b>dari perusahaan ke Holding</b> (mis. dividen, pelunasan pinjaman). Transfer dari Holding ke perusahaan dicatat oleh Pemilik.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Modal (periode)" value={fmtRp(total("modal"))} accent="text-sky-400" icon={Building2} iconColor="text-sky-500" />
        <StatCard label="Dividen (periode)" value={fmtRp(total("dividen"))} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Pinjaman (periode)" value={fmtRp(total("pinjaman"))} accent="text-amber-400" icon={TrendingDown} iconColor="text-amber-500" />
        <StatCard label="Belum ditandai" value={`${belumDitandai} transaksi`} accent={belumDitandai ? "text-amber-400" : "text-slate-100"} icon={Paperclip} iconColor="text-slate-400" />
      </div>

      <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/50 mb-4">
        <div className="text-xs text-slate-300 mb-2">Posisi pinjaman antar entitas (dari awal, belum lunas)</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {k.entitasList.map((e) => {
            const p = posisi[e.kode] || 0;
            return (
              <div key={e.kode} className="text-sm">
                <span className="text-slate-400">{e.label}: </span>
                <span className={`font-semibold ${p > 0 ? "text-emerald-400" : p < 0 ? "text-red-400" : "text-slate-100"}`}>
                  {p === 0 ? "Lunas / tidak ada" : p > 0 ? `Piutang ${fmtRp(p)}` : `Utang ${fmtRp(-p)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
          <span className="text-slate-500 text-xs">s/d</span>
          <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
        </div>
        <select value={filterPenanda} onChange={(e) => setFilterPenanda(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="semua">Semua Penanda</option>
          {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          <option value="kosong">Belum ditandai</option>
        </select>
      </div>

      {daftar.length === 0 ? (
        <EmptyState label="Belum ada transfer antar entitas di rentang ini." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {daftar.map((t, i) => {
            const x = lintasEntitas(t, k);
            const kelola = bolehKelola(t);
            return (
              <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.penanda ? (
                      <Badge color={WARNA_PENANDA[t.penanda]}>{PENANDA_ANTAR_ENTITAS[t.penanda]}</Badge>
                    ) : !kelola ? (
                      <Badge color="amber">Belum ditandai</Badge>
                    ) : (
                      <select
                        value=""
                        disabled={menyimpanId === t.id}
                        onChange={(e) => setPenanda(t, e.target.value)}
                        className="bg-slate-900 border border-amber-500/40 text-amber-400 rounded-md px-2 py-1 text-[11px]"
                        aria-label="Beri penanda"
                      >
                        <option value="">Belum ditandai ▾</option>
                        {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      {k.entNama(x.asal)} · {k.labelRek(t.rekening)} <ArrowRightLeft size={10} /> {k.entNama(x.tujuan)} · {k.labelRek(t.rekening_tujuan)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {formatTanggalID(t.tanggal)}
                    {t.keterangan ? ` · ${t.keterangan}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-sm font-semibold text-sky-400">{fmtRp(t.jumlah)}</div>
                  {t.penanda && kelola && (
                    <button onClick={() => setPenanda(t, "")} disabled={menyimpanId === t.id} className="text-[10px] text-slate-500 hover:text-slate-300" title="Hapus penanda">
                      ubah
                    </button>
                  )}
                  {t.bukti_url && (
                    <a href={t.bukti_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-emerald-400/80 hover:text-emerald-300 hover:bg-slate-800" title="Lihat bukti transfer">
                      <Paperclip size={13} />
                    </a>
                  )}
                  {kelola && (
                    <>
                      <button onClick={() => setModal?.({ type: "keuangan-transaksi-form", item: t })} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setModal?.({ type: "hapus-keuangan-transaksi", item: t })} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800" title="Hapus">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formBuka && (
        <FormAntarEntitas
          k={k}
          role={role}
          kodeHolding={kodeHolding}
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

function FormAntarEntitas({ k, role, kodeHolding, onClose, onSaved, showToast }) {
  const [tanggal, setTanggal] = useState(hariIniLokal());
  const [penanda, setPenanda] = useState("");
  const [sumber, setSumber] = useState("");
  const [tujuan, setTujuan] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const jumlahNum = Number(jumlah) || 0;
  const saldoSumber = sumber ? k.saldoMap.get(sumber) ?? 0 : null;
  const saldoKurang = sumber && jumlahNum > 0 && jumlahNum > (saldoSumber ?? 0);
  const sama = sumber && tujuan && k.entDari(sumber) === k.entDari(tujuan);
  const arahDilarang = !!(sumber && tujuan && !sama && !bolehTransferAntarEntitas(role, k.entDari(sumber), k.entDari(tujuan), kodeHolding));
  const valid = tanggal && penanda && sumber && tujuan && jumlahNum > 0 && !saldoKurang && !sama && !arahDilarang;

  // Entitas yang masih mungkin dipilih sebagai sumber / tujuan untuk role ini
  // (mis. Pemilik: sumber hanya Holding, tujuan hanya perusahaan lain).
  const entCocok = (kode, peran) =>
    k.entitasList.some((e) =>
      peran === "sumber"
        ? bolehTransferAntarEntitas(role, kode, e.kode, kodeHolding)
        : bolehTransferAntarEntitas(role, e.kode, kode, kodeHolding)
    );

  const opsi = (kecualiKode, peran) =>
    k.entitasList.map((e) => {
      if (!entCocok(e.kode, peran)) return null;
      const items = k.rekeningList.filter((r) => k.entDari(r.kode) === e.kode && r.kode !== kecualiKode).sort(k.urutKas);
      if (!items.length) return null;
      return (
        <optgroup key={e.kode} label={e.label}>
          {items.map((r) => (
            <option key={r.kode} value={r.kode}>
              {r.label} ({LABEL_KAS[k.kasDari(r.kode)]}) — saldo {fmtRp(k.saldoMap.get(r.kode) || 0)}
            </option>
          ))}
        </optgroup>
      );
    });

  const simpan = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const buktiUrl = foto ? await unggahBukti(foto, `ent-${tujuan}`) : null;
      await sb("keuangan_transaksi", {
        method: "POST",
        body: JSON.stringify({
          tanggal,
          tipe: "transfer",
          rekening: sumber,
          rekening_tujuan: tujuan,
          kategori: null,
          jumlah: jumlahNum,
          penanda,
          keterangan: keterangan.trim() || PENANDA_ANTAR_ENTITAS[penanda],
          ...(buktiUrl ? { bukti_url: buktiUrl } : {}),
        }),
      });
      showToast?.(`${PENANDA_ANTAR_ENTITAS[penanda]} tercatat`);
      await onSaved();
    } catch (e) {
      showToast?.(e.message || "Gagal menyimpan", "err");
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Transfer Antar Entitas" onClose={onClose}>
      <Field label="Jenis">
        <select className={inputClass} value={penanda} onChange={(e) => setPenanda(e.target.value)}>
          <option value="">Pilih jenis…</option>
          {Object.entries(PENANDA_ANTAR_ENTITAS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <div className="text-[11px] text-slate-500 mt-1">
          {penanda === "modal" && "Setoran modal: biasanya dari rekening Holding ke rekening SELMA."}
          {penanda === "dividen" && "Dividen: biasanya dari rekening SELMA ke rekening Holding."}
          {penanda === "pinjaman" && "Pinjaman: dari pihak yang meminjamkan ke pihak yang meminjam."}
          {penanda === "pelunasan_pinjaman" && "Pelunasan: dari pihak yang berutang ke pihak yang meminjamkan."}
        </div>
      </Field>
      <Field label="Tanggal">
        <InputTanggal className={inputClass} value={tanggal} onChange={setTanggal} />
      </Field>
      <Field label="Dari rekening">
        <select className={inputClass} value={sumber} onChange={(e) => setSumber(e.target.value)}>
          <option value="">Pilih rekening sumber…</option>
          {opsi(tujuan, "sumber")}
        </select>
      </Field>
      <Field label="Ke rekening">
        <select className={inputClass} value={tujuan} onChange={(e) => setTujuan(e.target.value)}>
          <option value="">Pilih rekening tujuan…</option>
          {opsi(sumber, "tujuan")}
        </select>
      </Field>
      {sama && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Kedua rekening milik entitas yang sama. Untuk perpindahan di dalam satu perusahaan pakai menu Transaksi (tab Transaksi atau Transfer Antar Kas).</div>
        </div>
      )}
      {arahDilarang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>
            {role === "owner"
              ? "Akun Anda hanya boleh mencatat transfer dari Holding ke perusahaan."
              : role === "superadmin"
                ? "Akun Anda hanya boleh mencatat transfer dari perusahaan ke Holding."
                : "Akun ini tidak boleh mencatat transfer dengan arah tersebut."}
          </div>
        </div>
      )}
      <Field label="Jumlah (Rp)">
        <InputRupiah value={jumlah} onChange={setJumlah} />
      </Field>
      {saldoKurang && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-3">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <div>Saldo {k.labelRek(sumber)} hanya {fmtRp(saldoSumber ?? 0)}, kurang dari {fmtRp(jumlahNum)}.</div>
        </div>
      )}
      <Field label="Keterangan (opsional)">
        <input className={inputClass} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </Field>
      <Field label="Bukti Transfer (opsional)">
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

// =========================================================
// KONSOLIDASI (hanya baca)
// =========================================================
export function Konsolidasi({ keuanganTransaksi = [], master = {} }) {
  const k = useDataKas(master, keuanganTransaksi);
  const [dari, setDari] = useState(awalBulanIni());
  const [sampai, setSampai] = useState(hariIniLokal());
  const { data: semua, status: statusLama } = useKeuanganRentang(keuanganTransaksi, "");

  const ents = k.entitasList;

  const data = useMemo(() => {
    const periode = semua.filter((t) => (!dari || t.tanggal >= dari) && (!sampai || t.tanggal <= sampai));
    const perEnt = {};
    ents.forEach((e) => {
      perEnt[e.kode] = { kas: { [KAS_BANK]: 0, [KAS_KECIL]: 0 }, masuk: 0, keluar: 0, modal: 0, dividen: 0, pinjaman: 0, tanpa: 0 };
    });
    k.rekeningList.forEach((r) => {
      const e = perEnt[k.entDari(r.kode)];
      if (e) e.kas[k.kasDari(r.kode)] += k.saldoMap.get(r.kode) || 0;
    });
    periode.forEach((t) => {
      const j = nilai(t);
      if (t.tipe === "masuk") {
        const e = perEnt[k.entDari(t.rekening)];
        if (e) e.masuk += j;
      } else if (t.tipe === "keluar") {
        const e = perEnt[k.entDari(t.rekening)];
        if (e) e.keluar += j;
      } else {
        const x = lintasEntitas(t, k);
        if (!x) return;
        const kunci = t.penanda === "modal" ? "modal" : t.penanda === "dividen" ? "dividen" : t.penanda ? "pinjaman" : "tanpa";
        if (perEnt[x.tujuan]) perEnt[x.tujuan][kunci] += j; // diterima
        if (perEnt[x.asal]) perEnt[x.asal][kunci] -= j; // diberikan
      }
    });
    return { perEnt, posisi: posisiPinjaman(semua, k), periode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semua, dari, sampai, master.rekening, master.rekening_entitas, master.entitas, master.kas_grup, keuanganTransaksi]);

  if (ents.length < 2) return <PesanSetup />;

  const jumlahSemua = (fn) => ents.reduce((a, e) => a + fn(data.perEnt[e.kode], e.kode), 0);
  const totalKas = (p) => p.kas[KAS_BANK] + p.kas[KAS_KECIL];

  const baris = [
    { judul: "Saldo kas saat ini" },
    ...URUTAN_KAS.map((kk) => ({ label: LABEL_KAS[kk], ambil: (p) => p.kas[kk], indent: true })),
    { label: "Total kas", ambil: totalKas, tebal: true },
    { judul: "Operasional (periode terpilih)" },
    { label: "Pemasukan", ambil: (p) => p.masuk, warna: "text-emerald-400" },
    { label: "Pengeluaran", ambil: (p) => p.keluar, warna: "text-red-400" },
    { label: "Laba (rugi)", ambil: (p) => p.masuk - p.keluar, tebal: true },
    { judul: "Dana antar entitas (periode; + diterima, − diberikan)" },
    { label: "Modal", ambil: (p) => p.modal, indent: true },
    { label: "Dividen", ambil: (p) => p.dividen, indent: true },
    { label: "Pinjaman & pelunasan", ambil: (p) => p.pinjaman, indent: true },
    { label: "Belum ditandai", ambil: (p) => p.tanpa, indent: true },
    { judul: "Posisi pinjaman antar entitas (dari awal)" },
    { label: "Piutang (+) / Utang (−)", ambil: (_p, kode) => data.posisi[kode] || 0, indent: true },
  ];

  const sel = (v, warna) => (
    <span className={v < 0 ? "text-red-400" : warna || ""}>{fmtRp(v)}</span>
  );

  return (
    <div>
      {statusLama && <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20">{statusLama}</div>}
      <PageHeader
        title="Konsolidasi"
        description="Gabungan seluruh entitas — hanya untuk dilihat. Perpindahan uang antar entitas (modal, dividen, pinjaman) saling menghapus di kolom Konsolidasi, jadi tidak dihitung ganda."
        sticky
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <InputTanggal className={`${inputClass} w-auto`} value={dari} onChange={setDari} />
        <span className="text-slate-500 text-xs">s/d</span>
        <InputTanggal className={`${inputClass} w-auto`} value={sampai} onChange={setSampai} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total kas gabungan" value={fmtRp(jumlahSemua((p) => totalKas(p)))} accent="text-slate-100" icon={Landmark} iconColor="text-slate-400" />
        <StatCard label="Pemasukan gabungan" value={fmtRp(jumlahSemua((p) => p.masuk))} accent="text-emerald-400" icon={TrendingUp} iconColor="text-emerald-500" />
        <StatCard label="Laba (rugi) gabungan" value={fmtRp(jumlahSemua((p) => p.masuk - p.keluar))} accent="text-slate-100" icon={TrendingDown} iconColor="text-slate-400" />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2.5 font-medium"></th>
              {ents.map((e) => (
                <th key={e.kode} className="px-2 py-2.5 font-medium text-right">{e.label}</th>
              ))}
              <th className="px-4 py-2.5 font-medium text-right text-amber-400">Konsolidasi</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) =>
              b.judul ? (
                <tr key={i} className="bg-slate-900/60">
                  <td colSpan={ents.length + 2} className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-slate-500">{b.judul}</td>
                </tr>
              ) : (
                <tr key={i} className="border-b border-slate-800/60 last:border-0">
                  <td className={`px-4 py-2 ${b.indent ? "pl-8 text-slate-400" : "text-slate-200"} ${b.tebal ? "font-semibold" : ""}`}>{b.label}</td>
                  {ents.map((e) => (
                    <td key={e.kode} className={`px-2 py-2 text-right whitespace-nowrap ${b.tebal ? "font-semibold" : ""}`}>
                      {sel(b.ambil(data.perEnt[e.kode], e.kode), b.warna)}
                    </td>
                  ))}
                  <td className={`px-4 py-2 text-right whitespace-nowrap ${b.tebal ? "font-semibold" : ""}`}>
                    {sel(jumlahSemua((p, kode) => b.ambil(p, kode)), b.warna)}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        Saldo kas dihitung dari akun yang dipetakan ke tiap entitas (Keuangan &gt; Kas &gt; Akun Kas). Laba di sini = pemasukan − pengeluaran tercatat di Keuangan, belum termasuk penyusutan atau penyesuaian lain.
      </div>
    </div>
  );
}