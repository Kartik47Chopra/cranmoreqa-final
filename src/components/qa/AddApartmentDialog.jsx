import React, { useState } from 'react';
export default function AddApartmentDialog({ onAdd, onClose }) {
  const [name, setName] = useState(''), [extraRoom, setExtraRoom] = useState('Study'), [saving, setSaving] = useState(false), [error, setError] = useState('');
  async function submit(e) { e.preventDefault(); if (saving) return; setSaving(true); setError(''); try { await onAdd(name, extraRoom); } catch (e) { setError(e.message); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"><form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-card p-6 space-y-4">
    <h3 className="font-heading font-bold">Add Apartment</h3><p className="text-sm text-muted-foreground">Creates standard rooms and their Visis, including an apartment Entry door.</p>
    <input aria-label="Apartment name" value={name} onChange={e => setName(e.target.value)} required placeholder="Apartment name" className="w-full rounded border border-input p-2.5" />
    <label className="block text-sm">Final room<select value={extraRoom} onChange={e => setExtraRoom(e.target.value)} className="mt-1 w-full rounded border border-input p-2.5"><option>Study</option><option>Powder Room</option></select></label>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded border border-border px-4 py-2">Cancel</button><button disabled={saving || !name.trim()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{saving ? 'Creating...' : 'Add Apartment'}</button></div>
  </form></div>;
}