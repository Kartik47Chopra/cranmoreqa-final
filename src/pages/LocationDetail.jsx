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
  const [directVisis, setDirectVisis] = useState([]);
  const [subtreeCounts, setSubtreeCounts] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [showNAConfirm, setShowNAConfirm] = useState(false);
  const [showAddApt, setShowAddApt] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    const subtreeIds = subtreeOriginalIds(locations, locationId);
    const subtreeArr = [...subtreeIds];
    Promise.all([
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

  // Fetch subtree counts from backend stats (fast, cached)
  useEffect(() => {
    if (!project?.id) return;
    let active = true;
    base44.functions.invoke("aggregateStats", { project_id: project.id }).then((res) => {
      if (active && res.data?.subtreeCounts) setSubtreeCounts(res.data.subtreeCounts);
    }).catch(() => {});
    return () => { active = false; };
  }, [project?.id]);

  const loc = locationMap[locationId];
  // Direct visis (on this location only, not children) — for apartment overview
  useEffect(() => {
    if (!loc?.original_id) { setDirectVisis([]); return; }
    let active = true;
    (async () => {
      try {
        const all = await readAll("Visi", { project_id: project?.id });
        if (!active) return;
        setDirectVisis(all.filter((v) => !v.is_deleted && v.location_original_id === loc.original_id));
      } catch (e) { console.error(e); }
    })();
    return () => { active = false; };
  }, [loc?.original_id, project?.id]);

  // Children by parent_original_id
  const childLocations = useMemo(
    () => locations.filter((l) => l.parent_original_id === loc?.original_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [locations, loc?.original_id]
  );

  // Auto-redirect to Visis tab for rooms (no children)
  useEffect(() => {
    if (loading || !loc) return;
    if (childLocations.length === 0 && tab === "overview") {
      setTab("visis");
    }
  }, [loading, loc, childLocations.length, tab]);

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

  async function addRoom(name, trades) {
    if (!name?.trim() || !project?.id) return;
    try {
      const room = await base44.entities.Location.create({ project_id: project.id, parent_original_id: loc?.original_id, name: name.trim(), type: "Room", order: childLocations.length, original_id: crypto.randomUUID() });
      // Create standard visis for selected trades
      const visisToCreate = [];
      for (const trade of trades) {
        const code = `225-${trade.code}-${Date.now().toString(36).toUpperCase().slice(-3)}`;
        visisToCreate.push({
          project_id: project.id, location_id: room.id, location_original_id: room.original_id,
          code, visi_type: "Inspection", trade: trade.name, template_name: trade.name,
          steps: trade.steps || [{ id: "s1", label: trade.name, type: "inspection", status: "pending" }],
          created_at: new Date().toISOString(), last_updated: new Date().toISOString(),
          original_id: crypto.randomUUID(), visible_to: trade.visibleTo || [],
        });
      }
      if (visisToCreate.length > 0) await base44.entities.Visi.bulkCreate(visisToCreate);
      logActivity({ project_id: project.id, user: user?.full_name || user?.email, text: `Added room: ${name.trim()} with ${visisToCreate.length} visis`, type: "bulk_create" });
      setShowAddRoom(false);
      reload();
    } catch (e) { console.error(e); }
  }

  async function deleteLoc(l) {
    const childCount = locations.filter((x) => x.parent_original_id === l.original_id).length;
    if (!confirm(`Delete "${l.name}"?${childCount > 0 ? ` It has ${childCount} sub-locations and their Visis.` : ""} This is a soft delete.`)) return;
    try {
      await base44.entities.Location.update(l.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      logActivity({ project_id: l.project_id, user: user?.full_name || user?.email, text: `deleted location "${l.name}"`, type: "delete" });
      reload();
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

  const isRoom = childLocations.length === 0;
  const visibleTabs = isRoom ? TABS.filter((t) => t.key !== "overview") : TABS;

  return (
    <div className="flex h-[100dvh] md:h-full flex-col min-w-0">
      {/* Header — phone: 3 rows; desktop: single row */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 py-3 md:py-4">
        {/* Row 1: back + breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BackButton fallback="/" />
          <span className="truncate flex-1 min-w-0">{path}</span>
        </div>
        {/* Row 2: title (full width) */}
        <div className="mt-2 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} autoFocus
                className="font-display text-lg md:text-2xl font-bold uppercase tracking-tight text-slate-900 border-b-2 border-emerald-500 bg-transparent outline-none flex-1 min-w-0" />
              <button onClick={saveName} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Save</button>
              <button onClick={() => setEditingName(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500">Cancel</button>
            </div>
          ) : (
            <h1 className="font-display text-lg md:text-2xl font-bold uppercase tracking-tight text-slate-900 break-words leading-tight">
              {loc.name}
            </h1>
          )}
        </div>
        {/* Row 3: action buttons */}
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => setShowNAConfirm(true)} style={{ touchAction: "manipulation" }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors touch-manipulation ${loc.status === "na" ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            <Ban size={15} /> <span className="hidden sm:inline">Mark N/A</span><span className="sm:hidden">N/A</span>
          </button>
          <button onClick={() => setShowQR(true)} style={{ touchAction: "manipulation" }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 touch-manipulation">
            <QrCode size={15} /> <span className="hidden sm:inline">Export QR Code</span><span className="sm:hidden">QR</span>
          </button>
        </div>
      </header>

      {/* Tabs — horizontal scroll on phone */}
      <div className="shrink-0 flex border-b border-slate-200 bg-white overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ touchAction: "manipulation" }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors touch-manipulation ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
            {t.key === "visis" && visis.length > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{visis.length}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4">
        {tab === "overview" && <OverviewTab loc={loc} isUnit={isUnit} visis={directVisis} childLocations={childLocations} subtreeCounts={subtreeCounts} navigate={navigate} canManage={canManage} onEditName={() => { setNameValue(loc.name); setEditingName(true); }} onAddApt={() => setShowAddApt(true)} onAddRoom={() => setShowAddRoom(true)} onDeleteLoc={deleteLoc} />}
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
      {/* Add room modal */}
      {showAddRoom && <AddRoomModal onAdd={addRoom} onClose={() => setShowAddRoom(false)} />}
    </div>
  );
}

function OverviewTab({ loc, isUnit, visis, childLocations, subtreeCounts, navigate, canManage, onEditName, onAddApt, onAddRoom, onDeleteLoc }) {
  const subCount = (id) => subtreeCounts[id] || { total: 0, in_progress: 0 };
  return (
    <div className="space-y-6 max-w-4xl">
      {isUnit ? (
        <>
          {/* Rooms FIRST */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Rooms</h2>
            {childLocations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                No rooms in this apartment.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childLocations.map((c) => {
                  const sc = subCount(c.id);
                  const isNA = c.status === "na";
                  const Icon = roomIcon(c.name);
                  return (
                    <div key={c.id} className={`relative flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${isNA ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <button onClick={() => navigate(`/location/${c.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isNA ? "bg-slate-100 text-slate-300" : "bg-emerald-50 text-emerald-600"}`}>
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-semibold ${isNA ? "text-slate-400 line-through" : "text-slate-800"}`}>{c.name}</div>
                          <div className="text-xs text-slate-500">{isNA ? "N/A" : `${sc.total} Visis`}{sc.in_progress > 0 && <span className="text-amber-600"> · {sc.in_progress} in progress</span>}</div>
                        </div>
                        <ChevronRight size={16} className="shrink-0 text-slate-300" />
                      </button>
                      {canManage && !isNA && (
                        <button onClick={() => onDeleteLoc(c)} className="absolute top-1 right-1 p-1 rounded text-slate-300 hover:bg-red-50 hover:text-red-500 touch-manipulation"><Trash2 size={12} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Apartment Visis (direct only — e.g. Entry door) */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Apartment Visis</h2>
            {visis.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                No Visis attached to this apartment.
              </div>
            ) : (
              <div className="space-y-2">
                {visis.map((v) => (
                  <button key={v.id} onClick={() => navigate(`/inspection/${v.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 transition-colors touch-manipulation">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{v.trade || v.template_name || "Visi"}</div>
                      <div className="truncate font-mono text-xs text-slate-500">{v.code}</div>
                    </div>
                    <StatusBadge visi={v} />
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Footer actions */}
          {canManage && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={onEditName} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 touch-manipulation">
                <Pencil size={15} /> Edit Name
              </button>
              <button onClick={onAddRoom} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 touch-manipulation">
                <Plus size={15} /> Add Room
              </button>
              <button onClick={onAddApt} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 touch-manipulation">
                <Plus size={15} /> Add Apartment
              </button>
            </div>
          )}
        </>
      ) : (
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
                const sc = subCount(c.id);
                const isNA = c.status === "na";
                return (
                  <div key={c.id} className={`relative flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${isNA ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <button onClick={() => navigate(`/location/${c.id}`)} className="flex-1 min-w-0 text-left touch-manipulation">
                      <div className={`truncate text-sm font-semibold ${isNA ? "text-slate-400 line-through" : "text-slate-800"}`}>{c.name}</div>
                      <div className="text-xs text-slate-500">{isNA ? "N/A" : `${sc.total} Visis`}{sc.in_progress > 0 && <span className="text-amber-600"> · {sc.in_progress} in progress</span>}</div>
                    </button>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                    {canManage && !isNA && (
                      <button onClick={() => onDeleteLoc(c)} className="absolute top-1 right-1 p-1 rounded text-slate-300 hover:bg-red-50 hover:text-red-500 touch-manipulation"><Trash2 size={12} /></button>
                    )}
                  </div>
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

      {/* Cards (phone + desktop) */}
      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No Visis" message="No Visis match these filters." />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const tpl = templateMap[v.template_id];
            const locName = locations.find((l) => l.id === v.location_id)?.name || "—";
            const updated = v.last_updated || v.created_at;
            return (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50 cursor-pointer touch-manipulation" onClick={() => navigate(`/inspection/${v.id}`)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge visi={v} />
                    <span className="font-semibold text-slate-800 truncate">{v.trade || tpl?.name || v.template_name || "Visi"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{v.code || "—"}</span>
                    <span className="truncate">{locName}</span>
                    <span className="hidden sm:inline">· {daysSince(v.created_at)}d open</span>
                    <span className="hidden sm:inline">· {updated ? fmtDate(updated) : "—"}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
                {canManage && (
                  <button onClick={(e) => { e.stopPropagation(); deleteVisi(v); }} className="p-2 rounded text-slate-400 hover:bg-red-50 hover:text-red-500 touch-manipulation shrink-0"><Trash2 size={16} /></button>
                )}
              </div>
            );
          })}
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
          className="w-full rounded-lg border border-slate-200 p-2.5 text-base mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAdd(name)} disabled={!name.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}

const STANDARD_TRADES = [
  { name: "Door", code: "DR", steps: [{ id: "s1", label: "Door inspection", type: "inspection", status: "pending" }] },
  { name: "Entry door", code: "ED", steps: [{ id: "s1", label: "Entry door inspection", type: "inspection", status: "pending" }] },
  { name: "Skirting", code: "SK", steps: [{ id: "s1", label: "Skirting inspection", type: "inspection", status: "pending" }] },
  { name: "Sanitary", code: "SN", steps: [{ id: "s1", label: "Sanitary inspection", type: "inspection", status: "pending" }] },
  { name: "Robe Jamb", code: "RJ", steps: [{ id: "s1", label: "Robe jamb inspection", type: "inspection", status: "pending" }] },
];

function AddRoomModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [custom, setCustom] = useState(false);
  const [selected, setSelected] = useState({});
  const standardNames = ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Ensuite", "Bathroom", "Living / Kitchen / Dining", "Laundry", "Powder Room", "Study"];
  // Auto-select trades based on room name
  function pickName(n) {
    setName(n); setCustom(false);
    const lower = n.toLowerCase();
    const auto = {};
    if (lower.includes("bedroom 1") || lower.includes("bedroom 2")) { auto["Door"] = true; auto["Robe Jamb"] = true; auto["Skirting"] = true; }
    else if (lower.includes("bedroom 3")) { /* none */ }
    else if (lower.includes("ensuite") || lower.includes("bathroom")) { auto["Door"] = true; auto["Sanitary"] = true; }
    else if (lower.includes("living") || lower.includes("kitchen") || lower.includes("dining")) { auto["Door"] = true; auto["Skirting"] = true; }
    else if (lower.includes("laundry")) { auto["Door"] = true; auto["Skirting"] = true; }
    else if (lower.includes("powder")) { auto["Door"] = true; auto["Sanitary"] = true; auto["Skirting"] = true; }
    setSelected(auto);
  }
  const trades = STANDARD_TRADES.filter((t) => t.name !== "Entry door");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg bg-white p-6 max-w-md w-full max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-3">Add Room</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {standardNames.map((n) => (
            <button key={n} onClick={() => pickName(n)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold touch-manipulation ${name === n ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{n}</button>
          ))}
          <button onClick={() => { setCustom(true); setName(""); setSelected({}); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold touch-manipulation ${custom ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>Custom…</button>
        </div>
        {custom && <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Room name" className="w-full rounded-lg border border-slate-200 p-2.5 text-base mb-3" />}
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Visis to create</div>
          <div className="flex flex-wrap gap-2">
            {trades.map((t) => (
              <label key={t.name} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm cursor-pointer touch-manipulation ${selected[t.name] ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                <input type="checkbox" checked={!!selected[t.name]} onChange={(e) => setSelected((s) => ({ ...s, [t.name]: e.target.checked }))} className="accent-emerald-600" />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAdd(name, STANDARD_TRADES.filter((t) => selected[t.name]))} disabled={!name.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Add Room</button>
        </div>
      </div>
    </div>
  );
}

const TRADE_CODES = { "Door": "DR", "Entry door": "ED", "Skirting": "SK", "Sanitary": "SN", "Robe Jamb": "RJ", "Miscellaneous": "MI", "Utility": "MI" };
const TRADE_VISIBILITY = {
  "Door": ["Cranmore Carpenters"], "Skirting": ["Cranmore Carpenters"], "Robe Jamb": ["Cranmore Carpenters"], "Entry door": ["Cranmore Carpenters"],
  "Sanitary": ["Cranmore Carpenters", "Summerset Plumbing"], "Miscellaneous": ["Cranmore Carpenters", "Fitout & Fixtures Co"], "Utility": ["Cranmore Carpenters", "Fitout & Fixtures Co"],
};

function NewVisiModal({ projectId, locationId, onClose }) {
  const { templates, companies, project } = useQaData();
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!templateId) return;
    setSaving(true);
    try {
      const tpl = templates.find((t) => t.id === templateId);
      const steps = (tpl?.steps || []).map((s) => ({ ...s, status: "pending" }));
      const tradeName = tpl?.trade || tpl?.name || "Miscellaneous";
      const prefix = TRADE_CODES[tradeName] || "MI";
      // Find highest existing number for this prefix
      const allVisis = await readAll("Visi", { project_id: projectId });
      const prefixRegex = new RegExp(`^225-${prefix}-(\\d+)`);
      const nums = allVisis.map((v) => v.code?.match(prefixRegex)?.[1]).filter(Boolean).map(Number);
      const nextNum = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
      const code = `225-${prefix}-${String(nextNum).padStart(3, "0")}`;
      // Resolve visibility company ids
      const visCompanyNames = TRADE_VISIBILITY[tradeName] || [];
      const visCompanyIds = companies.filter((c) => visCompanyNames.includes(c.name)).map((c) => c.id);
      const v = await base44.entities.Visi.create({
        project_id: projectId, location_id: locationId, template_id: templateId,
        template_name: tpl?.name, template_revision: tpl?.revision || 1,
        code, visi_type: "Inspection", trade: tradeName, discipline: tpl?.discipline,
        system: tpl?.system, stage: tpl?.stage, steps, visible_to: visCompanyIds,
        assignee_company_id: tpl?.steps?.[0]?.assignee_company_id,
        created_at: new Date().toISOString(), last_updated: new Date().toISOString(),
        original_id: crypto.randomUUID(),
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
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-base mb-4">
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