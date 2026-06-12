# Fix: Instant Close, Instant Join, No Party Password

## Issues
1. **Stale rooms** — Live stream / Party room close করার পরেও Discover-এ "running" দেখায়।
2. **Private call** — দুই পক্ষের যে কেউ cut করলে সাথে সাথে UI থেকে vanish হবে।
3. **Slow join** — Party/Live card-এ click করলে দেরিতে room খোলে, Aviator/game frame আসে না।
4. **Password remove** — Party room-এ password / private toggle সম্পূর্ণ বাদ (all public)।

## Research (industry pattern — Bigo, Chamet, Poppo)
- Realtime presence/heartbeat + `ended_at` server-side stamp; client subscribes to row UPDATE → instant disappear.
- Background watchdog edge function auto-closes rooms with stale heartbeat (>60s) to handle crash/force-kill.
- Card tap → optimistic navigation (no await), room hydrate inside room page using cached row + realtime subscribe.
- No password gating for public party rooms (Chamet/Poppo/Olamet pattern); private mode = invite-only links, not passwords.

## Plan

### A. Instant close (live + party)
- `LiveStream.tsx` / `PartyRoom.tsx` host-side end handler: `update({ is_active:false, ended_at: now() })` BEFORE navigation; on `beforeunload` send same update via `navigator.sendBeacon` to edge function `end-room`.
- `Discover.tsx` + `LiveStreamFeed.tsx`: subscribe to `postgres_changes` UPDATE on `live_streams` / `party_rooms`; when `is_active=false` → splice from list immediately. Also filter initial query by `is_active=true AND ended_at IS NULL`.
- Add edge function `cleanup-stale-rooms` (cron 30s) marking rooms inactive if `last_heartbeat < now()-60s`.
- Host page sends heartbeat every 20s via `update({last_heartbeat: now()})`.

### B. Private call instant vanish
- `private_calls` row: on hangup either side sets `status='ended', ended_at=now()`.
- Both clients already subscribed (per memory: dup subscriptions fixed). Ensure single subscribe path triggers immediate teardown: stop LiveKit room, navigate back, clear incoming-call UI. Add guard so any non-`ringing/active` status forces dismiss.
- `IncomingCallActivity` (Android) — already handled per phase3 memory; no APK change needed here unless we touch native.

### C. Instant join
- Discover card `onClick`: `navigate('/party/:id')` synchronously, no awaits, no modal.
- `PartyRoom.tsx` / `LiveStream.tsx`: render skeleton immediately; fetch room row + LiveKit token in parallel via React Query with `placeholderData` from the list cache.
- Pre-warm LiveKit token: kick off token fetch the moment user taps card (mutation fired in card click handler, result picked up by room page via query cache key `livekit-token:roomId`).
- Re-mount game iframe (Aviator) inside room only after LiveKit connected — but show frame placeholder instantly so user sees game shell.

### D. Remove party password
- `CreateParty.tsx`: remove password input + private toggle UI.
- `PartyRoom.tsx`: remove password prompt / gate.
- DB migration: keep column nullable (backwards-compat) but stop reading/writing. Default `is_private=false` for all new rooms; existing rows untouched.
- Discover: remove "lock" icon / password badge rendering.

## Files (estimated)
- `src/pages/Discover.tsx`, `src/pages/LiveStreamFeed.tsx` — realtime subscribe + filter
- `src/pages/LiveStream.tsx`, `src/pages/PartyRoom.tsx` — end handler + heartbeat + instant render
- `src/pages/CreateParty.tsx` — strip password UI
- `src/hooks/usePrivateCall*.ts` — status-driven teardown
- New edge fn: `supabase/functions/cleanup-stale-rooms/index.ts` + cron
- Migration: ensure `ended_at`, `last_heartbeat` columns exist on `live_streams` + `party_rooms`

## Out of scope
- Native Android changes (no APK rebuild needed)
- LiveKit SFU config
- Game logic itself

---

# Fix: Stale Logged-In UI vs Invalid Supabase Session

## Research evidence
- Supabase `refreshSession()` docs: it uses the current refresh token from session storage; if that refresh token is invalid, the call throws/returns an auth error.
- Supabase Auth error docs list API-level auth errors separately from network/client errors; `refresh_token_not_found` means the stored refresh token is no longer accepted by Auth, not that LiveKit/SFU is down.
- Professional call apps must gate paid/private calls on a valid server session, not only cached “logged in” UI, otherwise billing/call RPCs can run with a missing bearer token.

## Current implementation evidence
- Console/Auth logs show `Invalid Refresh Token: Refresh Token Not Found` and `/token` status 400, then `/user` 403 `session_not_found`.
- `App.tsx` kept the old React `session` on non-manual `SIGNED_OUT` when silent refresh failed, so protected pages could still render.
- `ProfileDetail.tsx` and `usePrivateCall.ts` correctly use the live Supabase session/user; when storage was already cleared by Supabase, call initiation showed `Login Required`.

## Fix applied
- Keep the “don’t kick user out on transient network glitch” behavior.
- But when the silent refresh error is definitively an invalid/revoked refresh token, clear stale React auth state, cached user, balance cache, and native mirrored session so UI no longer falsely appears logged in.
- This is a React/WebView auth-state fix only; no LiveKit server or camera/native media code changed.

---

# Audit/Fix: Preview Camera Handoff Gap

## Research evidence
- LiveKit Android `LocalVideoTrack.startCapture()` starts the camera capturer before use; `publishVideoTrack(track, options)` publishes an existing `LocalVideoTrack` to the SFU.
- LiveKit Android docs warn not to create a second camera track while one camera session is already active because mobile devices generally support one active camera session.
- Professional live apps (Chamet/Bigo/Agora-style prejoin) keep preview capture alive and join/publish using that same running capturer to avoid black flash.
- LiveKit Android reference confirms `publishVideoTrack(track: LocalVideoTrack, options...)` publishes the supplied local track, so the prejoin `LocalVideoTrack` can be reused instead of creating a second capturer.
- Agora live quickstart/API examples use the same engine preview→join model (`setupLocalVideo`/preview before `joinChannel`), which maps to LiveKit as `startLocalPreview` → `publishVideoTrack(existingTrack)`.

## Current implementation evidence
- Android `LiveKitPlugin.kt` already has `promotePreviewToSession(args)` and publishes the existing `previewTrack` via `publishVideoTrack(ptrack, videoPublishOptions)`.
- `connectInternal()` already gates promotion when `previewRoom + previewTrack` exist and no real `room` is active.
- The actual gap was JS-side: `nativeLiveKitController.connectAndPublish()` called `NativeLiveKit.stopLocalPreview()` before `NativeLiveKit.connect()`, destroying `previewTrack` before native promotion could run.

## Fix applied
- Removed the JS pre-connect `stopLocalPreview()` call so Live Streaming, Video Party, Game Party, and Private Call can reuse the already-open native Camera2 preview through the existing native promote path.
- Fixed GoLive route handoff: native preview is now preserved when navigating into `/live`, the WebView transparency class is not cleared during that handoff, and `useLiveKitClient` no longer waits on WebView camera release when CameraOwnership already says LiveKit owns the camera.

Approve করলে এক pass-এ implement করব।
