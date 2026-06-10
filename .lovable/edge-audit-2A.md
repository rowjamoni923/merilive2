# Sub-wave 2A — Money & Auth Edge Functions Audit

**Date:** 2026-06-10  
**Scope:** 17 highest-risk edge functions (payment/auth/session)

## Result Summary

| Function | Before | Action |
|---|---|---|
| create-local-payment | strict CORS, auth, server-side amount, atomic credit | ✅ already production-grade |
| local-payment-ipn | strict CORS, gateway re-validation, dedup, ledger | ✅ already production-grade |
| swift-pay-create-deposit | strict CORS, auth, server-pricing, helper-scoped sub-account | ✅ already production-grade |
| swift-pay-poll-deposits | wildcard CORS, cron-secret | 🔧 strict CORS |
| swift-pay-create-payout | wildcard CORS | 🔧 strict CORS |
| verify-google-purchase | strict CORS, idempotency pre-check, atomic credit | ✅ already production-grade |
| admin-verify-purchase | wildcard CORS, inline admin check | 🔧 strict CORS |
| apply-vip-recharge-bonus | wildcard CORS, internal-secret guarded | 🔧 strict CORS |
| noble-purchase | strict CORS, idempotency keys via RPC | ✅ already production-grade |
| device-session-exchange | strict CORS, single-use token, magiclink mint | ✅ already production-grade |
| otp-direct-signin | wildcard CORS, password min 6 | 🔧 strict CORS + password min 8 |
| verify-email-otp | wildcard CORS, constant-time compare ✓ | 🔧 strict CORS, helper |
| send-email-otp | wildcard CORS, rate-limit RPC | 🔧 strict CORS |
| send-password-otp | 410 Gone (deprecated) | ✅ already deprecated |
| force-reset-guest-password | shared admin auth | ✅ already production-grade |
| link-device-to-account | 410 Gone (deprecated) | ✅ already deprecated |
| link-email-to-account | wildcard CORS, **non-constant-time OTP compare** | 🔧 strict CORS + constant-time fix |

## Concrete Fixes Applied
1. New `supabase/functions/_shared/strict-cors.ts` — single source of truth for CORS allow-list + constant-time compare.
2. Replaced wildcard `Access-Control-Allow-Origin: *` on 8 money/auth functions with origin-reflecting allow-list.
3. **Timing-attack fix** in `link-email-to-account`: OTP comparison now uses `constantTimeEqual`.
4. **Weak-password fix** in `otp-direct-signin`: `mode='create'` now requires ≥8 chars (was 6) — aligns with `link-email-to-account` and OWASP minimum.

## Verified Non-issues (with research backing)
- `email_otps` table has **zero** anon/authenticated grants and an admin-only RLS policy. Plaintext OTP storage acceptable for 5-min TTL per OWASP (service-role only access).
- All money-credit paths use atomic RPCs (`safe_credit_diamonds`, `complete_gateway_helper_topup`, `process_google_play_purchase`, `claim_idempotency_key`).
- Server-side amount validation present everywhere; client cannot inflate coins.
- SSLCommerz/AamarPay IPN do not use HMAC headers — they require re-validation via gateway API (already implemented in `local-payment-ipn`).
- `otp-direct-signin` returns `exists:false` only AFTER OTP verification; attacker must already control inbox to reach that branch — enumeration window already closed.
- Google Play verify uses server-side `purchases.products.get` + acknowledge/consume (matches official Google Play Billing Security guidance).
- Noble subscription uses idempotency keys via `claim_idempotency_key` RPC (matches Stripe idempotency pattern).

## Future Hardening (lower priority)
- Optional OTP hash-at-rest with HMAC-SHA256 + dedicated `OTP_HASH_KEY` secret. Skipped now — table is service-role-only.
- Inline `admin-verify-purchase` duplicates `requireAdminSession` logic; could refactor.
- `swift-pay-create-payout` "stamp the failure but don't roll back" — acceptable manual-retry semantics, document for ops runbook.

## Verification
- Owner test account login flow unchanged (deterministic guest password preserved).
- All edited files compile cleanly via shared module import.
- No DB schema changes — backward compatible.

**Next:** Sub-wave 2B (LiveKit & Calls, ~25 functions).
