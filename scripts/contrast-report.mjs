#!/usr/bin/env node
/**
 * Human-readable contrast audit report.
 *
 * Runs the same scanner as scripts/check-contrast.mjs but reports ALL findings
 * (baselined + new), grouped two ways: by file, and by rule. Emits Markdown +
 * CSV so you can triage quickly.
 *
 * Usage:
 *   node scripts/contrast-report.mjs
 *   node scripts/contrast-report.mjs --out=/mnt/documents/contrast-report.md
 *   node scripts/contrast-report.mjs --new-only       # exclude baselined
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const flag = (n) => args.some((a) => a === `--${n}`);
const opt  = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const OUT_MD  = opt('out', '/mnt/documents/contrast-report.md');
const OUT_CSV = OUT_MD.replace(/\.md$/, '.csv');
const NEW_ONLY = flag('new-only');

// Re-use the scanner by importing its internals would require refactor; instead
// invoke it in --json mode and parse. To get ALL findings (not just new), we
// temporarily move the baseline aside.
const BASELINE = path.join(process.cwd(), '.contrast-baseline.json');
const BAK = BASELINE + '.report-bak';

let restored = false;
function restore() {
  if (restored) return;
  if (fs.existsSync(BAK)) fs.renameSync(BAK, BASELINE);
  restored = true;
}
process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(130); });

let json;
try {
  if (!NEW_ONLY && fs.existsSync(BASELINE)) fs.renameSync(BASELINE, BAK);
  const out = execSync('node scripts/check-contrast.mjs --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  json = JSON.parse(out);
} catch (e) {
  // exit code 1 still produces stdout; capture from stdout if present
  if (e.stdout) {
    try { json = JSON.parse(e.stdout.toString()); }
    catch { console.error('Failed to parse scanner output'); process.exit(2); }
  } else {
    console.error(e.message); process.exit(2);
  }
} finally {
  restore();
}

const findings = json.findings || [];
const RULE_DESC = {
  C1: 'Light text on light background',
  C2: 'Dark text on dark background',
  C3: 'Faint text on saturated gradient',
  C4: 'Dark gradient stop between light stops (text disappears mid-gradient)',
};

// ─── Aggregate ──────────────────────────────────────────────────────────────
const byFile = {};
const byRule = {};
for (const f of findings) {
  const rel = path.relative(process.cwd(), f.file);
  (byFile[rel] = byFile[rel] || []).push(f);
  (byRule[f.rule] = byRule[f.rule] || []).push({ ...f, rel });
}

const sortedFiles = Object.keys(byFile).sort(
  (a, b) => byFile[b].length - byFile[a].length || a.localeCompare(b)
);
const sortedRules = Object.keys(byRule).sort();

// ─── Markdown ───────────────────────────────────────────────────────────────
const lines = [];
const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
lines.push(`# Contrast & Readability Audit`);
lines.push('');
lines.push(`_Generated ${now}_`);
lines.push('');
lines.push(`- **Scope:** ${NEW_ONLY ? 'new findings only (baseline applied)' : 'all findings (baseline ignored)'}`);
lines.push(`- **Total findings:** ${findings.length}`);
lines.push(`- **Files affected:** ${sortedFiles.length}`);
lines.push('');

// Summary table
lines.push('## Summary by rule');
lines.push('');
lines.push('| Rule | Description | Count |');
lines.push('|------|-------------|------:|');
for (const r of sortedRules) {
  lines.push(`| **${r}** | ${RULE_DESC[r] || ''} | ${byRule[r].length} |`);
}
lines.push('');

// Top files
lines.push('## Top files');
lines.push('');
lines.push('| File | Findings |');
lines.push('|------|---------:|');
for (const f of sortedFiles.slice(0, 20)) {
  lines.push(`| \`${f}\` | ${byFile[f].length} |`);
}
lines.push('');

// By file
lines.push('## Findings by file');
lines.push('');
for (const f of sortedFiles) {
  lines.push(`### \`${f}\` — ${byFile[f].length}`);
  lines.push('');
  lines.push('| Line | Rule | Issue | Class snippet |');
  lines.push('|-----:|------|-------|---------------|');
  const items = byFile[f].slice().sort((a, b) => a.line - b.line);
  for (const x of items) {
    const snip = x.cls.replace(/\|/g, '\\|').slice(0, 120);
    lines.push(`| ${x.line} | ${x.rule} | ${x.detail} | \`${snip}${x.cls.length > 120 ? '…' : ''}\` |`);
  }
  lines.push('');
}

// By rule
lines.push('## Findings by rule');
lines.push('');
for (const r of sortedRules) {
  lines.push(`### ${r} — ${RULE_DESC[r] || ''} (${byRule[r].length})`);
  lines.push('');
  lines.push('| File | Line | Class snippet |');
  lines.push('|------|-----:|---------------|');
  const items = byRule[r].slice().sort((a, b) =>
    a.rel.localeCompare(b.rel) || a.line - b.line
  );
  for (const x of items) {
    const snip = x.cls.replace(/\|/g, '\\|').slice(0, 120);
    lines.push(`| \`${x.rel}\` | ${x.line} | \`${snip}${x.cls.length > 120 ? '…' : ''}\` |`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('**Fix workflow**');
lines.push('');
lines.push('1. Open the file at the listed line.');
lines.push('2. Replace the conflicting class with a semantic token pair (e.g. `bg-card text-card-foreground`, `bg-background text-foreground`).');
lines.push('3. If the case is intentional (e.g. white text over a dark image), append `// dark-ok` on the same line.');
lines.push('4. Re-run `node scripts/check-contrast.mjs` to confirm clean.');
lines.push('5. After triage, `node scripts/check-contrast.mjs --baseline` to snapshot accepted state.');
lines.push('');

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, lines.join('\n'));

// ─── CSV ────────────────────────────────────────────────────────────────────
const csv = ['file,line,rule,issue,class'];
for (const x of findings) {
  const rel = path.relative(process.cwd(), x.file);
  const cls = `"${x.cls.replace(/"/g, '""')}"`;
  csv.push(`${rel},${x.line},${x.rule},"${x.detail}",${cls}`);
}
fs.writeFileSync(OUT_CSV, csv.join('\n') + '\n');

console.log(`✔ Report written:`);
console.log(`   ${OUT_MD}`);
console.log(`   ${OUT_CSV}`);
console.log(`   ${findings.length} finding(s) across ${sortedFiles.length} file(s).`);
