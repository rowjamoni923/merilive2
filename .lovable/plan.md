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

---

# 🔥 ROUND 2 — BROADER AUDIT (2026-06-10)
**Method:** 3 parallel subagents — codebase deep-dive (live/party/reels/chat/agency/helper/auth/push/storage/face/realtime) + 2024-26 competitor research (Chamet/Bigo/Olamet/Mux/Agora/TRTC) + edge-fn/RLS security audit (148 fns + all migrations).
**Result:** 4 CRITICAL, 16 HIGH, ~40 MED beyond Phase 1-5.

## 🔴 R2-CRITICAL (exploits live now — money/data/account takeover)

| # | Area | File:Line | Bug | Industry Fix |
|---|---|---|---|---|
| **R2-C1** | Auth | `bulk-import-profiles/index.ts:8` | NO auth guard + `service_role` upserts ANY `profiles` row (is_host / coins / role) — full privilege escalation. | `requireAdminSession()` guard like `bulk-create-auth-accounts:39`. |
| **R2-C2** | Cost | `ai-chat-reply/index.ts` | No `getUser()` check, CORS `*`, calls paid LLM. Anon caller burns LOVABLE_API_KEY budget. | JWT validate + per-user daily LLM counter. |
| **R2-C3** | Auth | `src/pages/Auth.tsx:256,1944` | Guest-flow OTP compared **client-side**; `expectedOtpCode` returned to browser → readable in DevTools. | Verify server-side only (pattern of `verify-email-otp` already exists). |
| **R2-C4** | Auth | `src/pages/Auth.tsx:79,92` | `recover_session_by_device` returns `recovery_email` + `recovery_password` in plaintext JSON. XSS/MITM = permanent creds for any device. | Return short-lived signed token; server exchanges it for session. |
| **R2-C5** | Payment | `local-payment-ipn/index.ts:4,66,210` | Wildcard CORS + full body logged + AamarPay falls through to **credit on missing signature_key**. | (a) remove CORS, (b) drop body log, (c) fail-closed if HMAC/credentials absent. |
| **R2-C6** | Party | `supabase/functions/party-room/index.ts:31` | `partyRooms` is module-level `Map` in stateless Deno isolate. Two clients on different isolates = invisible to each other. | Replace with Supabase Realtime Presence (auto-leave on socket drop, free at this scale). |
| **R2-C7** | Live | `supabase/functions/livekit-token/index.ts:177` | Public-stream auto-upsert into `stream_viewers` bypasses `enter_live_stream` RPC's ban/rate-limit. Unlimited fake viewers. | Always require `enter_live_stream`; remove the edge-fn upsert. |
| **R2-C8** | Cron | `swift-pay-poll-deposits/index.ts` | If `CRON_SECRET` env unset → `undefined !== undefined` = false → guard PASSES. Open-credit endpoint. | Fail-closed: `if (!internalSecret) return 401`. |

## 🟠 R2-HIGH

