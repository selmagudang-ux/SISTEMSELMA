import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import ModalRouter from "../../components/ModalRouter";
import {
  sb, sbAll, entitasBacaSaatIni, masterDataUntukPT, lingkupTokoMarketplace, daftarkanProfilEntitas,
  setSaldoDasarRekening, resetKeuanganLama, awalRentangKeuanganDefault, kodeEntitasHolding,
} from "../../lib/api";
import { NAV, roleHanyaLihat } from "../../lib/constants";
import { RingkasanGrup, Konsolidasi, AntarEntitas, KelolaPerusahaan } from "../Holding";
import PenarikanPemilik from "../PenarikanPemilik";

// =========================================================
// VERSI HP — menu PERUSAHAAN GRUP dan KEUANGAN PUSAT (file GrupHp.jsx)
// Satu pintu untuk dua menu NAV (lihat LAYAR_HP di mobileMenu.js: "perusahaan" dan "holding"):
//
//   KEUANGAN PUSAT (pembukuan Holding sendiri, dikunci ke entitas Holding):
//     Transaksi / Kas / Laporan Keuangan / Pengaturan -> memakai ulang layar HP Keuangan (KeuanganHp, KasHp, LaporanHp,
//     PengaturanKeuanganHp) yang dikunci ke entitas Holding lewat prop `entitas`.
//     Modal & Penarikan Pemilik -> PenarikanPemilik (komponen versi komputer).
//
//   PERUSAHAAN GRUP:
//     Ringkasan (Per Perusahaan | Konsolidasi) -> RingkasanGrup & Konsolidasi (versi komputer, hanya baca).
//     Keuangan Perusahaan -> pilih perusahaan anak, lalu Transaksi / Kas / Laporan (layar HP Keuangan, HANYA BACA).
//     Antar Entitas, Kelola Perusahaan -> komponen versi komputer (pages/Holding.jsx).
//
// Aturan hak akses SAMA dengan Keuangan.jsx desktop: akun Pemilik & Pemegang Saham hanya melihat, kecuali Pemilik di
// pembukuan Holding dan transfer Antar Entitas arah Holding -> perusahaan (pagar sebenarnya ada di sb() lib/api.js).
// Layar yang memakai komponen versi komputer (Ringkasan, Konsolidasi, Antar Entitas, Kelola, Penarikan) tabelnya bisa
// digeser ke samping di HP.
// =========================================================

const KeuanganHp = lazy(() => import("./KeuanganHp.jsx"));
const KasHp = lazy(() => import("./KasHp.jsx"));
const LaporanHp = lazy(() => import("./LaporanHp.jsx"));
const PengaturanKeuanganHp = lazy(() => import("./PengaturanKeuanganHp.jsx"));

const LAYAR_PUSAT = { transaksi: KeuanganHp, kas: KasHp, laporan: LaporanHp, pengaturan: PengaturanKeuanganHp };

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

