---
name: Pkg433 trader wallet abandoned-flow auto-grant
description: Closes Pkg432 gap where user paid for L1+ helper upgrade then closed app before onCredited fired — Trader Wallet now activates via cron even with no UI.
type: feature
---
DONE 2026-06-06. Pkg432 follow-up. **GAP**: HelperApplicationForm → SwiftPayDepositModal → onCredited → `auto_grant_helper_from_crypto_payment` only ran while user was in the form. If user closed app right after paying, cron `swift-pay-poll-deposits` credited diamonds but never granted Trader Wallet — user stuck (topup already credited, can't re-pay). RPC also rejected service-role with hard `auth.uid()=user_id` check.

**Fix:**
1. Added `swift_pay_topups.helper_application_intent jsonb` column (nullable; only set on helper-upgrade payments).
2. `swift-pay-create-deposit` edge fn now accepts + sanitises + persists `helper_application_intent` ({selected_level 1..5, contact_whatsapp ≤120c, contact_telegram ≤120c, reason ≤1000c, payroll_requested bool}) — only for `target='user_diamond'`.
3. `swift-pay-poll-deposits` cron after successful credit → if `target_type='user_diamond' AND helper_application_intent IS NOT NULL`, calls `auto_grant_helper_from_crypto_payment(_topup_id)` via service-role admin client; result attached to row response.
4. RPC rewritten:
   - Allows `service_role` JWT claim to bypass auth.uid() check and grant on behalf of `swift_pay_topups.user_id` using stored intent.
   - Service-role calls REQUIRE stored intent — plain diamond top-ups never grant a wallet.
   - User path unchanged (still requires `auth.uid()=topup.user_id`).
   - Idempotent on `helper_applications.payment_transaction_id`.
   - `granted_via` audit field ('client'|'cron') in payment_details.
5. `SwiftPayDepositModal` new optional `helperApplicationIntent` prop; HelperApplicationForm passes it on every paid-level deposit.

**End-to-end resilience:**
- User completes form → instant grant (existing path, now also writes intent so re-grant is idempotent).
- User closes app after paying → cron grants within 15s-60s (poll interval).
- User repays same package → idempotent guard returns existing grant, no double-credit.
- Non-helper diamond top-ups → intent NULL → cron skips grant (correct).

**NOT in this pkg (flagged honestly to user):**
- Per-minute private-call deduction still settle-on-end only (Pkg319 deferred → planned Pkg434).
