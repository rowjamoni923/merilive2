---
name: PK Battle research + audit
description: Industry-verified PK Battle params + current implementation audit. Read BEFORE any PK code/DB work.
type: feature
---

# PK Battle — Research-First Reference

Last audited: 2026-06-10 (Wave 1 runtime-bug fix). Earlier "100% broken" memory was wrong about scope but right that the system didn't work — actual root cause was 5 specific runtime bugs, now fixed.

## Industry standard (Bigo / Chamet / Poppo / TikTok / Tencent TUILiveKit)

| # | Param | Standard | Status |
|---|---|---|---|
| 1 | Duration | 5 min default (3–10 min range) | ✅ DB `duration_seconds=300`, clamped 120–900s |
| 2 | Punishment phase | 60–120s (use ~90s) | ✅ `punishment_end_ts = now()+90s` |
| 3 | Score model | Sum of gift coin value, per-gift | ✅ `bill_pk_gift()` |
| 4 | Server vs client | **Server-only writer**, atomic UPDATE under row lock | ✅ all RPCs SECURITY DEFINER |
| 5 | Winner | Highest score; tie within ±10 coins = draw; MVP=top gifter | ✅ |
| 6 | Reward split | **70% winner / 30% loser** | ✅ `end_pk_battle` 70% of loser score → winner beans |
| 7 | Eligibility | level ≥ 5 | ✅ |
| 8 | Matchmaking | Random + manual + bracket; atomic claim | ✅ |
| 9 | Connect grace | 5s AV-sync buffer | ✅ |
| 10 | Anti-collusion | Block same device/IP pairings | ✅ Wave 1 |
| 11 | Realtime channel | Per-gift event push | ✅ postgres_changes |
| 12 | End conditions | Timer / disconnect / surrender | ✅ tick @ 5s + `request_pk_battle_end` |
| 13 | LiveKit | Each host joins both rooms | ✅ `usePKOpponentRoom` |

## Wave 1 fixes (2026-06-10) — 5 runtime bugs

1. ✅ `start_pk_battle` returned `uuid` but every client caller expected `{ok, battle_id, error}` jsonb → success path always threw "Failed to create PK invite". Now returns jsonb.
2. ✅ `accept_pk_battle` same return-type mismatch → accept showed "Accept failed" even when row moved to active. Now returns jsonb.
3. ✅ `pk_battle_invite` read non-existent `profiles.level` column (real columns are `host_level`/`user_level`) → level check always rejected. Fixed in new `start_pk_battle`.
4. ✅ `pk_battles_status_check` did not allow `'declined'` but `PKBattleRequest.handleDecline` writes it → decline crashed with CHECK violation. Constraint widened.
5. ✅ No anti-collusion check (same device / same IP). Now blocks at invite time.

## Current function set (verified 2026-06-10)

| Function | Returns | Purpose |
|---|---|---|
| `start_pk_battle(opp, c_stream, o_stream, dur)` | jsonb | Direct invite; level≥5, anti-collusion, one-battle-per-host |
| `accept_pk_battle(battle_id)` | jsonb | host2 accepts under FOR UPDATE row lock |
| `start_pk_battle_random(opp, c_stream, o_stream, dur)` | jsonb | Atomic create+activate for FCM-agreed matches |
| `end_pk_battle(battle_id, reason)` | jsonb | Compute winner (10-coin tie tolerance), 70/30 split, MVP, stats, start 90s punishment |
| `request_pk_battle_end(battle_id)` | void | Either host ends early (cancel/surrender/skip-punishment) |
| `pk_battle_finalize(battle_id)` | pk_battles | Tick driver: active→punishment→completed |
| `pk_battle_tick_all()` | integer | Cron @5s sweeps expired battles |
| `bill_pk_gift(...)` | jsonb | Writes score from gift-service edge fn (the ONLY score writer) |

## Cron
- `pk-battle-tick-every-5s` (every 5s) → calls edge fn `pk-battle-tick` → RPC `pk_battle_tick_all()` ✅

## Files (sacred design — never restyle)
- `src/components/live/PKBattleActive.tsx` (calls `request_pk_battle_end`)
- `src/components/live/PKBattleResult.tsx`
- `src/components/live/PKBattleRequest.tsx` (calls `accept_pk_battle`)
- `src/components/live/PKBattlePanel.tsx` (calls `start_pk_battle`)
- `src/components/live/PKRandomMatchNotification.tsx`
- `src/pages/PKLeaderboard.tsx`
- `src/components/admin/PKCompetitionManager.tsx`
- `src/hooks/usePKOpponentRoom.ts`
- `src/pages/LiveStream.tsx` (calls `start_pk_battle_random`, `accept_pk_battle`)
- `supabase/functions/pk-battle-tick/index.ts`
- `supabase/functions/pk-invite-deliver/index.ts`
- `supabase/functions/gift-service/index.ts` (calls `bill_pk_gift`)

## Sources
- Chamet 70/30 + L5: news.bittopup.com/news/chamet-1v1-pk-l5-70-prizes
- Bigo PK: bigo.tv/blog/bigo-live-pk
- Poppo: news.bittopup.com/news/poppo-live-1v1-pk-coin-strategy
- TikTok 5min: tiktok.com/live/creators/.../introduction-to-pk-live-match
- Tencent TUILiveKit: pub.dev/documentation/atomic_x_core
