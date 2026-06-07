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

### How agency / sub-agency commission works (user's explicit business logic — LOCKED)

**ALL financial flows admin-controlled:** gifts, calls, recharges, agency commissions, sub-agency commissions, host earnings — every single percentage/rate from admin panel DB tables.

#### Base flow (gift OR call OR any host-earning event)
1. Viewer pays N diamonds (gift cost / call per-min rate — both admin-set per item/host/tier)
2. Admin-configured split decides host's bean payout (e.g., admin sets host = 50%, company = 50%)
3. Host always receives their admin-set %. Agency presence NEVER reduces host's payout.

#### Agency commission (level 1)
- Agency owner gets admin-set % (e.g. 2-3%) of host's earned beans, for every host directly under their agency
- Paid FROM company's cut, NOT cutting host further
- Rate from `agency_level_tiers` (per agency level)

#### Sub-agency commission — LEVEL-GATED CASCADE (CRITICAL)
This is industry-standard MLM-style commission, level-gated:

- A sub-agent (recruited by an upper agent) gets the SAME % their own level allows on hosts they recruit
- **Upper agent gets an additional small % (e.g. 2%, admin-set) on the host earnings of sub-agents below them — BUT ONLY IF the sub-agent's agency level is STRICTLY LOWER than the upper agent's level**
- If sub-agent's level == upper agent's level → **upper agent gets ZERO** from that sub-agent's hosts
- If sub-agent's level > upper agent's level → upper agent gets ZERO (upward override blocked)

**Example (user-given):**
> Owner (Level 5) → Sub-agent A (Level 3) → A creates 10 sub-sub-agents under them
> - 5 of those sub-sub-agents are at Level 3 (same as A) → A gets NOTHING from those 5
> - 5 are at Level 2 (below A) → A gets the admin-set override % from those 5's host earnings
> - Owner (Level 5) gets override % from ALL sub-agents below Level 5

**Implementation requirement:**
- DB function `calculate_agency_cascade_commission(host_earning_id)` walks up the agency tree
- For each ancestor, compare `ancestor.agency_level` vs `child.agency_level`
- Only credit ancestor if `ancestor.agency_level > child.agency_level` (strictly greater)
- Use admin-set override rate from `agency_level_tiers.upper_override_percent` per level
- All commissions paid from company's cut, host payout unchanged

#### Where these rates live (admin-managed)
- `gifts` table → per-gift diamond cost (already exists, admin-edited)
- `call_price_settings` → per-min call rate
- `agency_policy_settings` → platform cut %, default agency override %
- `agency_level_tiers` → per-level: agency_commission_percent, upper_override_percent, level_threshold
- `sub_agent_commissions` → recorded per-event commission credits (audit trail)
- All editable from admin panel UI — no code/migration needed to change a rate



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
