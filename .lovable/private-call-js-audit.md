# Private Call JS/React Audit Report

**Scope:** `usePrivateCall.ts` (1433 L) · `useLiveKitCall.ts` (1001 L) · `useNativeCallBillingSync.ts` (266 L) · `CallProvider.tsx` (517 L) · `IncomingCallModal.tsx` (221 L) · `CallRatingModal.tsx` (442 L) · `GlobalCallGiftSheet.tsx` · `livekitCallSignaling.ts` (287 L) · `features/call/index.ts` · `NativeCall.ts` (199 L)

---

## Area 1 — State Machine Correctness

### F-01 · BUG · `usePrivateCall.ts:820` · `billingStartedRef` set optimistically before RPC succeeds
- **Problem:** `acceptCall` sets `billingStartedRef.current = true` (line 820) before `accept_private_call` RPC resolves. This flag also gates the caller-side `callTimeoutRef` (line 699: `!billingStartedRef.current`). If the RPC fails or the call was already timed out, `billingStartedRef` stays `true` on the host, suppressing future timeouts, and the error-path `resetCallState()` doesn't call `clearAllTimers()` atomically with the flag reset.
- **Repro:** Accept a call whose row was simultaneously timed out by the server; `acceptRes.data` returns false/error → exception path runs `resetCallState()`, but `billingStartedRef` is already true for a fraction of a second before the reset.
- **Severity: P1**

### F-02 · BUG · `usePrivateCall.ts:1012` · `callStateRef` used at line 111, declared at line 1012 (temporal ordering)
- **Problem:** `showVerifiedIncomingCall` (declared line 86) references `callStateRef.current` at line 111. `callStateRef` is declared with `const` at line 1012. While JS closures capture the variable binding (not TDZ error at call-time since callbacks fire after full render), this is a severe maintenance hazard: any re-ordering, early call from a `useEffect` run, or future refactor could produce a `ReferenceError`.
- **Repro:** Move `callStateRef` declaration below line 1012 or call `showVerifiedIncomingCall` in a synchronous context.
- **Severity: P1**

### F-03 · RACE · `usePrivateCall.ts:1067` · `endCall` fires 3-second `callEndedRef` cooldown but `CallProvider.tsx:396` resets it immediately
- **Problem:** `endCall` schedules `setTimeout(() => { callEndedRef.current = false; }, 3000)` (line 1088) with a comment "DEAD FOREVER: 3-second cooldown." But `CallProvider.handleEndCall` calls `await endCall()` and then immediately sets `callEndedRef.current = false` (line 396). The comment on that line says the cooldown was removed, yet the `endCall` body still schedules the 3s reset. These two independent `callEndedRef` instances (one in `usePrivateCall`, one in `CallProvider`) create a documentation / logic inconsistency where one side believes the cooldown is active and the other does not.
- **Repro:** End a call from `CallProvider`; a new call can arrive immediately (CallProvider ref cleared), but the `endCall` timeout is still queued and resets `usePrivateCall`'s own `callEndedRef` 3 seconds later — causing a silent state divergence window.
- **Severity: P2**

### F-04 · MISSING · `usePrivateCall.ts` · No canonical end-reason enum; string literals scattered
- **Problem:** End reasons are bare string literals: `'normal'`, `'declined'`, `'timeout'`, `'connect_failed'`, `'insufficient_coins'`, `'insufficient_balance'` (server), `'network'` (never written by JS). `CallEndedInfo` interface in `CallProvider.tsx:70` only declares `'normal' | 'declined' | 'missed' | 'insufficient_coins'` — mismatch with DB strings. `'connect_failed'` and `'network'` are never in the interface. Downstream `CallEndedModal` silently receives wrong `endReason` on failed-accept or network-end paths.
- **Repro:** Accept a call that fails LiveKit connect → `end_private_call` is called with `'connect_failed'`; `CallEndedModal` receives `endReason: 'normal'` (CallProvider hardcodes `'normal'` at line 192).
- **Severity: P1**

