import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQaData } from '@/lib/QaDataContext';
import { Check, X, Loader2 } from 'lucide-react';
export default function VerifyPanel() {
  const { project, refreshStats } = useQaData();
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run() {
    if (busy) return; setBusy(true); setError('');
    try { const { data } = await base44.functions.invoke('selfTest', { project_id: project.id }); setResult(data); await refreshStats(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-border bg-card p-4 space-y-3">
    <div className="flex items-center justify-between"><h3 className="font-heading font-bold text-lg">Verify</h3><button disabled={busy || !project} onClick={run} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />}{result ? 'Re-run' : 'Verify'}</button></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {result && <><p className="text-sm text-muted-foreground">{result.passed} of {result.checks.length} checks passed. {new Date(result.ran_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Check</th><th className="p-2">Expected</th><th className="p-2">Actual</th><th className="p-2">Result</th></tr></thead><tbody>{result.checks.map(c => <tr key={c.id} className="border-b align-top"><td className="p-2 font-semibold">{c.id} {c.check}</td><td className="p-2 whitespace-pre-wrap">{c.expected}</td><td className="p-2 whitespace-pre-wrap">{c.actual}</td><td className="p-2">{c.pass ? <Check className="text-primary" aria-label="Pass" /> : <X className="text-destructive" aria-label="Fail" />}</td></tr>)}</tbody></table></div></>}
  </section>;
}