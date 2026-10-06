// Shared QA status logic — single source of truth for completion + progress.

export const COMPLETE_STEP_STATUSES = new Set(["complete", "completed", "done", "passed", "signed_off", "approved"]);

export function isStepComplete(step) {
  return COMPLETE_STEP_STATUSES.has((step?.status || "").toLowerCase());
}

export function stepLabel(step) {
  return step?.label || step?.title || step?.name || "";
}

export function checklistProgress(v) {
  const steps = v?.steps || [];
  const done = steps.filter((s) => isStepComplete(s)).length;
  return { done, total: steps.length };
}

export function statusBucket(v) {
  const ov = v?.override_status;
  if (ov === "na" || ov === "closed") return "completed";
  if (ov === "cant_close" || ov === "in_review" || ov === "in_dispute") return "in_progress";
  const { done, total } = checklistProgress(v);
  if (total === 0 || done === 0) return "open";
  if (done < total) return "in_progress";
  return "completed";
}

export function isVisiComplete(v) { return statusBucket(v) === "completed"; }
export function hasProgress(v) { return statusBucket(v) !== "open"; }

export function activityDate(v) { return v?.closed_at || v?.last_updated || v?.created_at; }

export function daysOpen(v) {
  try {
    const created = v?.created_at ? new Date(v.created_at) : null;
    if (!created) return 0;
    const end = v?.closed_at ? new Date(v.closed_at) : new Date();
    return Math.max(0, Math.round((end - created) / 86400000));
  } catch { return 0; }
}

export function computeStatus(v) {
  const ov = v?.override_status;
  if (ov && ov !== "none") return ov;
  const { done, total } = checklistProgress(v);
  if (total === 0 || done === 0) return "open";
  if (done < total) return "in_progress";
  return "closed";
}

export const STATUS_META = {
  completed: { label: "Closed", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", hex: "#10b981" },
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

export function pct(done, total) { if (!total) return 0; return Math.round((done / total) * 100); }

// Build a nested location tree from flat list using parent_original_id.
// Roots = locations with empty/null parent_original_id.
// Orphans (parent_original_id set but not found) are EXCLUDED from the tree.
export function buildLocationTree(locations) {
  const active = locations.filter((l) => !l.is_deleted);
  const byOrig = {};
  active.forEach((l) => { if (l.original_id) byOrig[l.original_id] = l; });
  const byParentOrig = {};
  active.forEach((l) => {
    const pOrig = l.parent_original_id;
    if (!pOrig) { (byParentOrig["root"] = byParentOrig["root"] || []).push(l); return; }
    if (!byOrig[pOrig]) return; // orphan — parent not found, skip (error, shown on Verify)
    (byParentOrig[pOrig] = byParentOrig[pOrig] || []).push(l);
  });
  Object.values(byParentOrig).forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  return byParentOrig;
}

// Full path using parent_original_id chain.
export function locationPath(locations, id) {
  const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
  const byOrig = {};
  locations.forEach((l) => { if (l.original_id) byOrig[l.original_id] = l; });
  const path = [];
  let cur = byId[id];
  let seen = 0;
  while (cur && seen < 30) {
    path.unshift(cur.name);
    cur = cur.parent_original_id ? byOrig[cur.parent_original_id] : null;
    seen++;
  }
  return path.join(" / ");
}

// Collect all descendant original_ids of a location (including itself).
export function subtreeOriginalIds(locations, rootId) {
  const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
  const byParentOrig = {};
  locations.forEach((l) => {
    if (l.parent_original_id) (byParentOrig[l.parent_original_id] = byParentOrig[l.parent_original_id] || []).push(l);
  });
  const ids = new Set();
  const root = byId[rootId];
  if (!root) return ids;
  function walk(loc) {
    if (!loc || loc.is_deleted) return;
    if (loc.original_id) ids.add(loc.original_id);
    const children = byParentOrig[loc.original_id] || [];
    children.forEach(walk);
  }
  walk(root);
  return ids;
}

export function topLocation(locations, id) {
  const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
  const byOrig = {};
  locations.forEach((l) => { if (l.original_id) byOrig[l.original_id] = l; });
  let cur = byId[id];
  let seen = 0;
  while (cur && cur.parent_original_id && seen < 20) {
    const parent = byOrig[cur.parent_original_id];
    if (!parent || !parent.parent_original_id) return parent || cur;
    cur = parent;
    seen++;
  }
  return cur;
}