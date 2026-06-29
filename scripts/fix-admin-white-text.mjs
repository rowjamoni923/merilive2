#!/usr/bin/env node
/**
 * Surgical codemod: replace invisible white text on admin canvas
 * with semantic slate ink. Only touches lines flagged by
 * scripts/audit-admin-theme.mjs as `white-on-light`.
 *
 * Mapping (matches admin cloud-white 3D tokens):
 *   text-white/40,50          -> text-slate-500
 *   text-white/60,70          -> text-slate-600
 *   text-white/80             -> text-slate-700
 *   text-white/90             -> text-slate-800
 *   text-white  (plain)       -> text-slate-900
 *   hover:text-white          -> hover:text-slate-900
 *   data-[state=...]:text-white -> ...:text-slate-900
 *
 * Skips lines containing bg-, from-, via-, to-, gradient, Button, Badge
 * (those are already excluded by the audit rule, but we double-check).
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

let json;
try {
  json = execSync("node scripts/audit-admin-theme.mjs --json --quiet", {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (e) {
  // audit exits non-zero when errors exist; stdout still holds the JSON
  json = e.stdout?.toString() || "";
}
const data = JSON.parse(json);
const targets = data.findings.filter(
  (f) => f.rule === "white-on-light" && f.line > 0,
);

// Group by file
const byFile = new Map();
for (const t of targets) {
  if (!byFile.has(t.file)) byFile.set(t.file, new Set());
  byFile.get(t.file).add(t.line);
}

const REPLACEMENTS = [
  // fractional opacities first (most specific)
  [/\btext-white\/(?:40|50)\b/g, "text-slate-500"],
  [/\btext-white\/(?:60|70)\b/g, "text-slate-600"],
  [/\btext-white\/80\b/g, "text-slate-700"],
  [/\btext-white\/90\b/g, "text-slate-800"],
  // hover/state variants
  [/\bhover:text-white\/(?:60|70)\b/g, "hover:text-slate-600"],
  [/\bhover:text-white\/(?:80|90)\b/g, "hover:text-slate-800"],
  [/\bhover:text-white\b/g, "hover:text-slate-900"],
  [/(\bdata-\[[^\]]+\]):text-white\b/g, "$1:text-slate-900"],
  // plain (last)
  [/\btext-white\b(?!\/)/g, "text-slate-900"],
];

const SKIP_PATTERN = /\b(bg-|from-|via-|to-|gradient|Gradient|Button|Badge)\b/;

let filesChanged = 0;
let linesChanged = 0;

for (const [file, lineSet] of byFile) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  let changed = false;
  for (const ln of lineSet) {
    const idx = ln - 1;
    if (idx < 0 || idx >= lines.length) continue;
    const original = lines[idx];
    if (SKIP_PATTERN.test(original)) continue; // safety net
    let next = original;
    for (const [re, rep] of REPLACEMENTS) {
      next = next.replace(re, rep);
    }
    if (next !== original) {
      lines[idx] = next;
      changed = true;
      linesChanged++;
    }
  }
  if (changed) {
    writeFileSync(file, lines.join("\n"));
    filesChanged++;
  }
}

console.log(`✓ admin white-text fix: ${linesChanged} lines across ${filesChanged} files`);
