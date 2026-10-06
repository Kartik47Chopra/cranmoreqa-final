import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { statusBucket, checklistProgress, pct, statusBadge, OVERRIDE_META, daysOpen } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { logActivity } from "@/lib/activityLog";
import {
  CheckCircle2, Circle, ArrowLeft, Camera, Trash2, ClipboardCheck,
  AlertTriangle, History, X, Loader2, Send, FileText, ExternalLink,
  Ban, Zap, Upload, Milestone as MilestoneIcon,
} from "lucide-react";

export default function InspectionDetail() {
  const { visiId } = useParams();
  const navigate = useNavigate();
  const { locationMap, templateMap, companyMap, locations, project } = useQaData();
  const { user } = useAuth();
  const [visi, setVisi] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photoView, setPhotoView] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [comment, setComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [showNotOnSite, setShowNotOnSite] = useState(false);
  const [notOnSiteNote, setNotOnSiteNote] = useState("");
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!visiId) return;
    setLoading(true);
    Promise.all([
      base44.entities.Visi.get(visiId),
      base44.entities.Attachment.filter({ visi_id: visiId }),
      base44.entities.Activity.filter({ visi_id: visiId }),
    ]).then(async ([v, atts, acts]) => {
      setVisi(v);
      setAttachments(Array.isArray(atts) ? atts.filter((a) => !a.is_deleted) : []);
      setActivities(Array.isArray(acts) ? acts.sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date)) : []);
      // Load linked documents
      if (v.document_ids?.length > 0) {
        try {
          const docs = await base44.entities.Document.filter({ project_id: v.project_id });
          setDocuments((Array.isArray(docs) ? docs : []).filter((d) => v.document_ids.includes(d.original_id) && !d.is_deleted));
        } catch { setDocuments([]); }
      }
    }).catch((e) => setError(e.message || "Failed to load Visi"))
      .finally(() => setLoading(false));
  }, [visiId]);

  async function toggleStep(idx) {
    if (saving) return;
    setSaving(true);
    const steps = visi.steps.map((s, i) => {
      if (i !== idx) return s;
      const complete = s.status !== "complete";
      return { ...s, status: complete ? "complete" : "pending", completed_at: complete ? new Date().toISOString() : null, completed_by: complete ? user?.id : null };
    });
    const allDone = steps.every((s) => s.status === "complete");
    const updated = { steps, last_updated: new Date().toISOString(), closed_at: allDone && !visi.closed_at ? new Date().toISOString() : visi.closed_at };
    try {
      const fresh = await base44.entities.Visi.update(visi.id, updated);
      setVisi(fresh);
      const step = visi.steps[idx];
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Step "${step.label}" marked ${steps[idx].status === "complete" ? "complete" : "pending"}`, type: "step" });
      refreshActivity();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function forceComplete(idx) {
    if (saving) return;
    setSaving(true);
    const steps = visi.steps.map((s, i) => i === idx ? { ...s, status: "complete", completed_at: new Date().toISOString(), completed_by: user?.id } : s);
    try {
      const fresh = await base44.entities.Visi.update(visi.id, { steps, last_updated: new Date().toISOString() });
      setVisi(fresh);
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Force completed step "${visi.steps[idx].label}"`, type: "step" });
      refreshActivity();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function setOverride(override_status) {
    if (saving) return;
    setSaving(true);
    try {
      const fresh = await base44.entities.Visi.update(visi.id, { override_status, last_updated: new Date().toISOString() });
      setVisi(fresh);
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Status override set to ${override_status}`, type: "status" });
      refreshActivity();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function markNotOnSite() {
    if (!notOnSiteNote.trim() || saving) return;
    setSaving(true);
    try {
      const fresh = await base44.entities.Visi.update(visi.id, { override_status: "na", override_comment: notOnSiteNote, last_updated: new Date().toISOString() });
      setVisi(fresh);
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Marked Not on site: ${notOnSiteNote}`, type: "status" });
      setShowNotOnSite(false); setNotOnSiteNote("");
      refreshActivity();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function sendComment() {
    if (!comment.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const act = await base44.entities.Activity.create({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: comment.trim(), type: "comment", created_at: new Date().toISOString() });
      setActivities((prev) => [act, ...prev]);
      setComment("");
    } catch (e) { console.error(e); }
    setCommentSaving(false);
  }

  async function refreshActivity() {
    try {
      const acts = await base44.entities.Activity.filter({ visi_id: visi.id });
      setActivities(Array.isArray(acts) ? acts.sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date)) : []);
    } catch { }
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || saving) return;
    setSaving(true);
    for (const file of files) {
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const att = await base44.entities.Attachment.create({
          visi_id: visi.id, location_id: visi.location_id, file_uri,
          original_filename: file.name, content_type: file.type, size: file.size,
          uploaded_by: user?.id, uploaded_by_company: user?.data?.company_id,
          uploaded_at: new Date().toISOString(),
        });
        setAttachments((prev) => [...prev, att]);
        logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Photo uploaded: ${file.name}`, type: "photo" });
        refreshActivity();
      } catch (e) { console.error("upload failed", e); }
    }
    setSaving(false);
  }

  async function deletePhoto(att) {
    try {
      await base44.entities.Attachment.update(att.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      logActivity({ project_id: visi.project_id, visi_id: visi.id, user: user?.full_name || user?.email, text: `Photo deleted: ${att.original_filename}`, type: "delete" });
      refreshActivity();
    } catch (e) { console.error(e); }
    setShowDeleteConfirm(null);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-red-600">{error}</p>
      <button onClick={() => navigate(-1)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Go back</button>
    </div>
  );
  if (!visi) return <EmptyState title="Visi not found" />;

  const loc = locationMap[visi.location_id];
  const tpl = templateMap[visi.template_id];
  const assignee = companyMap[visi.assignee_company_id];
  const reviewer = companyMap[visi.reviewer_company_id];
  const visibleCompanies = (visi.visible_to || []).map((id) => companyMap[id]).filter(Boolean);
  const { done, total } = checklistProgress(visi);
  const bucket = statusBucket(visi);
  const meta = statusBadge(visi);
  const canEdit = user?.role === "admin" || user?.role === "pm" || user?.role === "trade";
  const canManage = user?.role === "admin" || user?.role === "pm";
  const tradeName = visi.trade || tpl?.name || visi.template_name || "Visi";

  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
            <ArrowLeft size={20} />
          </button>
          <StatusBadge visi={visi} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="font-mono text-lg font-bold text-slate-900 truncate">{visi.code || "—"}</h1>
            <div className="text-sm text-slate-500 truncate">{tradeName} · Inspection</div>
          </div>
          {canManage && (
            <button onClick={() => setShowNotOnSite(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <Ban size={15} /> Not on site
            </button>
          )}
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-4 p-4">
          {/* Left: Checklist navigator */}
          <div className="hidden lg:block">
            <div className="sticky top-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Checklist</div>
              <div className="space-y-1">
                {visi.steps?.map((s, i) => {
                  const complete = s.status === "complete";
                  return (
                    <button key={i} onClick={() => setActiveStep(i)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${activeStep === i ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct(done, total)}%`, background: bucket === "completed" ? "#10b981" : bucket === "in_progress" ? "#f59e0b" : "#94a3b8" }} />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700">{done}/{total}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Centre: Main content */}
          <div className="space-y-4 min-w-0">
            {/* Attachments */}
            <Section title="Attachments" count={attachments.length} icon={Camera}>
              <div className="flex items-center gap-2 mb-3">
                {canEdit && (
                  <>
                    <label className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-emerald-700">
                      <Camera size={15} /> Camera
                      <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} disabled={saving} />
                    </label>
                    <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
                      <Upload size={15} /> Add
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={saving} />
                    </label>
                  </>
                )}
              </div>
              {attachments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">No photos yet.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                      <img src={a.file_uri} alt={a.original_filename} className="aspect-square w-full object-cover cursor-pointer" onClick={() => setPhotoView(a)} />
                      {canManage && (
                        <button onClick={() => setShowDeleteConfirm(a)} className="absolute top-1 right-1 rounded-full bg-red-500 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Checklist */}
            <Section title={`Checklist ${done}/${total}`} icon={ClipboardCheck}>
              <div className="space-y-2">
                {visi.steps?.map((s, i) => {
                  const complete = s.status === "complete";
                  const isTask = s.type === "task";
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => canEdit && toggleStep(i)} disabled={saving || !canEdit}
                          className="shrink-0">
                          {complete ? <CheckCircle2 size={22} className="text-emerald-600" /> : <Circle size={22} className="text-slate-300" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium ${complete ? "text-emerald-800" : "text-slate-700"}`}>{s.label}</div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">{s.type}</div>
                        </div>
                        {isTask && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Task</span>}
                        <label className="cursor-pointer p-1.5 rounded text-slate-400 hover:bg-slate-100">
                          <Camera size={16} />
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={saving} />
                        </label>
                      </div>
                      {isTask && (
                        <div className="mt-2 flex items-center gap-2 pl-9">
                          <button disabled className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed">
                            <Upload size={13} /> Evidence
                          </button>
                          <button disabled className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed">
                            Complete requirements
                          </button>
                          {canManage && (
                            <button onClick={() => forceComplete(i)} disabled={saving}
                              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                              <Zap size={13} /> Force complete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!visi.steps || visi.steps.length === 0) && <p className="text-sm text-slate-400 py-4 text-center">No checklist steps defined.</p>}
              </div>
            </Section>

            {/* Drawings & Documents */}
            <Section title="Drawings & Documents" count={documents.length} icon={FileText}>
              {documents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">No drawings linked to this Visi.</div>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <FileText size={18} className="text-red-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{d.title || d.filename}</div>
                        <div className="text-xs text-slate-500">{d.drawing_no} · {d.category} · {d.floor}</div>
                      </div>
                      {d.revision && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Rev {d.revision}</span>}
                      {d.file_uri && !d.file_uri.startsWith("pending") ? (
                        <a href={d.file_uri} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          View <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">File not added yet</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Milestones */}
            <Section title="Milestones" icon={MilestoneIcon}>
              <div className="text-sm text-slate-400">Not linked to any milestone. {canManage && <button className="text-emerald-600 font-semibold hover:underline">Add</button>}</div>
            </Section>

            {/* Activity */}
            <Section title="Activity" icon={History}>
              <div className="flex items-center gap-2 mb-3">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..."
                  className="flex-1 rounded-lg border border-slate-200 p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[40px]" rows={1} />
                <button onClick={sendComment} disabled={!comment.trim() || commentSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {commentSaving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
                </button>
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No activity recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 30).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 border-l-2 border-slate-100 pl-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-700">{a.text}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(a.created_at || a.created_date).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {a.user || "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Right: Metadata sidebar */}
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5 text-sm">
              <MetaRow label="Visi Type" value={visi.visi_type || "Inspection"} />
              <MetaRow label="Status" value={<StatusBadge visi={visi} />} />
              <MetaRow label="Template" value={tpl ? `${tpl.name} · Rev ${tpl.revision || 1}` : visi.template_name} />
              <MetaRow label="Assignee" value={assignee?.name} color={assignee?.color} />
              <MetaRow label="Reviewer" value={reviewer?.name} color={reviewer?.color} />
              <MetaRow label="Visible To" value={visibleCompanies.map((c) => c.name).join(", ") || "—"} />
              <MetaRow label="Created" value={visi.created_at ? `${fmtDate(visi.created_at)}` : "—"} />
              <MetaRow label="System" value={visi.system} />
              <MetaRow label="Stage" value={visi.stage || tpl?.stage} />
              <MetaRow label="Discipline" value={visi.discipline || tpl?.discipline} />
              <MetaRow label="Days Open" value={daysOpen(visi)} />
            </div>
            {canEdit && visi.override_status !== "none" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
                  <AlertTriangle size={13} /> Override: {OVERRIDE_META[visi.override_status]?.label || visi.override_status}
                </div>
                {visi.override_comment && <div className="mt-1 text-sm text-amber-800">{visi.override_comment}</div>}
                {canManage && (
                  <button onClick={() => setOverride("none")} disabled={saving}
                    className="mt-2 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Clear override</button>
                )}
              </div>
            )}
          </div>
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
            <p className="text-sm text-slate-500 mb-4">This will soft-delete the photo. An admin can restore it.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => deletePhoto(showDeleteConfirm)} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Not on site modal */}
      {showNotOnSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNotOnSite(false)}>
          <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Ban size={20} className="text-slate-500" />
              <h3 className="font-bold text-slate-800">Mark as Not on site</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">This sets the N/A override. A note is required. Admin can reverse it.</p>
            <textarea value={notOnSiteNote} onChange={(e) => setNotOnSiteNote(e.target.value)} placeholder="e.g. No robe jamb in this apartment"
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm mb-4 min-h-[80px]" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNotOnSite(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={markNotOnSite} disabled={!notOnSiteNote.trim() || saving}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving..." : "Mark Not on site"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, icon: Icon, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {Icon && <Icon size={14} />}
        {title}
        {count != null && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function MetaRow({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500 shrink-0">{label}</span>
      <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-slate-700 truncate">
        {color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />}
        <span className="truncate">{value || "—"}</span>
      </span>
    </div>
  );
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}