import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/activityLog";
import { Download, Eraser, Loader2, FileJson, FileSpreadsheet } from "lucide-react";

export default function DataTools() {
  const { project, reload } = useQaData();
  const { user } = useAuth();
  const [showClear, setShowClear] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [counts, setCounts] = useState({});
  const [exporting, setExporting] = useState(null);

  async function loadCounts() {
    const ents = ["Visi", "Location", "Document", "Attachment", "Task", "Activity"];
    const c = {};
    for (const e of ents) {
      try { const r = await base44.entities[e].filter({ project_id: project?.id }); c[e] = (Array.isArray(r) ? r : []).length; } catch { c[e] = 0; }
    }
    setCounts(c);
  }
  useEffect(() => { if (project?.id) loadCounts(); }, [project?.id]);

  async function clearSample() {
    if (confirmText !== "RESET") return;
    setClearing(true);
    try {
      // Soft-delete all Visis, Locations, Documents, Attachments, Tasks, Activity
      // Keep users, templates, and the project record
      await base44.entities.Visi.updateMany({ project_id: project.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
      await base44.entities.Location.updateMany({ project_id: project.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
      await base44.entities.Document.updateMany({ project_id: project.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
      await base44.entities.Attachment.updateMany({ project_id: project.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
      await base44.entities.Task.updateMany({ project_id: project.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
      await base44.entities.Activity.deleteMany({ project_id: project.id });
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: "Cleared all sample data", type: "delete" });
      setShowClear(false); setConfirmText("");
      loadCounts(); reload();
    } catch (e) { console.error(e); }
    setClearing(false);
  }

  async function exportEntity(entityName, format) {
    setExporting(`${entityName}-${format}`);
    try {
      const records = await base44.entities[entityName].filter({ project_id: project.id });
      const data = Array.isArray(records) ? records : [];
      if (format === "json") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${entityName}.json`);
      } else {
        const headers = Object.keys(data[0] || {}).filter((k) => !k.file_uri);
        const csv = [headers.join(","), ...data.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv" }), `${entityName}.csv`);
      }
    } catch (e) { console.error(e); }
    setExporting(null);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  const entities = ["Visi", "Location", "Company", "Template", "Document", "Attachment", "Task", "Activity", "Milestone"];

  return (
    <div className="max-w-2xl space-y-4">
      {/* Data Export */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
          <Download size={15} /> Data Export (read-only)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {entities.map((e) => (
            <div key={e} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700 flex-1">{e}</span>
              <span className="text-xs text-slate-400">{counts[e] || 0}</span>
              <button onClick={() => exportEntity(e, "json")} disabled={exporting === `${e}-json`}
                className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Export JSON">
                {exporting === `${e}-json` ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
              </button>
              <button onClick={() => exportEntity(e, "csv")} disabled={exporting === `${e}-csv`}
                className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Export CSV">
                {exporting === `${e}-csv` ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Clear Sample Data */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-red-600 mb-2 flex items-center gap-2">
          <Eraser size={15} /> Clear Sample Data
        </h3>
        <p className="text-sm text-red-500 mb-3">Removes all Visis, locations, tasks, documents, photos and activity but KEEPS users, templates and the project record. This cannot be undone.</p>
        {!showClear ? (
          <button onClick={() => setShowClear(true)} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            Clear Sample Data
          </button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-white border border-red-200 p-3 text-xs text-slate-600">
              <div className="font-semibold mb-1">Current counts:</div>
              {Object.entries(counts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
            </div>
            <div>
              <label className="text-xs font-semibold text-red-600">Type RESET to confirm:</label>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full rounded-lg border border-red-200 p-2 text-sm mt-1" placeholder="RESET" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowClear(false); setConfirmText(""); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={clearSample} disabled={confirmText !== "RESET" || clearing} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {clearing ? "Clearing..." : "Clear All Data"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}