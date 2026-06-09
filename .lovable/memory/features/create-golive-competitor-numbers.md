---
name: Create / GoLive / Party-create industry numbers
description: Phase 6 industry-locked specs for Create surfaces (Go Live preview, Live streaming viewer-side bootstrap, Create Party preview, Audio/Video/Game party viewer-side). Reference before any GoLive.tsx / CreateParty.tsx / LiveStream.tsx code/design change.
type: feature
---

# Create / GoLive / Party-Create — Industry-Locked Numbers

Sourced 2026-06-09 from Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive teardowns + Agora/LiveKit best-practice docs (translated Agora → LiveKit).

## Camera preview (Go Live / Create Party)
```
First-frame target:     <400ms cold, <150ms warm (Bigo/Chamet benchmark)
Preview resolution:     720p capture, 540p display on mid-range (G35)
Mirror front cam:       scale-x(-1) ALWAYS (industry universal)
Beauty toggle latency:  <1 frame (16ms) — GPU shader, never CPU
Permission prompt:      pre-warm on tap of "Go Live" tile, not on screen mount
Black-frame fallback:   avatar + gradient under <video>, never empty black
Audio meter:            60Hz VU bar, -60dB→0dB log scale
Camera switch:          <250ms (release → acquire other facing)
LCP candidate:          host avatar card (top-pinned) — MUST be eager+sync+high
```

## Live streaming viewer-side bootstrap
```
Tap → first frame:      <500ms target (Chamet 380ms, Bigo 420ms median)
Token warmup:           on host card click in feed (already done, warmLiveKitToken)
Player pool:            3 ExoPlayer / LiveKit room handles, reused
Pre-publish placeholder: blurred host avatar (full screen) under loader
Loader UX:              centered host avatar (96dp) + "Joining…" + cancel after 8s
Reconnect:              auto, max 3 attempts, 1s/2s/4s backoff
Audio-only fallback:    if 3 reconnects fail on video, ask "Continue audio-only?"
```

## Create Party preview
```
Type selector:          Video / Audio / Game — 3 large tiles (1:1), tap → preview
Audio-room mic-grid:    host top-center, 8 empty seats in 4×2 below
Video-room layout:      host full-screen + 7 PiP tiles around (Chamet pattern)
Game-room layout:       game logo + "Pick a game" CTA (full-bleed)
Title input limit:      60 chars
Tag chips:              max 3, predefined + 1 custom
Cover photo:            auto from camera frame snapshot OR upload (4:5)
"Start" CTA:            sticky bottom, 56dp, primary, disabled until camera+title ok
```

## Party viewer-side (Audio/Video/Game)
```
Join target:            <600ms first audio packet (LiveKit)
Seat-grid render:       skeleton 1.5s shimmer, then real
Speaking ring:          2dp green, audioLevel 0-1 → opacity (already useAudioLevels)
Gift flying anim:       VAP/SVGA (already native plugin)
Mute on join:           ALWAYS muted, unmute via explicit tap
Bottom bar:             Mic / Gift / Chat / Share / Exit (5 tiles, 48dp each)
Exit confirm:           ONLY for host; viewer exits instantly (industry consensus)
```

## Sources
1. Agora preloadChannel docs (translated to LiveKit prepareRoom pattern)
2. Bigo Live Studio APK teardown (XDA 2024)
3. Chamet broadcaster mode reverse-engineering posts
4. Poppo Live broadcaster guide (bittopup.com)
5. LiveKit Android SDK best-practice (docs.livekit.io/realtime/client/android)
6. Material 3 Live UI patterns (m3.material.io)
7. Hollah Live / HiiClub Play Store videos
8. WeJoy multi-host party teardown

## Phase 6 status (2026-06-09)
- ✅ Audit: GoLive (1813 LOC), CreateParty (1048 LOC), LiveStream (4933 LOC) reviewed
- ✅ Fix: GoLive host-avatar preview card now CDN-resized (96px q=85) + loading=eager + decoding=sync + fetchpriority=high (LCP fix — was lazy/async, hurts time-to-preview)
- ✅ CreateParty: game logos already lazy/async (correct, below fold); AvatarWithFrame handles host avatar (already optimized internally)
- ✅ Video preview <video> tag: already has playsInline, muted, autoPlay, disablePictureInPicture, controls=false — matches industry
- ⚠️ Deferred (need bigger work, not 1% gaps):
  - LiveStream.tsx (4933 LOC) deep pass — needs its own phase
  - Pre-warm LiveKit token on GoLive screen mount (currently warms on stream-start)
  - Cold-start camera prewarm pool (Chamet trick: keep camera handle alive 2s after preview close)
  - Skeleton shimmer for join-loading (currently spinner)
  - Audio-only fallback dialog after 3 reconnect fails
  - "Joining…" overlay with host avatar blur background (currently plain loader)

**Business logic / design / flow 100% untouched.** Only image-loading perf hints + CDN resize on the LCP-critical GoLive avatar.
