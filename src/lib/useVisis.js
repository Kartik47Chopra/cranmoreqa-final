import { useEffect, useState } from "react";
import { readAll } from "@/components/qa/paging";
import { readCache, writeCache } from "@/lib/loadWithRetry";

// Slim copy of each Visi (checklist keeps only step status) so lists are small, quick to render and cacheable.
const slim = (v) => ({
  id: v.id, code: v.code, trade: v.trade, discipline: v.discipline, template_id: v.template_id, template_name: v.template_name, visi_type: v.visi_type,
  location_id: v.location_id, location_original_id: v.location_original_id, assignee_company_id: v.assignee_company_id, due_date: v.due_date,
  override_status: v.override_status, claimed: v.claimed, closed_at: v.closed_at, last_updated: v.last_updated, created_at: v.created_at,
  steps: (v.steps || []).map((s) => ({ status: s.status })),
});

// Shows the last result at once (if any), then refreshes in the background. extraQuery e.g. { assignee_company_id }.
export function useVisis(projectId, extraQuery = null) {
  const key = projectId ? `cranmore_visis_${projectId}_${extraQuery ? JSON.stringify(extraQuery) : "all"}` : null;
  const [visis, setVisis] = useState(() => (key ? readCache(key) || [] : []));
  const [loading, setLoading] = useState(() => !(key && readCache(key)));
  useEffect(() => {
    if (!projectId) return undefined;
    let live = true;
    const cached = readCache(key);
    if (cached) { setVisis(cached); setLoading(false); } else setLoading(true);
    readAll("Visi", { project_id: projectId, ...(extraQuery || {}) }).then((all) => {
      if (!live) return;
      const rows = all.filter((v) => !v.is_deleted).map(slim);
      setVisis(rows); writeCache(key, rows);
    }).catch(console.error).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [key]);
  return { visis, setVisis, loading };
}
