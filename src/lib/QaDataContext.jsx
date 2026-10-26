import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";
import { useAuth } from "@/lib/AuthContext";
import { loadWithRetry, readCache, writeCache } from "@/lib/loadWithRetry";

const QaDataContext = createContext(null);

export function useQaData() {
  const ctx = useContext(QaDataContext);
  if (!ctx) throw new Error("useQaData must be used within QaDataProvider");
  return ctx;
}

const PROJECT_KEY = "cranmore_selected_project";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; await sleep(600 * (i + 1)); }
  }
  throw err;
}
// Project, company, template and location lists are cached on the device so every screen paints instantly
// (and never shows a false "No locations yet"), then refresh in the background.
const locKey = (pid) => `cranmore_locs_${pid}`;
const BASE_KEY = "cranmore_base";

// Cached lists belong to the account that loaded them; another sign-in on the same phone starts clean.
function claimCache(userId) {
  try {
    if (!userId || localStorage.getItem("cranmore_cache_owner") === userId) return;
    Object.keys(localStorage).filter((k) => k.startsWith("cranmore_") && k !== PROJECT_KEY && !k.startsWith("cranmore_rooms_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cranmore_cache_owner", userId);
  } catch { /* storage unavailable */ }
}

export function QaDataProvider({ children }) {
  const { user } = useAuth();
  claimCache(user?.id);
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) || null);
  const [projects, setProjects] = useState(() => readCache(BASE_KEY)?.projects || []);
  const [companies, setCompanies] = useState(() => readCache(BASE_KEY)?.companies || []);
  const [templates, setTemplates] = useState(() => readCache(BASE_KEY)?.templates || []);
  const [locations, setLocations] = useState(() => (projectId && readCache(locKey(projectId))) || []);
  const [loading, setLoading] = useState(() => !(projectId && readCache(BASE_KEY) && readCache(locKey(projectId))?.length));
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState(() => { const p = localStorage.getItem(PROJECT_KEY); return p ? readCache(`cranmore_stats_${p}`) : null; });
  const [revision, setRevision] = useState(0);
  const inflight = useRef(null);

  // Stats: one request at a time. force=true recomputes on the server (use after MY OWN change); force=false uses the server cache.
  const fetchStats = useCallback(async (force) => {
    if (!projectId) return null;
    const res = await loadWithRetry(() => base44.functions.invoke("aggregateStats", { project_id: projectId, refresh: !!force }));
    setStats(res.data); setRevision((r) => r + 1);
    writeCache(`cranmore_stats_${projectId}`, res.data);
    return res.data;
  }, [projectId]);
  const refreshStats = useCallback((force = true) => {
    if (inflight.current) return inflight.current;
    inflight.current = fetchStats(force).catch((e) => { console.error("stats refresh failed", e); return null; }).finally(() => { inflight.current = null; });
    return inflight.current;
  }, [fetchStats]);

  const load = useCallback(async () => {
    setLoadError(false);
    const cached = projectId ? readCache(locKey(projectId)) : null;
    if (cached && cached.length && readCache(BASE_KEY)) { setLocations(cached); setLoading(false); } else { setLoading(true); }
    const loadLocations = async (pid) => {
      const locs = await loadWithRetry(() => readAll("Location", { project_id: pid }));
      const active = locs.filter((l) => !l.is_deleted);
      setLocations(active);
      writeCache(locKey(pid), active);
    };
    try {
      // Locations load at the same time as the project list when the project is already known.
      const early = projectId ? loadLocations(projectId) : null;
      early?.catch(() => {});
      const [projs, comps, tpls] = await loadWithRetry(() => Promise.all([readAll("Project"), readAll("Company"), readAll("Template")]));
      const base = { projects: projs, companies: comps.filter((c) => !c.is_deleted), templates: tpls.filter((t) => !t.is_deleted) };
      setProjects(base.projects); setCompanies(base.companies); setTemplates(base.templates);
      writeCache(BASE_KEY, base);
      let pid = projectId;
      if (!pid && projs.length > 0) {
        pid = projs[0].id;
        localStorage.setItem(PROJECT_KEY, pid);
        setProjectId(pid);
      }
      if (early) await early;
      else if (pid) await loadLocations(pid);
      else setLocations([]);
    } catch (e) {
      console.error("QaData load error", e);
      if (!cached || !cached.length) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  // First stats call uses the server cache (fast). No realtime subscriptions: they recomputed everything on every single change.
  useEffect(() => { refreshStats(false); }, [refreshStats]);

  // New accounts get full access automatically: promote once, then reload so the new role takes effect everywhere.
  useEffect(() => {
    if (!user?.id || ["admin", "pm", "trade"].includes(user.role)) return;
    const flag = `cranmore_access_${user.id}`;
    try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
    base44.functions.invoke("ensureAccess", {}).then((r) => { if (r?.data?.changed) window.location.reload(); }).catch((e) => console.error("ensureAccess", e));
  }, [user?.id, user?.role]);

  // One-time standard room setup (admin only): adds missing rooms (124, 224, Pantry - East) and the Entry door / Sanitary Visis. Safe to repeat: it only adds what is missing.
  useEffect(() => {
    if (!projectId || user?.role !== "admin" || loading) return;
    const flag = `cranmore_rooms_v2_${projectId}`;
    if (localStorage.getItem(flag)) return;
    (async () => {
      try {
        const pre = (await base44.functions.invoke("ensureStandardRoomVisis", { project_id: projectId, preview: true })).data;
        if (pre?.total > 0) {
          await base44.functions.invoke("ensureStandardRoomVisis", { project_id: projectId, preview: false });
          await refreshStats(true); await load();
        }
        localStorage.setItem(flag, "1");
      } catch (e) { console.error("standard room setup", e); }
    })();
  }, [projectId, user?.role, loading, refreshStats, load]);

  const selectProject = useCallback((pid) => {
    localStorage.setItem(PROJECT_KEY, pid);
    setProjectId(pid);
  }, []);

  const project = projects.find((p) => p.id === projectId) || projects[0] || null;
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
  const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));

  return (
    <QaDataContext.Provider value={{
      project, projects, companies, companyMap, templates, templateMap,
      locations, locationMap, loading, loadError, selectProject, reload: load, stats, refreshStats, revision,
    }}>
      {children}
    </QaDataContext.Provider>
  );
}