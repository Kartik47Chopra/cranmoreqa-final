import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import RoleGate from "@/components/RoleGate";
import { logActivity } from "@/lib/activityLog";
import { Settings, Building2, FileText, Upload, Trash2, RotateCcw, Plus, Save, Loader2, Database } from "lucide-react";
import ImportTool from "@/components/ImportTool";
import PhotoLinkTool from "@/components/qa/PhotoLinkTool";
import PhotoAssignTool from "@/components/qa/PhotoAssignTool";
import DataTools from "@/components/DataTools";

const TABS = [
  { key: "details", label: "Details", icon: Settings, roles: ["admin", "pm"] },
  { key: "locations", label: "Locations", icon: Building2, roles: ["admin", "pm"] },
  { key: "templates", label: "Templates", icon: FileText, roles: ["admin", "pm"] },
  { key: "import", label: "Import", icon: Upload, roles: ["admin"] },
  { key: "deleted", label: "Recently Deleted", icon: Trash2, roles: ["admin"] },
  { key: "data", label: "Data Tools", icon: Database, roles: ["admin"] },
];

export default function ProjectSetup() {
  const { user } = useAuth();
  const role = user?.role || "viewer";
  const tabs = TABS.filter((t) => t.roles.includes(role));
  const [tab, setTab] = useState(tabs[0]?.key || "details");

  return (
    <RoleGate roles={["admin", "pm"]}>
      <PageShell title="Project Setup">
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${tab === t.key ? "bg-emerald-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
        {tab === "details" && <DetailsTab />}
        {tab === "locations" && <LocationsTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "import" && <><ImportTool /><PhotoLinkTool /><PhotoAssignTool /></>}
        {tab === "deleted" && <DeletedTab />}
        {tab === "data" && <DataTools />}
      </PageShell>
    </RoleGate>
  );
}

function DetailsTab() {
  const { project, reload } = useQaData();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) setForm({ name: project.name || "", address: project.address || "", drawing_set: project.drawing_set || "", accounts_email: project.accounts_email || "" });
  }, [project]);

  async function save() {
    setSaving(true);
    try {
      await base44.entities.Project.update(project.id, form);
      reload();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (!project) return <EmptyState title="No project selected" />;
  return (
    <div className="max-w-md space-y-3">
      <Field label="Project Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      <Field label="Drawing Set" value={form.drawing_set} onChange={(v) => setForm({ ...form, drawing_set: v })} />
      <Field label="Accounts Email" value={form.accounts_email} onChange={(v) => setForm({ ...form, accounts_email: v })} placeholder="accounts@example.com (blank by default)" />
      <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

function LocationsTab() {
  const { project, locations, reload } = useQaData();
  const [name, setName] = useState("");
  const [type, setType] = useState("Room");
  const [parentId, setParentId] = useState("");

  async function add() {
    if (!name) return;
    try {
      await base44.entities.Location.create({ project_id: project.id, name, type, parent_id: parentId || undefined });
      setName("");
      reload();
    } catch (e) { console.error(e); }
  }

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Add Location</h3>
        <div className="flex flex-wrap gap-2">
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm flex-1 min-w-[150px]">
            <option value="">Top level (Building)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm">
            <option>Building</option><option>Level</option><option>Zone</option><option>Unit</option><option>Room</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Location name" className="rounded-lg border border-slate-200 p-2 text-sm flex-1 min-w-[150px]" />
          <button onClick={add} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus size={16} /> Add</button>
        </div>
      </div>
      <div className="space-y-1">
        {locations.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="text-xs uppercase text-slate-400 w-16">{l.type}</span>
            <span className="flex-1 truncate text-slate-700">{l.name}</span>
            {l.status === "na" && <span className="text-xs text-slate-400">N/A</span>}
          </div>
        ))}
        {locations.length === 0 && <EmptyState title="No locations yet" message="Add buildings, levels, and rooms above." />}
      </div>
    </div>
  );
}

