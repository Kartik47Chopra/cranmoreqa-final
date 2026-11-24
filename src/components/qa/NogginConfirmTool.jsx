import React, { useMemo, useState } from "react";
import { readAll } from "@/components/qa/paging";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/activityLog";
import { Hammer, Loader2, CheckCircle2 } from "lucide-react";

const NOTE = "ticked on site confirmation that the noggins are installed; photo evidence still to be attached";

// ILA Ground Floor: ticks the noggin step on every Sanitary Visi where the step is still pending.
// Nothing is un-ticked and no photo is created. Each tick is written to the Activity log with the note above,
// so the record shows these were confirmed on site and the photos are still outstanding.
export default function NogginConfirmTool() {
  const { project, locations, refreshStats } = useQaData();
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const groundIds = useMemo(() => {
    const building = locations.find((l) => l.type === "Building" && /^ILA/i.test(l.name || ""));
    const floor = building && locations.find((l) => l.parent_original_id === building.original_id && /ground/i.test(l.name || ""));
    if (!floor) return null;
    const ids = new Set([floor.original_id]); let grew = true;
    while (grew) { grew = false; for (const l of locations) if (!ids.has(l.original_id) && ids.has(l.parent_original_id)) { ids.add(l.original_id); grew = true; } }
    return ids;
  }, [locations]);

  async function check() {
    setBusy(true); setError(""); setDone(null);
    try {
      const visis = await readAll("Visi", { project_id: project.id });
      const mine = visis.filter((v) => !v.is_deleted && /^225-SN-/i.test(v.code || "") && groundIds.has(v.location_original_id));
      const todo = mine.filter((v) => (v.steps || []).some((s) => /noggins marked/i.test(s.label || "") && s.status !== "complete"));
      setPlan({ total: mine.length, todo });
    } catch (e) { setError(e?.message || "Could not load Visis"); }
    setBusy(false);
  }

  async function run() {
    setBusy(true); setError("");
    let n = 0;
    try {
      for (const v of plan.todo) {
        const now = new Date().toISOString();
        const steps = v.steps.map((s) => (/noggins marked/i.test(s.label || "") && s.status !== "complete" ? { ...s, status: "complete", completed_at: now, completed_by: user?.id } : s));
        await base44.entities.Visi.update(v.id, { steps, last_updated: now });
        logActivity({ project_id: project.id, visi_id: v.id, user: user?.full_name || user?.email, text: `Noggin step ${NOTE}`, type: "step" });
        n += 1;
      }
      setDone(n); setPlan(null); refreshStats?.(true);
    } catch (e) { setError(`${e?.message || "Update failed"} (${n} done before the error)`); }
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><Hammer size={18} className="text-emerald-600" /> ILA Ground Floor noggins (site confirmed)</div>
      <p className="mt-1 text-sm text-slate-500">Ticks the noggin step on the ILA Ground Floor Sanitary items where it is still pending. It does not add photos, and each tick is logged in Activity as "photo evidence still to be attached". Attach the real photos with "Add photos to Visis".</p>
      {!groundIds && <p className="mt-2 text-sm text-amber-600">ILA Ground Floor was not found.</p>}
      <button onClick={check} disabled={busy || !groundIds} className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy && !plan ? "Checking..." : "Check"}</button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {plan && (
        <div className="mt-3">
          <p className="text-sm text-slate-700">{plan.total} Sanitary items found. {plan.todo.length} still need the noggin step ticked.</p>
          <button onClick={run} disabled={busy || !plan.todo.length} className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : null} Tick {plan.todo.length} noggin steps</button>
        </div>
      )}
      {done != null && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 size={14} /> Ticked {done} noggin steps.</p>}
    </div>
  );
}
