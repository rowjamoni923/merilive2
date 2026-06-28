#!/usr/bin/env node
/**
 * audit-admin-theme.mjs
 *
 * Visual / consistency auditor for the admin panel.
 *
 * Walks every `.tsx` file under `src/pages/admin/` (and optionally any
 * file you add via --extra) and reports color-mismatch / dark-theme
 * regressions that would break the cloud-white 3D polish:
 *
 *   1. Missing `admin-pro-shell` wrapper on a top-level admin page
 *   2. Tailwind `dark:` variants (locked OFF inside admin)
 *   3. Deep dark backgrounds: bg-(slate|gray|zinc|neutral|stone)-(800|900|950)
 *   4. Custom-hex dark gradients: from-[#0..]/to-[#0..]/via-[#0..]
 *   5. White-on-light text risk: text-white without bg- in same className
 *   6. shadcn dark token usage: bg-background / bg-popover on dark canvases
 *
 * Exit code = number of files with findings (0 = clean).
 *
 * Usage:
 *   node scripts/audit-admin-theme.mjs              # report
 *   node scripts/audit-admin-theme.mjs --json       # machine readable
 *   node scripts/audit-admin-theme.mjs --quiet      # only summary
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ADMIN_DIR = join(ROOT, "src/pages/admin");
const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has("--json");
const QUIET = args.has("--quiet");

const RULES = [
  {
    id: "missing-shell",
    label: "Missing admin-pro-shell wrapper",
    severity: "error",
    fileTest: (src, path) =>
      /export\s+default\s+function|export\s+default\s+\w/.test(src) &&
      !src.includes("admin-pro-shell") &&
      // skip helper components / hooks
      /\/Admin[A-Z]\w+\.tsx$/.test(path),
  },
  {
    id: "dark-variant",
    label: "Tailwind dark: variant (admin canvas is light-locked)",
    severity: "error",
    lineTest: (line) => / dark:[a-z-]/.test(line),
  },
  {
    id: "deep-dark-bg",
    label: "Deep dark background utility",
    severity: "error",
    lineTest: (line) =>
      /\bbg-(slate|gray|zinc|neutral|stone)-(800|900|950)\b/.test(line),
  },
  {
    id: "dark-hex-gradient",
    label: "Custom-hex dark gradient",
    severity: "warn",
    lineTest: (line) =>
      /(?:from|via|to)-\[#0[0-9a-f]{2,5}\b/i.test(line) ||
      /(?:from|via|to)-\[#1[0-3][0-9a-f]{3,4}\b/i.test(line),
  },
  {
    id: "white-on-light",
    label: "text-white without bg- / gradient on same element (legibility risk)",
    severity: "warn",
    lineTest: (line) => {
      if (!/\btext-white\b/.test(line)) return false;
      // allow if same className contains bg-, from-, gradient, badge, button
      if (/\b(bg-|from-|via-|to-|gradient|Button|Badge)\b/.test(line)) return false;
      return true;
    },
  },
  {
    id: "shadcn-dark-token",
    label: "shadcn dark token (bg-background / bg-popover) on admin canvas",
    severity: "info",
    lineTest: (line) => /\bbg-(background|popover|card)\b/.test(line) === false
      ? false
      : / dark:/.test(line), // only flag when paired with dark variant
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (full.endsWith(".tsx")) yield full;
  }
}

const findings = [];
let scanned = 0;

for (const file of walk(ADMIN_DIR)) {
  scanned++;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const rel = relative(ROOT, file);

  for (const rule of RULES) {
    if (rule.fileTest) {
      if (rule.fileTest(src, file)) {
        findings.push({ file: rel, rule: rule.id, severity: rule.severity, label: rule.label, line: 0, snippet: "" });
      }
      continue;
    }
    lines.forEach((line, idx) => {
      if (rule.lineTest(line)) {
        findings.push({
          file: rel,
          rule: rule.id,
          severity: rule.severity,
          label: rule.label,
          line: idx + 1,
          snippet: line.trim().slice(0, 160),
        });
      }
    });
  }
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
const errorCount = findings.filter((f) => f.severity === "error").length;
const warnCount = findings.filter((f) => f.severity === "warn").length;
const infoCount = findings.filter((f) => f.severity === "info").length;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { scanned, files: byFile.size, errorCount, warnCount, infoCount, findings },
      null,
      2,
    ),
  );
} else {
  const C = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
  };
  const sev = (s) =>
    s === "error" ? `${C.red}ERROR${C.reset}` :
    s === "warn" ? `${C.yellow}WARN ${C.reset}` :
                   `${C.cyan}INFO ${C.reset}`;

  if (!QUIET) {
    for (const [file, rows] of byFile) {
      console.log(`\n${C.bold}${file}${C.reset}`);
      for (const r of rows) {
        const loc = r.line ? `:${r.line}` : "";
        console.log(`  ${sev(r.severity)} [${r.rule}]${loc}  ${r.label}`);
        if (r.snippet) console.log(`     ${C.dim}${r.snippet}${C.reset}`);
      }
    }
  }
  console.log("");
  console.log(`${C.bold}Admin theme audit${C.reset}`);
  console.log(`  Scanned files : ${scanned}`);
  console.log(`  With findings : ${byFile.size}`);
  console.log(`  ${C.red}Errors${C.reset}        : ${errorCount}`);
  console.log(`  ${C.yellow}Warnings${C.reset}      : ${warnCount}`);
  console.log(`  ${C.cyan}Info${C.reset}          : ${infoCount}`);
  if (errorCount === 0 && warnCount === 0) {
    console.log(`\n${C.green}✓ Admin canvas is 100% cloud-white consistent.${C.reset}`);
  }
}

process.exit(errorCount > 0 ? 1 : 0);
