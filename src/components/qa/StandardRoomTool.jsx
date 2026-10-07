import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQaData } from '@/lib/QaDataContext';
export default function StandardRoomTool() {
  const { project, reload, refreshStats } = useQaData();
  const [preview, setPreview] = useState(null), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(previewOnly) {
    if (busy) return; setBusy(true); setError('');
    try { const { data } = await base44.functions.invoke('ensureStandardRoomVisis', { project_id: project.id, preview: previewOnly }); if (previewOnly) setPreview(data); else { setResult(data); setPreview(null); await refreshStats(); await reload(); } }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-border bg-card p-4 space-y-3">
    <h3 className="font-semibold">Standard RACF room Visis</h3>
    <button disabled={busy || !project} onClick={() => run(true)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? 'Checking...' : 'Add standard Visis to RACF rooms'}</button>
    {preview && <div className="space-y-2 text-sm"><p>Rooms found: {preview.rooms_found}</p>{Object.entries(preview.would_create).map(([trade, n]) => <p key={trade}>{trade}: {n} to create</p>)}<button disabled={busy} onClick={() => run(false)} className="rounded bg-primary px-3 py-2 text-primary-foreground">Confirm additions</button></div>}
    {result && <p className="text-sm">{result.rooms_found} rooms checked; {result.total_created} Visis created.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}