function TemplatesTab() {
  const { templates } = useQaData();
  if (templates.length === 0) return <EmptyState icon={FileText} title="No templates yet" message="Templates define reusable checklists per trade. Import them or create new ones." />;
  return (
    <div className="space-y-2">
      {templates.map((t) => (
        <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="text-sm font-semibold text-slate-800">{t.name}</div>
          <div className="text-xs text-slate-500">{t.discipline || ""} {t.stage ? `· ${t.stage}` : ""} · {t.steps?.length || 0} steps</div>
        </div>
      ))}
    </div>
  );
}

function ImportTab() {
  const { project, reload } = useQaData();
  const { user } = useAuth();
  const [entity, setEntity] = useState("Location");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return obj;
    });
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let rows = [];
        if (f.name.endsWith(".json")) {
          const data = JSON.parse(reader.result);
          rows = Array.isArray(data) ? data : [data];
        } else {
          rows = parseCSV(reader.result);
        }
        setPreview({ total: rows.length, sample: rows.slice(0, 5), rows });
      } catch (e) { setPreview({ error: e.message }); }
    };
    reader.readAsText(f);
  }

  async function confirmImport() {
    if (!preview?.rows || !project?.id) return;
    setImporting(true);
    const batchId = `imp_${Date.now()}`;
    let created = 0, skipped = 0, errors = 0;
    const rows = preview.rows;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const records = chunk.map((r) => ({
        ...r,
        project_id: r.project_id || project.id,
        import_batch_id: batchId,
        is_deleted: false,
      }));
      try {
        await base44.entities[entity].bulkCreate(records);
        created += records.length;
      } catch (e) { errors += records.length; console.error(e); }
    }
    setResult({ created, skipped, errors });
    logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Imported ${created} ${entity} records`, type: "bulk_create" });
    setImporting(false);
    reload();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Import Data</h3>
        <p className="text-sm text-slate-500 mb-3">Upload CSV or JSON files. Preview before saving. Duplicates are skipped, never overwritten.</p>
        <select value={entity} onChange={(e) => { setEntity(e.target.value); setPreview(null); }} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm mb-3">
          <option>Location</option><option>Template</option><option>Visi</option><option>Document</option><option>Task</option><option>Milestone</option><option>Activity</option>
        </select>
        <input type="file" accept=".csv,.json" onChange={handleFile} className="w-full text-sm" />
      </div>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">Preview</h3>
          {preview.error ? (
            <p className="text-sm text-red-600">{preview.error}</p>
          ) : (
            <>
              <div className="text-sm text-slate-700 mb-2">{preview.total} rows found</div>
              {preview.sample?.length > 0 && (
                <div className="overflow-x-auto rounded border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50"><tr>{Object.keys(preview.sample[0]).map((k) => <th key={k} className="px-2 py-1 text-left">{k}</th>)}</tr></thead>
                    <tbody>
                      {preview.sample.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">{Object.values(r).map((v, j) => <td key={j} className="px-2 py-1 truncate max-w-[120px]">{String(v || "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={confirmImport} disabled={importing || preview.total === 0} className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {importing ? "Importing..." : `Confirm Import (${preview.total} rows)`}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-bold text-emerald-700 mb-1">Import Complete</h3>
          <p className="text-sm text-emerald-600">{result.created} created · {result.skipped} skipped · {result.errors} errors</p>
        </div>
      )}
    </div>
  );
}

function DeletedTab() {
  const { project, reload } = useQaData();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("Visi");

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    base44.entities[type].filter({ project_id: project.id }).then((all) => {
      setItems((Array.isArray(all) ? all : []).filter((x) => x.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id, type]);

  async function restore(item) {
    try {
      await base44.entities[type].update(item.id, { is_deleted: false, deleted_at: null, deleted_by: null });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      logActivity({ project_id: project.id, user: "admin", text: `Restored ${type}: ${item.code || item.name || item.id}`, type: "restore" });
    } catch (e) { console.error(e); }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {["Visi", "Location", "Document", "Attachment"].map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${type === t ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{t}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" size={28} /></div> : items.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing deleted" message="Soft-deleted items will appear here for restore." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-700">{item.code || item.name || item.title || item.id}</div>
                <div className="text-xs text-slate-400">Deleted {item.deleted_at ? new Date(item.deleted_at).toLocaleDateString("en-AU") : ""}</div>
              </div>
              <button onClick={() => restore(item)} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"><RotateCcw size={14} /> Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" />
    </div>
  );
}