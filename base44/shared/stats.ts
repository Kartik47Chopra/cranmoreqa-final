import { statusBucket, checklistProgress } from './qaStatus.ts';
export const emptyCounts = () => ({ total: 0, completed: 0, in_progress: 0, open: 0 });
export function locationIndex(locations) {
  const byId = Object.fromEntries(locations.map(l => [l.id, l]));
  const byOrig = Object.fromEntries(locations.filter(l => l.original_id).map(l => [l.original_id, l]));
  const locOf = v => byOrig[v.location_original_id] || byId[v.location_id];
  const ancestors = loc => { const rows = [], seen = new Set(); while (loc && !seen.has(loc.id)) { rows.push(loc); seen.add(loc.id); loc = byOrig[loc.parent_original_id]; } return rows; };
  const buildingOf = loc => ancestors(loc).at(-1);
  return { byId, byOrig, locOf, ancestors, buildingOf };
}
export function buildStats(visis, locations, filters = {}) {
  const idx = locationIndex(locations);
  const root = idx.byId[filters.location_id];
  const roots = locations.filter(l => !l.is_deleted && !l.parent_original_id);
  const byBuilding = Object.fromEntries(roots.map(l => [l.name, emptyCounts()]));
  const trades = ['Door', 'Entry door', 'Skirting', 'Sanitary', 'Robe Jamb', 'Miscellaneous', 'Utility'];
  const byTrade = Object.fromEntries(trades.map(t => [t, emptyCounts()]));
  const byLocation = {}, subtreeCounts = Object.fromEntries(locations.filter(l => !l.is_deleted).map(l => [l.id, emptyCounts()]));
  const overall = emptyCounts(); const items = []; let doneSteps = 0, totalSteps = 0;
  for (const v of visis) {
    const loc = idx.locOf(v), path = idx.ancestors(loc), building = path.at(-1);
    if (v.is_deleted || path.some(l => l.is_deleted || l.status === 'na')) continue;
    const bucket = statusBucket(v), rawTrade = v.trade || v.template_name || 'Unknown', trade = rawTrade.startsWith('Utility') ? 'Utility' : rawTrade;
    if (filters.building_id && ![building?.id, building?.name].includes(filters.building_id)) continue;
    if (filters.trade && trade !== filters.trade) continue;
    if (filters.bucket && bucket !== filters.bucket) continue;
    if (filters.visi_type && (v.visi_type || 'Inspection') !== filters.visi_type) continue;
    if (root && !(filters.direct ? loc?.id === root.id : path.some(l => l.id === root.id))) continue;
    if (filters.date_from && new Date(v.created_at) < new Date(filters.date_from)) continue;
    if (filters.date_to && new Date(v.created_at) > new Date(filters.date_to + 'T23:59:59')) continue;
    const add = counts => { counts.total++; counts[bucket]++; };
    add(overall);
    const name = building?.name || 'Unknown'; add(byBuilding[name] ||= emptyCounts()); add(byTrade[trade] ||= emptyCounts());
    if (loc) { add(byLocation[loc.id] ||= emptyCounts()); for (const l of path) add(subtreeCounts[l.id] ||= emptyCounts()); }
    const progress = checklistProgress(v); doneSteps += progress.done; totalSteps += progress.total;
    items.push({ ...v, location_id: loc?.id || v.location_id, location_name: loc?.name || '', building: name, trade, bucket, done: progress.done, total: progress.total, pct: progress.total ? Math.round(progress.done / progress.total * 100) : 0 });
  }
  return { overall, byBuilding, byTrade, byLocation, subtreeCounts, checklistProgress: totalSteps ? Math.round(doneSteps / totalSteps * 100) : 0, totalItems: overall.total, items, buildingNames: roots.map(l => l.name), tradeNames: Object.keys(byTrade), rowsRead: { Visi: visis.length, Location: locations.length } };
}