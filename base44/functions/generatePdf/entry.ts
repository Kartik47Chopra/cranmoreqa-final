import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { jsPDF } from 'npm:jspdf@4.2.1';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { projectId, building, trade, dateFrom, dateTo, include = "both", onlyUnclaimed = false, projectName = "Project" } = body;

    // Fetch all data with service role for full access
    const [visis, locations, companies, attachments] = await Promise.all([
      base44.asServiceRole.entities.Visi.filter({ project_id: projectId }),
      base44.asServiceRole.entities.Location.filter({ project_id: projectId }),
      base44.asServiceRole.entities.Company.list(),
      base44.asServiceRole.entities.Attachment.filter({ project_id: projectId }),
    ]);

    const visiList = Array.isArray(visis) ? visis.filter(v => !v.is_deleted) : [];
    const locList = Array.isArray(locations) ? locations : [];
    const compList = Array.isArray(companies) ? companies : [];
    const attList = Array.isArray(attachments) ? attachments.filter(a => !a.is_deleted) : [];

    const locById = Object.fromEntries(locList.map(l => [l.id, l]));
    const compById = Object.fromEntries(compList.map(c => [c.id, c]));

    // Status logic (mirrors qaUtils)
    function isStepComplete(s) { return (s?.status || "").toLowerCase() === "complete"; }
    function bucket(v) {
      const ov = v.override_status;
      if (ov === "na" || ov === "closed") return "completed";
      if (ov === "cant_close" || ov === "in_review" || ov === "in_dispute") return "in_progress";
      const steps = v.steps || [];
      const done = steps.filter(isStepComplete).length;
      if (steps.length === 0 || done === 0) return "open";
      if (done < steps.length) return "in_progress";
      return "completed";
    }

    // Filter
    let filtered = visiList.filter(v => {
      const b = bucket(v);
      if (include === "completed" && b !== "completed") return false;
      if (include === "in_progress" && b !== "in_progress") return false;
      if (include === "both" && b === "open") return false;
      if (onlyUnclaimed && v.claimed) return false;
      if (building && building !== "all") {
        const loc = locById[v.location_id];
        if (!loc || !loc.name?.includes(building)) return false;
      }
      if (trade && trade !== "all" && v.trade !== trade) return false;
      return true;
    });

    if (filtered.length === 0) {
      return Response.json({ error: "No items match the selected filters." }, { status: 400 });
    }

    // Group by Building > Level > Location > Trade
    function topBuilding(locId) {
      let cur = locById[locId];
      let seen = 0;
      while (cur && cur.parent_id && seen < 20) {
        const parent = locById[cur.parent_id];
        if (!parent || !parent.parent_id) return parent || cur;
        cur = parent;
        seen++;
      }
      return cur;
    }
    function levelOf(locId) {
      let cur = locById[locId];
      let seen = 0;
      while (cur && cur.parent_id && seen < 20) {
        const parent = locById[cur.parent_id];
        if (!parent || !parent.parent_id) return cur;
        cur = parent;
        seen++;
      }
      return cur;
    }

    const grouped = {};
    filtered.forEach(v => {
      const b = topBuilding(v.location_id)?.name || "Unknown";
      const l = levelOf(v.location_id)?.name || "Unknown";
      const loc = locById[v.location_id]?.name || "Unknown";
      const t = v.trade || v.template_name || "Unknown";
      const bk = `${b}|||${l}|||${loc}|||${t}`;
      (grouped[bk] = grouped[bk] || []).push(v);
    });

    // Summary by building and trade
    const summary = {};
    filtered.forEach(v => {
      const b = topBuilding(v.location_id)?.name || "Unknown";
      const t = v.trade || v.template_name || "Unknown";
      const key = `${b}|||${t}`;
      if (!summary[key]) summary[key] = { building: b, trade: t, total: 0, completed: 0, inProgress: 0, open: 0, na: 0 };
      summary[key].total++;
      const bk = bucket(v);
      if (bk === "completed") summary[key].completed++;
      else if (bk === "in_progress") summary[key].inProgress++;
      else summary[key].open++;
      if (v.override_status === "na") summary[key].na++;
    });

    // Generate PDF
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;

    function ensureSpace(h) {
      if (y + h > pageH - margin) { doc.addPage(); y = margin; }
    }
    function wrapText(text, maxW) {
      return doc.splitTextToSize(text, maxW);
    }

    // Cover page
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(projectName, margin, y + 10);
    y += 16;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Progress Claim", margin, y);
    y += 6;
    const dateRange = (dateFrom && dateTo) ? `${dateFrom} to ${dateTo}` : "All works";
    doc.text(`Date range: ${dateRange}`, margin, y);
    y += 5;
    doc.text(`Generated: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}`, margin, y);
    y += 5;
    doc.text(`Total items: ${filtered.length}`, margin, y);
    y += 10;

    // Summary table
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const colW = [60, 40, 20, 22, 22, 20, 16, 20];
    const headers = ["Building", "Trade", "Total", "Closed", "In Prog", "Open", "N/A", "% Done"];
    let x = margin;
    doc.setFillColor(240, 240, 240);
    doc.rect(x, y, colW.reduce((a, b) => a + b, 0), 7, "F");
    colW.forEach((w, i) => { doc.text(headers[i], x + 1, y + 5); x += w; });
    y += 7;
    doc.setFont("helvetica", "normal");
    Object.values(summary).forEach((s) => {
      ensureSpace(6);
      x = margin;
      const pctDone = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      const row = [s.building, s.trade, String(s.total), String(s.completed), String(s.inProgress), String(s.open), String(s.na), `${pctDone}%`];
      colW.forEach((w, i) => { doc.text(String(row[i]), x + 1, y + 5); x += w; });
      y += 6;
    });

    // Detail pages
    doc.addPage();
    y = margin;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");

    const sortedKeys = Object.keys(grouped).sort();
    let lastBuilding = "";
    let lastLevel = "";

    sortedKeys.forEach(key => {
      const [building, level, loc, trade] = key.split("|||");
      const items = grouped[key];

      if (building !== lastBuilding) {
        if (y > margin + 10) { doc.addPage(); y = margin; }
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        ensureSpace(10);
        doc.text(building, margin, y + 5);
        y += 8;
        lastBuilding = building;
        lastLevel = "";
      }
      if (level !== lastLevel) {
        doc.setFontSize(11);
        ensureSpace(7);
        doc.text(`  ${level}`, margin, y + 5);
        y += 6;
        lastLevel = level;
      }

      doc.setFontSize(10);
      ensureSpace(6);
      doc.text(`    ${loc} — ${trade} (${items.length})`, margin, y + 5);
      y += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      items.forEach(v => {
        ensureSpace(12);
        const steps = v.steps || [];
        const done = steps.filter(isStepComplete).length;
        const completedSteps = steps.filter(s => isStepComplete(s)).map(s => s.label).join(", ");
        const b = bucket(v);
        const statusLabel = b === "completed" ? "Closed" : b === "in_progress" ? `In Progress (${done}/${steps.length})` : "Open";
        const lastAct = v.last_updated || v.created_at || "";
        const visiAtt = attList.filter(a => a.visi_id === v.id);

        // Visi code + status
        doc.setFont("helvetica", "bold");
        doc.text(`${v.code || "—"}`, margin + 5, y + 4);
        doc.setFont("helvetica", "normal");
        doc.text(`[${statusLabel}]`, margin + 35, y + 4);
        if (completedSteps) {
          const stepText = `${done} of ${steps.length} steps: ${completedSteps}`;
          const wrapped = wrapText(stepText, pageW - margin * 2 - 10);
          wrapped.forEach(line => {
            ensureSpace(5);
            doc.text(line, margin + 10, y + 4);
            y += 5;
          });
        } else {
          y += 5;
        }
        if (lastAct) {
          ensureSpace(4);
          doc.setFontSize(8);
          doc.text(`Last activity: ${new Date(lastAct).toLocaleDateString("en-AU")}`, margin + 10, y + 3);
          y += 4;
          doc.setFontSize(9);
        }
        if (visiAtt.length > 0) {
          ensureSpace(4);
          doc.text(`Photos: ${visiAtt.length}`, margin + 10, y + 3);
          y += 4;
        } else {
          ensureSpace(4);
          doc.setTextColor(150);
          doc.text("No photo", margin + 10, y + 3);
          doc.setTextColor(0);
          y += 4;
        }
        y += 2;
      });
      y += 3;
    });

    // Page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${i} of ${pageCount}`, pageW - 30, pageH - 5);
    }

    const pdfBytes = doc.output("arraybuffer");
    const filename = `Progress-Claim_${projectName.replace(/\s+/g, "-")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}