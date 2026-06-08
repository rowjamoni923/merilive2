---
name: Private call honest audit + P0 fix pass
description: 2026-06-08 full 3-arm audit (JS / Android / Backend subagents) + 5 P0 fixes — Android compile error in attachResilienceController, user-hangup not dispatching to NativeCallPlugin (settle never ran), call-billing-tick edge fn anonymous-trigger hole, private_calls UPDATE policy missing WITH CHECK + column-guard trigger, JS 15s reconnect-budget timeout + Reconnecting state surfacing. Vitest 55/55 pass. Open P0: Android FCM avatar synchronous fetch. Open P1: low-balance UI banner, end-reason canonical enum, FOR UPDATE on accept/end, end_reason CHECK constraint, audio routing API 31+. Audit reports at .lovable/private-call-{js,android,backend}-audit.md, fix log at .lovable/private-call-p0-fix-pass.md.
type: feature
---

# Private Call honest audit + P0 fix pass — 2026-06-08

## What was done

Spawned 4 subagents in parallel (research, JS audit, Android audit, Backend audit) per research-first mandatory rule. Then fixed all 5 P0 issues that were surfaced before research subagent completed.

## P0 fixes

1. **Android L-1** — `PrivateCallActivity.attachResilienceController()` missing closing `}` — APK could not compile. Added `}`.
2. **Android L-2** — `onUserRequestedEnd()` no longer just marked the VM ended; now also calls `NativeCallPlugin.dispatch(action="end")` so JS runs `settle_private_call` + `LiveKitPlugin.disconnect`. Without this, Room stayed connected and billing never settled after activity finished.
3. **Backend BE-P0-1** — `call-billing-tick` edge fn (verify_jwt=false for pg_cron) now rejects anonymous POSTs. Accepts either `Authorization: Bearer <service_role_key>` (which pg_cron already sends) or `x-cron-secret` matching `CRON_SECRET` env. Constant-time compare.
4. **Backend BE-P0-2** — `private_calls` UPDATE policy only had USING, no WITH CHECK; any participant could rewrite status / coins_spent / end_reason / rates etc. directly. Replaced policy + added BEFORE UPDATE trigger `private_calls_guard_server_columns` that blocks client writes to all lifecycle / billing / timestamp columns. service_role, supabase_admin, postgres bypass.
5. **JS F-12 + F-13** — `useLiveKitCall.ts` ConnectionStateChanged handler now sets `connectionState='connecting'` on Reconnecting and arms a 15s budget timer. On exhaustion fires window event `livekit-call-network-lost`. `usePrivateCall.ts` listens and calls `endCall('network')`. Cleanup function clears the timer.

## Files

- `android/app/src/main/java/com/merilive/app/activity/PrivateCallActivity.kt`
- `src/hooks/useLiveKitCall.ts`
- `src/hooks/usePrivateCall.ts`
- `supabase/functions/call-billing-tick/index.ts`
- DB migration 20260608160930 — `private_calls_guard_server_columns` trigger + new UPDATE policy

## Verification

- `bunx vitest run callAndGiftFlowsE2E nativeCallColdStart mediaSurfacesAudit` — 55/55 pass
- Android L-1 / L-2 — visual diff only; APK rebuild required before they are live

## Open work (next session order)

P0: Android F-1 (FCM avatar synchronous fetch).
P1 batch: JS F-08 low-balance UI banner, JS F-15/F-04 end-reason canonical enum, JS F-11/F-14 billing pause + UI overlay during reconnect, JS F-01 billingStartedRef before-RPC, BE-P1-2 FOR UPDATE on accept/end RPCs, BE-P1-3 end_reason CHECK constraint + normalize spellings, BE-P1-5 call_events INSERT policy, Android L-3..L-10 audio routing + full-screen-intent + foreground-service ghost notification.

## Audit reports (read-only)

- `.lovable/private-call-js-audit.md` (26 findings)
- `.lovable/private-call-android-audit.md` (16 findings)
- `.lovable/private-call-backend-audit.md` (10 findings)
- `.lovable/private-call-p0-fix-pass.md` (this fix log)
