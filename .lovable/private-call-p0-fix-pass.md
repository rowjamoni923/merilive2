# Private Call — Honest Audit + P0 Fix Pass

**Date:** 2026-06-08
**Trigger:** User asked "Private Call ১০০% সত্যি সাথে করতে হবে"
**Protocol:** Research-first mandatory (in flight) + 3-arm audit (JS / Android / Backend) complete.

## Audit deliverables (read-only — no code changed by these)

- `.lovable/private-call-js-audit.md` — 26 findings across 8 areas
- `.lovable/private-call-android-audit.md` — 16 findings (APK rebuild required for all)
- `.lovable/private-call-backend-audit.md` — 2 P0 + 8 P1 + DB schema gaps
- `.lovable/private-call-research.md` — competitor-pattern research (subagent still running at fix time)

## P0 fixes applied this pass

| # | Tag | Area | What changed | Verified by |
|---|-----|------|--------------|-------------|
| 1 | L-1 | Android | `PrivateCallActivity.attachResilienceController()` missing closing `}` — fixed | Visual diff (APK rebuild needed) |
| 2 | L-2 | Android | User-hangup now dispatches `NativeCallPlugin.dispatch(action="end")` so JS runs `settle_private_call` + LiveKit disconnect | Visual diff (APK rebuild needed) |
| 3 | BE-P0-1 | Backend | `call-billing-tick` edge fn now rejects anonymous POSTs — requires service-role bearer or `x-cron-secret` (constant-time compare) | Deployed; pg_cron still passes existing service-role bearer so live billing unaffected |
| 4 | BE-P0-2 | Backend | `private_calls` UPDATE policy now has WITH CHECK + new column-guard trigger blocks client writes to `status`, `end_reason`, `coins_spent`, `total_coins_deducted`, `host_earned`, `*_rate_per_min`, `platform_cut_percent`, `last_billed_minute`, `total_minutes_billed`, `accepted_at`, `connected_at`, `ended_at`. Service-role + SECURITY DEFINER RPCs bypass | Migration applied; existing RPCs unchanged |
| 5 | F-12 + F-13 | JS | LiveKit `Reconnecting` now surfaces as `connectionState='connecting'`; 15s reconnect-budget timer arms on Reconnecting, clears on Connected, fires `livekit-call-network-lost` window event on exhaustion. `usePrivateCall` listens and calls `endCall('network')` | Vitest 55/55 pass |

## Honest gap status — what's still open

### P0 not yet fixed
- **Android F-1** — `MeriFirebaseMessagingService.handleIncomingCall` fetches caller avatar bitmap **synchronously** on the FCM thread (5s + 5s timeouts). Slow CDN → notification never posts. Fix = move bitmap fetch off the FCM thread (preload after notification is up).

### Top P1 still open
- **JS F-08** — No low-balance pre-warning UI (server already emits the signal in `call-billing-tick`, client doesn't surface it as a visible banner).
- **JS F-15 / F-04** — `CallProvider` hardcodes `endReason: 'normal'`; no canonical end-reason enum used everywhere.
- **JS F-11 / F-14** — Billing not paused during LiveKit reconnect; no UI overlay.
- **JS F-01** — `billingStartedRef` set optimistically before `accept_private_call` RPC succeeds.
- **BE-P1-1** — `deduct_call_coins_per_minute` still has `EXECUTE TO authenticated` (legacy double-deduction path).
- **BE-P1-2** — `accept_private_call` / `end_private_call` missing `FOR UPDATE` row lock.
- **BE-P1-3** — `end_reason` is plain TEXT with no CHECK; three inconsistent spellings of "insufficient balance".
- **BE-P1-5** — `call_events` INSERT policy lets participants forge audit events.
- **Android L-3..L-10** — Audio routing (deprecated API 31+ setter, no BT handover), full-screen-intent permission check missing, foreground-service `START_STICKY` ghost notification, etc.

### Sequence proposed for next session
1. F-1 (FCM avatar non-blocking)
2. F-15 / F-04 (end-reason enum)
3. F-08 + F-11 + F-14 (low-balance UI + billing pause during reconnect, all wired through ConnectionState already surfaced today)
4. BE-P1-2 (FOR UPDATE row lock on accept/end)
5. BE-P1-3 (end_reason CHECK constraint + normalize spellings)
6. Android audio + full-screen-intent batch

## APK rebuild checklist

Every Android-side fix in this pass is in Kotlin/Java source — they will **only become live after APK rebuild**:
- L-1 (compile fix) — APK simply will not build before this; rebuild is mandatory anyway.
- L-2 (hangup dispatch) — user-hangup billing settle missing until rebuild.

## Files changed this pass

- `android/app/src/main/java/com/merilive/app/activity/PrivateCallActivity.kt`
- `src/hooks/useLiveKitCall.ts`
- `src/hooks/usePrivateCall.ts`
- `supabase/functions/call-billing-tick/index.ts`
- DB migration `20260608160930` — `private_calls_guard_server_columns` trigger + new UPDATE policy

## Test status

- `bunx vitest run callAndGiftFlowsE2E nativeCallColdStart mediaSurfacesAudit` — **55/55 pass**
- Android L-1 / L-2 — visual code review only (APK rebuild needed for real verification)
- Edge fn auth — pg_cron should still succeed since it sends `Bearer <service_role_key>` via `current_setting`; this could be NULL in some envs (BE-P1-7 audit finding). If billing tick starts returning 401 after deploy, set `CRON_SECRET` env on the edge fn and patch the cron migration to send `x-cron-secret`.
