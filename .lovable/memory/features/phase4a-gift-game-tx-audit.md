---
name: Phase 4A gift + game transaction audit
description: Fixed critical game RPC auth bypass + gift idempotency double-charge. Bugs 3-7 still open.
type: feature
---

# Phase 4A — Gift + Diamond/Coin Transaction Audit (partial)

Date: 2026-06-07

## Fixed (this iteration)

### Bug #1 — Game RPC auth bypass [CRITICAL]
Every overload of `place_game_bet` (4) and `process_game_win` (4) now enforces:
```
auth.uid() = p_user_id  OR  service_role  OR  is_admin  OR  is_active_admin_session
```
otherwise returns `{success:false, error:'Unauthorized'}`. All overloads `REVOKE EXECUTE ... FROM anon, PUBLIC` and grant only to `authenticated, service_role`. Previously any logged-in (or anon) caller could mint coins into any account via direct PostgREST RPC.

### Bug #2 — Gift idempotency [CRITICAL]
- `gift_transactions.idempotency_key TEXT` + partial unique index `idx_gift_tx_idempotency_key`.
- `process_gift_transaction` got a new optional `p_idempotency_key text` arg (now 9 params). On replay with same key, returns the original tx row instead of re-deducting. Concurrent insert race caught via `unique_violation` → raises serialization error so PG retries cleanly.
- `supabase/functions/gift-service/index.ts` reads `body.idempotencyKey` and forwards to RPC.
- `src/utils/giftServiceClient.ts` auto-generates a stable key (`crypto.randomUUID()` fallback) BEFORE the first request so the existing 401 silent-refresh retry sends the same key → no double-charge if response is dropped after DB commit.

## Still open (deferred — user only asked for #1+#2)
- Bug #3 — `process_gift_transaction` writes no `coin_transactions` debit row → ledger reconciliation impossible.
- Bug #4 — Optimistic LiveKit gift broadcast fires before RPC (dispute risk).
- Bug #5 — Receiver SELECT missing `FOR UPDATE` + no deterministic lock ordering (deadlock surface).
- Bug #6 — `balance_audit_log.rpc_function` always empty for gift/game (no `set_config('app.calling_function',…)`).
- Bug #7 — Stale 6-param `process_gift_transaction` overload still exists (integer overflow + no ban check).

## Verified OK
Sender FOR UPDATE, auth.uid() sender check, negative-balance trigger, self-gift block, `_internal_add_*` service_role lock, insufficient-balance, block/ban, gift quantity cap, game FOR UPDATE, HMAC replay on game callback, atomic SQL rollback on failure.

## Files changed
- DB: `process_gift_transaction(uuid,…,text)` (added 9th arg + replay branch + unique_violation guard); 8 game RPC overloads (added auth check + revoked anon)
- `gift_transactions` table: `idempotency_key` column + unique index
- `supabase/functions/gift-service/index.ts`
- `src/utils/giftServiceClient.ts`

No client breakage — `idempotencyKey` is optional everywhere. Old clients keep working but lose double-charge protection until they hit the new client code.
