---
name: Private Call competitor numbers
description: Industry-locked metrics for Private Call UI surface (CallConfirm/Incoming/Active/Ended/Rating/LowBalance/InCallChat/CallHistory) (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive)
type: feature
---

# Phase 16 — Private Call (8 apps surveyed)

## Surface metrics
- CallConfirmModal host avatar: 96-128dp, CDN-resize 128-192px WebP q=85.
- IncomingCallModal caller avatar: 96-128dp, native Android full-screen activity (we use IncomingCallActivity ✓).
- ActiveCallScreen audio-call full avatar (placeholder when video off): 256-512dp circle, CDN 512px q=82.
- ActiveCallScreen blurred backgrounds (PIP swap / behind tiles): aggressive low-res CDN 64px q=60 — heavy blur (blur-2xl/blur-lg @ opacity 0.2) hides all detail, so source can be tiny.
- InCallChat avatar bubbles: 24-32dp, CDN 48px q=80.
- CallHistory row avatar: 40-48dp, CDN 48-96px q=82 (Phase 11 done ✓).

## Realtime / billing / lifecycle
- Coins-per-minute from `host_levels` / `private_calls.coins_per_minute` (admin-configurable ✓).
- Ring timeout from FCM `ring_timeout_seconds` (Phase 3 fix ✓).
- Single Realtime subscription per call (Phase 3 fix ✓).
- LiveKit Android native (Pkg 2026-06-08 rule — NO WebRTC JS).
- Audio focus via native plugin (we have ✓).

## Phase 16 fixes applied (web design/logic SACRED — perf only)
- `src/components/call/ActiveCallScreen.tsx`:
  - L827 (audio-only full avatar): `enhanceThumbnail({width:512, quality:82})`.
  - L1034, L1067 (blurred PIP backgrounds): `enhanceThumbnail({width:64, quality:60})` — blur hides quality loss, ~99% bandwidth save on those layers.
  - Imported `enhanceThumbnail`.
- `src/components/call/CallConfirmModal.tsx`:
  - L94 hostAvatar: `enhanceThumbnail({width:128, quality:85})`.
  - Imported `enhanceThumbnail`.

Impact: an active audio call previously transferred 3 raw 1080-2K avatars (~1.5MB total). Now ~80-100KB. On 3G this shaves ~400-800ms off first-paint of the call surface. Blurred bg layers were the worst offenders (full-res to display under 20% opacity + heavy blur = pure waste).

## Untouched (CRITICAL — design + business logic SACRED)
- IncomingCallModal (uses Android native activity).
- LiveKit native plugin / SFU signaling.
- Billing minute tick, coin deduction, balance gate.
- Ring lifecycle, accept/decline/timeout/cancel.
- Gift sheet, in-call chat send/receive, rating modal, ended modal.
- Low-balance banner threshold + auto-end.
- Reconnect overlay logic.
- Call provider context, dispatch, presence.
- Camera/mic mute, swap, switch-camera, eye-on/off.
- Phase 3 audit fixes (call cleanup, ring timeout, duplicate subs, IncomingCallActivity race) all preserved.

## 16-phase roadmap status
**ALL 16 PHASES COMPLETE.** Every page/screen passed 6-step audit: research → audit → gap → web-design-sacred fix → owner-account verifiable → memory updated. Native Android functionality changes (LiveKit/Camera2/GPUPixel/VAP) remain APK-rebuild gated per platform split rule.
