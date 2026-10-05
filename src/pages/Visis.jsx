import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { statusBucket, checklistProgress, pct } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import VisiSheet from "@/components/VisiSheet";
import { Search, Filter } from "lucide-react";

const BUCKETS = ["all", "open", "in_progress", "completed"];

export default function Visis() {
  const { locationMap, templateMap, companyMap, loading } = useQaData();
  const [visis, setVisis] = useState([]);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("all");
  const [tplFilter, setTplFilter] = useState("all");
  const [active, setActive] = useState(null);

  useEffect(() => {
    base44.entities.Visi.list("-created_date", 1000).then(setVisis).catch(console.error);
  }, []);

  const refresh = (fresh) => {
    setVisis((prev) => prev.map((v) => (v.id === fresh.id ? fresh : v)));
    setActive(fresh);
  };

  const filtered = useMemo(() => {
    return visis.filter((v) => {
      if (bucket !== "all" && statusBucket(v) !== bucket) return false;
      if (tplFilter !== "all" && v.template_id !== tplFilter) return false;
      if (q) {
        const loc = locationMap[v.location_id];
        const hay = `${v.visi_code} ${loc?.name || ""} ${templateMap[v.template_id]?.name || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [visis, bucket, tplFilter, q, locationMap, templateMap]);

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-slate-900">Visis</h1>
            <p className="text-sm text-slate-500">{filtered.length} of {visis.length} inspections</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 md:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code or location…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <Select value={tplFilter} onChange={setTplFilter} options={[{ value: "all", label: "All templates" }, ...Object.values(templateMap).map((t) => ({ value: t.id, label: t.name }))]} />
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {BUCKETS.map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${bucket === b ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {b === "all" ? "All" : b.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 md:px-6">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Code</th>
                <th className="px-3 py-2.5 text-left">Template</th>
                <th className="px-3 py-2.5 text-left">Location</th>
                <th className="px-3 py-2.5 text-left">Assignee</th>
                <th className="px-3 py-2.5 text-center">Progress</th>
                <th className="px-3 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const tpl = templateMap[v.template_id];
                const loc = locationMap[v.location_id];
                const assignee = companyMap[v.assignee_company_id];
                const { done, total } = checklistProgress(v);
                return (
                  <tr key={v.id} onClick={() => setActive(v)} className="cursor-pointer border-t border-slate-100 hover:bg-emerald-50/40">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-slate-900">{v.visi_code}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{tpl?.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{loc?.name}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        {assignee && <span className="h-2 w-2 rounded-full" style={{ background: assignee.color }} />}
                        {assignee?.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs text-slate-600">{done}/{total}</td>
                    <td className="px-3 py-2.5"><StatusBadge visi={v} /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">No Visis match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VisiSheet visi={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} onUpdated={refresh} />
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}