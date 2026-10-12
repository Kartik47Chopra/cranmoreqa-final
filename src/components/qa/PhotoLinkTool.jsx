import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { readAll } from "@/components/qa/paging";
import { prepareImage } from "@/lib/imageTools";
import { useQaData } from "@/lib/QaDataContext";
import oldSite from "@/data/oldSiteProgress.json";
import { Loader2, ImagePlus } from "lucide-react";

const oldPhotoById = Object.fromEntries(oldSite.photos.map((p) => [p.id, p]));

// Links photo files from the old app to their Visis.
// Files are named "<original_id>.jpg" (full size) and "<original_id>_thumb.jpg" (about 400 px thumbnail).
// If no Attachment record exists yet, one is created on the Visi the photo belonged to on the old site.
export default function PhotoLinkTool() {
  const { refreshStats } = useQaData();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  async function run(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setReport(null); setError("");
    try {
      const byId = {};
      for (const f of files) {
        const m = f.name.match(/^(.+?)(_thumb)?\.(jpe?g|png|webp|gif|heic|heif)$/i);
        if (!m) continue;
        (byId[m[1]] ||= {})[m[2] ? "thumb" : "full"] = f;
      }
      const atts = await readAll("Attachment", {});
      const byOrig = Object.fromEntries(atts.filter((a) => a.original_id && !a.is_deleted).map((a) => [a.original_id, a]));
      const ids = Object.keys(byId);
      const oldVisiIds = [...new Set(ids.map((id) => oldPhotoById[id]?.visi).filter(Boolean))];
      const visis = oldVisiIds.length ? await readAll("Visi", { original_id: { $in: oldVisiIds } }) : [];
      const visiByOrig = Object.fromEntries(visis.filter((v) => !v.is_deleted).map((v) => [v.original_id, v]));
      const out = { linked: 0, created: 0, skipped: 0, unmatched: 0, noThumb: 0, failed: 0, missing: [] };
      const queue = [...ids]; let done = 0;
      setProgress({ done: 0, total: ids.length });
      const worker = async () => {
        while (queue.length) {
          const id = queue.shift(), rec = byOrig[id], pair = byId[id], old = oldPhotoById[id];
          const visi = old && visiByOrig[old.visi];
          try {
            if (rec && rec.file_uri && !String(rec.file_uri).startsWith("pending:") && rec.thumb_uri && rec.visi_id) out.skipped++;
            else if (!rec && !visi) { out.unmatched++; out.missing.push(old?.code || id); }
            else {
              const patch = {};
              if (pair.full && (!/\.jpe?g$/i.test(pair.full.name) || !pair.thumb)) { const prepared = await prepareImage(pair.full); pair.full = prepared.full; pair.thumb = prepared.thumb; }
              if (pair.full) patch.file_uri = (await base44.integrations.Core.UploadPrivateFile({ file: pair.full })).file_uri;
              if (pair.thumb) patch.thumb_uri = (await base44.integrations.Core.UploadPrivateFile({ file: pair.thumb })).file_uri; else out.noThumb++;
              if (visi && !rec?.visi_id) { patch.visi_id = visi.id; patch.location_id = visi.location_id; }
              if (rec) { await base44.entities.Attachment.update(rec.id, patch); out.linked++; }
              else {
                await base44.entities.Attachment.create({
                  ...patch, original_id: id, original_filename: old.name, content_type: "image/jpeg", size: old.size,
                  step_label: old.step || undefined, uploaded_by: "Site Factory Admin", uploaded_at: old.at, is_deleted: false,
                });
                out.created++;
              }
            }
          } catch (e) { out.failed++; console.error("photo link failed", id, e); }
          done++; setProgress({ done, total: ids.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (out.linked + out.created > 0) refreshStats();
      setReport(out);
    } catch (e) { setError(e?.message || "Could not link the photo files."); }
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-display font-bold text-slate-800"><ImagePlus size={18} className="text-emerald-600" /> Link photo files</div>
      <p className="mt-1 text-sm text-slate-500">Select all photo files at once (names look like &lt;id&gt;.jpg and &lt;id&gt;_thumb.jpg). Each photo is attached to the Visi it belonged to on the old site. Safe to run again: photos that are already linked are skipped.</p>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => run(e.target.files)} />
      <button onClick={() => inputRef.current?.click()} disabled={busy} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} {busy ? `Linking ${progress.done} of ${progress.total}...` : "Choose photo files"}
      </button>
      {busy && progress.total > 0 && <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {report && (
        <p className="mt-3 text-sm text-slate-700">
          Added <b>{report.created}</b> · updated <b>{report.linked}</b> · already linked <b>{report.skipped}</b> · no matching Visi <b>{report.unmatched}</b> · missing thumbnail <b>{report.noThumb}</b> · failed <b>{report.failed}</b>
          {report.missing.length > 0 && <span className="mt-1 block text-xs text-amber-700">Not found: {report.missing.join(", ")}</span>}
        </p>
      )}
    </div>
  );
}
