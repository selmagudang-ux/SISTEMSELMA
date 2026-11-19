import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { btnFilled, btnTonal, btnText } from "../components/ui";
import { sb, sbAll, fmtRp } from "../lib/api";
import { sbTulis } from "../lib/marketplaceImport";
import { parseLaporanPenghasilanTiktok, parseExportPesananTiktok, bangunBarisTiktok } from "../lib/tiktokImport";

// =========================================================
// IMPORT TIKTOK SHOP -> Rincian Penjualan (dipanggil dari PenjualanRincian.jsx, platform "tiktok").
//   1. Laporan Penghasilan (income_*.xlsx)  : dana cair + semua potongan per pesanan  (WAJIB)
//   2. Export Pesanan ("Semua pesanan")     : barang (kode live), qty, harga per pesanan
//      Boleh beberapa file (mis. Oktober + November). Kalau tidak dipilih, SKU dari import sebelumnya dipakai.
// Kode live dicocokkan ke Master Barang lewat tab "Kode Live" (marketplace_sku_alias, platform tiktok).
// =========================================================

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const bulanTeks = (ym) => { const m = String(ym).match(/^(\d{4})-(\d{2})$/); return m ? `${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}` : "tanggal tidak diketahui"; };
const tglTeks = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1].slice(0, 3)} ${m[1]}` : "—"; };

function Slot({ no, judul, wajib, petunjuk, files, multiple, onPilih, onHapus }) {
  return (
    <label className="block text-xs text-md-on-surface-variant rounded-md-lg border border-md-outline-variant p-3">
      <span className="block mb-1 text-md-on-surface text-sm">
        {no}. {judul}{" "}
        {files.length ? <span className="text-emerald-400">✓{multiple ? ` ${files.length} file` : ""}</span> : wajib ? <span className="text-amber-400">(wajib)</span> : <span>(opsional)</span>}
      </span>
      <span className="block mb-2">{petunjuk}</span>
      <input type="file" accept=".xlsx" multiple={multiple} onChange={onPilih} className="block text-xs" />
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="truncate">{f.name}</span>
          {onHapus && <button type="button" className="text-red-400 underline flex-shrink-0" onClick={(e) => { e.preventDefault(); onHapus(i); }}>hapus</button>}
        </span>
      ))}
    </label>
  );
}

export default function PanelImportTiktok({ platform, tokoKode, tokoLabel, filterToko, skuMap, aliasMap, showToast, onSelesai }) {
  const [fPenghasilan, setFPenghasilan] = useState(null);
  const [fPesanan, setFPesanan] = useState([]);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const reset = () => { setPreview(null); setStatus(""); };
  const tambahPesanan = (e) => {
    const baru = [...(e.target.files || [])];
    const kunci = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    setFPesanan((lama) => { const ada = new Set(lama.map(kunci)); return [...lama, ...baru.filter((f) => !ada.has(kunci(f)))]; });
    e.target.value = "";
    reset();
  };

  const baca = async () => {
    setSibuk(true); setStatus("Membaca Laporan Penghasilan… (file besar bisa 10–30 detik)"); setPreview(null);
    try {
      const income = await parseLaporanPenghasilanTiktok(await fPenghasilan.arrayBuffer());

      // beberapa export pesanan digabung per Order ID; kalau satu pesanan ada di dua file, dipakai yang pertama
      const linesGabung = new Map();
      let pesananDobel = 0;
      let awalExport = null;
      let akhirExport = null;
      for (let i = 0; i < fPesanan.length; i++) {
        setStatus(`Membaca Export Pesanan ${i + 1}/${fPesanan.length}…`);
        const h = await parseExportPesananTiktok(await fPesanan[i].arrayBuffer());
        for (const [no, l] of h.lines) { if (linesGabung.has(no)) pesananDobel++; else linesGabung.set(no, l); }
        if (h.awal && (!awalExport || h.awal < awalExport)) awalExport = h.awal;
        if (h.akhir && (!akhirExport || h.akhir > akhirExport)) akhirExport = h.akhir;
      }

      // data lama (supaya SKU yang sudah tersimpan tidak hilang kalau export pesanan tidak mencakup pesanan itu)
      const existingByOrder = new Map();
      const adaLama = await sb(`marketplace_penjualan?select=no_pesanan&${filterToko}&limit=1`);
      if (adaLama?.length) {
        const nomor = [...income.orders.keys()];
        for (let i = 0; i < nomor.length; i += 150) {
          const potong = nomor.slice(i, i + 150).map(encodeURIComponent).join(",");
          const rows = await sbAll(`marketplace_penjualan?select=*&${filterToko}&no_pesanan=in.(${potong})`);
          for (const r of rows) { if (!existingByOrder.has(r.no_pesanan)) existingByOrder.set(r.no_pesanan, []); existingByOrder.get(r.no_pesanan).push(r); }
          setStatus(`Memeriksa data lama… ${Math.min(i + 150, nomor.length)}/${nomor.length}`);
        }
      }

      setStatus("Mencocokkan SKU & menghitung…");
      const hasil = bangunBarisTiktok({ income, pesanan: linesGabung.size ? { lines: linesGabung } : null, existingByOrder, aliasMap, skuMap, platform, toko: tokoKode });
      const dilepas = [...income.orders.values()].map((o) => o.tanggal_dilepas).filter(Boolean).sort();
      setPreview({
        ...hasil, existingByOrder, income: { tidakPas: income.tidakPas, pesananNol: income.pesananNol, barisPenyesuaian: income.barisPenyesuaian, totalDana: income.totalDana, totalLaporan: income.totalLaporan, periode: income.periode },
        dari: dilepas[0], sampai: dilepas[dilepas.length - 1], pesananDobel, pesananExport: linesGabung.size, awalExport, akhirExport,
      });
      setStatus("");
    } catch (e) {
      setStatus(e.message || "Gagal membaca file");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async () => {
    setSibuk(true);
    try {
      const { baris, existingByOrder } = preview;
      for (let i = 0; i < baris.length; i += 400) {
        setStatus(`Menyimpan penjualan… ${Math.min(i + 400, baris.length)}/${baris.length}`);
        await sbTulis("marketplace_penjualan?on_conflict=entitas,platform,toko,no_pesanan,no_baris", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(baris.slice(i, i + 400)),
        });
      }
      // bersihkan baris sisa kalau jumlah baris suatu pesanan berkurang dibanding import lama
      const barisMax = new Map();
      for (const b of baris) barisMax.set(b.no_pesanan, Math.max(barisMax.get(b.no_pesanan) || 0, b.no_baris));
      for (const [no, lama] of existingByOrder) {
        const max = barisMax.get(no);
        if (max && lama.some((l) => l.no_baris > max)) {
          await sbTulis(`marketplace_penjualan?${filterToko}&no_pesanan=eq.${encodeURIComponent(no)}&no_baris=gt.${max}`, { method: "DELETE", prefer: "return=minimal" });
        }
      }
      showToast?.(`${barisMax.size} pesanan (${baris.length} baris) TikTok tersimpan`);
      onSelesai({ dari: preview.dari, sampai: preview.sampai });
    } catch (e) {
      setStatus(e.message || "Gagal menyimpan");
      setSibuk(false);
    }
  };

  const r = preview?.ringkas;
  const inc = preview?.income;
  const selisih = inc && inc.totalLaporan != null ? Math.round(inc.totalDana - inc.totalLaporan) : null;
  const bulanTanpa = r ? [...r.tanpaSkuPerBulan].sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <div className="mb-5 rounded-md-lg bg-md-container-low shadow-elevation-1 p-4">
      <div className="text-sm font-medium mb-1">Import Laporan TikTok{tokoLabel ? ` — ${tokoLabel}` : ""}</div>
      <p className="text-xs text-md-on-surface-variant mb-3 max-w-3xl">
        Dana cair dan semua potongan dibaca dari Laporan Penghasilan. Barang (kode live), qty, dan harga dibaca dari Export Pesanan lalu dicocokkan ke Master Barang lewat tab Kode Live. Pesanan batal (dana Rp0) otomatis dilewati. Import ulang aman: data pesanan yang sama diperbarui, tidak dobel.
      </p>
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <Slot no={1} judul="Laporan Penghasilan" wajib multiple={false} files={fPenghasilan ? [fPenghasilan] : []}
          petunjuk="Seller Center TikTok Shop → Finance/Penghasilan → Unduh laporan (.xlsx) untuk rentang tanggal dana cair. Berisi sheet “Detail pesanan”."
          onPilih={(e) => { setFPenghasilan(e.target.files?.[0] || null); reset(); }} />
        <Slot no={2} judul="Export Pesanan" multiple files={fPesanan}
          petunjuk="Pesanan → Semua pesanan → Export (.xlsx). Pilih rentang yang mencakup TANGGAL PESAN dari pesanan di laporan (dana yang cair bulan ini bisa berasal dari pesanan bulan lalu). Boleh beberapa file, pilih satu per satu."
          onPilih={tambahPesanan} onHapus={(i) => { setFPesanan((l) => l.filter((_, j) => j !== i)); reset(); }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnTonal} disabled={!fPenghasilan || sibuk} onClick={baca}>Baca file</button>
        {preview && <button className={btnFilled} disabled={sibuk || preview.baris.length === 0} onClick={simpan}>Simpan {preview.ringkas.pesanan.toLocaleString("id-ID")} pesanan</button>}
        <button className={btnText} disabled={sibuk} onClick={() => onSelesai(null)}>Tutup</button>
        {status && <span className="text-xs text-md-on-surface-variant">{status}</span>}
      </div>

      {preview && (
        <div className="mt-4 text-xs text-md-on-surface-variant space-y-1.5">
          <div>
            Dana cair <b className="text-md-on-surface">{tglTeks(preview.dari)} – {tglTeks(preview.sampai)}</b>
            {inc.periode ? ` (periode laporan ${inc.periode})` : ""} · <b className="text-md-on-surface">{r.pesanan.toLocaleString("id-ID")} pesanan</b> · {preview.baris.length.toLocaleString("id-ID")} baris barang
            · total dana <b className="text-md-on-surface">{fmtRp(inc.totalDana)}</b>
          </div>
          {selisih === 0 && <div className="text-emerald-400">Total dana sama dengan “Jumlah penyelesaian pembayaran” di sheet Laporan TikTok.</div>}
          {selisih != null && selisih !== 0 && <div className="text-amber-400">Total dana berbeda {fmtRp(selisih)} dari sheet Laporan TikTok ({fmtRp(inc.totalLaporan)}) — periksa filter/tanggal file.</div>}
          {inc.tidakPas > 0 && <div className="text-amber-400">{inc.tidakPas} baris angkanya tidak pas dengan Total Pendapatan + Total Biaya — periksa file.</div>}
          <div>{inc.pesananNol.toLocaleString("id-ID")} pesanan berdana Rp0 (batal) dilewati{inc.barisPenyesuaian ? ` · ${inc.barisPenyesuaian} baris penyesuaian/penggantian platform ditambahkan ke pesanan terkait` : ""}.</div>
          <div>
            SKU: {r.dariExport.toLocaleString("id-ID")} pesanan dari Export Pesanan
            {r.dariTersimpan > 0 ? `, ${r.dariTersimpan.toLocaleString("id-ID")} dari data tersimpan` : ""}
            {preview.pesananDobel > 0 ? ` · ${preview.pesananDobel} pesanan ada di lebih dari satu file (dipakai yang pertama)` : ""}.
          </div>
          {r.tanpaSku > 0 && (
            <div className="flex gap-2 text-amber-400 bg-amber-500/10 rounded-md-lg px-3 py-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                {r.tanpaSku.toLocaleString("id-ID")} pesanan belum punya data barang, jadi dana cairnya tetap tersimpan tetapi belum ikut HPP & laba. Berdasarkan tanggal pesan:{" "}
                {bulanTanpa.map(([b, n]) => `${bulanTeks(b)} (${n.toLocaleString("id-ID")})`).join(", ")}.
                {preview.awalExport ? ` Export Pesanan yang dipilih mencakup ${tglTeks(preview.awalExport)} – ${tglTeks(preview.akhirExport)}.` : " Belum ada Export Pesanan yang dipilih."}
                {" "}Pilih Export Pesanan yang mencakup bulan-bulan itu lalu baca ulang; atau import terpisah nanti — data barangnya otomatis melengkapi.
              </div>
            </div>
          )}
          <div>
            Pencocokan ke Master Barang: <b className="text-emerald-400">{r.barisCocok.toLocaleString("id-ID")} baris cocok</b>
            {r.barisTidakCocok > 0 && <>, <b className="text-amber-400">{r.barisTidakCocok.toLocaleString("id-ID")} baris belum cocok</b> ({r.referensiTidakCocok.size.toLocaleString("id-ID")} kode berbeda — isi di tab Kode Live, atau di panel “belum cocok” di bawah tabel). Baris itu tetap tersimpan dan ikut terhitung begitu kodenya dipetakan.</>}
          </div>
        </div>
      )}
    </div>
  );
}
