import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";
import { useQaData } from "@/lib/QaDataContext";
import { FileText, Loader2, Upload } from "lucide-react";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const key = (name, size) => `${norm(name)}|${Math.round(Number(size) || 0)}`;
const retry = async (fn, tries = 3) => { for (let i = 1; ; i++) { try { return await fn(); } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 1500 * i)); } } };

// Attaches the PDF to each drawing imported from the old app. Step 1 reuses PDFs already uploaded to the
// project; step 2 uploads the rest from the drawings folder (files named "<id>__<drawing name>.pdf").
export default function DrawingLinkTool() {
  const { project } = useQaData();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState(null); // { linked, missing, failed }
  const [error, setError] = useState("");

  async function unlinked() {
    const docs = await readAll("Document", { project_id: project.id });
    return docs.filter((d) => !d.is_deleted && !d.file_uri);
  }

  async function linkSaved() {
    setBusy(true); setError("");
    try {
      const todo = await unlinked();
      const saved = Object.fromEntries((project.saved_file_index || []).map((f) => [key(f.upload_filename, f.size), f]));
      let linked = 0, failed = 0;
      setProgress({ done: 0, total: todo.length });
      for (const [i, d] of todo.entries()) {
        const f = saved[key(d.filename, d.size)];
        if (f) {
          try { await retry(() => base44.entities.Document.update(d.id, { file_uri: f.file_uri, content_type: d.content_type || "application/pdf" })); linked++; }
          catch (e) { failed++; console.error("drawing link failed", d.filename, e); }
        }
        setProgress({ done: i + 1, total: todo.length });
      }
      setStatus({ linked, failed, missing: todo.length - linked - failed });
    } catch (e) { setError(e?.message || "Could not link the drawings."); }
    setBusy(false);
  }

  async function linkFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.pdf$/i.test(f.name));
    if (!files.length) return;
    setBusy(true); setError("");
    try {
      const todo = await unlinked();
      const byUpload = Object.fromEntries(todo.filter((d) => d.upload_filename).map((d) => [d.upload_filename, d]));
      const byKey = Object.fromEntries(todo.map((d) => [key(d.filename, d.size), d]));
      const jobs = files.map((f) => [f, byUpload[f.name] || byKey[key(f.name.replace(/^[0-9a-f]{8}__/i, ""), f.size)]]).filter(([, d]) => d);
      const seen = new Set(), queue = jobs.filter(([, d]) => !seen.has(d.id) && seen.add(d.id));
      let linked = 0, failed = 0, done = 0;
      setProgress({ done: 0, total: queue.length });
      const worker = async () => {
        while (queue.length) {
          const [file, d] = queue.shift();
          try {
            const { file_uri } = await retry(() => base44.integrations.Core.UploadPrivateFile({ file }));
            await retry(() => base44.entities.Document.update(d.id, { file_uri, content_type: "application/pdf" }));
            linked++;
          } catch (e) { failed++; console.error("drawing upload failed", file.name, e); }
          done++; setProgress({ done, total: seen.size });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setStatus({ linked, failed, missing: todo.length - linked });
    } catch (e) { setError(e?.message || "Could not upload the drawings."); }
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><FileText size={18} className="text-emerald-600" /> Link drawing files</div>
      <p className="mt-1 text-sm text-slate-500">Attaches each imported drawing to its PDF. Step 1 uses PDFs already uploaded to this project. Step 2: choose all PDFs in the cranmore-drawings folder for the rest. Safe to run again: drawings that already have a file are skipped.</p>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { linkFiles(e.target.files); e.target.value = ""; }} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={linkSaved} disabled={busy || !project?.id} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} 1. Use uploaded PDFs
        </button>
        <button onClick={() => inputRef.current?.click()} disabled={busy || !project?.id} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          <Upload size={15} /> 2. Choose drawing PDFs
        </button>
      </div>
      {busy && progress.total > 0 && <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {status && <p className="mt-3 text-sm text-slate-700">Linked <b>{status.linked}</b> · failed <b>{status.failed}</b> · drawings still without a file <b>{status.missing}</b></p>}
    </div>
  );
}
