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
import LocationVisis from '@/components/qa/LocationVisis';
import AddApartmentDialog from '@/components/qa/AddApartmentDialog';
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
  const { locationMap, locations, templateMap, companyMap, project, reload, stats, refreshStats, revision } = useQaData();
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
    if (!locationId || !project?.id) return;
    setLoading(true);
    Promise.all([
      readAll('Attachment', { location_id: locationId }),
      readAll('Document', { project_id: project.id }),
      readAll('Milestone', { project_id: project.id }),
    ]).then(([a, d, m]) => {
      const loc = locationMap[locationId];
      setAttachments(a.filter(x => !x.is_deleted));
      setDocuments(d.filter(x => !x.is_deleted && (x.location_id === locationId || x.location_original_id === loc?.original_id)));
      setMilestones(m.filter(x => (x.location_ids || []).includes(locationId) || (x.location_ids || []).includes(loc?.original_id)));
    }).finally(() => setLoading(false));
  }, [locationId, project?.id, locations]);
  useEffect(() => { setSubtreeCounts(stats?.subtreeCounts || {}); }, [stats]);
  const loc = locationMap[locationId];
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

  const [actionSaving, setActionSaving] = useState(false);
  async function toggleNA(target = loc) {
    if (!target || actionSaving || !['admin', 'pm'].includes(user?.role)) return;
    setActionSaving(true);
    try {
      const status = target.status === 'na' ? 'active' : 'na';
      await base44.entities.Location.update(target.id, { status });
      await logActivity({ project_id: target.project_id, user: user.full_name || user.email, text: `${status === 'na' ? 'Marked N/A' : 'Unmarked N/A'}: ${target.name}`, type: 'status' });
      setShowNAConfirm(false); await refreshStats(); await reload();
    } finally { setActionSaving(false); }
  }
  async function saveName() {
    if (!nameValue.trim() || actionSaving) return;
    setActionSaving(true);
    try { await base44.entities.Location.update(loc.id, { name: nameValue.trim() }); setEditingName(false); await refreshStats(); await reload(); }
    finally { setActionSaving(false); }
  }
  async function addApartment(name, extraRoom) {
    const { data } = await base44.functions.invoke('createStandardLocations', { project_id: project.id, location_id: loc.id, kind: 'apartment', name, extraRoom });
    await refreshStats(); await reload(); setShowAddApt(false); navigate(`/location/${data.location.id}`);
  }
  async function addRoom(name, trades) {
    await base44.functions.invoke('createStandardLocations', { project_id: project.id, location_id: loc.id, kind: 'room', name, trades: trades.map(t => t.name) });
    await refreshStats(); await reload(); setShowAddRoom(false);
  }
  async function deleteLoc(l) {
    const childCount = locations.filter((x) => x.parent_original_id === l.original_id).length;
    if (!confirm(`Delete "${l.name}"?${childCount > 0 ? ` It has ${childCount} sub-locations and their Visis.` : ""} This is a soft delete.`)) return;
    try {
      await base44.entities.Location.update(l.id, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id });
      await logActivity({ project_id: l.project_id, user: user?.full_name || user?.email, text: `deleted location "${l.name}"`, type: "delete" });
      await refreshStats(); await reload();
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
    <div className="flex flex-1 min-h-0 flex-col min-w-0">
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
          <button disabled={actionSaving || !canManage} onClick={() => loc.status === 'na' ? toggleNA() : setShowNAConfirm(true)} style={{ touchAction: "manipulation" }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors touch-manipulation ${loc.status === "na" ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            <Ban size={15} /> <span>{loc.status === 'na' ? 'Unmark N/A' : 'Mark N/A'}</span>
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
            {t.key === 'visis' && <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{stats?.subtreeCounts?.[locationId]?.total ?? '…'}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50 px-4 md:px-6 py-4">
        {loc.status === 'na' && <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm"><span className="flex-1">This location is marked N/A and excluded from counts.</span>{canManage && <button disabled={actionSaving} onClick={() => toggleNA()} className="rounded border border-border bg-card px-3 py-2 font-semibold">Unmark N/A</button>}</div>}
        {tab === 'overview' && <OverviewTab loc={loc} isUnit={isUnit} childLocations={childLocations} subtreeCounts={subtreeCounts} navigate={navigate} canManage={canManage} onEditName={() => { setNameValue(loc.name); setEditingName(true); }} onAddApt={() => setShowAddApt(true)} onAddRoom={() => setShowAddRoom(true)} onDeleteLoc={deleteLoc} onUnmark={toggleNA} actionSaving={actionSaving} />}
        {tab === 'visis' && <LocationVisis locationId={locationId} />}
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
              <button disabled={actionSaving} onClick={() => toggleNA()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{actionSaving ? 'Saving...' : 'Mark N/A'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add apartment modal */}
      {showAddApt && <AddApartmentDialog onAdd={addApartment} onClose={() => setShowAddApt(false)} />}
      {/* Add room modal */}
      {showAddRoom && <AddRoomModal onAdd={addRoom} onClose={() => setShowAddRoom(false)} />}
    </div>
  );
}

function OverviewTab({ loc, isUnit, childLocations, subtreeCounts, navigate, canManage, onEditName, onAddApt, onAddRoom, onDeleteLoc, onUnmark, actionSaving }) {
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
                      {canManage && isNA && <button disabled={actionSaving} onClick={() => onUnmark(c)} className="rounded border border-border bg-card px-2 py-2 text-xs shrink-0">Unmark N/A</button>}
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
            <LocationVisis locationId={loc.id} direct toolbar={false} />
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