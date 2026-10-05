import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import PageShell from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import RoleGate from "@/components/RoleGate";
import { Users, UserPlus, Loader2, Mail } from "lucide-react";

export default function UserManagement() {
  const { companies, companyMap } = useQaData();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    setLoading(true);
    base44.entities.User.list().then((all) => setUsers(Array.isArray(all) ? all : []))
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  async function changeRole(u, role) {
    try {
      await base44.entities.User.update(u.id, { role });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role } : x));
    } catch (e) { console.error(e); }
  }

  async function changeCompany(u, company_id) {
    try {
      await base44.auth.updateMe({ data: { ...u.data, company_id } });
      // Can only update self; for other users, would need admin API
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, data: { ...x.data, company_id } } : x));
    } catch (e) { console.error(e); }
  }

  async function invite() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      setInviteEmail("");
      // Refresh list
      base44.entities.User.list().then((all) => setUsers(Array.isArray(all) ? all : []));
    } catch (e) { console.error(e); alert(e.message || "Failed to invite user"); }
    setInviting(false);
  }

  return (
    <RoleGate roles={["admin"]}>
      <PageShell title="User Management" subtitle={`${users.length} users`}>
        {/* Invite */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={18} className="text-emerald-600" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Invite User</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="email@example.com" className="flex-1 min-w-[200px] rounded-lg border border-slate-200 p-2.5 text-sm" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-lg border border-slate-200 p-2.5 text-sm">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={invite} disabled={inviting || !inviteEmail} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </div>

        {/* User list */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" size={28} /></div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users yet" message="Invite team members to join the project." />
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {(u.full_name || u.email || "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{u.full_name || u.email}</div>
                  <div className="truncate text-xs text-slate-500">{u.email}</div>
                </div>
                <select value={u.role || "user"} onChange={(e) => changeRole(u, e.target.value)} className="rounded-lg border border-slate-200 py-1.5 pl-2 pr-6 text-xs font-semibold">
                  <option value="admin">Admin</option>
                  <option value="pm">PM</option>
                  <option value="trade">Trade</option>
                  <option value="viewer">Viewer</option>
                </select>
                <select value={u.data?.company_id || ""} onChange={(e) => changeCompany(u, e.target.value)} className="rounded-lg border border-slate-200 py-1.5 pl-2 pr-6 text-xs">
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </PageShell>
    </RoleGate>
  );
}