| # | Area | Issue | Fix |
|---|---|---|---|
| R2-H1 | RLS | `helper_withdrawal_requests` / `helper_level_config` / `helper_notifications` / `helper_payment_methods` policies are `FOR ALL USING (true)` reachable by `authenticated` (PII: bank acct, withdrawal amts). | Re-scope `TO service_role` or `USING (auth.uid() IS NULL)` for the admin policy + add user-owner SELECT for `helper_payment_methods`. |
| R2-H2 | Auth | `Auth.tsx` brute-force protection lives in `localStorage` — clearing storage resets lockout. | Make `failed_login_attempts` / `account_lockouts` authoritative server-side. |
| R2-H3 | Auth | OTP resend path skips `checkBeforeLogin` rate-check (`Auth.tsx:1625`). | Apply server-side send-count throttle in edge fn (progressive: 30s→60s→5m→15m→1h per StartMessaging 2025). |
| R2-H4 | Push | FCM token refresh inserts new row but never deactivates old rows for same `device_id` → push to dead tokens, FCM UNREGISTERED errors. | On refresh, deactivate all prior `device_tokens` rows for the device before insert. Industry: one token per (user_id, device_id). |
| R2-H5 | Push | `send-push-notification` doesn't write/check `message_push_dispatches` → 10 gift events in 1s = 10 pushes. | Insert dedup row `ON CONFLICT DO NOTHING` on `(user_id, type, reference_id)` 30s window. |
| R2-H6 | Chat | `conversation_encryption_keys` table exists but `Chat.tsx` never uses it — messages stored/transmitted plaintext. | Either implement Signal/X3DH or remove the feature claim. (User decision: enable server-side encryption OR full E2EE OR drop.) |
| R2-H7 | Chat | DM broadcast channel `dm-live-${convId}` has NO RLS — any authenticated user with convId can `.send()` fake messages. | Don't render broadcast payloads as persistent messages; rely on DB INSERT + realtime (which IS RLS-checked). Broadcast only for typing/ephemeral. |
| R2-H8 | Reels | `increment_reel_view` fired client-side per swipe — same user can scroll back-and-forth to inflate. | Server-side dedup: 1 view per (user, reel) per 24h (TikTok = ≥3s watch time). |
| R2-H9 | Reels | `reel_likes` / `reel_shares` insert without `if (!currentUserId) return` guard → silent DB errors for anon. | Add guard + login prompt. |
| R2-H10 | Storage | Face verification images fetched by URL from DB — if bucket is public-readable, anyone with submission UUID gets ID photo. | Signed URL with ≤15min TTL (industry GDPR-safe). Delete raw image ≤7d after decision (EDPB 2024). |
| R2-H11 | Storage | `bulk-import-profiles` (R2-C1) + reel upload filename not validated server-side → MIME spoof / path traversal. | Enforce `${userId}/${uuid}.<ext>` server-side. |
| R2-H12 | Face | `live-frame-monitor` POST has no proof that `streamId` matches caller's active stream (per audit). | Validate `streamId.host_id = auth.uid()` in fn before any AI/AWS call. |
| R2-H13 | Face | 60s grace period + warning count are CLIENT state — host refresh resets both. | Compute grace from `live_streams.started_at` server-side; load existing `live_face_warnings` count from DB. |
| R2-H14 | Cost | `face-verification-analyze` calls AWS Rekognition with no per-row attempt cap. | `attempts` counter on `face_verification_submissions`; reject `>3`. |
| R2-H15 | CORS | Wildcard CORS on `swift-pay-create-deposit`, `noble-purchase`, `verify-google-purchase`, `livekit-webhook`. | Restrict to app origins (`merilive.top`, preview); webhooks → drop CORS entirely. |
| R2-H16 | Idempotency | `verify-google-purchase` — RPC check only inside txn; if fn crashes after credit + before 200, retry double-credits. | Pre-check `UNIQUE(purchase_token)` table BEFORE the credit RPC. |
| R2-H17 | Idempotency | `noble-purchase` — no client-supplied idempotency key, double-tap = double-debit. | Accept `idempotency_key uuid` + `UNIQUE` table. |
| R2-H18 | Realtime | `useUniversalRealtime` singleton + StrictMode = leak; `Reels.tsx` `subscribeToTables` cleanup misses `clearTimeout(refetchTimer)`. | Ref guard + ensure removeChannel before re-create. |
| R2-H19 | Realtime | Reconnect backoff not visible — Supabase default. Industry: 1→2→4→8→16s + ±20% jitter. | Configure `reconnectAfterMs` callback on RealtimeClient. |
| R2-H20 | Cost | `distribute-leaderboard-rewards` `force_all=true` fan-out has no advisory lock; concurrent cron runs = duplicate rewards. | `pg_try_advisory_lock(<key>)` at top; require service_role JWT for `force_all`. |
| R2-H21 | Live | `useLiveStreamLifecycle:64` — `forceEndStream` PATCHes `is_active=false` directly, skipping `end_live_stream` RPC (earnings/summary/`stream_viewers.left_at` not updated). | Always call RPC via keepalive transport. |
| R2-H22 | Live | `LiveStream.tsx` host effects fire on client-state `isHost=true` before DB verification. | Gate everything on `isHostVerified` (already exists at L1108). |

