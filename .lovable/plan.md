# MeriLive — Full App Audit & Professionalization Plan
**Date:** 2026-06-10
**Method:** 3 parallel subagents — (1) codebase audit, (2) security/data-integrity audit, (3) competitor research (Chamet/Bigo/Olamet/Poppo, Agora→LiveKit translated)
**Status:** Research complete. Awaiting user approval on fix order.

---

## 🔴 CRITICAL (must fix first — real exploits, money loss, data leak)

| # | Area | File / RPC | Issue | Industry Standard |
|---|---|---|---|---|
| **CR-1** | Wallet | `process_game_bet` RPC (migration 20260414094543) | No `auth.uid()` check; `p_user_id` trusted from client. RPC is `GRANT EXECUTE ... TO authenticated` → any logged-in user can debit any other user's coins by calling RPC directly with victim's UUID. | Server validates `auth.uid() = p_user_id` inside SECURITY DEFINER (same pattern as `process_gift_transaction`). |
| **CR-2** | Wallet | `game-balance-callback` edge fn | HMAC verification SKIPPED when `GAME_CALLBACK_HMAC_SECRET` env unset → any attacker can credit unlimited diamonds with a captured game token. | Mandatory HMAC; reject 401 if secret missing (fail-closed). |
| **CR-3** | Privacy | `device_tokens` table — policies `USING (true)` + `GRANT ... TO anon` | All FCM push tokens publicly readable. Attacker harvests entire device-token DB via anon key. | RLS `USING (auth.uid() = user_id)`; revoke anon. |
| **CR-4** | Games | `roulette_spin_and_settle` — `GRANT EXECUTE ... TO authenticated` | Any user can trigger spin before bet window closes → manipulation. | Restrict to admin/cron only (Bigo/Agora pattern: server-cron driven game state). |
| **CR-5** | Games | `pk-battle-tick` edge fn | Zero auth on HTTP endpoint. Anyone can force-settle all active PK battles. `call-billing-tick` has `CRON_SECRET` guard — `pk-battle-tick` missing it. | Same `CRON_SECRET` Bearer pattern as `call-billing-tick`. |
| **CR-6** | Wallet | `process_gift_transaction` (migration 20260509052512) | Sender row locked `FOR UPDATE`, receiver row UPDATE'd WITHOUT lock → concurrent gifts race on `total_earnings`, `weekly_earnings`, `pending_earnings` → lost increments under gift storm. | Lock both rows in canonical order before mutate (standard double-entry ledger pattern). |
| **CR-7** | Games | Server RNG uses Postgres `random()` (MT19937) | Predictable; observer can correlate outcomes. Compliance failure for paid games. | `gen_random_bytes()` from pgcrypto, or commit-reveal scheme. |
| **CR-8** | Privacy | `livekit_room_events` table | RLS status unknown; if anon-readable, attacker enumerates all rooms + participant UUIDs + track activity. | `service_role` only. |
| **CR-9** | Security | Wildcard CORS on `admin-*` + financial edge fns | Admin endpoints accessible from any origin → CSRF risk on admin browser sessions. | Lock to admin panel origin; remove CORS on webhook-only fns. |

---

## 🟠 HIGH (production-grade gaps vs Chamet/Bigo)

