// Banner kecil "Draf dipulihkan" — dipasang di atas isi form yang memakai useDraftForm (lib/draftForm.js).
export default function BannerDraf({ draf, onBuang }) {
  if (!draf?.dipulihkan) return null;
  const jam = draf.waktuDraf
    ? new Date(draf.waktuDraf).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">
      <span>Draf yang belum selesai dipulihkan{jam ? ` (${jam})` : ""}. Isian tersimpan otomatis.</span>
      <button type="button" onClick={onBuang} className="flex-shrink-0 font-semibold underline">
        Buang draf
      </button>
    </div>
  );
}