---

## Area 2 — Ring/Accept Races

### F-05 · RACE · `usePrivateCall.ts:86` / `usePrivateCall.ts:1152` · Two callers of `showVerifiedIncomingCall` can run concurrently with the same `callId`
- **Problem:** The function does two sequential awaits (DB fetch at line 90, profile fetch at line 117) with guards between them. But if the Realtime listener (line 1217) and the mount check (line 1171) both call `showVerifiedIncomingCall` for the same `callId` concurrently (within <5ms), neither sees `incomingCallIdRef.current === callId` until the first completes. Both fetch profiles, both call `setIncomingCall` → no visible bug but extra DB reads and duplicate toast at line 1341.
- **Repro:** Cold start with a pending call already in DB → mount check fires; Realtime `INSERT` also fires within ms → two concurrent executions.
- **Severity: P2**

### F-06 · RACE · `usePrivateCall.ts:697` / `usePrivateCall.ts:809` · Timeout RPC races host Accept
- **Problem:** `callTimeoutRef` (caller side) fires `timeout_private_call` RPC after `timeoutSeconds`. If the host taps Accept on native cold-start (buffered action) at the exact same moment, `accept_private_call` RPC races `timeout_private_call`. Server wins one; the loser throws. Host side receives `acceptRes.data !== true` → throws → `end_private_call` called with `'connect_failed'`. Caller sees no specific "accept too late" differentiation — just gets a silent end via Realtime. No user feedback to host.
- **Repro:** Host opens app exactly at second 60 of ringing and taps Accept.
- **Severity: P1**

### F-07 · MISSING · `usePrivateCall.ts` · No explicit handling of `accept_after_timeout` state for host
- **Problem:** When `acceptCall` throws (catch at line 948), `resetCallState()` is called with no error differentiation. The host sees a generic "Call Failed" toast. There is no distinct UI path for "caller already hung up / timed out." Industry practice is to show "Caller already left" vs. generic error.
- **Repro:** Timeout fires on caller side, then host (with stale native buffered action) taps Accept.
- **Severity: P2**

---

## Area 3 — Billing

### F-08 · MISSING · `usePrivateCall.ts` · No low-balance pre-warning (~30 s before zero)
- **Problem:** There is no client-side warning when `callerRemainingCoins < coinsPerMinute` (i.e., less than 1 minute of balance remaining). The server cron ends the call abruptly with `insufficient_balance`. Chamet/Bigo both surface a "Low balance — recharge now" banner at ~30 s left. The native `PrivateCallActivity` has a 1Hz local countdown (via `useNativeCallBillingSync`) but it fires the recharge CTA only *after* the call ends. There is no proactive JS-side warning in the web call screen either.
- **Repro:** Start a call with 1 minute of coins; watch it end without any advance warning.
- **Severity: P0**

### F-09 · BUG · `CallRatingModal.tsx:66` · Gift earnings query uses `Date.now()` instead of call `ended_at`
- **Problem:** `new Date(Date.now() - duration * 1000).toISOString()` computes the start of the call window relative to *query time*. If the rating modal opens 30 seconds after the call ends, the window shifts 30 s forward, potentially missing gifts at the beginning of the call and/or including gifts from the next session.
- **Repro:** Wait 60s after call ends, then open the earnings modal → gift tally is wrong.
- **Severity: P1**

