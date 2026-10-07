import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQaData } from '@/lib/QaDataContext';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import NewVisiDialog from '@/components/qa/NewVisiDialog';
import { logActivity } from '@/lib/activityLog';
export default function LocationVisis({ locationId, direct = false, toolbar = true }) {
  const { project, revision, refreshStats } = useQaData(), { user } = useAuth(), navigate = useNavigate();
  const [data, setData] = useState(null), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [showNew, setShowNew] = useState(false);
  const [bucket, setBucket] = useState(''), [type, setType] = useState(''), [sort, setSort] = useState('updated');
  const manage = ['admin', 'pm'].includes(user?.role);
  async function load(cursor = null) { setBusy(true); setError(''); try { const { data: page } = await base44.functions.invoke('aggregateStats', { project_id: project.id, location_id: locationId, direct, bucket: bucket || undefined, visi_type: type || undefined, sort, cursor, limit: 50 }); setData(page); setItems(prev => cursor ? [...prev, ...page.items] : page.items); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  useEffect(() => { if (project) load(); }, [project?.id, locationId, direct, bucket, type, sort, revision]);
  async function action(v, remove) { if (busy) return; if (remove && !confirm(`Delete Visi ${v.code}?`)) return; setBusy(true); try { await base44.entities.Visi.update(v.id, remove ? { is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id } : { override_status: 'none', override_comment: '', last_updated: new Date().toISOString() }); await logActivity({ project_id: project.id, visi_id: v.id, user: user.full_name || user.email, text: remove ? `Deleted Visi ${v.code}` : `Unmarked N/A: ${v.code}`, type: remove ? 'delete' : 'status' }); await refreshStats(); } finally { setBusy(false); } }
  return <div className="space-y-3">
    {toolbar && <div className="flex flex-wrap items-center gap-2"><select value={bucket} onChange={e => setBucket(e.target.value)} className="rounded border border-input bg-card p-2 text-sm"><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="completed">Closed</option></select><select value={type} onChange={e => setType(e.target.value)} className="rounded border border-input bg-card p-2 text-sm"><option value="">All types</option>{['Inspection','Task','Holdpoint'].map(t => <option key={t}>{t}</option>)}</select><select value={sort} onChange={e => setSort(e.target.value)} className="rounded border border-input bg-card p-2 text-sm"><option value="updated">Last updated</option><option value="code">Code</option></select><span className="ml-auto text-sm">All ({data?.totalItems ?? '…'})</span>{manage && <button onClick={() => setShowNew(true)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">New Visi</button>}</div>}
    {error && <p className="text-destructive" role="alert">{error}</p>}
    {!busy && !items.length && <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No Visis match this view.</p>}
    {items.map(v => <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"><button onClick={() => navigate(`/inspection/${v.id}`)} className="min-w-0 flex-1 text-left"><div className="font-semibold text-sm">{v.trade} <span className="font-mono text-muted-foreground">{v.code}</span></div><p className="text-xs text-muted-foreground">{v.location_name}</p></button><StatusBadge visi={v} />{manage && v.override_status === 'na' && <button disabled={busy} onClick={() => action(v, false)} className="rounded border border-border p-2 text-xs">Unmark N/A</button>}{manage && <button disabled={busy} onClick={() => action(v, true)} className="rounded border border-border p-2 text-xs text-destructive">Delete</button>}</div>)}
    {busy && <p className="text-sm text-muted-foreground">Loading...</p>}{data?.has_more && <button disabled={busy} onClick={() => load(data.next_cursor)} className="rounded border border-border bg-card px-4 py-2 text-sm">Load more</button>}
    {showNew && <NewVisiDialog projectId={project.id} locationId={locationId} onClose={() => setShowNew(false)} />}
  </div>;
}