import { base44 } from '@/api/base44Client';
export async function readAll(name, query = {}) {
  const records = []; let cursor;
  do {
    const page = await base44.entities[name].filter(query, { limit: 1000, ...(cursor ? { cursor } : {}) });
    records.push(...page.items);
    if (!page.has_more) break;
    cursor = page.next_cursor;
    if (!cursor) throw new Error('Missing pagination cursor');
  } while (cursor);
  return records;
}
export const activeRecords = rows => rows.filter(r => !r.is_deleted);
// The tab opens straight away (inside the tap) so iPhone Safari does not block it, then loads the signed link.
export async function openStoredFile(file_uri) {
  if (!file_uri || file_uri.startsWith('pending:')) return;
  if (/^https?:/.test(file_uri)) { window.open(file_uri, '_blank'); return; }
  const win = window.open('', '_blank');
  try {
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
    if (win) win.location.href = signed_url; else window.location.href = signed_url;
  } catch (e) { win?.close(); throw e; }
}