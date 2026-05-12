
# Batch 6 — Schedule-Driven Agency Beans + Commission Distribution

## আপনার চাওয়া (সংক্ষেপে)

1. Agency Dashboard-এ **Total Beans** = প্রতি সপ্তাহে host থেকে agency-তে transfer হওয়া beans (admin schedule অনুযায়ী, ১০০% নিখুঁত)
2. Host beans transfer হওয়ার **ঠিক ১ ঘণ্টা পর** → Agency Commission distribution চলবে (auto schedule + manual button দুটোই)
3. Commission rule:
   - প্রতিটা agency নিজের host এর beans থেকে নিজের level rate% commission পাবে
   - Upper agency পাবে `(upper_rate − sub_rate)%` শুধু যখন `upper_rate > sub_rate` (strict)
   - সব commission **Company পে করবে — host বা sub-agency থেকে কখনোই minus হবে না**
4. সব transferred beans + commission → Agency Dashboard "My Beans" + Withdrawal page-এ show হবে
5. Sub-agency নিজে owner-ও, একই rule তার host এর জন্য, এবং তারও যদি sub থাকে — chain চলবে

## Current State (audited)

- ✅ `process_weekly_agency_transfers()` exists — host pending_earnings → agency.beans_balance
- ✅ `AdminTransferScheduler.tsx` exists — countdown, auto + manual button
- ⚠️ Agency commission এখন **per-gift / per-call trigger** (`auto_credit_agency_commission`) দিয়ে real-time credit হয় — schedule-based না
- ⚠️ এটা চললে scheduled commission run = **double credit**

## Architectural Decision

**Switch agency commission from REAL-TIME (per-gift trigger) → SCHEDULED (weekly batch on transferred beans).**

- Per-gift / per-call commission triggers DROP করা হবে
- Commission distribution হবে শুধু `agency_earnings_transfers` rows-এর উপর (weekly batch থেকে আসা)
- Commission পেমেন্ট = company expense, কোনো host/sub থেকে deduct না (already true)

## Implementation Plan

### 1. Database Migration

**A. Drop per-gift / per-call agency commission triggers**
- Drop `auto_credit_agency_commission` trigger on `gift_transactions`
- Drop `auto_credit_agency_commission_from_call` trigger on `call_transactions`
- Functions থাকুক (rollback এর জন্য), শুধু trigger detach

**B. New schedule settings key:** `app_settings.commission_schedule`
```json
{
  "is_active": true,
  "delay_hours_after_transfer": 1,
  "next_run_at": "...",
  "last_run_at": "..."
}
```

**C. New RPC: `process_agency_commission_distribution(_period_start timestamptz, _period_end timestamptz)`**
- Loop unprocessed rows from `agency_earnings_transfers` in that window
- For each transfer (agency_id, host_id, amount):
  - `own_rate = resolve_agency_commission_rate(agency_id)` → credit `agency.beans_balance += floor(amount * own_rate/100)` → log to `agency_commission_history` with `transaction_type='weekly_distribution'`, `source_transaction_id=transfer.id`
  - Walk parent chain: while `parent_agency_id` exists → `parent_rate = resolve_agency_commission_rate(parent_id)`; if `parent_rate > child_rate`, credit parent `floor(amount * (parent_rate − child_rate)/100)` → log with `transaction_type='upper_referral_bonus'`; set `child_rate = parent_rate`, move up
- Idempotent via existing UNIQUE on `agency_commission_history(source_transaction_id, transaction_type)`
- Mark `agency_earnings_transfers.commission_processed_at = now()` (new column)

**D. Add column:** `agency_earnings_transfers.commission_processed_at TIMESTAMPTZ`

### 2. Edge Function: `agency-commission-distribute`

- Same auth pattern as `agency-weekly-transfer` (cron secret + manual admin)
- Calls `process_agency_commission_distribution(last_run_at, now())`
- Returns `{success, agencies_credited, total_commission, upper_bonuses}`

### 3. Admin UI — `AdminTransferScheduler.tsx`

Add a **second card section** below existing scheduler:

```
┌──────────────────────────────────────────────┐
│ ⚡ Agency Commission Distribution            │
│                                              │
│ ☑ Auto-run after host transfer              │
│ Delay: [ 1 ] hours                           │
│                                              │
│ Last run: 12 May 2026 1:30 AM                │
│ Next run: 19 May 2026 1:30 AM (auto)         │
│                                              │
│ [ ▶ Distribute Commission Now ]              │
└──────────────────────────────────────────────┘
```

- Manual button → invokes `agency-commission-distribute` with `manual:true`
- Auto-trigger: when `agency-weekly-transfer` finishes, schedule `next_run_at = now() + delay_hours`
- Existing host-transfer countdown card stays as-is

### 4. Agency Dashboard / Withdrawal Display

Confirm both surfaces sum:
- Weekly transferred host beans (from `agency_earnings_transfers`)
- Commission credits (from `agency_commission_history` where `agency_id = self`)

→ Both already credit `agencies.beans_balance`, so display already correct. Verify "My Beans" + "Withdrawal" pages read this column.

### 5. Memory Update

New entry: `mem://business/scheduled-agency-commission-pkg32` documenting:
- Per-gift triggers DROPPED (Pkg32 supersedes Pkg27 real-time mode)
- Commission now flows on weekly transferred beans only
- Upper bonus chain logic + delay rule

## Risk & Mitigation

- **Risk:** Existing in-flight gifts already credited via old triggers. **Mitigation:** Add `WHERE created_at > <migration_time>` guard in distribution to prevent re-crediting historical transfers.
- **Risk:** Sub-agency chain depth. **Mitigation:** Hard cap at 5 levels with cycle detection.

## Out of Scope

- Native Android UI changes (backend only — native reads same columns)
- Helper diamond commission (separate Pkg33)
- Currency conversion changes

## Files to Edit

- New migration (DROP triggers + add column + new RPC)
- `supabase/functions/agency-commission-distribute/index.ts` (new)
- `src/pages/admin/AdminTransferScheduler.tsx` (add commission section)
- `mem://business/scheduled-agency-commission-pkg32` (new memory)
- `mem://index.md` (add entry)

---

**Approve করলে শুরু করব। কোনো adjustment চাইলে বলুন (যেমন delay default ভিন্ন, বা per-gift trigger keep করতে চান)।**
