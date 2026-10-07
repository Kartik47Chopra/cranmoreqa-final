import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import AskAIPanel from "@/components/AskAIPanel";
import { useAuth } from "@/lib/AuthContext";
import { useQaData } from "@/lib/QaDataContext";
import LocationTree from "@/components/LocationTree";
import TreeLogo from "@/components/TreeLogo";
import {
  LayoutDashboard, ListTodo, ClipboardList, ListChecks, Grid3x3,
  FileText, Milestone as MilestoneIcon, Activity as ActivityIcon, FileBarChart,
  Settings, Users, Search, ChevronDown, Building, X, Menu, Sparkles, Map as MapIcon, MoreHorizontal,
} from "lucide-react";

const ALL_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/my-tasks", label: "My Tasks", icon: ListTodo, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/assign-tasks", label: "Assign Tasks", icon: ClipboardList, roles: ["admin", "pm"] },
  { to: "/your-list", label: "Your List", icon: ListChecks, roles: ["admin", "pm", "trade"] },
  { to: "/tracker", label: "Multi-Template Tracker", icon: Grid3x3, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/documents", label: "Documents", icon: FileText, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/milestones", label: "Milestone Tracker", icon: MilestoneIcon, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/activity", label: "Activity", icon: ActivityIcon, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/report", label: "Progress Report", icon: FileBarChart, roles: ["admin", "pm", "trade", "viewer"] },
  { to: "/setup", label: "Project Setup", icon: Settings, roles: ["admin", "pm"] },
  { to: "/users", label: "User Management", icon: Users, roles: ["admin"] },
];

const BOTTOM_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/my-tasks", label: "Tasks", icon: ListTodo },
  { to: "#locations", label: "Locations", icon: MapIcon },
  { to: "/report", label: "Progress", icon: FileBarChart },
  { to: "#more", label: "More", icon: MoreHorizontal },
];

