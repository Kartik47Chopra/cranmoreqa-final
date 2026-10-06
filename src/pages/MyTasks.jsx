import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import { ListTodo, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { readAll } from "@/components/qa/paging";

export default function MyTasks() {
  const { project, locationMap } = useQaData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [visis, setVisis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!project?.id || !user?.id) return;
    setLoading(true);
    Promise.all([
      base44.entities.Task.filter({ project_id: project.id, assigned_to: user.id }),
      readAll("Visi", { project_id: project.id, assignee_company_id: user.data?.company_id }),
    ]).then(([t, v]) => {
      setTasks((Array.isArray(t) ? t : []).filter((x) => !x.is_deleted));
      setVisis(v.filter((x) => !x.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id, user?.id]);

  const filteredVisis = visis.filter((v) => filter === "all" || statusBucket(v) === filter);

  if (loading) return <PageShell title="My Tasks" loading />;
  if (!project) return <PageShell title="My Tasks"><EmptyState title="No project selected" /></PageShell>;

  return (
    <PageShell title="My Tasks" subtitle={project.name}>
      {tasks.length === 0 && filteredVisis.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks assigned to you" message="Tasks and inspections assigned to your company will appear here." />
      ) : (
        <div className="space-y-4">
          {tasks.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Tasks</h3>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                    {t.description && <div className="text-xs text-slate-500 mt-1">{t.description}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.status === "done" ? "bg-emerald-50 text-emerald-700" : t.status === "in_progress" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{t.status.replace("_", " ")}</span>
                      {t.due_date && <span className="text-[11px] text-slate-400">Due {new Date(t.due_date).toLocaleDateString("en-AU")}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Inspections ({filteredVisis.length})</h3>
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                {["all", "open", "in_progress", "completed"].map((b) => (
                  <button key={b} onClick={() => setFilter(b)} className={`px-2.5 py-1 text-[11px] font-semibold capitalize ${filter === b ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>{b === "all" ? "All" : b.replace("_", " ")}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {filteredVisis.map((v) => {
                const loc = locationMap[v.location_id];
                const { done, total } = checklistProgress(v);
                return (
                  <button key={v.id} onClick={() => navigate(`/inspection/${v.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:bg-emerald-50/40">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{v.code || "Inspection"}</div>
                      <div className="truncate text-xs text-slate-500">{loc?.name || "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs text-slate-600">{done}/{total} · {pct(done, total)}%</div>
                      <div className="mt-1"><StatusBadge visi={v} /></div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}