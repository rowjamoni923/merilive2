#!/usr/bin/env node
/**
 * Auto-audit user-facing modal/dialog/sheet/drawer files for "light premium professional" style.
 *
 * Flags (in dialog/modal scope only):
 *   M1  Pure dark surface  (bg-black, bg-slate-900, bg-gray-900, bg-zinc-900, bg-neutral-900)
 *   M2  Glass-on-unknown   (bg-white/5, bg-white/10 with text-white/text-slate-100/200)
 *   M3  Faint body text    (text-slate-400, text-gray-400, text-zinc-400, text-muted-foreground/50)
 *   M4  Mixed gradient stop  light → dark → light  (from-*-50 via-*-800/900 to-*-50)
 *   M5  Low-contrast icon   text-{red,blue,green,amber,cyan,indigo,violet,pink,emerald,sky}-300/400
 *                            inside a card without a dark bg-* sibling
 *   M6  Hard border on dark  border-white/5..20 (glass border) inside a dialog
 *
 * Skips: src/pages/admin/**, src/components/admin/**, lines tagged // dark-ok,
 *        and files with no Dialog/AlertDialog/Sheet/Drawer/Modal anchor.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/pages", "src/components"];
const SKIP_DIRS = [/\/admin(\/|$)/, /\/ui\//];

const ANCHOR = /\b(DialogContent|AlertDialogContent|SheetContent|DrawerContent|Modal[A-Z]|<Popover)/;

const RULES = [
  { id: "M1", label: "Pure dark surface in modal",
    re: /\b(bg-(black|slate-(800|900|950)|gray-(800|900|950)|zinc-(800|900|950)|neutral-(800|900|950)))\b/ },
  { id: "M2", label: "Glass white/5-10 with light text",
    re: /\bbg-white\/(5|10)\b[^"'`]*\b(text-white|text-slate-(50|100|200)|text-gray-(50|100|200))\b/ },
  { id: "M3", label: "Faint body text (slate-400/gray-400/zinc-400/muted/50)",
    re: /\btext-(slate-400|gray-400|zinc-400)\b|text-muted-foreground\/(30|40|50)\b/ },
  { id: "M4", label: "Mixed light→dark→light gradient",
    re: /from-[a-z]+-(50|100)\/[0-9]+[^"'`]*via-[a-z]+-(700|800|900)\/[0-9]+[^"'`]*to-[a-z]+-(50|100)\/[0-9]+/ },
  { id: "M5", label: "Pale 300/400 accent icon",
    re: /\btext-(red|blue|green|amber|cyan|indigo|violet|pink|emerald|sky|orange|yellow|teal|rose|fuchsia)-(300|400)\b/ },
  { id: "M6", label: "Glass border on dialog",
    re: /\bborder-white\/(5|10|20)\b/ },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP_DIRS.some(r => r.test(p.replace(/\\/g, "/")))) continue;
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|jsx)$/.test(e.name)) yield p;
  }
}

const findings = []; // { file, id, label, line, snippet }

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    if (!ANCHOR.test(src)) continue;
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("// dark-ok") || line.includes("/* dark-ok */")) continue;
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          findings.push({
            file, id: rule.id, label: rule.label,
            line: i + 1, snippet: line.trim().slice(0, 140),
          });
        }
      }
    }
  }
}

// Group by file
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

let totalByRule = {};
for (const f of findings) totalByRule[f.id] = (totalByRule[f.id] || 0) + 1;

console.log("\n=== Modal Light-Premium Audit ===");
console.log(`Files scanned with modal anchors: ${[...byFile.keys()].length + (sortedFiles.length === 0 ? 0 : 0)}`);
console.log(`Files with findings: ${sortedFiles.length}`);
console.log(`Total findings: ${findings.length}`);
console.log("\nBy rule:");
for (const r of RULES) console.log(`  ${r.id}  ${String(totalByRule[r.id] || 0).padStart(4)}  ${r.label}`);

console.log("\n=== Fix list (top files) ===");
for (const [file, list] of sortedFiles) {
  const counts = {};
  for (const f of list) counts[f.id] = (counts[f.id] || 0) + 1;
  const tag = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`\n${file}  [${list.length}]  ${tag}`);
  for (const f of list.slice(0, 5)) {
    console.log(`  L${f.line.toString().padStart(4)}  ${f.id}  ${f.snippet}`);
  }
  if (list.length > 5) console.log(`  … +${list.length - 5} more`);
}

// JSON report
const out = "/tmp/modal-audit.json";
fs.writeFileSync(out, JSON.stringify({ totalByRule, files: Object.fromEntries(sortedFiles) }, null, 2));
console.log(`\nJSON report: ${out}`);
process.exit(findings.length > 0 ? 0 : 0);
