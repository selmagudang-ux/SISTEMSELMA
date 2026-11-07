import { useState, useEffect } from "react";
import { Trash2, Search, AlertTriangle, UserPlus, KeyRound, ImageOff, Wrench } from "lucide-react";
import { PageHeader, EmptyState, Field, SearchableSelect, inputClass } from "../components/ui";
import { sb, sbAll, RUMUS_HARGA_BAWAAN, rumusHargaEntitas, daftarkanProfilEntitas, entitasSesi } from "../lib/api";
import { ROLES, roleLabel, isSuperadminLike, ROLE_BOLEH_KASIR, ROLE_HANYA_LIHAT_BAWAAN, NAV, allowedMenus, allowedSubMenus, allowedSubMenusBawaan, menuBawaanRole, aksesRoleTersimpan, bolehKasir, setAksesRole, filterNavByAllowed, fiturMatiEntitas } from "../lib/constants";
import { listUsers, createUser, updateUserPassword, deleteUser } from "../lib/auth";

export default function Pengaturan({ settings, reload, showToast, session }) {
  // Mode Perbaikan & pembersih data HANYA untuk role "superappa" (Super Admin tersembunyi) —
  // SENGAJA lebih sempit dari isSuperadminLike, karena begitu Mode Perbaikan aktif superadmin
  // biasa pun ikut terkunci dari MainApp (lihat App.jsx) — cuma superappa yang selalu punya
  // jalan untuk menyalakan/mematikannya lagi.
  const isSuperappa = session?.role === "superappa";
  const bolehAtur = isSuperadminLike(session?.role);
  // Super Admin tiap PT (Selma, Alivia, dst) hanya melihat Rumus Harga dan Kelola User, keduanya
  // terkunci ke PT akunnya sendiri. Super Appa melihat semuanya dan bebas memilih PT.
  const ptSendiri = isSuperappa ? null : session?.entitas || "OPS";

  if (!settings) {
    return (
      <div>
        <PageHeader title="Pengaturan" />
        <EmptyState label="Data pengaturan belum tersedia di Supabase." />
        {bolehAtur && <UserManager showToast={showToast} ptTetap={ptSendiri} />}
        {isSuperappa && <HakAkses showToast={showToast} reload={reload} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pengaturan" />

      {isSuperappa && <MaintenanceToggle settings={settings} reload={reload} showToast={showToast} />}

      {bolehAtur && (
        <PengaturanPerPT settings={settings} session={session} isSuperappa={isSuperappa} showToast={showToast} />
      )}

      {isSuperappa && <SkuYatimCleaner reload={reload} showToast={showToast} />}

      {isSuperappa && <FotoYatimCleaner reload={reload} showToast={showToast} />}

      {bolehAtur && <UserManager showToast={showToast} ptTetap={ptSendiri} />}

      {isSuperappa && <HakAkses showToast={showToast} reload={reload} />}
    </div>
  );
}

// Pengaturan per perusahaan (entitas): rumus harga & Mode Perbaikan khusus satu PT.
// Disimpan di master_data tipe "entitas_set" (kode "<PT>:<kunci>", label = isi) — pola yang sama
// dengan profil perusahaan, jadi TIDAK perlu SQL baru. Kosong = pakai bawaan.
// Super Appa memilih PT mana saja; superadmin biasa hanya PT akunnya sendiri (rumus harga saja).
const FIELD_HARGA = [
  { key: "round_to", label: "Pembulatan harga (kelipatan Rp)" },
  { key: "harga_min", label: "Harga asli minimal (Rp)" },
  { key: "hpp_persen", label: "Tambahan HPP (%)" },
  { key: "grosir_x", label: "Pengali Grosir (x HPP)" },
  { key: "tengah_x1", label: "Pengali Tengah, HPP < 10.000" },
  { key: "tengah_x2", label: "Pengali Tengah, HPP 10.000–<20.000" },
  { key: "tengah_x3", label: "Pengali Tengah, HPP ≥ 20.000" },
  { key: "ecer_x", label: "Pengali Ecer (x Tengah)" },
];

function hitungContoh(hargaAsli, r) {
  const round = (n) => Math.round(n / r.round_to) * r.round_to;
  const dasar = Math.max(hargaAsli, r.harga_min);
  const hpp = dasar * (1 + r.hpp_persen / 100);
  const mult = hpp < 10000 ? r.tengah_x1 : hpp < 20000 ? r.tengah_x2 : r.tengah_x3;
  const tengah = round(hpp * mult);
  return { grosir: round(hpp * r.grosir_x), tengah, ecer: round(tengah * r.ecer_x) };
}

function PengaturanPerPT({ settings, session, isSuperappa, showToast }) {
  const [entitas, setEntitas] = useState([]);
  const [setList, setSetList] = useState([]);
  const [pt, setPt] = useState(session?.entitas || entitasSesi());
  const [nilai, setNilai] = useState({});
  const [saving, setSaving] = useState(false);

  const muat = async () => {
    const [e, st] = await Promise.all([
      sb("master_data?tipe=eq.entitas&select=id,kode,label&order=kode"),
      sb("master_data?tipe=eq.entitas_set&select=id,kode,label"),
    ]);
    const el = Array.isArray(e) ? e : [];
    const sl = Array.isArray(st) ? st : [];
    setEntitas(el);
    setSetList(sl);
    daftarkanProfilEntitas({ entitas: el, entitas_set: sl });
    return sl;
  };

  useEffect(() => {
    muat().catch((err) => showToast(err.message || "Gagal memuat pengaturan perusahaan", "err"));
  }, []);

  const baris = (kunci) => setList.find((m) => m.kode === `${pt}:${kunci}`);

  // Isi form ulang tiap ganti PT / data termuat: hanya nilai yang memang ditimpa PT ini.
  useEffect(() => {
    const awal = {};
    FIELD_HARGA.forEach((f) => {
      const b = setList.find((m) => m.kode === `${pt}:${f.key}`);
      awal[f.key] = b ? String(b.label) : "";
    });
    setNilai(awal);
  }, [pt, setList]);

  const ptSendiri = session?.entitas || "OPS";
  const daftarPT = isSuperappa
    ? entitas
    : [{ kode: ptSendiri, label: entitas.find((e) => e.kode === ptSendiri)?.label || ptSendiri }];
  const namaPT = entitas.find((e) => e.kode === pt)?.label || pt;

  const bawaan = (k) => (k === "round_to" ? Number(settings?.round_to) || 1000 : RUMUS_HARGA_BAWAAN[k]);
  const efektif = { ...rumusHargaEntitas([], pt, settings) };
  FIELD_HARGA.forEach((f) => {
    const n = Number(String(nilai[f.key] ?? "").replace(",", "."));
    efektif[f.key] = Number.isFinite(n) && n > 0 && nilai[f.key] !== "" ? n : bawaan(f.key);
  });
  const contoh = hitungContoh(10000, efektif);
  const fmt = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");

  const tulis = async (kunci, isi) => {
    const ada = baris(kunci);
    if (ada && isi) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label: isi }) });
    else if (ada && !isi) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
    else if (!ada && isi) await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "entitas_set", kode: `${pt}:${kunci}`, label: isi }) });
  };

  const simpanHarga = async () => {
    if (saving) return;
    for (const f of FIELD_HARGA) {
      const v = String(nilai[f.key] ?? "").trim();
      if (v !== "" && !(Number(v.replace(",", ".")) > 0)) {
        showToast(`${f.label}: isi angka lebih dari 0, atau kosongkan untuk pakai bawaan`, "err");
        return;
      }
    }
    setSaving(true);
    try {
      for (const f of FIELD_HARGA) await tulis(f.key, String(nilai[f.key] ?? "").trim().replace(",", "."));
      await muat();
      showToast(`Rumus harga ${namaPT} disimpan`);
    } catch (err) {
      showToast(err.message || "Gagal menyimpan rumus harga", "err");
    } finally {
      setSaving(false);
    }
  };

  const perbaikanAktif = baris("perbaikan")?.label === "1";
  const togglePerbaikan = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await tulis("perbaikan", perbaikanAktif ? "" : "1");
      await muat();
      showToast(perbaikanAktif ? `Mode perbaikan ${namaPT} dimatikan` : `Mode perbaikan ${namaPT} diaktifkan`);
    } catch (err) {
      showToast(err.message || "Gagal mengubah mode perbaikan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Pengaturan per Perusahaan</div>
      <p className="text-xs text-slate-500 mb-3 max-w-xl">
        Rumus harga dan Mode Perbaikan yang berlaku khusus untuk satu PT. Kolom dikosongkan = pakai
        bawaan. Harga barang yang sudah tersimpan tidak berubah — rumus baru dipakai saat harga dihitung
        ulang (SKU baru / edit harga).
      </p>

      <Field label="Perusahaan">
        <SearchableSelect
          value={pt}
          onChange={setPt}
          options={daftarPT.map((e) => ({ value: e.kode, label: e.label || e.kode }))}
        />
      </Field>

      <div className="text-xs text-slate-300 mt-2 mb-2">Rumus harga — {namaPT}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        {FIELD_HARGA.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              className={inputClass}
              inputMode="decimal"
              value={nilai[f.key] ?? ""}
              onChange={(e) => setNilai((n) => ({ ...n, [f.key]: e.target.value }))}
              placeholder={`Bawaan: ${bawaan(f.key)}`}
            />
          </Field>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 mb-3">
        Contoh harga asli Rp 10.000 → Grosir {fmt(contoh.grosir)} · Tengah {fmt(contoh.tengah)} · Ecer {fmt(contoh.ecer)}
      </div>
      <button
        onClick={simpanHarga}
        disabled={saving}
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950"
      >
        {saving ? "Menyimpan…" : "Simpan rumus harga"}
      </button>

      {isSuperappa && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                <Wrench size={14} /> Mode Perbaikan — {namaPT}
              </div>
              <p className="text-xs text-slate-500 max-w-xl">
                Hanya akun milik {namaPT} yang terkunci (tampil "Sedang Dalam Perbaikan"). PT lain tetap
                jalan normal. Super Appa dan absen karyawan tidak terpengaruh.
              </p>
            </div>
            <button
              onClick={togglePerbaikan}
              disabled={saving}
              className={`flex-shrink-0 relative w-12 h-7 rounded-full transition-colors ${perbaikanAktif ? "bg-amber-500" : "bg-slate-700"} disabled:opacity-50`}
              title={perbaikanAktif ? "Matikan mode perbaikan PT ini" : "Aktifkan mode perbaikan PT ini"}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${perbaikanAktif ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {perbaikanAktif && (
            <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg">
              <AlertTriangle size={13} className="flex-shrink-0" /> Mode perbaikan {namaPT} sedang AKTIF.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Mode Perbaikan — begitu diaktifkan, SistemSelmaApp (lihat App.jsx) akan
// mengunci akses MainApp untuk SEMUA role KECUALI "superappa" dan
// menampilkan halaman "Sedang Dalam Perbaikan". Karyawan yang login untuk
// absen (FormAbsen) TIDAK terpengaruh sama sekali — jalur absen dicek
// terpisah dari flag ini di App.jsx, jadi karyawan tetap bisa absen normal.
function MaintenanceToggle({ settings, reload, showToast }) {
  const [saving, setSaving] = useState(false);
  const aktif = !!settings?.maintenance_mode;

  const toggle = async () => {
    if (!settings?.id) {
      showToast("Baris settings belum punya id — tidak bisa disimpan.", "err");
      return;
    }
    setSaving(true);
    try {
      await sb(`settings?id=eq.${settings.id}`, {
        method: "PATCH",
        body: JSON.stringify({ maintenance_mode: !aktif }),
      });
      await reload();
      showToast(!aktif ? "Mode perbaikan diaktifkan" : "Mode perbaikan dimatikan");
    } catch (e) {
      showToast(e.message || "Gagal mengubah mode perbaikan", "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <Wrench size={14} /> Mode Perbaikan (semua PT)
          </div>
          <p className="text-xs text-slate-500 max-w-xl">
            Kalau diaktifkan, semua user (selain akun Super Admin ini) akan melihat tulisan
            "Sedang Dalam Perbaikan" begitu login dan tidak bisa mengakses sistem sama sekali.
            Absen karyawan TETAP berjalan normal, tidak ikut terkunci oleh mode ini.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`flex-shrink-0 relative w-12 h-7 rounded-full transition-colors ${
            aktif ? "bg-amber-500" : "bg-slate-700"
          } disabled:opacity-50`}
          title={aktif ? "Matikan mode perbaikan" : "Aktifkan mode perbaikan"}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
              aktif ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {aktif && (
        <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-lg">
          <AlertTriangle size={13} className="flex-shrink-0" /> Mode perbaikan sedang AKTIF sekarang.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HAK AKSES (khusus Super Appa, hanya MELIHAT — tidak mengubah apa pun).
//  1. Akun login: role ASLI (superappa tidak disamarkan di sini), PT, dan apakah akun itu bisa login Kasir.
//  2. Menu per role: menu & sub-menu yang terbuka untuk satu role di PT tertentu — dihitung dari aturan
//     yang sama dengan sidebar (allowedMenus / allowedSubMenus / onlyRole), termasuk fitur yang dimatikan
//     per perusahaan di Kelola Perusahaan.
// ---------------------------------------------------------------------------
const ROLE_ASLI = [{ key: "superappa", label: "Super Appa (tampil sebagai \"Super Admin\")" }, ...ROLES];

function menuTerbukaUntukRole(role, entitas, fiturMati) {
  const nodes = filterNavByAllowed(NAV, allowedMenus(role, entitas, fiturMati), role);
  const hasil = [];
  const jalan = (daftar, grup) =>
    daftar.forEach((n) => {
      if (n.group) {
        jalan(n.children || [], n.label);
        return;
      }
      const batas = allowedSubMenus(role, n.key);
      const subs = n.children ? n.children.filter((c) => !batas || batas.includes(c.key)).map((c) => c.label) : [];
      hasil.push({ key: n.key, grup, label: n.label, subs });
    });
  jalan(nodes, "");
  return hasil;
}

// ---------------------------------------------------------------------------
// EDITOR HAK AKSES per role (khusus Super Appa). Tersimpan di master_data tipe "role_akses"
// (kode = role, label = JSON) — tanpa SQL tambahan. Yang bisa diatur: menu & sub-menu yang terbuka,
// boleh/tidaknya login Kasir, dan mode "hanya lihat" (tidak bisa tambah/ubah/hapus data).
// Super Appa sendiri tidak bisa diubah supaya tidak bisa mengunci dirinya sendiri.
// ---------------------------------------------------------------------------
function daftarMenuEditor() {
  const hasil = [];
  const jalan = (nodes, grup) =>
    nodes.forEach((n) => {
      if (n.group) return jalan(n.children || [], n.label);
      hasil.push({
        key: n.key,
        grup,
        label: n.label,
        subs: (n.children || []).filter((c) => !c.onlyRole).map((c) => ({ key: c.key, label: c.label })),
      });
    });
  jalan(NAV, "");
  return hasil;
}

function EditorAksesRole({ role, rows, onSimpan, onReset, menyimpan }) {
  const daftar = daftarMenuEditor();
  const tersimpan = aksesRoleTersimpan(role);

  const awal = () => {
    const menus = new Set(tersimpan?.menus || menuBawaanRole(role));
    const subs = {};
    daftar.forEach((m) => {
      if (!m.subs.length) return;
      const semua = m.subs.map((s) => s.key);
      const bawaan = Array.isArray(tersimpan?.subs?.[m.key]) ? tersimpan.subs[m.key] : allowedSubMenusBawaan(role, m.key);
      subs[m.key] = new Set(bawaan ? bawaan.filter((k) => semua.includes(k)) : semua);
    });
    return {
      menus,
      subs,
      kasir: typeof tersimpan?.kasir === "boolean" ? tersimpan.kasir : ROLE_BOLEH_KASIR.includes(role),
      hanyaLihat: typeof tersimpan?.hanyaLihat === "boolean" ? tersimpan.hanyaLihat : ROLE_HANYA_LIHAT_BAWAAN.includes(role),
    };
  };
  const [d, setD] = useState(awal);
  // Ganti role / data tersimpan berubah -> muat ulang isian.
  useEffect(() => {
    setD(awal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, rows]);

  const toggleMenu = (key) =>
    setD((p) => {
      const menus = new Set(p.menus);
      menus.has(key) ? menus.delete(key) : menus.add(key);
      return { ...p, menus };
    });
  const toggleSub = (menuKey, subKey) =>
    setD((p) => {
      const cur = new Set(p.subs[menuKey] || []);
      cur.has(subKey) ? cur.delete(subKey) : cur.add(subKey);
      return { ...p, subs: { ...p.subs, [menuKey]: cur } };
    });
  const grupMenu = (g) => daftar.filter((m) => m.grup === g);
  const semuaGrup = [...new Set(daftar.map((m) => m.grup))];

  const simpan = () => {
    const menus = daftar.filter((m) => d.menus.has(m.key)).map((m) => m.key);
    // Menu yang tidak tampil di editor (mis. "barang-masuk") ikut otomatis lewat allowedMenus.
    const subs = {};
    daftar.forEach((m) => {
      if (!m.subs.length || !d.menus.has(m.key)) return;
      const semua = m.subs.map((s) => s.key);
      const pilih = semua.filter((k) => d.subs[m.key]?.has(k));
      const bawaan = allowedSubMenusBawaan(role, m.key);
      const sama = (bawaan ? bawaan.filter((k) => semua.includes(k)) : semua).slice().sort().join("|") === pilih.slice().sort().join("|");
      if (!sama) subs[m.key] = pilih;
    });
    onSimpan(role, { menus, subs, kasir: d.kasir, hanyaLihat: d.hanyaLihat });
  };

  return (
    <div className="rounded-lg border border-slate-800 p-3 mb-4">
      <div className="text-xs font-semibold text-slate-300 mb-1">Atur akses role</div>
      <p className="text-[11px] text-slate-500 mb-3">
        Centang menu & sub-menu yang boleh dibuka role ini. Berlaku untuk SEMUA akun dengan role tersebut (setelah mereka muat ulang halaman).
        {tersimpan ? " Role ini sudah punya pengaturan khusus." : " Sekarang masih memakai aturan bawaan."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <label className="flex items-start gap-2 text-sm text-slate-200 border border-slate-800 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={d.kasir} onChange={(e) => setD((p) => ({ ...p, kasir: e.target.checked }))} />
          <span>Boleh login aplikasi Kasir (/kasir)</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-200 border border-slate-800 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={d.hanyaLihat} onChange={(e) => setD((p) => ({ ...p, hanyaLihat: e.target.checked }))} />
          <span>
            Hanya lihat (read-only)
            <span className="block text-[11px] text-slate-500">Tidak bisa tambah / ubah / hapus data.</span>
          </span>
        </label>
      </div>

      <div className="space-y-3">
        {semuaGrup.map((g) => (
          <div key={g || "_"} className="border border-slate-800 rounded-lg overflow-hidden">
            {g && <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-slate-400 bg-slate-900/60">{g}</div>}
            <div className="divide-y divide-slate-800">
              {grupMenu(g).map((m) => (
                <div key={m.key} className="px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={d.menus.has(m.key)} onChange={() => toggleMenu(m.key)} />
                    {m.label}
                  </label>
                  {m.subs.length > 0 && d.menus.has(m.key) && (
                    <div className="mt-1.5 ml-6 flex flex-wrap gap-x-4 gap-y-1">
                      {m.subs.map((s) => (
                        <label key={s.key} className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                          <input type="checkbox" checked={!!d.subs[m.key]?.has(s.key)} onChange={() => toggleSub(m.key, s.key)} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button disabled={menyimpan} onClick={simpan} className="text-xs font-medium bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 px-3 py-2 rounded-lg">
          {menyimpan ? "Menyimpan…" : "Simpan akses role"}
        </button>
        {tersimpan && (
          <button disabled={menyimpan} onClick={() => onReset(role)} className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 px-3 py-2 rounded-lg disabled:opacity-50">
            Kembalikan ke bawaan
          </button>
        )}
      </div>
    </div>
  );
}

function HakAkses({ showToast, reload }) {
  const [users, setUsers] = useState(null);
  const [entitasList, setEntitasList] = useState([]);
  const [fiturRows, setFiturRows] = useState([]);
  const [aksesRows, setAksesRows] = useState([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [role, setRole] = useState("gudang");
  const [pt, setPt] = useState("OPS");

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const [u, e, f, a] = await Promise.all([
          listUsers(),
          sb("master_data?tipe=eq.entitas&select=kode,label&order=kode").catch(() => []),
          sb("master_data?tipe=eq.entitas_fitur&select=kode,label").catch(() => []),
          sb("master_data?tipe=eq.role_akses&select=id,kode,label").catch(() => []),
        ]);
        if (batal) return;
        setUsers(Array.isArray(u) ? u : []);
        setEntitasList(Array.isArray(e) ? e : []);
        setFiturRows(Array.isArray(f) ? f : []);
        setAksesRows(Array.isArray(a) ? a : []);
        setAksesRole(Array.isArray(a) ? a : []);
      } catch (err) {
        if (!batal) showToast(err.message || "Gagal memuat daftar akun", "err");
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const muatUlangAkses = async () => {
    const a = await sb("master_data?tipe=eq.role_akses&select=id,kode,label");
    const rows = Array.isArray(a) ? a : [];
    setAksesRows(rows);
    setAksesRole(rows);
    if (typeof reload === "function") reload();
  };
  const simpanAkses = async (roleKey, data) => {
    setMenyimpan(true);
    try {
      const label = JSON.stringify(data);
      const ada = aksesRows.find((r) => r.kode === roleKey);
      if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "PATCH", body: JSON.stringify({ label }) });
      else await sb("master_data", { method: "POST", body: JSON.stringify({ tipe: "role_akses", kode: roleKey, label }) });
      await muatUlangAkses();
      showToast(`Hak akses role "${labelRole(roleKey)}" disimpan`, "ok");
    } catch (err) {
      showToast(err.message || "Gagal menyimpan hak akses", "err");
    } finally {
      setMenyimpan(false);
    }
  };
  const resetAkses = async (roleKey) => {
    if (!window.confirm(`Kembalikan hak akses role "${labelRole(roleKey)}" ke aturan bawaan?`)) return;
    setMenyimpan(true);
    try {
      const ada = aksesRows.find((r) => r.kode === roleKey);
      if (ada) await sb(`master_data?id=eq.${ada.id}`, { method: "DELETE" });
      await muatUlangAkses();
      showToast("Hak akses dikembalikan ke bawaan", "ok");
    } catch (err) {
      showToast(err.message || "Gagal mengembalikan hak akses", "err");
    } finally {
      setMenyimpan(false);
    }
  };

  const namaPT = (kode) => entitasList.find((x) => x.kode === kode)?.label || (kode === "OPS" ? "Selma" : kode);
  const opsiPT = [{ value: "OPS", label: namaPT("OPS") }, ...entitasList.filter((x) => x.kode !== "OPS").map((x) => ({ value: x.kode, label: x.label || x.kode }))];
  const fiturMati = fiturMatiEntitas({ entitas_fitur: fiturRows }, pt);
  const menu = menuTerbukaUntukRole(role, pt, fiturMati);
  const grupMenu = [...new Set(menu.map((m) => m.grup))];
  const urut = (users || []).slice().sort((a, b) => String(a.role).localeCompare(String(b.role)) || String(a.username).localeCompare(String(b.username)));
  const akunKasir = urut.filter((u) => bolehKasir(u.role));
  const labelRole = (k) => ROLE_ASLI.find((r) => r.key === k)?.label || k;

  return (
    <div className="rounded-xl border border-slate-800 p-4 max-w-3xl mt-6">
      <div className="text-sm font-semibold mb-1">Hak Akses (khusus Super Appa)</div>
      <p className="text-xs text-slate-500 mb-4 max-w-xl">
        Atur apa yang boleh dilakukan tiap role: menu & sub-menu, login Kasir, dan mode hanya-lihat. Role asli tiap akun ditampilkan di bawah.
        Untuk mengganti role sebuah akun, ubah lewat Kelola User / kolom role di tabel app_users.
      </p>

      <div className="rounded-lg border border-slate-800 p-3 mb-4">
        <div className="text-xs font-semibold text-slate-300 mb-1">Login aplikasi Kasir (/kasir)</div>
        <p className="text-xs text-slate-500 mb-2">
          Role yang diizinkan: {ROLE_ASLI.filter((r) => bolehKasir(r.key)).map((r) => labelRole(r.key)).join(", ") || "-"}. Role lain ditolak dengan pesan "Tidak punya akses kasir". Atur di bagian "Atur akses role" di bawah.
        </p>
        {memuat ? (
          <div className="text-xs text-slate-500">Memuat…</div>
        ) : akunKasir.length === 0 ? (
          <div className="text-xs text-amber-300">Belum ada akun dengan role yang diizinkan.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {akunKasir.map((u) => (
              <span key={u.id} className="text-xs bg-emerald-400/15 text-emerald-300 rounded-full px-2.5 py-1">
                @{u.username} · {u.nama} · {namaPT(u.entitas || "OPS")}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs font-semibold text-slate-300 mb-2">Akun & role asli</div>
      {memuat ? (
        <div className="text-xs text-slate-500">Memuat daftar akun…</div>
      ) : urut.length === 0 ? (
        <EmptyState label="Belum ada akun." />
      ) : (
        <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden mb-5">
          {urut.map((u) => (
            <div key={u.id} className="px-3 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{u.nama}</div>
                <div className="text-[11px] text-slate-500 truncate">@{u.username} · {namaPT(u.entitas || "OPS")}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">{u.role}</span>
                {bolehKasir(u.role) && <span className="text-[11px] bg-emerald-400/15 text-emerald-300 rounded-full px-2 py-0.5">Kasir</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs font-semibold text-slate-300 mb-2">Atur akses per role</div>
      <div className="mb-3 max-w-sm">
        <Field label="Role yang diatur">
          <SearchableSelect value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r.key, label: `${r.label} (${r.key})` }))} />
        </Field>
      </div>
      {memuat ? null : role === "superappa" ? (
        <div className="text-xs text-slate-500 border border-slate-800 rounded-lg px-3 py-2 mb-4">Super Appa selalu akses penuh dan tidak bisa diubah. Pilih role lain.</div>
      ) : (
        <EditorAksesRole key={role} role={role} rows={aksesRows} onSimpan={simpanAkses} onReset={resetAkses} menyimpan={menyimpan} />
      )}
      <p className="text-[11px] text-slate-500 mb-5">Super Appa selalu punya akses penuh dan tidak bisa diubah di sini.</p>

      <div className="text-xs font-semibold text-slate-300 mb-2">Pratinjau menu yang terbuka (per role & PT)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label="Role">
          <SearchableSelect value={role} onChange={setRole} options={ROLE_ASLI.map((r) => ({ value: r.key, label: `${r.label} (${r.key})` }))} />
        </Field>
        <Field label="PT akun">
          <SearchableSelect value={pt} onChange={setPt} options={opsiPT} />
        </Field>
      </div>
      {fiturMati.length > 0 && (
        <p className="text-[11px] text-slate-500 mb-2">Fitur yang dimatikan untuk {namaPT(pt)} (Kelola Perusahaan) sudah diperhitungkan: {fiturMati.join(", ")}.</p>
      )}
      {menu.length === 0 ? (
        <EmptyState label="Tidak ada menu di sidebar untuk kombinasi ini." />
      ) : (
        <div className="space-y-3">
          {grupMenu.map((g) => (
            <div key={g || "_"} className="border border-slate-800 rounded-lg overflow-hidden">
              {g && <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-slate-400 bg-slate-900/60">{g}</div>}
              <div className="divide-y divide-slate-800">
                {menu.filter((m) => m.grup === g).map((m) => (
                  <div key={m.key} className="px-3 py-2">
                    <div className="text-sm text-slate-200">{m.label}</div>
                    {m.subs.length > 0 && <div className="text-[11px] text-slate-500 mt-0.5">{m.subs.join(" · ")}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">
        Ini membatasi tampilan menu & tombol tulis di aplikasi, bukan pengaman di sisi database (anon key sama untuk semua role).
      </p>
    </div>
  );
}

// Kelola user login (username, nama, role, password) — hanya untuk superadmin.
function UserManager({ showToast, ptTetap = null }) {
  const [users, setUsers] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", nama: "", role: "gudang", entitas: ptTetap || "OPS" });
  const [entitasList, setEntitasList] = useState([]);
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
    // Daftar PT dari master_data (tipe "entitas") — diatur di Perusahaan Grup > Kelola.
    sb("master_data?tipe=eq.entitas&select=kode,label&order=kode")
      .then((r) => setEntitasList(Array.isArray(r) ? r : []))
      .catch(() => setEntitasList([]));
  }, []);

  const namaPT = (kode) => entitasList.find((e) => e.kode === kode)?.label || kode || "OPS";

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const tambah = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password || !form.nama.trim()) {
      showToast("Username, nama, dan password wajib diisi", "err");
      return;
    }
    setSaving(true);
    try {
      await createUser({ ...form, entitas: ptTetap || form.entitas });
      setForm({ username: "", password: "", nama: "", role: "gudang", entitas: ptTetap || form.entitas });
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
        {ptTetap
          ? `Tambah, hapus, atau ubah password akun login ${namaPT(ptTetap)}. Akun baru otomatis terikat ke ${namaPT(ptTetap)}.`
          : "Tambah, hapus, atau ubah password akun login semua PT. Hanya Super Admin yang bisa mengakses bagian ini."}
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
        {ptTetap ? (
          <Field label="PT (akun terikat ke)">
            <div className={`${inputClass} text-slate-400`}>{namaPT(ptTetap)} (otomatis)</div>
          </Field>
        ) : (
          <Field label="PT (akun terikat ke)">
            <SearchableSelect
              value={form.entitas}
              onChange={(v) => set("entitas", v)}
              options={[{ value: "OPS", label: namaPT("OPS") }, ...entitasList.filter((e) => e.kode !== "OPS").map((e) => ({ value: e.kode, label: e.label || e.kode }))]}
            />
          </Field>
        )}
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
                    @{u.username} · {roleLabel(u.role)} · {namaPT(u.entitas || "OPS")}
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

// Pembersihan foto "yatim" — foto_url (barang) & foto_bon_url/foto_bon_urls
// (bon transaksi Barang Datang) yang masih menunjuk ke file di bucket Storage
// padahal filenya sudah dihapus langsung dari Storage (mis. lewat
// Cyberduck/S3, bukan lewat aplikasi ini). Kalau tidak dibersihkan, foto_url
// tetap "nyangkut" di database dan bikin <img> di FotoProduk/DataBarang/
// Marketplace/Dashboard (untuk foto barang) atau Barang Datang/Rusak (untuk
// foto bon) nampilin gambar rusak (broken).
//
// Bucket ini public tapi anon key tidak tentu punya izin LIST/SELECT ke
// storage.objects (perlu policy RLS tersendiri), jadi supaya tidak bergantung
// pada policy tambahan, pengecekan dilakukan dengan cara yang sudah pasti
// selalu bisa dipakai: GET request langsung ke tiap url publik satu-satu
// (persis cara <img> di aplikasi ini memuat fotonya). Kalau balas 404 → file
// itu memang sudah tidak ada di Storage.
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

  // Verifikasi dua tahap dipakai bersama buat kedua sumber (barang & bon):
  // hitung mana yang 404 di percobaan pertama, lalu cek ULANG khusus yang
  // 404 itu saja (bukan semuanya) — hanya yang 404 dua kali berturut-turut
  // yang dianggap benar-benar hilang (jaga-jaga dari 404 "nyasar"/sementara).
  const cekBertahap = async (daftarUrl, onProgress) => {
    const unik = Array.from(new Set(daftarUrl));
    const hilang = new Set();
    for (let i = 0; i < unik.length; i += KONKURENSI) {
      const batch = unik.slice(i, i + KONKURENSI);
      const hasil = await Promise.all(batch.map(cekSatu));
      batch.forEach((url, j) => {
        if (hasil[j]) hilang.add(url);
      });
      onProgress?.(Math.min(i + KONKURENSI, unik.length), unik.length);
    }
    const kandidat = Array.from(hilang);
    const benarHilang = new Set();
    for (let i = 0; i < kandidat.length; i += KONKURENSI) {
      const batch = kandidat.slice(i, i + KONKURENSI);
      const hasil = await Promise.all(batch.map(cekSatu));
      batch.forEach((url, j) => {
        if (hasil[j]) benarHilang.add(url);
      });
    }
    return benarHilang;
  };

  const cek = async () => {
    setChecking(true);
    setOrphans(null);
    setProgress(null);
    try {
      const [items, penerimaan] = await Promise.all([
        sbAll("items?select=id,sku,foto_url&foto_url=not.is.null"),
        sbAll("pesanan_masuk?select=id,kode_pesanan,foto_bon_url,foto_bon_urls"),
      ]);

      // Barang: satu foto per baris (foto_url).
      const barangList = items.filter((i) => i.foto_url);

      // Bon: satu baris Barang Datang bisa punya BEBERAPA foto bon
      // (foto_bon_urls array) — data lama cuma punya foto_bon_url tunggal.
      // Diratakan jadi satu foto per entri (bisa lebih dari satu entri per
      // pesanan_masuk yang sama) supaya tiap foto dicek & bisa dibersihkan
      // satu-satu tanpa ikut menghapus foto lain yang masih ada di baris
      // yang sama.
      const bonList = [];
      for (const p of penerimaan) {
        const urls = Array.isArray(p.foto_bon_urls) && p.foto_bon_urls.length > 0
          ? p.foto_bon_urls
          : p.foto_bon_url
          ? [p.foto_bon_url]
          : [];
        urls.forEach((url) => url && bonList.push({ pesananMasukId: p.id, kode_pesanan: p.kode_pesanan, url }));
      }

      const semuaUrl = [...barangList.map((b) => b.foto_url), ...bonList.map((b) => b.url)];
      setProgress({ done: 0, total: semuaUrl.length });
      const benarHilang = await cekBertahap(semuaUrl, (done, total) => setProgress({ done, total }));

      const yatimBarang = barangList
        .filter((it) => benarHilang.has(it.foto_url))
        .map((it) => ({ jenis: "barang", id: it.id, label: it.sku, url: it.foto_url }));
      const yatimBon = bonList
        .filter((it) => benarHilang.has(it.url))
        .map((it) => ({ jenis: "bon", id: it.pesananMasukId, label: it.kode_pesanan || "—", url: it.url }));

      const yatim = [...yatimBarang, ...yatimBon];
      setOrphans(yatim);
      if (yatim.length === 0) showToast("Tidak ada foto yatim — semua foto_url/foto bon di database masih ada filenya");
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
      const yatimBarang = orphans.filter((o) => o.jenis === "barang");
      const yatimBon = orphans.filter((o) => o.jenis === "bon");

      // Barang: PATCH sekaligus dalam satu request pakai filter id=in.(...)
      // — lebih cepat & lebih aman (satu transaksi) daripada looping satu-satu.
      if (yatimBarang.length > 0) {
        const ids = yatimBarang.map((o) => o.id).join(",");
        await sb(`items?id=in.(${ids})`, {
          method: "PATCH",
          body: JSON.stringify({ foto_url: null }),
        });
      }

      // Bon: satu baris pesanan_masuk bisa punya beberapa foto bon, jadi
      // TIDAK bisa dikosongkan sekaligus seperti barang — cuma foto yang
      // benar-benar hilang yang dibuang dari array-nya, foto lain di baris
      // yang sama (kalau masih ada filenya) tetap dipertahankan.
      if (yatimBon.length > 0) {
        const penerimaanTerdampak = await sbAll(
          `pesanan_masuk?id=in.(${yatimBon.map((o) => o.id).join(",")})&select=id,foto_bon_url,foto_bon_urls`
        );
        for (const p of penerimaanTerdampak) {
          const urlHilang = new Set(yatimBon.filter((o) => o.id === p.id).map((o) => o.url));
          const urlLama = Array.isArray(p.foto_bon_urls) && p.foto_bon_urls.length > 0
            ? p.foto_bon_urls
            : p.foto_bon_url
            ? [p.foto_bon_url]
            : [];
          const urlBaru = urlLama.filter((u) => !urlHilang.has(u));
          await sb(`pesanan_masuk?id=eq.${p.id}`, {
            method: "PATCH",
            body: JSON.stringify({ foto_bon_urls: urlBaru, foto_bon_url: urlBaru[0] || null }),
          });
        }
      }

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
        Cek apakah ada foto barang atau foto bon (Barang Datang) yang url-nya masih tercatat di
        database, tapi file fotonya sudah terhapus langsung dari Storage (mis. lewat
        Cyberduck/S3). Kalau dibiarkan, foto ini akan tampil rusak/broken di halaman Pemotretan,
        Data Barang, Marketplace, Dashboard, Barang Datang, maupun Rusak.
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
              sudah tidak ada di Storage. Kosongkan url foto-foto ini? Barang/pesanannya sendiri
              TIDAK dihapus — hanya link fotonya saja yang dikosongkan. Untuk foto barang,
              barangnya balik muncul di menu Pemotretan untuk difoto ulang. Untuk foto bon, foto
              lain di pesanan yang sama (kalau masih ada filenya) tetap dipertahankan.
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg mb-3 divide-y divide-slate-800">
            {orphans.map((o, i) => (
              <div key={`${o.jenis}-${o.id}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-200">{o.label}</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <ImageOff size={12} /> {o.jenis === "bon" ? "foto bon hilang" : "file hilang"}
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