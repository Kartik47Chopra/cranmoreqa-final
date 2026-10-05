// Shared QA status logic — single source of truth for completion + progress.

export const COMPLETE_STEP_STATUSES = new Set(["complete", "completed", "done", "passed", "signed_off", "approved"]);

export function isStepComplete(step) {
  return (step?.status || "").toLowerCase() === "complete";
}

export function checklistProgress(v) {
  const steps = v?.steps || [];
  const done = steps.filter((s) => isStepComplete(s)).length;
  return { done, total: steps.length };
}

// 3-bucket: 'completed' | 'in_progress' | 'open'
export function statusBucket(v) {
  const ov = v?.override_status;
  if (ov === "na" || ov === "closed") return "completed";
  if (ov === "cant_close" || ov === "in_review" || ov === "in_dispute") return "in_progress";
  const { done, total } = checklistProgress(v);
  if (total === 0 || done === 0) return "open";
  if (done < total) return "in_progress";
  return "completed";
}

export function isVisiComplete(v) {
  return statusBucket(v) === "completed";
}

export function hasProgress(v) {
  return statusBucket(v) !== "open";
}

export const STATUS_META = {
  completed: { label: "Closed / Complete", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", hex: "#10b981" },
  in_progress: { label: "In Progress", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", hex: "#f59e0b" },
  open: { label: "Open", text: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-400", hex: "#94a3b8" },
};

export const OVERRIDE_META = {
  na: { label: "N/A", text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-300" },
  closed: { label: "Closed", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  cant_close: { label: "Can't Close", text: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  in_review: { label: "In Review", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  in_dispute: { label: "In Dispute", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
};

export function statusBadge(v) {
  const ov = v?.override_status;
  if (ov && ov !== "none" && OVERRIDE_META[ov]) return OVERRIDE_META[ov];
  return STATUS_META[statusBucket(v)];
}

export function pct(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

// Build a nested location tree from flat list.
export function buildLocationTree(locations) {
  const byParent = {};
  locations.forEach((l) => {
    const p = l.parent_id || "root";
    (byParent[p] = byParent[p] || []).push(l);
  });
  Object.values(byParent).forEach((arr) => arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
  return byParent;
}