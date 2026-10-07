// @ts-nocheck
// Progress Claim / Progress Report PDF builder (jsPDF). Pure function: no database, no network.
// Layout rule: every block's height is MEASURED before it is drawn, so nothing can overlap.
// An overlap detector re-checks every text and image box before the PDF is returned.

export const pdfText = (s) => String(s ?? "")
  .replace(/[·•]/g, "-").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "").replace(/\s+/g, " ").trim();

export function buildProgressPdf(jsPDF, opts) {
  const { projectName = "Project", title = "Progress Claim", dateLabel = "All work to date", generatedLabel = "", summaryRows = [], groups = [] } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
  const M = 12, CW = PW - 2 * M, BOTTOM = PH - 14;
  const PT = 0.3528;                       // 1 pt in mm
  const boxes = [];                        // every drawn text/image: { page, x, y, w, h }
  let y = M, itemCount = 0, photoCount = 0;
  const pageNo = () => doc.internal.getCurrentPageInfo().pageNumber;
  const lh = (size) => size * PT * 1.3;    // line height (mm) for a font size (pt)

  function setF(size, bold, color) {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...(color || [20, 20, 20]));
  }
  // draw one line of text whose TOP is `top`
  function line(str, x, top, { size = 10, bold = false, color, align = "left" } = {}) {
    str = pdfText(str); setF(size, bold, color);
    const w = doc.getTextWidth(str), left = align === "right" ? x - w : x;
    doc.text(str, left, top + size * PT * 0.9);
    boxes.push({ page: pageNo(), x: left, y: top, w, h: size * PT });
    return w;
  }
  function wrap(str, width, size, bold = false) { setF(size, bold); return doc.splitTextToSize(pdfText(str), width); }
  function newPage() { doc.addPage(); y = M; }

  // ---------------- cover ----------------
  const tl = wrap(projectName, CW, 20, true);
  tl.forEach((t) => { line(t, M, y, { size: 20, bold: true }); y += lh(20); });
  y += 1;
  line(title, M, y, { size: 13, bold: true, color: [5, 120, 85] }); y += lh(13) + 1;
  line("Date range: " + dateLabel, M, y, { size: 10 }); y += lh(10);
  if (generatedLabel) { line("Generated: " + generatedLabel, M, y, { size: 10 }); y += lh(10); }
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  line("Total items: " + totalItems, M, y, { size: 10, bold: true }); y += lh(10) + 5;

  // summary table (row height comes from the wrapped text, so long names never run into the next column)
  const cols = [{ k: "building", h: "Building", w: 64 }, { k: "trade", h: "Trade", w: 38 }, { k: "total", h: "Total", w: 16, r: 1 }, { k: "completed", h: "Closed", w: 16, r: 1 }, { k: "inProgress", h: "In Progress", w: 22, r: 1 }, { k: "na", h: "N/A", w: 12, r: 1 }, { k: "pct", h: "% done", w: 18, r: 1 }];
  const scale = CW / cols.reduce((a, c) => a + c.w, 0); cols.forEach((c) => { c.w *= scale; });
  const PAD = 1.8;
  function tableHeader() {
    doc.setFillColor(15, 23, 42); doc.rect(M, y, CW, 7, "F");
    let x = M;
    cols.forEach((c) => { line(c.h, c.r ? x + c.w - PAD : x + PAD, y + 1.9, { size: 8.5, bold: true, color: [255, 255, 255], align: c.r ? "right" : "left" }); x += c.w; });
    y += 7;
  }
  tableHeader();
  summaryRows.forEach((r, i) => {
    const cells = cols.map((c) => ({ c, lines: c.r ? [String(r[c.k] ?? "")] : wrap(String(r[c.k] ?? ""), c.w - 2 * PAD, 9) }));
    const rowH = Math.max(...cells.map((x) => x.lines.length)) * lh(9) + 2 * PAD - 0.6;
    if (y + rowH > BOTTOM) { newPage(); tableHeader(); }
    if (i % 2 === 0) { doc.setFillColor(244, 246, 248); doc.rect(M, y, CW, rowH, "F"); }
    let x = M;
    cells.forEach(({ c, lines }) => {
      lines.forEach((t, li) => line(t, c.r ? x + c.w - PAD : x + PAD, y + PAD - 0.3 + li * lh(9), { size: 9, align: c.r ? "right" : "left" }));
      x += c.w;
    });
    y += rowH;
  });

  // ---------------- detail cards ----------------
  const PADC = 2.6, INNER = CW - 2 * PADC, THUMB_W = 44, THUMB_H = 33;
  function layoutCard(it) {
    const loc = [];
    const steps = wrap(it.stepsText || "", INNER, 9);
    const meta = pdfText(["Last activity: " + (it.lastActivity || "-"), it.who ? "by " + it.who : ""].filter(Boolean).join("  "));
    const thumbs = (it.photos || []).slice(0, 3).map((p) => {
      let w = THUMB_W, h = THUMB_H;
      try { const ip = doc.getImageProperties(p.data); const r = ip.width / ip.height; if (r >= THUMB_W / THUMB_H) { h = THUMB_W / r; } else { w = THUMB_H * r; } } catch (e) { /* keep default box */ }
      return { p, w, h };
    });
    const photoH = thumbs.length ? Math.max(...thumbs.map((t) => t.h)) : lh(8);
    const h = PADC + lh(10) + 0.8 + loc.length * lh(8) + (steps.length ? 0.8 + steps.length * lh(9) : 0) + 0.8 + lh(8) + 1.5 + photoH + PADC;
    return { h, it, loc, steps, meta, thumbs, photoH };
  }
  function drawCard(c, top) {
    const { it } = c; let t = top + PADC;
    doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.25); doc.roundedRect(M, top, CW, c.h, 1.2, 1.2, "S");
    const statusColor = /closed/i.test(it.statusLabel) ? [5, 120, 85] : /in progress/i.test(it.statusLabel) ? [180, 100, 0] : [90, 100, 115];
    line(it.code || "-", M + PADC, t, { size: 10, bold: true });
    const cw = (() => { setF(10, true); return doc.getTextWidth(pdfText(it.code || "-")); })();
    line(it.trade || "", M + PADC + cw + 4, t + 0.3, { size: 9, color: [90, 100, 115] });
    line(it.statusLabel || "", M + CW - PADC, t, { size: 9, bold: true, color: statusColor, align: "right" });
    t += lh(10) + 0.8;
    c.loc.forEach((s) => { line(s, M + PADC, t, { size: 8, color: [110, 118, 130] }); t += lh(8); });
    if (c.steps.length) { t += 0.8; c.steps.forEach((s) => { line(s, M + PADC, t, { size: 9 }); t += lh(9); }); }
    t += 0.8; line(c.meta, M + PADC, t, { size: 8, color: [110, 118, 130] }); t += lh(8) + 1.5;
    if (c.thumbs.length) {
      let x = M + PADC;
      c.thumbs.forEach((th) => {
        doc.addImage(th.p.data, "JPEG", x, t, th.w, th.h, undefined, "FAST");
        boxes.push({ page: pageNo(), x, y: t, w: th.w, h: th.h }); photoCount++; x += th.w + 3;
      });
    } else { line("No photo", M + PADC, t, { size: 8, color: [150, 155, 165] }); }
    itemCount++;
  }

  let lastB = null, lastL = null, lastLoc = null;
  function headings(g, cont) {
    if (g.building !== lastB) { line(g.building + (cont ? " (cont.)" : ""), M, y, { size: 13, bold: true }); y += lh(13) + 0.5; lastB = g.building; lastL = null; }
    if (g.level !== lastL) { line(g.level + (cont ? " (cont.)" : ""), M + 2, y, { size: 11, bold: true, color: [51, 65, 85] }); y += lh(11) + 0.3; lastL = g.level; lastLoc = null; }
    if (g.location !== lastLoc) { line(g.location, M + 4, y, { size: 9.5, bold: true, color: [5, 120, 85] }); y += lh(9.5) + 0.8; lastLoc = g.location; }
  }
  const headingsHeight = (g) => (g.building !== lastB ? lh(13) + 0.5 : 0) + (g.level !== lastL || g.building !== lastB ? lh(11) + 0.3 : 0) + (g.location !== lastLoc || g.level !== lastL || g.building !== lastB ? lh(9.5) + 0.8 : 0);

  if (groups.length) newPage();
  groups.forEach((g) => {
    let first = true;
    g.items.forEach((it) => {
      const c = layoutCard(it);
      const hh = first ? headingsHeight(g) : 0;
      if (y + hh + c.h > BOTTOM) { newPage(); lastB = lastL = lastLoc = null; headings(g, true); }
      else if (first) headings(g, false);
      first = false;
      drawCard(c, y); y += c.h + 3.2;
    });
  });

  // ---------------- footers ----------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    line(projectName + " - " + title, M, PH - 9, { size: 7.5, color: [130, 138, 150] });
    line("Page " + p + " of " + pages, PW - M, PH - 9, { size: 7.5, color: [130, 138, 150], align: "right" });
  }

  // ---------------- overlap / bounds detector ----------------
  let overlaps = 0, outOfBounds = 0;
  const E = 0.15;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.x < M - 0.5 || a.x + a.w > PW - M + 0.5 || a.y < 0 || a.y + a.h > PH - 4) outOfBounds++;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]; if (b.page !== a.page) continue;
      if (a.x + E < b.x + b.w && b.x + E < a.x + a.w && a.y + E < b.y + b.h && b.y + E < a.y + a.h) overlaps++;
    }
  }
  return { bytes: doc.output("arraybuffer"), pages, items: itemCount, photosEmbedded: photoCount, overlaps, outOfBounds };
}
