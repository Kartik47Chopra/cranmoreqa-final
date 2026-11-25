import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { Building2, Loader2, CheckCircle2 } from "lucide-react";

// Admin: creates the Bell Bardia project from the door schedule (buildings, levels, apartments, door / entry door / sanitary / skirting Visis).
export default function BellBardiaTool() {
  const { reload } = useQaData();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  async function call(preview) {
    setBusy(true); setError("");
    try {
      const r = await base44.functions.invoke("createBellBardia", { preview });
      if (preview) setPlan(r.data); else { setDone(r.data); setPlan(null); await reload?.(); }
    } catch (e) { setError(e?.response?.data?.error || e?.message || "Failed"); }
    setBusy(false);
  }
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><Building2 size={18} className="text-emerald-600" /> Bell Bardia project</div>
      <p className="mt-1 text-sm text-slate-500">Creates the Bell Bardia project (Buildings A and B, every level and apartment) with a Door, Entry door, Sanitary and Skirting Visi for each item on the door schedule. Run it once. Then pick Bell Bardia from the project menu.</p>
      <button onClick={() => call(true)} disabled={busy} className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy && !plan ? "Checking..." : "Check"}</button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {plan && (
        <div className="mt-3 text-sm text-slate-700">
          <p>{plan.buildings} buildings, {plan.levels} levels, {plan.apartments} apartments, {plan.visis} Visis ({Object.entries(plan.by_trade || {}).map(([t, n]) => `${n} ${t}`).join(", ")}).</p>
          <button onClick={() => call(false)} disabled={busy} className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : null} Create Bell Bardia</button>
        </div>
      )}
      {done && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 size={14} /> Created {done.visis} Visis in {done.apartments} apartments. Switch project from the menu.</p>}
    </div>
  );
}
