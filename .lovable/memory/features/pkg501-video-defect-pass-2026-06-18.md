---
name: Pkg501 — 7-defect video audit fix pass (2026-06-18)
description: Honest fix pass from two device videos. Auth toast safe-inset, login disabled state, GoLive/PartyRoom navigate flash, native renderer EGL race, host seat black, caller dialing black, Ken-Burns thumbnails.
type: feature
---

# Pkg501 — Honest 7-defect pass (2026-06-18)

Two device videos analyzed frame-by-frame + staff subagent gap analysis vs Chamet/Bigo. Plan: `.lovable/plan.md`. User approved.

## Done — React only (Lovable verifiable)

1. **Auth toast overlap** — `src/components/ui/sonner.tsx`: added `offset.top = max(env(safe-area-inset-top)+8px, 56px)`. Banner now sits below status bar instead of clipping the logo.
2. **Login button pale pink** — `src/pages/Auth.tsx:2843`: `disabled:opacity-40` → `disabled:opacity-60 disabled:saturate-100 disabled:cursor-not-allowed`. Gradient no longer desaturates to washed-out pink.
4. **White flash on navigate** — `clearNativeMediaSurface()` inserted synchronously before every bare `navigate()` in GoLive (3 sites) and PartyRoom (8 sites incl. import). Body class drops in same tick as navigation, no transparent-window flash.
7. **Live cards static** — added `@keyframes pkg501-ken-burns` in `src/index.css` + `live-card-kenburns` class on Index.tsx live thumbnails. 14s slow zoom/pan, respects `prefers-reduced-motion`.

## Done — Kotlin (APK rebuild REQUIRED, not Lovable-verified)

3. **GoLive preview blurry** — `LiveKitPlugin.kt`: `room.initVideoRenderer(renderer)` moved AFTER `parent.addView(renderer, ...)` in BOTH `ensureRendererAttached` (line ~908) and `ensureSlot` (line ~702). Fixes EGL context race causing scrambled/motion-blurred first frames.
5. **Party host seat black** — `LiveKitPlugin.setCameraEnabled`: after assigning `previewTrack`, now also calls `rebindSeatSlotsForLocalTrack(resolved)`. Any seat slot that mounted before camera publish (very common race in party rooms) attaches immediately when track lands — no SFU-echo round-trip.
6. **Private call caller dialing black** — `PrivateCallViewModel.attachToCurrentRoom`: eagerly calls `r.localParticipant.setCameraEnabled(true)` if camera publication hasn't started. Caller sees own self-preview during DIALING/RINGING phase (WhatsApp/Bigo parity).

## DEFERRED — Live thumbnail snapshot cron

Defect #7 part 2 (server-side rotating snapshots) NOT implemented this pass. Requires:
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` secrets in Supabase
- Edge Function calling LiveKit Egress API (`GetParticipantTrackSnapshot` or composite RoomComposite egress)
- Storage bucket `live-thumbnails` + cron schedule (15s)
- `UPDATE live_streams SET thumbnail_url = ...`

Ken-Burns animation already in place — so the moment thumbnails ARE populated (by any path), they animate professionally. Cron is the missing producer.

## Verification status

- React fixes (1, 2, 4, 7-CSS): Lovable preview ✅
- Kotlin fixes (3, 5, 6): code-correct vs livekit-android v2.26.0 API verified from GitHub source. Behavioral verification requires APK rebuild + device test by user. NO false "verified" claim.

## Not changed

Design completely untouched. Only functionality. All UI strings English. No VPS work.
