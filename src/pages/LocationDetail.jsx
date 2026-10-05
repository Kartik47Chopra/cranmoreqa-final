import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { statusBucket, checklistProgress, pct, locationPath } from "@/lib/qaUtils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { ArrowLeft, ClipboardList, Camera, FileText, Milestone as MilestoneIcon, MapPin, ChevronRight, Plus, Loader2 } from "lucide-react";

const TABS = [
  { key: "visis", label: "Inspections", icon: ClipboardList },
  { key: "attachments", label: "Photos", icon: Camera },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "milestones", label: "Milestones", icon: MilestoneIcon },
];

export default function LocationDetail() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const { locationMap, locations, templateMap, companyMap } = useQaData();
  const { user } = useAuth();
  const [tab, setTab] = useState("visis");
  const [visis, setVisis] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    Promise.all([
      base44.entities.Visi.filter({ location_id: locationId }),
      base44.entities.Attachment.filter({ location_id: locationId }),
      base44.entities.Document.filter({ location_id: locationId }),
      base44.entities.Milestone.filter({ location_id: locationId }),
    ]).then(([v, a, d, m]) => {
      setVisis((Array.isArray(v) ? v : []).filter((x) => !x.is_deleted));
      setAttachments(Array.isArray(a) ? a : []).filter((x) => !x.is_deleted);
      setDocuments(Array.isArray(d) ? d : []).filter((x) => !x.is_deleted);
      setMilestones(Array.isArray(m) ? m : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [locationId]);

  const loc = locationMap[locationId];
  if (loading) return (
    <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>
  );
  if (!loc) return (
    <div className="flex h-full flex-col">
      <header className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Back
        </button>
      </header>
      <EmptyState title="Location not found" />
    </div>
  );

  const path = locationPath(locations, locationId);
  const childLocations = locations.filter((l) => l.parent_id === locationId);

  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900 truncate">{loc.name}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{path}</span>
            </div>
          </div>
          {loc.status === "na" && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">N/A</span>}
        </div>
      </header>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-slate-200 bg-white overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <t.icon size={15} /> {t.label}
            <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">
              {t.key === "visis" ? visis.length : t.key === "attachments" ? attachments.length : t.key === "documents" ? documents.length : milestones.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4">
        {tab === "visis" && (
          <div className="space-y-2">
            {childLocations.length > 0 && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">Sub-locations ({childLocations.length})</div>
                <div className="flex flex-wrap gap-2">
                  {childLocations.map((c) => (
                    <button key={c.id} onClick={() => navigate(`/location/${c.id}`)} className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
                      {c.name} <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visis.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No inspections here" message="No inspections have been created for this location yet." />
            ) : (
              visis.map((v) => {
                const tpl = templateMap[v.template_id];
                const { done, total } = checklistProgress(v);
                return (
                  <button key={v.id} onClick={() => navigate(`/inspection/${v.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:bg-emerald-50/40 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{v.code || tpl?.name || "Inspection"}</div>
                      <div className="truncate text-xs text-slate-500">{tpl?.name || v.discipline || "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs text-slate-600">{done}/{total} · {pct(done, total)}%</div>
                      <div className="mt-1"><StatusBadge visi={v} /></div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                );
              })
            )}
          </div>
        )}

        {tab === "attachments" && (
          <div>
            {attachments.length === 0 ? (
              <EmptyState icon={Camera} title="No photos" message="Photos added to inspections at this location will appear here." />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {attachments.map((a) => (
                  <div key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
                    <img src={a.file_uri} alt={a.original_filename} className="aspect-square w-full object-cover cursor-pointer" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {documents.length === 0 ? (
              <EmptyState icon={FileText} title="No documents" message="Upload drawings or certificates from the Documents page." />
            ) : (
              documents.map((d) => (
                <a key={d.id} href={d.file_uri} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 hover:bg-slate-50">
                  <FileText size={18} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{d.title || d.filename}</div>
                    <div className="text-xs text-slate-500">{d.drawing_no || ""} {d.revision ? `· Rev ${d.revision}` : ""}</div>
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {tab === "milestones" && (
          <div className="space-y-2">
            {milestones.length === 0 ? (
              <EmptyState icon={MilestoneIcon} title="No milestones" message="Milestones linked to this location will appear here." />
            ) : (
              milestones.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="text-sm font-semibold text-slate-800">{m.name}</div>
                  {m.target_date && <div className="text-xs text-slate-500">Target: {new Date(m.target_date).toLocaleDateString("en-AU")}</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}