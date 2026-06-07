---
name: Phase 4B Recharge/Payment audit — Round 1
description: Hardening Google Play, IPN, helper-gateway, and admin coin-credit RPCs (auth + ledger consistency).
type: feature
---

# Phase 4B Round 1 — DONE 2026-06-07

## Scope
Audited every money-credit surface: Google Play IAP, SSLCommerz/AamarPay IPN, helper-gateway top-up, admin coin grants, VIP recharge bonus, first-recharge bonus, helper crypto auto-grant, swift-pay deposits/payouts.

## Findings & fixes
| # | Bug | Severity | Status |
|---|---|---|---|
| B1 | `process_google_play_purchase` callable by `anon` (RPC alone could mint coins if Google-verify edge gate was bypassed) | HIGH | ✅ REVOKE anon/PUBLIC; GRANT service_role only |
| B2 | 7 admin/internal credit RPCs callable by `anon` (`add_coins_to_user`, `add_diamonds_to_user`, `admin_add_user_coins`, `admin_add_agency_coins`, `admin_credit_beans`, `admin_complete_payment_transaction`, `admin_approve_helper_topup`) — internal `is_admin()` gates protected money but attack surface was huge | HIGH | ✅ REVOKE anon/PUBLIC; authenticated keeps EXECUTE (internal admin gate decides) |
| B3 | `auto_grant_helper_from_crypto_payment` anon-callable | HIGH | ✅ REVOKE anon/PUBLIC |
| B4 | `process_google_play_purchase` wrote `recharge_transactions` + `coin_transfers` + reconciliation_log but NOT `coin_transactions` → ledger inconsistent with gift/IPN paths | MED | ✅ Added idempotent `coin_transactions` insert with `payment_reference = 'google_play:'\|\|purchase_token` (uses existing `uniq_coin_tx_payment_ref_completed` index) |
| B5 | `complete_gateway_helper_topup` helper wallet/agency debit silent in `coin_transactions` | LOW | ⏭ Deferred — covered by `coin_transfers` + `payment_reconciliation_log` + `helper_orders.payment_details.{wallet_deducted,agency_deducted}` |

## Already-safe surfaces (verified)
- `local-payment-ipn` edge fn: validates SSLCommerz/AamarPay server-side, rejects unverified gateway responses, writes reconciliation_log on failure.
- `verify-google-purchase` edge fn: JWT-authenticates user, server-verifies with Google Play Developer API before crediting; consume happens after DB credit (paid-but-not-delivered safe).
- `complete_gateway_helper_topup`: SECURITY DEFINER with `service_role OR is_admin OR is_active_admin_session` gate; `FOR UPDATE` locks on helper + agency + order + buyer profile; full rollback on insufficient balance; unique-violation idempotency via `coin_transactions.payment_reference`.
- Unique indexes verified: `idx_recharge_transactions_google_token_unique`, `idx_recharge_transactions_google_order_unique`, `uniq_recharge_tx_gateway_txn_completed`, `uniq_coin_tx_payment_ref_completed`.

## Pending audit (Round 2)
- `apply_vip_recharge_bonus`, `claim_first_recharge_bonus_and_credit`, `_apply_recharge_bonuses_internal` — bonus stacking races
- `coin_trader_self_recharge`, `coin_trader_transfer_to_user`, `coin_trader_transfer_to_agency` — trader-wallet flows
- `credit_helper_wallet_from_swift_pay`, `swift-pay-poll-deposits` — crypto deposit pipeline
- `agency_send_diamonds_to_user`, `agency_send_diamonds_to_agency` — agency transfer atomicity
- `admin-verify-purchase` edge fn — manual purchase verification
