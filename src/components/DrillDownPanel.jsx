import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import { X, FileBarChart, ChevronRight } from "lucide-react";

// Shared drill-down panel: opens from Dashboard counters and chart segments.
// Shows totals + bucket breakdown + a scrollable list of the actual items.
// Tapping an item navigates to that inspection; "View in Progress Report"
// jumps to /report with the same filter context.
export default function DrillDownPanel({ open, onOpenChange, title, items, locationMap, templateMap }) {
  const navigate = useNavigate();

  const counts = items.reduce((acc, v) => {
    const b = statusBucket(v);
    acc[b] = (acc[b] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, { total: 0, completed: 0, in_progress: 0, open: 0 });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col" side="right">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-200 shrink-0">
          <SheetTitle className="font-display text-lg font-bold uppercase tracking-tight">{title}</SheetTitle>
          <div className="flex gap-2 mt-2">
            <CountChip label="Total" value={counts.total} cls="bg-slate-100 text-slate-700" />
            <CountChip label="Closed" value={counts.completed} cls="bg-emerald-50 text-emerald-700" />
            <CountChip label="In Progress" value={counts.in_progress} cls="bg-amber-50 text-amber-700" />
            <CountChip label="Open" value={counts.open} cls="bg-slate-100 text-slate-600" />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {items.length === 0 && <div className="py-10 text-center text-sm text-slate-400">No items in this view.</div>}
          {items.map((v) => {
            const loc = locationMap[v.location_id];
            const tpl = templateMap[v.template_id];
            const { done, total } = checklistProgress(v);
            return (
              <button
                key={v.id}
                onClick={() => { onOpenChange(false); navigate(`/inspection/${v.id}`); }}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-emerald-50/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{v.code || tpl?.name || "Inspection"}</div>
                  <div className="truncate text-xs text-slate-500">{loc?.name || "—"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs text-slate-600">{done}/{total} · {pct(done, total)}%</div>
                  <div className="mt-1"><StatusBadge visi={v} /></div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              </button>
            );
          })}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-5 py-3">
          <button
            onClick={() => { onOpenChange(false); navigate("/report"); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <FileBarChart size={15} /> View in Progress Report
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CountChip({ label, value, cls }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {value} {label}
    </span>
  );
}