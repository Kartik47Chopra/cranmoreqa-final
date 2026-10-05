import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import RoleGate from "@/components/RoleGate";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import { logActivity } from "@/lib/activityLog";
import { ClipboardList, ChevronRight, Loader2, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AssignTasks() {
  const { project, locations, locationMap, companies, companyMap } = useQaData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visis, setVisis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [assigneeCompany, setAssigneeCompany] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    base44.entities.Visi.filter({ project_id: project.id }).then((all) => {
      setVisis((Array.isArray(all) ? all : []).filter((v) => !v.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  const buildings = useMemo(() => locations.filter((l) => !l.parent_id), [locations]);

  const filtered = useMemo(() => {
    return visis.filter((v) => {
      if (statusFilter !== "all" && statusBucket(v) !== statusFilter) return false;
      if (buildingFilter) {
        const loc = locationMap[v.location_id];
        let cur = loc, seen = 0;
        while (cur && cur.parent_id && seen < 20) { cur = locationMap[cur.parent_id]; seen++; }
        if (cur?.id !== buildingFilter) return false;
      }
      return true;
    });
  }, [visis, statusFilter, buildingFilter, locationMap]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkAssign() {
    if (selected.size === 0 || !assigneeCompany) return;
    setAssigning(true);
    const ids = Array.from(selected);
    const updates = ids.map((id) => ({
      id, assignee_company_id: assigneeCompany, due_date: dueDate || undefined, last_updated: new Date().toISOString(),
    }));
    try {
      await base44.entities.Visi.bulkUpdate(updates);
      const comp = companyMap[assigneeCompany];
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Assigned ${ids.length} inspections to ${comp?.name || "company"}`, type: "task" });
      setVisis((prev) => prev.map((v) => selected.has(v.id) ? { ...v, assignee_company_id: assigneeCompany, due_date: dueDate || v.due_date } : v));
      setSelected(new Set());
    } catch (e) { console.error(e); }
    setAssigning(false);
  }

  return (
    <RoleGate roles={["admin", "pm"]}>
      <PageShell title="Assign Tasks" subtitle={project?.name}
        actions={
          <div className="flex gap-2">
            <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm">
              <option value="">All buildings</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm">
              <option value="all">All status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Closed</option>
            </select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No inspections to assign" message="No inspections match your filters." />
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {filtered.map((v) => {
                const loc = locationMap[v.location_id];
                const comp = companyMap[v.assignee_company_id];
                const { done, total } = checklistProgress(v);
                const isSel = selected.has(v.id);
                return (
                  <button key={v.id} onClick={() => toggle(v.id)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${isSel ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSel ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                      {isSel && <Check size={14} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{v.code || "Inspection"}</div>
                      <div className="truncate text-xs text-slate-500">{loc?.name || "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-500">{comp?.name || "Unassigned"}</div>
                      <div className="mt-1"><StatusBadge visi={v} /></div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bulk assign bar */}
            <div className="sticky bottom-0 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
              <div className="text-sm font-semibold text-slate-700 mb-3">{selected.size} selected</div>
              <div className="flex flex-wrap gap-2">
                <select value={assigneeCompany} onChange={(e) => setAssigneeCompany(e.target.value)} className="flex-1 min-w-[150px] rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm">
                  <option value="">Assign to company...</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg border border-slate-200 py-2 px-3 text-sm" />
                <button onClick={bulkAssign} disabled={selected.size === 0 || !assigneeCompany || assigning} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {assigning ? "Assigning..." : "Assign"}
                </button>
              </div>
            </div>
          </>
        )}
      </PageShell>
    </RoleGate>
  );
}