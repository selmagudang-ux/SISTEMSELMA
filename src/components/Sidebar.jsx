import { useState, useEffect } from "react";
import { ChevronDown, Warehouse, X, Menu, LogOut, KeyRound } from "lucide-react";
import { NAV, roleLabel, allowedSubMenus, navAncestorKeys, filterNavByAllowed } from "../lib/constants";

// Tombol untuk node "menu" (punya key yang dipakai sebagai nav.menu) — dipakai
// baik untuk item top-level (Dashboard, Laporan, Pengaturan) MAUPUN untuk menu
// yang berada di dalam sebuah group (mis. SKU & Harga di dalam Gudang). Kalau
// hasChildren true, klik hanya toggle expand/collapse (bukan navigasi).
function MenuButton({ node, isActive, isOpen, hasChildren, onClick, badgeValue }) {
  const Icon = node.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 py-2 rounded-lg text-sm transition border-l-2 ${
        isActive && !hasChildren
          ? "border-amber-500 bg-slate-900 pl-[10px] pr-3 text-amber-400 font-semibold"
          : isActive
          ? "border-transparent pl-[10px] pr-3 text-slate-100 font-medium"
          : "border-transparent pl-[10px] pr-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
      }`}
    >
      {Icon && <Icon size={16} className="flex-shrink-0" />}
      <span className="flex-1 text-left">{node.label}</span>
      {typeof badgeValue === "number" && badgeValue > 0 && (
        <span className="text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
          {badgeValue}
        </span>
      )}
      {hasChildren && (
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      )}
    </button>
  );
}

// Tombol untuk node "sub" (anak paling dalam, leaf — key-nya dipakai sebagai nav.sub).
function SubButton({ label, isActive, onClick, badgeValue }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[13px] transition ${
        isActive
          ? "bg-amber-500/15 text-amber-400 font-medium"
          : "text-slate-500 hover:text-slate-200 hover:bg-slate-900"
      }`}
    >
      <span className="flex-1">{label}</span>
      {typeof badgeValue === "number" && badgeValue > 0 && (
        <span className="text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
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
    const groupActive = node.children.some((c) => c.key === active.menu);
    return (
      <div className="mb-0.5">
        <MenuButton
          node={node}
          isActive={groupActive}
          isOpen={isOpen}
          hasChildren
          onClick={() => toggle(node.key)}
        />
        {isOpen && (
          <div className="ml-[1.65rem] mt-0.5 border-l border-slate-800 pl-2.5 space-y-0.5">
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
      <div className="mb-0.5">
        <MenuButton
          node={node}
          isActive={isActiveMenu}
          isOpen={isOpen}
          hasChildren
          onClick={() => toggle(node.key)}
          badgeValue={badges[node.key]}
        />
        {isOpen && (
          <div className="ml-[1.65rem] mt-0.5 border-l border-slate-800 pl-2.5 space-y-0.5">
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
    <div className="mb-0.5">
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
      <aside
        className={`print:hidden fixed lg:sticky top-0 left-0 h-screen w-64 flex-shrink-0 bg-slate-950 border-r border-slate-800 z-40 flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Warehouse size={18} className="text-slate-950" />
            </div>
            <div>
              <div className="font-bold text-sm leading-none">Sistem Selma</div>
              <div className="text-[11px] text-slate-500 leading-none mt-1">Manajemen inventori</div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-slate-500 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {visibleNav.map((item) => (
            <NavNode key={item.key} node={item} active={active} expanded={expanded} toggle={toggle} go={go} badges={badges} />
          ))}
        </nav>

        {user && (
          <div className="border-t border-slate-800 px-3 py-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-300">
              {(user.nama || user.username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-200 truncate">{user.nama || user.username}</div>
              <div className="text-[10px] text-slate-500 truncate">{roleLabel(user.role)}</div>
            </div>
            <button
              onClick={() => setModal?.({ type: "ganti-password" })}
              title="Ganti Password"
              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-900 flex-shrink-0"
            >
              <KeyRound size={15} />
            </button>
            <button
              onClick={onLogout}
              title="Keluar"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-900 flex-shrink-0"
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
    <button
      onClick={onClick}
      className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 lg:hidden"
    >
      <Menu size={16} />
    </button>
  );
}