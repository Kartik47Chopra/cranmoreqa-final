import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { statusBucket, checklistProgress, pct, statusBadge } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import { CheckCircle2, Circle, Camera, MapPin, Building2, User, ClipboardCheck, AlertTriangle } from "lucide-react";

export default function VisiSheet({ visi, open, onOpenChange, onUpdated }) {
  const { companyMap, templateMap, locationMap } = useQaData();
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visi) return;
    let active = true;
    base44.entities.Attachment.filter({ visi_id: visi.id }).then((a) => {
      if (active) setAttachments(a);
    });
    return () => { active = false; };
  }, [visi]);

  if (!visi) return null;
  const tpl = templateMap[visi.template_id];
  const loc = locationMap[visi.location_id];
  const assignee = companyMap[visi.assignee_company_id];
  const reviewer = companyMap[visi.reviewer_company_id];
  const { done, total } = checklistProgress(visi);
  const bucket = statusBucket(visi);
  const meta = statusBadge(visi);

  async function toggleStep(idx) {
    setSaving(true);
    const steps = visi.steps.map((s, i) => {
      if (i !== idx) return s;
      const complete = s.status !== "complete";
      return { ...s, status: complete ? "complete" : "pending", completed_at: complete ? new Date().toISOString() : null };
    });
    const allDone = steps.every((s) => s.status === "complete");
    const updated = { steps, last_updated: new Date().toISOString(), closed_at: allDone ? new Date().toISOString() : null };
    try {
      const fresh = await base44.entities.Visi.update(visi.id, updated);
      onUpdated?.(fresh);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="font-mono text-lg font-bold tracking-tight text-slate-900">{visi.visi_code}</SheetTitle>
            <StatusBadge visi={visi} />
          </div>
          <SheetDescription className="space-y-1 text-left">
            <div className="text-sm font-semibold text-slate-700">{tpl?.name} · {tpl?.trade}</div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 size={13} /> {loc?.path || loc?.name}
            </div>
          </SheetDescription>
        </SheetHeader>

        {/* Progress ring + details */}
        <div className="grid grid-cols-1 gap-4 px-6 py-4 border-b border-slate-200 sm:grid-cols-2">
          <div className="flex items-center gap-4">
            <ProgressRing value={pct(done, total)} bucket={bucket} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist progress</div>
              <div className="font-mono text-2xl font-bold text-slate-900">{done}<span className="text-slate-400">/{total}</span></div>
              <div className="text-xs text-slate-500">{meta.label}</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Detail icon={User} label="Assignee" value={assignee?.name} color={assignee?.color} />
            <Detail icon={ClipboardCheck} label="Reviewer" value={reviewer?.name} color={reviewer?.color} />
            <Detail icon={Building2} label="Discipline" value={tpl?.discipline} />
          </div>
        </div>

        {/* Checklist */}
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Checklist</div>
          <div className="space-y-1.5">
            {visi.steps.map((s, i) => {
              const complete = s.status === "complete";
              return (
                <button
                  key={i}
                  onClick={() => toggleStep(i)}
                  disabled={saving}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  } ${saving ? "opacity-60" : ""}`}
                >
                  {complete ? (
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                  ) : (
                    <Circle size={18} className="shrink-0 text-slate-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${complete ? "text-emerald-800" : "text-slate-700"}`}>{s.title}</div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{s.type}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Override */}
        {visi.override_status && visi.override_status !== "none" && (
          <div className="mx-6 my-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
              <AlertTriangle size={13} /> Override: {visi.override_status.replace(/_/g, " ")}
            </div>
            {visi.override_comment && <div className="mt-1 text-sm text-amber-800">{visi.override_comment}</div>}
          </div>
        )}

        {/* Attachments */}
        <div className="px-6 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Camera size={13} /> Attachments ({attachments.length})
          </div>
          {attachments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
              No photo evidence uploaded yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={a.file_url} alt={a.title} className="aspect-square w-full object-cover" />
                  {a.lat != null && (
                    <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      <MapPin size={9} /> GPS
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-400" />
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
        {value || "—"}
      </span>
    </div>
  );
}

function ProgressRing({ value, bucket }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const stroke = bucket === "completed" ? "#10b981" : bucket === "in_progress" ? "#f59e0b" : "#94a3b8";
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 34 34)" />
      <text x="34" y="38" textAnchor="middle" className="fill-slate-900 font-mono text-sm font-bold">{value}%</text>
    </svg>
  );
}