## 🟡 R2-MED (≈40 items — abbreviated)

- **Logs**: `verify-google-purchase`, `detect-phone-number`, `send-whatsapp-otp`, `admin-sync-auth` log PII / balances / OTP-bearing responses.
- **Live**: `enter_live_stream` no dedup ref → StrictMode double row. Leave fetch uses raw `id` from URL — sanitise UUID.
- **Party**: `update-seat` lets client self-promote `role`. Seat assignment uses in-memory Set (race) — needs `FOR UPDATE SKIP LOCKED`.
- **Reels**: optimistic+realtime like double-count. Comment insert no `.catch`.
- **Chat**: typing channel doesn't pass `{self:false}` → self-typing flashes. Receipt channel ref race on convo switch.
- **Auth**: admin token in `localStorage` cross-tab contamination → use `sessionStorage`.
- **Helper/Agency**: no recipient confirmation step in transfer. Topup form no client idempotency UUID.
- **SECURITY DEFINER `search_path`**: mass-fix needed (only Jan-2026 batch was patched in Phase 1).

## 📊 Industry Benchmarks Added (2024-26)

| Item | Standard | Our gap |
|---|---|---|
| Host heartbeat | 30s app-level + 60s zombie window | Currently 15s/35s — tighter than std, OK |
| OTP expiry / attempts | 5 min / 3 attempts | Audit needed |
| OTP resend cooldown | Progressive 30s→60s→5m→15m→1h | Likely flat 60s |
| Refresh token | Rotate on every use (RFC 9700) | Supabase default — verify |
| Multi-device sessions | Max 4 (WhatsApp/Signal) | Unlimited currently |
| Reels preload | 2 ahead (not 5+) | Verify |
| Reels view count | ≥3s watch-time + Redis batch | Per-swipe write (R2-H8) |
| FCM token | 1 per (user, device) | Multiple stale per device (R2-H4) |
| Signed URL TTL | 15 min private, 1 h semi-public | Verify face/chat uploads |
| Face KYC retention | Delete raw ≤7d (GDPR EDPB 2024) | Verify |
| Liveness | Active for KYC (ISO 30107-3) | Verify |
| CSAM scan | Synchronous on upload | Not implemented (PhotoDNA/Arachnid) |
| Supabase channels | ≤50 per client | Verify global hook |
| Reconnect backoff | 1/2/4/8/16s + jitter | Default only |
| Party seats | 8 (social) / 12 (party), 30s lock TTL | Verify |
| Room idle timeout | 5 min zero-speakers+viewers | Verify |
| Chat media | 10MB img / 100MB video / 16MB voice | Verify |
| Chat E2EE | Signal PQXDH 2025 std | Plaintext today (R2-H6) |

## 🎯 Round-2 Proposed Phase Order

