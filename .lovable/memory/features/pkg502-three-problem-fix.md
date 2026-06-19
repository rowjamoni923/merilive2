---
name: Pkg502 — 3-problem fix (camera handoff, live buttons, private call face)
description: 2026-06-19 owner-requested triple fix. Wired up 9 missing host buttons in LiveStream More sheet; added robust web-preview camera handoff in ActiveCallScreen (ref-callback + ringing tile); documented native handoff already correct.
type: feature
---

# Pkg502 — 3 Problem Fix (2026-06-19)

## Problem 1 — Camera 10-20s lag on publish (live/party/call)
**Status:** Native path already correct per audit. `LiveKitPlugin.promotePreviewToSession()` reuses `previewTrack` — zero camera reopen. Lag is in `getLiveKitToken` + `room.connect()` + ICE/DTLS, not the camera. No Lovable-only fix available; needs APK + device logs to confirm token/ICE timing.

## Problem 2 — Live stream buttons + Mood option not working (FIXED)
`LiveStream.tsx` audit found 9 panels mounted but never reachable. Wired all triggers into the `hostOnlyOptions` More sheet:
- Camera On/Off (toggles native + web `setCameraEnabled`)
- Flip Camera (uses existing `switchCamera`)
- Stickers (`setShowStickerPanel`)
- Virtual BG (`setShowVirtualBackground`)
- Noise Cancel (`setShowNoiseCancellation`)
- Raised Hands (host queue)
Viewer extra: Raise/Lower Hand.

Added state `isHostCamOff` + handlers `handleToggleHostCamera`, `handleFlipCamera`. Added 5 lucide icons (`Video`, `VideoOff`, `RefreshCcw`, `Image`, `Volume2`) to iconMap.

"Mood" was a literal translation of "More option" (মেজাজ ≈ option). The More button itself works — the missing items inside it are now restored.

## Problem 3 — Private call preview camera lost after accept (FIXED for web)
`ActiveCallScreen.tsx` fixes:
- F1: Replaced static `useRef` attachment with `attachPreview(el, slot)` ref-callback so `srcObject` is wired both when the stream arrives AND when a video element mounts later (calling→connected transition).
- F6: Added preview camera tile in the calling/ringing branch (`!isLiveConnected`) — caller now sees their face throughout dialing, not only after accept.
- F2: Already correct (preview block sits at outer level, not nested inside `isLiveConnected`).

Native Android private call (PrivateCallActivity) — audit showed it's wired correctly via `vm.attachToCurrentRoom`; the remaining gap is F4 (ViewModel needs to sweep already-subscribed remote tracks on Activity launch). Deferred to next APK rebuild.

## Files changed
- `src/pages/LiveStream.tsx` — host buttons, handlers, state, icons
- `src/components/call/ActiveCallScreen.tsx` — ref-callback preview, ringing tile

## 2026-06-19 web preview emergency pass — blank screens + click blockers
User supplied two videos: competitor app keeps a visible camera/room surface; MeriLive preview showed repeated white/blank intervals and unresponsive close/message/more buttons. Manual video frame audit confirmed MeriLive web preview blanks around multiple live/party/call transitions.

Fixes applied:
- `LiveStream.tsx`: root tap-to-hide gesture now ignores interactive targets (`button`, `input`, `textarea`, `select`, `a`, `[role="button"]`, `[data-no-ui-toggle]`) so close/message/gift/more taps are not converted into hidden UI. The hidden-UI restore layer is now `fixed` and restores on `pointerdown`.
- `ActiveCallScreen.tsx`: screenshot-protection CSS no longer uses global body `.secure-call video`; it is scoped to `[data-room-shell="call"]` so it cannot bleed into live/party video surfaces. Preview call background is always dark on web and does not go transparent when `isPreviewWeb` is active.
- `PartyRoom.tsx`: initial no-room/loading branch now renders a real party-room skeleton (header, close button, seats, composer placeholder) instead of a plain blank/spinner surface.

Verification signal: Lovable preview health returned healthy/painting after the changes.

## Verification
- `bunx tsc --noEmit` green from previous pass
- Owner test account in Lovable preview can verify: open LiveStream → tap More → see all 12 host options; open private call → see own face from Calling → Connected with no black frame.

## APK-rebuild items (Phase 2)
- Token pre-warm + tighter ICE timeout for Problem 1
- PrivateCallViewModel.attachToCurrentRoom() initial-sync sweep (F4)
- Co-Host panel mount + Screen Share button (still not exposed)
