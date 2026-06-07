---
name: All rates admin-configurable
description: Call price, platform cut, agency commission %, sub-agency %, hourly bonus tiers — every percentage/rate MUST come from admin panel DB tables, NEVER hardcoded in code/migrations.
type: constraint
---

# All Billing/Commission Rates Are Admin-Configurable

**Locked 2026-06-07 by user explicit instruction.**

## Rule
Every percentage, rate, threshold, commission, cut, bonus — must be **read from DB tables that the admin panel controls**. Never hardcode `35%`, `65%`, `2%`, `5%`, `70 coins/min` in app code, edge functions, or DB constraints.

## Why
User already runs a working admin panel. Business model evolves — rates change per campaign, per country, per host tier. Hardcoded = production hotfix = bad. Admin-controlled = instant change, no APK rebuild.

## Required pattern

### Tables (use existing where they exist)
- `call_price_settings` (or similar existing admin table) → per-host or per-tier call rate (viewer diamonds/min) + host bean payout/min
- `agency_policy_settings` / `agency_level_tiers` → agency commission % per tier
- `app_settings` / `system_config` → platform cut %, grace seconds, reconnect window, low-balance threshold
- `host_levels` / `topup_helper_levels` etc. → tier thresholds

### How agency commission works (user's explicit business logic)
1. Viewer pays N diamonds for a call/gift
2. **Admin-configured split** decides host's bean share (e.g., admin sets host = 50%, company = 50%)
3. Agency/sub-agency commission = **small % (e.g. 2-3%) of host's earned beans** — paid from the company's share (NOT cutting host's payout further)
4. Sub-agency cuts from agency cut, NOT from host or company directly — all percentages admin-set
5. Every commission rate = admin panel table row, never hardcoded

### Edge function pattern
```typescript
// ❌ WRONG
const platformCut = 0.35;
const agencyCut = 0.05;

// ✅ RIGHT
const { platform_cut_percent, agency_commission_percent } =
  await supabase.from('agency_policy_settings').select('*').eq('id', 'default').single();
```

### Migration pattern
- DON'T put rate values inside CHECK constraints or triggers
- DO seed default rows into config tables, admin can update later

## When user says "industry standard 35%/65%"
That's a **default seed value** for the admin table, NOT a code constant. User can change it from admin panel anytime.

## Verification
Before writing any billing/commission code, ask: "Where in admin DB does this rate live?" — if no table exists, create the config table first with seeded default, then read from it in the function.
