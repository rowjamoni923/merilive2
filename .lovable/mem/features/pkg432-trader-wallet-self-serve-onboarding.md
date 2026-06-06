---
name: Pkg432 Trader Wallet self-serve onboarding
description: All users see Trader Wallet entry in profile from day one; tap → /helper-dashboard renders L1 application form inline; crypto auto-pay instantly grants verified topup_helpers row (no admin queue).
type: feature
---
DONE 2026-06-06.

**New RPC `auto_grant_helper_from_crypto_payment(_topup_id, _selected_level, _contact_whatsapp, _contact_telegram, _reason, _payroll_requested)`** (SECDEF, search_path=public):
- Requires auth.uid().
- Verifies swift_pay_topups row belongs to caller AND status IN (credited|paid|completed|finished) AND price_usd>0.
- Idempotent on payment_transaction_id (returns existing helper_id on repeat call).
- Detects highest qualifying trader_level_tier where upgrade_cost_usd ≤ paid USD.
- Upserts topup_helpers (is_verified=true, is_active=true, trader_level=GREATEST(existing, detected), country_code from profile fallback BD, contact_info merge).
- Writes helper_applications row status='approved' with payment_details for full audit (EXCEPTION wrapper around audit row so grant never fails).
- GRANT anon, authenticated, service_role.

**Frontend wiring:**
- `HelperApplicationForm.submitApplication()` — when crypto-paid (isPaidLevel + real paymentTopupId), calls new RPC instead of raw `helper_applications.insert` with status='pending'. Toast: "Trader Wallet Activated! ✅ Level N unlocked." Free-tier path unchanged.
- `HelperDashboard.tsx` — no-helper-row branch no longer kicks back to /profile. Sets `showApplyForm=true`, renders `<HelperApplicationForm>` inline with a back-button header. On `onSuccess` refetches topup_helpers and drops into the regular dashboard.
- `Profile.tsx` — new "Trader Wallet · Unlock" card visible only when `!isCoinTrader && !isAgencyOwner`. Tap → `navigate('/helper-dashboard')`. Existing trader (emerald) and agency-owner (fuchsia) cards untouched.
- `AgencyCoinTrader.tsx` — "Upgrade Required" dialog button changed from `/agency-dashboard?openHelper=1` (param was never read in AgencyDashboard — dead route) → `/helper-dashboard` (form now renders there for non-helpers).

**Flow end-to-end:** User opens Profile → sees Trader Wallet card → tap → /helper-dashboard auto-shows L1 form → fills contact + picks tier ≥ $100 → SwiftPay crypto modal → on-chain confirms → RPC grants verified Trader instantly → page refetches → user is now a Level N trader with empty wallet ready to receive top-ups.

**Untouched (confirmed solid):** Pkg431 strict gating, Pkg429-430 isolation, free-tier admin queue path, Pkg65 admin re-detection on amount adjustment, SwiftPay create-deposit target='user_diamond' user diamonds credit, idempotency keys.
