import React, { useEffect, useMemo, useState } from 'react';
import { buildLocationTree } from '@/lib/qaUtils';
import TreeBranch from '@/components/qa/TreeBranch';
export default function LocationTree({ locations, selectedId, onSelect, mobile = false }) {
  const tree = useMemo(() => buildLocationTree(locations), [locations]);
  const [expanded, setExpanded] = useState({});
  useEffect(() => {
    if (!selectedId) return;
    const byId = Object.fromEntries(locations.map(l => [l.id, l]));
    const byOrig = Object.fromEntries(locations.map(l => [l.original_id, l]));
    const open = {}; let cur = byId[selectedId], guard = 0;
    while (cur?.parent_original_id && guard++ < 30) { const parent = byOrig[cur.parent_original_id]; if (!parent) break; open[parent.original_id] = true; cur = parent; }
    setExpanded(prev => ({ ...prev, ...open }));
  }, [selectedId, locations]);
  const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  return <div className="space-y-0.5">{(tree.root || []).map(loc => <TreeBranch key={loc.id} loc={loc} tree={tree} depth={0} selectedId={selectedId} onSelect={onSelect} expanded={expanded} toggle={toggle} mobile={mobile} />)}</div>;
}