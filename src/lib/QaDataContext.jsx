import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";

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
// Locations are cached for the session so the sidebar paints instantly and never shows a false "No locations yet".
const locKey = (pid) => `cranmore_locs_${pid}`;
const readLocCache = (pid) => { try { const raw = sessionStorage.getItem(locKey(pid)); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const writeLocCache = (pid, rows) => { try { sessionStorage.setItem(locKey(pid), JSON.stringify(rows)); } catch { /* storage full: ignore */ } };

export function QaDataProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) || null);
  const [companies, setCompanies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState(null);
  const [revision, setRevision] = useState(0);
  const inflight = useRef(null);

  // Stats: one request at a time. force=true recomputes on the server (use after MY OWN change); force=false uses the server cache.
  const fetchStats = useCallback(async (force) => {
    if (!projectId) return null;
    const res = await withRetry(() => base44.functions.invoke("aggregateStats", { project_id: projectId, refresh: !!force, limit: 50 }));
    setStats(res.data); setRevision((r) => r + 1);
    return res.data;
  }, [projectId]);
  const refreshStats = useCallback((force = true) => {
    if (inflight.current) return inflight.current;
    inflight.current = fetchStats(force).catch((e) => { console.error("stats refresh failed", e); return null; }).finally(() => { inflight.current = null; });
    return inflight.current;
  }, [fetchStats]);

  const load = useCallback(async () => {
    setLoadError(false);
    const cached = projectId ? readLocCache(projectId) : null;
    if (cached && cached.length) { setLocations(cached); setLoading(false); } else { setLoading(true); }
    try {
      const [projs, comps, tpls] = await withRetry(() => Promise.all([readAll("Project"), readAll("Company"), readAll("Template")]));
      setProjects(projs);
      setCompanies(comps.filter((c) => !c.is_deleted));
      setTemplates(tpls.filter((t) => !t.is_deleted));
      let pid = projectId;
      if (!pid && projs.length > 0) {
        pid = projs[0].id;
        localStorage.setItem(PROJECT_KEY, pid);
        setProjectId(pid);
      }
      if (pid) {
        const locs = await withRetry(() => readAll("Location", { project_id: pid }));
        const active = locs.filter((l) => !l.is_deleted);
        setLocations(active);
        writeLocCache(pid, active);
      } else {
        setLocations([]);
      }
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
  useEffect(() => {
    const onFocus = () => { refreshStats(false); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshStats]);

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
