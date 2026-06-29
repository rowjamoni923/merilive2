import { jsPDF } from "jspdf";

export type ReportRow = Record<string, unknown>;
export interface ReportColumn {
  key: string;
  label: string;
  /** Optional formatter (e.g. format dates, currency) */
  format?: (val: unknown, row: ReportRow) => string;
  /** Optional fixed width hint in PDF (relative weight, default 1) */
  weight?: number;
}

export interface ReportMeta {
  title: string;
  subtitle?: string;
  fileName: string; // without extension
  summary?: Array<{ label: string; value: string | number }>;
  brand?: string; // default "Meri Live — Admin Financial Report"
  orientation?: "portrait" | "landscape";
}

const BRAND_DEFAULT = "Meri Live — Admin Financial Report";

/* ---------- helpers ---------- */
const stamp = () => new Date().toISOString().slice(0, 10);
const fullStamp = () => new Date().toLocaleString();
const cellValue = (col: ReportColumn, row: ReportRow): string => {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw.toLocaleString();
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
};
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
const escapeCsv = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  const s = typeof val === "string" ? val : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const buildFileName = (base: string, ext: string) =>
  `${base.replace(/\s+/g, "-").toLowerCase()}-${stamp()}.${ext}`;

/* ---------- CSV ---------- */
export const exportReportCSV = (
  rows: ReportRow[],
  columns: ReportColumn[],
  meta: ReportMeta
) => {
  const header = columns.map((c) => escapeCsv(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(cellValue(c, r))).join(","))
    .join("\n");
  const csv = `\ufeff${header}\n${body}`;
  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    buildFileName(meta.fileName, "csv")
  );
};

