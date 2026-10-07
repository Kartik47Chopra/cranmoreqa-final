import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll, retry } from '../../shared/paging.ts';
import { allocateCodes, makeVisi, standardTrades, TRADE_PREFIX } from '../../shared/standardVisis.ts';
import { locationIndex } from '../../shared/stats.ts';
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || !['admin', 'pm'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { project_id, location_id, kind, name, extraRoom = 'Study', trades, template_id, preview = false } = await req.json();
    if (!project_id || !location_id || !['apartment', 'room', 'visi'].includes(kind) || (kind !== 'visi' && (!name?.trim() || name.length > 150))) return Response.json({ error: 'Invalid creation request' }, { status: 400 });
    if (kind === 'apartment' && !['Study', 'Powder Room'].includes(extraRoom)) return Response.json({ error: 'Select Study or Powder Room' }, { status: 400 });
    const entities = base44.asServiceRole.entities;
    const [visis, locations, templates] = await Promise.all([readAll(entities.Visi), readAll(entities.Location, { project_id }), readAll(entities.Template)]);
    const idx = locationIndex(locations), parent = idx.byId[location_id];
    if (!parent || parent.is_deleted) return Response.json({ error: 'Location not found' }, { status: 404 });
    const isRacf = idx.buildingOf(parent)?.name.startsWith('RACF');
    const plans = kind === 'apartment' ? [{ name: name.trim(), type: 'Unit', trades: ['Entry door'] }, ...['Bedroom 1','Bedroom 2','Bedroom 3','Ensuite','Bathroom','Living / Kitchen / Dining','Laundry',extraRoom].map(n => ({ name: n, type: 'Room', trades: standardTrades(n) }))] : kind === 'room' ? [{ name: name.trim(), type: 'Room', trades: /^Room \d+/.test(name) && isRacf ? standardTrades(name, true) : trades || standardTrades(name) }] : [{ name: parent.name, type: parent.type, trades: [] }];
    const tpl = templates.find(t => t.id === template_id);
    if (kind === 'visi') { if (!tpl) throw new Error('Select a template'); plans[0].trades = [tpl.trade || tpl.name]; }
    const wanted = plans.flatMap(p => p.trades), sourceByTrade = {};
    for (const trade of new Set(wanted)) {
      const source = visis.find(v => !v.is_deleted && v.project_id === project_id && (kind === 'visi' ? v.template_id === template_id : v.trade === trade));
      sourceByTrade[trade] = source || (kind === 'visi' ? { ...tpl, template_id: tpl.id, template_name: tpl.name, trade, steps: tpl.steps } : null);
      if (!sourceByTrade[trade]?.steps?.length) throw new Error(`No checklist reference for ${trade}`);
    }
    const codePools = {};
    for (const trade of new Set(wanted)) { const prefix = TRADE_PREFIX[trade] || (trade.startsWith('Utility') ? 'MI' : null); if (!prefix) throw new Error('Unknown trade'); const total = wanted.filter(t => (TRADE_PREFIX[t] || 'MI') === prefix).length; if (!codePools[prefix]) codePools[prefix] = await allocateCodes(entities, prefix, total, visis); }
    if (preview) return Response.json({ locations: kind === 'visi' ? 0 : plans.length, visis: wanted.length, trades: wanted, codes: Object.values(codePools).flat(), created: 0 });
    const createdLocations = [], records = []; let unit;
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const loc = kind === 'visi' ? parent : await entities.Location.create({ project_id, parent_original_id: (i > 0 && kind === 'apartment' ? unit : parent).original_id, parent_id: (i > 0 && kind === 'apartment' ? unit : parent).id, name: plan.name, type: plan.type, order: i > 0 ? i - 1 : locations.filter(l => l.parent_original_id === parent.original_id).length, original_id: crypto.randomUUID(), status: 'active', is_deleted: false });
      if (i === 0) unit = loc;
      if (kind !== 'visi') createdLocations.push(loc);
      for (const trade of plan.trades) { const prefix = TRADE_PREFIX[trade] || 'MI'; records.push(makeVisi(sourceByTrade[trade], loc, codePools[prefix].shift(), user)); }
    }
    const createdVisis = [];
    for (let i = 0; i < records.length; i += 100) createdVisis.push(...await retry(() => entities.Visi.bulkCreate(records.slice(i, i + 100))));
    await entities.Activity.create({ project_id, user: user.full_name || user.email, type: 'bulk_create', text: `Created ${kind}: ${name || parent.name}, ${records.length} Visis`, created_at: new Date().toISOString() });
    await base44.functions.invoke('aggregateStats', { project_id, refresh: true, limit: 1 });
    return Response.json({ location: unit, locations_created: createdLocations.length, visis_created: records.length, visi: createdVisis[0] });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}