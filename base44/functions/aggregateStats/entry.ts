import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { statusBucket, checklistProgress, activityDate } from "../../shared/qaStatus.ts";

// Aggregate QA stats on the server so the dashboard / report never load
// every inspection into the browser. Returns counts by building, trade,
// and overall, plus the per-bucket breakdown.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, building_id, location_id, trade, date_from, date_to } = body;

    // Paginate through all visis for this project (RLS handles scoping)
    let all = [];
    let cursor = null;
    const filter = {};
    if (project_id) filter.project_id = project_id;
    if (location_id) filter.location_id = location_id;

    for (let i = 0; i < 50; i++) {
      const page = cursor
        ? await base44.entities.Visi.list('-created_date', 500, cursor)
        : await base44.entities.Visi.filter(filter, '-created_date', 500);
      all = all.concat(page.items || page);
      if (page.next_cursor && page.has_more) {
        cursor = page.next_cursor;
      } else if (Array.isArray(page)) {
        // filter() returns a plain array (no pagination)
        break;
      } else {
        break;
      }
    }

    // Load locations for building/trade grouping
    const locations = project_id
      ? await base44.entities.Location.filter({ project_id })
      : await base44.entities.Location.list();

    const locMap = {};
    for (const l of (Array.isArray(locations) ? locations : locations.items || [])) {
      locMap[l.id] = l;
    }

    // Find top-level building for each location
    function buildingOf(locId) {
      let cur = locMap[locId];
      let seen = 0;
      while (cur && cur.parent_id && seen < 20) {
        const parent = locMap[cur.parent_id];
        if (!parent || !parent.parent_id) return parent || cur;
        cur = parent;
        seen++;
      }
      return cur;
    }

    // Date filter
    let filtered = all;
    if (date_from || date_to) {
      filtered = all.filter((v) => {
        const d = activityDate(v);
        if (!d) return !date_from && !date_to; // keep items with no date only if no filter
        const dt = new Date(d);
        if (date_from && dt < new Date(date_from)) return false;
        if (date_to && dt > new Date(date_to + 'T23:59:59')) return false;
        return true;
      });
    }

    // Building filter
    if (building_id) {
      filtered = filtered.filter((v) => {
        const b = buildingOf(v.location_id);
        return b && b.id === building_id;
      });
    }

    // Trade filter (template discipline or system)
    if (trade) {
      filtered = filtered.filter((v) => {
        const tpl = v;
        return tpl.discipline === trade || tpl.system === trade || tpl.template_name === trade;
      });
    }

    // Aggregate
    const byBuilding = {};
    const byTrade = {};
    const overall = { total: 0, completed: 0, in_progress: 0, open: 0 };

    for (const v of filtered) {
      const b = statusBucket(v);
      overall.total++;
      overall[b]++;

      const bld = buildingOf(v.location_id);
      const bName = bld?.name || "Unknown";
      if (!byBuilding[bName]) byBuilding[bName] = { total: 0, completed: 0, in_progress: 0, open: 0 };
      byBuilding[bName].total++;
      byBuilding[bName][b]++;

      const tName = v.discipline || v.template_name || "Unknown";
      if (!byTrade[tName]) byTrade[tName] = { total: 0, completed: 0, in_progress: 0, open: 0 };
      byTrade[tName].total++;
      byTrade[tName][b]++;
    }

    // Checklist progress overall
    let totalSteps = 0, doneSteps = 0;
    for (const v of filtered) {
      const { done, total } = checklistProgress(v);
      totalSteps += total;
      doneSteps += done;
    }

    // Build minimal item list for drill-downs
    const items = filtered.map((v) => {
      const bld = buildingOf(v.location_id);
      const { done, total } = checklistProgress(v);
      return {
        id: v.id,
        code: v.code,
        location_id: v.location_id,
        template_id: v.template_id,
        template_name: v.template_name,
        building: bld?.name || "Unknown",
        trade: v.discipline || v.template_name || "Unknown",
        bucket: statusBucket(v),
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    return Response.json({
      overall,
      byBuilding,
      byTrade,
      checklistProgress: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
      totalItems: filtered.length,
      items,
    });
  } catch (error) {
    console.error('aggregateStats error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}