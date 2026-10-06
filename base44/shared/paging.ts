export const recoveryEntities = ['Company','Location','Template','Visi','Activity','Document','Attachment','Milestone','Task','ImportBatch','Pin'];
export async function readAll(entity, query = {}) {
  const records = []; let cursor;
  do {
    const page = await entity.filter(query, { limit: 500, sort: 'id', ...(cursor ? { cursor } : {}) });
    records.push(...page.items);
    if (!page.has_more) break;
    cursor = page.next_cursor;
    if (!cursor) throw new Error('Missing pagination cursor');
  } while (cursor);
  return records;
}
export async function freshCounts(entities) {
  const counts = {};
  for (const name of recoveryEntities) counts[name] = (await readAll(entities[name])).length;
  return counts;
}
export const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export async function retry(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 5 || !/429|rate|timeout|timed out|502|503|504/i.test(`${error.status} ${error.message}`)) throw error;
      await pause(500 * 2 ** attempt);
    }
  }
}