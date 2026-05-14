#!/usr/bin/env node
/**
 * Readability codemod (Phase 2 of Premium Polish plan).
 *
 * SAFE because every rewrite only fires when both halves of the bad pair
 * are present in the SAME className string (or within a 14-line context
 * window for the gradient-header subtitle case).  No blind file-wide
 * regex.  Lines tagged `// dark-ok` are skipped.
 *
 * Rules:
 *  R1  text-white   on bg-white / bg-card / bg-slate-{50,100} / bg-background  → text-slate-900
 *  R2  text-slate-{800,900}  on bg-gradient-* from-(brand|info|success|warning|destructive|primary|purple|pink|rose|red|emerald|green|blue|indigo)-{500..900}  → text-white
 *  R3  border-white  on bg-white / bg-card / bg-slate-{50,100,background}  → border-slate-200
 *  R4  Subtitle inside dark-gradient header: `text-(xs|sm|base) text-slate-{500,600,700}` within 14 lines after a `text-white` header gradient → `text-white/80`
 *
 * Usage:
 *   node scripts/fix-readability-pairs.mjs           # apply
 *   node scripts/fix-readability-pairs.mjs --dry     # report only
 *   node scripts/fix-readability-pairs.mjs --file=src/pages/Foo.tsx
 */
import fs from 'fs';
import path from 'path';

const dry = process.argv.includes('--dry');
const fileArg = process.argv.find(a => a.startsWith('--file='));

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'merilive_flutter', 'android', 'ios']);

const LIGHT_BG = '(?:bg-white(?!\\/)|bg-card|bg-slate-50|bg-slate-100|bg-background)';
const DARK_GRAD = 'bg-gradient-to-[a-z]+\\s+from-(?:brand|info|success|warning|destructive|primary|purple|pink|rose|red|emerald|green|blue|indigo)-(?:5|6|7|8|9)00';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = fileArg ? [fileArg.split('=')[1]] : walk('src');
const counts = { R1: 0, R2: 0, R3: 0, R4: 0 };
let changedFiles = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/\/\/\s*dark-ok/.test(raw)) continue;

    let line = raw;

    // Find every className="..." (or `...`) on this line
    line = line.replace(/(className=(?:"|`|\{`))([^"`}]+)("|`|`\}|`)/g, (full, open, body, close) => {
      let b = body;
      const hasLightBg = new RegExp(LIGHT_BG).test(b);
      const hasDarkGrad = new RegExp(DARK_GRAD).test(b);

      // R1: text-white on light surface → text-slate-900
      if (hasLightBg && /\btext-white\b(?!\/)/.test(b)) {
        b = b.replace(/\btext-white\b/g, 'text-slate-900');
        counts.R1++;
      }
      // R2: dark slate text on dark gradient → text-white
      if (hasDarkGrad && /\btext-slate-(800|900)\b(?!\/)/.test(b)) {
        b = b.replace(/\btext-slate-(?:800|900)\b/g, 'text-white');
        counts.R2++;
      }
      // R3: border-white on light surface → border-slate-200
      if (hasLightBg && /\bborder-white\b(?!\/)/.test(b)) {
        b = b.replace(/\bborder-white\b/g, 'border-slate-200');
        counts.R3++;
      }
      return open + b + close;
    });

    lines[i] = line;
  }

  // R4: subtitle / muted-helper inside a dark gradient header
  for (let i = 0; i < lines.length; i++) {
    if (/\/\/\s*dark-ok/.test(lines[i])) continue;
    if (!/text-(?:xs|sm|base)\s+text-slate-(?:500|600|700)\b(?!\/)/.test(lines[i])) continue;

    const start = Math.max(0, i - 14);
    const ctx = lines.slice(start, i).join('\n');
    // Header context: a dark gradient with white text within 14 prior lines, NOT closed by </header>/</div>
    const looksLikeGradientHeader =
      new RegExp(DARK_GRAD + '[\\s\\S]*?text-white').test(ctx) &&
      !/<\/header>/.test(ctx.split('\n').slice(-12).join('\n'));

    if (looksLikeGradientHeader) {
      lines[i] = lines[i].replace(/text-slate-(500|600|700)\b/, 'text-white/80');
      counts.R4++;
    }
  }

  const next = lines.join('\n');
  if (next !== original) {
    changedFiles++;
    if (!dry) fs.writeFileSync(file, next);
    console.log((dry ? '[dry] ' : '✓ ') + file);
  }
}

console.log('\n── Readability codemod summary ──');
for (const [r, n] of Object.entries(counts)) console.log(`  ${r}  ${n} rewrite${n === 1 ? '' : 's'}`);
console.log(`  ${changedFiles} file${changedFiles === 1 ? '' : 's'} ${dry ? 'would be' : ''} changed.`);
