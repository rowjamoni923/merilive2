# Private Call — 100% Honest End-to-End Plan

বন্ধু হিসেবে সত্যি কথা: Private Call surface অনেক বড় (50+ files: React hooks, Android `PrivateCallActivity` + `IncomingCallActivity` + Telecom + FCM + LiveKitPlugin + NativeCallPlugin, edge functions, DB tables, billing, rating)। আগে যা হয়েছে:

- **Phase 3 audit (2026-06-06)** — 5টা bug fix: accept-catch wrong callId, hardcoded 30s ring timeout, render-time ref mutation, duplicate Realtime sub, IncomingCallActivity dismissed race.
- **N3 series (today)** — Native LiveKit bridge (RPC, text streams, token rotation, participant rename) complete; APK rebuild + device test বাকি।

কিন্তু "100% নিখুঁত private call" claim করতে হলে আরও audit লাগবে। এই plan-টা সেই honest gap-closing।

## Scope (only Private Call, not live/party)

1-on-1 audio/video call lifecycle: invite → ring → accept/decline/timeout → connect → bill → end → rating।

## Step 1 — Research-first (mandatory per project rule)

Spawn 1 research subagent comparing Chamet/Bigo/Olamet/Crush Live private-call flows (Agora→LiveKit translation):
- Ring timeout, retry, "called too soon" cooldown
- Accept handshake (who joins room first, ICE warm-up)
- Billing tick (per-second vs per-minute, grace seconds, low-balance kick)
- Rating prompt timing, skip rules
- End reasons taxonomy (busy/declined/timeout/network/balance/normal)
- Push (FCM data-only) + foreground-service + Telecom integration on Android 14+

Output: `.lovable/private-call-research.md` with numbers + citations.

## Step 2 — Current state full audit

Read in parallel and produce gap table:

- `src/hooks/usePrivateCall.ts`, `useLiveKitCall.ts`, `useNativeCallBillingSync.ts`
- `src/components/call/CallProvider.tsx`, `IncomingCallModal.tsx`, `CallRatingModal.tsx`, `GlobalCallGiftSheet.tsx`
- `src/lib/livekitCallSignaling.ts`
- `src/features/call/index.ts`
- Android: `PrivateCallActivity.kt`, `PrivateCallViewModel.kt`, `IncomingCallActivity.java`, `NativeCallPlugin.kt`, `MeriConnectionService.kt`, `TelecomBridge.kt`, `MeriFirebaseMessagingService.java`, `CallActionReceiver.java`
- Edge fns: `private-call-*`, `call-billing-*`, FCM dispatchers
- DB: `private_calls`, `call_billing_ticks`, `call_ratings`, FCM config tables

Each finding tagged: **BUG / RACE / MISSING / WEAK** + severity + repro.

## Step 3 — Fix categories (locked order)

1. **Lifecycle correctness** — state machine: `ringing → accepted → connected → ended` with single writer (caller-side edge fn), idempotent transitions, no client-driven `ended`.
2. **Ring/accept race fixes** — verify Phase 3 fixes still hold + add: double-accept guard, callee-offline detection, caller-cancel-during-accept.
3. **Billing accuracy** — server-tick reconciliation, low-balance pre-warning 30s, hard-kick at 0, no double-bill on reconnect, transparent ledger entry per call.
4. **Network resilience** — LiveKit reconnect within 15s = continue; >15s = end with reason `network`; UI freeze-with-overlay during reconnect.
5. **End-reason taxonomy** — single enum used by Android + JS + edge fn + DB. Audit current strings, normalize.
6. **Rating modal** — show only when call duration ≥ configurable threshold (default 30s) and ended normally; one-time per call; skip on declined/timeout.
7. **Android Telecom + FCM** — full-screen intent shown on locked screen, ConnectionService binding, audio-route handover, proper unbind on end. Verify against Android 14/15 BAL restrictions.

## Step 4 — Verification (Lovable-only)

- Vitest: extend `callAndGiftFlowsE2E` + `nativeCallColdStart` to cover each fix.
- Owner-account preview test (smdollarex923@gmail.com) for any JS-only change.
- Honesty marker: every Android-side fix labeled "needs APK rebuild" — no false "verified" claims.

## Step 5 — Delivery

- Update `.lovable/plan.md` with all changes + APK-test checklist.
- Save `mem://features/private-call-100pct-audit.md` with final gap-closure summary.

## Why I'm asking before coding

Surface is too large to "just fix everything" in one shot without breaking design / billing. Per project rule (research-first mandatory + design sacred), I need your ✅ on:

- **A.** Run full Step 1+2 audit first (produces gap table, no code change yet) — recommended।
- **B.** Skip research, trust Phase 3 + N3 already covered most of it, only fix anything you can name right now.
- **C.** Different scope (e.g. only billing, only Android, only rating)।

বল কোনটা — তারপর আমি honest গতিতে এগোব।
