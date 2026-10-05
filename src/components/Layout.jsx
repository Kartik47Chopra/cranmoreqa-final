import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Grid3x3, ListChecks, Search, HardHat, ChevronDown } from "lucide-react";
import { useQaData } from "@/lib/QaDataContext";
import LocationTree from "@/components/LocationTree";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/tracker", label: "Multi-Template Tracker", icon: Grid3x3 },
  { to: "/visis", label: "Visis", icon: ListChecks },
];

export default function Layout() {
  const { project, locations, loading } = useQaData();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className={`flex shrink-0 flex-col bg-slate-900 text-slate-300 transition-all ${sidebarOpen ? "w-[260px]" : "w-0"}`}>
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-900">
            <HardHat size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="font-display text-base font-bold uppercase tracking-tight text-white leading-none">Cranmore QA</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Carpenters Quality</div>
          </div>
        </div>

        {/* Project switcher */}
        <div className="px-3 py-3 border-b border-slate-800">
          <button className="flex w-full items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-left hover:bg-slate-800">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Project</div>
              <div className="truncate text-sm font-semibold text-white">{loading ? "Loading…" : project?.name || "—"}</div>
            </div>
            <ChevronDown size={16} className="shrink-0 text-slate-500" />
          </button>
        </div>

        {/* Nav */}
        <nav className="px-2 py-2 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Location tree */}
        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Location Tree</div>
          {loading ? (
            <div className="px-2 py-2 text-xs text-slate-500">Loading…</div>
          ) : (
            <LocationTree locations={locations} onSelect={(l) => navigate(`/location/${l.id}`)} />
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Toggle sidebar"
          >
            <LayoutDashboard size={16} />
          </button>
          <div className="relative w-48 max-w-[40%] md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search locations…"
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                if (!q) return;
                const match = locations.find((l) => l.name.toLowerCase().includes(q));
                if (match) navigate(`/location/${match.id}`);
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden md:inline font-mono text-xs">v1.0</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">CC</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}