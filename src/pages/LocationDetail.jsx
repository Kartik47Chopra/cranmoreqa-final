import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { statusBucket, checklistProgress, locationPath, subtreeOriginalIds } from "@/lib/qaUtils";
import { readAll } from "@/components/qa/paging";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import BackButton from "@/components/BackButton";
import { logActivity } from "@/lib/activityLog";
import {
  ClipboardList, Camera, FileText, Milestone as MilestoneIcon, MapPin, ChevronRight, Plus,
  Loader2, MapPin as LocationIcon, Ban, QrCode, Pencil, BedDouble, Bath, Sofa, WashingMachine,
  DoorOpen, MessageSquare, Trash2, X,
} from "lucide-react";

const TABS = [
  { key: "overview", label: "Overview", icon: LocationIcon },
  { key: "visis", label: "Visis", icon: ClipboardList },
  { key: "milestones", label: "Milestones", icon: MilestoneIcon },
  { key: "attachments", label: "Attachments", icon: Camera },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "floorplan", label: "Floor Plan", icon: MapPin },
];

const ROOM_ICONS = {
  bedroom: BedDouble,
  ensuite: Bath,
  bathroom: Bath,
  "powder": Bath,
  "powder room": Bath,
  living: Sofa,
  "living / kitchen / dining": Sofa,
  kitchen: Sofa,
  dining: Sofa,
  laundry: WashingMachine,
  study: DoorOpen,
};

function roomIcon(name) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("bed")) return ROOM_ICONS.bedroom;
  if (lower.includes("ensuite") || lower.includes("bath") || lower.includes("powder")) return ROOM_ICONS.ensuite;
  if (lower.includes("living") || lower.includes("kitchen") || lower.includes("dining")) return ROOM_ICONS.living;
  if (lower.includes("laundry")) return ROOM_ICONS.laundry;
  if (lower.includes("study")) return ROOM_ICONS.study;
  return DoorOpen;
}