### F-10 · BUG · `usePrivateCall.ts:307,913` · `billingFetchIntervalRef` started but `currentCallIdRef` check inside may not cancel on fast call end
- **Problem:** Both `activateCallerConnectedState` (line 307) and `acceptCall` (line 913) start a `billingFetchIntervalRef` that guards with `callEndedRef.current || currentCallIdRef.current !== callId`. `resetCallState` sets `currentCallIdRef.current = null` and `callEndedRef.current = true` before calling `clearAllTimers`. If the interval tick fires between these two assignments (not possible in JS single-thread) — but more practically: `clearAllTimers` is called first in `resetCallState` (line 192), so this is safe. However, the `acceptCall` path creates `billingFetchIntervalRef` AFTER the parallel `Promise.all` resolves (line 913), so if the call ends during the `await Promise.all` (line 856), `clearAllTimers` already ran, and then line 913 creates a new orphaned interval that will run forever (its `callEndedRef.current` check will eventually stop it on the next tick, but the interval is not stored in `billingFetchIntervalRef` because a second call to `setInterval` overwrites the ref without clearing the previous). Actually `billingFetchIntervalRef.current` would have been set to `null` by `clearAllTimers` prior, so the new interval is stored and will self-cancel on the next tick — 10 s later. Low risk but messy.
- **Repro:** Host accepts, call ends remotely within 1s of accept, then 10s later a billing fetch fires against a dead call.
- **Severity: P2**

### F-11 · MISSING · Billing pause during LiveKit Reconnecting is absent
- **Problem:** `durationTimerRef` (1s tick, line 412) continues counting during LiveKit reconnect. Server-side `bill_call_minute` cron also continues charging. There is no mechanism to pause the timer or send a "billing-pause" signal to the server during the reconnect window. Caller pays for dead-air time.
- **Repro:** Force network outage mid-call for 45 s while LiveKit reconnects → caller is charged for that 45 s.
- **Severity: P1**

---

## Area 4 — Network Resilience

### F-12 · MISSING · `useLiveKitCall.ts` · No 15-second reconnect-budget timeout to force-end with reason `network`
- **Problem:** When native LiveKit emits `reconnecting` or `degraded`/`reconnect-failed` (lines 141–147), the code calls `nativeLiveKitController.reconnectNow()` and shows a toast but starts no failsafe deadline. If reconnect never succeeds, the call UI stays frozen at "Restoring call…" indefinitely. Industry standard (WhatsApp, Zoom) force-ends after 15–30 s and writes reason `'network'` to the call record. The DB row stays `'connected'` and billing continues until the server cron detects an idle call.
- **Repro:** Cut network for 60 s mid-call — both sides see "Restoring call…" toast but the call never self-terminates.
- **Severity: P0**

### F-13 · MISSING · `useLiveKitCall.ts:624` · Web LiveKit path never handles `ConnectionState.Reconnecting`
- **Problem:** `RoomEvent.ConnectionStateChanged` handler (lines 624–629) only acts on `ConnectionState.Connected`. `ConnectionState.Reconnecting` and `ConnectionState.Disconnected` produce no state update on the web path. Users on the web fallback see no reconnecting overlay and `isConnected` stays `true` during the entire reconnect window, so the call UI shows all controls active (end, mute, etc.) against a dead transport.
- **Repro:** Use web LiveKit path (non-Android), drop WiFi briefly → `connectionState` stays `'connected'` in state.
- **Severity: P1**

### F-14 · MISSING · `useLiveKitCall.ts` · No UI overlay during reconnect
- **Problem:** There is no blocking overlay or disabled-controls state surfaced during `connectionState === 'connecting'` / `'disconnected'`. The call screen renders as fully interactive. Tapping End during reconnect triggers `endCall` which fires the RPC; if the LK room reconnects 1 s later, the peer receives a `call_ended` DataPacket for a call the local user never intentionally ended.
- **Repro:** Reconnect scenario → user taps End during "Restoring…" toast → peer call ends unexpectedly.
- **Severity: P1**

---

## Area 5 — End-Reason Taxonomy

### F-15 · MISSING · Complete end-reason taxonomy across all files

