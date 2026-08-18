import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { PageHeader, inputClass } from "../components/ui";
import { MASTER_TIPE } from "../lib/constants";
import { sb } from "../lib/api";

export default function MasterData({ master, reload, showToast }) {
  const [activeTipe, setActiveTipe] = useState("bahan");
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit inline: id baris yang sedang diedit + nilai kode/nama sementara.
  // null = tidak ada baris yang sedang diedit.
  const [editingId, setEditingId] = useState(null);
  const [editKode, setEditKode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditKode(m.kode);
    setEditLabel(m.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditKode("");
    setEditLabel("");
  };

  const saveEdit = async (m) => {
    const kodeBaru = editKode.trim().toUpperCase();
    const labelBaru = editLabel.trim();
    if (!kodeBaru || !labelBaru) return;
    if (kodeBaru === m.kode && labelBaru === m.label) {
      cancelEdit();
      return;
    }
    if (kodeBaru !== m.kode && list.some((x) => x.id !== m.id && x.kode === kodeBaru)) {
      showToast(`Kode "${kodeBaru}" sudah dipakai`, "err");
      return;
    }
    setEditSaving(true);
    try {
      await sb(`master_data?id=eq.${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kode: kodeBaru, label: labelBaru }),
      });
      await reload();
      cancelEdit();
      showToast("Perubahan disimpan");
    } catch (e) {
      showToast(e.message || "Gagal menyimpan", "err");
    } finally {
      setEditSaving(false);
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
            onClick={() => {
              setActiveTipe(t.key);
              cancelEdit();
            }}
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
          list.map((m, i) => {
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={`px-4 py-2.5 ${i % 2 ? "bg-slate-950" : "bg-slate-900"}`}
              >
                {isEditing ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        value={editKode}
                        onChange={(e) => setEditKode(e.target.value)}
                        className="w-20 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-xs font-mono uppercase outline-none focus:border-amber-500"
                      />
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm outline-none focus:border-amber-500"
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(m)}
                        autoFocus
                      />
                      <button
                        onClick={() => saveEdit(m)}
                        disabled={!editKode.trim() || !editLabel.trim() || editSaving}
                        className="p-1.5 rounded-lg text-emerald-400 hover:bg-slate-800 disabled:opacity-40 flex-shrink-0"
                        title="Simpan"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 flex-shrink-0"
                        title="Batal"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {editKode.trim().toUpperCase() !== m.kode && (
                      <div className="text-[10px] text-amber-500/80 mt-1">
                        Kode diganti — SKU/data lama yang masih pakai kode "{m.kode}" tidak otomatis ikut berubah.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-amber-400 w-14">{m.kode}</span>
                      <span className="text-sm text-slate-200">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteEntry(m.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                        title="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}