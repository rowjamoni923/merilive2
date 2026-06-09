---
name: Web Design / Android Functionality Split
description: Owner-locked 2026-06-09. Permanent architectural rule — Web layer = design ONLY, Android native = all professional functionality.
type: constraint
---

# Web = Design ONLY / Android = ALL Professional Functionality

**Locked 2026-06-09 by owner explicit confirmation.**

## Rule

| Layer | Responsibility | What we do there |
|---|---|---|
| **Web / React** | **DESIGN ONLY** | Visual layout, CSS styling, text labels, icons, colors, spacing, responsive breakpoints, dark/light theme tokens, static image assets. |
| **Android Native** | **ALL PROFESSIONAL FUNCTIONALITY** | 60fps rendering, instant transitions (<100ms), native SDK bridges, Camera2 direct access, LiveKit Android (`io.livekit:livekit-android`), Play Billing, FCM push, VAP/SVGA/Lottie decoders, SoundPool/GiftAudioMixer, haptic feedback, offline resilience, background services (`FOREGROUND_SERVICE_CAMERA`), hardware-accelerated beauty filters, AEC/NS/AGC, memory management, battery optimization, thermal throttling handling. |

## What "professionalization" means

When a phase audit identifies a gap between our app and Chamet/Bigo/Olamet pro standard, the gap is ALWAYS filled by **Android native code**, NEVER by web layer "optimizations".

### Examples of CORRECT fixes
- Auth transition lag → Android native Activity transition override + pre-warmed WebView
- Gift animation stutter → Native VAP/SVGA decoder thread (Pkg438) + priority queue
- Camera delay in live → Camera2 direct pipeline in LiveKit Android
- Payment flow jank → Native Play Billing bottom sheet + instant local receipt validation
- Offline resilience → Native SQLite cache + WorkManager sync queue
- Call audio echo → Native AEC in LiveKit Android audio pipeline

### Examples of FORBIDDEN fixes
- "Optimize" React render cycle to reduce auth lag → NO, fix in Android transition
- Add web-layer CSS animation for gift → NO, native VAP only
- Use JS `getUserMedia` for camera → NO, Camera2 via LiveKit Android
- Web-based payment UI "polish" → NO, native Play Billing UI
- JS haptic polyfill → NO, native Vibrator service

## Web Preview Disclaimer

Web preview (Lovable preview URL) shows **design/layout only**. It NEVER represents the final Android experience. A smooth web preview does NOT mean the Android app is professional. Final verification is ALWAYS on Android device or native emulator.

## Audit Checklist Addition

For every phase in the 16-phase / 100-phase audit:
- [ ] Research: How do Chamet/Bigo/Olamet implement this on Android native?
- [ ] Gap identified: What is missing in OUR Android native code?
- [ ] Fix: Add/Modify Android native plugin/Activity/Service ONLY
- [ ] Web check: Did any web change sneak in? Revert if yes.
- [ ] Verify: Test on Android device (or honest "APK rebuild needed")

## Why this rule exists

99% of users are on Android. WebView performance is 40-60% CPU vs 15-25% native. Camera2, AEC, haptics, foreground services, and hardware decoders are unavailable or broken in WebView. Every top-50 live app (Bigo, Chamet, Tango, Olamet, MICO, Likee) uses native Android for core functionality. We match them by going native, not by polishing web.

## Override

Only owner can override. If I (AI) ever think "a small web fix is fine here" → I MUST ask owner first. No self-override allowed.
