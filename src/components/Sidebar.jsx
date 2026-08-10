import { useState, useEffect } from "react";
import { ChevronDown, Warehouse, X, Menu } from "lucide-react";
import { NAV } from "../lib/constants";

export default function Sidebar({ active, onNavigate, mobileOpen, setMobileOpen, badges = {} }) {
  const [expanded, setExpanded] = useState(() => new Set([active.menu]));

  // Pastikan grup dari menu aktif selalu terbuka.
  useEffect(() => {
    setExpanded((prev) => new Set(prev).add(active.menu));
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

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 flex-shrink-0 bg-slate-950 border-r border-slate-800 z-40 flex flex-col transition-transform duration-200 ${
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
          {NAV.map((item) => {
            const Icon = item.icon;
            const hasChildren = !!item.children?.length;
            const isActiveGroup = active.menu === item.key;
            const isOpen = expanded.has(item.key);

            return (
              <div key={item.key} className="mb-0.5">
                <button
                  onClick={() =>
                    hasChildren ? toggle(item.key) : go(item.key, null)
                  }
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                    isActiveGroup && !hasChildren
                      ? "bg-amber-500 text-slate-950 font-semibold"
                      : isActiveGroup
                      ? "text-slate-100 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {typeof badges[item.key] === "number" && badges[item.key] > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {badges[item.key]}
                    </span>
                  )}
                  {hasChildren && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {hasChildren && isOpen && (
                  <div className="ml-[1.65rem] mt-0.5 border-l border-slate-800 pl-2.5 space-y-0.5">
                    {item.children.map((child) => {
                      const isActiveChild =
                        isActiveGroup && active.sub === child.key;
                      return (
                        <button
                          key={child.key}
                          onClick={() => go(item.key, child.key)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] transition ${
                            isActiveChild
                              ? "bg-amber-500/15 text-amber-400 font-medium"
                              : "text-slate-500 hover:text-slate-200 hover:bg-slate-900"
                          }`}
                        >
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
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