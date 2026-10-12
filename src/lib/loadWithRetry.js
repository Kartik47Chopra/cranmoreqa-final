// Every first data load: 20 second timeout, one automatic retry, last good result kept in sessionStorage.
export function withTimeout(promise, ms = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timed out. Please check your connection and tap Retry.")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function loadWithRetry(fn, { tries = 2, ms = 20000 } = {}) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await withTimeout(fn(), ms); } catch (e) { err = e; }
  }
  throw err;
}

export function friendlyError(e) {
  const msg = e?.message || "";
  if (!msg || /network error/i.test(msg)) return "Could not reach the server. Check your connection and tap Retry.";
  return msg;
}

// Kept in localStorage so a phone reopening the app paints the last data instantly, then refreshes in the background.
export const readCache = (key) => { try { const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } };
export const writeCache = (key, value) => {
  const raw = JSON.stringify(value);
  try { localStorage.setItem(key, raw); return; } catch { /* full: drop other cached lists and try once more */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith("cranmore_") && k !== key && k !== "cranmore_selected_project" && !k.startsWith("cranmore_rooms_")).forEach((k) => localStorage.removeItem(k)); localStorage.setItem(key, raw); } catch { /* still full: skip caching */ }
};