export default function LocationDetail() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const { locationMap, locations, templateMap, companyMap, project, reload } = useQaData();
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [visis, setVisis] = useState([]);
  const [childVisis, setChildVisis] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [showNAConfirm, setShowNAConfirm] = useState(false);
  const [showAddApt, setShowAddApt] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    // Collect subtree original_ids for this location (includes itself)
    const subtreeIds = subtreeOriginalIds(locations, locationId);
    const subtreeArr = [...subtreeIds];
    Promise.all([
      // Visis for this location AND all descendants (query in chunks by location_original_id)
      (async () => {
        const all = await readAll("Visi", { project_id: project?.id });
        return all.filter((v) => !v.is_deleted && subtreeArr.includes(v.location_original_id));
      })(),
      base44.entities.Attachment.filter({ location_id: locationId }).then((a) => (Array.isArray(a) ? a : []).filter((x) => !x.is_deleted)),
      base44.entities.Document.filter({ location_id: locationId }).then((d) => (Array.isArray(d) ? d : []).filter((x) => !x.is_deleted)),
      base44.entities.Milestone.filter({ location_id: locationId }).then((m) => (Array.isArray(m) ? m : [])),
    ]).then(([v, a, d, m]) => {
      setVisis(v);
      setAttachments(a);
      setDocuments(d);
      setMilestones(m);
    }).catch(console.error).finally(() => setLoading(false));
  }, [locationId, locations, project?.id]);

  const loc = locationMap[locationId];
  // Children by parent_original_id
  const childLocations = useMemo(
    () => locations.filter((l) => l.parent_original_id === loc?.original_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [locations, loc?.original_id]
  );

  // Count Visis per child location (for room cards) — direct visis only
  useEffect(() => {
    if (childLocations.length === 0) return;
    let active = true;
    (async () => {
      try {
        const allVisis = await readAll("Visi", { project_id: project?.id });
        if (!active) return;
        const map = {};
        childLocations.forEach((c) => {
          map[c.id] = allVisis.filter((v) => !v.is_deleted && v.location_original_id === c.original_id);
        });
        setChildVisis(map);
      } catch (e) { console.error(e); }
    })();
    return () => { active = false; };
  }, [childLocations, project?.id]);

  async function toggleNA() {
    if (!loc) return;
    const newStatus = loc.status === "na" ? "active" : "na";
    try {
      await base44.entities.Location.update(loc.id, { status: newStatus });
      logActivity({ project_id: loc.project_id, user: user?.full_name || user?.email, text: `Location "${loc.name}" marked ${newStatus === "na" ? "N/A" : "active"}`, type: "status" });
      setShowNAConfirm(false);
      reload();
    } catch (e) { console.error(e); }
  }

  async function saveName() {
    if (!nameValue.trim()) return;
    try {
      await base44.entities.Location.update(loc.id, { name: nameValue.trim() });
      setEditingName(false);
      reload();
    } catch (e) { console.error(e); }
  }

  async function addApartment(name) {
    if (!name?.trim() || !project?.id) return;
    try {
      const aptOrig = crypto.randomUUID();
      const apt = await base44.entities.Location.create({ project_id: project.id, parent_original_id: loc?.original_id, name: name.trim(), type: "Unit", order: childLocations.length, original_id: aptOrig });
      const standardRooms = ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Ensuite", "Bathroom", "Living / Kitchen / Dining", "Laundry", "Powder Room"];
      await base44.entities.Location.bulkCreate(standardRooms.map((r, i) => ({ project_id: project.id, parent_original_id: aptOrig, name: r, type: "Room", order: i, original_id: crypto.randomUUID() })));
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Added apartment: ${name.trim()}`, type: "bulk_create" });
      setShowAddApt(false);
      navigate(`/location/${apt.id}`);
    } catch (e) { console.error(e); }
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>
  );
  if (!loc) return (
    <div className="flex h-full flex-col">
      <header className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <BackButton fallback="/" label="Back" />
      </header>
      <EmptyState title="Location not found" />
    </div>
  );

  const path = locationPath(locations, locationId);
  const isUnit = loc.type === "Unit";
  const isBuilding = loc.type === "Building";
  const canManage = user?.role === "admin" || user?.role === "pm";

  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-start gap-3">
          <BackButton fallback="/" className="mt-1" />
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} autoFocus
                  className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900 border-b-2 border-emerald-500 bg-transparent outline-none flex-1 min-w-0" />
                <button onClick={saveName} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Save</button>
                <button onClick={() => setEditingName(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500">Cancel</button>
              </div>
            ) : (
              <h1 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight text-slate-900 break-words">
                {loc.name}
              </h1>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{path}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowNAConfirm(true)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${loc.status === "na" ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              <Ban size={15} /> Mark N/A
            </button>
            <button onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <QrCode size={15} /> Export QR Code
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-slate-200 bg-white overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
            {t.key === "visis" && visis.length > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{visis.length}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4">
        {tab === "overview" && <OverviewTab loc={loc} isUnit={isUnit} visis={visis} childLocations={childLocations} childVisis={childVisis} navigate={navigate} canManage={canManage} onEditName={() => { setNameValue(loc.name); setEditingName(true); }} onAddApt={() => setShowAddApt(true)} />}
        {tab === "visis" && <VisisTab visis={visis} templateMap={templateMap} locations={locations} navigate={navigate} canManage={canManage} user={user} projectId={loc.project_id} locationId={locationId} />}
        {tab === "milestones" && <MilestonesTab milestones={milestones} />}
        {tab === "attachments" && <AttachmentsTab attachments={attachments} />}
        {tab === "documents" && <DocumentsTab documents={documents} />}
        {tab === "floorplan" && <EmptyState icon={MapPin} title="No floor plan" message="Upload a floor plan drawing from the Documents page." />}
      </div>

      {/* QR modal */}
      {showQR && <QRModal url={`${window.location.origin}/location/${locationId}`} name={loc.name} onClose={() => setShowQR(false)} />}

      {/* N/A confirm */}
      {showNAConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNAConfirm(false)}>
          <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-2">Mark "{loc.name}" as N/A?</h3>
            <p className="text-sm text-slate-500 mb-4">This location will be excluded from all counts and shown as struck-through. You can reverse this anytime.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNAConfirm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={toggleNA} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Mark N/A</button>
            </div>
          </div>
        </div>
      )}

      {/* Add apartment modal */}
      {showAddApt && <AddApartmentModal onAdd={addApartment} onClose={() => setShowAddApt(false)} />}
    </div>
  );
}

function OverviewTab({ loc, isUnit, visis, childLocations, childVisis, navigate, canManage, onEditName, onAddApt }) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* For Units: Apartment Visis + Rooms */}
      {isUnit ? (
        <>
          {/* Apartment Visis */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Apartment Visis</h2>
            {visis.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                No Visis attached to this apartment.
              </div>
            ) : (
              <div className="space-y-2">
                {visis.map((v) => {
                  const tpl = templateMapSafe(v);
                  return (
                    <button key={v.id} onClick={() => navigate(`/inspection/${v.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{v.trade || tpl?.name || v.template_name || "Visi"}</div>
                        <div className="truncate font-mono text-xs text-slate-500">{v.code}</div>
                      </div>
                      <StatusBadge visi={v} />
                      <ChevronRight size={16} className="shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Rooms */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Rooms</h2>
            {childLocations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                No rooms in this apartment.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childLocations.map((c) => {
                  const childVisiList = childVisis[c.id] || [];
                  const count = childVisiList.length;
                  const isNA = c.status === "na";
                  const Icon = roomIcon(c.name);
                  return (
                    <button key={c.id} onClick={() => navigate(`/location/${c.id}`)}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${isNA ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isNA ? "bg-slate-100 text-slate-300" : "bg-emerald-50 text-emerald-600"}`}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm font-semibold ${isNA ? "text-slate-400 line-through" : "text-slate-800"}`}>{c.name}</div>
                        <div className="text-xs text-slate-500">{isNA ? "N/A" : `${count} Visis`}</div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Footer actions */}
          {canManage && (
            <div className="flex gap-2 pt-2">
              <button onClick={onEditName} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Pencil size={15} /> Edit Name
              </button>
              <button onClick={onAddApt} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <Plus size={15} /> Add Apartment
              </button>
            </div>
          )}
        </>
      ) : (
        /* For Buildings/Levels: children list with Visi counts */
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {loc.type === "Building" ? "Levels & Zones" : "Locations"}
          </h2>
          {childLocations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
              No sub-locations here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {childLocations.map((c) => {
                const childVisiList = childVisis[c.id] || [];
                const count = childVisiList.length;
                const isNA = c.status === "na";
                return (
                  <button key={c.id} onClick={() => navigate(`/location/${c.id}`)}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${isNA ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${isNA ? "text-slate-400 line-through" : "text-slate-800"}`}>{c.name}</div>
                      <div className="text-xs text-slate-500">{isNA ? "N/A" : `${count} Visis`}</div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function VisisTab({ visis, templateMap, locations, navigate, canManage, user, projectId, locationId }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    let list = [...visis];
    if (statusFilter !== "all") list = list.filter((v) => statusBucket(v) === statusFilter);
    if (typeFilter !== "all") list = list.filter((v) => (v.visi_type || "Inspection") === typeFilter);
    list.sort((a, b) => {
      if (sortBy === "updated") return new Date(b.last_updated || b.created_at || 0) - new Date(a.last_updated || a.created_at || 0);
      if (sortBy === "created") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === "code") return (a.code || "").localeCompare(b.code || "");
      return 0;
    });
    return list;
  }, [visis, statusFilter, typeFilter, sortBy]);

  const types = useMemo(() => [...new Set(visis.map((v) => v.visi_type || "Inspection"))], [visis]);

  async function deleteVisi(v) {
    if (!confirm(`Delete Visi ${v.code}? This is a soft delete — admin can restore it.`)) return;
    try {
      await base44.entities.Visi.update(v.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      logActivity({ project_id: projectId, visi_id: v.id, user: user?.full_name || user?.email, text: `deleted Visi ${v.code}`, type: "delete" });
      window.location.reload();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Closed</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="updated">Sort: Last updated</option>
          <option value="created">Sort: Newest</option>
          <option value="code">Sort: Code</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-500">All ({filtered.length})</span>
          {canManage && (
            <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <Plus size={15} /> New Visi
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No Visis" message="No Visis match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Title</th>
                <th className="px-3 py-2.5">Visi code</th>
                <th className="hidden md:table-cell px-3 py-2.5">Location</th>
                <th className="hidden lg:table-cell px-3 py-2.5">Days open</th>
                <th className="hidden md:table-cell px-3 py-2.5">Last updated</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const tpl = templateMap[v.template_id];
                const { done, total } = checklistProgress(v);
                const locName = locations.find((l) => l.id === v.location_id)?.name || "—";
                const updated = v.last_updated || v.created_at;
                return (
                  <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/inspection/${v.id}`)}>
                    <td className="px-3 py-3"><StatusBadge visi={v} /></td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">{v.trade || tpl?.name || v.template_name || "Visi"}</div>
                      <div className="text-xs text-slate-400">Inspection</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{v.code || "—"}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-slate-600 truncate max-w-[160px]">{locName}</td>
                    <td className="hidden lg:table-cell px-3 py-3 text-slate-500">{daysSince(v.created_at)}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-slate-500">{updated ? fmtDate(updated) : "—"}</td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"><MessageSquare size={14} /></button>
                        {canManage && (
                          <button onClick={() => deleteVisi(v)} className="p-1.5 rounded text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewVisiModal projectId={projectId} locationId={locationId} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function MilestonesTab({ milestones }) {
  if (milestones.length === 0) return <EmptyState icon={MilestoneIcon} title="No milestones" message="Milestones linked to this location will appear here." />;
  return (
    <div className="space-y-2">
      {milestones.map((m) => (
        <div key={m.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">{m.name}</div>
          {m.target_date && <div className="text-xs text-slate-500">Target: {new Date(m.target_date).toLocaleDateString("en-AU")}</div>}
        </div>
      ))}
    </div>
  );
}

function AttachmentsTab({ attachments }) {
  if (attachments.length === 0) return <EmptyState icon={Camera} title="No attachments" message="Photos added to Visis at this location will appear here." />;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {attachments.map((a) => (
        <div key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
          <img src={a.file_uri} alt={a.original_filename} className="aspect-square w-full object-cover cursor-pointer" />
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ documents }) {
  if (documents.length === 0) return <EmptyState icon={FileText} title="No documents" message="Upload drawings or certificates from the Documents page." />;
  return (
    <div className="space-y-2">
      {documents.map((d) => (
        <a key={d.id} href={d.file_uri} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50">
          <FileText size={18} className="text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{d.title || d.filename}</div>
            <div className="text-xs text-slate-500">{d.drawing_no || ""} {d.revision ? `· Rev ${d.revision}` : ""}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function QRModal({ url, name, onClose }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  function download() {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `QR-${name || "location"}.png`;
    a.target = "_blank";
    a.click();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">QR Code</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex justify-center mb-4">
          <img src={qrUrl} alt="QR Code" width={220} height={220} className="rounded-lg border border-slate-200" />
        </div>
        <p className="text-xs text-slate-500 text-center mb-4 break-all">{url}</p>
        <button onClick={download} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          Download PNG
        </button>
      </div>
    </div>
  );
}

function AddApartmentModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-3">Add Apartment</h3>
        <p className="text-sm text-slate-500 mb-3">Creates a new apartment with standard rooms (Bedroom 1-3, Ensuite, Bathroom, Living/Kitchen/Dining, Laundry, Powder Room).</p>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Apartment 108 · Type 3"
          className="w-full rounded-lg border border-slate-200 p-2.5 text-sm mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAdd(name)} disabled={!name.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}

function NewVisiModal({ projectId, locationId, onClose }) {
  const { templates } = useQaData();
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!templateId) return;
    setSaving(true);
    try {
      const tpl = templates.find((t) => t.id === templateId);
      const steps = (tpl?.steps || []).map((s) => ({ ...s, status: "pending" }));
      const code = `NEW-${Date.now().toString(36).toUpperCase().slice(-4)}`;
      const v = await base44.entities.Visi.create({
        project_id: projectId, location_id: locationId, template_id: templateId,
        template_name: tpl?.name, template_revision: tpl?.revision || 1,
        code, visi_type: "Inspection", trade: tpl?.name, discipline: tpl?.discipline,
        system: tpl?.system, stage: tpl?.stage, steps,
        assignee_company_id: tpl?.steps?.[0]?.assignee_company_id,
        created_at: new Date().toISOString(), last_updated: new Date().toISOString(),
      });
      logActivity({ project_id: projectId, visi_id: v.id, user: "admin", text: `created Visi ${code}`, type: "bulk_create" });
      onClose();
      window.location.reload();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg bg-white p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-3">New Visi</h3>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm mb-4">
          <option value="">Select template...</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={create} disabled={!templateId || saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helpers
function templateMapSafe(v) { return null; }
function daysSince(date) {
  if (!date) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(date)) / 86400000));
}
function fmtDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "numeric", year: "numeric" });
}