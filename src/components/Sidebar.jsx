import { useState, useEffect } from "react";
import { ChevronDown, Warehouse, X, Menu, LogOut, KeyRound } from "lucide-react";
import { NAV, roleLabel, navAncestorKeys, filterNavByAllowed } from "../lib/constants";
import { rippleEffect, iconBtnClass } from "./ui";

// Tombol untuk node "menu" (punya key yang dipakai sebagai nav.menu) — dipakai
// baik untuk item top-level (Dashboard, Laporan, Pengaturan) MAUPUN untuk menu
// yang berada di dalam sebuah group (mis. SKU & Harga di dalam Gudang). Kalau
// hasChildren true, klik hanya toggle expand/collapse (bukan navigasi).
// Gaya "Navigation Drawer" Material 3: item aktif ditandai indikator PIL bulat
// penuh (bukan garis di kiri seperti sebelumnya) — ciri paling khas drawer
// Android modern.
function MenuButton({ node, isActive, isOpen, hasChildren, onClick, badgeValue }) {
  const Icon = node.icon;
  return (
    <button
      onClick={onClick}
      onMouseDown={rippleEffect}
      className={`md-ripple-container w-full flex items-center gap-3 h-11 px-4 rounded-full text-sm transition-colors ${
        isActive && !hasChildren
          ? "bg-md-primary-container text-md-on-primary-container font-medium"
          : isActive
          ? "text-md-on-surface font-medium hover:bg-md-on-surface/[0.08]"
          : "text-md-on-surface-variant hover:bg-md-on-surface/[0.08]"
      }`}
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      <span className="flex-1 text-left truncate">{node.label}</span>
      {typeof badgeValue === "number" && badgeValue > 0 && (
        <span className="text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
          {badgeValue}
        </span>
      )}
      {hasChildren && (
        <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      )}
    </button>
  );
}

// Tombol untuk node "sub" (anak paling dalam, leaf — key-nya dipakai sebagai nav.sub).
function SubButton({ label, isActive, onClick, badgeValue }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={rippleEffect}
      className={`md-ripple-container w-full flex items-center gap-2 text-left h-9 px-3 rounded-full text-[13px] transition-colors ${
        isActive
          ? "bg-md-primary-container/60 text-md-primary font-medium"
          : "text-md-on-surface-variant hover:bg-md-on-surface/[0.08]"
      }`}
    >
      <span className="flex-1 truncate">{label}</span>
      {typeof badgeValue === "number" && badgeValue > 0 && (
        <span className="text-[10px] font-bold bg-md-error text-md-on-error rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
          {badgeValue}
        </span>
      )}
    </button>
  );
}

