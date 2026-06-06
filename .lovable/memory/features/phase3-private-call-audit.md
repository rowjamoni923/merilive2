---
name: Phase 3 Private Call audit
description: 2026-06-06 audit + fixes for private call flow (accept cleanup, ring timeout, render-time ref mutation, duplicate realtime, dismissed race)
type: feature
---
Phase 3 audit of 1:1 private call path. Fixed:
- A1/C4 `usePrivateCall.acceptCall` catch used `incomingCall?.callId` (null on native cold-start) — now uses `callId` param; prevents zombie `connected` rows when LiveKit join fails after `accept_private_call` RPC succeeds.
- A2/D2 `IncomingCallActivity` hardcoded 30s timeout — now reads `ring_timeout_seconds` from FCM extras (clamped 10-120s), `MeriFirebaseMessagingService` forwards it.
- A3 `CallProvider` mutated `callEndedRef` inside render IIFE — replaced with plain `!!incomingCall`; the existing useEffect on `incomingCall` already resets the ref.
- B1 Duplicate `private_calls` Realtime subscriptions (`subscribeToTables` + scoped channel) — removed the older `subscribeToTables` one; scoped `private-call-${userId}` channel is sole authoritative path. Stops duplicate billing timers + duplicate toasts.
- B6 `IncomingCallActivity.endReceiver` dispatched `dismissed` even after accept/decline — guarded with `if (!actionDispatched)` so a late JS-side end broadcast can't tear down a freshly accepted call.

Still-open (not fixed, lower priority):
- D3/D4 APNS missing `apns-push-type` + ttl — Android-only app currently.
- D6 Missing FIREBASE_SERVICE_ACCOUNT_JSON silently returns `notifInsertOk:true` — config issue, not code.
- B2 publishCallAccepted 5s ceiling vs caller LiveKit join latency — covered by 5s REST poll fallback.
- B3 native cold-start accept renders fallback avatar until profile fetch — cosmetic.

Android fixes require APK rebuild.
