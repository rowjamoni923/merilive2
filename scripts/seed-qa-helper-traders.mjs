#!/usr/bin/env node
/**
 * QA Seed — Helper-Trader L1–L5 visibility coverage.
 *
 * Creates / refreshes a known matrix of `topup_helpers` rows so QA can verify
 * the Diamond Store → Verified Traders tier-visibility logic end-to-end:
 *
 *   TIER_MIN = { 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 }
 *
 * For every level L ∈ {1..5} this seeds FOUR helpers covering each visibility
 * branch the UI's `helperDiag` reports:
 *
 *   1. ABOVE  threshold + active + verified           → SHOWS in feed
 *   2. AT     threshold (exact wallet == TIER_MIN[L]) → SHOWS  (boundary)
 *   3. BELOW  threshold                               → HIDDEN (byTierMin++)
 *   4. ABOVE  threshold but is_active=false           → HIDDEN (byInactive++)
 *
 * Plus one extra wrong-country helper to cover byCountry++.
 *
 * The seeded profiles use deterministic emails (`qa-trader-l{n}-{tag}@merilive.test`)
 * so re-running the script UPSERTs in place — no duplicates, idempotent.
 *
 * Usage (local dev, never prod):
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  node scripts/seed-qa-helper-traders.mjs
 *
 * Cleanup:
 *   node scripts/seed-qa-helper-traders.mjs --cleanup
 *
 * After seeding, log in as any user with country_code='BD' and visit /recharge
 * → the Verified Traders strip should show exactly 10 helpers
 * (2 per level × 5 levels) and the diagnostic panel should report the
 * hidden counts matching the matrix below.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const TIER_MIN = { 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 };
const COUNTRY = 'BD';
const WRONG_COUNTRY = 'IN';
const EMAIL_DOMAIN = 'merilive.test';

/** Matrix row factory. */
const buildMatrix = () => {
  const rows = [];
  for (const level of [1, 2, 3, 4, 5]) {
    const min = TIER_MIN[level];
    rows.push(
      { level, tag: 'above',    wallet: min + 25_000, active: true,  verified: true,  country: COUNTRY,       expect: 'SHOW'   },
      { level, tag: 'at',       wallet: min,          active: true,  verified: true,  country: COUNTRY,       expect: 'SHOW'   },
      { level, tag: 'below',    wallet: Math.max(0, min - 1_000), active: true,  verified: true,  country: COUNTRY,       expect: 'HIDE-tier' },
      { level, tag: 'inactive', wallet: min + 50_000, active: false, verified: true,  country: COUNTRY,       expect: 'HIDE-inactive' },
    );
  }
  // Extra: wrong-country active helper to cover byCountry diag.
  rows.push({ level: 3, tag: 'wrongcc', wallet: 500_000, active: true, verified: true, country: WRONG_COUNTRY, expect: 'HIDE-country' });
  return rows;
};

const emailFor = (r) => `qa-trader-l${r.level}-${r.tag}@${EMAIL_DOMAIN}`;
const displayName = (r) => `QA Trader L${r.level} (${r.tag})`;

async function findOrCreateAuthUser(email, name) {
  // Look up by email via admin listUsers (paginated). Service role required.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: 'QaTrader!2026',
    user_metadata: { display_name: name, qa_seed: true },
  });
  if (error) throw error;
  return data.user.id;
}

async function upsertProfile(userId, row) {
  await supabase.from('profiles').upsert({
    id: userId,
    display_name: displayName(row),
    country_code: row.country,
    country_name: row.country === 'BD' ? 'Bangladesh' : 'India',
    gender: 'male',
    qa_seed: true,
  }, { onConflict: 'id' });
}

async function upsertHelper(userId, row) {
  // Delete-then-insert keeps it idempotent without depending on a UNIQUE(user_id)
  // constraint we may not have. topup_helpers.user_id should already be unique
  // per app rules — duplicate cleanup is safe here.
  await supabase.from('topup_helpers').delete().eq('user_id', userId);
  const { error } = await supabase.from('topup_helpers').insert({
    user_id: userId,
    is_active: row.active,
    is_verified: row.verified,
    trader_level: row.level,
    wallet_balance: row.wallet,
    country_code: row.country,
    supported_countries: [row.country],
    payroll_enabled: row.level === 5,
    approved_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function seed() {
  const matrix = buildMatrix();
  console.log(`🌱 Seeding ${matrix.length} QA helper-trader rows...\n`);

  const summary = { SHOW: 0, 'HIDE-tier': 0, 'HIDE-inactive': 0, 'HIDE-country': 0 };

  for (const row of matrix) {
    const email = emailFor(row);
    try {
      const uid = await findOrCreateAuthUser(email, displayName(row));
      await upsertProfile(uid, row);
      await upsertHelper(uid, row);
      summary[row.expect] = (summary[row.expect] || 0) + 1;
      console.log(`  ✓ L${row.level} ${row.tag.padEnd(8)} wallet=${String(row.wallet).padStart(7)} → ${row.expect}`);
    } catch (e) {
      console.error(`  ✗ ${email}:`, e.message);
    }
  }

  console.log('\n📊 Expected /recharge diagnostic (logged in as a BD user):');
  console.log(`   rawTotal     ≥ ${matrix.length}`);
  console.log(`   SHOW         = ${summary.SHOW}   (visible traders, 2 per level × 5)`);
  console.log(`   byTierMin    ≥ ${summary['HIDE-tier']}`);
  console.log(`   byInactive   ≥ ${summary['HIDE-inactive']}`);
  console.log(`   byCountry    ≥ ${summary['HIDE-country']}`);
  console.log('\n✅ QA seed complete. Open /recharge to verify visibility matrix.');
}

async function cleanup() {
  console.log('🧹 Cleaning up QA helper-trader seed rows...\n');
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const qaUsers = list.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`) && u.email.startsWith('qa-trader-'));
  for (const u of qaUsers) {
    await supabase.from('topup_helpers').delete().eq('user_id', u.id);
    await supabase.from('profiles').delete().eq('id', u.id);
    await supabase.auth.admin.deleteUser(u.id);
    console.log(`  ✓ removed ${u.email}`);
  }
  console.log(`\n✅ Removed ${qaUsers.length} QA users.`);
}

(async () => {
  try {
    if (process.argv.includes('--cleanup')) await cleanup();
    else await seed();
  } catch (e) {
    console.error('💥', e);
    process.exit(1);
  }
})();
