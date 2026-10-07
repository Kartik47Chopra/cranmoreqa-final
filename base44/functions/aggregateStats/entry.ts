import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll } from '../../shared/paging.ts';
import { buildStats } from '../../shared/stats.ts';

// Summary requests (no filters, no item list) are served from a StatsSnapshot row in the
// database (valid 15 minutes), because the in-memory cache does not survive between calls.
// refresh:true recomputes from all Visis and Locations and rewrites the snapshot.
const SNAP_MS = 15 * 60 * 1000;
const FILTER_KEYS = ['building_id', 'trade', 'bucket', 'visi_type', 'location_id', 'date_from', 'date_to'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, refresh } = body;
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    const elevated = ['admin', 'pm'].includes(user.role);
    const entities = elevated ? base44.asServiceRole.entities : base44.entities;
    const noFilters = FILTER_KEYS.every((k) => !body[k]);
    const wantsItems = !!body.limit || !!body.items || !!body.full;
    const snapshots = base44.asServiceRole.entities.StatsSnapshot;
    const t0 = Date.now();

    let existing = null;
    if (elevated && noFilters) {
      existing = (await snapshots.filter({ project_id }))[0] || null;
      if (existing && !refresh && !wantsItems && Date.now() - new Date(existing.computed_at).getTime() < SNAP_MS) {
        return Response.json({ ...existing.data, items: [], snapshot: true, computed_at: existing.computed_at, ms: Date.now() - t0 });
      }
    }

    const [visis, locations] = await Promise.all([readAll(entities.Visi, { project_id }), readAll(entities.Location, { project_id })]);
    const data = buildStats(visis, locations, body);

    if (elevated && noFilters) {
      const { items, ...summary } = data;
      const row = { project_id, data: summary, computed_at: new Date().toISOString() };
      if (existing) await snapshots.update(existing.id, row); else await snapshots.create(row);
    }

    if (!body.full) {
      data.items = data.items.map((v) => ({
        id: v.id, code: v.code, trade: v.trade, template_id: v.template_id, template_name: v.template_name, visi_type: v.visi_type, override_status: v.override_status,
        claimed: v.claimed, assignee_company_id: v.assignee_company_id, fixture_label: v.fixture_label,
        location_id: v.location_id, location_original_id: v.location_original_id, location_name: v.location_name, building: v.building,
        bucket: v.bucket, done: v.done, total: v.total, pct: v.pct,
        created_at: v.created_at, last_updated: v.last_updated, closed_at: v.closed_at,
        steps: (v.steps || []).map((s) => ({ status: s.status })),
      }));
    }
    if (body.limit) {
      const offset = Math.max(0, Number(body.cursor) || 0), limit = Math.min(500, Number(body.limit));
      data.items.sort((a, b) => body.sort === 'code' ? (a.code || '').localeCompare(b.code || '') : new Date(b.last_updated || b.created_at || 0) - new Date(a.last_updated || a.created_at || 0));
      data.items = data.items.slice(offset, offset + limit);
      data.has_more = offset + limit < data.totalItems;
      data.next_cursor = data.has_more ? String(offset + limit) : null;
    } else if (!wantsItems) {
      data.items = [];
    }
    data.ms = Date.now() - t0;
    return Response.json(data);
  } catch (error) {
    console.error('aggregateStats error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}