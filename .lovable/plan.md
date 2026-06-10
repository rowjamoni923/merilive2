# Full App Bug-Fix + Industry-Standard Upgrade Plan

Audit basis: parallel codebase scan + Chamet/Bigo/MICO/Olamet/ZEGOCLOUD/Tencent TRTC research (May 2026).  
Design SACRED — only business logic, billing, realtime safety, and Android compliance touched.  
Every phase: code → owner-account preview test → honest "APK rebuild needed" callout where relevant.

---

## Phase 1 — Critical (data loss / billing / security) · ~1.5 h · Lovable-only

| # | File | Bug | Fix |
|---|---|---|---|
| C1 | `src/pages/AgencyWithdrawal.tsx:2330` | Double-tap → `request_agency_withdrawal` RPC fires 2× → beans deducted twice | Add `submitRef = useRef(false)` synchronous guard at top of `handleSubmitWithdrawal`, mirror Recharge.tsx pattern |
| C2 | `src/pages/LiveStream.tsx:1450` + `:1923` | `live_streams` UPDATE handled by TWO channels → `leaveChannel()` called 2× on stream end → torn-down LiveKit throws | Remove `'live_streams'` from `subscribeToTables` call at 1452; keep only the scoped `live-stream-end-${id}` channel |
| C3 | `src/hooks/useLiveKitCall.ts:178` | Camera-failure handler invokes `nativeLiveKitController.reconnectNow()` without `deadRef` check → zombie camera lock after call ends | Add `if (deadRef.current) return;` first line of `else` branch |
| C4 | `src/hooks/usePrivateCall.ts` ring init | No 1-minute balance reserve at ring; concurrent gift can deplete balance before call starts (industry: Chamet escrows) | Add `reserve_call_balance(caller_id, host_id, estimated_minute_cost)` RPC called at `initiateCall`; release on reject/timeout, consume on accept |
| C5 | `src/pages/Recharge.tsx:274` | `open.er-api.com` silent fail in BD → all USD conversions show $0 → over/under-pay | Fall back to admin `currency_rates` table; toast on both-fail |

**APK rebuild?** No (all React/edge-fn).  
**DB migration?** C4 needs new `reserve_call_balance` + `release_call_balance` RPCs + `call_balance_reservations` table.

---

## Phase 2 — High (broken feature / leak) · ~2 h · Lovable-only

| # | File | Bug | Fix |
|---|---|---|---|
| H1 | `LiveStream.tsx:361` + `PartyRoom.tsx:204` | O(n) dedup `useEffect` runs on every message change → low-end Android jank in busy rooms | Move dedup into each `setMessages(prev => …)` updater; delete the standalone effect |
| H2 | `LiveStream.tsx:1610` | N+1 `profiles_public` SELECT per arriving chat message | `useRef<Map<userId, profile>>` cache; query only on miss |
| H3 | `LiveStream.tsx:1585` | `seenMsgIds` Set unbounded → 2h streams OOM on low-RAM Android | Cap 500 with FIFO eviction |
| H4 | `PartyRoom.tsx:367` | Heartbeat starts even when `enter_party_room` RPC fails → ghost participant rows | Gate heartbeat effect on `hasJoinedRoom` state set only after success |
| H5 | `src/components/call/ActiveCallScreen.tsx:41` | `useCallSignaling(callId)` channel stays open when `isOpen=false` but `callId` non-null → Realtime slot leak | Pass `isOpen ? callId : null` |
| H6 | `usePrivateCall.ts:1329` | Dual `.on('postgres_changes', …)` filters on same channel/table → duplicate handler fire risk | Combine via single `.or('caller_id=eq.${u},host_id=eq.${u}')` filter |
| H7 | `LiveStream.tsx:1631` | `isHost` not in `subscribeToTables` deps → stale closure can route host to viewer "stream ended" modal | Wrap `handleStreamEndCallback` in `useCallback([isHost,…])`, add to deps |

**APK rebuild?** No.

---

## Phase 3 — Medium (UX / edge cases) · ~1.5 h · Lovable-only

