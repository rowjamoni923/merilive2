---
name: PK Battle research + audit
description: Industry-verified PK Battle params + current implementation audit. Read BEFORE any PK code/DB work.
type: feature
---

# PK Battle — Research-First Reference

Last audited: 2026-06-08 (Phase II audit). Original memory said "100% broken" — actual state is ~95% complete + 1 race-condition bug (now fixed) + minor cleanup.

## Industry standard (Bigo / Chamet / Poppo / TikTok / Tencent TUILiveKit)

| # | Param | Standard | Notes |
|---|---|---|---|
| 1 | Duration | 5 min default (3–10 min range) | DB `duration_seconds` default 300 ✅ |
| 2 | Punishment phase | 60–120s (use ~90s) | `punishment_end_ts = now()+90s` ✅ |
| 3 | Score model | Sum of gift coin value, per-gift, personal | `bill_pk_gift()` ✅ |
| 4 | Server vs client | **Server-only writer**, atomic UPDATE under row lock | `bill_pk_gift()` SECURITY DEFINER ✅ |
| 5 | Winner | Highest score; tie=draw; MVP=top gifter (badge only, no cash) | ✅ |
| 6 | Reward split | **70% winner / 30% loser** (Bigo, Chamet L5, Poppo confirmed) | `end_pk_battle()` does 70% of loser score → winners ✅ |
| 7 | Eligibility | Platform-specific (Chamet L5; Bigo 30h/15d+10k beans; TikTok 1k followers) | DB `min_host_level=5` default ✅ |
| 8 | Matchmaking | Random + manual + bracket; atomic claim via battleID | `start_pk_battle` + `accept_pk_battle` ✅ |
| 9 | Connect grace | 30s invite timeout (SDK); 3–5s AV-sync buffer | `connect_grace_seconds=5` ✅ |
| 10 | Modes | 1v1 default; 2v2 common; multi up to 12 | `mode` + `team_size` columns ✅ |
| 11 | Realtime channel | Per-gift event push (not polled) | `postgres_changes` on `pk_battles` ✅ |
| 12 | End conditions | Timer / disconnect / surrender | `pk-battle-tick` cron @ 10s ✅ |
| 13 | LiveKit | Each host joins both rooms; opponent room subscribe-only | `livekit-pk-opponent` profile + `usePKOpponentRoom` ✅ |

## Sources
- Chamet 70/30 + L5: news.bittopup.com/news/chamet-1v1-pk-l5-70-prizes
- Bigo PK official: bigo.tv/blog/bigo-live-pk
- Bigo punishment 1-2min: news.bittopup.com/news/how-to-disable-bigo-pk-punishment-filters
- Poppo 70%: news.bittopup.com/news/poppo-live-1v1-pk-coin-strategy
- Tencent TUILiveKit BattleConfig: pub.dev/documentation/atomic_x_core
- TikTok PK 5min: tiktok.com/live/creators/.../introduction-to-pk-live-match
- LiveKit multi-room: github.com/livekit/livekit/issues/3039

## Audit (2026-06-08): what's IN the codebase

### Schema (migrations 20260608014122 → 20260608020533)
- `pk_battles`: new columns added (`challenger_score, opponent_score, duration_seconds=300, punishment_end_ts, final_status, phase_config, connect_grace_seconds=5, min_host_level=5, total_gift_value, mode='1v1', team_size, competition_id, winner_user_id, mvp_user_id`)
- `pk_battle_gifts`: `target_host_id, score_value, phase` added; legacy `receiver_id` dead column (cleanup pending)
- `pk_battle_teams`: created with seed-captains trigger
- `pk_match_queue`: created but never called from client (dead infra, cleanup pending)
- Legacy columns kept alive by `pk_battles_sync_legacy()` trigger

### Server-authoritative paths
- `bill_pk_gift(p_battle_id, p_sender_id, p_target_host_id, p_gift_id, p_coin_amount)` — called from `gift-service` edge fn after every gift; only writer of `challenger_score/opponent_score`
- `start_pk_battle(p_opponent_id, p_challenger_stream_id, p_opponent_stream_id, p_duration_seconds=300)` — authenticated; collision-checks both hosts
- `accept_pk_battle(p_battle_id)` — authenticated; SELECT FOR UPDATE on status='pending'
- `start_pk_battle_random` — atomic create+activate for random match
- `end_pk_battle(p_battle_id, p_reason='time_up')` — service_role; computes winner, 70% loser-score → winners team split, MVP, punishment_end_ts
- `get_expired_pk_battles()` + `pk-battle-tick` edge fn @ pg_cron every 10s

### Client (display only)
- `PKBattleActive.tsx` — postgres_changes subscription + optimistic local bump (reconciled by Realtime within ~200ms)
- `PKBattleRequest.tsx` — calls `accept_pk_battle` RPC correctly
- `LiveStream.tsx:2645` — `handlePKRequestAccept` (FIXED 2026-06-08: now uses `accept_pk_battle` RPC instead of raw `pk_battles.update`)

## Fixed 2026-06-08 (Phase II)
- ✅ R1 (BUG, P0): `LiveStream.tsx` direct-invite accept used raw client UPDATE → race window allowed double-accept from two devices. Replaced with `accept_pk_battle` RPC. Race-free under SELECT FOR UPDATE.

## Fixed 2026-06-09 (P0 bundle)
- ✅ Tie tolerance: `end_pk_battle` treats `|challenger_score - opponent_score| ≤ 10` as draw (rounding window). Configurable via `_tie_tolerance` local.
- ✅ Duration presets [180/300/600]s: segmented selector in `PKBattlePanel` → forwarded to both `start_pk_battle` (direct) and `start_pk_battle_random` via `randomPKSearching.durationSeconds`.
- ✅ Per-user PK stats: `profiles.pk_wins / pk_losses / pk_draws / pk_current_streak / pk_longest_streak / pk_total_battles`. Auto-updated in `end_pk_battle`. **UI card NOT added yet** (design-sacred — awaiting explicit OK).

## Cleanup status (verified 2026-07-02 vs live DB)
- ✅ R2 DONE: `pk_battle_gifts.receiver_id` already dropped
- ✅ R3 DONE: `pk_match_queue` table + RPCs no longer exist
- R4 SKIP: MVP cash bonus — no platform does this
- R5 OPEN (cosmetic): 10s gap between client "TIME'S UP" and cron-driven server end. Reduce cron to 5s only if UX complaint arrives.

**Backend = 100% clean. Any remaining PK work is Flutter parity (result modal, random-match notif, panel, opponent room subscription) — see `.lovable/phase-h-audit.md` P0 #3.**

## Files that touch PK Battle (sacred design — never restyle)
- `src/components/live/PKBattleActive.tsx`
- `src/components/live/PKBattleResult.tsx`
- `src/components/live/PKBattleRequest.tsx`
- `src/components/live/PKBattlePanel.tsx`
- `src/components/live/PKRandomMatchNotification.tsx`
- `src/pages/PKLeaderboard.tsx`
- `src/components/admin/PKCompetitionManager.tsx`
- `src/hooks/usePKOpponentRoom.ts`
- `src/pages/LiveStream.tsx` (handlers only — UI components inside are sacred)

## Edge functions
- `supabase/functions/pk-battle-tick/index.ts`
- `supabase/functions/pk-invite-deliver/index.ts`
- `supabase/functions/gift-service/index.ts` (lines 131–163 → `bill_pk_gift`)
