import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle, FileDown } from "lucide-react";
import { sb, sbAll, entitasSesi, fmtRp } from "../../lib/api";
import { getSession } from "../../lib/auth";
import { Kerangka, Galat, inp, pesanError } from "./BarangToko";
import { rapikanKodeLive, sinkronAliasKodeLive } from "./kodeLiveAlias";

// =========================================================
// PINDAHKAN SKU DARI MASTER BARANG (gudang) KE BARANG TOKO (kasir).
// - Membuat baris master_toko dari data SKU:
//     kode   = KODE ENTITAS-nomor urut (mis. OPS-0001), nomor lanjut dari yang terbesar
//     nama   = nama subkategori + nomor urut per subkategori (mis. "cincin 1"), nomor lanjut dari yang terbesar
//     barcode = SKU gudang (bukan kode toko), foto = foto SKU di gudang (kalau sudah ada)
//     harga jual = Ecer, HPP = HPP, sku_gudang = SKU (tertaut, jadi bisa dimutasi stoknya).
// - Kalau SKU sudah ada di Barang Toko (dicek lewat sku_gudang), tidak dibuat dobel (dilewati).
// - Kalau satu SKU dipilih & jumlah diisi, stok gudang ikut dipindah ke toko
//   lewat fungsi database toko_mutasi_dari_gudang (atomik, tercatat riwayatnya).
// - Beberapa SKU sekaligus: jumlah stok yang dipindah DIKETIK per SKU (maksimal stok gudang SKU itu). Kolom kosong / 0 =
//   barangnya saja yang didaftarkan (stok toko 0).
// Dipanggil dari Master Barang (role superappa) dan dari Barang Toko > "Dari Master".
// =========================================================

// Tujuan & sumber (default = perilaku lama: Master Barang -> Barang Toko):
//   tujuan "toko"   + sumber "gudang" : Master Barang -> Barang Toko   (kode ENT-0001)
//   tujuan "tiktok" + sumber "gudang" : Master Barang -> Barang TikTok (kode ENT-TT-0001, plus kode live)
//   tujuan "toko"   + sumber "tiktok" : Barang TikTok -> Barang Toko   (daftar[].stok = stok TIKTOK, daftar[].kodeTiktok = kode barang TikTok)
// Kolom harga/HPP/kategori/nama tetap diambil dari Master Barang (daftar = baris sku_master).
const KONFIG = {
  toko: { tabel: "master_toko", label: "Barang Toko", awalan: (e) => e, rpcDariGudang: "rpc/toko_mutasi_dari_gudang", labelKode: "Kode Toko" },
  tiktok: { tabel: "master_tiktok", label: "Barang TikTok", awalan: (e) => `${e}-TT`, rpcDariGudang: "rpc/tiktok_mutasi_dari_gudang", labelKode: "Kode TikTok" },
};