| # | Area | Finding | Industry Standard |
|---|---|---|---|
| H-1 | Live Stream | 60s zombie stream window when host crashes (`update_stream_heartbeat` every 15s, cron kills at >60s) | Bigo/Chamet: 20–30s grace (Agora `onUserOffline` at 20s). Reduce stale threshold to 30s + add `visibilitychange→hidden` immediate-end on web. |
| H-2 | LiveKit | Viewer token endpoint auto-upserts `stream_viewers` rows → unauthenticated fake-viewer inflation possible | Move upsert to `enter_live_stream` RPC with rate-limit per IP; fake-viewer detection = Sift industry standard. |
| H-3 | LiveKit | Android native token refresh = full `reconnectNow()` → 1–3s media freeze | Bump TTL to 12–24h (LiveKit blog: token only validated at connect, not during session). Currently 6h. |
| H-4 | Private Call | Dual `callEndedRef` in `usePrivateCall` + `CallProvider` can disagree → duplicate `acceptCall` on dead call | Single source of truth ref. |
| H-5 | Private Call | `callStateRef` declared at line 1039 but used at line 116 → `undefined.current` crash on cold first render | Move declaration above first use. |
| H-6 | Private Call | `call-billing-tick` N+1 queries per call (extra `profiles` SELECT for low-balance check) → 150s function ceiling exceeded under 100+ concurrent calls | Return `remaining_coins` from `bill_call_minute` RPC. |
| H-7 | Frontend | `CallProvider` hardcodes `endedBy: 'remote'` → caller who hung up sees "Remote ended the call" (trust bug) | Track local initiator; correct copy. |
| H-8 | PK Battle | Punishment-phase gifts don't update score columns (only `total_gift_value`) → viewers see no feedback on rescue gifts | Decide design; either credit to winner side or hide score bar in punishment phase. |
| H-9 | Security | Many early SECURITY DEFINER functions missing `SET search_path = public` (Jan 2026 batch) | Supabase advisor flags this. Run `ALTER FUNCTION ... SET search_path = public` for each. |
| H-10 | Push | `send-push-notification` mints new FCM OAuth token on EVERY push (1000 pushes/min = 1000 token requests/min to Google) | Cache token in module-level var; refresh only within 5 min of 1h expiry. |
| H-11 | Realtime | `usePrivateCall` channel not StrictMode-safe on `userId` change → zombie channels | Store in `useRef`; always `removeChannel` before subscribe. |
| H-12 | Realtime | `call_signaling:<callId>` channel name inconsistency risk (server broadcasts vs client subscribes) | Shared constants file. |
| H-13 | Mobile | `useNativeCallBillingSync` shows coin-deduction UI to host if DB query fails (role check inside hook, not propagated) | Pass `isHost` prop; short-circuit before any DB query. |
| H-14 | Profiles | `profiles` SELECT policy `USING (true)` exposes `phone`, `email`, possibly payment columns to ALL authenticated users | `profiles_public` view for safe columns; column-level REVOKE for phone/email; or split into `profiles` + `profiles_private`. |
| H-15 | Wallet | Financial tables (`gift_transactions`, `payment_transactions`, `billing_ledger`, `balance_audit_log`, `coin_transactions`, `coin_transfers`, `coin_trader_transfers`, `user_beans_exchanges`) — no explicit GRANT statements found | Per public-schema-grants rule: explicit REVOKE + targeted GRANT. |
| H-16 | Games | Ferris Wheel teen-patti zero-bet logs false-positive "win" audit rows (`is_win=true, amount=0`) → poisons leaderboard | Reject per-slot zero or skip win-log on zero payout. |

---

## 🟡 MEDIUM (polish + edge cases)