| # | File | Fix |
|---|---|---|
| M1 | `LiveStream.tsx:546` | `hasLeftRef` to dedup `visibilitychange` + `pagehide` leave RPC |
| M2 | `PartyRoom.tsx:963` | Fallback `VITE_SUPABASE_PUBLISHABLE_KEY \|\| VITE_SUPABASE_ANON_KEY` for beforeunload PATCH |
| M3 | `useLiveStreamLifecycle.ts:97` | Null-guard `authStorageKey` before `localStorage.getItem` |
| M4 | `useUniversalRealtime.ts:42` | `pendingUpdates.forEach(clearTimeout); pendingUpdates.clear()` in `cleanupAndReconnect` |
| M5 | `usePrivateCall.ts:417` | Reset `liveSessionStartedRef.current = false` just before arming guard |
| M6 | All Wave A-D pages | Verify `data-wave?-root` cleanup actually fires on unmount (already added in this session, smoke-check) |
| M7 | `useIncomingCall*` | Verify `ring_timeout_seconds` FCM payload override is actually read (Phase 3 audit follow-up) |
| M8 | `LiveStream.tsx` | Combo gift de-duplication uses client `setTimeout` — convert to server-side via `gift_combo_window` keyed (userId,giftId,roomId) |

**APK rebuild?** No.

---

## Phase 4 — Industry-Standard Upgrades · ~4–6 h · Mix of Lovable + APK rebuild

| # | Upgrade | Industry source | Our gap |
|---|---|---|---|
| G1 | Server-authoritative per-minute billing ticker via `bill_call_minute(call_id, minute_n)` UNIQUE-keyed RPC, server cron poll | Chamet/Bigo standard | Currently client-driven `setInterval` — partially server-validated, but the timer source lives on client |
| G2 | PK score 100% server-authoritative: `pk_battles.score` mutation locked to `score_pk_gift` SECURITY DEFINER RPC; revoke direct UPDATE | Bigo PK blog | Already partial; need RLS audit + revoke |
| G3 | Gift idempotency UUID key (client-generated), 30s server TTL dedup | Tencent IM pattern | Missing — retries can double-charge |
| G4 | Anti-self-gift detection: flag `device_id` + IP match sender↔recipient | All major platforms ToS | None — open fraud surface |
| G5 | Chargeback hold: 7-day lock on host earnings from new (< 30d) senders | Disguise.live fraud guide | None — instant withdrawal possible |
| G6 | WiFi↔4G ICE restart: listen `navigator.connection.type` change → force `room.engine.restartIce()` | LiveKit best practice | Currently relies on browser auto-restart only |
| G7 | Server-side combo window (Redis-style TTL) survives app background | Tencent gift system | Client `setTimeout` only — combo breaks on background |
| G8 | Android 14+ `CallStyle` notification + `foregroundServiceType="phoneCall"`; stop relying on `USE_FULL_SCREEN_INTENT` | Android source + Stream.io docs | **APK rebuild required** |
| G9 | LiveKit token TTL ≥5 min from ring init (currently shorter, may expire during ring) | Stream.io / callkeep issues | Edge function `generate_call_token` change |
| G10 | Verify Pkg438 native gift texture pool cap (3 concurrent + recycle) respected from React dispatcher | YYEVA/Lottie best practice | Pkg438 done, React side not audited |

**APK rebuild?** G8 yes; G10 verify only; rest Lovable-only.

---

## Out of scope (locked by memory rules)

- Gift/entry animation visual files — design sacred  
- VPS/docker/SFU infra — deferred  
- Color tokens, layouts, copy — web design sacred  
- Bangla UI strings — English-only mandatory  

---

## Execution order (recommended)

1. **Phase 1** (Critical 5) — billing/data-loss stop first. ~1.5 h.  
2. **Owner-account smoke test** (smdollarex923@gmail.com): recharge tab, agency withdrawal, live stream join/leave, private call ring/accept.  
3. **Phase 2** (High 7) — leak/race elimination. ~2 h.  
4. **Phase 3** (Medium 8). ~1.5 h.  
5. **Phase 4** (Industry G1-G10) — needs your sign-off per item; G4-G5 (anti-fraud) may affect existing users, want explicit "go".  

Total estimated: **9–12 h of focused work**, plus 1 APK rebuild at the end for G8.

---

## What I need from you

- ✅ **"go"** = start Phase 1 immediately, run through to Phase 3 with owner-account verification at each step.  
- ⚠️ **Phase 4 G4 (anti-self-gift) + G5 (chargeback hold)** = may impact existing host earnings retroactively — want explicit yes/no per item before coding.  
- 📱 **G8 (Android CallStyle)** = will need APK rebuild on your end; want confirmation that's OK.

After your green light, প্রতিটা phase শেষে concrete result + owner-account screenshot/log দিব, কোনো নাটক ছাড়া।