# Admin Financial Reports — HTML + PDF Export

## Goal
Every financial admin page gets a unified **"Export ▾"** button (HTML / PDF / CSV) in its header. One reusable utility + one shared button, dropped into each page — same look, same behavior, same branding.

## Pages covered (19)
Finance · Reports · Profit Analytics · Payouts Analytics · Withdrawals · Manual Topup · Topup System · Topup Payment Methods · Recharge History · Recharge Campaigns · Payroll Orders · Trader Orders · Trader Transactions · Topup Trader Approvals · Coin Trader Hub · Coin Traders · Gift Transactions · User Reports · Support Reports

## What ships

### 1. Shared utility — `src/utils/reportExport.ts`
Pure, framework-agnostic. Accepts any array-of-objects.
- `exportReportCSV(rows, columns, fileName)`
- `exportReportHTML(rows, columns, { title, subtitle, fileName, summary, brand })`
- `exportReportPDF(rows, columns, { title, subtitle, fileName, summary, brand, orientation })`
- HTML output = standalone, self-styled, print-ready (Meri Live branding, blue accent, slate ink, totals row, generated-at timestamp, page header on print).
- PDF output = same template rendered via `jsPDF` + `jspdf-autotable` (already in project from earlier log-export work; reuse).
- All three filenames are date-stamped (`finance-report-2026-06-28.pdf`).

### 2. Shared component — `src/components/admin/ReportExportMenu.tsx`
Drop-in `<DropdownMenu>` button: "Export ▾" with HTML / PDF / CSV items. Cloud-white 3D admin styling, matches existing log-export menu. Props: `{ rows, columns, title, subtitle, fileName, summary?, orientation? }`.

### 3. Page integration
In each of the 19 pages, place `<ReportExportMenu …/>` in the existing page header (next to filters / refresh). Wire it to whatever filtered dataset the page already renders — no new state, no new fetches, just expose what's on screen. Column maps defined per page (e.g. Withdrawals: User, Amount, Method, Status, Requested At, Processed At).

### 4. Branding
Header block on every export:
- Logo text "Meri Live — Admin Financial Report"
- Report title + subtitle (e.g. "Withdrawals · Status: Pending · Jun 1 – Jun 28")
- Generated-at timestamp + exporting admin email
- Footer with page numbers (PDF) / print CSS (HTML)

## Out of scope
- Server-side scheduled exports (can add later if requested)
- Excel (.xlsx) — CSV opens in Excel; add only if asked
- Non-financial admin pages (logs already have their own exporter)

## Tech notes
- Reuses already-installed `jspdf` from `src/utils/exportLogs.ts`; adds `jspdf-autotable` if missing.
- HTML export uses a Blob + anchor download (no extra deps).
- No DB / edge function changes. Pure frontend, additive — no risk to existing flows.
