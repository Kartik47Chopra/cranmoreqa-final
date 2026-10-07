import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll } from '../../shared/paging.ts';
import { locationIndex } from '../../shared/stats.ts';
import { ensureRooms, residentRooms, allocateCodes, makeVisi } from '../../shared/standardVisis.ts';
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { project_id } = await req.json(); if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    const e = base44.asServiceRole.entities, checks = [];
    const add = (id, check, expected, actual, pass) => checks.push({ id, check, expected, actual, pass });
    const [visis, locs] = await Promise.all([readAll(e.Visi, { project_id }), readAll(e.Location, { project_id })]);
    const stats = (await base44.functions.invoke('aggregateStats', { project_id, refresh: true, limit: 1 })).data;
    const duplicate = (rows, field) => { const seen = new Set(), dup = []; for (const r of rows) if (r[field]) { if (seen.has(r[field])) dup.push(r[field]); seen.add(r[field]); } return dup; };
    const codesDup = duplicate(visis, 'code'), origDup = duplicate(visis, 'original_id');
    const deleted = visis.filter(v => v.is_deleted).length;
    add('T1', 'Full reads and unique identifiers', '1532 Visis (1527 active + 5 deleted); 731 locations; 0 duplicate codes/original IDs', `${visis.length} Visis (${visis.length - deleted} active + ${deleted} deleted); ${locs.length} locations; ${codesDup.length}/${origDup.length} duplicates`, visis.length === 1532 && deleted === 5 && locs.length === 731 && !codesDup.length && !origDup.length);
    const b = stats.byBuilding, o = stats.overall;
    const bCounts = ['RACF · Aged Care Facility','ILA · Independent Living Apartments','General / Whole Site'].map(n => b[n]?.total || 0);
    add('T2', 'Overall and buildings', '1527 / 0 Closed / 71 In Progress / 1456 Open; 3 buildings: 657 / 869 / 1', `${o.total} / ${o.completed} Closed / ${o.in_progress} In Progress / ${o.open} Open; ${Object.keys(b).length} buildings: ${bCounts.join(' / ')}`, o.total === 1527 && o.completed === 0 && o.in_progress === 71 && o.open === 1456 && Object.keys(b).length === 3 && bCounts.join() === '657,869,1');
    const trades = ['Door','Entry door','Skirting','Sanitary','Robe Jamb','Miscellaneous','Utility'], expectedTrades = [585,114,469,211,97,11,40];
    const actualTrades = trades.map(t => stats.byTrade[t]?.total || 0);
    add('T3', 'Trade totals', trades.map((t, i) => `${t} ${expectedTrades[i]}`).join('; '), trades.map((t, i) => `${t} ${actualTrades[i]}`).join('; '), actualTrades.join() === expectedTrades.join());
    const idx = locationIndex(locs);
    const value = (building, name) => { const loc = locs.find(l => l.name === name && idx.buildingOf(l)?.name.startsWith(building)); return stats.subtreeCounts[loc?.id]?.total || 0; };
    const racfLevels = ['Basement Part 1','Basement Part 2','Ground Floor','First Floor','Second Floor','Roof','Fixtures & Fittings'].map(n => value('RACF', n));
    const ilaLevels = ['Ground Floor','First Floor','Second Floor','Roof'].map(n => value('ILA', n));
    const apt = locs.find(l => l.name === 'Apartment 101 · Type 2' && idx.ancestors(l).some(p => p.name === 'First Floor'));
    const aptTotal = stats.subtreeCounts[apt?.id]?.total || 0;
    add('T4', 'Level and apartment subtree totals', 'RACF 26/28/146/215/216/15/11; ILA 297/288/269/15; Apartment 101 = 18', `RACF ${racfLevels.join('/')}; ILA ${ilaLevels.join('/')}; Apartment 101 = ${aptTotal}`, racfLevels.join() === '26,28,146,215,216,15,11' && ilaLevels.join() === '297,288,269,15' && aptTotal === 18);
    const rooms = residentRooms(locs), required = ['Door','Entry door','Skirting','Sanitary'];
    const completeRooms = rooms.filter(l => required.every(t => visis.some(v => !v.is_deleted && v.trade === t && idx.locOf(v)?.id === l.id))).length;
    const room131 = rooms.find(l => l.name === 'Room 131 · P BED (F MIR.)');
    const count131 = visis.filter(v => !v.is_deleted && idx.locOf(v)?.id === room131?.id).length;
    const existsOnce = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `225-${prefix}-${String(from + i).padStart(3, '0')}`).filter(code => visis.filter(v => v.code === code).length === 1).length;
    const edRange = existsOnce('ED', 51, 114), snRange = existsOnce('SN', 148, 211);
    const repeat = await ensureRooms(e, project_id, user);
    add('T5', 'Resident rooms, code ranges and idempotency', '64/64 complete; Room 131 = 4; ED 051–114 = 64; SN 148–211 = 64; repeat creates 0', `${completeRooms}/${rooms.length} complete; Room 131 = ${count131}; ED range ${edRange}/64; SN range ${snRange}/64; repeat creates ${repeat.total_created}`, rooms.length === 64 && completeRooms === 64 && count131 === 4 && edRange === 64 && snRange === 64 && repeat.total_created === 0);
    const countBefore = (await readAll(e.Visi, { project_id })).length;
    const allocated = await allocateCodes(e, 'ED', 2);
    const countAfter = (await readAll(e.Visi, { project_id })).length;
    add('T6', 'Allocation without creating records', '225-ED-115, 225-ED-116; 0 records created', `${allocated.join(', ')}; ${countAfter - countBefore} records created`, allocated.join() === '225-ED-115,225-ED-116' && countBefore === countAfter);
    let tempLoc, tempVisi, transitions = [], cleaned = false;
    try {
      const root = locs.find(l => !l.parent_original_id && !l.is_deleted);
      tempLoc = await e.Location.create({ project_id, name: 'Verification temporary room', type: 'Room', parent_original_id: root.original_id, original_id: crypto.randomUUID(), status: 'active', is_deleted: false });
      const source = visis.find(v => v.trade === 'Door' && !v.is_deleted);
      tempVisi = await e.Visi.create(makeVisi(source, tempLoc, `SELFTEST-${crypto.randomUUID()}`, user));
      async function count() { return (await base44.functions.invoke('aggregateStats', { project_id, refresh: true, location_id: tempLoc.id, limit: 1 })).data.overall; }
      await e.Location.update(tempLoc.id, { status: 'na' }); transitions.push((await count()).total === 0);
      await e.Location.update(tempLoc.id, { status: 'active' }); transitions.push((await count()).total === 1);
      await e.Visi.update(tempVisi.id, { override_status: 'na' }); transitions.push((await count()).completed === 1);
      await e.Visi.update(tempVisi.id, { override_status: 'none' }); transitions.push((await count()).open === 1);
    } finally {
      if (tempVisi) await e.Visi.delete(tempVisi.id);
      if (tempLoc) await e.Location.delete(tempLoc.id);
      const [remainingV, remainingL] = await Promise.all([readAll(e.Visi, { project_id }), readAll(e.Location, { project_id })]);
      cleaned = !remainingV.some(v => v.id === tempVisi?.id) && !remainingL.some(l => l.id === tempLoc?.id);
      await base44.functions.invoke('aggregateStats', { project_id, refresh: true, limit: 1 });
    }
    add('T7', 'N/A round trips and permanent cleanup', 'Location excluded/restored; Visi N/A/restored; temporary records removed', `${transitions.filter(Boolean).length}/4 transitions passed; cleanup ${cleaned ? 'passed' : 'failed'}`, transitions.length === 4 && transitions.every(Boolean) && cleaned);
    const activeLocs = locs.filter(l => !l.is_deleted), roots = activeLocs.filter(l => !l.parent_original_id), orphans = activeLocs.filter(l => l.parent_original_id && !idx.byOrig[l.parent_original_id]);
    add('T8', 'Tree roots and orphans', '3 named roots; 0 orphans; initial expanded state empty', `${roots.length} roots: ${roots.map(l => l.name).join('; ')}; ${orphans.length} orphans; browser expansion check required`, roots.length === 3 && !orphans.length && ['RACF · Aged Care Facility','ILA · Independent Living Apartments','General / Whole Site'].every(n => roots.some(l => l.name === n)));
    return Response.json({ ran_at: new Date().toISOString(), checks, passed: checks.filter(c => c.pass).length, browser_checks: ['Dashboard: 390px charts, drill-down and Load more', 'LocationTree initial expanded state, row and chevron behaviour', 'Creation forms and N/A buttons'], note: 'T8 verifies live hierarchy; initial UI expansion requires a browser check.' });
  } catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}