// Render satu node NAV secara rekursif — bisa jadi wadah group (murni visual,
// tidak bisa dinavigasi sendiri), menu dengan sub, atau menu leaf langsung.
function NavNode({ node, active, expanded, toggle, go, badges }) {
  const hasChildren = !!(node.children && node.children.length);
  const isOpen = expanded.has(node.key);

  if (node.group) {
    // Dulu cuma cek anak LANGSUNG (`node.children.some(...)`), jadi group
    // paling luar tidak ikut ditandai aktif kalau menu aktifnya ada di dalam
    // group bersarang (mis. "Grosir" di dalam "Store Selma" di dalam
    // "Penjualan"). Pakai navAncestorKeys supaya group di tingkat manapun
    // dalam rantai leluhur menu aktif tetap ditandai aktif.
    const groupActive = navAncestorKeys(active.menu).includes(node.key);
    return (
      <div className="mb-1">
        <MenuButton
          node={node}
          isActive={groupActive}
          isOpen={isOpen}
          hasChildren
          onClick={() => toggle(node.key)}
          badgeValue={badges[node.key]}
        />
        {isOpen && (
          <div className="ml-[1.65rem] mt-0.5 border-l border-md-outline-variant pl-2.5 space-y-0.5">
            {node.children.map((child) => (
              <NavNode key={child.key} node={child} active={active} expanded={expanded} toggle={toggle} go={go} badges={badges} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActiveMenu = active.menu === node.key;

  if (hasChildren) {
    return (
      <div className="mb-1">
        <MenuButton
          node={node}
          isActive={isActiveMenu}
          isOpen={isOpen}
          hasChildren
          onClick={() => toggle(node.key)}
          badgeValue={badges[node.key]}
        />
        {isOpen && (
          <div className="ml-[1.65rem] mt-0.5 border-l border-md-outline-variant pl-2.5 space-y-0.5">
            {node.children.map((sub) => (
              <SubButton
                key={sub.key}
                label={sub.label}
                isActive={isActiveMenu && active.sub === sub.key}
                onClick={() => go(node.key, sub.key)}
                badgeValue={badges[`${node.key}.${sub.key}`]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <MenuButton
        node={node}
        isActive={isActiveMenu}
        isOpen={false}
        hasChildren={false}
        onClick={() => go(node.key, null)}
        badgeValue={badges[node.key]}
      />
    </div>
  );
}

export default function Sidebar({
  active,
  onNavigate,
  mobileOpen,
  setMobileOpen,
  badges = {},
  allowedMenuKeys,
  user,
  onLogout,
  setModal,
}) {
  const [expanded, setExpanded] = useState(() => new Set(navAncestorKeys(active.menu)));

  // Pastikan grup/menu dari menu aktif selalu terbuka (termasuk wadah group-nya
  // kalau menu itu ada di dalam sebuah group).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      navAncestorKeys(active.menu).forEach((k) => next.add(k));
      return next;
    });
  }, [active.menu]);

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const go = (menuKey, subKey) => {
    onNavigate(menuKey, subKey);
    setMobileOpen(false);
  };

  // Hanya tampilkan menu (dan group yang masih punya isi) yang diizinkan
  // untuk role user yang sedang login.
  const visibleNav = filterNavByAllowed(NAV, allowedMenuKeys);

  return (
    <>
      {mobileOpen && (
        <div
          className="print:hidden fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {/* Navigation Drawer Material 3 — permanen (nempel, tanpa bayangan/sudut
          bulat) di layar lebar, jadi "modal drawer" melayang dengan sudut
          membulat & shadow di HP, sesuai spesifikasi drawer standar vs modal
          Material. */}
      <aside
        className={`print:hidden fixed lg:sticky top-0 left-0 h-screen w-72 flex-shrink-0 bg-md-container-low z-40 flex flex-col transition-transform duration-200 rounded-r-md-xl lg:rounded-none shadow-elevation-2 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between gap-2.5 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-md-md bg-md-primary flex items-center justify-center flex-shrink-0">
              <Warehouse size={19} className="text-md-on-primary" />
            </div>
            <div className="min-w-0">
              {user && user.role !== "superadmin" && user.role !== "owner" ? (
                <>
                  <div className="font-medium text-sm leading-none truncate text-md-on-surface">{user.nama || user.username}</div>
                  <div className="text-[11px] text-md-on-surface-variant leading-none mt-1.5 truncate">{roleLabel(user.role)}</div>
                </>
              ) : (
                <>
                  <div className="font-medium text-sm leading-none text-md-on-surface">Sistem Selma</div>
                  <div className="text-[11px] text-md-on-surface-variant leading-none mt-1.5">Manajemen inventori</div>
                </>
              )}
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className={`${iconBtnClass} lg:hidden`} onMouseDown={rippleEffect}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-1 px-3 space-y-1">
          {visibleNav.map((item) => (
            <NavNode key={item.key} node={item} active={active} expanded={expanded} toggle={toggle} go={go} badges={badges} />
          ))}
        </nav>

        {user && (
          <div className="mx-3 mb-3 mt-1 pt-3 border-t border-md-outline-variant flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-md-primary-container flex items-center justify-center flex-shrink-0 text-xs font-medium text-md-on-primary-container">
              {(user.nama || user.username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-md-on-surface truncate">{user.nama || user.username}</div>
              <div className="text-[10px] text-md-on-surface-variant truncate flex items-center gap-1.5">
                {roleLabel(user.role)}
                {user.role === "owner" && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-md-container-high text-md-primary leading-none">
                    Read-only
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setModal?.({ type: "ganti-password" })}
              title="Ganti Password"
              onMouseDown={rippleEffect}
              className="md-ripple-container w-8 h-8 flex items-center justify-center rounded-full text-md-on-surface-variant hover:text-md-primary hover:bg-md-on-surface/10 flex-shrink-0"
            >
              <KeyRound size={15} />
            </button>
            <button
              onClick={onLogout}
              title="Keluar"
              onMouseDown={rippleEffect}
              className="md-ripple-container w-8 h-8 flex items-center justify-center rounded-full text-md-on-surface-variant hover:text-red-400 hover:bg-md-on-surface/10 flex-shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }) {
  return (
    <button onClick={onClick} onMouseDown={rippleEffect} className={`${iconBtnClass} lg:hidden`}>
      <Menu size={18} />
    </button>
  );
}