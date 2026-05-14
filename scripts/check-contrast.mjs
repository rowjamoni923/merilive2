#!/usr/bin/env node
/**
 * Contrast & Readability guard.
 *
 * Detects high-confidence text/background contrast bugs in Tailwind className
 * strings BEFORE they ship. Designed for CI and pre-commit.
 *
 * What it catches (paired only, no blind regex):
 *   C1  Light text  on light bg       → text-white | text-slate-100..400 sitting on
 *                                       bg-white / bg-slate-50/100 / bg-amber-50 /
 *                                       bg-rose-50 / bg-pink-50 / bg-blue-50 / bg-purple-50 /
 *                                       bg-emerald-50 / bg-orange-50 / bg-yellow-50 / bg-card / bg-background
 *   C2  Dark text   on dark bg        → text-slate|gray|zinc-700..900 on
 *                                       bg-slate|gray|zinc-700..950 / bg-black /
 *                                       dark gradient `from-slate|gray|zinc-700..900`
 *   C3  Invisible-on-dark gradient    → text-slate|gray-300..500 on bg-gradient with
 *                                       from-(purple|pink|rose|red|emerald|blue|indigo|primary)-500..900
 *
 * Scope: src/**.tsx,  excluding /admin/, /games/, /features/games/, /sdk/.
 *        Lines tagged `// dark-ok` are skipped (escape hatch).
 *
 * Usage:
 *   node scripts/check-contrast.mjs                 # report + exit 1 on issues
 *   node scripts/check-contrast.mjs --json          # machine-readable
 *   node scripts/check-contrast.mjs --baseline      # rewrite known-issue baseline
 *   node scripts/check-contrast.mjs --file=src/...  # single file
 *
 * Baseline (.contrast-baseline.json) lets pre-existing accepted findings pass;
 * new findings still fail the build. Run --baseline only after manual triage.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const optVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};

const JSON_OUT = flag('json');
const WRITE_BASELINE = flag('baseline');
const SINGLE_FILE = optVal('file');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.lovable',
  'android', 'ios', 'merilive_flutter',
]);
const SKIP_PATH = /\/(admin|games|features\/games|sdk)\//i;

const BASELINE_PATH = path.join(root, '.contrast-baseline.json');

// ─── Patterns ───────────────────────────────────────────────────────────────
// Match a Tailwind class (no leading word/colon/dash → no false hit on
// `placeholder:text-white`, `hover:bg-white`, `border-white`, etc.)
const NB = '(?<![:\\w-])';
const NA = '(?![\\w/-])';

const LIGHT_BG = new RegExp(
  `${NB}(?:bg-white(?!\\/)|bg-slate-(?:50|100)|bg-card\\b|bg-background\\b|` +
  `bg-(?:amber|rose|pink|blue|purple|emerald|orange|yellow|sky|cyan|teal|lime|fuchsia|violet|indigo)-50)${NA}`
);
const LIGHT_TEXT = new RegExp(
  `${NB}text-(?:white|slate-(?:100|200|300|400)|gray-(?:100|200|300|400)|zinc-(?:100|200|300|400)|neutral-(?:100|200|300|400))${NA}`
);
const DARK_TEXT = new RegExp(
  `${NB}text-(?:slate|gray|zinc|neutral|stone)-(?:700|800|900)${NA}`
);
const DARK_BG = new RegExp(
  `${NB}(?:bg-(?:slate|gray|zinc|neutral|stone)-(?:700|800|900|950)|bg-black(?!\\/))${NA}`
);
const DARK_GRADIENT = new RegExp(
  `bg-gradient-to-[a-z]+[^"'\`]*?from-(?:slate|gray|zinc|neutral|stone)-(?:700|800|900)`
);
const SATURATED_GRADIENT = new RegExp(
  `bg-gradient-to-[a-z]+[^"'\`]*?from-(?:purple|pink|rose|red|emerald|green|blue|indigo|fuchsia|violet|primary|secondary)-(?:500|600|700|800|900)`
);
const FAINT_TEXT_ON_DARK = new RegExp(
  `${NB}text-(?:slate|gray|zinc|neutral|stone)-(?:300|400|500)${NA}`
);
// C4: light → dark → light gradient (the CallEndedModal banner bug)
const LIGHT_GRAD_STOP = `(?:\\[#(?:[Ff][AaCcEeFf0-9]|[CcDdEeFf][0-9A-Fa-f])[A-Fa-f0-9]{4}\\]|white|slate-(?:50|100|200)|amber-(?:50|100)|rose-50|pink-50|blue-50|emerald-50|stone-(?:50|100))`;
const MIXED_DARK_VIA = new RegExp(
  `from-${LIGHT_GRAD_STOP}[^"'\`]*?via-(?:(?:slate|gray|zinc|neutral|stone)-(?:700|800|900|950)|black)|` +
  `via-(?:(?:slate|gray|zinc|neutral|stone)-(?:700|800|900|950)|black)[^"'\`]*?to-${LIGHT_GRAD_STOP}`
);


// Match every className=" … " | className={\` … \`} | className={" … "} substring,
// even when it spans lines (for clsx/template-literal style).
const CLASS_RE = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/gs;

// ─── Walker ─────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

// ─── Scan ───────────────────────────────────────────────────────────────────
function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const m of src.matchAll(CLASS_RE)) {
    const cls = (m[1] || m[2] || m[3] || '').replace(/\s+/g, ' ');
    if (!cls) continue;
    const before = src.slice(0, m.index);
    // Skip whole occurrence if its line contains dark-ok
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = src.indexOf('\n', m.index + m[0].length);
    const fullLine = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    if (fullLine.includes('dark-ok')) continue;
    const lineNo = before.split('\n').length;

    if (LIGHT_BG.test(cls) && LIGHT_TEXT.test(cls)) {
      findings.push({ file, line: lineNo, rule: 'C1', detail: 'light text on light background', cls });
    }
    if ((DARK_BG.test(cls) || DARK_GRADIENT.test(cls)) && DARK_TEXT.test(cls)) {
      findings.push({ file, line: lineNo, rule: 'C2', detail: 'dark text on dark background', cls });
    }
    if (SATURATED_GRADIENT.test(cls) && FAINT_TEXT_ON_DARK.test(cls)) {
      findings.push({ file, line: lineNo, rule: 'C3', detail: 'faint text on saturated gradient', cls });
    }
  }
  return findings;
}

const files = SINGLE_FILE
  ? [SINGLE_FILE]
  : walk(path.join(root, 'src')).filter((f) => !SKIP_PATH.test(f));

const all = [];
for (const f of files) all.push(...scanFile(f));

// ─── Baseline handling ──────────────────────────────────────────────────────
const fingerprint = (x) =>
  `${path.relative(root, x.file)}::${x.rule}::${x.cls.slice(0, 200)}`;

if (WRITE_BASELINE) {
  const baseline = all.map(fingerprint).sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Wrote ${baseline.length} known finding(s) to ${path.relative(root, BASELINE_PATH)}`);
  process.exit(0);
}

let baseline = new Set();
if (fs.existsSync(BASELINE_PATH)) {
  try { baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))); }
  catch { /* ignore malformed baseline */ }
}