/* ---------- HTML ---------- */
export const buildReportHTML = (
  rows: ReportRow[],
  columns: ReportColumn[],
  meta: ReportMeta
): string => {
  const brand = meta.brand ?? BRAND_DEFAULT;
  const summaryHtml = (meta.summary ?? [])
    .map(
      (s) =>
        `<div class="summary-card"><div class="summary-label">${escapeHtml(
          s.label
        )}</div><div class="summary-value">${escapeHtml(String(s.value))}</div></div>`
    )
    .join("");

  const thead = columns
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");
  const tbody = rows
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => `<td>${escapeHtml(cellValue(c, r))}</td>`)
          .join("")}</tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:'Inter','DM Sans',-apple-system,Segoe UI,sans-serif;color:#0f172a;background:#f8fafc;padding:32px}
  .doc{max-width:1200px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 30px -12px rgba(15,23,42,.12);overflow:hidden}
  header{padding:28px 32px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff}
  .brand{font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
  h1{margin:6px 0 4px;font-size:26px;font-weight:700;letter-spacing:-.01em}
  .subtitle{font-size:14px;opacity:.9}
  .meta{margin-top:14px;font-size:12px;opacity:.85}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:20px 32px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
  .summary-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 2px 6px -2px rgba(15,23,42,.08)}
  .summary-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600}
  .summary-value{font-size:18px;font-weight:700;color:#0f172a;margin-top:4px}
  .table-wrap{padding:8px 16px 24px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead th{background:#1e293b;color:#fff;text-align:left;padding:10px 12px;font-weight:600;font-size:12px;letter-spacing:.03em;text-transform:uppercase}
  tbody td{padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#1e293b;vertical-align:top}
  tbody tr:nth-child(even) td{background:#f8fafc}
  tbody tr:hover td{background:#eff6ff}
  footer{padding:16px 32px;background:#0f172a;color:#cbd5e1;font-size:11px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .empty{padding:60px;text-align:center;color:#64748b;font-style:italic}
  @media print{
    body{background:#fff;padding:0}
    .doc{box-shadow:none;border:none;border-radius:0}
    tbody tr:hover td{background:inherit}
    thead{display:table-header-group}
  }
</style></head>
<body><div class="doc">
<header>
  <div class="brand">${escapeHtml(brand)}</div>
  <h1>${escapeHtml(meta.title)}</h1>
  ${meta.subtitle ? `<div class="subtitle">${escapeHtml(meta.subtitle)}</div>` : ""}
  <div class="meta">Generated: ${escapeHtml(fullStamp())} &nbsp;·&nbsp; Rows: ${rows.length}</div>
</header>
${summaryHtml ? `<section class="summary">${summaryHtml}</section>` : ""}
<div class="table-wrap">
  ${
    rows.length === 0
      ? `<div class="empty">No records to display.</div>`
      : `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
  }
</div>
<footer>
  <div>${escapeHtml(brand)}</div>
  <div>Exported ${escapeHtml(fullStamp())}</div>
</footer>
</div></body></html>`;
};

export const exportReportHTML = (
  rows: ReportRow[],
  columns: ReportColumn[],
  meta: ReportMeta
) => {
  const html = buildReportHTML(rows, columns, meta);
  triggerDownload(
    new Blob([html], { type: "text/html;charset=utf-8;" }),
    buildFileName(meta.fileName, "html")
  );
};

/* ---------- PDF ---------- */
export const exportReportPDF = (
  rows: ReportRow[],
  columns: ReportColumn[],
  meta: ReportMeta
) => {
  const brand = meta.brand ?? BRAND_DEFAULT;
  const orientation = meta.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  /* --- header band --- */
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, pageW, 78, "F");
  doc.setTextColor(219, 234, 254);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(brand.toUpperCase(), margin, 26);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(meta.title, margin, 48);
  if (meta.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(219, 234, 254);
    doc.text(meta.subtitle, margin, 64);
  }
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  const metaLine = `Generated: ${fullStamp()}  •  Rows: ${rows.length}`;
  doc.text(metaLine, pageW - margin, 26, { align: "right" });

  let y = 98;

  /* --- summary chips --- */
  if (meta.summary?.length) {
    const chipW = (pageW - margin * 2 - (meta.summary.length - 1) * 8) / meta.summary.length;
    meta.summary.forEach((s, i) => {
      const x = margin + i * (chipW + 8);
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, chipW, 44, 6, 6, "FD");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(s.label.toUpperCase(), x + 10, y + 16);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.text(String(s.value), x + 10, y + 34);
    });
    y += 56;
  }

  if (!rows.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("No records to display.", margin, y + 24);
    doc.save(buildFileName(meta.fileName, "pdf"));
    return;
  }

  /* --- table --- */
  const totalWeight = columns.reduce((s, c) => s + (c.weight ?? 1), 0);
  const widths = columns.map((c) => ((c.weight ?? 1) / totalWeight) * (pageW - margin * 2));
  const rowH = 18;
  const headerH = 22;

  const drawHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, pageW - margin * 2, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin;
    columns.forEach((c, i) => {
      doc.text(c.label, x + 6, y + 15);
      x += widths[i];
    });
    y += headerH;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach((r, idx) => {
    if (y + rowH > pageH - 30) {
      doc.addPage();
      doc.setFillColor(29, 78, 216);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(meta.title, margin, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(brand, pageW - margin, 18, { align: "right" });
      y = 48;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    }
    doc.setTextColor(30, 41, 59);
    let x = margin;
    columns.forEach((c, i) => {
      const s = cellValue(c, r);
      const maxChars = Math.max(6, Math.floor(widths[i] / 4.6));
      const truncated = s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
      doc.text(truncated, x + 6, y + 12);
      x += widths[i];
    });
    y += rowH;
  });

  /* --- footer page numbers --- */
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} of ${total}`, pageW - margin, pageH - 16, { align: "right" });
    doc.text(brand, margin, pageH - 16);
  }

  doc.save(buildFileName(meta.fileName, "pdf"));
};

/* ---------- one-shot helper ---------- */
export const exportReport = (
  format: "html" | "pdf" | "csv",
  rows: ReportRow[],
  columns: ReportColumn[],
  meta: ReportMeta
) => {
  if (format === "csv") return exportReportCSV(rows, columns, meta);
  if (format === "html") return exportReportHTML(rows, columns, meta);
  return exportReportPDF(rows, columns, meta);
};
