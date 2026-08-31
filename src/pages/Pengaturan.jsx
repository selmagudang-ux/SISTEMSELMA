import { useState, useEffect } from "react";
import { Trash2, Search, AlertTriangle, UserPlus, KeyRound, ImageOff } from "lucide-react";
import { PageHeader, EmptyState, Field, SearchableSelect, inputClass } from "../components/ui";
import { sb, sbAll } from "../lib/api";
import { ROLES, roleLabel } from "../lib/constants";
import { listUsers, createUser, updateUserPassword, deleteUser } from "../lib/auth";

export default function Pengaturan({ settings, reload, showToast, session }) {
  if (!settings) {
    return (
      <div>
        <PageHeader title="Pengaturan" />
        <EmptyState label="Data pengaturan belum tersedia di Supabase." />
        {session?.role === "superadmin" && <UserManager showToast={showToast} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pengaturan" />

      <SkuYatimCleaner reload={reload} showToast={showToast} />

      <FotoYatimCleaner reload={reload} showToast={showToast} />

      {session?.role === "superadmin" && <UserManager showToast={showToast} />}
    </div>
  );
}

// Kelola user login (username, nama, role, password) — hanya untuk superadmin.
function UserManager({ showToast }) {
  const [users, setUsers] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", nama: "", role: "gudang" });
  const [saving, setSaving] = useState(false);
  const [pwEdit, setPwEdit] = useState(null); // {id, value}

  const load = async () => {
    setLoadingUsers(true);
    try {
      setUsers(await listUsers());
    } catch (e) {
      showToast(e.message || "Gagal memuat daftar user", "err");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const tambah = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password || !form.nama.trim()) {
      showToast("Username, nama, dan password wajib diisi", "err");
      return;
    }
    setSaving(true);
    try {
      await createUser(form);
      setForm({ username: "", password: "", nama: "", role: "gudang" });
      await load();
      showToast("User baru ditambahkan");
    } catch (e) {
      showToast(e.message?.includes("duplicate") ? "Username sudah dipakai" : e.message || "Gagal menambah user", "err");
    } finally {
      setSaving(false);
    }
  };

  const hapus = async (u) => {
    if (!confirm(`Hapus user "${u.username}"?`)) return;
    try {
      await deleteUser(u.id);
      await load();
      showToast("User dihapus");
    } catch (e) {
      showToast(e.message || "Gagal menghapus user", "err");
    }
  };

  const simpanPassword = async (u) => {
    if (!pwEdit?.value) return;
    try {
      await updateUserPassword(u.id, pwEdit.value);
      setPwEdit(null);
      showToast("Password diperbarui");
    } catch (e) {
      showToast(e.message || "Gagal mengubah password", "err");
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Kelola User Login</div>
      <p className="text-xs text-slate-500 mb-4 max-w-xl">
        Tambah, hapus, atau ubah password akun login. Hanya Super Admin yang bisa mengakses bagian ini.
      </p>

      <form onSubmit={tambah} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 pb-4 border-b border-slate-800">
        <Field label="Username">
          <input className={inputClass} value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Nama">
          <input className={inputClass} value={form.nama} onChange={(e) => set("nama", e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" className={inputClass} value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Role">
          <SearchableSelect
            value={form.role}
            onChange={(v) => set("role", v)}
            options={ROLES.map((r) => ({ value: r.key, label: r.label }))}
          />
        </Field>
        <button
          disabled={saving}
          className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm py-2.5 rounded-lg"
        >
          <UserPlus size={14} /> {saving ? "Menyimpan…" : "Tambah User"}
        </button>
      </form>

      {loadingUsers ? (
        <div className="text-xs text-slate-500">Memuat daftar user…</div>
      ) : !users || users.length === 0 ? (
        <EmptyState label="Belum ada user." />
      ) : (
        <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
          {users.map((u) => (
            <div key={u.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{u.nama}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    @{u.username} · {roleLabel(u.role)}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setPwEdit(pwEdit?.id === u.id ? null : { id: u.id, value: "" })}
                    title="Ubah password"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-900"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => hapus(u)}
                    title="Hapus user"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-900"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {pwEdit?.id === u.id && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="password"
                    autoFocus
                    placeholder="Password baru"
                    className={inputClass}
                    value={pwEdit.value}
                    onChange={(e) => setPwEdit({ id: u.id, value: e.target.value })}
                  />
                  <button
                    onClick={() => simpanPassword(u)}
                    className="flex-shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    Simpan
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pembersihan SKU "yatim" — sisa data sku_master (& penempatan raknya) dari barang
// yang sudah dihapus sebelum fitur pembersihan otomatis ada. Hanya SKU yang benar-benar
// sudah tidak dipakai barang manapun yang akan dihapus.
function SkuYatimCleaner({ reload, showToast }) {
  const [checking, setChecking] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [orphans, setOrphans] = useState(null); // null = belum dicek, [] = dicek & bersih, [...] = ketemu

  const cek = async () => {
    setChecking(true);
    setOrphans(null);
    try {
      const [itemsRes, skuRes] = await Promise.all([
        sbAll("items?select=sku"),
        sbAll("sku_master?select=id,sku,stok&order=sku"),
      ]);
      const dipakai = new Set((itemsRes || []).filter((i) => i.sku).map((i) => i.sku));
      const yatim = (skuRes || []).filter((s) => !dipakai.has(s.sku));
      setOrphans(yatim);
      if (yatim.length === 0) showToast("Tidak ada SKU yatim — data sudah bersih");
    } catch (e) {
      showToast(e.message || "Gagal mengecek data", "err");
    } finally {
      setChecking(false);
    }
  };

  const bersihkan = async () => {
    if (!orphans || orphans.length === 0) return;
    setCleaning(true);
    try {
      for (const s of orphans) {
        // stock_history & penempatan juga punya foreign key ke sku_master.sku,
        // jadi keduanya harus dihapus dulu sebelum sku_master.
        await sb(`stock_history?sku=eq.${encodeURIComponent(s.sku)}`, { method: "DELETE" });
        await sb(`penempatan?sku=eq.${encodeURIComponent(s.sku)}`, { method: "DELETE" });
        await sb(`sku_master?id=eq.${s.id}`, { method: "DELETE" });
      }
      showToast(`${orphans.length} SKU yatim dibersihkan`);
      setOrphans(null);
      await reload();
    } catch (e) {
      showToast(e.message || "Gagal membersihkan data", "err");
    } finally {
      setCleaning(false);
    }
  };

  const totalStokYatim = (orphans || []).reduce((a, s) => a + (s.stok || 0), 0);

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Pemeliharaan Data</div>
      <p className="text-xs text-slate-500 mb-3 max-w-xl">
        Cek apakah ada SKU di Master Barang yang sudah tidak punya barang sama sekali (misalnya sisa dari barang yang
        dihapus sebelum sistem membersihkannya otomatis). SKU seperti ini bikin angka di Dashboard (Total SKU, Total
        Stok) terlihat tidak sesuai dengan Alur Barang.
      </p>

      <button
        onClick={cek}
        disabled={checking}
        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700"
      >
        <Search size={14} /> {checking ? "Mengecek…" : "Cek SKU Yatim"}
      </button>

      {orphans && orphans.length > 0 && (
        <div className="mt-4">
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              Ditemukan <span className="font-semibold">{orphans.length} SKU</span> yang sudah tidak punya barang
              (total stok tercatat {totalStokYatim}x). Hapus SKU ini beserta data penempatan raknya?
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg mb-3 divide-y divide-slate-800">
            {orphans.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-200">{s.sku}</span>
                <span className="text-[11px] text-slate-500">Stok: {s.stok}</span>
              </div>
            ))}
          </div>
          <button
            onClick={bersihkan}
            disabled={cleaning}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Trash2 size={14} /> {cleaning ? "Membersihkan…" : `Hapus ${orphans.length} SKU Yatim`}
          </button>
        </div>
      )}
    </div>
  );
}

// Pembersihan foto "yatim" — items.foto_url yang masih menunjuk ke file di
// bucket Storage "verifikasi-foto" padahal filenya sudah dihapus langsung dari
// Storage (mis. lewat Cyberduck/S3, bukan lewat aplikasi ini). Kalau tidak
// dibersihkan, foto_url tetap "nyangkut" di database dan bikin <img> di
// FotoProduk/DataBarang/Marketplace/Dashboard nampilin gambar rusak (broken).
//
// Bucket ini public tapi anon key tidak tentu punya izin LIST/SELECT ke
// storage.objects (perlu policy RLS tersendiri), jadi supaya tidak bergantung
// pada policy tambahan, pengecekan dilakukan dengan cara yang sudah pasti
// selalu bisa dipakai: HEAD request langsung ke tiap foto_url publik satu-
// satu (persis cara <img> di aplikasi ini memuat fotonya). Kalau HEAD balas
// 404 → file itu memang sudah tidak ada di Storage.
function FotoYatimCleaner({ reload, showToast }) {
  const [checking, setChecking] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total} saat mengecek
  const [orphans, setOrphans] = useState(null); // null = belum dicek, [] = bersih, [...] = ketemu

  // Cek beberapa URL sekaligus (bukan satu-satu berurutan) supaya tidak lambat
  // kalau jumlah foto ribuan, tapi tetap dibatasi per gelombang biar tidak
  // membanjiri koneksi/browser dengan ratusan request bersamaan sekaligus.
  const KONKURENSI = 16;

  const cekSatu = async (url) => {
    try {
      // PENTING: pakai GET, BUKAN HEAD. Supabase Storage punya perilaku beda
      // antara HEAD dan GET di layer CDN/cache-nya — HEAD kadang balas 404
      // padahal filenya beneran masih ada (GET ke URL yang sama balas 200).
      // Ini bug/ketidakkonsistenan yang sudah dikonfirmasi terjadi, jadi HEAD
      // tidak bisa dipercaya untuk cek keberadaan file di Supabase Storage.
      // Range: bytes=0-0 dipakai supaya GET-nya tetap ringan (cuma minta 1
      // byte pertama, bukan download seluruh file) sambil tetap dapat status
      // code yang akurat dari origin (200/206 = ada, 404 = benar-benar hilang).
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
      return res.status === 404;
    } catch {
      // Gagal fetch (mis. jaringan) tidak otomatis dianggap "hilang" — supaya
      // tidak salah hapus foto yang sebenarnya masih ada gara-gara koneksi
      // sempat putus. Hanya 404 pasti dari server yang dianggap benar-benar hilang.
      return false;
    }
  };

  const cek = async () => {
    setChecking(true);
    setOrphans(null);
    setProgress(null);
    try {
      const items = await sbAll("items?select=id,sku,foto_url&foto_url=not.is.null");
      const unik = items.filter((i) => i.foto_url);
      setProgress({ done: 0, total: unik.length });

      const hilang = new Set(); // foto_url yang 404 di pengecekan PERTAMA
      for (let i = 0; i < unik.length; i += KONKURENSI) {
        const batch = unik.slice(i, i + KONKURENSI);
        const hasil = await Promise.all(batch.map((it) => cekSatu(it.foto_url)));
        batch.forEach((it, j) => {
          if (hasil[j]) hilang.add(it.foto_url);
        });
        setProgress({ done: Math.min(i + KONKURENSI, unik.length), total: unik.length });
      }

      // Verifikasi ULANG khusus yang 404 di percobaan pertama (bukan cek
      // ulang semuanya — hemat waktu). Ini jaga-jaga dari 404 yang
      // "nyasar"/sementara (mis. gangguan jaringan sesaat atau respons tidak
      // konsisten dari CDN Storage) — hanya yang 404 DUA KALI berturut-turut
      // yang dianggap benar-benar hilang.
      const kandidat = unik.filter((it) => hilang.has(it.foto_url));
      const benarHilang = new Set();
      for (let i = 0; i < kandidat.length; i += KONKURENSI) {
        const batch = kandidat.slice(i, i + KONKURENSI);
        const hasil = await Promise.all(batch.map((it) => cekSatu(it.foto_url)));
        batch.forEach((it, j) => {
          if (hasil[j]) benarHilang.add(it.foto_url);
        });
      }

      const yatim = unik.filter((it) => benarHilang.has(it.foto_url));
      setOrphans(yatim);
      if (yatim.length === 0) showToast("Tidak ada foto yatim — semua foto_url di database masih ada filenya");
    } catch (e) {
      showToast(e.message || "Gagal mengecek foto", "err");
    } finally {
      setChecking(false);
    }
  };

  const bersihkan = async () => {
    if (!orphans || orphans.length === 0) return;
    setCleaning(true);
    try {
      // PATCH sekaligus dalam satu request pakai filter id=in.(...) — lebih
      // cepat dan lebih aman (satu transaksi) daripada looping PATCH satu-satu.
      const ids = orphans.map((o) => o.id).join(",");
      await sb(`items?id=in.(${ids})`, {
        method: "PATCH",
        body: JSON.stringify({ foto_url: null }),
      });
      showToast(`${orphans.length} foto yatim dibersihkan dari database`);
      setOrphans(null);
      setProgress(null);
      await reload();
    } catch (e) {
      showToast(e.message || "Gagal membersihkan foto", "err");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Bersihkan Foto Yatim</div>
      <p className="text-xs text-slate-500 mb-3 max-w-xl">
        Cek apakah ada barang yang foto_url-nya masih tercatat di database, tapi file fotonya sudah
        terhapus langsung dari Storage (mis. lewat Cyberduck/S3). Kalau dibiarkan, foto ini akan
        tampil rusak/broken di halaman Pemotretan, Data Barang, Marketplace, dan Dashboard.
      </p>

      <button
        onClick={cek}
        disabled={checking}
        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700"
      >
        <Search size={14} />
        {checking
          ? `Mengecek… ${progress ? `${progress.done}/${progress.total}` : ""}`
          : "Cek Foto Yatim"}
      </button>

      {orphans && orphans.length > 0 && (
        <div className="mt-4">
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg mb-3">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              Ditemukan <span className="font-semibold">{orphans.length} foto</span> yang filenya
              sudah tidak ada di Storage. Kosongkan foto_url barang-barang ini? Barangnya sendiri
              TIDAK dihapus — hanya link fotonya saja yang dikosongkan, supaya barangnya balik
              muncul di menu Pemotretan untuk difoto ulang.
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg mb-3 divide-y divide-slate-800">
            {orphans.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-200">{o.sku}</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <ImageOff size={12} /> file hilang
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={bersihkan}
            disabled={cleaning}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
          >
            <Trash2 size={14} /> {cleaning ? "Membersihkan…" : `Bersihkan ${orphans.length} Foto Yatim`}
          </button>
        </div>
      )}
    </div>
  );
}