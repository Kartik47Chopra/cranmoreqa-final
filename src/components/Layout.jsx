import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Grid3x3, ListChecks, Search, ChevronDown, Building, X, Menu } from "lucide-react";
import { useQaData } from "@/lib/QaDataContext";
import LocationTree from "@/components/LocationTree";
import TreeLogo from "@/components/TreeLogo";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/tracker", label: "Multi-Template Tracker", icon: Grid3x3 },
  { to: "/visis", label: "Visis", icon: ListChecks },
];

export default function Layout() {
  const { project, locations, loading } = useQaData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background relative">
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-[280px] shrink-0 bg-[#0F172A] text-slate-200 flex flex-col border-r border-slate-800 transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center shadow-inner shrink-0">
              <TreeLogo size={22} />
            </div>
            <div>
              <div className="font-display font-bold text-xl leading-none tracking-wide text-white">Cranmore</div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-400">QA</div>
            </div>
          </div>
          <button className="md:hidden p-1.5 rounded-md hover:bg-slate-800 text-slate-400" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3">
          <div className="relative w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              placeholder="Search locations…"
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                if (!q) return;
                const match = locations.find((l) => l.name.toLowerCase().includes(q));
                if (match) navigate(`/location/${match.id}`);
              }}
              className="w-full rounded-md bg-slate-800 hover:bg-slate-700 focus:bg-slate-700 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        {/* Project switcher */}
        <div className="px-3 py-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
            <Building size={13} className="text-emerald-400" />
            <span className="truncate">{loading ? "Loading…" : project?.name || "Cranmore Carpenters"}</span>
          </div>
          <button className="w-full flex items-center justify-between gap-2 rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold transition-colors">
            <span className="truncate text-white">{loading ? "Loading…" : project?.name || "Select project"}</span>
            <ChevronDown size={15} className="text-slate-400" />
          </button>
        </div>

        {/* Nav + Location tree */}
        <div className="flex-1 overflow-y-auto sidebar-scroll">
          <nav className="px-2 py-2 space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-emerald-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"
                  }`
                }
              >
                <n.icon size={16} />
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-2 pb-4 mt-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Locations</div>
            {loading ? (
              <div className="px-3 py-2 text-xs text-slate-500">Loading…</div>
            ) : (
              <LocationTree locations={locations} onSelect={(l) => { navigate(`/location/${l.id}`); setDrawerOpen(false); }} />
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F172A] text-white shrink-0">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-1.5 rounded-md hover:bg-slate-800">
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{loading ? "Cranmore QA" : project?.name || "Cranmore QA"}</div>
          </div>
          <div className="h-7 w-7 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-xs font-bold shrink-0">CC</div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}