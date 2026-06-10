# Professional Rebuild: Game System + PK Battle

দুটো system-ই server-authoritative, race-free, professional grade-এ rebuild করব — Chamet/Bigo/Poppo যেভাবে করে সেভাবে। Design/UI shell অপরিবর্তিত থাকবে, শুধু backend logic + wiring।

---

## PART A — PK BATTLE (Phase 1, আগে)

Memory-locked research অনুযায়ী 6-step rebuild:

### A1. Schema audit + fix migration
- `pk_battles` table actual columns scan
- Missing column add: `server_start_at`, `server_end_at`, `punishment_end_at`, `host_a_score`, `host_b_score`, `winner_user_id`, `status` enum (`pending|active|punishment|completed|cancelled`)
- Race-free matchmaking: partial UNIQUE index on `(host_a_id, status)` where `status in ('pending','active')` — same host একসাথে দুই PK তে থাকতে পারবে না
- `pk_battle_gifts` seed: gift_id → pk_score mapping (admin-tunable, default = coin_cost)

### A2. Server-authoritative score (trigger)
- `gift_transactions` insert trigger: যদি receiver কোনো active `pk_battle` এর host হয়, তাহলে sender's contribution `pk_battles.host_a_score` বা `host_b_score`-এ atomic add
- Score lookup via `pk_battle_gifts.pk_score` (fallback = gift coin value)
- All score mutation DB-side, client কখনো `host_a_score` write করতে পারবে না (RLS: no UPDATE on score columns from authenticated; only service_role)

### A3. Server-side timer (edge function + cron)
- `pk-battle-tick` edge function, every 10s via pg_cron
- Active battle যার `server_end_at < now()` → status='punishment', `punishment_end_at = now()+90s`, winner decide (higher score, tie = no winner)
- Punishment expired → status='completed', reward distribute (70% winner / 30% loser of total pot, or whatever admin config)
- Realtime broadcast on `pk_battles` row update

### A4. Matchmaking RPC
- `pk_battle_invite(opponent_id, duration_seconds)` — level≥5 gate, both hosts free check, single atomic insert
- `pk_battle_accept(battle_id)` — only opponent can accept, sets `server_start_at = now()`, `server_end_at = now() + duration`
- `pk_battle_decline(battle_id)` / `pk_battle_cancel(battle_id)`

### A5. Reward + history
- `pk_reward_history` populate at completion
- Winner badge, streak counter on `profiles`

### A6. Frontend rewire
- PK UI components → call new RPCs only
- Score display reads from Realtime subscription (never compute client-side)
- Timer displays `server_end_at - now()` (clock-skew tolerant)

---

## PART B — GAME SYSTEM (Phase 2) — Research-locked rebuild

**Mode:** Audit + plan only. NO code/migration yet. User approves before each step.

### B0. Current state — verified findings (audit sub_zf6tnx58)

Conflicts that make the system non-functional today:
- **Roulette dual-backend collision**: `roulette_get_or_create_session` v2 (mig 20260414) returns `id`, but `RouletteGame.tsx` reads `session_id` → session creation broken.
- **Bet table split-brain**: `place_live_game_bet` v3 (mig 20260524) writes `game_bets`, while `useGlobalLiveGame` Realtime subscribes to `live_game_bets` → live bet feed dead.
- **`auto_process_live_game` is a no-op**: references column `ends_at` which does not exist (real col: `game_end_at`) → no server-side round closure.
- **Cron: NONE registered** for any game. `game-auto-runner` only runs if a client clicks the admin button; rounds stall otherwise.
- **Client-trusted RNG**: `useLiveGameRound.generateResult()` calls `Math.random()` in browser, then calls `process_game_win(amount)` with the value it chose → full house-edge bypass.
- **`process_game_win` accepts arbitrary `p_amount`** from any auth user — no round ref, no cap.
- **`handle_game_callback`** has no `FOR UPDATE`, no `external_tx_id` dedup → double-credit on concurrent provider callbacks.
- **Column drift**: `betting_end_at` vs `betting_ends_at` vs `ends_at` across migrations.
- **Orphan tables** (no writers): `game_sessions`, `game_players`, `game_stats`, `game_provider_logs`.

### B1. Industry standard (research sub_2x3pmpg4 — Bigo/Chamet/Stake/Evolution)

