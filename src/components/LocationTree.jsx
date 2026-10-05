import React, { useState } from "react";
import { ChevronRight, Building2, Box, DoorOpen, Layers } from "lucide-react";
import { buildLocationTree } from "@/lib/qaUtils";

function typeIcon(type) {
  if (type === "Building") return Building2;
  if (type === "Floor") return Layers;
  if (type === "Apartment") return DoorOpen;
  return Box;
}

function TreeBranch({ loc, tree, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(depth < 2);
  const children = tree[loc.id] || [];
  const hasChildren = children.length > 0;
  const Icon = typeIcon(loc.type);
  const selected = selectedId === loc.id;
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors ${
          selected ? "bg-amber-500/15 text-amber-300" : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-white"
          >
            <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <button onClick={() => onSelect(loc)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon size={14} className="shrink-0 opacity-70" />
          <span className="truncate font-medium">{loc.name}</span>
        </button>
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