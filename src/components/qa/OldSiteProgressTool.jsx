import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/activityLog";
import { isStepComplete, stepLabel } from "@/lib/qaUtils";
import oldSite from "@/data/oldSiteProgress.json";
import { History, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const norm = (s) => String(s || "").trim().toLowerCase();

// Compares this app with the progress recorded on the old (Render) site: ticked steps and photos.
// Restoring only ticks steps that are still pending here; it never un-ticks anything.
export default function OldSiteProgressTool() {
  const { project, refreshStats } = useQaData();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [restored, setRestored] = useState(null);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true); setError(""); setRestored(null);
    try {
      const visiIds = [...new Set([...oldSite.ticks.map((t) => t.visi), ...oldSite.photos.map((p) => p.visi)])];
      const visis = [];
      for (let i = 0; i < visiIds.length; i += 200) visis.push(...await readAll("Visi", { original_id: { $in: visiIds.slice(i, i + 200) } }));
      const byOrig = Object.fromEntries(visis.filter((v) => !v.is_deleted).map((v) => [v.original_id, v]));
      const ticked = [], toRestore = [], notFound = [];
      for (const t of oldSite.ticks) {
        const v = byOrig[t.visi];
        if (!v) { notFound.push(t.code); continue; }
        const pending = t.steps.filter((label) => !(v.steps || []).some((s) => norm(stepLabel(s)) === norm(label) && isStepComplete(s)));
        if (pending.length) toRestore.push({ visi: v, code: t.code, steps: pending }); else ticked.push(t.code);
      }
      const atts = await readAll("Attachment", { original_id: { $in: oldSite.photos.map((p) => p.id) } });
      const linked = new Set(atts.filter((a) => !a.is_deleted && a.visi_id && a.file_uri && !String(a.file_uri).startsWith("pending:")).map((a) => a.original_id));
      const photosMissing = oldSite.photos.filter((p) => !linked.has(p.id)).map((p) => p.code);
      setResult({ ticked, toRestore, notFound, photosLinked: linked.size, photosMissing });
    } catch (e) { setError(e?.message || "Could not compare with the old site."); }
    setBusy(false);
  }

  async function restore() {
    if (!result?.toRestore.length) return;
    setBusy(true); setError("");
    let done = 0, failed = 0;
    for (const item of result.toRestore) {
      try {
        const fresh = await base44.entities.Visi.get(item.visi.id);
        const wanted = new Set(item.steps.map(norm));
        const now = new Date().toISOString();
        const steps = (fresh.steps || []).map((s) => (wanted.has(norm(stepLabel(s))) && !isStepComplete(s) ? { ...s, status: "complete", completed_at: s.completed_at || now, completed_by: s.completed_by || user?.id } : s));
        await base44.entities.Visi.update(fresh.id, { steps, last_updated: now });
        logActivity({ project_id: fresh.project_id, visi_id: fresh.id, user: user?.full_name || user?.email, text: `Restored from old site: ${item.steps.join(", ")} marked complete`, type: "step" });
        done++;
      } catch (e) { failed++; console.error("restore failed", item.code, e); }
    }
    setRestored({ done, failed });
    refreshStats();
    setBusy(false);
    check();
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><History size={18} className="text-emerald-600" /> Old site progress check</div>
      <p className="mt-1 text-sm text-slate-500">Checks that the {oldSite.ticks.length} Visis ticked on the old site are ticked here and that its {oldSite.photos.length} photos are attached. Nothing changes until you press Restore.</p>
      <button onClick={check} disabled={busy || !project?.id} className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />} Check now
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-emerald-600" /> Ticked here as on the old site: <b>{result.ticked.length}</b> of {oldSite.ticks.length}</p>
          <p className="flex items-center gap-1.5"><CheckCircle2 size={15} className={result.photosMissing.length ? "text-amber-500" : "text-emerald-600"} /> Old photos attached: <b>{result.photosLinked}</b> of {oldSite.photos.length}</p>
          {result.photosMissing.length > 0 && <p className="text-xs text-amber-700">Photos still to link (use Link photo files above): {[...new Set(result.photosMissing)].join(", ")}</p>}
          {result.notFound.length > 0 && <p className="flex items-start gap-1.5 text-amber-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> Visis not found here: {result.notFound.join(", ")}</p>}
          {result.toRestore.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="font-semibold text-amber-800">{result.toRestore.length} Visis are missing ticks from the old site:</p>
              <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-amber-900">
                {result.toRestore.map((r) => <li key={r.code}>{r.code}: {r.steps.join(", ")}</li>)}
              </ul>
              <button onClick={restore} disabled={busy} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Restore {result.toRestore.length} Visis</button>
            </div>
          )}
          {restored && <p>Restored <b>{restored.done}</b>{restored.failed ? <> · failed <b>{restored.failed}</b></> : null}</p>}
        </div>
      )}
    </div>
  );
}
