// Re-slices the snapshot summary by building and/or trade on the device (no server call).
const empty = () => ({ total: 0, completed: 0, in_progress: 0, open: 0 });
const add = (a, b) => { a.total += b.total; a.completed += b.completed; a.in_progress += b.in_progress; a.open += b.open; };

export function filterAgg(agg, building, trade) {
  if (!agg || (!building && !trade)) return agg;
  const overall = empty(), byBuilding = {}, byTrade = {};
  Object.entries(agg.byBuildingTrade || {}).forEach(([b, trades]) => {
    if (building && b !== building) return;
    Object.entries(trades).forEach(([t, c]) => {
      if (trade && t !== trade) return;
      add(overall, c);
      add(byBuilding[b] ||= empty(), c);
      add(byTrade[t] ||= empty(), c);
    });
  });
  return { ...agg, overall, byBuilding, byTrade, totalItems: overall.total };
}