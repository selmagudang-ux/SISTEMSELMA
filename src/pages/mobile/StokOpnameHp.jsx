import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { cariSkuDariBarcode } from "../../lib/code128";
import { TombolScanKamera } from "../../components/ScanKamera";

// =========================================================
// VERSI HP — STOK OPNAME (file StokOpnameHp.jsx)
// Fungsi SAMA dengan Stok > Stok Opname versi komputer (cari SKU / scan barcode, isi Qty Fisik, bandingkan dengan Stok Sistem,
// "Sesuaikan Stok" lewat modal yang sama di components/ModalRouter), tapi dibuat ringan untuk HP:
//   - tampilan kartu, bukan tabel lebar; daftar hanya menampilkan 30 SKU dulu ("Tampilkan lebih banyak"),
//   - mengetik di kolom cari tidak menggambar ulang ribuan baris (pencarian ditunda sebentar + baris di-memo),
//   - mengetik Qty Fisik hanya menggambar ulang baris yang diubah.
// Dipakai dari GudangHp.jsx (menu stok, sub "hitung"). Props: skuMaster, setModal.
// =========================================================

const PER_TAMPIL = 30;

function Selisih({ ada, selisih }) {
  if (!ada) return <span className="text-xs text-md-on-surface-variant">Belum dihitung</span>;
  if (selisih === 0)
    return (
      <span className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
        <CheckCircle2 size={13} /> Cocok
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
      <AlertTriangle size={13} /> Selisih {selisih > 0 ? `+${selisih}` : selisih}
    </span>
  );
}