export default function Layout() {
  const { user } = useAuth();
  const { project, projects, companyMap, locations, loading, loadError, reload, selectProject } = useQaData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [locSheetOpen, setLocSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const selectedLocId = location.pathname.startsWith("/location/") ? location.pathname.split("/")[2] : null;

  const userRole = user?.role || "viewer";
  const userCompany = user?.company_id ? companyMap[user.company_id] : null;
  const nav = ALL_NAV.filter((n) => n.roles.includes(userRole));
  const userInitial = (user?.full_name || user?.email || "?")[0]?.toUpperCase();

  // Close all sheets on navigation
  React.useEffect(() => {
    setDrawerOpen(false);
    setLocSheetOpen(false);
    setMoreSheetOpen(false);
  }, [location.pathname]);

  function handleBottomNav(item) {
    if (item.to === "#locations") { setLocSheetOpen(true); return; }
    if (item.to === "#more") { setMoreSheetOpen(true); return; }
    navigate(item.to);
  }

  const searchResults = searchQ ? locations.filter((l) => l.name?.toLowerCase().includes(searchQ.toLowerCase()) || l.apt_number?.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 20) : [];

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background relative">
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Sidebar — desktop only */}
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

        <div className="px-3 pt-3">
          <div className="relative w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              placeholder="Search apartments…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="w-full rounded-md bg-slate-800 hover:bg-slate-700 focus:bg-slate-700 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1 bg-slate-800 border border-slate-700 rounded-md max-h-48 overflow-y-auto">
              {searchResults.map((l) => (
                <button key={l.id} onClick={() => { navigate(`/location/${l.id}`); setSearchQ(""); }} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 truncate">
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400 px-1 mb-1.5">
            <Building size={13} className="text-emerald-400" />
            <span className="truncate">{userCompany?.name || "Cranmore Carpenters"}</span>
          </div>
          <div className="relative">
            <button onClick={() => setProjectMenuOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold transition-colors">
              <span className="truncate text-white">{loading ? "Loading…" : project?.name || "Select project"}</span>
              <ChevronDown size={15} className={`text-slate-400 transition-transform ${projectMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {projectMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {(projects || []).map((p) => (
                    <button key={p.id} onClick={() => { selectProject(p.id); setProjectMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors ${p.id === project?.id ? "text-emerald-400 font-semibold" : "text-slate-200"}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll">
          <nav className="px-2 py-2 space-y-0.5">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setDrawerOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-emerald-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
                <n.icon size={16} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-2 pb-4 mt-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Locations</div>
            {loading && locations.length === 0 ? <div className="px-3 py-2 text-xs text-slate-500">Loading…</div> : locations.length === 0 && loadError ? <div className="px-3 py-2 text-xs text-amber-400">Could not load locations. <button onClick={() => reload()} className="underline font-semibold">Retry</button></div> : locations.length === 0 ? <div className="px-3 py-2 text-xs text-slate-500">No locations yet.</div> : <LocationTree locations={locations} selectedId={selectedLocId} onSelect={(l) => { navigate(`/location/${l.id}`); setDrawerOpen(false); }} />}
          </div>
        </div>

        <div className="px-3 py-3 border-t border-slate-800 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-xs font-bold shrink-0">{userInitial}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">{user?.full_name || user?.email || "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{userRole}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Phone header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0F172A] text-white shrink-0 z-20">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-2 rounded-md hover:bg-slate-800 touch-manipulation">
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{loading ? "Cranmore QA" : project?.name || "Cranmore QA"}</div>
          </div>
          <div className="h-7 w-7 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-xs font-bold shrink-0">{userInitial}</div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <Outlet />
        </div>

        {/* Phone bottom nav */}
        <nav className="md:hidden flex items-stretch justify-around border-t border-slate-200 bg-white shrink-0 z-20" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {BOTTOM_NAV.map((item) => {
            const active = item.to === location.pathname;
            return (
              <button key={item.label} onClick={() => handleBottomNav(item)} className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[44px] min-h-[44px] touch-manipulation ${active ? "text-emerald-600" : "text-slate-500"}`}>
                <item.icon size={20} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

      {/* Ask AI button — smaller, above bottom nav on phone, hidden when sheets open */}
      {!drawerOpen && !locSheetOpen && !moreSheetOpen && !askAIOpen && (
        <button onClick={() => setAskAIOpen(true)} title="Ask AI" className="fixed bottom-20 md:bottom-5 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors touch-manipulation">
          <Sparkles size={18} />
        </button>
      )}
      <AskAIPanel open={askAIOpen} onClose={() => setAskAIOpen(false)} />

      {/* Locations sheet (phone) */}
      {locSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0F172A] text-white shrink-0">
            <button onClick={() => setLocSheetOpen(false)} className="p-2 touch-manipulation"><X size={20} /></button>
            <span className="font-semibold">Locations</span>
          </div>
          <div className="px-3 py-3 border-b border-slate-200">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input placeholder="Search apartments…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="w-full rounded-md bg-slate-100 pl-9 pr-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {searchResults.length > 0 ? (
              <div className="space-y-0.5">
                {searchResults.map((l) => (
                  <button key={l.id} onClick={() => { navigate(`/location/${l.id}`); setLocSheetOpen(false); setSearchQ(""); }} className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-md truncate touch-manipulation">{l.name}</button>
                ))}
              </div>
            ) : locations.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                {loadError ? "Could not load locations." : loading ? "Loading…" : "No locations yet."}
                {loadError && <button onClick={() => reload()} className="ml-2 font-semibold text-emerald-700 underline">Retry</button>}
              </div>
            ) : (
              <LocationTree mobile locations={locations} selectedId={selectedLocId} onSelect={(l) => { navigate(`/location/${l.id}`); setLocSheetOpen(false); }} />
            )}
          </div>
        </div>
      )}

      {/* More sheet (phone) */}
      {moreSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMoreSheetOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-4 max-h-[70dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-slate-800">More</span>
              <button onClick={() => setMoreSheetOpen(false)} className="p-1.5 touch-manipulation"><X size={18} /></button>
            </div>
            <div className="space-y-1">
              {nav.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMoreSheetOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium touch-manipulation ${isActive ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-50"}`}>
                  <n.icon size={18} /> {n.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}