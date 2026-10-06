import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { logActivity } from "@/lib/activityLog";
import { readAll } from "@/components/qa/paging";
import { CheckCircle2, Undo2 } from "lucide-react";

const FORMATS = [
  { key: "companies", label: "1. Companies", file: "cranmore-import-1-companies.csv", entity: "Company" },
  { key: "locations", label: "2. Locations", file: "cranmore-import-2-locations.csv", entity: "Location" },
  { key: "templates", label: "3. Templates", file: "cranmore-import-3-templates.csv", entity: "Template" },
  { key: "visis", label: "4. Visis (Inspections)", file: "cranmore-import-4-inspections.csv", entity: "Visi" },
  { key: "activity", label: "5. Activity", file: "cranmore-import-7-activity.csv", entity: "Activity" },
  { key: "drawings", label: "6. Drawings", file: "cranmore-import-6-drawings.csv", entity: "Document" },
  { key: "photos", label: "7. Photo Records", file: "cranmore-import-5-photo-records.csv", entity: "Attachment" },
];

// Robust CSV parser: strips BOM, handles quoted fields with commas/quotes/newlines.
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM
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

function bool(v) { return String(v || "").toLowerCase() === "true"; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function splitList(v) { return (v || "").split(" | ").map((s) => s.trim()).filter(Boolean); }

export default function ImportTool() {
  const { project, reload, companies, templates, locations } = useQaData();
  const { user } = useAuth();
  const [format, setFormat] = useState("companies");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [existingIds, setExistingIds] = useState({});
  const fileRef = useRef(null);
  const fmt = FORMATS.find((f) => f.key === format);

  async function loadExisting() {
    const ids = {};
    for (const f of FORMATS) {
      try {
        const rows = await readAll(f.entity, f.entity === "Company" || f.entity === "Template" ? {} : { project_id: project?.id });
        ids[f.key] = new Set(rows.map((r) => r.original_id).filter(Boolean));
      } catch { ids[f.key] = new Set(); }
    }
    setExistingIds(ids);
  }
  useEffect(() => { if (project?.id) loadExisting(); }, [project?.id]);

  async function loadBatches() {
    try {
      const acts = await base44.entities.Activity.filter({ project_id: project?.id, type: "bulk_create" });
      setBatches((Array.isArray(acts) ? acts : []).slice(0, 10));
    } catch (e) { console.error(e); }
  }
  useEffect(() => { if (project?.id) loadBatches(); }, [project?.id]);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(null); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(reader.result);
        const existing = existingIds[format] || new Set();
        const duplicates = rows.filter((r) => r.original_id && existing.has(r.original_id)).length;
        setPreview({ total: rows.length, duplicates, sample: rows.slice(0, 5), rows, fileName: f.name });
      } catch (err) { setPreview({ error: err.message }); }
    };
    reader.readAsText(f);
  }

  // Build lookup maps from ALL existing records (paged).
  async function buildLookups() {
    const [comps, locs, tpls] = await Promise.all([
      readAll("Company"), readAll("Location", { project_id: project.id }), readAll("Template"),
    ]);
    const companyByName = {};
    comps.forEach((c) => { if (c.name) companyByName[c.name.toLowerCase()] = c; });
    const locByOrig = {};
    locs.forEach((l) => { if (l.original_id) locByOrig[l.original_id] = l; });
    const tplByName = {};
    tpls.forEach((t) => { if (t.name) tplByName[t.name.toLowerCase()] = t; });
    return { companyByName, locByOrig, tplByName };
  }

  function mapCompany(r, batchId) {
    return { name: r.name, color: r.color || "#64748b", is_owner: bool(r.is_owner), original_id: r.original_id, import_batch_id: batchId };
  }
  function mapLocation(r, batchId) {
    return {
      project_id: project.id, parent_original_id: r.parent_original_id || undefined,
      name: r.name, type: r.type || "Room", order: num(r.order),
      status: r.status === "na" ? "na" : "active",
      room_no: r.room_no || undefined, apt_number: r.apt_number || undefined,
      apt_type: r.apt_type || undefined, bed_count: num(r.bed_count) || undefined,
      finish: r.finish || undefined, mirrored: bool(r.mirrored) || undefined,
      full_path: r.full_path || undefined, depth: num(r.depth) || undefined,
      original_id: r.original_id, import_batch_id: batchId, is_deleted: false,
    };
  }
  function mapTemplate(r, batchId, lookups) {
    const stepsRaw = splitList(r.steps);
    const steps = stepsRaw.map((s, i) => {
      const m = s.match(/^(.*?)\s*\[(\w+)\]$/);
      const label = (m ? m[1] : s).trim();
      const type = m && m[2] === "task" ? "task" : "inspection";
      const step = { id: `s${i}`, label, type };
      if (type === "task") step.requirements = [{ id: `r${i}`, label: label + " evidence" }];
      return step;
    });
    return {
      name: r.name, trade: r.trade || r.name, discipline: r.discipline,
      stage: r.stage, system: r.system, assignee_company: r.assignee_company,
      revision: 1, steps, original_id: r.original_id, import_batch_id: batchId,
    };
  }
  function mapVisi(r, batchId, lookups) {
    const loc = lookups.locByOrig[r.location_original_id];
    const tpl = lookups.tplByName[(r.template_name_original || "").toLowerCase()];
    let steps = [];
    try { steps = JSON.parse(r.steps_json || "[]"); } catch { steps = []; }
    // Normalize steps: ensure label key
    steps = steps.map((s, i) => ({ ...s, label: s.label || s.title || "", status: s.status || "pending" }));
    const visibleTo = splitList(r.visible_to_companies).map((n) => lookups.companyByName[n.toLowerCase()]?.id).filter(Boolean);
    const docOrigIds = splitList(r.document_original_ids);
    return {
      project_id: project.id, code: r.code, visi_type: "Inspection",
      template_id: tpl?.id, template_name: r.template_name_original, template_revision: tpl?.revision || 1,
      location_id: loc?.id, location_original_id: r.location_original_id,
      trade: r.trade, assignee_company_id: lookups.companyByName[(r.assignee_company || "").toLowerCase()]?.id,
      reviewer_company_id: lookups.companyByName[(r.reviewer_company || "").toLowerCase()]?.id,
      visible_to: visibleTo, steps,
      override_status: r.override_status || "none", fixture_label: r.fixture_label,
      discipline: r.discipline, system: r.system, stage: undefined,
      document_ids: [], document_original_ids: docOrigIds,
      created_by: "Site Factory Admin", created_at: r.created_at, last_updated: r.last_updated,
      closed_at: r.closed_at || undefined,
      is_deleted: bool(r.is_deleted), deleted_at: r.deleted_at || undefined, deleted_by: r.deleted_by || undefined,
      original_id: r.original_id, import_batch_id: batchId,
    };
  }
  function mapActivity(r, batchId) {
    if (bool(r.is_duplicate)) return null;
    return {
      project_id: project.id, inspection_code: r.inspection_code,
      user: r.user, text: r.text, type: r.type || "comment", created_at: r.created_at,
      original_id: r.original_id, import_batch_id: batchId,
    };
  }
  function mapDrawing(r, batchId) {
    return {
      project_id: project.id, location_original_id: r.location_original_id || undefined,
      discipline: r.discipline, building: r.building, category: r.category, floor: r.floor,
      drawing_no: r.drawing_no, revision: r.revision, title: r.title,
      filename: r.filename, upload_filename: r.upload_filename,
      size: num(r.size_bytes), uploaded_at: r.uploaded_at,
      original_id: r.original_id, import_batch_id: batchId, is_deleted: false,
    };
  }
  function mapPhoto(r, batchId) {
    return {
      step_label: r.step_label || undefined, original_filename: r.original_filename,
      size: num(r.size_bytes), uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at,
      storage_path: r.storage_path, original_id: r.original_id, import_batch_id: batchId,
      file_uri: `pending:${r.original_id}`, is_deleted: bool(r.is_deleted),
    };
  }

  async function confirmImport() {
    if (!project?.id || !preview?.rows) return;
    setImporting(true); setProgress(0);
    const batchId = `imp_${Date.now()}`;
    const lookups = await buildLookups();
    const existing = existingIds[format] || new Set();
    const rows = preview.rows;
    const errors = [];
    let created = 0, skipped = 0;
    const entityName = fmt.entity;

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const records = [];
      for (const r of chunk) {
        if (r.original_id && existing.has(r.original_id)) { skipped++; continue; }
        try {
          let rec;
          if (format === "companies") rec = mapCompany(r, batchId);
          else if (format === "locations") rec = mapLocation(r, batchId);
          else if (format === "templates") rec = mapTemplate(r, batchId, lookups);
          else if (format === "visis") rec = mapVisi(r, batchId, lookups);
          else if (format === "activity") { rec = mapActivity(r, batchId); if (!rec) { skipped++; continue; } }
          else if (format === "drawings") rec = mapDrawing(r, batchId);
          else if (format === "photos") rec = mapPhoto(r, batchId);
          if (rec) records.push(rec);
        } catch (e) { errors.push({ row: i, error: e.message }); }
      }
      if (records.length > 0) {
        try {
          await base44.entities[entityName].bulkCreate(records);
          created += records.length;
          records.forEach((r) => { if (r.original_id) existing.add(r.original_id); });
        } catch (e) { errors.push({ chunk: i, error: e.message }); }
      }
      setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
    }

    // Link photos to Visis by inspection_code
    if (format === "photos") {
      try {
        const photos = await readAll("Attachment", { import_batch_id: batchId });
        const visis = await readAll("Visi", { project_id: project.id });
        const visiByCode = {};
        visis.forEach((v) => { if (v.code) visiByCode[v.code] = v; });
        const toLink = photos.filter((p) => !p.visi_id);
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

    // Link Visi document_ids from document_original_ids
    if (format === "visis") {
      try {
        const docs = await readAll("Document", { project_id: project.id });
        const docByOrig = {};
        docs.forEach((d) => { if (d.original_id) docByOrig[d.original_id] = d; });
        const visis = await readAll("Visi", { import_batch_id: batchId });
        const toLink = visis.filter((v) => v.document_original_ids?.length > 0);
        for (let i = 0; i < toLink.length; i += 100) {
          const batch = toLink.slice(i, i + 100);
          await base44.entities.Visi.bulkUpdate(batch.map((v) => ({
            id: v.id, document_ids: v.document_original_ids.map((oid) => docByOrig[oid]?.id).filter(Boolean),
          })));
        }
      } catch (e) { console.error("doc link failed", e); }
    }

    // Attach stored files to drawing records by upload_filename
    if (format === "drawings") {
      try {
        const savedFiles = project.saved_file_index || [];
        const fileByName = new Map(savedFiles.map((f) => [f.upload_filename, f]));
        const docs = await readAll("Document", { import_batch_id: batchId });
        const toLink = docs.filter((d) => !d.file_uri && fileByName.has(d.upload_filename));
        for (let i = 0; i < toLink.length; i += 100) {
          const batch = toLink.slice(i, i + 100);
          await base44.entities.Document.bulkUpdate(batch.map((d) => {
            const f = fileByName.get(d.upload_filename);
            return { id: d.id, file_uri: f.file_uri, content_type: f.content_type, size: f.size };
          }));
        }
      } catch (e) { console.error("drawing file link failed", e); }
    }

    setResult({ created, skipped, errors: errors.length, batchId });
    logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Imported ${created} ${entityName} (batch ${batchId})`, type: "bulk_create" });
    setImporting(false); reload(); loadBatches(); loadExisting();
  }

  async function undoBatch(batchId) {
    if (!confirm(`Undo import batch ${batchId}? This permanently deletes all records from that batch.`)) return;
    try {
      for (const ent of ["Visi", "Location", "Company", "Template", "Document", "Attachment", "Activity"]) {
        try { await base44.entities[ent].deleteMany({ import_batch_id: batchId }); } catch (e) { console.error(e); }
      }
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Undid import batch ${batchId}`, type: "delete" });
      reload(); loadBatches(); loadExisting();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Import Data</h3>
        <p className="text-sm text-slate-500 mb-3">Upload each CSV in order (1 to 7). Preview before saving. Duplicates (by original_id) are skipped, never overwritten. Each batch is tagged for undo.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {FORMATS.map((f) => (
            <button key={f.key} onClick={() => { setFormat(f.key); setPreview(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-colors ${format === f.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 mb-2">Expected file: <span className="font-mono">{fmt.file}</span></div>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="w-full text-sm" />
      </div>

      {preview && !preview.error && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Preview</h3>
            <span className="text-sm font-semibold text-slate-700">{preview.total} rows · {preview.duplicates} duplicates</span>
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
            <button onClick={confirmImport} disabled={preview.total === 0 || preview.duplicates === preview.total}
              className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              Confirm Import ({preview.total - preview.duplicates} new)
            </button>
          )}
        </div>
      )}

      {preview?.error && <div className="rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-600">Parse error: {preview.error}</p></div>}

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