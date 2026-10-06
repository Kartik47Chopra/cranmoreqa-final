import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll, freshCounts, recoveryEntities, retry, pause } from '../../shared/paging.ts';
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    const input = await req.json();
    const entities = base44.asServiceRole.entities;
    if (input.action === 'counts') return Response.json({ counts: await freshCounts(entities) });
    if (input.confirm !== 'RESET') return Response.json({ error: 'Type RESET to confirm' }, { status: 400 });
    const before = await freshCounts(entities);
    const projects = await readAll(entities.Project);
    const docs = await readAll(entities.Document);
    for (const project of projects) {
      const byName = new Map((project.saved_file_index || []).map(f => [f.upload_filename, f]));
      for (const d of docs.filter(d => d.project_id === project.id && d.file_uri && !d.file_uri.startsWith('pending:'))) {
        byName.set(d.upload_filename || d.filename, { upload_filename: d.upload_filename || d.filename, file_uri: d.file_uri, content_type: d.content_type || '', size: d.size || 0 });
      }
      if (byName.size) await entities.Project.update(project.id, { saved_file_index: [...byName.values()] });
    }
    let deleted = 0; const failures = []; const started = Date.now();
    for (let pass = 0; pass < 100; pass++) {
      let found = 0;
      for (const name of recoveryEntities) {
        const page = await retry(() => entities[name].list({ limit: 500, sort: 'id' }));
        found += page.items.length;
        for (let i = 0; i < page.items.length; i += 25) {
          const group = page.items.slice(i, i + 25);
          for (let j = 0; j < group.length; j += 6) {
            const results = await Promise.allSettled(group.slice(j, j + 6).map(r => retry(() => entities[name].delete(r.id))));
            results.forEach(r => { if (r.status === 'fulfilled') deleted++; else failures.push(`${name}: ${r.reason.message}`); });
          }
          await pause(100);
          if (input.action === 'step' || Date.now() - started > 180000) {
            const after = await freshCounts(entities);
            return Response.json({ before, after, deleted, done: Object.values(after).every(n => n === 0), failures });
          }
        }
      }
      if (!found) break;
    }
    const after = await freshCounts(entities);
    return Response.json({ before, after, deleted, done: Object.values(after).every(n => n === 0), failures });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}