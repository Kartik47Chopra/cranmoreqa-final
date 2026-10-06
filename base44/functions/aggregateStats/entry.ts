import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { statusBucket, checklistProgress } from "../../shared/qaStatus.ts";

// Server-side aggregation that pages through ALL Visis (never relies on a
// default list limit), ignores soft-deleted records and Visis inside N/A
// locations, and returns counts by status, building, level, trade, location
// plus subtree counts for every location. Cached for 60 seconds.
const CACHE = new Map(); // project_id -> { ts, data }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, building_id, trade, date_from, date_to, refresh } = body;
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Cache check (60s) unless refresh=true
    const now = Date.now();
    if (!refresh && CACHE.has(project_id) && now - CACHE.get(project_id).ts < 60000) {
      const cached = CACHE.get(project_id).data;
      return Response.json(applyFilters(cached, { building_id, trade, date_from, date_to }));
    }

    // Page through ALL Visis for this project (500 at a time)
    const allVisis = [];
    let cursor = null;
    for (let i = 0; i < 100; i++) {
      const page = cursor
        ? await base44.entities.Visi.list('-created_date', 500, cursor)
        : await base44.entities.Visi.filter({ project_id }, '-created_date', 500);
      const items = page.items || page;
      allVisis.push(...items);
      if (page.has_more && page.next_cursor) cursor = page.next_cursor;
      else break;
    }

    // Page through ALL Locations for this project
    const allLocs = [];
    cursor = null;
    for (let i = 0; i < 100; i++) {
      const page = cursor
        ? await base44.entities.Location.list('-created_date', 500, cursor)
        : await base44.entities.Location.filter({ project_id }, '-created_date', 500);
      const items = page.items || page;
      allLocs.push(...items);
      if (page.has_more && page.next_cursor) cursor = page.next_cursor;
      else break;
    }

    // Build location maps
    const locById = {};
    const locByOrig = {};
    for (const l of allLocs) {
      locById[l.id] = l;
      if (l.original_id) locByOrig[l.original_id] = l;
    }

    // N/A location original_ids (and their subtrees)
    const naOrigIds = new Set();
    for (const l of allLocs) {
      if (l.status === "na" && l.original_id) naOrigIds.add(l.original_id);
    }
    // Expand N/A to include descendants
    const childrenByParentOrig = {};
    for (const l of allLocs) {
      if (l.parent_original_id) {
        (childrenByParentOrig[l.parent_original_id] = childrenByParentOrig[l.parent_original_id] || []).push(l);
      }
    }
    const naExpanded = new Set(naOrigIds);
    function expandNA(origId) {
      const children = childrenByParentOrig[origId] || [];
      for (const c of children) {
        if (c.original_id && !naExpanded.has(c.original_id)) {
          naExpanded.add(c.original_id);
          expandNA(c.original_id);
        }
      }
    }
    naOrigIds.forEach(expandNA);

    // Resolve top-level building for a location via parent_original_id chain
    function buildingOf(locId) {
      let cur = locById[locId];
      let seen = 0;
      while (cur && seen < 25) {
        if (!cur.parent_original_id) return cur;
        const parent = locByOrig[cur.parent_original_id];
        if (!parent) return cur; // orphan — treat as root
        if (!parent.parent_original_id) return parent;
        cur = parent;
        seen++;
      }
      return cur;
    }

    // Filter out soft-deleted and N/A-location visis
    const activeVisis = allVisis.filter((v) => {
      if (v.is_deleted) return false;
      const loc = v.location_id ? locById[v.location_id] : null;
      if (loc && loc.status === "na") return false;
      if (v.location_original_id && naExpanded.has(v.location_original_id)) return false;
      return true;
    });

    // Aggregate
    const overall = { total: 0, completed: 0, in_progress: 0, open: 0 };
    const byBuilding = {};
    const byTrade = {};
    const byLocation = {}; // location_id -> { total, completed, in_progress, open }
    let totalSteps = 0, doneSteps = 0;

    for (const v of activeVisis) {
      const b = statusBucket(v);
      overall.total++;
      overall[b]++;

      const bld = buildingOf(v.location_id);
      const bName = bld?.name || "Unknown";
      if (!byBuilding[bName]) byBuilding[bName] = { total: 0, completed: 0, in_progress: 0, open: 0 };
      byBuilding[bName].total++;
      byBuilding[bName][b]++;

      const tName = v.trade || v.template_name || "Unknown";
      if (!byTrade[tName]) byTrade[tName] = { total: 0, completed: 0, in_progress: 0, open: 0 };
      byTrade[tName].total++;
      byTrade[tName][b]++;

      if (v.location_id) {
        if (!byLocation[v.location_id]) byLocation[v.location_id] = { total: 0, completed: 0, in_progress: 0, open: 0 };
        byLocation[v.location_id].total++;
        byLocation[v.location_id][b]++;
      }

      const { done, total } = checklistProgress(v);
      totalSteps += total;
      doneSteps += done;
    }

    // Compute subtree counts for every location (walk the tree)
    // For each location, sum its own visis + all descendant visis
    const subtreeCounts = {}; // location_id -> { total, completed, in_progress, open }
    // Group visis by location_original_id for subtree walk
    const visisByLocOrig = {};
    for (const v of activeVisis) {
      if (v.location_original_id) {
        (visisByLocOrig[v.location_original_id] = visisByLocOrig[v.location_original_id] || []).push(v);
      }
    }
    function computeSubtree(loc) {
      if (!loc) return { total: 0, completed: 0, in_progress: 0, open: 0 };
      const key = loc.id;
      if (subtreeCounts[key]) return subtreeCounts[key];
      let r = { total: 0, completed: 0, in_progress: 0, open: 0 };
      // Direct visis
      if (loc.original_id && visisByLocOrig[loc.original_id]) {
        for (const v of visisByLocOrig[loc.original_id]) {
          const b = statusBucket(v);
          r.total++; r[b]++;
        }
      }
      // Children
      const children = childrenByParentOrig[loc.original_id] || [];
      for (const c of children) {
        if (c.is_deleted) continue;
        const cs = computeSubtree(c);
        r.total += cs.total; r.completed += cs.completed; r.in_progress += cs.in_progress; r.open += cs.open;
      }
      subtreeCounts[key] = r;
      return r;
    }
    for (const l of allLocs) {
      if (!l.is_deleted) computeSubtree(l);
    }

    // Build items list for drill-downs
    const items = activeVisis.map((v) => {
      const bld = buildingOf(v.location_id);
      const { done, total } = checklistProgress(v);
      const loc = v.location_id ? locById[v.location_id] : null;
      return {
        id: v.id,
        code: v.code,
        location_id: v.location_id,
        location_name: loc?.name || "",
        template_id: v.template_id,
        template_name: v.template_name,
        trade: v.trade || v.template_name || "Unknown",
        building: bld?.name || "Unknown",
        bucket: statusBucket(v),
        done, total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        created_at: v.created_at,
        last_updated: v.last_updated,
      };
    });

    const data = {
      overall,
      byBuilding,
      byTrade,
      byLocation,
      subtreeCounts,
      checklistProgress: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
      totalItems: activeVisis.length,
      items,
      buildingNames: Object.keys(byBuilding),
      tradeNames: Object.keys(byTrade),
    };

    CACHE.set(project_id, { ts: now, data });
    return Response.json(applyFilters(data, { building_id, trade, date_from, date_to }));
  } catch (error) {
    console.error('aggregateStats error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function applyFilters(data, { building_id, trade, date_from, date_to }) {
  if (!building_id && !trade && !date_from && !date_to) return data;
  let items = data.items;
  if (building_id) items = items.filter((i) => i.building === building_id);
  if (trade) items = items.filter((i) => i.trade === trade);
  if (date_from) items = items.filter((i) => i.created_at && new Date(i.created_at) >= new Date(date_from));
  if (date_to) items = items.filter((i) => i.created_at && new Date(i.created_at) <= new Date(date_to + 'T23:59:59'));
  const overall = { total: 0, completed: 0, in_progress: 0, open: 0 };
  const byBuilding = {};
  const byTrade = {};
  for (const i of items) {
    overall.total++; overall[i.bucket]++;
    if (!byBuilding[i.building]) byBuilding[i.building] = { total: 0, completed: 0, in_progress: 0, open: 0 };
    byBuilding[i.building].total++; byBuilding[i.building][i.bucket]++;
    if (!byTrade[i.trade]) byTrade[i.trade] = { total: 0, completed: 0, in_progress: 0, open: 0 };
    byTrade[i.trade].total++; byTrade[i.trade][i.bucket]++;
  }
  return { ...data, overall, byBuilding, byTrade, items, totalItems: items.length };
}