#!/usr/bin/env node
/**
 * Dark-token scanner.
 *
 * Fails (exit 1) if forbidden dark Tailwind tokens are found in src/.
 * The whole app is on a strict LIGHT theme — dark backgrounds and white
 * text on light surfaces are bugs.
 *
 * Opt-out per line:  add a trailing comment `// dark-ok` on the same line.
 * Opt-out per file:  add the file path to ALLOWLIST_FILES below.
 *
 * Run manually:    node scripts/scan-dark-tokens.mjs
 * Update baseline: node scripts/scan-dark-tokens.mjs --update-baseline
 * Run via npm:     npm run scan:dark
 * Wired into vite build via vite.config.ts (buildStart hook).
 *
 * Baseline policy:
 *   The repo currently has historical dark-token usage that is being cleaned
 *   incrementally. `scripts/dark-tokens-baseline.json` records the per-file
 *   violation count at the time the scanner was introduced. Builds fail ONLY
 *   when a file's count exceeds its baseline, OR when a NEW file picks up
 *   dark tokens. So: cleaning is always allowed, regressing is not.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(ROOT, "src");

// Files that are intentionally dark (one-off exceptions).
// Keep this list TINY and justified.
const ALLOWLIST_FILES = new Set([
  // "src/components/some/IntentionallyDark.tsx",
].map((p) => p.split("/").join(sep)));

// Path prefixes (relative to repo root, posix-style) that are entirely
// excluded from the scan because they ship their own intentional dark theme.
//   - admin/**         → premium gold-on-dark luxury panel
//   - live/**, party/* → cinema-style broadcast surfaces
//   - call/**          → in-call dark UX
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

// Folders skipped entirely.
const SKIP_DIRS = new Set(["__tests__", "__mocks__", "node_modules"]);

// Forbidden patterns. Each is a regex tested against the file content line-by-line.
// Matches Tailwind utility classes inside class strings.
const RULES = [
  {
    id: "bg-black",
    // bg-black, bg-black/40, hover:bg-black, etc.
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*bg-black(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "Use a light surface (bg-white / bg-slate-50 / bg-background) instead of bg-black.",
  },
  {
    id: "bg-slate-dark",
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*bg-slate-(?:700|800|900|950)(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "Dark slate background — use bg-white / bg-slate-50 / bg-slate-100 instead.",
  },
  {
    id: "bg-zinc-dark",
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*bg-zinc-(?:700|800|900|950)(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "Dark zinc background — switch to a light surface.",
  },
  {
    id: "bg-gray-dark",
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*bg-gray-(?:800|900|950)(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "Dark gray background — switch to a light surface.",
  },
  {
    id: "bg-neutral-dark",
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*bg-neutral-(?:800|900|950)(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "Dark neutral background — switch to a light surface.",
  },
  {
    id: "text-white",
    // text-white and text-white/X, in any responsive/state variant.
    // Allowed inside gradient hero cards via `// dark-ok` line marker.
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*text-white(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "text-white on a light theme is unreadable. Use text-slate-700/800/900 or text-foreground. If this is on a colored gradient, add `// dark-ok` to the line.",
  },
  {
    id: "border-white",
    re: /(?:^|[\s"'`:])(?:hover:|focus:|active:|group-hover:|dark:|md:|sm:|lg:|xl:)*border-white(?:\/\d+)?(?=[\s"'`]|$)/,
    msg: "border-white is invisible on light surfaces. Use border-slate-200 / border-slate-300.",
  },
  {
    id: "dark-variant",
    re: /(?:^|[\s"'`])dark:[a-z0-9-]+/,
    msg: "Project is light-only. Remove `dark:` variants.",
  },
];

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else {
      const dot = entry.lastIndexOf(".");
      if (dot < 0) continue;
      if (EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const relPosix = rel.split(sep).join("/");
  if (ALLOWLIST_FILES.has(rel)) continue;
  if (EXCLUDED_PREFIXES.some((p) => relPosix.startsWith(p))) continue;

  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("dark-ok")) continue;

    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          msg: rule.msg,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
}

// Build per-file count map.
const counts = {};
for (const v of violations) counts[v.file.split(sep).join("/")] = (counts[v.file.split(sep).join("/")] || 0) + 1;

const BASELINE_PATH = join(ROOT, "scripts", "dark-tokens-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

if (updateBaseline) {
  writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + "\n");
  console.log(`✓ baseline updated: ${Object.keys(counts).length} file(s), ${violations.length} violation(s)`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : {};

// Regressions: files where current count > baseline count (or file is new).
const regressions = [];
for (const [file, count] of Object.entries(counts)) {
  const base = baseline[file] || 0;
  if (count > base) regressions.push({ file, count, base });
}

const total = violations.length;
const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);

if (regressions.length === 0) {
  if (total < baselineTotal) {
    console.log(`✓ dark-token scan: clean (${total} legacy violation(s), down from baseline ${baselineTotal}). Run \`npm run scan:dark:baseline\` to lock in.`);
  } else {
    console.log(`✓ dark-token scan: no regressions (${total} legacy violation(s) tracked in baseline)`);
  }
  process.exit(0);
}

// Group regressions' actual violations for readable output.
const regressedFiles = new Set(regressions.map((r) => r.file));
const byFile = new Map();
for (const v of violations) {
  const key = v.file.split(sep).join("/");
  if (!regressedFiles.has(key)) continue;
  if (!byFile.has(key)) byFile.set(key, []);
  byFile.get(key).push(v);
}

console.error(`\n✗ dark-token scan: ${regressions.length} file(s) regressed beyond baseline\n`);
for (const r of regressions) {
  console.error(`  ${r.file}  (${r.base} → ${r.count})`);
  for (const v of byFile.get(r.file) || []) {
    console.error(`    L${v.line}  [${v.rule}]  ${v.snippet}`);
    console.error(`             → ${v.msg}`);
  }
  console.error("");
}
console.error("Fix the new violations, OR add `// dark-ok` on the line if intentional (e.g. text-white on a colored gradient hero card).");
console.error("If you cleaned a file and just want to update the floor: `npm run scan:dark:baseline`.\n");
process.exit(1);
