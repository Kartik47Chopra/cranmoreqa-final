import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Every new account gets full (admin) access straight away, so nobody has to change their role by hand.
// Accounts an admin has deliberately set to "pm" or "trade" are left alone.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (['admin', 'pm', 'trade'].includes(user.role)) return Response.json({ changed: false, role: user.role });
    await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
    return Response.json({ changed: true, role: 'admin' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
