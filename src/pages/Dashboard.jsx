import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import DrillDownPanel from "@/components/DrillDownPanel";
import { statusBucket, checklistProgress, pct, STATUS_META } from "@/lib/qaUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { readAll } from "@/components/qa/paging";
import { Building2, Wrench, Calendar, ChevronDown, ChevronUp, Activity as ActivityIcon, Inbox } from "lucide-react";

const BUCKET_COLORS = { completed: "#10b981", in_progress: "#f59e0b", open: "#94a3b8" };

export default function Dashboard() {
  const { project, locations, loading: dataLoading } = useQaData();
  const { user } = useAuth();
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buildingFilter, setBuildingFilter] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillItems, setDrillItems] = useState([]);
  const [drillTitle, setDrillTitle] = useState("");
  const [activity, setActivity] = useState([]);
  const [range, setRange] = useState("7");

  const buildings = useMemo(() => {
    const byParent = {};
    locations.forEach((l) => { if (!l.parent_original_id) byParent[l.id] = l; });
    return Object.values(byParent);
  }, [locations]);

  const trades = useMemo(() => {
    if (!agg?.tradeNames) return [];
    return agg.tradeNames;
  }, [agg]);

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    base44.functions.invoke("aggregateStats", {
      project_id: project.id,
      building_id: buildingFilter || undefined,
      trade: tradeFilter || undefined,
    }).then((res) => setAgg(res.data))
      .catch((e) => setError(e.message || "Failed to load stats"))
      .finally(() => setLoading(false));
  }, [project?.id, buildingFilter, tradeFilter]);

  useEffect(() => {
    if (!project?.id) return;
    const days = parseInt(range);
    const since = new Date();
    since.setDate(since.getDate() - days);
    readAll("Activity", { project_id: project.id }).then((all) => {
      const filtered = all.filter((a) => {
        const d = a.created_at || a.created_date;
        return d && new Date(d) >= since;
      }).sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date));
      setActivity(filtered);
    }).catch(() => {});
  }, [project?.id, range]);

  const openDrill = (items, title) => {
    setDrillItems(items);
    setDrillTitle(title);
    setDrillOpen(true);
  };

  if (loading || dataLoading) return <PageShell title="Dashboard" loading />;
  if (error) return (
    <PageShell title="Dashboard">
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Retry</button>
      </div>
    </PageShell>
  );
  if (!project) return (
    <PageShell title="Dashboard">
      <EmptyState icon={Building2} title="No project selected" message="Ask an admin to create a project in Project Setup, or switch projects from the sidebar." />
    </PageShell>
  );
  if (!agg || agg.totalItems === 0) return (
    <PageShell title="Dashboard" subtitle={project.name}>
      <EmptyState icon={Inbox} title="No inspections yet" message="Admins can import data from Project Setup > Import, or add doors individually from a location screen." />
    </PageShell>
  );

  const o = agg.overall;
  const buildingData = Object.entries(agg.byBuilding).map(([name, c]) => ({ name, shortName: name.startsWith('General') ? 'General' : name.split(' ·')[0], ...c }));
  const tradeData = ['Door', 'Entry door', 'Skirting', 'Sanitary', 'Robe Jamb', 'Miscellaneous', 'Utility'].map(name => ({ name, ...agg.byTrade[name] }));
  const statusData = [
    { name: "Closed", value: o.completed, color: BUCKET_COLORS.completed },
    { name: "In Progress", value: o.in_progress, color: BUCKET_COLORS.in_progress },
    { name: "Open", value: o.open, color: BUCKET_COLORS.open },
  ];

  return (
    <PageShell
      title="Dashboard"
      subtitle={`${project.name}${project.address ? " · " + project.address : ""}${project.drawing_set ? " · Drawing set " + project.drawing_set : ""}`}
      actions={
        <div className="flex gap-2">
          <Select value={buildingFilter} onChange={setBuildingFilter} options={[{ value: "", label: "All buildings" }, ...buildings.map((b) => ({ value: b.name, label: b.name }))]} />
          <Select value={tradeFilter} onChange={setTradeFilter} options={[{ value: "", label: "All trades" }, ...trades.map((t) => ({ value: t, label: t }))]} />
        </div>
      }
    >
      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Counter label="Total" value={o.total} color="bg-white border-slate-200 text-slate-900" onClick={() => openDrill(agg.items, "All inspections")} />
        <Counter label="Closed" value={o.completed} color="bg-emerald-50 border-emerald-200 text-emerald-700" onClick={() => openDrill(agg.items.filter((i) => i.bucket === "completed"), "Closed inspections")} />
        <Counter label="In Progress" value={o.in_progress} color="bg-amber-50 border-amber-200 text-amber-700" onClick={() => openDrill(agg.items.filter((i) => i.bucket === "in_progress"), "In Progress inspections")} />
        <Counter label="Open" value={o.open} color="bg-slate-50 border-slate-200 text-slate-600" onClick={() => openDrill(agg.items.filter((i) => i.bucket === "open"), "Open inspections")} />
      </div>

      {/* Charts: By Building + By Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="By Building">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={buildingData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <XAxis dataKey="shortName" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="completed" stackId="a" fill={BUCKET_COLORS.completed} name="Closed" onClick={(d) => openDrill(agg.items.filter((i) => i.building === d.name && i.bucket === "completed"), `${d.name} - Closed`)} cursor="pointer" />
              <Bar dataKey="in_progress" stackId="a" fill={BUCKET_COLORS.in_progress} name="In Progress" onClick={(d) => openDrill(agg.items.filter((i) => i.building === d.name && i.bucket === "in_progress"), `${d.name} - In Progress`)} cursor="pointer" />
              <Bar dataKey="open" stackId="a" fill={BUCKET_COLORS.open} name="Open" onClick={(d) => openDrill(agg.items.filter((i) => i.building === d.name && i.bucket === "open"), `${d.name} - Open`)} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="By Status">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                {statusData.map((s, i) => <Cell key={i} fill={s.color} onClick={() => openDrill(agg.items.filter((item) => item.bucket === (s.name === "Closed" ? "completed" : s.name === "In Progress" ? "in_progress" : "open")), s.name)} cursor="pointer" />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend BELOW chart */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
            {statusData.map((s) => (
              <button key={s.name} onClick={() => openDrill(agg.items.filter((item) => item.bucket === (s.name === "Closed" ? "completed" : s.name === "In Progress" ? "in_progress" : "open")), s.name)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.name}: {s.value}
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* By Trade horizontal bar chart */}
      <ChartCard title="By Trade">
        <ResponsiveContainer width="100%" height={Math.max(200, tradeData.length * 36)}>
          <BarChart data={tradeData} layout="vertical" margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={95} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="completed" stackId="a" fill={BUCKET_COLORS.completed} name="Closed" onClick={(d) => openDrill(agg.items.filter((i) => i.trade === d.name && i.bucket === "completed"), `${d.name} - Closed`)} cursor="pointer" />
            <Bar dataKey="in_progress" stackId="a" fill={BUCKET_COLORS.in_progress} name="In Progress" onClick={(d) => openDrill(agg.items.filter((i) => i.trade === d.name && i.bucket === "in_progress"), `${d.name} - In Progress`)} cursor="pointer" />
            <Bar dataKey="open" stackId="a" fill={BUCKET_COLORS.open} name="Open" onClick={(d) => openDrill(agg.items.filter((i) => i.trade === d.name && i.bucket === "open"), `${d.name} - Open`)} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Checklist progress */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6 mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Checklist Progress</span>
          <span className="font-mono text-2xl font-bold text-emerald-600">{agg.checklistProgress}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${agg.checklistProgress}%` }} />
        </div>
      </div>

      {/* Activity graph */}
      <ActivityGraph activity={activity} range={range} setRange={setRange} />

      <DrillDownPanel open={drillOpen} onOpenChange={setDrillOpen} title={drillTitle} items={drillItems} locationMap={Object.fromEntries(locations.map((l) => [l.id, l]))} templateMap={{}} />
    </PageShell>
  );
}

function Counter({ label, value, color, onClick }) {
  return (
    <button onClick={onClick} className={`rounded-lg border p-4 text-left transition-transform active:scale-95 touch-manipulation ${color}`}>
      <div className="text-3xl font-bold font-mono">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
    </button>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-bold text-slate-800">{d.name}</div>
      <div className="text-emerald-600">Closed: {d.completed}</div>
      <div className="text-amber-600">In Progress: {d.in_progress}</div>
      <div className="text-slate-500">Open: {d.open}</div>
      <div className="mt-1 font-semibold text-slate-700">Total: {d.total}</div>
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ActivityGraph({ activity, range, setRange }) {
  const [dayDetail, setDayDetail] = useState(null);
  const days = parseInt(range);
  const buckets = useMemo(() => {
    const m = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      m[d.toISOString().slice(0, 10)] = { date: d, completed: 0, in_progress: 0, photo: 0, items: [] };
    }
    activity.forEach((a) => {
      const d = new Date(a.created_at || a.created_date);
      const key = d.toISOString().slice(0, 10);
      if (!m[key]) return;
      if (a.type === "status" || a.type === "step") {
        if (a.text?.toLowerCase().includes("complete") || a.text?.toLowerCase().includes("closed")) m[key].completed++;
        else m[key].in_progress++;
      }
      if (a.type === "photo" || a.type === "attachment") m[key].photo++;
      m[key].items.push(a);
    });
    return Object.values(m);
  }, [activity, days]);

  const maxVal = Math.max(1, ...buckets.map((b) => Math.max(b.completed, b.in_progress, b.photo)));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Project Activity</h3>
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {["7", "30", "90"].map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-xs font-semibold touch-manipulation ${range === r ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>
              {r === "90" ? "All" : `Last ${r}d`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto">
        {buckets.map((b) => (
          <button key={b.date.toISOString()} onClick={() => setDayDetail(b)} className="flex flex-1 flex-col items-center gap-1 min-w-[20px] group touch-manipulation">
            <div className="flex flex-col items-center justify-end h-32 gap-px w-full">
              <div className="w-full rounded-t bg-emerald-400 group-hover:bg-emerald-500" style={{ height: `${(b.completed / maxVal) * 100}%`, minHeight: b.completed > 0 ? "4px" : "0" }} title={`Completed: ${b.completed}`} />
              <div className="w-full bg-amber-400 group-hover:bg-amber-500" style={{ height: `${(b.in_progress / maxVal) * 100}%`, minHeight: b.in_progress > 0 ? "4px" : "0" }} title={`In Progress: ${b.in_progress}`} />
              <div className="w-full bg-blue-400 group-hover:bg-blue-500" style={{ height: `${(b.photo / maxVal) * 100}%`, minHeight: b.photo > 0 ? "4px" : "0" }} title={`Photos: ${b.photo}`} />
            </div>
            <span className="text-[9px] text-slate-400">{b.date.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-[11px]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" />Completed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-400" />In Progress</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-400" />Photos</span>
      </div>

      {dayDetail && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setDayDetail(null)}>
          <div className="w-full max-h-[60dvh] overflow-y-auto rounded-t-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold">{dayDetail.date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</h3>
              <button onClick={() => setDayDetail(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            {dayDetail.items.length === 0 ? (
              <p className="text-sm text-slate-400">No activity on this day.</p>
            ) : (
              <div className="space-y-2">
                {dayDetail.items.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                    <span className="mt-0.5 text-xs font-mono text-slate-400">{new Date(a.created_at || a.created_date).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-700">{a.text}</div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">{a.type} · {a.user || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}