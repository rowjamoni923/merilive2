---
name: Camera + LiveKit full rebuild (2026-06-14)
description: Deleted 6252-line LiveKitPlugin + arbiter layers, replaced with 240-line minimal plugin using SDK built-in Camera2Capturer. JS stubs preserve API surface for 30+ callers.
type: feature
---

# Camera + LiveKit Full Rebuild — 2026-06-14

## Why
Previous stack was over-engineered: 6252-line LiveKitPlugin.kt + CameraOwnership + CameraAuthorityManager + CameraResilienceController + rtc/ folder (RtcEngineManager, BoundedSurfaceHost, SurfaceLifecycleManager, AppLifecycleObserver, WebViewPermissionGate) + JS ProCameraEngine + androidCameraHandoff + useNativeLiveKitLifecycle. Multiple arbiters fighting → CAMERA_IN_USE, blank previews, broken UI in private call / party / live.

User decision (after old-GitHub analysis showed pre-rebuild project had 349-line LiveKit plugin and never had these bugs): delete the complexity, rebuild minimal.

## What was deleted (physical rm)
- `android/app/src/main/java/com/merilive/app/plugin/LiveKitPlugin.kt` (6252 → 240 lines, rewritten)
- `android/app/src/main/java/com/merilive/app/plugin/CameraAuthorityManager.kt`
- `android/app/src/main/java/com/merilive/app/activity/CameraResilienceController.kt` (re-added as no-op stub)
- `android/app/src/main/java/com/merilive/app/plugin/CameraOwnership.kt` (re-added as no-op stub for Face Verification compile)
- `android/app/src/main/java/com/merilive/app/rtc/` folder (RtcEngineManager re-added as no-op stub; rest deleted)
- `native-kotlin/util/CameraOwnership.kt`, `native-kotlin/service/LiveKitManager.kt`

## What was stubbed (JS, ~150 lines total)
All preserve original API surface; bodies are no-ops:
- `src/camera/ProCameraEngine.ts` — acquire/release no-op, never throws CameraConflictError
- `src/camera/useProCamera.ts` — always `{ ready: true, error: null }`
- `src/lib/androidCameraHandoff.ts` — claim/release no-ops
- `src/hooks/useNativeLiveKitLifecycle.ts` — no-op
- `src/hooks/useRtcLifecycle.ts` — `{ foreground: true, hasBackgrounded: false }`
- `src/plugins/NativeLiveKit.ts` — Proxy around new Capacitor plugin; legacy method names safely no-op

## New minimal LiveKit plugin
`@CapacitorPlugin(name = "NativeLiveKit")` exposes:
- `isAvailable`, `connect`, `disconnect`
- `setCameraEnabled`, `setMicrophoneEnabled`, `switchCamera`
- `getCameraOwner` (always null), `claimCameraForWebView`/`releaseCameraForWebView` (no-ops, kept for JS compat)
- Events: `participant-connected/disconnected`, `track-subscribed/unsubscribed`, `disconnected`, `reconnecting`, `reconnected`
- Static `notifyUserLeaveHint`/`notifyPipModeChanged` for MainActivity (placeholders)

Uses LiveKit Android SDK 2.26.0 built-in Camera2 capturer (`setCameraEnabled(true)`). NO custom Camera2 handles, NO ownership lock.

## Status
- ✅ Lovable build green (web `livekit-client` fallback runs in preview — `isNativeLiveKitAvailable()` returns false on web)
- ⏳ APK rebuild required for native path to activate
- ⚠️ OEM device QA still pending (Samsung/Xiaomi/Vivo/Oppo Camera2 HAL quirks)

## Honest confidence
85–90% that design/system intact; 10–15% real-device OEM edge cases to surface after APK test.

## Do NOT redo
The complex arbiter layers are GONE for a reason. If a camera bug returns:
1. First check LiveKit SDK release notes / GitHub issues
2. Fix inside `LiveKitPlugin.kt` (small file now, easy to audit)
3. Do NOT reintroduce ownership locks, authority managers, or resilience controllers — they caused the bugs they were meant to fix.
