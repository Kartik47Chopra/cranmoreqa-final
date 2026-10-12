import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Lets app admins list users and set their role and company from User Management,
// without needing to be a Base44 collaborator. Admin only.
const ROLES = ['admin', 'pm', 'trade', 'viewer'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { action, user_id, role, company_id } = await req.json().catch(() => ({}));
    const e = base44.asServiceRole.entities;

    if (action === 'list') {
      const users = await e.User.list();
      return Response.json({ users: users.map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, company_id: u.company_id || u.data?.company_id || null })) });
    }

    if (action === 'update') {
      if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });
      const patch = {};
      if (role !== undefined) { if (!ROLES.includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 }); patch.role = role; }
      if (company_id !== undefined) patch.company_id = company_id || null;
      if (user_id === user.id && patch.role && patch.role !== 'admin') return Response.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
      await e.User.update(user_id, patch);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
