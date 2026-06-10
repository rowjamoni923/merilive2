# Sub-wave 2C — Gift / Game / Reward edge function audit

Date: 2026-06-10
Scope: 12 functions — `gift-service`, `game-*` (7), `claim-vip-daily-reward`, `distribute-leaderboard-rewards`, `leaderboard-rewards`, `payroll-helper-bonus`, `pk-battle-tick`, `pk-invite-deliver`.

## Findings & actions

### ✅ Already secure (no change)
| Function | Why safe |
|---|---|
| `game-balance-callback` | Provider webhook. HMAC mandatory (`GAME_CALLBACK_HMAC_SECRET` required, fail-closed), ±300s timestamp anti-replay, constant-time compare, action whitelist, amount bounds (`0..1e9`), CORS = `null`, balance scrubbed from logs. **Best-in-class.** |
| `pk-battle-tick` | `x-cron-secret`-gated; `pg_cron` only. |
| `leaderboard-rewards`, `distribute-leaderboard-rewards`, `game-auto-runner` | `x-cron-secret` / `x-internal-secret` validated server-side. |
| `payroll-helper-bonus` | Neutered (Pkg343) — always returns 410. |
| `pk-invite-deliver` | JWT validated; enforces `fromUserId === auth.uid()`; per-row recipient resolution via service-role. |

### 🔧 Hardened (this sub-wave)
Origin-allow-list guard added (`isAllowedOrigin`) on browser-facing endpoints. Unknown origins → 403 `forbidden_origin`. Native/Capacitor/no-Origin callers still pass.

1. **`gift-service`** — the highest-value money mover. Already enforces self-gift refusal, quantity bounds (1..999), idempotency-key sanitization, user-scoped RPC so `auth.uid()` is the real sender. Added origin guard for defense-in-depth.
2. **`game-play`** — added strict body validation: `game_key` (string, ≤64 chars) and `bet_amount` (finite, `0 < x ≤ 10_000_000`). RPC `process_game_bet` is still the authoritative balance gate; this is belt-and-suspenders against arbitrary numeric payloads (NaN, negative, Infinity, huge floats). Added origin guard.
3. **`game-token`** — added origin guard.
4. **`game-provider`** — added origin guard.
5. **`claim-vip-daily-reward`** — added origin guard.
6. **`pk-invite-deliver`** — added origin guard.

### 🚫 Issues NOT found
- No raw SQL execution paths.
- No `service_role_key` leaked to client.
- `bill_pk_gift` side-effect in `gift-service` is best-effort and won't roll back the gift on failure — confirmed correct (otherwise a flaky PK insert could refund the sender).
- Gift sender / receiver / quantity all server-validated; coin total comes from `process_gift_transaction` RPC, never from client payload.
- Game session tokens minted via `generate_game_token` RPC bound to `auth.uid()` — client cannot mint tokens for other users.

### ℹ️ Observations (no fix this sub-wave)
- `claim-vip-daily-reward` is 46 lines — fine, but it doesn't surface the RPC's `{success,error}` shape. UI already handles. Skip.
- `game-provider` is 607 lines, contains provider config secrets read from DB. RLS on `game_providers` already restricts to admin role — verified, no change.

## Verification
- Origin guard returns true for missing `Origin` (server-to-server, native Android, curl) and for the strict allow-list.
- For unknown browser origins, the 403 response carries the existing wildcard CORS headers so the error is readable in the browser.

## Files edited
- `supabase/functions/gift-service/index.ts`
- `supabase/functions/game-play/index.ts`
- `supabase/functions/game-token/index.ts`
- `supabase/functions/game-provider/index.ts`
- `supabase/functions/claim-vip-daily-reward/index.ts`
- `supabase/functions/pk-invite-deliver/index.ts`

## Next
Sub-wave **2D** — Moderation / Face / Anti-abuse (~15 functions).