| Reason string | Written by | In `CallEndedInfo` interface | Notes |
|---|---|---|---|
| `'normal'` | `endCall` default | ✅ | OK |
| `'declined'` | `declineCall` | ✅ | OK |
| `'missed'` | implied by `timeout_private_call` RPC | ✅ | JS uses `timeout` not `missed` for caller-side |
| `'insufficient_coins'` | server cron only | ✅ | Client detects via Realtime `end_reason` field |
| `'insufficient_balance'` | server cron (alternate form) | ❌ | Checked at line 1260 but not in interface |
| `'connect_failed'` | `acceptCall` error path | ❌ | Never surfaces in `CallEndedModal` |
| `'network'` | **NEVER** written by JS | ❌ | Mentioned in audit focus but unimplemented |
| `'timeout'` | `declineCall(reason='timeout')` → `timeout_private_call` RPC | ❌ | Not in interface |

**There is no canonical enum.** Raw strings are written in at least 5 files with inconsistent casing (`'insufficient_coins'` vs. `'insufficient_balance'`). `CallProvider.tsx:192` hardcodes `endReason: 'normal'` for **all** remote-end scenarios regardless of actual reason.

- **Severity: P1**

---

## Area 6 — Rating Modal

### F-16 · BUG · `CallProvider.tsx:192` · `endReason` hardcoded to `'normal'` for every remote end
- **Problem:** `captureEndedInfo` always sets `endReason: 'normal'` (line 192). The actual call end reason (declined, missed, insufficient_coins, network) is never propagated to `CallEndedModal` / `CallRatingModal`. If `CallRatingModal` or `CallEndedModal` gates on `endReason` to suppress rating for non-normal ends, the gate is broken.
- **Repro:** Host declines call → caller sees "normal" end reason, rating modal shown when it shouldn't be.
- **Severity: P1**

### F-17 · MISSING · `CallRatingModal.tsx` · No minimum call-duration threshold before showing rating
- **Problem:** `CallRatingModal` is rendered unconditionally when `isOpen=true`. There is no client-side guard for calls shorter than a minimum threshold (e.g., 10 s). A caller who accidentally ended a 2-second call sees the full rating screen.
- **Repro:** Start and immediately end a call → rating modal shown.
- **Severity: P2**

### F-18 · MISSING · `CallRatingModal.tsx` · No one-time-per-call enforcement at client level
- **Problem:** `handleSubmit` calls `submit_private_call_rating` RPC directly. There is no client-side `hasSubmittedRef` or `isAlreadyRated` state to prevent double-submit if the user taps Submit twice quickly (the `isSubmitting` guard covers slow double-tap, but a fast double-tap during the async RPC resolve can fire two calls).
- **Repro:** Double-tap Submit very quickly → two RPC calls in flight.
- **Severity: P2**

### F-19 · MISSING · `CallRatingModal.tsx` / `CallProvider.tsx` · Rating not suppressed for declined/timeout/network ends
- **Problem:** `CallProvider` always sets `endReason: 'normal'` (F-16). Even if this were fixed, `CallRatingModal` has no conditional logic to skip the rating step for `declined`, `missed`, `insufficient_coins`, or `network` ends. Industry practice only shows rating for calls with `status=ended` and `duration >= threshold`.
- **Repro:** Caller is declined → `endReason='declined'` (if F-16 fixed) but rating modal still shows.
- **Severity: P2**

---

## Area 7 — Realtime Subscription Hygiene

### F-20 · RACE · `usePrivateCall.ts:1277` · Single channel subscribes two `postgres_changes` filters on the same channel name
- **Problem:** `private-call-${userId}` channel registers two `.on('postgres_changes', ...)` listeners — one for `caller_id=eq.${userId}` and one for `host_id=eq.${userId}`. This means a row where the user is both caller AND host (self-call, rejected server-side but theoretically possible in edge cases) fires `handleRow` twice. More importantly, a reconnect of this channel (Supabase Realtime reconnect) re-fires the subscription setup, and there is no deduplication on `handleRow` for the same event `id`.
- **Repro:** Trigger Realtime reconnect mid-call → both filters re-deliver the same `UPDATE` event → `activateCallerConnectedState` or `softEndCall` triggered twice.
- **Severity: P2**

