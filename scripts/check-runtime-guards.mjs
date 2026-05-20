#!/usr/bin/env node
/**
 * Pkg62 — Runtime Guardrails (Call / Live / Party)
 * -------------------------------------------------
 * Pre-deploy CI gate that protects the instant-fixes shipped in Pkg53,
 * Pkg56, Pkg57 and the realtime channel standard from silent regression.
 *
 * Three independent checks scan the codebase and exit non-zero on breach:
 *
 *   G1  Interval floor    — no setInterval / *_POLL_MS / *_POLL_INTERVAL
 *                            constant under FLOOR_MS in call/live/party
 *                            code paths.   (Pkg57 — $1400 bill prevention)
 *
 *   G2  RLS leak guard    — no cross-user `from('profiles')` /
 *                            `from('agencies')` SELECT — must hit the
 *                            `_public` view.   (Pkg56 sweep)
 *
 *   G3  Realtime channel  — every `.channel('name')` name must end in a
 *                            unique suffix segment (`-${id}` / random),
 *                            or carry the `// channel-singleton-ok` mark.
 *                            (supabase-realtime-subscription-standard)
 *
 * Escape hatch on any guard:  // guard-ok: <short reason>
 *
 * Usage:
 *   node scripts/check-runtime-guards.mjs                # all guards
 *   node scripts/check-runtime-guards.mjs --only=intervals
 *   node scripts/check-runtime-guards.mjs --json
 *   npm run check:guards                                 # via package.json
 *   npm test                                             # via vitest wrapper
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC       = path.join(ROOT, 'src');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const ONLY = String(args.only ?? '');
const AS_JSON = !!args.json;

// ── Tunables ────────────────────────────────────────────────────────────────
const INTERVAL_FLOOR_MS = 5_000;     // anything tighter must justify itself
const CALL_LIVE_PARTY_HINTS = [
  'call', 'live', 'party', 'stream', 'gift', 'broadcast',
  'private_call', 'live_stream', 'party_room',
];
const PUBLIC_VIEW_TABLES = ['profiles', 'agencies'];

// ── Walk ────────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'android', 'ios', 'merilive_flutter', 'public', 'supabase']);
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const violations = { intervals: [], rls: [], channels: [] };

const hasEscape = (line) => /\/\/\s*guard-ok\b/.test(line);
const isTestFile = (file) => /\.(test|spec)\.[tj]sx?$/.test(file) || file.includes(`${path.sep}test${path.sep}`);
const looksCallLiveParty = (file, line) => {
  const hay = (file + '\n' + line).toLowerCase();
  return CALL_LIVE_PARTY_HINTS.some((h) => hay.includes(h));
};

// ── Guards ──────────────────────────────────────────────────────────────────
function scanIntervals(file, lines) {
  // Two forms:
  //   setInterval(fn, 800)
  //   const FOO_POLL_MS = 800; / const FOO_POLL_INTERVAL = 800;
  const reSetInterval = /\bsetInterval\s*\([^,]+,\s*(\d{2,6})\b/g;
  const reConst       = /\b(?:const|let)\s+(\w*(?:POLL|INTERVAL|REFRESH|TICK|FETCH)\w*)\s*[:=]\s*(?:[\w.<>]+\s*=\s*)?(\d{2,6})\b/g;
  lines.forEach((line, i) => {
    if (hasEscape(line)) return;
    if (!looksCallLiveParty(file, line)) return;
    let m;
    while ((m = reSetInterval.exec(line))) {
      const ms = Number(m[1]);
      if (ms > 0 && ms < INTERVAL_FLOOR_MS)
        violations.intervals.push({ file, line: i + 1, ms, code: line.trim().slice(0, 140) });
    }
    while ((m = reConst.exec(line))) {
      const ms = Number(m[2]);
      if (ms > 0 && ms < INTERVAL_FLOOR_MS)
        violations.intervals.push({ file, line: i + 1, ms, name: m[1], code: line.trim().slice(0, 140) });
    }
  });
}

function scanRlsLeaks(file, lines) {
  // .from('profiles')  /  .from("agencies")
  // Allowed: the _public view, owner-only fetches in well-known auth hooks.
  const re = new RegExp(`\\.from\\(\\s*['"\`](${PUBLIC_VIEW_TABLES.join('|')})['"\`]\\s*\\)`, 'g');
  const ownerOnlyFiles = [
    'useAuthSession', 'useCurrentProfile', 'useProfile', 'useUserProfile',
    'authClient', 'currentUser', 'sessionRecovery', 'profileSelfHeal',
  ];
  const isOwnerOnly = ownerOnlyFiles.some((s) => file.includes(s));
  lines.forEach((line, i) => {
    if (hasEscape(line)) return;
    if (isOwnerOnly) return;          // owner-row fetches are fine
    let m;
    while ((m = re.exec(line))) {
      // Heuristic: if the same line uses .eq('id', auth uid)/('user_id', userId)
      // patterns to fetch a single row, treat as owner-only — but only when
      // file context says so. Otherwise flag.
      const isSingleOwnerEq = /\.eq\(\s*['"`](?:id|user_id)['"`]\s*,\s*(?:user\.id|userId|currentUserId|session\.user\.id)\s*\)/.test(line);
      if (isSingleOwnerEq) continue;
      violations.rls.push({
        file, line: i + 1, table: m[1],
        code: line.trim().slice(0, 140),
        hint: `Use '${m[1]}_public' view for non-owner reads (Pkg56).`,
      });
    }
  });
}

function scanChannels(file, lines) {
  // .channel('name')   — name must end in -<id> or :<id> or contain ${...}
  const re = /\.channel\(\s*([`'"])([^`'"]+)\1/g;
  lines.forEach((line, i) => {
    if (hasEscape(line)) return;
    if (/\/\/\s*channel-singleton-ok\b/.test(line)) return;
    let m;
    while ((m = re.exec(line))) {
      const name = m[2];
      const dynamic = /\$\{|\:\$\{|\-\$\{|@/.test(name) || /[-:]\w{6,}/.test(name);
      // Template strings (backtick) with ${...} → dynamic.
      if (m[1] === '`' && name.includes('${')) continue;
      if (dynamic) continue;
      violations.channels.push({
        file, line: i + 1, channel: name,
        code: line.trim().slice(0, 140),
        hint: 'Append a unique suffix (-${id}) per Realtime subscription standard, or mark "// channel-singleton-ok".',
      });
    }
  });
}

// ── Run ─────────────────────────────────────────────────────────────────────
for (const file of files) {
  if (isTestFile(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  if (ONLY === '' || ONLY === 'intervals') scanIntervals(file, lines);
  if (ONLY === '' || ONLY === 'rls')        scanRlsLeaks(file, lines);
  if (ONLY === '' || ONLY === 'channels')   scanChannels(file, lines);
}

// ── Baseline (accept legacy) ────────────────────────────────────────────────
const BASELINE_PATH = path.join(__dirname, 'runtime-guards-baseline.json');
let baseline = { intervals: [], rls: [], channels: [] };
if (fs.existsSync(BASELINE_PATH))
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

if (args['update-baseline']) {
  const next = {
    intervals: violations.intervals.map(v => ({ file: rel(v.file), line: v.line, name: v.name, ms: v.ms })),
    rls:       violations.rls.map(v => ({ file: rel(v.file), line: v.line, table: v.table })),
    channels:  violations.channels.map(v => ({ file: rel(v.file), line: v.line, channel: v.channel })),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`✓ Baseline written: ${rel(BASELINE_PATH)}`);
  process.exit(0);
}

const key = (v) => `${rel(v.file)}:${v.line}:${v.table ?? v.channel ?? v.name ?? v.ms}`;
const baseKey = (v) => `${v.file}:${v.line}:${v.table ?? v.channel ?? v.name ?? v.ms}`;
const baseSet = {
  intervals: new Set(baseline.intervals.map(baseKey)),
  rls:       new Set(baseline.rls.map(baseKey)),
  channels:  new Set(baseline.channels.map(baseKey)),
};
const newOnly = {
  intervals: violations.intervals.filter(v => !baseSet.intervals.has(key(v))),
  rls:       violations.rls.filter(v => !baseSet.rls.has(key(v))),
  channels:  violations.channels.filter(v => !baseSet.channels.has(key(v))),
};

function rel(f) { return path.relative(ROOT, f); }

// ── Output ──────────────────────────────────────────────────────────────────
const totalNew = newOnly.intervals.length + newOnly.rls.length + newOnly.channels.length;
const totalAll = violations.intervals.length + violations.rls.length + violations.channels.length;

if (AS_JSON) {
  console.log(JSON.stringify({ violations: newOnly, baseline_accepted: totalAll - totalNew }, null, 2));
  process.exit(totalNew ? 1 : 0);
}

const header = (s) => console.log(`\n━━ ${s} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
if (newOnly.intervals.length) {
  header(`G1  Interval floor breach (< ${INTERVAL_FLOOR_MS}ms)`);
  for (const v of newOnly.intervals)
    console.log(`  ${rel(v.file)}:${v.line}  ${v.ms}ms ${v.name ? '(' + v.name + ')' : ''}\n    ${v.code}`);
}
if (newOnly.rls.length) {
  header('G2  RLS leak — cross-user table read');
  for (const v of newOnly.rls)
    console.log(`  ${rel(v.file)}:${v.line}  from('${v.table}')\n    ${v.code}\n    → ${v.hint}`);
}
if (newOnly.channels.length) {
  header('G3  Realtime channel without unique suffix');
  for (const v of newOnly.channels)
    console.log(`  ${rel(v.file)}:${v.line}  channel('${v.channel}')\n    ${v.code}\n    → ${v.hint}`);
}

if (totalNew === 0) {
  console.log(`✓ Runtime guards clean (${totalAll - totalNew} accepted via baseline).`);
  process.exit(0);
}
console.log(`\n✗ ${totalNew} new guard violation(s). Fix, add "// guard-ok: <reason>", or accept via:`);
console.log(`    npm run check:guards:baseline`);
process.exit(1);
