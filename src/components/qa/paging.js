import { base44 } from '@/api/base44Client';
export async function readAll(name, query = {}) {
  const records = []; let cursor;
  do {
    const page = await base44.entities[name].filter(query, { limit: 500, sort: 'id', ...(cursor ? { cursor } : {}) });
    records.push(...page.items);
    if (!page.has_more) break;
    cursor = page.next_cursor;
    if (!cursor) throw new Error('Missing pagination cursor');
  } while (cursor);
  return records;
}
export const activeRecords = rows => rows.filter(r => !r.is_deleted);
export async function openStoredFile(file_uri) {
  if (!file_uri || file_uri.startsWith('pending:')) return;
  const tab = window.open('', '_blank');
  const url = /^https?:/.test(file_uri) ? file_uri : (await base44.integrations.Core.CreateFileSignedUrl({ file_uri })).signed_url;
  if (tab) tab.location.href = url;
}