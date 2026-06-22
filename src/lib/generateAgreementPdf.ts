import { jsPDF } from "jspdf";
import { AgreementVars, AGREEMENT_VERSION, buildAgreementText } from "./superAdminAgreement";

export async function generateAgreementPdf(
  vars: AgreementVars,
  signatureDataUrl: string,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("MeriLive Platform", margin, margin);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Agreement ID: ${crypto.randomUUID()}`, margin, margin + 16);
  doc.text(`Version: ${AGREEMENT_VERSION}`, margin, margin + 30);

  // Body
  const lines = buildAgreementText(vars);
  let y = margin + 60;
  doc.setFontSize(10);
  for (const raw of lines) {
    const isBold = /^\d\./.test(raw) || raw.startsWith("MeriLive —") || raw.startsWith("THIS AGREEMENT");
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const wrapped = doc.splitTextToSize(raw, maxW);
    for (const ln of wrapped) {
      if (y > pageH - margin - 140) { doc.addPage(); y = margin; }
      doc.text(ln, margin, y);
      y += 13;
    }
  }

  // Signature block
  if (y > pageH - 180) { doc.addPage(); y = margin; }
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Signed by (Country Super Admin):", margin, y);
  y += 10;

  try {
    doc.addImage(signatureDataUrl, "PNG", margin, y, 200, 80);
  } catch {}
  y += 90;
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 220, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(vars.full_name, margin, y);
  y += 12;
  doc.text(`Country: ${vars.country_code} · NID: ${vars.nid_number}`, margin, y);
  y += 12;
  doc.text(`Date: ${new Date(vars.date_iso).toLocaleString()}`, margin, y);

  // Footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${pages} · MeriLive Super Admin Agreement ${AGREEMENT_VERSION}`,
      pageW / 2, pageH - 20, { align: "center" });
  }

  return doc.output("blob");
}