const newFindings = all.filter((x) => !baseline.has(fingerprint(x)));

// ─── Output ─────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({
    total: all.length,
    baselined: all.length - newFindings.length,
    new: newFindings.length,
    findings: newFindings,
  }, null, 2));
} else {
  if (newFindings.length === 0) {
    console.log(`✔ Contrast check passed — ${files.length} files scanned, ${all.length} baselined finding(s).`);
  } else {
    console.log(`\n✖ Contrast check found ${newFindings.length} new readability issue(s):\n`);
    const byFile = {};
    for (const x of newFindings) (byFile[x.file] = byFile[x.file] || []).push(x);
    for (const f of Object.keys(byFile).sort()) {
      console.log(`  ${path.relative(root, f)}`);
      for (const x of byFile[f]) {
        console.log(`    L${x.line}  [${x.rule}] ${x.detail}`);
        console.log(`           class: ${x.cls.slice(0, 140)}${x.cls.length > 140 ? '…' : ''}`);
      }
      console.log('');
    }
    console.log('Fix the issue, OR add `// dark-ok` on the same line if it\'s an intentional case (e.g. white text on a saturated gradient that the heuristic missed),');
    console.log('OR run `node scripts/check-contrast.mjs --baseline` to accept current state (use sparingly — only after manual triage).');
  }
}

process.exit(newFindings.length > 0 ? 1 : 0);