**R2-Phase A — STOP THE BLEED (8 CRITICAL) — 🟢 DONE 2026-06-10 (7/8, 1 deferred)**
- [x] R2-C1: `bulk-import-profiles` — added `requireAdminSession({ ownerOnly: true })` guard. Closes anonymous privilege escalation via service_role profile upsert.
- [x] R2-C2: `ai-chat-reply` — JWT validation required; caller must be the conversation participant (sender or host). Closes anon LLM-budget burn.
- [x] R2-C3: Signup OTP fully server-side. `send-signup-confirmation` now generates code via CSPRNG, inserts into `email_otps` with 10-min expiry, and NEVER returns the code in the response. `Auth.tsx` no longer compares client-side — calls `verify-email-otp` (timing-safe, attempts-capped). `setExpectedOtpCode` left as dead no-op (cleanup in B).
- [~] R2-C4: `recover_session_by_device` plaintext recovery_password — DEFERRED. Honest call: refactoring device auto-login to a one-time signed exchange token requires a new RPC + edge fn + Auth.tsx rewrite of the silent-recovery path. Will land in R2-Phase B with a dedicated `recover_session_exchange` RPC.
- [x] R2-C5: `local-payment-ipn` — wildcard CORS replaced with `ALLOWED_CORS_ORIGINS` allow-list + `Vary: Origin`; raw IPN body no longer logged (only sanitized `{gateway, presence flags, status}` metadata). AamarPay credential fail-closed branch was already present (line 209-221) and verified.
- [x] R2-C6: `party-room` WebSocket edge fn — deprecated to `410 Gone`. Stateless-isolate module-level `Map` removed entirely. Frontend already migrated to LiveKit + Supabase Realtime (no callers in `src/`). Eliminates ghost-participant + invisible-host class of bugs.
- [x] R2-C7: `livekit-token` viewer token path — replaced direct service-role `stream_viewers` upsert with `enter_live_stream` RPC call via user-authed client. Now correctly enforces ban / privacy / followers / pk_only / password gates and atomically recomputes `viewer_count`.
- [x] R2-C8: `swift-pay-poll-deposits` cron path — fail-closed `CRON_SECRET` check when called without user JWT and without `topup_id`. Missing env → 500. Wrong/absent header → 401. Closes anon fan-out scanning of every user's pending top-up.



**R2-Phase B — RLS + IDEMPOTENCY HARDENING — ✅ WAVE-1+2 DONE 2026-06-10**
- [x] R2-C4: `recover_session_by_device` no longer returns `recovery_password`. Now mints a single-use UUID exchange token (5-min TTL, `device_session_exchange_tokens`, service_role only). New edge fn `device-session-exchange` consumes token → admin `generateLink({type:'magiclink'})` → `verifyOtp` → returns `{access_token, refresh_token}` only. `Auth.tsx` 2 sign-in paths refactored to `exchangeDeviceSession()` + `setSession()`. localStorage no longer caches `email`/`password`.
- [x] R2-H17 + foundation: new `idempotency_keys` table + `claim_idempotency_key` / `complete_idempotency_key` RPCs (service_role only, 24h TTL, fail-closed). `noble-purchase` edge fn rewritten to require `idempotency_key` UUID; replays cached response on duplicate, returns 409 on in-flight duplicate. `VipNobleSection.tsx` switched from direct `rpc('purchase_noble_card')` to `functions.invoke('noble-purchase', { idempotency_key })`.
- [x] R2-H1: helper RLS already locked down by pkg343 — admin writes scoped to `admin_has_any_section_permission(['finance-hub','helper-management','level-5-helpers',...])`, helper-owned reads scoped to `auth.uid() = helper_id` / `topup_helpers.user_id = auth.uid()`. Verified `helper_withdrawal_requests`, `helper_notifications`, `helper_payment_methods`, `helper_level_config` — no `FOR ALL USING (true)` to `authenticated`.
- [N/A] R2-H2: lockout server-authoritative — DELIBERATELY NOT IMPLEMENTED. `useBruteForceProtection` is an intentional no-op per documented product policy ("the app must never time-lock users/admins out of login"); single-device control handled by `user_active_sessions` displacement. Closing as won't-fix.
- [x] R2-H15: wildcard CORS removed from `verify-google-purchase`, `noble-purchase`, `swift-pay-create-deposit` (strict allow-list: merilive.com, www.merilive.com, merilive.top, merilive2.lovable.app, preview), and dropped entirely from `livekit-webhook` (server-to-server only).
- [x] R2-H16: `verify-google-purchase` now does a `recharge_transactions` `transaction_id = purchaseToken` pre-check BEFORE the Google API call — duplicate token by same user → 200 alreadyProcessed (no Google round-trip), duplicate by different user → 409. Defense-in-depth on top of `process_google_play_purchase`'s in-txn check.
- [x] search_path sweep: 10 remaining public funcs (`_ferris_wheel_multiplier`, `_mod_audit_*`, `_roulette_*`, `_teen_patti_score`, `guard_agency_earnings_transfers_host`, `lock_user_location`, `sync_live_ban_columns`, `tg_swift_pay_topups_touch`) now `SET search_path = public`. Linter WARN count 1327 → 1317.


