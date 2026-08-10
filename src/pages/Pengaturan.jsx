import { useState, useEffect } from "react";
import { PageHeader, Field, inputClass, EmptyState } from "../components/ui";
import { sb, calcHarga, fmtRp } from "../lib/api";

const FIELDS = [
  { key: "dasar_tambahan", label: "Tambahan Harga Dasar (Rp)", hint: "Ditambahkan ke harga asli sebelum hitung HPP." },
  { key: "hpp_percent", label: "HPP (%)", hint: "Persentase dari harga dasar." },
  { key: "grosir_percent", label: "Grosir (%)", hint: "Persentase dari HPP." },
  { key: "tengah_multiplier", label: "Pengali Harga Tengah", hint: "Dikali dengan HPP." },
  { key: "ecer_multiplier", label: "Pengali Harga Ecer", hint: "Dikali dengan Harga Tengah." },
  { key: "round_to", label: "Pembulatan (Rp)", hint: "Harga dibulatkan ke kelipatan ini." },
];

export default function Pengaturan({ settings, reload, showToast }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!settings || !form) {
    return (
      <div>
        <PageHeader title="Pengaturan" description="Atur persentase markup yang dipakai untuk menghitung harga jual." />
        <EmptyState label="Data pengaturan belum tersedia di Supabase." />
      </div>
    );
  }

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await sb(`settings?id=eq.${settings.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          dasar_tambahan: Number(form.dasar_tambahan),
          hpp_percent: Number(form.hpp_percent),
          grosir_percent: Number(form.grosir_percent),
          tengah_multiplier: Number(form.tengah_multiplier),
          ecer_multiplier: Number(form.ecer_multiplier),
          round_to: Number(form.round_to),
        }),
      });
      await reload();
      showToast("Pengaturan harga disimpan");
    } catch (e) {
      showToast(e.message || "Gagal menyimpan pengaturan", "err");
    } finally {
      setSaving(false);
    }
  };

  const preview = calcHarga(100000, form);

  return (
    <div>
      <PageHeader title="Pengaturan" description="Atur persentase markup yang dipakai untuk menghitung harga jual di seluruh SKU." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-3xl">
        <div className="rounded-xl border border-slate-800 p-4">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                type="number"
                className={inputClass}
                value={form[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
              <div className="text-[11px] text-slate-600 mt-1">{f.hint}</div>
            </Field>
          ))}
          <button
            disabled={saving}
            onClick={save}
            className="w-full mt-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
          >
            {saving ? "Menyimpan…" : "Simpan Pengaturan"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 p-4 h-fit">
          <div className="text-xs text-slate-500 mb-3">Contoh perhitungan untuk Harga Asli Rp 100.000:</div>
          <div className="space-y-2 text-sm">
            <Row label="Harga Dasar" value={fmtRp(preview.hargaDasar)} />
            <Row label="HPP" value={fmtRp(preview.hpp)} />
            <Row label="Grosir" value={fmtRp(preview.grosir)} />
            <Row label="Tengah" value={fmtRp(preview.tengah)} />
            <Row label="Ecer" value={fmtRp(preview.ecer)} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-2">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={bold ? "text-amber-400 font-semibold" : "text-slate-200"}>{value}</span>
    </div>
  );
}