| # | Area | Finding | Standard |
|---|---|---|---|
| M-1 | Games | Teen Patti tie-breaker: hand A always wins ties (deterministic bias — exploitable) | Suit-based or random tie-break. |
| M-2 | Games | Ferris Wheel float weight sum = 1.0289 not 1.0 → slot 8 over-represented ~0.01% | Integer weights × 900. |
| M-3 | Party | `party_room_seat_locks` RLS enabled but NO policies → silent fail on direct access | Policies or strict RPC-only access. |
| M-4 | Games | `roulette_get_or_create_session` callable by viewers → can create new session mid-spin | Host/admin guard. |
| M-5 | Wallet | Agency `beans_balance` only protected by trigger → dashboard direct SQL bypasses | Add CHECK constraint. |
| M-6 | Wallet | Manual top-up has no idempotency key on `recharge_transactions` → admin double-click = double credit | UNIQUE(external_transaction_id). |
| M-7 | Wallet | `swift_pay_topups.payment_id` not UNIQUE → concurrent poller cron can double-credit | Add UNIQUE + atomic credit gate. |
| M-8 | Auth | `getSession()` returns stale cache; no proactive refresh on app resume → 30d-inactive users appear logged-in but fail every server call | Check `expires_at`; proactive `refreshSession()` within 5 min of expiry. |
| M-9 | Animations | SVGA/VAP players: no `destroy()` between rapid gifts → Android WebView 16 WebGL context limit hit → black canvas | Explicit cleanup; cap concurrent ≤5 (CSDN/Tencent priority queue pattern). |
| M-10 | Animations | Entry VAP not pre-warmed (only popular gifts) → 200–800ms stutter on premium entry | Include in `get_popular_gift_assets` warmup. |
| M-11 | Call | FCM+Realtime dual-delivery race → double-ring on fast networks | Use existing `pendingCallCheckInFlightRef` in `showVerifiedIncomingCall`. |
| M-12 | PK Battle | `pk_battle_send_gift` lock order risk (profiles vs pk_battles inconsistent) → deadlock under concurrent gifting | Canonical lock order. |
| M-13 | Edge | `game-balance-callback` logs full response incl. balances → persistent log of every user's balance | Log only `{action, success, code}`. |
| M-14 | Frontend | `acceptingRef`/`decliningRef` never reset on failure → accept button permanently disabled after one failure | try/finally reset. |
| M-15 | Frontend | Stale closure risk in `CallProvider` `captureEndedInfo` (callId can be cleared mid-async) | Snapshot callId before async. |
| M-16 | Mobile | `beforeunload` reads `localStorage` directly; wrong key if project URL changes → silent fail | Use `supabase.auth.getSession()`. |
| M-17 | Edge | Supabase Edge cold-start 2–5s on critical paths (gift, call signal, billing) | Scheduled warm-ping every 5–10 min on critical fns. |

---

## 🔵 LOW (cleanup / future)

- L-1: Wildcard CORS on all 110+ edge fns (already covered by CR-9 for sensitive ones)
- L-2: Migration `n` alias obfuscation harms auditability
- L-3: Storage buckets not in migrations — must audit via live DB
- L-4: No list virtualization on 30+ item screens (Android low-RAM thrash)
- L-5: Verify `livekit-client` actually tree-shaken from main chunk
- L-6: Dead-code path in `admin-lookup-phone` (returns unmasked phone if early-return removed)

---