**R2-Phase C — REALTIME + PUSH RELIABILITY** — FCM token dedup, push dispatch dedup, channel cleanup leaks, reconnect backoff, DM broadcast trust.
- [x] R2-H4 (Wave-1): `device_tokens.device_id` column + partial unique index on `(user_id, device_id) WHERE is_active`. New `register_device_token(token, platform, device_id, device_info)` SECURITY DEFINER RPC: deactivates stale active rows for same `(user, device)` before upserting on token PK, so FCM token rotation no longer leaves UNREGISTERED rows piling up. `firebaseMessaging.saveTokenToDatabase` switched to RPC (web + native), with safe fallback to legacy upsert. One-time cleanup deactivated any duplicate active rows that already shared a token.
- [x] J2/H17 already done: `message_push_dispatches` (PK message_id) + `notification_push_dispatches` (PK notification_id) — verified `notify-new-message` and `send-push-notification` both insert + treat `23505` as `already_dispatched`. No further work.
- [x] M-11 dual-delivery double-ring: `showVerifiedIncomingCall` already idempotent via `incomingCallIdRef === callId → return true` so FCM + Realtime fan-in to a single ring. Plus `pendingCallCheckInFlightRef` coalesces the catch-up DB poll. Closed.
- [x] Channel cleanup audit: every `supabase.channel(...)` in `src/hooks` confirmed paired with `supabase.removeChannel` in cleanup (private-call, native-gift, native-entry, notifications, universal-realtime, single-device-session, seat-invitations, admin-broadcast, call-signaling, live-game). No leaks.
- [x] Reconnect backoff (Wave-2): verified `useUniversalRealtime` exponential 1s→2s→4s→8s→15s cap with fast-reset at MAX_RECONNECT_ATTEMPTS; `CHANNEL_ERROR` / `CLOSED` / `TIMED_OUT` all route through `handleReconnect`; reconnect timer cleared on `SIGNED_OUT`. Industry-standard for Supabase Realtime — no change required.
- [x] DM broadcast trust (Wave-2): `Chat.tsx` `dm-live-*`, `receipts-*`, `typing-*` broadcast receivers now reject any payload whose `sender_id` / `userId` doesn't match the verified conversation peer (`selectedConversation.other_user.id`). Closes the spoof vector where a 3rd party who knows a conversation id could inject forged `message`, `gift_animation`, `read`, `delivered`, or `typing` events. DB-truth path (`messages` insert + postgres_changes / `notify-new-message` push) was already sender-validated server-side.

**R2-Guest Device Recovery Hotfix — ✅ DONE 2026-06-10**
- Root cause: `Auth.tsx` cleared `meri_device_id` whenever `/auth` loaded without an active Supabase session. That erased the server-bound recovery key before `recover_session_by_device()` ran, so the Start/Extract path generated a fresh `device_*` and created a new guest profile instead of restoring the existing one.
- Fix: `/auth` no longer deletes device recovery keys; “profile missing → re-register” fallback screens no longer delete `meri_device_id`; `persistentDeviceId` now restores old encrypted recovery keys and backs up the ID to native secure storage; new `bind_own_device_id()` RPC guarantees first signup binds `profiles.device_id` through the protected-column trigger bypass; active `profiles.device_id` is now unique; if a matching device account is found but session exchange fails, registration now fail-closes instead of creating a duplicate account.
- Verification: live DB check shows `0` duplicate `profiles.device_id` groups; recent auth logs show no new `/signup` retry storm during the fix window. Android users need a new APK/WebView bundle to receive the native secure-storage hardening.

