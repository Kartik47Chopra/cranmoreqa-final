// Shared QA status logic — server-side mirror of src/lib/qaUtils.js.
// Imported by backend functions so aggregate counts match the frontend exactly.

export const COMPLETE_STEP_STATUSES = new Set(["complete", "completed", "done", "passed", "signed_off", "approved"]);

export function isStepComplete(step) {
  return COMPLETE_STEP_STATUSES.has((step?.status || "").toLowerCase());
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

export function activityDate(v) {
  return v?.closed_at || v?.last_updated || v?.created_at || v?.created_date;
}