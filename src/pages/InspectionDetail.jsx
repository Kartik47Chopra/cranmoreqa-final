import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { statusBucket, checklistProgress, pct, statusBadge, OVERRIDE_META } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { logActivity } from "@/lib/activityLog";
import { CheckCircle2, Circle, ArrowLeft, Camera, Trash2, MapPin, Building2, ClipboardCheck, AlertTriangle, History, Image as ImageIcon, X, Loader2 } from "lucide-react";

export default function InspectionDetail() {
  const { visiId } = useParams();
  const navigate = useNavigate();
  const { locationMap, templateMap, companyMap } = useQaData();
  const { user } = useAuth();
  const [visi, setVisi] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photoView, setPhotoView] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!visiId) return;
    setLoading(true);
    Promise.all([
      base44.entities.Visi.get(visiId),
      base44.entities.Attachment.filter({ visi_id: visiId }),
      base44.entities.Activity.filter({ visi_id: visiId }),
    ]).then(([v, atts, acts]) => {
      setVisi(v);
      setAttachments(Array.isArray(atts) ? atts.filter((a) => !a.is_deleted) : []);
      setActivities(Array.isArray(acts) ? acts.sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date)) : []);
      setNotes(v.override_comment || "");
    }).catch((e) => setError(e.message || "Failed to load inspection"))
      .finally(() => setLoading(false));
  }, [visiId]);

  async function toggleStep(idx) {
    if (saving) return;
    setSaving(true);
    const steps = visi.steps.map((s, i) => {
      if (i !== idx) return s;
      const complete = s.status !== "complete";
      return { ...s, status: complete ? "complete" : "pending" };
    });
    const allDone = steps.every((s) => s.status === "complete");
    const updated = { steps, last_updated: new Date().toISOString(), closed_at: allDone && !visi.closed_at ? new Date().toISOString() : visi.closed_at };
    try {
      const fresh = await base44.entities.Visi.update(visi.id, updated);
      setVisi(fresh);
      const step = visi.steps[idx];
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Step "${step.label}" marked ${steps[idx].status === "complete" ? "complete" : "pending"}`, type: "step" });
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function setOverride(override_status) {
    if (saving) return;
    setSaving(true);
    try {
      const fresh = await base44.entities.Visi.update(visi.id, { override_status, override_comment: notes, last_updated: new Date().toISOString() });
      setVisi(fresh);
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Status override set to ${override_status}`, type: "status" });
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function saveNotes() {
    setNotesSaving(true);
    try {
      const fresh = await base44.entities.Visi.update(visi.id, { override_comment: notes, last_updated: new Date().toISOString() });
      setVisi(fresh);
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: "Notes updated", type: "comment" });
    } catch (e) { console.error(e); }
    setNotesSaving(false);
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const att = await base44.entities.Attachment.create({
          visi_id: visi.id, location_id: visi.location_id,
          file_uri, original_filename: file.name, content_type: file.type, size: file.size,
          uploaded_by: user?.id, uploaded_by_company: user?.data?.company_id,
          uploaded_at: new Date().toISOString(),
        });
        setAttachments((prev) => [...prev, att]);
        logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Photo uploaded: ${file.name}`, type: "photo" });
      } catch (e) { console.error("upload failed", e); }
    }
  }

  async function deletePhoto(att) {
    try {
      await base44.entities.Attachment.update(att.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Photo deleted: ${att.original_filename}`, type: "delete" });
    } catch (e) { console.error(e); }
    setShowDeleteConfirm(null);
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-red-600">{error}</p>
      <button onClick={() => navigate(-1)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Go back</button>
    </div>
  );
  if (!visi) return <EmptyState title="Inspection not found" />;

  const loc = locationMap[visi.location_id];
  const tpl = templateMap[visi.template_id];
  const assignee = companyMap[visi.assignee_company_id];
  const reviewer = companyMap[visi.reviewer_company_id];
  const { done, total } = checklistProgress(visi);
  const bucket = statusBucket(visi);
  const meta = statusBadge(visi);
  const canEdit = user?.role === "admin" || user?.role === "pm" || user?.role === "trade";

  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900 truncate">{visi.code || tpl?.name || "Inspection"}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <Building2 size={14} className="shrink-0" />
              <span className="truncate">{loc?.name || "—"}</span>
            </div>
          </div>
          <StatusBadge visi={visi} size="md" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4 space-y-4">
        {/* Progress + details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Checklist Progress</div>
            <div className="flex items-center gap-4">
              <ProgressRing value={pct(done, total)} bucket={bucket} />
              <div>
                <div className="font-mono text-2xl font-bold text-slate-900">{done}<span className="text-slate-400">/{total}</span></div>
                <div className="text-xs text-slate-500">{meta.label}</div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct(done, total)}%`, background: bucket === "completed" ? "#10b981" : bucket === "in_progress" ? "#f59e0b" : "#94a3b8" }} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2 text-sm">
            <Detail icon={ClipboardCheck} label="Template" value={tpl?.name} />
            <Detail icon={Building2} label="Discipline" value={visi.discipline || tpl?.discipline} />
            <Detail icon={MapPin} label="Location" value={loc?.name} />
            <Detail icon={ClipboardCheck} label="Assignee" value={assignee?.name} color={assignee?.color} />
            <Detail icon={ClipboardCheck} label="Reviewer" value={reviewer?.name} color={reviewer?.color} />
            {visi.claimed && <Detail icon={CheckCircle2} label="Claimed" value={visi.claimed_in || "Yes"} />}
          </div>
        </div>

        {/* Checklist */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Checklist</div>
          <div className="space-y-2">
            {visi.steps?.map((s, i) => {
              const complete = s.status === "complete";
              return (
                <button key={i} onClick={() => canEdit && toggleStep(i)} disabled={saving || !canEdit}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"} ${saving ? "opacity-60" : ""} ${!canEdit ? "cursor-default" : ""}`}>
                  {complete ? <CheckCircle2 size={22} className="shrink-0 text-emerald-600" /> : <Circle size={22} className="shrink-0 text-slate-300" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${complete ? "text-emerald-800" : "text-slate-700"}`}>{s.label}</div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{s.type}</div>
                  </div>
                </button>
              );
            })}
            {(!visi.steps || visi.steps.length === 0) && <p className="text-sm text-slate-400 py-4 text-center">No checklist steps defined.</p>}
          </div>
        </div>

        {/* Status control */}
        {canEdit && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Status Override</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(OVERRIDE_META).map(([key, m]) => (
                <button key={key} onClick={() => setOverride(key === visi.override_status ? "none" : key)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${visi.override_status === key ? `${m.bg} ${m.text} ${m.border}` : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[80px]" placeholder="Add notes..." />
          {canEdit && (
            <button onClick={saveNotes} disabled={notesSaving} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {notesSaving ? "Saving..." : "Save Notes"}
            </button>
          )}
        </div>

        {/* Photos */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Photos ({attachments.length})</div>
            {canEdit && (
              <label className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-emerald-700">
                <Camera size={16} /> Add Photo
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              </label>
            )}
          </div>
          {attachments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
              <ImageIcon size={24} className="mx-auto mb-2 text-slate-300" />
              No photos yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={a.file_uri} alt={a.original_filename} className="aspect-square w-full object-cover cursor-pointer" onClick={() => setPhotoView(a)} />
                  {canEdit && (
                    <button onClick={() => setShowDeleteConfirm(a)} className="absolute top-1 right-1 rounded-full bg-red-500 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={12} />
                    </button>
                  )}
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

        {/* History */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <History size={14} /> History
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No activity recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {activities.slice(0, 20).map((a, i) => (
                <div key={i} className="flex items-start gap-2 border-l-2 border-slate-100 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-700">{a.text}</div>
                    <div className="text-[11px] text-slate-400">{new Date(a.created_at || a.created_date).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {a.user || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Photo viewer */}
      {photoView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPhotoView(null)}>
          <button className="absolute top-4 right-4 text-white p-2" onClick={() => setPhotoView(null)}><X size={24} /></button>
          <img src={photoView.file_uri} alt={photoView.original_filename} className="max-h-[90dvh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteConfirm(null)}>
          <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 className="font-bold text-slate-800">Delete this photo?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">This will soft-delete the photo. An admin can restore it from Recently Deleted.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => deletePhoto(showDeleteConfirm)} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-400 shrink-0" />
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-slate-700 truncate">
        {color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />}
        <span className="truncate">{value || "—"}</span>
      </span>
    </div>
  );
}

function ProgressRing({ value, bucket }) {
  const r = 26, c = 2 * Math.PI * r, offset = c - (value / 100) * c;
  const stroke = bucket === "completed" ? "#10b981" : bucket === "in_progress" ? "#f59e0b" : "#94a3b8";
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 34 34)" />
      <text x="34" y="38" textAnchor="middle" className="fill-slate-900 font-mono text-sm font-bold">{value}%</text>
    </svg>
  );
}