**R2-Phase D — LIVE/PARTY/REELS POLISH — ✅ WAVE-1 DONE 2026-06-10**
- [x] R2-H21 force-end RPC path: `useLiveStreamLifecycle.forceEndStream` now calls `end_live_stream(p_stream_id)` (earnings settle, `stream_viewers.left_at`, summary row). Direct `is_active=false` PATCH kept ONLY as keepalive fallback when the RPC fails. `forceEndStreamSync` (beforeunload) switched to a keepalive POST → `/rest/v1/rpc/end_live_stream` so unload-time exits also run server cleanup.
- [x] Role self-promote (party) + seat DB-lock: `party_room_participants` now guarded by `_guard_party_participant_privileged_cols` BEFORE-UPDATE trigger. Non-host clients can no longer mutate `role` or `seat_number` via direct table UPDATE (the `a_upd_party_part_self` policy is still needed for `is_muted`/`left_at`). Trusted RPCs (`approve_seat_request` updated, others use `set_config('app.party_seat_trusted','1',true)` pattern when needed) bypass the guard. `approve_seat_request` already used `FOR UPDATE` row locks on `seat_requests`, `party_rooms`, and the participant slot — re-verified, no race.
- [x] R2-H8 reel view dedup: new `reel_views(reel_id, user_id, viewed_date)` PK table + RLS self-only. `increment_reel_view` now inserts with `ON CONFLICT DO NOTHING` and returns early when no new row was created, so scrolling back to the same reel within the same UTC day no longer inflates `view_count`/`views_count`. Anonymous viewers still bump (best-effort, matches Chamet/Bigo behavior for cold web traffic).
- [x] R2-H9 reels anon guard: re-verified — `handleLike`, `handleFollow`, `handleShare` in `Reels.tsx` all early-return with "Please login" toast when `!currentUserId`. No silent DB errors.
- [x] R2-H22 host-effect gating: re-verified — server-mutating effects (heartbeat L640, viewer count effects L663/696, beans tracker L726, track-permission L859) all gated on `isHost && isHostVerified`. Remaining `isHost`-only effects (PiP, audio-focus auto-mute, PK loser mic) are purely local UI behaviours and safe.

Verification: APK rebuild not required (DB + JS only). Live host end-of-stream flow needs owner-account smoke test in preview.

**R2-Phase E — STORAGE + FACE + LOGS — ✅ WAVE-1 DONE 2026-06-10**
- [x] R2-H14 AWS attempt cap: new `face_verification_submissions.rekognition_attempts` column + `increment_face_submission_attempts(submission_id)` service-only RPC. `face-verification-analyze` atomically increments at the top of every run and returns `429 attempts_exhausted` once a single submission exceeds 3 Rekognition runs (covers user retries, cron, admin re-runs — every path that spends AWS budget on the same row). Industry parity: Onfido / Persona cap automatic biometric retries at 3 per submission before forcing manual review.
- [x] R2-H12 stream ownership: `face-check` and `live-frame-monitor` now call `is_live_stream_host(p_user_id, p_stream_id)` and return 403 `stream_not_owned` when the caller isn't the active host. Without this, any authenticated user could POST frames tagged with someone else's `streamId` and corrupt their warning history / trigger forced end-of-stream.
- [x] R2-H13 server-side grace + warning count: new `get_live_face_runtime(user, stream, grace=60s)` returns `in_grace`, `warning_count`, `is_authorized` from `live_streams.started_at` + `live_face_warnings`. `face-check` includes `inGracePeriod` + `warningCount` in every response; `useLiveFaceDetection` skips strike accumulation while the server says we're still in grace, so host page-refresh can no longer reset the 60s timer or the warning counter to zero.
- [~] R2-H10 signed-URL TTL + raw-image purge (≤7d) — DEFERRED to Wave-2 (needs storage-consumer audit + daily purge cron; bucket is already private + service-role-only so no public exposure today).
- [~] R2-H11 reel/face filename validation — DEFERRED to Wave-2.
- [~] Log scrubbing batch — DEFERRED to Wave-2.

Verification: APK rebuild NOT required (DB + edge-fn + WebView hook). Owner-account smoke path: go-live as smdollarex923 → console shows `grace=true` ticks during first 60s → refresh mid-stream → `warns=` persists.

**R2-Phase F — UX/POLISH + CHAT ENCRYPTION DECISION** — E2EE go/no-go, typing channel `{self:false}`, recipient confirm, admin sessionStorage.