## ✅ Confirmed Healthy
- `user_roles` table structure (separate table, `has_role` SECURITY DEFINER w/ `search_path`, no role on profiles) ✅
- PK Battle schema rebuild (migration 20260610023028) — server-authoritative, canonical columns, unique partial indexes ✅ (small gaps only — H-8, CR-5, M-12)
- Roulette/Ferris/Teen Patti server-authoritative refactor (just done) ✅ (gaps: CR-4, CR-7, M-1, M-2, M-4, H-16)
- Helper/Trader wallet separation ✅ (just done, doesn't touch game flow)

---

## 📊 Industry Benchmarks Locked (cite when fixing)

| Metric | Our Current | Industry Standard | Source |
|---|---|---|---|
| Stream zombie window | 60s | 20–30s (Agora `onUserOffline` 20s) | Agora docs |
| LiveKit token TTL | 6h | 12–24h (only enforced at connect, not session) | LiveKit blog |
| Ring timeout | reads `ring_timeout_seconds` ✅ | 30–45s (WhatsApp 30s) | Industry |
| OTP cooldown | unknown — audit needed | 60s | Industry std |
| OTP expiry | unknown | 5–10 min | Industry std |
| FCM token cache | 0 (per-request) | 1h with 5min refresh window | Firebase docs |
| PK duration | configurable ✅ | 3–5 min standard, 1–2 min punishment | Bigo/BitTopup 2026 |
| Bigo Bean rate | n/a (our own econ) | 210 Beans = $1, 45–80% host rebate | BitTopup 2026 |
| Supabase Realtime presence (Free) | unknown plan | 20 msg/s Free, 1000 Pro-no-cap → use Broadcast+counter not Presence for 100+ viewers | Supabase docs |
| Edge fn cold start | 2–5s observed | Mitigate with cron warm-ping every 5–10 min | Supabase blog |
| Gift animation concurrency | uncapped | ≤2–3 full-screen, ≤5 banners (Android 16 WebGL ctx limit) | LeakCanary + CSDN |
| Beauty filter | unknown impl | GPUPixel <10ms GPU; thermal throttle → 720p@24fps + drop heavy ops | BIGO RTC |
| Idempotency TTL | mostly missing | 24h on all gift/payment/top-up | Dev.to pattern |

---

## 🎯 Proposed Fix Order (Phases — one phase per approval)

**Phase 1 — STOP THE BLEED (CRITICAL) — ✅ DONE 2026-06-10**
- [x] CR-3: `device_tokens` lockdown (already scoped; anon grant revoked, authenticated/service_role re-granted)
- [x] CR-1: `process_game_bet` — `auth.uid() = p_user_id` enforced
- [x] CR-2: `game-balance-callback` — HMAC mandatory (fail-closed if secret unset); CORS locked
- [x] CR-5: `pk-battle-tick` — service-role bearer OR `CRON_SECRET` required (matches `call-billing-tick`)
- [x] CR-4: `roulette_spin_and_settle` — refuses unless `betting_ends_at <= now()`
- [x] CR-6: legacy non-locked `process_gift_transaction` overload DROPPED; only the locked+idempotent 9-arg version remains
- [x] CR-8: `livekit_room_events` — RLS on, anon+authenticated revoked, service_role only
- [x] CR-7: `_secure_random()` helper (pgcrypto `gen_random_bytes`) replaces `random()` in roulette/ferris/teen patti
- [~] CR-9: CORS tightened on `game-balance-callback` (provider webhook). Admin endpoints audit deferred to Phase 2.

**Phase 2 — PRIVATE CALL & LIVE STREAM RELIABILITY (HIGH frontend) — 🟡 PARTIAL 2026-06-10**
- [x] H-1: zombie stream window 3min → 35s (cleanup_stale_live_streams) — Agora benchmark 20-30s + buffer over 15s heartbeat
- [x] H-3: LiveKit token TTL 6h → 24h (livekit-token edge fn) — eliminates mid-session full reconnects
- [x] H-5: `callStateRef` declaration moved to top of `usePrivateCall` — fixes `undefined.current` on first render
- [x] H-6: `bill_call_minute` now returns `remaining_coins` / `remaining_minutes` — call-billing-tick N+1 eliminated
- [x] H-7: `endedBy` derived honestly in CallProvider (self / remote / system) via `selfEndedRef` + DB end_reason
- [x] H-10: FCM access-token caching at module scope (1h cache, 5min refresh window, in-flight coalescing)
- [x] H-14: ✅ Already healthy — `profiles` SELECT policy is `auth.uid() = id`, not `USING (true)` (plan claim was stale). Cross-user PII access already gated through `profiles_public` view.
- [ ] H-4: dual `callEndedRef` consolidation (usePrivateCall + CallProvider) — deferred, needs careful refactor
- [ ] H-11: `usePrivateCall` channel StrictMode safety on `userId` change — deferred
- [ ] H-13: `useNativeCallBillingSync` host short-circuit before DB query — deferred
- [ ] H-15: explicit GRANTs on financial tables — moved to Phase 3


**Phase 3 — FINANCIAL HARDENING (HIGH backend) — ✅ DONE 2026-06-10**
- [x] H-15: defense-in-depth — `REVOKE ALL ... FROM anon` on 21 financial tables (gift / payment / billing / coin transfers / agency / helper / game). RLS already blocked anon; this removes the default-ACL bits so a future permissive policy can't expose money flows. service_role re-granted.
- [x] H-9: ✅ already healthy — every `SECURITY DEFINER` function in `public` has `SET search_path` (Phase 1 swept the legacy ones).
- [x] M-5: `agencies.beans_balance >= 0` CHECK constraint added (VALID).
- [x] M-6: ✅ already healthy — `recharge_transactions` has unique partial indexes on `google_order_id`, google-play `transaction_id`, and (`payment_method`,`transaction_id`) for completed gateway txns.
- [x] M-7: `swift_pay_topups.payment_id` unique partial index — prevents double-credit from concurrent poller workers.
- [x] M-8: proactive session refresh on `visibilitychange→visible` + `window.focus` (5-min threshold, single-flight). Fixes "logged in but every request 401s" after long background. Auth-only refresh — no business-data refetch (respects no-polling rule).


**Phase 4 — GAME POLISH & UX — 🟡 PARTIAL 2026-06-10**
- [x] M-1: Teen Patti tie-breaker — cascading `>=` (always favored hand A) replaced with `_secure_random()` pick among tied top-scoring hands. `tie_count` recorded in `result_data` for audit.
- [x] M-15: `captureEndedInfo` in `CallProvider` snapshots `callId` / `duration` / `coinsSpent` / `hostEarned` BEFORE the async DB read — prevents stale-closure mis-attribution if call is dismissed mid-flight.
- [x] M-2: ✅ already healthy — ferris weights normalised by `v_total_w` at runtime; the 1.0289 sum never reaches probability math, no observable bias.
- [x] H-16: ✅ already healthy — `teen_patti_play` rejects `total_bet<=0`; per-slot zero bet correctly logs `is_win=false` with `transaction_type='bet'`.
- [x] M-14: ✅ already healthy — `acceptingRef`/`decliningRef` released in `finally` (500ms tick) in `CallProvider`.
- [x] M-16: ✅ already healthy — `PartyRoom` `beforeunload` uses `sessionAccessTokenRef`, not raw localStorage.
- [~] H-8: backend already correct (punishment-phase gifts skip score columns, return `phase:'punishment'`). UI label tweak deferred — design SACRED rule.
- [~] H-2: livekit-token public-stream viewer auto-upsert is the intentional race-fix; per-IP rate limit deferred (needs product call).
- [~] M-4: roulette is community-round (no host); `get_or_create_session` already refuses to create mid-spin via status check. No code change needed.
- [ ] M-9, M-10: gift/entry animation work — BLOCKED by `mem://constraints/never-touch-gift-entry-animations` and pkg438 Phase B (JS shim pending).
- [ ] M-11: FCM+Realtime double-ring — needs incoming-call channel refactor; deferred with H-4/H-11.

**Phase 5 — INFRASTRUCTURE — 🟡 PARTIAL 2026-06-10**
- [x] M-3: ✅ already healthy — `party_room_seat_locks` already has both SELECT (host) and FOR ALL (host) policies in migration 20260609013936 alongside table create.
- [x] M-12: ✅ already healthy — `pk_battle_send_gift` locks `pk_battles FOR UPDATE` first, then `profiles FOR UPDATE` (canonical order). No deadlock risk.
- [x] M-13: `game-balance-callback` no longer logs full response body (balances). Now logs only `action / token-prefix / success / code` metadata.
- [~] M-17: cold-start warm-pings — deferred. Needs `cron.schedule()` + `pg_net` with project URL + anon key (not migration-safe). Add via insert tool when user opts in.
- [~] L-1..L-6: bulk cleanups (wildcard CORS sweep, migration alias readability, storage-bucket audit, list virtualisation, livekit-client tree-shake verify, admin-lookup-phone dead path) — non-blocking, batch later.

---

## ⚠️ Honest Notes
- **Design SACRED** — zero UI/design/copy edits anywhere. Only backend RPCs, edge fns, hooks, and logic.
- **Owner test account** (smdollarex923@gmail.com) will be used to verify each phase before claiming done.
- **APK rebuild** required ONLY for Android-native pieces (none in Phase 1–3; possible in M-13 if native call billing changes).
- **VPS work deferred** per memory rule.
- **English-only UI strings** maintained.
- Some HIGH items (H-2 viewer inflation) need product decision before code (do we accept some inflation to keep UX fast, or strict-check every viewer join?).
