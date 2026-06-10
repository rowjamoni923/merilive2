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

## PART B — GAME SYSTEM (Phase 2)

Industry standard: একটা single server-authoritative minigame দিয়ে শুরু — **Crash** (Aviator-style) — Chamet/Bigo এ এটাই most popular। পরে Dice/Roulette add করা যাবে same engine-এ।

### B1. Schema cleanup + new tables
- `game_rounds` (replaces ad-hoc `game_sessions` for Crash): `id`, `game_type`, `server_seed_hash`, `server_seed` (reveal after), `client_seed`, `crash_multiplier` (provably fair), `started_at`, `crashed_at`, `status`
- `game_bets` align: `round_id`, `user_id`, `bet_amount`, `auto_cashout_at`, `cashed_out_at`, `cashout_multiplier`, `payout`, `status`
- Drop/ignore broken `game_players`, `game_session_tokens` (provider-related, unused)

### B2. Provably-fair Crash engine (edge function)
- `game-crash-engine` edge function, runs as long-lived loop via cron `* * * * *` + internal 1s tick
- Each round: generate `server_seed` → hash → publish hash → 5s betting window → start multiplier 1.00x ascending → crash at deterministic point (HMAC-SHA256 derived) → reveal seed
- Round state in `game_rounds`, ticks broadcast via Supabase Realtime channel `game:crash`

### B3. Bet + cashout RPCs (atomic, race-free)
- `game_place_bet(round_id, amount, auto_cashout)` — only during betting window, atomic `profiles.coins -= amount`, insert `game_bets`
- `game_cashout(bet_id)` — only if round active + not crashed + not already cashed; payout = `amount * current_multiplier`, atomic credit
- All wallet mutations through `SECURITY DEFINER` functions with row locks (`FOR UPDATE`)

### B4. Auto-cashout worker
- Edge function tick checks active bets with `auto_cashout_at <= current_multiplier` → auto-trigger cashout

### B5. Anti-cheat + limits
- Min/max bet from `game_settings`
- Per-user per-round single bet limit
- Rate limit: max 1 bet per 500ms per user
- `game_provider_logs` audit trail

### B6. Frontend wire
- Game UI subscribes to `game:crash` channel for multiplier ticks
- Bet button → `game_place_bet` RPC
- Cashout button → `game_cashout` RPC
- Wallet sync via existing `profiles.coins` realtime

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

---

## Emergency Recovery — Shop/VIP/animation relation outage

### Verified root cause
- Owner account login reproduced a live Data API failure: `user_purchases?select=item_id,is_equipped,expires_at,shop_items(category)` returned HTTP 400 / `PGRST200` because PostgREST cannot find the `user_purchases.item_id → shop_items.id` relationship in the active schema cache.
- Direct catalog check confirmed `user_purchases` currently has **no constraints at all**, even though the app code and older migrations expect `item_id` and `user_id` foreign keys.
- This breaks any section that hydrates purchased/equipped shop assets: VIP membership equip flow, shop entitlements, chat bubble/gift-panel styling, profile/avatar frame hydration, entrance/name-bar/vehicle/VAP/MP4/SVGA animation lookup, and some message/live/party overlays.

### Professional standard checked
- Chamet publicly documents live chat/party, virtual community interaction, in-app purchases, and premium/VIP-style perks: https://play.google.com/store/apps/details?id=com.hkfuliao.chamet and https://bittopup.com/article/Chamet-VIP-2025-Complete-Guide-to-Badges-Levels-Perks
- BIGO describes real-time chat, broadcasts, virtual city-style interaction, diamonds, and audience/streamer surfaces: https://www.bigo.tv/blog/use-bigo-live and https://www.bigo.tv/blog/bigo-live-app-features
- Poppo agency docs describe agency/host management, live broadcasts, virtual gifts, and VIP/coin ecosystem: https://www.poppolive.net/en/agency/ and https://poppoliveagents.com/agent-training/

### Fix standard for MeriLive
- Restore the exact foreign keys expected by the frontend (`user_purchases.user_id → profiles.id`, `user_purchases.item_id → shop_items.id`) after verifying there are zero orphan rows.
- Keep existing UI/design unchanged; only restore the missing DB relationship so Supabase embedded joins work again across Shop, VIP, chat/gift panels, profile frames, and animation hydration.

## Total scope
~6 migrations, 3 edge functions, 2 cron jobs, ~10-15 frontend files. বড় কাজ, কিন্তু phased — প্রতি step approve করার পর next।

**Approve করলে Step 1 (PK schema audit + migration) দিয়ে শুরু করব।**

---

## Emergency Recovery — Public profile / agency visibility outage

### Verified root cause
- Browser network showed `profiles_public?select=*&id=eq.1134eefd...` returned HTTP 200 with `[]`, while direct DB read found the profile row exists and is not banned/deleted.
- DB catalog showed `profiles_public` and `agencies_public` currently have `security_invoker=on`, so they inherit base-table RLS from `profiles` / `agencies`. Since `profiles` only allows users to read their own private row, every other user's public profile appears missing.
- This cascades into profile detail, avatar/photo/frame hydration, viewer lists, reels profile joins, message conversation profile cards, and agency public details.

### Professional standard checked
- Chamet listing describes public live/social discovery, global user interaction, real-time video/chat/party features, and virtual community access: https://play.google.com/store/apps/details?id=com.hkfuliao.chamet
- BIGO guide describes watching broadcasts, real-time chat, social discovery, and creator profile/earnings surfaces: https://www.bigo.tv/blog/use-bigo-live
- Poppo describes live broadcasts, real-time audience interaction, virtual gifts, and agency/host management: https://www.poppolive.net/en/ and https://www.poppolive.net/en/agency/

### Fix standard for MeriLive
- Public-safe views must expose only non-sensitive public profile/agency fields and must not inherit private base-table owner-only RLS.
- Base tables stay RLS-protected for sensitive/private columns; frontend keeps using public views for other-user profile cards/details and agency discovery.