const Baris = memo(function Baris({ s, raw, onQty, onSesuaikan }) {
  const stok = Number(s.stok) || 0;
  const ada = raw !== "";
  const qty = ada ? Number(raw) : null;
  const selisih = ada ? qty - stok : null;
  return (
    <div className="rounded-2xl bg-md-container border border-md-outline-variant px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-md-on-surface break-all">{s.sku}</div>
          <div className="text-[11px] text-md-on-surface-variant mt-0.5">
            Stok sistem <span className="font-semibold text-md-on-surface">{stok}</span>
          </div>
        </div>
        <input
          type="number"
          inputMode="numeric"
          value={raw}
          onChange={(e) => onQty(s.id, e.target.value)}
          placeholder="Qty fisik"
          className="w-24 flex-shrink-0 rounded-xl bg-md-surface border border-md-outline-variant px-2.5 py-2 text-sm text-right outline-none focus:border-md-primary"
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2">
        <Selisih ada={ada} selisih={selisih} />
        <button
          disabled={!ada || selisih === 0}
          onClick={() => onSesuaikan(s, qty)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-500 disabled:opacity-30"
        >
          Sesuaikan Stok
        </button>
      </div>
    </div>
  );
});

export default function StokOpnameHp({ skuMaster, setModal }) {
  const [q, setQ] = useState("");
  const qTunda = useDeferredValue(q); // daftar menyusul setelah ketikan, kolom cari tetap langsung terasa
  const [fisik, setFisik] = useState({}); // { [sku_master.id]: string } — belum tersimpan sampai "Sesuaikan Stok"
  const [tampil, setTampil] = useState(PER_TAMPIL);
  const [tambahSatu, setTambahSatu] = useState(false);
  const [terakhirId, setTerakhirId] = useState(null);
  const [pesanScan, setPesanScan] = useState("");
  const [scanTick, setScanTick] = useState(0);
  const cariRef = useRef(null);
  const qtyPanelRef = useRef(null);

  // Teks huruf kecil disiapkan sekali (bukan tiap ketikan).
  const indeks = useMemo(() => (skuMaster || []).map((s) => ({ s, k: String(s.sku || "").toLowerCase() })), [skuMaster]);
  const daftar = useMemo(() => {
    const kata = qTunda.trim().toLowerCase();
    return kata ? indeks.filter((x) => x.k.includes(kata)).map((x) => x.s) : indeks.map((x) => x.s);
  }, [indeks, qTunda]);
  useEffect(() => setTampil(PER_TAMPIL), [qTunda]);

  const setQty = useCallback((id, val) => setFisik((p) => ({ ...p, [id]: val })), []);
  const sesuaikan = useCallback((s, qty) => setModal({ type: "stok-opname", item: s, qtyFisik: qty }), [setModal]);

  const prosesScan = (kode) => {
    const sku = cariSkuDariBarcode(skuMaster, kode);
    if (!sku) {
      setPesanScan(`Barcode "${kode}" tidak ditemukan di Master Barang.`);
      return;
    }
    setPesanScan("");
    setTerakhirId(sku.id);
    setScanTick((n) => n + 1);
    if (tambahSatu) {
      setFisik((prev) => {
        const cur = prev[sku.id];
        const n = cur === undefined || cur === "" ? 0 : Number(cur) || 0;
        return { ...prev, [sku.id]: String(n + 1) };
      });
    }
  };
  useEffect(() => {
    if (!scanTick || tambahSatu) return undefined;
    const t = setTimeout(() => {
      qtyPanelRef.current?.focus();
      qtyPanelRef.current?.select();
    }, 80);
    return () => clearTimeout(t);
  }, [scanTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const terakhir = terakhirId ? (skuMaster || []).find((x) => x.id === terakhirId) : null;
  const sudahDihitung = useMemo(() => Object.values(fisik).filter((v) => v !== "").length, [fisik]);

  return (
    <div className="space-y-3">
      <div>
        <div className="font-bold text-md-on-surface">Stok Opname</div>
        <p className="text-xs text-md-on-surface-variant">Hitung fisik stok di gudang, lalu bandingkan dengan Stok Sistem untuk mengecek selisih.</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-md-on-surface-variant" />
          <input
            ref={cariRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Scanner USB/Bluetooth mengetik isi barcode lalu menekan Enter.
              if (e.key !== "Enter") return;
              const kode = q.trim();
              if (!kode) return;
              e.preventDefault();
              if (cariSkuDariBarcode(skuMaster, kode)) {
                prosesScan(kode);
                setQ("");
              } else {
                setPesanScan(`Barcode "${kode}" tidak ditemukan di Master Barang.`);
              }
            }}
            placeholder="Cari SKU atau scan barcode…"
            className="w-full rounded-full bg-md-container border border-md-outline-variant pl-10 pr-10 py-2.5 text-sm outline-none focus:border-md-primary"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-md-on-surface-variant" title="Hapus pencarian">
              <X size={15} />
            </button>
          )}
        </div>
        <TombolScanKamera label="Scan" judul="Scan Barcode — Stok Opname" continuous={tambahSatu} onDetect={prosesScan} />
      </div>

      <label className="flex items-center gap-2 text-xs text-md-on-surface-variant">
        <input type="checkbox" checked={tambahSatu} onChange={(e) => setTambahSatu(e.target.checked)} className="accent-amber-500" />
        Tambah 1 tiap scan
        {sudahDihitung > 0 && <span className="ml-auto font-medium text-md-on-surface">{sudahDihitung} SKU sudah dihitung</span>}
      </label>

      {pesanScan && <div className="text-xs text-md-error">{pesanScan}</div>}

      {terakhir && (
        <div className="rounded-2xl border border-amber-500/40 bg-md-container p-4">
          <div className="text-[11px] text-md-on-surface-variant mb-1">Terakhir di-scan</div>
          <div className="font-mono text-sm text-amber-500 mb-3 break-all">{terakhir.sku}</div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="text-md-on-surface-variant">
              Stok sistem <span className="font-semibold text-md-on-surface ml-1">{Number(terakhir.stok) || 0}</span>
            </div>
            <input
              ref={qtyPanelRef}
              type="number"
              inputMode="numeric"
              value={fisik[terakhir.id] ?? ""}
              onChange={(e) => setQty(terakhir.id, e.target.value)}
              onKeyDown={(e) => {
                // Enter = selesai isi qty, kursor balik ke kotak scan untuk barcode berikutnya.
                if (e.key === "Enter") {
                  e.preventDefault();
                  cariRef.current?.focus();
                }
              }}
              placeholder="Qty fisik"
              className="w-28 rounded-xl bg-md-surface border border-md-outline-variant px-2.5 py-2 text-sm text-right outline-none focus:border-md-primary"
            />
          </div>
          {(() => {
            const raw = fisik[terakhir.id] ?? "";
            const ada = raw !== "";
            const qty = ada ? Number(raw) : null;
            const selisih = ada ? qty - (Number(terakhir.stok) || 0) : null;
            return (
              <div className="flex items-center justify-between gap-3 mt-3">
                <Selisih ada={ada} selisih={selisih} />
                <button
                  disabled={!ada || selisih === 0}
                  onClick={() => sesuaikan(terakhir, qty)}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-500 disabled:opacity-30"
                >
                  Sesuaikan Stok
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {daftar.length === 0 ? (
        <div className="py-10 text-center text-sm text-md-on-surface-variant">{q ? "Tidak ada SKU yang cocok dengan pencarian." : "Belum ada data untuk dihitung."}</div>
      ) : (
        <>
          <div className="text-[11px] text-md-on-surface-variant">{daftar.length.toLocaleString("id-ID")} SKU</div>
          <div className="space-y-2">
            {daftar.slice(0, tampil).map((s) => (
              <Baris key={s.id} s={s} raw={fisik[s.id] ?? ""} onQty={setQty} onSesuaikan={sesuaikan} />
            ))}
          </div>
          {daftar.length > tampil && (
            <button onClick={() => setTampil((n) => n + PER_TAMPIL)} className="w-full py-2.5 rounded-full border border-md-outline-variant text-xs font-medium text-md-primary">
              Tampilkan lebih banyak ({(daftar.length - tampil).toLocaleString("id-ID")} lagi)
            </button>
          )}
        </>
      )}
    </div>
  );
}
