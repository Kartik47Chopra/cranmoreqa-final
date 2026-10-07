import { readAll, retry } from './paging.ts';
import { locationIndex } from './stats.ts';
export const TRADE_PREFIX = { Door: 'DR', 'Entry door': 'ED', Skirting: 'SK', Sanitary: 'SN', 'Robe Jamb': 'RJ', Miscellaneous: 'MI', Utility: 'MI' };
export function allocateFromRows(rows, prefix, count) {
  if (!Object.values(TRADE_PREFIX).includes(prefix) || !Number.isInteger(count) || count < 1 || count > 300) throw new Error('Invalid prefix or count');
  const regex = new RegExp(`^225-${prefix}-(\\d+)$`);
  const highest = rows.reduce((max, v) => Math.max(max, Number(v.code?.match(regex)?.[1] || 0)), 0);
  return Array.from({ length: count }, (_, i) => `225-${prefix}-${String(highest + i + 1).padStart(3, '0')}`);
}
export async function allocateCodes(entities, prefix, count, rows) { return allocateFromRows(rows || await readAll(entities.Visi), prefix, count); }
export function standardTrades(name, racf = false) {
  if (racf && /^Room \d+/i.test(name)) return ['Door', 'Entry door', 'Skirting', 'Sanitary'];
  const n = name.toLowerCase();
  if (/^bedroom [12]$/.test(n)) return ['Door', 'Robe Jamb', 'Skirting'];
  if (n === 'bedroom 3' || n === 'study') return [];
  if (n === 'ensuite' || n === 'bathroom') return ['Door', 'Sanitary'];
  if (n.includes('living') || n === 'laundry') return ['Door', 'Skirting'];
  if (n === 'powder room') return ['Door', 'Sanitary', 'Skirting'];
  return [];
}
export function makeVisi(source, loc, code, user) {
  if (!source?.template_id || !source.steps?.length) throw new Error(`Missing trade reference for ${code}`);
  const steps = source.steps.map((s, i) => { const { completed_at, completed_by, ...pending } = s; return { ...pending, step_id: s.step_id || `step-${i + 1}`, status: 'pending', requirements: (s.requirements || []).map(({ attachment_id, ...r }) => r) }; });
  const now = new Date().toISOString();
  return { project_id: loc.project_id, location_id: loc.id, location_original_id: loc.original_id, code, visi_type: 'Inspection', trade: source.trade, template_id: source.template_id, template_name: source.template_name, template_revision: source.template_revision || 1, steps, discipline: source.discipline || '', system: source.system || '', stage: source.stage || '', assignee_company_id: source.assignee_company_id || '', reviewer_company_id: source.reviewer_company_id || '', visible_to: source.visible_to || [], original_id: crypto.randomUUID(), created_at: now, last_updated: now, created_by: user.full_name || user.email, override_status: 'none', is_deleted: false };
}
export function residentRooms(locations) {
  const idx = locationIndex(locations);
  return locations.filter(l => l.type === 'Room' && /^Room \d+/.test(l.name || '') && !idx.ancestors(l).some(p => p.is_deleted || p.status === 'na') && idx.buildingOf(l)?.name.startsWith('RACF'))
    .sort((a, b) => { const pa = idx.ancestors(a), pb = idx.ancestors(b); return (pa.at(-2)?.order || 0) - (pb.at(-2)?.order || 0) || (pa.at(-2)?.name || '').localeCompare(pb.at(-2)?.name || '') || Number(a.name.match(/^Room (\d+)/)[1]) - Number(b.name.match(/^Room (\d+)/)[1]); });
}
export async function ensureRooms(entities, project_id, user, preview = false) {
  const [visis, locations] = await Promise.all([readAll(entities.Visi), readAll(entities.Location, { project_id })]);
  const rooms = residentRooms(locations), idx = locationIndex(locations), trades = ['Door', 'Entry door', 'Skirting', 'Sanitary'];
  const missing = Object.fromEntries(trades.map(t => [t, rooms.filter(l => !visis.some(v => !v.is_deleted && v.trade === t && idx.locOf(v)?.id === l.id))]));
  const counts = Object.fromEntries(trades.map(t => [t, missing[t].length]));
  if (preview) return { rooms_found: rooms.length, would_create: counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  const records = [];
  for (const trade of trades) {
    if (!missing[trade].length) continue;
    const source = visis.find(v => !v.is_deleted && v.project_id === project_id && v.trade === trade);
    const codes = await allocateCodes(entities, TRADE_PREFIX[trade], missing[trade].length, visis);
    missing[trade].forEach((l, i) => records.push(makeVisi(source, l, codes[i], user)));
  }
  for (let i = 0; i < records.length; i += 100) await retry(() => entities.Visi.bulkCreate(records.slice(i, i + 100)));
  return { rooms_found: rooms.length, created: counts, total_created: records.length };
}