| Dimension | Standard | Source |
|---|---|---|
| Round FSM | `IDLE → BETTING_OPEN → LOCKED → RESOLVING → SETTLED` | Evolution / Stake docs |
| Lucky Wheel timings | bet 5–8s, lock 1–2s, reveal 2–4s, total ~10–15s | Bigo/Chamet inferred |
| Provably fair | `HMAC_SHA256(server_seed, "${client_seed}:${nonce}")`, publish hash before round, reveal seed after settle | stake.us/provably-fair/implementation |
| House edge | Roulette 2.7%, Mines 1–3%, Dice 1%, mobile wheel 3–5% | Evolution / Stake |
| Atomic bet | `SELECT FOR UPDATE` wallet + round in single tx, idempotency_key | jamesshen-svt/dice ref |
| Single-writer payout | One worker settles a round; idempotent on retry | Paułowicz audit-ready postmortem |
| Realtime | Postgres `UPDATE game_rounds` → Supabase Realtime → all room subs; absolute `betting_ends_at` timestamp, NOT durations | flowersayo countdown article |
| Cron on Supabase | **pg_cron minimum = 1 min** (hosted). Pattern: sweep stale rounds every 60s + lazy advance on next bet + Realtime for UX. Sub-second tick infeasible without VPS (deferred). | supabase.com/docs/guides/functions/schedule-functions |
| Audit | Append-only `bet_ledger`, `round_seeds` (INSERT only via RLS), `payout_ledger` | GLI-19 / UKGC RTS-7 |
| Frontend timer | Absolute `betting_ends_at` UTC + client clock-drift offset on connect | flowersayo / Frank van Puffelen Firebase |

### B2. MeriLive design decisions (locked by research + Supabase constraint)

1. **One canonical table set** for ALL live games:
   - `game_rounds` (repurpose `live_game_rounds`): + `server_seed_hash`, `server_seed`, `client_seed`, `nonce`, `betting_ends_at` (canonical), `resolves_at`, FSM `status`.
   - `game_bets` (canonical): + `idempotency_key UNIQUE`, `payout`, `settled_at`.
   - `game_ledger` (new, append-only): every coin debit/credit row; RLS denies UPDATE/DELETE.
   - `round_seeds` (new): `(round_id PK, server_seed_hash, server_seed_revealed, client_seed, nonce)` — INSERT only.
   - **Retire** orphans: `game_sessions`, `game_players`, `roulette_sessions`, `roulette_bets`, `live_game_bets`, `game_stats`, `game_provider_logs` (`DROP IF EXISTS` after archive).
2. **Round lifecycle = pg_cron sweeper (60s)** + DB trigger on `INSERT INTO game_bets` that auto-opens a round if none active. Sub-minute UX = absolute `betting_ends_at` + Realtime row update; clients compute their own countdown. No persistent loop.
3. **Server-authoritative outcome**: settle RPC reads `server_seed` + `client_seed` + nonce, computes via HMAC-SHA256 per Stake formula; writes result + reveals seed atomically. NEVER trust client.
4. **Per-game-type result mapper**: pluggable SQL function per game (roulette_37, wheel_8, dice_6) takes HMAC bytes → outcome in that game's space. House edge enforced via per-game multiplier table in `game_settings`.
5. **Idempotency**: every wallet-mutating RPC takes `p_idempotency_key uuid`; stored in `game_idempotency`; replay returns cached result.
6. **Anti-cheat**: rate limit (max 1 bet / 500ms / user / room), per-round single-bet, max stake-to-balance ratio, RTP-deviation monitor.

### B3. Step-by-step rebuild order (each step needs separate approval)

```text
B-Step 1: Schema consolidation migration
          - rename live_game_rounds.betting_end_at → betting_ends_at (alias)
          - add server_seed_hash/server_seed/client_seed/nonce/resolves_at on game_rounds
          - create round_seeds (append-only RLS)
          - create game_ledger (append-only RLS)
          - create game_idempotency
          - add idempotency_key UNIQUE + payout + settled_at on game_bets
          - archive + DROP orphan tables

B-Step 2: Provably-fair core SQL
          - public.game_generate_round_seed() — random 32 bytes + sha256 hash
          - public.game_compute_outcome(server_seed, client_seed, nonce, game_type)
          - per-game outcome mappers (roulette_37, wheel_8, dice_6)

B-Step 3: Atomic bet RPC
          - public.game_place_bet(p_round_id, p_amount, p_bet_type, p_bet_value, p_idempotency_key)
          - SELECT FOR UPDATE round, validate state=BETTING_OPEN AND now()<betting_ends_at
          - SELECT FOR UPDATE profile, deduct, insert game_bets, insert game_ledger debit
          - dedup via game_idempotency
          - retire legacy place_game_bet / place_live_game_bet

B-Step 4: Single-writer settlement RPC
          - public.game_settle_round(p_round_id) — service_role / cron only
          - SELECT FOR UPDATE round, compute outcome via B-Step 2, reveal seed
          - iterate bets, FOR UPDATE each profile, credit winners, write game_ledger credit
          - idempotent — re-run on settled round returns same result
          - lock out client callers of process_live_game_round + process_game_win

B-Step 5: Edge function game-tick + pg_cron
          - supabase/functions/game-tick (CRON_SECRET header)
          - sweep rounds WHERE status IN ('BETTING_OPEN','LOCKED') AND betting_ends_at < now()
          - call game_settle_round per stale round
          - open next round per active room if none open
          - cron.schedule('game-tick', '* * * * *', net.http_post(...))

B-Step 6: Frontend rewire (ZERO design change)
          - useGlobalLiveGame + useLiveGameRound + RouletteGame → new RPCs
          - DELETE all Math.random()/generateResult() in src/
          - Replace Date.now()+duration with betting_ends_at + drift-correction helper
          - Realtime subs → canonical game_bets, game_rounds
          - Keep every UI component, layout, animation untouched

B-Step 7: Owner-account live preview test (smdollarex923@gmail.com)
          - Bet → settle → payout → ledger row → revealed seed visible
          - Reconnect mid-round shows correct countdown (server-time anchor)
          - Concurrent bets do not double-spend
          - Honest flag: native game WebView path needs APK rebuild if any
```

