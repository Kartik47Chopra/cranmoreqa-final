import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { Activity as ActivityIcon, Loader2 } from "lucide-react";

export default function Activity() {
  const { project } = useQaData();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [visible, setVisible] = useState(25);

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    base44.entities.Activity.filter({ project_id: project.id }).then((all) => {
      setItems((Array.isArray(all) ? all : []).sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date)));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  const filtered = items.filter((a) => typeFilter === "all" || a.type === typeFilter);

  if (loading) return <PageShell title="Activity" loading />;
  if (!project) return <PageShell title="Activity"><EmptyState title="No project selected" /></PageShell>;

  return (
    <PageShell title="Activity" subtitle={project.name}
      actions={
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm">
          <option value="all">All types</option>
          <option value="comment">Comments</option>
          <option value="step">Checklist</option>
          <option value="status">Status</option>
          <option value="photo">Photos</option>
          <option value="delete">Deletes</option>
        </select>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity yet" message="Actions across the project will appear here in real time." />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, visible).map((a, i) => (
            <div key={a.id || i} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${a.type === "delete" ? "bg-red-400" : a.type === "photo" ? "bg-blue-400" : a.type === "step" ? "bg-emerald-400" : a.type === "status" ? "bg-amber-400" : "bg-slate-300"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-700">{a.text}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(a.created_at || a.created_date).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" · "}{a.user || "—"}
                  {" · "}<span className="uppercase">{a.type}</span>
                </div>
              </div>
            </div>
          ))}
          {visible < filtered.length && (
            <button onClick={() => setVisible((v) => v + 25)} className="w-full rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Load more ({filtered.length - visible} remaining)
            </button>
          )}
        </div>
      )}
    </PageShell>
  );
}