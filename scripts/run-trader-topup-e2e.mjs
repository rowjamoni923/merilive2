#!/usr/bin/env node
/**
 * Pkg72 — Verified Traders + 4 top-up entry points E2E runner.
 *
 * Orchestrates the focused vitest suites that together verify:
 *   • Verified Traders feed tier visibility       (Pkg64 / Pkg70)
 *   • is_approved_topup_trader gate on 3 RPC entry points (Pkg63 / Pkg69)
 *   • swift-pay-create-deposit crypto $100 floor  (Pkg71)
 *
 * Usage:  npm run test:trader-e2e
 *
 * Exits non-zero on any failure so CI / pre-deploy guards can block.
 */
import { spawnSync } from 'node:child_process';

const SUITES = [
  'src/test/verifiedTradersAndTopupEntryPointsE2E.test.ts',
  'src/test/topupTraderGateE2E.test.ts',
  'src/test/verifiedTradersTierVisibility.test.ts',
  'src/test/topUpsTodayBadgeDhakaBucket.test.ts',
  'src/test/helperApplicationCryptoMinE2E.test.ts',
];

console.log('▶ Pkg72 trader + top-up E2E runner');
console.log('   suites:');
for (const s of SUITES) console.log('     •', s);

const t0 = Date.now();
const r = spawnSync('npx', ['vitest', 'run', '--reporter=default', ...SUITES], {
  stdio: 'inherit', env: process.env,
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (r.status === 0) {
  console.log(`\n✅ Pkg72 E2E PASSED in ${secs}s — Verified Traders + 4 top-up entry points green.`);
  process.exit(0);
}
console.error(`\n❌ Pkg72 E2E FAILED in ${secs}s — investigate before deploy.`);
process.exit(r.status ?? 1);