### B4. Non-goals (this phase)
- Crash (live ascending multiplier) — defer; needs sub-second tick → VPS (deferred).
- 3rd-party provider integration (Evolution/Spribe/deckofcards) — keep current flow frozen.
- Tournament/leaderboard for games — later.
- Per-room custom house edge — global per game only.

### B5. Honest constraints
- pg_cron 60s minimum: BETTING_OPEN ≥ 8–15s windows fine because UI counts down off `betting_ends_at`; settlement may lag ≤60s if no one places a bet to trigger lazy advance. For continuous rooms acceptable (industry pattern). Instant-result games (Dice) → synchronous settlement inside `game_place_bet`, no round, no cron.
- Sub-second multiplier tick (Crash/Aviator) genuinely needs a persistent worker → VPS (deferred). Skipped this phase.
- Owner-account web test covers ~80%; any native game overlay/WebView code change needs APK rebuild — will flag explicitly.

---

## Execution order (strict)

```text
Step 1: PK schema migration (A1) — needs approval
Step 2: PK score trigger + RLS (A2) — needs approval
Step 3: PK tick edge function + cron (A3)
Step 4: PK matchmaking RPCs (A4) — needs approval
Step 5: PK reward (A5) — needs approval
Step 6: PK frontend rewire (A6) — code edit
Step 7: Owner-account live test PK (smdollarex923@gmail.com)
Step 8: Game schema migration (B1) — needs approval
Step 9: Crash engine edge function (B2)
Step 10: Game bet/cashout RPCs (B3) — needs approval
Step 11: Auto-cashout worker (B4)
Step 12: Game frontend wire (B6)
Step 13: Owner-account test Game
Step 14: APK rebuild signal
```

## Non-goals (এখন না)
- 3rd-party provider integration (Evolution/Spribe) — পরে
- Multiple game variants — Crash first, validate, তারপর Dice/Roulette
- Tournament/leaderboard for games — পরে
- PK custom rule sets — default 5min/90s/70-30 only

## Honest constraints
- প্রতিটা edge function deploy auto, কিন্তু cron schedule + secret check করতে হবে
- Frontend rewire-এ existing PK/Game components পড়তে হবে (এখনো deep-read করিনি) — Step 6 + 12 শুরু আগে full file scan হবে
- Owner-account testing শুধু web flow validate করবে; native PK overlay / game WebView Android-specific কিছু থাকলে APK rebuild লাগবে — সেটা সৎভাবে বলব

---

## Hotfix — Trader Wallet duplicate balance display

### Verified root cause
- Current owner account DB check: helper/topup wallet = **0.30 💎**, agency diamond wallet = **100,673,632 💎**, combined usable Trader Wallet = **100,673,632.30 💎**.
- Self Recharge RPC was returning the **combined** value under `new_wallet_balance`; Profile UI then stored that as helper wallet and added agency balance again, creating a doubled display.
- Research note: category apps keep accounting buckets separated internally (stock/recharge currency vs earnings/commission currency), but recharge/transfer flows should highlight only the usable transfer source and avoid duplicate totals. References reviewed: BitTopup BIGO diamonds/beans guide, Poppo agent/coin seller training materials, Chamet/Olamet agency payout patterns.
- Applied standard for MeriLive: keep helper wallet and agency diamond ledger separated internally for audit, but show one Trader Wallet source in the user action screen so the same balance is not counted twice.

### Fix
- RPC return contract corrected: `new_wallet_balance` / `new_helper_wallet_balance` = helper wallet only; `new_agency_balance` = agency diamond wallet; `available_balance` = combined display value.
- Profile Self Recharge UI now displays only one `Recharge Source` and one destination `My Diamond Balance`; internal helper/agency split is hidden from the user action flow.

## Total scope
~6 migrations, 3 edge functions, 2 cron jobs, ~10-15 frontend files. বড় কাজ, কিন্তু phased — প্রতি step approve করার পর next।

**Approve করলে Step 1 (PK schema audit + migration) দিয়ে শুরু করব।**