### F-21 · MISSING · `useNativeCallBillingSync.ts:244` · `native-call-billing-row-${callId}` duplicates `private_calls` subscription already in `usePrivateCall`
- **Problem:** `usePrivateCall` subscribes to `private_calls` for `caller_id=eq.${userId}`. `useNativeCallBillingSync` subscribes **again** to `private_calls` for `id=eq.${callId}` (line 244) on the same Supabase client. Each billing tick from the server cron fires both callbacks. The double subscription has no functional bug currently, but adds ~2 extra Realtime messages per billing minute and can cause ordering issues if one delivery is delayed.
- **Repro:** Connect on Android mid-call; observe two `private_calls` UPDATE events per billing tick in Supabase logs.
- **Severity: P2**

### F-22 · BUG · `GlobalCallGiftSheet.tsx:50-59` · Auth subscription created inside component, never checked for stale session
- **Problem:** `GlobalCallGiftSheet` calls `supabase.auth.getUser()` (network round-trip) on every mount and creates an `onAuthStateChange` subscription. `CallProvider` already manages `userId` and passes it down (or could). This creates a redundant auth subscription that fires `setSenderId` on every auth state change, potentially including mid-call token refreshes triggering an extra re-render of the gift sheet.
- **Repro:** Token refresh occurs mid-call → `GlobalCallGiftSheet` re-renders due to `setSenderId`.
- **Severity: P2**

---

## Area 8 — Memory Leaks

### F-23 · LEAK · `useLiveKitCall.ts:974-978` · `syncRemoteParticipants` setTimeout calls not stored or cleared on cleanup
- **Problem:** Lines 975–978 schedule `syncRemoteParticipants` at 30ms, 80ms, 200ms, and 500ms with bare `setTimeout`. These are NOT stored in refs. `cleanup()` cannot cancel them. If the component unmounts or the call ends in < 30ms after `init()` completes (e.g., rapid end), all four callbacks fire against a disconnected `room` (closure-captured, not `roomRef.current`). `syncRemoteParticipants` calls `pub.setSubscribed(true)` and `attachLiveKitRemoteAudioOnce` on a dead room, which can cause silent errors or audio element leaks.
- **Repro:** Connect to call, immediately call `cleanup()` within 25ms of room connection (e.g., user taps End during media negotiation) → four orphaned callbacks fire.
- **Severity: P1**

### F-24 · LEAK · `useLiveKitCall.ts:797-809` · `MediaStreamTrack` `'ended'` / `'mute'` listeners added but never removed
- **Problem:** `attachCallOnEnded(mt)` adds `addEventListener('ended', ...)` and `addEventListener('mute', ...)` to each `MediaStreamTrack`. These are never removed in `cleanup()`. Tracks are new objects after camera recovery, so `callAttachedTracks` WeakSet prevents double-attach on the same object. However, the per-track listener closures capture `callRecovering`, `deadRef`, and `roomRef` — if the track outlives the component (some browsers hold track references in MediaDevices), the closure is retained. Low risk but present.
- **Repro:** Call camera recovery multiple times → old track listeners accumulate.
- **Severity: P2**

### F-25 · LEAK · `usePrivateCall.ts:412` · `durationTimerRef` not cleared if `notifyMediaConnected` is called on an already-started session (guard at line 404 prevents double-start, but…)
- **Problem:** `liveSessionStartedRef.current = true` guard at line 404 prevents double-start of `durationTimerRef`. However, `notifyMediaConnected` is recreated every render because `callState.status` and `callState.callId` are in its `useCallback` deps (line 426). If `ActiveCallScreen` calls `onMediaConnected` (prop) inside a `useEffect` with the prop as a dep, the effect re-runs every second (as `callState.duration` ticks), re-calling `notifyMediaConnected`. The `liveSessionStartedRef` guard prevents the inner timer from starting twice, but the function is called once per second with no memoization.
- **Repro:** Check React DevTools profiler — `notifyMediaConnected` fires on every duration tick.
- **Severity: P2**

