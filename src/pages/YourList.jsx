import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import RoleGate from "@/components/RoleGate";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import { ListChecks, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Your List: a personal working list. The user pins inspections they want to
// track. Stored as a simple array of visi IDs on the user's data.
export default function YourList() {
  const { project, locationMap } = useQaData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pinned, setPinned] = useState([]);
  const [visis, setVisis] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!project?.id || !user?.id) return;
    setLoading(true);
    const ids = (user.data?.pinned_visis || []).filter((id) => id);
    setPinned(ids);
    if (ids.length === 0) { setVisis([]); setLoading(false); return; }
    base44.entities.Visi.filter({ project_id: project.id }).then((all) => {
      const map = {};
      (Array.isArray(all) ? all : []).forEach((v) => { map[v.id] = v; });
      setVisis(ids.map((id) => map[id]).filter(Boolean));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id, user?.id]);

  async function removePin(visiId) {
    const next = pinned.filter((id) => id !== visiId);
    setPinned(next);
    setVisis((prev) => prev.filter((v) => v.id !== visiId));
    try {
      await base44.auth.updateMe({ data: { ...user.data, pinned_visis: next } });
    } catch (e) { console.error(e); }
  }

  if (loading) return <PageShell title="Your List" loading />;

  return (
    <PageShell title="Your List" subtitle={project?.name}>
      {visis.length === 0 ? (
        <EmptyState icon={ListChecks} title="Your list is empty" message="Open any inspection and tap 'Add to my list' to pin it here for quick access." />
      ) : (
        <div className="space-y-2">
          {visis.map((v) => {
            const loc = locationMap[v.location_id];
            const { done, total } = checklistProgress(v);
            return (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <button onClick={() => navigate(`/inspection/${v.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
                <button onClick={() => removePin(v.id)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}