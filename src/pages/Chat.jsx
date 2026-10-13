import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Image as ImageIcon, ArrowLeft, RefreshCw, Eye, X } from "lucide-react";
import { PageHeader, EmptyState, Badge, inputClass, btnFilled, btnText } from "../components/ui";
import { roleLabel } from "../lib/constants";
import {
  chatKontak, chatRiwayat, chatKirim, chatAmbilFoto, chatPengawasDaftar, chatPengawasRiwayat, HARI_SIMPAN_CHAT,
} from "../lib/chatApi";

// =========================================================
// CHAT PRIBADI ANTAR USER — teks + foto (tanpa file lain). Pesan otomatis
// dihapus setelah 3 hari (dikerjakan Edge Function "chat"). Tanpa Realtime:
// pesan baru diambil dengan polling ringan (hanya yang lebih baru dari
// pesan terakhir yang sudah ada). Role "superappa" punya tab Pengawas untuk
// membaca semua percakapan (baca saja).
// =========================================================

const POLL_PERCAKAPAN_MS = 3000;
const POLL_DAFTAR_MS = 10000;

const jam = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const hariKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function labelHari(iso) {
  const d = new Date(iso);
  const sekarang = new Date();
  const kemarin = new Date(); kemarin.setDate(sekarang.getDate() - 1);
  if (hariKey(iso) === hariKey(sekarang.toISOString())) return "Hari ini";
  if (hariKey(iso) === hariKey(kemarin.toISOString())) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long" });
}
const gabung = (lama, baru) => {
  if (!baru.length) return lama;
  const ada = new Set(lama.map((m) => m.id));
  return [...lama, ...baru.filter((m) => !ada.has(m.id))].sort((a, b) => a.id - b.id);
};

function FotoChat({ id }) {
  const [url, setUrl] = useState(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    let batal = false;
    chatAmbilFoto(id).then((u) => { if (!batal) setUrl(u); }).catch(() => { if (!batal) setGagal(true); });
    return () => { batal = true; };
  }, [id]);
  if (gagal) return <div className="text-[11px] italic opacity-70">Foto sudah dihapus</div>;
  if (!url) return <div className="w-40 h-28 rounded-md-md bg-md-on-surface/10 animate-pulse" />;
  return (
    <button type="button" onClick={() => window.open(url, "_blank")} className="block">
      <img src={url} alt="foto chat" className="max-w-[220px] max-h-[260px] rounded-md-md object-cover" />
    </button>
  );
}

function Gelembung({ m, saya }) {
  return (
    <div className={`flex ${saya ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm space-y-1 ${saya ? "bg-md-primary-container text-md-on-primary-container rounded-br-md-sm" : "bg-md-container-high text-md-on-surface rounded-bl-md-sm"}`}>
        {m.ada_foto && <FotoChat id={m.id} />}
        {m.isi && <div className="whitespace-pre-wrap break-words">{m.isi}</div>}
        <div className="text-[10px] opacity-60 text-right">{jam(m.dibuat)}</div>
      </div>
    </div>
  );
}

function DaftarPesan({ pesan, idSaya, kosong }) {
  const ujung = useRef(null);
  const jumlah = pesan.length;
  useEffect(() => { ujung.current?.scrollIntoView({ block: "end" }); }, [jumlah]);
  if (!jumlah) return <div className="flex-1 flex items-center justify-center text-xs text-md-on-surface-variant">{kosong}</div>;
  let hariTerakhir = "";
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {pesan.map((m) => {
        const h = hariKey(m.dibuat);
        const penanda = h !== hariTerakhir;
        hariTerakhir = h;
        return (
          <div key={m.id} className="space-y-2">
            {penanda && <div className="text-center"><span className="text-[11px] text-md-on-surface-variant bg-md-container-high rounded-full px-3 py-1">{labelHari(m.dibuat)}</span></div>}
            <Gelembung m={m} saya={m.dari === idSaya} />
          </div>
        );
      })}
      <div ref={ujung} />
    </div>
  );
}

