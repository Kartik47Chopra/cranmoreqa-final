import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import { Download } from "lucide-react";

const BUCKET_COLOR = { completed: "#10b981", in_progress: "#f59e0b", open: "#94a3b8" };

export default function Tracker() {
  const { locations, locationMap, templates, templateMap, companies, companyMap, loading } = useQaData();
  const [visis, setVisis] = useState([]);

  useEffect(() => {
    base44.entities.Visi.list("-created_date", 1000).then(setVisis).catch(console.error);
  }, []);

  // Group templates by trade/company
  const tradeGroups = useMemo(() => {
    const groups = {};
    templates.forEach((t) => {
      const key = t.trade;
      if (!groups[key]) groups[key] = { trade: key, templates: [] };
      groups[key].templates.push(t);
    });
    return Object.values(groups);
  }, [templates]);

  // Leaf locations (rooms), grouped by floor
  const floors = useMemo(() => {
    const floorList = locations.filter((l) => l.type === "Floor").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return floorList.map((f) => ({
      floor: f,
      rooms: locations
        .filter((l) => l.parent_id === f.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    }));
  }, [locations]);

  // visi lookup: key = `${locationId}:${templateId}` -> visi
  const visiMap = useMemo(() => {
    const m = {};
    visis.forEach((v) => { m[`${v.location_id}:${v.template_id}`] = v; });
    return m;
  }, [visis]);

  function exportCsv() {
    const cols = ["Location", "Path", ...templates.map((t) => t.name)];
    const rows = [];
    floors.forEach(({ floor, rooms }) => {
      rooms.forEach((r) => {
        const row = [r.name, r.path];
        templates.forEach((t) => {
          const v = visiMap[`${r.id}:${t.id}`];
          if (!v) { row.push(""); return; }
          const { done, total } = checklistProgress(v);
          row.push(`${done}/${total} (${statusBucket(v)})`);
        });
        rows.push(row);
      });
    });
    const csv = [cols, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "multi-template-tracker.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-slate-400">Loading tracker…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">Multi-Template Tracker</h1>
          <p className="text-sm text-slate-500">Progress matrix across every location × checklist template</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Download size={15} /> Export CSV
        </button>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2 text-left align-bottom" style={{ minWidth: 200 }}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</div>
              </th>
              {tradeGroups.map((g) => (
                <th key={g.trade} colSpan={g.templates.length} className="border-b border-slate-300 bg-slate-100 px-2 py-1.5 text-center align-bottom">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{g.trade}</div>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-300">Room</th>
              {tradeGroups.map((g) =>
                g.templates.map((t) => (
                  <th key={t.id} className="border-b border-slate-300 bg-slate-100 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-500" style={{ minWidth: 64 }}>
                    {t.name}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {floors.map(({ floor, rooms }) => (
              <FloorGroup key={floor.id} floor={floor} rooms={rooms} templates={templates} visiMap={visiMap} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FloorGroup({ floor, rooms, templates, visiMap }) {
  return (
    <React.Fragment>
      <tr>
        <td colSpan={1 + templates.length} className="sticky left-0 z-10 bg-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 border-y border-slate-300">
          {floor.name}
        </td>
      </tr>
      {rooms.map((r) => (
        <tr key={r.id} className="hover:bg-emerald-50/40">
          <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-medium text-slate-700 border-b border-slate-100">
            <div className="truncate" title={r.name}>{r.name}</div>
            <div className="text-[10px] text-slate-400">{r.wet ? "Wet area" : ""}</div>
          </td>
          {templates.map((t) => {
            const v = visiMap[`${r.id}:${t.id}`];
            if (!v) return <td key={t.id} className="border-b border-slate-100 bg-slate-50/50 px-2 py-2 text-center text-slate-300">·</td>;
            const { done, total } = checklistProgress(v);
            const b = statusBucket(v);
            const color = BUCKET_COLOR[b];
            const p = pct(done, total);
            return (
              <td key={t.id} className="border-b border-slate-100 px-2 py-2 text-center" style={{ background: `${color}18` }}>
                <div className="font-mono text-xs font-bold" style={{ color }}>{done}/{total}</div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-slate-200">
                  <div className="h-full rounded" style={{ width: `${p}%`, background: color }} />
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </React.Fragment>
  );
}