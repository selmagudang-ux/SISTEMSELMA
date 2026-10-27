import { useMemo, useRef, useState } from "react";
import { ListOrdered, Upload, Download, Trash2, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, inputClass, btnFilled, btnOutlined } from "../components/ui";
import { bacaPdfResi, urutkanResi, ringkasPacking, buatPdfTerurut, MODE_URUT } from "../lib/urutResi";

// =========================================================
// URUT RESI — upload PDF resi (Shopee / TikTok Shop / Tokopedia), otomatis
// diurutkan per produk / kurir / kode rak, lalu download PDF terurut.
// Semua diproses di browser (file tidak dikirim ke server).
// Logika: lib/urutResi.js.
// =========================================================

export default function UrutResi({ showToast }) {
  const [files, setFiles] = useState([]); // [{name, buf}]
  const [labels, setLabels] = useState([]);
  const [mode, setMode] = useState("produk");
  const [pesan, setPesan] = useState(null); // {teks, ok}
  const [sibuk, setSibuk] = useState(false);
  const [seret, setSeret] = useState(false);
  const inputRef = useRef(null);
  const seen = useRef(new Set());

  const urut = useMemo(() => urutkanResi(labels, mode), [labels, mode]);
  const ringkasan = useMemo(() => ringkasPacking(labels), [labels]);

  async function muat(daftar) {
    const pdfs = Array.from(daftar || []).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfs.length) { setPesan({ teks: "Pilih file PDF.", ok: false }); return; }
    setSibuk(true);
    let dup = 0, bad = 0, mp = 0;
    const gagal = [];
    const fileBaru = [...files];
    const labelBaru = [...labels];
    for (let n = 0; n < pdfs.length; n++) {
      const file = pdfs[n];
      setPesan({ teks: `Membaca ${file.name} (${n + 1}/${pdfs.length}) ...`, ok: true });
      try {
        const buf = await file.arrayBuffer();
        const ls = await bacaPdfResi(buf);
        const si = fileBaru.length;
        fileBaru.push({ name: file.name, buf });
        ls.forEach((l) => {
          if (!l.rows.length) bad++;
          if (l.pages.length > 1) mp++;
          if (l.resi !== "?" && seen.current.has(l.resi)) { dup++; return; }
          seen.current.add(l.resi);
          l.src = si;
          labelBaru.push(l);
        });
      } catch (e) {
        gagal.push(file.name);
      }
    }
    setSibuk(false);
    if (!labelBaru.length) {
      setPesan({ teks: "Tidak menemukan resi di file yang dipilih. Pastikan ini PDF resi.", ok: false });
      return;
    }
    setFiles(fileBaru);
    setLabels(labelBaru);
    setPesan({
      ok: true,
      teks:
        `${labelBaru.length} resi dari ${fileBaru.length} file` +
        (dup ? `, ${dup} resi ganda dilewati` : "") +
        (mp ? `, ${mp} resi lebih dari 1 halaman (halamannya tetap berurutan)` : "") +
        (bad ? `, ${bad} halaman tanpa data produk (urutan akhir)` : "") +
        (gagal.length ? `. Gagal dibaca: ${gagal.join(", ")}` : "") + ".",
    });
  }

  async function unduh() {
    setSibuk(true);
    try {
      const bytes = await buatPdfTerurut(files, urut);
      const nama = (files.length > 1 ? "Resi_gabungan" : files[0].name.replace(/\.pdf$/i, "")) + "_urut.pdf";
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = nama;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast?.(`File siap: ${nama}`);
    } catch (e) {
      showToast?.("Gagal membuat PDF: " + (e?.message || e), "error");
    } finally {
      setSibuk(false);
    }
  }

  function kosongkan() {
    setFiles([]); setLabels([]); seen.current = new Set(); setPesan(null);
  }

  // Baris tabel + judul grup (bukan di mode rak)
  const baris = [];
  let terakhir = "";
  urut.forEach((l, i) => {
    if (mode !== "rak") {
      const pre = mode === "kurir" ? `${l.cur} - ` : "";
      const nm = l.tt ? l.code : `${l.cat} ${l.code}`;
      const gk = pre + (l.mixed ? "Campur" : nm);
      if (gk !== terakhir) {
        terakhir = gk;
        baris.push({ grup: pre + (l.mixed ? "Campur (lebih dari 1 produk)" : nm), id: "g" + i });
      }
    }
    const hal = l.pages.length > 1 ? `${l.page + 1}-${l.pages[l.pages.length - 1] + 1}` : `${l.page + 1}`;
    baris.push({
      id: "r" + i, no: i + 1,
      asal: (files.length > 1 ? `F${l.src + 1} h` : "") + hal,
      resi: l.resi,
      produk: l.rows.map((r) => `${r.key} x${r.qty}`).join(", ") || "?",
      rak: l.rack === "~" ? "-" : l.rack,
    });
  });

  return (
    <div>
      <PageHeader
        title="Urut Resi"
        description="Upload PDF resi (Shopee, TikTok Shop, Tokopedia — J&T, GTL, SPX). Otomatis diurutkan per produk supaya packing lebih cepat. File diproses di browser, tidak dikirim ke server."
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setSeret(true); }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => { e.preventDefault(); setSeret(false); muat(e.dataTransfer.files); }}
        onClick={() => !sibuk && inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          seret ? "border-md-primary bg-md-primary/5" : "border-md-outline-variant hover:border-md-primary"
        }`}
      >
        {sibuk ? <Loader2 className="mx-auto mb-2 animate-spin text-md-primary" size={28} /> : <Upload className="mx-auto mb-2 text-md-primary" size={28} />}
        <div className="font-medium text-md-on-surface">Klik atau tarik satu atau beberapa file PDF resi ke sini</div>
        <div className="text-xs text-md-on-surface-variant mt-1">1 halaman = 1 resi</div>
        <input
          ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
          onChange={(e) => { muat(e.target.files); e.target.value = ""; }}
        />
      </div>
      {pesan && (
        <div className={`text-sm mt-3 ${pesan.ok ? "text-emerald-600" : "text-red-600"}`}>{pesan.teks}</div>
      )}

      {labels.length === 0 ? (
        !pesan && <div className="mt-6"><EmptyState label="Belum ada resi. Upload PDF resi untuk mulai." /></div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-md-outline-variant p-4">
            <label className="text-sm flex items-center gap-2">
              Urutkan:
              <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODE_URUT.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <button className={btnOutlined} onClick={kosongkan} disabled={sibuk}>
                <Trash2 size={16} /> Kosongkan
              </button>
              <button className={btnFilled} onClick={unduh} disabled={sibuk}>
                <Download size={16} /> Download PDF terurut
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-md-outline-variant p-4">
            <h2 className="text-sm font-medium mb-2">Ringkasan packing</h2>
            <div className="flex flex-wrap gap-1.5">
              {ringkasan.map((r) => (
                <span key={r.key} className="rounded-full border border-md-outline-variant px-2.5 py-0.5 text-xs">
                  {r.key}: {r.qty} pcs
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-md-outline-variant p-4 overflow-x-auto">
            <h2 className="text-sm font-medium mb-2 flex items-center gap-1.5"><ListOrdered size={16} /> Urutan cetak</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-md-on-surface-variant">
                  <th className="py-1.5 pr-3">No</th><th className="pr-3">Asal</th><th className="pr-3">Resi</th>
                  <th className="pr-3">Produk</th><th>Rak</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) =>
                  b.grup ? (
                    <tr key={b.id}><td colSpan={5} className="py-1.5 px-2 font-semibold text-md-primary bg-md-surface-variant/40">{b.grup}</td></tr>
                  ) : (
                    <tr key={b.id} className="border-t border-md-outline-variant/50 whitespace-nowrap">
                      <td className="py-1.5 pr-3">{b.no}</td><td className="pr-3">{b.asal}</td>
                      <td className="pr-3">{b.resi}</td><td className="pr-3">{b.produk}</td><td>{b.rak}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
