import React from "react";
import { statusBadge, statusBucket, OVERRIDE_META } from "@/lib/qaUtils";

export default function StatusBadge({ visi, size = "sm" }) {
  const meta = statusBadge(visi);
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${meta.bg} ${meta.text} ${meta.border} ${pad}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot || "bg-current"}`} />
      {meta.label}
    </span>
  );
}

export function BucketBadge({ bucket, count }) {
  const map = {
    completed: { label: "Closed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    in_progress: { label: "In Progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    open: { label: "Open", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const m = map[bucket] || map.open;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {count} {m.label}
    </span>
  );
}