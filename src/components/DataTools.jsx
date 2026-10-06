import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from '@tanstack/react-query';
import { readAll } from '@/components/qa/paging';
import { Download, Eraser, Loader2, FileJson, FileSpreadsheet } from "lucide-react";

export default function DataTools() {
  const { project, reload } = useQaData();
  const { user } = useAuth();
  const [showClear, setShowClear] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [counts, setCounts] = useState({});
  const [exporting, setExporting] = useState(null);
  const [before, setBefore] = useState(null);
  const [progress, setProgress] = useState(0);
  const [resetError, setResetError] = useState('');
  const queryClient = useQueryClient();

  async function loadCounts() {
    const response = await base44.functions.invoke('resetImportedData', { action: 'counts' });
    setCounts(response.data.counts);
  }
  useEffect(() => { if (user?.role === 'admin') loadCounts(); }, [user?.role]);

  async function clearSample() {
    if (confirmText !== 'RESET' || clearing) return;
    setClearing(true); setResetError(''); setProgress(0);
    try {
      const initial = (await base44.functions.invoke('resetImportedData', { action: 'counts' })).data.counts;
      setBefore(initial);
      const total = Object.values(initial).reduce((s, n) => s + n, 0);
      for (let pass = 0; pass < 100; pass++) {
        const result = (await base44.functions.invoke('resetImportedData', { action: 'full', confirm: 'RESET' })).data;
        if (result.error) throw new Error(result.error);
        setCounts(result.after);
        const remaining = Object.values(result.after).reduce((s, n) => s + n, 0);
        setProgress(total ? Math.round(100 * (total - remaining) / total) : 100);
        if (result.done) break;
        if (pass === 99) setResetError('Some records remain. Press Retry.');
      }
      queryClient.clear();
      Object.keys(localStorage).filter(k => /cranmore|qa_|import/i.test(k) && k !== 'cranmore_selected_project').forEach(k => localStorage.removeItem(k));
      await reload(); window.dispatchEvent(new Event('qa-data-reset')); await loadCounts();
    } catch (error) { setResetError(error.message); }
    finally { setClearing(false); }
  }

  async function exportEntity(entityName, format) {
    setExporting(`${entityName}-${format}`);
    try {
      const records = await readAll(entityName, ['Company', 'Template'].includes(entityName) ? {} : { project_id: project.id });
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

      {/* Reset imported data */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-red-600 mb-2 flex items-center gap-2">
          <Eraser size={15} /> Reset imported data
        </h3>
        <p className="text-sm text-red-500 mb-3">Permanently deletes all imported records, including companies and templates. Keeps users, the project and files already in storage.</p>
        {before && <div className="text-xs mb-3">{Object.keys(counts).map(k => <div key={k}>{k}: before {before[k]} → after {counts[k]}</div>)}</div>}
        {clearing && <progress className="w-full" value={progress} max={100} />}
        {resetError && <p role="alert" className="text-destructive">{resetError}</p>}
        {!showClear ? (
          <button onClick={() => setShowClear(true)} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            Reset imported data
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
                {clearing ? 'Resetting...' : before && Object.values(counts).some(n => n > 0) ? 'Retry' : 'Reset imported data'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}