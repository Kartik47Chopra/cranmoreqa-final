import React from 'react';
import { ChevronRight, Building2, Layers, Box, DoorOpen, MapPin } from 'lucide-react';
const TYPE_ICON = { Building: Building2, Level: Layers, Zone: Box, Unit: DoorOpen, Room: MapPin };
export default function TreeBranch({ loc, tree, depth, selectedId, onSelect, expanded, toggle, mobile }) {
  const children = tree[loc.original_id] || [], hasChildren = children.length > 0, open = !!expanded[loc.original_id];
  const Icon = TYPE_ICON[loc.type] || MapPin, selected = selectedId === loc.id, isNA = loc.status === 'na';
  return <div>
    <div className={`flex min-h-[44px] items-center gap-1 rounded-md py-1.5 pr-2 text-sm cursor-pointer ${mobile ? (selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted') : (selected ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent')}`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }} onClick={() => { if (mobile && hasChildren) toggle(loc.original_id); else { onSelect(loc); if (hasChildren) toggle(loc.original_id); } }}>
      {hasChildren ? <button aria-label={`Toggle ${loc.name}`} aria-expanded={open} onClick={e => { e.stopPropagation(); toggle(loc.original_id); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded"><ChevronRight size={14} className={open ? 'rotate-90' : ''} /></button> : <span className="h-8 w-8 shrink-0" />}
      <Icon size={14} className="shrink-0 opacity-70" /><span className={`min-w-0 flex-1 truncate font-medium ${isNA ? 'line-through opacity-50' : ''}`}>{loc.name}</span>
      {isNA && <span className="text-[9px]">N/A</span>}
      {mobile && hasChildren && <button onClick={e => { e.stopPropagation(); onSelect(loc); }} className="min-h-9 rounded border border-border px-2 text-xs font-semibold">Open</button>}
    </div>
    {hasChildren && open && <div className="ml-3 border-l border-border/20">{children.map(c => <TreeBranch key={c.id} loc={c} tree={tree} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} expanded={expanded} toggle={toggle} mobile={mobile} />)}</div>}
  </div>;
}