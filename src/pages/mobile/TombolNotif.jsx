import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { aktifkanPush, matikanPush, perluTambahKeLayarUtama, sinkronkanPush, statusPush } from "../../lib/pushNotif";

// Tombol lonceng di header versi HP: nyalakan / matikan notifikasi push di HP ini.
export default function TombolNotif({ session }) {
  const [st, setSt] = useState(null); // null = belum dicek
  const [sibuk, setSibuk] = useState(false);

  const muat = async () => setSt(await statusPush());

  useEffect(() => {
    let batal = false;
    (async () => {
      await sinkronkanPush(); // daftarkan ulang bila notifikasi sudah pernah dinyalakan di HP ini
      const s = await statusPush();
      if (!batal) setSt(s);
    })();
    return () => {
      batal = true;
    };
  }, [session?.id]);

  const klik = async () => {
    if (sibuk) return;
    if (perluTambahKeLayarUtama()) {
      window.alert("Di iPhone, notifikasi hanya bisa jalan kalau SISTEMSELMA sudah ditambahkan ke Layar Utama (Bagikan > Tambah ke Layar Utama), lalu dibuka dari ikon itu.");
      return;
    }
    if (st && !st.didukung) {
      window.alert("Browser ini belum mendukung notifikasi push.");
      return;
    }
    setSibuk(true);
    try {
      if (st?.aktif) {
        if (window.confirm("Matikan notifikasi di HP ini?")) await matikanPush();
      } else {
        await aktifkanPush();
      }
    } catch (e) {
      window.alert(e.message || "Gagal mengubah pengaturan notifikasi");
    } finally {
      await muat();
      setSibuk(false);
    }
  };

  const Ikon = sibuk ? Loader2 : st?.aktif ? BellRing : st?.izin === "denied" ? BellOff : Bell;
  return (
    <button
      onClick={klik}
      className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-md-on-surface/10 ${st?.aktif ? "text-md-primary" : "text-md-on-surface-variant"}`}
      title={st?.aktif ? "Notifikasi aktif" : "Nyalakan notifikasi"}
    >
      <Ikon size={18} className={sibuk ? "animate-spin" : ""} />
    </button>
  );
}
