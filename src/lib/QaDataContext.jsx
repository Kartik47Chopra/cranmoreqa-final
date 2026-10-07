import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";

const QaDataContext = createContext(null);

export function useQaData() {
  const ctx = useContext(QaDataContext);
  if (!ctx) throw new Error("useQaData must be used within QaDataProvider");
  return ctx;
}

const PROJECT_KEY = "cranmore_selected_project";

export function QaDataProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) || null);
  const [companies, setCompanies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [revision, setRevision] = useState(0);
  const refreshStats = useCallback(async () => {
    if (!projectId) return;
    const res = await base44.functions.invoke('aggregateStats', { project_id: projectId, refresh: true, limit: 50 });
    setStats(res.data); setRevision(r => r + 1);
    return res.data;
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projs, comps, tpls] = await Promise.all([
        readAll('Project'),
        readAll("Company"),
        readAll("Template"),
      ]);
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
        const locs = await readAll("Location", { project_id: pid });
        setLocations(locs.filter((l) => !l.is_deleted));
      } else {
        setLocations([]);
      }
    } catch (e) {
      console.error("QaData load error", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => {
    const changed = event => { if (event.type !== 'create' && event.type !== 'update' && event.type !== 'delete') return; refreshStats(); };
    const offVisi = base44.entities.Visi.subscribe(changed);
    const offLocation = base44.entities.Location.subscribe(event => { changed(event); load(); });
    return () => { offVisi(); offLocation(); };
  }, [refreshStats, load]);

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
      locations, locationMap, loading, selectProject, reload: load, stats, refreshStats, revision,
    }}>
      {children}
    </QaDataContext.Provider>
  );
}