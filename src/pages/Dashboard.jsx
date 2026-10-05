import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { statusBucket } from "@/lib/qaUtils";
import { CheckCircle2, AlertTriangle, Clock, ShieldAlert, Activity } from "lucide-react";

const BUCKETS = ["completed", "in_progress", "open"];
const BUCKET_COLOR = { completed: "#10b981", in_progress: "#f59e0b", open: "#94a3b8" };
const BUCKET_LABEL = { completed: "Closed", in_progress: "In Progress", open: "Open" };

export default function Dashboard() {
  const { project, locations, locationMap, templateMap, loading } = useQaData();
  const [visis, setVisis] = useState([]);

  useEffect(() => {
    base44.entities.Visi.list("-created_date", 1000).then(setVisis).catch(console.error);
  }, []);

  const metrics = useMemo(() => {
    let closed = 0, inProg = 0, open = 0, overrides = 0;
    visis.forEach((v) => {
      const b = statusBucket(v);
      if (b === "completed") closed++;
      else if (b === "in_progress") inProg++;
      else open++;
      if (v.override_status && v.override_status !== "none") overrides++;
    });
    return { total: visis.length, closed, inProg, open, overrides };
  }, [visis]);

  const byFloor = useMemo(() => {
    const floors = locations.filter((l) => l.type === "Floor");
    const map = {};
    floors.forEach((f) => { map[f.id] = { name: f.name, completed: 0, in_progress: 0, open: 0, total: 0 }; });
    visis.forEach((v) => {
      const loc = locationMap[v.location_id];
      if (!loc) return;
      let cur = loc;
      while (cur && cur.type !== "Floor" && cur.parent_id) cur = locationMap[cur.parent_id];
      if (cur && map[cur.id]) {
        map[cur.id][statusBucket(v)]++;
        map[cur.id].total++;
      }
    });
    return Object.values(map);
  }, [visis, locations, locationMap]);

  const byTrade = useMemo(() => {
    const map = {};
    visis.forEach((v) => {
      const tpl = templateMap[v.template_id];
      if (!tpl) return;
      const key = tpl.trade;
      if (!map[key]) map[key] = { name: key, completed: 0, in_progress: 0, open: 0, total: 0 };
      map[key][statusBucket(v)]++;
      map[key].total++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [visis, templateMap]);

  if (loading) return <div className="p-8 text-slate-400">Loading dashboard…</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="min-w-0">
          <h1 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground truncate">{project?.name} · {project?.address}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Summary counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCounter label="Total" value={metrics.total} color="text-slate-900" bg="bg-slate-50" />
          <SummaryCounter label="Completed" value={metrics.closed} color="text-emerald-600" bg="bg-emerald-50" />
          <SummaryCounter label="In Progress" value={metrics.inProg} color="text-amber-600" bg="bg-amber-50" />
          <SummaryCounter label="Open" value={metrics.open} color="text-slate-500" bg="bg-slate-50" />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Metric icon={CheckCircle2} label="Inspections closed" value={`${metrics.closed} / ${metrics.total}`} color="text-emerald-600" />
          <Metric icon={Activity} label="In progress" value={metrics.inProg} color="text-amber-600" />
          <Metric icon={Clock} label="Open" value={metrics.open} color="text-slate-600" />
          <Metric icon={AlertTriangle} label="Overrides active" value={metrics.overrides} color="text-orange-600" />
          <Metric icon={ShieldAlert} label="Total Visis" value={metrics.total} color="text-slate-900" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Visi status by location" subtitle="Tap a segment to inspect">
            <StackedBars rows={byFloor} />
          </Panel>
          <Panel title="Visi status by trade" subtitle="All time">
            <StackedBars rows={byTrade} />
          </Panel>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4">
          {BUCKETS.map((b) => (
            <div key={b} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BUCKET_COLOR[b] }} />
              {BUCKET_LABEL[b]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCounter({ label, value, color, bg }) {
  return (
    <div className={`rounded-lg border border-slate-200 ${bg} p-3 md:p-4`}>
      <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono font-bold text-lg md:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 md:p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <div className={`mt-2 font-mono font-bold text-lg md:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {subtitle && <div className="mb-3 text-[11px] text-slate-400">{subtitle}</div>}
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function StackedBars({ rows }) {
  if (!rows.length) return <div className="text-sm text-slate-400">No data</div>;
  return rows.map((r) => {
    const total = r.total || 1;
    return (
      <div key={r.name}>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="truncate font-medium text-slate-600">{r.name}</span>
          <span className="font-mono text-slate-400">{r.total}</span>
        </div>
        <div className="flex h-6 overflow-hidden rounded-md bg-slate-100">
          {BUCKETS.map((b) => {
            const w = (r[b] / total) * 100;
            if (w === 0) return null;
            return (
              <div key={b} style={{ width: `${w}%`, background: BUCKET_COLOR[b] }} className="flex items-center justify-center text-[10px] font-bold text-white">
                {w > 12 ? r[b] : ""}
              </div>
            );
          })}
        </div>
      </div>
    );
  });
}