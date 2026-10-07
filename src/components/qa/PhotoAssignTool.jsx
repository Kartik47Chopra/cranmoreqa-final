import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQaData } from "@/lib/QaDataContext";
import { useAuth } from "@/lib/AuthContext";
import { prepareImage } from "@/lib/imageTools";
import { logActivity } from "@/lib/activityLog";
import { Images, Loader2, CheckCircle2, AlertTriangle, Search } from "lucide-react";

const CODE_RE = /(\d{3}-[A-Z]{2}-\d{3}|CC-\d+)/i;

async function loadVisiIndex(projectId) {
  const rows = []; let cursor = null;
  do {
    const page = await base44.entities.Visi.filter({ project_id: projectId }, { limit: 1000, fields: ["id", "code", "trade", "template_name", "location_id", "location_original_id", "is_deleted"], ...(cursor ? { cursor } : {}) });
    rows.push(...(page.items || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows.filter((v) => !v.is_deleted && v.code);
}

// Add photos in ANY format and choose which Visi (door, skirting, ...) each one belongs to.
export default function PhotoAssignTool() {
  const { project, locations } = useQaData();
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [visis, setVisis] = useState(null);
  const [rows, setRows] = useState([]);       // { id, file, preview, code, state, msg }
  const [bulk, setBulk] = useState("");
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [l.original_id, l.name])), [locations]);
  const byCode = useMemo(() => Object.fromEntries((visis || []).map((v) => [String(v.code).toUpperCase(), v])), [visis]);

  useEffect(() => {
    if (!rows.length || visis || !project?.id) return;
    loadVisiIndex(project.id).then(setVisis).catch((e) => setError(e?.message || "Could not load the list of Visis"));
  }, [rows.length, visis, project?.id]);

  function choose(fileList) {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name));
    setRows((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${prev.length + i}`, file, preview: URL.createObjectURL(file), code: (file.name.match(CODE_RE)?.[1] || "").toUpperCase(), state: "ready", msg: "" }))]);
  }
  const setCode = (id, code) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, code: code.toUpperCase() } : r)));
  const matches = useMemo(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !visis) return [];
    return visis.filter((v) => { const t = `${v.code} ${v.trade || v.template_name || ""} ${locName[v.location_original_id] || ""}`.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 8);
  }, [find, visis, locName]);

  async function uploadAll() {
    setBusy(true); setError("");
    const todo = rows.filter((r) => r.state !== "done" && byCode[r.code]);
    const queue = [...todo];
    const patch = (id, p) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift(); const v = byCode[r.code];
        patch(r.id, { state: "uploading", msg: "" });
        try {
          const { full, thumb } = await prepareImage(r.file);
          const [a, b] = await Promise.all([base44.integrations.Core.UploadPrivateFile({ file: full }), base44.integrations.Core.UploadPrivateFile({ file: thumb })]);
          await base44.entities.Attachment.create({ visi_id: v.id, location_id: v.location_id, file_uri: a.file_uri, thumb_uri: b.file_uri, original_filename: r.file.name, content_type: "image/jpeg", size: full.size, uploaded_by: user?.id, uploaded_by_company: user?.company_id, uploaded_at: new Date().toISOString() });
          logActivity({ project_id: project.id, visi_id: v.id, user: user?.full_name || user?.email, text: `Photo uploaded: ${r.file.name}`, type: "photo" });
          patch(r.id, { state: "done" });
        } catch (e) { patch(r.id, { state: "error", msg: e?.message || "Upload failed" }); }
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy(false);
  }

  const ready = rows.filter((r) => r.state !== "done" && byCode[r.code]).length;
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><Images size={18} className="text-emerald-600" /> Add photos to Visis</div>
      <p className="mt-1 text-sm text-slate-500">Choose photos in any format (jpg, jpeg, png, webp, heic). Each photo is compressed, then attached to the Visi whose code you pick, and it appears on that Visi's screen and in the Progress Claim PDF. A code in the file name (for example 225-DR-406_1.jpg) is picked up automatically.</p>
      <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Images size={15} /> Choose photos</button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Find a Visi (type a code, a trade or a place, for example "Room 131 door")</div>
            <div className="relative mt-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder={visis ? "Search Visis..." : "Loading Visis..."} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-base" /></div>
            {matches.map((v) => (
              <button key={v.id} onClick={() => setBulk(v.code)} className="mt-1 flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-sm hover:bg-emerald-50">
                <span><b className="font-mono">{v.code}</b> {v.trade || v.template_name}</span><span className="truncate pl-2 text-xs text-slate-500">{locName[v.location_original_id]}</span>
              </button>
            ))}
            <div className="mt-2 flex gap-2">
              <input value={bulk} onChange={(e) => setBulk(e.target.value.toUpperCase())} placeholder="Visi code, e.g. 225-DR-406" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2 font-mono text-base" />
              <button onClick={() => setRows((prev) => prev.map((r) => (r.state === "done" ? r : { ...r, code: bulk })))} disabled={!bulk} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">Use for all</button>
            </div>
          </div>
          {rows.map((r) => {
            const v = byCode[r.code];
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                <img src={r.preview} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-slate-500">{r.file.name}</div>
                  <input value={r.code} onChange={(e) => setCode(r.id, e.target.value)} disabled={r.state === "done" || r.state === "uploading"} placeholder="Visi code" className="mt-1 w-full rounded border border-slate-200 p-1.5 font-mono text-base" />
                  <div className="mt-1 text-xs">
                    {r.state === "done" ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={13} /> Attached to {r.code}</span>
                      : r.state === "uploading" ? <span className="flex items-center gap-1 text-slate-500"><Loader2 size={13} className="animate-spin" /> Uploading...</span>
                      : r.state === "error" ? <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={13} /> {r.msg}</span>
                      : v ? <span className="text-slate-600">{v.trade || v.template_name} · {locName[v.location_original_id] || ""}</span>
                      : <span className="text-amber-600">{r.code ? "No Visi has this code" : "Choose a Visi for this photo"}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={uploadAll} disabled={busy || ready === 0} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} {busy ? "Uploading..." : `Upload ${ready} photo${ready === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
