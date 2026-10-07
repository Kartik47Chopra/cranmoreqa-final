// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { jsPDF } from 'npm:jspdf@4.2.1';
import { readAll } from '../../shared/paging.ts';
import { buildStats, locationIndex } from '../../shared/stats.ts';
import { isStepComplete } from '../../shared/qaStatus.ts';
import { buildProgressPdf, pdfText } from '../../shared/pdfBuilder.ts';

const toBase64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const auDate = (d) => d ? new Date(d).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' }) : '-';
const activityOf = (v) => v.closed_at || v.last_updated || v.created_at || v.created_date;

// Turns the filtered Visis into grouped, sorted rows for the PDF builder (exported so it can be unit-tested).
export function buildRows(items, idx, photosByVisi = {}) {
  const rows = items.map((v) => {
    const path = idx.ancestors(idx.locOf(v));
    const steps = v.steps || [], done = steps.filter(isStepComplete);
    return {
      sortKey: [...path].reverse().map((l) => String(l.order ?? 0).padStart(5, '0')).join('.') + '|' + (v.trade || '') + '|' + (v.code || ''),
      building: v.building, level: path.length > 1 ? path.at(-2).name : v.building,
      location: path.length > 2 ? path.slice(0, -2).reverse().map((l) => l.name).join(' / ') : (path[0]?.name || '-'),
      code: v.code, trade: v.trade,
      statusLabel: v.bucket === 'completed' ? 'Closed' : `In Progress (${done.length}/${steps.length})`,
      stepsText: done.length ? `${done.length} of ${steps.length} steps: ${done.map((s) => s.label).join(', ')}` : '',
      lastActivity: auDate(activityOf(v)), who: '', photos: photosByVisi[v.id] || [],
    };
  }).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const groups = [];
  for (const r of rows) {
    const k = r.building + '|' + r.level + '|' + r.location; let g = groups.at(-1);
    if (!g || g.key !== k) { g = { key: k, building: r.building, level: r.level, location: r.location, items: [] }; groups.push(g); }
    g.items.push(r);
  }
  const agg = {};
  for (const v of items) { const s = (agg[v.building + '|' + v.trade] ||= { building: v.building, trade: v.trade, total: 0, completed: 0, inProgress: 0, na: 0 }); s.total++; if (v.bucket === 'completed') s.completed++; else s.inProgress++; }
  const summaryRows = Object.values(agg).map((s) => ({ ...s, pct: s.total ? Math.round((s.completed / s.total) * 100) + '%' : '0%' }));
  return { groups, summaryRows };
}

export function filterItems(items, { include = 'both', onlyUnclaimed = false, dateFrom, dateTo }) {
  const from = dateFrom ? new Date(dateFrom) : null, to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
  return items.filter((v) => {
    if (v.override_status === 'na') return false;
    if (include === 'completed' ? v.bucket !== 'completed' : include === 'in_progress' ? v.bucket !== 'in_progress' : v.bucket === 'open') return false;
    if (onlyUnclaimed && v.claimed) return false;
    const a = activityOf(v) ? new Date(activityOf(v)) : null;
    if (from && (!a || a < from)) return false;
    if (to && (!a || a > to)) return false;
    return true;
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { projectId, projectName = 'Project', title = 'Progress Claim', building, trade, dateFrom, dateTo, include = 'both', onlyUnclaimed = false } = await req.json().catch(() => ({}));
    if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });

    const E = ['admin', 'pm'].includes(user.role) ? base44.asServiceRole.entities : base44.entities;
    const [visis, locations] = await Promise.all([readAll(E.Visi, { project_id: projectId }), readAll(E.Location, { project_id: projectId })]);
    const idx = locationIndex(locations);
    const stats = buildStats(visis, locations, { building_id: building && building !== 'all' ? building : undefined, trade: trade && trade !== 'all' ? trade : undefined });
    const items = filterItems(stats.items, { include, onlyUnclaimed, dateFrom, dateTo });
    if (!items.length) return Response.json({ error: 'No items match the selected filters.' }, { status: 400 });

    // photos: thumbnails first (about 400 px), at most 3 per Visi, fetched 8 at a time
    const atts = [], idList = items.map((v) => v.id);
    for (let i = 0; i < idList.length; i += 200) atts.push(...await readAll(E.Attachment, { visi_id: { $in: idList.slice(i, i + 200) } }));
    const photosByVisi = {}, jobs = [];
    for (const a of atts.filter((x) => !x.is_deleted).sort((p, q) => String(p.uploaded_at).localeCompare(String(q.uploaded_at)))) {
      const uri = a.thumb_uri || ((a.size || 0) < 300000 ? a.file_uri : null);
      if (!uri || String(uri).startsWith('pending:')) continue;
      const list = (photosByVisi[a.visi_id] ||= []);
      if (list.length >= 3) continue;
      list.push(null); const slot = list.length - 1;
      jobs.push(async () => {
        try {
          const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 600 });
          const r = await fetch(signed_url); if (!r.ok) return;
          list[slot] = { data: 'data:image/jpeg;base64,' + toBase64(await r.arrayBuffer()) };
        } catch (_) { /* leaves "No photo" */ }
      });
    }
    for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map((f) => f()));
    for (const k of Object.keys(photosByVisi)) photosByVisi[k] = photosByVisi[k].filter(Boolean);

    const { groups, summaryRows } = buildRows(items, idx, photosByVisi);
    const dateLabel = dateFrom || dateTo ? `${dateFrom || 'start'} to ${dateTo || 'today'}` : 'All work to date';
    const out = buildProgressPdf(jsPDF, { projectName, title, dateLabel, generatedLabel: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }), summaryRows, groups });
    if (out.overlaps > 0 || out.outOfBounds > 0) throw new Error(`PDF layout check failed (${out.overlaps} overlaps, ${out.outOfBounds} out of bounds)`);
    const filename = `${title.replace(/\s+/g, '-')}_${pdfText(projectName).replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([out.bytes], filename, { type: 'application/pdf' }) });
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
    return Response.json({ url: signed_url, filename, pages: out.pages, items: out.items, photosEmbedded: out.photosEmbedded, overlaps: out.overlaps, bytes: out.bytes.byteLength });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}
