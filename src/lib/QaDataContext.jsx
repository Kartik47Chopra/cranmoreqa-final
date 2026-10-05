import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const QaDataContext = createContext(null);

export function useQaData() {
  const ctx = useContext(QaDataContext);
  if (!ctx) throw new Error("useQaData must be used within QaDataProvider");
  return ctx;
}

export function QaDataProvider({ children }) {
  const [project, setProject] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projs, comps, tpls, locs] = await Promise.all([
        base44.entities.Project.list(),
        base44.entities.Company.list(),
        base44.entities.Template.list(),
        base44.entities.Location.list(),
      ]);
      setProject(projs[0] || null);
      setCompanies(comps);
      setTemplates(tpls);
      setLocations(locs);
    } catch (e) {
      console.error("QaData load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
  const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));

  return (
    <QaDataContext.Provider value={{ project, companies, companyMap, templates, templateMap, locations, locationMap, loading, reload: load }}>
      {children}
    </QaDataContext.Provider>
  );
}