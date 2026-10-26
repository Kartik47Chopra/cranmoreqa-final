import { readAll, retry } from './paging.ts';
import { DOOR_SCHEDULE } from './doorSchedule.ts';
import { allocateCodes, makeVisi } from './standardVisis.ts';

const DOOR_TRADES = ['Door', 'Entry door'];
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s\/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// Groups the schedule by apartment / room so each area knows how many doors the architect scheduled for it.
export function scheduleAreas() {
  const areas = new Map();
  for (const [mark, building, key0, name0, apt] of DOOR_SCHEDULE) {
    const prefix = mark.split('.')[0];
    let key = key0, name = name0;
    if (prefix === 'A' && apt) key = apt;                                  // balcony / glazed doors belong to their apartment
    else if ((key0 === '1' || key0 === '2') && /R\.(\w+)/.test(name0)) { key = name0.match(/R\.(\w+)/)[1]; name = name0.replace(/^R\.\w+\s*/, ''); }
    const id = `${building}|${key}`;
    if (!areas.has(id)) areas.set(id, { building, key, prefix: building === 'ILA' ? 'A' : 'R', apt: !!apt, name: '', marks: [] });
    const a = areas.get(id); a.marks.push(mark); if (!a.name && name && !/^APT-/.test(name)) a.name = name;
  }
  return [...areas.values()];
}

function levelName(building, key) {
  if (/^G/i.test(key)) return 'Ground Floor';
  if (/^B/i.test(key)) return building === 'RACF' ? 'Basement Part 1' : 'Ground Floor';
  if (/^1/.test(key)) return 'First Floor';
  if (/^2/.test(key)) return 'Second Floor';
  if (/^3/.test(key)) return building === 'RACF' ? 'Roof' : 'Ground Floor';
  return 'Ground Floor';
}

export function planDoors(locations, visis) {
  const live = locations.filter(l => !l.is_deleted);
  const byOrig = Object.fromEntries(live.map(l => [l.original_id, l]));
  const childrenOf = {}; live.forEach(l => { (childrenOf[l.parent_original_id] ||= []).push(l); });
  const root = (b) => live.find(l => !l.parent_original_id && l.name.startsWith(b));
  const subtreeIds = (l) => { const out = new Set(), stack = [l]; while (stack.length) { const x = stack.pop(); out.add(x.original_id); (childrenOf[x.original_id] || []).forEach(c => stack.push(c)); } return out; };
  const doorVisis = visis.filter(v => !v.is_deleted && DOOR_TRADES.includes(v.trade));
  const plans = [];
  for (const area of scheduleAreas()) {
    const rt = root(area.building); if (!rt) continue;
    const inBuilding = subtreeIds(rt); const cand = live.filter(l => inBuilding.has(l.original_id));
    let homes;
    if (area.prefix === 'A') homes = cand.filter(l => new RegExp(`^Apartment ${area.key}\\b`, 'i').test(l.name));
    else homes = cand.filter(l => new RegExp(`^(R\\.${area.key}\\b|Room ${area.key}\\b)`, 'i').test(l.name));
    if (!homes.length) homes = cand.filter(l => new RegExp(`^${area.prefix}\\.${area.key}\\b`, 'i').test(l.name));
    const ids = new Set(); homes.forEach(h => subtreeIds(h).forEach(i => ids.add(i)));
    const existing = doorVisis.filter(v => ids.has(v.location_original_id)).length;
    const deficit = area.marks.length - existing;
    if (deficit <= 0) continue;
    const labelled = new Set(doorVisis.filter(v => v.fixture_label).map(v => v.fixture_label));
    const marks = area.marks.filter(m => !labelled.has(m)).slice(-deficit);
    let home = homes[0], createLocation = null;
    if (!home) {
      const resident = area.prefix === 'R' && /^[12]\d\d$/.test(area.key) && /BED/i.test(area.name);
      const name = resident ? `Room ${area.key} · ${area.name}` : `${area.prefix}.${area.key} ${titleCase(area.name) || 'Doors'}`.trim();
      const level = (childrenOf[rt.original_id] || []).find(l => l.name === levelName(area.building, area.key)) || rt;
      createLocation = { name, parent: level, type: 'Room' };
    }
    plans.push({ area: `${area.building} ${area.prefix}.${area.key}`, scheduled: area.marks.length, existing, marks: marks.slice(0, deficit), home, createLocation });
  }
  return plans;
}

export async function syncDoors(entities, project_id, user, preview = false) {
  const [visis, locations] = await Promise.all([readAll(entities.Visi), readAll(entities.Location, { project_id })]);
  const plans = planDoors(locations, visis), total = plans.reduce((n, p) => n + p.marks.length, 0);
  const summary = { areas_short: plans.length, locations_to_create: plans.filter(p => p.createLocation).length, doors_to_add: total };
  if (preview || !total) return { ...summary, sample: plans.slice(0, 15).map(p => `${p.area}: ${p.existing}/${p.scheduled}${p.createLocation ? ' (new room)' : ''}`) };
  const source = visis.find(v => !v.is_deleted && v.project_id === project_id && v.trade === 'Door' && v.steps?.length);
  const codes = await allocateCodes(entities, 'DR', total, visis);
  const records = []; let c = 0;
  for (const p of plans) {
    let home = p.home;
    if (!home) {
      const siblings = locations.filter(l => l.parent_original_id === p.createLocation.parent.original_id).length;
      home = await entities.Location.create({ project_id, parent_original_id: p.createLocation.parent.original_id, parent_id: p.createLocation.parent.id, name: p.createLocation.name, type: 'Room', order: siblings, original_id: crypto.randomUUID(), status: 'active', is_deleted: false });
    }
    for (const mark of p.marks) { const v = makeVisi(source, home, codes[c++], user); v.fixture_label = mark; records.push(v); }
  }
  for (let i = 0; i < records.length; i += 100) await retry(() => entities.Visi.bulkCreate(records.slice(i, i + 100)));
  return { ...summary, created: records.length };
}