export default function PindahKeToko({ daftar, labelKategori, labelSubkategori, fotoPerSku, onClose, onSelesai, tujuan = "toko", sumber = "gudang" }) {
  const K = KONFIG[tujuan] || KONFIG.toko;
  const dariTiktok = sumber === "tiktok";
  const namaSumber = dariTiktok ? "TikTok" : "gudang";
  const [kodeLive, setKodeLive] = useState({}); // sku -> kode live (hanya tujuan tiktok)
  const tunggal = daftar.length === 1 ? daftar[0] : null;
  const [sudahAda, setSudahAda] = useState(null); // Map sku_gudang -> kode toko yang sudah ada
  const [semuaToko, setSemuaToko] = useState([]); // { kode, nama } seluruh barang toko (untuk nomor urut)
  const [qty, setQty] = useState("");
  const [qtyMap, setQtyMap] = useState({}); // beberapa SKU: sku -> jumlah (teks) yang dipindah
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errPdf, setErrPdf] = useState("");
  const [hasil, setHasil] = useState(null); // { dibuat, dilewati, gagal: [], dipindah }

  useEffect(() => {
    const daftarSku = daftar.map((s) => `"${String(s.sku).replace(/"/g, "")}"`).join(",");
    Promise.all([
      sb(`${K.tabel}?select=kode,sku_gudang&sku_gudang=in.(${encodeURIComponent(daftarSku)})`),
      sbAll(`${K.tabel}?select=kode,nama`),
    ])
      .then(([ada, semua]) => {
        setSudahAda(new Map((ada || []).map((x) => [x.sku_gudang, x.kode])));
        setSemuaToko(semua || []);
      })
      .catch(() => setSudahAda(new Map()));
  }, [daftar]);

  const jalankan = async () => {
    const n = qty === "" ? 0 : parseInt(qty, 10);
    if (qty !== "" && !(n > 0)) return setError("Jumlah harus lebih dari 0, atau kosongkan.");
    if (n > 0 && tunggal && n > (Number(tunggal.stok) || 0)) {
      return setError(`Stok ${namaSumber} ${tunggal.sku} hanya ${Number(tunggal.stok) || 0}.`);
    }
    if (!tunggal) {
      for (const s of daftar) {
        const v = qtyMap[s.sku];
        if (v === undefined || v === "") continue;
        const j = parseInt(v, 10);
        const stokG = Math.floor(Number(s.stok) || 0);
        if (!(j >= 0)) return setError(`Jumlah ${s.sku} tidak valid.`);
        if (j > stokG) return setError(`Stok ${namaSumber} ${s.sku} hanya ${stokG}.`);
      }
    }
    setSaving(true);
    setError("");
    const out = { dibuat: 0, dilewati: 0, gagal: [], dipindah: 0, rincian: [], waktu: new Date(), catatan: catatan.trim(), info: [] };
    const prefix = K.awalan(String(entitasSesi()).toUpperCase());
    // Nomor urut kode toko: lanjut dari nomor terbesar yang sudah ada untuk entitas ini.
    let nomorKode = 0;
    for (const t of semuaToko) {
      const m = String(t.kode || "").toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) nomorKode = Math.max(nomorKode, parseInt(m[1], 10));
    }
    // Nomor urut nama per subkategori ("cincin"): lanjut dari yang terbesar.
    const nomorNama = new Map();
    const urutNama = (label) => {
      if (!nomorNama.has(label)) {
        let mx = 0;
        const awal = `${label} `;
        for (const t of semuaToko) {
          const nm = String(t.nama || "");
          if (nm.startsWith(awal) && /^\d+$/.test(nm.slice(awal.length))) mx = Math.max(mx, parseInt(nm.slice(awal.length), 10));
        }
        nomorNama.set(label, mx);
      }
      const n = nomorNama.get(label) + 1;
      nomorNama.set(label, n);
      return n;
    };
    for (const s of daftar) {
      let kodeToko = sudahAda?.get(s.sku) || null;
      // Rincian untuk PDF "barang yang diambil": dicatat begitu barang toko dibuat / stoknya mau dipindah, qty diisi setelah pemindahan berhasil.
      const rin = { sku: s.sku, kode: kodeToko, nama: s.nama || s.sku, qty: 0 };
      let tercatat = false;
      const catat = () => {
        if (tercatat) return;
        tercatat = true;
        rin.kode = kodeToko;
        out.rincian.push(rin);
      };
      try {
        if (kodeToko) {
          out.dilewati += 1;
        } else {
          if (!(Number(s.ecer) > 0)) throw new Error("Harga Ecer kosong/0 — isi harga dulu di Master Barang.");
          // Subkategori kosong/tidak ada di Master Data -> labelFor mengembalikan "—": jangan dipakai jadi nama ("— 1").
          // Barang TikTok: nama = SKU (permintaan), tanpa nomor urut subkategori.
          const labelSubMentah = (labelSubkategori ? labelSubkategori(s.subkategori) : "") || "";
          const labelSub = tujuan === "tiktok" || labelSubMentah === "—" ? "" : labelSubMentah;
          kodeToko = `${prefix}-${String(nomorKode + 1).padStart(4, "0")}`;
          const nama = tujuan === "tiktok" ? s.sku : labelSub ? `${labelSub} ${urutNama(labelSub)}` : (s.nama || "").trim() || s.sku;
          const live = tujuan === "tiktok" ? rapikanKodeLive(kodeLive[s.sku]) : "";
          await sb(K.tabel, {
            method: "POST",
            body: JSON.stringify({
              kode: kodeToko,
              ...(tujuan === "tiktok" ? { kode_live: live || null } : {}),
              nama,
              kategori: labelKategori(s.kategori) || null,
              barcode: s.sku, // barang dari Master Barang: barcode = SKU gudang (bukan kode toko)
              harga_jual: Math.round(Number(s.ecer) || 0),
              hpp: Math.round(Number(s.hpp) || 0),
              harga_grosir: Number(s.grosir) > 0 ? Math.round(Number(s.grosir)) : null,
              sku_gudang: s.sku,
              foto_url: fotoPerSku?.get(s.sku) || null,
              nonaktif: false,
            }),
          });
          nomorKode += 1; // naik hanya kalau berhasil disimpan
          out.dibuat += 1;
          if (live) {
            // kode live ikut dicatat di daftar Kode Live TikTok (dipakai Rincian Penjualan). Gagal di sini tidak membatalkan apa pun.
            try {
              const r = await sinkronAliasKodeLive(live, s.sku);
              if (r.status === "beda") out.info.push(`Kode live ${live} di daftar Kode Live TikTok sudah dipetakan ke ${r.skuLama} (tidak ditimpa).`);
            } catch {
              out.info.push(`Kode live ${live} belum tercatat di daftar Kode Live TikTok.`);
            }
          }
          rin.nama = nama;
          catat();
        }
        const jml = tunggal ? n : parseInt(qtyMap[s.sku] || "0", 10) || 0;
        if (jml > 0) {
          catat();
          await sb(dariTiktok ? "rpc/toko_ambil_dari_tiktok" : K.rpcDariGudang, {
            method: "POST",
            body: JSON.stringify({
              p: dariTiktok
                ? { entitas: entitasSesi(), kode: kodeToko, kode_tiktok: s.kodeTiktok, qty: jml, catatan: catatan.trim() || null }
                : { entitas: entitasSesi(), kode: kodeToko, qty: jml, catatan: catatan.trim() || null },
            }),
          });
          out.dipindah += jml;
          rin.qty = jml;
        }
      } catch (e) {
        out.gagal.push(`${s.sku}: ${pesanError(e)}`);
      }
    }
    setSaving(false);
    setHasil(out);
  };

  const unduhPdf = async () => {
    setErrPdf("");
    try {
      let namaUsaha = String(entitasSesi());
      try {
        const e = await sb(`master_data?select=kode,label&tipe=eq.entitas&kode=eq.${encodeURIComponent(entitasSesi())}`);
        if (e?.[0]?.label) namaUsaha = e[0].label;
      } catch {
        /* pakai kode entitas */
      }
      const ses = getSession();
      const { buatPdfPemindahanToko } = await import("../../lib/PdfPemindahanToko");
      buatPdfPemindahanToko({
        namaUsaha,
        petugas: ses?.nama || ses?.username || "",
        waktu: hasil.waktu,
        catatan: hasil.catatan,
        baris: hasil.rincian,
        labelKode: K.labelKode,
        judul: dariTiktok ? "BARANG DIAMBIL DARI BARANG TIKTOK KE BARANG TOKO" : tujuan === "tiktok" ? "BARANG DIAMBIL DARI MASTER BARANG KE BARANG TIKTOK" : "",
      });
    } catch (e) {
      setErrPdf(`Gagal membuat PDF: ${e?.message || e}`);
    }
  };

  if (hasil) {
    return (
      <Kerangka judul={`Hasil pemindahan ke ${K.label}`} onClose={() => onSelesai(hasil)}>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-emerald-300"><Check size={15} /> {hasil.dibuat} barang ditambahkan ke {K.label}</div>
          {hasil.dilewati > 0 && <div className="text-slate-400">{hasil.dilewati} sudah ada di {K.label} (tidak dibuat dobel)</div>}
          {hasil.dipindah > 0 && <div className="text-slate-300">{hasil.dipindah} stok dipindah dari {namaSumber} ke {tujuan === "tiktok" ? "TikTok" : "toko"}</div>}
          {hasil.info.map((t) => <div key={t} className="text-xs text-amber-300">{t}</div>)}
        </div>
        {hasil.gagal.length > 0 && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">{hasil.gagal.map((g) => <div key={g}>{g}</div>)}</div>
          </div>
        )}
        {hasil.rincian.length > 0 && (
          <button onClick={unduhPdf} className="w-full flex items-center justify-center gap-2 border border-amber-500/60 hover:bg-amber-500/10 text-amber-300 font-semibold py-3 rounded-2xl">
            <FileDown size={16} /> Unduh PDF barang yang diambil ({hasil.rincian.length} barang)
          </button>
        )}
        <Galat pesan={errPdf} />
        <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">
          Selesai
        </button>
      </Kerangka>
    );
  }

  return (
    <Kerangka judul={tunggal ? `Pindahkan ke ${K.label} — ${tunggal.sku}` : `Pindahkan ${daftar.length} SKU ke ${K.label}`} onClose={onClose}>
      {tunggal ? (
        <>
          <div className="text-sm text-slate-300">{tunggal.nama || tunggal.sku}</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Harga jual {tujuan === "tiktok" ? "(Ecer)" : "toko"}</div>
              <div className="font-semibold text-amber-400">{fmtRp(tunggal.ecer)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">HPP</div>
              <div className="font-semibold">{fmtRp(tunggal.hpp)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Stok {namaSumber}</div>
              <div className="font-semibold">{Number(tunggal.stok) || 0}</div>
            </div>
          </div>
          {sudahAda?.has(tunggal.sku) && (
            <div className="text-xs text-sky-300">Sudah ada di {K.label} — isi jumlah di bawah untuk menambah stoknya.</div>
          )}
          {tujuan === "tiktok" && !sudahAda?.has(tunggal.sku) && (
            <label className="block">
              <div className="text-xs text-slate-400 mb-1">Kode live (opsional, bisa diisi nanti lewat Ubah)</div>
              <input value={kodeLive[tunggal.sku] || ""} onChange={(e) => setKodeLive((m) => ({ ...m, [tunggal.sku]: e.target.value }))} className={`${inp} font-mono`} placeholder="mis. A-11" />
            </label>
          )}
          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Jumlah stok dipindah ke {tujuan === "tiktok" ? "TikTok" : "toko"} (kosongkan kalau hanya mendaftarkan barang)</div>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inp} placeholder="0" />
          </label>
          <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={inp} />
        </>
      ) : (
        <div className="text-sm text-slate-300 space-y-2">
          <div>
            {daftar.length} SKU akan didaftarkan ke {K.label} dengan harga jual = Ecer dan HPP dari Master Barang.
            {sudahAda && sudahAda.size > 0 && ` ${sudahAda.size} di antaranya sudah ada di ${K.label} (tidak dibuat dobel).`}
          </div>
          <div className="text-xs text-slate-400">Ketik jumlah stok {namaSumber} yang diambil untuk tiap barang. Kosong / 0 = barangnya saja yang didaftarkan (stok 0).{tujuan === "tiktok" ? " Kode live boleh dikosongkan dulu." : ""}</div>
          <div className="max-h-[40vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
            {daftar.map((s) => {
              const stokG = Math.floor(Number(s.stok) || 0);
              return (
                <div key={s.sku} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-200 truncate">{s.nama || s.sku}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {s.sku} · stok {namaSumber} {stokG}
                      {sudahAda?.has(s.sku) ? ` · sudah di ${K.label} (stok ditambah)` : ""}
                    </div>
                  </div>
                  {tujuan === "tiktok" && !sudahAda?.has(s.sku) && (
                    <input
                      value={kodeLive[s.sku] || ""}
                      onChange={(e) => setKodeLive((m) => ({ ...m, [s.sku]: e.target.value }))}
                      placeholder="kode live"
                      className={`${inp} !w-24 font-mono`}
                    />
                  )}
                  <input
                    value={qtyMap[s.sku] ?? ""}
                    onChange={(e) => setQtyMap((m) => ({ ...m, [s.sku]: e.target.value.replace(/\D/g, "") }))}
                    inputMode="numeric"
                    disabled={stokG <= 0}
                    placeholder={stokG <= 0 ? "stok 0" : "0"}
                    className={`${inp} !w-20 text-right tabular-nums disabled:opacity-40`}
                  />
                </div>
              );
            })}
          </div>
          <div className="text-xs text-slate-400">
            Total dipindah: <b className="text-slate-200">{daftar.reduce((a, s) => a + (parseInt(qtyMap[s.sku] || "0", 10) || 0), 0)}</b> pcs
          </div>
          {daftar.some((s) => (parseInt(qtyMap[s.sku] || "0", 10) || 0) > 0) && (
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Catatan (opsional)" className={inp} />
          )}
        </div>
      )}
      <Galat pesan={error} />
      <button
        onClick={jalankan}
        disabled={saving || sudahAda === null}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold py-3.5 rounded-2xl"
      >
        {saving && <Loader2 size={15} className="animate-spin" />} Pindahkan
      </button>
    </Kerangka>
  );
}