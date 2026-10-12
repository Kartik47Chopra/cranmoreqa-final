import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Private files are stored as a path (file_uri), not a web address: they need a signed link to be shown.
// Links last an hour; they are reused for 50 minutes, kept across app reopens, and shared between images asking at once.
const TTL = 50 * 60 * 1000, STORE = "cranmore_signed_urls";
const cache = new Map(); // uri -> { url, at }
const pending = new Map(); // uri -> Promise<url>
try { Object.entries(JSON.parse(sessionStorage.getItem(STORE) || "{}")).forEach(([k, v]) => { if (Date.now() - v.at < TTL) cache.set(k, v); }); } catch { /* ignore */ }
let saveTimer = null;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries([...cache].filter(([, v]) => Date.now() - v.at < TTL)))); } catch { /* full */ } }, 500); };
export async function signedUrl(uri) {
  if (!uri || String(uri).startsWith("pending:")) return null;
  if (/^https?:/.test(uri)) return uri;
  const hit = cache.get(uri);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  if (pending.has(uri)) return pending.get(uri);
  const p = base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 })
    .then(({ signed_url }) => { cache.set(uri, { url: signed_url, at: Date.now() }); persist(); return signed_url; })
    .finally(() => pending.delete(uri));
  pending.set(uri, p);
  return p;
}

export default function SignedImage({ uri, alt = "", className = "", onClick }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    setUrl(null); setFailed(false);
    signedUrl(uri).then((u) => { if (on) { u ? setUrl(u) : setFailed(true); } }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [uri]);
  if (failed) return <div className={`${className} flex items-center justify-center bg-slate-100 px-1 text-center text-[11px] text-slate-400`}>No file yet</div>;
  if (!url) return <div className={`${className} animate-pulse bg-slate-100`} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" decoding="async" />;
}
