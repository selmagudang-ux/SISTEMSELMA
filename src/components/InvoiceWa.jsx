import { useState, useMemo, useEffect } from "react";
import { MessageCircle, FileText } from "lucide-react";
import { ModalShell, Field, SearchableSelect, inputClass } from "./ui";
import {
  sb, fmtRp, normalisasiWa, rekeningEntitasSesi, entitasSesi, namaUsahaEntitas, alamatEntitas,
} from "../lib/api";
import { buatPdfInvoice } from "../lib/PdfInvoice";

// =========================================================
// INVOICE WHATSAPP — Penagihan Hutang & Pencairan (Reseller)
//
// Tanpa API berbayar: pesan invoice disusun sebagai TEKS, lalu dibuka lewat
// link https://wa.me/<nomor>?text=<pesan>. WhatsApp (HP / WhatsApp Web)
// terbuka dengan nomor + isi pesan sudah terisi, admin tinggal tekan Kirim.
// Tidak ada tabel baru, tidak ada biaya. Keterbatasan wa.me: tidak bisa
// melampirkan file — jadi invoice dikirim sebagai teks rapi.
// =========================================================

const tglId = (v) => {
  const d = v ? new Date(v) : new Date();
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

// Nomor lokal/internasional apa pun -> format wa.me (tanpa "+", awalan 62).
export function nomorWaLink(wa) {
  const n = normalisasiWa(wa);
  return n ? `62${n}` : "";
}

export function linkWa(wa, pesan) {
  return `https://wa.me/${nomorWaLink(wa)}?text=${encodeURIComponent(pesan)}`;
}

// baris: [{nomor_pesanan, created_at, sisa}]
export function susunPesanTagihan({ namaUsaha, pelanggan, baris, rekeningLabel }) {
  const total = baris.reduce((a, b) => a + (Number(b.sisa) || 0), 0);
  const rincian = baris
    .map((b, i) => `${i + 1}. ${b.nomor_pesanan} (${tglId(b.created_at)}) — ${fmtRp(b.sisa)}`)
    .join("\n");
  return [
    `*INVOICE PENAGIHAN*`,
    namaUsaha,
    ``,
    `Kepada: *${pelanggan.nama}*${pelanggan.kode ? ` (${pelanggan.kode})` : ""}`,
    `Tanggal: ${tglId()}`,
    ``,
    `Rincian tagihan:`,
    rincian,
    ``,
    `*Total tagihan: ${fmtRp(total)}*`,
    rekeningLabel ? `\nPembayaran ke: ${rekeningLabel}` : "",
    ``,
    `Mohon kirim bukti transfer setelah pembayaran. Terima kasih 🙏`,
  ].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

// baris: [{nomor_pesanan, created_at, sisa}] dari rincianDepositPelanggan
export function susunPesanPencairan({ namaUsaha, pelanggan, baris, rekeningLabel }) {
  const total = baris.reduce((a, b) => a + (Number(b.sisa) || 0), 0);
  const rincian = baris
    .map((b, i) => `${i + 1}. ${b.nomor_pesanan} (${tglId(b.created_at)}) — ${fmtRp(b.sisa)}`)
    .join("\n");
  return [
    `*INVOICE PENCAIRAN*`,
    namaUsaha,
    ``,
    `Kepada: *${pelanggan.nama}*${pelanggan.kode ? ` (${pelanggan.kode})` : ""}`,
    `Tanggal: ${tglId()}`,
    ``,
    `Rincian dana yang dicairkan:`,
    rincian,
    ``,
    `*Total pencairan: ${fmtRp(total)}*`,
    rekeningLabel ? `\nDana dikirim dari: ${rekeningLabel}` : "",
    ``,
    `Mohon dicek kembali. Terima kasih 🙏`,
  ].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

// Tombol kecil hijau — dipakai di tiap baris pelanggan.
export function TombolKirimWa({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Kirim invoice lewat WhatsApp"
      className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
    >
      <MessageCircle size={14} />
      Kirim WA
    </button>
  );
}

// jenis: "penagihan" | "pencairan"
export function InvoiceWaModal({ jenis, pelanggan, baris, master, onClose }) {
  const namaUsaha = namaUsahaEntitas(master, entitasSesi());
  const daftarRekening = rekeningEntitasSesi(master);
  const rekeningOptions = [
    { value: "", label: "Tanpa info rekening" },
    ...daftarRekening.map((r) => ({ value: r.kode, label: `${r.label} (${r.kode})` })),
  ];
  const [rekening, setRekening] = useState("");
  const [wa, setWa] = useState(pelanggan.wa || "");
  const rekeningLabel = daftarRekening.find((r) => r.kode === rekening)?.label || "";

  const susun = jenis === "penagihan" ? susunPesanTagihan : susunPesanPencairan;
  const otomatis = useMemo(
    () => susun({ namaUsaha, pelanggan, baris, rekeningLabel }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namaUsaha, pelanggan, baris, rekeningLabel, jenis]
  );
  // Teks bisa diedit admin; kalau pilihan rekening berubah, teks disusun ulang.
  const [edit, setEdit] = useState(null);
  const pesan = edit?.dasar === otomatis ? edit.teks : otomatis;

  const siap = Boolean(nomorWaLink(wa)) && baris.length > 0;

  // Rincian barang tiap pesanan (grosir_detail_pesanan) ditarik on-demand saat modal dibuka.
  const [detail, setDetail] = useState(null); // {pesanan_id: [items]} | null = memuat
  const [info, setInfo] = useState("");
  useEffect(() => {
    const ids = baris.map((b) => b.id).filter(Boolean);
    if (!ids.length) {
      setDetail({});
      return undefined;
    }
    let batal = false;
    sb(`grosir_detail_pesanan?select=*&pesanan_id=in.(${ids.join(",")})`)
      .then((rows) => {
        if (batal) return;
        const peta = {};
        (rows || []).forEach((r) => (peta[r.pesanan_id] ||= []).push(r));
        setDetail(peta);
      })
      .catch(() => !batal && setDetail({}));
    return () => {
      batal = true;
    };
  }, [baris]);

  // PDF dibuat di browser. HP: lembar "Bagikan" terbuka dengan PDF sudah terlampir (pilih WhatsApp
  // lalu kontaknya). Komputer/browser tanpa fitur itu: PDF terunduh + WhatsApp terbuka dengan teks,
  // lalu lampirkan PDF-nya (klip kertas) di WhatsApp.
  const kirimPdf = async () => {
    const { blob, nama } = buatPdfInvoice({
      jenis,
      namaUsaha,
      alamat: alamatEntitas(master, entitasSesi()),
      pelanggan,
      rekeningLabel,
      pesanan: baris.map((b) => ({ ...b, items: (detail || {})[b.id] || [] })),
    });
    const file = new File([blob], nama, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: pesan });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.open(linkWa(wa, pesan), "_blank", "noopener");
    setInfo(`PDF "${nama}" sudah terunduh. Di WhatsApp yang terbuka, lampirkan file itu (ikon klip) lalu kirim.`);
  };

  return (
    <ModalShell
      title={jenis === "penagihan" ? `Invoice Penagihan — ${pelanggan.nama}` : `Invoice Pencairan — ${pelanggan.nama}`}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        <Field label="No. WhatsApp pelanggan">
          <input
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="0812xxxxxxxx"
            inputMode="tel"
            className={inputClass}
          />
        </Field>
        {!nomorWaLink(wa) && (
          <p className="text-xs text-amber-400">Nomor WA belum diisi. Isi di sini (hanya untuk pengiriman ini) atau lengkapi di data pelanggan.</p>
        )}

        <Field label={jenis === "penagihan" ? "Rekening tujuan transfer (opsional)" : "Rekening sumber dana (opsional)"}>
          <SearchableSelect
            value={rekening}
            onChange={setRekening}
            options={rekeningOptions}
            placeholder="Pilih rekening…"
          />
        </Field>

        <Field label="Isi pesan (bisa diedit)">
          <textarea
            value={pesan}
            onChange={(e) => setEdit({ dasar: otomatis, teks: e.target.value })}
            rows={14}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
        </Field>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Tutup
          </button>
          <button
            type="button"
            disabled={!siap}
            onClick={() => window.open(linkWa(wa, pesan), "_blank", "noopener")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 text-emerald-400 hover:bg-emerald-600/10 disabled:opacity-40 px-3 py-2 text-sm font-medium"
          >
            <MessageCircle size={15} />
            Teks saja
          </button>
          <button
            type="button"
            disabled={!siap || detail === null}
            onClick={kirimPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white"
          >
            <FileText size={15} />
            {detail === null ? "Memuat rincian…" : "Kirim PDF"}
          </button>
        </div>
        {info && <p className="text-xs text-emerald-400">{info}</p>}
        <p className="text-[11px] text-slate-500">
          PDF berisi nomor pesanan dan rincian barang. Di HP, PDF langsung terlampir lewat menu Bagikan
          (pilih WhatsApp lalu kontaknya). Di komputer, PDF terunduh dan WhatsApp terbuka untuk Anda lampirkan.
        </p>
      </div>
    </ModalShell>
  );
}