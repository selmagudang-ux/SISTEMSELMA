import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader, inputClass } from "../components/ui";
import { MASTER_TIPE } from "../lib/constants";
import { sb } from "../lib/api";

export default function MasterData({ master, reload, showToast }) {
  const [activeTipe, setActiveTipe] = useState("bahan");
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const list = master[activeTipe] || [];

  const addEntry = async () => {
    if (!kode.trim() || !label.trim()) return;
    setSaving(true);
    try {
      await sb("master_data", {
        method: "POST",
        body: JSON.stringify({ tipe: activeTipe, kode: kode.trim().toUpperCase(), label: label.trim() }),
      });
      setKode("");
      setLabel("");
      await reload();
      showToast("Kode ditambahkan");
    } catch (e) {
      showToast(e.message || "Gagal menambah", "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    try {
      await sb(`master_data?id=eq.${id}`, { method: "DELETE" });
      await reload();
      showToast("Kode dihapus");
    } catch (e) {
      showToast(e.message || "Gagal menghapus", "err");
    }
  };

  return (
    <div>
      <PageHeader
        title="Master Data"
        description={
          'Ini map kode SKU Anda — misalnya kode kategori "ANJ" artinya "Anting Jurai". Isi di sini supaya nanti muncul otomatis di dropdown Buat SKU dan di halaman Detail SKU.'
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-4 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {MASTER_TIPE.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTipe(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTipe === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 mb-4 max-w-lg">
        <div className="flex-1">
          <div className="text-xs text-slate-400 mb-1">Kode</div>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            placeholder="Cth: ANJ"
            className={inputClass}
          />
        </div>
        <div className="flex-[2]">
          <div className="text-xs text-slate-400 mb-1">Nama / Label</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Cth: Anting Jurai"
            className={inputClass}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
        </div>
        <button
          disabled={!kode.trim() || !label.trim() || saving}
          onClick={addEntry}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs px-3 py-2 rounded-lg h-[38px]"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden max-w-lg">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            Belum ada kode untuk {MASTER_TIPE.find((t) => t.key === activeTipe)?.label}.
          </div>
        ) : (
          list.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-amber-400 w-14">{m.kode}</span>
                <span className="text-sm text-slate-200">{m.label}</span>
              </div>
              <button
                onClick={() => deleteEntry(m.id)}
                className="text-slate-600 hover:text-red-400"
                title="Hapus"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
