# Zero-Coin Wave — One Currency Diamond + Beans

## Honest current state (verified)

- DB fact: `profiles.coins` is already `GENERATED ALWAYS AS (diamonds) STORED` (DU-5A live). It is **not** a second wallet — it is literally the same number as `diamonds`.
- All spend RPCs (call/gift/game/shop/PK) write to `diamonds` only. Verified `deduct_call_coins_per_minute` reads/writes `diamonds`; `start_private_call` uses `GREATEST(coins, diamonds)` which equals `diamonds`.
- So the "call fails despite Diamonds" symptom is **not** a real dual-wallet mismatch anymore — it is either a client stale cache (`useUserBalance` cache) or an Android APK still on pre-DU5 code path. Will verify with owner-account reproduction in Phase 0.
- What is still true and must be fixed: **68 DB columns**, **4 tables**, **~1280 client identifier hits**, **10+ RPC parameter names**, and **5 route/file names** still carry the word `coin`. Owner mandate: purge all of them.

## Scope (nothing skipped)

40 tables with `coin*` columns (e.g. `coins_amount`, `coins_per_minute`, `coin_price`, `reward_coins`, `coin_rate_per_min`, `total_coins_*`, `bonus_coins`, `coin_cost`, `coin_value`).
4 tables named `coin_packages`, `coin_transactions`, `coin_transfers`, `coin_trader_transfers`.
5 file/route pairs: `/admin/coins`, `/admin/coin-traders`, `/admin/coin-trader-hub`, `/agency-coin-exchange`, `/agency-coin-trader`.
10+ RPCs (`deduct_call_coins_per_minute`, and all functions consuming the renamed columns).
Locale keys `coins`, `coinsPerMin`, `coinsSent` (already return "Diamonds" text, but keys still say `coins`).

## Phased execution (each phase = one approved migration/PR, verified before next)

### Phase 0 — Repro the call bug (today)
- Log in as owner test account, attempt a private call with Diamond balance > rate.
- Read `private_call_diag` to see actual error string.
- If error is `insufficient_balance` while `diamonds > rate`: fix in Phase 1a as a hotfix (force `useUserBalance` + `usePrivateCall` to read `diamonds` and ignore `coins` entirely on client).
- Otherwise report actual error and fix it before continuing.

### Phase 1 — Client Diamond-only reads (safe, no DB change)
- `usePrivateCall.ts`, `MatchCall.tsx`, `ProfileDetail.tsx`, `useUserBalance.ts`: read only `diamonds`, drop all `Math.max(coins, diamonds)` and `profile.coins` fallbacks.
- Rename internal TS variables/props (`coinsPerMinute` → `diamondsPerMinute`, `callerRemainingCoins` → `callerRemainingDiamonds`, etc.) in call/gift/wallet hooks and pages.
- Rename `useAdminSettingsRealtime.ts` field `coins` (diamond package rows) → `diamonds`.
- Update `adminTopupHistory.ts`, `notificationDeepLink.ts` enum string literals via a compatibility map (accept both `coins`/`diamonds`, emit `diamonds`).
- Locales: add `diamonds`, `diamondsPerMin`, `diamondsSent` keys; keep old `coins*` keys as aliases for one release then delete.
- No DB change in this phase — safe rollback.

### Phase 2 — DB column rename migration (one big migration, transactional)
Order (all in a single transaction so RPCs recompile atomically):
1. Add new columns as generated aliases of old columns for every rename (e.g. `ALTER TABLE recharge_transactions ADD COLUMN diamonds_amount bigint GENERATED ALWAYS AS (coins_amount) STORED`). This is the DU-5A pattern proven safe.
2. Rewrite every RPC/function that reads or writes the old columns to use the new names. Full list generated from `pg_proc` scan.
3. Rewrite triggers, views, RLS policies that reference old columns.
4. Verify with `pg_get_functiondef` diff that no function still references old column names.

### Phase 3 — DB drop legacy names (after Phase 2 soak)
- Drop generated aliases; rename real columns to Diamond names (`coins_amount` → `diamonds_amount`, etc.).
- Rename tables: `coin_packages` → `diamond_packages`, `coin_transactions` → `diamond_transactions`, `coin_transfers` → `diamond_transfers`, `coin_trader_transfers` → `diamond_trader_transfers`.
- Drop `profiles.coins` generated column.
- Rename RPC `deduct_call_coins_per_minute` → `deduct_call_diamonds_per_minute` (add wrapper that redirects one release).

