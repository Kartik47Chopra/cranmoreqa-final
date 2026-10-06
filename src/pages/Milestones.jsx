import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import RoleGate from "@/components/RoleGate";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import { Milestone as MilestoneIcon, Plus, Loader2, X, Calendar } from "lucide-react";
import { readAll } from "@/components/qa/paging";

export default function Milestones() {
  const { project, locations, locationMap } = useQaData();
  const { user } = useAuth();
  const [milestones, setMilestones] = useState([]);
  const [visis, setVisis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", target_date: "" });
  const canEdit = user?.role === "admin" || user?.role === "pm";

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    Promise.all([
      base44.entities.Milestone.filter({ project_id: project.id }),
      readAll("Visi", { project_id: project.id }),
    ]).then(([m, v]) => {
      setMilestones(Array.isArray(m) ? m : []);
      setVisis(v.filter((x) => !x.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  function milestoneProgress(ms) {
    if (!ms.visi_ids?.length) return { done: 0, total: 0, pct: 0 };
    const linked = visis.filter((v) => ms.visi_ids.includes(v.id));
    const completed = linked.filter((v) => statusBucket(v) === "completed").length;
    return { done: completed, total: linked.length, pct: linked.length > 0 ? Math.round((completed / linked.length) * 100) : 0 };
  }

  async function addMilestone() {
    if (!form.name) return;
    try {
      const ms = await base44.entities.Milestone.create({ project_id: project.id, name: form.name, target_date: form.target_date || undefined });
      setMilestones((prev) => [...prev, ms]);
      setForm({ name: "", target_date: "" });
      setShowAdd(false);
    } catch (e) { console.error(e); }
  }

  if (loading) return <PageShell title="Milestone Tracker" loading />;
  if (!project) return <PageShell title="Milestone Tracker"><EmptyState title="No project selected" /></PageShell>;

  return (
    <PageShell title="Milestone Tracker" subtitle={project.name}
      actions={canEdit && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus size={16} /> Add</button>}
    >
      {milestones.length === 0 ? (
        <EmptyState icon={MilestoneIcon} title="No milestones" message={canEdit ? "Add milestones to track key project deadlines." : "No milestones have been created yet."} />
      ) : (
        <div className="space-y-3">
          {milestones.map((ms) => {
            const prog = milestoneProgress(ms);
            return (
              <div key={ms.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-bold text-slate-800">{ms.name}</h3>
                    {ms.target_date && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Calendar size={13} /> Target: {new Date(ms.target_date).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" })}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg font-bold text-emerald-600">{prog.pct}%</div>
                    <div className="text-xs text-slate-500">{prog.done} of {prog.total} done</div>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${prog.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdd(false)}>
          <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">New Milestone</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Milestone name" className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              <input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
              <button onClick={addMilestone} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Create</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}