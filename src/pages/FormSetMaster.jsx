import { useMemo, useState } from "react";
import { Search, Plus, Loader2, Trash2, X } from "lucide-react";
import { sb, fmtRp, calcHarga } from "../lib/api";
import { InputRupiah } from "../components/ui";
import { Kerangka, Galat, inp } from "./kasir/BarangToko";
import { KATEGORI_SET, adalahSet } from "../lib/setMaster";

const pesanDb = (e) => {
  const m = String(e?.message || e || "");
  if (/komponen|schema cache|PGRST204|column/i.test(m)) {
    return "Kolom Set belum ada di database. Jalankan supabase/migrations/20261125_master_barang_set.sql di Supabase > SQL Editor.";
  }
  if (/duplicate key|sku_master_sku/i.test(m)) return "SKU ini sudah dipakai.";
  return m || "Gagal menyimpan.";
};

// ---------------------------------------------------------
// Tambah / ubah SET di Master Barang. Isi dipilih dari SKU biasa (bukan Set lain).
export function FormSetMaster({ barang, skuMaster, settings, onSimpan, onClose }) {
  const baru = !barang;
  const biasa = useMemo(() => skuMaster.filter((s) => !adalahSet(s) && !s.nonaktif), [skuMaster]);
  const peta = useMemo(() => new Map(biasa.map((s) => [s.sku, s])), [biasa]);
  const [f, setF] = useState({
    sku: barang?.sku || "",
    nama: barang?.nama || "",
    grosir: barang?.grosir ?? "",
    tengah: barang?.tengah ?? "",
    ecer: barang?.ecer ?? "",
  });
  const [komp, setKomp] = useState(() => (barang?.komponen || []).map((k) => ({ sku: k.sku, qty: String(k.qty || 1) })));
  const [cari, setCari] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const hasilCari = useMemo(() => {
    const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return [];
    const sudah = new Set(komp.map((k) => k.sku));
    return biasa
      .filter((s) => !sudah.has(s.sku))
      .filter((s) => {
        const j = [s.sku, s.nama, s.barcode_supplier].filter(Boolean).join(" ").toLowerCase();
        return kata.every((x) => j.includes(x));
      })
      .slice(0, 8);
  }, [cari, biasa, komp]);

  const qtyDari = (k) => Math.max(parseInt(k.qty, 10) || 1, 1);
  const jumlah = (kolom) => komp.reduce((n, k) => n + (Number(peta.get(k.sku)?.[kolom]) || 0) * qtyDari(k), 0);
  const hppSet = jumlah("hpp");

  const isiDariJumlah = () =>
    setF((p) => ({ ...p, grosir: Math.round(jumlah("grosir")), tengah: Math.round(jumlah("tengah")), ecer: Math.round(jumlah("ecer")) }));

  const simpan = async () => {
    const sku = f.sku.trim();
    if (!sku || !f.nama.trim()) return setError("SKU dan nama set wajib diisi.");
    if (baru && skuMaster.some((s) => String(s.sku).trim().toLowerCase() === sku.toLowerCase())) {
      return setError(`SKU ${sku} sudah ada di Master Barang.`);
    }
    if (komp.length < 2) return setError("Set minimal berisi 2 SKU. Untuk 1 barang, pakai SKU biasa.");
    if (!(Number(f.ecer) > 0)) return setError("Harga Ecer harus lebih dari 0.");
    const daftar = komp.map((k) => ({ sku: k.sku, qty: qtyDari(k) }));
    const asli = Math.round(jumlah("harga_asli"));
    let dasar = asli;
    try {
      if (settings) dasar = calcHarga(asli, settings).hargaDasar;
    } catch {
      /* pakai jumlah harga asli */
    }
    const data = {
      nama: f.nama.trim(),
      komponen: daftar,
      hpp: Math.round(hppSet),
      harga_asli: asli,
      harga_dasar: dasar,
      grosir: Math.round(Number(f.grosir) || 0),
      tengah: Math.round(Number(f.tengah) || 0),
      ecer: Math.round(Number(f.ecer) || 0),
    };
    setSaving(true);
    setError("");
    try {
      if (baru) {
        await sb("sku_master", {
          method: "POST",
          // Kolom rincian di sku_master NOT NULL di sebagian database -> kirim teks kosong, bukan dihilangkan.
          body: JSON.stringify({ sku, bahan: "", peruntukan: "", kategori: KATEGORI_SET, subkategori: "", model: "", warna: "", ukuran: "", stok: 0, ...data }),
        });
      } else {
        await sb(`sku_master?id=eq.${barang.id}`, { method: "PATCH", body: JSON.stringify(data) });
      }
      onSimpan(baru ? `Set ${sku} dibuat` : `Set ${sku} disimpan`);
    } catch (e) {
      setError(pesanDb(e));
      setSaving(false);
    }
  };

  return (
    <Kerangka judul={baru ? "Tambah Set" : `Ubah Set ${barang.sku}`} onClose={saving ? () => {} : onClose} lebar="sm:max-w-lg">
      <div className="text-[11px] text-slate-500">
        Set = satu SKU berisi beberapa SKU lain. Stok Set tidak disimpan sendiri: dihitung dari stok SKU isinya (yang paling sedikit), HPP = jumlah HPP isinya.
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">SKU Set</div>
        <input value={f.sku} onChange={(e) => set("sku")(e.target.value)} disabled={!baru} className={`${inp} font-mono disabled:opacity-60`} placeholder="mis. SET-GJR-01" />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Nama set</div>
        <input value={f.nama} onChange={(e) => set("nama")(e.target.value)} className={inp} />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Isi set (SKU di Master Barang)</div>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          <Search size={14} className="text-slate-500" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari SKU / nama…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-slate-600" />
        </div>
        {hasilCari.length > 0 && (
          <div className="mt-1 border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
            {hasilCari.map((s) => (
              <button
                key={s.sku}
                type="button"
                onClick={() => {
                  setKomp((p) => [...p, { sku: s.sku, qty: "1" }]);
                  setCari("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-800/60"
              >
                <span className="font-mono text-xs text-slate-300 truncate">{s.sku}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500 flex-shrink-0">
                  Stok {Number(s.stok) || 0} <Plus size={12} className="text-amber-400" />
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {komp.length === 0 && <div className="text-[11px] text-slate-600">Belum ada isi. Cari SKU di atas lalu klik untuk menambah.</div>}
          {komp.map((k, i) => {
            const c = peta.get(k.sku);
            return (
              <div key={k.sku} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-slate-200 truncate">{k.sku}</div>
                  <div className="text-[10px] text-slate-500">{c ? `Stok ${Number(c.stok) || 0} · HPP ${fmtRp(c.hpp)}` : "SKU tidak ditemukan / nonaktif"}</div>
                </div>
                <input
                  value={k.qty}
                  onChange={(e) => setKomp((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                  inputMode="numeric"
                  title="Jumlah per set"
                  className="w-14 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sm text-center outline-none focus:border-amber-500"
                />
                <button type="button" onClick={() => setKomp((p) => p.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400" title="Buang">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-slate-400 mt-2">HPP set (jumlah HPP isi): <span className="text-slate-200 font-semibold">{fmtRp(hppSet)}</span></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-slate-400">Harga jual set</div>
          <button type="button" onClick={isiDariJumlah} disabled={komp.length === 0} className="text-[11px] text-amber-400 hover:text-amber-300 disabled:opacity-40 underline">
            Isi dari jumlah harga isi
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Grosir</div>
            <InputRupiah value={f.grosir} onChange={set("grosir")} className={inp} placeholder="0" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Tengah</div>
            <InputRupiah value={f.tengah} onChange={set("tengah")} className={inp} placeholder="0" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">Ecer</div>
            <InputRupiah value={f.ecer} onChange={set("ecer")} className={inp} placeholder="0" />
          </div>
        </div>
      </div>
      <Galat pesan={error} />
      <button onClick={simpan} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold py-3.5 rounded-2xl">
        {saving && <Loader2 size={15} className="animate-spin" />} Simpan Set
      </button>
    </Kerangka>
  );
}

// ---------------------------------------------------------
// Hapus beberapa SKU yang dipilih di Master Barang. Sama seperti "Hapus SKU" satuan (barang, riwayat stok, penempatan rak ikut
// terhapus; SKU yang masih dipakai di riwayat transaksi cuma dinonaktifkan), tapi SKU yang masih jadi isi Set di luar pilihan dilewati.
const kutip = (list) => encodeURIComponent(`(${list.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")})`);

export function FormHapusSkuTerpilih({ terpilih, skuMaster, items, onSelesai, onClose }) {
  const idPilih = useMemo(() => new Set(terpilih.map((s) => s.sku)), [terpilih]);
  const { akan, dipakai, jumlahBarang, adaStok } = useMemo(() => {
    const akan = [];
    const dipakai = [];
    for (const s of terpilih) {
      const set = skuMaster.filter((x) => adalahSet(x) && !idPilih.has(x.sku) && x.komponen.some((k) => k.sku === s.sku));
      if (!adalahSet(s) && set.length) dipakai.push({ s, set });
      else akan.push(s);
    }
    const sku = new Set(akan.filter((s) => !adalahSet(s)).map((s) => s.sku));
    const jumlahBarang = (items || []).filter((i) => sku.has(i.sku)).length;
    const adaStok = akan.filter((s) => !adalahSet(s) && (Number(s.stok) || 0) > 0);
    return { akan, dipakai, jumlahBarang, adaStok };
  }, [terpilih, skuMaster, items, idPilih]);
  const [ketik, setKetik] = useState("");
  const [jalan, setJalan] = useState(false);
  const [hasil, setHasil] = useState(null);

  const mulai = async () => {
    setJalan(true);
    let terhapus = 0;
    let dinonaktifkan = 0;
    const gagal = [];
    const hapusSatu = async (s) => {
      try {
        await sb(`sku_master?id=eq.${s.id}`, { method: "DELETE" });
        terhapus++;
      } catch (e) {
        if (e?.pgCode === "23503") {
          try {
            await sb(`sku_master?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify({ nonaktif: true }) });
            dinonaktifkan++;
          } catch {
            gagal.push(s.sku);
          }
        } else gagal.push(s.sku);
      }
    };
    // Set dulu (isinya tidak boleh hilang lebih dulu), lalu SKU biasa.
    for (const s of akan.filter(adalahSet)) await hapusSatu(s);
    const biasa = akan.filter((s) => !adalahSet(s));
    for (let i = 0; i < biasa.length; i += 40) {
      const potong = biasa.slice(i, i + 40);
      const q = kutip(potong.map((s) => s.sku));
      try {
        // Urutan mengikuti foreign key ke sku_master.sku: items, stock_history, penempatan dulu.
        await sb(`items?sku=in.${q}`, { method: "DELETE" });
        await sb(`stock_history?sku=in.${q}`, { method: "DELETE" });
        await sb(`penempatan?sku=in.${q}`, { method: "DELETE" });
      } catch {
        gagal.push(...potong.map((s) => s.sku));
        continue;
      }
      try {
        await sb(`sku_master?id=in.(${potong.map((s) => s.id).join(",")})`, { method: "DELETE" });
        terhapus += potong.length;
      } catch {
        // Salah satunya masih dipakai di riwayat transaksi -> coba satu per satu, yang terikat dinonaktifkan.
        for (const s of potong) await hapusSatu(s);
      }
    }
    setJalan(false);
    setHasil({ terhapus, dinonaktifkan, gagal });
  };

  const bolehHapus = ketik.trim().toUpperCase() === "HAPUS" && akan.length > 0 && !jalan;

  return (
    <Kerangka judul={`Hapus ${terpilih.length} SKU terpilih`} onClose={jalan ? () => {} : hasil ? () => onSelesai(hasil) : onClose}>
      {hasil ? (
        <>
          <div className="text-sm text-slate-200"><b className="text-emerald-300">{hasil.terhapus}</b> SKU dihapus.</div>
          {hasil.dinonaktifkan > 0 && <div className="text-xs text-amber-300">{hasil.dinonaktifkan} SKU masih dipakai di riwayat transaksi, jadi dinonaktifkan (bukan dihapus permanen).</div>}
          {hasil.gagal.length > 0 && <Galat pesan={`Gagal: ${hasil.gagal.slice(0, 10).join(", ")}${hasil.gagal.length > 10 ? ", …" : ""}`} />}
          <button onClick={() => onSelesai(hasil)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-3.5 rounded-2xl">Selesai</button>
        </>
      ) : (
        <>
          <div className="text-sm text-slate-200"><b className="text-red-300">{akan.length}</b> SKU akan dihapus permanen, beserta {jumlahBarang} barang yang tercatat, penempatan rak, dan riwayat stoknya. Tidak bisa dibatalkan.</div>
          {adaStok.length > 0 && (
            <div className="text-xs text-red-300">
              {adaStok.length} SKU masih punya stok: {adaStok.slice(0, 6).map((s) => `${s.sku} (${s.stok})`).join(", ")}{adaStok.length > 6 ? ", …" : ""}.
            </div>
          )}
          {dipakai.length > 0 && (
            <div className="text-xs text-amber-300">
              {dipakai.length} SKU dilewati karena masih jadi isi Set yang tidak ikut dipilih: {dipakai.slice(0, 5).map((d) => `${d.s.sku} → ${d.set[0].sku}`).join(", ")}{dipakai.length > 5 ? ", …" : ""}.
            </div>
          )}
          <div className="max-h-32 overflow-y-auto text-[11px] font-mono text-slate-500 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 space-y-0.5">
            {akan.map((s) => <div key={s.id} className="truncate">{s.sku}{adalahSet(s) ? "  (Set)" : ""}</div>)}
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Ketik <b className="text-slate-200">HAPUS</b> untuk melanjutkan</div>
            <input value={ketik} onChange={(e) => setKetik(e.target.value)} className={inp} />
          </div>
          <button onClick={mulai} disabled={!bolehHapus} className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl">
            {jalan ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Hapus {akan.length} SKU
          </button>
        </>
      )}
    </Kerangka>
  );
}
