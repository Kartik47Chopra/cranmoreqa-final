import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import VisiSheet from "@/components/VisiSheet";
import { ArrowLeft, MapPin, Droplets, Milestone, Calendar } from "lucide-react";

export default function LocationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locationMap, locations, templateMap, companyMap, loading } = useQaData();
  const [visis, setVisis] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [active, setActive] = useState(null);

  const loc = locationMap[id];

  useEffect(() => {
    if (!id) return;
    base44.entities.Visi.filter({ location_id: id }).then(setVisis).catch(console.error);
    base44.entities.Milestone.filter({ location_id: id }).then(setMilestones).catch(console.error);
  }, [id]);

  const children = useMemo(() => locations.filter((l) => l.parent_id === id), [locations, id]);

  const refresh = (fresh) => {
    setVisis((prev) => prev.map((v) => (v.id === fresh.id ? fresh : v)));
    setActive(fresh);
  };

  if (loading || !loc) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="text-slate-400">Loading location…</div>
      </div>
    );
  }

  const stats = { completed: 0, in_progress: 0, open: 0 };
  visis.forEach((v) => stats[statusBucket(v)]++);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back
      </button>

      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">{loc.type}</div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">{loc.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{loc.path}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {loc.wet && <span className="flex items-center gap-1 text-sky-600"><Droplets size={12} /> Wet area</span>}
          <span className="flex items-center gap-1"><MapPin size={12} /> {loc.path}</span>
        </div>
      </header>

      {/* Stat chips */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Closed" value={stats.completed} cls="text-emerald-600" />
        <Stat label="In Progress" value={stats.in_progress} cls="text-amber-600" />
        <Stat label="Open" value={stats.open} cls="text-slate-600" />
      </div>

      {/* Child locations */}
      {children.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Contained locations ({children.length})</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {children.map((c) => (
              <button key={c.id} onClick={() => navigate(`/location/${c.id}`)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:border-amber-300 hover:bg-amber-50/40">
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Milestone size={13} /> Milestones</h2>
          <div className="space-y-1.5">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <Calendar size={12} /> {m.due_date}
                  <span className={`rounded-full px-2 py-0.5 font-semibold uppercase ${m.status === "complete" ? "bg-emerald-50 text-emerald-700" : m.status === "in_progress" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{m.status.replace("_", " ")}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visis */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Visis ({visis.length})</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Code</th>
                <th className="px-3 py-2.5 text-left">Template</th>
                <th className="px-3 py-2.5 text-center">Progress</th>
                <th className="px-3 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {visis.map((v) => {
                const tpl = templateMap[v.template_id];
                const { done, total } = checklistProgress(v);
                return (
                  <tr key={v.id} onClick={() => setActive(v)} className="cursor-pointer border-t border-slate-100 hover:bg-amber-50/40">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-slate-900">{v.visi_code}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{tpl?.name}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs text-slate-600">{done}/{total}</td>
                    <td className="px-3 py-2.5"><StatusBadge visi={v} /></td>
                  </tr>
                );
              })}
              {visis.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">No Visis for this location.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <VisiSheet visi={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} onUpdated={refresh} />
    </div>
  );
}

function Stat({ label, value, cls }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}