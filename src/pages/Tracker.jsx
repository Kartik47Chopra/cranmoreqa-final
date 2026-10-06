import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { statusBucket, checklistProgress, pct, buildLocationTree, topLocation } from "@/lib/qaUtils";
import { readAll } from "@/components/qa/paging";
import { Grid3x3, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BUCKET_BG = { completed: "bg-emerald-500", in_progress: "bg-amber-500", open: "bg-slate-300" };

export default function Tracker() {
  const { project, locations, locationMap, templateMap } = useQaData();
  const [visis, setVisis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buildingFilter, setBuildingFilter] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    readAll("Visi", { project_id: project.id }).then((all) => {
      setVisis(all.filter((v) => !v.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  const buildings = useMemo(() => locations.filter((l) => !l.parent_original_id), [locations]);

  // Group visis by location and trade
  const matrix = useMemo(() => {
    const trades = [...new Set(visis.map((v) => v.discipline || v.template_name || "Unknown"))].sort();
    const locVisis = {};
    visis.forEach((v) => {
      if (!locVisis[v.location_id]) locVisis[v.location_id] = {};
      const trade = v.discipline || v.template_name || "Unknown";
      if (!locVisis[v.location_id][trade]) locVisis[v.location_id][trade] = [];
      locVisis[v.location_id][trade].push(v);
    });
    return { trades, locVisis };
  }, [visis]);

  // Filter locations by building
  const visibleLocations = useMemo(() => {
    if (!buildingFilter) return locations;
    const childIds = new Set(locations.filter((l) => {
      let cur = l, seen = 0;
      while (cur && cur.parent_id && seen < 20) { cur = locationMap[cur.parent_id]; seen++; }
      return cur?.id === buildingFilter;
    }).map((l) => l.id));
    return locations.filter((l) => childIds.has(l.id) || l.id === buildingFilter);
  }, [locations, buildingFilter, locationMap]);

  if (loading) return <PageShell title="Multi-Template Tracker" loading />;
  if (!project) return <PageShell title="Multi-Template Tracker"><EmptyState title="No project selected" /></PageShell>;
  if (visis.length === 0) return (
    <PageShell title="Multi-Template Tracker" subtitle={project.name}>
      <EmptyState icon={Grid3x3} title="No inspections yet" message="Import data or add doors to see the tracker grid." />
    </PageShell>
  );

  const { trades, locVisis } = matrix;

  return (
    <PageShell title="Multi-Template Tracker" subtitle={project.name}
      actions={
        <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm">
          <option value="">All buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 min-w-[160px]">Location</th>
              {trades.map((t) => (
                <th key={t} className="px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 min-w-[80px]">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleLocations.map((loc) => {
              const cellMap = locVisis[loc.id] || {};
              if (Object.keys(cellMap).length === 0) return null;
              return (
                <tr key={loc.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-medium text-slate-700 truncate max-w-[160px]">{loc.name}</td>
                  {trades.map((t) => {
                    const items = cellMap[t] || [];
                    if (items.length === 0) return <td key={t} className="px-2 py-2 text-center text-slate-300">—</td>;
                    const b = statusBucket(items[0]);
                    return (
                      <td key={t} className="px-2 py-2 text-center">
                        <button onClick={() => navigate(`/inspection/${items[0].id}`)} className={`rounded px-2 py-1 text-[11px] font-bold text-white ${BUCKET_BG[b]} hover:opacity-80`}>
                          {items.length}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}