### Phase 4 — Client file/route rename with 301 redirects
- Rename files: `AdminCoins.tsx` → `AdminDiamonds.tsx`, `AdminCoinTraders.tsx` → `AdminDiamondTraders.tsx`, `AdminCoinTraderHub.tsx` → `AdminDiamondTraderHub.tsx`, `AgencyCoinExchange.tsx` → `AgencyDiamondExchange.tsx`, `AgencyCoinTrader.tsx` → `AgencyDiamondTrader.tsx`.
- Routes: new `/admin/diamonds`, `/admin/diamond-traders`, `/agency-diamond-exchange`, etc. Old routes render a `<Navigate>` redirect for 30 days.
- Update every sidebar/menu/link to the new routes.
- Update generated Supabase `types.ts` (auto after Phase 3 migration approval).
- Final grep to confirm zero `coin` product-identifier hits outside comments/tests.

### Phase 5 — Android parity handoff
- Produce a Flutter/Android rename cheat sheet (column names, RPC names, route paths, JSON keys) so the Android agent can mirror the exact identifiers in the next APK.

## Risk & rollback
- Phase 1 is pure client — hot-reversible.
- Phase 2 is additive (generated aliases) — reversible by dropping new columns.
- Phase 3 is destructive — requires 48h soak after Phase 2 with wallet-audit query paste before we run it.
- Phase 4 is client-only after Phase 3 types regen.
- No parallel edits to old migration files. Every DB change is a new migration.

## What I need from owner before I run migrations
- Green light per phase (each phase = separate migration approval).
- Confirmation to keep the 30-day redirect window on old admin/agency routes, or drop old routes immediately.

## Not in scope
- Renaming Beans (stays as earn wallet).
- Gift animation payload shape (`gift.coins` field name) — that ships with Phase 2 as `gift.diamonds` but native VAP/SVGA dispatcher only reads the number; no visual change.
- No time-saving shortcut. Every phase verified with `pg_get_functiondef` diff + owner-account live test before the next.

---

# Face Verification — Retry Rows Admin Override Fix

## Professional standard signal
- Identity/moderation dashboards list verification statuses/events and support human review over automated outcomes; VerifyMyContent documents identity verification rows with status/event visibility in its client dashboard: https://verifymycontentforbusiness.zendesk.com/hc/en-gb/articles/6555970087186-The-VerifyMyContent-Client-Dashboard
- Hybrid moderation combines AI/ML with human moderators before publication/approval, so admin tooling must expose terminal actions when AI cannot safely auto-approve: https://verifymy.io/identity-verification-content-moderation/content-moderation/

## Current app gap found
- `/admin/face-verification` placed `needs_retry` rows in the `user_retry` bucket and rendered Approve/Reject only for `pending` rows.
- Result: completed submissions with AI retry reasons were visible, but owner/admin could not manually approve or reject them from the card/detail review surface.

## Fix applied
- Manual review actions now render for both `pending` and `user_retry` rows.
- Approving a retry row routes through the existing manual override flow, requiring an admin reason; rejecting still writes the terminal rejection through the existing RPC.

---

# Face Verification — Auto-Approve Gate Audit

## Professional standard signal
- Identity/KYC systems use automated face/liveness/similarity checks with human fallback when evidence is low confidence or conflicting: https://verifymy.io/identity-verification-content-moderation/content-moderation/
- Review dashboards must expose status/event evidence so operators can distinguish “AI failed” from “user evidence failed”: https://verifymycontentforbusiness.zendesk.com/hc/en-gb/articles/6555970087186-The-VerifyMyContent-Client-Dashboard

## Current evidence found
- Last 24h face verification jobs were reaching `face-verification-analyze` and completing with HTTP 200; the analyzer was not globally down.
- One same-day host submission auto-approved successfully with profile/live/video/host-gallery same-person evidence.
- Failed/retry cases had concrete AI gates: profile-photo mismatch, host-gallery mismatch/unreadable, or low profile/live similarity.

## Gap fixed
- The analyzer comment promised “super-strong identity” could override soft host-gallery mismatch, but an earlier `identity_mismatch` retry branch returned before that override could run.
- The edge function now separates required identity evidence (profile photo + live/video face) from host-gallery soft mismatch, records the override in `ai_analysis.rekognition`, and lets the existing DB service finalize when core identity is super-strong.