// Master data lengkap (sama dengan layar HP Keuangan lain).
async function muatMasterPenuh() {
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

// Hanya daftar entitas (cukup untuk layar yang memakai ulang layar HP Keuangan, yang memuat datanya sendiri).
async function muatEntitas() {
  const rows = (await sbAll("master_data?select=id,tipe,kode,label&tipe=in.(entitas,entitas_set)")) || [];
  return {
    entitas: rows.filter((r) => r.tipe === "entitas"),
    entitas_set: rows.filter((r) => r.tipe === "entitas_set"),
  };
}

// Transaksi bulan berjalan + saldo dasar — sama dengan App.jsx loadKeuangan(). Data lama dimuat komponen via useKeuanganRentang.
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

// Urutan key NAV dari atas ke bawah menuju `kunci` (untuk pindah layar lewat hash MobileApp).
function jalurKe(kunciMenu, kunciSub) {
  const cari = (nodes, jejak) => {
    for (const n of nodes) {
      const j = [...jejak, n.key];
      if (n.key === kunciMenu) return kunciSub ? [...j, kunciSub] : j;
      const d = cari(n.children || [], j);
      if (d) return d;
    }
    return null;
  };
  return cari(NAV, []);
}
function pindahLayar(kunciMenu, kunciSub) {
  const p = jalurKe(kunciMenu, kunciSub);
  if (p) window.location.hash = "/" + p.map(encodeURIComponent).join("/");
}

const PERUSAHAAN_KEY = "selma-holding-perusahaan";

// ---------------------------------------------------------
// KEUANGAN PUSAT: layar HP Keuangan dikunci ke entitas Holding
// ---------------------------------------------------------
function LayarPusat({ session, sub, kodeHolding }) {
  const Komponen = LAYAR_PUSAT[sub];
  // Pemilik boleh membukukan Holding; role hanya-lihat lain tidak (sama dengan Keuangan.jsx desktop).
  const bacaSaja = roleHanyaLihat(session?.role) && session?.role !== "owner";
  if (!Komponen) return null;
  return (
    <Suspense fallback={<Memuat />}>
      <Komponen key={`pusat-${sub}`} session={session} sub={sub} entitas={kodeHolding} bacaSajaPaksa={bacaSaja} />
    </Suspense>
  );
}

// ---------------------------------------------------------
// KEUANGAN PERUSAHAAN: pilih perusahaan anak, lihat saja
// ---------------------------------------------------------
const TAB_DETAIL = [
  { key: "transaksi", label: "Transaksi" },
  { key: "kas", label: "Kas" },
  { key: "laporan", label: "Laporan Keuangan" },
];

function LayarDetail({ session, entitasList, kodeHolding }) {
  const anak = entitasList.filter((e) => e.kode !== kodeHolding);
  const [pilih, setPilih] = useState(() => {
    try {
      return sessionStorage.getItem(PERUSAHAAN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [tab, setTab] = useState("transaksi");
  const kode = anak.some((e) => e.kode === pilih) ? pilih : anak[0]?.kode || "";

  const ganti = (k) => {
    setPilih(k);
    try {
      sessionStorage.setItem(PERUSAHAAN_KEY, k);
    } catch {
      /* abaikan */
    }
  };

  if (!kode) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-dashed border-md-outline-variant p-8 text-center text-sm text-md-on-surface-variant">
          Belum ada perusahaan anak yang terdaftar di grup.
        </div>
      </div>
    );
  }
  const Komponen = LAYAR_PUSAT[tab];
  return (
    <div>
      <div className="px-4 pt-4 space-y-3">
        <div className="text-[11px] text-md-on-surface-variant">Perusahaan</div>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          {anak.map((e) => (
            <ChipTab key={e.kode} aktif={kode === e.kode} onClick={() => ganti(e.kode)}>{e.label}</ChipTab>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
          {TAB_DETAIL.map((t) => (
            <ChipTab key={t.key} aktif={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</ChipTab>
          ))}
        </div>
      </div>
      {/* key = perusahaan + tab: layar dimuat ulang bersih tiap ganti perusahaan. bacaSajaPaksa: Keuangan Perusahaan HANYA BACA. */}
      <Suspense fallback={<Memuat />}>
        <Komponen key={`${kode}-${tab}`} session={session} sub={tab} entitas={kode} bacaSajaPaksa />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------
// Layar yang memakai komponen versi komputer (butuh master + transaksi lengkap)
// ---------------------------------------------------------
function LayarDesktop({ session, sub, kodeHolding }) {
  const [master, setMaster] = useState({});
  const [trx, setTrx] = useState([]);
  const [siap, setSiap] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);
  const [tabGrup, setTabGrup] = useState(session?.role === "pemegang_saham" ? "konsolidasi" : "ringkasan");

  const tampilToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerToast.current), []);

  const butuhTrx = sub !== "kelola";
  const muat = useCallback(async () => {
    setErr("");
    try {
      const [m, t] = await Promise.all([muatMasterPenuh(), butuhTrx ? muatTransaksi() : Promise.resolve([])]);
      setMaster(m);
      setTrx(t);
    } catch (e) {
      setErr(e.message || "Gagal memuat data");
    } finally {
      setSiap(true);
    }
  }, [butuhTrx]);
  useEffect(() => {
    muat();
  }, [muat]);

  // Hak akses (sama dengan Keuangan.jsx): akun hanya-lihat tidak bisa membuka form; Pemilik membukukan Holding.
  const bacaSaja = roleHanyaLihat(session?.role) && session?.role !== "owner";
  const setModalAman = useCallback(
    (m) => {
      if (m && bacaSaja) {
        tampilToast("Akun ini hanya bisa melihat data (read-only).", "err");
        return;
      }
      setModal(m);
    },
    [bacaSaja, tampilToast]
  );

  // Form transaksi (ModalRouter) membaca entitas aktif dari sini — di menu Holding selalu entitas Holding.
  useEffect(() => {
    try {
      sessionStorage.setItem("selma-entitas", kodeHolding);
    } catch {
      /* abaikan */
    }
  }, [kodeHolding]);

  const bukaPerusahaan = useCallback(
    (kode) => {
      if (kode === kodeHolding) return pindahLayar("holding", "transaksi");
      try {
        sessionStorage.setItem(PERUSAHAAN_KEY, kode);
      } catch {
        /* abaikan */
      }
      pindahLayar("perusahaan", "detail");
    },
    [kodeHolding]
  );

  if (!siap) return <Memuat />;
  if (err && !Object.keys(master).length) {
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

        {sub === "grup" && (
          <>
            {session?.role !== "pemegang_saham" && (
              <div className="flex gap-2">
                <ChipTab aktif={tabGrup === "ringkasan"} onClick={() => setTabGrup("ringkasan")}>Per Perusahaan</ChipTab>
                <ChipTab aktif={tabGrup === "konsolidasi"} onClick={() => setTabGrup("konsolidasi")}>Konsolidasi</ChipTab>
              </div>
            )}
            {tabGrup === "konsolidasi" ? (
              <Konsolidasi keuanganTransaksi={trx} master={master} />
            ) : (
              <RingkasanGrup keuanganTransaksi={trx} master={master} onBuka={bukaPerusahaan} />
            )}
          </>
        )}
        {sub === "antar-entitas" && (
          <AntarEntitas keuanganTransaksi={trx} master={master} reload={muat} showToast={tampilToast} setModal={setModalAman} role={session?.role} entitasAkun={session?.entitas} />
        )}
        {sub === "kelola" && <KelolaPerusahaan master={master} reload={muat} showToast={tampilToast} />}
        {sub === "penarikan" && (
          <PenarikanPemilik keuanganTransaksi={trx} master={master} reload={muat} showToast={tampilToast} setModal={setModalAman} role={session?.role} />
        )}
      </div>

      {modal && (
        <ModalRouter
          modal={modal}
          setModal={setModalAman}
          master={master}
          settings={null}
          rakList={[]}
          skuMaster={[]}
          penempatan={[]}
          items={[]}
          pesananMasuk={[]}
          suppliers={[]}
          keuanganTransaksi={trx}
          marketplaceTransaksi={[]}
          saving={saving}
          setSaving={setSaving}
          reload={muat}
          showToast={tampilToast}
          session={session}
          pelangganGrosir={[]}
          tokoGrosir={[]}
          produkManualGrosir={[]}
          pesananGrosir={[]}
          pembayaranGrosir={[]}
          depositGrosir={[]}
        />
      )}

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

// ---------------------------------------------------------
// PINTU MASUK
// ---------------------------------------------------------
export default function GrupHp({ session, sub }) {
  const [ent, setEnt] = useState(null);
  const [err, setErr] = useState("");

  const muat = useCallback(() => {
    setErr("");
    muatEntitas()
      .then(setEnt)
      .catch((e) => setErr(e.message || "Gagal memuat daftar perusahaan"));
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  const kodeHolding = useMemo(() => (ent ? kodeEntitasHolding(ent.entitas, ent.entitas_set) : ""), [ent]);

  if (err) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-md-error-container text-md-on-error-container p-4 text-sm">
          <div className="break-words">{err}</div>
          <button onClick={muat} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      </div>
    );
  }
  if (!ent) return <Memuat />;
  if (!kodeHolding) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs px-4 py-3">
          Entitas Holding belum diatur. Jalankan <span className="font-mono">fase4_holding.sql</span> di database, lalu muat ulang halaman.
        </div>
      </div>
    );
  }

  if (LAYAR_PUSAT[sub]) return <LayarPusat session={session} sub={sub} kodeHolding={kodeHolding} />;
  if (sub === "detail") return <LayarDetail session={session} entitasList={ent.entitas} kodeHolding={kodeHolding} />;
  return <LayarDesktop session={session} sub={sub} kodeHolding={kodeHolding} />;
}
