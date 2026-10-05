import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { logActivity } from "@/lib/activityLog";
import { FileText, Upload, Search, Download, Trash2, Loader2 } from "lucide-react";

export default function Documents() {
  const { project } = useQaData();
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [uploading, setUploading] = useState(false);
  const canEdit = user?.role === "admin" || user?.role === "pm" || user?.role === "trade";

  useEffect(() => {
    if (!project?.id) return;
    setLoading(true);
    base44.entities.Document.filter({ project_id: project.id }).then((all) => {
      setDocs((Array.isArray(all) ? all : []).filter((d) => !d.is_deleted));
    }).catch(console.error).finally(() => setLoading(false));
  }, [project?.id]);

  const categories = useMemo(() => [...new Set(docs.map((d) => d.category).filter(Boolean))], [docs]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (category !== "all" && d.category !== category) return false;
      if (q) {
        const hay = `${d.title || ""} ${d.filename || ""} ${d.drawing_no || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [docs, q, category]);

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !project?.id) return;
    setUploading(true);
    for (const file of files) {
      try {
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const doc = await base44.entities.Document.create({
          project_id: project.id, filename: file.name, file_uri, title: file.name,
          content_type: file.type, size: file.size,
          uploaded_by_company: user?.data?.company_id, uploaded_at: new Date().toISOString(),
        });
        setDocs((prev) => [...prev, doc]);
        logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Document uploaded: ${file.name}`, type: "attachment" });
      } catch (e) { console.error(e); }
    }
    setUploading(false);
    e.target.value = "";
  }

  async function deleteDoc(d) {
    if (!confirm(`Delete "${d.title || d.filename}"?`)) return;
    try {
      await base44.entities.Document.update(d.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Document deleted: ${d.title || d.filename}`, type: "delete" });
    } catch (e) { console.error(e); }
  }

  if (loading) return <PageShell title="Documents" loading />;
  if (!project) return <PageShell title="Documents"><EmptyState title="No project selected" /></PageShell>;

  return (
    <PageShell title="Documents" subtitle={`${project.name} · ${docs.length} files`}
      actions={
        canEdit && (
          <label className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-emerald-700">
            <Upload size={16} /> Upload
            <input type="file" multiple className="hidden" onChange={handleUpload} />
          </label>
        )
      }
    >
      {uploading && <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">Uploading files...</div>}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" message={canEdit ? "Upload drawings, certificates, or schedules." : "No documents have been uploaded yet."} />
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <FileText size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{d.title || d.filename}</div>
                <div className="text-xs text-slate-500">{d.drawing_no || ""} {d.revision ? `· Rev ${d.revision}` : ""} {d.category ? `· ${d.category}` : ""}</div>
              </div>
              <a href={d.file_uri} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Download size={16} /></a>
              {user?.role === "admin" && (
                <button onClick={() => deleteDoc(d)} className="rounded-lg border border-slate-200 p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}