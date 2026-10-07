import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { allocateCodes } from '../../shared/standardVisis.ts';
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || !['admin', 'pm'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { prefix, count } = await req.json();
    const codes = await allocateCodes(base44.asServiceRole.entities, prefix, count);
    return Response.json({ codes, created: 0 });
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}