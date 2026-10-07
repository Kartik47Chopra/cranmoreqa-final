import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll } from '../../shared/paging.ts';
import { buildStats } from '../../shared/stats.ts';

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
    const { project_id, refresh } = body;
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    const elevated = ['admin', 'pm'].includes(user.role);
    const entities = elevated ? base44.asServiceRole.entities : base44.entities;
    const key = `${project_id}:${user.id}`;
    let source = CACHE.get(key);
    if (refresh || !source || Date.now() - source.ts >= 300000) {
      const [visis, locations] = await Promise.all([readAll(entities.Visi, { project_id }), readAll(entities.Location, { project_id })]);
      source = { ts: Date.now(), visis, locations };
      CACHE.set(key, source);
    }
    const data = buildStats(source.visis, source.locations, body);
    // Slim items: keep only what the screens read (steps reduced to their statuses so status badges still work).
    // Backend functions that need full documents (generatePdf) call buildStats directly.
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
      const offset = Math.max(0, Number(body.cursor) || 0), limit = Math.min(50, Number(body.limit));
      data.items.sort((a, b) => body.sort === 'code' ? (a.code || '').localeCompare(b.code || '') : new Date(b.last_updated || b.created_at || 0) - new Date(a.last_updated || a.created_at || 0));
      data.items = data.items.slice(offset, offset + limit);
      data.has_more = offset + limit < data.totalItems;
      data.next_cursor = data.has_more ? String(offset + limit) : null;
    }
    return Response.json(data);
  } catch (error) {
    console.error('aggregateStats error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}