### F-26 · LEAK · `useLiveKitCall.ts:816` · `callVideoRecoveryTimerRef` interval (4 s) not paused during native reconnect
- **Problem:** `callVideoRecoveryTimerRef` checks `usingNativeRef.current` and skips if native, but during a native reconnect `usingNativeRef.current` is set to `false` (line 117) before reconnect completes. So the recovery interval starts polling `roomRef.current` (null, because web room was never initialized) every 4 s during native reconnect. `roomRef.current` is null → no-op, but wasted interval ticks.
- **Repro:** Native reconnect triggered → `usingNativeRef.current = false` → interval starts checking null roomRef.
- **Severity: P2**

---

## Top 10 P0/P1 Issues to Fix First

1. **[P0] F-12 — No 15-second reconnect-budget timeout** (`useLiveKitCall.ts`): Add a 15 s `setTimeout` on `Reconnecting` that calls `endCall('network')` if still disconnected. This is the single biggest silent-failure hole — calls can hang forever with continuous billing.

2. **[P0] F-08 — No low-balance pre-warning (~30 s)** (`usePrivateCall.ts`): When `callerRemainingCoins` drops below `coinsPerMinute * 0.5` (approx 30 s), surface a persistent in-call banner. The call ends abruptly today with no user warning.

3. **[P1] F-04 / F-15 — No canonical end-reason enum; `CallProvider` hardcodes `endReason: 'normal'`** (`CallProvider.tsx:192`): Create a typed enum, use it everywhere, and pass the actual `end_reason` from the DB row into `CallEndedInfo`.

4. **[P1] F-13 — Web LiveKit `Reconnecting` state is invisible** (`useLiveKitCall.ts:624`): Handle `ConnectionState.Reconnecting` in the `ConnectionStateChanged` handler; set `isConnected: false` and `connectionState: 'connecting'`.

5. **[P1] F-14 — No UI overlay / disabled controls during reconnect** (`ActiveCallScreen` / `useLiveKitCall.ts`): Gate all interactive controls and show a blocking "Reconnecting…" overlay while `connectionState !== 'connected'`.

6. **[P1] F-11 — Billing continues during LiveKit Reconnecting** (`usePrivateCall.ts:412`): Pause `durationTimerRef` when `connectionState` is not `'connected'`; resume on reconnect. Coordinate with server-side cron via an RPC call to pause billing.

7. **[P1] F-01 — `billingStartedRef` set optimistically before `accept_private_call` RPC** (`usePrivateCall.ts:820`): Move `billingStartedRef.current = true` to AFTER the RPC succeeds (inside the `try` block after line 862 confirms `acceptRes.data === true`).

8. **[P1] F-23 — Orphaned `syncRemoteParticipants` setTimeout callbacks not cleared on cleanup** (`useLiveKitCall.ts:975-978`): Store the four timeout handles in a ref array; cancel all in `cleanup()`.

9. **[P1] F-06 — Timeout-vs-Accept race has no host feedback** (`usePrivateCall.ts:697,809`): Distinguish `acceptRes.data !== true` (call expired/timed out) from other accept errors; show "Caller already left" toast to host instead of generic "Call Failed."

10. **[P1] F-09 — Gift earnings query uses `Date.now()` instead of call `ended_at`** (`CallRatingModal.tsx:66`): Replace `new Date(Date.now() - duration * 1000)` with the call row's `started_at` timestamp fetched from DB (already fetched for `host_earned` on line 56).

---

*Report generated by JS/React audit pass — all findings are read-only analysis, no code changes applied.*
