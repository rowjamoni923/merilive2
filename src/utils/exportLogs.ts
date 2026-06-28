import { jsPDF } from "jspdf";

export type ExportRow = Record<string, string | number | null | undefined>;

const escapeCsv = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  const s = typeof val === "string" ? val : JSON.stringify(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

export const exportToCsv = (filename: string, rows: ExportRow[], columns?: string[]) => {
  if (!rows.length) {
    triggerDownload(new Blob(["(no data)"], { type: "text/csv;charset=utf-8;" }), filename);
    return;
  }
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCsv).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(",")).join("\n");
  const csv = `\ufeff${header}\n${body}`;
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
};

export const exportToPdf = (
  filename: string,
  title: string,
  rows: ExportRow[],
  columns?: string[]
) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, margin + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}  •  Rows: ${rows.length}`, margin, margin + 22);

  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (!cols.length) {
    doc.text("(no data)", margin, margin + 50);
    doc.save(filename);
    return;
  }

  const colW = (pageW - margin * 2) / cols.length;
  let y = margin + 44;
  const rowH = 16;

  const drawHeader = () => {
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    cols.forEach((c, i) => doc.text(String(c), margin + i * colW + 4, y + 11));
    y += rowH;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach((r, idx) => {
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    }
    doc.setTextColor(30, 41, 59);
    cols.forEach((c, i) => {
      const raw = r[c];
      const s = raw === null || raw === undefined ? "" : String(raw);
      const maxChars = Math.max(8, Math.floor(colW / 4.5));
      const truncated = s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
      doc.text(truncated, margin + i * colW + 4, y + 11);
    });
    y += rowH;
  });

  doc.save(filename);
};
