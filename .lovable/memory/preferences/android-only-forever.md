---
name: Android-only forever
description: 99% users Android. No web-first thinking. All SDKs (RTC/billing/animation/payment) must be Android-native. Web is NOT a target platform.
type: constraint
---

# Android-Only Forever (Hard Rule)

**Locked 2026-06-07 by user explicit instruction.**

## Rule
99% of users are on Android. This is an **Android app**, not a web app. Every architecture/SDK/feature decision must be Android-first, Android-native, Android-final. **Web is NOT a delivery target** — only used as preview/test harness during development.

## What this means for every task
- **RTC:** LiveKit **Android Native SDK** (`io.livekit:livekit-android`), NOT livekit-client JS in WebView
- **Animations:** Native VAP / SVGA / Lottie via NativeGiftAnimationPlugin (Pkg438), NOT web players for production
- **Camera/Mic/Permissions:** Native Camera2 + LiveKit native engine, NOT `getUserMedia`
- **Foreground services:** Native `FOREGROUND_SERVICE_CAMERA` + `FOREGROUND_SERVICE_MICROPHONE`
- **Push:** FCM native, NOT web push
- **Payment:** Native Google Play Billing + native bKash/Nagad SDKs, NOT web checkout
- **Storage cache:** Android disk cache (OkHttp/Glide), NOT browser cache
- **Lifecycle:** `ProcessLifecycleOwner` + `Activity.onResume/onPause`, NOT `visibilitychange`
- **Auth:** Native Android Account + secure storage (EncryptedSharedPreferences), NOT only localStorage

## Allowed web usage (preview/dev only)
- Lovable preview for UI iteration
- Owner test via mem://preferences/test-account.md in preview
- React/TypeScript codebase remains (it's the UI shell inside Capacitor WebView)

## Forbidden phrases / patterns in code & chat
- "web-first", "web fallback as priority", "since web works that's enough"
- "let's do it in JS for now and migrate later" — NO. Build native from start.
- Proposing web-only solutions for live/call/party/animation/billing critical paths

## Verification
Before claiming any RTC/call/animation/billing fix is done:
- Must work on a real Android APK build OR via emulated/simulated native path
- Web preview confirmation alone is NOT enough for these critical paths
