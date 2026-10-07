import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Private files are stored as a path (file_uri), not a web address: they need a signed link to be shown.
const cache = new Map(); // uri -> { url, at }
export async function signedUrl(uri) {
  if (!uri || String(uri).startsWith("pending:")) return null;
  if (/^https?:/.test(uri)) return uri;
  const hit = cache.get(uri);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
  cache.set(uri, { url: signed_url, at: Date.now() });
  return signed_url;
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
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" />;
}
