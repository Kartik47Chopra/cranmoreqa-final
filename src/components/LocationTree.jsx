import React, { useState } from "react";
import { ChevronRight, Building2, Layers, Box, DoorOpen, MapPin } from "lucide-react";
import { buildLocationTree } from "@/lib/qaUtils";

const TYPE_ICON = {
  Building: Building2,
  Level: Layers,
  Zone: Box,
  Unit: DoorOpen,
  Room: MapPin,
};

function TreeBranch({ loc, tree, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(depth < 2);
  const children = tree[loc.original_id] || [];
  const hasChildren = children.length > 0;
  const Icon = TYPE_ICON[loc.type] || MapPin;
  const selected = selectedId === loc.id;
  const isNA = loc.status === "na";

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors cursor-pointer ${
          selected ? "bg-emerald-500/15 text-emerald-300" : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(loc)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-white"
          >
            <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Icon size={14} className={`shrink-0 ${isNA ? "opacity-30" : "opacity-70"}`} />
        <span className={`truncate font-medium ${isNA ? "line-through decoration-slate-600 text-slate-500" : ""}`}>{loc.name}</span>
        {isNA && (
          <span className="ml-auto shrink-0 text-[9px] font-bold text-slate-500 bg-slate-700/60 rounded px-1 py-px">N/A</span>
        )}
      </div>
      {hasChildren && open && (
        <div className="ml-3 border-l border-slate-800/60">
          {children.map((c) => (
            <TreeBranch key={c.id} loc={c} tree={tree} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function LocationTree({ locations, selectedId, onSelect }) {
  const tree = buildLocationTree(locations);
  const roots = tree["root"] || [];
  return (
    <div className="space-y-0.5">
      {roots.map((r) => (
        <TreeBranch key={r.id} loc={r} tree={tree} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}