/**
 * Pkg62 — CI gate for runtime guardrails.
 *
 * Runs `scripts/check-runtime-guards.mjs` and fails `npm test` if any NEW
 * violation (not in baseline) appears for:
 *   G1  Interval floor (< 5000ms) in call/live/party paths
 *   G2  Cross-user reads of profiles/agencies tables
 *   G3  Realtime channels without a unique suffix
 *
 * To accept a new finding intentionally:
 *   - Fix it, OR
 *   - Append `// guard-ok: <reason>` to the line, OR
 *   - Re-baseline:  npm run check:guards:baseline
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Pkg62 runtime guards (RLS / intervals / realtime channels)', () => {
  it('no new violations vs scripts/runtime-guards-baseline.json', () => {
    const r = spawnSync('node', ['scripts/check-runtime-guards.mjs', '--json'], {
      cwd: ROOT, encoding: 'utf8',
    });
    const out = (r.stdout || '').trim();
    let parsed: any = {};
    try { parsed = JSON.parse(out); } catch { /* non-zero exits also print human report */ }
    const v = parsed.violations ?? { intervals: [], rls: [], channels: [] };
    const total = v.intervals.length + v.rls.length + v.channels.length;
    if (total > 0) {
      // eslint-disable-next-line no-console
      console.error('\nNew runtime-guard violations:\n', JSON.stringify(v, null, 2));
    }
    expect(total, 'see console for diff; fix, // guard-ok: <reason>, or re-baseline').toBe(0);
  }, 30_000);
});
