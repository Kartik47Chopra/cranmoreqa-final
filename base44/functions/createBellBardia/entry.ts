import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAll, retry } from '../../shared/paging.ts';
import { makeVisi, TRADE_PREFIX } from '../../shared/standardVisis.ts';
import { BELL_BARDIA_DOORS } from '../../shared/bellBardiaDoors.ts';

const PROJECT_NO = '230'; // Bell Bardia project 230860, first three digits like Summerset's 225
const levelName = (n: number) => (n === 0 ? 'Ground Floor' : `Level ${n}`);

// Builds buildings > levels > apartments / common areas from the door schedule (takeoff). Pure, so it can be previewed.
export function planBellBardia() {
  // Pass 1: resolve each door's apartment tag, and count how many identical apartments each tag has (from its entry door rows).
  const lastApt: Record<string, string> = {}, rows: any[] = [], entries: Record<string, Record<string, number>> = {};
  for (const [num, b, cls, lv, unit, tag, comment] of BELL_BARDIA_DOORS) {
    const prefix = `${b}${lv}.${unit}`;
    let apt = /^APT/i.test(tag) ? tag : '';
    if (apt) lastApt[prefix] = apt; else if (cls === 'A' && /^apartment/i.test(comment) && lastApt[prefix]) apt = lastApt[prefix];
    rows.push({ num, b, lv, prefix, apt, comment });
    if (apt && /apartment entry/i.test(comment)) { const e = (entries[`${prefix}|${apt}`] ||= {}); e[num] = (e[num] || 0) + 1; }
  }
  const copies = (prefix: string, apt: string) => Math.max(1, ...Object.values(entries[`${prefix}|${apt}`] || { x: 1 }));
  // Pass 2: place doors. Identical repeated rows go to the next identical apartment, never beyond the entry-door count.
  const seen: Record<string, number> = {}, tree: any = {};
  for (const r of rows) {
    const level = ((tree[`Building ${r.b}`] ||= {})[r.lv] ||= { apartments: {}, common: [] });
    if (!r.apt) { level.common.push({ num: r.num, comment: r.comment }); continue; }
    const k = `${r.num}|${r.apt}`, n = Math.min((seen[k] = (seen[k] ?? -1) + 1), copies(r.prefix, r.apt) - 1);
    const key = `${r.prefix}|${r.apt}|${n}`;
    (level.apartments[key] ||= { name: `Apartment ${r.b}${r.lv}.${r.prefix.split('.')[1]} · ${r.apt}${n ? ` (${n + 1})` : ''}`, doors: [] }).doors.push({ num: r.num, comment: r.comment });
  }
  return tree;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { preview = false } = await req.json().catch(() => ({}));
    const entities = base44.asServiceRole.entities;
    const tree = planBellBardia();

    // Visi plan: [trade, locationKey, label]
    const buildings: any[] = [], visiPlan: { trade: string; loc: string; label?: string }[] = [];
    let units = 0;
    for (const [bName, levels] of Object.entries<any>(tree)) {
      const b: any = { name: bName, levels: [] };
      for (const lv of Object.keys(levels).map(Number).sort((a, c) => a - c)) {
        const L = levels[lv], lvKey = `${bName}|${lv}`, level: any = { key: lvKey, name: levelName(lv), order: lv, units: [] };
        if (L.common.length) { level.units.push({ key: `${lvKey}|common`, name: 'Common areas', type: 'Zone' }); for (const d of L.common) visiPlan.push({ trade: 'Door', loc: `${lvKey}|common`, label: d.num }); }
        for (const [k, a] of Object.entries<any>(L.apartments)) {
          const key = `${lvKey}|${k}`; units++; level.units.push({ key, name: a.name, type: 'Unit' });
          for (const d of a.doors) {
            visiPlan.push({ trade: /apartment entry/i.test(d.comment) ? 'Entry door' : 'Door', loc: key, label: d.num });
            if (/bathroom/i.test(d.comment) && !/cleaner/i.test(d.comment)) visiPlan.push({ trade: 'Sanitary', loc: key, label: d.num });
          }
          visiPlan.push({ trade: 'Skirting', loc: key });
        }
        b.levels.push(level);
      }
      buildings.push(b);
    }
    const byTrade: Record<string, number> = {}; for (const v of visiPlan) byTrade[v.trade] = (byTrade[v.trade] || 0) + 1;
    const summary = { buildings: buildings.length, levels: buildings.reduce((n, b) => n + b.levels.length, 0), apartments: units, visis: visiPlan.length, by_trade: byTrade };

    const projects = await readAll(entities.Project);
    const existing = projects.find((p: any) => !p.is_deleted && /bell\s*bardia/i.test(p.name || ''));
    if (existing) {
      const locs = await readAll(entities.Location, { project_id: existing.id });
      if (locs.length) return Response.json({ error: 'Bell Bardia is already set up', ...summary }, { status: 409 });
    }
    if (preview) return Response.json({ preview: true, project_exists: !!existing, ...summary });

    // Checklist sources: copy the steps of an existing Visi of each trade (Summerset).
    const allVisis = await readAll(entities.Visi), sources: Record<string, any> = {};
    for (const t of Object.keys(byTrade)) {
      const s = allVisis.find((v: any) => !v.is_deleted && v.trade === t && v.template_id && v.steps?.length && (!existing || v.project_id !== existing.id));
      if (!s) throw new Error(`No checklist reference for ${t}`);
      sources[t] = s;
    }
    const donor = projects.find((p: any) => !p.is_deleted && p !== existing && (p.member_company_ids?.length || p.company_id));
    const project = existing || await entities.Project.create({ name: 'Bell Bardia', address: '322-330 Bell Street & 11-19 Bardia Street, Heidelberg West VIC', drawing_set: 'BBHW-ARC', company_id: donor?.company_id, member_company_ids: donor?.member_company_ids || [], accounts_email: '', is_deleted: false, original_id: crypto.randomUUID() });

    const created: Record<string, any> = {}, bulk = async (rows: any[]) => { for (let i = 0; i < rows.length; i += 100) for (const r of await retry(() => entities.Location.bulkCreate(rows.slice(i, i + 100)))) created[r.original_id] = r; };
    const mk = (name: string, type: string, parent: any, order: number) => ({ project_id: project.id, parent_original_id: parent?.original_id, parent_id: parent?.id, name, type, order, original_id: crypto.randomUUID(), status: 'active', is_deleted: false });
    const bRows = buildings.map((b, i) => ({ ...mk(b.name, 'Building', null, i + 1), _k: b.name }));
    await bulk(bRows.map(({ _k, ...r }) => r)); const bLoc: Record<string, any> = {}; bRows.forEach(r => { bLoc[r._k] = created[r.original_id]; });
    const lRows = buildings.flatMap(b => b.levels.map((l: any) => ({ ...mk(l.name, 'Level', bLoc[b.name], l.order + 1), _k: l.key })));
    await bulk(lRows.map(({ _k, ...r }) => r)); const lLoc: Record<string, any> = {}; lRows.forEach(r => { lLoc[r._k] = created[r.original_id]; });
    const uRows = buildings.flatMap(b => b.levels.flatMap((l: any) => l.units.map((u: any, i: number) => ({ ...mk(u.name, u.type, lLoc[l.key], i), _k: u.key }))));
    await bulk(uRows.map(({ _k, ...r }) => r)); const uLoc: Record<string, any> = {}; uRows.forEach(r => { uLoc[r._k] = created[r.original_id]; });

    const pools: Record<string, string[]> = {};
    for (const t of Object.keys(byTrade)) {
      const re = new RegExp(`^${PROJECT_NO}-${TRADE_PREFIX[t]}-(\\d+)$`), top = allVisis.reduce((m: number, v: any) => Math.max(m, Number(v.code?.match(re)?.[1] || 0)), 0);
      pools[t] = Array.from({ length: byTrade[t] }, (_, i) => `${PROJECT_NO}-${TRADE_PREFIX[t]}-${String(top + i + 1).padStart(3, '0')}`);
    }
    const records = visiPlan.map(v => { const rec = makeVisi(sources[v.trade], uLoc[v.loc], pools[v.trade].shift(), user); if (v.label) rec.fixture_label = v.label; return rec; });
    for (let i = 0; i < records.length; i += 100) await retry(() => entities.Visi.bulkCreate(records.slice(i, i + 100)));
    await entities.Activity.create({ project_id: project.id, user: user.full_name || user.email, type: 'bulk_create', text: `Created Bell Bardia from the door schedule: ${units} apartments, ${records.length} Visis`, created_at: new Date().toISOString() });
    await base44.functions.invoke('aggregateStats', { project_id: project.id, refresh: true, limit: 1 });
    return Response.json({ created: true, project_id: project.id, ...summary });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 500 }); }
}
