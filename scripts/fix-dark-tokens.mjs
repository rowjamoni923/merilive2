#!/usr/bin/env node
/**
 * Dark-token codemod.
 *
 * Auto-rewrites the most common dark-on-dark Tailwind utilities to safe
 * light-theme equivalents across the same scope as scan-dark-tokens.mjs
 * (i.e. it skips intentional-dark zones: admin/, live/, party/, call/, …).
 *
 * Mapping (covers all responsive/state variants like `hover:`, `md:`, …):
 *   bg-black                → bg-white
 *   bg-black/NN             → bg-slate-900/NN  (preserves overlay alpha — scrims stay valid)
 *   bg-slate-{700|800|900|950}    → bg-white
 *   bg-slate-{700..950}/NN  → bg-slate-100/NN
 *   bg-zinc-{700..950}      → bg-white   (alpha → bg-zinc-100/NN)
 *   bg-gray-{800|900|950}    → bg-white   (alpha → bg-gray-100/NN)
 *   bg-neutral-{800|900|950}→ bg-white   (alpha → bg-neutral-100/NN)
 *   text-white              → text-slate-900
 *   text-white/NN           → text-slate-700/NN
 *   border-white            → border-slate-200
 *   border-white/NN         → border-slate-200/NN
 *   dark:<anything>         → removed
 *
 * Usage:
 *   node scripts/fix-dark-tokens.mjs           # rewrite in place
 *   node scripts/fix-dark-tokens.mjs --dry     # show diff stats only
 *   node scripts/fix-dark-tokens.mjs --file=src/pages/Foo.tsx [--file=…]
 *
 * Lines tagged `// dark-ok` are left untouched.
 * After running, re-run: npm run scan:dark   (and optionally :baseline).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(ROOT, "src");

const EXCLUDED_PREFIXES = [
  "src/components/admin/",
  "src/pages/Admin",
  "src/pages/admin/",
  "src/components/live/",
  "src/components/party/",
  "src/components/call/",
  "src/pages/LiveStream",
  "src/pages/PartyRoom",
  "src/pages/PrivateCall",
  "src/pages/UnifiedPartyRoom",
];
const SKIP_DIRS = new Set(["__tests__", "__mocks__", "node_modules"]);
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const VARIANT = "(?:(?:hover|focus|active|group-hover|focus-visible|disabled|md|sm|lg|xl|2xl|first|last|peer|peer-checked|data-\\[[^\\]]+\\]):)*";

// Each rewrite: { id, re, repl }. `re` MUST be a global regex with capture groups
// matching the variant prefix (so `hover:bg-black` survives).
const REWRITES = [
  // bg-black with opacity → keep as scrim (slate-900/NN) so overlays still darken
  { id: "bg-black/alpha", re: new RegExp(`(${VARIANT})bg-black/(\\d+)`, "g"), repl: "$1bg-slate-900/$2" },
  // bare bg-black → light surface
  { id: "bg-black", re: new RegExp(`(${VARIANT})bg-black\\b`, "g"), repl: "$1bg-white" },

  // dark slates with alpha → tint
  { id: "bg-slate-dark/alpha", re: new RegExp(`(${VARIANT})bg-slate-(?:700|800|900|950)/(\\d+)`, "g"), repl: "$1bg-slate-100/$2" },
  { id: "bg-slate-dark", re: new RegExp(`(${VARIANT})bg-slate-(?:700|800|900|950)\\b`, "g"), repl: "$1bg-white" },

  { id: "bg-zinc-dark/alpha", re: new RegExp(`(${VARIANT})bg-zinc-(?:700|800|900|950)/(\\d+)`, "g"), repl: "$1bg-zinc-100/$2" },
  { id: "bg-zinc-dark", re: new RegExp(`(${VARIANT})bg-zinc-(?:700|800|900|950)\\b`, "g"), repl: "$1bg-white" },

  { id: "bg-gray-dark/alpha", re: new RegExp(`(${VARIANT})bg-gray-(?:800|900|950)/(\\d+)`, "g"), repl: "$1bg-gray-100/$2" },
  { id: "bg-gray-dark", re: new RegExp(`(${VARIANT})bg-gray-(?:800|900|950)\\b`, "g"), repl: "$1bg-white" },

  { id: "bg-neutral-dark/alpha", re: new RegExp(`(${VARIANT})bg-neutral-(?:800|900|950)/(\\d+)`, "g"), repl: "$1bg-neutral-100/$2" },
  { id: "bg-neutral-dark", re: new RegExp(`(${VARIANT})bg-neutral-(?:800|900|950)\\b`, "g"), repl: "$1bg-white" },

  // text-white → readable slate. Keep alpha tint slightly muted.
  { id: "text-white/alpha", re: new RegExp(`(${VARIANT})text-white/(\\d+)`, "g"), repl: "$1text-slate-700/$2" },
  { id: "text-white", re: new RegExp(`(${VARIANT})text-white\\b`, "g"), repl: "$1text-slate-900" },

  // border-white → subtle slate border, alpha preserved
  { id: "border-white/alpha", re: new RegExp(`(${VARIANT})border-white/(\\d+)`, "g"), repl: "$1border-slate-200/$2" },
  { id: "border-white", re: new RegExp(`(${VARIANT})border-white\\b`, "g"), repl: "$1border-slate-200" },

  // strip `dark:foo` entirely (project is light-only)
  { id: "dark-variant", re: /\bdark:[a-z0-9/-]+(?:\[[^\]]+\])?\s*/g, repl: "" },
];

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const explicit = args.filter((a) => a.startsWith("--file=")).map((a) => a.slice("--file=".length));

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else {
      const dot = e.lastIndexOf(".");
      if (dot >= 0 && EXTS.has(e.slice(dot))) yield full;
    }
  }
}

function isAllowed(absFile) {
  const rel = relative(ROOT, absFile).split(sep).join("/");
  return !EXCLUDED_PREFIXES.some((p) => rel.startsWith(p));
}

const targets = explicit.length
  ? explicit.map((p) => join(ROOT, p))
  : [...walk(SRC)].filter(isAllowed);

const stats = { files: 0, lines: 0, byRule: {} };

for (const file of targets) {
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  const lines = content.split("\n");
  let touched = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("dark-ok")) continue;

    let next = line;
    let lineHit = false;
    for (const r of REWRITES) {
      const before = next;
      next = next.replace(r.re, r.repl);
      if (next !== before) {
        const hits = (before.match(r.re) || []).length;
        stats.byRule[r.id] = (stats.byRule[r.id] || 0) + hits;
        lineHit = true;
      }
    }
    if (lineHit) {
      // collapse extra whitespace inside class strings left by stripped `dark:` variants
      next = next.replace(/(className=\{?["'`])\s+/g, "$1").replace(/\s+(["'`]\}?)/g, "$1").replace(/ {2,}/g, " ");
      lines[i] = next;
      stats.lines++;
      touched = true;
    }
  }

  if (touched) {
    stats.files++;
    if (!DRY) writeFileSync(file, lines.join("\n"));
  }
}

console.log(`${DRY ? "[dry-run] " : ""}fix-dark-tokens: ${stats.files} file(s), ${stats.lines} line(s) rewritten`);
for (const [rule, n] of Object.entries(stats.byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule.padEnd(24)} ${n}`);
}
if (!DRY && stats.files > 0) {
  console.log(`\nNext: npm run scan:dark   # verify, then npm run scan:dark:baseline if cleaner`);
}