export default function Chat({ session, showToast, onBacaBerubah }) {
  const idSaya = String(session.id);
  const pengawas = session.role === "superappa";
  const [mode, setMode] = useState("saya"); // saya | pengawas
  const [kontak, setKontak] = useState([]);
  const [lawan, setLawan] = useState(null); // objek kontak
  const [pesan, setPesan] = useState([]);
  const [teks, setTeks] = useState("");
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [mengirim, setMengirim] = useState(false);
  const [err, setErr] = useState("");
  const [cari, setCari] = useState("");
  const [daftarPengawas, setDaftarPengawas] = useState([]);
  const [pasangan, setPasangan] = useState(null);
  const [pesanPengawas, setPesanPengawas] = useState([]);
  const lastId = useRef(0);
  const lastIdPengawas = useRef(0);
  const berkas = useRef(null);

  const tampilErr = (e) => { setErr(e.message || "Terjadi kesalahan"); if (e.sesi) showToast?.(e.message, "error"); };

  const muatKontak = useCallback(async () => {
    try { setKontak(await chatKontak()); setErr(""); } catch (e) { tampilErr(e); }
  }, []);
  useEffect(() => {
    muatKontak();
    const t = setInterval(() => { if (document.visibilityState === "visible") muatKontak(); }, POLL_DAFTAR_MS);
    return () => clearInterval(t);
  }, [muatKontak]);

  // percakapan saya
  useEffect(() => {
    setPesan([]); lastId.current = 0;
    if (!lawan) return;
    let batal = false;
    const ambil = async () => {
      try {
        const baru = await chatRiwayat(lawan.id, lastId.current);
        if (batal || !baru.length) return;
        lastId.current = Math.max(lastId.current, ...baru.map((m) => m.id));
        setPesan((l) => gabung(l, baru));
        onBacaBerubah?.(); muatKontak();
      } catch (e) { if (!batal) tampilErr(e); }
    };
    ambil();
    const t = setInterval(() => { if (document.visibilityState === "visible") ambil(); }, POLL_PERCAKAPAN_MS);
    return () => { batal = true; clearInterval(t); };
  }, [lawan?.id]);

  // mode pengawas
  const muatPengawas = useCallback(async () => {
    try { setDaftarPengawas(await chatPengawasDaftar()); } catch (e) { tampilErr(e); }
  }, []);
  useEffect(() => {
    if (!pengawas || mode !== "pengawas") return;
    muatPengawas();
    const t = setInterval(() => { if (document.visibilityState === "visible") muatPengawas(); }, 15000);
    return () => clearInterval(t);
  }, [pengawas, mode, muatPengawas]);
  useEffect(() => {
    setPesanPengawas([]); lastIdPengawas.current = 0;
    if (!pasangan || mode !== "pengawas") return;
    let batal = false;
    const ambil = async () => {
      try {
        const baru = await chatPengawasRiwayat(pasangan.a, pasangan.b, lastIdPengawas.current);
        if (batal || !baru.length) return;
        lastIdPengawas.current = Math.max(lastIdPengawas.current, ...baru.map((m) => m.id));
        setPesanPengawas((l) => gabung(l, baru));
      } catch (e) { if (!batal) tampilErr(e); }
    };
    ambil();
    const t = setInterval(() => { if (document.visibilityState === "visible") ambil(); }, 5000);
    return () => { batal = true; clearInterval(t); };
  }, [pasangan?.a, pasangan?.b, mode]);

  const pilihFoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { showToast?.("Hanya foto yang bisa dikirim (file lain tidak didukung)", "error"); return; }
    setFoto(f);
    setFotoPreview((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f); });
  };
  const hapusFoto = () => { setFoto(null); setFotoPreview((u) => { if (u) URL.revokeObjectURL(u); return null; }); };

  const kirim = async () => {
    if (!lawan || mengirim || (!teks.trim() && !foto)) return;
    setMengirim(true);
    try {
      const m = await chatKirim(lawan.id, teks, foto);
      lastId.current = Math.max(lastId.current, m.id);
      setPesan((l) => gabung(l, [m]));
      setTeks(""); hapusFoto(); setErr("");
      muatKontak();
    } catch (e) {
      showToast?.(e.message || "Gagal mengirim", "error");
    } finally {
      setMengirim(false);
    }
  };

  const kontakTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const list = q ? kontak.filter((k) => `${k.nama} ${roleLabel(k.role)}`.toLowerCase().includes(q)) : kontak;
    return [...list].sort((a, b) => (b.belum > 0) - (a.belum > 0) || String(b.terakhir || "").localeCompare(String(a.terakhir || "")) || String(a.nama).localeCompare(String(b.nama)));
  }, [kontak, cari]);

  const catatan = `Pesan dihapus otomatis setelah ${HARI_SIMPAN_CHAT} hari. Hanya teks dan foto yang bisa dikirim.`;
  const tinggi = "h-[calc(100vh-200px)] min-h-[420px]";

  return (
    <div>
      <PageHeader title="Chat" description={catatan} action={pengawas ? (
        <div className="flex rounded-full border border-md-outline-variant overflow-hidden text-xs">
          {[["saya", "Chat saya"], ["pengawas", "Pengawas"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`px-4 py-2 ${mode === k ? "bg-md-primary-container text-md-on-primary-container font-medium" : "text-md-on-surface-variant"}`}>{l}</button>
          ))}
        </div>
      ) : null} />
      {err && <div className="mb-3 text-sm text-red-400">{err}</div>}

      {mode === "saya" ? (
        <div className={`flex rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-hidden ${tinggi}`}>
          {/* daftar kontak */}
          <div className={`${lawan ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 md:border-r border-md-outline-variant`}>
            <div className="p-3 border-b border-md-outline-variant">
              <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / role" className={inputClass} />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-md-outline-variant">
              {kontakTampil.length === 0 && <div className="p-4 text-xs text-md-on-surface-variant">Belum ada user lain.</div>}
              {kontakTampil.map((k) => (
                <button key={k.id} onClick={() => setLawan(k)} className={`w-full text-left px-4 py-3 hover:bg-md-on-surface/[0.04] flex items-center gap-3 ${lawan?.id === k.id ? "bg-md-on-surface/[0.06]" : ""}`}>
                  <div className="w-9 h-9 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center text-sm font-medium flex-shrink-0">{(k.nama || "?").slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{k.nama}</div>
                    <div className="text-[11px] text-md-on-surface-variant truncate">{roleLabel(k.role)}{k.terakhir ? ` · ${jam(k.terakhir)}` : ""}</div>
                  </div>
                  {k.belum > 0 && <Badge color="amber">{k.belum}</Badge>}
                </button>
              ))}
            </div>
          </div>

          {/* percakapan */}
          <div className={`${lawan ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
            {!lawan ? (
              <div className="flex-1 flex items-center justify-center text-sm text-md-on-surface-variant">Pilih user untuk mulai chat</div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-md-outline-variant">
                  <button className="md:hidden p-2 text-md-on-surface-variant" onClick={() => setLawan(null)} aria-label="Kembali"><ArrowLeft size={18} /></button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{lawan.nama}</div>
                    <div className="text-[11px] text-md-on-surface-variant">{roleLabel(lawan.role)}</div>
                  </div>
                </div>
                <DaftarPesan pesan={pesan} idSaya={idSaya} kosong="Belum ada pesan. Tulis pesan pertama di bawah." />
                {fotoPreview && (
                  <div className="px-4 pt-2 flex items-center gap-2">
                    <img src={fotoPreview} alt="" className="h-14 rounded-md-md" />
                    <button onClick={hapusFoto} className="p-1 text-md-on-surface-variant" aria-label="Batalkan foto"><X size={16} /></button>
                  </div>
                )}
                <div className="flex items-end gap-2 p-3 border-t border-md-outline-variant">
                  <input ref={berkas} type="file" accept="image/*" className="hidden" onChange={pilihFoto} />
                  <button onClick={() => berkas.current?.click()} className="p-2.5 rounded-full text-md-on-surface-variant hover:bg-md-on-surface/10" aria-label="Kirim foto" disabled={mengirim}><ImageIcon size={18} /></button>
                  <textarea
                    value={teks} onChange={(e) => setTeks(e.target.value)} rows={1} maxLength={2000}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); kirim(); } }}
                    placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)"
                    className={`${inputClass} resize-none max-h-32`}
                  />
                  <button onClick={kirim} disabled={mengirim || (!teks.trim() && !foto)} className={btnFilled}><Send size={14} /> {mengirim ? "…" : "Kirim"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={`flex rounded-md-lg bg-md-container-low shadow-elevation-1 overflow-hidden ${tinggi}`}>
          <div className={`${pasangan ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 md:border-r border-md-outline-variant`}>
            <div className="flex items-center justify-between p-3 border-b border-md-outline-variant">
              <div className="text-xs text-md-on-surface-variant flex items-center gap-1.5"><Eye size={13} /> Semua percakapan (baca saja)</div>
              <button className={btnText} onClick={muatPengawas}><RefreshCw size={13} /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-md-outline-variant">
              {daftarPengawas.length === 0 && <div className="p-4 text-xs text-md-on-surface-variant">Belum ada percakapan.</div>}
              {daftarPengawas.map((p) => (
                <button key={`${p.a}|${p.b}`} onClick={() => setPasangan(p)} className={`w-full text-left px-4 py-3 hover:bg-md-on-surface/[0.04] ${pasangan?.a === p.a && pasangan?.b === p.b ? "bg-md-on-surface/[0.06]" : ""}`}>
                  <div className="text-sm font-medium truncate">{p.namaA} ↔ {p.namaB}</div>
                  <div className="text-[11px] text-md-on-surface-variant">{p.jumlah} pesan · terakhir {jam(p.terakhir)}</div>
                </button>
              ))}
            </div>
          </div>
          <div className={`${pasangan ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
            {!pasangan ? (
              <div className="flex-1 flex items-center justify-center text-sm text-md-on-surface-variant">Pilih percakapan untuk dibaca</div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-md-outline-variant">
                  <button className="md:hidden p-2 text-md-on-surface-variant" onClick={() => setPasangan(null)} aria-label="Kembali"><ArrowLeft size={18} /></button>
                  <div className="text-sm font-medium truncate">{pasangan.namaA} ↔ {pasangan.namaB}</div>
                </div>
                <DaftarPesan pesan={pesanPengawas} idSaya={pasangan.a} kosong="Tidak ada pesan." />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
