import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { FileBarChart, FileSpreadsheet, FileText, Download, Printer, Loader2, ChevronDown, ChevronUp, Mail, CheckCircle2, AlertTriangle } from "lucide-react";

export default function Report() {
  const { project, locations, locationMap } = useQaData();
  const { user } = useAuth();
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [showClaim, setShowClaim] = useState(false);
  const [claim, setClaim] = useState({ from: "", to: "", building: "", trade: "", include: "both", unclaimed: false });
  const [claimPreview, setClaimPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [showClaimStep, setShowClaimStep] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    base44.functions.invoke("aggregateStats", { project_id: project.id }).then((res) => setAgg(res.data))
      .catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  const buildings = useMemo(() => locations.filter((l) => !l.parent_original_id), [locations]);
  const trades = useMemo(() => agg ? Object.keys(agg.byTrade) : [], [agg]);

  async function generateClaimPreview() {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("aggregateStats", {
        project_id: project.id,
        building_id: claim.building || undefined,
        trade: claim.trade || undefined,
        date_from: claim.from || undefined,
        date_to: claim.to || undefined,
      });
      let items = res.data.items || [];
      if (claim.include === "completed") items = items.filter((i) => i.bucket === "completed");
      else if (claim.in_progress) items = items.filter((i) => i.bucket === "in_progress");
      else items = items.filter((i) => i.bucket === "completed" || i.bucket === "in_progress");
      const withPhotos = items.length;
      setClaimPreview({ total: items.length, completed: items.filter((i) => i.bucket === "completed").length, in_progress: items.filter((i) => i.bucket === "in_progress").length, items });
    } catch (e) { console.error(e); }
    setGenerating(false);
  }

  async function downloadPdf(isClaim = false) {
    setPdfLoading(true); setPdfError(null);
    try {
      const params = isClaim ? {
        projectId: project.id, projectName: project.name,
        building: claim.building || "all", trade: claim.trade || "all",
        dateFrom: claim.from || null, dateTo: claim.to || null,
        include: claim.include, onlyUnclaimed: claim.unclaimed,
      } : {
        projectId: project.id, projectName: project.name,
        building: "all", trade: "all", include: "both", onlyUnclaimed: false,
      };
      const res = await base44.functions.invoke("generatePdf", params);
      if (res.data?.error) { setPdfError(res.data.error); }
      else {
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Progress-Claim_${project.name.replace(/\s+/g, "-")}_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { setPdfError(e.message || "Failed to generate PDF. Please retry."); }
    setPdfLoading(false);
  }

  async function markClaimed() {
    if (!claimPreview || claiming) return;
    setClaiming(true);
    try {
      const items = claimPreview.items || [];
      const claimName = `Claim ${new Date().toLocaleDateString("en-AU")}`;
      await base44.entities.Visi.bulkUpdate(items.map((v) => ({
        id: v.id, claimed: true, claimed_at: new Date().toISOString(), claimed_in: claimName,
      })));
      setShowClaimStep(false);
    } catch (e) { console.error(e); }
    setClaiming(false);
  }

  function exportCSV() {
    if (!agg) return;
    const rows = [["Building", "Trade", "Total", "Closed", "In Progress", "Open", "Progress %"]];
    Object.entries(agg.byBuilding).forEach(([bld, bData]) => {
      Object.entries(agg.byTrade).forEach(([trade, tData]) => {
        // We don't have building+trade cross-tab in the aggregate; use building totals
      });
    });
    // Simpler: one row per building
    Object.entries(agg.byBuilding).forEach(([bld, c]) => {
      rows.push([bld, "All", c.total, c.completed, c.in_progress, c.open, c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Progress-Report_${project.name.replace(/\s+/g, "-")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <PageShell title="Progress Report" loading />;
  if (!project) return <PageShell title="Progress Report"><EmptyState title="No project selected" /></PageShell>;
  if (!agg || agg.totalItems === 0) return (
    <PageShell title="Progress Report" subtitle={project.name}>
      <EmptyState icon={FileBarChart} title="No data to report" message="Import inspections to see the progress report." />
    </PageShell>
  );

  const o = agg.overall;

  return (
    <PageShell title="Progress Report" subtitle={`${project.name} · ${project.address || ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><FileSpreadsheet size={15} /> Excel</button>
          <button onClick={() => downloadPdf(false)} disabled={pdfLoading} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {pdfLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Download PDF
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Printer size={15} /> Print</button>
          <button onClick={() => setShowClaim(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Download size={15} /> Progress Claim</button>
        </div>
      }
    >
      {/* Header info */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
        <div className="font-display text-lg font-bold text-slate-900">{project.name}</div>
        <div className="text-sm text-slate-500">{project.address || ""} {project.drawing_set ? `· Drawing Set: ${project.drawing_set}` : ""}</div>
        <div className="text-xs text-slate-400 mt-1">Cranmore Carpenters QA · Generated {new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Total Inspections" value={o.total} />
        <SummaryCard label="Closed" value={o.completed} color="text-emerald-600" />
        <SummaryCard label="Checklist Progress" value={`${agg.checklistProgress}%`} color="text-emerald-600" />
      </div>

      {/* Per-building tables */}
      <div className="space-y-3">
        {Object.entries(agg.byBuilding).map(([bldName, c]) => {
          const isExp = expanded[bldName];
          return (
            <div key={bldName} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setExpanded((p) => ({ ...p, [bldName]: !p[bldName] }))} className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1 text-left">
                  <div className="font-display text-base font-bold text-slate-800">{bldName}</div>
                  <div className="text-xs text-slate-500">{c.total} total · {c.completed} closed · {c.in_progress} in progress · {c.open} open</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-lg font-bold text-emerald-600">{c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0}%</div>
                  {isExp ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
              </button>
              {isExp && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Trade</th>
                        <th className="px-3 py-2 text-center">Total</th>
                        <th className="px-3 py-2 text-center">Closed</th>
                        <th className="px-3 py-2 text-center">In Progress</th>
                        <th className="px-3 py-2 text-center">Open</th>
                        <th className="px-3 py-2 text-center">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">All Trades</td>
                        <td className="px-3 py-2 text-center font-mono">{c.total}</td>
                        <td className="px-3 py-2 text-center font-mono text-emerald-600">{c.completed}</td>
                        <td className="px-3 py-2 text-center font-mono text-amber-600">{c.in_progress}</td>
                        <td className="px-3 py-2 text-center font-mono text-slate-500">{c.open}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold">{c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Claim modal */}
      {showClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setShowClaim(false)}>
          <div className="rounded-lg bg-white p-6 max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold mb-1">Progress Claim</h3>
            <p className="text-sm text-slate-500 mb-4">Generates a single PDF with the selected items, photos, and a summary. Send it to accounts for progress claims.</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Completed From</label>
                <input type="date" value={claim.from} onChange={(e) => setClaim({ ...claim, from: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Completed To</label>
                <input type="date" value={claim.to} onChange={(e) => setClaim({ ...claim, to: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Building</label>
                <select value={claim.building} onChange={(e) => setClaim({ ...claim, building: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm">
                  <option value="">All buildings</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Trade</label>
                <select value={claim.trade} onChange={(e) => setClaim({ ...claim, trade: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm">
                  <option value="">All trades</option>
                  {trades.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-slate-500">Include</label>
              <select value={claim.include} onChange={(e) => setClaim({ ...claim, include: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 text-sm">
                <option value="both">Completed and In Progress</option>
                <option value="completed">Completed only</option>
                <option value="in_progress">In Progress only</option>
              </select>
            </div>
            <label className="flex items-center gap-2 mb-4 text-sm text-slate-600">
              <input type="checkbox" checked={claim.unclaimed} onChange={(e) => setClaim({ ...claim, unclaimed: e.target.checked })} className="rounded" />
              Only items not yet claimed
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button onClick={() => setClaim({ ...claim, from: "", to: "" })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">All time</button>
              <button onClick={() => { const d = new Date(); setClaim({ ...claim, from: d.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">This week</button>
              <button onClick={() => { const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth(), 1); setClaim({ ...claim, from: first.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">This month</button>
              <button onClick={() => { const d = new Date(); const past = new Date(d.getTime() - 7 * 86400000); setClaim({ ...claim, from: past.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Last 7 days</button>
            </div>
            <button onClick={generateClaimPreview} disabled={generating} className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 mb-3">
              {generating ? "Checking..." : "Check matches"}
            </button>
            {claimPreview && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-4 text-sm">
                {claimPreview.total === 0 ? (
                  <p className="text-slate-500">No items match these filters. Try adjusting the date range or filters.</p>
                ) : (
                  <p className="text-slate-700"><span className="font-bold">{claimPreview.total}</span> items match ({claimPreview.completed} completed, {claimPreview.in_progress} in progress)</p>
                )}
              </div>
            )}
            {pdfError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-3 text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={15} /> {pdfError} <button onClick={() => downloadPdf(true)} className="ml-auto underline">Retry</button></div>}
            <div className="flex gap-2">
              <button onClick={() => setShowClaim(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => downloadPdf(true)} disabled={!claimPreview || claimPreview.total === 0 || pdfLoading} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {pdfLoading ? <Loader2 size={15} className="animate-spin mx-auto" /> : "Download PDF"}
              </button>
            </div>
            {claimPreview && claimPreview.total > 0 && (user?.role === "admin" || user?.role === "pm") && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {!showClaimStep ? (
                  <button onClick={() => setShowClaimStep(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 size={15} /> Mark these items as claimed?
                  </button>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm text-emerald-700 mb-2">Mark {claimPreview.total} items as claimed? This adds a "Claimed" badge to each. Admin can reverse it.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowClaimStep(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                      <button onClick={markClaimed} disabled={claiming} className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {claiming ? "Marking..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {project.accounts_email ? (
              <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Mail size={15} /> Email to accounts
              </button>
            ) : (
              <p className="mt-2 text-center text-xs text-slate-400">Add an accounts email in Project Setup to enable email</p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`font-mono text-3xl font-bold ${color || "text-slate-800"}`}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}