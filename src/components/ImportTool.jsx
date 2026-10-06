import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/activityLog";
import { Loader2, Upload, CheckCircle2, AlertTriangle, FileUp, Undo2, X } from "lucide-react";

const FORMATS = [
  { key: "companies", label: "1. Companies", file: "cranmore-import-1-companies.csv", entity: "Company" },
  { key: "locations", label: "2. Locations", file: "cranmore-import-2-locations.csv", entity: "Location" },
  { key: "templates", label: "3. Templates", file: "cranmore-import-3-templates.csv", entity: "Template" },
  { key: "visis", label: "4. Visis (Inspections)", file: "cranmore-import-4-inspections.csv", entity: "Visi" },
  { key: "activity", label: "5. Activity", file: "cranmore-import-7-activity.csv", entity: "Activity" },
  { key: "drawings", label: "6. Drawings", file: "cranmore-import-6-drawings.csv", entity: "Document" },
  { key: "photos", label: "7. Photo Records", file: "cranmore-import-5-photo-records.csv", entity: "Attachment" },
];

// Robust CSV parser handling quoted fields
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v.trim())).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  });
}

function parseJSON(text) {
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

function bool(v) { return String(v || "").toLowerCase() === "true"; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

export default function ImportTool() {
  const { project, reload, companies, templates, locations } = useQaData();
  const { user } = useAuth();
  const [format, setFormat] = useState("companies");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const fileRef = useRef(null);

  const fmt = FORMATS.find((f) => f.key === format);

  async function loadBatches() {
    // Show recent import batches (from Activity log)
    try {
      const acts = await base44.entities.Activity.filter({ project_id: project?.id, type: "bulk_create" });
      setBatches((Array.isArray(acts) ? acts : []).slice(0, 10));
    } catch (e) { console.error(e); }
  }

  React.useEffect(() => { if (project?.id) loadBatches(); }, [project?.id]);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(null); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let rows = [];
        if (f.name.endsWith(".json")) rows = parseJSON(reader.result);
        else rows = parseCSV(reader.result);
        setPreview({ total: rows.length, sample: rows.slice(0, 5), rows, fileName: f.name });
      } catch (e) { setPreview({ error: e.message }); }
    };
    reader.readAsText(f);
  }

  // Build lookup maps for linking
  function buildLookups() {
    const companyByName = {}, companyByOrig = {};
    (companies || []).forEach((c) => {
      if (c.name) companyByName[c.name.toLowerCase()] = c;
      if (c.original_id) companyByOrig[c.original_id] = c;
    });
    const locByOrig = {}, locByPath = {};
    (locations || []).forEach((l) => {
      if (l.original_id) locByOrig[l.original_id] = l;
    });
    const tplByName = {}, tplByOrig = {};
    (templates || []).forEach((t) => {
      if (t.name) tplByName[t.name.toLowerCase()] = t;
      if (t.original_id) tplByOrig[t.original_id] = t;
    });
    return { companyByName, companyByOrig, locByOrig, locByPath, tplByName, tplByOrig };
  }

  function mapCompany(r, batchId) {
    return {
      name: r.name, color: r.color || "#64748b",
      is_owner: bool(r.is_owner),
      original_id: r.original_id, import_batch_id: batchId,
    };
  }

  function mapLocation(r, batchId, existingByOrig) {
    return {
      project_id: project.id,
      parent_id: r.parent_original_id ? (existingByOrig[r.parent_original_id]?.id || undefined) : undefined,
      name: r.name, type: r.type || "Room",
      order: num(r.order),
      status: r.status === "na" ? "na" : "active",
      room_no: r.room_no || undefined, apt_number: r.apt_number || undefined,
      apt_type: r.apt_type || undefined, bed_count: num(r.bed_count) || undefined,
      finish: r.finish || undefined, mirrored: bool(r.mirrored) || undefined,
      original_id: r.original_id, import_batch_id: batchId,
      is_deleted: false,
    };
  }

  function mapTemplate(r, batchId, lookups) {
    const stepsRaw = (r.steps || "").split(" | ").filter(Boolean);
    const steps = stepsRaw.map((s, i) => {
      const m = s.match(/^(.*?)\s*\[(\w+)\]$/);
      const label = (m ? m[1] : s).trim();
      const type = m && m[2] === "task" ? "task" : "inspection";
      const step = { id: `s${i}`, label, type };
      if (type === "task") step.requirements = [{ id: `r${i}`, label: label + " evidence" }];
      return step;
    });
    const assignee = lookups.companyByName[(r.assignee_company || "").toLowerCase()];
    return {
      name: r.name, trade: r.trade || r.name, discipline: r.discipline,
      stage: r.stage, system: r.system,
      assignee_company: r.assignee_company,
      revision: 1, steps,
      original_id: undefined, import_batch_id: batchId,
    };
  }

  function mapVisi(r, batchId, lookups, locByOrig) {
    const assignee = lookups.companyByName[(r.assignee_company || "").toLowerCase()];
    const reviewer = lookups.companyByName[(r.reviewer_company || "").toLowerCase()];
    const loc = locByOrig[r.location_original_id];
    const tpl = lookups.tplByName[(r.template_name_original || "").toLowerCase()];
    let steps = [];
    try { steps = JSON.parse(r.steps_json || "[]"); } catch { steps = []; }
    const visibleTo = (r.visible_to_companies || "").split(" | ").filter(Boolean)
      .map((n) => lookups.companyByName[n.toLowerCase()]?.id).filter(Boolean);
    const docIds = (r.document_original_ids || "").split(" | ").filter(Boolean);
    return {
      project_id: project.id,
      code: r.code, visi_type: "Inspection",
      template_id: tpl?.id, template_name: r.template_name_original,
      template_revision: tpl?.revision || 1,
      location_id: loc?.id, trade: r.trade,
      assignee_company_id: assignee?.id, reviewer_company_id: reviewer?.id,
      visible_to: visibleTo, steps,
      override_status: r.override_status || "none",
      fixture_label: r.fixture_label, discipline: r.discipline,
      system: r.system, stage: undefined,
      document_ids: docIds,
      created_at: r.created_at, last_updated: r.last_updated,
      closed_at: r.closed_at || undefined,
      is_deleted: bool(r.is_deleted),
      deleted_at: r.deleted_at || undefined, deleted_by: r.deleted_by || undefined,
      original_id: r.original_id, import_batch_id: batchId,
    };
  }

  function mapActivity(r, batchId) {
    if (bool(r.is_duplicate)) return null;
    return {
      project_id: project.id, inspection_code: r.inspection_code,
      user: r.user, text: r.text, type: r.type || "comment",
      created_at: r.created_at,
      original_id: r.original_id, import_batch_id: batchId,
    };
  }

  function mapDrawing(r, batchId, locByOrig) {
    const loc = locByOrig[r.location_original_id];
    return {
      project_id: project.id, location_id: loc?.id,
      discipline: r.discipline, building: r.building, category: r.category,
      floor: r.floor, drawing_no: r.drawing_no, revision: r.revision,
      title: r.title, filename: r.filename, upload_filename: r.upload_filename,
      size: num(r.size_bytes), uploaded_at: r.uploaded_at,
      original_id: r.original_id, import_batch_id: batchId,
      is_deleted: false,
    };
  }

  function mapPhoto(r, batchId) {
    return {
      visi_id: undefined, // will be linked later by inspection_code
      location_id: undefined, step_label: r.step_label || undefined,
      original_filename: r.original_filename, size: num(r.size_bytes),
      uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at,
      storage_path: r.storage_path,
      original_id: r.original_id, import_batch_id: batchId,
      file_uri: `pending:${r.original_id}`,
      is_deleted: bool(r.is_deleted),
    };
  }

  async function confirmImport() {
    if (!preview?.rows || !project?.id) return;
    setImporting(true); setProgress(0);
    const batchId = `imp_${Date.now()}`;
    const lookups = buildLookups();
    const rows = preview.rows;
    const errors = [];
    let created = 0, skipped = 0;
    const entityName = fmt.entity;

    // Get existing original_ids for dedup
    let existingByOrig = {};
    try {
      const existing = await base44.entities[entityName].filter({ import_batch_id: { $exists: true } });
      (Array.isArray(existing) ? existing : []).forEach((r) => {
        if (r.original_id) existingByOrig[r.original_id] = r;
        if (r.code) existingByOrig[`code:${r.code}`] = r;
      });
    } catch { /* ignore */ }

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const records = [];
      for (const r of chunk) {
        const origId = r.original_id || r.code;
        const dedupKey = r.code ? `code:${r.code}` : origId;
        if (origId && existingByOrig[dedupKey]) { skipped++; continue; }
        try {
          let rec;
          if (format === "companies") rec = mapCompany(r, batchId);
          else if (format === "locations") rec = mapLocation(r, batchId, existingByOrig);
          else if (format === "templates") rec = mapTemplate(r, batchId, lookups);
          else if (format === "visis") rec = mapVisi(r, batchId, lookups, lookups.locByOrig);
          else if (format === "activity") { rec = mapActivity(r, batchId); if (!rec) { skipped++; continue; } }
          else if (format === "drawings") rec = mapDrawing(r, batchId, lookups.locByOrig);
          else if (format === "photos") rec = mapPhoto(r, batchId);
          if (rec) records.push(rec);
        } catch (e) { errors.push({ row: i, error: e.message, data: r }); }
      }
      if (records.length > 0) {
        try {
          await base44.entities[entityName].bulkCreate(records);
          created += records.length;
          records.forEach((r) => { if (r.original_id) existingByOrig[r.original_id] = r; if (r.code) existingByOrig[`code:${r.code}`] = r; });
        } catch (e) { errors.push({ chunk: i, error: e.message }); }
      }
      setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
    }

    // For photos, link to Visis by inspection_code
    if (format === "photos") {
      try {
        const photos = await base44.entities.Attachment.filter({ import_batch_id: batchId });
        const visis = await base44.entities.Visi.filter({ project_id: project.id });
        const visiByCode = {};
        (Array.isArray(visis) ? visis : []).forEach((v) => { if (v.code) visiByCode[v.code] = v; });
        const toLink = (Array.isArray(photos) ? photos : []).filter((p) => p.file_uri?.startsWith("pending:"));
        for (let i = 0; i < toLink.length; i += 100) {
          const batch = toLink.slice(i, i + 100);
          await base44.entities.Attachment.bulkUpdate(batch.map((p) => {
            const origRow = rows.find((r) => r.original_id === p.original_id);
            const v = origRow ? visiByCode[origRow.inspection_code] : null;
            return { id: p.id, visi_id: v?.id, location_id: v?.location_id };
          }));
        }
      } catch (e) { console.error("photo link failed", e); }
    }

    setResult({ created, skipped, errors: errors.length, batchId });
    logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Imported ${created} ${entityName} (batch ${batchId})`, type: "bulk_create" });
    setImporting(false);
    reload();
    loadBatches();
  }

  async function undoBatch(batchId) {
    if (!confirm(`Undo import batch ${batchId}? This will soft-delete all records from that batch.`)) return;
    try {
      const entities = ["Visi", "Location", "Company", "Template", "Document", "Attachment", "Activity"];
      for (const ent of entities) {
        try {
          const records = await base44.entities[ent].filter({ import_batch_id: batchId });
          if (Array.isArray(records) && records.length > 0) {
            if (ent === "Activity") {
              await base44.entities[ent].deleteMany({ import_batch_id: batchId });
            } else {
              await base44.entities[ent].updateMany({ import_batch_id: batchId }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
            }
          }
        } catch (e) { console.error(e); }
      }
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Undid import batch ${batchId}`, type: "delete" });
      reload(); loadBatches();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Format selector */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Import Data</h3>
        <p className="text-sm text-slate-500 mb-3">Upload each CSV in order (1-7). Preview before saving. Duplicates (by original_id or code) are skipped, never overwritten. Each batch is tagged for undo.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {FORMATS.map((f) => (
            <button key={f.key} onClick={() => { setFormat(f.key); setPreview(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-colors ${format === f.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 mb-2">Expected file: <span className="font-mono">{fmt.file}</span></div>
        <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFile} className="w-full text-sm" />
      </div>

      {/* Preview */}
      {preview && !preview.error && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Preview</h3>
            <span className="text-sm font-semibold text-slate-700">{preview.total} rows</span>
          </div>
          {preview.sample?.length > 0 && (
            <div className="overflow-x-auto rounded border border-slate-100 max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>{Object.keys(preview.sample[0]).slice(0, 6).map((k) => <th key={k} className="px-2 py-1 text-left whitespace-nowrap">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {Object.keys(r).slice(0, 6).map((k) => <td key={k} className="px-2 py-1 truncate max-w-[120px]">{String(r[k] || "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {importing ? (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500 text-center">{progress}% — importing...</div>
            </div>
          ) : (
            <button onClick={confirmImport} disabled={preview.total === 0}
              className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              Confirm Import ({preview.total} rows)
            </button>
          )}
        </div>
      )}

      {preview?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">Parse error: {preview.error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-emerald-700">Import Complete</h3>
          </div>
          <p className="text-sm text-emerald-600 mb-2">{result.created} created · {result.skipped} skipped · {result.errors} errors</p>
          <button onClick={() => undoBatch(result.batchId)} className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            <Undo2 size={14} /> Undo this import
          </button>
        </div>
      )}

      {/* Recent batches */}
      {batches.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">Recent Imports</h3>
          <div className="space-y-1">
            {batches.map((b) => {
              const batchId = (b.text || "").match(/batch (imp_\w+)/)?.[1];
              return (
                <div key={b.id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate text-slate-600">{b.text}</span>
                  <span className="text-slate-400">{new Date(b.created_at || b.created_date).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  {batchId && <button onClick={() => undoBatch(batchId)} className="text-amber-600 hover:underline">Undo</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}