import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ensureRooms } from '../../shared/standardVisis.ts';
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { project_id, preview = false } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    const result = await ensureRooms(base44.asServiceRole.entities, project_id, user, preview);
    if (!preview) await base44.functions.invoke('aggregateStats', { project_id, refresh: true, limit: 1 });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}